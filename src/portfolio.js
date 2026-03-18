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
} from './config.js';

import { priceAmerican, computeGreeks, computeSpread } from './pricing.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const portfolio = {
    cash:           INITIAL_CAPITAL,
    initialCapital: INITIAL_CAPITAL,
    positions: [],  // { id, type, side, qty, strike?, expiryDay?, entryPrice, entryDay, strategyName? }
    orders:    [],  // { id, type, side, qty, orderType, triggerPrice, strike?, expiryDay?, strategyName? }
    strategies:[],  // { name, legs: [{ type, side, qty, strike?, expiryDay? }] }
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
    portfolio.strategies     = [];
    _nextPositionId = 1;
    _nextOrderId    = 1;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the fair (mid) price for a given instrument at current market
 * conditions.  Returns the mid-market price per unit.
 */
function _fairPrice(type, currentPrice, currentRate, currentDay, strike, expiryDay, currentVol) {
    switch (type) {
        case 'stock':
            return currentPrice;

        case 'bond': {
            const dte = (expiryDay - currentDay) / TRADING_DAYS_PER_YEAR; // years
            return BOND_FACE_VALUE * Math.exp(-currentRate * Math.max(dte, 0));
        }

        case 'call':
        case 'put': {
            const dte = Math.max((expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0);
            const isPut = type === 'put';
            return priceAmerican(currentPrice, strike, dte, currentRate, currentVol, isPut);
        }

        default:
            return 0;
    }
}

/**
 * Compute fill price for a buy or sell, accounting for bid/ask spread on
 * options.
 * @param {string}  type      - 'stock'|'bond'|'call'|'put'
 * @param {string}  side      - 'long'|'short'
 * @param {number}  mid       - Mid/fair price
 * @param {number}  currentPrice
 * @param {number}  strike
 * @param {number}  currentVol
 * @returns {number} Fill price per unit
 */
function _fillPrice(type, side, mid, currentPrice, strike, currentVol) {
    if (type === 'call' || type === 'put') {
        const halfSpread = computeSpread(mid, currentPrice, strike, currentVol) / 2;
        // Long positions pay the ask; short positions receive the bid.
        return side === 'long' ? mid + halfSpread : mid - halfSpread;
    }
    // Stock and bond: no spread model — trade at mid.
    return mid;
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

// ---------------------------------------------------------------------------
// executeMarketOrder
// ---------------------------------------------------------------------------

/**
 * Execute a market order immediately at current prices.
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
 * @returns {Object|null} The new position object, or null if insufficient cash.
 */
export function executeMarketOrder(
    type, side, qty,
    currentPrice, currentVol, currentRate, currentDay,
    strike, expiryDay, strategyName
) {
    const mid  = _fairPrice(type, currentPrice, currentRate, currentDay, strike, expiryDay, currentVol);
    const fill = _fillPrice(type, side, mid, currentPrice, strike, currentVol);

    let cashDelta = 0;  // Net change to portfolio.cash (positive = credit)

    if (side === 'long') {
        // Cost of buying
        const cost = fill * qty;
        if (portfolio.cash < cost) return null;  // Insufficient cash
        cashDelta = -cost;

    } else {
        // Short position: credit premium/proceeds, reserve margin
        const proceeds = fill * qty;
        const margin   = _marginForShort(
            type, qty, fill, currentPrice, currentVol, currentRate,
            currentDay, strike, expiryDay
        );
        // Margin is reserved from the credited proceeds + existing cash.
        // Net cash change: +proceeds (credited) - margin (reserved/locked).
        // We model margin simply: cash increases by proceeds but we check
        // whether total cash after crediting covers the margin reserve.
        // If cash + proceeds < margin we can't open the short.
        if (portfolio.cash + proceeds < margin) return null;
        cashDelta = proceeds - margin;  // margin is locked from cash
    }

    portfolio.cash += cashDelta;

    const position = {
        id:          _nextPositionId++,
        type,
        side,
        qty,
        entryPrice:  fill,
        entryDay:    currentDay,
        strategyName: strategyName || null,
    };

    if (strike     != null) position.strike    = strike;
    if (expiryDay  != null) position.expiryDay = expiryDay;

    portfolio.positions.push(position);
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
    strike, expiryDay, strategyName
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
export function checkPendingOrders(currentPrice, currentVol, currentRate, currentDay) {
    const filled = [];
    const remaining = [];

    for (const order of portfolio.orders) {
        const { orderType, side, triggerPrice } = order;
        let triggered = false;

        if (orderType === 'limit') {
            triggered = side === 'long'
                ? currentPrice <= triggerPrice
                : currentPrice >= triggerPrice;
        } else if (orderType === 'stop') {
            triggered = side === 'long'
                ? currentPrice >= triggerPrice
                : currentPrice <= triggerPrice;
        }

        if (triggered) {
            const pos = executeMarketOrder(
                order.type, order.side, order.qty,
                currentPrice, currentVol, currentRate, currentDay,
                order.strike, order.expiryDay, order.strategyName
            );
            if (pos) filled.push(pos);
            // If order could not be filled (null), silently drop it.
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
 *
 * For short positions the margin reserve is returned to cash when the
 * position is closed.  We approximate the returned margin as the original
 * margin cost (entryPrice * qty for stock, etc.), but since we stored the
 * net cashDelta at open, we compute the close P&L from fair value directly.
 *
 * Simplified approach:
 *   - Long:  credit current fair value * qty to cash
 *   - Short: debit current fair value * qty from cash (cost to close)
 *            then return margin by adding back margin reserve estimate
 *
 * @returns {boolean} true if position was found and closed.
 */
export function closePosition(positionId, currentPrice, currentVol, currentRate, currentDay) {
    const idx = portfolio.positions.findIndex(p => p.id === positionId);
    if (idx === -1) return false;

    const pos = portfolio.positions[idx];
    const mid = _fairPrice(
        pos.type, currentPrice, currentRate, currentDay,
        pos.strike, pos.expiryDay, currentVol
    );

    if (pos.side === 'long') {
        // Sell at bid
        const halfSpread = (pos.type === 'call' || pos.type === 'put')
            ? computeSpread(mid, currentPrice, pos.strike, currentVol) / 2
            : 0;
        const bidPrice = mid - halfSpread;
        portfolio.cash += bidPrice * pos.qty;
    } else {
        // Closing a short: buy back at ask to unwind
        const halfSpread = (pos.type === 'call' || pos.type === 'put')
            ? computeSpread(mid, currentPrice, pos.strike, currentVol) / 2
            : 0;
        const askPrice = mid + halfSpread;
        // Deduct cost to buy back; also return the original margin reserve.
        // Margin was already deducted from cash at open (stored implicitly).
        // The margin return = original margin locked - cost to unwind.
        const returnedMargin = _marginForShort(
            pos.type, pos.qty, pos.entryPrice, currentPrice, currentVol,
            currentRate, currentDay, pos.strike, pos.expiryDay
        );
        portfolio.cash += returnedMargin - askPrice * pos.qty;
    }

    portfolio.positions.splice(idx, 1);
    return true;
}

// ---------------------------------------------------------------------------
// exerciseOption
// ---------------------------------------------------------------------------

/**
 * Manually exercise an option position.
 * Only valid for 'call' or 'put' positions with side === 'long'.
 * (Short options are assigned, not exercised.)
 *
 * Call exercise: pay strike * qty, receive stock position.
 * Put  exercise: receive strike * qty in cash.
 *
 * @returns {Object|null} The resulting stock position (calls) or null (puts / error).
 */
export function exerciseOption(positionId, currentPrice, currentDay) {
    const idx = portfolio.positions.findIndex(p => p.id === positionId);
    if (idx === -1) return null;

    const pos = portfolio.positions[idx];
    if (pos.type !== 'call' && pos.type !== 'put') return null;

    let stockPos = null;

    if (pos.type === 'call') {
        // Must pay strike per share; receive a long stock position
        const cost = pos.strike * pos.qty;
        if (portfolio.cash < cost) return null; // Can't afford exercise
        portfolio.cash -= cost;
        stockPos = {
            id:          _nextPositionId++,
            type:        'stock',
            side:        'long',
            qty:         pos.qty,
            entryPrice:  pos.strike,
            entryDay:    currentDay,
            strategyName: pos.strategyName || null,
        };
        portfolio.positions.push(stockPos);
    } else {
        // Put: receive strike per share in cash
        portfolio.cash += pos.strike * pos.qty;
    }

    // Remove the option position
    portfolio.positions.splice(idx, 1);
    return stockPos;
}

// ---------------------------------------------------------------------------
// processExpiry
// ---------------------------------------------------------------------------

/**
 * Process expiry for all positions expiring on `expiryDay`.
 *
 * ITM calls (currentPrice > strike): auto-exercise.
 * ITM puts  (currentPrice < strike): auto-exercise.
 * OTM:                               expire worthless (remove from positions).
 *
 * @param {number} expiryDay   - The simulation day being expired
 * @param {number} currentPrice
 * @param {number} currentDay  - Current simulation day
 * @returns {{ exercised: Object[], expired: Object[] }}
 */
export function processExpiry(expiryDay, currentPrice, currentDay) {
    const exercised = [];
    const expired   = [];

    // Collect positions expiring today
    const expiring = portfolio.positions.filter(p => p.expiryDay === expiryDay);

    for (const pos of expiring) {
        if (pos.type !== 'call' && pos.type !== 'put') continue;

        const itm = pos.type === 'call'
            ? currentPrice > pos.strike
            : currentPrice < pos.strike;

        if (itm && pos.side === 'long') {
            const result = exerciseOption(pos.id, currentPrice, currentDay);
            exercised.push({ position: pos, result });
        } else {
            // Expire worthless: for short positions, the premium is kept (already in cash);
            // for long positions, the option value goes to zero.
            // Return margin on short options.
            if (pos.side === 'short') {
                const returnedMargin = _marginForShort(
                    pos.type, pos.qty, pos.entryPrice, currentPrice, 0,
                    0, currentDay, pos.strike, pos.expiryDay
                );
                portfolio.cash += returnedMargin;
            }
            const idx = portfolio.positions.findIndex(p => p.id === pos.id);
            if (idx !== -1) portfolio.positions.splice(idx, 1);
            expired.push(pos);
        }
    }

    return { exercised, expired };
}

// ---------------------------------------------------------------------------
// saveStrategy / executeStrategy
// ---------------------------------------------------------------------------

/**
 * Save a named multi-leg strategy.
 * @param {string}   name
 * @param {Object[]} legs  - [{ type, side, qty, strike?, expiryDay? }]
 */
export function saveStrategy(name, legs) {
    // Replace existing strategy with the same name, or append.
    const idx = portfolio.strategies.findIndex(s => s.name === name);
    const entry = { name, legs };
    if (idx !== -1) {
        portfolio.strategies[idx] = entry;
    } else {
        portfolio.strategies.push(entry);
    }
}

/**
 * Execute all legs of a saved strategy as market orders.
 *
 * @param {string} strategyName
 * @param {number} currentPrice
 * @param {number} currentVol
 * @param {number} currentRate
 * @param {number} currentDay
 * @returns {Object[]} Array of filled position objects (nulls filtered out).
 */
export function executeStrategy(strategyName, currentPrice, currentVol, currentRate, currentDay) {
    const strategy = portfolio.strategies.find(s => s.name === strategyName);
    if (!strategy) return [];

    const positions = [];
    for (const leg of strategy.legs) {
        const pos = executeMarketOrder(
            leg.type, leg.side, leg.qty,
            currentPrice, currentVol, currentRate, currentDay,
            leg.strike, leg.expiryDay, strategyName
        );
        if (pos) positions.push(pos);
    }
    return positions;
}

// ---------------------------------------------------------------------------
// portfolioValue
// ---------------------------------------------------------------------------

/**
 * Compute total mark-to-market portfolio value (cash + positions).
 *
 * Short stock: value is qty * (2 * entryPrice - currentPrice)
 *   (reflects P&L: if price drops, short gains; if price rises, short loses)
 *
 * @returns {number} Total portfolio value in dollars.
 */
export function portfolioValue(currentPrice, currentVol, currentRate, currentDay) {
    let total = portfolio.cash;

    for (const pos of portfolio.positions) {
        const dte = pos.expiryDay != null
            ? Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0)
            : 0;

        let posValue = 0;

        switch (pos.type) {
            case 'stock':
                posValue = pos.side === 'long'
                    ? pos.qty * currentPrice
                    : pos.qty * (2 * pos.entryPrice - currentPrice);
                break;

            case 'bond':
                posValue = pos.qty * BOND_FACE_VALUE * Math.exp(-currentRate * dte);
                break;

            case 'call':
            case 'put': {
                const isPut  = pos.type === 'put';
                const optMid = priceAmerican(currentPrice, pos.strike, dte, currentRate, currentVol, isPut);
                posValue = pos.side === 'long'
                    ? pos.qty * optMid
                    : pos.qty * (pos.entryPrice - optMid); // short: locked-in premium - current value
                break;
            }
        }

        total += posValue;
    }

    return total;
}

// ---------------------------------------------------------------------------
// marginRequirement
// ---------------------------------------------------------------------------

/**
 * Compute total current margin requirement for all short positions.
 *
 * For short stock/bonds: Reg-T maintenance margin (25% of current value).
 * For short options:     max(SHORT_OPTION_MARGIN_PCT * underlying, current option value).
 *
 * @returns {number} Total margin dollars required.
 */
export function marginRequirement(currentPrice, currentVol, currentRate, currentDay) {
    let total = 0;

    for (const pos of portfolio.positions) {
        if (pos.side !== 'short') continue;

        const dte = pos.expiryDay != null
            ? Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0)
            : 0;

        switch (pos.type) {
            case 'stock':
                // Maintenance margin on current market value
                total += MAINTENANCE_MARGIN * currentPrice * pos.qty;
                break;

            case 'bond': {
                const bondPrice = BOND_FACE_VALUE * Math.exp(-currentRate * dte);
                total += MAINTENANCE_MARGIN * bondPrice * pos.qty;
                break;
            }

            case 'call':
            case 'put': {
                const isPut  = pos.type === 'put';
                const optMid = priceAmerican(currentPrice, pos.strike, dte, currentRate, currentVol, isPut);
                total += Math.max(SHORT_OPTION_MARGIN_PCT * currentPrice * pos.qty, optMid * pos.qty);
                break;
            }
        }
    }

    return total;
}

// ---------------------------------------------------------------------------
// checkMargin
// ---------------------------------------------------------------------------

/**
 * Check whether the portfolio is at or below the maintenance margin threshold.
 *
 * @returns {{ triggered: boolean, equity: number, required: number }}
 */
export function checkMargin(currentPrice, currentVol, currentRate, currentDay) {
    const equity   = portfolioValue(currentPrice, currentVol, currentRate, currentDay);
    const required = marginRequirement(currentPrice, currentVol, currentRate, currentDay);

    // Total notional of all positions (long + short, measured at current prices)
    let totalPositionValue = 0;
    for (const pos of portfolio.positions) {
        const dte = pos.expiryDay != null
            ? Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0)
            : 0;

        switch (pos.type) {
            case 'stock':
                totalPositionValue += currentPrice * pos.qty;
                break;
            case 'bond':
                totalPositionValue += BOND_FACE_VALUE * Math.exp(-currentRate * dte) * pos.qty;
                break;
            case 'call':
            case 'put': {
                const isPut  = pos.type === 'put';
                const optMid = priceAmerican(currentPrice, pos.strike, dte, currentRate, currentVol, isPut);
                totalPositionValue += optMid * pos.qty;
                break;
            }
        }
    }

    const triggered = equity < MAINTENANCE_MARGIN * totalPositionValue;

    return { triggered, equity, required };
}

// ---------------------------------------------------------------------------
// liquidateAll
// ---------------------------------------------------------------------------

/**
 * Close all open positions at current market prices.
 */
export function liquidateAll(currentPrice, currentVol, currentRate, currentDay) {
    // Snapshot IDs first — closePosition modifies the array in place.
    const ids = portfolio.positions.map(p => p.id);
    for (const id of ids) {
        closePosition(id, currentPrice, currentVol, currentRate, currentDay);
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
export function aggregateGreeks(currentPrice, currentVol, currentRate, currentDay) {
    let delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0;

    for (const pos of portfolio.positions) {
        if (pos.type !== 'call' && pos.type !== 'put') continue;

        const dte    = pos.expiryDay != null
            ? Math.max((pos.expiryDay - currentDay) / TRADING_DAYS_PER_YEAR, 0)
            : 0;
        const isPut  = pos.type === 'put';
        const greeks = computeGreeks(currentPrice, pos.strike, dte, currentRate, currentVol, isPut);

        const sign = pos.side === 'long' ? 1 : -1;
        const w    = sign * pos.qty;

        delta += w * greeks.delta;
        gamma += w * greeks.gamma;
        theta += w * greeks.theta;
        vega  += w * greeks.vega;
        rho   += w * greeks.rho;
    }

    return { delta, gamma, theta, vega, rho };
}
