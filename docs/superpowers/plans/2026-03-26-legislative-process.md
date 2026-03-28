# Legislative Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace silent condition-based regulation activation with event-driven legislative chains so Congress feels like a living entity.

**Architecture:** `regulations.js` becomes a pipeline state machine (introduced → committee → floor → active/failed) with explicit activate/deactivate API. Events in `event-pool.js` drive all state transitions. Legislative regulations are permanent; executive/Fed regulations auto-expire via daily tick.

**Tech Stack:** Vanilla ES6 modules, no dependencies. Leaf module pattern (no DOM access in regulations.js).

---

### Task 1: Rewrite `regulations.js` — Data Model and Pipeline API

**Files:**
- Modify: `src/regulations.js` (full rewrite)

This task replaces the condition-based system with an event-driven pipeline. The module remains a leaf module with no DOM access.

- [ ] **Step 1: Rewrite the REGULATIONS array**

Remove all `condition` fields. Add `type` and `duration` fields. Replace the entire file:

```js
/* ===================================================
   regulations.js -- Event-driven regulatory system.
   Regulations are activated/deactivated exclusively by
   narrative events. Legislative bills move through a
   pipeline; executive orders auto-expire.

   Leaf module. No DOM access.
   =================================================== */

const _active = new Map(); // id -> regulation object (status === 'active' only)

// Pipeline: tracks both pending bills and active regulations
// id -> { status: 'introduced'|'committee'|'floor'|'active'|'failed'|'expired'|'repealed', remainingDays: number|null }
const _pipeline = new Map();

const REGULATIONS = [
    {
        id: 'transaction_tax',
        name: 'Okafor-Whitfield Revenue Package',
        description: 'The Okafor-Whitfield revenue package imposes a 0.1% levy on all securities transactions — spreads widen across the board.',
        color: 'var(--ext-rose)',
        type: 'legislative',
        effects: { spreadMult: 1.5 },
    },
    {
        id: 'deregulation_act',
        name: 'Financial Freedom Act',
        description: 'Lassiter and Tao ram banking deregulation through Congress — margin requirements loosened, risk limits relaxed.',
        color: 'var(--ext-orange)',
        type: 'legislative',
        effects: { marginMult: 0.8, rogueThresholdMult: 0.85 },
    },
    {
        id: 'short_sale_ban',
        name: 'Emergency Short-Sale Ban',
        description: 'The SEC invokes emergency powers as recession grips Columbia — short stock positions temporarily prohibited.',
        color: 'var(--ext-red)',
        type: 'executive',
        duration: 90,
        effects: { shortStockDisabled: true },
    },
    {
        id: 'rate_ceiling',
        name: 'White House Rate Guidance',
        description: 'With Hartley gone and Vane not yet confirmed, the Barron administration issues "informal guidance" capping the federal funds rate at 6%.',
        color: 'var(--ext-blue)',
        type: 'executive',
        duration: 120,
        effects: { rateCeiling: 0.06 },
    },
    {
        id: 'qe_floor',
        name: 'Quantitative Easing Floor',
        description: 'The Fed\'s asset purchase program pins short-term rates near zero — Priya Sharma calls it "the floor that won\'t break."',
        color: 'var(--ext-blue)',
        type: 'executive',
        duration: 180,
        effects: { rateFloor: 0.001 },
    },
    {
        id: 'sanctions_compliance',
        name: 'Serican Sanctions Compliance',
        description: 'Lassiter\'s sanctions regime requires full counterparty screening on every trade — compliance overhead increases borrowing costs.',
        color: 'var(--ext-indigo)',
        type: 'executive',
        duration: 120,
        effects: { borrowSpreadAdd: 0.3 },
    },
    {
        id: 'antitrust_scrutiny',
        name: 'Digital Markets Accountability Act',
        description: 'The DOJ suit and Okafor\'s Senate probe create a cloud of regulatory uncertainty around Palanthropic — spreads widen on every headline.',
        color: 'var(--ext-purple)',
        type: 'legislative',
        effects: { spreadMult: 1.2 },
    },
    {
        id: 'oil_emergency',
        name: 'Strait of Farsis Emergency Margins',
        description: 'As Emir al-Farhan tightens the oil chokepoint, clearinghouses raise margin requirements across energy-linked instruments.',
        color: 'var(--ext-brown)',
        type: 'executive',
        duration: 60,
        effects: { marginMult: 1.3 },
    },
    {
        id: 'trade_war_tariffs',
        name: 'Serican Reciprocal Tariff Act',
        description: 'Lassiter\'s Serican Reciprocal Tariff Act is in effect — import costs rise, supply chains reroute, spreads and borrowing costs climb.',
        color: 'var(--ext-yellow)',
        type: 'legislative',
        effects: { spreadMult: 1.15, borrowSpreadAdd: 0.15 },
    },
    {
        id: 'campaign_finance',
        name: 'Campaign Finance Reform Act',
        description: 'Primary season brings FEC scrutiny to every political donation. Okafor\'s committee signals it\'s watching "Wall Street money in politics."',
        color: 'var(--ext-magenta)',
        type: 'legislative',
        effects: {},
    },
    {
        id: 'filibuster_uncertainty',
        name: 'Senate Filibuster Uncertainty',
        description: 'Whitfield holds the Senate floor. Markets hate uncertainty — spreads widen and vol ticks up while the filibuster continues.',
        color: 'var(--ext-indigo)',
        type: 'executive',
        duration: null, // special: no auto-expiry, controlled by filibuster chain
        effects: { spreadMult: 1.25 },
    },
];

// -- Lookup helper --------------------------------------------------------

const _regById = new Map(REGULATIONS.map(r => [r.id, r]));

/**
 * Advance a bill through the legislative pipeline.
 * Called by event effects to move bills between stages.
 */
export function advanceBill(id, status) {
    const reg = _regById.get(id);
    if (!reg) return;

    if (status === 'failed' || status === 'repealed') {
        _pipeline.delete(id);
        _active.delete(id);
        return;
    }

    const entry = _pipeline.get(id) || { status: null, remainingDays: null };
    entry.status = status;

    if (status === 'active') {
        if (reg.type === 'executive' && reg.duration != null) {
            entry.remainingDays = reg.duration;
        } else {
            entry.remainingDays = null;
        }
        _active.set(id, reg);
    }

    _pipeline.set(id, entry);
}

/**
 * Activate a regulation directly (shorthand for executive/Fed actions).
 * For executive type, uses customDuration or falls back to default.
 */
export function activateRegulation(id, customDuration) {
    const reg = _regById.get(id);
    if (!reg) return;

    const remainingDays = (reg.type === 'executive' && (reg.duration != null || customDuration != null))
        ? (customDuration ?? reg.duration)
        : null;

    _pipeline.set(id, { status: 'active', remainingDays });
    _active.set(id, reg);
}

/**
 * Deactivate a regulation directly.
 */
export function deactivateRegulation(id) {
    _pipeline.delete(id);
    _active.delete(id);
}

/**
 * Tick down executive regulation timers. Called once per day.
 * @returns {{ expired: string[] }}
 */
export function tickRegulations() {
    const expired = [];
    for (const [id, entry] of _pipeline) {
        if (entry.status !== 'active' || entry.remainingDays == null) continue;
        entry.remainingDays--;
        if (entry.remainingDays <= 0) {
            entry.status = 'expired';
            _active.delete(id);
            expired.push(id);
        }
    }
    // Clean up expired entries from pipeline
    for (const id of expired) _pipeline.delete(id);
    return { expired };
}

/**
 * Get pipeline entries for UI display.
 * Returns both pending bills and active regulations.
 */
export function getRegulationPipeline() {
    const result = [];
    for (const [id, entry] of _pipeline) {
        const reg = _regById.get(id);
        if (!reg) continue;
        result.push({
            id,
            name: reg.name,
            color: reg.color,
            type: reg.type,
            status: entry.status,
            remainingDays: entry.remainingDays,
        });
    }
    // Sort: active first, then by pipeline progression
    const ORDER = { active: 0, floor: 1, committee: 2, introduced: 3 };
    result.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
    return result;
}

/**
 * Get current pipeline status for a regulation (used by event guards).
 */
export function getPipelineStatus(id) {
    const entry = _pipeline.get(id);
    return entry ? entry.status : null;
}

/** Get all currently active regulation objects. */
export function getActiveRegulations() {
    return [..._active.values()];
}

/**
 * Read a specific effect value across all active regulations.
 * Boolean: true if ANY active. Mult: product. Add: sum. Ceiling: min. Floor: max.
 */
export function getRegulationEffect(effectKey, defaultVal) {
    let result = defaultVal;
    let found = false;

    for (const [, reg] of _active) {
        const val = reg.effects[effectKey];
        if (val === undefined) continue;

        if (typeof val === 'boolean') {
            if (val) return true;
        } else if (typeof val === 'number') {
            if (effectKey.endsWith('Mult')) {
                result = found ? result * val : val;
            } else if (effectKey.endsWith('Add')) {
                result = found ? result + val : val;
            } else if (effectKey === 'rateCeiling') {
                result = found ? Math.min(result, val) : val;
            } else if (effectKey === 'rateFloor') {
                result = found ? Math.max(result, val) : val;
            } else {
                result = val;
            }
            found = true;
        }
    }
    return found ? result : defaultVal;
}

export function getRegulation(id) {
    return _regById.get(id) || null;
}

export function resetRegulations() {
    _active.clear();
    _pipeline.clear();
}

export { REGULATIONS };
```

