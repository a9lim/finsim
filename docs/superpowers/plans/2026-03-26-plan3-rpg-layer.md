# Plan 3: RPG Layer (Core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add core RPG systems on top of the faction foundation: unified trait system (merging convictions + reputation tags), expanded lobbying, overhauled endings, standings dashboard, expanded interjections, and full faction/trait integration into the existing event and popup pools.

**Architecture:** `convictions.js` is renamed to `traits.js` and extended with 6 dynamic reputation tags alongside the existing 12 permanent convictions. New module `endings.js` replaces `epilogue.js` with 6 ending variants and a 5-page adaptive epilogue. The info tab gets a new Standings sub-tab. Lobbying expands from 2 blanket PAC actions to a 3-tier targeted system. The existing ~420 toast events and ~30 popup decisions are retrofitted with faction shifts, trait gating, and integration so the new systems are deeply woven into the narrative fabric rather than bolted on.

**Tech Stack:** Vanilla ES6 modules, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-26-rpg-depth-design.md` — Sections 4, 5, 7 (plus capitalMultiplier from Section 2)

**Prerequisites:** Plan 1 (faction foundation) and Plan 2 (event unification) must be complete.

**Security note:** All HTML rendering uses the existing project pattern for building UI. The codebase already uses innerHTML for dynamic content (event log, popups, epilogue, etc.) with internally-generated strings — no user-supplied or external input is interpolated. New code follows the same pattern. All content is generated from internal game state objects, never from user text input.

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Rename+Modify | `src/convictions.js` → `src/traits.js` | Merge reputation tags into unified trait system; rename all exports |
| Modify | `main.js` | Update imports from traits.js; wire trait evaluation, endings, standings into game loop |
| Modify | `src/faction-standing.js` | Update import to traits.js; add capitalMultiplier export |
| Modify | `src/events.js` | Update import to traits.js; filter followupOnly events; expose traitIds + portfolio metrics to guards |
| Modify | `src/popup-events.js` | Update import to traits.js; add faction shifts, world-state effects, trait integration |
| Modify | `src/lobbying.js` | Update import to traits.js; expand to 3-tier PAC funding |
| Modify | `src/event-pool.js` | Add followupOnly flags; firm dynamics events; faction shifts; ~30 new trait/faction/portfolio-gated events |
| Modify | `src/events.js` | Add interjection recurring pulse |
| Delete | `src/interjections.js` | Migrated to event-pool.js as category 'interjection' |
| Modify | `src/ui.js` | Standings rendering |
| Create | `src/endings.js` | 6 ending conditions, 5-page epilogue generation |
| Modify | `index.html` | Standings tab, lobby bar, epilogue 5th dot |
| Delete | `src/epilogue.js` | Replaced by endings.js |

---

### Task 1: Rename convictions.js → traits.js and merge reputation tags

**Files:**
- Rename: `src/convictions.js` → `src/traits.js`
- Modify: `src/traits.js`
- Modify: `main.js`
- Modify: `src/faction-standing.js`
- Modify: `src/events.js`
- Modify: `src/popup-events.js`
- Modify: `src/lobbying.js`

Merge reputation tags into the existing conviction system, creating a unified trait system. The 12 existing convictions (permanent, mechanical effects) are joined by 6 dynamic reputation tags (faction-derived, narrative gating). One module, one API.

- [ ] **Step 1: Read all consumers of convictions.js**

Read `main.js`, `src/faction-standing.js`, `src/events.js`, `src/popup-events.js`, `src/lobbying.js`, and `src/epilogue.js` to find all import statements and function calls referencing `convictions.js`.

Consumer summary (from audit):
- `main.js`: imports `evaluateConvictions`, `getActiveConvictions`, `getConviction`, `getConvictionEffect`, `resetConvictions`, `getConvictionIds`
- `faction-standing.js`: imports `getConvictionEffect` (3 calls)
- `events.js`: imports `getConvictionEffect`, `getConvictionIds` (likelihood modifiers)
- `popup-events.js`: imports `getConvictionIds` (context flavor text)
- `lobbying.js`: imports `getConvictionEffect` (2 calls)
- `epilogue.js`: references conviction IDs as strings (no import, receives IDs as parameter)

- [ ] **Step 2: Rename file and add reputation tags to TRAITS array**

Rename `src/convictions.js` to `src/traits.js`. Add a `permanent` field to each existing conviction (all `true`), then append the 6 reputation tags with `permanent: false`. Tags have no `effects` — they gate narrative content only.

```javascript
/* ===================================================
   traits.js -- Unified trait system. Permanent convictions
   unlocked by choices + dynamic reputation tags derived
   from faction scores. Leaf module. No DOM access.
   =================================================== */

import { getFaction } from './faction-standing.js';

const _active = new Set();
let _quietMoneyLost = false;

const TRAITS = [
    // ── Convictions (permanent, mechanical effects) ────────────

    {
        id: 'information_edge',
        name: 'Information Is Everything',
        permanent: true,
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.pursued_insider_tip) score++;
            if (f.pursued_pnth_tip) score++;
            if (f.pursued_analyst_tip) score++;
            return score >= 2;
        },
        effects: { eventHintArrows: true, firmCooldownMult: 0.8 },
    },
    // ... (all 12 existing convictions, each with permanent: true added) ...

    // ── Reputation tags (dynamic, narrative gating) ────────────

    {
        id: 'market_mover',
        name: 'Market Mover',
        permanent: false,
        condition: (ctx) => (ctx.flags.largeImpactTrades || 0) >= 3,
        effects: {},
    },
    {
        id: 'political_player',
        name: 'Political Player',
        permanent: false,
        condition: () => getFaction('federalistSupport') > 50 || getFaction('farmerLaborSupport') > 50,
        effects: {},
    },
    {
        id: 'media_figure',
        name: 'Media Figure',
        permanent: false,
        condition: (ctx) => getFaction('mediaTrust') > 60 || (ctx.flags.continentalMentions || 0) >= 2,
        effects: {},
    },
    {
        id: 'under_scrutiny',
        name: 'Under Scrutiny',
        permanent: false,
        condition: () => getFaction('regulatoryExposure') > 50,
        effects: {},
    },
    {
        id: 'meridian_star',
        name: 'Meridian Star',
        permanent: false,
        condition: () => getFaction('firmStanding') > 80,
        effects: {},
    },
    {
        id: 'quiet_money',
        name: 'Quiet Money',
        permanent: false,
        loseForever: true,
        condition: () =>
            getFaction('federalistSupport') < 40 &&
            getFaction('farmerLaborSupport') < 40 &&
            getFaction('mediaTrust') < 40 &&
            getFaction('regulatoryExposure') < 25,
        effects: {},
    },
];
```

- [ ] **Step 3: Rewrite evaluation to handle both permanent and dynamic traits**

```javascript
/**
 * Evaluate all traits. Call once per day.
 * Permanent traits (convictions) are one-way: once active, never removed.
 * Dynamic traits (reputation tags) are re-evaluated each call.
 * Special: loseForever traits are permanently lost once their condition fails.
 * @param {Object} ctx - { playerChoices, factions, impactHistory, quarterlyReviews, daysSinceLiveTrade, flags }
 *   `flags` contains per-evaluation context like { largeImpactTrades, continentalMentions }.
 * @returns {string[]} IDs of newly activated traits (for toast notifications)
 */
export function evaluateTraits(ctx) {
    const newlyActive = [];
    for (const trait of TRAITS) {
        const wasActive = _active.has(trait.id);

        if (trait.permanent) {
            // Convictions: once unlocked, permanent
            if (wasActive) continue;
            try {
                if (trait.condition(ctx)) {
                    _active.add(trait.id);
                    newlyActive.push(trait.id);
                }
            } catch { /* skip */ }
        } else if (trait.loseForever) {
            // quietMoney: dynamic but permanently lost once broken
            if (_quietMoneyLost) { _active.delete(trait.id); continue; }
            try {
                if (trait.condition(ctx)) {
                    if (!wasActive) { _active.add(trait.id); newlyActive.push(trait.id); }
                } else {
                    _active.delete(trait.id);
                    _quietMoneyLost = true;
                }
            } catch { /* skip */ }
        } else {
            // Dynamic tags: re-evaluated every call
            try {
                if (trait.condition(ctx)) {
                    if (!wasActive) newlyActive.push(trait.id);
                    _active.add(trait.id);
                } else {
                    _active.delete(trait.id);
                }
            } catch { /* skip */ }
        }
    }
    return newlyActive;
}
```

- [ ] **Step 4: Rename exports for the unified API**

Keep backward-compatible names where the rename is trivial, but establish the new canonical names:

```javascript
/** Check if a trait (conviction or tag) is active. */
export function hasTrait(id) { return _active.has(id); }

/** Get the composed effect value across all active traits. */
export function getTraitEffect(effectKey, defaultVal) {
    let result = defaultVal;
    for (const trait of TRAITS) {
        if (!_active.has(trait.id)) continue;
        const val = trait.effects[effectKey];
        if (val === undefined) continue;
        if (typeof val === 'boolean') { if (val) return true; }
        else if (typeof val === 'number') { result *= val; }
    }
    return result;
}

