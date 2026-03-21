# Strategy Save/Load Rework

**Date:** 2026-03-21
**Status:** Approved

## Problem

Strategies are currently in-memory only (`portfolio.strategies[]`), wiped on reset, named via `prompt()`, and have no load/edit UI. Strategies store absolute strikes and expiry days, making them non-reusable across different market conditions.

## Goals

1. Persist strategies in localStorage with hash-based IDs (rename-safe)
2. All strategies use relative strikes (ATM offset) and relative expiries (DTE offset)
3. Strategy tab: name input + Save/Load/Delete/Execute buttons (no `prompt()`)
4. Trade tab: saved strategy dropdown with live credit/debit line + Execute button
5. Built-in read-only strategies (classic options strategies)

## Non-Goals

- Server-side persistence
- Strategy sharing/export
- Strategy backtesting

---

## Data Model

### Stored Leg

```js
{
  type:       'stock' | 'bond' | 'call' | 'put',
  qty:        number,   // signed: >0 long, <0 short
  strikeOffset: number, // relative to ATM (rounded to 5-grid). null for stock/bond
  dteOffset:   number,  // days to expiry relative to current day. null for stock/bond
}
```

### Stored Strategy

```js
{
  id:       string,    // 8-char hex hash (crypto.getRandomValues)
  name:     string,    // user-editable display name
  legs:     StoredLeg[],
  builtin:  boolean,   // true for read-only presets
}
```

### localStorage

Key: `shoals_strategies`. Value: JSON object `{ [id]: { name, legs } }`. Only user-created strategies are stored in localStorage.

Built-in strategies are defined as a `const` array in `strategy-store.js` and merged at read time by `listStrategies()`. They never touch localStorage, so code updates to built-ins are always reflected without migration concerns.

### Resolution at Execution Time

- **Strike**: `round((S + strikeOffset) / 5) * 5` — snap to nearest 5-grid strike
- **Expiry**: find nearest available expiry from `ExpiryManager` to `currentDay + dteOffset`

---

## Built-in Strategies

All use qty=1 per leg. Relative to ATM (offset 0) and nearest expiry (dteOffset from smallest available).

| Name | Legs |
|------|------|
| Covered Call | Long stock, Short call ATM |
| Protective Put | Long stock, Long put ATM |
| Bull Call Spread | Long call ATM, Short call ATM+10 |
| Bear Put Spread | Long put ATM, Short put ATM-10 |
| Long Straddle | Long call ATM, Long put ATM |
| Long Strangle | Long call ATM+5, Long put ATM-5 |
| Iron Condor | Long put ATM-15, Short put ATM-10, Short call ATM+10, Long call ATM+15 |
| Iron Butterfly | Long put ATM-10, Short put ATM, Short call ATM, Long call ATM+10 |

DTE offsets: use the nearest expiry (`dteOffset: 0`) for all built-in strategies. At execution, this resolves to the closest available expiry in `ExpiryManager`.

---

## New Module: `src/strategy-store.js`

localStorage wrapper + built-in definitions + resolution/pricing helpers. ~120 lines.

### Exports

```js
export function listStrategies()                   // → [{id, name, legs, builtin}] — merges built-ins + user
export function getStrategy(id)                    // → {id, name, legs, builtin} | null
export function saveStrategy(id, name, legs)       // id=null → generate new; returns id
export function deleteStrategy(id)                 // no-op if builtin
export function resolveLegs(legs, S, day, expiries) // → resolved legs with absolute strike/expiryDay
export function formatLeg(leg)                     // → display string like "Long CALL ATM+5 63d"
export function computeNetCost(legs, S, vol, r, day, q, expiries) // → net premium (negative = credit)
```

### Hash Generation

```js
function generateId() {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}
```

### `resolveLegs(legs, S, day, expiries)`

`expiries` is the `[{day, dte}]` array from `ExpiryManager.update()` (already public).

For each leg:
- If `type === 'stock'` or `type === 'bond'`: returns `{ type, qty, strike: null, expiryDay: null }`
- Else: `strike = round((S + leg.strikeOffset) / 5) * 5`, `expiryDay = expiries.reduce((best, e) => abs(e.day - (day + leg.dteOffset)) < abs(best.day - (day + leg.dteOffset)) ? e : best).day`

Returns new array of `{ type, qty, strike, expiryDay }` ready for execution. Uses the expiries array directly — no new method needed on `ExpiryManager`.

### `computeNetCost(legs, S, vol, r, day, q, expiries)`

Resolves legs then computes net premium: long legs pay ask, short legs receive bid. Uses `computeBidAsk` for stock/bond, `computeOptionBidAsk` for options (imported from portfolio.js). Returns the net cash impact (positive = debit, negative = credit).

### `formatLeg(leg)`

Returns display string from a stored leg: e.g. "Long CALL ATM+5 63d", "Short PUT ATM 126d", "Long STOCK". Used by both the strategy tab legs list and dropdown tooltips.

---

## UI Changes

### Strategy Tab

Replace current Save/Execute row with:

```html
<div class="control-group">
    <label for="strategy-name">Name</label>
    <input type="text" id="strategy-name" class="sim-input" placeholder="Strategy 1">
</div>
<div class="control-group">
    <label for="strategy-load-select">Load Strategy</label>
    <select id="strategy-load-select" class="sim-select">
        <option value="">Select a strategy...</option>
    </select>
</div>
<div class="quick-trade-row" style="margin-top:6px">
    <button id="save-strategy-btn" class="ghost-btn trade-btn bond" disabled>Save</button>
    <button id="load-strategy-btn" class="ghost-btn trade-btn" disabled>Load</button>
    <button id="delete-strategy-btn" class="ghost-btn trade-btn down" disabled>Delete</button>
    <button id="exec-strategy-btn" class="ghost-btn trade-btn up" disabled>Execute</button>
</div>
```

