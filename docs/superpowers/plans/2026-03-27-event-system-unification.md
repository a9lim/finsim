# Event System Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize all event definitions into domain-split files under `src/events/`, unify the event schema, absorb portfolio-triggered events into EventEngine, and make the system easy to edit and extend.

**Architecture:** Extract 16 named arrays + ~120 loose events from `event-pool.js` (5006 lines) and ~30 portfolio popup events from `popup-events.js` (1461 lines) into 12 focused domain files under `src/events/`. Unify the choice-effect model so `onChoose` (dead code) is replaced by declarative `factionShifts`. Move superevent detection from a hardcoded Set in `main.js` to a `superevent: true` flag on event objects. Add `evaluateTriggers()` to EventEngine so portfolio-triggered events use the same engine as world-state events.

**Tech Stack:** Vanilla ES6 modules, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-27-event-system-unification-design.md`

**Deferred from spec:** §6 (Trigger Context Injection) — the spec proposes passing all portfolio metrics via `ctx.portfolio` so trigger functions don't import singletons. This plan keeps the singleton imports via `_helpers.js` to make the migration mechanical. The signatures and bodies of ~30 trigger/context functions stay unchanged. Context injection can be done as a follow-up if modding requires it (mod authors would need the context object since they can't import project singletons).

---

## File Map

### New files (all under `src/events/`)

| File | Responsibility | Source |
|------|---------------|--------|
| `param-ranges.js` | `PARAM_RANGES` constant | event-pool.js:11-24 |
| `_helpers.js` | Portfolio calculation helpers for trigger functions | popup-events.js:29-121 |
| `fed.js` | FED_EVENTS + fed faction-gated events | event-pool.js:28-317, 4744-4773 |
| `macro.js` | MACRO_EVENTS + compound macro one-shots | event-pool.js:318-945, compound_stagflation/energy_war/strait_war_footing/khasuria_invasion |
| `pnth.js` | PNTH_EVENTS + PNTH_EARNINGS_EVENTS + pnth compounds | event-pool.js:946-1898, compound_pnth_* events |
| `congress.js` | CONGRESSIONAL + FILIBUSTER + MIDTERM + POLITICAL + COMPOUND_EVENTS(political) + political popups | event-pool.js:2117-2345, 2567-2697, 2698-3614, political faction-gated, political portfolio popups |
| `investigation.js` | INVESTIGATION_EVENTS + compound investigation one-shots + scrutiny popups | event-pool.js:2346-2566, compound investigation events, popup-events.js scrutiny_* popups |
| `media.js` | MEDIA_EVENTS + media faction-gated events + media portfolio popups | event-pool.js:4026-4173, 4713-4742, media desk popups |
| `market.js` | MARKET_EVENTS + SECTOR_EVENTS | event-pool.js:1899-2116, 3841-4023 |
| `firm.js` | NEUTRAL_EVENTS + firm dynamics + most portfolio popups (desk_*) | event-pool.js:3620-3836, 4687-4711, 4804-4840, 4939-4975, most popup-events.js desk_* events |
| `tips.js` | Insider tip pool + tip outcome events (real+fake) + pickTip | popup-events.js:127-168, event-pool.js:4353-4451 |
| `interjections.js` | INTERJECTION_EVENTS | event-pool.js:4176-4333 |
| `traits.js` | Trait-gated + conviction-gated events | event-pool.js:4842-4937 |
| `index.js` | Merges all domain pools, exports ALL_EVENTS + getEventById + validation | event-pool.js:4336-5006 |

### Modified files

| File | Changes |
|------|---------|
| `src/events.js` | Import from `./events/index.js` instead of `./event-pool.js`. Add `evaluateTriggers()`, `_triggerPool`, `_triggerCooldowns`. Add `firmCooldownMult` import. Reset trigger cooldowns in `reset()`. |
| `main.js` | Delete `SUPEREVENT_IDS`. Update imports. Replace `evaluatePortfolioPopups` call with `eventEngine.evaluateTriggers`. Replace superevent detection with `!!event.superevent`. Add `factionShifts` processing. Migrate hardcoded playerFlag special cases. Remove `resetPopupCooldowns` import/call. |
| `CLAUDE.md` | Update architecture section to reflect new file structure. |

### Deleted files

| File | Reason |
|------|--------|
| `src/event-pool.js` | All content extracted to `src/events/*.js` |
| `src/popup-events.js` | All content extracted to domain files + `_helpers.js` |

---

## Task 1: Scaffold `src/events/` with `param-ranges.js` and `index.js`

**Files:**
- Create: `src/events/param-ranges.js`
- Create: `src/events/index.js`

- [ ] **Step 1: Create `src/events/param-ranges.js`**

```js
/* param-ranges.js -- Canonical parameter clamping ranges for event deltas. */

export const PARAM_RANGES = {
    mu:     { min: -0.50, max: 0.80 },
    theta:  { min: 0.005, max: 1.00 },
    kappa:  { min: 0.05,  max: 10.0 },
    xi:     { min: 0.05,  max: 1.50 },
    rho:    { min: -0.99, max: 0.50 },
    lambda: { min: 0.0,   max: 15.0 },
    muJ:    { min: -0.25, max: 0.15 },
    sigmaJ: { min: 0.005, max: 0.25 },
    a:      { min: 0.01,  max: 2.0 },
    b:      { min: -0.05, max: 0.20 },
    sigmaR:       { min: 0.001, max: 0.050 },
    borrowSpread: { min: 0.0,   max: 5.0 },
    q:            { min: 0.0,   max: 0.10 },
};
```

- [ ] **Step 2: Create initial `src/events/index.js`**

This is a temporary skeleton that re-exports everything from the old `event-pool.js` so existing code keeps working while we migrate domain files one by one.

```js
/* index.js -- Event pool registry. Merges all domain event arrays. */

