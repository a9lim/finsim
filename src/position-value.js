/* =====================================================
   position-value.js -- Unified position valuation for
   the Shoals trading simulator.

   Single source of truth for mark-to-market position
   values. Used by portfolio.js and portfolio-renderer.js.
   ===================================================== */

import { priceAmerican } from './pricing.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';

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
 * @returns {number} Signed market value
 */
export function computePositionValue(pos, S, vol, rate, day) {
    const dte = pos.expiryDay != null
        ? Math.max((pos.expiryDay - day) / TRADING_DAYS_PER_YEAR, 0)
        : 0;

    let unitValue;
    switch (pos.type) {
        case 'stock':
            unitValue = S;
            break;
        case 'bond':
            unitValue = BOND_FACE_VALUE * Math.exp(-rate * dte);
            break;
        case 'call':
        case 'put':
            unitValue = dte > 0
                ? priceAmerican(S, pos.strike, dte, rate, vol, pos.type === 'put')
                : Math.max(0, pos.type === 'call' ? S - pos.strike : pos.strike - S);
            break;
        default:
            return 0;
    }

    // Long = positive value, Short = negative (liability)
    return pos.qty * unitValue;
}

/**
 * Compute unrealized P&L for a position.
 *
 * @returns {number} Profit (positive) or loss (negative)
 */
export function computePositionPnl(pos, S, vol, rate, day) {
    const currentValue = computePositionValue(pos, S, vol, rate, day);
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