- [ ] **Step 2: Verify the module parses**

Run: Open browser dev console (or `python -m http.server` + load page), confirm no import errors from `regulations.js`. The sim won't activate any regulations yet (no events wired) — that's expected.

- [ ] **Step 3: Commit**

```bash
git add src/regulations.js
git commit -m "refactor: rewrite regulations.js with event-driven pipeline API

Remove condition-based evaluation. Add advanceBill, activateRegulation,
deactivateRegulation, tickRegulations, getRegulationPipeline, getPipelineStatus.
Legislative regulations are permanent; executive auto-expire via tick."
```

---

### Task 2: Update `main.js` — Replace `evaluateRegulations` with `tickRegulations`

**Files:**
- Modify: `main.js:66-68` (imports)
- Modify: `main.js:1095-1116` (`_updateRegulationDisplay`)
- Modify: `main.js:1309-1319` (`_onDayComplete` regulation block)

- [ ] **Step 1: Update the import statement**

In `main.js`, change the regulations import (line 66-69):

Old:
```js
import {
    evaluateRegulations, getActiveRegulations, getRegulation,
    getRegulationEffect, resetRegulations,
} from './src/regulations.js';
```

New:
```js
import {
    tickRegulations, getActiveRegulations, getRegulation,
    getRegulationEffect, resetRegulations, getRegulationPipeline,
} from './src/regulations.js';
```

- [ ] **Step 2: Replace the `evaluateRegulations` call in `_onDayComplete`**

In `main.js`, replace the regulation evaluation block (lines 1309-1319):

