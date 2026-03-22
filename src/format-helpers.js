/* format-helpers.js -- Shared formatting utilities for Shoals UI modules. */

import { TRADING_DAYS_PER_YEAR } from './config.js';

const _dollarFmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function fmtDollar(v) {
    return (v < 0 ? '-$' : '$') + _dollarFmt.format(Math.abs(v)) + 'k';
}

export function fmtQty(v) {
    return Math.abs(v).toLocaleString() + 'k';
}

export function fmtNum(v, dp = 4) { return Number(v).toFixed(dp); }

export function pnlClass(v) {
    if (v > 0) return 'pnl-up';
    if (v < 0) return 'pnl-down';
    return '';
}

export function fmtDte(dte) {
    if (dte >= TRADING_DAYS_PER_YEAR) return (dte / TRADING_DAYS_PER_YEAR).toFixed(1) + 'y';
    if (dte >= 21) return Math.round(dte / 21) + 'mo';
    return dte + 'd';
}

export function fmtRelDay(day, origin) {
    const rel = day - origin;
    let yr, mo, dy;
    if (rel >= 0) {
        // Forward from origin: Y1 M1 D1 at rel=0
        yr = Math.floor(rel / 252) + 1;
        const rem = rel - (yr - 1) * 252;
        mo = Math.floor(rem / 21) + 1;
        dy = (rem % 21) + 1;
    } else {
        // Before origin: Y-1 M1 D1 at rel=-252, Y-1 M12 D21 at rel=-1
        const abs = -rel;
        const negYr = Math.ceil(abs / 252);
        const pos = negYr * 252 - abs; // 0-based position within that year
        yr = -negYr;
        mo = Math.floor(pos / 21) + 1;
        dy = (pos % 21) + 1;
    }
    return `Y${yr} M${mo} D${dy}`;
}

export function posTypeLabel(type, sideOrQty) {
    const isShort = typeof sideOrQty === 'number' ? sideOrQty < 0 : sideOrQty === 'short';
    const prefix = isShort ? 'S' : 'L';
    switch (type) {
        case 'stock': return prefix + ':STK';
        case 'bond':  return prefix + ':BND';
        case 'call':  return prefix + ':CALL';
        case 'put':   return prefix + ':PUT';
        default:      return type.toUpperCase();
    }
}
