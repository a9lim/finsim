# Plan 3: RPG Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the RPG systems on top of the faction foundation: reputation tags, quarterly briefing overlay, testimony system, expanded lobbying, overhauled endings, and info tab intelligence dashboard.

**Architecture:** New modules (`reputation.js`, `briefing.js`, `testimony.js`, `endings.js`) plug into the existing event/popup infrastructure. The briefing overlay is a new full-screen UI surface triggered at quarterly boundaries and after crisis superevents. The endings system replaces `epilogue.js` with 6 ending variants and a 5-page adaptive epilogue. The info tab gets two new sub-tabs (Standings, Dossiers).

**Tech Stack:** Vanilla ES6 modules, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-26-rpg-depth-design.md` — Sections 2-8

**Prerequisites:** Plan 1 (faction foundation) and Plan 2 (event unification) must be complete.

**Security note:** All HTML rendering uses the existing project pattern for building UI. The codebase already uses innerHTML for dynamic content (event log, popups, epilogue, etc.) with internally-generated strings — no user-supplied or external input is interpolated. New code follows the same pattern. All content is generated from internal game state objects, never from user text input.

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/reputation.js` | Public reputation tag evaluation, daily re-evaluation |
| Create | `src/briefing.js` | Quarterly/crisis briefing overlay lifecycle and content generation |
| Create | `src/briefing-pool.js` | Decision card and after-hours choice pools |
| Create | `src/testimony.js` | Multi-choice testimony question chains |
| Create | `src/endings.js` | 6 ending conditions, 5-page epilogue generation |
| Modify | `src/lobbying.js` | Expand to targeted PAC funding with 3 tiers |
| Modify | `src/interjections.js` | Add faction-aware and conviction-aware variants |
| Modify | `src/event-pool.js` | Add firm dynamics events, conviction-specific events, NPC events |
| Modify | `main.js` | Wire briefing/reputation/endings into game loop |
| Modify | `index.html` | Add briefing overlay, standings tab, dossiers tab, expanded lobby bar |
| Delete | `src/epilogue.js` | Replaced by endings.js |

---

### Task 1: Create reputation.js

**Files:**
- Create: `src/reputation.js`

Public reputation tags are derived daily from faction scores and player history. They gate narrative content.

- [ ] **Step 1: Create the module**

```javascript
// src/reputation.js
import { getFaction } from './faction-standing.js';

const TAG_DEFS = {
    marketMover:    { check: (flags) => flags.largeImpactTrades >= 3 },
    politicalPlayer:{ check: () => getFaction('federalistSupport') > 50 || getFaction('farmerLaborSupport') > 50 },
    mediaFigure:    { check: (flags) => getFaction('mediaTrust') > 60 || (flags.continentalMentions || 0) >= 2 },
    underScrutiny:  { check: () => getFaction('regulatoryExposure') > 50 },
    meridianStar:   { check: () => getFaction('firmStanding') > 80 },
    quietMoney:     { check: () =>
        getFaction('federalistSupport') < 40 &&
        getFaction('farmerLaborSupport') < 40 &&
        getFaction('mediaTrust') < 40 &&
        getFaction('regulatoryExposure') < 25
    },
};

const _activeTags = new Set();
let _quietMoneyLost = false;

/** Re-evaluate all tags from current faction scores and flags. Call once per day. */
export function evaluateTags(flags = {}) {
    for (const [tag, def] of Object.entries(TAG_DEFS)) {
        if (tag === 'quietMoney') {
            if (_quietMoneyLost) {
                _activeTags.delete(tag);
                continue;
            }
            if (def.check(flags)) {
                _activeTags.add(tag);
            } else {
                _activeTags.delete(tag);
                _quietMoneyLost = true; // permanently lost
            }
        } else {
            if (def.check(flags)) _activeTags.add(tag);
            else _activeTags.delete(tag);
        }
    }
}

/** Check if a specific tag is active. */
export function hasTag(tag) {
    return _activeTags.has(tag);
}

/** Get all active tag names. */
export function getActiveTags() {
    return [..._activeTags];
}

export function resetReputation() {
    _activeTags.clear();
    _quietMoneyLost = false;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/reputation.js
git commit -m "feat: create reputation.js with 6 public reputation tags"
```

---

### Task 2: Create testimony.js

**Files:**
- Create: `src/testimony.js`

Generates multi-choice testimony question sequences based on world state and player history.

- [ ] **Step 1: Create the module with question chain generation**

