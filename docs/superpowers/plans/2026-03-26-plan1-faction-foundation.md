# Plan 1: Faction Standing Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate compliance and scrutiny systems with a unified 6-faction standing module, refactoring all consumers.

**Architecture:** Create `faction-standing.js` as the single source of truth for all faction scores (firmStanding, regulatoryExposure, federalistSupport, farmerLaborSupport, mediaTrust, fedRelations). Add a `factions` domain to `world-state.js`. Refactor every call site in main.js, popup-events.js, and convictions.js to use the new API. Delete compliance.js and scrutiny.js.

**Tech Stack:** Vanilla ES6 modules, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-26-rpg-depth-design.md` — Section 1 (Unified Faction Standing System)

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/faction-standing.js` | Six faction scores, derived functions, review/choice handlers, reset |
| Modify | `src/world-state.js` | Add `factions` domain to `createWorldState()` and `WORLD_STATE_RANGES` |
| Modify | `src/convictions.js` | Update condition checks and effect keys |
| Modify | `src/popup-events.js` | Replace all compliance imports and call sites |
| Modify | `main.js` | Replace all compliance/scrutiny imports and call sites |
| Delete | `src/compliance.js` | Replaced by faction-standing.js |
| Delete | `src/scrutiny.js` | Replaced by faction-standing.js |

---

### Task 1: Create faction-standing.js

**Files:**
- Create: `src/faction-standing.js`

This module owns all faction state and exports every function that consumers need. It imports `getConvictionEffect` from convictions.js for multiplier application.

- [ ] **Step 1: Create the module with state and core accessors**

```javascript
// src/faction-standing.js
import { getConvictionEffect } from './convictions.js';

const INITIAL_CAPITAL = 10000;

const FACTION_DEFAULTS = {
    firmStanding: 65,
    regulatoryExposure: 10,
    federalistSupport: 30,
    farmerLaborSupport: 30,
    mediaTrust: 40,
    fedRelations: 40,
};

const factions = {
    ...FACTION_DEFAULTS,
    // Boolean flags
    settled: false,
    cooperating: false,
    liedInTestimony: false,
    // Review state
    equityAtLastReview: INITIAL_CAPITAL,
    lastReviewDay: 0,
};

export { factions };

export function getFaction(id) {
    return factions[id];
}

export function getFactionState() {
    return { ...factions };
}

export function resetFactions() {
    Object.assign(factions, FACTION_DEFAULTS);
    factions.settled = false;
    factions.cooperating = false;
    factions.liedInTestimony = false;
    factions.equityAtLastReview = INITIAL_CAPITAL;
    factions.lastReviewDay = 0;
}
```

- [ ] **Step 2: Add shiftFaction with conviction multipliers and clamping**

Append to `src/faction-standing.js`:

```javascript
/** Shift a faction score by delta, applying conviction multipliers for regulatory exposure. */
export function shiftFaction(id, delta) {
    if (id === 'regulatoryExposure') {
        if (factions.settled && delta > 0) return; // settlement blocks increases
        delta *= getConvictionEffect('regExposureMult', 1);
    }
    factions[id] = Math.max(0, Math.min(100, factions[id] + delta));
}
```

- [ ] **Step 3: Add regulatory level derivation**

Append to `src/faction-standing.js`:

```javascript
const REG_THRESHOLDS = [25, 50, 75, 90];

/** Derive regulatory investigation level (0-4) from regulatoryExposure score. */
export function getRegLevel() {
    const score = factions.regulatoryExposure;
    for (let i = REG_THRESHOLDS.length - 1; i >= 0; i--) {
        if (score >= REG_THRESHOLDS[i]) return i + 1;
    }
    return 0;
}
```

- [ ] **Step 4: Add firm-derived functions (threshold, cooldown, tone)**

Append to `src/faction-standing.js`:

