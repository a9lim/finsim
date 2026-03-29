// src/faction-standing.js
import { getTraitEffect } from './traits.js';

const INITIAL_CAPITAL = 10000;

const FACTION_DEFAULTS = {
    firmStanding: 65,
    regulatoryExposure: 10,
    federalistSupport: 30,
    farmerLaborSupport: 30,
    mediaTrust: 40,
    fedRelations: 40,
};

const factions = {
    ...FACTION_DEFAULTS,
    // Boolean flags
    settled: false,
    cooperating: false,
    liedInTestimony: false,
    // Review state
    equityAtLastReview: INITIAL_CAPITAL,
    lastReviewDay: 0,
};

export { factions };

export function getFaction(id) {
    return factions[id];
}

export function getFactionState() {
    return { ...factions };
}

export function resetFactions() {
    Object.assign(factions, FACTION_DEFAULTS);
    factions.settled = false;
    factions.cooperating = false;
    factions.liedInTestimony = false;
    factions.equityAtLastReview = INITIAL_CAPITAL;
    factions.lastReviewDay = 0;
}

/** Shift a faction score by delta, applying conviction multipliers for regulatory exposure. */
export function shiftFaction(id, delta) {
    if (id === 'regulatoryExposure') {
        if (factions.settled) return; // settlement freezes exposure entirely
        delta *= getTraitEffect('regExposureMult', 1);
    }
    factions[id] = Math.max(0, Math.min(100, factions[id] + delta));
}

const REG_THRESHOLDS = [25, 50, 75, 90];

/** Derive regulatory investigation level (0-4) from regulatoryExposure score. */
export function getRegLevel() {
    const score = factions.regulatoryExposure;
    for (let i = REG_THRESHOLDS.length - 1; i >= 0; i--) {
        if (score >= REG_THRESHOLDS[i]) return i + 1;
    }
    return 0;
}

/** Position-size threshold multiplier. High firmStanding = more lenient triggers. */
export function firmThresholdMult() {
    return (1 + (factions.firmStanding / 100) * 0.75) *
        getTraitEffect('firmThresholdMult', 1);
}

/** Capital allocation multiplier based on firm standing. Scales position limits. */
export function capitalMultiplier() {
    return 0.5 + (factions.firmStanding / 100);
}

/** Compliance popup cooldown multiplier. High firmStanding = less frequent popups. */
export function firmCooldownMult() {
    return (0.5 + (factions.firmStanding / 100)) *
        getTraitEffect('firmCooldownMult', 1);
}

const TONE_THRESHOLDS = [
    [70, 'warm'],
    [45, 'professional'],
    [25, 'pointed'],
    [10, 'final_warning'],
];

/** Firm tone descriptor based on firmStanding thresholds. */
export function firmTone() {
    for (const [threshold, tone] of TONE_THRESHOLDS) {
        if (factions.firmStanding > threshold) return tone;
    }
    return 'terminated';
}

/**
 * Called at quarterly boundaries. If profitable since last review,
 * raises firmStanding. Always snapshots equity for next review.
 * Returns the firmStanding delta applied (for display logic).
 */
export function onQuarterlyReview(currentEquity, currentDay) {
    const prevEquity = factions.equityAtLastReview;
    const profitRatio = prevEquity > 0 ? (currentEquity - prevEquity) / prevEquity : 0;
    let delta = 0;
    if (profitRatio > 0) {
        delta = Math.min(8, Math.max(3, Math.round(profitRatio * 50)));
        shiftFaction('firmStanding', delta);
    } else if (profitRatio < -0.05) {
        delta = -Math.min(5, Math.round(Math.abs(profitRatio) * 30));
        shiftFaction('firmStanding', delta);
    }
    factions.equityAtLastReview = currentEquity;
    factions.lastReviewDay = currentDay;
    return delta;
}

/**
 * Called when player makes a compliance popup choice.
 * 'full' cooperation raises firmStanding, 'defiant' lowers it and raises regulatoryExposure.
 */
export function applyComplianceChoice(tier, severity = 1) {
    if (tier === 'full') {
        shiftFaction('firmStanding', 3);
    } else if (tier === 'defiant') {
        shiftFaction('firmStanding', -(3 * severity));
        shiftFaction('regulatoryExposure', severity * 3);
    }
    // 'partial': no change
}

/** Settle with SEC — blocks further regulatoryExposure increases. */
export function settleRegulatory() {
    factions.settled = true;
}

/** Cooperate with investigators — reduces exposure, sets cooperating flag. */
export function cooperateRegulatory() {
    factions.cooperating = true;
    shiftFaction('regulatoryExposure', -20);
}

const DESCRIPTORS = {
    firmStanding: [
        [80, 'Vasquez is championing you'],
        [60, 'Webb is giving you room'],
        [45, 'The desk is watching'],
        [25, 'Webb has concerns'],
        [10, 'On thin ice'],
        [0, 'Termination imminent'],
    ],
    regulatoryExposure: [
        [90, 'Criminal referral territory'],
        [75, 'Active investigation'],
        [50, 'Formal inquiry'],
        [25, 'On the radar'],
        [0, 'Below the radar'],
    ],
    federalistSupport: [
        [75, 'Inner circle'],
        [50, 'Trusted ally'],
        [35, 'They know your name'],
        [20, 'Peripheral'],
        [0, 'Unknown'],
    ],
    farmerLaborSupport: [
        [75, 'Inner circle'],
        [50, 'Trusted ally'],
        [35, 'They know your name'],
        [20, 'Peripheral'],
        [0, 'Unknown'],
    ],
    mediaTrust: [
        [70, 'Tan considers you a source'],
        [50, 'Press is interested'],
        [30, 'Neutral coverage'],
        [15, 'Press is suspicious'],
        [0, 'Media target'],
    ],
    fedRelations: [
        [75, 'Advisory access'],
        [50, 'Respected voice'],
        [30, 'Known quantity'],
        [15, 'No access'],
        [0, 'Shut out'],
    ],
};

/** Get prose descriptor for a faction score. */
export function getFactionDescriptor(id) {
    const score = factions[id];
    for (const [threshold, desc] of DESCRIPTORS[id]) {
        if (score >= threshold) return desc;
    }
    return DESCRIPTORS[id][DESCRIPTORS[id].length - 1][1];
}
