/* ===================================================
   convictions.js -- Player conviction system. Persistent
   gameplay modifiers unlocked by accumulated choices
   and trading behavior. Does NOT change market params.

   Leaf module. No DOM access.
   =================================================== */

const _active = new Set();

const CONVICTIONS = [
    {
        id: 'information_edge',
        name: 'Information Is Everything',
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
        description: 'You thrive in chaos. Layer 3 thresholds raised. Boredom boost disabled.',
        condition: (ctx) => ctx.impactHistory.length >= 8,
        effects: { boredomImmune: true, layerThresholdMult: 1.25 },
    },
    {
        id: 'desk_protects',
        name: 'The Desk Protects Its Own',
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
];

export function evaluateConvictions(ctx) {
    if (_active.size === CONVICTIONS.length) return [];
    const newlyUnlocked = [];
    for (const conv of CONVICTIONS) {
        if (_active.has(conv.id)) continue;
        try {
            if (conv.condition(ctx)) {
                _active.add(conv.id);
                newlyUnlocked.push(conv.id);
            }
        } catch { /* skip */ }
    }
    return newlyUnlocked;
}

export function getActiveConvictions() {
    return CONVICTIONS.filter(c => _active.has(c.id));
}

export function getConviction(id) {
    return CONVICTIONS.find(c => c.id === id) || null;
}

export function getConvictionEffect(effectKey, defaultVal) {
    let result = defaultVal;
    for (const conv of CONVICTIONS) {
        if (!_active.has(conv.id)) continue;
        const val = conv.effects[effectKey];
        if (val === undefined) continue;
        if (typeof val === 'boolean') {
            if (val) return true;
        } else if (typeof val === 'number') {
            result *= val;
        }
    }
    return result;
}

export function resetConvictions() {
    _active.clear();
}

export function getConvictionIds() {
    return [..._active];
}

export { CONVICTIONS };
