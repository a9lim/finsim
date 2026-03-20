/**
 * chain.js — Options chain generator for the Shoals trading simulator.
 *
 * Generates strike prices, expiry dates, and computed prices/Greeks
 * for every call and put in the chain.
 *
 * Exports: buildChain
 */

import { STRIKE_INTERVAL, STRIKE_RANGE, TRADING_DAYS_PER_YEAR } from './config.js';
import { computeGreeks } from './pricing.js';
import { computeOptionBidAsk } from './portfolio.js';

// ---------------------------------------------------------------------------
// Expiry management — rolling window of expiry dates
// ---------------------------------------------------------------------------

const EXPIRY_CYCLE = 84; // trading days per quarter (approximate)
const EXPIRY_COUNT = 8;  // number of active expiries to maintain

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
function generateStrikes(currentPrice) {
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
// Full chain builder
// ---------------------------------------------------------------------------

/**
 * Build the full options chain.
 *
 * For each expiry × strike combination, computes call and put Greeks
 * (price, delta, gamma, theta, vega, rho) and model bid/ask spreads.
 *
 * @param {number} S          - Spot price
 * @param {number} v          - Heston variance (converted to volatility internally)
 * @param {number} r          - Risk-free rate (continuously compounded)
 * @param {number} currentDay - Current simulation day (integer)
 * @returns {Array<{
 *   day: number,
 *   dte: number,
 *   options: Array<{
 *     strike: number,
 *     call: { price: number, delta: number, gamma: number, theta: number, vega: number, rho: number, bid: number, ask: number },
 *     put:  { price: number, delta: number, gamma: number, theta: number, vega: number, rho: number, bid: number, ask: number },
 *   }>
 * }>}
 */
export function buildChain(S, v, r, currentDay, expiries) {
    const strikes = generateStrikes(S);
    const sigma = Math.sqrt(Math.max(v, 0));

    return expiries.map(({ day, dte }) => {
        const T = dte / TRADING_DAYS_PER_YEAR; // convert trading days to years

        const options = strikes.map(K => {
            const callGreeks = computeGreeks(S, K, T, r, sigma, false);
            const putGreeks  = computeGreeks(S, K, T, r, sigma, true);

            const callBA = computeOptionBidAsk(callGreeks.price, S, K, sigma);
            const putBA  = computeOptionBidAsk(putGreeks.price,  S, K, sigma);

            return {
                strike: K,
                call: {
                    price: callGreeks.price,
                    delta: callGreeks.delta,
                    gamma: callGreeks.gamma,
                    theta: callGreeks.theta,
                    vega:  callGreeks.vega,
                    rho:   callGreeks.rho,
                    bid:   Math.max(0, callBA.bid),
                    ask:   callBA.ask,
                },
                put: {
                    price: putGreeks.price,
                    delta: putGreeks.delta,
                    gamma: putGreeks.gamma,
                    theta: putGreeks.theta,
                    vega:  putGreeks.vega,
                    rho:   putGreeks.rho,
                    bid:   Math.max(0, putBA.bid),
                    ask:   putBA.ask,
                },
            };
        });

        return { day, dte, options };
    });
}
