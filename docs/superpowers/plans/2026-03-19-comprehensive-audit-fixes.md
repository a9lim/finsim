# Comprehensive Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 27 performance, correctness, and redundancy issues identified in the comprehensive codebase audit.

**Architecture:** Changes are organized into 10 tasks by module/concern. No new files are created — all changes modify existing files. Tasks 1-3 are the highest-impact pricing/simulation optimizations. Tasks 4-6 address main.js orchestration waste. Tasks 7-10 handle UI/rendering, portfolio, events, and CSS cleanup.

**Tech Stack:** Vanilla ES6 modules, Canvas 2D, no build step, no test framework.

**Testing:** This project has no automated tests. The user tests manually in-browser. After each task, verify the app loads without console errors via `python -m http.server` from the `a9lim.github.io/` parent directory.

---

## Task 1: Hoist GL arrays and precompute shared expressions in pricing.js

**Audit items:** #1 (GL array allocation), #2 (redundant sqrt/sigma² in _phi/_psi)

**Files:**
- Modify: `src/pricing.js:107-146` (hoist arrays)
- Modify: `src/pricing.js:186-269` (add _phiPre/_psiPre with precomputed values)
- Modify: `src/pricing.js:285-359` (bs2002Call precomputes and passes shared values)

- [ ] **Step 1: Hoist GL quadrature arrays to module scope**

Move the `X` and `W` arrays from inside `_cbndCore` to module-level constants. They are identical on every call.

```js
// At module scope, above _cbndCore:
const _GL_X = [
    -0.9931285991850949, -0.9639719272779138,
    -0.9122344282513259, -0.8391169718222188,
    -0.7463319064601508, -0.6360536807265150,
    -0.5108670019508271, -0.3737060887154195,
    -0.2277858511416451, -0.0765265211334973,
     0.0765265211334973,  0.2277858511416451,
     0.3737060887154195,  0.5108670019508271,
     0.6360536807265150,  0.7463319064601508,
     0.8391169718222188,  0.9122344282513259,
     0.9639719272779138,  0.9931285991850949,
];
const _GL_W = [
    0.0176140071391521, 0.0406014298003869,
    0.0626720483341091, 0.0832767415767048,
    0.1019301198172404, 0.1181945319615184,
    0.1316886384491766, 0.1420961093183820,
    0.1491729864726037, 0.1527533871307258,
    0.1527533871307258, 0.1491729864726037,
    0.1420961093183820, 0.1316886384491766,
    0.1181945319615184, 0.1019301198172404,
    0.0832767415767048, 0.0626720483341091,
    0.0406014298003869, 0.0176140071391521,
];
```

Then in `_cbndCore`, remove the local `X` and `W` declarations and reference `_GL_X` and `_GL_W` instead:

```js
function _cbndCore(a, b, rho) {
    const aS = a * a;
    const bS = b * b;
    const limit = rho;
    let sum = 0;

    for (let i = 0; i < 20; i++) {
        const r = limit * (1 + _GL_X[i]) / 2;
        const r2 = r * r;
        const denom = Math.sqrt(Math.max(1 - r2, 1e-15));
        const exponent = (2 * r * a * b - aS - bS) / (2 * (1 - r2));
        sum += _GL_W[i] * Math.exp(exponent) / denom;
    }
    return Math.max(0, (limit / 2) * sum / (2 * Math.PI) + cnd(a) * cnd(b));
}
```

- [ ] **Step 2: Add precomputed-parameter variants of _phi and _psi**

Add `_phiPre` and `_psiPre` that accept precomputed `v2`, `sqrtT` (or `sqrtt1` for _phi calls within bs2002Call, which all pass `t1` as their time parameter). The original `_phi`/`_psi` remain unchanged for use by `computeGreeks` which calls `priceAmerican` with bumped parameters.

