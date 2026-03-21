/**
 * chain.js — Options chain generator for the Shoals trading simulator.
 *
 * Generates strike prices, expiry dates, and lazy per-expiry pricing.
 * buildChainSkeleton() returns metadata only (no pricing calls).
 * priceChainExpiry() prices a single expiry on demand.
 *
 * Exports: buildChainSkeleton, priceChainExpiry, generateStrikes, ExpiryManager
 */

import { STRIKE_INTERVAL, STRIKE_RANGE, TRADING_DAYS_PER_YEAR, QUARTERLY_CYCLE, EXPIRY_COUNT, OPTION_SPREAD_PCT, MONEYNESS_SPREAD_WEIGHT } from './config.js';
import { allocTree, prepareTree, pricePairWithTree, allocGreekTrees, prepareGreekTrees, computeGreeksPairWithTrees, computeEffectiveSigma, computeSkewSigma } from './pricing.js';
import { computeOptionBidAsk } from './portfolio.js';
import { market } from './market.js';

// ---------------------------------------------------------------------------
// Expiry management — rolling window of expiry dates
// ---------------------------------------------------------------------------

const EXPIRY_CYCLE = QUARTERLY_CYCLE;

/**
 * Persistent rolling manager for option/bond expiry dates.
 *
 * Maintains a fixed-count list of future expiry dates. When the nearest
 * expiry passes, it is dropped and a new one is appended at the far end
 * so the list never shrinks.
 */
export class ExpiryManager {
    constructor() {
        this._expiries = []; // sorted ascending day numbers
    }

    /**
     * (Re)initialise the expiry list from a given simulation day.
     * @param {number} currentDay
     */
    init(currentDay) {
        this._expiries = [];
        const first = Math.floor(currentDay / EXPIRY_CYCLE) * EXPIRY_CYCLE + EXPIRY_CYCLE;
        for (let i = 0; i < EXPIRY_COUNT; i++) {
            this._expiries.push(first + i * EXPIRY_CYCLE);
        }
    }

    /**
     * Advance the rolling window: drop expired dates, replenish at the far end.
     * @param {number} currentDay
     * @returns {{ day: number, dte: number }[]}
     */
    update(currentDay) {
        // Drop any expiries that have passed
        while (this._expiries.length > 0 && this._expiries[0] <= currentDay) {
            this._expiries.shift();
        }
        // Replenish to maintain EXPIRY_COUNT
        while (this._expiries.length < EXPIRY_COUNT) {
            const last = this._expiries.length > 0
                ? this._expiries[this._expiries.length - 1]
                : Math.floor(currentDay / EXPIRY_CYCLE) * EXPIRY_CYCLE + EXPIRY_CYCLE;
            this._expiries.push(last + EXPIRY_CYCLE);
        }
        return this._expiries.map(day => ({ day, dte: day - currentDay }));
    }
}

// ---------------------------------------------------------------------------
// Strike generation
// ---------------------------------------------------------------------------

/**
 * Generate an array of strike prices centred on the ATM strike.
 *
 * ATM strike = round(currentPrice / STRIKE_INTERVAL) * STRIKE_INTERVAL.
 * Produces STRIKE_RANGE strikes above and below ATM (plus ATM itself),
 * filters out non-positive values, and returns them sorted ascending.
 *
 * @param {number} currentPrice - Current underlying price
 * @returns {number[]} Sorted array of strike prices
 */
