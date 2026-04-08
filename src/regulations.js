/* ===================================================
   regulations.js -- Event-driven regulatory system.
   Regulations are activated/deactivated exclusively by
   narrative events. Legislative bills move through a
   pipeline; executive orders auto-expire.

   Leaf module. No DOM access.
   =================================================== */

// Unified state: id -> { status, remainingDays }
// Status: 'introduced'|'committee'|'floor'|'active'|'failed'|'expired'|'repealed'
const _state = new Map();

const REGULATIONS = [
    {
        id: 'transaction_tax',
        name: 'Okafor-Whitfield Revenue Package',
        description: 'The Okafor-Whitfield revenue package imposes a 0.1% levy on all securities transactions — spreads widen across the board.',
        color: 'var(--ext-rose)',
        type: 'legislative',
        effects: { spreadMult: 1.5 },
    },
    {
        id: 'deregulation_act',
        name: 'Financial Freedom Act',
        description: 'Lassiter and Tao ram banking deregulation through Congress — margin requirements loosened, risk limits relaxed.',
        color: 'var(--ext-orange)',
        type: 'legislative',
        effects: { marginMult: 0.8, rogueThresholdMult: 0.85 },
    },
    {
        id: 'short_sale_ban',
        name: 'Emergency Short-Sale Ban',
        description: 'The SEC invokes emergency powers as recession grips Columbia — short stock positions temporarily prohibited.',
        color: 'var(--ext-red)',
        type: 'executive',
        duration: 90,
        effects: { shortStockDisabled: true },
    },
    {
        id: 'rate_ceiling',
        name: 'White House Rate Guidance',
        description: 'With Hartley gone and Vane not yet confirmed, the Barron administration issues "informal guidance" capping the federal funds rate at 6%.',
        color: 'var(--ext-blue)',
        type: 'executive',
        duration: 120,
        effects: { rateCeiling: 0.06 },
    },
    {
        id: 'qe_floor',
        name: 'Quantitative Easing Floor',
        description: 'The Fed\'s asset purchase program pins short-term rates near zero — Priya Sharma calls it "the floor that won\'t break."',
        color: 'var(--ext-blue)',
        type: 'executive',
        duration: 180,
        effects: { rateFloor: 0.001 },
    },
    {
        id: 'sanctions_compliance',
        name: 'Serican Sanctions Compliance',
        description: 'Lassiter\'s sanctions regime requires full counterparty screening on every trade — compliance overhead increases borrowing costs.',
        color: 'var(--ext-indigo)',
        type: 'executive',
        duration: 120,
        effects: { borrowSpreadAdd: 0.3 },
    },
    {
        id: 'antitrust_scrutiny',
        name: 'Digital Markets Accountability Act',
        description: 'The DOJ suit and Okafor\'s Senate probe create a cloud of regulatory uncertainty around Palanthropic — spreads widen on every headline.',
        color: 'var(--ext-purple)',
        type: 'legislative',
        effects: { spreadMult: 1.2 },
    },
    {
        id: 'oil_emergency',
        name: 'Strait of Hormuz Emergency Margins',
        description: 'As Emir al-Farhan tightens the oil chokepoint, clearinghouses raise margin requirements across energy-linked instruments.',
        color: 'var(--ext-brown)',
        type: 'executive',
        duration: 60,
        effects: { marginMult: 1.3 },
    },
    {
        id: 'trade_war_tariffs',
        name: 'Serican Reciprocal Tariff Act',
        description: 'Lassiter\'s Serican Reciprocal Tariff Act is in effect — import costs rise, supply chains reroute, spreads and borrowing costs climb.',
        color: 'var(--ext-yellow)',
        type: 'legislative',
        effects: { spreadMult: 1.15, borrowSpreadAdd: 0.15 },
    },
    {
        id: 'campaign_finance',
        name: 'Campaign Finance Reform Act',
        description: 'Primary season brings FEC scrutiny to every political donation. Okafor\'s committee signals it\'s watching "Wall Street money in politics."',
        color: 'var(--ext-magenta)',
        type: 'legislative',
        effects: {},
    },
    {
        id: 'filibuster_uncertainty',
        name: 'Senate Filibuster Uncertainty',
        description: 'Whitfield holds the Senate floor. Markets hate uncertainty — spreads widen and vol ticks up while the filibuster continues.',
        color: 'var(--ext-indigo)',
        type: 'executive',
        duration: null, // special: no auto-expiry, controlled by filibuster chain
        effects: { spreadMult: 1.25 },
    },
];

