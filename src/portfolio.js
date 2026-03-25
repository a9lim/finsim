/* =====================================================
   portfolio.js — Positions, orders, strategies, cash,
   and margin management for the Shoals trading simulator.

   Pure state module — no DOM access.
   ===================================================== */

import {
    INITIAL_CAPITAL,
    MAINTENANCE_MARGIN,
    REG_T_MARGIN,
    SHORT_OPTION_MARGIN_PCT,
    BOND_FACE_VALUE,
    TRADING_DAYS_PER_YEAR,
    STOCKBOND_SPREAD_PCT,
    OPTION_SPREAD_PCT,
    MONEYNESS_SPREAD_WEIGHT,
} from './config.js';

import { allocGreekTrees, prepareGreekTrees, computeGreeksWithTrees, computeEffectiveSigma, computeSkewSigma, vasicekBondPrice, vasicekDuration } from './pricing.js';
import { recordStockTrade, recordOptionTrade } from './price-impact.js';

let _greekTrees = null;
import { computePositionValue, unitPrice } from './position-value.js';
import { market } from './market.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const portfolio = {
    cash:           INITIAL_CAPITAL,
    initialCapital: INITIAL_CAPITAL,
    positions: [],  // { id, type, qty, strike?, expiryDay?, entryPrice, entryDay, strategyName? }
                    //   qty > 0 = long, qty < 0 = short
    orders:    [],  // { id, type, side, qty, orderType, triggerPrice, strike?, expiryDay?, strategyName? }
    closedBorrowCost: 0, // cumulative borrow cost from closed positions
    marginDebitCost:  0, // cumulative interest on negative cash (margin debit)
    totalDividends:   0, // cumulative net dividend income/cost
    totalTrades:      0, // incremented on every executeMarketOrder call
    totalExercises:   0, // incremented on every exerciseOption call
    marginCallCount:  0, // incremented when margin call triggers
    peakValue:        INITIAL_CAPITAL, // max equity seen
    maxDrawdown:      0, // max (1 - equity/peak) seen
};

// Auto-increment counters (not exported — internal)
let _nextPositionId = 1;
let _nextOrderId    = 1;

// ---------------------------------------------------------------------------
// resetPortfolio
// ---------------------------------------------------------------------------

/**
 * Reset all portfolio state.
 * @param {number} [capital] - Starting cash; defaults to INITIAL_CAPITAL.
 */
export function resetPortfolio(capital) {
    const cap = (capital != null && isFinite(capital)) ? capital : INITIAL_CAPITAL;
    portfolio.cash           = cap;
    portfolio.initialCapital = cap;
    portfolio.positions      = [];
    portfolio.orders         = [];
    portfolio.closedBorrowCost = 0;
    portfolio.marginDebitCost  = 0;
    portfolio.totalDividends   = 0;
    portfolio.totalTrades      = 0;
    portfolio.totalExercises   = 0;
    portfolio.marginCallCount  = 0;
    portfolio.peakValue        = cap;
    portfolio.maxDrawdown      = 0;
    _nextPositionId = 1;
    _nextOrderId    = 1;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute fill price for a buy or sell, accounting for bid/ask spread and
 * Almgren-Chriss market-impact slippage.
 *
 * Impact is recorded as cumulative volume (decays with half-life).
 * No sim.S mutation — impact is an overlay. Delta hedging by MMs is
 * handled dynamically by rehedgeMM() each substep.
 */
function _fillPrice(sim, type, side, qty, mid, currentPrice, strike, currentVol, expiryDay, currentDay) {
    const ba = (type === 'call' || type === 'put')
        ? computeOptionBidAsk(mid, currentPrice, strike, currentVol)
        : computeBidAsk(mid, currentVol);
    const spreadFill = side === 'long' ? ba.ask : ba.bid;

    const signedQty = side === 'long' ? qty : -qty;

    if (type === 'bond') {
        return spreadFill;
    } else if (type === 'stock') {
        const fillCost = recordStockTrade(signedQty, currentVol);
        return Math.max(0.01, spreadFill + fillCost);
    } else {
        const logSK = Math.log(currentPrice / strike);
        const dte = Math.max(1, (expiryDay || 0) - currentDay);
        const fillCost = recordOptionTrade(type, signedQty, currentVol, logSK, dte, strike, expiryDay || 0);
        return Math.max(0.01, spreadFill + fillCost);
    }
}

/**
 * Bid/ask for stock or bond.  For bonds pass sigmaR as vol.
 */
export function computeBidAsk(mid, vol) {
    const halfSpread = mid * STOCKBOND_SPREAD_PCT * (1 + vol);
    return { bid: Math.max(0, mid - halfSpread), ask: mid + halfSpread };
}

/**
 * Bid/ask for an option (volatility + moneyness aware spread).
 */
export function computeOptionBidAsk(mid, currentPrice, strike, currentVol) {
    const moneyness = Math.abs(Math.log(currentPrice / strike));
    const halfSpread = mid * OPTION_SPREAD_PCT * (1 + currentVol) + MONEYNESS_SPREAD_WEIGHT * moneyness;
    return { bid: Math.max(0, mid - halfSpread), ask: mid + halfSpread };
}

// Reusable greek trees bundle for delta computation
let _gt = null;

export function computeNetDelta() {
    let net = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'stock') { net += p.qty; continue; }
        if (p.type === 'bond')  continue;
        const dte = p.expiryDay - market.day;
        if (dte <= 0) continue;
        const T = dte / TRADING_DAYS_PER_YEAR;
        const sigEff = computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi);
        const sigma = computeSkewSigma(sigEff, market.S, p.strike, T, market.rho, market.xi, market.kappa);
        _gt = prepareGreekTrees(T, market.r, sigma, market.q, market.day, _gt);
        const greeks = computeGreeksWithTrees(market.S, p.strike, p.type === 'put', _gt);
        net += greeks.delta * p.qty;
    }
    return net;
}

