# Event System Unification

**Date:** 2026-03-27
**Branch:** feat/narrative-depth
**Goal:** Reorganize all event definitions into domain-split files under `src/events/`, unify the event schema so toast events, popup events, and superevents share a single shape, and make the system easy to edit, extend, and eventually mod.

---

## Problem

1. **`event-pool.js` is 5,006 lines** — 16 named arrays plus ~120 loose events at the bottom (tips, one-shots, faction-gated, trait-gated, portfolio-reactive). Hard to navigate, hard to add to.

2. **Two incompatible event systems:**
   - *World-state events* (`event-pool.js`) — drawn by Poisson/pulse in `EventEngine.maybeFire()`. Have `when`, `likelihood`, `params`, `effects`, `followups`.
   - *Portfolio-triggered events* (`popup-events.js`) — evaluated daily by `evaluatePortfolioPopups()`. Have `trigger`, `cooldown`, `context`, `choices`.
   - Both produce popup dialogs but go through completely different code paths.

3. **Superevent status is ad-hoc** — `SUPEREVENT_IDS` is a hardcoded Set in `main.js` plus a heuristic (`magnitude === 'major' && id.startsWith('compound_')`). The `superevent: true` flag exists on only 2 event objects (firm_crisis, inline midterm events). No single source of truth.

4. **Choice effect patterns are inconsistent:**
   - Event-pool popup choices use `deltas`, `effects` (structured), `playerFlag`, `followups`, `trades`.
   - Portfolio popup choices use `onChoose` (inline functions) + `deltas` + `playerFlag` + `trades`.
   - `onChoose` is defined on ~30 choices but **never called** — it's dead code. All behavior flows through the declarative fields processed in main.js's choice handler.
   - Several `playerFlag` values trigger hardcoded special-case branches in main.js (insider tips, SEC actions, margin calls).

---

## Design

### 1. Unified Event Schema

Every event is a single JS object. The difference between a toast event, a popup event, and a superevent is determined by which optional fields are present.

```js
{
    // ── Identity (required) ──
    id: 'fed_signals_hike',           // unique string
    category: 'fed',                  // domain key for pool routing + UI
    headline: 'Hartley signals...',   // display text (toast or popup title)
    magnitude: 'moderate',            // 'minor' | 'moderate' | 'major'

    // ── Scheduling (world-state events) ──
    likelihood: 0.8,                  // number or (sim, world, congress) => number
    when: (sim, world, congress, ctx) => ...,  // eligibility guard
    era: 'early',                     // optional: 'early' | 'mid' | 'late'
    minDay: null,                     // optional: earliest live day
    maxDay: null,                     // optional: latest live day
    followupOnly: false,              // only fire as a followup, never drawn
    oneShot: false,                   // fire at most once per game

    // ── Scheduling (portfolio-triggered events) ──
    trigger: (sim, world, ctx) => ..., // daily evaluation function
    cooldown: 200,                     // minimum days between firings

    // ── Superevent ──
    superevent: false,                // true = pause sim, play chord stab, full-screen popup

    // ── Effects (applied on fire for toasts; applied immediately for superevents) ──
    params: { mu: -0.015, theta: 0.005 },       // sim parameter deltas
    effects: (world) => { ... },                  // world-state mutation (function or structured array)
    portfolioFlavor: (portfolio) => '...' | null, // optional toast addendum

    // ── Popup fields (present = event is a popup) ──
    popup: true,
    context: (sim, world, ctx) => '...',          // descriptive prose for popup body
    choices: [
        {
            label: 'Cover shorts',
            desc: 'Close all short directional exposure.',

            // ── Choice effects (all optional, all declarative) ──
            deltas: { xi: 0.01 },                // sim parameter deltas
            effects: [...],                       // structured world-state effects
            factionShifts: [                      // replaces inline shiftFaction calls
                { faction: 'firmStanding', value: -3 },
                { faction: 'regulatoryExposure', value: 5,
                  when: { hasTrait: 'under_scrutiny' }, bonus: 3 },
            ],
            trades: [{ action: 'close_short' }],  // declarative trade execution
            followups: [{ id: 'fed_25bps_hike', mtth: 32 }],
            playerFlag: 'cooperated_with_compliance',
            complianceTier: 'full',               // 'full' | 'partial' | 'defiant'
            resultToast: 'Short exposure closed.',
        },
    ],

    // ── Followup chains ──
    followups: [
        { id: 'fed_25bps_hike', mtth: 32, weight: 0.7 },
    ],
}
```