// -- Lookup helper --------------------------------------------------------

const _regById = new Map(REGULATIONS.map(r => [r.id, r]));

/**
 * Advance a bill through the legislative pipeline.
 * Called by event effects to move bills between stages.
 */
const LEGAL_TRANSITIONS = {
    null:         ['introduced', 'active'], // null = not yet in pipeline; active for executive orders
    'introduced': ['committee', 'failed'],
    'committee':  ['floor', 'failed'],
    'floor':      ['active', 'failed'],
    'active':     ['repealed'],
};

export function advanceBill(id, status) {
    const reg = _regById.get(id);
    if (!reg) return;

    if (status === 'failed' || status === 'repealed') {
        _state.delete(id);
        return;
    }

    const entry = _state.get(id) || { status: null, remainingDays: null };

    // Validate transition (skip for executive orders which go straight to active)
    const allowed = LEGAL_TRANSITIONS[entry.status];
    if (allowed && !allowed.includes(status)) return;

    entry.status = status;

    if (status === 'active') {
        if (reg.type === 'executive' && reg.duration != null) {
            entry.remainingDays = reg.duration;
        } else {
            entry.remainingDays = null;
        }
    }

    _state.set(id, entry);
}

/**
 * Activate a regulation directly (shorthand for executive/Fed actions).
 * For executive type, uses customDuration or falls back to default.
 */
export function activateRegulation(id, customDuration) {
    const reg = _regById.get(id);
    if (!reg) return;

    const remainingDays = (reg.type === 'executive' && (reg.duration != null || customDuration != null))
        ? (customDuration ?? reg.duration)
        : null;

    _state.set(id, { status: 'active', remainingDays });
}

/**
 * Deactivate a regulation directly.
 */
export function deactivateRegulation(id) {
    _state.delete(id);
}

/**
 * Tick down executive regulation timers. Called once per day.
 * @returns {{ expired: string[] }}
 */
export function tickRegulations() {
    const expired = [];
    for (const [id, entry] of _state) {
        if (entry.status !== 'active' || entry.remainingDays == null) continue;
        entry.remainingDays--;
        if (entry.remainingDays <= 0) {
            expired.push(id);
        }
    }
    for (const id of expired) _state.delete(id);
    return { expired };
}

/**
 * Get pipeline entries for UI display.
 * Returns both pending bills and active regulations.
 */
export function getRegulationPipeline() {
    const result = [];
    for (const [id, entry] of _state) {
        const reg = _regById.get(id);
        if (!reg) continue;
        result.push({
            id,
            name: reg.name,
            color: reg.color,
            type: reg.type,
            status: entry.status,
            remainingDays: entry.remainingDays,
        });
    }
    // Sort: active first, then by pipeline progression
    const ORDER = { active: 0, floor: 1, committee: 2, introduced: 3 };
    result.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
    return result;
}

/**
 * Get current pipeline status for a regulation (used by event guards).
 */
export function getPipelineStatus(id) {
    const entry = _state.get(id);
    return entry ? entry.status : null;
}

/** Get all currently active regulation objects. */
export function getActiveRegulations() {
    const result = [];
    for (const [id, entry] of _state) {
        if (entry.status === 'active') {
            const reg = _regById.get(id);
            if (reg) result.push(reg);
        }
    }
    return result;
}

/**
 * Read a specific effect value across all active regulations.
 * Boolean: true if ANY active. Mult: product. Add: sum. Ceiling: min. Floor: max.
 */
export function getRegulationEffect(effectKey, defaultVal) {
    let result = defaultVal;
    let found = false;

    for (const [id, entry] of _state) {
        if (entry.status !== 'active') continue;
        const reg = _regById.get(id);
        if (!reg) continue;
        const val = reg.effects[effectKey];
        if (val === undefined) continue;

        if (typeof val === 'boolean') {
            if (val) return true;
        } else if (typeof val === 'number') {
            if (effectKey.endsWith('Mult')) {
                result = found ? result * val : val;
            } else if (effectKey.endsWith('Add')) {
                result = found ? result + val : val;
            } else if (effectKey === 'rateCeiling') {
                result = found ? Math.min(result, val) : val;
            } else if (effectKey === 'rateFloor') {
                result = found ? Math.max(result, val) : val;
            } else {
                result = val;
            }
            found = true;
        }
    }
    return found ? result : defaultVal;
}

export function getRegulation(id) {
    return _regById.get(id) || null;
}

export function resetRegulations() {
    _state.clear();
}