export function computeGrossNotional() {
    let gross = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'stock') { gross += Math.abs(p.qty) * market.S; continue; }
        if (p.type === 'bond')  continue;
        const dte = p.expiryDay - market.day;
        if (dte <= 0) continue;
        const T = dte / TRADING_DAYS_PER_YEAR;
        const sigEff = computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi);
        const sigma = computeSkewSigma(sigEff, market.S, p.strike, T, market.rho, market.xi, market.kappa);
        _gt = prepareGreekTrees(T, market.r, sigma, market.q, market.day, _gt);
        const greeks = computeGreeksWithTrees(market.S, p.strike, p.type === 'put', _gt);
        gross += Math.abs(greeks.delta * p.qty) * market.S;
    }
    return gross;
}

/**
 * Check whether a prospective cash change would violate initial margin (Reg-T).
 * When cash would go negative, the debit is a margin loan. We require that
 * post-trade equity (which is roughly unchanged by a fully-priced buy) covers
 * REG_T_MARGIN (50%) of the total debit.
 *
 * @param {number} cashDelta      - Proposed change to portfolio.cash
 * @param {number} currentPrice   - Spot price (for portfolioValue)
 * @param {number} currentVol
 * @param {number} currentRate
 * @param {number} currentDay
 * @returns {boolean} true if the trade would be allowed
 */
function _checkInitialMarginDebit(cashDelta, currentPrice, currentVol, currentRate, currentDay, q) {
    const newCash = portfolio.cash + cashDelta;
    if (newCash >= 0) return true; // no debit, no margin concern

    // Equity ≈ cash + positions MTM. A buy adds position value ≈ cost, so
    // equity is roughly unchanged. Compute current equity as the baseline.
    const equity = portfolioValue(currentPrice, currentVol, currentRate, currentDay, q);

    // Initial margin: equity must cover REG_T_MARGIN of the debit
    return equity >= REG_T_MARGIN * Math.abs(newCash);
}

/**
 * Compute the margin required when opening a short position.
 * Called at order execution time.
 * @returns {number} Cash reserved as margin collateral.
 */
function _marginForShort(type, qty, fillPrice, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay) {
    switch (type) {
        case 'stock':
            // Reg-T initial margin: 50% of notional value
            return REG_T_MARGIN * currentPrice * qty;

        case 'bond':
            // Treat bonds like stock for margin purposes
            return REG_T_MARGIN * fillPrice * qty;

        case 'call':
        case 'put': {
            // Short option margin: max(SHORT_OPTION_MARGIN_PCT * underlying value, premium received)
            const underlyingValue = currentPrice * qty;
            const premiumReceived = fillPrice * qty;
            return Math.max(SHORT_OPTION_MARGIN_PCT * underlyingValue, premiumReceived);
        }

        default:
            return 0;
    }
}

/**
 * Compute maintenance margin for a single short position (proposed or actual).
 */
function _maintenanceForShort(type, absQty, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay, q) {
    const mid = unitPrice(type, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay, q);
    if (type === 'call' || type === 'put') {
        return Math.max(SHORT_OPTION_MARGIN_PCT * currentPrice * absQty, mid * absQty);
    }
    return MAINTENANCE_MARGIN * mid * absQty;
}

/**
 * Check whether opening a short position (given a cashDelta already computed)
 * would immediately violate maintenance margin.  Computes post-trade equity
 * and post-trade maintenance requirement by adding the proposed short to the
 * current portfolio state.
 *
 * @param {number} cashDelta       - Net cash change from the trade
 * @param {number} shortMtm        - MTM value of the NEW short piece (negative)
 * @param {number} shortMaintenance - Maintenance margin for the NEW short piece
 * @param {number} currentPrice
 * @param {number} currentVol
 * @param {number} currentRate
 * @param {number} currentDay
 * @param {number} [skipIdx]       - Index in portfolio.positions to exclude
 *                                   (used when extending existing short, to
 *                                    avoid double-counting the old position)
 * @returns {boolean} true if the trade is safe
 */