```javascript
/** Position-size threshold multiplier. High firmStanding = more lenient triggers. */
export function firmThresholdMult() {
    return (1 + (factions.firmStanding / 100) * 0.75) *
        getConvictionEffect('firmThresholdMult', 1);
}

/** Compliance popup cooldown multiplier. High firmStanding = less frequent popups. */
export function firmCooldownMult() {
    return (0.5 + (factions.firmStanding / 100)) *
        getConvictionEffect('firmCooldownMult', 1);
}

const TONE_THRESHOLDS = [
    [70, 'warm'],
    [45, 'professional'],
    [25, 'pointed'],
    [10, 'final_warning'],
];

/** Firm tone descriptor based on firmStanding thresholds. */
export function firmTone() {
    for (const [threshold, tone] of TONE_THRESHOLDS) {
        if (factions.firmStanding > threshold) return tone;
    }
    return 'terminated';
}
```

- [ ] **Step 5: Add quarterly review handler**

Append to `src/faction-standing.js`:

```javascript
/**
 * Called at quarterly boundaries. If profitable since last review,
 * raises firmStanding. Always snapshots equity for next review.
 * Returns the firmStanding delta applied (for display logic).
 */
export function onQuarterlyReview(currentEquity, currentDay) {
    const prevEquity = factions.equityAtLastReview;
    const profitRatio = prevEquity > 0 ? (currentEquity - prevEquity) / prevEquity : 0;
    let delta = 0;
    if (profitRatio > 0) {
        delta = Math.min(8, Math.max(3, Math.round(profitRatio * 50)));
        shiftFaction('firmStanding', delta);
    } else if (profitRatio < -0.05) {
        delta = -Math.min(5, Math.round(Math.abs(profitRatio) * 30));
        shiftFaction('firmStanding', delta);
    }
    factions.equityAtLastReview = currentEquity;
    factions.lastReviewDay = currentDay;
    return delta;
}
```

- [ ] **Step 6: Add compliance choice handler**

Append to `src/faction-standing.js`:

```javascript
/**
 * Called when player makes a compliance popup choice.
 * 'full' cooperation raises firmStanding, 'defiant' lowers it and raises regulatoryExposure.
 */
export function applyComplianceChoice(tier, severity = 1) {
    if (tier === 'full') {
        shiftFaction('firmStanding', 3);
    } else if (tier === 'defiant') {
        shiftFaction('firmStanding', -(3 * severity));
        shiftFaction('regulatoryExposure', severity * 3);
    }
    // 'partial': no change
}
```

- [ ] **Step 7: Add regulatory settlement and cooperation**

Append to `src/faction-standing.js`:

```javascript
/** Settle with SEC — blocks further regulatoryExposure increases. */
export function settleRegulatory() {
    factions.settled = true;
}

/** Cooperate with investigators — reduces exposure, sets cooperating flag. */
export function cooperateRegulatory() {
    factions.cooperating = true;
    shiftFaction('regulatoryExposure', -20);
}
```

- [ ] **Step 8: Add faction descriptor for UI display**

Append to `src/faction-standing.js`:

```javascript
const DESCRIPTORS = {
    firmStanding: [
        [80, 'Vasquez is championing you'],
        [60, 'Webb is giving you room'],
        [45, 'The desk is watching'],
        [25, 'Webb has concerns'],
        [10, 'On thin ice'],
        [0, 'Termination imminent'],
    ],
    regulatoryExposure: [
        [90, 'Criminal referral territory'],
        [75, 'Active investigation'],
        [50, 'Formal inquiry'],
        [25, 'On the radar'],
        [0, 'Below the radar'],
    ],
    federalistSupport: [
        [75, 'Inner circle'],
        [50, 'Trusted ally'],
        [35, 'They know your name'],
        [20, 'Peripheral'],
        [0, 'Unknown'],
    ],
    farmerLaborSupport: [
        [75, 'Inner circle'],
        [50, 'Trusted ally'],
        [35, 'They know your name'],
        [20, 'Peripheral'],
        [0, 'Unknown'],
    ],
    mediaTrust: [
        [70, 'Tan considers you a source'],
        [50, 'Press is interested'],
        [30, 'Neutral coverage'],
        [15, 'Press is suspicious'],
        [0, 'Media target'],
    ],
    fedRelations: [
        [75, 'Advisory access'],
        [50, 'Respected voice'],
        [30, 'Known quantity'],
        [15, 'No access'],
        [0, 'Shut out'],
    ],
};

/** Get prose descriptor for a faction score. */
export function getFactionDescriptor(id) {
    const score = factions[id];
    for (const [threshold, desc] of DESCRIPTORS[id]) {
        if (score >= threshold) return desc;
    }
    return DESCRIPTORS[id][DESCRIPTORS[id].length - 1][1];
}
```

