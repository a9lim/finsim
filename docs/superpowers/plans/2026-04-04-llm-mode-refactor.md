# LLM Dynamic Mode Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the LLM dynamic mode to full parity with the offline dynamic mode — updated lore, complete world state serialization, popup/choice generation, faction shifts, and full tool schema.

**Architecture:** All changes are data/serialization — no new modules or architectural shifts. The system prompt and tool schema in `llm.js` get rewritten. Context serialization in `generateBatch()` is expanded. `events.js` wires player context into `_fetchBatch`. Two small exports are added to `lobbying.js` and `regulations.js` (one already exists). `main.js` passes lobby state into `setPlayerContext`.

**Tech Stack:** Vanilla ES6 modules, Anthropic Messages API with tool use

**Spec:** `docs/superpowers/specs/2026-04-04-llm-mode-refactor-design.md`

---

### Task 1: Add `getLastLobbyDay` export to lobbying.js

**Files:**
- Modify: `src/lobbying.js:140-142`

- [ ] **Step 1: Add the getter**

After the existing `resetLobbying` function (line 140), add:

```js
export function getLastLobbyDay() { return _lastLobbyDay; }
```

- [ ] **Step 2: Verify no import errors**

Run: `python -m http.server` from repo root, load the page, check console for import errors.

- [ ] **Step 3: Commit**

```bash
git add src/lobbying.js
git commit -m "feat(lobbying): export getLastLobbyDay getter"
```

---

### Task 2: Wire lobby state through setPlayerContext and _fetchBatch

**Files:**
- Modify: `src/events.js:266-267` (setPlayerContext)
- Modify: `src/events.js:517-533` (_fetchBatch)
- Modify: `main.js:1296-1313` (setPlayerContext call)
- Modify: `main.js:72` (imports)

- [ ] **Step 1: Import getRegulationPipeline in events.js**

At `src/events.js:21`, add import:

```js
import { getRegulationPipeline } from './regulations.js';
```

- [ ] **Step 2: Expand setPlayerContext signature in events.js**

Replace line 266-267:

```js
setPlayerContext(playerChoices, factions, activeRegIds, traitIds = [], portfolioMetrics = {}) {
    this._playerCtx = { playerChoices, factions, activeRegIds, traitIds, portfolio: portfolioMetrics };
}
```

With:

```js
setPlayerContext(playerChoices, factions, activeRegIds, traitIds = [], portfolioMetrics = {}, lobbyCount = 0, lastLobbyDay = 0) {
    this._playerCtx = { playerChoices, factions, activeRegIds, traitIds, portfolio: portfolioMetrics, lobbyCount, lastLobbyDay };
}
```

- [ ] **Step 3: Pass extras in _fetchBatch**

Replace `_fetchBatch` (lines 517-534):

```js
async _fetchBatch(sim) {
    if (!this._llm || this._prefetching) return;
    this._prefetching = true;
    try {
        const events = await this._llm.generateBatch(
            sim, this.eventLog, this._pendingFollowups, this.world,
            {
                factions: this._playerCtx.factions,
                traitIds: this._playerCtx.traitIds,
                regulations: getRegulationPipeline(),
                playerChoices: this._playerCtx.playerChoices,
                lobbyCount: this._playerCtx.lobbyCount || 0,
                lastLobbyDay: this._playerCtx.lastLobbyDay || 0,
            }
        );
        if (Array.isArray(events)) {
            for (const ev of events) {
                if (ev && ev.headline && ev.params) this._queue.push(ev);
            }
        }
    } catch (e) {
        if (typeof showToast !== 'undefined')
            showToast('LLM event generation failed; using offline events.');
    }
    this._prefetching = false;
}
```

- [ ] **Step 4: Import getLastLobbyDay in main.js**

At `main.js:72`, change:

```js
import { getAvailableActions, executeLobbyAction, resetLobbying } from './src/lobbying.js';
```

To:

```js
import { getAvailableActions, executeLobbyAction, resetLobbying, getLastLobbyDay } from './src/lobbying.js';
```

- [ ] **Step 5: Pass lobby state in main.js setPlayerContext call**

Replace lines 1296-1313:

```js
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
                grossLeverage: computeGrossNotional() / Math.max(1, _portfolioEquity()),
                positionCount: portfolio.positions.length,
                netDelta: computeNetDelta(),
                cash: portfolio.cash,
                strongQuarters: quarterlyReviews.filter(r => r.rating === 'strong').length,
                impactTradeCount: impactHistory.length,
            }
        );
```

With:

```js
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
                grossLeverage: computeGrossNotional() / Math.max(1, _portfolioEquity()),
                positionCount: portfolio.positions.length,
                netDelta: computeNetDelta(),
                cash: portfolio.cash,
                strongQuarters: quarterlyReviews.filter(r => r.rating === 'strong').length,
                impactTradeCount: impactHistory.length,
            },
            _lobbyCount,
            getLastLobbyDay()
        );
```

- [ ] **Step 6: Verify no errors**

Reload the page on Dynamic (Offline) preset, play a few days, check console for errors.

- [ ] **Step 7: Commit**

```bash
git add src/events.js main.js
git commit -m "feat: wire lobby/regulation state through setPlayerContext to _fetchBatch"
```

---

### Task 3: Rewrite LLM tool schema

**Files:**
- Modify: `src/llm.js:23-95` (TOOL_DEF)

- [ ] **Step 1: Replace TOOL_DEF**

Replace lines 23-95 with the expanded schema:

```js
const TOOL_DEF = {
    name: 'emit_events',
    description: 'Emit 3-5 narrative market events. Each event shifts simulation parameters and optionally mutates world state. About 1 in 4 events should be popup events with player choices.',
    input_schema: {
        type: 'object',
        properties: {
            events: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Short snake_case identifier. Required for events that have followups referencing them.',
                        },
                        category: {
                            type: 'string',
                            enum: ['pnth', 'macro', 'sector', 'neutral', 'political', 'investigation', 'congressional', 'filibuster', 'media', 'desk', 'compound'],
                            description: 'Event category. Do NOT use fed, pnth_earnings, midterm, or interjection — those are pulse-scheduled.',
                        },
                        headline: {
                            type: 'string',
                            description: '1-2 sentence news headline. Reference named characters and publications.',
                        },
                        params: {
                            type: 'object',
                            description: 'Parameter name to additive delta. Minor: 1-2 params, small deltas. Major: 3-5 params, large deltas.',
                            properties: PARAM_PROPERTIES,
                            additionalProperties: false,
                        },
                        magnitude: {
                            type: 'string',
                            enum: ['minor', 'moderate', 'major'],
                        },
                        popup: {
                            type: 'boolean',
                            description: 'True for interactive decision events. Requires choices array. About 1 in 4 events.',
                        },
                        superevent: {
                            type: 'boolean',
                            description: 'True for dramatic full-screen events. At most 1 per batch. Requires popup: true.',
                        },
                        choices: {
                            type: 'array',
                            description: 'Required when popup is true. 2-3 player choices.',
                            items: {
                                type: 'object',
                                properties: {
                                    label: {
                                        type: 'string',
                                        description: 'Button text, 2-5 words.',
                                    },
                                    desc: {
                                        type: 'string',
                                        description: '1-2 sentence description of the choice and its consequences.',
                                    },
                                    deltas: {
                                        type: 'object',
                                        description: 'Parameter deltas applied when this choice is selected.',
                                        properties: PARAM_PROPERTIES,
                                        additionalProperties: false,
                                    },
                                    effects: {
                                        type: 'array',
                                        description: 'World state mutations applied on this choice.',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                path:  { type: 'string', description: 'Dot-notation path into world state.' },
                                                op:    { type: 'string', enum: ['set', 'add'] },
                                                value: { type: 'number' },
                                            },
                                            required: ['path', 'op', 'value'],
                                            additionalProperties: false,
                                        },
                                    },
                                    factionShifts: {
                                        type: 'array',
                                        description: 'Faction standing changes. [{faction, value}]. Factions: firmStanding, regulatoryExposure, federalistSupport, farmerLaborSupport, mediaTrust, fedRelations.',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                faction: { type: 'string', enum: ['firmStanding', 'regulatoryExposure', 'federalistSupport', 'farmerLaborSupport', 'mediaTrust', 'fedRelations'] },
                                                value: { type: 'number', description: 'Additive shift. Positive = increase, negative = decrease.' },
                                            },
                                            required: ['faction', 'value'],
                                            additionalProperties: false,
                                        },
                                    },
                                    playerFlag: {
                                        type: 'string',
                                        description: 'snake_case flag recorded when player picks this choice. Used by traits and endings.',
                                    },
                                    resultToast: {
                                        type: 'string',
                                        description: 'Short toast message shown after player picks this choice.',
                                    },
                                    followups: {
                                        type: 'array',
                                        description: 'Events to schedule as followups from this choice.',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                id:   { type: 'string', description: 'Event id to schedule.' },
                                                mtth: { type: 'number', description: 'Mean trading days until followup fires.' },
                                            },
                                            required: ['id', 'mtth'],
                                            additionalProperties: false,
                                        },
                                    },
                                },
                                required: ['label', 'desc'],
                                additionalProperties: false,
                            },
                            minItems: 2,
                            maxItems: 3,
                        },
                        followups: {
                            type: 'array',
                            description: 'Optional chain events scheduled when this event fires.',
                            items: {
                                type: 'object',
                                properties: {
                                    id:        { type: 'string', description: 'Short snake_case identifier.' },
                                    headline:  { type: 'string', description: '1-2 sentence followup headline.' },
                                    params: {
                                        type: 'object',
                                        description: 'Parameter deltas for the followup.',
                                        properties: PARAM_PROPERTIES,
                                        additionalProperties: false,
                                    },
                                    magnitude: { type: 'string', enum: ['minor', 'moderate', 'major'] },
                                    mtth:      { type: 'number', description: 'Mean trading days until followup fires.' },
                                    weight:    { type: 'number', description: 'Probability (0-1) the followup fires.' },
                                },
                                required: ['id', 'headline', 'params', 'magnitude', 'mtth', 'weight'],
                                additionalProperties: false,
                            },
                        },
                        effects: {
                            type: 'array',
                            description: 'Optional world state mutations applied when this event fires.',
                            items: {
                                type: 'object',
                                properties: {
                                    path:  { type: 'string', description: 'Dot-notation world state path.' },
                                    op:    { type: 'string', enum: ['set', 'add'] },
                                    value: { type: 'number' },
                                },
                                required: ['path', 'op', 'value'],
                                additionalProperties: false,
                            },
                        },
                        factionShifts: {
                            type: 'array',
                            description: 'Top-level faction shifts applied when this event fires (not on choice).',
                            items: {
                                type: 'object',
                                properties: {
                                    faction: { type: 'string', enum: ['firmStanding', 'regulatoryExposure', 'federalistSupport', 'farmerLaborSupport', 'mediaTrust', 'fedRelations'] },
                                    value: { type: 'number' },
                                },
                                required: ['faction', 'value'],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ['headline', 'params', 'magnitude'],
                    additionalProperties: false,
                },
                minItems: 3,
                maxItems: 5,
            },
        },
        required: ['events'],
        additionalProperties: false,
    },
};
```