Old:
```js
    if (eventEngine) {
        const regChanges = evaluateRegulations(eventEngine.world);
        for (const id of regChanges.activated) {
            const reg = getRegulation(id);
            if (reg) showToast('Regulation enacted: ' + reg.name, 4000);
        }
        for (const id of regChanges.deactivated) {
            const reg = getRegulation(id);
            if (reg) showToast('Regulation repealed: ' + reg.name, 3000);
        }
    }
```

New:
```js
    if (eventEngine) {
        const { expired } = tickRegulations();
        for (const id of expired) {
            const reg = getRegulation(id);
            if (reg) showToast('Regulation expired: ' + reg.name, 3000);
        }
    }
```

- [ ] **Step 3: Rewrite `_updateRegulationDisplay` to use pipeline**

Replace `_updateRegulationDisplay` (lines 1095-1116):

Old:
```js
function _updateRegulationDisplay() {
    const list = $.regulationsList;
    if (!list) return;
    const regs = getActiveRegulations();
    list.textContent = '';
    if (regs.length === 0) {
        const span = document.createElement('span');
        span.className = 'text-muted';
        span.style.fontSize = '0.78rem';
        span.textContent = 'None';
        list.appendChild(span);
        return;
    }
    for (const r of regs) {
        const badge = document.createElement('div');
        badge.className = 'regulation-badge';
        badge.dataset.tooltip = r.description;
        badge.textContent = r.name;
        if (r.color) badge.style.color = r.color;
        list.appendChild(badge);
    }
}
```

New:
```js
function _updateRegulationDisplay() {
    const list = $.regulationsList;
    if (!list) return;
    const pipeline = getRegulationPipeline();
    list.textContent = '';
    if (pipeline.length === 0) {
        const span = document.createElement('span');
        span.className = 'text-muted';
        span.style.fontSize = '0.78rem';
        span.textContent = 'None';
        list.appendChild(span);
        return;
    }
    for (const entry of pipeline) {
        const badge = document.createElement('div');
        badge.className = 'regulation-badge';
        const reg = getRegulation(entry.id);
        badge.dataset.tooltip = reg ? reg.description : '';
        badge.textContent = entry.name + ' — ' + _regStatusLabel(entry);
        if (entry.color) badge.style.color = entry.color;
        list.appendChild(badge);
    }
}

function _regStatusLabel(entry) {
    if (entry.status === 'active' && entry.remainingDays != null) {
        const months = entry.remainingDays / 21;
        if (months < 1) return '<1mo';
        return Math.round(months) + 'mo';
    }
    const labels = { introduced: 'Introduced', committee: 'Committee', floor: 'Floor', active: 'Active' };
    return labels[entry.status] || entry.status;
}
```

- [ ] **Step 4: Verify no remaining references to `evaluateRegulations`**

Search for `evaluateRegulations` in `main.js` — should find zero hits. The only import of it was the one we changed.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "refactor: wire main.js to event-driven regulation pipeline