/** Get IDs of all currently active traits. */
export function getActiveTraitIds() { return [..._active]; }

/** Get full trait objects for all active traits. */
export function getActiveTraits() { return TRAITS.filter(t => _active.has(t.id)); }

/** Look up a trait definition by ID. */
export function getTrait(id) { return TRAITS.find(t => t.id === id) || null; }

/** Clear all active traits. */
export function resetTraits() { _active.clear(); _quietMoneyLost = false; }

export { TRAITS };
```

- [ ] **Step 5: Update all consumers**

Rename imports in every consumer file. The function signatures change as follows:

| Old (convictions.js) | New (traits.js) |
|---|---|
| `import { ... } from './convictions.js'` | `import { ... } from './traits.js'` |
| `getConvictionEffect(key, default)` | `getTraitEffect(key, default)` |
| `getConvictionIds()` | `getActiveTraitIds()` |
| `getActiveConvictions()` | `getActiveTraits()` |
| `getConviction(id)` | `getTrait(id)` |
| `evaluateConvictions(ctx)` | `evaluateTraits(ctx)` |
| `resetConvictions()` | `resetTraits()` |

Files to update:
- **main.js**: Update import path and all 6+ function names. Update the evaluation call to pass `flags` in the context object (for reputation tag evaluation): `evaluateTraits({ playerChoices, factions, impactHistory, quarterlyReviews, daysSinceLiveTrade, flags: { largeImpactTrades: impactHistory.length, continentalMentions: playerChoices._continentalMentions || 0 } })`
- **faction-standing.js**: `getConvictionEffect` → `getTraitEffect` (3 call sites)
- **events.js**: `getConvictionEffect` → `getTraitEffect`, `getConvictionIds` → `getActiveTraitIds`
- **popup-events.js**: `getConvictionIds` → `getActiveTraitIds`
- **lobbying.js**: `getConvictionEffect` → `getTraitEffect` (2 call sites)
- **epilogue.js**: Uses conviction IDs as strings — no import change needed, but the parameter name in the calling code (main.js) should reflect the rename

- [ ] **Step 6: Delete old file and commit**

```bash
git rm src/convictions.js
git add src/traits.js main.js src/faction-standing.js src/events.js src/popup-events.js src/lobbying.js
git commit -m "feat: merge reputation tags into convictions → unified traits.js with 12 permanent + 6 dynamic traits"
```

---

### Task 2: Expand lobbying.js

**Files:**
- Modify: `src/lobbying.js`

Expand from 2 blanket PAC actions to targeted politician funding with 3 tiers.

- [ ] **Step 1: Read current lobbying.js**

Read `src/lobbying.js` to understand the current structure.

- [ ] **Step 2: Replace LOBBY_ACTIONS with tiered system**

Import faction functions and replace the existing `LOBBY_ACTIONS`:

```javascript
import { getFaction, shiftFaction, factions } from './faction-standing.js';
import { getFaction, shiftFaction, factions } from './faction-standing.js';
import { hasTrait, getTraitEffect } from './traits.js';

const LOBBY_COOLDOWN = 30;
const MOMENTUM_CAP = 3;
let _lastLobbyDay = -Infinity;

export const LOBBY_ACTIONS = [
    // Tier 1
    {
        id: 'pac_federalist', tier: 1,
        name: 'Fund Federalist PAC',
        desc: 'Support the ruling party. Advances their legislative agenda.',
        baseCost: 400,
        gate: () => true,
        execute: (world) => {
            shiftFaction('federalistSupport', 4);
            shiftFaction('farmerLaborSupport', -1);
            shiftFaction('regulatoryExposure', 3);
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
            world.election.lobbyMomentum = Math.min(MOMENTUM_CAP, world.election.lobbyMomentum + 1);
        },
    },
    {
        id: 'pac_farmerlabor', tier: 1,
        name: 'Fund Farmer-Labor PAC',
        desc: 'Support the opposition. Signals independence.',
        baseCost: 400,
        gate: () => true,
        execute: (world) => {
            shiftFaction('farmerLaborSupport', 4);
            shiftFaction('federalistSupport', -1);
            shiftFaction('regulatoryExposure', 3);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            world.election.lobbyMomentum = Math.max(-MOMENTUM_CAP, world.election.lobbyMomentum - 1);
        },
    },
    // Tier 2
    {
        id: 'host_fundraiser', tier: 2,
        name: 'Host a Fundraiser',
        desc: 'Higher cost, builds access to multiple politicians.',
        baseCost: 800,
        gate: () => hasTrait('political_player') || getFaction('federalistSupport') > 50 || getFaction('farmerLaborSupport') > 50,
        execute: (world) => {
            const fedSup = getFaction('federalistSupport');
            const flSup = getFaction('farmerLaborSupport');
            if (fedSup >= flSup) shiftFaction('federalistSupport', 8);
            else shiftFaction('farmerLaborSupport', 8);
            shiftFaction('regulatoryExposure', hasTrait('under_scrutiny') ? 5 : 2);
        },
        playerFlag: 'hosted_fundraiser',
    },
    // Tier 3
    {
        id: 'broker_deal', tier: 3,
        name: 'Broker a Deal',
        desc: 'Requires bipartisan access. Attempt a legislative compromise.',
        baseCost: 1200,
        gate: () => getFaction('federalistSupport') > 60 && getFaction('farmerLaborSupport') > 60,
        execute: (world) => {
            if (world.congress.bigBillStatus < 4) {
                world.congress.bigBillStatus = Math.min(4, world.congress.bigBillStatus + 1);
            }
            shiftFaction('federalistSupport', 3);
            shiftFaction('farmerLaborSupport', 3);
            shiftFaction('regulatoryExposure', 5);
        },
        playerFlag: 'brokered_deal',
    },
    {
        id: 'leak_to_media', tier: 3,
        name: 'Leak to Media',
        desc: 'Feed information to shape the narrative. High risk if traced.',
        baseCost: 0,
        gate: () => getFaction('mediaTrust') > 70,
        execute: (world) => {
            const traceChance = hasTrait('ghost_protocol') ? 0.25 : 0.5;
            const traced = Math.random() < traceChance;
            if (traced) {
                shiftFaction('mediaTrust', -20);
                shiftFaction('regulatoryExposure', 15);
            } else {
                shiftFaction('mediaTrust', 5);
            }
        },
        playerFlag: 'leaked_to_media',
    },
    {
        id: 'counsel_fed', tier: 3,
        name: 'Counsel the Fed',
        desc: 'Nudge rate policy through informal advisory access.',
        baseCost: 0,
        gate: () => getFaction('fedRelations') > 75,
        execute: (world) => {
            shiftFaction('fedRelations', 5);
            // Rate guidance nudge — implementation depends on how rate guidance works in sim
        },
        playerFlag: 'counseled_fed',
    },
];

export function getAvailableActions(day, cash) {
    const costMult = getTraitEffect('lobbyingCostMult', 1);
    return LOBBY_ACTIONS
        .filter(a => a.gate())
        .map(a => ({
            ...a,
            cost: Math.round(a.baseCost * costMult),
            affordable: cash >= Math.round(a.baseCost * costMult),
            cooldownReady: day - _lastLobbyDay >= LOBBY_COOLDOWN,
        }));
}

export function executeLobbyAction(actionId, day, world) {
    const action = LOBBY_ACTIONS.find(a => a.id === actionId);
    if (!action) return null;
    const costMult = getTraitEffect('lobbyingCostMult', 1);
    const cost = Math.round(action.baseCost * costMult);
    action.execute(world);
    _lastLobbyDay = day;
    return { cost, action, playerFlag: action.playerFlag || null };
}