- [ ] **Step 2: Verify syntax**

Reload page, check console for parse errors.

- [ ] **Step 3: Commit**

```bash
git add src/llm.js
git commit -m "feat(llm): expand tool schema with popup/choices/factionShifts/category"
```

---

### Task 4: Rewrite LLM system prompt

**Files:**
- Modify: `src/llm.js:97-157` (SYSTEM_PROMPT)

- [ ] **Step 1: Replace SYSTEM_PROMPT**

Replace lines 97-157 with the full updated prompt:

```js
const SYSTEM_PROMPT = `You are a narrative event generator for "Shoals", an options trading simulator set in an alternate-history America. Use the emit_events tool to return your events.

## Universe

The player is a senior derivatives trader at Meridian Capital, trading stock and options in Palanthropic (ticker: PNTH). The simulation spans a full presidential term (~1008 trading days).

### The Federal States of Columbia

Alternate-history America. Two parties: Federalist and Farmer-Labor. Capital: Philadelphia. Presidential retreat: Little St. James. Geography mirrors the real world (Strait of Hormuz, Nanjing, Wall Street); polities and people are fictional.

**President John Barron** (Federalist) — Combative populist. Tariff enthusiast, Fed-basher, military hawk. Erratic social media presence. Pressures Fed Chair to cut rates. Renames Department of Defense to "Department of War." Launches strikes in the Middle East and stabilization ops in South America using PNTH AI.

**VP Jay Bowman** — Former corporate attorney. Andrea Dirks's college roommate. Lobbied Pentagon for PNTH before office. Corruption is an open secret; Rachel Tan is investigating. Barron picked him for fundraising, not governing.

**Robin Clay** (Farmer-Labor) — Former president, establishment centrist. Lost to Barron. Writes memoirs, gives speeches.

### Congress

**Federalist:**
- **Sen. Roy Lassiter (F-SC)** — Trade hawk, Commerce Committee chair. Sponsors Serican Reciprocal Tariff Act.
- **Sen. Peggy Haines (F-WY)** — Deficit hawk, key swing vote on Big Beautiful Bill.
- **Rep. Vincent Tao (F-TX)** — House Majority Leader, party enforcer, Barron loyalist.
- **Rep. Diane Whittaker (F-OH)** — Moderate swing vote, purple district.