// Temporary: re-export from old event-pool during migration
export { OFFLINE_EVENTS, getEventById } from '../event-pool.js';
export { PARAM_RANGES } from './param-ranges.js';
```

- [ ] **Step 3: Point `events.js` at the new index**

In `src/events.js`, change line 19 from:
```js
import { OFFLINE_EVENTS, PARAM_RANGES, getEventById } from './event-pool.js';
```
to:
```js
import { OFFLINE_EVENTS, PARAM_RANGES, getEventById } from './events/index.js';
```

And change line 23 from:
```js
export { PARAM_RANGES } from './event-pool.js';
```
to:
```js
export { PARAM_RANGES } from './events/index.js';
```

- [ ] **Step 4: Point `main.js` at the new index**

In `main.js`, change line 54 from:
```js
import { getEventById } from './src/event-pool.js';
```
to:
```js
import { getEventById } from './src/events/index.js';
```

- [ ] **Step 5: Verify the app loads**

Run: `cd /Users/a9lim/Work/a9lim.github.io && python -m http.server`

Open browser, load the app. Verify no console errors about missing imports. The game should work identically — all events still come from `event-pool.js` via the index re-export.

- [ ] **Step 6: Commit**

```bash
git add src/events/param-ranges.js src/events/index.js src/events.js main.js
git commit -m "feat: scaffold src/events/ directory with param-ranges and index shim"
```

---

## Task 2: Create `_helpers.js` — portfolio calculation helpers

**Files:**
- Create: `src/events/_helpers.js`

- [ ] **Step 1: Create `src/events/_helpers.js`**

Extract all private helper functions from `popup-events.js` (lines 29-121) as named exports. These functions access the `portfolio`, `market`, `unitPrice`, and config singletons via imports, matching the current behavior.

```js
/* _helpers.js -- Portfolio calculation helpers for trigger/context functions.
   Used by domain event files that define portfolio-triggered (desk_*) events. */

import { computeNetDelta, computeGrossNotional, portfolio, portfolioValue } from '../portfolio.js';
import { market } from '../market.js';
import { unitPrice } from '../position-value.js';
import { HISTORY_CAPACITY } from '../config.js';

export function equity() {
    return portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
}

export function posPrice(p) {
    return unitPrice(p.type, market.S, Math.sqrt(market.v), market.r, market.day, p.strike, p.expiryDay, market.q);
}

export function absStockQty() {
    return portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + Math.abs(p.qty), 0);
}

export function shortDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = posPrice(p);
        if (p.type === 'stock' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'call' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'put' && p.qty > 0) total += p.qty * price;
    }
    return total;
}

export function longDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = posPrice(p);
        if (p.type === 'stock' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'call' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'put' && p.qty < 0) total += Math.abs(p.qty) * price;
    }
    return total;
}

export function bondNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'bond') total += Math.abs(p.qty) * posPrice(p);
    }
    return total;
}

export function strikeNotional(strike) {
    let total = 0;
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike === strike) {
            total += Math.abs(p.qty) * posPrice(p);
        }
    }
    return total;
}

export function totalOptionsNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'call' || p.type === 'put') {
            total += Math.abs(p.qty) * posPrice(p);
        }
    }
    return total;
}

export function maxStrikeConcentration() {
    const byStrike = {};
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike != null) {
            byStrike[p.strike] = (byStrike[p.strike] || 0) + Math.abs(p.qty) * posPrice(p);
        }
    }
    let maxStrike = null, maxNotional = 0;
    for (const k in byStrike) {
        if (byStrike[k] > maxNotional) { maxNotional = byStrike[k]; maxStrike = +k; }
    }
    return { strike: maxStrike, notional: maxNotional };
}

export function netUncoveredUpside() {
    let net = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'stock' || p.type === 'call') net += p.qty;
    }
    return net;
}

export function anyInvestigationActive(world) {
    const inv = world.investigations;
    return inv.tanBowmanStory > 0 || inv.tanNsaStory > 0 ||
           inv.okaforProbeStage > 0 || inv.impeachmentStage > 0;
}

export function liveDay(day) {
    return day - HISTORY_CAPACITY;
}

export { computeNetDelta, computeGrossNotional, portfolio } from '../portfolio.js';
export { market } from '../market.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/events/_helpers.js
git commit -m "feat: add portfolio calculation helpers for event trigger functions"
```

---

## Task 3: Extract domain files from `event-pool.js`

This is the largest task — extracting each named array into its own domain file. Each domain file exports a single array. Events are copied verbatim; the only change is adding imports and adjusting `onChoose`→`factionShifts` later (Task 6).

**Files:**
- Create: `src/events/fed.js`, `macro.js`, `pnth.js`, `congress.js`, `investigation.js`, `media.js`, `market.js`, `firm.js`, `interjections.js`, `src/events/traits.js` (renamed from trait-events to avoid collision with `src/traits.js`)
- Create: `src/events/tips.js`
- Modify: `src/events/index.js`

**IMPORTANT:** This task extracts events **as-is** — no schema changes. `onChoose` conversion, `superevent` flag addition, and other unification changes happen in later tasks. This keeps each task's diff reviewable.

- [ ] **Step 1: Create `src/events/fed.js`**

Copy `FED_EVENTS` (event-pool.js lines 28-317) plus the fed faction-gated events (lines 4744-4773: `fed_informal_signal`, `fed_rate_warning`, `fed_shut_out`) plus `compound_dollar_crisis` (lines 4577-4586) into a single exported array.

File header:
```js
/* fed.js -- Federal Reserve events: FOMC decisions, rate cycles, and fed-relations gated. */

import { shiftFaction } from '../faction-standing.js';
import { hasTrait } from '../traits.js';

export const FED_EVENTS = [
    // ... all fed events verbatim from event-pool.js
];
```

Include the fed faction-gated events (`fed_informal_signal`, `fed_rate_warning`, `fed_shut_out`) and `compound_dollar_crisis` at the end of the same array.

- [ ] **Step 2: Create `src/events/macro.js`**

Copy `MACRO_EVENTS` (lines 318-945) plus compound macro one-shots: `compound_stagflation` (4483-4498), `compound_energy_war` (4566-4575), `compound_strait_war_footing` (4638-4648), `compound_khasuria_invasion` (4675-4685).

```js
/* macro.js -- Macroeconomic events: recession, inflation, trade war, energy crises. */

import { shiftFaction } from '../faction-standing.js';
import { activateRegulation, deactivateRegulation, advanceBill, getPipelineStatus } from '../regulations.js';
import { hasTrait } from '../traits.js';

export const MACRO_EVENTS = [
    // ... all macro events + macro compound one-shots
];
```

- [ ] **Step 3: Create `src/events/pnth.js`**

Copy `PNTH_EVENTS` (lines 946-1806) + `PNTH_EARNINGS_EVENTS` (lines 1808-1898) + pnth compound one-shots: `compound_pnth_war_profits` (4468-4481), `compound_pnth_perfect_storm` (4539-4552), `compound_covenant_sanctions` (4553-4564), `compound_pnth_south_america` (4599-4611), `compound_companion_intelligence` (4625-4636), `compound_aegis_war_crime` (4662-4673).

```js
/* pnth.js -- Palanthropic (PNTH) corporate events: board dynamics, products, earnings. */