export function resetLobbying() {
    _lastLobbyDay = -Infinity;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lobbying.js
git commit -m "feat: expand lobbying to 3-tier targeted PAC funding system"
```

---

### Task 3: Add capitalMultiplier mechanic

**Files:**
- Modify: `src/faction-standing.js`
- Modify: `main.js` or `src/portfolio.js`

The spec says `capitalMultiplier` (0.5 at firmStanding=0, 1.0 at 50, 1.5 at 100) scales maximum position notional.

- [ ] **Step 1: Add capitalMultiplier export to faction-standing.js**

```javascript
/** Capital allocation multiplier based on firm standing. Scales position limits. */
export function capitalMultiplier() {
    return 0.5 + (factions.firmStanding / 100);
}
```

- [ ] **Step 2: Wire capitalMultiplier into position limit checks**

Read `main.js` and `portfolio.js` to find where position size limits are enforced (margin checks, rogue trading thresholds). Multiply the relevant limits by `capitalMultiplier()`. The exact integration point depends on how the existing code enforces position limits — this step requires reading the current implementation.

- [ ] **Step 3: Commit**

```bash
git add src/faction-standing.js main.js
git commit -m "feat: add capitalMultiplier mechanic scaling position limits with firm standing"
```

---

### Task 4: Create endings.js

**Files:**
- Create: `src/endings.js`

Replaces `epilogue.js`. Evaluates 6 terminal conditions and generates 5-page adaptive epilogue.

- [ ] **Step 1: Create the module with ending condition evaluation and epilogue generation**

This is a large module. Create it with `checkEndings()` for terminal condition evaluation and `generateEnding()` for the 5-page epilogue. The epilogue pages build DOM fragments using `document.createElement` rather than string interpolation, following the same pattern as the briefing system.

The full implementation should cover:
- `checkEndings(sim, portfolio, world)` — returns ending ID or null, following priority order
- `generateEnding(endingId, world, sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews)` — returns array of 5 page objects `{ title, content }` where content is a DocumentFragment or HTML string
- Helper functions for each page: `_pageElection`, `_pagePNTH`, `_pageWorld`, `_pageMeridian`, `_pageLegacy`

The endings module reads `getFactionState()` and `getActiveTraitIds()` internally rather than receiving them as parameters.

See the spec (Section 7) for the full ending conditions and epilogue content guidelines. The implementation should follow the existing `epilogue.js` patterns for page structure and rendering, updated with the new faction-based content.

- [ ] **Step 2: Commit**

```bash
git add src/endings.js
git commit -m "feat: create endings.js with 6 endings and 5-page adaptive epilogue"
```

---

### Task 5: Update index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Read index.html to find the info tab and lobby bar structure**

Read `index.html` to find the existing Info tab sub-tabs and lobby bar.

- [ ] **Step 2: Add Standings sub-tab to the Info tab**

The Info tab uses the shared tab system (`shared-tabs.js`). Add a new tab button to the Info tab's tab-bar and corresponding panel. The new tab should be a peer of the existing sub-tabs (Settings, Event Log, etc.):

```html
<button class="tab-btn" data-tab="standings">Standings</button>
```

And corresponding panel:

```html
<div class="tab-panel" data-tab="standings" hidden>
  <div id="standings-world"></div>
  <div id="standings-factions"></div>
</div>
```

- [ ] **Step 3: Update epilogue overlay for 5 pages**

The existing epilogue overlay (`#epilogue-overlay`) has 4 hardcoded dot spans. Add a 5th dot for the new Meridian Capital page. If dots are generated dynamically in `_showEpilogue`, no change is needed — read the HTML to determine which approach is used.

- [ ] **Step 4: Update lobby bar HTML for tiered actions**

The existing lobby bar (around line 249-253 of index.html) has two hardcoded pill buttons. Replace with a container that will be dynamically populated by the lobbying system:

```html
<div id="lobby-bar">
  <div id="lobby-actions"></div>
</div>
```

The lobby action buttons will be rendered dynamically by the lobbying module based on `getAvailableActions()`. Read the current lobby bar implementation to understand the exact current structure before modifying.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add standings tab, update lobby bar and epilogue for RPG layer"
```

---

### Task 6: Wire trait evaluation and endings into main.js

**Files:**
- Modify: `main.js`

Connect trait evaluation (daily re-evaluation of dynamic tags) and the new endings system to the game loop. Task 1 already updated the import paths and renamed all conviction API calls. This task wires in the new `evaluateTraits()` call and the endings system.

- [ ] **Step 1: Add imports for new modules**

```javascript
import { checkEndings, generateEnding } from './src/endings.js';
```

- [ ] **Step 2: Add daily trait evaluation to _onDayComplete**

After events have fired in `_onDayComplete()`, add:

```javascript
evaluateTraits({
    playerChoices, factions, impactHistory, quarterlyReviews,
    daysSinceLiveTrade: sim.day - (playerChoices._lastTradeDay || 0),
    flags: {
        largeImpactTrades: impactHistory.length,
        continentalMentions: playerChoices._continentalMentions || 0,
    },
});
```

- [ ] **Step 3: Replace epilogue check with endings check**

**Important placement:** The spec requires terminal conditions be evaluated AFTER events and faction shifts have been applied for that day. Find the existing epilogue check (around line 1190) — if it's before event firing (line 1198), move the endings check to AFTER event processing. Place it after the `evaluateTraits()` call added in Step 2.

```javascript
const endingId = checkEndings(sim, portfolio, eventEngine.world);
if (endingId) {
    playing = false;
    updatePlayBtn($, playing);
    const pages = generateEnding(endingId, eventEngine.world, sim, portfolio,
        eventEngine.eventLog, playerChoices, impactHistory, quarterlyReviews);
    _showEpilogue(pages);
    return;
}
```

- [ ] **Step 4: Update _showEpilogue to accept the new page format**

Remove the `import` of `generateEpilogue` from `epilogue.js` (already deleted in Task 1's consumer rename pass — verify it's gone).

The existing `_showEpilogue()` function (around lines 2159-2218) handles page navigation with dots, back/next buttons, focus trapping, restart, and keep-playing. It currently receives 4 pages from `generateEpilogue()` — each page is an object with `{ title, html }`.

Update `_showEpilogue` to:
1. Accept the new 5-page `pages` array from `generateEnding()`
2. Generate dots dynamically based on `pages.length` (rather than hardcoded 4 dots)
3. Keep the existing navigation, focus trap, and restart logic

The page format from `generateEnding()` should match what `_showEpilogue` expects: `{ title, html }` where `html` is a string. If `_showEpilogue` uses a different format, adapt `generateEnding()` to match.

Read the existing `_showEpilogue` implementation to determine the exact page format and dot generation pattern before making changes.

- [ ] **Step 5: Update _resetCore**

Add:
```javascript
resetTraits();
```

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: wire trait evaluation and endings into main game loop"
```

---

### Task 7: Add standings UI rendering

**Files:**
- Modify: `src/ui.js`
- Modify: `main.js`

- [ ] **Step 1: Read ui.js to understand how info tab content is rendered**

Read `src/ui.js` to find the info tab rendering patterns.

- [ ] **Step 2: Add standings rendering function to ui.js**

Add a function that renders world state and faction scores into the standings panel using DOM methods:

```javascript
export function updateStandings($, world, factions, getFactionDescriptor) {
    _renderWorldState($.standingsWorld, world);
    _renderFactionScores($.standingsFactions, factions, getFactionDescriptor);
}

function _renderWorldState(container, world) {
    container.textContent = '';
    const h4 = document.createElement('h4');
    h4.textContent = 'World State';
    container.appendChild(h4);
    const entries = [
        ['Barron Approval', world.election.barronApproval + '%'],
        ['Congress', 'Senate ' + world.congress.senate.federalist + 'F / ' + world.congress.senate.farmerLabor + 'FL'],
        ['Big Beautiful Bill', 'Stage ' + world.congress.bigBillStatus + '/4' + (world.congress.filibusterActive ? ' \u2014 Filibuster active' : '')],
        ['PNTH Board', 'Dirks ' + world.pnth.boardDirks + ' / Gottlieb ' + (10 - world.pnth.boardDirks)],
        ['Trade War', 'Stage ' + world.geopolitical.tradeWarStage + '/4'],
        ['Fed', (world.fed.hikeCycle ? 'Hike' : world.fed.cutCycle ? 'Cut' : 'Hold') + ', Cred ' + world.fed.credibilityScore + '/10'],
    ];
    for (const [label, value] of entries) {
        const p = document.createElement('p');
        const b = document.createElement('strong');
        b.textContent = label + ': ';
        p.appendChild(b);
        p.appendChild(document.createTextNode(value));
        container.appendChild(p);
    }
}

function _renderFactionScores(container, factions, getFactionDescriptor) {
    container.textContent = '';
    const h4 = document.createElement('h4');
    h4.textContent = 'Your Standing';
    container.appendChild(h4);
    const ids = ['firmStanding', 'regulatoryExposure', 'federalistSupport', 'farmerLaborSupport', 'mediaTrust', 'fedRelations'];
    for (const id of ids) {
        const p = document.createElement('p');
        const label = id.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        const b = document.createElement('strong');
        b.textContent = label + ': ';
        p.appendChild(b);
        p.appendChild(document.createTextNode(factions[id] + '/100 \u2014 '));
        const em = document.createElement('em');
        em.textContent = getFactionDescriptor(id);
        p.appendChild(em);
        container.appendChild(p);
    }
}
```

- [ ] **Step 3: Wire into main.js**

Cache DOM elements and call update functions:

```javascript
$.standingsWorld = document.getElementById('standings-world');
$.standingsFactions = document.getElementById('standings-factions');
```

In the UI update path (e.g., after events fire or when info tab is shown):
```javascript
if (eventEngine) {
    updateStandings($, eventEngine.world, factions, getFactionDescriptor);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui.js main.js
git commit -m "feat: add standings sub-tab to info panel"
```

---

### Task 8: Fix followup chain isolation

**Files:**
- Modify: `src/event-pool.js`
- Modify: `src/events.js`

**Bug:** Followup events (e.g., `trade_retaliation`, `bowman_denial`, `vane_nominated`) live in the main `OFFLINE_EVENTS` pool and can be drawn randomly by the Poisson process or pulse schedulers without their parent event having fired. The only protection is the `when` guard, which is inconsistent — some followups have guards that can pass independently of the parent's world-state mutations, causing out-of-sequence narrative (a Bowman denial before Tan's story, a retaliation before tariffs, etc.).