Replace evaluateRegulations with tickRegulations for auto-expiry.
Update regulation display to show pipeline status and duration."
```

---

### Task 3: Wire Executive/Fed Events to `activateRegulation`

**Files:**
- Modify: `src/event-pool.js:1-8` (add import)
- Modify: `src/event-pool.js` (6 existing events get `activateRegulation` calls added to their effects)

Executive regulations are activated by events that already exist in the event pool. We add `activateRegulation()` calls to those existing events' `effects` functions.

- [ ] **Step 1: Add import to event-pool.js**

At the top of `src/event-pool.js`, add the import after the existing imports (after line 7):

Old:
```js
import { shiftFaction } from './faction-standing.js';
import { hasTrait } from './traits.js';
```

New:
```js
import { shiftFaction } from './faction-standing.js';
import { hasTrait } from './traits.js';
import { activateRegulation, deactivateRegulation, advanceBill, getPipelineStatus } from './regulations.js';
```

- [ ] **Step 2: Wire `qe_floor` activation to the QE announcement event**

Find the event at line ~149 (the `fed.qeActive = true` event). Its current effects function:
```js
effects: (world) => { world.fed.qeActive = true; shiftFaction('fedRelations', 2); },
```

Change to:
```js
effects: (world) => { world.fed.qeActive = true; shiftFaction('fedRelations', 2); activateRegulation('qe_floor'); },
```

- [ ] **Step 3: Wire `rate_ceiling` activation to the Hartley fired event**

Find the event at line ~221 (the `hartleyFired = true` event). Its current effects function:
```js
effects: (world) => { world.fed.hartleyFired = true; world.fed.credibilityScore = 0; world.election.barronApproval = Math.max(0, world.election.barronApproval - 10); shiftFaction('fedRelations', -10); },
```

Change to:
```js
effects: (world) => { world.fed.hartleyFired = true; world.fed.credibilityScore = 0; world.election.barronApproval = Math.max(0, world.election.barronApproval - 10); shiftFaction('fedRelations', -10); activateRegulation('rate_ceiling'); },
```

- [ ] **Step 4: Wire `rate_ceiling` deactivation to the Vane appointed event**

Find the event at line ~263 (the `vaneAppointed = true` event). Its current effects function:
```js
effects: (world) => {
    world.fed.vaneAppointed = true;
    world.fed.cutCycle = true;
    world.fed.hikeCycle = false;
```

Add `deactivateRegulation('rate_ceiling');` at the end of this effects function body, before the closing `}`.

- [ ] **Step 5: Wire `sanctions_compliance` activation to the sanctions event**

Find the event at line ~651 (the `sanctionsActive = true` event). Its current effects function:
```js
effects: (world) => {
    world.geopolitical.sanctionsActive = true;
    shiftFaction('federalistSupport', 2);
},
```

Change to:
```js
effects: (world) => {
    world.geopolitical.sanctionsActive = true;
    shiftFaction('federalistSupport', 2);
    activateRegulation('sanctions_compliance');
},
```

- [ ] **Step 6: Wire `oil_emergency` activation to the oil crisis events**

There are two events that set `oilCrisis = true`. The OPEC cut event at line ~645:
```js
effects: (world) => { world.geopolitical.oilCrisis = true; shiftFaction('fedRelations', -2); },
```

Change to:
```js
effects: (world) => { world.geopolitical.oilCrisis = true; shiftFaction('fedRelations', -2); activateRegulation('oil_emergency'); },
```

The Strait of Farsis event at line ~868:
```js
effects: (world) => {
    world.geopolitical.farsistanEscalation = 3;
    world.geopolitical.straitClosed = true;
    world.geopolitical.oilCrisis = true;
    shiftFaction('fedRelations', -3);
},
```

Change to:
```js
effects: (world) => {
    world.geopolitical.farsistanEscalation = 3;
    world.geopolitical.straitClosed = true;
    world.geopolitical.oilCrisis = true;
    shiftFaction('fedRelations', -3);
    activateRegulation('oil_emergency');
},
```

- [ ] **Step 7: Wire `short_sale_ban` activation to the recession event**

Find the event at line ~704 (the `recessionDeclared = true` event). Its current effects function:
```js
effects: (world) => { world.geopolitical.recessionDeclared = true; world.election.barronApproval = Math.max(0, world.election.barronApproval - 8); shiftFaction('firmStanding', -5); },
```

Change to:
```js
effects: (world) => { world.geopolitical.recessionDeclared = true; world.election.barronApproval = Math.max(0, world.election.barronApproval - 8); shiftFaction('firmStanding', -5); activateRegulation('short_sale_ban'); },
```

- [ ] **Step 8: Wire `filibuster_uncertainty` to the existing filibuster chain**

The `big_bill_senate_debate` event at line ~3120 sets `filibusterActive = true`. Add activation:
```js
effects: (world) => {
    world.congress.bigBillStatus = 2;
    world.congress.filibusterActive = true;
    activateRegulation('filibuster_uncertainty');
},
```

The `filibuster_ends_bill_passes` event at line ~3190. Add deactivation:
```js
effects: (world) => {
    world.congress.filibusterActive = false;
    world.congress.bigBillStatus = 3;
    shiftFaction('federalistSupport', 4);
    deactivateRegulation('filibuster_uncertainty');
},
```

The `filibuster_ends_bill_dies` event at line ~3204. Add deactivation:
```js
effects: (world) => {
    world.congress.filibusterActive = false;
    world.congress.bigBillStatus = 4;
    world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
    shiftFaction('farmerLaborSupport', 3);
    deactivateRegulation('filibuster_uncertainty');
},
```

- [ ] **Step 9: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: wire executive/Fed regulations to existing events

activateRegulation calls added to QE, Hartley firing, sanctions, oil
crisis, recession, and filibuster events. deactivateRegulation for
Vane appointment and filibuster resolution."
```

---

### Task 4: Add Financial Freedom Act Legislative Chain

**Files:**
- Modify: `src/event-pool.js` (convert existing FFA events into a legislative chain)

The FFA has two existing events: `barron_tax_cut_proposal` (introduction/announcement) and `corporate_tax_reform_passes` (passage). We convert these into a proper chain and add committee + color events.

- [ ] **Step 1: Convert `barron_tax_cut_proposal` to the introduction event**

Find `barron_tax_cut_proposal` at line ~2272. Replace its effects to advance the bill pipeline:

Old:
```js
    {
        id: 'barron_tax_cut_proposal',
        category: 'political',
        likelihood: 0.6,
        headline: 'Barron unveils the Financial Freedom Act: corporate tax cut from 21% to 15%. Haines flags a $400B revenue shortfall. Lassiter on The Sentinel: "Growth pays for itself." Reyes: "Math doesn\'t lie"',
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.trifecta,
        params: { mu: 0.025, theta: -0.003, b: 0.005, q: 0.002 },
        effects: (world) => { world.election.barronApproval = Math.min(100, world.election.barronApproval + 2); shiftFaction('federalistSupport', 3); },
    },
```

New:
```js
    {
        id: 'barron_tax_cut_proposal',
        category: 'congressional',
        likelihood: 0.6,
        headline: 'Barron unveils the Financial Freedom Act: corporate tax cut from 21% to 15%. Haines flags a $400B revenue shortfall. Lassiter on The Sentinel: "Growth pays for itself." Reyes: "Math doesn\'t lie"',
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.trifecta && getPipelineStatus('deregulation_act') === null,
        params: { mu: 0.025, theta: -0.003, b: 0.005, q: 0.002 },
        effects: (world) => { world.election.barronApproval = Math.min(100, world.election.barronApproval + 2); shiftFaction('federalistSupport', 3); advanceBill('deregulation_act', 'introduced'); },
        followups: [{ id: 'ffa_committee_markup', mtth: 25, weight: 1 }],
    },
```

- [ ] **Step 2: Add FFA committee and color events**

Add these new events to the CONGRESSIONAL_EVENTS array (after `barron_tax_cut_proposal`):

