# Strategy Save/Load Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework strategy persistence to use localStorage with hash-based IDs, relative strikes/expiries, built-in presets, and a trade-tab execution dropdown with live credit/debit.

**Architecture:** New `strategy-store.js` module owns all CRUD, built-in definitions, leg resolution, and net cost computation. `main.js` orchestrates handlers and wires UI. `ui.js` caches new DOM elements and manages dropdown/button state. `portfolio.js` loses its strategy storage. `index.html` gains name input, load dropdown, delete button in strategy tab, and saved strategies section in trade tab.

**Tech Stack:** Vanilla JS ES6 modules, localStorage, crypto.getRandomValues

**Spec:** `docs/superpowers/specs/2026-03-21-strategy-save-load-rework-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/strategy-store.js` | Create | Built-in definitions, localStorage CRUD, `resolveLegs`, `formatLeg`, `computeNetCost` |
| `index.html` | Modify | Strategy tab: name input + load select + 4 buttons. Trade tab: saved strategies section |
| `src/portfolio.js` | Modify | Remove `portfolio.strategies`, `saveStrategy()`, `executeStrategy()` |
| `src/ui.js` | Modify | Cache new DOM elements, bind events, `updateStrategyDropdowns`, `updateCreditDebit` |
| `main.js` | Modify | Import strategy-store, new handlers, `executeWithRollback`, credit/debit hook in substep |
| `styles.css` | Modify | `.sim-input` styling, credit/debit row |

---

### Task 1: Create `src/strategy-store.js`

**Files:**
- Create: `src/strategy-store.js`

This is the core module. All strategy persistence, built-in definitions, resolution, formatting, and net cost computation.

- [ ] **Step 1: Write built-in definitions and localStorage helpers**

```js
// src/strategy-store.js
import { computeBidAsk, computeOptionBidAsk } from './portfolio.js';
import { priceWithTree, allocTree, prepareTree, vasicekBondPrice } from './pricing.js';
import { market } from './market.js';
import { BOND_FACE_VALUE } from './config.js';

const LS_KEY = 'shoals_strategies';
const MAX_STRATEGIES = 50;
const MAX_NAME_LEN = 40;

// --- Built-in strategies (never in localStorage) ---
const BUILTINS = [
    {
        id: 'builtin_covered_call', name: 'Covered Call', builtin: true,
        legs: [
            { type: 'stock', qty: 1, strikeOffset: null, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: 0 },
        ],
    },
    {
        id: 'builtin_protective_put', name: 'Protective Put', builtin: true,
        legs: [
            { type: 'stock', qty: 1, strikeOffset: null, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: 0 },
        ],
    },
    {
        id: 'builtin_bull_call_spread', name: 'Bull Call Spread', builtin: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: 0 },
            { type: 'call', qty: -1, strikeOffset: 10, dteOffset: 0 },
        ],
    },
    {
        id: 'builtin_bear_put_spread', name: 'Bear Put Spread', builtin: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: 0 },
            { type: 'put', qty: -1, strikeOffset: -10, dteOffset: 0 },
        ],
    },
    {
        id: 'builtin_long_straddle', name: 'Long Straddle', builtin: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: 0 },
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: 0 },
        ],
    },
    {
        id: 'builtin_long_strangle', name: 'Long Strangle', builtin: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 5, dteOffset: 0 },
            { type: 'put', qty: 1, strikeOffset: -5, dteOffset: 0 },
        ],
    },
    {
        id: 'builtin_iron_condor', name: 'Iron Condor', builtin: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: -15, dteOffset: 0 },
            { type: 'put', qty: -1, strikeOffset: -10, dteOffset: 0 },
            { type: 'call', qty: -1, strikeOffset: 10, dteOffset: 0 },
            { type: 'call', qty: 1, strikeOffset: 15, dteOffset: 0 },
        ],
    },
    {
        id: 'builtin_iron_butterfly', name: 'Iron Butterfly', builtin: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: -10, dteOffset: 0 },
            { type: 'put', qty: -1, strikeOffset: 0, dteOffset: 0 },
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: 0 },
            { type: 'call', qty: 1, strikeOffset: 10, dteOffset: 0 },
        ],
    },
];

function generateId() {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

function _readStore() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch { return {}; }
}

function _writeStore(obj) {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
}
```

- [ ] **Step 2: Write CRUD exports**

Add to the same file, after the helpers:

```js
export function listStrategies() {
    const store = _readStore();
    const user = Object.entries(store).map(([id, v]) => ({
        id, name: v.name, legs: v.legs, builtin: false,
    }));
    return [...BUILTINS, ...user];
}

export function getStrategy(id) {
    const builtin = BUILTINS.find(b => b.id === id);
    if (builtin) return builtin;
    const store = _readStore();
    const entry = store[id];
    return entry ? { id, name: entry.name, legs: entry.legs, builtin: false } : null;
}

export function saveStrategy(id, name, legs) {
    const store = _readStore();
    const trimmed = (name || '').slice(0, MAX_NAME_LEN).trim();
    const finalName = trimmed || _autoName(store);

    if (id && store[id]) {
        store[id] = { name: finalName, legs };
        _writeStore(store);
        return id;
    }
    // New strategy — check cap
    if (Object.keys(store).length >= MAX_STRATEGIES) return null;
    const newId = generateId();
    store[newId] = { name: finalName, legs };
    _writeStore(store);
    return newId;
}

function _autoName(store) {
    const existing = new Set(Object.values(store).map(s => s.name));
    for (let i = 1; ; i++) {
        const candidate = 'Strategy ' + i;
        if (!existing.has(candidate)) return candidate;
    }
}

export function deleteStrategy(id) {
    if (BUILTINS.some(b => b.id === id)) return;
    const store = _readStore();
    delete store[id];
    _writeStore(store);
}
```

- [ ] **Step 3: Write `resolveLegs` and `formatLeg`**

Add to the same file:

```js
export function resolveLegs(legs, S, day, expiries) {
    return legs.map(leg => {
        if (leg.type === 'stock' || leg.type === 'bond') {
            return { type: leg.type, qty: leg.qty, strike: null, expiryDay: null };
        }
        const strike = Math.round((S + leg.strikeOffset) / 5) * 5;
        const targetDay = day + leg.dteOffset;
        let bestExpiry = expiries[0];
        for (let i = 1; i < expiries.length; i++) {
            if (Math.abs(expiries[i].day - targetDay) < Math.abs(bestExpiry.day - targetDay)) {
                bestExpiry = expiries[i];
            }
        }
        return { type: leg.type, qty: leg.qty, strike, expiryDay: bestExpiry ? bestExpiry.day : day + 63 };
    });
}

export function formatLeg(leg) {
    const side = leg.qty > 0 ? 'Long' : 'Short';
    const typeStr = leg.type.toUpperCase();
    if (leg.type === 'stock' || leg.type === 'bond') return side + ' ' + typeStr;
    const offset = leg.strikeOffset || 0;
    const strikeStr = offset === 0 ? 'ATM' : offset > 0 ? 'ATM+' + offset : 'ATM' + offset;
    const dteStr = (leg.dteOffset != null ? leg.dteOffset : 0) + 'd';
    return side + ' ' + typeStr + ' ' + strikeStr + ' ' + dteStr;
}
```

- [ ] **Step 4: Write `computeNetCost` and `legsToRelative`**

Add to the same file:

```js
let _costTree = null; // reuse tree to avoid GC pressure (called every substep)

export function computeNetCost(legs, S, vol, r, day, q, expiries) {
    const resolved = resolveLegs(legs, S, day, expiries);
    let net = 0;
    if (!_costTree) _costTree = allocTree();
    for (let i = 0; i < resolved.length; i++) {
        const leg = resolved[i];
        const absQty = Math.abs(leg.qty);
        const isLong = leg.qty > 0;
        let mid, ba;
        if (leg.type === 'stock') {
            mid = S;
            ba = computeBidAsk(mid, S, vol);
        } else if (leg.type === 'bond') {
            mid = vasicekBondPrice(BOND_FACE_VALUE, r, 1, market.a, market.b, market.sigmaR);
            ba = computeBidAsk(mid, S, vol);
        } else {
            const T = Math.max((leg.expiryDay - day) / 252, 1/252);
            prepareTree(T, r, vol, q, day, _costTree);
            const isPut = leg.type === 'put';
            const result = priceWithTree(S, leg.strike, isPut, _costTree);
            mid = result.price;
            ba = computeOptionBidAsk(mid, S, leg.strike, vol);
        }
        const fill = isLong ? ba.ask : ba.bid;
        net += (isLong ? fill : -fill) * absQty;
    }
    return net; // positive = debit, negative = credit
}

export function legsToRelative(absLegs, S, day) {
    return absLegs.map(leg => {
        if (leg.type === 'stock' || leg.type === 'bond') {
            return { type: leg.type, qty: leg.qty, strikeOffset: null, dteOffset: null };
        }
        const strikeOffset = (leg.strike != null ? leg.strike : Math.round(S / 5) * 5) - Math.round(S / 5) * 5;
        const dteOffset = Math.max(1, (leg.expiryDay != null ? leg.expiryDay : day) - day);
        return { type: leg.type, qty: leg.qty, strikeOffset, dteOffset };
    });
}
```

