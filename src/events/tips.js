/* tips.js -- Insider tip outcome events (real and fake),
   insider tip pool, and tip-related popup events. */

import { anyInvestigationActive, equity, totalOptionsNotional, portfolio } from './_helpers.js';
import { hasTrait } from '../traits.js';
import { QUARTERLY_CYCLE, INITIAL_CAPITAL } from '../config.js';

// ---------------------------------------------------------------------------
// Insider tip pool (migrated from popup-events.js)
// ---------------------------------------------------------------------------

export const INSIDER_TIPS = [
    {
        hint: 'Malhotra is going to raise the PNTH dividend at the next earnings call',
        realEvent: 'tip_dividend_hike',
        fakeEvent: 'tip_dividend_flat',
    },
    {
        hint: 'Hartley is going to pause despite the hawkish rhetoric — someone on the FOMC leaked it',
        realEvent: 'tip_fed_pause',
        fakeEvent: 'tip_fed_hike',
    },
    {
        hint: 'Dirks is about to announce a major Atlas Aegis defense contract within two weeks',
        realEvent: 'tip_contract_win',
        fakeEvent: 'tip_contract_loss',
    },
    {
        hint: 'a big short position is about to unwind — something about a margin call at a rival fund',
        realEvent: 'tip_short_squeeze',
        fakeEvent: 'tip_squeeze_fizzle',
    },
    {
        hint: 'Malhotra\'s earnings are going to blow out expectations by double digits',
        realEvent: 'tip_earnings_beat',
        fakeEvent: 'tip_earnings_miss',
    },
    {
        hint: 'there\'s an acquisition offer coming — al-Farhan\'s sovereign wealth fund',
        realEvent: 'tip_acquisition_bid',
        fakeEvent: 'tip_acquisition_denied',
    },
];

const _usedTips = new Set();

export function pickTip() {
    const available = INSIDER_TIPS.filter(t => !_usedTips.has(t.hint));
    const pool = available.length > 0 ? available : INSIDER_TIPS;
    const tip = pool[Math.floor(Math.random() * pool.length)];
    _usedTips.add(tip.hint);
    return tip;
}

export function resetUsedTips() {
    _usedTips.clear();
}

// ---------------------------------------------------------------------------
// Tip outcome events
// ---------------------------------------------------------------------------

