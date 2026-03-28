# Plan 2: Event System Unification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold compound triggers into the main event system by widening the event guard signature, adding one-shot event support, and migrating all 18 compound triggers to the event pool.

**Architecture:** Widen `when()` guards from `(sim, world, congress)` to `(sim, world, congress, ctx)` where `ctx` exposes `playerChoices`, `factions`, and `activeRegIds`. Add `oneShot: true` support with a `_firedOneShot` Set. Add a deterministic pre-pass in `maybeFire()` before the Poisson draw. Migrate all compound triggers to event-pool.js. Delete compound-triggers.js.

**Tech Stack:** Vanilla ES6 modules, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-26-rpg-depth-design.md` — Section 1 (Event System Unification)

**Prerequisite:** Plan 1 (faction-standing foundation) must be complete.

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/events.js` | Widen guard signature, add oneShot + pre-pass, add setPlayerContext() |
| Modify | `src/event-pool.js` | Absorb 18 compound triggers as oneShot events |
| Modify | `main.js` | Remove compound-triggers import/calls, add setPlayerContext() |
| Delete | `src/compound-triggers.js` | Replaced by oneShot events in event-pool.js |

---

### Task 1: Add player context and oneShot tracking to EventEngine

**Files:**
- Modify: `src/events.js`

- [ ] **Step 1: Read the EventEngine constructor and maybeFire method**

Read `src/events.js` focusing on the constructor (lines 33-71) and `maybeFire()` (lines 77-143).

- [ ] **Step 2: Add player context state to the constructor**

In the constructor, after the existing property initializations, add:

```javascript
    this._playerCtx = { playerChoices: {}, factions: {}, activeRegIds: [] };
    this._firedOneShot = new Set();
```

- [ ] **Step 3: Add setPlayerContext method**

Add a new method to the EventEngine class (after the constructor):

```javascript
/** Set player context for event guard evaluation. Call once per day before maybeFire(). */
setPlayerContext(playerChoices, factions, activeRegIds) {
    this._playerCtx = { playerChoices, factions, activeRegIds };
}
```

- [ ] **Step 4: Add resetOneShot to the class**

Add a method to clear one-shot tracking (called on game reset):

```javascript
/** Clear one-shot fired tracking for new game. */
resetOneShot() {
    this._firedOneShot.clear();
}
```

- [ ] **Step 5: Commit**

```bash
git add src/events.js
git commit -m "feat: add player context and oneShot tracking to EventEngine"
```

---

### Task 2: Widen guard signature and add one-shot pre-pass

**Files:**
- Modify: `src/events.js`

- [ ] **Step 1: Update _filterEligible to pass ctx**

In `_filterEligible()` (around lines 433-447), find the line that checks the `when` guard:

```javascript
return !ev.when || ev.when(sim, this.world, congress);
```

Change to:

```javascript
return !ev.when || ev.when(sim, this.world, congress, this._playerCtx);
```

This is backward-compatible — existing `when()` functions that take 3 args simply ignore the 4th.

- [ ] **Step 2: Update the followup when() call site**

In `_checkFollowups()` (around line 371), there is a second `when()` call site:

```javascript
event.when(sim, this.world, congress)
```

Update to:

```javascript
event.when(sim, this.world, congress, this._playerCtx)
```

These are the only two `when()` call sites in events.js.

- [ ] **Step 3: Add one-shot pre-pass to maybeFire()**

At the beginning of `maybeFire()`, before the pulse schedule checks, add the one-shot deterministic pre-pass. **This must return early** — if a one-shot fires, no other event should fire on the same day. Reuse `_filterEligible` rather than duplicating its era/minDay/maxDay logic:

```javascript
    // Deterministic pre-pass: fire eligible one-shot events
    const oneShotCandidates = this._pools.random.filter(ev =>
        ev.oneShot && !this._firedOneShot.has(ev.id)
    );
    if (oneShotCandidates.length > 0) {
        const eligible = this._filterEligible(oneShotCandidates, sim);
        if (eligible.length > 0) {
            this._firedOneShot.add(eligible[0].id);
            return _partition([this._fireEvent(eligible[0], sim, day, 0, netDelta)]);
        }
    }
```

Where `_partition` is the existing helper that splits `_fireEvent` results into `{ fired, popups }` (or however `maybeFire` constructs its return value — match the existing pattern).