**Fix:** Add a `followupOnly: true` flag to every event that exists only as a chain followup. Filter flagged events out of all drawable pools in events.js. They remain accessible via `getEventById()` for legitimate followup resolution. Additionally, add a startup validation pass that cross-checks: every ID referenced in a `followups` array must correspond to an event with `followupOnly: true`, and vice versa.

- [ ] **Step 1: Add `followupOnly: true` to all followup events in event-pool.js**

First, build the set of all IDs referenced in any `followups` array. A quick way:

```bash
grep -oP "id:\s*'[^']+'" src/event-pool.js  # all event IDs
# cross-reference against IDs in followups arrays
```

Then add `followupOnly: true` to every event whose ID appears in a `followups` array but is NOT meant to be independently drawable. In practice this should be all of them — a followup exists to continue a narrative chain, not to fire out of context.

Example — before:
```javascript
{
    id: 'trade_retaliation',
    category: 'macro',
    likelihood: 3,
    headline: 'Serica announces retaliatory tariffs...',
    ...
},
```

After:
```javascript
{
    id: 'trade_retaliation',
    category: 'macro',
    followupOnly: true,
    likelihood: 3,
    headline: 'Serica announces retaliatory tariffs...',
    ...
},
```

- [ ] **Step 2: Add startup validation in event-pool.js**

After the `OFFLINE_EVENTS` array and `getEventById` function, add a development-time cross-check:

```javascript
// Validate followup consistency
const _referencedFollowupIds = new Set();
for (const ev of OFFLINE_EVENTS) {
    if (ev.followups) {
        for (const fu of ev.followups) _referencedFollowupIds.add(fu.id);
    }
}
for (const id of _referencedFollowupIds) {
    const ev = getEventById(id);
    if (!ev) console.warn(`[event-pool] followup references unknown event: '${id}'`);
    else if (!ev.followupOnly) console.warn(`[event-pool] followup target '${id}' missing followupOnly flag`);
}
for (const ev of OFFLINE_EVENTS) {
    if (ev.followupOnly && !_referencedFollowupIds.has(ev.id)) {
        console.warn(`[event-pool] '${ev.id}' has followupOnly but is never referenced as a followup`);
    }
}
```

This catches:
- Typos in followup `id` references (unknown event)
- Missing `followupOnly` flag on a followup target
- Orphaned `followupOnly` events nobody schedules

- [ ] **Step 3: Filter followupOnly events out of all pools in events.js**

Update pool construction in the `EventEngine` constructor to exclude flagged events:

```javascript
this._pools = {
    fed:            OFFLINE_EVENTS.filter(e => e.category === 'fed' && !e.followupOnly),
    pnth_earnings:  OFFLINE_EVENTS.filter(e => e.category === 'pnth_earnings' && !e.followupOnly),
    random:         OFFLINE_EVENTS.filter(e => !_PULSE_CATEGORIES.has(e.category) && !e.followupOnly),
    filibuster:     OFFLINE_EVENTS.filter(e => e.category === 'filibuster' && !e.followupOnly),
    media:          OFFLINE_EVENTS.filter(e => e.category === 'media' && !e.followupOnly),
};
```

This ensures followup events are never drawn by pulse schedulers, Poisson random draws, or the one-shot pre-pass. They fire only when explicitly scheduled by a parent event's `followups` array or by `scheduleFollowup()`.

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js src/events.js
git commit -m "fix: exclude followup-only events from random/pulse draws to enforce chain ordering"
```

---

### Task 9: Add firm dynamics events to event-pool (also flag as followupOnly where applicable)

**Files:**
- Modify: `src/event-pool.js`

- [ ] **Step 1: Add firm dynamics one-shot events**

Add events for firm dynamics described in Spec Section 3:

```javascript
{
    id: 'firm_congressional_subpoena',
    category: 'investigation',
    headline: 'Okafor subpoenas Meridian Capital trading records.',
    magnitude: 'major',
    oneShot: true,
    when: (sim, world, congress, ctx) =>
        ctx.factions.regulatoryExposure >= 75 && world.investigations.okaforProbeStage >= 1,
    effects: (world) => {
        // firmStanding -15 applied via shiftFaction in the effect
    },
    params: { xi: 0.01 },
},
{
    id: 'firm_crisis',
    category: 'investigation',
    headline: 'Meridian board considers shutting the derivatives desk.',
    magnitude: 'major',
    oneShot: true,
    superevent: true,
    crisisBriefing: true,
    when: (sim, world, congress, ctx) =>
        ctx.factions.firmStanding < 25 &&
        ctx.factions.regulatoryExposure > 60 &&
        (world.investigations.okaforProbeStage >= 1 || world.media.leakCount >= 2),
    effects: [],
},
```

Note: `crisisBriefing: true` is a forward-looking flag consumed by Plan 4's briefing system. Until then it's unused.

- [ ] **Step 2: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add firm dynamics one-shot events to event pool"
```

---

### Task 10: Enrich event engine player context

**Files:**
- Modify: `src/events.js`
- Modify: `main.js`

The event engine's `setPlayerContext` currently passes `playerChoices`, `factions`, and `activeRegIds`. Two critical pieces of game state are missing from event `when` guards:

1. **Trait IDs** — Task 13 adds trait-gated events that check `ctx.traitIds`, but this field doesn't exist. Currently `getActiveTraitIds()` is called inside `_weightedPick` for likelihood modifiers, but it's never exposed to `when` guards.

2. **Portfolio metrics** — Events can't trigger based on the player's P&L, drawdown, leverage, or position concentration. This blocks an entire class of portfolio-reactive events (e.g., "the market whispers about a whale" when overleveraged, competitors noticing a streak, or firm dynamics responding to actual desk performance).

- [ ] **Step 1: Add traitIds to setPlayerContext**

In events.js, update the method signature and storage:

```javascript
setPlayerContext(playerChoices, factions, activeRegIds, traitIds = [], portfolioMetrics = {}) {
    this._playerCtx = { playerChoices, factions, activeRegIds, traitIds, portfolio: portfolioMetrics };
}
```

Also update the reset default:
```javascript
this._playerCtx = { playerChoices: {}, factions: {}, activeRegIds: [], traitIds: [], portfolio: {} };
```

- [ ] **Step 2: Pass traitIds and portfolio metrics from main.js**

In `_onDayComplete`, where `setPlayerContext` is called (around line 1200), add the trait IDs and portfolio metrics:

```javascript
eventEngine.setPlayerContext(
    playerChoices,
    factions,
    getActiveRegulations().map(r => r.id),
    getActiveTraitIds(),
    {
        equity: _portfolioEquity(),
        peakEquity: portfolio.peakValue || portfolio.initialCapital,
        pnlPct: (_portfolioEquity() - portfolio.initialCapital) / portfolio.initialCapital,
        maxDrawdown: portfolio.maxDrawdown || 0,
        grossLeverage: _grossNotional() / Math.max(1, _portfolioEquity()),
        positionCount: portfolio.positions.length,
        netDelta: _computeNetDelta(),
        cash: portfolio.cash,
        strongQuarters: quarterlyReviews.filter(r => r.rating === 'strong').length,
        impactTradeCount: impactHistory.length,
    }
);
```

Read main.js to find the exact helper function names — `_portfolioEquity`, `_grossNotional`, `_computeNetDelta` may have different names. The portfolio metrics should be cheap to compute since they're already calculated elsewhere in the frame.

- [ ] **Step 3: Commit**

```bash
git add src/events.js main.js
git commit -m "feat: expose traitIds and portfolio metrics to event guards via playerCtx"
```

---

### Task 11: Add faction shifts to existing toast events

**Files:**
- Modify: `src/event-pool.js`

Currently 0 of ~420 toast events shift faction scores. Events fire headlines but the faction system is invisible to them. This task adds `shiftFaction` calls to existing event `effects` functions so that world events move the player's standing with factions.

Import `shiftFaction` from `./faction-standing.js` at the top of event-pool.js.

- [ ] **Step 1: Read all event categories and identify candidates**

Read `src/event-pool.js` thoroughly. For each category, identify events whose narrative clearly implies a faction shift. Focus on events that already have `effects` functions (easiest to augment) and high-magnitude events without effects (biggest missed opportunities).

- [ ] **Step 2: Add faction shifts to congressional/political events (~52 + ~21)**

These events move legislation and political power but never shift `federalistSupport` or `farmerLaborSupport`. Add shifts where the narrative implies the player's political relationships would be affected:

- Events advancing Federalist legislation (Big Beautiful Bill progress, tariff acts, deregulation): `shiftFaction('federalistSupport', +2..+4)` — the party remembers who was around during their wins
- Events advancing Farmer-Labor agenda (transaction tax, oversight bills, Okafor probes): `shiftFaction('farmerLaborSupport', +2..+4)`
- Bipartisan failures or shutdowns: small negative to both
- Filibuster events: `shiftFaction('farmerLaborSupport', +2)` when Whitfield blocks Federalist bills (F-L benefits from obstruction)
- Midterm results shifting power: larger shifts (±5) to the winning party's support score