export function generateStrikes(currentPrice) {
    const atm = Math.round(currentPrice / STRIKE_INTERVAL) * STRIKE_INTERVAL;
    const strikes = [];
    for (let i = -STRIKE_RANGE; i <= STRIKE_RANGE; i++) {
        const K = atm + i * STRIKE_INTERVAL;
        if (K > 0) {
            strikes.push(K);
        }
    }
    return strikes.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Reusable tree pool — eliminates Float64Array allocation per strike
// ---------------------------------------------------------------------------

/** Reusable tree for the price-only chain path (1 per strike, sequential). */
const _rTree = allocTree();

/** Reusable Greek trees bundle for the full chain overlay (7 trees per strike). */
const _rGreekTrees = allocGreekTrees();

// Pre-allocated result pool for the price-only chain path.
// Avoids creating ~75 objects (25 options × 3 sub-objects) per substep.
// WARNING: _rResult is a shared mutable singleton. The reference returned by
// priceChainExpiry (price-only path) is invalidated on the next call.
// Callers must consume results synchronously before calling again.
const _MAX_STRIKES = 25;
const _rResult = { day: 0, dte: 0, options: [] };
const _rOptions = [];
for (let i = 0; i < _MAX_STRIKES; i++) {
    _rOptions.push({
        strike: 0,
        call: { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, bid: 0, ask: 0 },
        put:  { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, bid: 0, ask: 0 },
    });
}

// ---------------------------------------------------------------------------
// Lazy chain builder — skeleton + per-expiry pricing
// ---------------------------------------------------------------------------

/**
 * Build the chain skeleton: expiry metadata + strikes, no pricing.
 *
 * @param {number} S          - Spot price (used to centre strikes)
 * @param {number} currentDay - Current simulation day (unused, kept for API symmetry)
 * @param {{ day: number, dte: number }[]} expiries
 * @returns {Array<{ day: number, dte: number, strikes: number[] }>}
 */
export function buildChainSkeleton(S, currentDay, expiries) {
    const strikes = generateStrikes(S);
    return expiries.map(({ day, dte }) => ({ day, dte, strikes }));
}

/**
 * Price a single chain expiry on demand.
 *
 * Uses term-structure volatility (Heston expected integrated variance),
 * moneyness-dependent skew (first-order Heston), and Vasicek term-structure
 * rates. Each strike gets its own tree (different skewed sigma), with dual
 * call+put backward induction at each strike.
 *
 * Reads Heston and Vasicek parameters from the shared market object.
 *
 * When greeks=false (default): 25 tree preps + 25 dual inductions.
 * When greeks=true: 25×7 tree preps + 25×7 dual inductions.
 * Use greeks=true only for the full chain overlay.
 *
 * @param {number} S     - Spot price
 * @param {number} v     - Heston variance (converted to sigma internally)
 * @param {number} r     - Risk-free rate
 * @param {{ day: number, dte: number, strikes: number[] }} expiry - skeleton entry
 * @param {boolean} [greeks=false] - compute full Greeks (delta/gamma/theta/vega/rho)
 * @param {number} [q=0] - Continuous dividend yield
 * @returns {{ day: number, dte: number, options: Array }}
 */
export function priceChainExpiry(S, v, r, expiry, greeks, q) {
    q = q || 0;
    const T = expiry.dte / TRADING_DAYS_PER_YEAR;
    const currentDay = expiry.day - expiry.dte;

    // Term-structure effective volatility (Heston expected integrated variance)
    const sigmaEff = computeEffectiveSigma(v, T, market.kappa, market.theta, market.xi);

    if (greeks) {
        // Greeks path: per-strike skewed sigma, 7 tree variants each.
        // Reuses _rGreekTrees buffers (zero allocation per strike).
        const options = expiry.strikes.map(K => {
            const sigma = computeSkewSigma(sigmaEff, S, K, T, market.rho, market.xi, market.kappa);
            prepareGreekTrees(T, r, sigma, q, currentDay, _rGreekTrees);
            const { call: callG, put: putG } = computeGreeksPairWithTrees(S, K, _rGreekTrees);
            const callBA = computeOptionBidAsk(callG.price, S, K, sigma);
            const putBA  = computeOptionBidAsk(putG.price,  S, K, sigma);
            return {
                strike: K,
                call: { price: callG.price, delta: callG.delta, gamma: callG.gamma,
                         theta: callG.theta, vega: callG.vega, rho: callG.rho,
                         bid: Math.max(0, callBA.bid), ask: callBA.ask },
                put:  { price: putG.price, delta: putG.delta, gamma: putG.gamma,
                         theta: putG.theta, vega: putG.vega, rho: putG.rho,
                         bid: Math.max(0, putBA.bid), ask: putBA.ask },
            };
        });
        return { day: expiry.day, dte: expiry.dte, options };
    }

    // Price-only path: per-strike skewed sigma, single tree each.
    // Reuses _rTree buffers AND pre-allocated result objects (zero allocation).
    const strikes = expiry.strikes;
    const nStrikes = strikes.length;
    _rResult.day = expiry.day;
    _rResult.dte = expiry.dte;
    _rResult.options = _rOptions;
    // Trim or expand visible slice (consumers read .options.length)
    _rOptions.length = nStrikes;
    for (let si = 0; si < nStrikes; si++) {
        const K = strikes[si];
        const sigma = computeSkewSigma(sigmaEff, S, K, T, market.rho, market.xi, market.kappa);
        prepareTree(T, r, sigma, q, currentDay, _rTree);
        const { call: callP, put: putP } = pricePairWithTree(S, K, _rTree);

        // Inline bid/ask (mirrors computeOptionBidAsk from portfolio.js;
        // avoids 2 object allocations per strike in the hot substep path).
        // SYNC: if the spread formula in portfolio.js changes, update here too.
        const moneyness = Math.abs(Math.log(S / K));
        const spreadBase = OPTION_SPREAD_PCT * (1 + sigma);
        const moneynessAdj = MONEYNESS_SPREAD_WEIGHT * moneyness;
        const cHalf = callP * spreadBase + moneynessAdj;
        const pHalf = putP * spreadBase + moneynessAdj;

        let opt = _rOptions[si];
        if (!opt) {
            opt = {
                strike: 0,
                call: { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, bid: 0, ask: 0 },
                put:  { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, bid: 0, ask: 0 },
            };
            _rOptions[si] = opt;
        }
        opt.strike = K;
        const c = opt.call;
        c.price = callP; c.delta = 0; c.gamma = 0; c.theta = 0; c.vega = 0; c.rho = 0;
        c.bid = Math.max(0, callP - cHalf); c.ask = callP + cHalf;
        const p = opt.put;
        p.price = putP; p.delta = 0; p.gamma = 0; p.theta = 0; p.vega = 0; p.rho = 0;
        p.bid = Math.max(0, putP - pHalf); p.ask = putP + pHalf;
    }
    return _rResult;
}
