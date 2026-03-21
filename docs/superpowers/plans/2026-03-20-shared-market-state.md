# Shared Market State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace parameter threading of Heston/Vasicek model params with a shared `market` state object that `main.js` syncs and all consumer modules read directly.

**Architecture:** New `src/market.js` module exports a plain mutable `market` object and `syncMarket(sim)` function. `main.js` calls `syncMarket` at every state mutation point (substep, reset, slider, events). Consumer modules (`portfolio.js`, `position-value.js`, `chain.js`, `strategy.js`, `ui.js`, `portfolio-renderer.js`) import `market` and read from it, eliminating parameter threading. `pricing.js` stays pure (explicit params).

**Tech Stack:** Vanilla JS (ES6 modules), no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-20-shared-market-state-design.md`

---

### Task 1: Create `src/market.js`

**Files:**
- Create: `src/market.js`

- [ ] **Step 1: Create the market module**

Create `src/market.js`:

```js
/* =====================================================
   market.js -- Shared market state for the Shoals
   trading simulator.

   Single-writer (main.js via syncMarket), multiple
   readers (portfolio.js, position-value.js, chain.js,
   strategy.js, ui.js). No imports — leaf module.
   ===================================================== */

export const market = {
    S: 0, v: 0, r: 0, day: 0, q: 0,
    sigma: 0,
    kappa: 0, theta: 0, xi: 0, rho: 0,
    a: 0, b: 0, sigmaR: 0,
    borrowSpread: 0,
};

/** Sync market state from simulation. Call once per substep/reset. */
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

- [ ] **Step 2: Commit**

```bash
git add src/market.js
git commit -m "feat: add shared market state module"
```

---

### Task 2: Wire `syncMarket` in `main.js` (before consumer refactors)

**Files:**
- Modify: `main.js`

Wire `syncMarket` calls first so `market` has valid state before any consumer module reads it. This task does NOT remove the old helpers yet — it adds `syncMarket` alongside them.

- [ ] **Step 1: Add imports**

```js
import { syncMarket, market } from './src/market.js';
```

- [ ] **Step 2: Add `syncMarket(sim)` at every state mutation point**