**Farmer-Labor:**
- **Sen. Patricia Okafor (F-L, IL)** — Special Investigations Committee chair. Anti-PNTH, anti-Barron. Potential presidential candidate.
- **Sen. James Whitfield (F-L, MA)** — Minority Leader. Legendary filibuster tactician.
- **Rep. Carmen Reyes (F-L, CA)** — House Minority Leader, firebrand. Sponsors Digital Markets Accountability Act.
- **Rep. David Oduya (F-L, MI)** — Labor wing, anti-trade, anti-Wall Street.

**Key legislation:**
- **American Competitive Enterprise Act ("Big Beautiful Bill")** — Barron's omnibus: tax cuts + deregulation + defense spending. Tracked by bigBillStatus 0-4.
- **Serican Reciprocal Tariff Act** — Lassiter's escalating tariff authority against Serica.
- **Financial Freedom Act** — Banking deregulation by Lassiter-Tao.
- **Digital Markets Accountability Act** — Reyes's anti-Big-Tech bill targeting PNTH.

### The Federal Reserve

- **Chair Hayden Hartley** — Principled technocrat. Barron attacks her publicly. Can be fired if he has a trifecta and her credibility is low.
- **Governor Marcus Vane** — Hawkish rival. Barron quietly backs him as replacement.

### Palanthropic (PNTH)

- **Chairwoman Andrea Dirks** — Defense hawk, ex-intelligence. Sees PNTH's future as defense/intelligence monopoly. Controls board (initially 7-3).
- **CEO Eugene Gottlieb** — Idealistic founder. Ethical objections to weaponization. May leave to start Covenant AI.
- **CTO Mira Kassis** — Safety-focused engineer caught between Dirks and Gottlieb. Resignation would tank stock.
- **CFO Raj Malhotra** — Wall Street background, sides with the winner.
- **David Zhen** — Board kingmaker. His vote determines company direction.

**Products:**
- **Atlas Sentinel** — Enterprise surveillance, already launched. Government and corporate clients.
- **Atlas Aegis** — Military AI. Drone targeting, deployed mid-game. Drives board split. Civilian casualty controversy.
- **Atlas Companion** — Consumer AI assistant, late launch. 200M users, privacy scandal, teen addiction concerns.
- **Atlas Foundry** — AI training infrastructure. Critical supply chain role. Zhaowei wants access.
- **Covenant AI** — Gottlieb's ethical rival startup if he leaves.

### Geopolitics

- **Serica** (Premier Liang Wei) — Techno-authoritarian. Home of Zhaowei Technologies, semiconductor giant. Trade war rival.
- **Khasuria** (President Volkov) — Expansionist. Border provocations (Khasurian Border Accord). Escalation stages 0-3.
- **Farsistan** (Emir al-Farhan) — Oil cartel. Controls Strait of Hormuz. Sovereign wealth fund with PNTH interest.
- **Boliviara** (President Madero) — Lithium/rare earths. Target of Southern Hemisphere Initiative (CIA/PNTH covert ops).
- **Meridia** (PM Navon) — Military ally. Joint Operation Dustwalker in Farsistan theater.

### Media

- **The Continental** — Prestige investigative paper. Rachel Tan and Tom Driscoll.
- **The Sentinel** — Federalist-aligned cable news. Marcus Cole's prime-time show.
- **MarketWire** — Financial terminal/news. Priya Sharma's economics coverage moves markets.
- **The Meridian Brief** — Internal Meridian Capital morning note.

**Rachel Tan** — Continental investigative reporter. Working on Bowman offshore accounts, NSA surveillance, PNTH contracts.
**Marcus Cole** — Sentinel anchor, Barron loyalist. Gets caught coordinating with White House.
**Priya Sharma** — MarketWire chief economics correspondent. Fed whisperer. Trusted by traders.
**Tom Driscoll** — Continental White House correspondent. Less careful than Tan; premature scoops can false-signal markets.

### Meridian Capital (Player's Firm)

The player's firm. Compliance reviews, scrutiny from investigations, quarterly performance reviews. The player's actions affect 6 faction standings: firmStanding (desk trust), regulatoryExposure (compliance heat), federalistSupport, farmerLaborSupport, mediaTrust, fedRelations.

## World State

Your events can mutate persistent state via the "effects" array using dot-notation paths.

### congress
- senate.federalist / senate.farmerLabor (0-100, must sum to 100)
- house.federalist / house.farmerLabor (0-435, must sum to 435)
- filibusterActive (bool)
- bigBillStatus (0=not introduced, 1=committee, 2=floor, 3=passed, 4=failed)