```js
function _phiPre(S, T, gamma, H, I, r, b, v2, sqrtT) {
    if (T <= 0) return 0;
    const sigma = Math.sqrt(v2);
    const sigSqrtT = sigma * sqrtT;
    const lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1) * v2) * T;
    const d      = -(Math.log(S / H) + (b + (gamma - 0.5) * v2) * T) / sigSqrtT;
    const kappa  = 2 * b / v2 + (2 * gamma - 1);
    const lnIS   = Math.log(I / S);
    const term2  = Math.pow(I / S, kappa) * cnd(d - 2 * lnIS / sigSqrtT);
    return Math.exp(lambda) * Math.pow(S, gamma) * (cnd(d) - term2);
}

function _psiPre(S, T, gamma, H, I2, I1, t1, r, b, v2, sqrtT, sqrtt1) {
    if (T <= 0 || t1 <= 0) return 0;

    const sigma  = Math.sqrt(v2);
    const rho    = sqrtt1 / sqrtT;

    const lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1) * v2) * T;
    const kappa  = 2 * b / v2 + (2 * gamma - 1);

    const bGammaTerm = b + (gamma - 0.5) * v2;
    const sigSqrtt1 = sigma * sqrtt1;
    const sigSqrtT  = sigma * sqrtT;

    const d1 = -(Math.log(S / H)              + bGammaTerm * t1) / sigSqrtt1;
    const d2 = -(Math.log(I2 * I2 / (S * H))  + bGammaTerm * t1) / sigSqrtt1;
    const d3 = -(Math.log(S / H)              + bGammaTerm * T)  / sigSqrtT;
    const d4 = -(Math.log(I2 * I2 / (S * H))  + bGammaTerm * T)  / sigSqrtT;

    const lnI1S  = Math.log(I1 / S);
    const lnI1S_sigSqrtT  = 2 * lnI1S / sigSqrtT;
    const lnI1S_sigSqrtt1 = 2 * lnI1S / sigSqrtt1;

    const n2_1 = cbnd(-d3, -d1,  rho);
    const n2_2 = cbnd(-d4, -d2,  rho);
    const n2_3 = cbnd(-d3 + lnI1S_sigSqrtT, -d1 + lnI1S_sigSqrtt1, rho);
    const n2_4 = cbnd(-d4 + lnI1S_sigSqrtT, -d2 + lnI1S_sigSqrtt1, rho);

    const term1 =  n2_1;
    const term2 = -Math.pow(I2 / S, kappa) * n2_2;
    const term3 = -Math.pow(I1 / S, kappa) * n2_3;
    const term4 =  Math.pow(I1 / I2, kappa) * n2_4;

    return Math.exp(lambda) * Math.pow(S, gamma) * (term1 + term2 + term3 + term4);
}
```

- [ ] **Step 3: Refactor bs2002Call to precompute shared values**

In `bs2002Call`, after `const v2 = sigma * sigma;` and the golden-ratio split `const t1 = ...`, add:

```js
const sqrtT  = Math.sqrt(T);
const sqrtt1 = Math.sqrt(t1);
```

Replace the inline `Math.sqrt(t1)` at line 327 and `Math.sqrt(T)` at line 331 with the precomputed values.

Replace all 6 `_phi(S, t1, ...)` calls with `_phiPre(S, t1, ..., v2, sqrtt1)`.
Replace all 6 `_psi(S, T, ...)` calls with `_psiPre(S, T, ..., v2, sqrtT, sqrtt1)`.

The full formula block becomes:

```js
const sqrtT  = Math.sqrt(T);
const sqrtt1 = Math.sqrt(t1);

const ht1 = -(b * t1 + 2 * sigma * sqrtt1) * B0 / (BInfinity - B0);
const I1  = B0 + (BInfinity - B0) * (1 - Math.exp(ht1));

const ht2 = -(b * T + 2 * sigma * sqrtT) * B0 / (BInfinity - B0);
const I2  = B0 + (BInfinity - B0) * (1 - Math.exp(ht2));

if (S >= I2) return S - K;

const alpha1 = (I1 - K) * Math.pow(I1, -beta);
const alpha2 = (I2 - K) * Math.pow(I2, -beta);

const price =
    alpha2 * Math.pow(S, beta)
    - alpha2 * _phiPre(S, t1, beta, I2, I2, rEff, b, v2, sqrtt1)
    + _phiPre(S, t1, 1,    I2, I2, rEff, b, v2, sqrtt1)
    - _phiPre(S, t1, 1,    I1, I2, rEff, b, v2, sqrtt1)
    - K    * _phiPre(S, t1, 0,    I2, I2, rEff, b, v2, sqrtt1)
    + K    * _phiPre(S, t1, 0,    I1, I2, rEff, b, v2, sqrtt1)
    + alpha1 * _phiPre(S, t1, beta, I1, I2, rEff, b, v2, sqrtt1)
    - alpha1 * _psiPre(S, T, beta, I1, I2, I1, t1, rEff, b, v2, sqrtT, sqrtt1)
    + _psiPre(S, T, 1,    I1, I2, I1, t1, rEff, b, v2, sqrtT, sqrtt1)
    - _psiPre(S, T, 1,    K,  I2, I1, t1, rEff, b, v2, sqrtT, sqrtt1)
    - K    * _psiPre(S, T, 0,    I1, I2, I1, t1, rEff, b, v2, sqrtT, sqrtt1)
    + K    * _psiPre(S, T, 0,    K,  I2, I1, t1, rEff, b, v2, sqrtT, sqrtt1);
```

Keep the original `_phi` and `_psi` unchanged — `computeGreeks` calls `priceAmerican` with bumped sigma/T/r values, so those still need the self-contained variants.

- [ ] **Step 4: Verify app loads without errors**

Run: `python -m http.server` from `a9lim.github.io/`, load `localhost:8000/finsim/`, open console — no errors. Click play, run a few days, open chain overlay — prices should be identical to before (pure refactors).

- [ ] **Step 5: Commit**

```
perf: hoist GL arrays and precompute shared expressions in pricing.js
```

---

## Task 2: Simulation engine caching

