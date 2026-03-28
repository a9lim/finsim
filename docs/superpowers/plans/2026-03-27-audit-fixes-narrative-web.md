# Audit Fixes & Narrative Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix mechanical bugs, correct lore, and transform the event system into a deeply interconnected narrative web by rewiring existing events with cross-domain guards, effects, and followup links.

**Architecture:** Three phases — Foundation (flags, fixes, text), Wiring (cross-domain connections across all event files), Polish (conditional context, consistency verification). Existing events are modified in-place; new events created only as minimal bridge nodes.

**Tech Stack:** Vanilla ES6 modules, no build step, no test runner. All verification is via grep/read consistency checks.

**Spec:** `docs/superpowers/specs/2026-03-27-audit-fixes-and-narrative-web-design.md`

---

## Phase 1: Foundation

### Task 1: Lore Text Fixes — Geography

**Files:**
- Modify: `src/events/macro.js` (lines 14, 149, 524, 539, 554, 660, 673)
- Modify: `src/events/congress.js` (lines 226, 261, 1287)
- Modify: `src/events/firm.js` (lines 21, 107)
- Modify: `src/events/market.js` (line 110)
- Modify: `src/events/pnth.js` (line 673)
- Modify: `src/endings.js` (lines 423, 482, 484)
- Modify: `src/regulations.js` (line 77)
- Modify: `CLAUDE.md` (line 164)

- [ ] **Step 1: Fix "Strait of Farsis" → "Strait of Hormuz" in macro.js**

Use `replace_all` on `Strait of Farsis` → `Strait of Hormuz` in `src/events/macro.js`. There are 5 occurrences across the Farsistan escalation chain and compound events.

- [ ] **Step 2: Fix "Strait of Farsis" in endings.js**

Replace all 3 occurrences of `Strait of Farsis` → `Strait of Hormuz` in `src/endings.js`.

- [ ] **Step 3: Fix "Strait of Farsis" in regulations.js**

`src/regulations.js:77`: Change `Strait of Farsis Emergency Margins` → `Strait of Hormuz Emergency Margins`. Also update the description at line 78 if it mentions "Farsis".

- [ ] **Step 4: Fix "Strait of Farsis" in CLAUDE.md**

`CLAUDE.md:164`: Change `Strait of Farsis` → `Strait of Hormuz` in the geopolitics summary.

- [ ] **Step 5: Fix "Beijing" → "Nanjing"**

- `src/events/congress.js:261`: `Beijing state media` → `Nanjing state media`
- `src/events/market.js:110`: `Beijing AI Summit` → `Nanjing AI Summit`
- `src/events/firm.js:107`: `Beijing AI Forum` → `Nanjing AI Forum`

- [ ] **Step 6: Fix "Mar-a-Lago" → "Little St. James"**

- `src/events/firm.js:21`: `Mar-a-Lago golf course` → `Little St. James golf course`
- `src/events/congress.js:1287`: `Barron retreats to Mar-a-Lago` → `Barron retreats to Little St. James`

- [ ] **Step 7: Fix "D.C." → "Philadelphia"**

`src/events/congress.js:226`: `opposition rally in D.C.` → `opposition rally in Philadelphia`

- [ ] **Step 8: Fix "America" → "Columbia"**

`src/events/macro.js:14`: `America will no longer be ripped off` → `Columbia will no longer be ripped off`

- [ ] **Step 9: Fix "Korindian" → "Meridine"**

`src/events/pnth.js:673`: `Korindian military` → `Meridine military`

- [ ] **Step 10: Commit**

```bash
git add src/events/macro.js src/events/congress.js src/events/firm.js src/events/market.js src/events/pnth.js src/endings.js src/regulations.js CLAUDE.md
git commit -m "fix: correct geography names per lore rule (real places, fictional polities)"
```

---

### Task 2: Lore Bible & Intro Text Updates

**Files:**
- Modify: `lore.md` (top section + geopolitics section)
- Modify: `index.html` (lines 100-103)

- [ ] **Step 1: Add geography rule and details to lore.md**

First, replace all "Strait of Farsis" → "Strait of Hormuz" in lore.md (2 occurrences).

Then, after line 8 (`Presidential system, bicameral Congress...`), before the `---` divider, add:

```
Capital: Philadelphia. Presidential island resort: Little St. James.

> **Lore rule:** Geography and institutions mirror the real world (Strait of Hormuz,
> Nanjing, Philadelphia, White House, Federal Reserve, Wall Street). Polities and
> people are fictional (Federal States of Columbia, Serica, Farsistan, John Barron).
```

In the Geopolitics section of lore.md, find the Serica entry and add `Capital: Nanjing.` Find the Farsistan entry and add that it controls the Strait of Hormuz. Find the Meridia entry and add `Demonym: Meridine.`

