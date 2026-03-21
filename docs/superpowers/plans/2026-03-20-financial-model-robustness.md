# Financial Model Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the financial model more accurate via Vasicek bond pricing, second-order Heston smile, vol-of-vol convexity, and Milstein variance discretization.

**Architecture:** Four independent improvements to the math layer — no UI structure changes, no tree algorithm changes. Vasicek bonds touch the most files (11 call sites across 4 files). Smile/convexity changes are localized to `pricing.js` with minor caller updates. Milstein is a single line in `simulation.js`.

**Tech Stack:** Vanilla JS (ES6 modules), no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-20-financial-model-robustness-design.md`

---

### Task 1: Milstein Correction for Variance Process

**Files:**
- Modify: `src/simulation.js:113-116`

This is the simplest change — one line, self-contained, no downstream effects.

- [ ] **Step 1: Add Milstein correction term**

In `src/simulation.js`, the variance update at lines 113-116 currently reads:

```js
this.v = this.v
    + this.kappa * (this.theta - this.v) * dt
    + this.xi * sqrtV * this._sqrtDt * z2;
```

Add the Milstein correction `+ ¼ξ²(Z² - 1)dt`:

```js
this.v = this.v
    + this.kappa * (this.theta - this.v) * dt
    + this.xi * sqrtV * this._sqrtDt * z2
    + 0.25 * this.xi * this.xi * (z2 * z2 - 1) * dt;
```

The `√v` terms cancel in the CIR Milstein derivation, so this correction is a constant `¼ξ²` times `(Z²-1)dt` — numerically stable even when `v ≈ 0`. Mean-zero (`E[Z²-1] = 0`), so it doesn't change expected variance, only improves the distribution of variance paths.

- [ ] **Step 2: Verify the sim runs without errors**

Run: serve the app and open in browser, click play, verify the simulation runs through several days without console errors. The behavior should be visually indistinguishable from before (the correction is tiny per step).

- [ ] **Step 3: Commit**

```bash
git add src/simulation.js
git commit -m "feat: Milstein scheme for Heston variance discretization"
```

---

### Task 2: Vasicek Closed-Form Bond Pricing Function

**Files:**
- Modify: `src/pricing.js` (add `vasicekBondPrice` export at the bottom, near other exports)

- [ ] **Step 1: Add `vasicekBondPrice` function**

Add to the end of `src/pricing.js` (before the final `export { priceAmerican }` line):

```js
// ---------------------------------------------------------------------------
// Vasicek bond pricing
// ---------------------------------------------------------------------------

/**
 * Vasicek closed-form zero-coupon bond price.
 *
 * P(0,T) = face · A(T) · exp(-B(T) · r)
 *
 * where B(T) = (1 - e^{-aT}) / a
 *       ln A(T) = (B(T) - T)(b - σᵣ²/(2a²)) - σᵣ²B(T)²/(4a)
 *
 * Accounts for rate mean-reversion (duration caps at 1/a) and rate
 * volatility (convexity premium via Jensen's inequality).
 *
 * @param {number} face   - Face value (typically 100)
 * @param {number} r      - Current short rate
 * @param {number} T      - Time to maturity in years
 * @param {number} a      - Mean-reversion speed of rate
 * @param {number} b      - Long-run rate level
 * @param {number} sigmaR - Rate volatility
 * @returns {number} Bond price
 */
export function vasicekBondPrice(face, r, T, a, b, sigmaR) {
    if (T <= 0) return face;
    // Degrade to flat-rate discounting when a ≈ 0
    if (a < 1e-8) return face * Math.exp(-r * T);

    sigmaR = sigmaR || 0; // guard against undefined (callers may omit)
    const B = (1 - Math.exp(-a * T)) / a;
    const sig2 = sigmaR * sigmaR;
    const lnA = (B - T) * (b - sig2 / (2 * a * a)) - sig2 * B * B / (4 * a);
    return face * Math.exp(lnA - B * r);
}
```

- [ ] **Step 2: Add to exports**

The function uses `export` keyword directly, so it's already exported. Verify `vasicekBondPrice` appears in the module exports.

- [ ] **Step 3: Commit**

```bash
git add src/pricing.js
git commit -m "feat: Vasicek closed-form bond pricing function"
```

---

### Task 3: Thread Vasicek Bond Pricing Through `portfolio.js`

**Files:**
- Modify: `src/portfolio.js` (6 call sites + import + module-level Vasicek params)

The portfolio module currently uses `BOND_FACE_VALUE * Math.exp(-rate * T)` in 6 places. Rather than adding `(a, b, sigmaR)` parameters to every function signature, store them as module-level state via a setter — the portfolio singleton already works this way.

- [ ] **Step 1: Add import and module-level Vasicek state**

In `src/portfolio.js`, add `vasicekBondPrice` to the pricing import (line 20):

```js
import { priceAmerican, computeGreeks, vasicekBondPrice } from './pricing.js';
```

Add module-level Vasicek state after the `_nextOrderId` declaration (after line 46):

```js
// Vasicek rate model params — set via setVasicekParams(), used for bond pricing.
let _vasA = 0, _vasB = 0, _vasSigR = 0;