function _postTradeMarginOk(cashDelta, shortMtm, shortMaintenance,
                            currentPrice, currentVol, currentRate, currentDay,
                            skipIdx, q) {
    let equity = portfolio.cash + cashDelta;
    let required = shortMaintenance;

    for (let i = 0; i < portfolio.positions.length; i++) {
        if (i === skipIdx) continue;
        const pos = portfolio.positions[i];
        equity += computePositionValue(pos, currentPrice, currentVol, currentRate, currentDay, q);
        if (pos._reservedMargin) equity += pos._reservedMargin;

        if (pos.qty < 0) {
            const absQty = Math.abs(pos.qty);
            const mid = unitPrice(pos.type, currentPrice, currentVol, currentRate, currentDay, pos.strike, pos.expiryDay, q);
            if (pos.type === 'call' || pos.type === 'put') {
                required += Math.max(SHORT_OPTION_MARGIN_PCT * currentPrice * absQty, mid * absQty);
            } else {
                required += MAINTENANCE_MARGIN * mid * absQty;
            }
        }
    }

    // Add the proposed short position's MTM to equity
    equity += shortMtm;

    return equity >= required;
}

// ---------------------------------------------------------------------------
// executeMarketOrder
// ---------------------------------------------------------------------------

/**
 * Execute a market order immediately at current prices.
 * Uses signed qty internally: positive = long, negative = short.
 * If an existing position of the same type (and same strike/expiry for
 * options) exists, the order nets against it — reducing, flipping, or
 * closing the position.
 *
 * @param {string}  type         - 'stock'|'bond'|'call'|'put'
 * @param {string}  side         - 'long'|'short'
 * @param {number}  qty          - Number of units (positive)
 * @param {number}  currentPrice - Spot price of underlying
 * @param {number}  currentVol   - Current implied volatility
 * @param {number}  currentRate  - Current risk-free rate
 * @param {number}  currentDay   - Current simulation day
 * @param {number}  [strike]     - For options/bonds
 * @param {number}  [expiryDay]  - Simulation day of expiry
 * @param {string}  [strategyName]
 * @returns {Object|null} The position object (new or updated), or null if insufficient cash.
 */