### pnth
- boardDirks / boardGottlieb (0-12 each, max 12 total)
- ceoIsGottlieb / ctoIsMira (bool)
- militaryContractActive (bool)
- commercialMomentum (-2 to +2)
- ethicsBoardIntact / activistStakeRevealed / dojSuitFiled / senateProbeLaunched / whistleblowerFiled / acquired / gottliebStartedRival (bool)
- sentinelLaunched / aegisDeployed / companionLaunched / foundryLaunched (bool)
- companionScandal / aegisControversy (0-3)

### geopolitical
- tradeWarStage (0=peace, 1=tariffs, 2=retaliation, 3=decoupling, 4=deal)
- sericaRelations (-3 cold war to +3 detente)
- mideastEscalation / southAmericaOps / farsistanEscalation / khasurianCrisis (0-3)
- sanctionsActive / oilCrisis / recessionDeclared / straitClosed / aegisDemandSurge / foundryCompetitionPressure / energyCrisis (bool)

### fed
- hikeCycle / cutCycle / qeActive / hartleyFired / vaneAppointed (bool)
- credibilityScore (0-10)

### investigations
- tanBowmanStory / tanNsaStory / okaforProbeStage / impeachmentStage (0-3)
- meridianExposed (bool — set when player is caught in investigative crossfire)

### election
- midtermComplete (bool), barronApproval (0-100), lobbyMomentum (-3 to +3)
- primarySeason / okaforRunning (bool)

### media
- tanCredibility / sentinelRating / pressFreedomIndex (0-10)
- leakCount (0-5), lobbyingExposed (bool)

### factions (via factionShifts, not effects)
- firmStanding, regulatoryExposure, federalistSupport, farmerLaborSupport, mediaTrust, fedRelations (0-100 each)
- Shift via factionShifts array on events or choices, NOT via effects.

## Event Design Rules

1. **Build coherent narrative** from recent events, pending followups, and world state.
2. **Reference named characters and publications** in headlines. Use The Meridian Brief for internal/desk flavor.
3. **Categories:** pnth, macro, sector, neutral, political, investigation, congressional, filibuster, media, desk, compound. Do NOT generate fed, pnth_earnings, midterm, or interjection events.
4. **Parameter deltas:** minor = 1-2 params with small deltas, moderate = 2-3, major = 3-5 with large deltas.
5. **Mix event types:** corporate, political, geopolitical, macro, desk/firm, neutral flavor. Include 1-2 neutral events per batch.
6. **Popup events (~1 in 4):** Set popup: true, provide 2-3 choices with meaningful trade-offs. Choices should present genuine dilemmas. Include faction shifts, player flags, and result toasts.
7. **Superevents (rare):** At most 1 per batch. Reserve for dramatic turning points — board coups, Strait closures, major investigations breaking.
8. **Followup chains:** Create multi-step narratives. Each followup has mtth (typical: 10-30 days) and weight (0.3-0.9).
9. **Effects:** Use "add" for incremental changes, "set" for booleans/absolute values. Keep proportional to magnitude. Effects are validated and clamped server-side.
10. **Faction shifts:** Use factionShifts (not effects) for faction standing changes. On choices, shifts should reflect the moral weight of the decision.
11. **Player flags:** snake_case strings on choices. These feed into the trait system and endings. Use descriptive names like "cooperated_with_compliance", "pursued_insider_tip", "sided_with_dirks".
12. **Era awareness:** Early (0-350 days): honeymoon, bill introductions, trade skirmishes. Mid (350-700): midterm buildup, Aegis controversy, trade war peaks. Late (700-1008): election, consequences cascade, resolutions.
13. **Desk events:** Compliance reviews, internal politics. Use category "desk". Reference the player's portfolio state and faction standing.
14. **Do not duplicate pulse events:** Fed decisions, PNTH earnings, midterm election, and interjections are scheduled separately. Do not generate events in those categories.`;
```

- [ ] **Step 2: Verify syntax**

Reload page, check console for parse errors in llm.js.

- [ ] **Step 3: Commit**

```bash
git add src/llm.js
git commit -m "feat(llm): rewrite system prompt with current lore, full world state, event design rules"
```

---

### Task 5: Expand generateBatch context serialization

**Files:**
- Modify: `src/llm.js:179-270` (generateBatch method)

- [ ] **Step 1: Replace generateBatch method**

Replace lines 179-270 with:

```js
    async generateBatch(sim, eventLog, pendingFollowups, world, extras = {}) {
        if (!this.isConfigured()) throw new Error('API key not configured');

        const vol = Math.sqrt(Math.max(sim.v, 0));
        const stateLines = [
            'Current simulation state (day ' + sim.day + '):',
            '- Stock price: $' + sim.S.toFixed(2),
            '- Volatility: ' + (vol * 100).toFixed(1) + '% (annualized)',
            '- Risk-free rate: ' + (sim.r * 100).toFixed(2) + '%',
            '- Parameters: mu=' + sim.mu.toFixed(3) + ', theta=' + sim.theta.toFixed(4) +
              ', kappa=' + sim.kappa.toFixed(2) + ', xi=' + sim.xi.toFixed(2) +
              ', rho=' + sim.rho.toFixed(2) + ', lambda=' + sim.lambda.toFixed(1) +
              ', muJ=' + sim.muJ.toFixed(3) + ', sigmaJ=' + sim.sigmaJ.toFixed(3) +
              ', a=' + sim.a.toFixed(2) + ', b=' + sim.b.toFixed(4) +
              ', sigmaR=' + sim.sigmaR.toFixed(4) +
              ', borrowSpread=' + sim.borrowSpread.toFixed(2) +
              ', q=' + sim.q.toFixed(4),
        ];

        const recentEvents = eventLog.length > 0
            ? eventLog.slice(-10).map(e => 'Day ' + e.day + ': [' + e.magnitude + (e.category ? '/' + e.category : '') + '] ' + e.headline).join('\n')
            : '(none yet)';

        const pendingLines = pendingFollowups.length > 0
            ? pendingFollowups.map(f => '"' + (f.event?.id || f.chainId || 'unknown') + '" scheduled for day ' + f.targetDay).join('\n')
            : '(none)';

        // World state
        const worldLines = [];
        if (world) {
            const w = world;
            const cg = w.congress;
            worldLines.push(
                'World state:',
                '- Congress: Senate ' + cg.senate.federalist + 'F/' + cg.senate.farmerLabor + 'FL, House ' + cg.house.federalist + 'F/' + cg.house.farmerLabor + 'FL' +
                    ', filibuster: ' + cg.filibusterActive + ', Big Bill status: ' + cg.bigBillStatus,
                '- PNTH board: ' + w.pnth.boardDirks + ' Dirks / ' + w.pnth.boardGottlieb + ' Gottlieb' +
                    ', CEO: ' + (w.pnth.ceoIsGottlieb ? 'Gottlieb' : 'successor') +
                    ', CTO: ' + (w.pnth.ctoIsMira ? 'Kassis' : 'vacant'),
                '- PNTH products: Sentinel=' + w.pnth.sentinelLaunched + ', Aegis=' + w.pnth.aegisDeployed +
                    ', Companion=' + w.pnth.companionLaunched + ' (scandal=' + w.pnth.companionScandal + ')' +
                    ', Foundry=' + w.pnth.foundryLaunched + ', aegisControversy=' + w.pnth.aegisControversy,
                '- PNTH: military=' + w.pnth.militaryContractActive + ', momentum=' + w.pnth.commercialMomentum +
                    ', ethicsBoard=' + w.pnth.ethicsBoardIntact + ', activist=' + w.pnth.activistStakeRevealed +
                    ', DOJ=' + w.pnth.dojSuitFiled + ', senateProbe=' + w.pnth.senateProbeLaunched +
                    ', whistleblower=' + w.pnth.whistleblowerFiled + ', rival=' + w.pnth.gottliebStartedRival,
                '- Geopolitical: tradeWar=' + w.geopolitical.tradeWarStage + ', sericaRelations=' + w.geopolitical.sericaRelations +
                    ', mideast=' + w.geopolitical.mideastEscalation + ', southAm=' + w.geopolitical.southAmericaOps +
                    ', farsistan=' + w.geopolitical.farsistanEscalation + ', khasuria=' + w.geopolitical.khasurianCrisis,
                '- Geopolitical flags: sanctions=' + w.geopolitical.sanctionsActive + ', oilCrisis=' + w.geopolitical.oilCrisis +
                    ', recession=' + w.geopolitical.recessionDeclared + ', straitClosed=' + w.geopolitical.straitClosed +
                    ', energyCrisis=' + w.geopolitical.energyCrisis + ', aegisDemand=' + w.geopolitical.aegisDemandSurge +
                    ', foundryCompetition=' + w.geopolitical.foundryCompetitionPressure,
                '- Fed: credibility=' + w.fed.credibilityScore + '/10, hike=' + w.fed.hikeCycle + ', cut=' + w.fed.cutCycle +
                    ', QE=' + w.fed.qeActive + ', hartleyFired=' + w.fed.hartleyFired + ', vaneAppointed=' + w.fed.vaneAppointed,
                '- Investigations: Tan/Bowman=' + w.investigations.tanBowmanStory + ', Tan/NSA=' + w.investigations.tanNsaStory +
                    ', Okafor=' + w.investigations.okaforProbeStage + ', impeachment=' + w.investigations.impeachmentStage +
                    ', meridianExposed=' + w.investigations.meridianExposed,
                '- Election: approval=' + w.election.barronApproval + ', midterm=' + (w.election.midtermComplete ? w.election.midtermResult : 'pending') +
                    ', lobbyMomentum=' + w.election.lobbyMomentum + ', primary=' + w.election.primarySeason + ', okaforRunning=' + w.election.okaforRunning,
                '- Media: tanCredibility=' + w.media.tanCredibility + ', sentinelRating=' + w.media.sentinelRating +
                    ', pressFreedom=' + w.media.pressFreedomIndex + ', leaks=' + w.media.leakCount +
                    ', lobbyingExposed=' + w.media.lobbyingExposed,
            );
        }

        // Faction standing
        const factionLines = [];
        if (extras.factions) {
            const f = extras.factions;
            factionLines.push(
                'Faction standing: firmStanding=' + (f.firmStanding || 0) +
                    ', regulatoryExposure=' + (f.regulatoryExposure || 0) +
                    ', federalistSupport=' + (f.federalistSupport || 0) +
                    ', farmerLaborSupport=' + (f.farmerLaborSupport || 0) +
                    ', mediaTrust=' + (f.mediaTrust || 0) +
                    ', fedRelations=' + (f.fedRelations || 0)
            );
        }

        // Active traits
        const traitLine = extras.traitIds && extras.traitIds.length > 0
            ? 'Active traits: ' + extras.traitIds.join(', ')
            : '';

        // Active regulations
        const regLines = [];
        if (extras.regulations && extras.regulations.length > 0) {
            regLines.push('Active regulations:');
            for (const reg of extras.regulations) {
                let desc = '- ' + reg.name + ' (' + reg.status;
                if (reg.remainingDays != null) desc += ', ' + reg.remainingDays + ' days remaining';
                desc += ')';
                regLines.push(desc);
            }
        }

        // Player flags
        const flagLines = [];
        if (extras.playerChoices) {
            const flags = Object.entries(extras.playerChoices)
                .filter(([k]) => !k.startsWith('_'))
                .map(([k, v]) => k + ' (day ' + v + ')');
            if (flags.length > 0) flagLines.push('Player flags: ' + flags.join(', '));
        }

        // Lobbying
        const lobbyLine = extras.lobbyCount > 0
            ? 'Lobby actions taken: ' + extras.lobbyCount + ', last lobby day: ' + extras.lastLobbyDay
            : '';

        const userMsg = stateLines.join('\n') +
            '\n\nRecent events:\n' + recentEvents +
            '\n\nPending followup events:\n' + pendingLines +
            (worldLines.length > 0 ? '\n\n' + worldLines.join('\n') : '') +
            (factionLines.length > 0 ? '\n\n' + factionLines.join('\n') : '') +
            (traitLine ? '\n\n' + traitLine : '') +
            (regLines.length > 0 ? '\n\n' + regLines.join('\n') : '') +
            (flagLines.length > 0 ? '\n\n' + flagLines.join('\n') : '') +
            (lobbyLine ? '\n\n' + lobbyLine : '') +
            '\n\nGenerate 3-5 new events that continue this narrative.';

        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 4096,
                system: SYSTEM_PROMPT,
                tools: [TOOL_DEF],
                tool_choice: { type: 'tool', name: 'emit_events' },
                messages: [{ role: 'user', content: userMsg }],
            }),
        });

        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error('API ' + resp.status + ': ' + body.slice(0, 200));
        }

        const data = await resp.json();
        const toolBlock = data.content && data.content.find(b => b.type === 'tool_use');
        if (!toolBlock) throw new Error('No tool_use block in response');

        const events = toolBlock.input.events;
        if (!Array.isArray(events) || events.length === 0) throw new Error('Empty events array');

        return events.map(ev => ({
            id: ev.id || undefined,
            category: ev.category || undefined,
            headline: ev.headline,
            params: ev.params,
            magnitude: ev.magnitude,
            popup: ev.popup || false,
            superevent: ev.superevent || false,
            choices: Array.isArray(ev.choices) ? ev.choices : undefined,
            followups: Array.isArray(ev.followups) ? ev.followups : undefined,
            effects: Array.isArray(ev.effects) ? ev.effects : undefined,
            factionShifts: Array.isArray(ev.factionShifts) ? ev.factionShifts : undefined,
        }));
    }
```