/** Update Vasicek params for bond pricing. Call on reset and parameter changes. */
export function setVasicekParams(a, b, sigmaR) {
    _vasA = a; _vasB = b; _vasSigR = sigmaR;
}
```

- [ ] **Step 2: Replace bond pricing in `_maintenanceForShort` (line 177)**

Replace:
```js
return MAINTENANCE_MARGIN * BOND_FACE_VALUE * Math.exp(-currentRate * dte) * absQty;
```
With:
```js
return MAINTENANCE_MARGIN * vasicekBondPrice(BOND_FACE_VALUE, currentRate, dte, _vasA, _vasB, _vasSigR) * absQty;
```

- [ ] **Step 3: Replace bond pricing in `_postTradeMarginOk` (line 231)**

Replace:
```js
const bp = BOND_FACE_VALUE * Math.exp(-currentRate * dte);
```
With:
```js
const bp = vasicekBondPrice(BOND_FACE_VALUE, currentRate, dte, _vasA, _vasB, _vasSigR);
```

- [ ] **Step 4: Replace bond pricing in `chargeBorrowInterest` (line 675)**

Replace:
```js
const bondPrice = BOND_FACE_VALUE * Math.exp(-currentRate * T);
```
With:
```js
const bondPrice = vasicekBondPrice(BOND_FACE_VALUE, currentRate, T, _vasA, _vasB, _vasSigR);
```

- [ ] **Step 5: Replace bond pricing in `checkMargin` (line 934)**

Replace:
```js
const bondPrice = BOND_FACE_VALUE * Math.exp(-currentRate * dte);
```
With:
```js
const bondPrice = vasicekBondPrice(BOND_FACE_VALUE, currentRate, dte, _vasA, _vasB, _vasSigR);
```

- [ ] **Step 6: Replace bond pricing in `marginRequirement` (line 883)**

Replace:
```js
const bondPrice = BOND_FACE_VALUE * Math.exp(-currentRate * dte);
```
With:
```js
const bondPrice = vasicekBondPrice(BOND_FACE_VALUE, currentRate, dte, _vasA, _vasB, _vasSigR);
```

- [ ] **Step 7: Pass Vasicek params to internal `computePositionValue` calls**

`portfolio.js` calls `computePositionValue` internally in `_postTradeMarginOk` (line 219), `portfolioValue` (line 849), and `checkMargin` (line 922). After Task 4 adds the `vasicek` parameter to `computePositionValue`, these internal calls must also pass Vasicek params so bond positions are valued consistently.

Build a module-level helper that constructs the vasicek object from `_vasA/_vasB/_vasSigR`:

```js
function _vasicekObj() {
    return _vasA > 0 ? { a: _vasA, b: _vasB, sigmaR: _vasSigR } : null;
}
```

Then update the 3 internal `computePositionValue` calls to pass `_vasicekObj()` as the last argument:

```js
// In _postTradeMarginOk (line 219):
equity += computePositionValue(pos, currentPrice, currentVol, currentRate, currentDay, q, _vasicekObj());

// In portfolioValue (line 849):
total += computePositionValue(pos, currentPrice, currentVol, currentRate, currentDay, q, _vasicekObj());

