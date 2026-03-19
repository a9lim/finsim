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

// -- Offline event pool (populated in a later task) ---------------------
export const OFFLINE_EVENTS = [];

// -- Event-by-id lookup (built lazily) ----------------------------------
let _eventById = null;
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
