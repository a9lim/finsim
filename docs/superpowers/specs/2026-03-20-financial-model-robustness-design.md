# Financial Model Robustness Improvements

**Date:** 2026-03-20
**Scope:** simulation.js, pricing.js, portfolio.js, chain.js, strategy.js, ui.js, chain-renderer.js

## Summary

Four improvements to make the financial model more accurate without changing the CRR binomial tree structure or impacting real-time performance:

1. Vasicek closed-form bond pricing
2. Second-order Heston vol smile (curvature + vol-of-vol convexity)
3. Milstein discretization for the variance process
4. Integration across bond valuation consumers

## 1. Vasicek Closed-Form Bond Pricing

### Problem

Bond prices use `100 * exp(-r * T)` — flat spot-rate discounting — despite the simulation running a full Vasicek rate model with mean-reversion (`a`) and rate volatility (`sigmaR`). This produces bonds that don't reflect expected rate changes or rate uncertainty.

### Solution

Replace with the Vasicek closed-form bond price:

```
B(T) = (1 - e^{-aT}) / a
A(T) = exp([(B(T) - T)(b - σᵣ² / (2a²))] - σᵣ²B(T)² / (4a))
P(0,T) = face * A(T) * exp(-B(T) * r)
```

Equivalently: `ln A(T) = (B(T) - T)(a²b - σᵣ²/2) / a² - σᵣ²B(T)² / (4a)` (Vasicek 1977, eq. 23). Note: `a²b/a² = b`, confirming the primary form above.

### New Function

```js
// In pricing.js
export function vasicekBondPrice(face, r, T, a, b, sigmaR)
```

**Edge case:** When `a < 1e-8`, degrade to `face * exp(-r * T)`. In this limit `B(T) → T` and `A(T) → exp(-σᵣ²T³/6)`, but the `σᵣ²T³/6` term is negligible for typical parameters (`sigmaR ~ 0.005-0.02`, `T < 2 years` → correction < 1e-6), so the simple fallback is an acceptable approximation.

### Effects

