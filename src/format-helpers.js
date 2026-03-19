/* format-helpers.js -- Shared formatting utilities for Shoals UI modules. */

import { TRADING_DAYS_PER_YEAR } from './config.js';

export function fmtDollar(v) {
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : '') + '$' + formatted;
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
