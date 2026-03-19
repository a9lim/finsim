/* =====================================================
   chain-renderer.js -- Chain table DOM building and
   event binding for sidebar and overlay chain displays.

   Stateless module -- builds DOM elements, binds click
   handlers, no internal state.
   ===================================================== */

import { fmtDte, fmtNum } from './format-helpers.js';

// ---------------------------------------------------------------------------
// Internal chain table builders (DOM methods -- no text interpolation)
// ---------------------------------------------------------------------------

function buildChainRow(row, expiry, isAtm, compact) {
    const tr = document.createElement('tr');
    tr.className = 'chain-row' + (isAtm ? ' atm-row' : '');

    if (compact) {
        const callMid = ((row.call.bid + row.call.ask) / 2).toFixed(2);
        const putMid  = ((row.put.bid  + row.put.ask)  / 2).toFixed(2);

        const callTd = document.createElement('td');
        callTd.className = 'chain-cell call-cell';
        callTd.textContent = callMid;
        callTd.title = 'Bid ' + row.call.bid.toFixed(2) + ' / Ask ' + row.call.ask.toFixed(2);
        callTd.setAttribute('tabindex', '0');
        callTd.setAttribute('role', 'button');
        callTd.dataset.strike    = row.strike;
        callTd.dataset.expiryDay = expiry.day;
        callTd.dataset.type      = 'call';

        const strikeTd = document.createElement('td');
        strikeTd.className = 'chain-cell strike-cell' + (isAtm ? ' atm-strike' : '');
        strikeTd.textContent = row.strike;

        const putTd = document.createElement('td');
        putTd.className = 'chain-cell put-cell';
        putTd.textContent = putMid;
        putTd.title = 'Bid ' + row.put.bid.toFixed(2) + ' / Ask ' + row.put.ask.toFixed(2);
        putTd.setAttribute('tabindex', '0');
        putTd.setAttribute('role', 'button');
        putTd.dataset.strike    = row.strike;
        putTd.dataset.expiryDay = expiry.day;
        putTd.dataset.type      = 'put';

        tr.appendChild(callTd);
        tr.appendChild(strikeTd);
        tr.appendChild(putTd);
    } else {
        const cellDefs = [
            { text: row.call.bid.toFixed(2) + ' / ' + row.call.ask.toFixed(2), cls: 'call-cell', type: 'call' },
            { text: fmtNum(row.call.delta, 3), cls: 'chain-greek', type: null },
            { text: String(row.strike),        cls: 'strike-cell' + (isAtm ? ' atm-strike' : ''), type: null },
            { text: fmtNum(row.put.delta, 3),  cls: 'chain-greek', type: null },
            { text: row.put.bid.toFixed(2) + ' / ' + row.put.ask.toFixed(2), cls: 'put-cell', type: 'put' },
        ];
        for (const c of cellDefs) {
            const td = document.createElement('td');
            td.className = 'chain-cell ' + c.cls;
            td.textContent = c.text;
            if (c.type) {
                td.setAttribute('tabindex', '0');
                td.setAttribute('role', 'button');
                td.dataset.strike    = row.strike;
                td.dataset.expiryDay = expiry.day;
                td.dataset.type      = c.type;
            }
            tr.appendChild(td);
        }
    }
    return tr;
}

export function buildChainTable(expiry, compact) {
    const table = document.createElement('table');
    table.className = 'chain-tbl' + (compact ? '' : ' full-chain-tbl');
    table.setAttribute('role', 'grid');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = compact
        ? ['Call', 'Strike', 'Put']
        : ['Call', 'Call \u0394', 'Strike', 'Put \u0394', 'Put'];
    for (const h of headers) {
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
        tbody.appendChild(buildChainRow(row, expiry, row.strike === midStrike, compact));
    }
    table.appendChild(tbody);
    return table;
}

function bindCellTrade(cell, type, onChainCellClick) {
    cell.addEventListener('click', () => {
        if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
        if (typeof onChainCellClick === 'function') {
            onChainCellClick({ type, side: 'long', strike: null, expiryDay: null });
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
    container.querySelectorAll('[data-type]').forEach(cell => {
        const info = {
            strike:    parseInt(cell.dataset.strike, 10),
            expiryDay: parseInt(cell.dataset.expiryDay, 10),
            type:      cell.dataset.type,
        };
        cell.addEventListener('click', () => {
            if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
            if (typeof onChainCellClick === 'function') {
                onChainCellClick({ ...info, side: 'long' });
            }
        });
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
            if (typeof onChainCellClick === 'function') {
                onChainCellClick({ ...info, side: 'short' });
            }
        });
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
                if (typeof onChainCellClick === 'function') {
                    onChainCellClick({ ...info, side: 'long' });
                }
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Exported: render chain into container
// ---------------------------------------------------------------------------

export function renderChainInto(container, chain, selectedIndex, dropdownEl, onClick) {
    if (!chain || chain.length === 0) {
        container.textContent = '';
        const ph = document.createElement('div');
        ph.className = 'chain-placeholder';
        ph.textContent = 'No chain data.';
        container.appendChild(ph);
        if (dropdownEl) {
            dropdownEl.textContent = '';
            const opt = document.createElement('option');
            opt.textContent = 'No expiries available';
            dropdownEl.appendChild(opt);
        }
        return;
    }

    // Rebuild dropdown options
    if (dropdownEl) {
        const prevVal = dropdownEl.value;
        dropdownEl.textContent = '';
        chain.forEach((exp, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = fmtDte(exp.dte) + ' (' + exp.dte + 'd)';
            dropdownEl.appendChild(opt);
        });
        // Preserve previous selection if still valid
        if (prevVal !== '' && parseInt(prevVal, 10) < chain.length) {
            dropdownEl.value = prevVal;
        }
    }

    const raw = selectedIndex ?? parseInt(dropdownEl?.value, 10);
    const clamped = Math.min(Math.max((raw != null && !isNaN(raw)) ? raw : chain.length - 1, 0), chain.length - 1);
    if (dropdownEl) dropdownEl.value = clamped;

    const expiry = chain[clamped];
    container.textContent = '';

    if (!expiry || !expiry.options || expiry.options.length === 0) {
        const ph = document.createElement('div');
        ph.className = 'chain-placeholder';
        ph.textContent = 'No options for this expiry.';
        container.appendChild(ph);
        return;
    }

    container.appendChild(buildChainTable(expiry, true));
    bindChainTableClicks(container, onClick);
}

// ---------------------------------------------------------------------------
// Exported: build stock/bond price table (used by chain overlay)
// ---------------------------------------------------------------------------

export function buildStockBondTable(stockBA, bondBA, onChainCellClick) {
    const table = document.createElement('table');
    table.className = 'chain-tbl overlay-stock-bond';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['Stock', 'Bond']) {
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
    stockTd.setAttribute('tabindex', '0');
    stockTd.setAttribute('role', 'button');
    bindCellTrade(stockTd, 'stock', onChainCellClick);

    const bondTd = document.createElement('td');
    bondTd.className = 'chain-cell bond-overlay-cell';
    bondTd.textContent = bondBA ? bondBA.bid.toFixed(2) + ' / ' + bondBA.ask.toFixed(2) : '\u2014';
    bondTd.setAttribute('tabindex', '0');
    bondTd.setAttribute('role', 'button');
    bindCellTrade(bondTd, 'bond', onChainCellClick);

    tr.appendChild(stockTd);
    tr.appendChild(bondTd);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    return table;
}