export function executeMarketOrder(
    sim, type, side, qty,
    currentPrice, currentVol, currentRate, currentDay,
    strike, expiryDay, strategyName, q
) {
    // Convert to signed qty: long = +qty, short = -qty
    const signedQty = side === 'long' ? qty : -qty;

    portfolio.totalTrades++;

    const mid  = unitPrice(type, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay, q);
    const spreadVol = type === 'bond' ? market.sigmaR : currentVol;
    const fill = _fillPrice(sim, type, side, qty, mid, currentPrice, strike, spreadVol, expiryDay || 0, currentDay);

    // Find existing position of same type+strike+expiry+strategy for netting
    const existingIdx = portfolio.positions.findIndex(p =>
        p.type === type &&
        (strike == null ? p.strike == null : p.strike === strike) &&
        (expiryDay == null ? p.expiryDay == null : p.expiryDay === expiryDay) &&
        (p.strategyName || null) === (strategyName || null)
    );

    if (existingIdx !== -1) {
        // --- Netting against existing position ---
        const existing = portfolio.positions[existingIdx];
        const oldQty = existing.qty;
        const newQty = oldQty + signedQty;

        // Compute cash effect based on how the order interacts with the
        // existing position. Three cases:
        //   1. Same direction (extending): buy more long or sell more short
        //   2. Opposite direction, partial/full close: reduces position
        //   3. Opposite direction, flip: closes then opens on other side

        let cashDelta = 0;

        if (oldQty > 0 && signedQty < 0) {
            // Selling against a long position
            const absOrder = Math.abs(signedQty);
            const closingQty = Math.min(absOrder, oldQty);
            const openingShortQty = absOrder - closingQty;

            // Credit from closing long portion
            cashDelta += fill * closingQty;

            // If flipping to short, also handle margin for the new short
            if (openingShortQty > 0) {
                const proceeds = fill * openingShortQty;
                const margin = _marginForShort(
                    type, openingShortQty, fill, currentPrice, currentVol,
                    currentRate, currentDay, strike, expiryDay
                );
                if (portfolio.cash + cashDelta + proceeds < margin) return null;
                cashDelta += proceeds - margin;
                // Post-trade margin check (skip existing long being closed)
                const shortMtm = -openingShortQty * mid;
                const shortMaint = _maintenanceForShort(type, openingShortQty, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay, q);
                if (!_postTradeMarginOk(cashDelta, shortMtm, shortMaint, currentPrice, currentVol, currentRate, currentDay, existingIdx, q)) return null;
            }

        } else if (oldQty < 0 && signedQty > 0) {
            // Buying against a short position
            const closingShortQty = Math.min(signedQty, Math.abs(oldQty));
            const openingLongQty = signedQty - closingShortQty;

            // Return margin for closed short portion (prorated from reserved, or recomputed)
            const totalReserved = existing._reservedMargin ?? _marginForShort(
                type, Math.abs(oldQty), existing.entryPrice, currentPrice, currentVol,
                currentRate, currentDay, strike, expiryDay
            );
            const returnedMargin = totalReserved * (closingShortQty / Math.abs(oldQty));
            if (existing._reservedMargin != null) {
                existing._reservedMargin -= returnedMargin;
            }
            // Cost to buy back the short portion
            const buybackCost = fill * closingShortQty;
            // Cost of new long portion (allowed on margin -- cash can go negative)
            const longCost = fill * openingLongQty;

            cashDelta = returnedMargin - buybackCost - longCost;
            if (!_checkInitialMarginDebit(cashDelta, currentPrice, currentVol, currentRate, currentDay, q)) return null;

        } else if (signedQty > 0) {
            // Extending a long position (oldQty >= 0)
            // Allowed on margin -- cash can go negative
            const cost = fill * signedQty;
            cashDelta = -cost;
            if (!_checkInitialMarginDebit(cashDelta, currentPrice, currentVol, currentRate, currentDay, q)) return null;

        } else {
            // Extending a short position (oldQty <= 0, signedQty < 0)
            const absQty = Math.abs(signedQty);
            const proceeds = fill * absQty;
            const margin = _marginForShort(
                type, absQty, fill, currentPrice, currentVol,
                currentRate, currentDay, strike, expiryDay
            );
            if (portfolio.cash + proceeds < margin) return null;
            cashDelta = proceeds - margin;
            // Post-trade margin check: combined position (old + new)
            const totalAbsQty = Math.abs(oldQty) + absQty;
            const combinedMtm = -totalAbsQty * mid;
            const combinedMaint = _maintenanceForShort(type, totalAbsQty, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay, q);
            if (!_postTradeMarginOk(cashDelta, combinedMtm, combinedMaint, currentPrice, currentVol, currentRate, currentDay, existingIdx, q)) return null;
            existing._reservedMargin = (existing._reservedMargin || 0) + margin;
        }

        portfolio.cash += cashDelta;

        if (newQty === 0) {
            // Position fully closed
            if (existing.borrowCost) portfolio.closedBorrowCost += existing.borrowCost;
            portfolio.positions.splice(existingIdx, 1);
            existing.fillPrice = fill;
            return existing;
        }

        // Update existing position
        // If qty flipped sign, update entry price to current fill
        if ((oldQty > 0 && newQty < 0) || (oldQty < 0 && newQty > 0)) {
            existing.entryPrice = fill;
            existing.entryDay = currentDay;
            // Finalize borrow cost from the old short side
            if (existing.borrowCost) {
                portfolio.closedBorrowCost += existing.borrowCost;
                existing.borrowCost = 0;
            }
        }
        existing.qty = newQty;
        existing.fillPrice = fill;
        if (oldQty > 0 && newQty < 0) {
            existing._reservedMargin = _marginForShort(
                type, Math.abs(newQty), fill, currentPrice, currentVol,
                currentRate, currentDay, strike, expiryDay
            );
        }
        return existing;
    }

    // --- No existing position: open new ---
    let cashDelta = 0;
    let margin = 0;

    if (side === 'long') {
        // Allowed on margin -- cash can go negative (up to initial margin limit)
        const cost = fill * qty;
        cashDelta = -cost;
        if (!_checkInitialMarginDebit(cashDelta, currentPrice, currentVol, currentRate, currentDay, q)) return null;
    } else {
        const proceeds = fill * qty;
        margin = _marginForShort(
            type, qty, fill, currentPrice, currentVol, currentRate,
            currentDay, strike, expiryDay
        );
        if (portfolio.cash + proceeds < margin) return null;
        cashDelta = proceeds - margin;
        // Verify post-trade equity exceeds maintenance margin
        const shortMtm = -qty * mid;
        const shortMaint = _maintenanceForShort(type, qty, currentPrice, currentVol, currentRate, currentDay, strike, expiryDay, q);
        if (!_postTradeMarginOk(cashDelta, shortMtm, shortMaint, currentPrice, currentVol, currentRate, currentDay, undefined, q)) return null;
    }

    portfolio.cash += cashDelta;

    const position = {
        id:          _nextPositionId++,
        type,
        qty:         signedQty,
        entryPrice:  fill,
        fillPrice:   fill,
        entryDay:    currentDay,
        strategyName: strategyName || null,
    };

    if (strike     != null) position.strike    = strike;
    if (expiryDay  != null) position.expiryDay = expiryDay;

    portfolio.positions.push(position);
    if (side === 'short') {
        position._reservedMargin = margin;
    }
    return position;
}

// ---------------------------------------------------------------------------
// placePendingOrder / cancelOrder / checkPendingOrders
// ---------------------------------------------------------------------------

/**
 * Place a pending limit or stop order.
 *
 * @param {string}  type          - 'stock'|'bond'|'call'|'put'
 * @param {string}  side          - 'long'|'short'
 * @param {number}  qty
 * @param {string}  orderType     - 'limit'|'stop'
 * @param {number}  triggerPrice  - Price level that triggers the fill
 * @param {number}  [strike]
 * @param {number}  [expiryDay]
 * @param {string}  [strategyName]
 * @returns {Object} The new order object.
 */