- [ ] **Step 5: Commit strategy-store module**

```bash
git add src/strategy-store.js
git commit -m "feat: add strategy-store module with localStorage CRUD, built-ins, and resolution"
```

---

### Task 2: Update HTML — Strategy Tab and Trade Tab

**Files:**
- Modify: `index.html:258-259` (trade tab — after full-chain button)
- Modify: `index.html:363-371` (strategy tab — replace hint + buttons)

- [ ] **Step 1: Add saved strategies section to trade tab**

In `index.html`, after the `full-chain-link` button (line 258) and before the `panel-hint trade-hint` paragraph (line 259), insert:

Replace lines 258-259:
```html
                        <button id="full-chain-link" class="ghost-btn chain-expand-btn">View Full Chain</button>
                        <p class="panel-hint trade-hint">Left-click: buy &middot; Right-click: sell/short &middot; Hover: bid/ask <button class="info-trigger" type="button" data-info="bidask" aria-label="Info: Bid-Ask Spreads">?</button></p>
```

With:
```html
                        <button id="full-chain-link" class="ghost-btn chain-expand-btn">View Full Chain</button>
                        <div class="stat-group saved-strategies-section" id="saved-strategies-section">
                            <div class="group-label">Saved Strategies</div>
                            <select id="trade-strategy-select" class="sim-select" aria-label="Saved strategy">
                                <option value="">Select a strategy&hellip;</option>
                            </select>
                            <div class="stat-row" id="strategy-credit-debit" style="display:none">
                                <span class="stat-label">Net Cost</span>
                                <span class="stat-value" id="strategy-net-cost">&mdash;</span>
                            </div>
                            <button id="trade-exec-strategy-btn" class="ghost-btn trade-btn up" disabled>Execute Strategy</button>
                        </div>
                        <p class="panel-hint trade-hint">Left-click: buy &middot; Right-click: sell/short &middot; Hover: bid/ask <button class="info-trigger" type="button" data-info="bidask" aria-label="Info: Bid-Ask Spreads">?</button></p>
```

- [ ] **Step 2: Rework strategy tab controls**

Replace lines 363-371 (from the panel-hint through the button row):

Old:
```html
                        <p class="panel-hint trade-hint">Left-click: long &middot; Right-click: short &middot; Payoff <button class="info-trigger" type="button" data-info="payoff" aria-label="Info: Payoff Diagrams">?</button></p>
                        <div id="strategy-legs-list" class="strategy-legs-list">
                            <p class="panel-hint">No legs added. Click buttons above to build a strategy.</p>
                        </div>
                        <div id="strategy-summary" class="strategy-summary"></div>
                        <div class="quick-trade-row" style="margin-top:6px">
                            <button id="save-strategy-btn" class="ghost-btn trade-btn bond" disabled>Save</button>
                            <button id="exec-strategy-btn" class="ghost-btn trade-btn up" disabled>Execute</button>
                        </div>
```

New:
```html
                        <p class="panel-hint trade-hint">Left-click: long &middot; Right-click: short &middot; Strategies save relative strikes &amp; expiries. Payoff <button class="info-trigger" type="button" data-info="payoff" aria-label="Info: Payoff Diagrams">?</button></p>
                        <div class="control-group">
                            <label for="strategy-name">Name</label>
                            <input type="text" id="strategy-name" class="sim-input" placeholder="Strategy 1" maxlength="40">
                        </div>
                        <div class="control-group">
                            <label for="strategy-load-select">Load Strategy</label>
                            <select id="strategy-load-select" class="sim-select" aria-label="Load saved strategy">
                                <option value="">Select a strategy&hellip;</option>
                            </select>
                        </div>
                        <div id="strategy-legs-list" class="strategy-legs-list">
                            <p class="panel-hint">No legs added. Click buttons above to build a strategy.</p>
                        </div>
                        <div id="strategy-summary" class="strategy-summary"></div>
                        <div class="quick-trade-row" style="margin-top:6px">
                            <button id="save-strategy-btn" class="ghost-btn trade-btn bond" disabled>Save</button>
                            <button id="load-strategy-btn" class="ghost-btn trade-btn" disabled>Load</button>
                            <button id="delete-strategy-btn" class="ghost-btn trade-btn down" disabled>Delete</button>
                            <button id="exec-strategy-btn" class="ghost-btn trade-btn up" disabled>Execute</button>
                        </div>
```