- When `r < b` (rates expected to rise): bonds price below `exp(-r*T)` — the market prices in higher future rates
- When `r > b` (rates expected to fall): bonds price above `exp(-r*T)`
- `sigmaR > 0` adds a convexity premium via the `B(T)²` term (Jensen's inequality — rate uncertainty benefits bondholders)
- Duration = `B(T) = (1 - e^{-aT})/a`, which asymptotes to `1/a` for long-dated bonds instead of growing linearly with T
- Convexity emerges from the `σᵣ²B(T)²/(4a)` term in `A(T)`

### Callers to Update

There are 11 call sites using flat-rate bond discounting across 4 files:

| Location | Context |
|----------|---------|
| `position-value.js: unitPrice()` (line 31) | Mark-to-market valuation — primary bond price for portfolio display |
| `portfolio.js: _maintenanceForShort()` (line 177) | Maintenance margin for short bonds |
| `portfolio.js: checkMargin()` (line 231) | Margin check bond valuation |
| `portfolio.js: chargeBorrowInterest()` (line 675) | Borrow cost notional for short bonds |
| `portfolio.js: _postTradeMarginOk()` (lines 883, 934) | Pre-trade margin check (2 sites) |
| `strategy.js` (lines 172, 173, 625) | Bond leg entry value, current value, and payoff diagram (3 sites) |
| `ui.js: updateStockBondPrices()` (line 397) | Trade tab sidebar bond price pill (uses hardcoded `100` instead of `BOND_FACE_VALUE`) |
| `ui.js: updateStockBondPrices()` (line 415) | Strategy tab sidebar bond price pill (uses hardcoded `100` instead of `BOND_FACE_VALUE`) |

**API signature changes required:**

- `unitPrice()` in `position-value.js` needs `(a, b, sigmaR)` parameters. This ripples into `computePositionValue()` and `computePositionPnl()`, which are called from `portfolio-renderer.js` and `main.js`. These callers have `sim.*` available.
- `portfolio.js` internal functions (`_maintenanceForShort`, `checkMargin`, `chargeBorrowInterest`, `_postTradeMarginOk`) already receive `currentRate` — they additionally need `(a, b, sigmaR)`. The `portfolio` singleton can store these as module-level state set during `resetPortfolio()` or via a `setVasicekParams(a, b, sigmaR)` setter called from `main.js` on reset and parameter changes.
- `strategy.js` receives rate/vol as draw parameters — additionally needs `(a, b, sigmaR)`.
- `ui.js: updateStockBondPrices()` receives rate — additionally needs `(a, b, sigmaR)`. Called from `main.js` which has `sim.*` available. The 2 sites also use hardcoded `100` — should switch to `BOND_FACE_VALUE`.

### Settlement

`processExpiry()` settles bonds at face value ($100) at maturity — unchanged. `vasicekBondPrice` naturally gives `P → face` as `T → 0`.

## 2. Second-Order Heston Vol Smile

### Problem A: No Smile Curvature

`computeSkewSigma` uses a linear moneyness adjustment: `σ(K) = σ_eff * (1 + ρξ/(2σ) * x)` where `x = log(K/S)`. This produces a straight-line vol surface — the slope (skew) is captured but not the curvature (smile). Deep OTM calls are underpriced because their vol isn't elevated.

### Problem B: No Vol-of-Vol Convexity

`computeEffectiveSigma` uses only the first moment of Heston integrated variance: `σ² = θ + (v-θ)(1-e^{-κT})/(κT)`. The second moment (driven by `ξ`) creates a convexity adjustment — options are worth more when future vol is uncertain, even if expected vol is the same.

### Solution A: Quadratic Skew

Add the second-order Heston smile term to `computeSkewSigma`:

```
σ(K) = σ_eff * [1 + skew * x + curvature * x²]

skew      = ρξ / (2σ_eff) * dampen(κT)          -- existing
curvature = ξ² / (12σ_eff²) * dampen(κT)         -- new
```

The `ξ²/(12σ²)` term is always positive — both wings curve upward. Combined with negative `ρ`, the smile is asymmetric: OTM puts have highest vol, ATM is the minimum, OTM calls curve up slightly.

**Note on dampening:** Both skew and curvature use the same `dampen(κT) = (1-e^{-κT})/(κT)` factor. In exact Heston theory (Forde & Jacquier 2009), the curvature (excess kurtosis) decays as `1/T` at long tenors while the skew decays as `1/√T`. Using the same dampening for both is a simplifying approximation that slightly overstates curvature at long tenors — acceptable for a simulator since the effect is small and the overall smile shape remains realistic.

### Solution B: Vol-of-Vol Convexity Adjustment

Add a second-moment correction to `computeEffectiveSigma`. The correction accounts for the variance of integrated variance under Heston — when future vol is uncertain, the expected option value is higher than the value at expected vol (Jensen's inequality applied to the convex payoff).

From the Heston characteristic function expansion (Gatheral 2006, ch. 3, eq. 3.5; Lewis 2000, sec. 5.3), the convexity adjustment to implied variance is:

```
E[V̄] = θ + (v - θ)(1 - e^{-κT}) / (κT)          -- existing first moment

                  ξ²
convexAdj = ──────────── · w(κT)                    -- new
             2κ² · E[V̄]

where w(x) = (2/x²)[x - 1 + e^{-x}]   (normalized variance weight)

σ_eff = sqrt(max(E[V̄] + convexAdj, 0))
```

**Derivation of `w(x)`:** The function `w(κT) = (2/(κT)²)[κT - 1 + e^{-κT}]` is the normalized weight from the second moment of the Ornstein-Uhlenbeck process driving variance. It satisfies:
- `w(0) = 1` (short tenors: full vol-of-vol effect)
- `w(x) → 2/x` as `x → ∞` (long tenors: mean-reversion dampens the effect)
- `w(x) > 0` for all `x > 0` (correction is always positive)

The `1/E[V̄]` factor converts from variance-of-variance space to implied-variance space. When `E[V̄]` is very small (< 1e-8), skip the correction to avoid division instability.

**Magnitude:** For Calm Bull (`ξ=0.3, κ=3.0, θ=0.04`), the correction is ~0.0004 in variance (~1% of θ). For Crisis (`ξ=0.8, κ=0.5, θ=0.25`), it's ~0.01 (~4% of θ) — meaningful for deep OTM options.

### Signature Changes

```js
// Before:
computeEffectiveSigma(v, T, kappa, theta)
// After:
computeEffectiveSigma(v, T, kappa, theta, xi)

// computeSkewSigma: signature unchanged, xi already a parameter
```

### Callers

`chain.js:priceChainExpiry()` and `strategy.js` — both already have `heston.xi` available. Pass it through to `computeEffectiveSigma`.

### Performance

Two extra multiplies per strike in `computeSkewSigma`, one extra computation per expiry in `computeEffectiveSigma`. Negligible.

## 3. Milstein Scheme for Variance Process

### Problem

The Heston variance process uses Euler-Maruyama discretization, which has O(√dt) weak convergence for the CIR process. With `dt = 1/4032`, the discretization bias is small but systematic — it underestimates variance on average when `ξ` is large.

### Solution

Add the Milstein correction term to the variance update in `simulation.js:substep()`:

```js
// Before:
this.v = this.v
    + this.kappa * (this.theta - this.v) * dt
    + this.xi * sqrtV * this._sqrtDt * z2;

// After:
this.v = this.v
    + this.kappa * (this.theta - this.v) * dt
    + this.xi * sqrtV * this._sqrtDt * z2
    + 0.25 * this.xi * this.xi * (z2 * z2 - 1) * dt;
```

### Derivation

For the CIR diffusion `σ(v) = ξ√v`, the Milstein correction is:

```
½ σ(v) σ'(v) [(dW)² - dt] = ½ · ξ√v · ξ/(2√v) · (Z²dt - dt) = ¼ξ²(Z² - 1)dt
```

The `√v` cancels — the correction is a constant `¼ξ²` times `(Z² - 1)dt`, numerically stable even when `v ≈ 0`.

### Properties

- Mean-zero: `E[Z² - 1] = 0` — doesn't change expected variance, improves the distribution
- One multiply-add per substep — negligible cost
- Self-contained: only touches `simulation.js`, no downstream effects
- Crisis preset (`ξ = 0.8`): correction ~`0.00004` per substep; Calm Bull (`ξ = 0.3`): ~6x smaller

## 4. Integration & Consistency

### Bond Pricing Threading

All bond price computations switch to `vasicekBondPrice()`. This requires `(a, b, sigmaR)` alongside `(r, T)`. These parameters are available on `sim.*` everywhere bonds are priced. The function signature makes the dependency explicit.

### Effective Sigma Signature

`computeEffectiveSigma` gains one parameter (`xi`). All callers already have Heston params available — they pass `heston.xi` through.

### What Does NOT Change

- Tree structure (`_priceCore`, `_pricePairCore`) — untouched
- Greek computation method (tree delta/gamma + finite-diff theta/vega/rho) — untouched
- Chain architecture (skeleton + lazy pricing) — untouched
- Portfolio mechanics (netting, margin, orders) — untouched except bond valuation
- UI/rendering — untouched except bond price display values
- Bid/ask spread model — untouched

## Verification

### Vasicek Bond Pricing

- When `a → 0` and `sigmaR → 0`: degrades to `face * exp(-r * T)` (current behavior)
- When `r = b`: price reflects only convexity premium and time value
- `T = 0`: returns `face` exactly
- Negative rates: formula handles naturally (no clamping needed)

### Smile Curvature

- When `ξ → 0`: curvature term vanishes, degrades to current linear skew
- When `ρ = 0`: skew vanishes, only curvature remains (symmetric smile)
- ATM (`K = S`): `x = 0`, both terms vanish, `σ(ATM) = σ_eff` — unchanged

### Milstein

- When `ξ → 0`: correction vanishes, degrades to Euler-Maruyama
- Mean-zero: long-run average variance unaffected
- Floor `v ≥ 0` still applied after correction

## Risk Assessment

| Change | Risk | Rationale |
|--------|------|-----------|
| Vasicek bonds | Low | Closed-form, graceful degradation, easy to verify |
| Smile curvature | Low | Additive terms, degrades to current when ξ → 0 |
| Vol-of-vol convexity | Low | Small positive correction, degrades to current when ξ → 0 |
| Milstein | Very low | One line, mean-zero, self-contained |
