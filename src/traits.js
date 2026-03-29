/* ===================================================
   traits.js -- Unified trait system. Permanent convictions
   (gameplay modifiers unlocked by accumulated choices)
   plus dynamic reputation tags (faction-derived, narrative
   gating). Does NOT change market params.

   Leaf module. No DOM access.
   =================================================== */

import { getFaction } from './faction-standing.js';

const _active = new Set();
let _quietMoneyLost = false;

const TRAITS = [
    // ── Permanent convictions (gameplay modifiers) ─────────────
    {
        id: 'information_edge',
        name: 'Information Is Everything',
        permanent: true,
        description: 'Event toasts show parameter direction hints. Compliance watches more closely.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.pursued_insider_tip) score++;
            if (f.pursued_pnth_tip) score++;
            if (f.pursued_analyst_tip) score++;
            return score >= 2;
        },
        effects: { eventHintArrows: true, firmCooldownMult: 0.8 },
    },
    {
        id: 'market_always_right',
        name: 'The Market Is Always Right',
        permanent: true,
        description: 'Compliance treats you well. Event coupling is dampened.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.cooperated_with_compliance) score++;
            if (f.cooperated_unusual_activity) score++;
            if (f.declined_insider_tip) score++;
            if (f.donated_during_recession) score++;
            if (f.passed_channel_check) score++;
            return score >= 3;
        },
        effects: { firmThresholdMult: 1.3, couplingCapMult: 0.5 },
    },
    {
        id: 'contrarian_instinct',
        name: 'Contrarian Instinct',
        permanent: true,
        description: 'You thrive in chaos. Layer 3 thresholds raised. Boredom boost disabled.',
        condition: (ctx) => ctx.impactHistory.length >= 8,
        effects: { boredomImmune: true, layerThresholdMult: 1.25 },
    },
    {
        id: 'desk_protects',
        name: 'The Desk Protects Its Own',
        permanent: true,
        description: 'Compliance popup frequency reduced. Insider tip events stop firing.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            return f.donated_during_recession && f.cooperated_with_compliance &&
                   ctx.factions.firmStanding >= 60;
        },
        effects: { firmCooldownMult: 1.5, tipAccuracy: 0 },
    },
    {
        id: 'master_of_leverage',
        name: 'Master of Leverage',
        permanent: true,
        description: 'Event coupling amplified. Scrutiny builds faster.',
        condition: (ctx) => {
            const strong = ctx.quarterlyReviews.filter(r => r.rating === 'strong');
            return strong.length >= 3 && ctx.impactHistory.length >= 5;
        },
        effects: { couplingCapMult: 1.5, regExposureMult: 1.3 },
    },
    {
        id: 'political_operator',
        name: 'Political Operator',
        permanent: true,
        description: 'Lobbying costs reduced. Regulatory events reference you by name.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.attended_fundraiser) score++;
            if (f.attended_political_dinner) score++;
            if (f.sent_check_no_dinner) score++;
            if (f.did_ft_interview) score++;
            if (f.accepted_panel_media) score++;
            return score >= 3;
        },
        effects: { lobbyingCostMult: 0.7 },
    },
    {
        id: 'ghost_protocol',
        name: 'Ghost Protocol',
        permanent: true,
        description: 'Scrutiny gain halved. Compliance rarely triggers. You are invisible.',
        condition: (ctx) => {
            const flags = Object.keys(ctx.playerChoices);
            return flags.length <= 3 && ctx.impactHistory.length <= 2 &&
                   ctx.daysSinceLiveTrade > 200 && ctx.factions.regulatoryExposure < 25;
        },
        effects: { regExposureMult: 0.5, firmCooldownMult: 2.0 },
    },
    {
        id: 'volatility_addict',
        name: 'Volatility Addict',
        permanent: true,
        description: 'You see the vol surface more clearly. Straddle/strangle strategies highlighted.',
        condition: (ctx) => {
            const optionTrades = ctx.impactHistory.filter(h => h.context && h.context.includes('option'));
            return optionTrades.length >= 6;
        },
        effects: { eventHintArrows: true },
    },
    {
        id: 'media_darling',
        name: 'Media Darling',
        permanent: true,
        description: 'Your name appears in The Continental, The Sentinel, and MarketWire — sometimes all on the same day.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.did_ft_interview) score++;
            if (f.accepted_panel_media) score++;
            if (f.accepted_profile_piece) score++;
            if (ctx.impactHistory.length >= 5) score++;
            return score >= 3;
        },
        effects: { eventHintArrows: true },
    },
    {
        id: 'washington_insider',
        name: 'Washington Insider',
        permanent: true,
        description: 'You know which senators answer their phones and which lobbyists return calls. Meridian Capital has a seat at the table.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.attended_fundraiser) score++;
            if (f.attended_political_dinner) score++;
            if (f.did_ft_interview) score++;
            if ((f.lobbyCount || 0) >= 3) score++;
            return score >= 3;
        },
        effects: { lobbyingCostMult: 0.6 },
    },
    {
        id: 'risk_manager',
        name: 'Risk Manager',
        permanent: true,
        description: 'You file your reports on time, hedge your positions, and cooperate with compliance. The desk trusts you.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.cooperated_with_compliance) score++;
            if (f.filed_fomc_docs) score++;
            if (f.declined_insider_tip) score++;
            const strongReviews = (ctx.quarterlyReviews || []).filter(r => r.rating === 'strong').length;
            if (strongReviews >= 2) score++;
            if (ctx.factions && ctx.factions.firmStanding >= 70) score++;
            return score >= 3;
        },
        effects: { firmThresholdMult: 1.5, firmCooldownMult: 1.8 },
    },
    {
        id: 'crisis_profiteer',
        name: 'Crisis Profiteer',
        permanent: true,
        description: 'Every catastrophe is a trade. When the Strait closes, when the border falls, when the hearings begin — you\'re already positioned.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.profited_recession) score++;
            if (f.profited_oil_crisis) score++;
            if (f.profited_war_escalation) score++;
            if (f.profited_impeachment) score++;
            return score >= 2;
        },
        effects: { regExposureMult: 1.5, boredomImmune: true },
    },

    // ── Reputation tags (dynamic, narrative gating) ────────────
    {
        id: 'market_mover',
        name: 'Market Mover',
        permanent: false,
        condition: (ctx) => (ctx.flags.largeImpactTrades || 0) >= 3,
        effects: {},
    },
    {
        id: 'political_player',
        name: 'Political Player',
        permanent: false,
        condition: () => getFaction('federalistSupport') > 50 || getFaction('farmerLaborSupport') > 50,
        effects: {},
    },
    {
        id: 'media_figure',
        name: 'Media Figure',
        permanent: false,
        condition: (ctx) => getFaction('mediaTrust') > 60 || (ctx.flags.continentalMentions || 0) >= 2,
        effects: {},
    },
    {
        id: 'under_scrutiny',
        name: 'Under Scrutiny',
        permanent: false,
        condition: () => getFaction('regulatoryExposure') > 50,
        effects: {},
    },
    {
        id: 'meridian_star',
        name: 'Meridian Star',
        permanent: false,
        condition: () => getFaction('firmStanding') > 80,
        effects: {},
    },
    {
        id: 'quiet_money',
        name: 'Quiet Money',
        permanent: false,
        loseForever: true,
        condition: () =>
            getFaction('federalistSupport') < 40 &&
            getFaction('farmerLaborSupport') < 40 &&
            getFaction('mediaTrust') < 40 &&
            getFaction('regulatoryExposure') < 25,
        effects: {},
    },
];