- [ ] **Step 3: Commit HTML changes**

```bash
git add index.html
git commit -m "feat: add strategy name input, load/delete buttons, and trade-tab saved strategies section"
```

---

### Task 3: Add CSS for new elements

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add `.sim-input` and saved-strategies styling**

Add at end of `styles.css`:

```css
/* Strategy name input */
.sim-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 0.82rem;
    outline: none;
    transition: border-color 0.15s;
}
.sim-input:focus {
    border-color: var(--accent);
}
.sim-input::placeholder {
    color: var(--text-muted);
}

/* Saved strategies section in trade tab */
.saved-strategies-section {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
}

/* Credit/debit coloring */
#strategy-net-cost.pnl-up { color: var(--c-up); }
#strategy-net-cost.pnl-down { color: var(--c-down); }
```

- [ ] **Step 2: Commit CSS**

```bash
git add styles.css
git commit -m "feat: add sim-input and saved-strategies CSS"
```

---

### Task 4: Remove strategy storage from `portfolio.js`

**Files:**
- Modify: `src/portfolio.js:28-43` (remove `strategies` from portfolio object)
- Modify: `src/portfolio.js:63` (remove `portfolio.strategies = []` from reset)
- Modify: `src/portfolio.js:791-835` (remove `saveStrategy` and `executeStrategy` functions)

- [ ] **Step 1: Remove `strategies` from portfolio object**

In `src/portfolio.js` line 34, delete `strategies:[],  // { name, legs: [{ type, side, qty, strike?, expiryDay? }] }`.

- [ ] **Step 2: Remove `portfolio.strategies = []` from `resetPortfolio`**

In `src/portfolio.js` line 63, delete `portfolio.strategies     = [];`.

- [ ] **Step 3: Remove `saveStrategy` and `executeStrategy` functions**

Delete lines 791-835 (the `saveStrategy` and `executeStrategy` functions and their section comments/jsdoc).

- [ ] **Step 4: Remove old imports from `main.js` at the same time**

In `main.js` line 16, remove `saveStrategy, executeStrategy` from the portfolio import to avoid a broken import state:

Old:
```js
    saveStrategy, executeStrategy, computeBidAsk,
```

New:
```js
    computeBidAsk,
```

- [ ] **Step 5: Commit portfolio cleanup**

```bash
git add src/portfolio.js main.js
git commit -m "refactor: remove strategy storage from portfolio module"
```

---

### Task 5: Update `ui.js` — DOM caching, events, dropdowns

**Files:**
- Modify: `src/ui.js:103-106` (add new DOM element caching)
- Modify: `src/ui.js:274-279` (update event bindings)
- Modify: `src/ui.js:684-687` (update button enable/disable logic)
- Modify: `src/ui.js:690-739` (update `_buildLegRow` to use relative display)

- [ ] **Step 1: Cache new DOM elements**

In `src/ui.js`, after line 106 (`$.execStrategyBtn`), add:

```js
    $.loadStrategyBtn    = document.getElementById('load-strategy-btn');
    $.deleteStrategyBtn  = document.getElementById('delete-strategy-btn');
    $.strategyNameInput  = document.getElementById('strategy-name');
    $.strategyLoadSelect = document.getElementById('strategy-load-select');
    $.tradeStrategySelect = document.getElementById('trade-strategy-select');
    $.tradeExecStrategyBtn = document.getElementById('trade-exec-strategy-btn');
    $.strategyCreditDebit = document.getElementById('strategy-credit-debit');
    $.strategyNetCost    = document.getElementById('strategy-net-cost');
```

- [ ] **Step 2: Bind new event handlers**

In `src/ui.js`, after the existing save/exec bindings (lines 274-279), add bindings for load, delete, trade-tab execute, and dropdown changes:

```js
    if ($.loadStrategyBtn && typeof handlers.onLoadStrategy === 'function') {
        $.loadStrategyBtn.addEventListener('click', handlers.onLoadStrategy);
    }
    if ($.deleteStrategyBtn && typeof handlers.onDeleteStrategy === 'function') {
        $.deleteStrategyBtn.addEventListener('click', handlers.onDeleteStrategy);
    }
    if ($.tradeExecStrategyBtn && typeof handlers.onTradeExecStrategy === 'function') {
        $.tradeExecStrategyBtn.addEventListener('click', handlers.onTradeExecStrategy);
    }
    if ($.strategyLoadSelect && typeof handlers.onStrategySelectChange === 'function') {
        $.strategyLoadSelect.addEventListener('change', () => {
            handlers.onStrategySelectChange($.strategyLoadSelect.value);
        });
    }
    if ($.tradeStrategySelect && typeof handlers.onTradeStrategySelectChange === 'function') {
        $.tradeStrategySelect.addEventListener('change', () => {
            handlers.onTradeStrategySelectChange($.tradeStrategySelect.value);
        });
    }
```