**Button states:**
- **Save**: enabled when legs exist
- **Load**: enabled when a strategy is selected in the load dropdown
- **Delete**: enabled when a non-builtin strategy is loaded (tracked via `currentStrategyHash`)
- **Execute**: enabled when legs exist

**Load flow**: select strategy from dropdown → click Load → legs populate builder, name fills input, `currentStrategyHash` set. Built-in strategies load but `currentStrategyHash` is NOT set (forces "Save as new" behavior).

**Save flow**: if `currentStrategyHash` is set (editing a user strategy), updates that entry. Otherwise creates new. Auto-generates "Strategy N" if name input is blank.

**Delete flow**: removes `currentStrategyHash` from store, clears builder, refreshes dropdowns.

### Trade Tab

Below the "View Full Chain" button, before the panel-hint:

```html
<div class="stat-group" id="saved-strategies-section">
    <div class="group-label">Saved Strategies</div>
    <select id="trade-strategy-select" class="sim-select">
        <option value="">Select a strategy...</option>
    </select>
    <div class="stat-row" id="strategy-credit-debit" style="display:none">
        <span class="stat-label">Net Cost</span>
        <span class="stat-value" id="strategy-net-cost">—</span>
    </div>
    <button id="trade-exec-strategy-btn" class="ghost-btn trade-btn up" disabled>Execute Strategy</button>
</div>
```

**Credit/debit line**: shows "Net Debit: $X.XX" or "Net Credit: $X.XX" with appropriate P&L coloring (green for credit, rose for debit). Updates every substep when a strategy is selected.

**Computation**: resolve legs at current S/day, compute bid/ask for each leg (buy at ask, sell at bid), sum net premium. Stock/bond legs use `computeBidAsk`, options use `computeOptionBidAsk`.

**Execute**: same rollback-guarded logic as strategy tab execute, but reads legs from store and resolves them.

---

## Changes by File

### New: `src/strategy-store.js` (~120 lines)

Built-in strategy definitions (const array, never in localStorage), localStorage CRUD for user strategies, `resolveLegs()`, `computeNetCost()`, `formatLeg()`.

### `index.html`

- Strategy tab: replace save/execute row with name input + load dropdown + 4 buttons
- Trade tab: add saved strategies section after full-chain button

### `main.js`

- Import `strategy-store.js`
- Track `currentStrategyHash` (null when building fresh)
- `handleSaveStrategy()`: read name input, call `saveStrategy()`, refresh dropdowns
- `handleLoadStrategy()`: populate `strategyLegs` from resolved legs, fill name input
- `handleDeleteStrategy()`: call `deleteStrategy()`, clear builder
- `handleTradeExecStrategy()`: resolve + execute from trade tab dropdown
- Add `updateStrategyCreditDebit()` called in `_onSubstep()` — computes net cost for selected trade-tab strategy (guarded: only runs when a strategy is selected in the trade tab dropdown)
- Extract shared `executeWithRollback(resolvedLegs, sim, portfolio)` helper used by both strategy tab Execute and trade tab Execute
- Remove `prompt()` call
- Refresh both dropdowns on save/delete/load and on sim reset
- Convert strategy builder legs to relative format on save (compute offset from current S and day)

### `src/ui.js`

- Cache new DOM elements: `strategyName`, `strategyLoadSelect`, `loadStrategyBtn`, `deleteStrategyBtn`, `tradeStrategySelect`, `tradeExecStrategyBtn`, `strategyCreditDebit`, `strategyNetCost`
- Bind click/change events for new elements
- New `updateStrategyDropdowns($, strategies)` — populates both selects, marks built-ins with "(built-in)" suffix
- New `updateCreditDebit($, value)` — formats and colors the net cost display

### `src/portfolio.js`

- Remove `portfolio.strategies` array, `saveStrategy()`, `executeStrategy()`
- Keep `resetPortfolio()` as-is (minus `portfolio.strategies = []`)

### `styles.css`

- `.sim-input` styling for strategy name text input (match `.sim-select` aesthetics)
- Built-in label styling in dropdowns
- Credit/debit row coloring

---

## Relative Strike/Expiry — User Communication

The chain table in the strategy tab already shows absolute strikes. When a leg is added, the legs list should display the relative offset clearly:

- "Long CALL ATM+5 63d" instead of "Long CALL $105 exp:Day 315"
- "Short PUT ATM-10 63d" instead of "Short PUT $90 exp:Day 315"
- "Long STOCK" (no strike/expiry)

The panel hint below the chain should note: "Strategies save relative strikes & expiries — they adapt to current market conditions."

---

## Edge Cases

- **No matching expiry**: `resolveLegs` picks the closest available. If no expiries exist (shouldn't happen), execution fails gracefully per leg.
- **Strike out of chain range**: resolved strike may be beyond the 25-strike chain. Pricing still works (CRR tree doesn't need the chain), but bid/ask spread widens for deep OTM.
- **Name collision**: allowed. Hash is the identity, not the name. Two strategies can share a name.
- **Loading built-in then saving**: since `currentStrategyHash` is NOT set for built-ins, Save creates a new user copy. User can then customize it.
- **Negative/zero DTE on save**: if a user saves a strategy with an expiry that's about to expire (DTE <= 0), clamp `dteOffset` to a minimum of 1. At load time, resolves to nearest future expiry.
- **Strategy limit**: cap at 50 user strategies, 40-char name limit. Save silently truncates names; refuses save with toast if at cap.
- **Position `strategyName`**: `executeMarketOrder` receives the strategy's display name for position grouping in portfolio view (same as current behavior, just sourced from store instead of prompt).
