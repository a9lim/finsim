# Legislative Process Design

Overhaul the regulation system so that regulations are exclusively activated and deactivated by narrative events, not silent condition checks. Congress should feel like a living entity whose legislative process the player observes through event headlines and whose outcomes reshape their trading environment.

## Context

### Current State

`regulations.js` defines 11 regulations, each with a `condition(world, congress)` predicate. Every end-of-day, `evaluateRegulations(world)` re-checks all 11 conditions and silently toggles regulations on/off. A generic toast ("Regulation enacted: X") is the only player-facing signal. This creates several problems:

- Regulations appear unceremoniously with no narrative lead-up
- The player has no awareness that legislation was being debated
- A narrative event (e.g., "Financial Freedom Act passes") and its corresponding regulation may fire at different times or not at all
- Every playthrough sees the same regulations activate given the same world state — no emergent variation

### Design Goal

Regulations should emerge organically from each playthrough's unique narrative path. The player is an experienced trader observing Congress, not a participant (testifying system planned separately). Lobbying actions and faction standing are the indirect levers that shape legislative outcomes.

## Regulation Taxonomy

Two types, mirroring the permanent/dynamic split in `traits.js`:

### Legislative (Permanent)

Congressional bills that go through a multi-step legislative process. Once passed, they persist for the rest of the game unless explicitly repealed by a separate event chain.

| Regulation | Bill Name | Notes |
|---|---|---|
| `transaction_tax` | Okafor-Whitfield Revenue Package | Farmer-Labor initiative |
| `deregulation_act` | Financial Freedom Act (Lassiter-Tao) | Federalist initiative |
| `trade_war_tariffs` | Serican Reciprocal Tariff Act | Bipartisan hawk initiative |
| `antitrust_scrutiny` | Digital Markets Accountability Act | Farmer-Labor initiative |
| `campaign_finance` | Campaign Finance Reform Act | Tied to election cycle |

### Executive/Fed (Dynamic)

Emergency orders, Fed policy decisions, and executive actions. These have a set duration in trading days and auto-expire unless renewed by a follow-up event.

| Regulation | Authority | Default Duration | Notes |
|---|---|---|---|
| `short_sale_ban` | SEC emergency powers | 90 days | Recession-triggered |
| `rate_ceiling` | White House executive guidance | 120 days | Hartley vacancy |
| `qe_floor` | Fed policy | 180 days | Renewable |
| `sanctions_compliance` | Executive order | 120 days | Serica tensions |
| `oil_emergency` | Clearinghouse directive | 60 days | Strait crisis |
| `filibuster_uncertainty` | N/A (procedural) | N/A | Special case — activated/deactivated directly by existing filibuster chain events, no duration timer |

## Regulation Data Model

### Updated `REGULATIONS` Array

Remove `condition` from all entries. Add `type` and `duration`:

```js
{
    id: 'deregulation_act',
    name: 'Financial Freedom Act (Lassiter-Tao)',
    description: '...',
    color: 'var(--ext-orange)',
    type: 'legislative',       // NEW — 'legislative' | 'executive'
    effects: { marginMult: 0.8, rogueThresholdMult: 0.85 },
    // condition: REMOVED
}

{
    id: 'short_sale_ban',
    name: 'Emergency Short-Sale Ban',
    description: '...',
    color: 'var(--ext-red)',
    type: 'executive',         // NEW
    duration: 90,              // NEW — trading days, only for executive type
    effects: { shortStockDisabled: true },
}
```

### Pipeline State

New internal state tracking both pending bills and active regulations:

```js
const _pipeline = new Map();
// id -> { status, remainingDays }
// status: 'introduced' | 'committee' | 'floor' | 'active' | 'failed' | 'expired' | 'repealed'
// remainingDays: number | null (null for legislative, countdown for executive)
```

`_active` Map is retained for fast effect lookups (only entries with `status === 'active'`).

## API Changes

### Removed

- `evaluateRegulations(world)` — deleted entirely. No more condition-based activation.

### New Functions

```js
/** Advance a bill's pipeline status. Used by event effects. */
export function advanceBill(id, status)
// Sets _pipeline entry to the given status.
// If status === 'active', also adds to _active map.
// If status is 'failed' | 'repealed', removes from _pipeline and _active.
// For executive type entering 'active': sets remainingDays from regulation's duration.

/** Activate a regulation directly (shorthand for executive/Fed actions). */
export function activateRegulation(id, customDuration)
// Sets pipeline status to 'active'. For executive type, uses customDuration
// or falls back to the regulation's default duration.
// For legislative type, customDuration is ignored (null remainingDays).

/** Deactivate a regulation directly. */
export function deactivateRegulation(id)
// Removes from _active and _pipeline.

/** Tick down executive regulation timers. Called once per day. */
export function tickRegulations()
// Returns { expired: string[] } — IDs of regulations that hit 0 remaining days.
// Expired regulations are removed from _active but kept in _pipeline as 'expired'.

/** Get pipeline entries for UI display. */
export function getRegulationPipeline()
// Returns array of { id, name, color, type, status, remainingDays } for all
// entries in _pipeline (both pending bills and active regulations).
```