- [ ] **Step 3: Add `updateStrategyDropdowns` export**

Add a new exported function that uses safe DOM methods (no innerHTML):

```js
export function updateStrategyDropdowns($, strategies) {
    const selects = [$.strategyLoadSelect, $.tradeStrategySelect];
    for (const sel of selects) {
        if (!sel) continue;
        const prev = sel.value;
        // Clear all options safely
        while (sel.options.length > 0) sel.remove(0);
        // Add default option
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = 'Select a strategy\u2026';
        sel.appendChild(defOpt);
        // Add strategy options
        for (const s of strategies) {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name + (s.builtin ? ' (built-in)' : '');
            sel.appendChild(opt);
        }
        // Restore previous selection if still valid
        if (prev && Array.from(sel.options).some(o => o.value === prev)) {
            sel.value = prev;
        }
    }
}
```

- [ ] **Step 4: Add `updateCreditDebit` export**

```js
export function updateCreditDebit($, netCost) {
    if (!$.strategyCreditDebit || !$.strategyNetCost) return;
    if (netCost == null || !isFinite(netCost)) {
        $.strategyCreditDebit.style.display = 'none';
        return;
    }
    $.strategyCreditDebit.style.display = '';
    const isCredit = netCost < 0;
    const label = isCredit ? 'Net Credit' : 'Net Debit';
    const value = '$' + Math.abs(netCost).toFixed(2);
    $.strategyCreditDebit.querySelector('.stat-label').textContent = label;
    $.strategyNetCost.textContent = value;
    $.strategyNetCost.className = 'stat-value ' + (isCredit ? 'pnl-up' : 'pnl-down');
}
```

- [ ] **Step 5: Update button state logic in `renderStrategyBuilder`**

In the `renderStrategyBuilder` function (around line 684-687), update the button enable/disable logic.

Update the function signature to accept `currentStrategyHash` as a new parameter:

Old:
```js
    const hasLegs = legs && legs.length > 0;
    if ($.saveStrategyBtn) $.saveStrategyBtn.disabled = !hasLegs;
    if ($.execStrategyBtn) $.execStrategyBtn.disabled = !hasLegs;
```

New:
```js
    const hasLegs = legs && legs.length > 0;
    if ($.saveStrategyBtn) $.saveStrategyBtn.disabled = !hasLegs;
    if ($.execStrategyBtn) $.execStrategyBtn.disabled = !hasLegs;
    if ($.loadStrategyBtn) $.loadStrategyBtn.disabled = !($.strategyLoadSelect && $.strategyLoadSelect.value);
    if ($.deleteStrategyBtn) $.deleteStrategyBtn.disabled = !currentStrategyHash;
```

Note: `currentStrategyHash` needs to be passed into `renderStrategyBuilder`. Add it as an additional parameter.

- [ ] **Step 6: Update `_buildLegRow` to show relative format**

Update the label building in `_buildLegRow` (line 694-704). The `leg` objects passed here are the in-memory `strategyLegs` with absolute strike/expiryDay. Convert to relative display using `_refS` and `_refDay` transient fields:

Old:
```js
    const isShort = leg.qty < 0;
    const sideStr = isShort ? 'Short' : 'Long';
    let desc = sideStr + ' ' + leg.type.toUpperCase();
    if (leg.strike != null) desc += ' K' + leg.strike;
    if (leg.expiryDay != null) {
        const expiry = skeleton ? skeleton.find(e => e.day === leg.expiryDay) : null;
        if (expiry) desc += ' ' + expiry.dte + 'd';
    }
```

New:
```js
    const isShort = leg.qty < 0;
    const sideStr = isShort ? 'Short' : 'Long';
    let desc = sideStr + ' ' + leg.type.toUpperCase();
    if (leg.strike != null) {
        const atm = Math.round((leg._refS || 100) / 5) * 5;
        const offset = leg.strike - atm;
        desc += ' ' + (offset === 0 ? 'ATM' : offset > 0 ? 'ATM+' + offset : 'ATM' + offset);
    }
    if (leg.expiryDay != null) {
        const refDay = leg._refDay || 0;
        desc += ' ' + Math.max(1, leg.expiryDay - refDay) + 'd';
    }
```

