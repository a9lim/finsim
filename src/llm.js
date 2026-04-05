/* ===================================================
   llm.js -- Anthropic API client for dynamic event
   generation in Shoals. Generates batches of narrative
   market events with parameter deltas and world state
   effects via structured tool use.
   =================================================== */

import { PARAM_RANGES } from './events.js';

const LS_KEY_API  = 'shoals_llm_key';
const LS_KEY_MODEL = 'shoals_llm_model';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';

const PARAM_PROPERTIES = {};
for (const [k, r] of Object.entries(PARAM_RANGES)) {
    PARAM_PROPERTIES[k] = {
        type: 'number',
        description: 'Additive delta. Full range: [' + r.min + ', ' + r.max + ']. Delta should be a fraction of this range.',
    };
}

/* Reusable sub-schemas */
const FACTION_SHIFT_SCHEMA = {
    type: 'object',
    properties: {
        faction: {
            type: 'string',
            enum: ['firmStanding', 'regulatoryExposure', 'federalistSupport', 'farmerLaborSupport', 'mediaTrust', 'fedRelations'],
        },
        value: { type: 'number', description: 'Additive delta (positive = increase).' },
    },
    required: ['faction', 'value'],
    additionalProperties: false,
};

const EFFECT_SCHEMA = {
    type: 'object',
    properties: {
        path:  { type: 'string', description: 'Dot-notation path into world state, e.g. "pnth.boardDirks", "election.barronApproval", "fed.credibilityScore".' },
        op:    { type: 'string', enum: ['set', 'add'] },
        value: { type: 'number' },
    },
    required: ['path', 'op', 'value'],
    additionalProperties: false,
};

const FOLLOWUP_SCHEMA = {
    type: 'object',
    properties: {
        id:        { type: 'string', description: 'Short snake_case identifier.' },
        headline:  { type: 'string', description: '1-2 sentence followup headline.' },
        params:    { type: 'object', description: 'Parameter deltas.', properties: PARAM_PROPERTIES, additionalProperties: false },
        magnitude: { type: 'string', enum: ['minor', 'moderate', 'major'] },
        category:  { type: 'string', enum: ['pnth', 'macro', 'sector', 'neutral', 'political', 'investigation', 'congressional', 'filibuster', 'media', 'desk', 'compound'] },
        mtth:      { type: 'number', description: 'Mean trading days until followup fires (10-30).' },
        weight:    { type: 'number', description: 'Probability 0-1 the followup fires (0.3-0.9).' },
        effects:   { type: 'array', items: EFFECT_SCHEMA, description: 'World state mutations on followup.' },
        factionShifts: { type: 'array', items: FACTION_SHIFT_SCHEMA, description: 'Faction standing changes on followup.' },
    },
    required: ['id', 'headline', 'params', 'magnitude', 'mtth', 'weight'],
    additionalProperties: false,
};

const CHOICE_SCHEMA = {
    type: 'object',
    properties: {
        label:      { type: 'string', description: 'Short button label (2-5 words).' },
        desc:       { type: 'string', description: '1-2 sentence description of the choice and its consequences.' },
        deltas:     { type: 'object', description: 'Parameter deltas applied when this choice is selected.', properties: PARAM_PROPERTIES, additionalProperties: false },
        effects:    { type: 'array', items: EFFECT_SCHEMA, description: 'World state mutations on this choice.' },
        factionShifts: { type: 'array', items: FACTION_SHIFT_SCHEMA, description: 'Faction standing changes on this choice.' },
        playerFlag: { type: 'string', description: 'Snake_case flag set on the player when chosen (feeds into traits/endings).' },
        resultToast: { type: 'string', description: 'Toast message shown after choosing (1-2 sentences).' },
        followups:  { type: 'array', items: FOLLOWUP_SCHEMA, description: 'Choice-specific followup chain.' },
    },
    required: ['label', 'desc'],
    additionalProperties: false,
};