export const TIP_EVENTS = [
    // -- Insider tip outcome events (real) --
    {
        id: 'tip_dividend_hike',
        category: 'pnth_earnings',
        likelihood: 0,
        headline: 'PNTH announces surprise dividend hike — payout doubles',
        params: { mu: 0.03, theta: -0.01 },
        magnitude: 'moderate',
    },
    {
        id: 'tip_fed_pause',
        category: 'fed',
        likelihood: 0,
        headline: 'Fed holds steady in surprise decision — doves prevail',
        params: { mu: 0.02, theta: -0.005, b: -0.005, sigmaR: -0.002 },
        magnitude: 'moderate',
    },
    {
        id: 'tip_contract_win',
        category: 'sector',
        likelihood: 0,
        headline: 'PNTH wins $2.8B defense contract — shares surge',
        params: { mu: 0.04, theta: -0.015 },
        magnitude: 'moderate',
    },
    {
        id: 'tip_short_squeeze',
        category: 'market',
        likelihood: 0,
        headline: 'Short squeeze erupts — forced covering drives 8% rally in hours',
        params: { mu: 0.05, theta: 0.02, lambda: 1.5 },
        magnitude: 'major',
    },
    {
        id: 'tip_earnings_beat',
        category: 'pnth_earnings',
        likelihood: 0,
        headline: 'PNTH crushes earnings — revenue up 25%, guidance raised',
        params: { mu: 0.04, theta: -0.01, q: 0.002 },
        magnitude: 'moderate',
    },
    {
        id: 'tip_acquisition_bid',
        category: 'sector',
        likelihood: 0,
        headline: 'Foreign consortium launches $55B bid for PNTH — 30% premium',
        params: { mu: 0.06, theta: -0.02, xi: 0.03 },
        magnitude: 'major',
    },

    // -- Insider tip outcome events (fake — "despite rumors") --
    {
        id: 'tip_dividend_flat',
        category: 'pnth_earnings',
        likelihood: 0,
        headline: 'PNTH maintains dividend despite rumors of increase — board prioritizes buybacks',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'tip_fed_hike',
        category: 'fed',
        likelihood: 0,
        headline: 'Despite rumors of a pause, Fed hikes 25bps — Hartley cites persistent inflation',
        params: { mu: -0.02, theta: 0.01, b: 0.005, sigmaR: 0.003 },
        magnitude: 'moderate',
    },
    {
        id: 'tip_contract_loss',
        category: 'sector',
        likelihood: 0,
        headline: 'PNTH loses defense bid to rival despite rumors of a win — shares slide',
        params: { mu: -0.03, theta: 0.01 },
        magnitude: 'moderate',
    },
    {
        id: 'tip_squeeze_fizzle',
        category: 'market',
        likelihood: 0,
        headline: 'Rumored short squeeze fizzles — shorts hold firm, longs trapped',
        params: { mu: -0.02, theta: 0.015 },
        magnitude: 'minor',
    },
    {
        id: 'tip_earnings_miss',
        category: 'pnth_earnings',
        likelihood: 0,
        headline: 'Despite whisper-number optimism, PNTH misses estimates — guidance lowered',
        params: { mu: -0.03, theta: 0.015, q: -0.001 },
        magnitude: 'moderate',
    },
    {
        id: 'tip_acquisition_denied',
        category: 'sector',
        likelihood: 0,
        headline: 'PNTH denies acquisition rumors — "not in discussions with any party"',
        params: { mu: -0.02, theta: 0.01, xi: -0.01 },
        magnitude: 'minor',
    },

    // ===================================================================
    //  TIP POPUP EVENTS (migrated from popup-events.js)
    // ===================================================================

    {
        id: 'desk_insider_tip',
        trigger: (sim, world) => {
            return anyInvestigationActive(world) && portfolio.positions.length >= 3 && !hasTrait('under_scrutiny');
        },
        cooldown: 400,
        era: 'mid',
        popup: true,
        headline: 'A contact inside the Barron administration reaches out',
        context: (sim, world) => {
            const okaforActive = world.investigations.okaforProbeStage > 0;
            const investigationLine = okaforActive
                ? ' With Okafor\'s investigation active, any connection to government sources is dynamite.'
                : '';
            if (hasTrait('quiet_money')) {
                return `Your phone buzzes at 9pm. A college friend who works in the Barron White House sends a detailed text — more detailed than he should. "I know you keep things quiet. There's something moving through the West Wing that's going to hit PNTH. I trust you to be discreet."${investigationLine} He's never been this forthcoming before.`;
            }
            return `Your phone buzzes at 9pm. A college friend who works in the Barron White House sends a vague text: "Hey — can we talk? I've come across something that might interest you. Can't say more here." You haven't spoken in months.${investigationLine} This is either nothing, or it's the kind of call that changes everything.`;
        },
        choices: [
            {
                label: 'Don\'t respond',
                desc: 'Whatever this is, you don\'t want any part of it.',
                playerFlag: 'declined_insider_tip',
                resultToast: 'You leave the text on read. Smart.',
            },
            {
                label: 'Call back',
                desc: 'Curiosity wins. You step outside and dial.',
                effects: [{ path: 'media.leakCount', op: 'add', value: 1 }],
                playerFlag: 'pursued_insider_tip',
                _tipAction: true,
            },
        ],
    },

    {
        id: 'desk_analyst_info_edge',
        trigger: (sim) => {
            const daysToEarnings = QUARTERLY_CYCLE - (sim.day % QUARTERLY_CYCLE);
            const eq = equity();
            if (eq <= 0) return false;
            const optNotional = totalOptionsNotional();
            return daysToEarnings <= 15 && daysToEarnings >= 5 && optNotional / eq >= 0.15 && !hasTrait('under_scrutiny');
        },
        cooldown: 200,
        popup: true,
        headline: 'A sellside analyst wants to meet before Malhotra\'s earnings call',
        context: () => {
            return 'A well-known PNTH analyst sends a cryptic message: "I have some data you\'ll want to see before Malhotra\'s print. Not on MarketWire, not in any filing. Coffee tomorrow? Just us." The invitation is casual. The implication is not.';
        },
        choices: [
            {
                label: 'Politely decline',
                desc: 'The line between mosaic theory and material non-public information is thin.',
                playerFlag: 'passed_channel_check',
                resultToast: 'You rely on your own analysis. The analyst sounds annoyed.',
            },
            {
                label: 'Take the meeting',
                desc: 'Information is the currency of this business. Hear what he has.',
                playerFlag: 'pursued_analyst_tip',
                _tipAction: true,
            },
        ],
    },
];