```js
    {
        id: 'ffa_committee_markup',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Banking Committee begins markup of the Financial Freedom Act. Lassiter chairs a 14-hour session. Haines proposes an amendment capping the repatriation holiday at 3 years. Lassiter kills it in committee.',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'introduced',
        params: { mu: 0.01, theta: -0.002 },
        effects: () => { advanceBill('deregulation_act', 'committee'); },
        followups: [
            { id: 'ffa_floor_passes', mtth: 30, weight: 0.6 },
            { id: 'ffa_floor_fails', mtth: 30, weight: 0.4 },
            { id: 'ffa_haines_opposition', mtth: 12, weight: 0.5 },
            { id: 'ffa_reyes_floor_speech', mtth: 15, weight: 0.4 },
        ],
    },
    {
        id: 'ffa_haines_opposition',
        category: 'congressional',
        likelihood: 2,
        headline: 'Haines breaks with party leadership on the Financial Freedom Act, citing deficit projections. "I will not vote for a bill that adds $400B to the debt without offsets." Barron: "Peggy is confused again."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: { theta: 0.003 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 1); },
    },
    {
        id: 'ffa_reyes_floor_speech',
        category: 'congressional',
        likelihood: 2,
        headline: 'Reyes delivers a blistering 40-minute floor speech against the Financial Freedom Act. "This bill is a permission slip for Wall Street to gamble with the economy." The Sentinel\'s Cole calls it "theatrics."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: {},
        effects: (world) => { shiftFaction('farmerLaborSupport', 1); },
    },
```

- [ ] **Step 3: Convert `corporate_tax_reform_passes` into the vote pass branch**

Find `corporate_tax_reform_passes` at line ~3087. Replace it:

Old:
```js
    {
        id: 'corporate_tax_reform_passes',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'The Financial Freedom Act passes both chambers: corporate rate cut to 15%, repatriation holiday. Tao celebrates on the House floor. Reyes walks out. MarketWire: "Shareholder returns about to explode"',
        magnitude: 'major',
        when: (sim, world, congress) => congress.trifecta,
        params: { mu: 0.03, theta: -0.005, b: 0.002, q: 0.004 },
        effects: (world) => { world.election.barronApproval = Math.min(100, world.election.barronApproval + 3); shiftFaction('federalistSupport', 4); shiftFaction('firmStanding', 2); },
    },
```

New:
```js
    {
        id: 'ffa_floor_passes',
        category: 'congressional',
        headline: 'The Financial Freedom Act passes both chambers: corporate rate cut to 15%, repatriation holiday. Tao celebrates on the House floor. Reyes walks out. MarketWire: "Shareholder returns about to explode"',
        likelihood: (sim, world, congress) => {
            let w = congress.trifecta ? 3 : 0.3;
            w *= (1 + (world.election.lobbyMomentum || 0) * 0.15);
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: { mu: 0.03, theta: -0.005, b: 0.002, q: 0.004 },
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
            shiftFaction('federalistSupport', 4);
            shiftFaction('firmStanding', 2);
            advanceBill('deregulation_act', 'active');
        },
    },
```

- [ ] **Step 4: Add the vote fail branch**

Add immediately after `ffa_floor_passes`:

```js
    {
        id: 'ffa_floor_fails',
        category: 'congressional',
        headline: 'The Financial Freedom Act fails 48-52 as Haines and two other Federalist moderates defect. Lassiter storms out of the chamber. Barron: "We will primary every one of them." Tao vows to bring it back.',
        likelihood: (sim, world, congress) => {
            let w = congress.trifecta ? 0.5 : 3;
            w *= (1 - (world.election.lobbyMomentum || 0) * 0.15);
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: { mu: -0.02, theta: 0.008 },
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            shiftFaction('farmerLaborSupport', 3);
            advanceBill('deregulation_act', 'failed');
        },
    },
```

- [ ] **Step 5: Update the `compound_deregulation_rush` one-shot event**

Find `compound_deregulation_rush` at line ~4110. Add a pipeline guard and activate the regulation:

Old:
```js
    {
        id: 'compound_deregulation_rush',
        category: 'political',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.fed.hartleyFired && congress.trifecta,
        headline: 'The Financial Freedom Act meets a Federalist trifecta — Lassiter and Tao gut banking oversight in a 48-hour legislative blitz. MarketWire calls it "the most consequential deregulation since 1999."',
        magnitude: 'major',
        params: { theta: -0.02, lambda: 0.5 },
        effects: (world) => { world.election.barronApproval += 3; shiftFaction('federalistSupport', 4); shiftFaction('regulatoryExposure', -3); },
    },
```

New:
```js
    {
        id: 'compound_deregulation_rush',
        category: 'political',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.fed.hartleyFired && congress.trifecta && getPipelineStatus('deregulation_act') === null,
        headline: 'The Financial Freedom Act meets a Federalist trifecta — Lassiter and Tao gut banking oversight in a 48-hour legislative blitz. MarketWire calls it "the most consequential deregulation since 1999."',
        magnitude: 'major',
        params: { theta: -0.02, lambda: 0.5 },
        effects: (world) => { world.election.barronApproval += 3; shiftFaction('federalistSupport', 4); shiftFaction('regulatoryExposure', -3); activateRegulation('deregulation_act'); },
    },
```

- [ ] **Step 6: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add Financial Freedom Act legislative chain

