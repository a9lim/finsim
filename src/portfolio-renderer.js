/* =====================================================
   portfolio-renderer.js -- Portfolio display with DOM
   diffing for the Shoals trading simulator.

   Extracted from ui.js. Updates P&L values in-place
   instead of rebuilding all position rows every day.
   ===================================================== */

import { computePositionPnl } from './position-value.js';
import { fmtDollar, fmtQty, pnlClass, fmtDte, posTypeLabel } from './format-helpers.js';

// ---------------------------------------------------------------------------
// Margin display formatter (pure function -- no portfolio access)
// ---------------------------------------------------------------------------

function _computeMarginDisplay(equity, required) {
    if (required <= 0) return { label: 'OK', cls: 'margin-ok' };
    if (equity < required) return { label: 'MARGIN CALL', cls: 'margin-alert' };
    const pct = Math.min((equity / required) * 100, 999);
    if (equity < required * 1.2) return { label: 'LOW (' + pct.toFixed(0) + '%)', cls: 'margin-warn' };
    return { label: 'OK (' + pct.toFixed(0) + '%)', cls: 'margin-ok' };
}

// ---------------------------------------------------------------------------
// _buildPositionRow
// ---------------------------------------------------------------------------

function _buildPositionRow(pos, currentPrice, vol, rate, day, q) {
    const absQty     = Math.abs(pos.qty);
    const typeLabel  = posTypeLabel(pos.type, pos.qty);
    const pnl        = computePositionPnl(pos, currentPrice, vol, rate, day, q);
    const entryTotal = pos.entryPrice * absQty;
    const isOption   = pos.type === 'call' || pos.type === 'put';
    const strikeStr  = isOption && pos.strike != null ? ' K' + pos.strike : '';
    const expiryStr  = pos.expiryDay != null ? ' ' + fmtDte(pos.expiryDay - day) : '';
    const labelStr   = typeLabel + strikeStr + expiryStr + ' x' + fmtQty(absQty);

    const row = document.createElement('div');
    row.className = 'data-row pos-row stat-row';
    row.dataset.posId = pos.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'pos-label stat-label';
    labelEl.textContent = labelStr;

    const pnlEl = document.createElement('span');
    pnlEl.className = 'pos-pnl stat-value ' + pnlClass(pnl);
    pnlEl.textContent = fmtDollar(pnl);
    pnlEl.title = 'Entry ' + fmtDollar(entryTotal);

    const actions = document.createElement('div');
    actions.className = 'pos-actions';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ghost-btn pos-close-btn';
    closeBtn.textContent = 'X';
    closeBtn.title = 'Close position';
    closeBtn.addEventListener('click', () => {
        closeBtn.dispatchEvent(new CustomEvent('shoals:closePosition', { detail: { id: pos.id }, bubbles: true }));
        if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
    });
    actions.appendChild(closeBtn);

    if (isOption && pos.qty > 0) {
        const exBtn = document.createElement('button');
        exBtn.className = 'ghost-btn pos-exercise-btn';
        exBtn.textContent = 'Ex';
        exBtn.title = 'Exercise option';
        exBtn.addEventListener('click', () => {
            exBtn.dispatchEvent(new CustomEvent('shoals:exerciseOption', { detail: { id: pos.id }, bubbles: true }));
            if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
        });
        actions.appendChild(exBtn);
    }

    row.appendChild(labelEl);
    row.appendChild(pnlEl);
    row.appendChild(actions);
    return row;
}

// ---------------------------------------------------------------------------
// _buildOrderRow
// ---------------------------------------------------------------------------

function _buildOrderRow(order) {
    const typeLabel = posTypeLabel(order.type, order.side);
    const strikeStr = order.strike != null ? ' K' + order.strike : '';
    const labelStr  = typeLabel + strikeStr + ' x' + fmtQty(order.qty) + ' ' + order.orderType + ' @ ' + fmtDollar(order.triggerPrice);

    const row = document.createElement('div');
    row.className = 'data-row order-row stat-row';
    row.dataset.orderId = order.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'order-label stat-label';
    labelEl.textContent = labelStr;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost-btn order-cancel-btn';
    cancelBtn.textContent = 'X';
    cancelBtn.title = 'Cancel order';
    cancelBtn.addEventListener('click', () => {
        cancelBtn.dispatchEvent(new CustomEvent('shoals:cancelOrder', { detail: { id: order.id }, bubbles: true }));
        if (typeof _haptics !== 'undefined') _haptics.trigger('light');
    });

    row.appendChild(labelEl);
    row.appendChild(cancelBtn);
    return row;
}

// ---------------------------------------------------------------------------
// DOM diffing helpers
// ---------------------------------------------------------------------------