```javascript
// src/testimony.js
import { shiftFaction, factions } from './faction-standing.js';

/**
 * Generate a testimony question chain based on current state.
 * Returns an array of question objects, each with prompt text and choices.
 * Each choice has: label, desc, effects (array of {faction, delta}), and optional flags.
 */
export function generateTestimonyChain(world, playerChoices) {
    const questions = [];

    // Q1: Relationship with Bowman (if investigation involves Bowman)
    if (world.investigations.tanBowmanStory >= 1) {
        questions.push({
            prompt: 'Senator Okafor asks about your relationship with Vice President Bowman. How do you characterize it?',
            choices: [
                {
                    label: 'Professional acquaintance',
                    desc: 'Keep it formal and distant.',
                    effects: [{ faction: 'regulatoryExposure', delta: -2 }],
                },
                {
                    label: 'We\'ve met socially',
                    desc: 'Honest but non-committal.',
                    effects: [],
                },
                {
                    label: 'I decline to answer on counsel\'s advice',
                    desc: 'Invoke your rights. The committee won\'t like it.',
                    effects: [
                        { faction: 'regulatoryExposure', delta: 3 },
                        { faction: 'farmerLaborSupport', delta: -5 },
                    ],
                },
            ],
        });
    }

    // Q2: Willard Hotel dinner (if player attended political dinner)
    if (playerChoices.attended_political_dinner) {
        questions.push({
            prompt: 'She presents records of a dinner at the Willard Hotel, three days before Bowman\'s blind trust was restructured. What was discussed?',
            choices: [
                {
                    label: 'Policy in general terms',
                    desc: 'Truthful. Safe.',
                    effects: [{ faction: 'farmerLaborSupport', delta: 2 }],
                },
                {
                    label: 'I don\'t recall specifics',
                    desc: 'Evasive. Potentially perjurious.',
                    effects: [],
                    flags: { liedInTestimony: true },
                },
                {
                    label: 'Market conditions, not politics',
                    desc: 'Redirect to your professional domain.',
                    effects: [{ faction: 'firmStanding', delta: 2 }],
                },
            ],
        });
    }

    // Q3: PNTH positions and non-public information
    questions.push({
        prompt: 'She asks whether your PNTH positions were informed by non-public information about the military contract.',
        choices: [
            {
                label: 'Absolutely not \u2014 my analysis is public record',
                desc: 'Strong denial. True unless you pursued insider tips.',
                effects: [],
                flags: playerChoices.pursued_insider_tip || playerChoices.pursued_pnth_tip
                    ? { liedInTestimony: true } : {},
            },
            {
                label: 'I\'d like to consult with my attorney',
                desc: 'Stall. Raises regulatory pressure.',
                effects: [{ faction: 'regulatoryExposure', delta: 5 }],
            },
            {
                label: 'My positions reflect professional judgment',
                desc: 'Neutral, non-committal.',
                effects: [],
            },
        ],
    });

    // Q4: Cooperation
    questions.push({
        prompt: 'Final question: will you cooperate with the committee\'s ongoing investigation?',
        choices: [
            {
                label: 'Fully',
                desc: 'Opens your records. Major regulatory relief.',
                effects: [
                    { faction: 'regulatoryExposure', delta: -10 },
                    { faction: 'farmerLaborSupport', delta: 5 },
                ],
                flags: { cooperating: true },
            },
            {
                label: 'With limitations',
                desc: 'Careful middle ground.',
                effects: [],
            },
            {
                label: 'I\'ll need to review what\'s being asked with counsel',
                desc: 'Stonewall. Committee takes note.',
                effects: [{ faction: 'regulatoryExposure', delta: 3 }],
            },
        ],
    });

    return questions;
}

/**
 * Apply a testimony choice's effects to faction state.
 * Returns any flags set by the choice.
 */
export function applyTestimonyChoice(choice) {
    for (const { faction, delta } of choice.effects) {
        shiftFaction(faction, delta);
    }
    if (choice.flags) {
        if (choice.flags.liedInTestimony) factions.liedInTestimony = true;
        if (choice.flags.cooperating) factions.cooperating = true;
    }
    return choice.flags || {};
}
```

- [ ] **Step 2: Commit**

```bash
git add src/testimony.js
git commit -m "feat: create testimony.js with multi-choice question chain generation"
```

---

### Task 3: Create briefing-pool.js

**Files:**
- Create: `src/briefing-pool.js`

Pools of decision cards and after-hours choices, gated by faction scores and reputation tags.

- [ ] **Step 1: Create the module with decision and after-hours pools**

