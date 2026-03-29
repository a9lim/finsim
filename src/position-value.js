/* =====================================================
   position-value.js -- Unified position valuation for
   the Shoals trading simulator.

   Single source of truth for mark-to-market position
   values. Used by portfolio.js and portfolio-renderer.js.
   ===================================================== */

import { allocTree, prepareTree, priceWithTree, vasicekBondPrice, computeEffectiveSigma, computeSkewSigma } from './pricing.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';
import { getStockImpact, getBondImpact, getOptionImpact } from './price-impact.js';
import { market } from './market.js';

let _tree = null;

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
        case 'stock': return S + getStockImpact(vol);
        case 'bond': {
            const bondMid = market.a >= 1e-8
                ? vasicekBondPrice(BOND_FACE_VALUE, rate, dte, market.a, market.b, market.sigmaR)
                : BOND_FACE_VALUE * Math.exp(-rate * dte);
            return bondMid + getBondImpact(market.sigmaR);
        }
        case 'call':
        case 'put': {
            if (dte <= 0 || vol <= 0) return Math.max(0, type === 'call' ? S - strike : strike - S);
            const sigmaEff = computeEffectiveSigma(market.v, dte, market.kappa, market.theta, market.xi);
            const sigma = computeSkewSigma(sigmaEff, S, strike, dte, market.rho, market.xi, market.kappa);
            if (!_tree) _tree = allocTree();
            prepareTree(dte, rate, sigma, q, day, _tree);
            const treePrice = priceWithTree(S, strike, type === 'put', _tree);
            const logSK = Math.log(S / strike);
            const dteDays = Math.max(1, expiryDay - day);
            const imp = getOptionImpact(type, strike, expiryDay, sigma, logSK, dteDays);
            return Math.max(0, treePrice + imp);
        }
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
