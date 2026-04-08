/* =====================================================
   chain-renderer.js -- Chain table DOM building and
   event binding for sidebar and overlay chain displays.

   Stateless module -- builds DOM elements, binds click
   handlers, no internal state.
   ===================================================== */

import { fmtDte } from './format-helpers.js';

// ---------------------------------------------------------------------------
// Internal chain table builders (DOM methods -- no text interpolation)
// ---------------------------------------------------------------------------

export function posKey(type, strike, expiryDay) {
    if (type === 'stock') return 'stock';
    if (type === 'bond') return 'bond:' + expiryDay;
    if (type === 'vixfuture') return 'vixfuture:' + expiryDay;
    return type + ':' + strike + ':' + expiryDay;
}

function _wrapPrice(td, text, posMap, type, strike, expiryDay) {
    td.textContent = text;
    td.classList.remove('pos-long', 'pos-short');
    const key = posKey(type, strike, expiryDay);
    const qty = posMap && posMap[key];
    if (qty) td.classList.add(qty > 0 ? 'pos-long' : 'pos-short');
}

function buildChainRow(row, expiry, isAtm, posMap) {
    const tr = document.createElement('tr');
    tr.className = 'chain-row' + (isAtm ? ' atm-row' : '');

    const callMid = ((row.call.bid + row.call.ask) / 2).toFixed(2);
    const putMid  = ((row.put.bid  + row.put.ask)  / 2).toFixed(2);

    const callTd = document.createElement('td');
    callTd.className = 'chain-cell call-cell';
    callTd.dataset.tooltip = 'Bid ' + row.call.bid.toFixed(2) + ' / Ask ' + row.call.ask.toFixed(2);
    callTd.setAttribute('tabindex', '0');
    callTd.setAttribute('role', 'button');
    callTd.dataset.strike    = row.strike;
    callTd.dataset.expiryDay = expiry.day;
    callTd.dataset.type      = 'call';
    _wrapPrice(callTd, callMid, posMap, 'call', row.strike, expiry.day);

    const strikeTd = document.createElement('td');
    strikeTd.className = 'chain-cell strike-cell' + (isAtm ? ' atm-strike' : '');
    strikeTd.textContent = row.strike;

    const putTd = document.createElement('td');
    putTd.className = 'chain-cell put-cell';
    putTd.dataset.tooltip = 'Bid ' + row.put.bid.toFixed(2) + ' / Ask ' + row.put.ask.toFixed(2);
    putTd.setAttribute('tabindex', '0');
    putTd.setAttribute('role', 'button');
    putTd.dataset.strike    = row.strike;
    putTd.dataset.expiryDay = expiry.day;
    putTd.dataset.type      = 'put';
    _wrapPrice(putTd, putMid, posMap, 'put', row.strike, expiry.day);

    tr.appendChild(callTd);
    tr.appendChild(strikeTd);
    tr.appendChild(putTd);
    return tr;
}

export function buildChainTable(expiry, posMap) {
    const table = document.createElement('table');
    table.className = 'chain-tbl';
    table.setAttribute('role', 'grid');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const h of ['Call', 'Strike', 'Put']) {
        const th = document.createElement('th');
        th.className = 'chain-th';
        th.textContent = h;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const midStrike = expiry.options[Math.floor(expiry.options.length / 2)]?.strike;
    for (const row of expiry.options) {
        tbody.appendChild(buildChainRow(row, expiry, row.strike === midStrike, posMap));
    }
    table.appendChild(tbody);
    return table;
}

export function bindChainTableClicks(container, onChainCellClick) {
    function handleAction(cell, side) {
        const info = {
            strike: parseInt(cell.dataset.strike, 10),
            expiryDay: parseInt(cell.dataset.expiryDay, 10),
            type: cell.dataset.type,
            side,
        };
        if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
        if (typeof onChainCellClick === 'function') onChainCellClick(info);
    }
    container.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-type]');
        if (cell && container.contains(cell)) {
            const side = (typeof _shoalsSellMode === 'function' && _shoalsSellMode()) ? 'short' : 'long';
            handleAction(cell, side);
        }
    });
    container.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('[data-type]');
        if (cell && container.contains(cell)) { e.preventDefault(); handleAction(cell, 'short'); }
    });
    container.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const cell = e.target.closest('[data-type]');
            if (cell && container.contains(cell)) { e.preventDefault(); handleAction(cell, 'long'); }
            return;
        }
        // Arrow key navigation between focusable chain cells
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const cells = Array.from(container.querySelectorAll('[tabindex="0"]'));
            const idx = cells.indexOf(document.activeElement);
            if (idx === -1) return;
            const cols = 2;
            let target = null;
            if (e.key === 'ArrowRight') target = cells[idx + 1];
            else if (e.key === 'ArrowLeft') target = cells[idx - 1];
            else if (e.key === 'ArrowDown') target = cells[idx + cols];
            else if (e.key === 'ArrowUp') target = cells[idx - cols];
            if (target) { e.preventDefault(); target.focus(); }
        }
    });
}