```javascript
// src/briefing-pool.js
// Decision cards for quarterly briefing center panel.
// Each has: id, title, desc, choices[], gate (faction/tag requirements).

export const DECISION_POOL = [
    {
        id: 'lassiter_lunch',
        title: "Lassiter's Chief of Staff Calls",
        desc: 'The senator wants to discuss the tariff bill over lunch.',
        gate: (factions, tags) => factions.federalistSupport >= 35,
        choices: [
            {
                label: 'Accept',
                desc: 'Build access to the Federalist inner circle.',
                effects: [
                    { faction: 'federalistSupport', delta: 5 },
                    { faction: 'regulatoryExposure', delta: 2, condition: (f) => f.regulatoryExposure > 50 },
                ],
                playerFlag: 'met_lassiter',
            },
            {
                label: 'Decline politely',
                desc: 'Safe. No political entanglement.',
                effects: [],
            },
            {
                label: 'Accept, bring compliance',
                desc: 'CYA move. Weaker relationship, no scrutiny risk.',
                effects: [
                    { faction: 'federalistSupport', delta: 2 },
                    { faction: 'firmStanding', delta: 3 },
                ],
                playerFlag: 'met_lassiter_cautious',
            },
        ],
    },
    {
        id: 'tan_interview',
        title: 'Continental Interview Request',
        desc: 'Rachel Tan wants 20 minutes on PNTH\'s military contracts.',
        gate: (factions, tags) => factions.mediaTrust >= 30,
        choices: [
            {
                label: 'Talk',
                desc: 'Media exposure. Risk of revealing too much.',
                effects: [
                    { faction: 'mediaTrust', delta: 8 },
                    { faction: 'regulatoryExposure', delta: 3 },
                ],
                playerFlag: 'gave_interview',
            },
            {
                label: 'Decline',
                desc: 'Tan writes the story without your input.',
                effects: [{ faction: 'mediaTrust', delta: -3 }],
            },
            {
                label: 'Offer background only',
                desc: 'Partial control. Builds trust carefully.',
                effects: [{ faction: 'mediaTrust', delta: 4 }],
                playerFlag: 'background_source',
            },
        ],
    },
    {
        id: 'okafor_meeting',
        title: 'Okafor Requests a Meeting',
        desc: 'The senator wants to discuss market oversight. She\'s investigating.',
        gate: (factions, tags) => factions.farmerLaborSupport >= 35 && factions.regulatoryExposure >= 25,
        choices: [
            {
                label: 'Accept',
                desc: 'Show good faith. She may go easier on you.',
                effects: [
                    { faction: 'farmerLaborSupport', delta: 5 },
                    { faction: 'regulatoryExposure', delta: -3 },
                ],
                playerFlag: 'met_okafor',
            },
            {
                label: 'Decline through counsel',
                desc: 'Protect yourself legally.',
                effects: [
                    { faction: 'farmerLaborSupport', delta: -3 },
                    { faction: 'regulatoryExposure', delta: 2 },
                ],
            },
        ],
    },
    {
        id: 'hartley_advisory',
        title: 'Fed Chair\'s Office Calls',
        desc: 'Hartley wants your read on derivatives market stress. Informal.',
        gate: (factions, tags) => factions.fedRelations >= 60 && !tags.includes('underScrutiny'),
        choices: [
            {
                label: 'Share your analysis',
                desc: 'Build Fed access. Powerful but dangerous.',
                effects: [{ faction: 'fedRelations', delta: 8 }],
                playerFlag: 'counseled_fed',
            },
            {
                label: 'Politely defer',
                desc: 'Too risky right now.',
                effects: [{ faction: 'fedRelations', delta: -2 }],
            },
        ],
    },
];

export const AFTER_HOURS_POOL = [
    {
        id: 'fed_gala',
        title: 'Fed Gala at the Willard',
        desc: 'Hartley will be there. A chance to build connections.',
        gate: (factions, tags) => factions.fedRelations >= 30,
        effects: [
            { faction: 'fedRelations', delta: 6 },
            { faction: 'regulatoryExposure', delta: 3, condition: (f) => f.regulatoryExposure > 50 },
        ],
        playerFlag: 'attended_fed_gala',
    },
    {
        id: 'quiet_quarter',
        title: 'Quiet Quarter',
        desc: 'Stay home. Decompress. Webb appreciates low drama.',
        gate: () => true,
        effects: [{ faction: 'firmStanding', delta: 3 }],
    },
    {
        id: 'driscoll_drinks',
        title: 'Drinks with Tom Driscoll',
        desc: 'The Continental\'s deputy editor is buying. He knows things.',
        gate: (factions, tags) => factions.mediaTrust >= 25,
        effects: [
            { faction: 'mediaTrust', delta: 5 },
            { faction: 'regulatoryExposure', delta: 2, condition: (f) => f.regulatoryExposure > 40 },
        ],
        playerFlag: 'drinks_with_driscoll',
    },
    {
        id: 'cro_prep',
        title: 'Prep the CRO Presentation',
        desc: 'Spend the weekend building your case for more capital.',
        gate: () => true,
        effects: [{ faction: 'firmStanding', delta: 5 }],
    },
    {
        id: 'federalist_fundraiser',
        title: 'Federalist Fundraiser',
        desc: 'Lassiter\'s PAC is hosting. Cash buys access.',
        gate: (factions, tags) => factions.federalistSupport >= 40,
        effects: [
            { faction: 'federalistSupport', delta: 8 },
            { faction: 'farmerLaborSupport', delta: -3 },
            { faction: 'regulatoryExposure', delta: 2 },
        ],
        playerFlag: 'attended_federalist_fundraiser',
    },
    {
        id: 'fl_fundraiser',
        title: 'Farmer-Labor Fundraiser',
        desc: 'Okafor\'s allies are gathering. Show you\'re not partisan.',
        gate: (factions, tags) => factions.farmerLaborSupport >= 40,
        effects: [
            { faction: 'farmerLaborSupport', delta: 8 },
            { faction: 'federalistSupport', delta: -3 },
            { faction: 'regulatoryExposure', delta: 2 },
        ],
        playerFlag: 'attended_fl_fundraiser',
    },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/briefing-pool.js
git commit -m "feat: create briefing-pool.js with decision and after-hours choice pools"
```

---

### Task 4: Add briefing overlay HTML to index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Read index.html to find the popup overlay structure**

Read `index.html` to find the existing popup overlay (likely `#popup-event-overlay` or similar) to understand the styling pattern.

- [ ] **Step 2: Add briefing overlay container**

After the existing popup overlay, add:

```html
<div id="briefing-overlay" class="sim-overlay hidden" role="dialog" aria-modal="true" aria-label="Quarterly Briefing">
  <div class="sim-overlay-panel glass">
    <div class="briefing-grid">
      <section class="briefing-panel" id="briefing-wire">
        <h3>The Wire</h3>
        <div id="briefing-wire-content"></div>
      </section>
      <section class="briefing-panel" id="briefing-desk">
        <h3>Your Desk</h3>
        <div id="briefing-desk-content"></div>
      </section>
      <section class="briefing-panel" id="briefing-afterhours">
        <h3>After Hours</h3>
        <div id="briefing-afterhours-content"></div>
      </section>
    </div>
    <button id="briefing-dismiss" class="tool-btn">Back to the Desk</button>
  </div>
</div>
```

This follows the existing overlay pattern: outer `sim-overlay hidden` for backdrop/centering, inner `sim-overlay-panel glass` for content. Visibility toggled via `hidden` class, not `style.display`.

- [ ] **Step 3: Add Standings and Dossiers sub-tab panels to the Info tab**