export function placePendingOrder(
    type, side, qty, orderType, triggerPrice,
    strike, expiryDay, strategyName, legs, execMult
) {
    const order = {
        id:           _nextOrderId++,
        type,
        side,
        qty,
        orderType,
        triggerPrice,
        strategyName: strategyName || null,
    };

    if (strike    != null) order.strike    = strike;
    if (expiryDay != null) order.expiryDay = expiryDay;
    if (legs) { order.legs = legs; order.execMult = execMult || 1; }

    portfolio.orders.push(order);
    return order;
}

/**
 * Cancel a pending order by ID.
 * @param {number} orderId
 */
export function cancelOrder(orderId) {
    const idx = portfolio.orders.findIndex(o => o.id === orderId);
    if (idx !== -1) portfolio.orders.splice(idx, 1);
}

/**
 * Evaluate all pending orders against current market conditions and fill
 * any that are triggered.
 *
 * Fill logic (using underlying spot price as the trigger reference):
 *   - limit buy:  fill if currentPrice <= triggerPrice
 *   - limit sell: fill if currentPrice >= triggerPrice
 *   - stop buy:   fill if currentPrice >= triggerPrice
 *   - stop sell:  fill if currentPrice <= triggerPrice
 *
 * @returns {Object[]} Array of filled position objects.
 */
export function checkPendingOrders(sim, currentPrice, currentVol, currentRate, currentDay, q) {
    const filled = [];
    const remaining = [];

    for (const order of portfolio.orders) {
        const { orderType, side, triggerPrice } = order;
        let triggered = false;

        if (order.legs) {
            // Strategy order: trigger when price reaches the trigger level
            if (orderType === 'limit') {
                triggered = currentPrice <= triggerPrice;
            } else if (orderType === 'stop') {
                triggered = currentPrice >= triggerPrice;
            }
        } else if (orderType === 'limit') {
            triggered = side === 'long'
                ? currentPrice <= triggerPrice
                : currentPrice >= triggerPrice;
        } else if (orderType === 'stop') {
            triggered = side === 'long'
                ? currentPrice >= triggerPrice
                : currentPrice <= triggerPrice;
        }

        if (triggered) {
            if (order.legs) {
                // Strategy order -- execute all legs with rollback
                const savedCash = portfolio.cash;
                const savedPositions = portfolio.positions.map(p => ({ ...p }));
                const savedClosedBorrowCost = portfolio.closedBorrowCost;
                const savedMarginDebitCost = portfolio.marginDebitCost;
                const savedTotalDividends = portfolio.totalDividends;
                const savedTotalTrades = portfolio.totalTrades;
                let legFailed = false;
                const legResults = [];
                for (const leg of order.legs) {
                    const legSide = leg.qty < 0 ? 'short' : 'long';
                    const absQty = Math.abs(leg.qty);
                    const pos = executeMarketOrder(
                        sim, leg.type, legSide, absQty,
                        currentPrice, currentVol, currentRate, currentDay,
                        leg.strike, leg.expiryDay, order.strategyName, q
                    );
                    if (pos) {
                        if (!pos.strategyBaseQty) pos.strategyBaseQty = leg._baseQty || absQty;
                        legResults.push(pos);
                    } else { legFailed = true; break; }
                }
                if (legFailed) {
                    portfolio.cash = savedCash;
                    portfolio.closedBorrowCost = savedClosedBorrowCost;
                    portfolio.marginDebitCost = savedMarginDebitCost;
                    portfolio.totalDividends = savedTotalDividends;
                    portfolio.totalTrades = savedTotalTrades;
                    portfolio.positions.length = 0;
                    for (const p of savedPositions) portfolio.positions.push(p);
                    if (typeof showToast !== 'undefined') showToast((order.strategyName || 'Strategy') + ' ' + order.orderType + ' order failed \u2014 insufficient margin.');
                } else {
                    for (const r of legResults) filled.push(r);
                    if (typeof showToast !== 'undefined') showToast((order.strategyName || 'Strategy') + ' ' + order.orderType + ' filled at $' + currentPrice.toFixed(2));
                }
            } else {
                const pos = executeMarketOrder(
                    sim, order.type, order.side, order.qty,
                    currentPrice, currentVol, currentRate, currentDay,
                    order.strike, order.expiryDay, order.strategyName, q
                );
                if (pos) filled.push(pos);
            }
        } else {
            remaining.push(order);
        }
    }

    portfolio.orders = remaining;
    return filled;
}

// ---------------------------------------------------------------------------
// closePosition
// ---------------------------------------------------------------------------

/**
 * Close an existing position at current market prices.
 * Cash is credited/debited accordingly.
 * qty > 0 = long position, qty < 0 = short position.
 *
 * @returns {boolean} true if position was found and closed.
 */