function _diffPositionRows(container, positions, S, vol, rate, day, emptyHint, q) {
    if (!container._rowMap) container._rowMap = new Map();
    const rowMap = container._rowMap;

    const currentIds = new Set(positions.map(p => String(p.id)));

    // Remove rows for closed positions
    for (const row of container.querySelectorAll('[data-pos-id]')) {
        const posId = row.dataset.posId;
        if (!currentIds.has(posId)) {
            rowMap.delete(posId);
            row.remove();
        }
    }

    if (positions.length === 0) {
        // Show hint only if not already present
        if (!container.querySelector('.panel-hint')) {
            container.textContent = '';
            rowMap.clear();
            const hint = document.createElement('p');
            hint.className = 'panel-hint';
            hint.textContent = emptyHint;
            container.appendChild(hint);
        }
        return;
    }

    // Remove stale hint
    const hint = container.querySelector('.panel-hint');
    if (hint) hint.remove();

    // Add new or update existing
    for (const pos of positions) {
        const posId = String(pos.id);
        const existing = rowMap.get(posId);
        if (existing) {
            // Update P&L in-place
            const pnl = computePositionPnl(pos, S, vol, rate, day, q);
            const pnlEl = existing.querySelector('.pos-pnl');
            if (pnlEl) {
                pnlEl.textContent = fmtDollar(pnl);
                pnlEl.className = 'pos-pnl stat-value ' + pnlClass(pnl);
            }
            // Update label (DTE changes each day)
            const absQty = Math.abs(pos.qty);
            const typeLabel = posTypeLabel(pos.type, pos.qty);
            const isOption = pos.type === 'call' || pos.type === 'put';
            const strikeStr = isOption && pos.strike != null ? ' K' + pos.strike : '';
            const expiryStr = pos.expiryDay != null ? ' ' + fmtDte(pos.expiryDay - day) : '';
            const labelStr = typeLabel + strikeStr + expiryStr + ' x' + absQty;
            const labelEl = existing.querySelector('.pos-label');
            if (labelEl) labelEl.textContent = labelStr;
        } else {
            const row = _buildPositionRow(pos, S, vol, rate, day, q);
            rowMap.set(posId, row);
            container.appendChild(row);
        }
    }
}

function _diffOrderRows(container, orders) {
    const currentIds = new Set(orders.map(o => String(o.id)));

    // Remove cancelled/filled orders
    for (const row of container.querySelectorAll('[data-order-id]')) {
        if (!currentIds.has(row.dataset.orderId)) row.remove();
    }

    if (orders.length === 0) {
        if (!container.querySelector('.panel-hint')) {
            container.textContent = '';
            const hint = document.createElement('p');
            hint.className = 'panel-hint';
            hint.textContent = 'No pending orders.';
            container.appendChild(hint);
        }
        return;
    }

    // Remove stale hint
    const hint = container.querySelector('.panel-hint');
    if (hint) hint.remove();

    // Add new orders (orders don't change once placed, so no update needed)
    for (const order of orders) {
        const orderId = String(order.id);
        const existing = container.querySelector('[data-order-id="' + orderId + '"]');
        if (!existing) {
            container.appendChild(_buildOrderRow(order));
        }
    }
}

// ---------------------------------------------------------------------------
// updatePortfolioDisplay -- main export
// ---------------------------------------------------------------------------