**Audit items:** #17 (cache _dt/_sqrtDt per reset), #18 (cache Poisson threshold), #24 (deduplicate dynamic presets)

**Files:**
- Modify: `src/simulation.js:27-54` (reset), `src/simulation.js:67-84` (beginDay), `src/simulation.js:92-138` (substep), `src/simulation.js:216-226` (_poisson)
- Modify: `src/config.js:19-27` (deduplicate presets)
- Modify: `main.js:682-685` (syncSliderToSim — recompute rho derived)

- [ ] **Step 1: Cache constant _dt and _sqrtDt in reset()**

In `reset()`, after `this.recomputeK();` and `this._spare = 0;` (end of reset, around line 53), add:

```js
this._dt = 1 / (TRADING_DAYS_PER_YEAR * INTRADAY_STEPS);
this._sqrtDt = Math.sqrt(this._dt);
this._recomputeRhoDerived();
```

Inside the `Simulation` class body, directly after the `recomputeK()` method (after line 59), add this new method:

```js
/** Recompute rho-derived cached value. Call after rho changes. */
_recomputeRhoDerived() {
    this._sqrtOneMinusRhoSq = Math.sqrt(1 - this.rho * this.rho);
}
```

- [ ] **Step 2: Simplify beginDay() to use cached values and add Poisson cache**

`beginDay()` becomes:

```js
beginDay() {
    this._poissonL = Math.exp(-this.lambda * this._dt);
    this._substepIndex = 0;

    this._partial = {
        day: this.day, open: this.S, high: this.S,
        low: this.S, close: this.S, v: this.v, r: this.r,
    };
    this.history.push(this._partial);
}
```

Remove the three lines that were computing `this._dt`, `this._sqrtDt`, `this._sqrtOneMinusRhoSq`.

- [ ] **Step 3: Add _poissonFast and use it in substep()**

Add method:
```js
_poissonFast() {
    const L = this._poissonL;
    if (L >= 1) return 0;
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
}
```

In `substep()`, change:
```js
const nJumps = this._poisson(this.lambda * dt);
```
to:
```js
const nJumps = this._poissonFast();
```

- [ ] **Step 4: Ensure rho slider changes recompute derived value**

In `main.js`, `syncSliderToSim` (line 682-685), after `sim[param] = value;`, add:

```js
if (param === 'rho') sim._recomputeRhoDerived();
```

In `src/events.js`, inside the `applyDeltas` method (line 680), after the `for` loop that applies deltas (lines 682-685: `sim[key] = Math.min(range.max, Math.max(range.min, sim[key] + delta))`), add:

```js
if (params.rho !== undefined) sim._recomputeRhoDerived();
```

The full method should look like:
```js
applyDeltas(sim, params) {
    if (!params) return;
    for (const [key, delta] of Object.entries(params)) {
        const range = PARAM_RANGES[key];
        if (!range) continue;
        sim[key] = Math.min(range.max, Math.max(range.min, sim[key] + delta));
    }
    if (params.rho !== undefined) sim._recomputeRhoDerived();
}
```

- [ ] **Step 5: Deduplicate dynamic presets in config.js**

Replace the PRESETS array:

```js
const _CALM_BULL = { name: 'Calm Bull', mu: 0.08, theta: 0.04, kappa: 3.0, xi: 0.3, rho: -0.5, lambda: 0.5, muJ: -0.02, sigmaJ: 0.03, a: 0.5, b: 0.04, sigmaR: 0.005, borrowSpread: 0.5 };

export const PRESETS = [
    _CALM_BULL,
    { name: 'Sideways', mu: 0.02, theta: 0.06, kappa: 2.0, xi: 0.4, rho: -0.6, lambda: 1.0, muJ: -0.01, sigmaJ: 0.04, a: 0.5, b: 0.03, sigmaR: 0.008, borrowSpread: 0.5 },
    { name: 'Volatile', mu: 0.05, theta: 0.12, kappa: 1.5, xi: 0.6, rho: -0.7, lambda: 3.0, muJ: -0.03, sigmaJ: 0.06, a: 0.3, b: 0.05, sigmaR: 0.012, borrowSpread: 0.5 },
    { name: 'Crisis', mu: -0.10, theta: 0.25, kappa: 0.5, xi: 0.8, rho: -0.85, lambda: 8.0, muJ: -0.08, sigmaJ: 0.10, a: 0.2, b: 0.02, sigmaR: 0.020, borrowSpread: 0.5 },
    { name: 'Rate Hike', mu: 0.04, theta: 0.08, kappa: 2.0, xi: 0.5, rho: -0.6, lambda: 1.5, muJ: -0.02, sigmaJ: 0.05, a: 0.8, b: 0.08, sigmaR: 0.015, borrowSpread: 0.5 },
    { ..._CALM_BULL, name: 'Dynamic (Offline)' },
    { ..._CALM_BULL, name: 'Dynamic (LLM)' },
];
```

- [ ] **Step 6: Commit**

```
perf: cache simulation constants per reset and deduplicate presets
```

---