- [ ] **Step 2: Rewrite intro text**

`index.html:100-103` — replace the `<p class="intro-desc">` content:

```html
<p class="intro-desc">You&rsquo;ve just been poached from a rival firm to run
    Meridian Capital&rsquo;s most aggressive derivatives desk. President Barron
    has just taken office, volatility is spiking, and Meridian wants someone who
    can trade through the storm. Build positions, manage risk, navigate 4 years
    of market events&mdash;and try not to get fired.</p>
```

- [ ] **Step 3: Commit**

```bash
git add lore.md index.html
git commit -m "docs: update lore bible with geography rule; rewrite intro as poached veteran"
```

---

### Task 3: Engine Hardening — applyDeltas Warning & One-Shot Guard

**Files:**
- Modify: `src/events.js` (lines 175-183, 418-422)

- [ ] **Step 1: Add dev warning to applyDeltas**

In `src/events.js`, inside the `applyDeltas` method, after `const range = PARAM_RANGES[key];`, change the `if (!range) continue;` line:

```js
applyDeltas(sim, params) {
    if (!params) return;
    for (const [key, delta] of Object.entries(params)) {
        const range = PARAM_RANGES[key];
        if (!range) {
            console.warn(`[EventEngine] applyDeltas: unknown param "${key}" (no PARAM_RANGES entry)`);
            continue;
        }
        sim[key] = Math.min(range.max, Math.max(range.min, sim[key] + delta));
    }
    if (params.rho !== undefined) sim._recomputeRhoDerived();
}
```

- [ ] **Step 2: Add one-shot guard in _checkFollowups**

In `_checkFollowups()`, after the event is resolved at line ~418 but before `_fireEvent` is called, add the guard. The current code is:

```js
const event = picked.event ?? getEventById(picked.id);
if (!event) continue;
if (event.when && !event.when(sim, this.world, congress, this._playerCtx)) continue;

fired.push(this._fireEvent(event, sim, day, picked.depth, netDelta));
```

Add after the `when` check, before `fired.push`:

```js
if (event.oneShot && this._firedOneShot.has(event.id)) continue;
if (event.oneShot) this._firedOneShot.add(event.id);
```

- [ ] **Step 3: Commit**

```bash
git add src/events.js
git commit -m "fix: add applyDeltas dev warning and one-shot guard in followup path"
```

---

### Task 4: Followup Weight Normalization

**Files:**
- Modify: `src/events/macro.js` (line 491)

- [ ] **Step 1: Normalize Khasuria chain weights**

`src/events/macro.js:490-492` — the `khasuria_troop_buildup` followups:

```js
// Before:
{ id: 'khasuria_incursion', mtth: 45, weight: 2 },
{ id: 'khasuria_backs_down', mtth: 45, weight: 1 },

// After:
{ id: 'khasuria_incursion', mtth: 45, weight: 0.67 },
{ id: 'khasuria_backs_down', mtth: 45, weight: 0.33 },
```

- [ ] **Step 2: Commit**

```bash
git add src/events/macro.js
git commit -m "fix: normalize Khasuria followup weights to [0,1] range"
```

---

### Task 5: World-State Flags & Factions Cleanup

**Files:**
- Modify: `src/world-state.js` (lines 41-89)
- Modify: `main.js` (lines 589, 1686, 1731)

- [ ] **Step 1: Add new geopolitical flags**

In `src/world-state.js`, in the `geopolitical` section, after `straitClosed: false,` add:

```js
aegisDemandSurge:          false,
foundryCompetitionPressure: false,
energyCrisis:               false,
```

- [ ] **Step 2: Add new investigations flag**

After `impeachmentStage: 0,` add:

```js
meridianExposed: false,
```

- [ ] **Step 3: Add new media flag**

After `leakCount: 0,` add:

```js
lobbyingExposed: false,
```

- [ ] **Step 4: Remove factions from createWorldState**

Delete the entire `factions` block (lines 82-89) from `createWorldState()`. The `factions` object lives in `faction-standing.js` and is attached by reference in main.js.

- [ ] **Step 5: Add sync comments in main.js**

At each of the three sync sites, add a comment above the line:

`main.js:589` (init):
```js
// Faction state lives in faction-standing.js; attach by reference so events can read it
eventEngine.world.factions = factions;
```

`main.js:1686` (_resetCore):
```js
// Re-attach faction reference after reset (faction-standing.js is the source of truth)
if (eventEngine) eventEngine.world.factions = factions;
```

`main.js:1731` (loadPreset):
```js
// Attach faction reference (faction-standing.js is the source of truth)
eventEngine.world.factions = factions;
```

- [ ] **Step 6: Commit**

