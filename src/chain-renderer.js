/* =====================================================
   chain-renderer.js -- Chain table DOM building and
   event binding for sidebar and overlay chain displays.

   Stateless module -- builds DOM elements, binds click
   handlers, no internal state.
   ===================================================== */

import { fmtDte, fmtNum } from './format-helpers.js';
import { modeledOI, modeledStockADV, modeledBondADV } from './price-impact.js';
import { market } from './market.js';
import { computeEffectiveSigma, computeSkewSigma } from './pricing.js';

// ---------------------------------------------------------------------------
// Internal chain table builders (DOM methods -- no text interpolation)
// ---------------------------------------------------------------------------

export function posKey(type, strike, expiryDay) {
    if (type === 'stock') return 'stock';
    if (type === 'bond') return 'bond:' + expiryDay;
    return type + ':' + strike + ':' + expiryDay;
}

function _wrapPrice(td, text, posMap, type, strike, expiryDay) {
    td.textContent = text;
    td.classList.remove('pos-long', 'pos-short');
    const key = posKey(type, strike, expiryDay);
    const qty = posMap && posMap[key];
    if (qty) td.classList.add(qty > 0 ? 'pos-long' : 'pos-short');
}

function buildChainRow(row, expiry, isAtm, compact, posMap, spot, sigmaEff) {
    const tr = document.createElement('tr');
    tr.className = 'chain-row' + (isAtm ? ' atm-row' : '');

    if (compact) {
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
    } else {
        const logSK = spot > 0 ? Math.log(spot / row.strike) : 0;
        const T = expiry.dte / 252;
        const skewSigma = sigmaEff > 0
            ? computeSkewSigma(sigmaEff, spot, row.strike, T, market.rho, market.xi, market.kappa)
            : 0;
        const callOI = modeledOI('call', logSK, expiry.dte, skewSigma).toFixed(2) + 'k';
        const putOI  = modeledOI('put',  logSK, expiry.dte, skewSigma).toFixed(2) + 'k';
        const cellDefs = [
            { text: row.call.bid.toFixed(2) + ' / ' + row.call.ask.toFixed(2), cls: 'call-cell', type: 'call' },
            { text: callOI, cls: 'chain-greek', type: null },
            { text: String(row.strike),        cls: 'strike-cell' + (isAtm ? ' atm-strike' : ''), type: null },
            { text: putOI,  cls: 'chain-greek', type: null },
            { text: row.put.bid.toFixed(2) + ' / ' + row.put.ask.toFixed(2), cls: 'put-cell', type: 'put' },
        ];
        for (const c of cellDefs) {
            const td = document.createElement('td');
            td.className = 'chain-cell ' + c.cls;
            if (c.type) {
                td.setAttribute('tabindex', '0');
                td.setAttribute('role', 'button');
                td.dataset.strike    = row.strike;
                td.dataset.expiryDay = expiry.day;
                td.dataset.type      = c.type;
                _wrapPrice(td, c.text, posMap, c.type, row.strike, expiry.day);
            } else {
                td.textContent = c.text;
            }
            tr.appendChild(td);
        }
    }
    return tr;
}

export function buildChainTable(expiry, compact, posMap, spot) {
    const table = document.createElement('table');
    table.className = 'chain-tbl' + (compact ? '' : ' full-chain-tbl');
    table.setAttribute('role', 'grid');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = compact
        ? ['Call', 'Strike', 'Put']
        : ['Call', 'Call OI', 'Strike', 'Put OI', 'Put'];
    for (const h of headers) {
        const th = document.createElement('th');
        th.className = 'chain-th';
        th.textContent = h;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Compute effective ATM vol once per expiry for OI display
    const T = expiry.dte / 252;
    const sigmaEff = !compact && T > 0
        ? computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi)
        : 0;

    const tbody = document.createElement('tbody');
    const midStrike = expiry.options[Math.floor(expiry.options.length / 2)]?.strike;
    for (const row of expiry.options) {
        tbody.appendChild(buildChainRow(row, expiry, row.strike === midStrike, compact, posMap, spot, sigmaEff));
    }
    table.appendChild(tbody);
    return table;
}

