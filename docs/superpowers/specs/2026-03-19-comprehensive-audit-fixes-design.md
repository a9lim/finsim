# Comprehensive Audit Fixes -- Design Spec

**Date:** 2026-03-19
**Scope:** Fix 23 confirmed issues across pricing, portfolio accounting, event engine, UI performance, dead code, and accessibility.
**Approach:** Surgical fixes + extraction of repeated logic into new helper modules (Approach C).

---

## Phase 1: Critical Pricing Fixes

### 1.1 Variance-to-Volatility in `buildChain()` (Issue #1)

**File:** `src/chain.js`
**Problem:** `buildChain()` receives Heston variance `v` but passes it directly as `sigma` to `computeGreeks()` and `computeOptionBidAsk()`, which expect annualized volatility (`sqrt(v)`). All chain prices are 2-5x underpriced.
**Fix:** Add `const sigma = Math.sqrt(Math.max(v, 0))` at the top of `buildChain()` and use `sigma` in all downstream calls within the function. No call-site changes needed.

### 1.2 Bivariate Normal CDF Precision Upgrade (Issue #5)

**File:** `src/pricing.js` (lines 80-149)
**Problem:** The current `cbnd()` wrapper has correct sign-handling branches (lines 91-106) that always pass non-positive rho to `_cbndCore`. However, the general-case decomposition (lines 108-113) can pass positive `rhoA`/`rhoB` to `_cbndCore`. While the Drezner-Wesolowsky integral formula is mathematically valid for any `rho in (-1,1)`, the 5-point Gauss-Legendre quadrature may lack precision for extreme parameter combinations (deep ITM/OTM, near-expiry, high correlation). This affects the early exercise premium accuracy via `_psi`.
**Fix:** Replace `cbnd`/`_cbndCore` (~70 lines) with the Genz (2004) bivariate normal CDF algorithm, which uses higher-order quadrature and is the standard implementation in QuantLib and Haug (2007). ~60-80 lines. This is a precision upgrade, not a correctness fix — the current implementation produces approximate results, not wrong ones.

### 1.3 Theta Central Difference (Issue #8)

**File:** `src/pricing.js`, `computeGreeks()`
**Problem:** Theta uses forward difference (`(P(T-h) - P(T)) / h`), which has higher discretization error than central difference, especially near expiry.
**Fix:** Change to central difference: `(P(T-h) - P(T+h)) / (2*h)`. Adds 1 extra pricing call per `computeGreeks()` invocation (9 total instead of 8). ~2 line change.

---

## Phase 2: Portfolio Accounting Fixes

### 2.1 New Module: `src/position-value.js` (~40 lines)

Extract position valuation into a standalone module to eliminate three separate broken/inconsistent valuation implementations.

**Exports:**
- `computePositionValue(pos, S, vol, rate, day)` — mark-to-market value for any position type, with correct sign handling for shorts
- `computePositionPnl(pos, S, vol, rate, day)` — unrealized P&L

**Consumers:**
- `portfolio.js`: `portfolioValue()` replaces its inline switch with calls to `computePositionValue()`
- `ui.js` (via `portfolio-renderer.js`): replaces broken `_posCurrentValue()` which returned 0 for options
- `_computeMarginDisplay`: uses pre-computed values instead of naive `absQty * currentPrice`