Convert barron_tax_cut_proposal to introduction event with pipeline
advancement. Add committee markup, Haines opposition, Reyes speech,
pass/fail vote branches with political weighting. Wire compound
deregulation rush to activateRegulation."
```

---

### Task 5: Add Serican Reciprocal Tariff Act Legislative Chain

**Files:**
- Modify: `src/event-pool.js` (add new events, modify existing tariff events)

The tariff chain is unique: it's driven by geopolitical escalation (`tradeWarStage`) rather than pure congressional politics. The bill gets introduced as tensions rise and passed when the trade war intensifies.

- [ ] **Step 1: Add the tariff bill introduction event**

Add to the CONGRESSIONAL_EVENTS array (near the other congressional events around line ~3087):

```js
    {
        id: 'tariff_act_introduced',
        category: 'congressional',
        likelihood: 2,
        headline: 'Lassiter introduces the Serican Reciprocal Tariff Act in the Senate. "If Serica taxes our goods, we tax theirs — dollar for dollar." Bipartisan support from both hawks. Reyes abstains. MarketWire: "This one has legs."',
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 1 && getPipelineStatus('trade_war_tariffs') === null,
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('trade_war_tariffs', 'introduced'); },
        followups: [
            { id: 'tariff_act_committee', mtth: 20, weight: 1 },
            { id: 'tariff_act_lassiter_pushes', mtth: 10, weight: 0.5 },
        ],
    },
    {
        id: 'tariff_act_lassiter_pushes',
        category: 'congressional',
        likelihood: 2,
        headline: 'Lassiter brings Serican factory workers to testify before the Foreign Relations Committee. "These are the jobs we lost." The footage dominates The Sentinel for three days. Cole: "His best performance yet."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'introduced',
        params: {},
        effects: (world) => { shiftFaction('federalistSupport', 1); },
    },
    {
        id: 'tariff_act_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Foreign Relations Committee advances the Serican Reciprocal Tariff Act 14-8 with bipartisan support. Haines votes yes. "This isn\'t about politics — it\'s about leverage," she tells MarketWire.',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'introduced',
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('trade_war_tariffs', 'committee'); },
        followups: [
            { id: 'tariff_act_passes', mtth: 25, weight: 0.7 },
            { id: 'tariff_act_fails', mtth: 25, weight: 0.3 },
        ],
    },