export function closePosition(sim, positionId, currentPrice, currentVol, currentRate, currentDay, q) {
    const idx = portfolio.positions.findIndex(p => p.id === positionId);
    if (idx === -1) return false;

    const pos = portfolio.positions[idx];
    const absQty = Math.abs(pos.qty);
    const mid = unitPrice(pos.type, currentPrice, currentVol, currentRate, currentDay, pos.strike, pos.expiryDay, q);
    const spreadVol = pos.type === 'bond' ? market.sigmaR : currentVol;

    if (pos.qty > 0) {
        const fill = _fillPrice(sim, pos.type, 'short', absQty, mid, currentPrice, pos.strike, spreadVol, pos.expiryDay || 0, currentDay);
        portfolio.cash += fill * absQty;
    } else {
        const fill = _fillPrice(sim, pos.type, 'long', absQty, mid, currentPrice, pos.strike, spreadVol, pos.expiryDay || 0, currentDay);
        const returnedMargin = pos._reservedMargin ?? _marginForShort(
            pos.type, absQty, pos.entryPrice, currentPrice, currentVol,
            currentRate, currentDay, pos.strike, pos.expiryDay
        );
        portfolio.cash += returnedMargin - fill * absQty;
    }

    if (pos.borrowCost) portfolio.closedBorrowCost += pos.borrowCost;
    portfolio.positions.splice(idx, 1);
    return true;
}

// ---------------------------------------------------------------------------
// exerciseOption
// ---------------------------------------------------------------------------

/**
 * Manually exercise an option position.
 * Only valid for 'call' or 'put' positions with qty > 0 (long).
 * (Short options are assigned, not exercised.)
 *
 * Call exercise: pay strike * qty, receive stock position.
 * Put  exercise: receive strike * qty in cash.
 *
 * @param {number}  positionId
 * @param {number}  currentPrice
 * @param {number}  currentDay
 * @param {number}  [currentVol]  - If provided, checks initial margin on debit
 * @param {number}  [currentRate] - If provided, checks initial margin on debit
 * @returns {Object|null} The resulting stock position (calls) or null (puts / error).
 */
export function exerciseOption(positionId, currentPrice, currentDay, currentVol, currentRate, q) {
    const idx = portfolio.positions.findIndex(p => p.id === positionId);
    if (idx === -1) return null;

    const pos = portfolio.positions[idx];
    if (pos.type !== 'call' && pos.type !== 'put') return null;
    if (pos.qty <= 0) return null; // Can only exercise long options

    portfolio.totalExercises++;

    const absQty = pos.qty;
    let stockPos = null;

    if (pos.type === 'call') {
        // Must pay strike per share; receive a long stock position
        // Allowed on margin -- cash can go negative (up to initial margin limit)
        const cost = pos.strike * absQty;
        if (currentVol != null && currentRate != null) {
            if (!_checkInitialMarginDebit(-cost, currentPrice, currentVol, currentRate, currentDay, q)) return null;
        }
        portfolio.cash -= cost;
        stockPos = {
            id:          _nextPositionId++,
            type:        'stock',
            qty:         absQty,
            entryPrice:  pos.strike,
            entryDay:    currentDay,
            strategyName: pos.strategyName || null,
        };
        portfolio.positions.push(stockPos);
    } else {
        // Put: receive strike per share in cash
        portfolio.cash += pos.strike * absQty;
    }

    // Remove the option position
    portfolio.positions.splice(idx, 1);
    return stockPos;
}

// ---------------------------------------------------------------------------
// chargeBorrowInterest
// ---------------------------------------------------------------------------

/**
 * Charge daily borrow interest on short stock and bond positions.
 * dailyCost = |qty| * price * (max(r,0) + borrowSpread * sigma) / 252
 *
 * @param {number} currentPrice - Spot price S
 * @param {number} currentVol   - sqrt(v), NOT variance
 * @param {number} currentRate  - Risk-free rate r
 * @param {number} borrowSpread - Borrow spread factor k
 * @param {number} currentDay   - Current simulation day (for bond pricing)
 * @returns {number} Total interest charged this day
 */
export function chargeBorrowInterest(currentPrice, currentVol, currentRate, borrowSpread, currentDay) {
    let totalCharged = 0;
    const annualRate = Math.max(currentRate, 0) + borrowSpread * currentVol;
    const dailyRate = annualRate / TRADING_DAYS_PER_YEAR;

    // Charge interest on short stock/bond positions
    for (const pos of portfolio.positions) {
        if (pos.qty >= 0) continue;
        if (pos.type !== 'stock' && pos.type !== 'bond') continue;

        let notional;
        if (pos.type === 'stock') {
            notional = Math.abs(pos.qty) * currentPrice;
        } else {
            const T = Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0);
            const bondPrice = vasicekBondPrice(BOND_FACE_VALUE, currentRate, T, market.a, market.b, market.sigmaR);
            notional = Math.abs(pos.qty) * bondPrice;
        }

        const cost = notional * dailyRate;
        portfolio.cash -= cost;
        pos.borrowCost = (pos.borrowCost || 0) + cost;
        totalCharged += cost;
    }

    // Charge interest on negative cash (margin debit)
    if (portfolio.cash < 0) {
        const debitCost = Math.abs(portfolio.cash) * dailyRate;
        portfolio.cash -= debitCost;
        portfolio.marginDebitCost = (portfolio.marginDebitCost || 0) + debitCost;
        totalCharged += debitCost;
    }

    return totalCharged;
}