**Valuation rules (fixing Issues #2 and #3):**
- Long stock: `qty * S`
- Short stock: `-absQty * S` (liability; proceeds already in cash)
- Long bond: `absQty * 100 * exp(-r * T)`
- Short bond: `-absQty * 100 * exp(-r * T)` (liability)
- Long call/put: `absQty * priceAmerican(S, K, T, r, vol, isPut)`
- Short call/put: `-absQty * priceAmerican(S, K, T, r, vol, isPut)` (liability)

### 2.2 Store Reserved Margin on Positions (Issue #7)

**File:** `src/portfolio.js`
**Problem:** `closePosition()` calls `_marginForShort()` at current price instead of the amount actually reserved, creating phantom cash.
**Fix:**
- In `executeMarketOrder()`, when opening a new short position or extending a short, compute margin via `_marginForShort()` and store it as `pos._reservedMargin` on the position object.
- In netting branches that flip a position to short, also store `_reservedMargin`.
- In `closePosition()`, return `pos._reservedMargin` instead of recomputing. Fallback: `pos._reservedMargin ?? _marginForShort(...)` for defensive handling of any positions lacking the field.
- On partial close/netting, prorate: `returnedMargin = pos._reservedMargin * (closingQty / absOldQty)` and update `pos._reservedMargin` to the remainder.
- In `processExpiry()`, same pattern: return `pos._reservedMargin` for expiring short options (with same fallback).

### 2.3 Fix `_computeMarginDisplay` (Issue #9)

**File:** `src/ui.js` (or `src/portfolio-renderer.js` after extraction)
**Problem:** Uses `absQty * currentPrice` for all position types regardless of type.
**Fix:** Receive pre-computed `equity` and `required` from `main.js` (which already calls `checkMargin()`), eliminating the duplicated margin logic entirely. `_computeMarginDisplay` becomes a pure formatting function that takes `{ equity, required }` and returns `{ label, cls }`.

### 2.4 Options P&L Display (Issue #2)

**Problem:** `_posCurrentValue()` returns 0 for all options (no `case 'call'`/`case 'put'`).
**Fix:** Eliminated entirely by the `position-value.js` extraction (2.1). `computePositionValue()` handles all types including options.

### 2.5 Toast Pending Order Fills (Issue #8b)

**File:** `main.js:408`
**Problem:** `checkPendingOrders()` return value is discarded; fills and failed fills produce no notification.
**Fix:** Capture return array, toast each fill with the fill price. ~5 lines.

### 2.6 Fix `handleLiquidate` P&L Baseline (Issue #9b)

**File:** `main.js`
**Problem:** `handleLiquidate` calls `resetPortfolio(portfolio.cash)` after `liquidateAll`, resetting the P&L baseline.
**Fix:** Remove the `resetPortfolio(portfolio.cash)` call. `liquidateAll()` closes all positions and updates cash; `initialCapital` stays at the original value so P&L tracks from sim start.

---

## Phase 3: Event Engine Fixes

### 3.1 + 3.2 LLM Followup Chains + Branching Event Chains (Issues #4, #6)

**NOTE:** These two fixes are interdependent and MUST be implemented together. Both modify `_scheduleFollowups` and `_checkFollowups`.

#### 3.1 LLM Followup Chains (Issue #4)

**File:** `src/events.js`
**Problem:** LLM-generated events are never indexed in `_eventById`, so all LLM followup chains silently fail.
**Fix:** Store the full event object on pending followups instead of just the ID:
- `_scheduleFollowups()`: embed `{ event: f, targetDay, weight, depth, chainId }` instead of `{ id: f.id, ... }`
- `_checkFollowups()`: use `pf.event` directly instead of `_getEventById(pf.id)`

#### 3.2 Branching Event Chains with Weighted Selection (Issue #6 + user requirement)

**File:** `src/events.js`
**Problem:** `_checkFollowups` fires all ready followups independently and only returns the last one. Need mutually exclusive branching where exactly one is picked per branch.
**Fix:**
- Add `chainId` field to pending followups (set to the parent event's ID in `_scheduleFollowups`)
- In `_checkFollowups`, group ready followups by `chainId`
- Within each group, do a weighted pick (reuse `_weightedPick` pattern already in the engine): normalize weights, pick exactly one
- Followups from different parents that happen to land on the same day fire independently
- Return an **array** of all fired events instead of a single event
- Update `maybeFire` to return the array
- Update `main.js:412-422` to iterate the array and toast each event (staggered durations)

### 3.3 Box-Muller Spare Caching (Issue #14)

**File:** `src/simulation.js`
**Problem:** `_randn()` discards the second Box-Muller variate on every call, wasting ~33% of transcendental math.
**Fix:** Add `_spareValid` (boolean) and `_spare` (number) fields to the Simulation class. On call: if spare is valid, return it and clear flag. Otherwise compute both variates, cache the `sin` result, return the `cos` result. ~8 lines.

### 3.4 Jump Compensation Constant (Issue #17)

**File:** `src/simulation.js`
**Problem:** `this._k = Math.exp(muJ + 0.5 * sigmaJ^2) - 1` is recomputed in `beginDay()` on every trading day despite being constant between parameter changes.
**Fix:** Move to `reset()`. Add public `recomputeK()` method called from `reset()` and from `main.js` inside `_onDayComplete()` after `eventEngine.maybeFire()` returns a non-null event (since event deltas may have modified `muJ`/`sigmaJ`). ~5 lines.

### 3.5 Double-Null `_eventById` (Issue #20)

**File:** `src/events.js:621-622`
**Fix:** Delete the redundant second `_eventById = null`. 1 line.

---

## Phase 4: UI Extraction + Performance

### 4.1 New Module: `src/chain-renderer.js` (~120 lines)

Extract from `ui.js`: `_buildChainRow`, `_buildChainTable`, `_buildStockBondTable`, `_bindCellTrade`, `_bindChainTableClicks`, `_renderChainInto` (~180 lines currently in ui.js).

**Exports:**
- `renderChainInto(container, chain, selectedIndex, dropdownEl, onClick)`
- `buildStockBondTable(stockBA, bondBA, onChainCellClick)` — stock/bond price table used by `showChainOverlay` in ui.js (the overlay assembly logic stays in ui.js)

**Dirty flag optimization (fixes Issue #13):**
- `main.js` owns a `chainDirty` boolean, set to `true` in `_onDayComplete()` after `buildChain()` runs
- `updateUI()` only calls chain rendering when `chainDirty` is true, then resets it to false
- Eliminates double chain rebuild per `updateUI()` call
- The flag lives in `main.js` (the orchestrator), not in the renderer, to avoid shared mutable state in a stateless rendering module

### 4.2 New Module: `src/portfolio-renderer.js` (~100 lines)

Extract from `ui.js`: `_buildPositionRow`, `_buildOrderRow`, `updatePortfolioDisplay`, `_computeMarginDisplay` (~130 lines currently in ui.js).

**DOM diffing (fixes Issue #12):**
- Track position IDs via `data-pos-id` attributes on rows
- On update: add new rows, remove closed positions, update P&L values in-place for existing positions
- Only rebuild a row when its structure changes (qty change, new position)
- Eliminates full DOM wipe-and-rebuild on every trading day

**Import:** Uses `computePositionValue`/`computePositionPnl` from `position-value.js` instead of broken inline `_posCurrentValue`.

### 4.3 `ui.js` Shrinks (~1270 -> ~1020 lines)

Retains: `cacheDOMElements`, `bindEvents`, `updateGreeksDisplay`, `showChainOverlay`, `showTradeDialog`, `showMarginCall`, `toggleStrategyView`, `renderStrategyBuilder`, `updateStockBondPrices`, `updateStrategySelectors`, `syncSettingsUI`, `updateEventLog`, formatting helpers.

`showChainOverlay` calls into `chain-renderer.js` for overlay construction.

### 4.4 Strategy Renderer Fixes

**Double `clearRect` (Issue #15):** Remove the `ctx.clearRect()` call from `_drawBackground()`, keep the one at the top of `draw()`. Safe because `_drawBackground()` is only ever called from within `draw()` (at line 282 for the empty-legs early exit and line 339 for the normal path), always after the `clearRect` at line 264 has already executed. There are no external callers of `_drawBackground()`.

**Spread in hot path (Issue #16):** Replace `Math.min(...pnls)` / `Math.max(...pnls)` with `for`-loop accumulation at all call sites in `strategy.js`.

**Hardcoded colors + `rgba()` (Issue #21):** Remove `color` field from `GREEK_META`. Use `_colors()` (which resolves from `_PALETTE` at runtime) as sole source. Replace `rgba(168,160,152,0.6)` with `#A8A09899` and `rgba(168,160,152,0.15)` with `#A8A09826`.

### 4.5 Theme Fix (Issue #11)

**File:** `src/theme.js`
**Fix:** Add initial `prefers-color-scheme` check in `initTheme()`. If no saved preference, check `window.matchMedia('(prefers-color-scheme: dark)').matches` and set `data-theme` accordingly. Otherwise respect the HTML default (`light`).

### 4.6 Play Button SVG (Issue #12b)

**File:** `src/ui.js`, `updatePlayBtn`
**Fix:** Pre-build both SVG states as innerHTML strings. Toggle via replacing innerHTML instead of createElement calls.

---

## Phase 5: Dead Code Cleanup + Style Fixes

### 5.1 Dead CSS Removal (~80 lines) (Issue #18)

Delete from `styles.css`:
- `#strategy-btn.active` (lines 132-136)
- `.position-row`, `.position-type`, `.position-qty`, `.position-pnl` block (lines 487-518)
- `.chain-controls` (lines 344-346)
- `.toast-event-positive/negative` (lines 884-889)
- `#strategy-time-value` (lines 623-629)
- 4x redundant `.hidden` overrides (lines 68-70, 537-539, 579-581, 822-825)

### 5.2 Dead Export Removal (Issue #19)

Delete `generateExpiries` from `chain.js` (~15 lines). Also remove the fallback guard in `buildChain()` at line 131 (`if (!expiries) expiries = generateExpiries(currentDay)`) since `ExpiryManager` always provides expiries via `expiryMgr.update()` at all call sites in `main.js`.

### 5.3 CSS Fixes (Issues #22, #23)

- Replace no-op `linear-gradient(to right, var(--accent), var(--accent))` with `background: var(--accent)` on webkit slider track
- Delete dead class-level `#time-slider-bar` padding rule (lines 73-77)

### 5.4 Bonus CSS Cleanup

- Delete `.speed-label` redundant font properties (inherited from `.speed-btn`)
- Delete unused `.ctrl-sub` redefinition
- Remove `overflow: hidden` from `html` element (only needed on `body`)

### 5.5 Accessibility (Issues #24, #25)

**index.html:**
- Add `id` attributes to tab buttons (`id="tab-btn-trade"`, `id="tab-btn-portfolio"`, `id="tab-btn-strategy"`, `id="tab-btn-settings"`)
- Add `aria-labelledby` to corresponding tab panels
- Change `<label>Order Type</label>` to `<span class="ctrl-label">Order Type</span>`
- Add `for` attributes to quantity slider labels

---

## New File Map (post-refactor)

```
src/
  position-value.js    ~40 lines  NEW: computePositionValue(), computePositionPnl()
  chain-renderer.js   ~120 lines  NEW: renderChainInto(), buildFullChainOverlay()
  portfolio-renderer.js ~100 lines NEW: updatePortfolioDisplay() with DOM diffing, margin display
  ui.js              ~1020 lines  SHRUNK from ~1270: chain/portfolio rendering extracted
  portfolio.js        ~800 lines  MODIFIED: uses position-value.js, stores _reservedMargin
  pricing.js          ~450 lines  MODIFIED: Genz cbnd, central-diff theta
  chain.js            ~155 lines  MODIFIED: variance->volatility fix, dead export removed
  simulation.js       ~210 lines  MODIFIED: Box-Muller cache, _k optimization
  events.js           ~500 lines  MODIFIED: full-object followups, branching chains, array returns
  strategy.js         ~870 lines  MODIFIED: color/perf fixes
  chart.js            ~683 lines  UNCHANGED
  theme.js             ~25 lines  MODIFIED: prefers-color-scheme check
  config.js            ~26 lines  UNCHANGED
  history-buffer.js    ~86 lines  UNCHANGED
  llm.js             ~170 lines  UNCHANGED
```

## Module Dependency Graph (post-refactor)

```
main.js
  |- config.js
  |- simulation.js          (imports config, history-buffer)
  |- history-buffer.js
  |- chain.js               (imports pricing, portfolio, config)
  |- position-value.js      (imports pricing, config)        NEW
  |- portfolio.js            (imports pricing, config, position-value)
  |- events.js
  |- llm.js                  (imports events)
  |- chart.js
  |- strategy.js             (imports pricing, config)
  |- chain-renderer.js       (no ES6 imports; reads _PALETTE, _haptics globals)  NEW
  |- portfolio-renderer.js   (imports position-value, config)                     NEW
  |- ui.js                   (imports config, chain-renderer, portfolio-renderer)
  +- theme.js
```

No circular dependencies introduced. `position-value.js` imports `pricing.js` and `config.js` (both leaf modules). `portfolio.js` gains a dependency on `position-value.js` (a new leaf). `portfolio-renderer.js` imports `position-value.js` (leaf) and `config.js` (leaf).

---

## Implementation Ordering Constraints

1. **Phase 1 before Phase 2** — Pricing fixes (especially 1.1 variance→volatility) must land before portfolio accounting changes, since `portfolioValue` and `checkMargin` call `priceAmerican`.
2. **§2.1 (`position-value.js`) before §2.2-2.4** — `portfolio.js` and `portfolio-renderer.js` both import from it. Create the file first.
3. **§3.1 and §3.2 together** — Both modify `_scheduleFollowups` and `_checkFollowups`. Implementing one without the other leaves the other broken.
4. **§4.1 and §4.2 before §4.3** — Extracting chain-renderer and portfolio-renderer must happen before ui.js can shrink.
5. **Phase 5 last** — Dead code cleanup is safe to do at any time but cleanest after all functional changes land.
6. **Within phases, fixes are independent** unless noted above.

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Genz cbnd replacement | Medium -- precision upgrade, not correctness fix | Validate against known BS values for edge cases (deep ITM/OTM, near-expiry, negative rates) |
| `portfolioValue` sign fix | High -- changes all equity/margin calculations | Verify P&L displays match expected values for long/short stock, bond, call, put |
| `_reservedMargin` storage | Medium -- touches netting/close/expiry paths | Test all order types: open, extend, partial close, full close, flip, expiry |
| DOM diffing in portfolio-renderer | Medium -- subtle DOM state bugs | Compare visual output before/after at multiple speeds |
| Event chain branching | Medium -- new behavior | Test offline and LLM modes with multi-followup events |
| `generateExpiries` removal | Low -- fallback guard also removed | Verify all `buildChain` call sites pass `expiries` argument |
| Everything else | Low -- isolated, small changes | Visual inspection |