### Unchanged

- `getRegulationEffect(effectKey, defaultVal)` — unchanged, still reads from `_active`
- `getActiveRegulations()` — unchanged
- `getRegulation(id)` — unchanged
- `resetRegulations()` — updated to also clear `_pipeline`

## Legislative Event Chains

Each legislative regulation gets a multi-step event chain in `event-pool.js`. The chain structure follows the Big Beautiful Bill pattern: introduction → debate/color events → vote with weighted branching.

### Chain Template

For a bill like the Financial Freedom Act:

1. **Introduction event** — "Lassiter introduces the Financial Freedom Act on the Senate floor..."
   - `effects: (world) => { advanceBill('deregulation_act', 'introduced'); }`
   - `when`: gated on political conditions (e.g., `congress.trifecta`)
   - `followups`: committee event

2. **Committee event** — "Senate Banking Committee begins markup of the Financial Freedom Act..."
   - `effects: (world) => { advanceBill('deregulation_act', 'committee'); }`
   - `followups`: 1-3 color events + floor vote event

3. **Color events** (0-2, optional followups) — Debate headlines, faction reactions, media coverage. No pipeline advancement, just narrative texture. Gated on `getPipelineStatus('deregulation_act') === 'committee'`.

4. **Floor vote event** — Two weighted branches:
   - **Pass branch**: `effects: (world) => { advanceBill('deregulation_act', 'active'); }` + appropriate `params` (sim deltas) + faction shifts
   - **Fail branch**: `effects: (world) => { advanceBill('deregulation_act', 'failed'); }` + different params/faction shifts
   - Branch weights influenced by `congressHelpers` (trifecta, seat counts), `election.lobbyMomentum`, faction standing

### Vote Outcome Weighting

Vote events use `likelihood` functions that make outcomes feel politically grounded:

```js
// Example: Financial Freedom Act pass branch
likelihood: (sim, world, congress) => {
    let w = congress.trifecta ? 3 : 0.5;
    w *= (1 + (world.election.lobbyMomentum || 0) * 0.15);
    return w;
},
```

This means the same bill has very different odds depending on the political landscape the player's game has produced — without the player directly voting.

### Specific Bill Chains

**Financial Freedom Act (Lassiter-Tao)** — `deregulation_act`
- Gate: Federalist trifecta or strong Federalist Senate
- Path: Introduction → Banking Committee → floor color (Reyes opposition, Haines swing vote drama) → vote
- Pass: margin loosened, rogue threshold down
- Repeal chain: gated on F-L controlling both chambers post-midterm

**Okafor-Whitfield Revenue Package** — `transaction_tax`
- Gate: F-L controls at least one chamber
- Path: Introduction → Finance Committee → floor color (Lassiter filibuster threat) → vote
- Pass: spread widened
- Repeal chain: gated on Federalist trifecta

**Serican Reciprocal Tariff Act** — `trade_war_tariffs`
- Gate: `tradeWarStage >= 1` (tensions rising)
- Path: Introduction (bipartisan hawk coalition) → Foreign Relations Committee → floor color → vote
- Pass: spread + borrow cost up
- Modification chain: possible escalation/de-escalation follow-ups tied to `sericaRelations`

**Digital Markets Accountability Act** — `antitrust_scrutiny`
- Gate: PNTH controversies (`companionScandal >= 1` or `aegisControversy >= 1`)
- Path: Introduction → Commerce Committee → floor color (Whittaker extraction, tech lobby pushback) → vote
- Pass: spread widened on PNTH-linked instruments

**Campaign Finance Reform Act** — `campaign_finance`
- Gate: `election.primarySeason`
- Path: Introduction → Rules Committee → floor color → vote
- Pass: empty effects (narrative weight only, constrains lobbying narrative)

### Existing Chain Integration

The **Big Beautiful Bill** filibuster chain already has the right structure. Wire its terminal events into the new system:

- `filibuster_ends_bill_passes`: already sets `bigBillStatus = 3`. No regulation activation needed (it's an omnibus, not a trading regulation).
- `filibuster_uncertainty` regulation: activated by `big_bill_senate_debate` (which sets `filibusterActive = true`), deactivated by `filibuster_ends_bill_passes` / `filibuster_ends_bill_dies`. These events call `activateRegulation('filibuster_uncertainty')` and `deactivateRegulation('filibuster_uncertainty')` directly. No duration timer — it's procedural, not time-limited.

## Executive/Fed Mini-Chains

Executive regulations get 1-2 event chains. The announcement IS the activation in most cases.

### Short-Sale Ban

- Gate: `geopolitical.recessionDeclared` (set by existing recession events)
- Single event: "SEC invokes emergency authority — short stock sales prohibited effective immediately. Duration: 90 trading days."
- `effects: (world) => { activateRegulation('short_sale_ban'); }`
- Optional renewal followup at ~day 80: "SEC extends short-sale ban another 60 days" (re-calls `activateRegulation` with fresh duration)
- Expiry is automatic via `tickRegulations()`

### White House Rate Ceiling

- Gate: `fed.hartleyFired && !fed.vaneAppointed`
- Announcement event → activation event (2-step, ~5 day gap)
- Duration: 120 days or until `fed.vaneAppointed` (whichever first — Vane appointment event calls `deactivateRegulation`)

### QE Floor

- Gate: `fed.qeActive` (set by existing Fed events)
- Single activation event when Fed announces QE
- Duration: 180 days, renewable

### Sanctions Compliance

- Gate: `geopolitical.sanctionsActive`
- Announcement event when sanctions imposed
- Duration: 120 days, renewable if tensions persist

### Oil Emergency Margins

- Gate: `geopolitical.oilCrisis`
- Single event: clearinghouse announcement
- Duration: 60 days

### Trigger Integration

Executive/Fed regulations are activated by events that *already exist* in `event-pool.js` — the ones that set `recessionDeclared`, `sanctionsActive`, `oilCrisis`, etc. We add `activateRegulation()` calls to those existing event effects rather than creating parallel chains.

## UI: `_updateRegulationDisplay()`

Renders from `getRegulationPipeline()`. Each entry shows name + compact status:

| Pipeline Status | Display Format | Example |
|---|---|---|
| `introduced` | `Name — Introduced` | `FFA — Introduced` |
| `committee` | `Name — Committee` | `Tariff Act — Committee` |
| `floor` | `Name — Floor` | `Revenue Pkg — Floor` |
| `active` (legislative) | `Name — Active` | `FFA — Active` |
| `active` (executive) | `Name — Xmo` | `QE Floor — 6mo` |
| `active` (executive, <30d) | `Name — <1mo` | `Short-Sale Ban — <1mo` |

Duration display converts trading days to approximate months (÷21). Color from the regulation's `color` property. Items sorted: active first, then pipeline by status progression.

Failed/expired/repealed entries are removed from the display (they're historical, not actionable for a trader).

## Changes by File

### `regulations.js` — Rewrite

- Remove all `condition` predicates from `REGULATIONS`
- Add `type` and `duration` fields
- Add `_pipeline` Map
- New exports: `advanceBill`, `activateRegulation`, `deactivateRegulation`, `tickRegulations`, `getRegulationPipeline`, `getPipelineStatus`
- Delete `evaluateRegulations`
- Update `resetRegulations` to clear `_pipeline`
- `getRegulationEffect` and `getActiveRegulations` unchanged

### `event-pool.js` — New Event Chains

- ~40-60 new events across 5 legislative bill chains (introduction, committee, color, vote pass/fail, repeal)
- Add `activateRegulation()` / `deactivateRegulation()` calls to existing executive/Fed events that set the relevant world state flags
- New helper: `getPipelineStatus` imported from `regulations.js` for `when` guards

### `main.js` — Wiring Changes

- Replace `evaluateRegulations(eventEngine.world)` call with `tickRegulations()` in `_onDayComplete`
- Handle expired regulation toasts from `tickRegulations()` return value
- Update `_updateRegulationDisplay()` to render from `getRegulationPipeline()`
- Remove `evaluateRegulations` import, add new imports

### `events.js` — No Structural Changes

Existing pulse/followup/one-shot system drives the legislative chains. No changes to `EventEngine`.

### `world-state.js` — No Changes

Congress/fed/geopolitical state still mutated by events. It's just no longer read by regulation conditions.

## Migration

The 11 existing regulations map as follows:

| Current ID | Type | Migration |
|---|---|---|
| `transaction_tax` | legislative | New bill chain |
| `deregulation_act` | legislative | New bill chain |
| `trade_war_tariffs` | legislative | New bill chain |
| `antitrust_scrutiny` | legislative | New bill chain |
| `campaign_finance` | legislative | New bill chain |
| `short_sale_ban` | executive | Wire to existing recession events |
| `rate_ceiling` | executive | Wire to existing Hartley/Vane events |
| `qe_floor` | executive | Wire to existing QE events |
| `sanctions_compliance` | executive | Wire to existing sanctions events |
| `oil_emergency` | executive | Wire to existing oil crisis events |
| `filibuster_uncertainty` | special | Wire to existing filibuster chain |

No new regulation IDs are introduced. All existing `getRegulationEffect` call sites remain valid — the effects are identical, only the activation path changes.
