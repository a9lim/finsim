// src/strategy-store.js
import { computeBidAsk, computeOptionBidAsk } from './portfolio.js';
import { unitPrice } from './position-value.js';
import { market } from './market.js';

const LS_KEY = 'shoals_strategies';
const MAX_STRATEGIES = 50;
const MAX_NAME_LEN = 40;

// --- Built-in strategies (never in localStorage) ---
const BUILTINS = [
    {
        id: 'builtin_covered_call', name: 'Covered Call', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'stock', qty: 1, strikeOffset: null, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: null },
        ],
    },
    {
        id: 'builtin_protective_put', name: 'Protective Put', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'stock', qty: 1, strikeOffset: null, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: null },
        ],
    },
    {
        id: 'builtin_bull_call_spread', name: 'Bull Call Spread', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 10, dteOffset: null },
        ],
    },
    {
        id: 'builtin_bear_put_spread', name: 'Bear Put Spread', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: -10, dteOffset: null },
        ],
    },
    {
        id: 'builtin_long_straddle', name: 'Long Straddle', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: null },
        ],
    },
    {
        id: 'builtin_long_strangle', name: 'Long Strangle', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 5, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: -5, dteOffset: null },
        ],
    },
    {
        id: 'builtin_iron_condor', name: 'Iron Condor', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: -15, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: -10, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 10, dteOffset: null },
            { type: 'call', qty: 1, strikeOffset: 15, dteOffset: null },
        ],
    },
    {
        id: 'builtin_iron_butterfly', name: 'Iron Butterfly', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: -10, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: 1, strikeOffset: 10, dteOffset: null },
        ],
    },
    // --- Conversions & Reversals ---
    {
        id: 'builtin_conversion', name: 'Conversion', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'stock', qty: 1, strikeOffset: null, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: null },
        ],
    },
    {
        id: 'builtin_reversal', name: 'Reversal', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'stock', qty: -1, strikeOffset: null, dteOffset: null },
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: 0, dteOffset: null },
        ],
    },
    // --- Box Spread ---
    {
        id: 'builtin_box_spread', name: 'Box Spread', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: -5, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 5, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: -5, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: 5, dteOffset: null },
        ],
    },
    // --- Ladders ---
    {
        id: 'builtin_call_ladder', name: 'Call Ladder', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 5, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 10, dteOffset: null },
        ],
    },
    {
        id: 'builtin_put_ladder', name: 'Put Ladder', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: -5, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: -10, dteOffset: null },
        ],
    },
    // --- Butterflies ---
    {
        id: 'builtin_call_butterfly', name: 'Call Butterfly', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: -5, dteOffset: null },
            { type: 'call', qty: -2, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: 1, strikeOffset: 5, dteOffset: null },
        ],
    },
    {
        id: 'builtin_put_butterfly', name: 'Put Butterfly', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: -5, dteOffset: null },
            { type: 'put', qty: -2, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: 5, dteOffset: null },
        ],
    },
    // --- Ratio Spreads ---
    {
        id: 'builtin_call_ratio_spread', name: 'Call Ratio Spread', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: -2, strikeOffset: 10, dteOffset: null },
        ],
    },
    {
        id: 'builtin_put_ratio_spread', name: 'Put Ratio Spread', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: -2, strikeOffset: -10, dteOffset: null },
        ],
    },
    // --- Straddle/Strangle Writes ---
    {
        id: 'builtin_short_straddle', name: 'Short Straddle', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: 0, dteOffset: null },
        ],
    },
    {
        id: 'builtin_short_strangle', name: 'Short Strangle', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: -1, strikeOffset: 5, dteOffset: null },
            { type: 'put', qty: -1, strikeOffset: -5, dteOffset: null },
        ],
    },
    // --- Vertical Spreads (bear/bull credit) ---
    {
        id: 'builtin_bear_call_spread', name: 'Bear Call Spread', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: null },
            { type: 'call', qty: 1, strikeOffset: 10, dteOffset: null },
        ],
    },
    {
        id: 'builtin_bull_put_spread', name: 'Bull Put Spread', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: -1, strikeOffset: 0, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: -10, dteOffset: null },
        ],
    },
    // --- Collar ---
    {
        id: 'builtin_collar', name: 'Collar', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'stock', qty: 1, strikeOffset: null, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: -5, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 5, dteOffset: null },
        ],
    },
    // --- Calendar Spreads ---
    {
        id: 'builtin_call_calendar', name: 'Call Calendar', builtin: true, selectableExpiry: false,
        legs: [
            { type: 'call', qty: -1, strikeOffset: 0, dteOffset: 63 },
            { type: 'call', qty: 1, strikeOffset: 0, dteOffset: 126 },
        ],
    },
    {
        id: 'builtin_put_calendar', name: 'Put Calendar', builtin: true, selectableExpiry: false,
        legs: [
            { type: 'put', qty: -1, strikeOffset: 0, dteOffset: 63 },
            { type: 'put', qty: 1, strikeOffset: 0, dteOffset: 126 },
        ],
    },
    // --- Jade Lizard ---
    {
        id: 'builtin_jade_lizard', name: 'Jade Lizard', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: -1, strikeOffset: -5, dteOffset: null },
            { type: 'call', qty: -1, strikeOffset: 5, dteOffset: null },
            { type: 'call', qty: 1, strikeOffset: 10, dteOffset: null },
        ],
    },
    // --- Gut Spreads ---
    {
        id: 'builtin_long_guts', name: 'Long Guts', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'call', qty: 1, strikeOffset: -5, dteOffset: null },
            { type: 'put', qty: 1, strikeOffset: 5, dteOffset: null },
        ],
    },
    // --- Risk Reversal ---
    {
        id: 'builtin_risk_reversal', name: 'Risk Reversal', builtin: true, selectableExpiry: true,
        legs: [
            { type: 'put', qty: -1, strikeOffset: -5, dteOffset: null },
            { type: 'call', qty: 1, strikeOffset: 5, dteOffset: null },
        ],
    },
];

