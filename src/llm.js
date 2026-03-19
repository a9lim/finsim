/* ===================================================
   llm.js -- Anthropic API client for dynamic event
   generation in Shoals. Generates batches of narrative
   market events with parameter deltas.
   =================================================== */

import { PARAM_RANGES } from './events.js';

const LS_KEY_API  = 'shoals_llm_key';
const LS_KEY_MODEL = 'shoals_llm_model';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = 'You are a financial event generator for a trading simulator. The simulated company is Palanthropic (ticker: PNTH), a tech company with government defense contracts. PNTH has close ties to the Vice President but frequently clashes with the government over ethical use of its surveillance technology.\n\nGenerate realistic market events that shift simulation parameters. Each event must be a JSON object with:\n- "headline": string (1-2 sentence news headline)\n- "params": object mapping parameter names to DELTA values (additive changes, not absolute). Valid keys and ranges:\n'
    + Object.entries(PARAM_RANGES).map(([k, r]) => '  ' + k + ': [' + r.min + ', ' + r.max + '] (delta should be a fraction of this range)').join('\n')
    + '\n- "magnitude": "minor" | "moderate" | "major"\n- "followups": optional array of {id, mtth, weight} for chain events. id is a short snake_case identifier. mtth is mean trading days until followup. weight is probability (0-1) it fires.\n\nRules:\n- Return a JSON array of 3-5 events\n- Build a coherent narrative across events\n- Events should reference current market conditions and past events\n- Parameter deltas should be realistic: minor events touch 1-2 params with small deltas, major events touch 3-5 params with large deltas\n- Mix company-specific (PNTH) events with macro/market events\n- Do NOT include any text outside the JSON array';

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
              ', sigmaR=' + sim.sigmaR.toFixed(4),
        ];

        const recentEvents = eventLog.length > 0
            ? eventLog.slice(-10).map(e => 'Day ' + e.day + ': [' + e.magnitude + '] ' + e.headline).join('\n')
            : '(none yet)';

        const pendingLines = pendingFollowups.length > 0
            ? pendingFollowups.map(f => '"' + f.id + '" scheduled for day ' + f.targetDay).join('\n')
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
                messages: [{ role: 'user', content: userMsg }],
            }),
        });

        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error('API ' + resp.status + ': ' + body.slice(0, 200));
        }

        const data = await resp.json();
        const text = data.content && data.content[0] && data.content[0].text || '';

        // Parse JSON from response (may be wrapped in markdown code fences)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array in response');

        const events = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(events)) throw new Error('Response is not an array');

        // Validate and sanitize
        return events
            .filter(ev => ev && typeof ev.headline === 'string' && ev.params && typeof ev.params === 'object')
            .map(ev => ({
                headline: ev.headline,
                params: ev.params,
                magnitude: ['minor', 'moderate', 'major'].includes(ev.magnitude) ? ev.magnitude : 'moderate',
                followups: Array.isArray(ev.followups) ? ev.followups : undefined,
            }));
    }
}