export function updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day, marginInfo, q) {
    $.cashDisplay.textContent = fmtDollar(portfolio.cash);
    $.cashDisplay.className = 'stat-value ' + (portfolio.cash < 0 ? 'pnl-down' : '');

    // Use marginInfo.equity when available -- it's the canonical portfolio value computed
    // by the margin system (cash + all position mark-to-market values). Fall back to cash
    // only when marginInfo is not provided (e.g. called before first margin check).
    const totalValue = (marginInfo && marginInfo.equity != null) ? marginInfo.equity : portfolio.cash;
    $.portfolioValue.textContent = fmtDollar(totalValue);

    const pnl = totalValue - portfolio.initialCapital;
    $.totalPnl.textContent = fmtDollar(pnl);
    $.totalPnl.className   = 'stat-value ' + pnlClass(pnl);

    // Margin display from pre-computed values
    const marginDisplay = marginInfo
        ? _computeMarginDisplay(marginInfo.equity, marginInfo.required)
        : { label: 'OK', cls: 'margin-ok' };
    $.marginStatus.textContent = marginDisplay.label;
    $.marginStatus.className   = 'stat-value ' + marginDisplay.cls;


    // Cumulative borrow cost across all positions (including closed -- tracked on portfolio)
    let totalBorrowCost = 0;
    for (const pos of portfolio.positions) {
        if (pos.borrowCost) totalBorrowCost += pos.borrowCost;
    }
    totalBorrowCost += portfolio.closedBorrowCost || 0;
    totalBorrowCost += portfolio.marginDebitCost || 0;
    if ($.borrowCostDisplay) {
        $.borrowCostDisplay.textContent = fmtDollar(-totalBorrowCost);
        $.borrowCostDisplay.className = 'stat-value ' + (totalBorrowCost > 0 ? pnlClass(-totalBorrowCost) : '');
    }

    // Cumulative dividend income
    const totalDividends = portfolio.totalDividends || 0;
    if ($.dividendDisplay) {
        $.dividendDisplay.textContent = fmtDollar(totalDividends);
        $.dividendDisplay.className = 'stat-value ' + (totalDividends !== 0 ? pnlClass(totalDividends) : '');
    }

    // Default (non-strategy) positions -- DOM diff
    const defaultPos = portfolio.positions.filter(p => !p.strategyName);
    _diffPositionRows($.defaultPositions, defaultPos, currentPrice, vol, rate, day, 'No open positions.', q);

    // Strategy positions -- grouped by name, single box per strategy
    const strategyNames = [...new Set(
        portfolio.positions.filter(p => p.strategyName).map(p => p.strategyName)
    )];

    if (strategyNames.length === 0) {
        const existingGroups = $.strategyPositions.querySelectorAll('.strategy-group');
        for (const g of existingGroups) g.remove();
        if (!$.strategyPositions.querySelector('.panel-hint')) {
            $.strategyPositions.textContent = '';
            const hint = document.createElement('p');
            hint.className = 'panel-hint';
            hint.textContent = 'No strategy positions.';
            $.strategyPositions.appendChild(hint);
        }
    } else {
        const hint = $.strategyPositions.querySelector('.panel-hint');
        if (hint) hint.remove();

        // Remove groups for strategies no longer present
        for (const g of $.strategyPositions.querySelectorAll('.strategy-group')) {
            if (!strategyNames.includes(g.dataset.strategyName)) g.remove();
        }

        for (const name of strategyNames) {
            const groupPositions = portfolio.positions.filter(p => p.strategyName === name);
            let totalPnl = 0;
            for (const pos of groupPositions) {
                totalPnl += computePositionPnl(pos, currentPrice, vol, rate, day, q);
            }

            // Nearest expiry among group positions
            let nearestExpiry = Infinity;
            for (const pos of groupPositions) {
                if (pos.expiryDay != null && pos.expiryDay < nearestExpiry) nearestExpiry = pos.expiryDay;
            }
            const expiryStr = nearestExpiry < Infinity ? ' ' + fmtDte(nearestExpiry - day) : '';

            // Compute strategy execution multiplier from base qty
            // strategyBaseQty = per-execution qty for each leg, set at first execution
            const ref = groupPositions.find(p => p.strategyBaseQty);
            const mult = ref ? Math.round(Math.abs(ref.qty) / ref.strategyBaseQty) : 1;

            // Build abridged constituents string using per-unit (base) quantities
            const parts = groupPositions.map(pos => {
                const baseQty = pos.strategyBaseQty || Math.abs(pos.qty);
                const label = posTypeLabel(pos.type, pos.qty);
                const isOption = pos.type === 'call' || pos.type === 'put';
                const strikeStr = isOption && pos.strike != null ? ' K' + pos.strike : '';
                return label + strikeStr + ' x' + fmtQty(baseQty);
            });
            const constituents = parts.join(', ');

            let group = $.strategyPositions.querySelector('.strategy-group[data-strategy-name="' + CSS.escape(name) + '"]');
            if (!group) {
                group = document.createElement('div');
                group.className = 'strategy-group';
                group.dataset.strategyName = name;

                const header = document.createElement('div');
                header.className = 'strategy-group-header';

                const nameEl = document.createElement('span');
                nameEl.className = 'stat-label strategy-group-name';
                header.appendChild(nameEl);

                const pnlEl = document.createElement('span');
                pnlEl.className = 'stat-value strategy-group-pnl';
                header.appendChild(pnlEl);

                const closeBtn = document.createElement('button');
                closeBtn.className = 'ghost-btn pos-close-btn';
                closeBtn.textContent = 'X';
                closeBtn.title = 'Unwind strategy';
                closeBtn.addEventListener('click', () => {
                    closeBtn.dispatchEvent(new CustomEvent('shoals:unwindStrategy', { detail: { name }, bubbles: true }));
                    if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
                });
                header.appendChild(closeBtn);

                const detail = document.createElement('div');
                detail.className = 'strategy-group-detail';

                group.appendChild(header);
                group.appendChild(detail);
                $.strategyPositions.appendChild(group);
            }

            // Update P/L and constituents
            const pnlEl = group.querySelector('.strategy-group-pnl');
            if (pnlEl) {
                pnlEl.textContent = fmtDollar(totalPnl);
                pnlEl.className = 'stat-value strategy-group-pnl ' + pnlClass(totalPnl);
            }
            const nameEl = group.querySelector('.strategy-group-name');
            if (nameEl) nameEl.textContent = name + expiryStr + ' x' + mult;
            const detail = group.querySelector('.strategy-group-detail');
            if (detail) detail.textContent = constituents;
        }
    }

    // Pending orders -- DOM diff
    _diffOrderRows($.pendingOrders, portfolio.orders);
}