The Info tab uses the shared tab system (`shared-tabs.js`). Read the existing Info tab HTML to find the `tab-bar` and `tab-panel` pattern. Add two new tab buttons to the Info tab's tab-bar and corresponding panels. The exact insertion depends on the existing Info tab structure — the new tabs should be peers of the existing sub-tabs (Settings, Event Log, etc.):

```html
<button class="tab-btn" data-tab="standings">Standings</button>
<button class="tab-btn" data-tab="dossiers">Dossiers</button>
```

And corresponding panels:

```html
<div class="tab-panel" data-tab="standings" hidden>
  <div id="standings-world"></div>
  <div id="standings-factions"></div>
</div>
<div class="tab-panel" data-tab="dossiers" hidden>
  <div id="dossiers-content"></div>
</div>
```

- [ ] **Step 4: Update epilogue overlay for 5 pages**

The existing epilogue overlay (`#epilogue-overlay`) has 4 hardcoded dot spans. Add a 5th dot for the new Meridian Capital page. If dots are generated dynamically in `_showEpilogue`, no change is needed — read the HTML to determine which approach is used.

- [ ] **Step 5: Update lobby bar HTML for tiered actions**

The existing lobby bar (around line 249-253 of index.html) has two hardcoded pill buttons. Replace with a container that will be dynamically populated by the lobbying system:

```html
<div id="lobby-bar">
  <div id="lobby-actions"></div>
</div>
```

The lobby action buttons will be rendered dynamically by the lobbying module based on `getAvailableActions()`. Read the current lobby bar implementation to understand the exact current structure before modifying.

- [ ] **Step 4: Add briefing CSS**

In the project's `<style>` section, add:

```css
.briefing-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr;
  gap: var(--sp-3, 1rem);
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--sp-3, 1rem);
  max-height: 80vh;
  overflow-y: auto;
}
.briefing-panel {
  background: var(--bg-elevated, rgba(255,255,255,0.05));
  border-radius: var(--radius, 8px);
  padding: var(--sp-3, 1rem);
}
.briefing-panel h3 {
  margin: 0 0 var(--sp-2, 0.5rem);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}
@media (max-width: 900px) {
  .briefing-grid { grid-template-columns: 1fr; }
}
#briefing-dismiss {
  display: block;
  margin: var(--sp-3, 1rem) auto;
}
.briefing-choice.selected, .briefing-afterhours-btn.selected {
  outline: 2px solid var(--accent, #4fc3f7);
}
.wire-pip { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.wire-pip--positive { background: var(--pnl-up-color, #4caf50); }
.wire-pip--negative { background: var(--pnl-down-color, #ef5350); }
.wire-pip--neutral { background: var(--text, #ccc); opacity: 0.4; }
.dossier-card { padding: var(--sp-2, 0.5rem) 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.dossier-role { opacity: 0.6; font-size: 0.85em; }
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add briefing overlay, standings tab, and dossiers tab HTML/CSS"
```

---

### Task 5: Create briefing.js

**Files:**
- Create: `src/briefing.js`

Manages the briefing overlay lifecycle: pausing the market, generating content, collecting choices, applying effects, resuming.

- [ ] **Step 1: Create the module**

This module renders briefing content into the overlay DOM elements, collects player choices across all three panels, and applies faction effects on dismiss. It uses the same DOM rendering patterns as the existing popup and epilogue systems in the codebase.