**Key rules:**
- If `trigger` is present → portfolio-triggered (evaluated daily with cooldown).
- If `trigger` is absent and `likelihood` is present → world-state event (Poisson/pulse drawn).
- If `popup` is true → queued into the popup overlay. Requires `choices`.
- If `superevent` is true → also plays chord stab, pauses sim, gets full-screen treatment. `SUPEREVENT_IDS` in main.js is deleted.
- `onChoose` is removed entirely. All choice effects use the declarative fields.
- `factionShifts` replaces inline `shiftFaction` calls in `onChoose`, with optional conditional bonuses.

### 2. File Structure

```
src/events/
  index.js              — merges all domain pools, exports ALL_EVENTS + lookup + validation
  _helpers.js           — shared portfolio helper functions (equity, notional calcs, etc.)
  fed.js                — Fed/rate events + faction-gated fed events
  macro.js              — macro/recession + compound macro one-shots (stagflation, energy war)
  pnth.js               — PNTH corporate + earnings + PNTH compound one-shots
  congress.js           — congressional + filibuster + midterm + political events
  investigation.js      — investigation events + compound investigation one-shots
  media.js              — media ecosystem + media faction-gated events
  market.js             — market structure + sector events
  firm.js               — firm dynamics (neutral), portfolio-triggered desk popups, compliance
  tips.js               — insider tip pool + tip outcome events (real and fake)
  interjections.js      — atmospheric interjection events
  traits.js             — trait-gated + conviction-gated events
```

Each domain file exports a single array:

```js
// src/events/fed.js
import { shiftFaction } from '../faction-standing.js';
import { getPipelineStatus } from '../regulations.js';

export const FED_EVENTS = [
    {
        id: 'fed_hold_dovish',
        category: 'fed',
        likelihood: 5,
        headline: '...',
        params: { mu: 0.01, theta: -0.003 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock')
                .reduce((s, p) => s + p.qty, 0);
            if (stockQty > 20) return 'Your long equity book catches a bid on the dovish hold.';
            return null;
        },
    },
    // ... rest of fed events
];
```

**`_helpers.js`** contains the portfolio calculation helpers currently private to `popup-events.js` — `_equity()`, `_shortDirectionalNotional()`, `_longDirectionalNotional()`, `_bondNotional()`, `_strikeNotional()`, `_totalOptionsNotional()`, `_maxStrikeConcentration()`, `_netUncoveredUpside()`, `_anyInvestigationActive()`, `_liveDay()`. These become named exports usable by any domain file that defines portfolio-triggered events.

**`index.js`** merges and validates:

```js
import { FED_EVENTS } from './fed.js';
import { MACRO_EVENTS } from './macro.js';
import { PNTH_EVENTS } from './pnth.js';
import { CONGRESS_EVENTS } from './congress.js';
import { INVESTIGATION_EVENTS } from './investigation.js';
import { MEDIA_EVENTS } from './media.js';
import { MARKET_EVENTS } from './market.js';
import { FIRM_EVENTS } from './firm.js';
import { TIP_EVENTS, INSIDER_TIPS, pickTip } from './tips.js';
import { INTERJECTION_EVENTS } from './interjections.js';
import { TRAIT_EVENTS } from './traits.js';

export { PARAM_RANGES } from './param-ranges.js';
export { pickTip } from './tips.js';

export const ALL_EVENTS = [
    ...FED_EVENTS,
    ...MACRO_EVENTS,
    ...PNTH_EVENTS,
    ...CONGRESS_EVENTS,
    ...INVESTIGATION_EVENTS,
    ...MEDIA_EVENTS,
    ...MARKET_EVENTS,
    ...FIRM_EVENTS,
    ...TIP_EVENTS,
    ...INTERJECTION_EVENTS,
    ...TRAIT_EVENTS,
];

// -- Lookup by id --
let _byId = null;
export function getEventById(id) {
    if (!_byId) {
        _byId = new Map();
        for (const ev of ALL_EVENTS) _byId.set(ev.id, ev);
    }
    return _byId.get(id) || null;
}

// -- Startup validation --
// (followup chain integrity checks, same as current event-pool.js bottom)
```

### 3. EventEngine Changes

`events.js` (the `EventEngine` class) gets a unified evaluation loop. Changes:

**Pool pre-filtering absorbs portfolio-triggered events:**

```js
// In constructor, split ALL_EVENTS into two evaluation tracks:
this._worldPools = { ... };        // same as today's _pools (pulse + Poisson)
this._triggerPool = ALL_EVENTS.filter(e => typeof e.trigger === 'function');
this._triggerCooldowns = {};       // id → last fired day
```

**New daily trigger pass (replaces `evaluatePortfolioPopups`):**