// ---------------------------------------------------------------------------
// processDividends
// ---------------------------------------------------------------------------

/**
 * Pay quarterly dividends on stock positions.
 * Called every 63 trading days (aligned with chain expiry cycle).
 * Long stock receives cash; short stock pays cash.
 *
 * @param {number} currentPrice - Spot price S
 * @param {number} q            - Continuous dividend yield (annualized)
 * @returns {number} Net dividend payment (positive = received, negative = paid)
 */
export function processDividends(currentPrice, q) {
    if (!q || q <= 0) return 0;
    const dividendPerShare = currentPrice * q / 4; // quarterly
    let net = 0;

    for (const pos of portfolio.positions) {
        if (pos.type !== 'stock') continue;
        // pos.qty is signed: positive = long (receive), negative = short (pay)
        const payment = pos.qty * dividendPerShare;
        portfolio.cash += payment;
        net += payment;
    }

    portfolio.totalDividends = (portfolio.totalDividends || 0) + net;
    return net;
}

// ---------------------------------------------------------------------------
// processExpiry
// ---------------------------------------------------------------------------

/**
 * Process expiry for all positions expiring on `expiryDay`.
 *
 * Expiring positions are closed at market value. If any expiring position
 * belongs to a strategy, all remaining positions in that strategy are also
 * unwound at market value.
 *
 * @param {number} expiryDay     - The simulation day being expired
 * @param {number} currentPrice
 * @param {number} currentDay    - Current simulation day
 * @param {number} currentVol    - sqrt(v)
 * @param {number} currentRate   - Risk-free rate r
 * @param {number} q             - Dividend yield
 * @returns {{ expired: Object[], unwound: Object[] }}
 */
export function processExpiry(sim, expiryDay, currentPrice, currentDay, currentVol, currentRate, q) {
    const expired = [];
    const expiredStrategies = new Set();

    for (let i = portfolio.positions.length - 1; i >= 0; i--) {
        const pos = portfolio.positions[i];
        if (pos.expiryDay !== expiryDay) continue;

        if (pos.strategyName) expiredStrategies.add(pos.strategyName);

        if (pos.type === 'bond') {
            if (pos.qty > 0) {
                portfolio.cash += BOND_FACE_VALUE * Math.abs(pos.qty);
            } else {
                const returnedMargin = pos._reservedMargin ?? _marginForShort(
                    pos.type, Math.abs(pos.qty), pos.entryPrice, 0, 0,
                    0, currentDay, pos.strike, pos.expiryDay
                );
                portfolio.cash += returnedMargin - BOND_FACE_VALUE * Math.abs(pos.qty);
            }
            if (pos.borrowCost) portfolio.closedBorrowCost += pos.borrowCost;
            portfolio.positions.splice(i, 1);
            expired.push(pos);
            continue;
        }
        if (pos.type !== 'call' && pos.type !== 'put') continue;

        // Close at market value (no auto-exercise)
        closePosition(sim, pos.id, currentPrice, currentVol, currentRate, currentDay, q);
        expired.push(pos);
    }

    // Unwind remaining positions in any strategy that had a leg expire
    const unwound = [];
    if (expiredStrategies.size > 0) {
        for (let i = portfolio.positions.length - 1; i >= 0; i--) {
            const pos = portfolio.positions[i];
            if (!pos.strategyName || !expiredStrategies.has(pos.strategyName)) continue;
            closePosition(sim, pos.id, currentPrice, currentVol, currentRate, currentDay, q);
            unwound.push(pos);
        }
    }

    return { expired, unwound };
}

// ---------------------------------------------------------------------------
// portfolioValue
// ---------------------------------------------------------------------------

/**
 * Compute total mark-to-market portfolio value (cash + positions).
 * qty > 0 = long, qty < 0 = short.
 *
 * @returns {number} Total portfolio value in dollars.
 */
export function portfolioValue(currentPrice, currentVol, currentRate, currentDay, q) {
    let total = portfolio.cash;
    for (const pos of portfolio.positions) {
        total += computePositionValue(pos, currentPrice, currentVol, currentRate, currentDay, q);
        if (pos._reservedMargin) total += pos._reservedMargin;
    }
    return total;
}

// ---------------------------------------------------------------------------
// marginRequirement
// ---------------------------------------------------------------------------

/**
 * Compute total current margin requirement for all short positions (qty < 0).
 *
 * For short stock/bonds: Reg-T maintenance margin (25% of current value).
 * For short options:     max(SHORT_OPTION_MARGIN_PCT * underlying, current option value).
 *
 * @returns {number} Total margin dollars required.
 */
