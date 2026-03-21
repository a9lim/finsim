/**
 * chain.js — Options chain generator for the Shoals trading simulator.
 *
 * Generates strike prices, expiry dates, and lazy per-expiry pricing.
 * buildChainSkeleton() returns metadata only (no pricing calls).
 * priceChainExpiry() prices a single expiry on demand.
 *
 * Exports: buildChainSkeleton, priceChainExpiry, generateStrikes, ExpiryManager
 */

import { STRIKE_INTERVAL, STRIKE_RANGE, TRADING_DAYS_PER_YEAR, QUARTERLY_CYCLE, EXPIRY_COUNT } from './config.js';
import { prepareTree, pricePairWithTree, prepareGreekTrees, computeGreeksPairWithTrees } from './pricing.js';
import { computeOptionBidAsk } from './portfolio.js';

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
 * Uses dual call+put backward induction: a single tree traversal produces
 * both call and put prices at each strike, halving backward inductions.
 * When greeks=false (default): 1 tree prep + 25 dual inductions (was 50).
 * When greeks=true: 7 tree preps + 25×7 dual inductions (was 25×14).
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
    const sigma = Math.sqrt(Math.max(v, 0));
    const T = expiry.dte / TRADING_DAYS_PER_YEAR;
    const currentDay = expiry.day - expiry.dte;

    if (greeks) {
        // Greeks path: prepare 7 tree variants once, dual-price call+put
        // per strike (7 dual inductions per strike vs 14 single inductions)
        const gt = prepareGreekTrees(T, r, sigma, q, currentDay);
        const options = expiry.strikes.map(K => {
            const { call: callG, put: putG } = computeGreeksPairWithTrees(S, K, gt);
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

    // Price-only path: single tree prep, dual call+put per strike
    // (25 dual inductions vs 50 single inductions)
    const tree = prepareTree(T, r, sigma, q, currentDay);
    const options = expiry.strikes.map(K => {
        const { call: callP, put: putP } = pricePairWithTree(S, K, tree);
        const callBA = computeOptionBidAsk(callP, S, K, sigma);
        const putBA  = computeOptionBidAsk(putP,  S, K, sigma);
        return {
            strike: K,
            call: { price: callP, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0,
                     bid: Math.max(0, callBA.bid), ask: callBA.ask },
            put:  { price: putP, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0,
                     bid: Math.max(0, putBA.bid), ask: putBA.ask },
        };
    });
    return { day: expiry.day, dte: expiry.dte, options };
}