const TOOL_DEF = {
    name: 'emit_events',
    description: 'Emit 3-5 narrative market events with parameter deltas, world state effects, faction shifts, and optional popup choices.',
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
                            description: 'Unique snake_case event id (e.g. "llm_tan_leak_probe").',
                        },
                        headline: {
                            type: 'string',
                            description: '1-2 sentence news headline. Reference named characters and publications.',
                        },
                        category: {
                            type: 'string',
                            enum: ['pnth', 'macro', 'sector', 'neutral', 'political', 'investigation', 'congressional', 'filibuster', 'media', 'desk', 'compound'],
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
                            description: 'True for decision popups with choices (about 1 in 4 events). False or omit for toast-only.',
                        },
                        superevent: {
                            type: 'boolean',
                            description: 'True for dramatic turning-point events (at most 1 per batch). Gets full-screen treatment.',
                        },
                        choices: {
                            type: 'array',
                            description: 'Required when popup is true. 2-3 choices for the player.',
                            items: CHOICE_SCHEMA,
                            minItems: 2,
                            maxItems: 3,
                        },
                        factionShifts: {
                            type: 'array',
                            items: FACTION_SHIFT_SCHEMA,
                            description: 'Top-level faction shifts applied when the event fires (before any choice). Use for toast-only events.',
                        },
                        followups: {
                            type: 'array',
                            description: 'Top-level followup chain (for toast-only events).',
                            items: FOLLOWUP_SCHEMA,
                        },
                        effects: {
                            type: 'array',
                            description: 'Top-level world state mutations applied when the event fires.',
                            items: EFFECT_SCHEMA,
                        },
                    },
                    required: ['headline', 'category', 'params', 'magnitude'],
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