- [ ] **Step 9: Commit**

```bash
git add src/faction-standing.js
git commit -m "feat: create faction-standing.js with unified 6-faction system"
```

---

### Task 2: Update world-state.js

**Files:**
- Modify: `src/world-state.js`

Add the `factions` domain to `createWorldState()` and register all faction scores in `WORLD_STATE_RANGES`.

- [ ] **Step 1: Read current world-state.js**

Read `src/world-state.js` to locate the `createWorldState()` return object and `WORLD_STATE_RANGES`.

- [ ] **Step 2: Add factions domain to createWorldState()**

Inside `createWorldState()`, after the last existing domain (likely `media`), add:

```javascript
        factions: {
            firmStanding: 65,
            regulatoryExposure: 10,
            federalistSupport: 30,
            farmerLaborSupport: 30,
            mediaTrust: 40,
            fedRelations: 40,
        },
```

- [ ] **Step 3: Add faction ranges to WORLD_STATE_RANGES**

Inside `WORLD_STATE_RANGES`, add entries for all six faction scores:

```javascript
    'factions.firmStanding':        { min: 0, max: 100, type: 'number' },
    'factions.regulatoryExposure':  { min: 0, max: 100, type: 'number' },
    'factions.federalistSupport':   { min: 0, max: 100, type: 'number' },
    'factions.farmerLaborSupport':  { min: 0, max: 100, type: 'number' },
    'factions.mediaTrust':          { min: 0, max: 100, type: 'number' },
    'factions.fedRelations':        { min: 0, max: 100, type: 'number' },
```

- [ ] **Step 4: Commit**

```bash
git add src/world-state.js
git commit -m "feat: add factions domain to world state with range validation"
```

---

### Task 3: Refactor convictions.js

**Files:**
- Modify: `src/convictions.js`

Update conviction conditions that reference `ctx.compliance` to use `ctx.factions`, and rename effect keys.

- [ ] **Step 1: Read current convictions.js**

Read `src/convictions.js` to find all conviction conditions and effects.

- [ ] **Step 2: Update desk_protects conviction condition**

In `desk_protects` (around line 50-59), change the condition from checking `ctx.compliance.credibility >= 3` to checking `ctx.factions.firmStanding >= 60`:

Replace the old credibility check in the condition function with:
```javascript
ctx.factions.firmStanding >= 60
```

- [ ] **Step 3: Update desk_protects effects**

In `desk_protects` effects, rename `popupFrequencyMult` to `firmCooldownMult`:

```javascript
effects: { firmCooldownMult: 1.5, tipAccuracy: 0 },
```

- [ ] **Step 4: Update risk_manager conviction condition**

In `risk_manager` (around line 138-153), change from `ctx.compliance.credibility >= 4` to:
```javascript
ctx.factions.firmStanding >= 70
```

- [ ] **Step 5: Update risk_manager effects**

In `risk_manager` effects, rename keys:

```javascript
effects: { firmThresholdMult: 1.5, firmCooldownMult: 1.8 },
```

- [ ] **Step 6: Update market_always_right effects**

In `market_always_right` (around line 27-41), rename `complianceThresholdMult` to `firmThresholdMult`:

```javascript
effects: { firmThresholdMult: 1.3, couplingCapMult: 0.5 },
```

- [ ] **Step 7: Update master_of_leverage effects**

In `master_of_leverage` (around line 61-69), rename `scrutinyMult` to `regExposureMult`:

```javascript
effects: { couplingCapMult: 1.5, regExposureMult: 1.3 },
```

- [ ] **Step 8: Update ghost_protocol condition and effects**

In `ghost_protocol` (around line 87-96), add a regulatoryExposure check to the condition:
```javascript
ctx.factions.regulatoryExposure < 25
```