// ---------------------------------------------------------------------------
// In-place compact chain update (avoids DOM teardown during substeps)
// ---------------------------------------------------------------------------

/**
 * Try to patch an existing compact chain table in-place.
 * Returns true if update succeeded, false if a full rebuild is needed.
 */
function _updateCompactChainInPlace(container, pricedExpiry, posMap) {
    const tbody = container.querySelector('tbody');
    if (!tbody) return false;
    const rows = tbody.children;
    const opts = pricedExpiry.options;
    if (rows.length !== opts.length) return false;

    const midStrike = opts[Math.floor(opts.length / 2)]?.strike;
    for (let i = 0; i < opts.length; i++) {
        const row = opts[i];
        const tr = rows[i];
        const cells = tr.children;
        // compact rows have 3 cells: call, strike, put
        if (cells.length !== 3) return false;
        // strike must match (structure unchanged)
        if (parseInt(cells[1].textContent, 10) !== row.strike) return false;

        const isAtm = row.strike === midStrike;
        tr.className = 'chain-row' + (isAtm ? ' atm-row' : '');
        cells[1].className = 'chain-cell strike-cell' + (isAtm ? ' atm-strike' : '');

        const callMid = ((row.call.bid + row.call.ask) / 2).toFixed(2);
        const putMid  = ((row.put.bid  + row.put.ask)  / 2).toFixed(2);

        cells[0].dataset.tooltip = 'Bid ' + row.call.bid.toFixed(2) + ' / Ask ' + row.call.ask.toFixed(2);
        _wrapPrice(cells[0], callMid, posMap, 'call', row.strike, pricedExpiry.day);

        cells[2].dataset.tooltip = 'Bid ' + row.put.bid.toFixed(2) + ' / Ask ' + row.put.ask.toFixed(2);
        _wrapPrice(cells[2], putMid, posMap, 'put', row.strike, pricedExpiry.day);
    }
    return true;
}

// ---------------------------------------------------------------------------
// Exported: render chain into container
// ---------------------------------------------------------------------------

/**
 * Rebuild the expiry dropdown from the skeleton.
 * Only call when the skeleton changes (new day, reset, etc.) — not every substep.
 */
export function rebuildExpiryDropdown(dropdownEl, skeleton, selectedIndex) {
    if (!dropdownEl) return;
    if (!skeleton || skeleton.length === 0) {
        dropdownEl.textContent = '';
        const opt = document.createElement('option');
        opt.textContent = 'No expiries available';
        dropdownEl.appendChild(opt);
        return;
    }
    const prevVal = dropdownEl.value;
    dropdownEl.textContent = '';
    skeleton.forEach((exp, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = fmtDte(exp.dte) + ' (' + exp.dte + 'd)';
        dropdownEl.appendChild(opt);
    });
    if (selectedIndex != null && selectedIndex < skeleton.length) {
        dropdownEl.value = selectedIndex;
    } else if (prevVal !== '' && parseInt(prevVal, 10) < skeleton.length) {
        dropdownEl.value = prevVal;
    }
}

/**
 * Render a chain table into a container.
 *
 * @param {HTMLElement} container - DOM container to render into
 * @param {{ day: number, dte: number, options: Array }} pricedExpiry - pre-priced expiry to display
 * @param {function|null} onClick - chain cell click handler
 * @param {object|null} posMap - position map for indicators
 */
export function renderChainInto(container, pricedExpiry, onClick, posMap) {
    if (!pricedExpiry || !pricedExpiry.options || pricedExpiry.options.length === 0) {
        container.textContent = '';
        const ph = document.createElement('div');
        ph.className = 'chain-placeholder';
        ph.textContent = 'No options for this expiry.';
        container.appendChild(ph);
        return;
    }

    // Try in-place update first (same expiry day + same strikes = no DOM rebuild)
    if (container._chainExpiryDay === pricedExpiry.day
        && _updateCompactChainInPlace(container, pricedExpiry, posMap)) {
        return;
    }

    // Full rebuild needed (structure changed)
    container.textContent = '';
    container._chainExpiryDay = pricedExpiry.day;
    container.appendChild(buildChainTable(pricedExpiry, posMap));
    // Bind click delegation only once per container
    if (!container._chainClicksBound) {
        bindChainTableClicks(container, onClick);
        container._chainClicksBound = true;
    }
}

