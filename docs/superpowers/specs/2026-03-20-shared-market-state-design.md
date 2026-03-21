# Shared Market State Module

**Date:** 2026-03-20
**Scope:** New `src/market.js`, refactor `main.js`, `src/portfolio.js`, `src/position-value.js`, `src/chain.js`, `src/strategy.js`, `src/ui.js`, `src/portfolio-renderer.js`

## Summary

Replace parameter threading of Heston/Vasicek model params with a shared `market` state object. `main.js` syncs it once per substep; all consumer modules import and read from it directly. Pricing functions in `pricing.js` remain pure (explicit params).

## New Module: `src/market.js`

```js
export const market = {
    S: 0, v: 0, r: 0, day: 0, q: 0,
    sigma: 0,  // sqrt(max(v, 0)) — precomputed, many callers need this
    kappa: 0, theta: 0, xi: 0, rho: 0,
    a: 0, b: 0, sigmaR: 0,
    borrowSpread: 0,
};

export function syncMarket(sim) {
    market.S = sim.S;  market.v = sim.v;  market.r = sim.r;
    market.day = sim.day;  market.q = sim.q;
    market.sigma = Math.sqrt(Math.max(sim.v, 0));
    market.kappa = sim.kappa;  market.theta = sim.theta;
    market.xi = sim.xi;  market.rho = sim.rho;
    market.a = sim.a;  market.b = sim.b;  market.sigmaR = sim.sigmaR;
    market.borrowSpread = sim.borrowSpread;
}
```

## Sync Point

`main.js` calls `syncMarket(sim)`:
- At top of each substep batch (before `_onSubstep`)
- In `_resetCore` (after `sim.reset()` and `sim.prepopulate()`)
- After event engine applies parameter deltas
- After slider parameter changes (`syncSliderToSim`)

This is the single mutation point. All other modules only read.

**Ordering**: In `_onDayComplete`, place `syncMarket(sim)` after `sim.recomputeK()` to capture all parameter mutations from events. `market.sigma` replaces repeated `Math.sqrt(Math.max(sim.v, 0))` computations at ~8 call sites in main.js.

## Removals

### main.js
- Delete `_hestonParams()` helper and all 7+ call sites
- Delete `_vasicekParams()` helper and all 14+ call sites
- Remove `setVasicekParams` import from portfolio.js
- Remove `_vasicekParams()` args from all `updateStockBondPrices` calls
- Remove `_vasicekParams()` args from all `updatePortfolioDisplay` calls
- Remove `_hestonParams()` / `_vasicekParams()` args from `priceChainExpiry` calls
- Remove `_hestonParams()` / `_vasicekParams()` args from strategy `draw`/`computeSummary` calls

### portfolio.js
- Delete `setVasicekParams`, `_vasA`, `_vasB`, `_vasSigR`, `_vasicekObj()`
- Import `market` from `./market.js`
- Bond pricing sites read `market.a`, `market.b`, `market.sigmaR` directly
- Internal `computePositionValue` calls: remove `_vasicekObj()` arg (no longer needed)

### position-value.js
- Remove `vasicek` param from `unitPrice`, `computePositionValue`, `computePositionPnl`
- Import `market` from `./market.js`
- Bond case reads `market.a`, `market.b`, `market.sigmaR` directly
- Always uses Vasicek pricing when `market.a >= 1e-8` (no more ternary fallback at call sites)

### chain.js
- Remove `heston` and `vasicek` params from `priceChainExpiry`
- Import `market` from `./market.js`
- Read `market.kappa`, `market.theta`, `market.xi`, `market.rho`, `market.a`, `market.b` directly
- `computeEffectiveSigma` and `computeSkewSigma` calls use market values

### strategy.js
- Remove `heston` and `vasicek` params from `draw`, `computeSummary`, `_precomputeLegs`, `_legEntryCost`
- Import `market` from `./market.js`
- Bond pricing reads `market.a`, `market.b`, `market.sigmaR`
- `computeEffectiveSigma` calls read `market.kappa`, `market.theta`, `market.xi`
- `computeSkewSigma` calls read `market.rho`, `market.xi`, `market.kappa`
- **Stash pattern**: `_precomputeLegs` currently stashes `info.vasicek = vasicek` for lazy Greek tree preparation (`prepareGreekTrees` on line 205). After refactor, construct the vasicek object from `market.*` at precompute time: `info.vasicek = { a: market.a, b: market.b }`. Same for `info.tree = prepareTree(...)` and `priceAmerican(...)` calls — read `market.*` to build params for pure pricing.js functions.

### ui.js
- Remove `vasicek` param from `updateStockBondPrices`
- Import `market` from `./market.js`
- Bond pricing reads `market.a`, `market.b`, `market.sigmaR`

### portfolio-renderer.js
- Remove `vasicek` param from `updatePortfolioDisplay`, `_diffPositionRows`, `_buildPositionRow`
- No `market` import needed — `computePositionPnl` reads market internally now

## What Stays Pure

`pricing.js` functions keep explicit parameter signatures:
- `priceAmerican(S, K, T, r, sigma, isPut, q, currentDay, vasicek)`
- `computeGreeks(S, K, T, r, sigma, isPut, q, currentDay, vasicek)`
- `vasicekBondPrice(face, r, T, a, b, sigmaR)`
- `computeEffectiveSigma(v, T, kappa, theta, xi)`
- `computeSkewSigma(sigmaEff, S, K, T, rho, xi, kappa)`
- `prepareTree`, `priceWithTree`, `pricePairWithTree`, etc.

These are the math layer — no shared state dependency. Callers in chain.js, strategy.js, position-value.js, portfolio.js read from `market` and pass values to these functions.

## Verification

- `market.js` has no imports (no circular dependency risk)
- Only `main.js` calls `syncMarket` (single writer)
- All other modules only read `market.*` (multiple readers)
- `pricing.js` does not import `market` (stays pure)
- Bond pricing fallback: `position-value.js` checks `market.a >= 1e-8` internally instead of callers checking `vasicek` truthiness

## Documentation

Update CLAUDE.md references to `setVasicekParams`, `_hestonParams()`, `_vasicekParams()` to reflect the new `market.js` pattern.