Rename `scrutinyMult` to `regExposureMult` and `popupFrequencyMult` to `firmCooldownMult`:
```javascript
effects: { regExposureMult: 0.5, firmCooldownMult: 2.0 },
```

- [ ] **Step 9: Update crisis_profiteer effects**

In `crisis_profiteer` (around line 155-169), rename `scrutinyMult` to `regExposureMult`:

```javascript
effects: { regExposureMult: 1.5, boredomImmune: true },
```

- [ ] **Step 10: Update information_edge effects**

In `information_edge` (around line 12-25), rename `complianceCooldownMult` to `firmCooldownMult`:

```javascript
effects: { eventHintArrows: true, firmCooldownMult: 0.8 },
```

- [ ] **Step 11: Commit**

```bash
git add src/convictions.js
git commit -m "refactor: update conviction conditions and effect keys for faction system"
```

---

### Task 4: Refactor popup-events.js

**Files:**
- Modify: `src/popup-events.js`

Replace all imports from compliance.js with imports from faction-standing.js, and update all 28 call sites.

- [ ] **Step 1: Read popup-events.js imports and locate all compliance call sites**

Read `src/popup-events.js` to find:
- The import statement for compliance.js
- All calls to `thresholdMultiplier()` (15 sites)
- All calls to `cooldownMultiplier()` (1 site)
- All calls to `complianceTone()` (12 sites)

- [ ] **Step 2: Replace the import statement**

Change:
```javascript
import { thresholdMultiplier, cooldownMultiplier, complianceTone } from './compliance.js';
```

To:
```javascript
import { firmThresholdMult, firmCooldownMult, firmTone } from './faction-standing.js';
```

- [ ] **Step 3: Replace all thresholdMultiplier() calls**

Find and replace all 15 occurrences of `thresholdMultiplier()` with `firmThresholdMult()` across the file.

- [ ] **Step 4: Replace the cooldownMultiplier() call**

Find and replace the single occurrence of `cooldownMultiplier()` with `firmCooldownMult()`.

- [ ] **Step 5: Replace all complianceTone() calls**

Find and replace all 12 occurrences of `complianceTone()` with `firmTone()`.

- [ ] **Step 6: Replace the scrutiny.js import and call sites**

popup-events.js also imports from scrutiny.js:
```javascript
import { getScrutinyLevel } from './scrutiny.js';
```

Replace with:
```javascript
import { getRegLevel } from './faction-standing.js';
```

Merge into the existing faction-standing.js import block. Then find and replace all 5 occurrences of `getScrutinyLevel()` with `getRegLevel()` (around lines 1274, 1298, 1329, 1353, 1358).

- [ ] **Step 7: Replace the conviction key consumer**

At popup-events.js line 1394, the cooldown check reads:
```javascript
cooldownMultiplier() * getConvictionEffect('popupFrequencyMult', 1)
```

Replace with:
```javascript
firmCooldownMult() * getConvictionEffect('firmCooldownMult', 1)
```

Wait — `firmCooldownMult()` already calls `getConvictionEffect('firmCooldownMult', 1)` internally. So the consumer should simply become:

```javascript
firmCooldownMult()
```

Remove the `* getConvictionEffect(...)` multiplication since it's now built into the function.

- [ ] **Step 8: Verify no remaining compliance or scrutiny references**

Search `src/popup-events.js` for any remaining references to `compliance`, `scrutiny`, `thresholdMultiplier`, `cooldownMultiplier`, `complianceTone`, `getScrutinyLevel`, or `popupFrequencyMult`. There should be none.

- [ ] **Step 9: Commit**

```bash
git add src/popup-events.js
git commit -m "refactor: migrate popup-events.js from compliance/scrutiny to faction-standing API"
```

---

### Task 5: Refactor main.js — imports and reset

**Files:**
- Modify: `main.js`

This is the largest refactor task. Split across Tasks 5-7 for manageability.

- [ ] **Step 1: Read main.js imports section**

Read `main.js` lines 1-120 to find all imports from compliance.js and scrutiny.js.

- [ ] **Step 2: Replace compliance.js import**