import { shiftFaction } from '../faction-standing.js';
import { activateRegulation, advanceBill, getPipelineStatus } from '../regulations.js';
import { hasTrait } from '../traits.js';

export const PNTH_EVENTS = [
    // ... all PNTH + PNTH_EARNINGS + pnth compound events
];
```

- [ ] **Step 4: Create `src/events/congress.js`**

Copy `POLITICAL_EVENTS` (lines 2117-2345) + `COMPOUND_EVENTS` (lines 2567-2697) + `CONGRESSIONAL_EVENTS` (lines 2698-3476) + `FILIBUSTER_EVENTS` (lines 3477-3564) + `MIDTERM_EVENTS` (lines 3565-3614) + political compound one-shots: `compound_deregulation_rush` (4456-4466), `compound_okafor_connection` (4500-4509), `compound_constitutional_crisis` (4523-4537), `compound_big_bill_death` (4613-4623), `compound_press_crisis` (4650-4660) + political faction-gated: `political_lassiter_favor` (4777-4783), `political_okafor_olive_branch` (4786-4792), `political_bipartisan_access` (4795-4802).

```js
/* congress.js -- Congressional, political, filibuster, and midterm events. */

import { shiftFaction } from '../faction-standing.js';
import { activateRegulation, deactivateRegulation, advanceBill, getPipelineStatus } from '../regulations.js';
import { hasTrait } from '../traits.js';

export const CONGRESS_EVENTS = [
    // ... all political + compound + congressional + filibuster + midterm + political faction-gated
];
```

- [ ] **Step 5: Create `src/events/investigation.js`**

Copy `INVESTIGATION_EVENTS` (lines 2346-2566) + compound investigation one-shots: `compound_tan_has_evidence` (4511-4521), `compound_campaign_subpoena_risk` (4588-4597) + firm investigation events: `firm_congressional_subpoena` (4689-4697), `firm_crisis` (4698-4711) + `tag_scrutiny_leak` (4843-4851).

```js
/* investigation.js -- SEC investigations, congressional probes, regulatory actions. */

import { shiftFaction } from '../faction-standing.js';
import { hasTrait } from '../traits.js';

export const INVESTIGATION_EVENTS = [
    // ... all investigation + investigation compounds + firm investigation + scrutiny tag events
];
```

- [ ] **Step 6: Create `src/events/media.js`**

Copy `MEDIA_EVENTS` (lines 4026-4173) + media faction-gated: `media_tan_tip` (4715-4723), `media_continental_profile` (4725-4732), `media_hostile_profile` (4734-4742).

```js
/* media.js -- Media ecosystem events: press coverage, journalist dynamics. */

import { shiftFaction } from '../faction-standing.js';
import { hasTrait } from '../traits.js';

export const MEDIA_EVENTS = [
    // ... all media events + media faction-gated
];
```

- [ ] **Step 7: Create `src/events/market.js`**

Copy `SECTOR_EVENTS` (lines 1899-2116) + `MARKET_EVENTS` (lines 3841-4023).

```js
/* market.js -- Market structure and sector events. */

import { shiftFaction } from '../faction-standing.js';
import { activateRegulation, advanceBill, getPipelineStatus } from '../regulations.js';
import { hasTrait } from '../traits.js';

export const MARKET_EVENTS = [
    // ... all sector + market events
];
```

- [ ] **Step 8: Create `src/events/firm.js`**

Copy `NEUTRAL_EVENTS` (lines 3620-3836) + firm faction-gated: `firm_capital_cut` (4806-4812), `firm_riggs_promoted` (4815-4823), `firm_vasquez_warning` (4825-4831), `firm_capital_boost` (4833-4840) + portfolio-reactive: `portfolio_whale_whispers` (4941-4948), `portfolio_drawdown_notice` (4950-4957), `portfolio_streak_recognized` (4959-4966), `portfolio_flat_book` (4968-4975).

```js
/* firm.js -- Meridian Capital firm dynamics, neutral/flavor events, portfolio-reactive. */

import { shiftFaction } from '../faction-standing.js';
import { hasTrait } from '../traits.js';

export const FIRM_EVENTS = [
    // ... all neutral + firm faction-gated + portfolio-reactive
];
```

- [ ] **Step 9: Create `src/events/interjections.js`**

Copy `INTERJECTION_EVENTS` (lines 4176-4333).

```js
/* interjections.js -- Atmospheric interjection events (no mechanical effect). */

export const INTERJECTION_EVENTS = [
    // ... all interjection events verbatim
];
```

- [ ] **Step 10: Create `src/events/traits.js`**

Copy trait-gated events (lines 4842-4888: `tag_political_target`, `tag_media_requests`, `tag_star_poached`, `tag_quiet_advantage`) + conviction-gated events (lines 4890-4937: `conviction_insider_leak_risk`, `conviction_ghost_clean`, `conviction_profiteer_exposure`, `conviction_operator_bundler`, `conviction_leverage_contagion`). Note: `tag_scrutiny_leak` goes to investigation.js instead.

```js
/* traits.js -- Events gated on active traits and permanent convictions. */

import { shiftFaction } from '../faction-standing.js';
import { hasTrait } from '../traits.js';

export const TRAIT_EVENTS = [
    // ... all trait-gated + conviction-gated (except tag_scrutiny_leak)
];
```

**Note:** This file name collides with `src/traits.js` in parent directory, but since imports use relative paths (`../traits.js` vs `./traits.js`) there is no ambiguity.

- [ ] **Step 11: Create `src/events/tips.js`**

Copy the insider tip pool + pickTip from popup-events.js (lines 127-168) and the tip outcome events (real: event-pool.js lines 4353-4401, fake: lines 4403-4451).

```js
/* tips.js -- Insider tip system: tip pool, outcome events, and picker. */