export function evaluateTraits(ctx) {
    const newlyActive = [];
    for (const trait of TRAITS) {
        const wasActive = _active.has(trait.id);

        if (trait.permanent) {
            if (wasActive) continue;
            try {
                if (trait.condition(ctx)) {
                    _active.add(trait.id);
                    newlyActive.push(trait.id);
                }
            } catch (e) { console.warn('Trait condition error:', trait.id, e); }
        } else if (trait.loseForever) {
            if (_quietMoneyLost) { _active.delete(trait.id); continue; }
            try {
                if (trait.condition(ctx)) {
                    if (!wasActive) { _active.add(trait.id); newlyActive.push(trait.id); }
                } else {
                    _active.delete(trait.id);
                    _quietMoneyLost = true;
                }
            } catch (e) { console.warn('Trait condition error:', trait.id, e); }
        } else {
            try {
                if (trait.condition(ctx)) {
                    if (!wasActive) newlyActive.push(trait.id);
                    _active.add(trait.id);
                } else {
                    _active.delete(trait.id);
                }
            } catch (e) { console.warn('Trait condition error:', trait.id, e); }
        }
    }
    return newlyActive;
}

export function hasTrait(id) { return _active.has(id); }

export function getTraitEffect(effectKey, defaultVal) {
    let result = defaultVal;
    for (const trait of TRAITS) {
        if (!_active.has(trait.id)) continue;
        const val = trait.effects[effectKey];
        if (val === undefined) continue;
        if (typeof val === 'boolean') {
            if (val) return true;
        } else if (typeof val === 'number') {
            result *= val;
        }
    }
    return result;
}

export function getActiveTraitIds() { return [..._active]; }
export function getActiveTraits() { return TRAITS.filter(t => _active.has(t.id)); }
export function getTrait(id) { return TRAITS.find(t => t.id === id) || null; }
export function resetTraits() { _active.clear(); _quietMoneyLost = false; }
export { TRAITS };