Change (around lines 56-59):
```javascript
import {
    compliance, resetCompliance, effectiveHeat,
    onComplianceTriggered, onComplianceChoice,
} from './src/compliance.js';
```

To:
```javascript
import {
    factions, resetFactions, getFaction,
    onQuarterlyReview, applyComplianceChoice,
    shiftFaction, firmTone,
} from './src/faction-standing.js';
```

- [ ] **Step 3: Replace scrutiny.js import**

Change (around lines 68-71):
```javascript
import {
    addScrutiny, getScrutinyLevel, getScrutinyState,
    settleScrutiny, cooperateScrutiny, resetScrutiny,
} from './src/scrutiny.js';
```

To:
```javascript
import {
    getRegLevel, getFactionState,
    settleRegulatory, cooperateRegulatory,
} from './src/faction-standing.js';
```

Merge this into the existing faction-standing.js import block from Step 2 so there's one import statement:

```javascript
import {
    factions, resetFactions, getFaction,
    onQuarterlyReview, applyComplianceChoice,
    shiftFaction, firmTone,
    getRegLevel, getFactionState,
    settleRegulatory, cooperateRegulatory,
} from './src/faction-standing.js';
```

- [ ] **Step 4: Update _resetCore()**

In `_resetCore()` (around lines 1650-1693), replace:
```javascript
    resetCompliance();
    // ...
    resetScrutiny();
    resetCompoundTriggers();
```

With:
```javascript
    resetFactions();
```

Also remove the `resetCompoundTriggers()` call (compound-triggers.js deletion is Plan 2, but the import will be removed there — for now, leave it if it exists and only replace compliance/scrutiny resets).