export const INSIDER_TIPS = [
    {
        hint: 'Malhotra is going to raise the PNTH dividend at the next earnings call',
        realEvent: 'tip_dividend_hike',
        fakeEvent: 'tip_dividend_flat',
    },
    {
        hint: 'Hartley is going to pause despite the hawkish rhetoric — someone on the FOMC leaked it',
        realEvent: 'tip_fed_pause',
        fakeEvent: 'tip_fed_hike',
    },
    {
        hint: 'Dirks is about to announce a major Atlas Aegis defense contract within two weeks',
        realEvent: 'tip_contract_win',
        fakeEvent: 'tip_contract_loss',
    },
    {
        hint: 'a big short position is about to unwind — something about a margin call at a rival fund',
        realEvent: 'tip_short_squeeze',
        fakeEvent: 'tip_squeeze_fizzle',
    },
    {
        hint: 'Malhotra\'s earnings are going to blow out expectations by double digits',
        realEvent: 'tip_earnings_beat',
        fakeEvent: 'tip_earnings_miss',
    },
    {
        hint: 'there\'s an acquisition offer coming — al-Farhan\'s sovereign wealth fund',
        realEvent: 'tip_acquisition_bid',
        fakeEvent: 'tip_acquisition_denied',
    },
];

const _usedTips = new Set();

export function pickTip() {
    const available = INSIDER_TIPS.filter(t => !_usedTips.has(t.hint));
    const pool = available.length > 0 ? available : INSIDER_TIPS;
    const tip = pool[Math.floor(Math.random() * pool.length)];
    _usedTips.add(tip.hint);
    return tip;
}

export function resetUsedTips() {
    _usedTips.clear();
}

export const TIP_EVENTS = [
    // -- Insider tip outcome events (real) --
    {
        id: 'tip_dividend_hike',
        category: 'pnth_earnings',
        likelihood: 0,
        headline: 'PNTH announces surprise dividend hike — payout doubles',
        params: { mu: 0.03, theta: -0.01 },
        magnitude: 'moderate',
    },
    // ... all 12 tip outcome events (6 real + 6 fake) verbatim from event-pool.js lines 4353-4451
];
```

- [ ] **Step 12: Update `src/events/index.js` to merge all domain files**

Replace the temporary shim with the real merger:

```js
/* index.js -- Event pool registry. Merges all domain event arrays,
   provides by-id lookup, and validates followup chain integrity. */

export { PARAM_RANGES } from './param-ranges.js';
export { pickTip, resetUsedTips } from './tips.js';

import { FED_EVENTS } from './fed.js';
import { MACRO_EVENTS } from './macro.js';
import { PNTH_EVENTS } from './pnth.js';
import { CONGRESS_EVENTS } from './congress.js';
import { INVESTIGATION_EVENTS } from './investigation.js';
import { MEDIA_EVENTS } from './media.js';
import { MARKET_EVENTS } from './market.js';
import { FIRM_EVENTS } from './firm.js';
import { TIP_EVENTS } from './tips.js';
import { INTERJECTION_EVENTS } from './interjections.js';
import { TRAIT_EVENTS } from './traits.js';

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

// -- Event-by-id lookup --
let _eventById = null;

export function getEventById(id) {
    if (!_eventById) {
        _eventById = new Map();
        for (const ev of ALL_EVENTS) _eventById.set(ev.id, ev);
    }
    return _eventById.get(id) || null;
}

// -- Startup validation: followup chain integrity --
const _referencedFollowupIds = new Set();
for (const ev of ALL_EVENTS) {
    if (ev.followups) {
        for (const fu of ev.followups) _referencedFollowupIds.add(fu.id);
    }
}
for (const id of _referencedFollowupIds) {
    const ev = getEventById(id);
    if (!ev) console.warn(`[events] followup references unknown event: '${id}'`);
    else if (!ev.followupOnly) console.warn(`[events] followup target '${id}' missing followupOnly flag`);
}
for (const ev of ALL_EVENTS) {
    if (ev.followupOnly && !_referencedFollowupIds.has(ev.id)) {
        console.warn(`[events] '${ev.id}' has followupOnly but is never referenced as a followup`);
    }
}