This requires `strategyLegs` entries to carry `_refS` (current stock price at leg creation) and `_refDay` (current day at leg creation) for display purposes. These are transient fields set in `handleAddLeg` in main.js (Task 6).

- [ ] **Step 7: Commit ui.js changes**

```bash
git add src/ui.js
git commit -m "feat: add strategy dropdown management, credit/debit display, and relative leg labels in ui.js"
```

---

### Task 6: Update `main.js` — handlers and wiring

**Files:**
- Modify: `main.js:16` (update imports from portfolio.js)
- Modify: `main.js:30+` (add strategy-store import)
- Modify: `main.js:57` (add `currentStrategyHash`)
- Modify: `main.js:243-246` (add new handler entries)
- Modify: `main.js:678-706` (add credit/debit update in `updateSubstepUI`)
- Modify: `main.js:835-850` (refresh dropdowns on reset)
- Modify: `main.js:1014-1050` (update `handleAddLeg` to add `_refS`/`_refDay`)
- Modify: `main.js:1064-1124` (rewrite save/exec handlers, add load/delete/trade-exec)

- [ ] **Step 1: Add strategy-store import**

The `saveStrategy, executeStrategy` removal from the portfolio import was done in Task 4. Now add the strategy-store import after line 30 (or wherever the last import is):

```js
import {
    listStrategies, getStrategy, saveStrategy, deleteStrategy,
    resolveLegs, computeNetCost, legsToRelative,
} from './src/strategy-store.js';
```

Also add `updateStrategyDropdowns, updateCreditDebit` to the ui.js import.

- [ ] **Step 2: Add `currentStrategyHash` state variable**

After `let strategyLegs = [];` (line 57), add:

```js
let currentStrategyHash = null;
```

- [ ] **Step 3: Add new handler entries in `bindEvents` call**

In the handlers object (around lines 243-246), add:

```js
        onLoadStrategy:    () => handleLoadStrategy(),
        onDeleteStrategy:  () => handleDeleteStrategy(),
        onTradeExecStrategy: () => handleTradeExecStrategy(),
        onStrategySelectChange: (id) => {
            if ($.loadStrategyBtn) $.loadStrategyBtn.disabled = !id;
        },
        onTradeStrategySelectChange: (id) => {
            if ($.tradeExecStrategyBtn) $.tradeExecStrategyBtn.disabled = !id;
            if (id) {
                _updateTradeCreditDebit();
            } else {
                updateCreditDebit($, null);
            }
        },
```

- [ ] **Step 4: Update `handleAddLeg` to add reference fields**

In `handleAddLeg` (line 1039), when creating a new leg, add `_refS` and `_refDay`:

Old:
```js
        const leg = { type, qty: signedQty, strike, expiryDay };
```

New:
```js
        const leg = { type, qty: signedQty, strike, expiryDay, _refS: sim.S, _refDay: sim.day };
```

- [ ] **Step 5: Rewrite `handleSaveStrategy`**

Replace the existing `handleSaveStrategy` (lines 1064-1077):

```js
function handleSaveStrategy() {
    if (strategyLegs.length === 0) return;
    const name = $.strategyNameInput ? $.strategyNameInput.value : '';
    const relLegs = legsToRelative(strategyLegs, sim.S, sim.day);
    const id = saveStrategy(currentStrategyHash, name, relLegs);
    if (id === null) {
        if (typeof showToast !== 'undefined') showToast('Strategy limit reached (max 50).');
        if (typeof _haptics !== 'undefined') _haptics.trigger('error');
        return;
    }
    currentStrategyHash = id;
    _refreshStrategyDropdowns();
    if (typeof showToast !== 'undefined') {
        const saved = getStrategy(id);
        showToast('Strategy "' + (saved ? saved.name : '') + '" saved.');
    }
    if (typeof _haptics !== 'undefined') _haptics.trigger('success');
    updateStrategyBuilder();
}
```

- [ ] **Step 6: Add `handleLoadStrategy`**