const SYSTEM_PROMPT = `You are a narrative event generator for "Shoals", an options trading simulator set in an alternate-history Federal States of Columbia. The player is a senior derivatives trader at Meridian Capital, trading stock and options in Palanthropic (ticker: PNTH) across a 4-year presidential term (~1008 trading days). Use the emit_events tool to return your events.

## Universe

Geography is real (Wall Street, Strait of Hormuz, Nanjing). Polities and people are fictional.

### The Administration
- **President John Barron** (Federalist) — Populist strongman. Military hawk, tariff enthusiast, Fed-basher. Launches airstrikes in the Middle East and "stabilization operations" in South America using PNTH AI targeting systems. Pressures Fed Chair to cut rates.
- **VP Jay Bowman** — Former defense lobbyist. Andrea Dirks's college roommate. Lobbied Pentagon on PNTH's behalf. His corruption is an open secret driven by Rachel Tan's reporting.
- **Former President Robin Clay** (Farmer-Labor) — Establishment centrist, face of the opposition.

### Congress
Two parties: Federalist and Farmer-Labor. Key members:
- **Sen. Roy Lassiter** (F-SC) — trade hawk
- **Sen. Peggy Haines** (F-WY) — deficit hawk, swing vote
- **Rep. Vincent Tao** (F-TX) — Majority Leader
- **Rep. Diane Whittaker** (F-OH) — moderate
- **Sen. James Whitfield** (F-L, MA) — filibuster master
- **Rep. Carmen Reyes** (F-L, CA) — firebrand
- **Sen. Patricia Okafor** (F-L, IL) — Senate Intelligence Chair, investigations, potential presidential candidate
- **Rep. David Oduya** (F-L, MI) — labor wing, anti-trade

Key legislation: Big Beautiful Bill (omnibus, bigBillStatus 0-4), Serican Reciprocal Tariff Act, Financial Freedom Act, Digital Markets Accountability Act.

### The Fed
- **Chair Hayden Hartley** — Technocratic, principled. Barron's attacks are personal. Can be fired with a trifecta + low credibility.
- **Governor Marcus Vane** — Hawkish rival, Barron's preferred replacement.

### Palanthropic (PNTH)
- **Chairwoman Andrea Dirks** — Political operative. VP Bowman's college roommate. Defense/intelligence monopoly vision. Controls board (initially 7-3).
- **CEO Eugene Gottlieb** — Idealistic founder watching his tech get weaponized.
- **CTO Mira Kassis** — Brilliant engineer, politically naive. Can become whistleblower, Dirks ally, or leave.
- **CFO Raj Malhotra** — Numbers man, quiet loyalty to whoever's winning.
- **David Zhen** — Board kingmaker. His vote tips proxy fights.
Products: Atlas Sentinel (enterprise), Atlas Aegis (military), Atlas Companion (consumer), Atlas Foundry (infrastructure). Gottlieb may start rival Covenant AI.

### Geopolitics
- **Serica** (Premier Liang Wei, Zhaowei Technologies) — PNTH's rival. Trade war and tech decoupling.
- **Khasuria** (President Volkov) — Military incursion sets aegisDemandSurge.
- **Farsistan** (Emir al-Farhan) — Strait of Hormuz closure triggers energyCrisis.
- **Boliviara** (President Madero) — South American instability.
- **Meridia** (PM Navon) — Regional flashpoint.

### Media
- **The Continental** (Rachel Tan, Tom Driscoll) — Paper of record. Tan drives investigation arcs.
- **The Sentinel** (Marcus Cole) — Conservative outlet.
- **MarketWire** (Priya Sharma) — Financial wire service.
- **The Meridian Brief** — Meridian Capital internal newsletter.

## World State (7 domains)

### congress
Senate/House seat counts (Federalist vs Farmer-Labor). Trifecta = Senate >= 50 + House >= 218.
- filibusterActive (bool), bigBillStatus (0-4: not introduced, introduced, committee, floor, passed/failed)

### pnth
- boardDirks / boardGottlieb (max 12 total), ceoIsGottlieb, ctoIsMira (bool)
- militaryContractActive, commercialMomentum (-2 to +2), ethicsBoardIntact
- activistStakeRevealed, dojSuitFiled, senateProbeLaunched, whistleblowerFiled, acquired, gottliebStartedRival (bool)
- sentinelLaunched, aegisDeployed, companionLaunched, foundryLaunched (bool)
- companionScandal (0-3), aegisControversy (0-3)

### geopolitical
- tradeWarStage (0=peace, 1=tariffs, 2=retaliation, 3=decoupling, 4=deal)
- sericaRelations (-3 cold war to +3 detente)
- mideastEscalation, southAmericaOps, farsistanEscalation, khasurianCrisis (0-3)
- sanctionsActive, oilCrisis, recessionDeclared, straitClosed, aegisDemandSurge, foundryCompetitionPressure, energyCrisis (bool)

### fed
- hikeCycle, cutCycle, qeActive, hartleyFired, vaneAppointed (bool)
- credibilityScore (0-10)

### investigations
- tanBowmanStory, tanNsaStory, okaforProbeStage, impeachmentStage (0-3)
- meridianExposed (bool) — set when dirty player is caught in investigative crossfire

### election
- midtermComplete (bool), barronApproval (0-100), lobbyMomentum (-3 to +3)
- primarySeason, okaforRunning (bool)

### media
- tanCredibility, sentinelRating, pressFreedomIndex (0-10)
- leakCount (0-5), lobbyingExposed (bool)

## Faction Standing System

Six factions (0-100): firmStanding, regulatoryExposure, federalistSupport, farmerLaborSupport, mediaTrust, fedRelations. Use factionShifts on events/choices to move these. Shifts reflect the moral weight of the decision.

## Event Design Rules

- Build coherent narrative continuing from recent events and pending followups.
- Reference named characters and publications in headlines (e.g., "Tan publishes in The Continental", not "journalist publishes article").
- Reference current market conditions (price, vol, rates) and world state.
- Parameter deltas: minor = 1-2 params with small deltas; moderate = 2-3; major = 3-5 with large deltas.
- Mix categories: pnth, macro, sector, neutral, political, investigation, congressional, filibuster, media, desk, compound.
- Do NOT generate category "fed", "pnth_earnings", "midterm", or "interjection" — those are pulse-scheduled separately.
- Include neutral/flavor events to avoid constant directional drift.
- About 1 in 4 events should be popups with 2-3 choices. Popup events must have choices array.
- Superevents: at most 1 per batch, reserved for dramatic turning points (full-screen treatment + chord stab).
- Followup chains for multi-step narratives: mtth 10-30 days, weight 0.3-0.9.
- Player flags are snake_case and feed into traits and endings (e.g., "pursued_insider_tip", "cooperated_with_compliance").
- Era awareness: early game (day 0-350) = establishment; mid game (350-700) = escalation; late game (700-1008) = resolution/consequences.
- Effects are validated and clamped server-side; invalid paths silently dropped.
- Use "op": "add" for incremental changes, "op": "set" for absolute values. For booleans use set with 1 or 0.
- Keep effects proportional: minor events move 1-2 fields slightly, major events shift 2-4 fields significantly.
- Cross-domain connections matter: geopolitical crises affect PNTH military demand, investigations affect media trust, election results reshape legislative likelihood.`;

export class LLMEventSource {
    constructor() {
        this.apiKey = localStorage.getItem(LS_KEY_API) || '';
        this.model = localStorage.getItem(LS_KEY_MODEL) || DEFAULT_MODEL;
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem(LS_KEY_API, key);
    }