```bash
git add src/world-state.js main.js
git commit -m "feat: add cross-domain world-state flags; remove factions duplication"
```

---

### Task 6: firmCooldownMult Directional Rework

**Files:**
- Modify: `src/events.js` (line 282)
- Modify: `src/events/firm.js` (17 triggered events)

- [ ] **Step 1: Add tone field to all triggered events in firm.js**

Add `tone: 'negative'` to these events (add after the `cooldown` field on each):
- `desk_compliance_short` (line ~316)
- `desk_suspicious_long` (line ~372)
- `desk_strike_concentration` (line ~422)
- `desk_extreme_leverage` (line ~464)
- `desk_unlimited_risk` (line ~560)
- `desk_bond_fomc` (line ~612)
- `desk_risk_committee` (line ~723)
- `desk_md_meeting` (line ~826)
- `desk_unusual_activity` (line ~876)
- `desk_fomc_bond_compliance` (line ~1033)
- `desk_pnth_earnings` (line ~651) — regulatory risk event, negative tone
- `desk_short_in_rally` (line ~684) — challenge event, negative tone

Add `tone: 'positive'` to these events:
- `desk_name_on_tape` (line ~515)
- `desk_headhunter` (line ~918)
- `desk_comeback_kid` (line ~964)
- `desk_first_milestone` (line ~1003)
- `desk_profiting_from_misery` (line ~775)

For `desk_capital_cut` and `desk_capital_boost` (if they exist as triggered events), classify as negative and positive respectively.

- [ ] **Step 2: Modify evaluateTriggers in events.js**

`src/events.js:282` — change the cooldown check:

```js
// Before:
if (cd && day - cd < ev.cooldown * firmCooldownMult()) continue;

// After:
const cdMult = ev.tone === 'positive' ? 1 / firmCooldownMult() : firmCooldownMult();
if (cd && day - cd < ev.cooldown * cdMult) continue;
```

- [ ] **Step 3: Commit**

```bash
git add src/events.js src/events/firm.js
git commit -m "feat: directional firmCooldownMult — positive events fire more often at high standing"
```

---

### Task 7: Midterm Election Rebalancing

**Files:**
- Modify: `src/events.js` (lines 536-548)

- [ ] **Step 1: Reduce noise and add world-state signals**

In `_onMidterm()`, replace the scoring block (lines 540-547):

```js
_onMidterm(sim, day, netDelta = 0) {
    const w = this.world;
    let score = w.election.barronApproval;

    if (w.geopolitical.recessionDeclared) score -= 15;
    if (w.geopolitical.mideastEscalation >= 2 || w.geopolitical.southAmericaOps >= 2) score -= 8;

    // Lobby momentum: each point shifts the score by 3
    score += (w.election.lobbyMomentum || 0) * 3;

    // Cross-domain signals
    if (w.investigations.okaforProbeStage >= 2) score -= 5;
    if (w.fed.hartleyFired) score -= 3;
    if ((w.pnth.aegisControversy || 0) >= 2) score -= 3;
    const factions = w.factions || {};
    score += ((factions.federalistSupport || 30) - (factions.farmerLaborSupport || 30)) * 0.15;

    // Noise: +-5 (reduced from +-10 to preserve player agency)
    score += (Math.random() - 0.5) * 10;
```

Note: `w.pnth.aegisControversy` uses the existing field (number 0-3), not a new flag.

- [ ] **Step 2: Commit**

```bash
git add src/events.js
git commit -m "fix: rebalance midterm scoring — more world-state signals, less noise"
```

---

## Phase 2: Wiring

### Task 8: Geopolitical → PNTH Cross-Domain Wiring

**Files:**
- Modify: `src/events/macro.js` (Khasuria, Farsistan, and Serica events)
- Modify: `src/events/firm.js` (Zhaowei/Liang Wei events)
- Modify: `src/events/pnth.js` (Aegis, Foundry events)

- [ ] **Step 1: Set geopolitical flags from macro events**

Add `effects` (or extend existing ones) on these events in `macro.js`:

**`khasuria_incursion`** (~line 496): Add to existing effects:
```js
effects: (world) => {
    world.geopolitical.khasurianCrisis = 3;
    world.geopolitical.aegisDemandSurge = true;  // NEW
    shiftFaction('fedRelations', -2);
},
```

**`farsistan_full_closure`** (~line 551): Add to existing effects:
```js
effects: (world) => {
    world.geopolitical.farsistanEscalation = 3;
    world.geopolitical.straitClosed = true;
    world.geopolitical.oilCrisis = true;
    world.geopolitical.energyCrisis = true;  // NEW
    shiftFaction('fedRelations', -3);
    activateRegulation('oil_emergency');
},
```

**`mideast_oil_spike`** (~line 145): Add effects (currently has none):
```js
effects: (world) => { world.geopolitical.energyCrisis = true; },
```