```js
function handleLoadStrategy() {
    const id = $.strategyLoadSelect ? $.strategyLoadSelect.value : '';
    if (!id) return;
    const strat = getStrategy(id);
    if (!strat) return;

    // Resolve relative legs to absolute for the builder
    // expiryMgr.update() is idempotent when called with the same day
    const expiries = expiryMgr.update(sim.day);
    const resolved = resolveLegs(strat.legs, sim.S, sim.day, expiries);

    // Populate strategyLegs with resolved absolute legs + reference fields
    strategyLegs.length = 0;
    for (const leg of resolved) {
        strategyLegs.push({
            type: leg.type,
            qty: leg.qty,
            strike: leg.strike,
            expiryDay: leg.expiryDay,
            _refS: sim.S,
            _refDay: sim.day,
        });
    }

    // Set currentStrategyHash only for user strategies (not builtins)
    currentStrategyHash = strat.builtin ? null : id;

    // Fill name input
    if ($.strategyNameInput) $.strategyNameInput.value = strat.builtin ? '' : strat.name;

    strategy.resetRange(sim.S, strategyLegs);
    const spe = _priceExpiry(_strategyExpiryIdx());
    updateStrategyChainDisplay($, spe, handleAddLeg, _buildStrategyPosMap());
    updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
    if (typeof showToast !== 'undefined') showToast('Loaded "' + strat.name + '".');
}
```

- [ ] **Step 7: Add `handleDeleteStrategy`**

```js
function handleDeleteStrategy() {
    if (!currentStrategyHash) return;
    const strat = getStrategy(currentStrategyHash);
    deleteStrategy(currentStrategyHash);
    currentStrategyHash = null;
    strategyLegs.length = 0;
    if ($.strategyNameInput) $.strategyNameInput.value = '';
    strategy.resetRange(sim.S, strategyLegs);
    _refreshStrategyDropdowns();
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
    if (typeof showToast !== 'undefined') showToast('Strategy "' + (strat ? strat.name : '') + '" deleted.');
    if (typeof _haptics !== 'undefined') _haptics.trigger('light');
}
```

- [ ] **Step 8: Extract `executeWithRollback` and rewrite `handleExecStrategy`**

Add a shared helper and rewrite the strategy tab execute:

```js
function executeWithRollback(resolvedLegs, strategyName) {
    const savedCash = portfolio.cash;
    const savedPositions = portfolio.positions.map(p => ({ ...p }));
    const savedClosedBorrowCost = portfolio.closedBorrowCost;
    const savedMarginDebitCost = portfolio.marginDebitCost;
    const savedTotalDividends = portfolio.totalDividends;
    const savedTotalTrades = portfolio.totalTrades;

    const results = [];
    let failed = false;
    for (const leg of resolvedLegs) {
        const side = leg.qty < 0 ? 'short' : 'long';
        const absQty = Math.abs(leg.qty);
        const pos = executeMarketOrder(
            leg.type, side, absQty, sim.S, market.sigma, sim.r, sim.day,
            leg.strike, leg.expiryDay, strategyName, sim.q
        );
        if (pos) {
            results.push(pos);
        } else {
            failed = true;
            break;
        }
    }

    if (failed) {
        portfolio.cash = savedCash;
        portfolio.closedBorrowCost = savedClosedBorrowCost;
        portfolio.marginDebitCost = savedMarginDebitCost;
        portfolio.totalDividends = savedTotalDividends;
        portfolio.totalTrades = savedTotalTrades;
        portfolio.positions.length = 0;
        for (const p of savedPositions) portfolio.positions.push(p);
        if (typeof showToast !== 'undefined') showToast('Strategy failed (leg ' + (results.length + 1) + ' rejected) \u2014 all legs unwound.');
        if (typeof _haptics !== 'undefined') _haptics.trigger('error');
    } else if (results.length > 0) {
        if (typeof showToast !== 'undefined') showToast('Executed ' + results.length + ' leg(s).');
        if (typeof _haptics !== 'undefined') _haptics.trigger('success');
    }
    chainDirty = true;
    updateUI();
    dirty = true;
}

function handleExecStrategy() {
    if (strategyLegs.length === 0) return;
    const name = $.strategyNameInput ? $.strategyNameInput.value.trim() : '';
    executeWithRollback(strategyLegs, name || undefined);
}
```

- [ ] **Step 9: Add `handleTradeExecStrategy`**

```js
function handleTradeExecStrategy() {
    const id = $.tradeStrategySelect ? $.tradeStrategySelect.value : '';
    if (!id) return;
    const strat = getStrategy(id);
    if (!strat) return;
    const expiries = expiryMgr.update(sim.day);
    const resolved = resolveLegs(strat.legs, sim.S, sim.day, expiries);
    executeWithRollback(resolved, strat.name);
}
```

- [ ] **Step 10: Add `_updateTradeCreditDebit` and hook into `updateSubstepUI`**

