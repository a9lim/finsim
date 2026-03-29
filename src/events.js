/* ===================================================
   events.js -- Dynamic event engine for Shoals.
   Pulse-scheduled and Poisson-drawn events that shift
   simulation parameters and mutate world state.
   Supports offline (curated) and LLM event sources,
   with MTTH-style followup chains.
   =================================================== */

import {
    MAX_EVENT_LOG, MAX_FOLLOWUP_DEPTH, FED_MEETING_INTERVAL,
    MIDTERM_DAY, CAMPAIGN_START_DAY, NON_FED_POISSON_RATE,
    NON_FED_COOLDOWN_MIN, NON_FED_COOLDOWN_MAX, FED_MEETING_JITTER,
    BOREDOM_THRESHOLD, TERM_END_DAY,
    PNTH_EARNINGS_INTERVAL, PNTH_EARNINGS_JITTER,
    ADV, EVENT_COUPLING_CAP, HISTORY_CAPACITY,
} from './config.js';

import { createWorldState, congressHelpers, applyStructuredEffects } from './world-state.js';
import { ALL_EVENTS, PARAM_RANGES, getEventById } from './events/index.js';
import { getTraitEffect, getActiveTraitIds } from './traits.js';
import { firmCooldownMult } from './faction-standing.js';

// -- Re-export for backwards compat -------------------------------------
export { PARAM_RANGES } from './events/index.js';

const MAX_LOG = MAX_EVENT_LOG;
const MAX_CHAIN_DEPTH = MAX_FOLLOWUP_DEPTH;

// -- Pulse-excluded categories (not drawn by Poisson random) ------------
const _PULSE_CATEGORIES = new Set(['fed', 'pnth_earnings', 'midterm', 'interjection']);

// -- EventEngine --------------------------------------------------------
export class EventEngine {
    constructor(source, llmSource = null) {
        this.source = source;           // 'offline' | 'llm'
        this._llm = llmSource;          // LLMEventSource instance (or null)
        this.eventLog = [];             // { day, headline, magnitude, params }
        this._queue = [];               // pre-fetched LLM events
        this._pendingFollowups = [];    // { event, chainId, targetDay, weight, depth }
        this._prefetching = false;

        // World state
        this.world = createWorldState();

        // Boredom tracking
        this._consecutiveMinor = 0;

        // Random event cooldown
        this._randomCooldown = 0;

        // Epilogue
        this._epilogueFired = false;

        // Player context for enriched guard signatures
        this._playerCtx = { playerChoices: {}, factions: {}, activeRegIds: [], traitIds: [], portfolio: {} };
        this._firedOneShot = new Set();

        // Pre-filter pools from ALL_EVENTS (exclude followupOnly events)
        this._pools = {
            fed:            ALL_EVENTS.filter(e => e.category === 'fed' && !e.followupOnly),
            pnth_earnings:  ALL_EVENTS.filter(e => e.category === 'pnth_earnings' && !e.followupOnly),
            random:         ALL_EVENTS.filter(e => !_PULSE_CATEGORIES.has(e.category) && !e.followupOnly),
            filibuster:     ALL_EVENTS.filter(e => e.category === 'filibuster' && !e.followupOnly),
            media:          ALL_EVENTS.filter(e => e.category === 'media' && !e.followupOnly),
            interjection:   ALL_EVENTS.filter(e => e.category === 'interjection' && !e.followupOnly),
        };

        // Portfolio-triggered event pool (evaluated daily, not Poisson-drawn)
        this._triggerPool = ALL_EVENTS.filter(e => typeof e.trigger === 'function');
        this._triggerCooldowns = {};

        // Pulse schedule
        this._pulses = [
            { type: 'recurring', id: 'fomc',           interval: FED_MEETING_INTERVAL,    jitter: FED_MEETING_JITTER,    nextDay: -1, poolKey: 'fed' },
            { type: 'recurring', id: 'pnth_earnings',  interval: PNTH_EARNINGS_INTERVAL,  jitter: PNTH_EARNINGS_JITTER,  nextDay: -1, poolKey: 'pnth_earnings' },
            { type: 'recurring', id: 'filibuster_check', interval: 7,  jitter: 2, nextDay: -1, poolKey: 'filibuster' },
            { type: 'recurring', id: 'media_cycle',      interval: 21, jitter: 5, nextDay: -1, poolKey: 'media' },
            { type: 'recurring', id: 'interjection',     interval: 50, jitter: 15, nextDay: -1, poolKey: 'interjection' },
            { type: 'fixed',     id: 'campaign_season', day: CAMPAIGN_START_DAY, fired: false, handler: '_onCampaignSeason' },
            { type: 'fixed',     id: 'midterm',         day: MIDTERM_DAY,        fired: false, handler: '_onMidterm' },
        ];
    }