- [ ] **Step 2: Verify syntax**

Reload page, check console for parse errors.

- [ ] **Step 3: Commit**

```bash
git add src/llm.js
git commit -m "feat(llm): expand generateBatch with full world state, factions, traits, regulations, player flags"
```

---

### Task 6: Handle top-level factionShifts in _fireEvent

**Files:**
- Modify: `src/events.js:339-394` (_fireEvent)

The `_fireEvent` method processes `effects` but does not process top-level `factionShifts` on the event itself (only on choices, which are handled in main.js). LLM events with top-level `factionShifts` need processing here.

- [ ] **Step 1: Import shiftFaction in events.js**

At line 21 in `src/events.js`, change:

```js
import { firmCooldownMult } from './faction-standing.js';
```

To:

```js
import { firmCooldownMult, shiftFaction } from './faction-standing.js';
```

- [ ] **Step 2: Add factionShifts processing to _fireEvent**

In the non-popup branch of `_fireEvent` (after the effects application at lines 374-378, before the boredom tracking at line 382), add faction shift processing. Replace lines 369-394:

```js
        // Non-popup: apply deltas with coupling
        const coupling = this._computeCoupling(netDelta, event.params);
        this.applyDeltas(sim, this._scaledParams(event.params, coupling) || event.params);

        // Apply world state effects
        if (typeof event.effects === 'function') {
            event.effects(this.world);
        } else if (Array.isArray(event.effects)) {
            applyStructuredEffects(this.world, event.effects);
        }
        validateCongress(this.world);
        validatePnthBoard(this.world);

        // Apply top-level faction shifts
        if (Array.isArray(event.factionShifts)) {
            for (const fs of event.factionShifts) {
                shiftFaction(fs.faction, fs.value);
            }
        }

        // Track consecutive minor/neutral for boredom boost
        if (event.magnitude === 'minor' || event.category === 'neutral') {
            this._consecutiveMinor++;
        } else {
            this._consecutiveMinor = 0;
        }

        const logEntry = this._logEvent(day, event, event.params || {});
        logEntry.interjection = event.interjection || false;

        this._scheduleFollowups(event, day, depth, '_' + Math.random().toString(36).slice(2, 8));

        return logEntry;
```