// In checkMargin (line 922):
equity += computePositionValue(pos, currentPrice, currentVol, currentRate, currentDay, q, _vasicekObj());
```

- [ ] **Step 8: Commit**

```bash
git add src/portfolio.js
git commit -m "feat: use Vasicek bond pricing in portfolio margin/borrow calculations"
```

---

### Task 4: Thread Vasicek Bond Pricing Through `position-value.js`

**Files:**
- Modify: `src/position-value.js` (1 call site + signature changes)

The `unitPrice()` function is the primary mark-to-market bond valuation. It needs Vasicek params to compute bond prices correctly. Add optional params to avoid breaking existing callers during transition.

- [ ] **Step 1: Add import and update `unitPrice` signature**

In `src/position-value.js`, add `vasicekBondPrice` to the import (line 9):

```js
import { priceAmerican, vasicekBondPrice } from './pricing.js';
```

Update `unitPrice` to accept an optional `vasicek` parameter (add after `q`):

```js
export function unitPrice(type, S, vol, rate, day, strike, expiryDay, q, vasicek) {
```

Replace the bond case (line 31):
```js
case 'bond':  return BOND_FACE_VALUE * Math.exp(-rate * dte);
```
With:
```js
case 'bond':
    return vasicek
        ? vasicekBondPrice(BOND_FACE_VALUE, rate, dte, vasicek.a, vasicek.b, vasicek.sigmaR)
        : BOND_FACE_VALUE * Math.exp(-rate * dte);
```

- [ ] **Step 2: Thread `vasicek` through `computePositionValue` and `computePositionPnl`**

Update both function signatures to accept and pass through `vasicek`:

```js
export function computePositionValue(pos, S, vol, rate, day, q, vasicek) {
    return pos.qty * unitPrice(pos.type, S, vol, rate, day, pos.strike, pos.expiryDay, q, vasicek);
}

export function computePositionPnl(pos, S, vol, rate, day, q, vasicek) {
    const currentValue = computePositionValue(pos, S, vol, rate, day, q, vasicek);
    // ... rest unchanged
}
```

- [ ] **Step 3: Commit**

```bash
git add src/position-value.js
git commit -m "feat: Vasicek bond pricing in position-value mark-to-market"
```

---

### Task 5: Thread Vasicek Bond Pricing Through `strategy.js`

**Files:**
- Modify: `src/strategy.js` (3 call sites: lines 172, 173, 625)

The strategy renderer receives Heston/Vasicek params for option pricing but uses flat-rate for bonds. Add `vasicekBondPrice` import and update the 3 bond pricing sites. The `vasicek` object from `_vasicekParams()` will include `sigmaR` after Task 7 — meanwhile, `vasicekBondPrice` guards `sigmaR = sigmaR || 0` (from Task 2), so passing `undefined` is safe.

- [ ] **Step 1: Add import**

In `src/strategy.js`, add `vasicekBondPrice` to the pricing import (line 11):

```js
import { priceAmerican, prepareTree, priceWithTree, prepareGreekTrees, computeGreeksWithTrees, computeEffectiveSigma, computeSkewSigma, vasicekBondPrice } from './pricing.js';
```

- [ ] **Step 2: Replace bond pricing in `_precomputeLegs` (lines 172-173)**

The `_precomputeLegs` function already receives `vasicek` as a parameter (line 125 — it's passed for option pricing). Replace:

```js
case 'bond':
    info.entryVal = BOND_FACE_VALUE * Math.exp(-rate * entryT);
    info.bondCurVal = BOND_FACE_VALUE * Math.exp(-rate * T);
    break;
```
With:
```js
case 'bond':
    info.entryVal = vasicek
        ? vasicekBondPrice(BOND_FACE_VALUE, rate, entryT, vasicek.a, vasicek.b, vasicek.sigmaR)
        : BOND_FACE_VALUE * Math.exp(-rate * entryT);
    info.bondCurVal = vasicek
        ? vasicekBondPrice(BOND_FACE_VALUE, rate, T, vasicek.a, vasicek.b, vasicek.sigmaR)
        : BOND_FACE_VALUE * Math.exp(-rate * T);
    break;
```

- [ ] **Step 3: Replace bond pricing in `_legEntryCost` (line 624-626)**

The `_legEntryCost` method (on `StrategyRenderer`, line 602) already receives `vasicek` as a parameter. Replace:

```js
case 'bond': {
    const bVal = BOND_FACE_VALUE * Math.exp(-rate * T);
    return bVal * qty * sign;
}
```
With:
```js
case 'bond': {
    const bVal = vasicek
        ? vasicekBondPrice(BOND_FACE_VALUE, rate, T, vasicek.a, vasicek.b, vasicek.sigmaR)
        : BOND_FACE_VALUE * Math.exp(-rate * T);
    return bVal * qty * sign;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/strategy.js
git commit -m "feat: Vasicek bond pricing in strategy payoff diagrams"
```

---

### Task 6: Thread Vasicek Bond Pricing Through `ui.js`

**Files:**
- Modify: `src/ui.js` (2 call sites: lines 397, 415)

The `updateStockBondPrices()` function needs Vasicek params for the sidebar bond price pills. Also fix hardcoded `100` → `BOND_FACE_VALUE`.

- [ ] **Step 1: Add import**

In `src/ui.js`, add `vasicekBondPrice` to imports. It currently imports from `./pricing.js` indirectly through `./portfolio.js`. Add a direct import:

```js
import { vasicekBondPrice } from './pricing.js';
```

Also ensure `BOND_FACE_VALUE` is imported from config (check if it's already imported — if not, add it).

- [ ] **Step 2: Update `updateStockBondPrices` signature**

Add `vasicek` parameter:

```js
export function updateStockBondPrices($, spot, rate, sigma, skeleton, posMap, stratPosMap, vasicek) {
```

- [ ] **Step 3: Replace trade tab bond pricing (line 397)**

Replace:
```js
? 100 * Math.exp(-rate * tradeExp.dte / 252)
```
With:
```js
? vasicek
    ? vasicekBondPrice(BOND_FACE_VALUE, rate, tradeExp.dte / 252, vasicek.a, vasicek.b, vasicek.sigmaR)
    : BOND_FACE_VALUE * Math.exp(-rate * tradeExp.dte / 252)
```

- [ ] **Step 4: Replace strategy tab bond pricing (line 415)**

Replace:
```js
? 100 * Math.exp(-rate * stratExp.dte / 252)
```
With:
```js
? vasicek
    ? vasicekBondPrice(BOND_FACE_VALUE, rate, stratExp.dte / 252, vasicek.a, vasicek.b, vasicek.sigmaR)
    : BOND_FACE_VALUE * Math.exp(-rate * stratExp.dte / 252)
```

- [ ] **Step 5: Commit**

```bash
git add src/ui.js
git commit -m "feat: Vasicek bond pricing in sidebar price pills"
```

---

### Task 7: Wire Vasicek Params From `main.js`

**Files:**
- Modify: `main.js` (import `setVasicekParams`, call on reset/param changes, pass to `updateStockBondPrices`, update `_vasicekParams`)

This task wires everything together from the orchestrator.

- [ ] **Step 1: Import `setVasicekParams`**

In `main.js`, add to the portfolio import (line 13 area):

```js
import { ..., setVasicekParams } from './src/portfolio.js';
```

- [ ] **Step 2: Update `_vasicekParams()` to include `sigmaR`**

In `main.js`, update the helper (line 121-123):

```js
function _vasicekParams() {
    return { a: sim.a, b: sim.b, sigmaR: sim.sigmaR };
}
```

- [ ] **Step 3: Call `setVasicekParams` in `_resetCore`**

Find `_resetCore` in main.js and add after the sim reset:

```js
setVasicekParams(sim.a, sim.b, sim.sigmaR);
```

- [ ] **Step 4: Call `setVasicekParams` on parameter slider changes**

Find where sim parameters are updated from settings sliders (the slider change handlers that modify `sim.a`, `sim.b`, `sim.sigmaR`). After each, call `setVasicekParams(sim.a, sim.b, sim.sigmaR)`.

Also call it after event engine applies parameter deltas (in `_onDayComplete` or wherever `PARAM_RANGES` clamping happens).

- [ ] **Step 5: Pass `_vasicekParams()` to all `updateStockBondPrices` calls**

There are 6 call sites in `main.js` (line 246, 252, 392, 648, 675, 1008/1020 area). Add `_vasicekParams()` as the last argument to each:

```js
updateStockBondPrices($, sim.S, sim.r, vol, chainSkeleton, pMap, sMap, _vasicekParams());
```

- [ ] **Step 6: Thread `vasicek` through `portfolio-renderer.js`**

`portfolio-renderer.js` calls `computePositionPnl` in two places (line 31 in `_buildPositionRow`, line 155 in `_diffPositionRows`). Thread `vasicek` through:

1. Update `updatePortfolioDisplay` signature (line 215) to accept `vasicek` as the last param:
```js
export function updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day, marginInfo, q, vasicek) {
```

2. Pass `vasicek` through to `_diffPositionRows` (lines 258, 301):
```js
_diffPositionRows($.defaultPositions, defaultPos, currentPrice, vol, rate, day, 'No open positions.', q, vasicek);
// and
_diffPositionRows(group, groupPositions, currentPrice, vol, rate, day, '', q, vasicek);
```

3. Update `_diffPositionRows` signature (line 117) to accept `vasicek`:
```js
function _diffPositionRows(container, positions, S, vol, rate, day, emptyHint, q, vasicek) {
```

4. Pass `vasicek` to `computePositionPnl` at line 155:
```js
const pnl = computePositionPnl(pos, S, vol, rate, day, q, vasicek);
```

5. Pass `vasicek` to `_buildPositionRow` at line 171:
```js
const row = _buildPositionRow(pos, S, vol, rate, day, q, vasicek);
```

6. Update `_buildPositionRow` signature (line 28) and its `computePositionPnl` call (line 31):
```js
function _buildPositionRow(pos, currentPrice, vol, rate, day, q, vasicek) {
    // ...
    const pnl = computePositionPnl(pos, currentPrice, vol, rate, day, q, vasicek);
```

- [ ] **Step 7: Pass `_vasicekParams()` from `main.js` to `updatePortfolioDisplay`**

Find calls to `updatePortfolioDisplay` in `main.js` and add `_vasicekParams()` as the last argument.

- [ ] **Step 7: Verify the app runs**

Serve the app, play the simulation, trade some bonds. Verify:
- Bond prices in sidebar differ from simple `exp(-rT)` when `r ≠ b`
- Bond prices in chain overlay are consistent with sidebar
- Portfolio bond positions show correct P&L
- No console errors

- [ ] **Step 8: Commit**

```bash
git add main.js
git commit -m "feat: wire Vasicek bond pricing through main.js orchestrator"
```

---

### Task 8: Second-Order Heston Smile (Curvature + Convexity)

**Files:**
- Modify: `src/pricing.js` (`computeEffectiveSigma` + `computeSkewSigma`)
- Modify: `src/chain.js` (pass `xi` to `computeEffectiveSigma`)
- Modify: `src/strategy.js` (pass `xi` to `computeEffectiveSigma`, 3 call sites)

- [ ] **Step 1: Update `computeEffectiveSigma` in `pricing.js`**

Add `xi` parameter and vol-of-vol convexity adjustment. Replace the current function (lines 63-68):

```js
export function computeEffectiveSigma(v, T, kappa, theta) {
    const kT = kappa * T;
    if (kT < 1e-6) return Math.sqrt(Math.max(v, 0));
    const meanVar = theta + (v - theta) * (1 - Math.exp(-kT)) / kT;
    return Math.sqrt(Math.max(meanVar, 0));
}
```

With:

```js
export function computeEffectiveSigma(v, T, kappa, theta, xi) {
    const kT = kappa * T;
    if (kT < 1e-6) return Math.sqrt(Math.max(v, 0));
    const expNkT = Math.exp(-kT);
    const meanVar = theta + (v - theta) * (1 - expNkT) / kT;
    if (meanVar < 1e-8) return Math.sqrt(Math.max(meanVar, 0));

    // Vol-of-vol convexity: variance of integrated variance correction.
    // w(x) = (2/x²)(x - 1 + e^{-x}), the normalized OU variance weight.
    // Gatheral 2006, ch. 3; Lewis 2000, sec. 5.3.
    let adj = 0;
    if (xi > 0) {
        const w = 2 / (kT * kT) * (kT - 1 + expNkT);
        adj = xi * xi / (2 * kappa * kappa * meanVar) * w;
    }

    return Math.sqrt(Math.max(meanVar + adj, 0));
}
```

- [ ] **Step 2: Update `computeSkewSigma` with quadratic curvature**

Replace the current function (lines 88-95):

```js
export function computeSkewSigma(sigmaEff, S, K, T, rho, xi, kappa) {
    const x = Math.log(K / S);
    const kT = kappa * T;
    const dampen = kT < 1e-6 ? 1 : (1 - Math.exp(-kT)) / kT;
    const skewCoeff = rho * xi / (2 * sigmaEff) * dampen;
    const adj = sigmaEff * (1 + skewCoeff * x);
    return adj > 0.01 ? adj : 0.01; // floor at 1% vol
}
```

With:

```js
export function computeSkewSigma(sigmaEff, S, K, T, rho, xi, kappa) {
    const x = Math.log(K / S);
    const kT = kappa * T;
    const dampen = kT < 1e-6 ? 1 : (1 - Math.exp(-kT)) / kT;
    const skewCoeff = rho * xi / (2 * sigmaEff) * dampen;
    // Second-order smile curvature: ξ²/(12σ²) makes both wings curve up.
    // Same dampen factor (approximation — exact Heston decays differently).
    const curvCoeff = xi * xi / (12 * sigmaEff * sigmaEff) * dampen;
    const adj = sigmaEff * (1 + skewCoeff * x + curvCoeff * x * x);
    return adj > 0.01 ? adj : 0.01;
}
```

- [ ] **Step 3: Update JSDoc and module header comments**

Update the `computeEffectiveSigma` JSDoc to document the `xi` parameter and convexity adjustment. Update the module header comment (lines 10-12) to mention vol-of-vol convexity and quadratic smile.

- [ ] **Step 4: Pass `xi` in `chain.js:priceChainExpiry` (line 138)**

Replace:
```js
? computeEffectiveSigma(v, T, heston.kappa, heston.theta)
```
With:
```js
? computeEffectiveSigma(v, T, heston.kappa, heston.theta, heston.xi)
```

- [ ] **Step 5: Pass `xi` in `strategy.js` (3 call sites: lines 143, 150, 613)**

Replace all 3 instances of:
```js
computeEffectiveSigma(heston.v, T, heston.kappa, heston.theta)
```
With:
```js
computeEffectiveSigma(heston.v, T, heston.kappa, heston.theta, heston.xi)
```

(Line 150 uses `entryT` instead of `T` — the pattern is the same, just append `, heston.xi`.)

- [ ] **Step 6: Verify smile shape**

Serve the app, open the full chain overlay. With default Calm Bull preset (`ρ=-0.5, ξ=0.3`):
- OTM puts (low strikes) should have higher implied vol than ATM
- OTM calls (high strikes) should have slightly elevated vol (curving up)
- ATM should be the minimum
- This is visible as higher option prices on the wings vs a linear interpolation

Switch to Crisis preset (`ρ=-0.85, ξ=0.8`) — the smile should be more pronounced.

- [ ] **Step 7: Commit**

```bash
git add src/pricing.js src/chain.js src/strategy.js
git commit -m "feat: second-order Heston smile curvature and vol-of-vol convexity"
```

---

### Task 9: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update bond pricing documentation**

In the "Bond pricing" gotcha in CLAUDE.md, update to mention Vasicek closed-form:

Replace references to `100 * exp(-r * T)` with a note that bonds use `vasicekBondPrice()` from pricing.js, which accounts for rate mean-reversion and volatility. Add a brief description of the formula.

- [ ] **Step 2: Update simulation engine documentation**

In the OHLC Sub-Step Pipeline section, note that the variance process uses Milstein discretization (not Euler-Maruyama).

- [ ] **Step 3: Update options pricing documentation**

In the term-structure volatility section, note the vol-of-vol convexity adjustment and second-order smile curvature.

- [ ] **Step 4: Update pricing.js description in file map**

Update the `pricing.js` line to mention `vasicekBondPrice`, vol-of-vol convexity, and quadratic smile.

- [ ] **Step 5: Add `setVasicekParams` to portfolio.js exports**

In the module dependencies section, add `setVasicekParams` to the portfolio.js export list.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for financial model improvements"
```

---

### Task 10: Final Integration Verification

- [ ] **Step 1: Full smoke test**

Serve the app from `a9lim.github.io/`. Run through:
1. Each preset (Calm Bull → Crisis → Rate Hike) — verify bonds reprice on switch
2. Trade bonds: buy and sell, verify P&L reflects Vasicek pricing
3. Short bonds: verify margin uses Vasicek bond price
4. Open full chain overlay: verify smile shape (OTM puts > ATM > OTM calls slightly up)
5. Strategy builder: add bond legs, verify payoff diagram uses Vasicek
6. Time slider in strategy: verify bond theta (interest accrual) works
7. Let sim run in Crisis preset for ~100 days: verify no NaN/Infinity in prices

- [ ] **Step 2: Verify degradation behavior**

Temporarily set `sim.a = 0, sim.sigmaR = 0, sim.xi = 0` in console:
- Bond prices should match `100 * exp(-r*T)` (flat-rate fallback)
- Vol smile should be flat (no skew, no curvature)
- These verify graceful degradation

- [ ] **Step 3: Commit any remaining fixes**

If any issues found during verification, fix and commit.
