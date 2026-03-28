# Plan 4: Briefing, Testimony & Dossiers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the quarterly briefing overlay, congressional testimony system, NPC dossiers tab, and wire crisis briefing triggers into the game loop.

**Architecture:** New modules (`briefing.js`, `briefing-pool.js`, `testimony.js`) plug into the existing event/popup infrastructure. The briefing overlay is a new full-screen UI surface triggered at quarterly boundaries and after crisis superevents. The info tab gets a new Dossiers sub-tab with NPC profiles.

**Tech Stack:** Vanilla ES6 modules, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-26-rpg-depth-design.md` — Sections 3, 6, 8

**Prerequisites:** Plans 1-3 must be complete (faction foundation, event unification, RPG core layer including reputation tags and endings).

**Security note:** All HTML rendering uses the existing project pattern for building UI. The codebase already uses innerHTML for dynamic content (event log, popups, epilogue, etc.) with internally-generated strings — no user-supplied or external input is interpolated. New code follows the same pattern. All content is generated from internal game state objects, never from user text input.

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/testimony.js` | Multi-choice testimony question chains |
| Create | `src/briefing-pool.js` | Decision card and after-hours choice pools |
| Create | `src/briefing.js` | Quarterly/crisis briefing overlay lifecycle and content generation |
| Modify | `src/event-pool.js` | Add testimony trigger one-shot event |
| Modify | `src/ui.js` | Dossiers rendering |
| Modify | `main.js` | Wire briefing/testimony/dossiers into game loop |
| Modify | `index.html` | Briefing overlay, dossiers tab, briefing CSS |

---

### Task 1: Create testimony.js

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

### Task 2: Create briefing-pool.js

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
        gate: (factions, tags) => factions.fedRelations >= 60 && !tags.includes('under_scrutiny'),
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

### Task 3: Add briefing overlay and dossiers HTML to index.html

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

- [ ] **Step 3: Add Dossiers sub-tab panel to the Info tab**

The Info tab uses the shared tab system (`shared-tabs.js`). Add a new tab button to the Info tab's tab-bar and a corresponding panel. The new tab should be a peer of the existing sub-tabs (Settings, Event Log, Standings, etc.):

```html
<button class="tab-btn" data-tab="dossiers">Dossiers</button>
```

And corresponding panel:

```html
<div class="tab-panel" data-tab="dossiers" hidden>
  <div id="dossiers-content"></div>
</div>
```

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
git commit -m "feat: add briefing overlay, dossiers tab HTML/CSS"
```

---

### Task 4: Create briefing.js

**Files:**
- Create: `src/briefing.js`

Manages the briefing overlay lifecycle: pausing the market, generating content, collecting choices, applying effects, resuming.

- [ ] **Step 1: Create the module**

This module renders briefing content into the overlay DOM elements, collects player choices across all three panels, and applies faction effects on dismiss. It uses the same DOM rendering patterns as the existing popup and epilogue systems in the codebase.

```javascript
// src/briefing.js
import { getFaction, getFactionDescriptor, shiftFaction, factions, onQuarterlyReview } from './faction-standing.js';
import { getActiveTraitIds } from './traits.js';
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
    const tags = getActiveTraitIds();
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

### Task 5: Wire briefing and testimony into main.js

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Add imports**

```javascript
import { initBriefing, showQuarterlyBriefing, showCrisisBriefing, resetBriefing } from './src/briefing.js';
import { generateTestimonyChain, applyTestimonyChoice } from './src/testimony.js';
```

- [ ] **Step 2: Initialize briefing in the init function**

First, read main.js to understand the pause/play mechanism. The game uses a `playing` variable and `updatePlayBtn($, playing)`. Add a `_wasBriefingPlaying` flag and use the existing toggle:

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

Read the existing code to find the exact variable names and play/pause pattern — `playing`, `updatePlayBtn`, etc. The flag must be set before pausing in the quarterly review trigger (Step 3).

- [ ] **Step 3: Replace quarterly review toast with briefing trigger**

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

- [ ] **Step 4: Wire crisis briefing for superevent triggers**

When a superevent fires with `crisisBriefing: true`, generate crisis briefing content. For the testimony trigger specifically, convert the testimony chain to crisis briefing decision format:

```javascript
if (crisisEvent.id === 'testimony_trigger') {
    const chain = generateTestimonyChain(eventEngine.world, playerChoices);
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

- [ ] **Step 5: Update _resetCore**

Add:
```javascript
resetBriefing();
```

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: wire briefing and testimony systems into main game loop"
```

---

### Task 6: Add testimony trigger to event-pool

**Files:**
- Modify: `src/event-pool.js`

- [ ] **Step 1: Add testimony trigger one-shot event**

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

- [ ] **Step 2: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add testimony trigger one-shot event to event pool"
```

---

### Task 7: Add dossiers UI rendering

**Files:**
- Modify: `src/ui.js`
- Modify: `main.js`

- [ ] **Step 1: Read ui.js to understand the rendering pattern**

Read `src/ui.js` to find how info tab content is rendered.

- [ ] **Step 2: Add dossiers rendering function to ui.js**

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

- [ ] **Step 3: Wire into main.js**

Cache DOM element and call update:

```javascript
$.dossiersContent = document.getElementById('dossiers-content');
```

In the UI update path (e.g., after events fire or when info tab is shown):
```javascript
if (eventEngine) {
    updateDossiers($, factions, getFactionDescriptor);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui.js main.js
git commit -m "feat: add dossiers sub-tab to info panel"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full game verification**

Serve locally and verify:
- Game loads without console errors
- Quarterly briefing overlay appears every 63 days with three panels (Wire, Desk, After Hours)
- Choices in briefing shift faction scores (check Standings tab)
- After-hours selection is single-choice (one pick only)
- Briefing dismiss resumes market playback
- Crisis briefing fires for superevent triggers with `crisisBriefing: true`
- Testimony chain renders when regulatory exposure hits threshold
- Dossiers tab shows NPC profiles with faction-derived dispositions
- All new overlays respect focus trapping and keyboard navigation

- [ ] **Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix: verification fixes for briefing/testimony/dossiers"
```
