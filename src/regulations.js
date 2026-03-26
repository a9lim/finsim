/* ===================================================
   regulations.js -- Regulatory environment system.
   Congressional control and world events create
   persistent rule changes affecting trading mechanics.

   Leaf module. No DOM access.
   =================================================== */

import { congressHelpers } from './world-state.js';

const _active = new Map(); // id -> regulation object

const REGULATIONS = [
    {
        id: 'transaction_tax',
        name: 'Farmer-Labor Transaction Tax',
        description: 'The Okafor-Whitfield revenue package imposes a 0.1% levy on all securities transactions — spreads widen across the board.',
        color: 'var(--ext-rose)',
        condition: (world, congress) => !congress.fedControlsHouse && !congress.fedControlsSenate,
        effects: { spreadMult: 1.5 },
    },
    {
        id: 'deregulation_act',
        name: 'Financial Freedom Act (Lassiter-Tao)',
        description: 'Lassiter and Tao ram banking deregulation through the Federalist trifecta — margin requirements loosened, risk limits relaxed.',
        color: 'var(--ext-orange)',
        condition: (world, congress) => congress.trifecta,
        effects: { marginMult: 0.8, rogueThresholdMult: 0.85 },
    },
    {
        id: 'short_sale_ban',
        name: 'Emergency Short-Sale Ban',
        description: 'The SEC invokes emergency powers as recession grips Columbia — short stock positions temporarily prohibited.',
        color: 'var(--ext-red)',
        condition: (world) => world.geopolitical.recessionDeclared,
        effects: { shortStockDisabled: true },
    },
    {
        id: 'rate_ceiling',
        name: 'White House Rate Guidance',
        description: 'With Hartley gone and Vane not yet confirmed, the Barron administration issues "informal guidance" capping the federal funds rate at 6%.',
        color: 'var(--ext-blue)',
        condition: (world) => world.fed.hartleyFired && !world.fed.vaneAppointed,
        effects: { rateCeiling: 0.06 },
    },
    {
        id: 'qe_floor',
        name: 'Quantitative Easing Floor',
        description: 'The Fed\'s asset purchase program pins short-term rates near zero — Priya Sharma calls it "the floor that won\'t break."',
        color: 'var(--ext-blue)',
        condition: (world) => world.fed.qeActive,
        effects: { rateFloor: 0.001 },
    },
    {
        id: 'sanctions_compliance',
        name: 'Serican Sanctions Compliance',
        description: 'Lassiter\'s sanctions regime requires full counterparty screening on every trade — compliance overhead increases borrowing costs.',
        color: 'var(--ext-indigo)',
        condition: (world) => world.geopolitical.sanctionsActive,
        effects: { borrowSpreadAdd: 0.3 },
    },
    {
        id: 'antitrust_scrutiny',
        name: 'PNTH Antitrust Scrutiny',
        description: 'The DOJ suit and Okafor\'s Senate probe create a cloud of regulatory uncertainty around Palanthropic — spreads widen on every headline.',
        color: 'var(--ext-purple)',
        condition: (world) => world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched,
        effects: { spreadMult: 1.2 },
    },
    {
        id: 'oil_emergency',
        name: 'Strait of Farsis Emergency Margins',
        description: 'As Emir al-Farhan tightens the oil chokepoint, clearinghouses raise margin requirements across energy-linked instruments.',
        color: 'var(--ext-brown)',
        condition: (world) => world.geopolitical.oilCrisis,
        effects: { marginMult: 1.3 },
    },
    {
        id: 'trade_war_tariffs',
        name: 'Serican Reciprocal Tariffs',
        description: 'Lassiter\'s Serican Reciprocal Tariff Act is in effect — import costs rise, supply chains reroute, spreads and borrowing costs climb.',
        color: 'var(--ext-yellow)',
        condition: (world) => world.geopolitical.tradeWarStage >= 2,
        effects: { spreadMult: 1.15, borrowSpreadAdd: 0.15 },
    },
    {
        id: 'campaign_finance',
        name: 'Campaign Finance Scrutiny',
        description: 'Primary season brings FEC scrutiny to every political donation. Okafor\'s committee signals it\'s watching "Wall Street money in politics."',
        color: 'var(--ext-magenta)',
        condition: (world) => world.election.primarySeason,
        effects: {},
    },
    {
        id: 'filibuster_uncertainty',
        name: 'Senate Filibuster Uncertainty',
        description: 'Whitfield holds the Senate floor. Markets hate uncertainty — spreads widen and vol ticks up while the filibuster continues.',
        color: 'var(--ext-indigo)',
        condition: (world) => world.congress.filibusterActive,
        effects: { spreadMult: 1.25 },
    },
];

/**
 * Re-evaluate which regulations are active based on current world state.
 * @returns {{ activated: string[], deactivated: string[] }}
 */
export function evaluateRegulations(world) {
    const congress = congressHelpers(world);
    const activated = [];
    const deactivated = [];

    for (const reg of REGULATIONS) {
        const shouldBeActive = reg.condition(world, congress);
        const wasActive = _active.has(reg.id);

        if (shouldBeActive && !wasActive) {
            _active.set(reg.id, reg);
            activated.push(reg.id);
        } else if (!shouldBeActive && wasActive) {
            _active.delete(reg.id);
            deactivated.push(reg.id);
        }
    }
    return { activated, deactivated };
}

/** Get all currently active regulation objects. */
export function getActiveRegulations() {
    return [..._active.values()];
}

/**
 * Read a specific effect value across all active regulations.
 * Boolean: true if ANY active. Mult: product. Add: sum. Ceiling: min. Floor: max.
 */
export function getRegulationEffect(effectKey, defaultVal) {
    let result = defaultVal;
    let found = false;

    for (const [, reg] of _active) {
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
    return REGULATIONS.find(r => r.id === id) || null;
}

export function resetRegulations() {
    _active.clear();
}

export { REGULATIONS };