The logic: political events create ambient pressure. If the Federalists are winning, the player's proximity to power shifts whether they sought it or not.

- [ ] **Step 3: Add faction shifts to media events (~12)**

Media events report stories but never shift `mediaTrust`. Add:

- Rachel Tan breaking stories (positive coverage of player's sector): `shiftFaction('mediaTrust', +2..+3)`
- Continental exposés on financial misconduct: `shiftFaction('mediaTrust', -2)` AND `shiftFaction('regulatoryExposure', +3)` — press scrutiny cuts both ways
- Press freedom erosion events: `shiftFaction('mediaTrust', -3)` — harder to build media relationships when press is under attack
- Sentinel (conservative outlet) favorable coverage: `shiftFaction('mediaTrust', +1)`, `shiftFaction('federalistSupport', +1)`

- [ ] **Step 4: Add faction shifts to Fed events (~26)**

Fed events move rates and policy but never shift `fedRelations`. Add:

- Dovish FOMC holds/cuts (player-favorable): `shiftFaction('fedRelations', +1..+2)`
- Hawkish surprises (player-hostile): `shiftFaction('fedRelations', -1...-2)`
- Hartley fired: `shiftFaction('fedRelations', -10)` — access severed
- Vane appointed: `shiftFaction('fedRelations', -5)` — new chair, no relationship yet
- Fed credibility events: `shiftFaction('fedRelations', ±2)` — institutional health affects the value of Fed access

- [ ] **Step 5: Add faction shifts to investigation events (~17)**

Investigation events advance probes but never shift `regulatoryExposure`. Add:

- Okafor probe escalation: `shiftFaction('regulatoryExposure', +5..+10)` — the probe IS exposure
- Tan-Bowman story escalation: `shiftFaction('regulatoryExposure', +3)`, `shiftFaction('mediaTrust', +2)` — press doing its job
- DOJ suit filed: `shiftFaction('regulatoryExposure', +8)`
- Whistleblower events: `shiftFaction('regulatoryExposure', +5)`, `shiftFaction('firmStanding', -5)`
- Impeachment events: `shiftFaction('regulatoryExposure', +3)` (collateral scrutiny)

- [ ] **Step 6: Add faction shifts to PNTH events (~90)**

PNTH events are the largest category but never touch factions. Add selectively — focus on events with `magnitude: 'major'` or `'moderate'`:

- Product launches (Sentinel, Aegis, Companion, Foundry): `shiftFaction('firmStanding', +2..+3)` — Meridian's PNTH thesis validated
- Product scandals (Companion privacy, Aegis controversy): `shiftFaction('firmStanding', -2)`, `shiftFaction('regulatoryExposure', +2)` — player holds the stock
- Board shakeups (Dirks vs Gottlieb): `shiftFaction('firmStanding', ±1)` depending on which faction the player's position favors
- Acquisition/antitrust events: `shiftFaction('regulatoryExposure', +3)` — M&A scrutiny spills over
- Earnings surprises: `shiftFaction('firmStanding', ±2)` — desk P&L moves with PNTH

- [ ] **Step 7: Add faction shifts to macro/geopolitical events**

Major macro events should create ambient faction pressure:

- Trade war escalation: `shiftFaction('federalistSupport', -2)` (Barron's policy hurting markets), `shiftFaction('sericaRelations'` is world state not faction — skip)
- Recession declared: `shiftFaction('firmStanding', -5)` — the whole industry contracts
- Oil crisis / Strait closure: `shiftFaction('fedRelations', -2)` — Fed under impossible pressure
- Dollar crisis: `shiftFaction('fedRelations', -5)`, `shiftFaction('firmStanding', -3)`

- [ ] **Step 8: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add faction shifts to ~80 existing toast events across all categories"
```

---

### Task 12: Add faction shifts and world-state effects to popup event choices

**Files:**
- Modify: `src/popup-events.js`

Currently 0 of 30 popup choices shift faction scores, and only 4 modify world state (all `barronApproval`). Popup decisions are the player's most direct expression of intent — they should be the primary lever for faction movement.

Import `shiftFaction` from `./faction-standing.js` at the top of popup-events.js.

- [ ] **Step 1: Read popup-events.js and catalog every choice**

Read `src/popup-events.js`. For each popup, identify which choices should shift factions and which should modify additional world state fields.

- [ ] **Step 2: Add faction shifts to compliance/scrutiny popups (8 + 4 = 12 popups)**

Compliance choices use `complianceTier` which feeds into `applyComplianceChoice()` in faction-standing.js — this already shifts `firmStanding` and `regulatoryExposure`. Verify this is working. If it is, the main gap is that *defiant* choices don't shift other factions:

- `desk_compliance_short` "Ignore the email": add `shiftFaction('firmStanding', -3)` — Webb notices
- `desk_extreme_leverage` "Push back hard": add `shiftFaction('firmStanding', -5)` — risk committee remembers
- `desk_unlimited_risk` "Push back": add `shiftFaction('firmStanding', -3)`
- `scrutiny_press_inquiry` "No comment": add `shiftFaction('mediaTrust', -5)` — Tan writes the story without you
- `scrutiny_press_inquiry` "Cooperate with review": add `shiftFaction('mediaTrust', +3)`, `shiftFaction('regulatoryExposure', -2)`
- `scrutiny_regulatory_letter` "Stonewall": add `shiftFaction('regulatoryExposure', +5)`, `shiftFaction('firmStanding', -5)`
- `scrutiny_regulatory_letter` "Full cooperation": add `shiftFaction('regulatoryExposure', -3)`, `shiftFaction('firmStanding', +3)`
- `scrutiny_subpoena` "Testify fully": add `shiftFaction('regulatoryExposure', -8)`, `shiftFaction('farmerLaborSupport', +5)` — Okafor appreciates cooperation
- `scrutiny_subpoena` "Invoke the Fifth": add `shiftFaction('regulatoryExposure', +5)`, `shiftFaction('farmerLaborSupport', -5)`
- `scrutiny_enforcement` "Settle": add `shiftFaction('regulatoryExposure', -10)`, `shiftFaction('firmStanding', -5)`
- `scrutiny_enforcement` "Fight it": add `shiftFaction('regulatoryExposure', +5)`, `shiftFaction('firmStanding', +3)` — the firm likes fighters (short-term)
- `scrutiny_enforcement` "Cooperate and inform": add `shiftFaction('regulatoryExposure', -15)`, `shiftFaction('firmStanding', -8)` — career sacrifice for legal safety

- [ ] **Step 3: Add faction shifts to political/media popups (6 popups)**

These are the most obvious gaps — political and media decisions that don't move political or media faction scores:

- `desk_campaign_donor` "Attend the fundraiser": add `shiftFaction('federalistSupport', +5)` or `shiftFaction('farmerLaborSupport', +5)` depending on which party's fundraiser (check context). Also `shiftFaction('regulatoryExposure', +2)` — political activity draws eyes
- `desk_campaign_donor` "Report to compliance": add `shiftFaction('firmStanding', +3)`, `shiftFaction('regulatoryExposure', -2)`
- `desk_ft_interview` "Do the interview": add `shiftFaction('mediaTrust', +8)` — major media exposure. Also `shiftFaction('regulatoryExposure', +3)` — visibility has a cost
- `desk_ft_interview` "Decline politely": add `shiftFaction('mediaTrust', -2)`
- `desk_media_big_win` "Accept a panel invitation": add `shiftFaction('mediaTrust', +5)`, `shiftFaction('regulatoryExposure', +2)`
- `desk_media_big_win` "Stay in the shadows": add `shiftFaction('mediaTrust', -1)` — slight media cooling
- `desk_political_donation` "Attend the dinner": add `shiftFaction('federalistSupport', +8)` or `shiftFaction('farmerLaborSupport', +8)` based on party, plus `shiftFaction('regulatoryExposure', +3)`
- `desk_political_donation` "Decline everything": add `shiftFaction('federalistSupport', -1)`, `shiftFaction('farmerLaborSupport', -1)` — slight cooling from both
- `desk_crisis_profiteer` "Hold the position": add `shiftFaction('regulatoryExposure', +3)`, `shiftFaction('mediaTrust', -2)` — profiting from crisis draws scrutiny
- `desk_profiting_from_misery` "Go on The Sentinel to defend capitalism": add `shiftFaction('mediaTrust', +3)`, `shiftFaction('federalistSupport', +3)`, `shiftFaction('farmerLaborSupport', -5)` — partisan media move
- `desk_profiting_from_misery` "Donate to charity": add `shiftFaction('mediaTrust', +2)`, `shiftFaction('farmerLaborSupport', +2)` — goodwill

- [ ] **Step 4: Add faction shifts to performance popups (8 popups)**

Performance popups affect the player-firm relationship but never shift `firmStanding` directly (they use conviction deltas instead). Add direct faction shifts for extreme choices:

- `desk_risk_committee` "Close everything": add `shiftFaction('firmStanding', +5)` — the committee wanted this
- `desk_risk_committee` "Blame the market": add `shiftFaction('firmStanding', -8)` — nobody at Meridian blames the market
- `desk_md_meeting` "Promise to flatten": add `shiftFaction('firmStanding', +3)` — Vasquez is relieved
- `desk_md_meeting` "Show conviction": add `shiftFaction('firmStanding', -2)` — risky early-career play
- `desk_headhunter` "Tell your MD": add `shiftFaction('firmStanding', +5)` — loyalty noted
- `desk_headhunter` "Take the meeting": add `shiftFaction('firmStanding', -3)` if it leaks
- `desk_comeback_kid` "Swing bigger": add `shiftFaction('firmStanding', -3)` — the desk notices
- `desk_unusual_activity` "Lawyer up": add `shiftFaction('firmStanding', -3)`, `shiftFaction('regulatoryExposure', +3)`
- `desk_unusual_activity` "Cooperate fully": add `shiftFaction('firmStanding', +2)`, `shiftFaction('regulatoryExposure', -2)`

- [ ] **Step 5: Add world-state effects beyond barronApproval**

Currently only `election.barronApproval` is modified by popup choices. Add world-state mutations where narratively justified:

- `scrutiny_press_inquiry` "No comment": add `effects: [{ path: 'media.tanCredibility', op: 'add', value: 1 }]` — Tan's story runs unchallenged
- `scrutiny_regulatory_letter` "Stonewall": add `effects: [{ path: 'investigations.okaforProbeStage', op: 'add', value: 1 }]` — stonewalling escalates the probe
- `desk_insider_tip` "Call back": add `effects: [{ path: 'media.leakCount', op: 'add', value: 1 }]` — information flows both ways
- `desk_profiting_from_misery` "Go on The Sentinel": add `effects: [{ path: 'media.sentinelRating', op: 'add', value: 1 }]` — boosting the conservative outlet

- [ ] **Step 6: Commit**

```bash
git add src/popup-events.js
git commit -m "feat: add faction shifts and world-state effects to popup event choices"
```

---

### Task 13: Add faction-gated, trait-gated, and portfolio-reactive events to event-pool

**Files:**
- Modify: `src/event-pool.js`

Currently only 1 of ~420 events checks `ctx.factions`. The faction system should create emergent narrative: high faction scores unlock exclusive events, low scores trigger consequences. Reputation tags (from Task 1) should gate events that only make sense for players with a specific public profile.

Import `hasTrait` from `./traits.js` at the top of event-pool.js (alongside `shiftFaction` from Task 11).

- [ ] **Step 1: Add high-mediaTrust gated events (3-5 events)**

When the player has built strong media relationships, the press becomes an active narrative channel:

```javascript
{
    id: 'media_tan_tip',
    category: 'media',
    likelihood: 2,
    headline: 'Rachel Tan calls with a heads-up: Okafor\'s committee is issuing subpoenas next week.',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) =>
        ctx.factions.mediaTrust >= 60 && world.investigations.okaforProbeStage >= 1,
    params: { xi: 0.005 },
    effects: (world) => { shiftFaction('regulatoryExposure', 2); },
},
{
    id: 'media_continental_profile',
    category: 'media',
    likelihood: 1,
    headline: 'The Continental runs a flattering profile: "The Quiet Strategist of Meridian Capital."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.factions.mediaTrust >= 70,
    effects: (world) => {
        shiftFaction('firmStanding', 3);
        shiftFaction('regulatoryExposure', 2);
    },
},
```

Also add events for *low* mediaTrust — hostile press:

```javascript
{
    id: 'media_hostile_profile',
    category: 'media',
    likelihood: 2,
    headline: 'The Continental publishes "Shadow Traders: Inside Meridian\'s Derivatives Machine."',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) => ctx.factions.mediaTrust <= 20 && ctx.factions.regulatoryExposure >= 40,
    params: { xi: 0.005 },
    effects: (world) => {
        shiftFaction('regulatoryExposure', 5);
        shiftFaction('firmStanding', -3);
    },
},
```

- [ ] **Step 2: Add high-fedRelations gated events (3-5 events)**

When the player has Fed access, they receive advance signals:

```javascript
{
    id: 'fed_informal_signal',
    category: 'fed',
    likelihood: 1.5,
    headline: 'Hartley\'s deputy mentions over coffee that the committee is "leaning dovish" next meeting.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.factions.fedRelations >= 65 && !world.fed.hartleyFired,
    params: { theta: -0.002 },
    effects: (world) => { shiftFaction('fedRelations', 1); },
},
{
    id: 'fed_rate_warning',
    category: 'fed',
    likelihood: 1.5,
    headline: 'A contact at the Fed warns you: "Tighten your duration exposure. Soon."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.factions.fedRelations >= 70 && world.fed.hikeCycle,
    params: {},
    effects: (world) => { shiftFaction('regulatoryExposure', 2); },
},
```

And low fedRelations — shut out:

```javascript
{
    id: 'fed_shut_out',
    category: 'fed',
    likelihood: 2,
    headline: 'Meridian\'s fixed-income desk is the last to hear about the rate decision. Again.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.factions.fedRelations <= 20,
    params: { sigmaR: 0.001 },
    effects: (world) => { shiftFaction('firmStanding', -1); },
},
```

- [ ] **Step 3: Add high-political-support gated events (3-5 events)**

High `federalistSupport` or `farmerLaborSupport` creates political entanglements:

```javascript
{
    id: 'political_lassiter_favor',
    category: 'political',
    likelihood: 1,
    headline: 'Lassiter\'s office asks you to host a quiet dinner with trade lobbyists. "Just a conversation."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.factions.federalistSupport >= 65,
    effects: (world) => {
        shiftFaction('federalistSupport', 3);
        shiftFaction('regulatoryExposure', 3);
    },
},
{
    id: 'political_okafor_olive_branch',
    category: 'political',
    likelihood: 1,
    headline: 'Okafor sends a note: she appreciates your cooperation. The committee may go easier on derivatives traders.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.factions.farmerLaborSupport >= 60 && world.investigations.okaforProbeStage >= 1,
    effects: (world) => {
        shiftFaction('regulatoryExposure', -3);
        shiftFaction('farmerLaborSupport', 2);
    },
},
```

And bipartisan power:

```javascript
{
    id: 'political_bipartisan_access',
    category: 'political',
    likelihood: 0.5,
    headline: 'Both parties want you at the table. The Big Beautiful Bill negotiations need a "market perspective."',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) =>
        ctx.factions.federalistSupport >= 50 && ctx.factions.farmerLaborSupport >= 50 &&
        world.congress.bigBillStatus >= 1 && world.congress.bigBillStatus < 4,
    effects: (world) => {
        shiftFaction('federalistSupport', 2);
        shiftFaction('farmerLaborSupport', 2);
        shiftFaction('regulatoryExposure', 4);
    },
},
```

- [ ] **Step 4: Add low-firmStanding consequence events (3-4 events)**

When the player's standing at Meridian deteriorates, the firm pushes back:

```javascript
{
    id: 'firm_capital_cut',
    category: 'neutral',
    likelihood: 3,
    headline: 'Webb cuts your risk allocation by 20%. "Until we see consistent performance."',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) => ctx.factions.firmStanding <= 30,
    params: {},
    effects: (world) => { shiftFaction('firmStanding', -2); },
    // capitalMultiplier already handles the mechanical effect
},
{
    id: 'firm_riggs_promoted',
    category: 'neutral',
    likelihood: 1,
    headline: 'Riggs gets the corner office. Vasquez says it\'s "just logistics." Nobody believes her.',
    magnitude: 'minor',
    oneShot: true,
    when: (sim, world, congress, ctx) => ctx.factions.firmStanding <= 35 && sim.day > 300,
    effects: (world) => { shiftFaction('firmStanding', -3); },
},
{
    id: 'firm_vasquez_warning',
    category: 'neutral',
    likelihood: 2,
    headline: 'Vasquez takes you aside: "I went out on a limb to bring you here. Don\'t make me regret it."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.factions.firmStanding <= 40 && ctx.factions.firmStanding > 25 && sim.day > 200,
    effects: (world) => {},
},
```

And high firmStanding rewards:

```javascript
{
    id: 'firm_capital_boost',
    category: 'neutral',
    likelihood: 2,
    headline: 'Webb increases your allocation. "You\'ve earned more rope. Don\'t hang yourself with it."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.factions.firmStanding >= 80,
    effects: (world) => { shiftFaction('firmStanding', 1); },
},
```

- [ ] **Step 5: Add trait-gated events (5-8 events)**

Events that only fire for players with specific active traits (dynamic tags). These make tags feel consequential.

**`underScrutiny` tag** — being watched changes the game:
```javascript
{
    id: 'tag_scrutiny_leak',
    category: 'investigation',
    likelihood: 2,
    headline: 'Your trading records appear in a Continental article. Someone at the SEC is talking.',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) => hasTrait('under_scrutiny') && world.media.tanCredibility >= 5,
    params: { xi: 0.005 },
    effects: (world) => {
        shiftFaction('regulatoryExposure', 5);
        shiftFaction('mediaTrust', -3);
        world.media.leakCount = Math.min(5, world.media.leakCount + 1);
    },
},
```

**`politicalPlayer` tag** — political visibility has consequences:
```javascript
{
    id: 'tag_political_target',
    category: 'political',
    likelihood: 1.5,
    headline: 'A Farmer-Labor PAC runs an ad naming "Wall Street insiders who bankroll the Barron agenda." Your name is on it.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        hasTrait('political_player') && ctx.factions.federalistSupport > ctx.factions.farmerLaborSupport,
    effects: (world) => {
        shiftFaction('farmerLaborSupport', -5);
        shiftFaction('regulatoryExposure', 3);
    },
},
```

**`mediaFigure` tag** — media attention snowballs:
```javascript
{
    id: 'tag_media_requests',
    category: 'media',
    likelihood: 2,
    headline: 'MarketWire, The Sentinel, and two podcasts want interviews this week. Compliance says pick one or none.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => hasTrait('media_figure'),
    effects: (world) => { shiftFaction('mediaTrust', 2); },
},
```

**`meridianStar` tag** — being the firm's star attracts envy and opportunity:
```javascript
{
    id: 'tag_star_poached',
    category: 'neutral',
    likelihood: 0.5,
    headline: 'A rival fund makes a serious offer. Word gets back to Webb. He pretends not to care.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => hasTrait('meridian_star') && sim.day > 400,
    effects: (world) => { shiftFaction('firmStanding', 2); },
},
```

**`quietMoney` tag** — anonymity has its own rewards:
```javascript
{
    id: 'tag_quiet_advantage',
    category: 'neutral',
    likelihood: 1,
    headline: 'While Riggs fields calls from regulators, your book runs clean. Nobody\'s watching.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        hasTrait('quiet_money') && ctx.factions.regulatoryExposure < 20,
    effects: (world) => { shiftFaction('firmStanding', 2); },
},
```

- [ ] **Step 6: Add permanent-trait-gated events (4-6 events)**

Events that reward or punish specific conviction paths. These use `ctx.traitIds` (populated by Task 10's enriched player context) to check permanent traits:

**`washington_insider` conviction** — political access creates story hooks:
```javascript
{
    id: 'conviction_insider_leak_risk',
    category: 'investigation',
    likelihood: 1,
    headline: 'A Farmer-Labor staffer tells Tan you were at the Willard Hotel the night before the tariff announcement.',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) =>
        ctx.traitIds.includes('washington_insider') &&
        world.geopolitical.tradeWarStage >= 2,
    params: { xi: 0.005 },
    effects: (world) => {
        shiftFaction('regulatoryExposure', 5);
        shiftFaction('mediaTrust', -3);
    },
},
```

**`ghost_protocol` conviction** — staying invisible pays off:
```javascript
{
    id: 'conviction_ghost_clean',
    category: 'neutral',
    likelihood: 1.5,
    headline: 'Okafor\'s committee releases a list of traders under review. Your name isn\'t on it.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.traitIds.includes('ghost_protocol') &&
        world.investigations.okaforProbeStage >= 1,
    effects: (world) => { shiftFaction('regulatoryExposure', -2); },
},
```

**`crisis_profiteer` conviction** — profiting from chaos draws attention:
```javascript
{
    id: 'conviction_profiteer_exposure',
    category: 'media',
    likelihood: 1.5,
    headline: 'MarketWire names you in "Traders Who Cleaned Up During the Crisis." Tan is asking questions.',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) =>
        ctx.traitIds.includes('crisis_profiteer') &&
        (world.geopolitical.recessionDeclared || world.geopolitical.oilCrisis),
    effects: (world) => {
        shiftFaction('regulatoryExposure', 4);
        shiftFaction('mediaTrust', -2);
        shiftFaction('firmStanding', 2);
    },
},
```

**`political_operator` conviction** — both parties come calling:
```javascript
{
    id: 'conviction_operator_bundler',
    category: 'political',
    likelihood: 1,
    headline: 'Both parties are asking you to bundle donations for the midterm cycle. Your compliance officer is not amused.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.traitIds.includes('political_operator') && sim.day > 400,
    effects: (world) => {
        shiftFaction('federalistSupport', 2);
        shiftFaction('farmerLaborSupport', 2);
        shiftFaction('regulatoryExposure', 3);
    },
},
```

**`master_of_leverage` conviction** — your size makes you a systemic risk:
```javascript
{
    id: 'conviction_leverage_contagion',
    category: 'neutral',
    likelihood: 1,
    headline: 'A mid-tier fund blows up on a similar book. Webb asks if your exposure overlaps. It does.',
    magnitude: 'moderate',
    when: (sim, world, congress, ctx) =>
        ctx.traitIds.includes('master_of_leverage') &&
        ctx.portfolio.grossLeverage > 2,
    params: { xi: 0.005 },
    effects: (world) => {
        shiftFaction('firmStanding', -3);
        shiftFaction('regulatoryExposure', 3);
    },
},
```

- [ ] **Step 7: Add portfolio-reactive events (3-5 events)**

Events that use `ctx.portfolio` (populated by Task 10) to react to the player's desk performance:

**Overleveraged whale:**
```javascript
{
    id: 'portfolio_whale_whispers',
    category: 'neutral',
    likelihood: 2,
    headline: 'Riggs leans over: "People are talking about your book. The Street knows when someone\'s swinging big."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.portfolio.grossLeverage > 3 && ctx.factions.firmStanding > 40,
    effects: (world) => {
        shiftFaction('regulatoryExposure', 2);
        shiftFaction('firmStanding', -2);
    },
},
```

**Drawdown under pressure:**
```javascript
{
    id: 'portfolio_drawdown_notice',
    category: 'neutral',
    likelihood: 2.5,
    headline: 'Webb stops by your desk. He doesn\'t say anything. He just looks at your screen and leaves.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.portfolio.pnlPct < -0.15 && ctx.factions.firmStanding < 50,
    effects: (world) => { shiftFaction('firmStanding', -3); },
},
```

**Streak recognized:**
```javascript
{
    id: 'portfolio_streak_recognized',
    category: 'neutral',
    likelihood: 1.5,
    headline: 'Vasquez mentions your name in the partners\' meeting. "Best risk-adjusted returns on the floor."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.portfolio.pnlPct > 0.3 && ctx.portfolio.grossLeverage < 2,
    effects: (world) => { shiftFaction('firmStanding', 4); },
},
```

**Empty book:**
```javascript
{
    id: 'portfolio_flat_book',
    category: 'neutral',
    likelihood: 2,
    headline: 'Webb asks why your book is empty. "We\'re not paying you to watch."',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.portfolio.positionCount === 0 && sim.day > 280,
    effects: (world) => { shiftFaction('firmStanding', -2); },
},
```

- [ ] **Step 8: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add ~30 faction/tag/conviction/portfolio-gated events"
```

