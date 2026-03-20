/* =====================================================
   portfolio-renderer.js -- Portfolio display with DOM
   diffing for the Shoals trading simulator.

   Extracted from ui.js. Updates P&L values in-place
   instead of rebuilding all position rows every day.
   ===================================================== */

import { computePositionPnl } from './position-value.js';
import { fmtDollar, pnlClass, fmtDte, posTypeLabel } from './format-helpers.js';

// ---------------------------------------------------------------------------
// Margin display formatter (pure function -- no portfolio access)
// ---------------------------------------------------------------------------

function _computeMarginDisplay(equity, required) {
    if (required <= 0) return { label: 'OK', cls: '' };
    if (equity < required) return { label: 'MARGIN CALL', cls: 'margin-alert' };
    const pct = Math.min((equity / required) * 100, 999);
    if (equity < required * 1.2) return { label: 'Low (' + pct.toFixed(0) + '%)', cls: 'margin-warn' };
    return { label: 'OK (' + pct.toFixed(0) + '%)', cls: '' };
}

// ---------------------------------------------------------------------------
// _buildPositionRow
// ---------------------------------------------------------------------------

function _buildPositionRow(pos, currentPrice, vol, rate, day) {
    const absQty     = Math.abs(pos.qty);
    const typeLabel  = posTypeLabel(pos.type, pos.qty);
    const pnl        = computePositionPnl(pos, currentPrice, vol, rate, day);
    const entryTotal = pos.entryPrice * absQty;
    const isOption   = pos.type === 'call' || pos.type === 'put';
    const strikeStr  = isOption && pos.strike != null ? ' K' + pos.strike : '';
    const expiryStr  = pos.expiryDay != null ? ' ' + fmtDte(pos.expiryDay - day) : '';
    const labelStr   = typeLabel + strikeStr + expiryStr + ' x' + absQty;

    const row = document.createElement('div');
    row.className = 'pos-row stat-row';
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
    const labelStr  = typeLabel + strikeStr + ' x' + order.qty + ' ' + order.orderType + ' @ ' + fmtDollar(order.triggerPrice);

    const row = document.createElement('div');
    row.className = 'order-row stat-row';
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

function _diffPositionRows(container, positions, S, vol, rate, day, emptyHint) {
    const currentIds = new Set(positions.map(p => String(p.id)));

    // Remove rows for closed positions
    for (const row of container.querySelectorAll('[data-pos-id]')) {
        if (!currentIds.has(row.dataset.posId)) row.remove();
    }

    if (positions.length === 0) {
        // Show hint only if not already present
        if (!container.querySelector('.panel-hint')) {
            container.textContent = '';
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
        const existing = container.querySelector('[data-pos-id="' + posId + '"]');
        if (existing) {
            // Update P&L in-place
            const pnl = computePositionPnl(pos, S, vol, rate, day);
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
            container.appendChild(_buildPositionRow(pos, S, vol, rate, day));
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

export function updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day, marginInfo) {
    $.cashDisplay.textContent = fmtDollar(portfolio.cash);

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
        : { label: 'OK', cls: '' };
    $.marginStatus.textContent = marginDisplay.label;
    $.marginStatus.className   = 'stat-value ' + marginDisplay.cls;

    // Cumulative borrow cost across all positions (including closed -- tracked on portfolio)
    let totalBorrowCost = 0;
    for (const pos of portfolio.positions) {
        if (pos.borrowCost) totalBorrowCost += pos.borrowCost;
    }
    totalBorrowCost += portfolio.closedBorrowCost || 0;
    if ($.borrowCostDisplay) {
        $.borrowCostDisplay.textContent = fmtDollar(-totalBorrowCost);
        $.borrowCostDisplay.className = 'stat-value ' + (totalBorrowCost > 0 ? pnlClass(-totalBorrowCost) : '');
    }

    // Default (non-strategy) positions -- DOM diff
    const defaultPos = portfolio.positions.filter(p => !p.strategyName);
    _diffPositionRows($.defaultPositions, defaultPos, currentPrice, vol, rate, day, 'No open positions.');

    // Strategy positions -- grouped by name, DOM diff
    const strategyNames = [...new Set(
        portfolio.positions.filter(p => p.strategyName).map(p => p.strategyName)
    )];

    if (strategyNames.length === 0) {
        // Remove any leftover strategy groups
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
        // Remove stale hint
        const hint = $.strategyPositions.querySelector('.panel-hint');
        if (hint) hint.remove();

        // Remove groups for strategies no longer present
        for (const g of $.strategyPositions.querySelectorAll('.strategy-group')) {
            if (!strategyNames.includes(g.dataset.strategyName)) g.remove();
        }

        // Add or update each strategy group
        for (const name of strategyNames) {
            let group = $.strategyPositions.querySelector('.strategy-group[data-strategy-name="' + CSS.escape(name) + '"]');
            if (!group) {
                group = document.createElement('div');
                group.className = 'strategy-group';
                group.dataset.strategyName = name;
                const label = document.createElement('div');
                label.className = 'group-label';
                label.textContent = name;
                group.appendChild(label);
                $.strategyPositions.appendChild(group);
            }
            // Diff positions within this group
            const groupPositions = portfolio.positions.filter(p => p.strategyName === name);
            _diffPositionRows(group, groupPositions, currentPrice, vol, rate, day, '');
        }
    }

    // Pending orders -- DOM diff
    _diffOrderRows($.pendingOrders, portfolio.orders);
}