// -- Backwards compat alias --
export const OFFLINE_EVENTS = ALL_EVENTS;
```

The `OFFLINE_EVENTS` alias keeps `events.js` working without changes until we update it in Task 5.

- [ ] **Step 13: Update `events.js` import**

In `src/events.js` line 19, the import already points at `./events/index.js` (from Task 1 Step 3). Verify that `OFFLINE_EVENTS`, `PARAM_RANGES`, and `getEventById` all resolve correctly through the new index.

- [ ] **Step 14: Delete `src/event-pool.js`**

```bash
git rm src/event-pool.js
```

- [ ] **Step 15: Verify the app loads**

Run the local server, open the browser. Check:
- No console errors about missing imports
- Dynamic mode: events fire (toasts appear)
- Events with followup chains still chain correctly
- Compound one-shots fire when conditions are met

- [ ] **Step 16: Commit**

```bash
git add src/events/ src/events.js
git add -u  # picks up the deleted event-pool.js
git commit -m "feat: extract event-pool.js into domain files under src/events/"
```

---

## Task 4: Migrate portfolio popup events into domain files

Move all ~30 portfolio popup events from `popup-events.js` into the appropriate domain files. Also extract helper functions that remain needed.

**Files:**
- Modify: `src/events/firm.js` (add most desk_* popups)
- Modify: `src/events/investigation.js` (add scrutiny_* popups)
- Modify: `src/events/congress.js` (add desk_campaign_donor, desk_midterm_pressure, desk_legacy_positioning, desk_political_donation)
- Modify: `src/events/media.js` (add desk_ft_interview, desk_media_big_win, desk_crisis_profiteer)
- Modify: `src/events/tips.js` (add desk_insider_tip, desk_analyst_info_edge)
- Modify: `src/events/index.js` (update if needed)
- Delete: `src/popup-events.js`
- Modify: `main.js` (update imports)

- [ ] **Step 1: Add portfolio popup events to `src/events/firm.js`**

Add these popup events to the `FIRM_EVENTS` array:
- `desk_compliance_short` (popup-events.js:180-234)
- `desk_suspicious_long` (236-285)
- `desk_strike_concentration` (286-326)
- `desk_extreme_leverage` (328-377)
- `desk_name_on_tape` (379-422)
- `desk_unlimited_risk` (424-473)
- `desk_bond_fomc` (476-512)
- `desk_pnth_earnings` (515-544)
- `desk_short_in_rally` (547-584)
- `desk_risk_committee` (634-684)
- `desk_md_meeting` (730-778)
- `desk_unusual_activity` (780-814)
- `desk_headhunter` (816-860)
- `desk_comeback_kid` (862-899)
- `desk_first_milestone` (901-929)
- `desk_profiting_from_misery` (686-728) — uses macro world state but is a firm/desk event
- `desk_fomc_bond_compliance` (1188-1225) — compliance-focused, desk event

Each event keeps its exact shape — `trigger`, `cooldown`, `popup: true`, `headline`, `context`, `choices`. The only change is replacing direct singleton calls in `trigger`/`context` with imports from `_helpers.js`:

```js
import {
    equity, posPrice, absStockQty, shortDirectionalNotional,
    longDirectionalNotional, bondNotional, totalOptionsNotional,
    maxStrikeConcentration, netUncoveredUpside, anyInvestigationActive,
    liveDay, computeNetDelta, computeGrossNotional, portfolio, market,
} from './_helpers.js';
import { firmThresholdMult, firmCooldownMult, firmTone, getRegLevel, shiftFaction } from '../faction-standing.js';
import { getActiveTraitIds, hasTrait } from '../traits.js';
import {
    ADV, IMPACT_THRESHOLD_100, INITIAL_CAPITAL, ROGUE_TRADING_THRESHOLD,
    QUARTERLY_CYCLE,
} from '../config.js';
```

Copy each popup event verbatim, replacing `_equity()` with `equity()`, `_shortDirectionalNotional()` with `shortDirectionalNotional()`, `_liveDay(day)` with `liveDay(day)`, etc. (dropping the underscore prefix since they're now named exports).

- [ ] **Step 2: Add scrutiny popup events to `src/events/investigation.js`**

Add these events:
- `scrutiny_press_inquiry` (popup-events.js:1313-1339)
- `scrutiny_regulatory_letter` (1340-1373)
- `scrutiny_subpoena` (1374-1399)
- `scrutiny_enforcement` (1400-1439)

Add imports from `_helpers.js` and `faction-standing.js` as needed.

- [ ] **Step 3: Add political popup events to `src/events/congress.js`**

Add these events:
- `desk_campaign_donor` (popup-events.js:935-989)
- `desk_midterm_pressure` (990-1031)
- `desk_legacy_positioning` (1033-1076)
- `desk_political_donation` (1228-1275)

Add imports from `_helpers.js` and `config.js` as needed (CAMPAIGN_START_DAY, MIDTERM_DAY, TERM_END_DAY, HISTORY_CAPACITY).

- [ ] **Step 4: Add media popup events to `src/events/media.js`**

Add these events:
- `desk_ft_interview` (popup-events.js:590-632)
- `desk_media_big_win` (1114-1143)
- `desk_crisis_profiteer` (1146-1185)

- [ ] **Step 5: Add tip popup events to `src/events/tips.js`**

Add these events:
- `desk_insider_tip` (popup-events.js:1078-1112)
- `desk_analyst_info_edge` (1278-1307)

- [ ] **Step 6: Update `main.js` imports**

Change line 53 from:
```js
import { evaluatePortfolioPopups, resetPopupCooldowns, pickTip } from './src/popup-events.js';
```
to:
```js
import { pickTip, resetUsedTips } from './src/events/tips.js';
```

`evaluatePortfolioPopups` and `resetPopupCooldowns` will be replaced in Task 5 (EventEngine changes). For now, temporarily add a local shim that imports from the domain files and evaluates triggers the old way. **Actually — it's cleaner to do this in one step with Task 5.** So for this task, keep the import from `popup-events.js` but only for `evaluatePortfolioPopups` and `resetPopupCooldowns`:

```js
import { evaluatePortfolioPopups, resetPopupCooldowns } from './src/popup-events.js';
import { pickTip, resetUsedTips } from './src/events/tips.js';
```

Then update `_resetCore` (line 1695) to also call `resetUsedTips()`:
```js
resetPopupCooldowns();  // will be removed in Task 5
resetUsedTips();
```

Wait — `resetPopupCooldowns` currently calls `_usedTips.clear()` internally. Since we're moving `pickTip` and `_usedTips` to `tips.js`, we need `resetUsedTips` called separately. For now, keep both calls. Task 5 will remove the old one.

- [ ] **Step 7: Slim down `popup-events.js` to only the evaluator**

Remove all event definitions and helpers from `popup-events.js`. Keep only:
- The `_cooldowns` object
- `resetPopupCooldowns()` (but remove the `_usedTips.clear()` call since tips moved)
- `evaluatePortfolioPopups()` — but update it to evaluate events from `ALL_EVENTS` instead of the local `PORTFOLIO_POPUPS` array

```js
/* popup-events.js -- TEMPORARY: evaluator stub during migration.
   Will be deleted in Task 5 when evaluateTriggers moves to EventEngine. */

import { ALL_EVENTS } from './events/index.js';
import { firmCooldownMult } from './faction-standing.js';
import { HISTORY_CAPACITY } from './config.js';

const _cooldowns = {};

export function resetPopupCooldowns() {
    for (const k in _cooldowns) delete _cooldowns[k];
}

function _liveDay(day) {
    return day - HISTORY_CAPACITY;
}

const _triggerPool = ALL_EVENTS.filter(e => typeof e.trigger === 'function');