## Task 3: Cache fmtDollar formatter

**Audit item:** #11

**Files:**
- Modify: `src/format-helpers.js:5-9`

- [ ] **Step 1: Replace inline toLocaleString with cached Intl.NumberFormat**

```js
const _dollarFmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function fmtDollar(v) {
    return (v < 0 ? '-$' : '$') + _dollarFmt.format(Math.abs(v));
}
```

- [ ] **Step 2: Commit**

```
perf: cache Intl.NumberFormat in fmtDollar
```

---

## Task 4: Gate expensive updateUI work on tab visibility

**Audit items:** #3 (checkMargin redundancy), #4 (aggregateGreeks unconditional), #16 (renderStrategyBuilder unconditional), #12 (strategy chain rebuilt when hidden)

**Files:**
- Modify: `main.js:303-314` (tab switch wiring — track active tab)
- Modify: `main.js:506-520` (updateUI)

- [ ] **Step 1: Track active tab in module state**

Add to the state block near line 51:

```js
let activeTab = 'trade';
```

Update the tab-switch listener (line 304-314):

```js
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab || 'trade';
        const isStrategy = activeTab === 'strategy';
        if (isStrategy !== strategyMode) {
            strategyMode = isStrategy;
            toggleStrategyView($, strategyMode);
            if (strategyMode) strategy.resize();
            dirty = true;
        }
    });
});
```

- [ ] **Step 2: Gate aggregateGreeks and strategy work in updateUI**

Replace `updateUI`:

```js
function updateUI(precomputedMargin) {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const margin = precomputedMargin || checkMargin(sim.S, vol, sim.r, sim.day);
    if (chainDirty) {
        updateChainDisplay($, chain);
        updateStockBondPrices($, sim.S, sim.r, chain);
        if (strategyMode) {
            updateStrategySelectors($, chain, sim.S, handleAddLeg);
        }
        chainDirty = false;
    }
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day, margin);
    if (activeTab === 'portfolio') {
        updateGreeksDisplay($, aggregateGreeks(sim.S, vol, sim.r, sim.day));
    }
    updateRateDisplay($, sim.r);
    if (strategyMode && strategyLegs.length > 0) {
        updateStrategyBuilder();
    }
}
```

Note: `updateTimeSliderRange()` call removed from `updateUI` — it's already called inside `updateStrategyBuilder()`.

- [ ] **Step 3: Ensure strategy selectors update when switching to strategy tab**

In the tab-switch listener, after setting `strategyMode = true`, update selectors if chain is stale:

```js
if (isStrategy) {
    updateStrategySelectors($, chain, sim.S, handleAddLeg);
    updateStockBondPrices($, sim.S, sim.r, chain);
}
```

- [ ] **Step 4: Commit**

```
perf: gate aggregateGreeks and strategy updates on tab visibility
```

---

## Task 5: Fix main.js orchestration issues

**Audit items:** #19 (screenToWorld allocation), #20 (_getMinDTE triple call), #21 (strategyLegs not cleared on reset), #25 (mousemove dirty in strategy mode), #9 (chart._lerp encapsulation)

**Files:**
- Modify: `main.js:454-460` (auto-scroll)
- Modify: `main.js:537-574` (time slider functions)
- Modify: `main.js:625-640` (_resetCore)
- Modify: `main.js:291-296` (mousemove)
- Modify: `main.js:385-393` (frame lerp check)
- Modify: `src/chart.js` (add isLerpActive method)

- [ ] **Step 1: Replace screenToWorld with scalar method in auto-scroll**

Line 455, replace:
```js
const rightEdgeWorld = camera.screenToWorld(viewW * 0.85, 0).x;
```
with:
```js
const rightEdgeWorld = camera.screenToWorldX
    ? camera.screenToWorldX(viewW * 0.85)
    : camera.screenToWorld(viewW * 0.85, 0).x;
```

- [ ] **Step 2: Deduplicate _getMinDTE calls**

Rewrite `_sliderElapsed` to accept `minDTE`:

```js
function _sliderElapsed(minDTE) {
    if (minDTE === undefined) minDTE = _getMinDTE();
    return Math.round(minDTE * (100 - sliderPct) / 100);
}
```

Rewrite `updateTimeSliderRange`:

```js
function updateTimeSliderRange() {
    const minDTE = _getMinDTE();
    if (minDTE > 0) {
        $.timeSlider.disabled = false;
    } else {
        $.timeSlider.disabled = true;
        sliderPct = 100;
        $.timeSlider.value = 100;
    }
    const elapsed = _sliderElapsed(minDTE);
    const nearestRemaining = minDTE - elapsed;
    if ($.timeSliderLabel) $.timeSliderLabel.textContent = nearestRemaining + ' DTE';
}
```

- [ ] **Step 3: Clear strategyLegs on reset**

In `_resetCore`, before `strategy.resetRange`:

```js
strategyLegs.length = 0;
sliderPct = 100;
```

- [ ] **Step 4: Guard mousemove dirty flag on strategy mode**