```js
evaluateTriggers(sim, day) {
    const triggered = [];
    const ctx = this._playerCtx;
    for (const ev of this._triggerPool) {
        const cd = this._triggerCooldowns[ev.id];
        if (cd && day - cd < ev.cooldown * firmCooldownMult()) continue;
        // era gating (same as current)
        if (ev.era === 'early' && _liveDay(day) > 500) continue;
        if (ev.era === 'mid' && (_liveDay(day) < 500 || _liveDay(day) > 800)) continue;
        if (ev.era === 'late' && _liveDay(day) < 800) continue;
        try {
            if (ev.trigger(sim, this.world, ctx)) {
                this._triggerCooldowns[ev.id] = day;
                triggered.push(ev);
            }
        } catch (e) { /* guard */ }
    }
    return triggered;
}
```

**main.js call site:**

```js
// Replace:
//   const portfolioPopups = evaluatePortfolioPopups(sim, eventEngine.world, portfolio, sim.day);
// With:
const portfolioPopups = eventEngine.evaluateTriggers(sim, sim.day);
```

**Reset clears trigger cooldowns:**

```js
reset() {
    // ... existing reset ...
    this._triggerCooldowns = {};
}
```

**Superevent detection moves to the event object:**

```js
// In main.js popup handler, replace:
//   const isSuperevent = SUPEREVENT_IDS.has(event.id) || (event.magnitude === 'major' && ...);
// With:
const isSuperevent = !!event.superevent;
```

Delete the `SUPEREVENT_IDS` Set from main.js. Add `superevent: true` to the ~10 events that were listed in it.

### 4. Choice Effect Unification

The popup choice handler in main.js currently processes: `deltas`, `effects`, `playerFlag`, `followups`, `resultToast`, `trades`, `complianceTier`, `_tipAction`, plus hardcoded `playerFlag` special cases.

**New `factionShifts` field** replaces all `onChoose` calls and the hardcoded playerFlag-to-shiftFaction mappings:

```js
factionShifts: [
    { faction: 'regulatoryExposure', value: 13 },
    // conditional: adds bonus when trait is active
    { faction: 'regulatoryExposure', value: 5, when: { hasTrait: 'under_scrutiny' }, bonus: 5 },
]
```

Processing in main.js:

```js
if (choice.factionShifts) {
    for (const fs of choice.factionShifts) {
        let value = fs.value;
        if (fs.when?.hasTrait && hasTrait(fs.when.hasTrait)) value += (fs.bonus || 0);
        shiftFaction(fs.faction, value);
    }
}
```

**Hardcoded playerFlag special cases** move onto the choice objects as declarative fields:

| Current hardcoded check | New declarative field |
|---|---|
| `playerFlag === 'pursued_insider_tip'` → `shiftFaction(...)` | `factionShifts: [{ faction: 'regulatoryExposure', value: 13 }]` |
| `playerFlag === 'settled_sec'` → `portfolio.cash -= 2000; settleRegulatory()` | `cashPenalty: 2000, regulatoryAction: 'settle'` |
| `playerFlag === 'informed_sec'` → `cooperateRegulatory()` | `regulatoryAction: 'cooperate'` |
| `playerFlag === 'fought_sec'` → `shiftFaction(...)` | `factionShifts: [...]` |

The main.js choice handler becomes fully declarative — no `if (flag === '...')` branches.

### 5. `onChoose` Removal

`onChoose` is defined on ~30 choices in popup-events.js but is **dead code** — main.js never calls it. All behavior already flows through `deltas`, `effects`, `playerFlag`, `trades`, `complianceTier`.

During migration, each `onChoose` body is converted to the equivalent `factionShifts` array. Example:

```js
// Before (dead code):
onChoose: () => { shiftFaction('firmStanding', -3); shiftFaction('regulatoryExposure', hasTrait('under_scrutiny') ? +6 : +3); },

// After (declarative, actually executed):
factionShifts: [
    { faction: 'firmStanding', value: -3 },
    { faction: 'regulatoryExposure', value: 3, when: { hasTrait: 'under_scrutiny' }, bonus: 3 },
],
```

This is a **behavior change** — those faction shifts weren't happening before because `onChoose` was never called. Every migrated `onChoose` needs review to confirm the shifts are balanced with the existing game feel.

### 6. Trigger Context Injection

Portfolio-triggered events currently access `portfolio` and `market` singletons directly via module imports. In the unified system, these values are passed via the player context object (`ctx`) so domain files don't import singletons:

```js
// In main.js, before evaluateTriggers:
eventEngine.setPlayerContext(playerChoices, factions, activeRegIds, traitIds, {
    equity: _portfolioEquity(),
    shortNotional: _shortDirectionalNotional(),
    longNotional: _longDirectionalNotional(),
    optionsNotional: _totalOptionsNotional(),
    bondNotional: _bondNotional(),
    maxStrikeConcentration: _maxStrikeConcentration(),
    netUncoveredUpside: _netUncoveredUpside(),
    netDelta: computeNetDelta(),
    grossNotional: computeGrossNotional(),
    grossLeverage: computeGrossNotional() / Math.max(1, _portfolioEquity()),
    positionCount: portfolio.positions.length,
    cash: portfolio.cash,
    pnlPct: (_portfolioEquity() - portfolio.initialCapital) / portfolio.initialCapital,
    peakValue: portfolio.peakValue,
    maxDrawdown: portfolio.maxDrawdown || 0,
    strongQuarters: quarterlyReviews.filter(r => r.rating === 'strong').length,
    impactTradeCount: impactHistory.length,
    absStockQty: portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + Math.abs(p.qty), 0),
    positions: portfolio.positions,  // read-only reference for complex checks
});
```

This means `trigger` and `context` functions receive all portfolio metrics via `ctx.portfolio` instead of calling private helpers. The `_helpers.js` file provides the calculation functions that main.js calls to build the context object.

### 7. Modding Considerations

The domain-file structure makes modding straightforward:

**Adding an event:** Open the relevant domain file, add an object to the array. No other files to touch — `index.js` spreads the entire array.

**Adding a domain:** Create a new file, export an array, add one import + spread line in `index.js`.

**Modding workflow (future):** A `mods/` directory could contain JS files that export event arrays. A mod loader in `index.js` would dynamically import and merge them:

```js
// Future mod support (not implemented in this PR)
export async function loadMods(modUrls) {
    for (const url of modUrls) {
        const mod = await import(url);
        if (Array.isArray(mod.default)) {
            ALL_EVENTS.push(...mod.default);
            _byId = null; // invalidate cache
        }
    }
}
```

Mod files would follow the exact same format as built-in domain files. No special API — just export an array of event objects.

### 8. PARAM_RANGES

`PARAM_RANGES` moves to its own small file `src/events/param-ranges.js` and is re-exported from `index.js`. This keeps the constant co-located with the event system but out of any single domain file.

---

## Migration Plan (high level)

1. Create `src/events/` directory and `_helpers.js`, `param-ranges.js`, `index.js` skeleton.
2. Extract domain files one at a time from `event-pool.js` (FED → fed.js, MACRO → macro.js, etc.), preserving exact event objects. Wire into `index.js`.
3. Move portfolio popup events from `popup-events.js` into appropriate domain files (most go to `firm.js`; SEC/investigation popups go to `investigation.js`; political popups go to `congress.js`).
4. Convert all `onChoose` to `factionShifts` (behavior addition — these weren't firing before).
5. Add `superevent: true` to the ~10 events currently in `SUPEREVENT_IDS`. Delete the Set from main.js.
6. Add `evaluateTriggers` to EventEngine. Update main.js call site.
7. Migrate hardcoded playerFlag special cases to declarative choice fields.
8. Update main.js choice handler to process `factionShifts`, `regulatoryAction`, `cashPenalty`.
9. Delete `event-pool.js` and `popup-events.js`.
10. Update imports across all consumers.
11. Update CLAUDE.md to reflect new file structure.

---

## Files Changed

**New files:**
- `src/events/index.js`
- `src/events/_helpers.js`
- `src/events/param-ranges.js`
- `src/events/fed.js`
- `src/events/macro.js`
- `src/events/pnth.js`
- `src/events/congress.js`
- `src/events/investigation.js`
- `src/events/media.js`
- `src/events/market.js`
- `src/events/firm.js`
- `src/events/tips.js`
- `src/events/interjections.js`
- `src/events/traits.js`

**Deleted files:**
- `src/event-pool.js`
- `src/popup-events.js`

**Modified files:**
- `src/events.js` — add `evaluateTriggers`, import from `./events/index.js`
- `main.js` — delete `SUPEREVENT_IDS`, update imports, update choice handler, update trigger evaluation call site
- `CLAUDE.md` — update architecture section

---

## What Does NOT Change

- `events.js` (`EventEngine` class) stays where it is — it's the engine, not the data.
- The Poisson/pulse scheduling logic is untouched.
- The popup overlay UI (`showPopupEvent` in ui.js) is untouched.
- Toast display logic is untouched.
- Audio stinger/chord stab logic is untouched (just reads `event.superevent` instead of checking a Set).
- All event ids remain the same — no save-breaking changes.
- All followup chain references remain valid.