export function evaluatePortfolioPopups(sim, world, portfolio, day) {
    const triggered = [];
    for (const pp of _triggerPool) {
        if (_cooldowns[pp.id] && day - _cooldowns[pp.id] < pp.cooldown * firmCooldownMult()) continue;
        if (pp.era === 'early' && _liveDay(day) > 500) continue;
        if (pp.era === 'mid'   && (_liveDay(day) < 500 || _liveDay(day) > 800)) continue;
        if (pp.era === 'late'  && _liveDay(day) < 800) continue;
        try {
            if (pp.trigger(sim, world, portfolio)) {
                _cooldowns[pp.id] = day;
                triggered.push(pp);
            }
        } catch (e) { /* guard */ }
    }
    return triggered;
}
```

- [ ] **Step 8: Verify the app loads**

Run local server, open browser. Check:
- No console errors
- Dynamic mode: portfolio popup events still fire (trigger desk_* popups by taking extreme positions)
- Insider tips still work (desk_insider_tip fires, tips schedule followups)
- Scrutiny popups fire when regulatory exposure is high

- [ ] **Step 9: Commit**

```bash
git add src/events/ src/popup-events.js main.js
git commit -m "feat: migrate portfolio popup events into domain files"
```

---

## Task 5: Add `evaluateTriggers` to EventEngine and clean up

Absorb the trigger evaluation into EventEngine. Delete the slim `popup-events.js` stub. Update main.js.

**Files:**
- Modify: `src/events.js`
- Modify: `main.js`
- Delete: `src/popup-events.js`

- [ ] **Step 1: Add trigger infrastructure to EventEngine**

In `src/events.js`, add the `firmCooldownMult` import:

```js
import { firmCooldownMult } from './faction-standing.js';
```

In the `EventEngine` constructor (after the `this._pools` block around line 58), add:

```js
// Portfolio-triggered event pool (evaluated daily, not Poisson-drawn)
this._triggerPool = ALL_EVENTS.filter(e => typeof e.trigger === 'function');
this._triggerCooldowns = {};
```

- [ ] **Step 2: Add `evaluateTriggers` method**

Add this method to the `EventEngine` class, after the `resetOneShot` method (around line 264):

```js
/** Evaluate portfolio-triggered events. Returns array of triggered event objects. */
evaluateTriggers(sim, day) {
    const triggered = [];
    for (const ev of this._triggerPool) {
        const cd = this._triggerCooldowns[ev.id];
        if (cd && day - cd < ev.cooldown * firmCooldownMult()) continue;
        const liveDay = day - HISTORY_CAPACITY;
        if (ev.era === 'early' && liveDay > 500) continue;
        if (ev.era === 'mid'   && (liveDay < 500 || liveDay > 800)) continue;
        if (ev.era === 'late'  && liveDay < 800) continue;
        try {
            if (ev.trigger(sim, this.world, this._playerCtx)) {
                this._triggerCooldowns[ev.id] = day;
                triggered.push(ev);
            }
        } catch (e) { /* guard — portfolio state may be inconsistent mid-reset */ }
    }
    return triggered;
}

