/* ===================================================
   compliance.js -- Regulatory heat and credibility
   tracking for the Shoals trading simulator.

   Leaf module. No DOM access.
   =================================================== */

import {
    INITIAL_CAPITAL, COMPLIANCE_CREDIBILITY_CAP,
    COMPLIANCE_COOLDOWN_HEAT_COEFF, COMPLIANCE_THRESHOLD_CRED_COEFF,
} from './config.js';

export const compliance = {
    heat: 0,
    credibility: 0,
    equityAtLastReview: INITIAL_CAPITAL,
    lastReviewDay: 0,
};

export function resetCompliance() {
    compliance.heat = 0;
    compliance.credibility = 0;
    compliance.equityAtLastReview = INITIAL_CAPITAL;
    compliance.lastReviewDay = 0;
}

export function effectiveHeat() {
    return compliance.heat - compliance.credibility;
}

/**
 * Called when a compliance popup triggers, before presenting choices.
 * Checks whether the player has been profitable since last review.
 * If profitable: resets heat, gains credibility scaled by profit magnitude.
 * Always snapshots current equity for next review.
 */
export function onComplianceTriggered(currentEquity, currentDay) {
    const profitRatio = (currentEquity - compliance.equityAtLastReview) / compliance.equityAtLastReview;
    if (profitRatio > 0) {
        compliance.heat = 0;
        const gain = Math.min(2, Math.max(0, profitRatio * 5));
        compliance.credibility = Math.min(COMPLIANCE_CREDIBILITY_CAP, compliance.credibility + gain);
    }
    compliance.equityAtLastReview = currentEquity;
    compliance.lastReviewDay = currentDay;
}

/**
 * Called after the player makes a compliance choice.
 * @param {'full'|'partial'|'defiant'} tier
 * @param {number} [severity=1] - heat increment for defiance (1 or 2)
 */
export function onComplianceChoice(tier, severity = 1) {
    if (tier === 'full') {
        compliance.heat = Math.max(0, compliance.heat - 1);
    } else if (tier === 'defiant') {
        compliance.heat += severity;
    }
    // 'partial' leaves heat unchanged
}

/**
 * Multiplier for compliance popup cooldowns.
 * High effective heat = shorter cooldowns (they watch more closely).
 * Negative effective heat = longer cooldowns (they leave you alone).
 */
export function cooldownMultiplier() {
    const scaled = effectiveHeat() * COMPLIANCE_COOLDOWN_HEAT_COEFF;
    return 1 - Math.min(0.5, Math.max(-0.5, scaled));
}

/**
 * Multiplier for position-size trigger thresholds.
 * Higher credibility = more lenient thresholds.
 */
export function thresholdMultiplier() {
    return 1 + compliance.credibility * COMPLIANCE_THRESHOLD_CRED_COEFF;
}

/**
 * Returns a tone string based on effective heat, for use in
 * generating context text for compliance popups.
 */
export function complianceTone() {
    const eh = effectiveHeat();
    if (eh < 0) return 'warm';
    if (eh <= 1) return 'professional';
    if (eh <= 3) return 'pointed';
    if (eh <= 4) return 'final_warning';
    return 'terminated';
}