Line 295, change `dirty = true;` to `if (!strategyMode) dirty = true;`.
Line 300, same change for mouseleave handler.

- [ ] **Step 5: Add isLerpActive() to ChartRenderer and use it in frame()**

In `src/chart.js`, add a method to the `ChartRenderer` class:

```js
isLerpActive() {
    const L = this._lerp;
    return L.day >= 0 && (
        Math.abs(L.close - L._targetClose) > 0.001 ||
        Math.abs(L.high  - L._targetHigh)  > 0.001 ||
        Math.abs(L.low   - L._targetLow)   > 0.001
    );
}
```

In `main.js` lines 385-393, replace the direct `chart._lerp` access:
```js
if (chart.isLerpActive() && !strategyMode) dirty = true;
```

- [ ] **Step 6: Commit**

```
perf: fix orchestration waste in main.js
```

---

## Task 6: Unify _fairPrice with position-value.js and merge portfolio scans

**Audit items:** #5 (_fairPrice duplication), #6 (3 independent portfolio scans), #13 (liquidateAll O(N²))

**Files:**
- Modify: `src/position-value.js` (export unitPrice helper)
- Modify: `src/portfolio.js:17` (import unitPrice)
- Modify: `src/portfolio.js:68-88` (delete _fairPrice, use unitPrice)
- Modify: `src/portfolio.js:738-813` (merge portfolioValue + marginRequirement into checkMargin)
- Modify: `src/portfolio.js:822-828` (fix liquidateAll)

- [ ] **Step 1: Export a unitPrice helper from position-value.js**

Add before `computePositionValue`:

```js
export function unitPrice(type, S, vol, rate, day, strike, expiryDay) {
    const dte = expiryDay != null
        ? Math.max((expiryDay - day) / TRADING_DAYS_PER_YEAR, 0)
        : 0;
    switch (type) {
        case 'stock': return S;
        case 'bond':  return BOND_FACE_VALUE * Math.exp(-rate * dte);
        case 'call':
        case 'put':
            return dte > 0
                ? priceAmerican(S, strike, dte, rate, vol, type === 'put')
                : Math.max(0, type === 'call' ? S - strike : strike - S);
        default: return 0;
    }
}
```

Refactor `computePositionValue` to use it:

```js
export function computePositionValue(pos, S, vol, rate, day) {
    return pos.qty * unitPrice(pos.type, S, vol, rate, day, pos.strike, pos.expiryDay);
}
```

- [ ] **Step 2: Replace _fairPrice with unitPrice in portfolio.js**

Update the existing import on line 18 to also include `unitPrice`:
```js
import { computePositionValue, unitPrice } from './position-value.js';
```

Delete the `_fairPrice` function (lines 68-88). Replace all calls:
- `_fairPrice(type, currentPrice, currentRate, currentDay, strike, expiryDay, currentVol)` becomes `unitPrice(type, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay)` — note the parameter order difference.

- [ ] **Step 3: Merge portfolioValue and marginRequirement into checkMargin**

Replace `checkMargin` with a single-pass version:

```js
export function checkMargin(currentPrice, currentVol, currentRate, currentDay) {
    let equity = portfolio.cash;
    let required = 0;

    for (const pos of portfolio.positions) {
        equity += computePositionValue(pos, currentPrice, currentVol, currentRate, currentDay);

        if (pos.qty < 0) {
            const absQty = Math.abs(pos.qty);
            const dte = pos.expiryDay != null
                ? Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0)
                : 0;
            switch (pos.type) {
                case 'stock':
                    required += MAINTENANCE_MARGIN * currentPrice * absQty;
                    break;
                case 'bond': {
                    const bondPrice = BOND_FACE_VALUE * Math.exp(-currentRate * dte);
                    required += MAINTENANCE_MARGIN * bondPrice * absQty;
                    break;
                }
                case 'call':
                case 'put': {
                    const isPut = pos.type === 'put';
                    const optMid = priceAmerican(currentPrice, pos.strike, dte, currentRate, currentVol, isPut);
                    required += Math.max(SHORT_OPTION_MARGIN_PCT * currentPrice * absQty, optMid * absQty);
                    break;
                }
            }
        }
    }

    if (portfolio.cash < 0) {
        required += MAINTENANCE_MARGIN * Math.abs(portfolio.cash);
    }

    const triggered = required > 0 && equity < required;
    return { triggered, equity, required };
}
```

Keep `portfolioValue` and `marginRequirement` as exported functions for any other callers.

- [ ] **Step 4: Fix liquidateAll to avoid O(N²)**

```js
export function liquidateAll(currentPrice, currentVol, currentRate, currentDay) {
    while (portfolio.positions.length > 0) {
        const pos = portfolio.positions[portfolio.positions.length - 1];
        closePosition(pos.id, currentPrice, currentVol, currentRate, currentDay);
    }
}
```

- [ ] **Step 5: Commit**

```
refactor: unify pricing paths and merge portfolio scans into single pass
```

---