/** Reset trigger cooldowns (call on game reset). */
resetTriggerCooldowns() {
    this._triggerCooldowns = {};
}
```

- [ ] **Step 3: Update EventEngine `reset()` to clear trigger cooldowns**

In the `reset()` method (around line 234), add after `this._firedOneShot.clear();`:

```js
this._triggerCooldowns = {};
```

- [ ] **Step 4: Rename `OFFLINE_EVENTS` to `ALL_EVENTS` in events.js**

In `src/events.js`, change the import (line 19) from:
```js
import { OFFLINE_EVENTS, PARAM_RANGES, getEventById } from './events/index.js';
```
to:
```js
import { ALL_EVENTS, PARAM_RANGES, getEventById } from './events/index.js';
```

Then find-and-replace `OFFLINE_EVENTS` → `ALL_EVENTS` throughout `events.js` (appears in the constructor `_pools` filter expressions, lines 59-64).

- [ ] **Step 5: Update main.js imports**

Replace:
```js
import { evaluatePortfolioPopups, resetPopupCooldowns } from './src/popup-events.js';
import { pickTip, resetUsedTips } from './src/events/tips.js';
```

With:
```js
import { pickTip, resetUsedTips } from './src/events/tips.js';
```

- [ ] **Step 6: Update main.js trigger evaluation call site**

Replace line 1316-1317:
```js
const portfolioPopups = evaluatePortfolioPopups(sim, eventEngine.world, portfolio, sim.day);
for (const pp of portfolioPopups) _popupQueue.push(pp);
```

With:
```js
const portfolioPopups = eventEngine.evaluateTriggers(sim, sim.day);
for (const pp of portfolioPopups) _popupQueue.push(pp);
```

- [ ] **Step 7: Update `_resetCore` in main.js**

Replace line 1695:
```js
resetPopupCooldowns();
```

With:
```js
if (eventEngine) eventEngine.resetTriggerCooldowns();
resetUsedTips();
```

- [ ] **Step 8: Delete `src/popup-events.js`**

```bash
git rm src/popup-events.js
```

- [ ] **Step 9: Remove `OFFLINE_EVENTS` alias from index.js**

In `src/events/index.js`, remove the line:
```js
export const OFFLINE_EVENTS = ALL_EVENTS;
```

- [ ] **Step 10: Verify the app loads**

Run local server, open browser. Check:
- No console errors
- Dynamic mode: portfolio popup events still fire correctly
- Game reset clears popup cooldowns (start game, trigger a popup, reset, verify it can fire again)

- [ ] **Step 11: Commit**

```bash
git add src/events.js src/events/index.js main.js
git add -u  # picks up deleted popup-events.js
git commit -m "feat: absorb portfolio trigger evaluation into EventEngine"
```

---

## Task 6: Convert `onChoose` to `factionShifts` and add `factionShifts` processing

Replace all dead `onChoose` callbacks with declarative `factionShifts` arrays, and add processing for them in main.js.

**Files:**
- Modify: `main.js` (add factionShifts processing to choice handler)
- Modify: `src/events/firm.js`, `investigation.js`, `congress.js`, `media.js`, `tips.js` (convert onChoose → factionShifts on each popup event)

- [ ] **Step 1: Add `factionShifts` processing to main.js choice handler**

In main.js, inside the popup choice callback (around line 885-1040), add this block after the `choice.effects` processing (after line 893):

```js
if (choice.factionShifts) {
    for (const fs of choice.factionShifts) {
        let value = fs.value;
        if (fs.when?.hasTrait && hasTrait(fs.when.hasTrait)) value += (fs.bonus || 0);
        shiftFaction(fs.faction, value);
    }
}
```

- [ ] **Step 2: Convert all `onChoose` in `src/events/firm.js`**

For every choice that has `onChoose`, remove the `onChoose` property and add the equivalent `factionShifts` array. Example conversions:

`desk_compliance_short`, choice "Ignore the email":
```js
// Remove: onChoose: () => { shiftFaction('firmStanding', -3); },
// Add:
factionShifts: [{ faction: 'firmStanding', value: -3 }],
```

`desk_extreme_leverage`, choice "Ignore the margin call":
```js
// Remove: onChoose: () => { shiftFaction('firmStanding', -5); },
// Add:
factionShifts: [{ faction: 'firmStanding', value: -5 }],
```

`desk_unlimited_risk`, choice "Close all options":
```js
// Remove: onChoose: () => { shiftFaction('firmStanding', -3); },
// Add:
factionShifts: [{ faction: 'firmStanding', value: -3 }],
```

`desk_risk_committee`, choice "Cooperate":
```js
// Remove: onChoose: () => { shiftFaction('firmStanding', +5); },
// Add:
factionShifts: [{ faction: 'firmStanding', value: 5 }],
```

`desk_risk_committee`, choice "Refuse":
```js
// Remove: onChoose: () => { shiftFaction('firmStanding', -8); },
// Add:
factionShifts: [{ faction: 'firmStanding', value: -8 }],
```

`desk_unusual_activity`, choice "Cooperate fully":
```js
// Remove: onChoose: () => { shiftFaction('firmStanding', +2); shiftFaction('regulatoryExposure', -2); },
// Add:
factionShifts: [
    { faction: 'firmStanding', value: 2 },
    { faction: 'regulatoryExposure', value: -2 },
],
```

`desk_unusual_activity`, choice "Lawyer up":
```js
// Remove: onChoose: () => { shiftFaction('firmStanding', -3); shiftFaction('regulatoryExposure', hasTrait('under_scrutiny') ? +6 : +3); },
// Add:
factionShifts: [
    { faction: 'firmStanding', value: -3 },
    { faction: 'regulatoryExposure', value: 3, when: { hasTrait: 'under_scrutiny' }, bonus: 3 },
],
```

Apply the same pattern to ALL `onChoose` instances in firm.js. The full list includes choices in: `desk_compliance_short`, `desk_extreme_leverage`, `desk_unlimited_risk`, `desk_bond_fomc`, `desk_risk_committee`, `desk_profiting_from_misery`, `desk_md_meeting`, `desk_unusual_activity`, `desk_headhunter`, `desk_comeback_kid`.

- [ ] **Step 3: Convert all `onChoose` in other domain files**

Apply the same conversion to:

**investigation.js** — `scrutiny_press_inquiry`, `scrutiny_regulatory_letter`, `scrutiny_subpoena`, `scrutiny_enforcement`

**congress.js** — `desk_campaign_donor`, `desk_political_donation`

**media.js** — `desk_ft_interview`, `desk_media_big_win`, `desk_crisis_profiteer`

Every `onChoose` becomes the equivalent `factionShifts` array. Remove all `onChoose` properties.

- [ ] **Step 4: Verify no `onChoose` remains**

```bash
grep -r "onChoose" src/events/
```

Expected: no matches.

- [ ] **Step 5: Verify the app loads**

Run local server. Test a portfolio popup (take a large short position in Dynamic mode). Verify that when you choose an option with faction shifts (e.g., "Ignore the email"), the faction standing actually changes. Check the standings panel.

**Note:** This is a behavior change — these shifts weren't executing before. If game feel seems off during playtesting, adjust values later. The migration itself is mechanical.

- [ ] **Step 6: Commit**

```bash
git add main.js src/events/
git commit -m "feat: replace dead onChoose callbacks with declarative factionShifts"
```

---

## Task 7: Migrate hardcoded playerFlag special cases to declarative fields

Move the hardcoded `if (choice.playerFlag === '...')` branches from main.js into the choice objects themselves.

**Files:**
- Modify: `main.js` (remove hardcoded branches, add `regulatoryAction`/`cashPenalty` processing)
- Modify: `src/events/tips.js` (add `factionShifts` to insider tip choices)
- Modify: `src/events/investigation.js` (add `regulatoryAction`/`cashPenalty` to SEC choices)

- [ ] **Step 1: Add `regulatoryAction` and `cashPenalty` processing to main.js**

In the choice handler (after the `factionShifts` block), add:

```js
if (choice.cashPenalty) {
    portfolio.cash -= choice.cashPenalty;
}
if (choice.regulatoryAction === 'settle') {
    settleRegulatory();
} else if (choice.regulatoryAction === 'cooperate') {
    cooperateRegulatory();
}
```

- [ ] **Step 2: Move insider tip faction shifts to choice objects**

In `src/events/tips.js`, find the choices for `desk_insider_tip` that have `playerFlag: 'pursued_insider_tip'` or `playerFlag: 'pursued_pnth_tip'` and add:

```js
factionShifts: [{ faction: 'regulatoryExposure', value: 13 }],
```

For `desk_analyst_info_edge` choices with `playerFlag: 'pursued_analyst_tip'`:

```js
factionShifts: [{ faction: 'regulatoryExposure', value: 10 }],
```

- [ ] **Step 3: Move SEC action fields to choice objects**

In `src/events/investigation.js`, find the `scrutiny_enforcement` event choices:

For the choice with `playerFlag: 'settled_sec'`, add:
```js
cashPenalty: 2000,
regulatoryAction: 'settle',
```

For the choice with `playerFlag: 'informed_sec'`, add:
```js
regulatoryAction: 'cooperate',
```

For the choice with `playerFlag: 'fought_sec'`, add:
```js
factionShifts: [{ faction: 'regulatoryExposure', value: 13 }],
```

- [ ] **Step 4: Remove hardcoded playerFlag branches from main.js**

Remove these blocks from the choice handler (approximately lines 897-911):

```js
// DELETE these blocks:
if (choice.playerFlag === 'pursued_insider_tip' || choice.playerFlag === 'pursued_pnth_tip') {
    shiftFaction('regulatoryExposure', 13);
} else if (choice.playerFlag === 'pursued_analyst_tip') {
    shiftFaction('regulatoryExposure', 10);
}
if (choice.playerFlag === 'settled_sec') {
    portfolio.cash -= 2000;
    settleRegulatory();
}
if (choice.playerFlag === 'informed_sec') {
    cooperateRegulatory();
}
if (choice.playerFlag === 'fought_sec') {
    shiftFaction('regulatoryExposure', 13);
}
```

These are now handled by `factionShifts`, `cashPenalty`, and `regulatoryAction` on the choice objects.

- [ ] **Step 5: Verify the app loads**

Run local server. The insider tip and SEC enforcement popups should behave identically — faction shifts, cash deductions, and regulatory actions all fire from the declarative fields now.

- [ ] **Step 6: Commit**

```bash
git add main.js src/events/tips.js src/events/investigation.js
git commit -m "feat: migrate hardcoded playerFlag branches to declarative choice fields"
```

---

## Task 8: Unify superevent detection

Move superevent status from the hardcoded `SUPEREVENT_IDS` Set to the event objects themselves.

**Files:**
- Modify: `main.js` (delete `SUPEREVENT_IDS`, simplify superevent check)
- Modify: `src/events/congress.js` (add `superevent: true` to compound one-shots)
- Modify: `src/events/macro.js` (add `superevent: true`)
- Modify: `src/events/pnth.js` (add `superevent: true`)
- Modify: `src/events/fed.js` (add `superevent: true`)
- Modify: `src/events/investigation.js` (add `superevent: true`)

- [ ] **Step 1: Add `superevent: true` to all events that were in SUPEREVENT_IDS**

The current `SUPEREVENT_IDS` contains:
- `midterm_election_fed_gain`, `midterm_election_fed_hold`, `midterm_election_fed_loss_house`, `midterm_election_fed_loss_both` — these are inline events generated in `events.js` `_onMidterm`, they already have `superevent: true`.
- `compound_stagflation` → `src/events/macro.js`
- `compound_constitutional_crisis` → `src/events/congress.js`
- `compound_pnth_perfect_storm` → `src/events/pnth.js`
- `compound_dollar_crisis` → `src/events/fed.js`
- `compound_energy_war` → `src/events/macro.js`
- `scrutiny_enforcement` → `src/events/investigation.js`

Add `superevent: true` to each of these events in their respective domain files. Also add it to `firm_crisis` in `src/events/investigation.js` (it already has `superevent: true` and `crisisBriefing: true` from the old event-pool.js).

The old heuristic also treated any `magnitude === 'major' && id.startsWith('compound_')` as a superevent. Review all compound one-shots and decide: these major compounds should also get `superevent: true` since the heuristic was catching them. Add it to:
- `compound_deregulation_rush` (congress.js)
- `compound_pnth_war_profits` (pnth.js)
- `compound_tan_has_evidence` (investigation.js)
- `compound_companion_intelligence` (pnth.js)
- `compound_aegis_war_crime` (pnth.js)
- `compound_khasuria_invasion` (macro.js)
- `compound_strait_war_footing` (macro.js)
- `compound_big_bill_death` (congress.js)
- `compound_press_crisis` (congress.js)

Minor-magnitude compounds (`compound_okafor_connection`, `compound_covenant_sanctions`, `compound_campaign_subpoena_risk`, `compound_pnth_south_america`) were NOT caught by the heuristic — leave them without `superevent: true`.

- [ ] **Step 2: Simplify superevent detection in main.js**

Replace lines 129-135 (SUPEREVENT_IDS definition):
```js
// DELETE:
const SUPEREVENT_IDS = new Set([
    'midterm_election_fed_gain', 'midterm_election_fed_hold',
    'midterm_election_fed_loss_house', 'midterm_election_fed_loss_both',
    'compound_stagflation', 'compound_constitutional_crisis',
    'compound_pnth_perfect_storm', 'compound_dollar_crisis',
    'compound_energy_war', 'scrutiny_enforcement',
]);
```

Replace lines 871-872:
```js
const isSuperevent = SUPEREVENT_IDS.has(event.id) ||
    (event.magnitude === 'major' && event.id?.startsWith('compound_'));