- [ ] **Step 2: Set foundryCompetitionPressure from Zhaowei/Liang Wei events**

In `src/events/firm.js`, the Zhaowei conference event (~line 107) and in `src/events/market.js`, the Zhaowei keynote event (~line 110): add effects setting the flag.

For the firm.js event, add:
```js
effects: (world) => { world.geopolitical.foundryCompetitionPressure = true; },
```

For the market.js event, add:
```js
effects: (world) => { world.geopolitical.foundryCompetitionPressure = true; },
```

- [ ] **Step 3: Add when guards to PNTH Aegis events**

In `src/events/pnth.js`, find Aegis-related events (deployment, expansion, contract events). Add or extend their `when` guards to boost likelihood when `aegisDemandSurge` is true:

For events that already have `when` guards, wrap the existing condition:
```js
// Example: an Aegis expansion event
when: (sim, world) => world.pnth.aegisDeployed && /* existing condition */,
likelihood: (sim, world) => world.geopolitical.aegisDemandSurge ? 2.0 : 0.8,
```

For the Aegis expansion event at pnth.js:673 specifically, convert the static `likelihood` to a function:
```js
likelihood: (sim, world) => world.geopolitical.aegisDemandSurge ? 2.5 : 1.0,
```

- [ ] **Step 4: Add when guards to PNTH Foundry events**

Find Foundry-related events in pnth.js. Add likelihood functions that respond to `foundryCompetitionPressure`:
```js
likelihood: (sim, world) => world.geopolitical.foundryCompetitionPressure ? 1.5 : 0.8,
```

- [ ] **Step 5: Add direct followup from Khasuria incursion to Aegis expansion**

In `macro.js`, on `khasuria_incursion` (~line 496), add to its existing followups array:
```js
followups: [
    // ... existing followups ...
    { id: 'pnth_aegis_intl_expansion', mtth: 15, weight: 0.5 },
],
```

Verify the exact event ID by grepping pnth.js for the Aegis international expansion event (the one at line 673 with "Meridine military").

- [ ] **Step 6: Add direct followup from strait closure to Fed emergency**

In `macro.js`, on `farsistan_full_closure` (~line 551), add a followup to an existing Fed communication event. Grep `src/events/fed.js` for an emergency or crisis communication event ID, then add:
```js
followups: [
    // ... existing followups ...
    { id: '<fed_emergency_event_id>', mtth: 5, weight: 0.8 },
],
```

- [ ] **Step 7: Commit**

```bash
git add src/events/macro.js src/events/pnth.js src/events/firm.js src/events/market.js
git commit -m "feat: wire geopolitical events to PNTH via flags, guards, and followups"
```

---

### Task 9: Investigation Cross-Pollination

**Files:**
- Modify: `src/events/investigation.js` (Okafor probe stage 2+, Tan-Bowman stage 2+)
- Modify: `src/events/media.js` (Tan events — likelihood boosts)
- Modify: `src/events/firm.js` (desk events — meridianExposed guards)
- Create: One minimal bridge event (in `src/events/investigation.js`)

- [ ] **Step 1: Create meridian_exposed bridge event**

Add a new minimal event to the investigation events array in `src/events/investigation.js`:

```js
{
    id: 'meridian_exposed',
    followupOnly: true,
    category: 'investigation',
    headline: 'SEC compliance review flags Meridian Capital\'s derivatives desk in connection with ongoing federal probe. Your name appears in the filing.',
    likelihood: 0,
    magnitude: 'moderate',
    params: { theta: 0.005 },
    when: (sim, world, congress, ctx) =>
        !world.investigations.meridianExposed && (
            (ctx.pursued_insider_tip || ctx.pursued_pnth_tip || ctx.hosted_fundraiser) ||
            (world.factions && world.factions.regulatoryExposure > 50)
        ),
    effects: (world) => {
        world.investigations.meridianExposed = true;
        shiftFaction('regulatoryExposure', 10);
        shiftFaction('firmStanding', -5);
    },
},
```

Add `import { shiftFaction } from '../faction-standing.js';` at top if not already present.

- [ ] **Step 2: Add followup links from Okafor probe stage 2+ events**

Find events in investigation.js where `okaforProbeStage` reaches 2 or higher (via effects). Add a followup to `meridian_exposed`:

```js
followups: [
    // ... existing followups ...
    { id: 'meridian_exposed', mtth: 20, weight: 0.6 },
],
```

- [ ] **Step 3: Add followup links from Tan-Bowman stage 2+ events**

Find events in investigation.js where `tanBowmanStory` reaches 2 or higher. Add the same followup:

```js
followups: [
    // ... existing followups ...
    { id: 'meridian_exposed', mtth: 25, weight: 0.5 },
],
```

