/**
 * chain.js — Options chain generator for the Shoals trading simulator.
 *
 * Generates strike prices, expiry dates, and computed prices/Greeks
 * for every call and put in the chain.
 *
 * Exports: generateExpiries, generateStrikes, buildChain
 */

import { STRIKE_INTERVAL, STRIKE_RANGE, TRADING_DAYS_PER_YEAR } from './config.js';
import { computeGreeks, computeSpread } from './pricing.js';

// ---------------------------------------------------------------------------
// Expiry management — rolling window of expiry dates
// ---------------------------------------------------------------------------

const EXPIRY_CYCLE = 21; // trading days per month (approximate)
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

/**
 * Legacy helper — generate expiries statelessly (used by tests or one-off calls).
 */
export function generateExpiries(currentDay, count = 8) {
    const firstExpiry = Math.floor(currentDay / EXPIRY_CYCLE) * EXPIRY_CYCLE + EXPIRY_CYCLE;
    const expiries = [];
    for (let i = 0; i < count; i++) {
        const day = firstExpiry + i * EXPIRY_CYCLE;
        const dte = day - currentDay;
        if (dte > 0) expiries.push({ day, dte });
    }
    return expiries;
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
// Full chain builder
// ---------------------------------------------------------------------------

/**
 * Build the full options chain.
 *
 * For each expiry × strike combination, computes call and put Greeks
 * (price, delta, gamma, theta, vega, rho) and model bid/ask spreads.
 *
 * @param {number} S          - Spot price
 * @param {number} v          - Implied volatility (annualised)
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
    if (!expiries) expiries = generateExpiries(currentDay);
    const strikes = generateStrikes(S);

    return expiries.map(({ day, dte }) => {
        const T = dte / TRADING_DAYS_PER_YEAR; // convert trading days to years

        const options = strikes.map(K => {
            const callGreeks = computeGreeks(S, K, T, r, v, false);
            const putGreeks  = computeGreeks(S, K, T, r, v, true);

            const callHalfSpread = computeSpread(callGreeks.price, S, K, v);
            const putHalfSpread  = computeSpread(putGreeks.price,  S, K, v);

            return {
                strike: K,
                call: {
                    price: callGreeks.price,
                    delta: callGreeks.delta,
                    gamma: callGreeks.gamma,
                    theta: callGreeks.theta,
                    vega:  callGreeks.vega,
                    rho:   callGreeks.rho,
                    bid:   Math.max(0, callGreeks.price - callHalfSpread),
                    ask:   callGreeks.price + callHalfSpread,
                },
                put: {
                    price: putGreeks.price,
                    delta: putGreeks.delta,
                    gamma: putGreeks.gamma,
                    theta: putGreeks.theta,
                    vega:  putGreeks.vega,
                    rho:   putGreeks.rho,
                    bid:   Math.max(0, putGreeks.price - putHalfSpread),
                    ask:   putGreeks.price + putHalfSpread,
                },
            };
        });

        return { day, dte, options };
    });
}