```
With:
```js
const isSuperevent = !!event.superevent;
```

- [ ] **Step 3: Verify the app loads**

Run local server. In Dynamic mode, advance the game to trigger a compound event or midterm election. Verify:
- Superevent chord stab plays
- Full-screen popup styling applies (`.superevent` class on overlay)
- Sim parameters update immediately (not deferred)

- [ ] **Step 4: Commit**

```bash
git add main.js src/events/
git commit -m "feat: move superevent detection from hardcoded Set to event.superevent flag"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (project root for shoals)

- [ ] **Step 1: Update architecture section**

In `CLAUDE.md`, update the architecture section to reflect the new file structure. Key changes:

Replace the event-pool.js and popup-events.js references in the architecture paragraph with:

```
**Event system** (`src/events/` directory): Domain-split event definitions. Each file (fed.js, macro.js, pnth.js, congress.js, investigation.js, media.js, market.js, firm.js, tips.js, interjections.js, traits.js) exports a single array of event objects. `index.js` merges all pools, provides by-id lookup and followup chain validation. `_helpers.js` provides portfolio calculation helpers for trigger functions. `param-ranges.js` exports canonical parameter clamping ranges.
```

Update the narrative systems paragraph to replace `event-pool.js (~350 toast events...)` with reference to `src/events/` directory files.

Update the "Do NOT Re-add" section:
- Add: `onChoose` on popup event choices — use `factionShifts` instead
- Add: `SUPEREVENT_IDS` set in main.js — use `superevent: true` on the event object
- Add: `event-pool.js` / `popup-events.js` as monolithic files — events live in `src/events/*.js`

Update the "Semantic Traps" section:
- Add: `trigger` (portfolio-triggered, daily eval) vs `when` (world-state eligibility guard) — events with `trigger` are never Poisson-drawn
- Add: `factionShifts` on choices are additive — conditional bonuses (`when.hasTrait`) add to the base `value`, not replace it

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for unified event system under src/events/"
```

---

## Task 10: Final cleanup and verification

- [ ] **Step 1: Verify no stale imports remain**

```bash
grep -rn "event-pool" src/ main.js
grep -rn "popup-events" src/ main.js
grep -rn "OFFLINE_EVENTS" src/ main.js
grep -rn "SUPEREVENT_IDS" main.js
grep -rn "onChoose" src/
grep -rn "resetPopupCooldowns" src/ main.js
grep -rn "evaluatePortfolioPopups" src/ main.js
```

All should return zero matches (except possibly in comments or docs).

- [ ] **Step 2: Verify event count consistency**

Open browser console, run:
```js
import('./src/events/index.js').then(m => console.log('Total events:', m.ALL_EVENTS.length))
```

Compare against the old count. The total should be the same as before (all events from the old `OFFLINE_EVENTS` array plus all portfolio popup events from `PORTFOLIO_POPUPS`).

- [ ] **Step 3: Smoke test all event categories**

In Dynamic mode:
- Advance through ~50 days — verify toast events fire across categories
- Take extreme positions — verify desk_* popups fire
- Verify followup chains work (fed_signals_hike → fed_25bps_hike)
- Verify superevent styling on compound events
- Reset game — verify all state clears cleanly

- [ ] **Step 4: Commit final cleanup if any fixes were needed**

```bash
git add -A
git commit -m "chore: final cleanup for event system unification"
```
