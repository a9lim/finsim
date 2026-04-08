/* _helpers.js -- Portfolio calculation helpers for trigger/context functions.
   Used by domain event files that define portfolio-triggered (desk_*) events. */

import { computeNetDelta, computeGrossNotional, portfolio, portfolioValue } from '../portfolio.js';
import { market } from '../market.js';
import { unitPrice } from '../position-value.js';
import { HISTORY_CAPACITY } from '../config.js';

export function equity() {
    return portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
}

export function posPrice(p) {
    return unitPrice(p.type, market.S, Math.sqrt(market.v), market.r, market.day, p.strike, p.expiryDay, market.q);
}

export function absStockQty() {
    return portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + Math.abs(p.qty), 0);
}

export function shortDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = posPrice(p);
        if (p.type === 'stock' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'call' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'put' && p.qty > 0) total += p.qty * price;
    }
    return total;
}

export function longDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = posPrice(p);
        if (p.type === 'stock' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'call' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'put' && p.qty < 0) total += Math.abs(p.qty) * price;
    }
    return total;
}

export function bondNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'bond') total += Math.abs(p.qty) * posPrice(p);
    }
    return total;
}


export function totalOptionsNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'call' || p.type === 'put') {
            total += Math.abs(p.qty) * posPrice(p);
        }
    }
    return total;
}

export function maxStrikeConcentration() {
    const byStrike = {};
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike != null) {
            byStrike[p.strike] = (byStrike[p.strike] || 0) + Math.abs(p.qty) * posPrice(p);
        }
    }
    let maxStrike = null, maxNotional = 0;
    for (const k in byStrike) {
        if (byStrike[k] > maxNotional) { maxNotional = byStrike[k]; maxStrike = +k; }
    }
    return { strike: maxStrike, notional: maxNotional };
}

export function netUncoveredUpside() {
    let net = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'stock' || p.type === 'call') net += p.qty;
    }
    return net;
}

export function anyInvestigationActive(world) {
    const inv = world.investigations;
    return inv.tanBowmanStory > 0 || inv.tanNsaStory > 0 ||
           inv.okaforProbeStage > 0 || inv.impeachmentStage > 0;
}

export function liveDay(day) {
    return day - HISTORY_CAPACITY;
}

export { computeNetDelta, computeGrossNotional, portfolio } from '../portfolio.js';
export { market } from '../market.js';
