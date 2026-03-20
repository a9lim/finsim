/* ===================================================
   llm.js -- Anthropic API client for dynamic event
   generation in Shoals. Generates batches of narrative
   market events with parameter deltas via structured
   tool use.
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
    description: 'Emit 3-5 narrative market events that shift simulation parameters for Palanthropic (PNTH).',
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

The player trades stock and options in Palanthropic (ticker: PNTH), an up-and-coming AI giant with deep government ties.

### Political landscape
- **President John Barron** (Federalist Party) won an upset against incumbent Robin Clay (Farmer-Labor Party).
- Military hawk — renamed the Department of Defense to "Department of War." Launches airstrikes in the Middle East and "stabilization operations" in South America using PNTH AI targeting systems.
- Pressures Fed Chair Hayden Hartley to cut rates; Hartley publicly rebuffs him, reaffirming Fed independence.

### Palanthropic (PNTH)
- **Chairwoman Andrea Dirks**: close to Vice President Jay Bowman, supports military contracts. Wields board majority.
- **CEO Eugene Gottlieb**: opposes military use of PNTH AI on ethical grounds. Has publicly threatened to resign over offensive military deployments. Frequently clashes with Dirks.
- **VP Jay Bowman**: lobbied Pentagon on PNTH's behalf before taking office. Senate investigation into his PNTH ties is ongoing.
- Key tension: Dirks pushes defense revenue (Pentagon contracts, DHS border analytics), Gottlieb pushes commercial growth (Atlas AI platform, cloud partnerships). The board is split 7-3 in Dirks' favor.
- Ongoing threads: DOJ antitrust suit, ACLU lawsuit over battlefield surveillance, whistleblower complaint about NSA data sharing, ethics board resignations, activist hedge fund demanding sale of commercial division, patent litigation from a rival.

### Fed / Monetary
- **Fed Chair Hayden Hartley** runs FOMC meetings roughly every 32 trading days (~8x/year).
- Hartley is data-driven and independent; resists political pressure from Barron.
- The Fed can hold, hike, or cut rates; announce QE or taper; issue hawkish or dovish minutes.

### Macro / Geopolitical
- Barron imposes tariffs, sanctions oil exporters, signs trade frameworks. Trading partners retaliate.
- Risks: recession, inflation surprises, OPEC supply cuts, sovereign debt crises, ceasefire agreements, military escalation.
- Congress is gridlocked between Federalists and Farmer-Labor holdouts.

### Market Structure
- Flash crashes, short squeezes, repo market seizures, triple witching vol spikes, market maker malfunctions, VIX spikes/collapses, margin call cascades.

## Event Design Rules
- Build a coherent narrative that continues from recent events and pending followups.
- Reference current market conditions (price level, volatility, rates) when relevant.
- Parameter deltas should be realistic: minor events touch 1-2 params with small deltas, major events touch 3-5 params with large deltas.
- Mix PNTH-specific events with macro, Fed, geopolitical, sector, and market structure events.
- Include plenty of neutral/flavor events (quiet trading days, mixed data, no-news days) to avoid constant directional drift.
- Followup chains should create multi-step narratives (e.g., ethics dispute → board meeting → resignation threat → resolution).`;

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

    async generateBatch(sim, eventLog, pendingFollowups) {
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

        const userMsg = stateLines.join('\n') +
            '\n\nRecent events:\n' + recentEvents +
            '\n\nPending followup events:\n' + pendingLines +
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
        }));
    }
}