## Task 7: Fix processExpiry O(N²) and handleExecStrategy rollback

**Audit items:** #12 (processExpiry double scan), handleExecStrategy shallow rollback

**Files:**
- Modify: `src/portfolio.js:627-680` (processExpiry)
- Modify: `main.js:856-894` (handleExecStrategy)

- [ ] **Step 1: Fix processExpiry to avoid redundant findIndex**

Iterate in reverse so `splice` indices remain valid:

```js
export function processExpiry(expiryDay, currentPrice, currentDay) {
    const exercised = [];
    const expired   = [];

    for (let i = portfolio.positions.length - 1; i >= 0; i--) {
        const pos = portfolio.positions[i];
        if (pos.expiryDay !== expiryDay) continue;

        if (pos.type === 'bond') {
            if (pos.qty > 0) {
                portfolio.cash += BOND_FACE_VALUE * Math.abs(pos.qty);
            } else {
                const returnedMargin = pos._reservedMargin ?? _marginForShort(
                    pos.type, Math.abs(pos.qty), pos.entryPrice, 0, 0,
                    0, currentDay, pos.strike, pos.expiryDay
                );
                portfolio.cash += returnedMargin - BOND_FACE_VALUE * Math.abs(pos.qty);
            }
            if (pos.borrowCost) portfolio.closedBorrowCost += pos.borrowCost;
            portfolio.positions.splice(i, 1);
            expired.push(pos);
            continue;
        }
        if (pos.type !== 'call' && pos.type !== 'put') continue;

        const itm = pos.type === 'call'
            ? currentPrice > pos.strike
            : currentPrice < pos.strike;

        if (itm && pos.qty > 0) {
            // exerciseOption does its own findIndex + splice, so don't splice here
            const result = exerciseOption(pos.id, currentPrice, currentDay);
            exercised.push({ position: pos, result });
        } else {
            if (pos.qty < 0) {
                const returnedMargin = pos._reservedMargin ?? _marginForShort(
                    pos.type, Math.abs(pos.qty), pos.entryPrice, currentPrice, 0,
                    0, currentDay, pos.strike, pos.expiryDay
                );
                portfolio.cash += returnedMargin;
            }
            portfolio.positions.splice(i, 1);
            expired.push(pos);
        }
    }

    return { exercised, expired };
}
```

Note: The ITM+long path still calls `exerciseOption` by ID which does its own `findIndex`. This is acceptable since ITM exercises are rare and exerciseOption has additional logic. The main O(N²) from `filter` + inner `findIndex` for bonds/OTM is eliminated.

- [ ] **Step 2: Fix handleExecStrategy rollback to include all portfolio state**

In `main.js`, expand the snapshot:

```js
function handleExecStrategy() {
    if (strategyLegs.length === 0) return;
    const vol = Math.sqrt(Math.max(sim.v, 0));

    const savedCash = portfolio.cash;
    const savedPositions = portfolio.positions.map(p => ({ ...p }));
    const savedClosedBorrowCost = portfolio.closedBorrowCost;
    const savedMarginDebitCost = portfolio.marginDebitCost;

    // ... execution loop unchanged ...

    if (failed) {
        portfolio.cash = savedCash;
        portfolio.closedBorrowCost = savedClosedBorrowCost;
        portfolio.marginDebitCost = savedMarginDebitCost;
        portfolio.positions.length = 0;
        for (const p of savedPositions) portfolio.positions.push(p);
        // ... toast + haptics unchanged ...
    }
    // ... rest unchanged ...
}
```

- [ ] **Step 3: Commit**

```
fix: eliminate O(N²) in processExpiry and fix strategy rollback completeness
```

---

## Task 8: Cache theme colors in renderers and batch grid lines

**Audit items:** #9 (_colors() allocation per draw), #10 (grid lines per-line stroke), #22 (strategy grid dark mode bug)

**Files:**
- Modify: `src/strategy.js` (constructor, draw, _drawGrid, _drawZeroLine, _drawLegend)
- Modify: `src/chart.js` (constructor, draw, grid drawing)

- [ ] **Step 1: Add theme color caching to StrategyRenderer**

Add to the constructor:
```js
this._cachedTheme = null;
this._cachedColors = null;
this._cachedThemeColors = null;
```

At the top of `draw()`, replace lines 359-360:
```js
const currentTheme = document.documentElement.dataset.theme || 'light';
if (currentTheme !== this._cachedTheme) {
    this._cachedTheme = currentTheme;
    this._cachedColors = _colors();
    this._cachedThemeColors = _themeTextColors();
}
const clrs = this._cachedColors;
const themeClrs = this._cachedThemeColors;
```

- [ ] **Step 2: Fix _drawGrid to use theme-aware colors and batch strokes**