- [ ] **Step 3: Also add category to logEvent for LLM events**

Replace the `_logEvent` method (lines 317-322):

```js
    _logEvent(day, event, params, magnitude) {
        const entry = { day, headline: event.headline, magnitude: magnitude || event.magnitude || 'moderate', params: params ?? {} };
        if (event.category) entry.category = event.category;
        this.eventLog.push(entry);
        if (this.eventLog.length > MAX_LOG) this.eventLog.shift();
        return entry;
    }
```

- [ ] **Step 4: Verify no errors**

Reload, play Dynamic (Offline) a few days, verify events still fire normally.

- [ ] **Step 5: Commit**

```bash
git add src/events.js
git commit -m "feat(events): process top-level factionShifts in _fireEvent, log event category"
```

---

### Task 7: Pass category through to showPopupEvent for LLM popup events

**Files:**
- Modify: `main.js:919` (_processPopupQueue, category line)

- [ ] **Step 1: Verify popup category detection works for LLM events**

The existing line at main.js:919 already handles this:

```js
const popupCat = event.category || (event.id && event.id.startsWith('desk_') ? 'desk' : '');
```

LLM events that include `category` will have it passed through. No change needed — this step is verification only.

Check that `showPopupEvent` at ui.js:1146 accepts the category parameter and has fallback for unknown categories:

```js
const meta = _popupCategoryMeta[category] || _popupCategoryMeta.desk;
```

This will gracefully handle any LLM-provided category. No changes needed.

- [ ] **Step 2: Commit (skip if no changes)**

No commit needed — existing code already handles this correctly.

---

### Task 8: Verify end-to-end LLM pipeline

This is a manual verification task. No code changes.

- [ ] **Step 1: Start local server**

```bash
cd /Users/a9lim/Work/a9lim.github.io && python -m http.server
```

- [ ] **Step 2: Load Dynamic (LLM) preset**

Open browser, navigate to localhost:8000/shoals/. Select Dynamic (LLM) from preset dropdown. Enter a valid Anthropic API key in the LLM Settings section.

- [ ] **Step 3: Play and verify**

Play the simulation. Verify:
- Events generate with categories visible in event log
- Toast events fire with proper headlines and magnitude badges
- Popup events render with choices, descriptions, and faction shift consequences
- Choosing a popup option shows result toast and applies faction shifts
- World state panel updates after events with effects
- Followup events fire after parent events
- Fallback to offline works (enter invalid API key, verify toast + offline events continue)

- [ ] **Step 4: Check console**

No errors or warnings related to LLM event processing.