    /**
     * Called each completed trading day. May fire event(s).
     * Returns { fired: [...logEntries], popups: [...queuedEvents] }.
     */
    maybeFire(sim, day, netDelta = 0) {
        this._currentDay = day;
        const empty = { fired: [], popups: [] };

        // Epilogue already fired -- no more events
        if (this._epilogueFired) return empty;

        // Helper: partition _fireEvent results into fired/popups
        const _partition = (results) => {
            const fired = [], popups = [];
            for (const r of results) {
                if (r && r.queued) popups.push(r.event);
                else if (r) fired.push(r);
            }
            return { fired, popups };
        };

        // Deterministic pre-pass: fire eligible one-shot events
        const oneShotCandidates = this._pools.random.filter(ev =>
            ev.oneShot && !this._firedOneShot.has(ev.id)
        );
        if (oneShotCandidates.length > 0) {
            const eligible = this._filterEligible(oneShotCandidates, sim);
            if (eligible.length > 0) {
                this._firedOneShot.add(eligible[0].id);
                return _partition([this._fireEvent(eligible[0], sim, day, 0, netDelta)]);
            }
        }

        // 1. Check pulses in array order
        for (const pulse of this._pulses) {
            if (pulse.type === 'recurring') {
                // Initialize nextDay on first call
                if (pulse.nextDay < 0) {
                    pulse.nextDay = day + pulse.interval + this._jitterRoll(pulse.jitter);
                }
                if (day >= pulse.nextDay) {
                    // Reschedule regardless of whether we find an event
                    pulse.nextDay = day + pulse.interval + this._jitterRoll(pulse.jitter);
                    const eligible = this._filterEligible(this._pools[pulse.poolKey], sim);
                    if (eligible.length > 0) {
                        const event = this._weightedPick(eligible, sim);
                        return _partition([this._fireEvent(event, sim, day, 0, netDelta)]);
                    }
                    // No eligible event -- skip, already rescheduled
                }
            } else if (pulse.type === 'fixed') {
                if (day >= pulse.day && !pulse.fired) {
                    pulse.fired = true;
                    return _partition(this[pulse.handler](sim, day, netDelta));
                }
            }
        }

        // 2. Check pending followups
        const firedFollowups = this._checkFollowups(sim, day, netDelta);
        if (firedFollowups.length > 0) return _partition(firedFollowups);

        // 3. Random draw with cooldown
        if (this._randomCooldown > 0) {
            this._randomCooldown--;
            return empty;
        }

        if (Math.random() >= NON_FED_POISSON_RATE) return empty;

        // 4. Draw from appropriate source
        const event = this.source === 'llm'
            ? this._drawLLM(sim)
            : this._drawRandom(sim);

        if (!event) return empty;

        // Set cooldown after successful random draw
        this._randomCooldown = NON_FED_COOLDOWN_MIN +
            Math.floor(Math.random() * (NON_FED_COOLDOWN_MAX - NON_FED_COOLDOWN_MIN + 1));

        return _partition([this._fireEvent(event, sim, day, 0, netDelta)]);
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
            if (!range) {
                console.warn(`[EventEngine] applyDeltas: unknown param "${key}" (no PARAM_RANGES entry)`);
                continue;
            }
            sim[key] = Math.min(range.max, Math.max(range.min, sim[key] + delta));
        }
        if (params.rho !== undefined) sim._recomputeRhoDerived();
    }

    /** True when the presidential term has ended and epilogue hasn't fired. */
    isEpilogueReady(day) {
        return day >= TERM_END_DAY && !this._epilogueFired;
    }

    /** Compute the final election outcome. Sets _epilogueFired. */
    computeElectionOutcome(sim) {
        const w = this.world;
        let score = w.election.barronApproval;

        if (w.geopolitical.recessionDeclared)      score -= 12;
        if (w.geopolitical.mideastEscalation >= 2) score -= 8;
        if (w.geopolitical.southAmericaOps >= 2)   score -= 5;
        if (w.investigations.impeachmentStage >= 2) score -= 18;
        if (w.fed.hartleyFired)                    score -= 6;
        if (w.geopolitical.tradeWarStage === 4)    score += 6;
        if (w.geopolitical.oilCrisis)              score -= 5;

        // New geopolitical/media scoring factors
        if (w.geopolitical.khasurianCrisis >= 3) score -= 6;
        if (w.geopolitical.straitClosed) score -= 8;
        if (w.congress.bigBillStatus === 3) score += 5;
        if (w.congress.bigBillStatus === 4) score -= 4;
        if (w.media.pressFreedomIndex <= 3) score -= 3;
        if (w.media.sentinelRating >= 8) score += 2;
        if (w.media.tanCredibility >= 8) score -= 3;

        // Noise: +-5
        score += (Math.random() - 0.5) * 10;

        let presidentialResult;
        if (w.investigations.impeachmentStage >= 3) {
            presidentialResult = 'barron_removed';
        } else if (score > 50) {
            presidentialResult = 'barron_wins_comfortably';
        } else if (score > 45) {
            presidentialResult = 'barron_wins_narrowly';
        } else if (score > 38 && w.election.okaforRunning) {
            presidentialResult = 'okafor_wins';
        } else if (score > 38) {
            presidentialResult = 'fl_wins';
        } else if (w.election.okaforRunning) {
            presidentialResult = 'okafor_wins_decisively';
        } else {
            presidentialResult = 'fl_wins_decisively';
        }

        w.election.presidentialResult = presidentialResult;
        this._epilogueFired = true;

        return { score, presidentialResult };
    }

    /** Clear all state. */
    reset() {
        this.world = createWorldState();
        this.eventLog = [];
        this._queue = [];
        this._pendingFollowups = [];
        this._prefetching = false;
        this._randomCooldown = 0;
        this._consecutiveMinor = 0;
        this._epilogueFired = false;
        this._playerCtx = { playerChoices: {}, factions: {}, activeRegIds: [], traitIds: [], portfolio: {} };
        this._firedOneShot.clear();
        this._triggerCooldowns = {};

        // Reset all pulse states
        for (const pulse of this._pulses) {
            if (pulse.type === 'recurring') {
                pulse.nextDay = -1;
            } else if (pulse.type === 'fixed') {
                pulse.fired = false;
            }
        }
    }

    /** Update player context passed to event guards. */
    setPlayerContext(playerChoices, factions, activeRegIds, traitIds = [], portfolioMetrics = {}) {
        this._playerCtx = { playerChoices, factions, activeRegIds, traitIds, portfolio: portfolioMetrics };
    }

    /** Clear fired one-shot tracking (call on reset). */
    resetOneShot() {
        this._firedOneShot.clear();
    }

    /** Return ids of all one-shot events that have fired this game. */
    getFiredOneShotIds() {
        return [...this._firedOneShot];
    }

    /** Evaluate portfolio-triggered events. Returns array of triggered event objects. */
    evaluateTriggers(sim, day) {
        const MAX_TRIGGERS_PER_DAY = 3;
        const triggered = [];
        for (const ev of this._triggerPool) {
            if (triggered.length >= MAX_TRIGGERS_PER_DAY) break;
            const cd = this._triggerCooldowns[ev.id];
            const cdMult = ev.tone === 'positive' ? 1 / firmCooldownMult() : firmCooldownMult();
            if (cd && day - cd < ev.cooldown * cdMult) continue;
            const liveDay = day - HISTORY_CAPACITY;
            if (ev.era === 'early' && liveDay > 500) continue;
            if (ev.era === 'mid'   && (liveDay < 500 || liveDay > 800)) continue;
            if (ev.era === 'late'  && liveDay < 800) continue;
            try {
                if (ev.trigger(sim, this.world, this._playerCtx)) {
                    this._triggerCooldowns[ev.id] = day;
                    triggered.push(ev);
                }
            } catch (e) { /* guard — portfolio state may be inconsistent mid-reset */ }
        }
        return triggered;
    }

    /** Reset trigger cooldowns (call on game reset). */
    resetTriggerCooldowns() {
        this._triggerCooldowns = {};
    }

    // -- Internal ---------------------------------------------------------

    _scaledParams(params, coupling) {
        if (!params || coupling === 1.0) return params;
        const scaled = {};
        for (const k in params) scaled[k] = params[k] * coupling;
        return scaled;
    }

    _logEvent(day, event, params, magnitude) {
        const entry = { day, headline: event.headline, magnitude: magnitude || event.magnitude || 'moderate', params: params ?? {} };
        this.eventLog.push(entry);
        if (this.eventLog.length > MAX_LOG) this.eventLog.shift();
        return entry;
    }

    _scheduleFollowups(event, day, depth, chainIdSuffix) {
        if (!event.followups || depth >= MAX_CHAIN_DEPTH) return;
        const chainId = event.id || ('chain_' + day + (chainIdSuffix || ''));
        for (const fu of event.followups) {
            const delay = this._followupDelay(fu.mtth);
            this._pendingFollowups.push({
                event: getEventById(fu.id) || fu,
                chainId,
                targetDay: day + Math.max(1, delay),
                weight: fu.weight ?? 1,
                depth: depth + 1,
            });
        }
    }

    _fireEvent(event, sim, day, depth, netDelta = 0) {
        if (event.popup && event.superevent) {
            const coupling = this._computeCoupling(netDelta, event.params);
            this.applyDeltas(sim, this._scaledParams(event.params, coupling) || event.params);
            if (typeof event.effects === 'function') event.effects(this.world);
            else if (Array.isArray(event.effects)) applyStructuredEffects(this.world, event.effects);

            this._logEvent(day, event, event.params || {}, event.magnitude || 'major');
            this._scheduleFollowups(event, day, depth);

            return { queued: true, event: { ...event } };
        }

        if (event.popup && event.choices) {
            const coupling = this._computeCoupling(netDelta, event.params);
            const queuedEvent = { ...event };
            if (coupling !== 1.0) {
                queuedEvent.choices = event.choices.map(c => ({
                    ...c,
                    deltas: c.deltas ? Object.fromEntries(
                        Object.entries(c.deltas).map(([k, v]) => [k, v * coupling])
                    ) : null,
                }));
            }
            this._logEvent(day, event, null);
            return { queued: true, event: queuedEvent };
        }

        // Non-popup: apply deltas with coupling
        const coupling = this._computeCoupling(netDelta, event.params);
        this.applyDeltas(sim, this._scaledParams(event.params, coupling) || event.params);

        // Apply world state effects
        if (typeof event.effects === 'function') {
            event.effects(this.world);
        } else if (Array.isArray(event.effects)) {
            applyStructuredEffects(this.world, event.effects);
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
    }

    _checkFollowups(sim, day, netDelta = 0) {
        const ready = [];
        const remaining = [];
        for (const pf of this._pendingFollowups) {
            if (pf.targetDay <= day) ready.push(pf);
            else remaining.push(pf);
        }
        this._pendingFollowups = remaining;

        if (ready.length === 0) return [];

        // Group by chainId for mutually exclusive branching
        const chains = new Map();
        for (const pf of ready) {
            const key = pf.chainId || '_ungrouped';
            if (!chains.has(key)) chains.set(key, []);
            chains.get(key).push(pf);
        }

        // Pick one from each chain via weighted selection, then fire
        const congress = congressHelpers(this.world);
        const fired = [];
        for (const [, group] of chains) {
            const totalWeight = group.reduce((sum, pf) => sum + (pf.weight ?? 1), 0);
            let roll = Math.random() * totalWeight;
            let picked = group[group.length - 1];
            for (const pf of group) {
                roll -= (pf.weight ?? 1);
                if (roll <= 0) { picked = pf; break; }
            }

            const event = picked.event ?? getEventById(picked.id);
            if (!event) continue;
            if (event.when && !event.when(sim, this.world, congress, this._playerCtx)) continue;
            if (event.oneShot && this._firedOneShot.has(event.id)) continue;
            if (event.oneShot) this._firedOneShot.add(event.id);

            fired.push(this._fireEvent(event, sim, day, picked.depth, netDelta));
        }
        return fired;
    }

    _eventWeight(ev, sim, congress, boostNonMinor, convIds) {
        let w = typeof ev.likelihood === 'function' ? ev.likelihood(sim, this.world, congress) : (ev.likelihood || 1);
        if (boostNonMinor && ev.magnitude !== 'minor' && ev.category !== 'neutral') {
            w *= 2;
        }
        // Conviction-aware likelihood adjustments
        if (convIds.length > 0) {
            if (convIds.includes('political_operator') && (ev.category === 'congressional' || ev.category === 'filibuster' || ev.category === 'political')) {
                w *= 1.5;
            }
            if (convIds.includes('volatility_addict') && (ev.category === 'pnth' || ev.category === 'pnth_earnings')) {
                w *= 1.3;
            }
            if (convIds.includes('information_edge') && (ev.category === 'investigation' || ev.category === 'media')) {
                w *= 1.4;
            }
            if (convIds.includes('ghost_protocol')) {
                w *= 0.7;
            }
        }
        return w;
    }

    _weightedPick(events, sim) {
        const congress = congressHelpers(this.world);
        const boredomImmune = getTraitEffect('boredomImmune', false);
        const boostNonMinor = !boredomImmune && this._consecutiveMinor >= BOREDOM_THRESHOLD;
        const convIds = getActiveTraitIds();

        const weights = new Array(events.length);
        let totalWeight = 0;
        for (let i = 0; i < events.length; i++) {
            const w = this._eventWeight(events[i], sim, congress, boostNonMinor, convIds);
            weights[i] = w;
            totalWeight += w;
        }

        let roll = Math.random() * totalWeight;
        for (let i = 0; i < events.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return events[i];
        }
        return events[events.length - 1];
    }

    _filterEligible(pool, sim) {
        const day = this._currentDay;
        const congress = congressHelpers(this.world);
        return pool.filter(ev => {
            if (ev.era) {
                if (ev.era === 'early' && day > 500) return false;
                if (ev.era === 'mid' && (day < 500 || day > 800)) return false;
                if (ev.era === 'late' && day < 800) return false;
            }
            const liveDay = day - HISTORY_CAPACITY;
            if (ev.minDay != null && liveDay < ev.minDay) return false;
            if (ev.maxDay != null && liveDay > ev.maxDay) return false;
            return !ev.when || ev.when(sim, this.world, congress, this._playerCtx);
        });
    }

    _drawRandom(sim) {
        const pool = this._pools.random.filter(ev =>
            !(ev.oneShot && this._firedOneShot.has(ev.id))
        );
        const eligible = this._filterEligible(pool, sim);
        if (eligible.length === 0) return null;
        return this._weightedPick(eligible, sim);
    }

    _drawLLM(sim) {
        if (this._queue.length > 0) return this._queue.shift();

        // Queue empty -- trigger fetch, return offline fallback
        if (!this._prefetching) this._fetchBatch(sim);
        return this._drawRandom(sim);
    }

    async _fetchBatch(sim) {
        if (!this._llm || this._prefetching) return;
        this._prefetching = true;
        try {
            const events = await this._llm.generateBatch(
                sim, this.eventLog, this._pendingFollowups, this.world
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

    // -- Fixed pulse handlers ---------------------------------------------

    _onCampaignSeason(sim, day, netDelta = 0) {
        return [this._fireEvent({
            id: 'midterm_campaign_season',
            category: 'political',
            headline: 'Campaign season heats up as midterm elections approach; Barron barnstorms for Federalist candidates nationwide',
            params: { theta: 0.01 },
            magnitude: 'moderate',
        }, sim, day, 0, netDelta)];
    }

    _onMidterm(sim, day, netDelta = 0) {
        const w = this.world;
        let score = w.election.barronApproval;

        if (w.geopolitical.recessionDeclared) score -= 15;
        if (w.geopolitical.mideastEscalation >= 2 || w.geopolitical.southAmericaOps >= 2) score -= 8;

        // Lobby momentum: each point shifts the score by 3
        score += (w.election.lobbyMomentum || 0) * 3;

        // Cross-domain signals
        if (w.investigations.okaforProbeStage >= 2) score -= 5;
        if (w.fed.hartleyFired) score -= 3;
        if ((w.pnth.aegisControversy || 0) >= 2) score -= 3;
        const factions = w.factions || {};
        score += ((factions.federalistSupport || 30) - (factions.farmerLaborSupport || 30)) * 0.15;

        // Noise: +-5 (reduced from +-10 to preserve player agency)
        score += (Math.random() - 0.5) * 10;

        let result, headline, params, effects;

        if (score > 55) {
            result = 'fed_gain';
            headline = 'Midterm landslide: Federalists expand majority in both chambers; Barron claims mandate';
            params = { mu: 0.03, theta: -0.01, lambda: -0.3 };
            effects = (world) => {
                world.congress.senate.federalist = 55;
                world.congress.senate.farmerLabor = 45;
                world.congress.house.federalist = 233;
                world.congress.house.farmerLabor = 202;
            };
        } else if (score > 42) {
            result = 'fed_hold';
            headline = 'Midterms deliver mixed results; Federalists narrowly hold both chambers';
            params = { theta: 0.005 };
            effects = (world) => {
                world.congress.senate.federalist = 51;
                world.congress.senate.farmerLabor = 49;
                world.congress.house.federalist = 219;
                world.congress.house.farmerLabor = 216;
            };
        } else if (score > 28) {
            result = 'fed_loss_house';
            headline = 'Farmer-Labor flips the House in midterm wave; Federalists retain Senate narrowly';
            params = { mu: -0.02, theta: 0.015, lambda: 0.5 };
            effects = (world) => {
                world.congress.senate.federalist = 51;
                world.congress.senate.farmerLabor = 49;
                world.congress.house.federalist = 201;
                world.congress.house.farmerLabor = 234;
            };
        } else {
            result = 'fed_loss_both';
            headline = 'Midterm wipeout: Farmer-Labor takes House and Senate; Barron\'s agenda stalls completely';
            params = { mu: -0.04, theta: 0.025, lambda: 1.0 };
            effects = (world) => {
                world.congress.senate.federalist = 47;
                world.congress.senate.farmerLabor = 53;
                world.congress.house.federalist = 193;
                world.congress.house.farmerLabor = 242;
            };
        }

        const event = {
            id: 'midterm_election_' + result,
            category: 'midterm',
            headline,
            params,
            magnitude: 'major',
            effects,
            popup: true,
            superevent: true,
            choices: [{ label: 'Acknowledged', desc: 'The markets have spoken.' }],
        };

        w.election.midtermComplete = true;
        w.election.midtermResult = result;

        return [this._fireEvent(event, sim, day, 0, netDelta)];
    }

    // -- Coupling ---------------------------------------------------------

    _computeCoupling(netDelta, deltas) {
        if (!deltas || !deltas.mu || Math.abs(netDelta) < 1) return 1.0;
        const alignment = Math.sign(netDelta) * Math.sign(deltas.mu);
        const magnitude = Math.min(1, Math.abs(netDelta) / (ADV * 0.5));
        return 1 + alignment * magnitude * EVENT_COUPLING_CAP * getTraitEffect('couplingCapMult', 1);
    }

    // -- Public followup scheduling ---------------------------------------

    scheduleFollowup(followup, fromDay) {
        const id = typeof followup === 'string' ? followup : followup.id;
        const mtth = typeof followup === 'object' ? (followup.mtth ?? 20) : 20;
        const delay = Math.max(1, Math.round(mtth + (Math.random() - 0.5) * mtth * 0.3));
        const event = getEventById(id);
        if (!event) return;
        this._pendingFollowups.push({
            event,
            chainId: 'choice_' + fromDay + '_' + id,
            targetDay: fromDay + delay,
            weight: 1,
            depth: 1,
        });
    }

    // -- Timing helpers ---------------------------------------------------

    _jitterRoll(jitter) {
        if (!jitter || jitter <= 0) return 0;
        return Math.floor((Math.random() - 0.5) * 2 * jitter);
    }

    _followupDelay(mtth) {
        if (!mtth || mtth <= 0) return 1;
        const sigma = mtth * 0.3;
        const raw = mtth + this._gaussianSample() * sigma;
        return Math.max(Math.round(mtth * 0.4), Math.min(Math.round(mtth * 2.0), Math.round(raw)));
    }

    _gaussianSample() {
        // Box-Muller transform
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
    }
}