```javascript
// src/briefing.js
import { getFaction, getFactionDescriptor, shiftFaction, factions, onQuarterlyReview } from './faction-standing.js';
import { getActiveTags } from './reputation.js';
import { DECISION_POOL, AFTER_HOURS_POOL } from './briefing-pool.js';
import { trapFocus } from '/shared-utils.js';

let _$ = null;
let _onDismiss = null;
let _pendingEffects = [];
let _focusTrapCleanup = null;

export function initBriefing($, onDismiss) {
    _$ = $;
    _onDismiss = onDismiss;
    $.briefingDismiss = document.getElementById('briefing-dismiss');
    $.briefingWireContent = document.getElementById('briefing-wire-content');
    $.briefingDeskContent = document.getElementById('briefing-desk-content');
    $.briefingAfterhoursContent = document.getElementById('briefing-afterhours-content');
    $.briefingOverlay = document.getElementById('briefing-overlay');
    $.briefingDismiss.addEventListener('click', _dismiss);
}

/** quarterlyReviews is passed for display context only — main.js owns the push. */
export function showQuarterlyBriefing(world, sim, portfolio, quarterlyReviews, playerChoices) {
    _pendingEffects = [];
    // Adjust firmStanding based on quarterly P&L (main.js already pushed the review record)
    const reviewDelta = onQuarterlyReview(portfolio.equity || portfolio.initialCapital, sim.day);
    _renderWire(world, sim, portfolio, reviewDelta);
    const tags = getActiveTags();
    const eligible = DECISION_POOL.filter(d => d.gate(factions, tags));
    _renderDecisions(eligible.slice(0, 3), playerChoices);
    const afterHours = AFTER_HOURS_POOL.filter(a => a.gate(factions, tags));
    _renderAfterHours(afterHours.slice(0, 3), playerChoices);
    $.briefingOverlay.classList.remove('hidden');
    _focusTrapCleanup = trapFocus($.briefingOverlay);
}

export function showCrisisBriefing(crisisEvent, world, playerChoices) {
    _pendingEffects = [];
    $.briefingWireContent.textContent = '';
    const crisisEl = document.createElement('div');
    crisisEl.className = 'briefing-crisis';
    const strong = document.createElement('strong');
    strong.textContent = crisisEvent.headline;
    crisisEl.appendChild(strong);
    $.briefingWireContent.appendChild(crisisEl);

    if (crisisEvent.crisisChoices) {
        _renderDecisions(crisisEvent.crisisChoices, playerChoices);
    } else {
        $.briefingDeskContent.textContent = 'No immediate decisions required.';
    }
    $.briefingAfterhoursContent.textContent = '';
    $.briefingOverlay.classList.remove('hidden');
    _focusTrapCleanup = trapFocus($.briefingOverlay);
}

function _renderWire(world, sim, portfolio, reviewDelta) {
    const items = _generateWireItems(world, sim, portfolio, reviewDelta);
    const frag = document.createDocumentFragment();
    for (const item of items) {
        const div = document.createElement('div');
        div.className = 'wire-item';
        const pip = document.createElement('span');
        pip.className = 'wire-pip wire-pip--' + item.sentiment;
        div.appendChild(pip);
        const b = document.createElement('strong');
        b.textContent = item.domain + ': ';
        div.appendChild(b);
        div.appendChild(document.createTextNode(item.text));
        frag.appendChild(div);
    }
    $.briefingWireContent.textContent = '';
    $.briefingWireContent.appendChild(frag);
}

function _generateWireItems(world, sim, portfolio, reviewDelta) {
    const items = [];
    items.push({
        domain: 'Capitol Hill',
        text: 'Senate ' + world.congress.senate.federalist + 'F / ' + world.congress.senate.farmerLabor + 'FL. ' +
            (world.congress.filibusterActive ? 'Filibuster active. ' : '') +
            'Big Bill stage ' + world.congress.bigBillStatus + '/4.',
        sentiment: 'neutral',
    });
    items.push({
        domain: 'PNTH',
        text: 'Board: Dirks ' + world.pnth.boardDirks + ' / Gottlieb ' + (10 - world.pnth.boardDirks) + '. ' +
            (world.pnth.militaryContractActive ? 'Aegis contract active.' : ''),
        sentiment: 'neutral',
    });
    const word = reviewDelta > 0 ? 'Strong' : reviewDelta < 0 ? 'Weak' : 'Flat';
    items.push({
        domain: 'Markets',
        text: word + ' quarter. Firm standing: ' + getFactionDescriptor('firmStanding') + '.',
        sentiment: reviewDelta > 0 ? 'positive' : reviewDelta < 0 ? 'negative' : 'neutral',
    });
    return items;
}

function _renderDecisions(decisions, playerChoices) {
    const container = $.briefingDeskContent;
    container.textContent = '';
    decisions.forEach((d, i) => {
        const card = document.createElement('div');
        card.className = 'briefing-card';
        const h4 = document.createElement('h4');
        h4.textContent = d.title;
        card.appendChild(h4);
        const p = document.createElement('p');
        p.textContent = d.desc;
        card.appendChild(p);
        const choicesDiv = document.createElement('div');
        choicesDiv.className = 'briefing-choices';
        d.choices.forEach((c, j) => {
            const btn = document.createElement('button');
            btn.className = 'tool-btn briefing-choice';
            const labelEl = document.createElement('span');
            labelEl.textContent = c.label;
            btn.appendChild(labelEl);
            btn.appendChild(document.createElement('br'));
            const small = document.createElement('small');
            small.textContent = c.desc;
            btn.appendChild(small);
            btn.addEventListener('click', () => {
                _pendingEffects.push(...(c.effects || []));
                if (c.playerFlag) playerChoices[c.playerFlag] = true;
                card.querySelectorAll('.briefing-choice').forEach(b => { b.disabled = true; });
                btn.classList.add('selected');
            });
            choicesDiv.appendChild(btn);
        });
        card.appendChild(choicesDiv);
        container.appendChild(card);
    });
}

function _renderAfterHours(options, playerChoices) {
    const container = $.briefingAfterhoursContent;
    container.textContent = '';
    let ahSelected = false;
    options.forEach((a, i) => {
        const btn = document.createElement('button');
        btn.className = 'tool-btn briefing-afterhours-btn';
        const strong = document.createElement('strong');
        strong.textContent = a.title;
        btn.appendChild(strong);
        btn.appendChild(document.createElement('br'));
        const small = document.createElement('small');
        small.textContent = a.desc;
        btn.appendChild(small);
        btn.addEventListener('click', () => {
            if (ahSelected) return;
            ahSelected = true;
            _pendingEffects.push(...(a.effects || []));
            if (a.playerFlag) playerChoices[a.playerFlag] = true;
            container.querySelectorAll('.briefing-afterhours-btn').forEach(b => { b.disabled = true; });
            btn.classList.add('selected');
        });
        container.appendChild(btn);
    });
}

function _dismiss() {
    for (const eff of _pendingEffects) {
        if (eff.condition && !eff.condition(factions)) continue;
        shiftFaction(eff.faction, eff.delta);
    }
    _pendingEffects = [];
    if (_focusTrapCleanup) { _focusTrapCleanup(); _focusTrapCleanup = null; }
    _$.briefingOverlay.classList.add('hidden');
    if (_onDismiss) _onDismiss();
}

export function resetBriefing() {
    _pendingEffects = [];
    if (_focusTrapCleanup) { _focusTrapCleanup(); _focusTrapCleanup = null; }
    if (_$ && _$.briefingOverlay) _$.briefingOverlay.classList.add('hidden');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/briefing.js
git commit -m "feat: create briefing.js with quarterly and crisis briefing overlay"
```

---

### Task 6: Expand lobbying.js

