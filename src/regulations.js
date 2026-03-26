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
        name: 'Financial Transaction Tax',
        description: 'Farmer-Labor controls both chambers and passes transaction tax over presidential veto. All spreads widen 50%.',
        condition: (world, congress) => !congress.fedControlsHouse && !congress.fedControlsSenate,
        effects: { spreadMult: 1.5 },
    },
    {
        id: 'deregulation_act',
        name: 'Deregulation Act',
        description: 'Federalist trifecta loosens margin rules. Requirements drop 20%, but rogue threshold drops too.',
        condition: (world, congress) => congress.trifecta,
        effects: { marginMult: 0.8, rogueThresholdMult: 0.85 },
    },
    {
        id: 'short_sale_ban',
        name: 'Emergency Short Sale Ban',
        description: 'Short stock positions temporarily banned after recession declaration.',
        condition: (world) => world.geopolitical.recessionDeclared,
        effects: { shortStockDisabled: true },
    },
    {
        id: 'rate_ceiling',
        name: 'Federal Reserve Independence Act (Repealed)',
        description: 'Barron fires Hartley and imposes political rate guidance. Rate ceiling in effect.',
        condition: (world) => world.fed.hartleyFired && !world.fed.vaneAppointed,
        effects: { rateCeiling: 0.06 },
    },
    {
        id: 'qe_floor',
        name: 'Quantitative Easing',
        description: 'Fed QE program places a floor on asset prices. Rate floored near zero.',
        condition: (world) => world.fed.qeActive,
        effects: { rateFloor: 0.001 },
    },
    {
        id: 'sanctions_compliance',
        name: 'Sanctions Compliance Order',
        description: 'Active sanctions increase compliance overhead. Borrow costs rise.',
        condition: (world) => world.geopolitical.sanctionsActive,
        effects: { borrowSpreadAdd: 0.3 },
    },
    {
        id: 'antitrust_scrutiny',
        name: 'Antitrust Investigation',
        description: 'DOJ suit against Palanthropic increases market volatility and scrutiny.',
        condition: (world) => world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched,
        effects: { spreadMult: 1.2 },
    },
    {
        id: 'oil_emergency',
        name: 'Oil Crisis Emergency Measures',
        description: 'Oil crisis triggers emergency market measures. Margin requirements increase.',
        condition: (world) => world.geopolitical.oilCrisis,
        effects: { marginMult: 1.3 },
    },
    {
        id: 'trade_war_tariffs',
        name: 'Trade War Tariffs',
        description: 'Escalating tariffs widen spreads and increase borrowing costs.',
        condition: (world) => world.geopolitical.tradeWarStage >= 2,
        effects: { spreadMult: 1.15, borrowSpreadAdd: 0.15 },
    },
    {
        id: 'campaign_finance',
        name: 'Campaign Finance Scrutiny',
        description: 'During election season, large trades attract extra regulatory attention.',
        condition: (world) => world.election.primarySeason,
        effects: {},
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