- [ ] **Step 4: Add media amplification — Tan-Bowman mtth reduction**

In investigation.js, find Tan-Bowman followup events. Where they have static `mtth` values, convert to functions that check `media.leakCount`:

```js
// Example: if a followup currently has mtth: 30
// On the parent event's followups array, the mtth could be made dynamic
// Since mtth is consumed by _followupDelay which expects a number,
// instead adjust the parent event's effects to bump leakCount,
// and add a likelihood boost on the followup's when guard.
```

Alternatively, add `when` guards on Tan-Bowman followup events that boost likelihood based on `leakCount`:
```js
likelihood: (sim, world) => 1 + (world.media.leakCount || 0) * 0.3,
```

- [ ] **Step 5: Add Okafor probe likelihood boost from Tan-Bowman stories**

On Okafor probe events in investigation.js, add or modify `likelihood` to respond to `tanBowmanStory`:

```js
likelihood: (sim, world) => world.investigations.tanBowmanStory >= 2 ? 1.8 : 1.0,
```

- [ ] **Step 6: Add meridianExposed guards on firm desk events**

In `src/events/firm.js`, on negative-tone triggered events (`desk_compliance_short`, `desk_unusual_activity`, `desk_risk_committee`), modify their `trigger` functions to fire more readily when `meridianExposed`:

```js
// In the trigger function, after existing checks:
// Lower the threshold when meridianExposed
trigger: (sim, world) => {
    // ... existing trigger logic ...
    // If meridianExposed, fire at lower thresholds
    const mult = world?.investigations?.meridianExposed ? 0.5 : 1.0;
    return <existing_condition_with_threshold * mult>;
},
```

The exact implementation depends on each event's trigger logic — the pattern is to halve the threshold when `meridianExposed` is true.

- [ ] **Step 7: Commit**

```bash
git add src/events/investigation.js src/events/media.js src/events/firm.js
git commit -m "feat: wire investigation cross-pollination with meridianExposed bridge"
```

---

### Task 10: Fed ↔ Geopolitical Wiring

**Files:**
- Modify: `src/events/fed.js` (rate cut events, emergency events)
- Modify: `src/events/macro.js` (strait closure followups, late hike effects)

- [ ] **Step 1: Add energyCrisis/recessionDeclared guards to Fed cut events**

In `src/events/fed.js`, find rate cut events (events with "cut" in ID or headline). Add or modify `when` guards:

```js
// Example: a rate cut event currently gated on cutCycle
when: (sim, world) => world.fed.cutCycle && /* existing conditions */,

// Add: boost likelihood when recession or energy crisis
likelihood: (sim, world) => {
    let base = 1.0;
    if (world.geopolitical.recessionDeclared) base *= 2.0;
    if (world.geopolitical.energyCrisis) base *= 1.5;
    return base;
},
```

For cut events that should activate even WITHOUT an explicit cut cycle when recession hits:
```js
when: (sim, world) => world.fed.cutCycle || world.geopolitical.recessionDeclared,
```

- [ ] **Step 2: Add strait closure → Fed followup**

In `src/events/macro.js`, on `farsistan_full_closure`, add a followup to a Fed emergency communication event (identified in Task 8 Step 6). If no suitable Fed event exists for a followup, the effects-based gating from Step 1 is sufficient.

- [ ] **Step 3: Add barronApproval nudge on late-cycle hike events**

In `src/events/fed.js`, find rate hike events in the `'late'` era or events that represent the 3rd+ hike in a cycle. Add to their `effects`:

```js
effects: (world) => {
    // ... existing effects ...
    world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
},
```

- [ ] **Step 4: Commit**

```bash
git add src/events/fed.js src/events/macro.js
git commit -m "feat: wire Fed events to geopolitical state (energy crisis, recession)"
```

---

### Task 11: Election Downstream Effects

**Files:**
- Modify: `src/events/congress.js` (Big Beautiful Bill, filibuster, deregulation events)
- Modify: `src/events/investigation.js` (Okafor probe events)

- [ ] **Step 1: Gate Big Beautiful Bill on midterm results**

In `src/events/congress.js`, find Big Beautiful Bill advancement events (those that check `bigBillStatus`). Add `when` guard conditions that block advancement if Farmer-Labor controls Congress:

```js
when: (sim, world) => {
    // ... existing conditions ...
    // Block if F-L won both chambers in midterms
    if (world.election.midtermResult === 'fed_loss_both') return false;
    return true;
},
```

- [ ] **Step 2: Boost Okafor probe likelihood after F-L midterm win**

In `src/events/investigation.js`, on Okafor probe events, add midterm-aware likelihood:

```js
likelihood: (sim, world) => {
    let base = /* existing likelihood value */;
    // Subpoena power after F-L takeover
    if (world.election.midtermResult === 'fed_loss_both' ||
        world.election.midtermResult === 'fed_loss_house') base *= 1.5;
    // Tan-Bowman amplification (from Task 9)
    if (world.investigations.tanBowmanStory >= 2) base *= 1.5;
    return base;
},
```

- [ ] **Step 3: Boost deregulation events after Federalist landslide**

In `src/events/congress.js`, find Financial Freedom Act and deregulation events. Add likelihood boost:

```js
likelihood: (sim, world) => {
    let base = /* existing value */;
    if (world.election.midtermResult === 'fed_gain') base *= 2.0;
    return base;
},
```

- [ ] **Step 4: Add likelihood penalty on investigation events after Federalist win**

In `src/events/investigation.js`, on non-followupOnly investigation events, add:

```js
// Within existing likelihood function or convert static to function:
likelihood: (sim, world) => {
    let base = /* existing value */;
    if (world.election.midtermResult === 'fed_gain') base *= 0.5;
    return base;
},
```

- [ ] **Step 5: Commit**

```bash
git add src/events/congress.js src/events/investigation.js
git commit -m "feat: wire midterm results to downstream event likelihood"
```

---

### Task 12: PNTH Product Arc Cross-References

**Files:**
- Modify: `src/events/pnth.js` (Companion, Aegis, Foundry, board events)

- [ ] **Step 1: Companion scandal → Aegis controversy spillover**

Find Companion scandal events that advance `companionScandal` to stage 2+. Add to their `effects`:

```js
// In the effects function/array, add:
{ path: 'pnth.aegisControversy', op: 'add', value: 1 },
```

Or if effects is a function:
```js
world.pnth.aegisControversy = Math.min(3, (world.pnth.aegisControversy || 0) + 1);
```

- [ ] **Step 2: Aegis controversy → commercial momentum reduction**

Find Aegis controversy events that advance `aegisControversy` to stage 2+. Add to their effects:

```js
world.pnth.commercialMomentum = Math.max(-3, (world.pnth.commercialMomentum || 0) - 1);
```

- [ ] **Step 3: Foundry success → commercial momentum boost**

Find Foundry launch/success events. Add to their effects:

```js
world.pnth.commercialMomentum = Math.min(3, (world.pnth.commercialMomentum || 0) + 1);
```

- [ ] **Step 4: Product outcomes → board dynamics**

On Aegis success events (contract wins, deployment milestones): add `{ path: 'pnth.boardDirks', op: 'add', value: 1 }`.

On Companion scandal escalation events: add `{ path: 'pnth.boardGottlieb', op: 'add', value: -1 }`.

Ensure board values stay in valid range (0-10) by using `Math.min(10, ...)` / `Math.max(0, ...)`.

- [ ] **Step 5: Commit**

```bash
git add src/events/pnth.js
git commit -m "feat: wire PNTH product arcs together (scandal spillover, board shifts)"
```

---

### Task 13: Lobbying → Narrative Consequences

**Files:**
- Modify: `src/events/media.js` (Rachel Tan events)
- Modify: `src/events/investigation.js` (meridianExposed conditions)
- Modify: `src/events/firm.js` (compliance events)
- Modify: `src/events.js` (maybeFire — lobbyingExposed check)

- [ ] **Step 1: Boost Rachel Tan media events when fundraiser + low mediaTrust**

In `src/events/media.js`, find Rachel Tan story events. Modify their `likelihood` to check lobby flags:

```js
likelihood: (sim, world, congress) => {
    let base = /* existing value */;
    const ctx = this?._playerCtx;  // won't work — see note
    // Since media events don't have access to playerCtx in likelihood,
    // use world.media.lobbyingExposed instead
    if (world.media.lobbyingExposed) base *= 2.0;
    return base;
},
```

Note: `likelihood` functions receive `(sim, world, congress)` — not `playerCtx`. So lobby flag checks must go through the `lobbyingExposed` world-state flag, which is set centrally.

- [ ] **Step 2: Set lobbyingExposed in the event engine**

In `src/events.js`, in `maybeFire()` or in the daily update path in `main.js`, add a check that sets the flag:

In `main.js` `_onDayComplete()`, after the lobbying section or in the event engine update, add:

```js
// Check if lobbying has been exposed (lobby count threshold + low media trust)
if (eventEngine && _lobbyCount >= 3 && factions.mediaTrust < 40) {
    eventEngine.world.media.lobbyingExposed = true;
}
```

This goes in `_onDayComplete()` near the other standings/faction updates.

- [ ] **Step 3: Add lobby flag to meridianExposed conditions**

In the `meridian_exposed` bridge event (created in Task 9), the `when` guard already checks `ctx.hosted_fundraiser`. Also check for `world.media.lobbyingExposed`:

```js
when: (sim, world, congress, ctx) =>
    !world.investigations.meridianExposed && (
        (ctx.pursued_insider_tip || ctx.pursued_pnth_tip || ctx.hosted_fundraiser) ||
        (world.factions && world.factions.regulatoryExposure > 50) ||
        world.media.lobbyingExposed  // NEW
    ),
```

- [ ] **Step 4: Boost firm compliance events when lobbyingExposed**

In `src/events/firm.js`, on key compliance triggered events, add world state check in trigger:

```js
// In desk_unusual_activity, desk_compliance_short, desk_risk_committee triggers:
// After existing logic, add a lobbyingExposed fast-path
trigger: (sim, world) => {
    if (world?.media?.lobbyingExposed) return true;  // auto-trigger when exposed
    // ... existing trigger logic ...
},
```

Use this sparingly — only on 2-3 events where media exposure would logically trigger compliance attention.

- [ ] **Step 5: Commit**

```bash
git add src/events/media.js src/events/investigation.js src/events/firm.js main.js
git commit -m "feat: wire lobbying to narrative consequences via lobbyingExposed flag"
```

---

### Task 14: Unused playerFlags Integration

**Files:**
- Modify: `src/endings.js` (ending page generation)
- Modify: `src/events/investigation.js` (when guards)
- Modify: `src/events/firm.js` (when guards)

- [ ] **Step 1: Identify the highest-value unused flags**

Grep for all `playerFlag:` declarations across event files, then grep for all `playerChoices` reads in endings.js. The difference is the unused set. Priority flags to wire:

**Investigation sensitivity flags** (already partially done in Task 9):
- `pursued_insider_tip`, `pursued_pnth_tip` — used in meridianExposed guard
- `hosted_fundraiser` — used in meridianExposed guard

**Compliance stance flags** (wire into endings):
- `cooperated_with_compliance`, `lawyered_up`, `lawyered_up_unusual`, `stonewalled_sec`
- `filed_fomc_docs`, `declined_analyst_color`

**Trading style flags** (wire into ending tone):
- `doubled_down_short`, `covered_losing_short`, `comeback_disciplined`, `comeback_aggressive`
- `owned_tape_presence`, `hedged_unlimited_risk`

- [ ] **Step 2: Wire compliance flags into endings.js**

In `src/endings.js`, in the page generation functions, add conditional paragraphs based on compliance flags:

```js
// In the career/reputation page generation:
if (ctx.cooperated_with_compliance || ctx.filed_fomc_docs) {
    body += _p('Your compliance record was immaculate — every filing on time, every flag addressed. It was the kind of paper trail that made lawyers smile and regulators nod.');
} else if (ctx.lawyered_up || ctx.stonewalled_sec) {
    body += _p('You lawyered up every time compliance knocked. The firm\'s general counsel had your outside attorney on speed dial. Whether this was prudence or paranoia depended on who you asked.');
}
```

- [ ] **Step 3: Wire trading style flags into ending tone**

In `src/endings.js`, in the trading assessment section:

```js
if (ctx.doubled_down_short || ctx.comeback_aggressive || ctx.owned_tape_presence) {
    body += _p('You traded with the kind of conviction that made other desks nervous. When the market moved against you, you didn\'t flinch — you added.');
} else if (ctx.comeback_disciplined || ctx.covered_losing_short) {
    body += _p('You learned when to hold and when to fold. The market tested you and you adapted. Not glamorous. Effective.');
}
```

- [ ] **Step 4: Wire lobby/political flags into investigation event guards**

In investigation events, use `ctx.attended_political_dinner` and similar political flags to modulate whether Meridian gets drawn in:

```js
// Extend meridian_exposed when guard with additional political flags:
(ctx.attended_political_dinner || ctx.lobbied_pac_federalist || ctx.lobbied_pac_farmerlabor)
```

- [ ] **Step 5: Commit**

```bash
git add src/endings.js src/events/investigation.js src/events/firm.js
git commit -m "feat: integrate unused playerFlags into endings and event guards"
```

---

## Phase 3: Polish

### Task 15: Conditional Context & Headline Additions

**Files:**
- Modify: `src/events/pnth.js` (Aegis, Foundry events — cross-domain context)
- Modify: `src/events/investigation.js` (meridianExposed context)
- Modify: `src/events/congress.js` (midterm-aware context)
- Modify: `src/events/macro.js` (headline additions)

- [ ] **Step 1: Add geopolitical context to PNTH popup events**

For PNTH Aegis popup events, add or modify `context` functions to include geopolitical state:

```js
context: (sim, world, portfolio) => {
    let text = /* existing context text */;
    if (world.geopolitical.khasurianCrisis >= 2) {
        text += ' The Khasurian border crisis has made Aegis a national security priority overnight.';
    }
    return text;
},
```