**Files:**
- Modify: `src/lobbying.js`

Expand from 2 blanket PAC actions to targeted politician funding with 3 tiers.

- [ ] **Step 1: Read current lobbying.js**

Read `src/lobbying.js` to understand the current structure.

- [ ] **Step 2: Replace LOBBY_ACTIONS with tiered system**

Import faction functions and replace the existing `LOBBY_ACTIONS`:

```javascript
import { getFaction, shiftFaction, factions } from './faction-standing.js';
import { hasTag } from './reputation.js';
import { getConvictionEffect } from './convictions.js';

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
        gate: () => hasTag('politicalPlayer') || getFaction('federalistSupport') > 50 || getFaction('farmerLaborSupport') > 50,
        execute: (world) => {
            const fedSup = getFaction('federalistSupport');
            const flSup = getFaction('farmerLaborSupport');
            if (fedSup >= flSup) shiftFaction('federalistSupport', 8);
            else shiftFaction('farmerLaborSupport', 8);
            shiftFaction('regulatoryExposure', hasTag('underScrutiny') ? 5 : 2);
        },
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
    },
];

export function getAvailableActions(day, cash) {
    const costMult = getConvictionEffect('lobbyingCostMult', 1);
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
    const costMult = getConvictionEffect('lobbyingCostMult', 1);
    const cost = Math.round(action.baseCost * costMult);
    action.execute(world);
    _lastLobbyDay = day;
    return { cost, action };
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

### Task 6b: Add missing Tier 3 lobby actions

**Files:**
- Modify: `src/lobbying.js`

The spec defines three Tier 3 actions. Task 6 only implements Broker a Deal. Add the remaining two.

- [ ] **Step 1: Add Leak to Media action**

Add to the `LOBBY_ACTIONS` array after `broker_deal`:

```javascript
    {
        id: 'leak_to_media', tier: 3,
        name: 'Leak to Media',
        desc: 'Feed information to shape the narrative. High risk if traced.',
        baseCost: 0,
        gate: () => getFaction('mediaTrust') > 70,
        execute: (world) => {
            const traced = Math.random() < 0.5; // 50% trace chance
            if (traced) {
                shiftFaction('mediaTrust', -20);
                shiftFaction('regulatoryExposure', 15);
            } else {
                shiftFaction('mediaTrust', 5);
            }
        },
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
    },
```

- [ ] **Step 2: Commit**

```bash
git add src/lobbying.js
git commit -m "feat: add Leak to Media and Counsel the Fed Tier 3 lobby actions"
```

---

### Task 6c: Add capitalMultiplier mechanic

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

### Task 7: Create endings.js

**Files:**
- Create: `src/endings.js`

Replaces `epilogue.js`. Evaluates 6 terminal conditions and generates 5-page adaptive epilogue.

- [ ] **Step 1: Create the module with ending condition evaluation and epilogue generation**

This is a large module. Create it with `checkEndings()` for terminal condition evaluation and `generateEnding()` for the 5-page epilogue. The epilogue pages build DOM fragments using `document.createElement` rather than string interpolation, following the same pattern as the briefing system.

The full implementation should cover:
- `checkEndings(sim, portfolio, world)` — returns ending ID or null, following priority order
- `generateEnding(endingId, world, sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews)` — returns array of 5 page objects `{ title, content }` where content is a DocumentFragment or HTML string
- Helper functions for each page: `_pageElection`, `_pagePNTH`, `_pageWorld`, `_pageMeridian`, `_pageLegacy`

The endings module reads `getFactionState()` and `getConvictionIds()` internally rather than receiving them as parameters.

See the spec (Section 7) for the full ending conditions and epilogue content guidelines. The implementation should follow the existing `epilogue.js` patterns for page structure and rendering, updated with the new faction-based content.

- [ ] **Step 2: Commit**

```bash
git add src/endings.js
git commit -m "feat: create endings.js with 6 endings and 5-page adaptive epilogue"
```

---

### Task 8: Wire new systems into main.js

**Files:**
- Modify: `main.js`

Connect reputation evaluation, briefing triggers, and the new endings system to the game loop.

- [ ] **Step 1: Add imports for new modules**

```javascript
import { evaluateTags, hasTag, resetReputation } from './src/reputation.js';
import { initBriefing, showQuarterlyBriefing, showCrisisBriefing, resetBriefing } from './src/briefing.js';
import { checkEndings, generateEnding } from './src/endings.js';
```

- [ ] **Step 2: Initialize briefing in the init function**

First, read main.js to understand the pause/play mechanism. The game uses a `playing` variable and `updatePlayBtn($, playing)`. There is no `_wasPlaying` or `_play()` function. Add a `_wasBriefingPlaying` flag and use the existing toggle:

```javascript
let _wasBriefingPlaying = false;