Replace `_drawGrid`:
```js
_drawGrid(ctx, plotX, plotY, plotW, plotH, xMin, xMax, yLo, yHi, xToPixel, pnlToPixel) {
    const isDark = (this._cachedTheme || document.documentElement.dataset.theme) === 'dark';
    const muted = isDark ? _PALETTE.dark.textMuted : _PALETTE.light.textMuted;
    ctx.save();
    ctx.strokeStyle = _r(muted, 0.15);
    ctx.lineWidth   = 1;
    ctx.beginPath();
    const yStep = (yHi - yLo) / 5;
    for (let i = 0; i <= 5; i++) {
        const y = pnlToPixel(yLo + i * yStep);
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
    }
    const xStep = (xMax - xMin) / 5;
    for (let i = 0; i <= 5; i++) {
        const x = xToPixel(xMin + i * xStep);
        ctx.moveTo(x, plotY);
        ctx.lineTo(x, plotY + plotH);
    }
    ctx.stroke();
    ctx.restore();
}
```

- [ ] **Step 3: Fix _drawZeroLine and _drawLegend dark mode**

`_drawZeroLine`:
```js
_drawZeroLine(ctx, plotX, plotW, pnlToPixel) {
    const isDark = (this._cachedTheme || document.documentElement.dataset.theme) === 'dark';
    const muted = isDark ? _PALETTE.dark.textMuted : _PALETTE.light.textMuted;
    const y0 = pnlToPixel(0);
    ctx.save();
    ctx.strokeStyle = _r(muted, 0.6);
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(plotX, y0);
    ctx.lineTo(plotX + plotW, y0);
    ctx.stroke();
    ctx.restore();
}
```

In `_drawLegend`, line 844 replace:
```js
ctx.strokeStyle = _r(_PALETTE.light.textMuted, isDark ? 0.3 : 0.4);
```
with:
```js
ctx.strokeStyle = _r(isDark ? _PALETTE.dark.textMuted : _PALETTE.light.textMuted, isDark ? 0.3 : 0.4);
```

- [ ] **Step 4: Batch grid lines in chart.js**

In `chart.js`, replace the grid drawing section (lines 303-330). Move `ctx.beginPath()` before the horizontal grid loop, remove per-line `beginPath()`/`stroke()`, add single `ctx.stroke()` after both loops:

```js
ctx.strokeStyle = gridColor;
ctx.lineWidth   = 1;
ctx.beginPath();

for (let p = priceStart; p <= priceHi + priceInterval * 0.01; p += priceInterval) {
    const py = Math.round(priceToY(p)) + 0.5;
    if (py < plotY || py > plotY + plotH) continue;
    ctx.moveTo(plotX, py);
    ctx.lineTo(plotX + plotW, py);
}

if (cam) {
    for (let d = dayStart; d <= lastDay + dayInterval; d += dayInterval) {
        const sx = Math.round(cam.worldToScreenX ? cam.worldToScreenX(d) : cam.worldToScreen(d, 0).x) + 0.5;
        if (sx < plotX || sx > plotX + plotW) continue;
        ctx.moveTo(sx, plotY);
        ctx.lineTo(sx, plotY + plotH);
    }
}
ctx.stroke();
```

- [ ] **Step 5: Cache theme colors in ChartRenderer**

Add to constructor:
```js
this._cachedTheme = null;
this._isDark = false;
this._gridColor = '';
this._textMuted = '';
this._textSec = '';
```

At top of `draw()`, replace lines 179-183:
```js
const currentTheme = document.documentElement.dataset.theme || 'light';
if (currentTheme !== this._cachedTheme) {
    this._cachedTheme = currentTheme;
    this._isDark = currentTheme === 'dark';
    const p = _PALETTE;
    this._textMuted = this._isDark ? p.dark.textMuted : p.light.textMuted;
    this._textSec   = this._isDark ? p.dark.textSecondary : p.light.textSecondary;
    this._gridColor = this._isDark ? _r(p.dark.text, 0.06) : _r(p.light.text, 0.06);
}
const isDark = this._isDark;
const textMuted = this._textMuted;
const textSec = this._textSec;
```

Replace line 299-301 `gridColor` computation with `const gridColor = this._gridColor;`.

- [ ] **Step 6: Commit**

```
perf: cache theme colors and batch canvas grid line drawing
```

---

## Task 9: Event engine and portfolio micro-optimizations

**Audit items:** #26 (pre-separate FED/NON_FED events), dead Math.random key, Poisson guard, double _marginForShort, querySelector per position

**Files:**
- Modify: `src/events.js` (pre-split events, fix ungrouped key, add Poisson guard)
- Modify: `src/portfolio.js:335-366` (deduplicate _marginForShort)
- Modify: `src/portfolio-renderer.js:120-165` (row map cache)

- [ ] **Step 1: Pre-separate FED and NON_FED events at module load**

After the `OFFLINE_EVENTS` array definition in `events.js`, add:

```js
const _FED_EVENTS = OFFLINE_EVENTS.filter(e => e.category === 'fed');
const _NON_FED_EVENTS = OFFLINE_EVENTS.filter(e => e.category !== 'fed');
```