For Foundry events:
```js
if (world.geopolitical.foundryCompetitionPressure) {
    text += ' Zhaowei\'s sovereign-backed compute buildout looms over every Foundry projection.';
}
```

- [ ] **Step 2: Add meridianExposed context to investigation popup events**

For investigation popup events, modify context to acknowledge when Meridian is named:

```js
context: (sim, world, portfolio) => {
    let text = /* existing context */;
    if (world.investigations.meridianExposed) {
        text += ' Your desk\'s name is in the filing. This is no longer someone else\'s problem.';
    }
    return text;
},
```

- [ ] **Step 3: Add brief headline clauses for toast events**

For toast-only events (no popup), add brief conditional headline amendments. This requires converting static `headline` strings to functions where cross-domain context changes the meaning:

```js
// Convert headline from string to function where needed:
headline: (sim, world) => {
    let h = 'Base headline text here';
    if (world.geopolitical.aegisDemandSurge) h += ' as Khasuria tensions escalate';
    return h;
},
```

**Important:** Check that the event engine's `_logEvent` and toast display handle function-type headlines. If headlines are currently always strings, either:
- Keep headlines as strings and put conditional text only in `context` (safer)
- Or add a headline-resolution step in `_fireEvent` (more invasive)

Grep `event.headline` usage in events.js and main.js to determine which approach is needed. If headlines must be strings, skip this step and rely on context functions only.

- [ ] **Step 4: Commit**

```bash
git add src/events/pnth.js src/events/investigation.js src/events/congress.js src/events/macro.js
git commit -m "feat: add conditional cross-domain context to popup and toast events"
```

---

### Task 16: Final Consistency Pass

**Files:** All modified files from previous tasks

- [ ] **Step 1: Verify new world-state paths**

```bash
# Grep for all new flag references and verify they match createWorldState()
grep -rn "aegisDemandSurge\|foundryCompetitionPressure\|energyCrisis\|meridianExposed\|lobbyingExposed" src/
```

Every reference should trace back to a valid path in `createWorldState()`.

- [ ] **Step 2: Verify no circular dependencies introduced**

Check that no event's `effects` function sets a flag that is also checked by its own `when` guard (self-referential loop). Review the domain interaction matrix from the audit:

```bash
# Check effects → when guard loops
grep -n "effects.*meridianExposed" src/events/investigation.js
grep -n "when.*meridianExposed" src/events/investigation.js
# These should be on DIFFERENT events (bridge event sets it, other events read it)
```

- [ ] **Step 3: Verify faction references after factions cleanup**

```bash
# Ensure nothing reads world.factions before the sync line
grep -rn "world\.factions\." src/ | head -30
# All should be in event when/effects functions that only run after init
```

- [ ] **Step 4: Verify all followup IDs exist**

```bash
# Extract all followup target IDs and verify they exist as event IDs
grep -rn "id: '" src/events/ | grep -o "id: '[^']*'" | sort -u > /tmp/event_ids.txt
grep -rn "{ id: '" src/events/ | grep -o "id: '[^']*'" | sort -u > /tmp/followup_ids.txt
# Compare the two lists
```

- [ ] **Step 5: Verify conditional context functions handle null world state**

```bash
# Check all context functions use optional chaining or null checks
grep -n "context:" src/events/*.js | head -20
# Verify patterns like world?.investigations?.meridianExposed
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final consistency pass on cross-domain narrative web"
```

---

## Summary

| Task | Phase | Files Modified | Commits |
|------|-------|---------------|---------|
| 1. Lore geography fixes | 1 | 8 | 1 |
| 2. Lore bible & intro | 1 | 2 | 1 |
| 3. Engine hardening | 1 | 1 | 1 |
| 4. Weight normalization | 1 | 1 | 1 |
| 5. World-state flags | 1 | 2 | 1 |
| 6. firmCooldownMult rework | 1 | 2 | 1 |
| 7. Midterm rebalancing | 1 | 1 | 1 |
| 8. Geopolitical → PNTH | 2 | 4 | 1 |
| 9. Investigation cross-pollination | 2 | 3 | 1 |
| 10. Fed ↔ Geopolitical | 2 | 2 | 1 |
| 11. Election downstream | 2 | 2 | 1 |
| 12. PNTH product arcs | 2 | 1 | 1 |
| 13. Lobbying consequences | 2 | 4 | 1 |
| 14. playerFlags integration | 2 | 3 | 1 |
| 15. Conditional context | 3 | 4 | 1 |
| 16. Consistency pass | 3 | all | 1 |

**Total: 16 tasks, 16 commits, ~17 files modified, 1 new bridge event created.**
