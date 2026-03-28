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

const TOOL_DEF = {
    name: 'emit_events',
    description: 'Emit 3-5 narrative market events that shift simulation parameters and optionally mutate world state for Palanthropic (PNTH).',
    input_schema: {
        type: 'object',
        properties: {
            events: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        headline: {
                            type: 'string',
                            description: '1-2 sentence news headline.',
                        },
                        params: {
                            type: 'object',
                            description: 'Parameter name to additive delta value. Minor events: 1-2 params with small deltas. Major events: 3-5 params with large deltas.',
                            properties: PARAM_PROPERTIES,
                            additionalProperties: false,
                        },
                        magnitude: {
                            type: 'string',
                            enum: ['minor', 'moderate', 'major'],
                        },
                        followups: {
                            type: 'array',
                            description: 'Optional chain events.',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string', description: 'Short snake_case identifier.' },
                                    headline: { type: 'string', description: '1-2 sentence followup news headline.' },
                                    params: {
                                        type: 'object',
                                        description: 'Parameter deltas for the followup event.',
                                        properties: PARAM_PROPERTIES,
                                        additionalProperties: false,
                                    },
                                    magnitude: { type: 'string', enum: ['minor', 'moderate', 'major'] },
                                    mtth: { type: 'number', description: 'Mean trading days until followup fires.' },
                                    weight: { type: 'number', description: 'Probability (0-1) the followup fires.' },
                                },
                                required: ['id', 'headline', 'params', 'magnitude', 'mtth', 'weight'],
                                additionalProperties: false,
                            },
                        },
                        effects: {
                            type: 'array',
                            description: 'Optional world state mutations. Each entry is a path + operation.',
                            items: {
                                type: 'object',
                                properties: {
                                    path:  { type: 'string', description: 'Dot-notation path into world state, e.g. "pnth.boardDirks", "election.barronApproval", "fed.credibilityScore"' },
                                    op:    { type: 'string', enum: ['set', 'add'] },
                                    value: { type: 'number' },
                                },
                                required: ['path', 'op', 'value'],
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

const SYSTEM_PROMPT = `You are a financial event generator for "Shoals", an options trading simulator. Use the emit_events tool to return your events.

## Universe

The player trades stock and options in Palanthropic (ticker: PNTH), an up-and-coming AI giant with deep government ties. The simulation spans a presidential term.

### The Administration

- **President John Barron** (Federalist Party) — Populist strongman. Won upset against Robin Clay. Military hawk, tariff enthusiast, Fed-basher. Renamed the Department of Defense to "Department of War." Launches airstrikes in the Middle East and "stabilization operations" in South America using PNTH AI targeting systems. Erratic social media presence. Pressures Fed Chair to cut rates.
- **Vice President Jay Bowman** — Former defense industry lobbyist. The connection between the White House and PNTH. Andrea Dirks's college roommate. Lobbied Pentagon on PNTH's behalf before taking office. Smooth operator in public, increasingly exposed in private. His corruption is an open secret slowly becoming an open scandal, driven by journalist Rachel Tan's reporting.
- **Former President Robin Clay** (Farmer-Labor Party) — Establishment centrist. Lost the election but remains the face of the opposition. Writes memoirs, gives speeches, occasionally re-enters the political fray.

### The Fed

- **Chair Hayden Hartley** — Technocratic, principled, stubborn. Genuinely believes in Fed independence. Barron's attacks on her are personal and public. She doesn't crack, but the institution around her might. Can be fired by Barron if he has a trifecta and her credibility is low.
- **Governor Marcus Vane** — Hartley's hawkish rival on the FOMC. Dissents frequently. Barron quietly backs him as a potential replacement. Creates internal Fed drama.

### Palanthropic (PNTH)

- **Chairwoman Andrea Dirks** — Political operative in a CEO's clothing. VP Bowman's college roommate. Sees PNTH's future as a defense/intelligence monopoly. Charismatic, ruthless, controls the board (initially 7-3 in her favor).
- **CEO Eugene Gottlieb** — Idealistic founder who built the technology and watches it get weaponized. Ethical objections are genuine but he's also protecting his legacy. Frequently clashes with Dirks over military AI deployments.
- **CTO Mira Kassis** — Hired from a major AI lab. Brilliant engineer, politically naive. Caught between Dirks and Gottlieb. Her technical decisions become plot points. Can become whistleblower, Dirks ally, or leave to start a competitor.
- **The Board** — 10 seats. Initially 7 Dirks / 3 Gottlieb. Composition shifts via activist investors, resignations, proxy fights.

### External Players

- **Senator Patricia Okafor** — Chair of Senate Intelligence Committee. Anti-PNTH, anti-Barron platform. Investigations are real but politically motivated. Potential presidential candidate.
- **Liang Wei** — CEO of Zhaowei Technologies, PNTH's main international rival. State-backed Chinese AI giant. Trade war and tech decoupling run through this competition.
- **Rachel Tan** — Investigative journalist at The Continental (paper of record). Breaks the Bowman lobbying story, NSA data-sharing story, and eventually something bigger. Her reporting drives investigation arcs.

## World State

The simulation tracks persistent state that your events can mutate via the "effects" array:

- **Congress** — Senate and House seat counts for Federalist and Farmer-Labor parties. A Federalist trifecta (Senate >= 50 + House >= 218) enables legislation and potentially firing the Fed Chair.
- **PNTH** — Board composition (Dirks vs Gottlieb seats), CEO/CTO status, military contract active, commercial momentum (-2 to +2), ethics board intact, activist stake revealed, DOJ suit, Senate probe, whistleblower, acquisition, Gottlieb rival startup.
- **Geopolitical** — Trade war stage (0=peace, 1=tariffs, 2=retaliation, 3=decoupling, 4=deal), Mideast escalation (0-3), South America ops (0-3), sanctions, oil crisis, recession, China relations (-3 cold war to +3 detente).
- **Fed** — Hike/cut cycle active, QE active, Hartley fired, Vane appointed, credibility score (0-10).
- **Investigations** — Tan's Bowman story stage (0-3), Tan's NSA story stage (0-3), Okafor probe stage (0-3), impeachment stage (0-3).
- **Election** — Midterm complete/result, Barron approval (0-100), primary season, Okafor running.

## Effects Guidance

You can suggest world state mutations via the "effects" array on each event:
- Valid paths use dot-notation into the world state (e.g., "pnth.boardDirks", "election.barronApproval", "fed.credibilityScore").
- Use "op": "add" for incremental changes (e.g., add -1 to boardDirks), "op": "set" for absolute values.
- Only numeric and boolean fields can be mutated. For booleans, use set with value 1 (true) or 0 (false).
- String fields like "midtermResult" cannot be set via effects.
- Keep effects small and proportional to the event magnitude. A minor event should move 1-2 world state fields slightly; a major event can shift 2-4 fields significantly.
- Effects are validated and clamped to valid ranges server-side; invalid paths are silently dropped.

## Event Design Rules

- Build a coherent narrative that continues from recent events and pending followups.
- Reference current market conditions (price level, volatility, rates) AND world state when relevant.
- Parameter deltas should be realistic: minor events touch 1-2 params with small deltas, major events touch 3-5 params with large deltas.
- Mix PNTH-specific events with macro, political, geopolitical, sector, investigation, and neutral events.
- Include neutral/flavor events (quiet trading days, mixed data, no-news days) to avoid constant directional drift.
- Followup chains should create multi-step narratives (e.g., ethics dispute -> board meeting -> resignation threat -> resolution).
- Category should be one of: "pnth", "macro", "sector", "neutral", "political", "investigation", "compound". Do NOT generate "fed" or "pnth_earnings" category events — those are pulse-scheduled separately.
- Use world state effects to advance narrative arcs (investigations progressing, board composition shifting, geopolitical escalation ladders).`;

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

    async generateBatch(sim, eventLog, pendingFollowups, world) {
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
            ? eventLog.slice(-10).map(e => 'Day ' + e.day + ': [' + e.magnitude + '] ' + e.headline).join('\n')
            : '(none yet)';

        const pendingLines = pendingFollowups.length > 0
            ? pendingFollowups.map(f => '"' + (f.event?.id || f.chainId || 'unknown') + '" scheduled for day ' + f.targetDay).join('\n')
            : '(none)';

        // Serialize world state for the LLM
        const worldLines = [];
        if (world) {
            const w = world;
            const cg = w.congress;
            worldLines.push(
                'World state:',
                '- Congress: Senate ' + cg.senate.federalist + 'F/' + cg.senate.farmerLabor + 'FL, House ' + cg.house.federalist + 'F/' + cg.house.farmerLabor + 'FL',
                '- PNTH board: ' + w.pnth.boardDirks + ' Dirks / ' + w.pnth.boardGottlieb + ' Gottlieb' +
                    ', CEO: ' + (w.pnth.ceoIsGottlieb ? 'Gottlieb' : 'successor') +
                    ', CTO: ' + (w.pnth.ctoIsMira ? 'Kassis' : 'vacant'),
                '- Military contract: ' + w.pnth.militaryContractActive + ', Commercial momentum: ' + w.pnth.commercialMomentum,
                '- Trade war stage: ' + w.geopolitical.tradeWarStage + ', Serica relations: ' + w.geopolitical.sericaRelations,
                '- Mideast escalation: ' + w.geopolitical.mideastEscalation + ', South America: ' + w.geopolitical.southAmericaOps,
                '- Oil crisis: ' + w.geopolitical.oilCrisis + ', Recession: ' + w.geopolitical.recessionDeclared,
                '- Fed: credibility ' + w.fed.credibilityScore + '/10, Hartley fired: ' + w.fed.hartleyFired + ', Vane appointed: ' + w.fed.vaneAppointed,
                '- Investigations: Tan story stage ' + w.investigations.tanBowmanStory + ', Okafor probe ' + w.investigations.okaforProbeStage + ', Impeachment ' + w.investigations.impeachmentStage,
                '- Barron approval: ' + w.election.barronApproval + ', Midterm: ' + (w.election.midtermComplete ? w.election.midtermResult : 'pending'),
            );
        }

        const userMsg = stateLines.join('\n') +
            '\n\nRecent events:\n' + recentEvents +
            '\n\nPending followup events:\n' + pendingLines +
            (worldLines.length > 0 ? '\n\n' + worldLines.join('\n') : '') +
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
                max_tokens: 1024,
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
            headline: ev.headline,
            params: ev.params,
            magnitude: ev.magnitude,
            followups: Array.isArray(ev.followups) ? ev.followups : undefined,
            effects: Array.isArray(ev.effects) ? ev.effects : undefined,
        }));
    }
}