In `_drawFed`, replace `OFFLINE_EVENTS.filter(e => e.category === 'fed' && ...)` with `_FED_EVENTS.filter(e => ...)` (remove the category check since they're pre-filtered).

In `_drawOffline`, replace `OFFLINE_EVENTS.filter(e => e.category !== 'fed' && ...)` with `_NON_FED_EVENTS.filter(e => ...)`.

- [ ] **Step 2: Fix dead Math.random key in _checkFollowups**

Line 744, replace:
```js
const key = pf.chainId || ('_ungrouped_' + Math.random());
```
with:
```js
const key = pf.chainId || '_ungrouped';
```

**Note:** This is a minor behavior change. Previously, ungrouped followups (without `chainId`) each got unique keys, so all would fire independently. Now they are grouped under one key, making them mutually exclusive (one fires per day). In practice, `chainId` is always set by `_fireEvent` at scheduling time, so this branch is dead code — but if it ever fires, the new behavior (mutual exclusion) is the correct design intent per the chain-grouping logic.

- [ ] **Step 3: Add Poisson overflow guard**

In `_poissonSample` (line 822-828):

```js
_poissonSample(mean) {
    if (mean <= 0) return 0;
    if (mean > 500) return Math.round(mean);
    const L = Math.exp(-mean);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
}
```

- [ ] **Step 4: Deduplicate _marginForShort for new short positions**

Find the new-short-position creation block in `executeMarketOrder` (around line 335). The margin is computed at line 337 for the cash check. Store this value and reuse it when setting `_reservedMargin` on the new position object instead of calling `_marginForShort` a second time.

Look for the pattern:
```js
const margin = _marginForShort(...);
if (portfolio.cash + proceeds < margin) return null;
```
Then later:
```js
position._reservedMargin = _marginForShort(...); // same args — redundant
```
Replace with:
```js
position._reservedMargin = margin;
```

- [ ] **Step 5: Add row map cache in portfolio-renderer.js**

In `_diffPositionRows`, at the start of the function, build a map:

```js
if (!container._rowMap) container._rowMap = new Map();
const rowMap = container._rowMap;
```

Replace `container.querySelector('[data-pos-id="' + posId + '"]')` with `rowMap.get(String(posId))`.

When adding new rows: `rowMap.set(String(pos.id), row)`.
When removing rows: `rowMap.delete(posId)`.

- [ ] **Step 6: Commit**

```
perf: event engine pre-splitting, portfolio micro-optimizations
```

---

## Task 10: CSS cleanup and minor fixes

**Audit items:** #27 (duplicate .pos-row/.order-row CSS), redundant dirty=true after _repositionCamera

**Files:**
- Modify: `styles.css` (extract shared .data-row)
- Modify: `src/portfolio-renderer.js` (add data-row class to rows)
- Modify: `main.js:661,675` (remove redundant dirty=true)

- [ ] **Step 1: Extract shared .data-row CSS class**

In `styles.css`, add before `.pos-row`:

```css
.data-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    margin-bottom: 3px;
    font-size: 0.75rem;
    transition: background 0.12s;
}
.data-row:hover {
    background: var(--bg-hover);
}
```

Remove the duplicated declarations from `.pos-row` and `.order-row` rules — keep only overrides specific to each. Remove `.pos-row:hover` and `.order-row:hover` if they are identical to `.data-row:hover`.

- [ ] **Step 2: Add data-row class to rendered rows**

In `portfolio-renderer.js`, where position rows are created (find `className` assignments or `classList.add('pos-row')`), change to include `data-row`:
- Position rows: `row.className = 'data-row pos-row'`
- Order rows: `row.className = 'data-row order-row'`

- [ ] **Step 3: Remove redundant dirty=true after _repositionCamera (conditional)**

In `main.js` `loadPreset` (line 661) and `resetSim` (line 675): first verify that `_repositionCamera()` triggers `camera.onUpdate` by checking whether `shared-camera.js` uses a setter for `camera.x`. If `camera.x` assignment triggers `onUpdate` (e.g., via a Proxy or setter), remove the explicit `dirty = true;`. If `camera.x` is a plain property, keep `dirty = true;` — it is needed.

To check: read `/shared-camera.js` in `a9lim.github.io/` and search for `set x(` or `Proxy`. If in doubt, keep the explicit `dirty = true;` — it's one redundant boolean assignment and completely safe.

- [ ] **Step 4: Commit**

```
refactor: extract shared .data-row CSS class and remove redundant dirty flags
```

---

## Final Verification

After all 10 tasks:

- [ ] Serve from `a9lim.github.io/` and load `/finsim/`
- [ ] No console errors on load
- [ ] Play simulation at 4x speed for 30+ days — candles render smoothly
- [ ] Open chain overlay — prices display correctly
- [ ] Execute a multi-leg strategy — legs fill, rollback works on failure
- [ ] Switch presets including Dynamic modes — reset clears strategy legs
- [ ] Toggle dark mode — strategy grid, zero line, and legend render with correct theme colors
- [ ] Portfolio tab Greeks display correctly
- [ ] Reset simulation — no stale state