export function marginRequirement(currentPrice, currentVol, currentRate, currentDay, q) {
    let total = 0;

    for (const pos of portfolio.positions) {
        if (pos.qty >= 0) continue; // Only short positions

        const absQty = Math.abs(pos.qty);
        const mid = unitPrice(pos.type, currentPrice, currentVol, currentRate, currentDay, pos.strike, pos.expiryDay, q);
        if (pos.type === 'call' || pos.type === 'put') {
            total += Math.max(SHORT_OPTION_MARGIN_PCT * currentPrice * absQty, mid * absQty);
        } else {
            total += MAINTENANCE_MARGIN * mid * absQty;
        }
    }

    // Margin debit (negative cash from buying on margin) requires maintenance too.
    // The debit itself is the "loan" -- require maintenance margin on the debit amount.
    if (portfolio.cash < 0) {
        total += MAINTENANCE_MARGIN * Math.abs(portfolio.cash);
    }

    return total;
}

// ---------------------------------------------------------------------------
// checkMargin
// ---------------------------------------------------------------------------

/**
 * Check whether the portfolio is at or below the maintenance margin threshold.
 * Single-pass over positions: computes equity and required margin together.
 *
 * @returns {{ triggered: boolean, equity: number, required: number }}
 */
export function checkMargin(currentPrice, currentVol, currentRate, currentDay, q) {
    let equity = portfolio.cash;
    let required = 0;

    for (const pos of portfolio.positions) {
        equity += computePositionValue(pos, currentPrice, currentVol, currentRate, currentDay, q);
        if (pos._reservedMargin) equity += pos._reservedMargin;

        if (pos.qty < 0) {
            const absQty = Math.abs(pos.qty);
            const mid = unitPrice(pos.type, currentPrice, currentVol, currentRate, currentDay, pos.strike, pos.expiryDay, q);
            if (pos.type === 'call' || pos.type === 'put') {
                required += Math.max(SHORT_OPTION_MARGIN_PCT * currentPrice * absQty, mid * absQty);
            } else {
                required += MAINTENANCE_MARGIN * mid * absQty;
            }
        }
    }

    if (portfolio.cash < 0) {
        required += MAINTENANCE_MARGIN * Math.abs(portfolio.cash);
    }

    const triggered = required > 0 && equity < required;
    return { triggered, equity, required };
}

// ---------------------------------------------------------------------------
// liquidateAll
// ---------------------------------------------------------------------------

/**
 * Close all open positions at current market prices.
 */
export function liquidateAll(sim, currentPrice, currentVol, currentRate, currentDay, q) {
    while (portfolio.positions.length > 0) {
        const pos = portfolio.positions[portfolio.positions.length - 1];
        closePosition(sim, pos.id, currentPrice, currentVol, currentRate, currentDay, q);
    }
}

// ---------------------------------------------------------------------------
// aggregateGreeks
// ---------------------------------------------------------------------------

/**
 * Sum all option Greeks across the portfolio.
 * - Long positions contribute positively.
 * - Short positions have their delta, gamma, vega, and rho negated
 *   (theta is also negated for short options).
 *
 * @returns {{ delta: number, gamma: number, theta: number, vega: number, rho: number }}
 */
export function aggregateGreeks(currentPrice, currentVol, currentRate, currentDay, q) {
    let delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0;

    for (const pos of portfolio.positions) {
        // qty is already signed: positive = long, negative = short
        const w = pos.qty;

        if (pos.type === 'stock') {
            // Stock delta = 1 per share
            delta += w;
            continue;
        }

        if (pos.type === 'bond') {
            const dte = pos.expiryDay != null
                ? Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0)
                : 0;
            if (dte > 0) {
                const bondP = vasicekBondPrice(BOND_FACE_VALUE, currentRate, dte, market.a, market.b, market.sigmaR);
                const B = vasicekDuration(dte, market.a);
                rho += -B * bondP * w;
                // Bond theta: accrual per trading day
                const a = market.a;
                if (a >= 1e-8) {
                    const expAT = Math.exp(-a * dte);
                    const sig2 = market.sigmaR * market.sigmaR;
                    const dLnP = expAT * (market.b - sig2 / (2 * a * a)) + sig2 * B / (2 * a) - expAT * currentRate;
                    theta += -bondP * dLnP / TRADING_DAYS_PER_YEAR * w;
                } else {
                    theta += currentRate * bondP / TRADING_DAYS_PER_YEAR * w;
                }
            }
            continue;
        }

        if (pos.type !== 'call' && pos.type !== 'put') continue;

        const dte    = pos.expiryDay != null
            ? Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0)
            : 0;
        const isPut  = pos.type === 'put';
        if (dte <= 0 || market.v <= 0) continue;
        const sigEff = computeEffectiveSigma(market.v, dte, market.kappa, market.theta, market.xi);
        const sig = computeSkewSigma(sigEff, currentPrice, pos.strike, dte, market.rho, market.xi, market.kappa);
        if (!_greekTrees) _greekTrees = allocGreekTrees();
        prepareGreekTrees(dte, currentRate, sig, q, currentDay, _greekTrees);
        const greeks = computeGreeksWithTrees(currentPrice, pos.strike, isPut, _greekTrees);

        delta += w * greeks.delta;
        gamma += w * greeks.gamma;
        theta += w * greeks.theta;
        vega  += w * greeks.vega;
        rho   += w * greeks.rho;
    }

    return { delta, gamma, theta, vega, rho };
}