```js
function _updateTradeCreditDebit() {
    const id = $.tradeStrategySelect ? $.tradeStrategySelect.value : '';
    if (!id) { updateCreditDebit($, null); return; }
    const strat = getStrategy(id);
    if (!strat) { updateCreditDebit($, null); return; }
    const expiries = expiryMgr.update(sim.day);
    const net = computeNetCost(strat.legs, sim.S, market.sigma, sim.r, sim.day, sim.q, expiries);
    updateCreditDebit($, net);
}
```

In `updateSubstepUI` (line 678), add at the end (before the closing `}`):

```js
    // Live credit/debit update for trade-tab strategy
    if ($.tradeStrategySelect && $.tradeStrategySelect.value) {
        _updateTradeCreditDebit();
    }
```

- [ ] **Step 11: Add `_refreshStrategyDropdowns` helper**

```js
function _refreshStrategyDropdowns() {
    updateStrategyDropdowns($, listStrategies());
}
```

- [ ] **Step 12: Call `_refreshStrategyDropdowns` on init and reset**

In `_resetCore` (around line 844, after `strategyLegs.length = 0`), add:

```js
    currentStrategyHash = null;
    if ($.strategyNameInput) $.strategyNameInput.value = '';
    _refreshStrategyDropdowns();
```

In the init section (after `bindEvents` call, around line 250), add:

```js
    _refreshStrategyDropdowns();
```

- [ ] **Step 13: Pass `currentStrategyHash` to `renderStrategyBuilder`**

In `updateStrategyBuilder` (line 1131), update the `renderStrategyBuilder` call:

Old:
```js
    renderStrategyBuilder($, strategyLegs, summary, handleRemoveLeg, chainSkeleton, () => {
        strategy.resetRange(sim.S, strategyLegs);
        updateStrategyBuilder();
        dirty = true;
    });
```

New:
```js
    renderStrategyBuilder($, strategyLegs, summary, handleRemoveLeg, chainSkeleton, () => {
        strategy.resetRange(sim.S, strategyLegs);
        updateStrategyBuilder();
        dirty = true;
    }, currentStrategyHash);
```

The `renderStrategyBuilder` function signature in `ui.js` was already updated in Task 5, Step 5 to accept `currentStrategyHash` as the 7th parameter. No other callers of `renderStrategyBuilder` exist — it's only called from `updateStrategyBuilder`.

- [ ] **Step 14: Commit main.js changes**

```bash
git add main.js src/ui.js
git commit -m "feat: wire strategy save/load/delete handlers, trade-tab execute, and live credit/debit"
```

---

### Task 7: Final integration and cleanup

**Files:**
- Modify: `main.js` (verify all removed references)
- Modify: `src/portfolio.js` (verify exports)

- [ ] **Step 1: Remove `saveStrategy, executeStrategy` from portfolio.js exports**

Verify the `export` keywords are removed from the deleted functions. Check no other file imports them.

- [ ] **Step 2: Verify `updateStrategyBuilder` passes `currentStrategyHash`**

Read `updateStrategyBuilder` in `main.js` and confirm `renderStrategyBuilder` receives `currentStrategyHash`. Read `renderStrategyBuilder` in `ui.js` and confirm the new parameter is used for the delete button state.

- [ ] **Step 3: Test in browser**

Manual verification checklist:
- Strategy tab: name input visible, load dropdown populated with 8 built-ins
- Save a custom strategy: appears in both dropdowns
- Load a built-in: legs populate, name input blank, delete disabled
- Load a user strategy: legs populate, name fills, delete enabled
- Delete a user strategy: removed from dropdowns, builder cleared
- Trade tab: dropdown shows all strategies, selecting one shows credit/debit
- Trade tab execute: positions created, rollback on failure
- Credit/debit updates as sim runs
- Strategies persist across page reload
- Strategies survive sim reset

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "fix: integration fixes for strategy save/load rework"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update file map**

Add `strategy-store.js` entry to the file map:

```
  strategy-store.js    ~120 lines  Built-in strategy defs, localStorage CRUD (hash IDs),
                                   resolveLegs, formatLeg, computeNetCost, legsToRelative
```

- [ ] **Step 2: Update module dependencies**

Add `strategy-store.js` to the dependency tree under `main.js`:

```
  |- strategy-store.js     (imports pricing, portfolio, config)
```

- [ ] **Step 3: Update Key Patterns / Gotchas**

Add note about strategy storage:
- **Strategies in localStorage**: `shoals_strategies` key, hash-based IDs. Built-ins are const in `strategy-store.js`, never in localStorage. `currentStrategyHash` in main.js tracks loaded user strategy.
- **Relative legs**: all saved strategies store `strikeOffset` / `dteOffset`, resolved at execution time via `resolveLegs()`.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with strategy-store module"
```