function generateId() {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

function _readStore() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch { return {}; }
}

function _writeStore(obj) {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

// --- CRUD ---

export function listStrategies() {
    const store = _readStore();
    const user = Object.entries(store).map(([id, v]) => ({
        id, name: v.name, legs: v.legs, builtin: false,
        selectableExpiry: !!v.selectableExpiry,
    }));
    return [...BUILTINS, ...user];
}

export function getStrategy(id) {
    const builtin = BUILTINS.find(b => b.id === id);
    if (builtin) return builtin;
    const store = _readStore();
    const entry = store[id];
    if (!entry) return null;
    return { id, name: entry.name, legs: entry.legs, builtin: false,
        selectableExpiry: !!entry.selectableExpiry };
}

export function saveStrategy(id, name, legs, selectableExpiry) {
    const store = _readStore();
    const trimmed = (name || '').slice(0, MAX_NAME_LEN).trim();
    const finalName = trimmed || nextAutoName();

    // Check name collision (case-insensitive), excluding the strategy being updated
    const nameLower = finalName.toLowerCase();
    if (BUILTINS.some(b => b.name.toLowerCase() === nameLower)) return 'collision';
    for (const [sid, v] of Object.entries(store)) {
        if (sid !== id && v.name.toLowerCase() === nameLower) return 'collision';
    }

    if (id && store[id]) {
        store[id] = { name: finalName, legs, selectableExpiry: !!selectableExpiry };
        _writeStore(store);
        return id;
    }
    // New strategy — check cap
    if (Object.keys(store).length >= MAX_STRATEGIES) return null;
    const newId = generateId();
    store[newId] = { name: finalName, legs, selectableExpiry: !!selectableExpiry };
    _writeStore(store);
    return newId;
}

export function nextAutoName() {
    const store = _readStore();
    const existing = new Set([
        ...BUILTINS.map(b => b.name.toLowerCase()),
        ...Object.values(store).map(s => s.name.toLowerCase()),
    ]);
    for (let i = 1; ; i++) {
        const candidate = 'Strategy ' + i;
        if (!existing.has(candidate.toLowerCase())) return candidate;
    }
}

export function deleteStrategy(id) {
    if (BUILTINS.some(b => b.id === id)) return;
    const store = _readStore();
    delete store[id];
    _writeStore(store);
}

// --- Resolution ---

/**
 * Resolve relative legs to absolute strike/expiryDay.
 * @param {Array} legs - stored legs with strikeOffset/dteOffset
 * @param {number} S - current stock price
 * @param {number} day - current sim day
 * @param {Array} expiries - [{day, dte}] from ExpiryManager
 * @param {number|null} overrideExpiryDay - if set, use this expiry for legs with dteOffset===null
 */
export function resolveLegs(legs, S, day, expiries, overrideExpiryDay) {
    return legs.map(leg => {
        if (leg.type === 'stock') {
            return { type: leg.type, qty: leg.qty, strike: null, expiryDay: null };
        }
        if (leg.type === 'bond') {
            let expiryDay = null;
            if (leg.dteOffset == null) {
                expiryDay = overrideExpiryDay || (expiries[0] ? expiries[0].day : day + 63);
            } else if (leg.dteOffset != null) {
                const targetDay = day + leg.dteOffset;
                let bestExpiry = expiries[0];
                for (let i = 1; i < expiries.length; i++) {
                    if (Math.abs(expiries[i].day - targetDay) < Math.abs(bestExpiry.day - targetDay)) bestExpiry = expiries[i];
                }
                expiryDay = bestExpiry ? bestExpiry.day : day + 63;
            }
            return { type: leg.type, qty: leg.qty, strike: null, expiryDay };
        }
        const strike = Math.round((S + leg.strikeOffset) / 5) * 5;
        let expiryDay;
        if (leg.dteOffset == null) {
            // Selectable expiry leg — use override or nearest available
            expiryDay = overrideExpiryDay || (expiries[0] ? expiries[0].day : day + 63);
        } else {
            const targetDay = day + leg.dteOffset;
            let bestExpiry = expiries[0];
            for (let i = 1; i < expiries.length; i++) {
                if (Math.abs(expiries[i].day - targetDay) < Math.abs(bestExpiry.day - targetDay)) {
                    bestExpiry = expiries[i];
                }
            }
            expiryDay = bestExpiry ? bestExpiry.day : day + 63;
        }
        return { type: leg.type, qty: leg.qty, strike, expiryDay };
    });
}

export function formatLeg(leg) {
    const side = leg.qty > 0 ? 'Long' : 'Short';
    const typeStr = leg.type.toUpperCase();
    if (leg.type === 'stock' || leg.type === 'bond') return side + ' ' + typeStr;
    const offset = leg.strikeOffset || 0;
    const strikeStr = offset === 0 ? 'ATM' : offset > 0 ? 'ATM+' + offset : 'ATM' + offset;
    if (leg.dteOffset == null) return side + ' ' + typeStr + ' ' + strikeStr;
    return side + ' ' + typeStr + ' ' + strikeStr + ' ' + leg.dteOffset + 'd';
}

// --- Net cost computation ---

export function computeNetCost(legs, S, vol, r, day, q, expiries, overrideExpiryDay) {
    const resolved = resolveLegs(legs, S, day, expiries, overrideExpiryDay);
    let net = 0;
    for (let i = 0; i < resolved.length; i++) {
        const leg = resolved[i];
        const absQty = Math.abs(leg.qty);
        const isLong = leg.qty > 0;
        const mid = unitPrice(leg.type, S, vol, r, day, leg.strike, leg.expiryDay, q);
        const spreadVol = leg.type === 'bond' ? market.sigmaR : vol;
        const ba = (leg.type === 'call' || leg.type === 'put')
            ? computeOptionBidAsk(mid, S, leg.strike, spreadVol)
            : computeBidAsk(mid, spreadVol);
        const fill = isLong ? ba.ask : ba.bid;
        net += (isLong ? fill : -fill) * absQty;
    }
    return net; // positive = debit, negative = credit
}

// --- Conversion ---

export function legsToRelative(absLegs, S, day, selectableExpiry) {
    return absLegs.map(leg => {
        if (leg.type === 'stock' || leg.type === 'bond') {
            return { type: leg.type, qty: leg.qty, strikeOffset: null, dteOffset: null };
        }
        const strikeOffset = (leg.strike != null ? leg.strike : Math.round(S / 5) * 5) - Math.round(S / 5) * 5;
        const dteOffset = selectableExpiry ? null : Math.max(1, (leg.expiryDay != null ? leg.expiryDay : day) - day);
        return { type: leg.type, qty: leg.qty, strikeOffset, dteOffset };
    });
}