```

- [ ] **Step 2: Add tariff vote pass/fail branches**

```js
    {
        id: 'tariff_act_passes',
        category: 'congressional',
        headline: 'The Serican Reciprocal Tariff Act passes 68-32 with bipartisan support. Lassiter and Whitfield both vote yes. Barron signs it in the Rose Garden. Liang Wei recalls Columbia\'s ambassador within the hour.',
        likelihood: (sim, world) => {
            let w = world.geopolitical.tradeWarStage >= 2 ? 3 : 1;
            w *= (1 + (world.election.lobbyMomentum || 0) * 0.1);
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'committee',
        params: { mu: -0.02, theta: 0.01, lambda: 0.5 },
        effects: (world) => {
            shiftFaction('federalistSupport', 3);
            world.geopolitical.sericaRelations = Math.max(-3, world.geopolitical.sericaRelations - 1);
            advanceBill('trade_war_tariffs', 'active');
        },
    },
    {
        id: 'tariff_act_fails',
        category: 'congressional',
        headline: 'The Serican Reciprocal Tariff Act fails 45-55 as business-wing Federalists break ranks. Lassiter: "Corporate cowards." Barron threatens executive tariffs instead. Markets rally on the news.',
        likelihood: (sim, world) => {
            let w = world.geopolitical.tradeWarStage >= 2 ? 0.3 : 2;
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'committee',
        params: { mu: 0.02, theta: -0.005 },
        effects: (world) => {
            shiftFaction('farmerLaborSupport', 2);
            advanceBill('trade_war_tariffs', 'failed');
        },
    },
```

- [ ] **Step 3: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add Serican Reciprocal Tariff Act legislative chain

Introduction gated on tradeWarStage >= 1, bipartisan committee vote,
Lassiter color event, pass/fail branches with geopolitical weighting."
```

---

### Task 6: Add Okafor-Whitfield Revenue Package (Transaction Tax) Legislative Chain

**Files:**
- Modify: `src/event-pool.js`

This is a Farmer-Labor initiative — only viable when they control at least one chamber.

- [ ] **Step 1: Add the transaction tax bill chain**

Add to the CONGRESSIONAL_EVENTS array:

```js
    {
        id: 'transaction_tax_introduced',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Okafor and Whitfield introduce the Revenue Stabilization Act: a 0.1% tax on all securities transactions. "Wall Street should pay its fair share," Okafor says. Lassiter calls it "a declaration of war on capital markets."',
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta && getPipelineStatus('transaction_tax') === null,
        params: { mu: -0.015, theta: 0.005 },
        effects: () => { advanceBill('transaction_tax', 'introduced'); shiftFaction('farmerLaborSupport', 2); },
        followups: [
            { id: 'transaction_tax_committee', mtth: 25, weight: 1 },
            { id: 'transaction_tax_lobbying', mtth: 10, weight: 0.5 },
        ],
    },
    {
        id: 'transaction_tax_lobbying',
        category: 'congressional',
        likelihood: 2,
        headline: 'Wall Street lobbying blitz against the transaction tax: $40M in two weeks. Meridian Capital\'s government affairs team is working overtime. The Meridian Brief: "If this passes, every desk in the building feels it."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'introduced',
        params: {},
    },
    {
        id: 'transaction_tax_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Finance Committee advances the transaction tax 12-10 on a party-line vote. Lassiter vows to filibuster. Whitfield: "Let him. We have the patience." MarketWire: "Markets pricing in a wider spread regime."',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'introduced',
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('transaction_tax', 'committee'); },
        followups: [
            { id: 'transaction_tax_passes', mtth: 30, weight: 0.5 },
            { id: 'transaction_tax_fails', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'transaction_tax_passes',
        category: 'congressional',
        headline: 'The Okafor-Whitfield Revenue Package passes 52-48. Every Farmer-Labor senator votes yes. Lassiter\'s filibuster attempt collapses after six hours. Barron vetoes — but Okafor has the override votes. Spreads widen immediately.',
        likelihood: (sim, world, congress) => {
            let w = !congress.fedControlsSenate ? 3 : 0.3;
            w *= (1 - (world.election.lobbyMomentum || 0) * 0.15);
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'committee',
        params: { mu: -0.02, theta: 0.01 },
        effects: (world) => {
            shiftFaction('farmerLaborSupport', 4);
            shiftFaction('firmStanding', -3);
            advanceBill('transaction_tax', 'active');
        },
    },
    {
        id: 'transaction_tax_fails',
        category: 'congressional',
        headline: 'The transaction tax fails 47-53 as three moderate Farmer-Labor senators defect, citing impact on pension funds. Okafor: "We will be back." Lassiter pops champagne on the Senate steps — The Continental photographs it.',
        likelihood: (sim, world, congress) => {
            let w = congress.fedControlsSenate ? 3 : 0.8;
            w *= (1 + (world.election.lobbyMomentum || 0) * 0.15);
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'committee',
        params: { mu: 0.015, theta: -0.003 },
        effects: (world) => {
            shiftFaction('firmStanding', 2);
            advanceBill('transaction_tax', 'failed');
        },
    },
```

- [ ] **Step 2: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add Okafor-Whitfield transaction tax legislative chain

Introduction gated on non-trifecta, party-line committee vote,
lobbying color event, pass/fail with congressional control weighting."
```

---

### Task 7: Add Digital Markets Accountability Act Legislative Chain

**Files:**
- Modify: `src/event-pool.js`

Gated on PNTH controversies — the political will for tech regulation comes from scandals.

- [ ] **Step 1: Add the antitrust bill chain**

Add to the CONGRESSIONAL_EVENTS array:

```js
    {
        id: 'digital_markets_introduced',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Reyes introduces the Digital Markets Accountability Act targeting AI monopolies. "Palanthropic controls the government\'s eyes, ears, and now its weapons." Whittaker co-sponsors after extracting a small-business exemption.',
        magnitude: 'moderate',
        when: (sim, world) => (world.pnth.companionScandal >= 1 || world.pnth.aegisControversy >= 1 || world.pnth.dojSuitFiled) && getPipelineStatus('antitrust_scrutiny') === null,
        params: { mu: -0.015, theta: 0.008 },
        effects: () => { advanceBill('antitrust_scrutiny', 'introduced'); shiftFaction('regulatoryExposure', 3); },
        followups: [
            { id: 'digital_markets_committee', mtth: 25, weight: 1 },
            { id: 'digital_markets_tech_lobby', mtth: 12, weight: 0.5 },
        ],
    },
    {
        id: 'digital_markets_tech_lobby',
        category: 'congressional',
        likelihood: 2,
        headline: 'Malhotra flies to Washington for closed-door meetings with the Commerce Committee. "Atlas Sentinel protects 200 million Columbians. Regulate us out of existence and see what happens." Three senators privately back off.',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'introduced',
        params: { mu: 0.005 },
    },
    {
        id: 'digital_markets_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Commerce Committee advances the Digital Markets Accountability Act 13-9. Whittaker\'s small-business exemption survives. Reyes: "Now let\'s see if the full Senate has the guts."',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'introduced',
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('antitrust_scrutiny', 'committee'); },
        followups: [
            { id: 'digital_markets_passes', mtth: 30, weight: 0.5 },
            { id: 'digital_markets_fails', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'digital_markets_passes',
        category: 'congressional',
        headline: 'The Digital Markets Accountability Act passes 54-46 with five Federalist defections. AI companies face mandatory safety audits and licensing. Malhotra: "Compliance costs will be material." Gottlieb calls it "long overdue."',
        likelihood: (sim, world) => {
            let w = world.pnth.dojSuitFiled ? 2.5 : 1;
            if (world.pnth.senateProbeLaunched) w *= 1.5;
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'committee',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        effects: (world) => {
            shiftFaction('regulatoryExposure', 5);
            shiftFaction('farmerLaborSupport', 3);
            advanceBill('antitrust_scrutiny', 'active');
        },
    },
    {
        id: 'digital_markets_fails',
        category: 'congressional',
        headline: 'The Digital Markets Accountability Act fails 44-56 as the tech lobby holds the line. Reyes: "Money won today." Whittaker votes no after Tao applies pressure. The Meridian Brief: "PNTH exhales."',
        likelihood: (sim, world, congress) => {
            let w = congress.trifecta ? 2.5 : 1;
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'committee',
        params: { mu: 0.015, theta: -0.005 },
        effects: (world) => {
            shiftFaction('regulatoryExposure', -2);
            advanceBill('antitrust_scrutiny', 'failed');
        },
    },
```

- [ ] **Step 2: Update the existing `ai_regulation_bill` event**

Find the existing event at line ~1897 (`ai_regulation_bill`). This event currently fires independently as a random event. Gate it on the Digital Markets Act having passed, so it becomes a narrative consequence:

Find its `when` guard and add a pipeline check. The existing event should now only fire if the bill has been enacted:

Add `getPipelineStatus('antitrust_scrutiny') === 'active'` to its `when` guard. If it doesn't have a `when`, add one.

- [ ] **Step 3: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add Digital Markets Accountability Act legislative chain

Introduction gated on PNTH controversies, tech lobby color event,
committee vote, pass/fail with scandal-weighted likelihood."
```

---

### Task 8: Add Campaign Finance Reform Act Legislative Chain

**Files:**
- Modify: `src/event-pool.js`

Lighter chain — tied to election cycle. Effects are narrative-only (empty effects object).

- [ ] **Step 1: Add campaign finance bill chain**

Add to the CONGRESSIONAL_EVENTS array:

```js
    {
        id: 'campaign_finance_introduced',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Okafor introduces the Campaign Finance Reform Act as primary season opens. "If you want to buy a senator, you should at least have to put your name on the receipt." Lassiter calls it "a naked power grab disguised as reform."',
        magnitude: 'moderate',
        when: (sim, world) => world.election.primarySeason && getPipelineStatus('campaign_finance') === null,
        params: { theta: 0.003 },
        effects: () => { advanceBill('campaign_finance', 'introduced'); shiftFaction('farmerLaborSupport', 2); },
        followups: [
            { id: 'campaign_finance_committee', mtth: 20, weight: 1 },
        ],
    },
    {
        id: 'campaign_finance_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Rules Committee advances the Campaign Finance Reform Act along party lines. Lassiter: "They want to muzzle the people who actually create jobs." Okafor: "We want to unmask them."',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('campaign_finance') === 'introduced',
        params: {},
        effects: () => { advanceBill('campaign_finance', 'committee'); },
        followups: [
            { id: 'campaign_finance_passes', mtth: 25, weight: 0.4 },
            { id: 'campaign_finance_fails', mtth: 25, weight: 0.6 },
        ],
    },
    {
        id: 'campaign_finance_passes',
        category: 'congressional',
        headline: 'The Campaign Finance Reform Act squeaks through 51-49. Haines is the deciding vote. PAC disclosure requirements take effect immediately. Okafor\'s committee signals it\'s watching "Wall Street money in politics."',
        likelihood: (sim, world, congress) => !congress.fedControlsSenate ? 2.5 : 0.5,
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('campaign_finance') === 'committee',
        params: { theta: 0.005 },
        effects: (world) => {
            shiftFaction('farmerLaborSupport', 3);
            shiftFaction('regulatoryExposure', 3);
            advanceBill('campaign_finance', 'active');
        },
    },
    {
        id: 'campaign_finance_fails',
        category: 'congressional',
        headline: 'The Campaign Finance Reform Act dies 46-54. Lassiter whips every Federalist into line. Okafor: "Dark money wins again." The Meridian Brief: "Business as usual — literally."',
        likelihood: (sim, world, congress) => congress.fedControlsSenate ? 2.5 : 0.5,
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('campaign_finance') === 'committee',
        params: {},
        effects: () => { advanceBill('campaign_finance', 'failed'); },
    },
```

- [ ] **Step 2: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add Campaign Finance Reform Act legislative chain

Introduction gated on primarySeason, party-line committee vote,
pass/fail with senate control weighting. Narrative-only effects."
```

---

### Task 9: Clean Up Stale References and Verify

**Files:**
- Modify: `src/event-pool.js` (remove stale event if needed)
- Modify: `main.js` (verify no stale references)

- [ ] **Step 1: Remove the `congressHelpers` import dependency from `regulations.js`**

Verify that `regulations.js` no longer imports `congressHelpers` from `world-state.js`. The rewrite in Task 1 removed it. If somehow it's still there, remove it — the module no longer checks congressional conditions.

- [ ] **Step 2: Check for events that reference regulation names without pipeline awareness**

Search for events that mention regulations in their headlines but don't interact with the pipeline. Key events to check:

- `special_dividend_announcements` (line ~2052): mentions "Financial Freedom Act" in headline but is a flavor event about dividends. No change needed — it's narrative color.
- `barron_approval_recovery_high` (line ~2193): mentions FFA. No change needed — flavor.
- The existing `filibuster_nuclear_option` (line ~3019): eliminates legislative filibuster. This doesn't interact with the regulation pipeline directly — it's about the filibuster procedural rule, not a regulation. No change needed.

- [ ] **Step 3: Verify the `activeRegIds` player context still works**

In `main.js` at line ~1238, `getActiveRegulations().map(r => r.id)` is passed to the event engine's player context. This still works because `getActiveRegulations()` is unchanged — it returns active regulation objects from `_active`.

- [ ] **Step 4: Verify `portfolio.js` import is unchanged**

`portfolio.js` imports `getRegulationEffect` from `regulations.js`. This function is unchanged. No modifications needed.

- [ ] **Step 5: Verify `_resetCore` calls `resetRegulations`**

In `main.js` at line ~1692, `resetRegulations()` is called. The updated function now also clears `_pipeline`. No changes needed.

- [ ] **Step 6: Commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore: clean up stale regulation references after migration"
```

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (project-level)

- [ ] **Step 1: Update the Architecture section**

In `CLAUDE.md`, find the `regulations.js` description and update it:

Old text (approximate):
```
regulations.js (11 dynamic trading rules including filibuster uncertainty)
```

New text:
```
regulations.js (event-driven regulatory pipeline — legislative bills move through introduced→committee→floor→active/failed, executive orders auto-expire via daily tick; no condition-based activation)
```

- [ ] **Step 2: Update the "Do NOT Re-add" section**

Add to the "Do NOT Re-add" list:

```
- `evaluateRegulations` / condition-based regulation activation — regulations are now exclusively activated by events via `activateRegulation()` / `advanceBill()`, not by polling world state
```

- [ ] **Step 3: Update the Semantic Traps section**

Add:
```
- `advanceBill(id, 'failed')` and `advanceBill(id, 'repealed')` both remove from pipeline AND _active — they are terminal states, not display states
- `getPipelineStatus(id)` returns null if the regulation was never introduced or was removed — event guards must check for null, not 'inactive'
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for event-driven regulation system"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-03-26-legislative-process.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