---

### Task 14: Integrate dynamic traits into popup-events.js

**Files:**
- Modify: `src/popup-events.js`

Dynamic traits / reputation tags (from Task 1) should modify popup behavior — changing trigger conditions, context text, and available choices based on the player's public profile.

Import `hasTrait` from `./traits.js` at the top of popup-events.js.

- [ ] **Step 1: Add trait checks to popup triggers**

Modify existing popup `trigger` functions to incorporate dynamic traits:

- `desk_ft_interview`: Add `|| hasTrait('media_figure')` to trigger — media figures get more interview requests regardless of equity threshold
- `desk_compliance_short` / `desk_extreme_leverage`: Lower thresholds when `hasTrait('under_scrutiny')` — compliance watches scrutinized traders more closely. Multiply the threshold by 0.7 when tagged
- `desk_insider_tip` / `desk_analyst_info_edge`: Block when `hasTrait('under_scrutiny')` — sources dry up when you're under investigation
- `desk_campaign_donor` / `desk_political_donation`: Add `|| hasTrait('political_player')` — political figures get more invitations
- `desk_media_big_win`: Lower equity threshold when `hasTrait('media_figure')` — media wants you at lower thresholds
- `desk_headhunter`: Add `|| hasTrait('meridian_star')` — stars get poached earlier