function bindCellTrade(cell, type, onChainCellClick) {
    cell.addEventListener('click', () => {
        if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
        if (typeof onChainCellClick === 'function') {
            const side = (typeof _shoalsSellMode === 'function' && _shoalsSellMode()) ? 'short' : 'long';
            onChainCellClick({ type, side, strike: null, expiryDay: null });
        }
    });
    cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
        if (typeof onChainCellClick === 'function') {
            onChainCellClick({ type, side: 'short', strike: null, expiryDay: null });
        }
    });
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
            var cells = Array.from(container.querySelectorAll('[tabindex="0"]'));
            var idx = cells.indexOf(document.activeElement);
            if (idx === -1) return;
            // 2 focusable cells per row (call + put); stock/bond row also has 2
            var cols = 2;
            var target = null;
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
    container.appendChild(buildChainTable(pricedExpiry, true, posMap));
    // Bind click delegation only once per container
    if (!container._chainClicksBound) {
        bindChainTableClicks(container, onClick);
        container._chainClicksBound = true;
    }
}

// ---------------------------------------------------------------------------
// Exported: build stock/bond price table (used by chain overlay)
// ---------------------------------------------------------------------------

export function buildStockBondTable(stockBA, bondBA, onChainCellClick, posMap, showADV) {
    const table = document.createElement('table');
    table.className = 'chain-tbl overlay-stock-bond';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const headers = showADV ? ['Stock', 'Stock ADV', 'Bond ADV', 'Bond'] : ['Stock', 'Bond'];
    for (const h of headers) {
        const th = document.createElement('th');
        th.className = 'chain-th';
        th.textContent = h;
        hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');

    const stockTd = document.createElement('td');
    stockTd.className = 'chain-cell stock-overlay-cell';
    stockTd.textContent = stockBA ? stockBA.bid.toFixed(2) + ' / ' + stockBA.ask.toFixed(2) : '\u2014';
    const stockQty = posMap && posMap['stock'];
    if (stockQty) stockTd.classList.add(stockQty > 0 ? 'pos-long' : 'pos-short');
    stockTd.setAttribute('tabindex', '0');
    stockTd.setAttribute('role', 'button');
    bindCellTrade(stockTd, 'stock', onChainCellClick);
    tr.appendChild(stockTd);

    if (showADV) {
        const stockAdvTd = document.createElement('td');
        stockAdvTd.className = 'chain-cell chain-greek';
        stockAdvTd.textContent = modeledStockADV(market.sigma).toFixed(1) + 'k';
        tr.appendChild(stockAdvTd);

        const bondAdvTd = document.createElement('td');
        bondAdvTd.className = 'chain-cell chain-greek';
        bondAdvTd.textContent = modeledBondADV(market.sigmaR).toFixed(1) + 'k';
        tr.appendChild(bondAdvTd);
    }

    const bondTd = document.createElement('td');
    bondTd.className = 'chain-cell bond-overlay-cell';
    bondTd.textContent = bondBA ? bondBA.bid.toFixed(2) + ' / ' + bondBA.ask.toFixed(2) : '\u2014';
    const bondQty = posMap && Object.keys(posMap).filter(k => k.startsWith('bond:')).reduce((acc, k) => acc + posMap[k], 0);
    if (bondQty) bondTd.classList.add(bondQty > 0 ? 'pos-long' : 'pos-short');
    bondTd.setAttribute('tabindex', '0');
    bondTd.setAttribute('role', 'button');
    bindCellTrade(bondTd, 'bond', onChainCellClick);
    tr.appendChild(bondTd);

    tbody.appendChild(tr);
    table.appendChild(tbody);
    return table;
}