initBriefing($, () => {
    // Resume market after briefing dismissal
    if (_wasBriefingPlaying) {
        playing = true;
        updatePlayBtn($, playing);
        _wasBriefingPlaying = false;
    }
});
```

Read the existing code to find the exact variable names and play/pause pattern — `playing`, `updatePlayBtn`, etc. The flag must be set before `_pause()` in the quarterly review trigger (Task 8, Step 4).

- [ ] **Step 3: Add daily reputation evaluation to _onDayComplete**

After events have fired in `_onDayComplete()`, add:

```javascript
evaluateTags({
    largeImpactTrades: impactHistory.length,
    continentalMentions: playerChoices._continentalMentions || 0,
});
```

- [ ] **Step 4: Replace quarterly review with briefing trigger**

Replace the existing quarterly review toast section with:

```javascript
if (sim.day > HISTORY_CAPACITY && sim.day % QUARTERLY_CYCLE === 0) {
    const buyHoldPnl = (sim.S - 100) * (portfolio.initialCapital / 100);
    const actualPnl = _portfolioEquity() - portfolio.initialCapital;
    const vsBenchmark = actualPnl - buyHoldPnl;
    let rating;
    if (vsBenchmark > portfolio.initialCapital * 0.1) rating = 'strong';
    else if (vsBenchmark > 0) rating = 'solid';
    else if (vsBenchmark > -portfolio.initialCapital * 0.1) rating = 'underperform';
    else rating = 'poor';
    quarterlyReviews.push({ day: sim.day, pnl: actualPnl, vsBenchmark, rating });

    // Pause and show briefing (briefing.js calls onQuarterlyReview internally for firmStanding)
    _wasBriefingPlaying = playing;
    playing = false;
    updatePlayBtn($, playing);
    showQuarterlyBriefing(eventEngine.world, sim, portfolio, quarterlyReviews, playerChoices);
}
```

- [ ] **Step 5: Replace epilogue check with endings check**

**Important placement:** The spec requires terminal conditions be evaluated AFTER events and faction shifts have been applied for that day. Find the existing epilogue check (around line 1190) — if it's before event firing (line 1198), move the endings check to AFTER event processing. Place it after the `evaluateTags()` call added in Step 3.

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

- [ ] **Step 6: Update _showEpilogue to accept the new page format**

Remove `import { generateEpilogue } from './src/epilogue.js';`.

The existing `_showEpilogue()` function (around lines 2159-2218) handles page navigation with dots, back/next buttons, focus trapping, restart, and keep-playing. It currently receives 4 pages from `generateEpilogue()` — each page is an object with `{ title, html }`.

Update `_showEpilogue` to:
1. Accept the new 5-page `pages` array from `generateEnding()`
2. Generate dots dynamically based on `pages.length` (rather than hardcoded 4 dots)
3. Keep the existing navigation, focus trap, and restart logic

The page format from `generateEnding()` should match what `_showEpilogue` expects: `{ title, html }` where `html` is a string. If `_showEpilogue` uses a different format, adapt `generateEnding()` to match.

Read the existing `_showEpilogue` implementation to determine the exact page format and dot generation pattern before making changes.

- [ ] **Step 7: Update _resetCore**

Add:
```javascript
resetReputation();
resetBriefing();
```

- [ ] **Step 8: Commit**

```bash
git add main.js
git commit -m "feat: wire reputation, briefing, and endings into main game loop"
```

---

### Task 9: Add standings and dossiers UI rendering

**Files:**
- Modify: `src/ui.js`
- Modify: `main.js`

- [ ] **Step 1: Read ui.js to understand how info tab content is rendered**

Read `src/ui.js` to find the info tab rendering patterns.

- [ ] **Step 2: Add standings rendering function to ui.js**

Add a function that renders world state and faction scores into the standings panel using DOM methods:

```javascript
export function updateStandings($, world, factions, getFactionDescriptor) {
    // Build world state summary
    _renderWorldState($.standingsWorld, world);
    // Build faction scores
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

- [ ] **Step 3: Add dossiers rendering function to ui.js**

```javascript
const NPC_DOSSIERS = [
    { name: 'Marcus Webb', role: 'CRO, Meridian Capital', faction: 'firmStanding', desc: 'Direct oversight. Conservative, respects profitability, hates surprises.' },
    { name: 'Elena Vasquez', role: 'Managing Director, Meridian Capital', faction: 'firmStanding', desc: 'Runs the derivatives desk. She poached you. Your internal champion.' },
    { name: 'Carter Riggs', role: 'Senior PM, Meridian Capital', faction: 'firmStanding', desc: 'Peer and quiet rival. Decade at Meridian. Competes for allocation.' },
    { name: 'Sen. Roy Lassiter (F, SC)', role: 'Trade hawk, Tariff Act author', faction: 'federalistSupport', desc: 'The Federalist agenda\'s most vocal enforcer.' },
    { name: 'Sen. Patricia Okafor (F-L, IL)', role: 'Investigations chair', faction: 'farmerLaborSupport', desc: 'She\'s watching. She\'s always watching.' },
    { name: 'Rachel Tan', role: 'The Continental', faction: 'mediaTrust', desc: 'Investigative journalist. Persistent. Well-sourced.' },
    { name: 'Hayden Hartley', role: 'Fed Chair', faction: 'fedRelations', desc: 'Independent \u2014 or trying to be, under Barron\'s pressure.' },
];

export function updateDossiers($, factions, getFactionDescriptor) {
    const container = $.dossiersContent;
    container.textContent = '';
    for (const npc of NPC_DOSSIERS) {
        const card = document.createElement('div');
        card.className = 'dossier-card';
        const h4 = document.createElement('h4');
        h4.textContent = npc.name;
        card.appendChild(h4);
        const role = document.createElement('p');
        role.className = 'dossier-role';
        role.textContent = npc.role;
        card.appendChild(role);
        const desc = document.createElement('p');
        desc.textContent = npc.desc;
        card.appendChild(desc);
        const disp = document.createElement('p');
        const dispB = document.createElement('strong');
        dispB.textContent = 'Disposition: ';
        disp.appendChild(dispB);
        const dispEm = document.createElement('em');
        dispEm.textContent = getFactionDescriptor(npc.faction);
        disp.appendChild(dispEm);
        card.appendChild(disp);
        container.appendChild(card);
    }
}
```

- [ ] **Step 4: Wire into main.js**

Cache DOM elements and call update functions:

```javascript
$.standingsWorld = document.getElementById('standings-world');
$.standingsFactions = document.getElementById('standings-factions');
$.dossiersContent = document.getElementById('dossiers-content');
```

In the UI update path (e.g., after events fire or when info tab is shown):
```javascript
if (eventEngine) {
    updateStandings($, eventEngine.world, factions, getFactionDescriptor);
    updateDossiers($, factions, getFactionDescriptor);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/ui.js main.js
git commit -m "feat: add standings and dossiers sub-tabs to info panel"
```

---

### Task 10: Add testimony trigger and event-pool expansion

**Files:**
- Modify: `src/event-pool.js`
- Modify: `main.js`

The testimony system (Task 2) creates the question chain generator, but nothing in the game loop triggers it.

- [ ] **Step 1: Add testimony trigger one-shot event to event-pool.js**

Add a `oneShot: true` event that triggers the testimony sequence:

```javascript
{
    id: 'testimony_trigger',
    category: 'investigation',
    headline: 'Congressional Subpoena: You are called to testify.',
    magnitude: 'major',
    oneShot: true,
    superevent: true,
    crisisBriefing: true,
    when: (sim, world, congress, ctx) =>
        ctx.factions.regulatoryExposure >= 75 &&
        (world.investigations.okaforProbeStage >= 2 || world.investigations.tanBowmanStory >= 2),
    effects: [],
    // The actual testimony is handled via the crisis briefing triggered by crisisBriefing: true
},
```

- [ ] **Step 2: Add firm dynamics one-shot events to event-pool.js**

Add events for the firm dynamics described in Spec Section 3:

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

- [ ] **Step 3: Wire testimony rendering into crisis briefing**

In `main.js`, when a crisis briefing fires for the testimony trigger event, generate the testimony chain and render it as the crisis briefing's decision cards. Import the testimony functions:

```javascript
import { generateTestimonyChain, applyTestimonyChoice } from './src/testimony.js';
```

In the crisis briefing handler (where `crisisBriefing: true` events are processed after superevent popups), check if the event is the testimony trigger and generate appropriate choices:

```javascript
if (crisisEvent.id === 'testimony_trigger') {
    const chain = generateTestimonyChain(eventEngine.world, playerChoices);
    // Convert testimony chain to crisis briefing decision format
    crisisEvent.crisisChoices = chain.map(q => ({
        title: 'Testimony',
        desc: q.prompt,
        choices: q.choices.map(c => ({
            label: c.label,
            desc: c.desc,
            effects: c.effects,
            playerFlag: c.flags ? Object.keys(c.flags)[0] : undefined,
        })),
    }));
}
showCrisisBriefing(crisisEvent, eventEngine.world, playerChoices);
```

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js main.js
git commit -m "feat: add testimony trigger, firm dynamics events, and testimony rendering"
```

---

### Task 11: Expand interjections.js

**Files:**
- Modify: `src/interjections.js`

Add faction-aware and conviction-aware interjection variants.

- [ ] **Step 1: Read current interjections.js**

Read `src/interjections.js` to understand the existing interjection structure (10 situational toasts with trigger conditions and cooldowns).

- [ ] **Step 2: Add faction-aware interjections**

Add new interjections that reference faction state. Import `getFaction` from `faction-standing.js` and `hasTag` from `reputation.js`. Examples:

- **Political Exposure**: When `federalistSupport > 60 || farmerLaborSupport > 60` and day > 300: "You're in the rolodex now. Both parties. That's either leverage or liability."
- **Firm Tension**: When `firmStanding < 35` and day > 200: "Webb's emails are shorter. Vasquez cancelled lunch. Riggs is smiling."
- **Ghost Trader**: When `hasTag('quietMoney')` and day > 500: "Nobody knows your name. That used to bother you. Now it's the most valuable thing you own."
- **Media Target**: When `mediaTrust > 65` and `regulatoryExposure > 40`: "Tan mentioned you by name in last week's column. Your compliance officer sent you the clip with no comment."
- **Fed Whisper**: When `fedRelations > 70`: "Hartley's office called again. The line between advising and insider is measured in basis points."

Follow the existing interjection pattern for cooldowns and structure.

- [ ] **Step 3: Commit**

```bash
git add src/interjections.js
git commit -m "feat: add faction-aware and conviction-aware interjections"
```

---

### Task 12: Delete epilogue.js and final verification

**Files:**
- Delete: `src/epilogue.js`

- [ ] **Step 1: Verify all epilogue references are replaced**

Search all `.js` files for `epilogue.js`, `generateEpilogue`, and `isEpilogueReady`. All should now reference `endings.js` / `generateEnding` / `checkEndings`.

- [ ] **Step 2: Delete epilogue.js**

```bash
git rm src/epilogue.js
```

- [ ] **Step 3: Full game verification**

Serve locally and verify:
- Game loads without console errors
- Dynamic mode works: events fire, toasts appear
- Quarterly briefing overlay appears every 63 days with three panels
- Choices in briefing shift faction scores (check Standings tab)
- Standings tab shows world state and faction scores with prose descriptors
- Dossiers tab shows NPC profiles with faction-derived dispositions
- Lobby bar shows available actions (tier 1 always, tier 2/3 when scores are high)
- Game ends properly at day 1008 with 5-page epilogue
- Game-over at firmStanding=0 shows Forced Resignation ending
- Reputation tags update daily (check that Political Player appears when faction > 50)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete epilogue.js, RPG layer complete"
```