**Note:** If `resetCompoundTriggers` is still imported, leave it for now. Plan 2 will clean it up.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "refactor: replace compliance/scrutiny imports with faction-standing in main.js"
```

---

### Task 6: Refactor main.js — compliance/scrutiny call sites

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Replace game-over check**

Around line 951, replace:
```javascript
if (effectiveHeat() >= COMPLIANCE_GAME_OVER_HEAT) {
    _showComplianceTermination();
}
```

With:
```javascript
if (getFaction('firmStanding') <= 0) {
    _showComplianceTermination();
}
```

- [ ] **Step 2: Replace onComplianceTriggered call in popup handler**

Around line 845, inside the popup event callback (this fires when a compliance popup is shown, NOT during the quarterly review), replace:
```javascript
onComplianceTriggered(_portfolioEquity(), sim.day);
```

With a simpler equity snapshot update (the profitability-based firmStanding boost moves to the quarterly review section in Task 7):
```javascript
// Just snapshot equity for reference — firmStanding adjustments happen at quarterly review
factions.equityAtLastReview = _portfolioEquity();
factions.lastReviewDay = sim.day;
```

- [ ] **Step 3: Replace onComplianceChoice call**

Around line 947, replace:
```javascript
onComplianceChoice(choice.complianceTier);
```

With:
```javascript
applyComplianceChoice(choice.complianceTier);
```

If there's a severity argument, keep it:
```javascript
applyComplianceChoice(choice.complianceTier, choice.severity || 1);
```

- [ ] **Step 4: Replace direct compliance.heat mutation**

Around line 963, replace:
```javascript
compliance.heat += 1;
```

With:
```javascript
shiftFaction('firmStanding', -5);
```

- [ ] **Step 5: Replace addScrutiny calls (6 sites)**

Around line 562 (lobbying):
```javascript
// Old: addScrutiny(1, 'Lobbying: ' + result.action.name, day);
shiftFaction('regulatoryExposure', 7);
```

Around line 860 (insider tip):
```javascript
// Old: addScrutiny(2, 'Insider tip accepted', sim.day);
shiftFaction('regulatoryExposure', 13);
```

Around line 862 (analyst tip):
```javascript
// Old: addScrutiny(1.5, 'Analyst information edge used', sim.day);
shiftFaction('regulatoryExposure', 10);
```

Around line 872 (SEC fighting):
```javascript
// Old: addScrutiny(2, 'Fighting SEC enforcement', sim.day);
shiftFaction('regulatoryExposure', 13);
```

Around line 949 (compliance defiance — may already be handled by applyComplianceChoice):
Check if there's a standalone `addScrutiny(0.5, 'Compliance defiance', sim.day)` call that isn't already inside the `applyComplianceChoice` path. If so, remove it — `applyComplianceChoice('defiant')` now handles both firmStanding and regulatoryExposure shifts.

Around line 1311 (sustained high volume):
```javascript
// Old: addScrutiny(0.1, 'Sustained high-volume activity', sim.history.maxDay);
shiftFaction('regulatoryExposure', 1);
```

- [ ] **Step 6: Replace getScrutinyLevel() calls**

Search for all `getScrutinyLevel()` calls in main.js and replace with `getRegLevel()`.

- [ ] **Step 7: Replace settleScrutiny and cooperateScrutiny**

Around line 866:
```javascript
// Old: settleScrutiny();
settleRegulatory();
```

Around line 869:
```javascript
// Old: cooperateScrutiny();
cooperateRegulatory();
```

- [ ] **Step 8: Replace getScrutinyState in epilogue call**

Around line 2160, in `_showEpilogue`:
```javascript
// Old: getScrutinyState()
getFactionState()
```

The full `generateEpilogue` call becomes:
```javascript
const pages = generateEpilogue(
    eventEngine?.world ?? {},
    sim,
    portfolio,
    eventEngine ? eventEngine.eventLog : [],
    playerChoices,
    impactHistory,
    quarterlyReviews,
    terminationReason,
    getConvictionIds(),
    getFactionState()
);
```

- [ ] **Step 9: Commit**

```bash
git add main.js
git commit -m "refactor: replace all compliance/scrutiny call sites with faction API in main.js"
```

---

### Task 7: Refactor main.js — conviction context and quarterly review

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Update _convCtx object**

Around lines 1174-1182, replace:
```javascript
const _convCtx = {
    playerChoices,
    impactHistory,
    quarterlyReviews,
    compliance,
    portfolio,
    daysSinceLiveTrade: sim.history.maxDay - HISTORY_CAPACITY,
    lobbyCount: _lobbyCount,
};
```

With:
```javascript
const _convCtx = {
    playerChoices,
    impactHistory,
    quarterlyReviews,
    factions,
    portfolio,
    daysSinceLiveTrade: sim.history.maxDay - HISTORY_CAPACITY,
    lobbyCount: _lobbyCount,
};
```

- [ ] **Step 2: Insert onQuarterlyReview call in the quarterly review section**

Around lines 1128-1172, find the quarterly review section. After the `quarterlyReviews.push(...)` line (around line 1138), insert the `onQuarterlyReview` call:

```javascript
    quarterlyReviews.push({ day: sim.day, pnl: actualPnl, vsBenchmark, rating });

    // Adjust firmStanding based on quarterly performance
    onQuarterlyReview(_portfolioEquity(), sim.day);
```

The existing rating logic (`strong`/`solid`/`underperform`/`poor`) and toast text remain. `onQuarterlyReview` adjusts firmStanding (3-8 for profit, -1 to -5 for loss), while the existing code handles the review record and display.

Replace any reference to `"Managing Director Liu"` with `"Vasquez"` or `"Elena Vasquez"` in the toast strings.

- [ ] **Step 3: Remove COMPLIANCE_GAME_OVER_HEAT constant**

`COMPLIANCE_GAME_OVER_HEAT` is defined in `src/config.js` (line 54) and imported in main.js (around line 72). Remove the import from main.js. Optionally remove the constant from config.js as dead code. The game-over check now uses `getFaction('firmStanding') <= 0` directly.

- [ ] **Step 4: Verify no remaining compliance/scrutiny references**

Search main.js for any remaining references to:
- `compliance` (the object, not the word in comments/strings)
- `scrutiny` (the object)
- `effectiveHeat`
- `addScrutiny`
- `resetCompliance`
- `resetScrutiny`
- `getScrutinyLevel`
- `getScrutinyState`
- `settleScrutiny`
- `cooperateScrutiny`
- `onComplianceTriggered`
- `onComplianceChoice` (should only appear as the new `applyComplianceChoice`)
- `COMPLIANCE_GAME_OVER_HEAT`

There should be zero references to any of these (except in comments or string literals like toast messages).

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "refactor: update conviction context and quarterly review for faction system"
```