1. In `_resetCore` — add `syncMarket(sim)` right after the existing `setVasicekParams` call (line 798)
2. In the substep streaming path — add `syncMarket(sim)` after each `sim.substep()` call (or at the start of each substep batch, before `_onSubstep()`)
3. After `sim.finalizeDay()` in the streaming path — add `syncMarket(sim)` before `_onDayComplete()`
4. After `sim.tick()` / `sim.finalizeDay()` in the step-button `tick()` function — add `syncMarket(sim)` before `_onDayComplete()`
5. In the event engine handler — add `syncMarket(sim)` after `sim.recomputeK()` (line 554), alongside the existing `setVasicekParams`
6. In `syncSliderToSim` — add `syncMarket(sim)` after param changes (line 862), alongside existing `setVasicekParams`

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat: wire syncMarket calls in main.js"
```

---

### Task 3: Refactor `position-value.js` — remove `vasicek` param

**Files:**
- Modify: `src/position-value.js`

- [ ] **Step 1: Replace `vasicekBondPrice` import with `market` import, simplify bond case**

Replace the import line:
```js
import { priceAmerican, vasicekBondPrice } from './pricing.js';
```
With:
```js
import { priceAmerican, vasicekBondPrice } from './pricing.js';
import { market } from './market.js';
```

- [ ] **Step 2: Remove `vasicek` param from all 3 functions and use `market` internally**

Update `unitPrice` — remove `vasicek` param, replace bond case:
```js
export function unitPrice(type, S, vol, rate, day, strike, expiryDay, q) {
```
Bond case becomes:
```js
case 'bond':
    return market.a >= 1e-8
        ? vasicekBondPrice(BOND_FACE_VALUE, rate, dte, market.a, market.b, market.sigmaR)
        : BOND_FACE_VALUE * Math.exp(-rate * dte);
```

Update `computePositionValue` — remove `vasicek` param:
```js
export function computePositionValue(pos, S, vol, rate, day, q) {
    return pos.qty * unitPrice(pos.type, S, vol, rate, day, pos.strike, pos.expiryDay, q);
}
```

Update `computePositionPnl` — remove `vasicek` param:
```js
export function computePositionPnl(pos, S, vol, rate, day, q) {
    const currentValue = computePositionValue(pos, S, vol, rate, day, q);
```

Remove JSDoc `@param` lines for `vasicek` on all 3 functions.

- [ ] **Step 3: Commit**

```bash
git add src/position-value.js
git commit -m "refactor: position-value reads market state directly"
```

---

### Task 4: Refactor `portfolio.js` — remove Vasicek state, use `market`

**Files:**
- Modify: `src/portfolio.js`

- [ ] **Step 1: Replace Vasicek module state with `market` import**

Remove `vasicekBondPrice` from pricing import (line 20), add market import:
```js
import { priceAmerican, computeGreeks } from './pricing.js';
import { market } from './market.js';
import { vasicekBondPrice } from './pricing.js';
```
(Or combine into one pricing import: `import { priceAmerican, computeGreeks, vasicekBondPrice } from './pricing.js';` plus `import { market } from './market.js';`)

Delete lines 48-58 (the `_vasA`, `_vasB`, `_vasSigR`, `setVasicekParams`, `_vasicekObj` declarations).

- [ ] **Step 2: Replace all `_vasA/_vasB/_vasSigR` with `market.a/b/sigmaR`**

5 bond pricing sites — replace `_vasA, _vasB, _vasSigR` with `market.a, market.b, market.sigmaR`:
- Line 189 (`_maintenanceForShort`)
- Line 243 (`_postTradeMarginOk`)
- Line 687 (`chargeBorrowInterest`)
- Line 895 (`marginRequirement`)
- Line 946 (`checkMargin`)

- [ ] **Step 3: Remove `_vasicekObj()` from `computePositionValue` calls**

3 internal calls — remove `, _vasicekObj()` trailing argument:
- Line 231 (`_postTradeMarginOk`)
- Line 861 (`portfolioValue`)
- Line 934 (`checkMargin`)

These now work without it because `computePositionValue` reads `market` internally (Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/portfolio.js
git commit -m "refactor: portfolio reads market state directly, remove setVasicekParams"
```

---

### Task 5: Refactor `chain.js` — remove `heston`/`vasicek` params

**Files:**
- Modify: `src/chain.js`

- [ ] **Step 1: Import `market`, remove `heston`/`vasicek` params from `priceChainExpiry`**

Add import:
```js
import { market } from './market.js';
```

Update `priceChainExpiry` signature — remove `heston` and `vasicek` params:
```js
export function priceChainExpiry(S, v, r, expiry, greeks, q) {
```

Replace all `heston.kappa`/`heston.theta`/`heston.xi`/`heston.rho` references with `market.kappa`/`market.theta`/`market.xi`/`market.rho`. Remove the `heston ?` ternaries — always use market values (when `market.xi === 0`, the formulas degrade naturally).

Replace `vasicek` references in `prepareTree`/`prepareGreekTrees` calls. Construct the vasicek object from market:
```js
const vasicek = market.a >= 1e-8 ? { a: market.a, b: market.b } : null;
```
Use this local `vasicek` for `prepareTree(T, r, sigma, q, currentDay, vasicek)` and `prepareGreekTrees(T, r, sigma, q, currentDay, vasicek)`.

For `computeEffectiveSigma` — always call it (no `heston ?` ternary):
```js
const sigmaEff = computeEffectiveSigma(v, T, market.kappa, market.theta, market.xi);
```

For `computeSkewSigma` — always call it:
```js
const sigma = computeSkewSigma(sigmaEff, S, K, T, market.rho, market.xi, market.kappa);
```

- [ ] **Step 2: Commit**

```bash
git add src/chain.js
git commit -m "refactor: chain reads market state directly"
```

---

### Task 6: Refactor `strategy.js` — remove `heston`/`vasicek` params

**Files:**
- Modify: `src/strategy.js`

This is the most complex file — `heston`/`vasicek` appear in `draw`, `computeSummary`, `_precomputeLegs`, `_legEntryCost`, `_modelKey`, and cache keys.

- [ ] **Step 1: Import `market`, remove `vasicekBondPrice` from pricing import (it stays but now accessed differently)**

Add:
```js
import { market } from './market.js';
```

- [ ] **Step 2: Remove `heston`/`vasicek` from `_precomputeLegs` signature**

Change from:
```js
function _precomputeLegs(legs, entryS, vol, rate, evalDay, entryDay, fallbackDte, q, heston, vasicek) {
```
To:
```js
function _precomputeLegs(legs, entryS, vol, rate, evalDay, entryDay, fallbackDte, q) {
```

Replace all `heston.xxx` refs with `market.xxx`. Replace `heston ?` ternaries — always call `computeEffectiveSigma`/`computeSkewSigma` using market values.

For `vasicek` references — construct local vasicek object:
```js
const vasicek = market.a >= 1e-8 ? { a: market.a, b: market.b } : null;
```
Use this for `priceAmerican(...)`, `prepareTree(...)`, and `info.vasicek = vasicek` stash.

For bond pricing — use `vasicekBondPrice` with `market.a/b/sigmaR` directly (replace `vasicek.a/b/sigmaR` with `market.a/b/sigmaR`, replace `vasicek ?` with `market.a >= 1e-8 ?`).

- [ ] **Step 3: Remove `heston`/`vasicek` from `draw` and `computeSummary` signatures**

`draw` — remove last 2 params:
```js
draw(legs, spot, vol, rate, dte, greekToggles, evalDay, entryDay, q) {
```

`computeSummary` — remove last 2 params:
```js
computeSummary(legs, spot, vol, rate, dte, evalDay, entryDay, q) {
```

Update internal calls to `_precomputeLegs` — remove `heston, vasicek` args.

- [ ] **Step 4: Remove `heston`/`vasicek` from `_legEntryCost`**

```js
_legEntryCost(leg, spot, vol, rate, T, q, entryDay) {
```

Replace `heston.xxx` with `market.xxx`, construct local `vasicek` from market for `priceAmerican` and bond pricing.

- [ ] **Step 5: Update `_modelKey` and cache keys**

`_modelKey` currently takes `(heston, vasicek)`. Change to read from `market` directly:
```js
function _modelKey() {
    return (market.v * 1e6 | 0) + ',' + (market.kappa * 1e4 | 0) + ','
        + (market.theta * 1e6 | 0) + ',' + (market.rho * 1e4 | 0) + ',' + (market.xi * 1e4 | 0)
        + ',' + (market.a * 1e4 | 0) + ',' + (market.b * 1e6 | 0);
}
```

Update all `_modelKey(heston, vasicek)` calls to `_modelKey()`.

Update `_legEntryCost` call in `computeSummary` — remove `heston, vasicek` args.

- [ ] **Step 6: Commit**

```bash
git add src/strategy.js
git commit -m "refactor: strategy reads market state directly"
```

---

### Task 7: Refactor `ui.js` — remove `vasicek` param

**Files:**
- Modify: `src/ui.js`

- [ ] **Step 1: Import `market`, remove `vasicek` from `updateStockBondPrices`**

Add:
```js
import { market } from './market.js';
```

Update signature:
```js
export function updateStockBondPrices($, spot, rate, sigma, skeleton, posMap, stratPosMap) {
```

Replace the 2 bond pricing ternaries (lines 400-401, 420-421). Change from:
```js
? vasicek
    ? vasicekBondPrice(BOND_FACE_VALUE, rate, tradeExp.dte / 252, vasicek.a, vasicek.b, vasicek.sigmaR)
    : BOND_FACE_VALUE * Math.exp(-rate * tradeExp.dte / 252)
```
To:
```js
? market.a >= 1e-8
    ? vasicekBondPrice(BOND_FACE_VALUE, rate, tradeExp.dte / 252, market.a, market.b, market.sigmaR)
    : BOND_FACE_VALUE * Math.exp(-rate * tradeExp.dte / 252)
```

Same pattern for the strategy tab bond pricing.

- [ ] **Step 2: Commit**

```bash
git add src/ui.js
git commit -m "refactor: ui reads market state directly"
```

---

### Task 8: Refactor `portfolio-renderer.js` — remove `vasicek` param

**Files:**
- Modify: `src/portfolio-renderer.js`

- [ ] **Step 1: Remove `vasicek` from all function signatures**

No `market` import needed — `computePositionPnl` reads it internally now.

Remove `vasicek` param from:
- `_buildPositionRow(pos, currentPrice, vol, rate, day, q, vasicek)` → `_buildPositionRow(pos, currentPrice, vol, rate, day, q)`
- `_diffPositionRows(container, positions, S, vol, rate, day, emptyHint, q, vasicek)` → `_diffPositionRows(container, positions, S, vol, rate, day, emptyHint, q)`
- `updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day, marginInfo, q, vasicek)` → `updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day, marginInfo, q)`

Remove `, vasicek` from all internal pass-through calls:
- `computePositionPnl(pos, currentPrice, vol, rate, day, q, vasicek)` → `computePositionPnl(pos, currentPrice, vol, rate, day, q)` (2 sites)
- `_buildPositionRow(pos, S, vol, rate, day, q, vasicek)` → `_buildPositionRow(pos, S, vol, rate, day, q)` (1 site)
- `_diffPositionRows(... , q, vasicek)` → `_diffPositionRows(... , q)` (2 sites)

- [ ] **Step 2: Commit**

```bash
git add src/portfolio-renderer.js
git commit -m "refactor: portfolio-renderer drops vasicek threading"
```

---

### Task 9: Clean up `main.js` — remove old helpers and threading

**Files:**
- Modify: `main.js`

Now that all consumers read from `market`, remove the old parameter threading from main.js.

- [ ] **Step 1: Remove old imports and helpers**

Remove `setVasicekParams` from portfolio import (line 16).
Delete `_hestonParams()` helper (lines 116-118).
Delete `_vasicekParams()` helper (lines 121-123).
Remove the old `setVasicekParams` calls (lines 555, 798, 862) — `syncMarket` already covers these.

- [ ] **Step 2: Replace `Math.sqrt(Math.max(sim.v, 0))` with `market.sigma`**

Search for all `Math.sqrt(Math.max(sim.v, 0))` in main.js (there are many). Replace each with `market.sigma`. Some are in local `const vol = ...` assignments — replace the whole line with `const vol = market.sigma;` or use `market.sigma` inline.

- [ ] **Step 3: Remove `_vasicekParams()` from all `updateStockBondPrices` calls**

6 call sites — remove the trailing `_vasicekParams()` argument from each.

- [ ] **Step 4: Remove `_vasicekParams()` from all `updatePortfolioDisplay` calls**

2 call sites — remove the trailing `_vasicekParams()` argument from each.

- [ ] **Step 5: Remove `_hestonParams()`/`_vasicekParams()` from `priceChainExpiry` calls**

2 call sites (`_priceExpiry` and `_priceExpiryGreeks`) — remove the trailing `_hestonParams(), _vasicekParams()` arguments.

- [ ] **Step 6: Remove `_hestonParams()`/`_vasicekParams()` from strategy calls**

Update `renderCurrentView` — remove `_hestonParams(), _vasicekParams()` from `strategy.draw(...)`.
Update `updateStrategyBuilder` — remove `_hestonParams(), _vasicekParams()` from `strategy.computeSummary(...)`.

- [ ] **Step 7: Commit**

```bash
git add main.js
git commit -m "refactor: main.js removes param threading helpers, uses market.sigma"
```

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update documentation references**

- Replace references to `setVasicekParams` with `syncMarket` from `market.js`
- Replace references to `_hestonParams()` / `_vasicekParams()` with `market` object
- Add `market.js` to the file map with description
- Add `market.js` to the module dependencies graph (leaf module, imported by portfolio.js, position-value.js, chain.js, strategy.js, ui.js, main.js)
- Update `priceChainExpiry` signature docs (remove `heston`/`vasicek` params)
- Update strategy `draw`/`computeSummary` signature docs
- Update `computePositionValue`/`computePositionPnl` docs (remove `vasicek` param)

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for shared market state"
```
