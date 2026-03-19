/* ===================================================
   events.js -- Dynamic event engine for Shoals.
   Poisson-scheduled events that shift simulation
   parameters. Supports offline (curated) and LLM
   event sources, with MTTH-style followup chains.
   =================================================== */

// -- Canonical parameter clamping ranges --------------------------------
export const PARAM_RANGES = {
    mu:     { min: -0.50, max: 0.50 },
    theta:  { min: 0.005, max: 1.00 },
    kappa:  { min: 0.05,  max: 10.0 },
    xi:     { min: 0.05,  max: 1.50 },
    rho:    { min: -0.99, max: 0.50 },
    lambda: { min: 0.0,   max: 15.0 },
    muJ:    { min: -0.25, max: 0.15 },
    sigmaJ: { min: 0.005, max: 0.25 },
    a:      { min: 0.01,  max: 2.0 },
    b:      { min: -0.05, max: 0.20 },
    sigmaR: { min: 0.001, max: 0.050 },
};

const MAX_LOG = 20;
const MAX_CHAIN_DEPTH = 5;

// -- Offline event pool -------------------------------------------------
export const OFFLINE_EVENTS = [

    // ================================================================
    // FED / MONETARY (~10)
    // ================================================================
    {
        id: 'fed_signals_hike_cycle',
        headline: 'Fed chair signals rate hike cycle beginning; inflation remains elevated',
        params: { mu: -0.03, theta: 0.015, b: 0.01 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.15,
        followups: [
            { id: 'fed_hikes_25bps', mtth: 20, weight: 0.75 },
        ],
    },
    {
        id: 'fed_hikes_25bps',
        headline: 'Fed raises benchmark rate 25bps; "further increases appropriate"',
        params: { mu: -0.02, b: 0.0075, theta: 0.008 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.15,
        followups: [
            { id: 'fed_hikes_again_25bps', mtth: 40, weight: 0.55 },
            { id: 'housing_stress_fed_pauses', mtth: 30, weight: 0.40 },
        ],
    },
    {
        id: 'fed_hikes_again_25bps',
        headline: 'Fed delivers second consecutive 25bps hike; labor market still tight',
        params: { mu: -0.02, b: 0.0075, lambda: 0.4 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.15,
    },
    {
        id: 'housing_stress_fed_pauses',
        headline: 'Housing starts collapse; Fed signals pause as credit conditions tighten',
        params: { mu: -0.02, theta: 0.01, lambda: 0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'fed_signals_cut_cycle',
        headline: 'Fed pivots dovish; chair cites softening labor market and falling inflation',
        params: { mu: 0.04, theta: -0.01, b: -0.008 },
        magnitude: 'moderate',
        when: (sim) => sim.b > -0.03,
        followups: [
            { id: 'fed_cuts_50bps_emergency', mtth: 25, weight: 0.45 },
        ],
    },
    {
        id: 'fed_cuts_50bps_emergency',
        headline: 'Fed delivers surprise 50bps cut in inter-meeting action; recession fears spike',
        params: { mu: 0.05, theta: 0.02, b: -0.015, lambda: 1.5 },
        magnitude: 'major',
        when: (sim) => sim.b > -0.03,
    },
    {
        id: 'fed_qe_restart',
        headline: 'Fed announces $80B/month asset purchase program to support credit markets',
        params: { mu: 0.06, theta: -0.015, b: -0.01, xi: -0.05 },
        magnitude: 'major',
    },
    {
        id: 'fed_hawkish_minutes',
        headline: 'FOMC minutes show unanimous support for "higher for longer" stance',
        params: { mu: -0.02, theta: 0.008, b: 0.005 },
        magnitude: 'minor',
        when: (sim) => sim.b < 0.12,
    },
    {
        id: 'fed_reverse_repo_spike',
        headline: 'Fed reverse repo usage hits $2.5T; excess liquidity drains from money markets',
        params: { mu: -0.01, theta: 0.005, sigmaR: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'fed_new_chair_dovish',
        headline: 'Senate confirms new Fed chair widely seen as more accommodative than predecessor',
        params: { mu: 0.03, theta: -0.01, b: -0.005 },
        magnitude: 'moderate',
    },

    // ================================================================
    // MACRO / GEOPOLITICAL (~10)
    // ================================================================
    {
        id: 'tariff_escalation',
        headline: 'Administration announces 25% tariff on $300B of imported goods; retaliation expected',
        params: { mu: -0.05, theta: 0.02, lambda: 1.0, muJ: -0.02 },
        magnitude: 'major',
        followups: [
            { id: 'trade_partner_retaliates', mtth: 15, weight: 0.70 },
        ],
    },
    {
        id: 'trade_partner_retaliates',
        headline: 'Major trading partner imposes counter-tariffs on agricultural exports and tech goods',
        params: { mu: -0.03, theta: 0.015, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'trade_deal_signed',
        headline: 'US and trading bloc sign framework trade agreement; tariffs to be phased out',
        params: { mu: 0.04, theta: -0.01, lambda: -0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'sanctions_energy_sector',
        headline: 'Sweeping sanctions against major oil exporter; energy prices surge globally',
        params: { mu: -0.04, theta: 0.025, lambda: 1.2, muJ: -0.03 },
        magnitude: 'major',
    },
    {
        id: 'recession_confirmed',
        headline: 'GDP contracts for second consecutive quarter; recession officially declared',
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, b: -0.01 },
        magnitude: 'major',
    },
    {
        id: 'cpi_surprise_high',
        headline: 'CPI comes in at 7.2% YoY -- well above consensus of 5.8%; rate hike bets surge',
        params: { mu: -0.03, theta: 0.012, b: 0.008 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.14,
    },
    {
        id: 'cpi_surprise_low',
        headline: 'Inflation cools sharply to 2.1%; rate cut bets jump, bonds rally',
        params: { mu: 0.03, theta: -0.008, b: -0.006 },
        magnitude: 'moderate',
        when: (sim) => sim.b > 0.00,
    },
    {
        id: 'oil_shock_supply',
        headline: 'Surprise OPEC+ supply cut of 1.5M barrels/day; crude rallies 8%',
        params: { mu: -0.03, theta: 0.018, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'geopolitical_ceasefire',
        headline: 'Ceasefire agreement reached in major conflict zone; risk assets rally globally',
        params: { mu: 0.04, theta: -0.012, lambda: -0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'sovereign_debt_crisis',
        headline: 'Mid-tier sovereign unable to refinance debt; contagion fears spread to EM',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, sigmaR: 0.008 },
        magnitude: 'major',
    },

    // ================================================================
    // SECTOR / TECH (~8)
    // ================================================================
    {
        id: 'ai_regulation_bill',
        headline: 'Congress passes sweeping AI regulation bill requiring model audits and liability',
        params: { mu: -0.04, theta: 0.015, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'antitrust_big_tech',
        headline: 'DOJ files landmark antitrust suit against two largest cloud providers',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'semiconductor_shortage',
        headline: 'Leading-edge chip shortage intensifies; lead times extend to 52 weeks',
        params: { mu: -0.02, theta: 0.01, lambda: 0.5 },
        magnitude: 'minor',
    },
    {
        id: 'semiconductor_glut',
        headline: 'Chip inventory correction deepens; major fab cuts production outlook by 30%',
        params: { mu: -0.02, theta: 0.008, lambda: 0.4 },
        magnitude: 'minor',
    },
    {
        id: 'mega_data_breach',
        headline: '500M user records exposed in breach at major social platform; FTC probe launched',
        params: { mu: -0.03, theta: 0.012, lambda: 0.7 },
        magnitude: 'moderate',
    },
    {
        id: 'tech_ipo_frenzy',
        headline: 'Wave of high-profile tech IPOs oversubscribed 20x; risk appetite surges',
        params: { mu: 0.03, theta: -0.008, xi: 0.05 },
        magnitude: 'minor',
    },
    {
        id: 'cloud_spending_boom',
        headline: 'Enterprise cloud spending grows 45% YoY; hyperscalers raise full-year guidance',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3 },
        magnitude: 'minor',
    },
    {
        id: 'cybersecurity_attack_infrastructure',
        headline: 'Nation-state cyberattack disrupts critical infrastructure; markets reprice tail risk',
        params: { mu: -0.04, theta: 0.02, lambda: 1.0, muJ: -0.02 },
        magnitude: 'moderate',
    },

    // ================================================================
    // PNTH COMPANY (~18)
    // ================================================================
    {
        id: 'pnth_doj_backdoor_refusal',
        headline: 'PNTH refuses DOJ request to embed surveillance backdoor in government analytics platform',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
        followups: [
            { id: 'pnth_ag_threatens_review', mtth: 15, weight: 0.80 },
        ],
    },
    {
        id: 'pnth_ag_threatens_review',
        headline: 'Attorney General threatens review of all PNTH federal contracts over compliance concerns',
        params: { mu: -0.04, theta: 0.015, lambda: 0.8 },
        magnitude: 'moderate',
        followups: [
            { id: 'pnth_doj_antitrust_suit', mtth: 40, weight: 0.50 },
            { id: 'pnth_vp_intervenes', mtth: 20, weight: 0.60 },
        ],
    },
    {
        id: 'pnth_doj_antitrust_suit',
        headline: 'DOJ files antitrust suit against PNTH alleging monopolization of federal data analytics',
        params: { mu: -0.07, theta: 0.03, lambda: 1.5, muJ: -0.04 },
        magnitude: 'major',
    },
    {
        id: 'pnth_vp_intervenes',
        headline: 'VP publicly backs PNTH, calls DOJ review "politically motivated"; shares rebound',
        params: { mu: 0.05, theta: -0.012, lambda: -0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_defense_contract_2b',
        headline: 'PNTH awarded $2B Pentagon contract for battlefield AI intelligence platform',
        params: { mu: 0.06, theta: -0.012, lambda: -0.4 },
        magnitude: 'major',
        followups: [
            { id: 'pnth_aclu_lawsuit', mtth: 20, weight: 0.50 },
        ],
    },
    {
        id: 'pnth_aclu_lawsuit',
        headline: 'ACLU sues to block PNTH battlefield surveillance contract over civil liberties concerns',
        params: { mu: -0.03, theta: 0.010, lambda: 0.5 },
        magnitude: 'moderate',
        followups: [
            { id: 'pnth_patent_suit', mtth: 10, weight: 0.60 },
        ],
    },
    {
        id: 'pnth_patent_suit',
        headline: 'Rival files patent suit claiming PNTH core algorithm infringes 3 key patents',
        params: { mu: -0.02, theta: 0.008, lambda: 0.4 },
        magnitude: 'minor',
        followups: [
            { id: 'pnth_senate_investigation', mtth: 40, weight: 0.30 },
        ],
    },
    {
        id: 'pnth_senate_investigation',
        headline: 'Senate Judiciary Committee opens investigation into PNTH government contracting practices',
        params: { mu: -0.05, theta: 0.02, lambda: 1.0 },
        magnitude: 'major',
    },
    {
        id: 'pnth_earnings_beat',
        headline: 'PNTH Q3 earnings beat by 18%; government revenue up 42% YoY, guidance raised',
        params: { mu: 0.05, theta: -0.010, lambda: -0.4 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_earnings_miss',
        headline: 'PNTH misses Q2 estimates; commercial segment drags, government contracts delayed',
        params: { mu: -0.05, theta: 0.018, lambda: 0.8, muJ: -0.02 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_ceo_departs',
        headline: 'PNTH CEO resigns citing "irreconcilable differences" with board over ethics policy',
        params: { mu: -0.04, theta: 0.015, lambda: 0.9, muJ: -0.02 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_ethics_board_revolt',
        headline: 'Three PNTH ethics board members resign in protest over classified contract scope',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_whistleblower',
        headline: 'Former PNTH engineer files whistleblower complaint over undisclosed data sharing with NSA',
        params: { mu: -0.06, theta: 0.025, lambda: 1.2, muJ: -0.03 },
        magnitude: 'major',
    },
    {
        id: 'pnth_product_launch_atlas',
        headline: 'PNTH launches Atlas AI platform for commercial enterprises; $500M pipeline announced',
        params: { mu: 0.04, theta: -0.008, lambda: -0.3 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_congressional_hearing',
        headline: 'PNTH executives testify before House Intelligence Committee on government data practices',
        params: { mu: -0.02, theta: 0.010, lambda: 0.5 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_contract_renewal',
        headline: 'DHS renews multi-year PNTH contract, expanding scope to border analytics systems',
        params: { mu: 0.03, theta: -0.006, lambda: -0.2 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_contract_cancelled',
        headline: 'Army cancels $400M PNTH contract following cybersecurity audit findings',
        params: { mu: -0.05, theta: 0.018, lambda: 0.9, muJ: -0.025 },
        magnitude: 'major',
    },
    {
        id: 'pnth_activist_stake',
        headline: 'Activist hedge fund discloses 8% stake in PNTH, demands sale of commercial division',
        params: { mu: 0.04, theta: 0.008, lambda: 0.5 },
        magnitude: 'moderate',
    },

    // ================================================================
    // MARKET STRUCTURE (~8)
    // ================================================================
    {
        id: 'flash_crash',
        headline: 'Flash crash: Dow drops 1800 points in 9 minutes before partial recovery; cause unknown',
        params: { mu: -0.04, theta: 0.04, lambda: 3.0, muJ: -0.06, xi: 0.15 },
        magnitude: 'major',
    },
    {
        id: 'short_squeeze_meme',
        headline: 'Coordinated retail buying triggers short squeeze; short interest in several names exceeds 150%',
        params: { mu: 0.05, theta: 0.03, lambda: 2.0, xi: 0.12 },
        magnitude: 'major',
    },
    {
        id: 'liquidity_crisis_repo',
        headline: 'Overnight repo market seizes; Fed injects $200B in emergency liquidity',
        params: { mu: -0.05, theta: 0.035, lambda: 2.0, muJ: -0.04, sigmaR: 0.012 },
        magnitude: 'major',
    },
    {
        id: 'options_expiry_vol_spike',
        headline: 'Triple witching exacerbated by record open interest; intraday vol spikes 40%',
        params: { theta: 0.02, lambda: 1.0, xi: 0.08 },
        magnitude: 'moderate',
    },
    {
        id: 'algo_glitch_erroneous_orders',
        headline: 'Major market maker algo malfunction floods exchange with erroneous orders; trading halted 18 minutes',
        params: { mu: -0.02, theta: 0.02, lambda: 1.5, muJ: -0.02 },
        magnitude: 'moderate',
    },
    {
        id: 'vix_spike_contagion',
        headline: 'VIX spikes to 45 on global risk-off; leveraged vol ETPs face liquidation cascade',
        params: { mu: -0.06, theta: 0.05, lambda: 2.5, xi: 0.18, rho: -0.08 },
        magnitude: 'major',
    },
    {
        id: 'margin_call_cascade',
        headline: 'Prime broker issues wave of margin calls after leveraged fund losses; forced selling across sectors',
        params: { mu: -0.04, theta: 0.025, lambda: 1.5, muJ: -0.03 },
        magnitude: 'major',
    },
    {
        id: 'low_vol_grind',
        headline: 'VIX falls to multi-year low of 11; options sellers dominate as complacency sets in',
        params: { theta: -0.015, lambda: -0.8, xi: -0.08 },
        magnitude: 'minor',
    },
];

// -- Event-by-id lookup (built lazily) ----------------------------------
let _eventById = null;
_eventById = null; // reset cache after array definition
function _getEventById(id) {
    if (!_eventById) {
        _eventById = new Map();
        for (const ev of OFFLINE_EVENTS) _eventById.set(ev.id, ev);
    }
    return _eventById.get(id) || null;
}

// -- EventEngine --------------------------------------------------------
export class EventEngine {
    constructor(source, llmSource = null) {
        this.source = source;           // 'offline' | 'llm'
        this._llm = llmSource;          // LLMEventSource instance (or null)
        this.eventLog = [];             // { day, headline, magnitude, params }
        this._queue = [];               // pre-fetched LLM events
        this._pendingFollowups = [];    // { id, targetDay, weight, depth }
        this._poissonRate = 0.05;       // ~1 event per 20 trading days
        this._prefetching = false;
    }

    /**
     * Called each completed trading day. May fire an event.
     * Returns the event object (for toast) or null.
     */
    maybeFire(sim, day) {
        // 1. Check pending followups first
        const firedFollowup = this._checkFollowups(sim, day);
        if (firedFollowup) return firedFollowup;

        // 2. Poisson draw for random event
        if (Math.random() >= this._poissonRate) return null;

        // 3. Draw from appropriate source
        const event = this.source === 'llm'
            ? this._drawLLM(sim)
            : this._drawOffline(sim);

        if (!event) return null;
        return this._fireEvent(event, sim, day, 0);
    }

    /** Kick off initial LLM batch fetch. */
    prefetch(sim) {
        if (this.source !== 'llm' || !this._llm) return;
        this._fetchBatch(sim);
    }

    /** Apply param deltas to sim, clamp to PARAM_RANGES. */
    applyDeltas(sim, params) {
        if (!params) return;
        for (const [key, delta] of Object.entries(params)) {
            const range = PARAM_RANGES[key];
            if (!range) continue;
            sim[key] = Math.min(range.max, Math.max(range.min, sim[key] + delta));
        }
    }

    /** Clear all state. */
    reset() {
        this.eventLog = [];
        this._queue = [];
        this._pendingFollowups = [];
        this._prefetching = false;
    }

    // -- Internal ---------------------------------------------------------

    _fireEvent(event, sim, day, depth) {
        this.applyDeltas(sim, event.params);

        const logEntry = {
            day,
            headline: event.headline,
            magnitude: event.magnitude || 'moderate',
            params: event.params || {},
        };
        this.eventLog.push(logEntry);
        if (this.eventLog.length > MAX_LOG) this.eventLog.shift();

        // Schedule followups (if any and within depth limit)
        if (event.followups && depth < MAX_CHAIN_DEPTH) {
            for (const fu of event.followups) {
                const delay = this._poissonSample(fu.mtth);
                this._pendingFollowups.push({
                    id: fu.id,
                    targetDay: day + Math.max(1, delay),
                    weight: fu.weight,
                    depth: depth + 1,
                });
            }
        }

        return logEntry;
    }

    _checkFollowups(sim, day) {
        const ready = [];
        const remaining = [];
        for (const pf of this._pendingFollowups) {
            if (pf.targetDay <= day) ready.push(pf);
            else remaining.push(pf);
        }
        this._pendingFollowups = remaining;

        // Process ALL ready followups (multiple can fire on the same day)
        let lastFired = null;
        for (const pf of ready) {
            // Weight roll
            if (Math.random() > pf.weight) continue;

            const event = _getEventById(pf.id);
            if (!event) continue;

            // Check precondition
            if (event.when && !event.when(sim)) continue;

            lastFired = this._fireEvent(event, sim, day, pf.depth);
        }
        return lastFired;
    }

    _drawOffline(sim) {
        const eligible = OFFLINE_EVENTS.filter(ev => !ev.when || ev.when(sim));
        if (eligible.length === 0) return null;
        return eligible[Math.floor(Math.random() * eligible.length)];
    }

    _drawLLM(sim) {
        if (this._queue.length > 0) return this._queue.shift();

        // Queue empty -- trigger fetch, return offline fallback
        if (!this._prefetching) this._fetchBatch(sim);
        return this._drawOffline(sim);
    }

    async _fetchBatch(sim) {
        if (!this._llm || this._prefetching) return;
        this._prefetching = true;
        try {
            const events = await this._llm.generateBatch(
                sim, this.eventLog, this._pendingFollowups
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

    _poissonSample(mean) {
        if (mean <= 0) return 0;
        const L = Math.exp(-mean);
        let k = 0, p = 1;
        do { k++; p *= Math.random(); } while (p > L);
        return k - 1;
    }
}