- [ ] **Step 2: Add tag-aware context variants to popup context functions**

Several popups already check permanent traits (convictions) for flavor text (desk_ft_interview checks `media_darling` and `ghost_protocol`). Extend this pattern to dynamic traits:

- `desk_ft_interview`: If `hasTrait('media_figure')`, context mentions "your growing public profile"
- `desk_compliance_short`: If `hasTrait('under_scrutiny')`, Webb's tone is harsher — "Given your current visibility..."
- `desk_campaign_donor`: If `hasTrait('political_player')`, the invite is more personal — "The senator asked for you by name"
- `desk_risk_committee`: If `hasTrait('meridian_star')`, the committee is more lenient in context — "Your track record buys you time, but..."
- `desk_insider_tip`: If `hasTrait('quiet_money')`, the source is more forthcoming — anonymity makes people trust you

- [ ] **Step 3: Add tag-conditional faction shifts to choices**

Some choices should have amplified or dampened faction effects based on tags:

- Any choice that increases `regulatoryExposure`: if `hasTrait('under_scrutiny')`, double the shift — scrutiny compounds
- Any choice that increases `mediaTrust`: if `hasTrait('media_figure')`, add +2 bonus — media figures build trust faster
- `scrutiny_enforcement` choices: if `hasTrait('meridian_star')`, add `shiftFaction('firmStanding', +3)` to "Fight it" — the firm backs its star