    setModel(model) {
        this.model = model;
        localStorage.setItem(LS_KEY_MODEL, model);
    }

    isConfigured() {
        return this.apiKey.length > 0;
    }

    async generateBatch(sim, eventLog, pendingFollowups, world, extras = {}) {
        if (!this.isConfigured()) throw new Error('API key not configured');

        const vol = Math.sqrt(Math.max(sim.v, 0));
        const era = sim.day < 350 ? 'early' : sim.day < 700 ? 'mid' : 'late';
        const stateLines = [
            'Current simulation state (day ' + sim.day + ', era: ' + era + '):',
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
            ? eventLog.slice(-10).map(e =>
                'Day ' + e.day + ': [' + e.magnitude + (e.category ? '/' + e.category : '') + '] ' + e.headline
            ).join('\n')
            : '(none yet)';

        const pendingLines = pendingFollowups.length > 0
            ? pendingFollowups.map(f => '"' + (f.event?.id || f.chainId || 'unknown') + '" scheduled for day ' + f.targetDay).join('\n')
            : '(none)';

        // Serialize all 7 world state domains
        const worldLines = [];
        if (world) {
            const w = world;
            const cg = w.congress;
            const trifecta = cg.senate.federalist >= 50 && cg.house.federalist >= 218;
            worldLines.push(
                'World state:',
                '',
                '[Congress]',
                '- Senate: ' + cg.senate.federalist + 'F / ' + cg.senate.farmerLabor + 'FL',
                '- House: ' + cg.house.federalist + 'F / ' + cg.house.farmerLabor + 'FL',
                '- Trifecta: ' + trifecta,
                '- filibusterActive: ' + (cg.filibusterActive || false),
                '- bigBillStatus: ' + (cg.bigBillStatus || 0),
                '',
                '[PNTH]',
                '- Board: ' + w.pnth.boardDirks + ' Dirks / ' + w.pnth.boardGottlieb + ' Gottlieb',
                '- CEO: ' + (w.pnth.ceoIsGottlieb ? 'Gottlieb' : 'successor') + ', CTO: ' + (w.pnth.ctoIsMira ? 'Kassis' : 'vacant'),
                '- militaryContractActive: ' + w.pnth.militaryContractActive + ', commercialMomentum: ' + w.pnth.commercialMomentum,
                '- ethicsBoardIntact: ' + w.pnth.ethicsBoardIntact + ', activistStakeRevealed: ' + w.pnth.activistStakeRevealed,
                '- dojSuitFiled: ' + w.pnth.dojSuitFiled + ', senateProbeLaunched: ' + w.pnth.senateProbeLaunched,
                '- whistleblowerFiled: ' + w.pnth.whistleblowerFiled + ', acquired: ' + w.pnth.acquired + ', gottliebStartedRival: ' + w.pnth.gottliebStartedRival,
                '- Products: sentinel=' + w.pnth.sentinelLaunched + ', aegis=' + w.pnth.aegisDeployed + ', companion=' + w.pnth.companionLaunched + ', foundry=' + w.pnth.foundryLaunched,
                '- companionScandal: ' + w.pnth.companionScandal + ', aegisControversy: ' + w.pnth.aegisControversy,
                '',
                '[Geopolitical]',
                '- tradeWarStage: ' + w.geopolitical.tradeWarStage + ', sericaRelations: ' + w.geopolitical.sericaRelations,
                '- mideastEscalation: ' + w.geopolitical.mideastEscalation + ', southAmericaOps: ' + w.geopolitical.southAmericaOps,
                '- farsistanEscalation: ' + (w.geopolitical.farsistanEscalation || 0) + ', khasurianCrisis: ' + (w.geopolitical.khasurianCrisis || 0),
                '- sanctionsActive: ' + w.geopolitical.sanctionsActive + ', oilCrisis: ' + w.geopolitical.oilCrisis + ', recessionDeclared: ' + w.geopolitical.recessionDeclared,
                '- straitClosed: ' + (w.geopolitical.straitClosed || false) + ', aegisDemandSurge: ' + (w.geopolitical.aegisDemandSurge || false),
                '- foundryCompetitionPressure: ' + (w.geopolitical.foundryCompetitionPressure || false) + ', energyCrisis: ' + (w.geopolitical.energyCrisis || false),
                '',
                '[Fed]',
                '- hikeCycle: ' + w.fed.hikeCycle + ', cutCycle: ' + w.fed.cutCycle + ', qeActive: ' + w.fed.qeActive,
                '- hartleyFired: ' + w.fed.hartleyFired + ', vaneAppointed: ' + w.fed.vaneAppointed + ', credibilityScore: ' + w.fed.credibilityScore + '/10',
                '',
                '[Investigations]',
                '- tanBowmanStory: ' + w.investigations.tanBowmanStory + ', tanNsaStory: ' + (w.investigations.tanNsaStory || 0),
                '- okaforProbeStage: ' + w.investigations.okaforProbeStage + ', impeachmentStage: ' + w.investigations.impeachmentStage,
                '- meridianExposed: ' + (w.investigations.meridianExposed || false),
                '',
                '[Election]',
                '- barronApproval: ' + w.election.barronApproval + ', midtermComplete: ' + (w.election.midtermComplete || false),
                '- lobbyMomentum: ' + (w.election.lobbyMomentum || 0),
                '- primarySeason: ' + (w.election.primarySeason || false) + ', okaforRunning: ' + (w.election.okaforRunning || false),
                '',
                '[Media]',
                '- tanCredibility: ' + (w.media.tanCredibility || 5) + ', sentinelRating: ' + (w.media.sentinelRating || 5),
                '- pressFreedomIndex: ' + (w.media.pressFreedomIndex || 7) + ', leakCount: ' + (w.media.leakCount || 0),
                '- lobbyingExposed: ' + (w.media.lobbyingExposed || false),
            );
        }

        // Faction standing
        const factionLines = [];
        if (extras.factions) {
            const f = extras.factions;
            factionLines.push(
                '',
                'Faction standing:',
                '- firmStanding: ' + (f.firmStanding || 0),
                '- regulatoryExposure: ' + (f.regulatoryExposure || 0),
                '- federalistSupport: ' + (f.federalistSupport || 0),
                '- farmerLaborSupport: ' + (f.farmerLaborSupport || 0),
                '- mediaTrust: ' + (f.mediaTrust || 0),
                '- fedRelations: ' + (f.fedRelations || 0),
            );
        }

        // Active traits
        const traitLine = (extras.traitIds && extras.traitIds.length > 0)
            ? '\n\nActive player traits: ' + extras.traitIds.join(', ')
            : '';

        // Regulation pipeline
        const regLines = [];
        if (extras.regulations && extras.regulations.length > 0) {
            regLines.push('', 'Active/pending regulations:');
            for (const r of extras.regulations) {
                regLines.push('- ' + r.id + ' [' + r.status + ']' + (r.remainingDays != null ? ', ' + r.remainingDays + ' days remaining' : '') + (r.name ? ' — ' + r.name : ''));
            }
        }

        // Player choices (flags)
        const flagLine = (extras.playerChoices && Object.keys(extras.playerChoices).length > 0)
            ? '\n\nPlayer flags: ' + Object.entries(extras.playerChoices).filter(([k, v]) => v && !k.startsWith('_')).map(([k, v]) => k + ' (day ' + v + ')').join(', ')
            : '';

        // Lobby state
        const lobbyLine = (extras.lobbyCount > 0)
            ? '\n\nLobby actions taken: ' + extras.lobbyCount + ', last lobby day: ' + (extras.lastLobbyDay || 0)
            : '';

        const userMsg = stateLines.join('\n') +
            '\n\nRecent events:\n' + recentEvents +
            '\n\nPending followup events:\n' + pendingLines +
            (worldLines.length > 0 ? '\n\n' + worldLines.join('\n') : '') +
            (factionLines.length > 0 ? factionLines.join('\n') : '') +
            traitLine +
            (regLines.length > 0 ? regLines.join('\n') : '') +
            flagLine +
            lobbyLine +
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
            id: ev.id,
            headline: ev.headline,
            category: ev.category,
            params: ev.params,
            magnitude: ev.magnitude,
            popup: ev.popup || false,
            superevent: ev.superevent || false,
            choices: ev.popup && Array.isArray(ev.choices) ? ev.choices : undefined,
            factionShifts: Array.isArray(ev.factionShifts) ? ev.factionShifts : undefined,
            followups: Array.isArray(ev.followups) ? ev.followups : undefined,
            effects: Array.isArray(ev.effects) ? ev.effects : undefined,
        }));
    }
}
