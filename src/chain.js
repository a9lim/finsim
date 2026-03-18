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
// Expiry generation
// ---------------------------------------------------------------------------

/**
 * Generate monthly expiry dates using a 21-trading-day interval scheme.
 *
 * The first expiry is the next 21-day boundary strictly above currentDay.
 * Subsequent expiries follow every 21 trading days.
 *
 * @param {number} currentDay - Current simulation day (integer)
 * @param {number} [count=8]  - Number of expiries to generate
 * @returns {{ day: number, dte: number }[]} Expiry objects where dte > 0
 */
export function generateExpiries(currentDay, count = 8) {
    const CYCLE = 21; // trading days per month (approximate)
    // First boundary strictly above currentDay
    const firstExpiry = Math.floor(currentDay / CYCLE) * CYCLE + CYCLE;

    const expiries = [];
    for (let i = 0; i < count; i++) {
        const day = firstExpiry + i * CYCLE;
        const dte = day - currentDay;
        if (dte > 0) {
            expiries.push({ day, dte });
        }
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
export function buildChain(S, v, r, currentDay) {
    const expiries = generateExpiries(currentDay);
    const strikes  = generateStrikes(S);

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