- [ ] **Step 4: Commit**

```bash
git add src/popup-events.js
git commit -m "feat: integrate dynamic traits into popup triggers, contexts, and faction effects"
```

---

### Task 15: Migrate interjections to event pool and delete interjections.js

**Files:**
- Modify: `src/event-pool.js`
- Modify: `src/events.js`
- Modify: `main.js`
- Delete: `src/interjections.js`

Interjections are condition-gated atmospheric toasts with no mechanical effect — structurally identical to toast events with empty params. Merging them into the event pool eliminates a separate module, puts all narrative content in one place, and lets interjections benefit from the faction/trait/portfolio context already available to event guards.

- [ ] **Step 1: Add interjection events to event-pool.js**

Migrate the 10 existing interjections as events with `category: 'interjection'` and `interjection: true` flag. No `params`, no `effects`. Rewrite conditions to use the event `when` guard signature `(sim, world, congress, ctx)`:

```javascript
// Existing interjections → events
{
    id: 'ij_vol_spike',
    category: 'interjection',
    interjection: true,
    likelihood: 1,
    headline: 'Your hands remember 2008. But this isn\'t 2008 — this is whatever Barron and al-Farhan are building between them. The screens are redder than you\'ve seen in months.',
    magnitude: 'minor',
    when: (sim) => Math.sqrt(sim.v) > Math.sqrt(sim.theta) * 2.5,
    params: {},
},
{
    id: 'ij_sidelines',
    category: 'interjection',
    interjection: true,
    likelihood: 1,
    headline: 'You\'re watching from the sidelines while Malhotra talks up PNTH earnings and Lassiter passes tariffs. The Meridian Brief keeps printing. The desk keeps trading. You keep watching.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        ctx.portfolio.positionCount === 0 && sim.day > 352,
    params: {},
},
// ... (all 10 existing interjections, rewritten similarly) ...
```

All 10 existing interjections must be migrated. Key condition rewrites using Task 10's enriched `ctx.portfolio`:
- `ctx.portfolio.positions.length === 0` → `ctx.portfolio.positionCount === 0`
- `ctx.equity` → `ctx.portfolio.equity`
- `ctx.peakEquity` → `ctx.portfolio.peakEquity`
- `ctx.quarterlyReviews.filter(r => r.rating === 'strong').length >= 3` → `ctx.portfolio.strongQuarters >= 3`
- `ctx.impactHistory.length > 5` → `ctx.portfolio.impactTradeCount > 5`
- `ctx.liveDay > N` → `sim.day > N + 252` (HISTORY_CAPACITY offset)
- `ctx.portfolio.cash < 0` → `ctx.portfolio.cash < 0`
- `ctx.equity > ctx.portfolio.initialCapital * 1.3` → `ctx.portfolio.pnlPct > 0.3` (use pnlPct instead of comparing to absolute capital)

Note: the `crisis_profits` interjection compares equity to `initialCapital * 1.3`. Use `ctx.portfolio.pnlPct > 0.3` instead — avoids needing the absolute capital constant in the event guard. Similarly, `empty_desk` checks `positions.length > 10` → `ctx.portfolio.positionCount > 10`.

Then add the new faction/trait-aware interjections:

```javascript
{
    id: 'ij_political_exposure',
    category: 'interjection',
    interjection: true,
    likelihood: 1,
    headline: 'You\'re in the rolodex now. Both parties. That\'s either leverage or liability.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) =>
        (ctx.factions.federalistSupport > 60 || ctx.factions.farmerLaborSupport > 60) && sim.day > 552,
    params: {},
},
{
    id: 'ij_firm_tension',
    category: 'interjection',
    interjection: true,
    likelihood: 1,
    headline: 'Webb\'s emails are shorter. Vasquez cancelled lunch. Riggs is smiling.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.factions.firmStanding < 35 && sim.day > 452,
    params: {},
},
{
    id: 'ij_ghost_trader',
    category: 'interjection',
    interjection: true,
    likelihood: 1,
    headline: 'Nobody knows your name. That used to bother you. Now it\'s the most valuable thing you own.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.traitIds.includes('quiet_money') && sim.day > 752,
    params: {},
},
{
    id: 'ij_media_target',
    category: 'interjection',
    interjection: true,
    likelihood: 1,
    headline: 'Tan mentioned you by name in last week\'s column. Your compliance officer sent you the clip with no comment.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.factions.mediaTrust > 65 && ctx.factions.regulatoryExposure > 40,
    params: {},
},
{
    id: 'ij_fed_whisper',
    category: 'interjection',
    interjection: true,
    likelihood: 1,
    headline: 'Hartley\'s office called again. The line between advising and insider is measured in basis points.',
    magnitude: 'minor',
    when: (sim, world, congress, ctx) => ctx.factions.fedRelations > 70 && !world.fed.hartleyFired,
    params: {},
},
```

- [ ] **Step 2: Add interjection pulse to events.js**

Add `'interjection'` to `_PULSE_CATEGORIES` so interjections aren't drawn by the random Poisson process:

```javascript
const _PULSE_CATEGORIES = new Set(['fed', 'pnth_earnings', 'midterm', 'interjection']);
```

Add an interjection pool and recurring pulse in the constructor:

```javascript
this._pools.interjection = OFFLINE_EVENTS.filter(e => e.category === 'interjection' && !e.followupOnly);

// In _pulses array:
{ type: 'recurring', id: 'interjection', interval: 50, jitter: 15, nextDay: -1, poolKey: 'interjection' },
```

The interval of 50 matches the old `MIN_COOLDOWN`. Jitter of 15 adds natural variance.

- [ ] **Step 3: Apply interjection-toast CSS class in main.js**

In the event result handling (where fired toast events are processed), check for the `interjection` flag:

```javascript
if (logEntry.interjection) {
    // Interjection: show with special styling
    _showInterjection(logEntry.headline);
} else {
    showToast(logEntry.headline, ...);
}
```

The existing `_showInterjection` helper (line 1086) already calls `showToast` and adds the `interjection-toast` CSS class. Keep it; just wire it to the new flag.

Store the `interjection` flag on the log entry in `_fireEvent` — either by passing it through, or by checking `event.interjection` when processing results in main.js. The simplest approach: store it on the log entry in events.js:

```javascript
const logEntry = {
    day,
    headline: event.headline,
    magnitude: event.magnitude || 'moderate',
    params: event.params || {},
    interjection: event.interjection || false,
};
```

- [ ] **Step 4: Remove interjections.js imports and calls from main.js**

Remove:
```javascript
import { checkInterjections, resetInterjections } from './src/interjections.js';
```

Remove the `ijCtx` construction and `checkInterjections` call block (around lines 1355-1365).

Remove `resetInterjections()` from `_resetCore()`.

- [ ] **Step 5: Delete interjections.js**

```bash
git rm src/interjections.js
git add src/event-pool.js src/events.js main.js
git commit -m "refactor: migrate interjections to event pool, delete interjections.js"
```

---

### Task 16: Delete epilogue.js and final verification

**Files:**
- Delete: `src/epilogue.js`

- [ ] **Step 1: Verify all deleted module references are gone**

Search all `.js` files for:
- `epilogue.js`, `generateEpilogue`, `isEpilogueReady` → should reference `endings.js` / `generateEnding` / `checkEndings`
- `interjections.js`, `checkInterjections`, `resetInterjections` → should be gone entirely
- `convictions.js`, `getConvictionEffect`, `getConvictionIds` → should reference `traits.js` / `getTraitEffect` / `getActiveTraitIds`

- [ ] **Step 2: Delete epilogue.js**

```bash
git rm src/epilogue.js
```

- [ ] **Step 3: Full game verification**

Serve locally and verify:
- Game loads without console errors
- Dynamic mode works: events fire, toasts appear
- Interjection toasts appear with italic styling (interjection-toast class) every ~50 days
- Toast events shift faction scores (play 100+ days, check Standings tab for movement)
- Popup choices shift faction scores (trigger a compliance popup, verify shift)
- Faction-gated events fire when scores are high enough
- Dynamic traits update daily and gate events (check that political_player appears when faction > 50)
- Standings tab shows world state and faction scores with prose descriptors
- Lobby bar shows available actions (tier 1 always, tier 2/3 when scores are high)
- Game ends properly at day 1008 with 5-page epilogue
- Game-over at firmStanding=0 shows Forced Resignation ending

- [ ] **Step 4: Commit**

```bash
git add src/epilogue.js
git commit -m "refactor: delete epilogue.js, RPG core layer complete"
```
