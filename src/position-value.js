/* =====================================================
   position-value.js -- Unified position valuation for
   the Shoals trading simulator.

   Single source of truth for mark-to-market position
   values. Used by portfolio.js and portfolio-renderer.js.
   ===================================================== */

import { priceAmerican, vasicekBondPrice } from './pricing.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';
import { market } from './market.js';

/**
 * Compute the fair (mid) unit price for a single unit of an instrument.
 *
 * @param {string} type       - 'stock'|'bond'|'call'|'put'
 * @param {number} S          - Current spot price
 * @param {number} vol        - Current implied volatility (annualized)
 * @param {number} rate       - Current risk-free rate
 * @param {number} day        - Current simulation day
 * @param {number} [strike]   - Strike price (options only)
 * @param {number} [expiryDay] - Simulation day of expiry (options/bonds)
 * @param {number} [q=0]      - Continuous dividend yield
 * @returns {number} Mid-market price per unit
 */
export function unitPrice(type, S, vol, rate, day, strike, expiryDay, q) {
    const dte = expiryDay != null
        ? Math.max((expiryDay - day) / TRADING_DAYS_PER_YEAR, 0)
        : 0;
    switch (type) {
        case 'stock': return S;
        case 'bond':
            return market.a >= 1e-8
                ? vasicekBondPrice(BOND_FACE_VALUE, rate, dte, market.a, market.b, market.sigmaR)
                : BOND_FACE_VALUE * Math.exp(-rate * dte);
        case 'call':
        case 'put':
            return dte > 0
                ? priceAmerican(S, strike, dte, rate, vol, type === 'put', q, day)
                : Math.max(0, type === 'call' ? S - strike : strike - S);
        default: return 0;
    }
}

/**
 * Compute the current mark-to-market value of a position.
 *
 * For long positions, returns the current market value (positive).
 * For short positions, returns the current liability (negative),
 * since proceeds from opening the short are already reflected in cash.
 *
 * @param {Object} pos  - Position object with { type, qty, strike?, expiryDay?, entryPrice }
 * @param {number} S    - Current spot price
 * @param {number} vol  - Current implied volatility (annualized)
 * @param {number} rate - Current risk-free rate
 * @param {number} day  - Current simulation day
 * @param {number} [q=0] - Continuous dividend yield
 * @returns {number} Signed market value
 */
export function computePositionValue(pos, S, vol, rate, day, q) {
    return pos.qty * unitPrice(pos.type, S, vol, rate, day, pos.strike, pos.expiryDay, q);
}

/**
 * Compute unrealized P&L for a position.
 *
 * @returns {number} Profit (positive) or loss (negative)
 */
export function computePositionPnl(pos, S, vol, rate, day, q) {
    const currentValue = computePositionValue(pos, S, vol, rate, day, q);
    const absQty = Math.abs(pos.qty);
    const entryTotal = pos.entryPrice * absQty;

    if (pos.qty > 0) {
        // Long: profit = current value - cost basis
        return currentValue - entryTotal;
    } else {
        // Short: profit = proceeds received - current liability
        // proceeds (entryTotal) already in cash; liability is -currentValue (positive number)
        return entryTotal + currentValue; // currentValue is negative for shorts
    }
}