---

### Task 8: Update epilogue.js parameter

**Files:**
- Modify: `src/epilogue.js`

The epilogue's `generateEpilogue()` function receives `scrutinyState` as its last parameter. This needs to accept `factionState` instead and read from the new structure.

- [ ] **Step 1: Read epilogue.js to find the parameter and its usages**

Read `src/epilogue.js` to find where `scrutinyState` is used in the epilogue generation logic.

- [ ] **Step 2: Rename the parameter**

In the `generateEpilogue` function signature (line 676), rename `scrutinyState = null` to `factionState = null`.

- [ ] **Step 3: Update internal references**

Search for all uses of `scrutinyState` inside `generateEpilogue` and its helper functions. Replace with reads from `factionState`:

- `scrutinyState.score` → `factionState.regulatoryExposure`
- `scrutinyState.level` → derive from `factionState.regulatoryExposure` using thresholds (or import `getRegLevel`)
- `scrutinyState.settled` → `factionState.settled`
- `scrutinyState.cooperating` → `factionState.cooperating`

If the epilogue checks scrutiny level, inline the threshold logic:
```javascript
const regLevel = factionState.regulatoryExposure >= 90 ? 4 :
    factionState.regulatoryExposure >= 75 ? 3 :
    factionState.regulatoryExposure >= 50 ? 2 :
    factionState.regulatoryExposure >= 25 ? 1 : 0;
```

- [ ] **Step 4: Commit**

```bash
git add src/epilogue.js
git commit -m "refactor: update epilogue to accept factionState instead of scrutinyState"
```

---

### Task 9: Delete old modules and verify

**Files:**
- Delete: `src/compliance.js`
- Delete: `src/scrutiny.js`
- Modify: `index.html` (if compliance.js or scrutiny.js are loaded via script tags — check first)

- [ ] **Step 1: Check index.html for script tags**

Read `index.html` and search for `compliance.js` or `scrutiny.js`. These are ES6 modules imported by main.js, so they likely aren't script tags — but verify.

- [ ] **Step 2: Delete compliance.js**

```bash
git rm src/compliance.js
```

- [ ] **Step 3: Delete scrutiny.js**

```bash
git rm src/scrutiny.js
```

- [ ] **Step 4: Search entire codebase for remaining references**

Search all `.js` and `.html` files for any remaining imports or references to `compliance.js` or `scrutiny.js`. Fix any found.

- [ ] **Step 5: Verify the game loads without errors**

Serve the project locally (`python -m http.server` from repo root), open `localhost:8000/shoals/` in a browser, open the dev console, and verify:
- No import errors
- No `undefined` errors from missing functions
- The game starts in Dynamic mode
- Playing a few days doesn't crash
- Compliance popups still fire with the new tone system

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete compliance.js and scrutiny.js, faction system complete"
```

---

### Task 10: Sync faction state with world state

**Files:**
- Modify: `main.js`

The `factions` object in `faction-standing.js` is the live mutable state, but `world.factions` in world-state.js also exists (for structured effects). These need to be kept in sync — the simplest approach is to make `faction-standing.js` write to the world state's factions object.

- [ ] **Step 1: Read how the event engine's world state is initialized**

In main.js, find where `eventEngine.world` is created (likely in the EventEngine constructor via `createWorldState()`). The `world.factions` from world-state.js needs to be the same object reference as the `factions` in faction-standing.js.

- [ ] **Step 2: Wire faction state into world state after engine creation**

After the event engine is created (or after `_resetCore`), add:

```javascript
eventEngine.world.factions = factions;
```

This makes `world.factions` and the faction-standing module's `factions` the same object. Structured effects that target `factions.*` paths will mutate the live state directly.

- [ ] **Step 3: Ensure resetFactions also resets world.factions**

In `_resetCore()`, after calling `resetFactions()`, reassign:

```javascript
resetFactions();
if (eventEngine) eventEngine.world.factions = factions;
```

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: wire faction state into event engine world state for structured effects"
```