Place this before the existing pulse/followup/random logic. The early return ensures the spec's evaluation order: one-shot first, then pulses, then followups, then random.

**Note on behavioral change:** Compound trigger events will now receive the richer toast processing from the normal event pipeline (staggered delays, portfolio flavor text, conviction hint arrows, magnitude-based durations). Previously they got plain `showToast(headline, 5000)`. This is an improvement but should be noted.

- [ ] **Step 4: Verify existing _filterEligible skips oneShot events in random draw**

In the random draw section of `maybeFire()`, the eligible pool should exclude already-fired one-shot events. Add a filter in the random draw pool construction:

```javascript
// In the random draw section, add to the filter:
&& !(ev.oneShot && this._firedOneShot.has(ev.id))
```

This prevents one-shot events from also being drawn in the probabilistic pool after they've fired in the pre-pass (or in a previous day).

- [ ] **Step 5: Commit**

```bash
git add src/events.js
git commit -m "feat: widen event guard signature and add oneShot deterministic pre-pass"
```

---

### Task 3: Migrate compound triggers to event-pool.js

**Files:**
- Modify: `src/event-pool.js`
- Read: `src/compound-triggers.js` (for reference)

Each of the 18 compound triggers becomes an event in the pool with `oneShot: true` and a `when()` guard that uses the `ctx` parameter.

- [ ] **Step 1: Read compound-triggers.js for all trigger definitions**

Read `src/compound-triggers.js` to get all 18 trigger IDs, conditions, and event objects.

- [ ] **Step 2: Add the one-shot events to event-pool.js**

At the end of the `OFFLINE_EVENTS` array (or in a clearly labeled section), add all 18 compound triggers converted to the event format. Each trigger's `condition(world, congress, playerChoices, scrutinyLevel, activeRegIds)` becomes a `when(sim, world, congress, ctx)` guard.

Here's the pattern for converting each trigger:

```javascript
// Old compound trigger:
{
    id: 'trade_war_recession',
    condition: (world, congress, playerChoices, scrutinyLevel, activeRegIds) =>
        world.geopolitical.tradeWarStage >= 3 && world.geopolitical.recessionDeclared,
    event: {
        id: 'compound_stagflation',
        category: 'macro',
        headline: '...',
        magnitude: 'major',
        params: { mu: -0.03, xi: 0.02 },
        effects: (world) => { ... }
    }
}

// New event in pool:
{
    id: 'compound_stagflation',
    category: 'macro',
    headline: '...',
    magnitude: 'major',
    params: { mu: -0.03, xi: 0.02 },
    effects: (world) => { ... },
    oneShot: true,
    when: (sim, world, congress, ctx) =>
        world.geopolitical.tradeWarStage >= 3 && world.geopolitical.recessionDeclared,
},
```

For triggers that access `playerChoices`, `scrutinyLevel`, or `activeRegIds`, use `ctx`:

```javascript
// Old: playerChoices.attended_political_dinner && world.election.okaforRunning
// New:
when: (sim, world, congress, ctx) =>
    ctx.playerChoices.attended_political_dinner && world.election.okaforRunning,

// Old: scrutinyLevel >= 2 && world.election.primarySeason
// New (use regulatoryExposure thresholds instead of old scrutiny levels):
when: (sim, world, congress, ctx) =>
    ctx.factions.regulatoryExposure >= 50 && world.election.primarySeason,
```

**Scrutiny level mapping for conditions:**
- Old `scrutinyLevel >= 1` → `ctx.factions.regulatoryExposure >= 25`
- Old `scrutinyLevel >= 2` → `ctx.factions.regulatoryExposure >= 50`
- Old `scrutinyLevel >= 3` → `ctx.factions.regulatoryExposure >= 75`
- Old `scrutinyLevel >= 4` → `ctx.factions.regulatoryExposure >= 90`

Convert all 18 triggers using this pattern. Preserve the exact `headline`, `params`, `effects`, and `magnitude` from each trigger's event object.

**Important:** All oneShot events MUST have a `when()` guard. Without one, an unfired one-shot would be eligible in both the deterministic pre-pass and the random Poisson draw every day. All 18 existing compound triggers have conditions, so this is naturally satisfied — but new one-shot events added later must follow this rule.

- [ ] **Step 3: Verify all 18 triggers are migrated**

Cross-reference the IDs in compound-triggers.js with the new events in event-pool.js. All 18 must be present:

1. `compound_deregulation_rush` (hartley_fired_trifecta_deregulation)
2. `compound_pnth_war_profits` (pnth_military_mideast)
3. `compound_stagflation` (trade_war_recession)
4. `compound_okafor_connection` (player_cooperated_okafor_wins)
5. `compound_insider_tip_tan` (insider_tip_tan_investigation)
6. `compound_constitutional_crisis` (impeachment_recession)
7. `compound_pnth_perfect_storm` (pnth_scandal_convergence)
8. `compound_covenant_sanctions` (gottlieb_rival_trade_war)
9. `compound_energy_war` (oil_crisis_mideast)
10. `compound_dollar_crisis` (fed_credibility_collapse)
11. `compound_campaign_subpoena` (player_high_scrutiny_campaign)
12. `compound_south_america_exposed` (south_america_pnth_ops)
13. `compound_big_bill_death` (filibuster_big_bill_collapse)
14. `compound_companion_intelligence` (companion_farsistan_data)
15. `compound_strait_war_footing` (strait_closure_oil_emergency)
16. `compound_press_crisis` (media_credibility_collapse)
17. `compound_aegis_war_crime` (aegis_civilian_casualties)
18. `compound_khasuria_invasion` (khasuria_full_breach)

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: migrate 18 compound triggers to event pool as oneShot events"
```

---

### Task 4: Update main.js to remove compound-triggers usage

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Remove compound-triggers import**

Remove (around line 53):
```javascript
import { checkCompoundTriggers, resetCompoundTriggers } from './src/compound-triggers.js';
```

- [ ] **Step 2: Add setPlayerContext call before maybeFire**

Find the `eventEngine.maybeFire()` call (around lines 1200-1242). Before it, add:

```javascript
eventEngine.setPlayerContext(
    playerChoices,
    factions,
    getActiveRegulations().map(r => r.id)
);
```

Where `factions` is imported from `faction-standing.js` (already done in Plan 1) and `getActiveRegulations` is already imported from `regulations.js`.

- [ ] **Step 3: Remove checkCompoundTriggers call and its processing**

Remove the entire compound triggers block (around lines 1264-1288):

```javascript
const congress = congressHelpers(eventEngine.world);
const compoundEvents = checkCompoundTriggers(
    eventEngine.world, congress, playerChoices,
    getScrutinyLevel(),
    getActiveRegulations().map(r => r.id),
);
// ... loop processing compoundEvents ...
```

This entire block is replaced by the one-shot pre-pass in EventEngine.maybeFire().

- [ ] **Step 4: Remove resetCompoundTriggers from _resetCore**

In `_resetCore()`, remove the `resetCompoundTriggers()` call. Add `eventEngine.resetOneShot()` instead (if eventEngine exists):

```javascript
if (eventEngine) eventEngine.resetOneShot();
```

- [ ] **Step 5: Remove getFiredTriggerIds references**

Search main.js for any references to `getFiredTriggerIds()`. If the epilogue or any other code uses it, replace with `eventEngine.getFiredOneShotIds()` (you may need to add this getter to EventEngine — see next step).

- [ ] **Step 6: Add getFiredOneShotIds to EventEngine if needed**

If any code needs the list of fired one-shot IDs (e.g., epilogue), add to EventEngine:

```javascript
getFiredOneShotIds() {
    return [...this._firedOneShot];
}
```

- [ ] **Step 7: Commit**

```bash
git add main.js src/events.js
git commit -m "refactor: remove compound-triggers usage from main.js, use event engine oneShot"
```

---

### Task 5: Delete compound-triggers.js and verify

**Files:**
- Delete: `src/compound-triggers.js`

- [ ] **Step 1: Search for any remaining references**

Search all `.js` files for `compound-triggers`, `checkCompoundTriggers`, `resetCompoundTriggers`, or `getFiredTriggerIds`. There should be none.

- [ ] **Step 2: Delete the file**

```bash
git rm src/compound-triggers.js
```

- [ ] **Step 3: Verify the game loads and compound events still fire**

Serve locally, open the game in Dynamic mode. To verify compound events work:
- Play through enough days to trigger a compound condition (e.g., if trade war stage reaches 3 and recession is declared, the stagflation event should fire as a toast)
- Check the browser console for any errors related to missing modules or undefined functions

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete compound-triggers.js, event system unification complete"
```
