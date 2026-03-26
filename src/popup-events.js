/* ===================================================
   popup-events.js -- Portfolio-triggered popup events.
   Fire based on the player's positions, performance,
   and timing relative to world state. The world is
   watching you.
   =================================================== */

import {
    ADV, IMPACT_THRESHOLD_100, INITIAL_CAPITAL, ROGUE_TRADING_THRESHOLD,
    HISTORY_CAPACITY, CAMPAIGN_START_DAY, MIDTERM_DAY, TERM_END_DAY,
    QUARTERLY_CYCLE,
} from './config.js';
import { computeNetDelta, computeGrossNotional, portfolio, portfolioValue } from './portfolio.js';
import { market } from './market.js';
import { unitPrice } from './position-value.js';
import {
    cooldownMultiplier, thresholdMultiplier, complianceTone,
} from './compliance.js';
import { getConvictionEffect } from './convictions.js';
import { getScrutinyLevel } from './scrutiny.js';

const _cooldowns = {}; // id → last fired day

export function resetPopupCooldowns() {
    for (const k in _cooldowns) delete _cooldowns[k];
    _usedTips.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _equity() {
    return portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
}

function _posPrice(p) {
    return unitPrice(p.type, market.S, Math.sqrt(market.v), market.r, market.day, p.strike, p.expiryDay, market.q);
}

function _absStockQty() {
    return portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + Math.abs(p.qty), 0);
}

function _shortDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = _posPrice(p);
        if (p.type === 'stock' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'call' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'put' && p.qty > 0) total += p.qty * price;
    }
    return total;
}

function _longDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = _posPrice(p);
        if (p.type === 'stock' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'call' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'put' && p.qty < 0) total += Math.abs(p.qty) * price;
    }
    return total;
}

function _bondNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'bond') total += Math.abs(p.qty) * _posPrice(p);
    }
    return total;
}

function _strikeNotional(strike) {
    let total = 0;
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike === strike) {
            total += Math.abs(p.qty) * _posPrice(p);
        }
    }
    return total;
}

function _totalOptionsNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'call' || p.type === 'put') {
            total += Math.abs(p.qty) * _posPrice(p);
        }
    }
    return total;
}

function _maxStrikeConcentration() {
    const byStrike = {};
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike != null) {
            byStrike[p.strike] = (byStrike[p.strike] || 0) + Math.abs(p.qty) * _posPrice(p);
        }
    }
    let maxStrike = null, maxNotional = 0;
    for (const k in byStrike) {
        if (byStrike[k] > maxNotional) { maxNotional = byStrike[k]; maxStrike = +k; }
    }
    return { strike: maxStrike, notional: maxNotional };
}

function _netUncoveredUpside() {
    let net = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'stock' || p.type === 'call') net += p.qty;
    }
    return net;
}

function _anyInvestigationActive(world) {
    const inv = world.investigations;
    return inv.tanBowmanStory > 0 || inv.tanNsaStory > 0 ||
           inv.okaforProbeStage > 0 || inv.impeachmentStage > 0;
}

function _liveDay(day) {
    return day - HISTORY_CAPACITY;
}

// ---------------------------------------------------------------------------
// Insider tip pool
// ---------------------------------------------------------------------------

const INSIDER_TIPS = [
    {
        hint: 'PNTH is going to raise the dividend at the next earnings call',
        realEvent: 'tip_dividend_hike',
        fakeEvent: 'tip_dividend_flat',
    },
    {
        hint: 'the Fed is going to pause despite the hawkish rhetoric',
        realEvent: 'tip_fed_pause',
        fakeEvent: 'tip_fed_hike',
    },
    {
        hint: 'a major defense contract announcement is coming within two weeks',
        realEvent: 'tip_contract_win',
        fakeEvent: 'tip_contract_loss',
    },
    {
        hint: 'a big short position is about to unwind — something about a margin call',
        realEvent: 'tip_short_squeeze',
        fakeEvent: 'tip_squeeze_fizzle',
    },
    {
        hint: 'earnings are going to blow out expectations by double digits',
        realEvent: 'tip_earnings_beat',
        fakeEvent: 'tip_earnings_miss',
    },
    {
        hint: 'there\'s an acquisition offer coming — a foreign buyer',
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

// ---------------------------------------------------------------------------
// Portfolio popup event definitions
// ---------------------------------------------------------------------------

export const PORTFOLIO_POPUPS = [

    // ===================================================================
    //  POSITION-BASED (~8)
    // ===================================================================

    {
        id: 'desk_compliance_short',
        trigger: (sim, world) => {
            const eq = _equity();
            if (eq <= 0) return false;
            return _shortDirectionalNotional() / eq > 0.30 * thresholdMultiplier() && _anyInvestigationActive(world);
        },
        cooldown: 200,
        popup: true,
        headline: 'Compliance flags your short book during active investigation',
        context: (sim, world) => {
            const netDelta = computeNetDelta();
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `Your net delta is ${netDelta.toFixed(0)} — deeply short — while federal investigators are circling. Compliance has pulled your trading records and wants a meeting. The optics of a large directional bet during an investigation are terrible. The general counsel is asking pointed questions about your information sources.`;
        },
        choices: [
            {
                label: 'Cover short positions',
                desc: 'Close all short directional exposure to appease compliance.',
                trades: [{ action: 'close_short' }],
                complianceTier: 'full',
                playerFlag: 'cooperated_with_compliance',
                resultToast: 'Short exposure closed. Compliance notes your cooperation.',
            },
            {
                label: 'Argue your thesis',
                desc: 'Present your fundamental case. The position is based on public information.',
                complianceTier: 'defiant',
                deltas: { xi: 0.01 },
                playerFlag: 'argued_with_compliance',
                resultToast: 'Compliance is unconvinced but allows the position. They\'re watching.',
            },
            {
                label: 'Ignore the email',
                desc: 'Delete it. You don\'t answer to paper-pushers.',
                complianceTier: 'defiant',
                deltas: { xi: 0.02, theta: 0.005 },
                playerFlag: 'ignored_compliance',
                resultToast: 'Bold move. Compliance escalates to the risk committee.',
            },
        ],
    },

    {
        id: 'desk_suspicious_long',
        trigger: (sim, world) => {
            const eq = _equity();
            if (eq <= 0) return false;
            return _longDirectionalNotional() / eq > 1.5 * thresholdMultiplier() &&
                (world.geopolitical.tradeWarStage >= 2 || world.geopolitical.recessionDeclared);
        },
        cooldown: 250,
        popup: true,
        headline: '"Do you know something we don\'t?"',
        context: (sim, world) => {
            const netDelta = computeNetDelta();
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `You're carrying ${netDelta.toFixed(0)} delta — massively long — into what everyone else sees as a worsening macro picture. Two PMs on the floor pulled you aside at lunch. The CRO wants to know your thesis. Either you're brilliant or reckless, and right now nobody can tell which.`;
        },
        choices: [
            {
                label: 'Close long positions',
                desc: 'Close all long directional exposure. Remove the question mark.',
                trades: [{ action: 'close_long' }],
                complianceTier: 'full',
                playerFlag: 'closed_suspicious_long',
                resultToast: 'Long exposure closed. The whispers stop.',
            },
            {
                label: 'Close options only',
                desc: 'Keep the stock but close the leveraged option bets.',
                trades: [{ action: 'close_options' }],
                complianceTier: 'partial',
                playerFlag: 'trimmed_suspicious_long',
                resultToast: 'Options closed. The core position stays.',
            },
            {
                label: 'Stand your ground',
                desc: 'The crowd is wrong. You\'ve done the work.',
                complianceTier: 'defiant',
                playerFlag: 'stood_ground_long',
                resultToast: 'The floor is watching. If you\'re right, you\'re a legend.',
            },
        ],
    },

    {
        id: 'desk_strike_concentration',
        trigger: () => {
            const totalOpt = _totalOptionsNotional();
            if (totalOpt <= 0) return false;
            const eq = _equity();
            if (eq <= 0) return false;
            const { notional } = _maxStrikeConcentration();
            return notional / totalOpt > 0.50 && notional / eq > 0.10 * thresholdMultiplier();
        },
        cooldown: 180,
        popup: true,
        headline: 'Market maker complains about single-strike concentration',
        context: () => {
            const { strike, notional } = _maxStrikeConcentration();
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `You have $${(notional / 1000).toFixed(1)}k notional concentrated at the ${strike} strike. The designated market maker for that series called the head of trading to complain about your flow. They're widening spreads on your name specifically and threatening to pull liquidity if you keep stacking.`;
        },
        choices: [
            {
                label: 'Close concentrated options',
                desc: 'Close all option positions. Start fresh with diversified strikes.',
                trades: [{ action: 'close_options' }],
                complianceTier: 'full',
                playerFlag: 'closed_concentrated_options',
                resultToast: 'Options closed. The market maker backs off.',
            },
            {
                label: 'Let them complain',
                desc: 'You like this strike. Their job is to make markets.',
                complianceTier: 'defiant',
                deltas: { xi: 0.01 },
                playerFlag: 'ignored_mm_complaint',
                resultToast: 'Spreads widen on your positions. The desk takes note.',
            },
        ],
    },

    {
        id: 'desk_extreme_leverage',
        trigger: (sim) => {
            const eq = _equity();
            if (eq <= 0) return false;
            const gross = computeGrossNotional();
            return (gross / eq) > 4;
        },
        cooldown: 120,
        popup: true,
        headline: 'Risk desk intervention: leverage ratio exceeds 4x',
        context: (sim) => {
            const eq = _equity();
            const gross = computeGrossNotional();
            const ratio = (gross / eq).toFixed(1);
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `Your gross notional is $${(gross / 1000).toFixed(0)}k against $${(eq / 1000).toFixed(0)}k equity — a ${ratio}x leverage ratio. The risk desk has flagged you for an intraday review. At Meridian, anything above 3x triggers a conversation. Above 5x triggers a forced reduction. The head of risk is on his way to your desk.`;
        },
        choices: [
            {
                label: 'Close everything',
                desc: 'Liquidate all positions. Zero leverage. Maximum compliance.',
                trades: [{ action: 'close_all' }],
                complianceTier: 'full',
                playerFlag: 'deleveraged_fully',
                resultToast: 'All positions closed. Risk desk signs off. Good standing preserved.',
            },
            {
                label: 'Close options',
                desc: 'Close the leveraged option positions. Keep stock and bonds.',
                trades: [{ action: 'close_options' }],
                complianceTier: 'partial',
                playerFlag: 'deleveraged_options',
                resultToast: 'Options closed. Leverage reduced.',
            },
            {
                label: 'Push back hard',
                desc: '"I\'m the one making money on this floor." Risky, but maybe they back off.',
                complianceTier: 'defiant',
                deltas: { xi: 0.015 },
                playerFlag: 'pushed_back_risk_desk',
                resultToast: 'The head of risk blinks. But he writes it up. HR has a copy.',
            },
        ],
    },

    {
        id: 'desk_name_on_tape',
        trigger: () => {
            const absStock = _absStockQty();
            return absStock > ADV * IMPACT_THRESHOLD_100;
        },
        cooldown: 200,
        popup: true,
        headline: 'Your name is on the tape',
        context: () => {
            const absStock = _absStockQty();
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `You're carrying ${absStock} shares — more than ${((absStock / ADV) * 100).toFixed(0)}% of average daily volume. The prime broker's execution desk called to let you know that "the street knows." Counterparties are positioning around your flow. Your entries and exits are being front-run. Every tick in your direction is cheaper; every tick against you is more expensive.`;
        },
        choices: [
            {
                label: 'Close stock positions',
                desc: 'Get your name off the tape. Close all stock exposure.',
                trades: [{ action: 'close_type', type: 'stock' }],
                complianceTier: 'full',
                playerFlag: 'cleared_tape_presence',
                resultToast: 'Stock positions closed. The street forgets your name.',
            },
            {
                label: 'Work the position slowly',
                desc: 'Use TWAP-style execution. Accept worse fills for less market impact.',
                complianceTier: 'partial',
                playerFlag: 'worked_position_slowly',
                resultToast: 'You\'re a known name now. The street adjusts.',
            },
            {
                label: 'Own it',
                desc: 'If they know your name, make them fear it. Add size.',
                complianceTier: 'defiant',
                deltas: { xi: 0.01, theta: 0.003 },
                playerFlag: 'owned_tape_presence',
                resultToast: 'Aggressive. The PB raises your margin requirement.',
            },
        ],
    },

    {
        id: 'desk_unlimited_risk',
        trigger: (sim) => {
            const nuu = _netUncoveredUpside();
            if (nuu >= 0) return false;
            const eq = _equity();
            if (eq <= 0) return false;
            return Math.abs(nuu) * market.S / eq > 0.10 * thresholdMultiplier();
        },
        cooldown: 120,
        popup: true,
        headline: 'Risk desk flags unlimited upside exposure',
        context: (sim) => {
            const nuu = _netUncoveredUpside();
            const tone = complianceTone();
            const tonePrefix = tone === 'warm'
                ? 'Routine check —'
                : tone === 'pointed'
                ? 'We\'ve talked about this before —'
                : tone === 'final_warning'
                ? 'This is your last warning —'
                : '';
            return `${tonePrefix} You have ${Math.abs(nuu)} units of net uncovered upside exposure — short stock or naked calls without offsetting longs. This is an unlimited-loss position. If the stock gaps up overnight, your losses have no ceiling. The risk desk requires either full closure or a hedge to cap the exposure.`;
        },
        choices: [
            {
                label: 'Close all short exposure',
                desc: 'Close every position contributing to the unlimited risk.',
                trades: [{ action: 'close_short' }],
                complianceTier: 'full',
                playerFlag: 'closed_unlimited_risk',
                resultToast: 'Short exposure closed. Risk desk signs off.',
            },
            {
                label: 'Hedge with stock',
                desc: 'Buy enough shares to fully offset the uncovered upside.',
                trades: [{ action: 'hedge_unlimited_risk' }],
                complianceTier: 'partial',
                playerFlag: 'hedged_unlimited_risk',
                resultToast: 'Hedge placed. Unlimited risk neutralized.',
            },
            {
                label: 'Push back',
                desc: 'The position is sized appropriately for the thesis. You\'ll manage the risk.',
                complianceTier: 'defiant',
                playerFlag: 'defied_unlimited_risk',
                resultToast: 'Risk desk notes your refusal. The file grows thicker.',
            },
        ],
    },

    {
        id: 'desk_bond_fomc',
        trigger: (sim, world) => {
            const eq = _equity();
            if (eq <= 0) return false;
            return _bondNotional() / eq > 0.20 * thresholdMultiplier() && !world.fed.hartleyFired;
        },
        cooldown: 180,
        era: 'early',
        popup: true,
        headline: 'Compliance flags large bond position ahead of FOMC',
        context: (sim, world) => {
            const bondNot = _bondNotional();
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `You have $${(bondNot / 1000).toFixed(1)}k in bond exposure with an FOMC meeting imminent. The surveillance team has flagged the timing. They want documentation of your decision-making process — when you initiated the position, what public information you used, and whether you've had any contact with Fed officials or their staff. Standard protocol, but the paperwork is a headache.`;
        },
        choices: [
            {
                label: 'Close bond positions',
                desc: 'Close all bonds before the meeting. Not worth the scrutiny.',
                trades: [{ action: 'close_type', type: 'bond' }],
                complianceTier: 'full',
                playerFlag: 'closed_bonds_before_fomc',
                resultToast: 'Bond positions closed. The flag is removed from your file.',
            },
            {
                label: 'File the documentation',
                desc: 'Comply fully with the paperwork. Tedious but keeps your record clean.',
                complianceTier: 'partial',
                playerFlag: 'filed_fomc_docs',
                resultToast: 'Documentation filed. Compliance satisfied.',
            },
        ],
    },

    {
        id: 'desk_pnth_earnings',
        trigger: (sim) => {
            const eq = _equity();
            if (eq <= 0) return false;
            const pnthNotional = portfolio.positions.filter(p => p.type === 'stock')
                .reduce((s, p) => s + Math.abs(p.qty) * _posPrice(p), 0);
            const daysToEarnings = QUARTERLY_CYCLE - (sim.day % QUARTERLY_CYCLE);
            return pnthNotional / eq > 0.15 * thresholdMultiplier() && daysToEarnings <= 10;
        },
        cooldown: 150,
        popup: true,
        headline: 'Sellside salesman mentions "interesting flow" in PNTH options',
        context: () => {
            return 'A salesman from a bulge bracket calls your line. "Listen, I can\'t say much, but there\'s been some unusual activity in the PNTH options chain. Smart money is positioning ahead of the print. I think you\'d want to know." He trails off, waiting for you to bite.';
        },
        choices: [
            {
                label: 'Hang up',
                desc: 'You don\'t trade on tips from salesmen.',
                playerFlag: 'declined_analyst_color',
                resultToast: 'You stay clean. The salesman moves on.',
            },
            {
                label: 'Ask what he\'s hearing',
                desc: 'The curiosity is killing you.',
                playerFlag: 'pursued_pnth_tip',
                _tipAction: true,
            },
        ],
    },

    {
        id: 'desk_short_in_rally',
        trigger: (sim) => {
            const netDelta = computeNetDelta();
            // Net short while stock has rallied 15%+ from start
            return netDelta < -15 && sim.S > 115;
        },
        cooldown: 200,
        popup: true,
        headline: 'The market is against you',
        context: (sim) => {
            const netDelta = computeNetDelta();
            return `The index is at $${sim.S.toFixed(0)} — well above where you started shorting — and your delta is ${netDelta.toFixed(0)}. Every tick higher costs you. The PM next to you just booked his best quarter ever going long. Your Bloomberg chat is full of unsolicited advice. The desk head walks past without making eye contact. You're either early or wrong, and right now the P&L doesn't distinguish between the two.`;
        },
        choices: [
            {
                label: 'Double down',
                desc: 'The thesis hasn\'t changed. Add to shorts at better levels.',
                deltas: { xi: 0.01 },
                playerFlag: 'doubled_down_short',
                resultToast: 'Conviction trade. The floor thinks you\'ve lost it.',
            },
            {
                label: 'Admit defeat',
                desc: 'Cover everything. Take the loss. Live to fight another day.',
                deltas: { theta: -0.005 },
                playerFlag: 'covered_losing_short',
                resultToast: 'You eat the loss. It stings, but the bleeding stops.',
            },
            {
                label: 'Hedge with calls',
                desc: 'Keep the core short but buy upside protection. Belt and suspenders.',
                deltas: {},
                playerFlag: 'hedged_short_with_calls',
                resultToast: 'Smart risk management. The desk head nods approvingly.',
            },
        ],
    },

    // ===================================================================
    //  PERFORMANCE-BASED (~8)
    // ===================================================================

    {
        id: 'desk_ft_interview',
        trigger: () => _equity() > INITIAL_CAPITAL * 1.5,
        cooldown: 300,
        popup: true,
        headline: 'Financial Times wants a profile',
        context: () => {
            const eq = _equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `Your returns are up ${pct}% and the FT's markets desk wants an interview. "The Meridian Trader Who Bet Against the Crowd" — that's their working headline. The PR team is excited. Your MD is cautiously supportive. But every trader who's ever been profiled knows: the cover jinx is real. The moment the ink dries, the market gods come for you.`;
        },
        choices: [
            {
                label: 'Do the interview',
                desc: 'Enjoy the spotlight. You earned it.',
                deltas: { xi: 0.01 },
                playerFlag: 'did_ft_interview',
                resultToast: 'The profile runs. Your LinkedIn explodes. The floor treats you differently now.',
            },
            {
                label: 'Decline politely',
                desc: 'Stay anonymous. The best traders are the ones nobody\'s heard of.',
                deltas: {},
                playerFlag: 'declined_ft_interview',
                resultToast: 'The FT runs a piece about Meridian anyway, but without your name. Smart.',
            },
        ],
    },

    {
        id: 'desk_risk_committee',
        trigger: () => {
            const eq = _equity();
            return eq < INITIAL_CAPITAL * (1 - ROGUE_TRADING_THRESHOLD * 0.8);
        },
        cooldown: 250,
        popup: true,
        headline: 'Emergency risk committee meeting',
        context: () => {
            const eq = _equity();
            const loss = ((1 - eq / INITIAL_CAPITAL) * 100).toFixed(0);
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `You're down ${loss}%. The risk committee has convened an emergency session. The CRO, general counsel, and your MD are in the conference room. The conversation is short: explain the losses, present a plan, or face position limits. The compliance officer is taking notes. HR is cc'd on the meeting invite. This is not a drill.`;
        },
        choices: [
            {
                label: 'Close everything',
                desc: 'Liquidate all positions. Rebuild from cash.',
                trades: [{ action: 'close_all' }],
                complianceTier: 'full',
                playerFlag: 'liquidated_for_committee',
                resultToast: 'All positions closed. The committee notes your cooperation.',
            },
            {
                label: 'Present a recovery plan',
                desc: 'Show them the path back. Reduced risk, tighter stops, disciplined execution.',
                complianceTier: 'partial',
                deltas: { theta: -0.005 },
                playerFlag: 'presented_recovery_plan',
                resultToast: 'The committee gives you 30 days. The clock is ticking.',
            },
            {
                label: 'Blame the market',
                desc: 'It was an unprecedented move. Nobody saw it coming. The model was fine.',
                complianceTier: 'defiant',
                deltas: { xi: 0.02 },
                playerFlag: 'blamed_market',
                resultToast: 'Nobody buys it. Position limits imposed immediately.',
            },
        ],
    },

    {
        id: 'desk_profiting_from_misery',
        trigger: (sim, world) => {
            return world.geopolitical.recessionDeclared && _equity() > INITIAL_CAPITAL * 1.2;
        },
        cooldown: 300,
        popup: true,
        headline: '"Profiting from misery" — social media backlash',
        context: (sim, world) => {
            const eq = _equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `A recession has been declared and you're up ${pct}%. Someone on Twitter found Meridian's 13F filing and connected the dots. "Wall Street traders making millions while Main Street suffers" is trending. Your name isn't public — yet — but the firm is fielding press calls. The PR team wants to know if you'll issue a statement. The desk is nervous.`;
        },
        choices: [
            {
                label: 'Donate to charity publicly',
                desc: 'Pledge a portion of profits to recession relief. Good optics.',
                deltas: {},
                effects: [
                    { path: 'election.barronApproval', op: 'add', value: 1 },
                ],
                playerFlag: 'donated_during_recession',
                resultToast: 'The donation gets a brief mention. The backlash fades.',
            },
            {
                label: 'Stay quiet',
                desc: 'Don\'t feed the outrage cycle. It\'ll blow over.',
                deltas: { xi: 0.005 },
                playerFlag: 'stayed_quiet_recession',
                resultToast: 'The story dies in 48 hours. But screenshots last forever.',
            },
            {
                label: 'Go on CNBC to defend capitalism',
                desc: 'Markets allocate risk. Your profits are price discovery. Someone has to say it.',
                deltas: { xi: 0.015 },
                playerFlag: 'defended_capitalism_tv',
                resultToast: 'The clip goes viral. Half the finance world loves you. The other half doesn\'t.',
            },
        ],
    },

    {
        id: 'desk_md_meeting',
        trigger: () => {
            const eq = _equity();
            return eq < INITIAL_CAPITAL * 0.85;
        },
        cooldown: 200,
        era: 'early',
        popup: true,
        headline: 'Your MD wants a word',
        context: () => {
            const eq = _equity();
            const loss = ((1 - eq / INITIAL_CAPITAL) * 100).toFixed(0);
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `Down ${loss}% in your first year. Your MD closes the glass door and sits across from you. "Look, everyone has rough patches. But the partners are asking questions. I need to give them something. What's your plan?" This is the conversation every junior trader dreads. Your answer defines the next six months.`;
        },
        choices: [
            {
                label: 'Promise to flatten',
                desc: '"I\'ll reduce risk and rebuild from a clean book."',
                trades: [{ action: 'close_all' }],
                complianceTier: 'full',
                deltas: { theta: -0.005, xi: -0.01 },
                playerFlag: 'promised_to_flatten',
                resultToast: 'All positions closed. Your MD looks relieved.',
            },
            {
                label: 'Ask for mentorship',
                desc: '"I could use guidance. Can you pair me with a senior PM?"',
                complianceTier: 'partial',
                deltas: { theta: -0.003 },
                playerFlag: 'asked_for_mentorship',
                resultToast: 'Your MD arranges weekly sessions with the head of macro.',
            },
            {
                label: 'Show conviction',
                desc: '"The positions are right. I need more time and a bit more risk budget."',
                complianceTier: 'defiant',
                playerFlag: 'showed_conviction_early',
                resultToast: 'Your MD nods slowly. "Don\'t make me regret this."',
            },
        ],
    },

    {
        id: 'desk_unusual_activity',
        trigger: () => {
            if (portfolio.peakValue <= INITIAL_CAPITAL) return false;
            const eq = _equity();
            const dailySwing = Math.abs(eq - portfolio.peakValue) / portfolio.peakValue;
            return dailySwing > 0.08;
        },
        cooldown: 120,
        popup: true,
        headline: 'Compliance flags unusual P&L volatility',
        context: () => {
            const eq = _equity();
            const swing = Math.abs(eq - portfolio.peakValue);
            return `Your book just swung $${(swing / 1000).toFixed(1)}k in a single period. That's more than most PMs make in a quarter. Compliance has flagged the activity for review. They're not accusing you of anything — yet — but the pattern of outsized moves triggers their surveillance algorithms. Expect a call from the surveillance team and a formal review of your recent trades.`;
        },
        choices: [
            {
                label: 'Cooperate fully',
                desc: 'Open your books. Show them everything. Transparency is your friend.',
                deltas: {},
                playerFlag: 'cooperated_unusual_activity',
                resultToast: 'Review completed. No issues found. The flag is cleared.',
            },
            {
                label: 'Lawyer up',
                desc: 'Call your personal attorney before responding. Protect yourself.',
                deltas: { xi: 0.005 },
                playerFlag: 'lawyered_up_unusual',
                resultToast: 'The lawyer tells compliance you\'ll respond in writing within 5 business days. Tension rises.',
            },
        ],
    },

    {
        id: 'desk_headhunter',
        trigger: (sim) => {
            const eq = _equity();
            const quarters = Math.floor(_liveDay(sim.day) / QUARTERLY_CYCLE);
            return quarters >= 3 && eq > INITIAL_CAPITAL * 1.3;
        },
        cooldown: 300,
        era: 'mid',
        popup: true,
        headline: 'A headhunter slides into your DMs',
        context: () => {
            const eq = _equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `"I represent a multi-strategy fund that's building out its macro desk. Your track record — up ${pct}% net over three quarters — is exactly what they're looking for. Guaranteed $2M first year, full P&L autonomy, and a 20% payout on everything above hurdle." The message arrives on your personal phone at 10pm. Flattering. Also suspicious timing.`;
        },
        choices: [
            {
                label: 'Take the meeting',
                desc: 'What\'s the harm? Always good to know your market value.',
                deltas: {},
                playerFlag: 'took_headhunter_meeting',
                resultToast: 'You meet at a discreet restaurant in Midtown. The offer is real. Now you have leverage.',
            },
            {
                label: 'Tell your MD',
                desc: 'Loyalty play. Let Meridian match or beat the offer.',
                deltas: {},
                effects: [
                    { path: 'fed.credibilityScore', op: 'add', value: 0 },  // no-op but shows loyalty
                ],
                playerFlag: 'disclosed_headhunter',
                resultToast: 'Your MD appreciates the transparency. Bonus expectations just went up.',
            },
            {
                label: 'Ignore it',
                desc: 'You\'re building something here. Not interested in mercenary moves.',
                deltas: {},
                playerFlag: 'ignored_headhunter',
                resultToast: 'The headhunter tries twice more before giving up.',
            },
        ],
    },

    {
        id: 'desk_comeback_kid',
        trigger: () => {
            const eq = _equity();
            return portfolio.maxDrawdown > 0.20 && eq >= INITIAL_CAPITAL * 0.98;
        },
        cooldown: 300,
        popup: true,
        headline: 'The comeback kid',
        context: () => {
            const dd = (portfolio.maxDrawdown * 100).toFixed(0);
            return `You were down ${dd}%. The risk committee had you on a watch list. Two analysts bet against your survival. And now you've clawed your way back to breakeven. The floor is buzzing. Your MD just walked past and squeezed your shoulder — he never does that. The comeback says more about you than the drawdown ever did. But the scars are real. Do you trade the same way, or has something changed?`;
        },
        choices: [
            {
                label: 'Same playbook, more discipline',
                desc: 'The strategy was right. The execution needed work.',
                deltas: { theta: -0.003 },
                playerFlag: 'comeback_disciplined',
                resultToast: 'Wiser, sharper. The floor respects the grind.',
            },
            {
                label: 'Swing bigger',
                desc: 'You survived the worst. Time to press your edge harder.',
                deltas: { xi: 0.01 },
                playerFlag: 'comeback_aggressive',
                resultToast: 'The comeback trader goes on the offensive. Your MD raises an eyebrow.',
            },
            {
                label: 'Take a breath',
                desc: 'You just survived a near-death experience. Maybe ease off the throttle.',
                deltas: { theta: -0.005, xi: -0.01 },
                playerFlag: 'comeback_cautious',
                resultToast: 'You take a few days to trade small. The adrenaline fades. Clarity returns.',
            },
        ],
    },

    {
        id: 'desk_first_milestone',
        trigger: () => _equity() > INITIAL_CAPITAL * 1.15,
        cooldown: 600,  // basically once
        era: 'early',
        popup: true,
        headline: 'Your reputation is established',
        context: () => {
            const eq = _equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `Up ${pct}%. For the first time, people on the floor know your name for the right reasons. The head of trading mentioned you in the morning meeting. A sellside salesman sent a bottle of Macallan to your desk. Your Bloomberg handle shows up in three different chat groups. You're no longer "the new kid" — you're "that trader who called the move." Enjoy it. This is the moment that defines careers.`;
        },
        choices: [
            {
                label: 'Stay hungry',
                desc: 'This is just the beginning. Keep the edge.',
                deltas: {},
                playerFlag: 'first_milestone_hungry',
                resultToast: 'The fire burns brighter. You\'re just getting started.',
            },
            {
                label: 'Celebrate wisely',
                desc: 'Take the team out. Build relationships. The Macallan is excellent.',
                deltas: {},
                playerFlag: 'first_milestone_celebrated',
                resultToast: 'Good times with the desk. Morale is high.',
            },
        ],
    },

    // ===================================================================
    //  TIMING-BASED (~9)
    // ===================================================================

    {
        id: 'desk_campaign_donor',
        trigger: (sim, world) => {
            const ld = _liveDay(sim.day);
            return ld >= (CAMPAIGN_START_DAY - HISTORY_CAPACITY) &&
                   ld <= (MIDTERM_DAY - HISTORY_CAPACITY) &&
                   computeGrossNotional() > INITIAL_CAPITAL * 0.5;
        },
        cooldown: 250,
        popup: true,
        headline: 'A lobbyist wants to discuss "regulatory alignment"',
        context: (sim, world) => {
            const party = world.congress.senate.federalist >= 50 ? 'Federalist' : 'Farmer-Labor';
            return `Campaign season is heating up and a K Street lobbyist has reached out. She represents a coalition of financial firms concerned about the ${party} regulatory agenda. "We're not asking for a donation — we're asking for a seat at the table. Your firm's market position gives you unique insight into how these regulations affect liquidity." The subtext is clear: your money and your access are both on the menu.`;
        },
        choices: [
            {
                label: 'Attend the fundraiser',
                desc: 'Network with power. Understand the regulatory landscape.',
                deltas: { mu: 0.005 },
                effects: [
                    { path: 'election.barronApproval', op: 'add', value: -1 },
                ],
                playerFlag: 'attended_fundraiser',
                resultToast: 'You shook hands with two senators. Whether that\'s an asset or a liability depends on what happens next.',
            },
            {
                label: 'Decline politely',
                desc: 'You trade markets, not favors.',
                deltas: {},
                playerFlag: 'declined_fundraiser',
                resultToast: 'The lobbyist moves on. Your compliance record stays clean.',
            },
            {
                label: 'Report to compliance',
                desc: 'This feels like it crosses a line. Better to disclose.',
                deltas: {},
                playerFlag: 'reported_lobbyist',
                resultToast: 'Compliance thanks you and opens a file. The lobbyist is flagged.',
            },
        ],
    },

    {
        id: 'desk_midterm_pressure',
        trigger: (sim) => {
            const ld = _liveDay(sim.day);
            const midterm = MIDTERM_DAY - HISTORY_CAPACITY;
            return Math.abs(ld - midterm) <= 5 && portfolio.positions.length > 0;
        },
        cooldown: 300,
        popup: true,
        headline: 'Election night positioning',
        context: (sim, world) => {
            const fedSenate = world.congress.senate.federalist;
            const fedHouse = world.congress.house.federalist;
            return `Midterm elections are imminent. The Federalists hold ${fedSenate} Senate seats and ${fedHouse} House seats. Every PM on the floor is either hedging or speculating on the outcome. The vol surface is inverted — short-dated puts are trading at a massive premium. Your book is exposed. Do you want to be positioned, or do you want to be flat when the results come in?`;
        },
        choices: [
            {
                label: 'Buy protection',
                desc: 'Purchase short-dated puts. Sleep well on election night.',
                deltas: { xi: 0.01, theta: 0.005 },
                playerFlag: 'bought_election_protection',
                resultToast: 'Puts purchased. Expensive, but you\'ll sleep tonight.',
            },
            {
                label: 'Sell the vol',
                desc: 'Everyone is scared. Be greedy when others are fearful.',
                deltas: { xi: -0.005, theta: 0.003 },
                playerFlag: 'sold_election_vol',
                resultToast: 'You\'re collecting premium. If the election is orderly, you\'ll clean up.',
            },
            {
                label: 'Go flat',
                desc: 'Close everything. Watch from the sidelines.',
                deltas: { theta: -0.005 },
                playerFlag: 'flattened_for_election',
                resultToast: 'All positions closed. You watch the results with zero P&L risk and a glass of bourbon.',
            },
        ],
    },

    {
        id: 'desk_legacy_positioning',
        trigger: (sim) => {
            const ld = _liveDay(sim.day);
            const termEnd = TERM_END_DAY - HISTORY_CAPACITY;
            return ld > termEnd - 60 && computeGrossNotional() > INITIAL_CAPITAL * 0.3;
        },
        cooldown: 300,
        era: 'late',
        popup: true,
        headline: 'End of an era — legacy positioning',
        context: (sim) => {
            const eq = _equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `The Barron administration is in its final weeks. Your total return stands at ${pct > 0 ? '+' : ''}${pct}%. The transition team is already briefing the incoming President. Policy continuity is uncertain. Your positions need to reflect the world that's coming, not the one that's ending. How do you want to close out the Barron era?`;
        },
        choices: [
            {
                label: 'Position for continuity',
                desc: 'The new administration will largely maintain current policy.',
                deltas: { mu: 0.005 },
                playerFlag: 'positioned_continuity',
                resultToast: 'You\'re betting on stability. If the transition is smooth, you\'re well placed.',
            },
            {
                label: 'Position for disruption',
                desc: 'New president, new priorities. Volatility is coming.',
                deltas: { xi: 0.015, theta: 0.008 },
                playerFlag: 'positioned_disruption',
                resultToast: 'Long vol into the transition. If the new regime shakes things up, you\'re ready.',
            },
            {
                label: 'Wind down gracefully',
                desc: 'You\'ve played this administration\'s market. Take your chips off the table.',
                deltas: { theta: -0.005 },
                playerFlag: 'wound_down_gracefully',
                resultToast: 'Positions reduced. Your P&L is locked in. Time to write the final chapter.',
            },
        ],
    },

    {
        id: 'desk_insider_tip',
        trigger: (sim, world) => {
            return _anyInvestigationActive(world) && portfolio.positions.length >= 3;
        },
        cooldown: 400,
        era: 'mid',
        popup: true,
        headline: 'An old contact reaches out',
        context: () => {
            return 'Your phone buzzes at 9pm. A college friend who works in government sends a vague text: "Hey — can we talk? I\'ve come across something that might interest you. Can\'t say more here." You haven\'t spoken in months. This is either nothing, or it\'s the kind of call that changes everything.';
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
                playerFlag: 'pursued_insider_tip',
                _tipAction: true,
            },
        ],
    },

    {
        id: 'desk_media_big_win',
        trigger: () => _equity() > INITIAL_CAPITAL * 1.8,
        cooldown: 400,
        era: 'mid',
        popup: true,
        headline: 'Bloomberg terminal: "Meridian\'s macro desk posts record quarter"',
        context: () => {
            const eq = _equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `The newswire picked up your desk's results: +${pct}%. Your name isn't in the story, but everyone on the street knows who's driving the P&L. Two hedge fund managers sent congratulations. Your MD is using your returns in the investor presentation. The question now: do you let the success speak for itself, or use the attention to build your brand?`;
        },
        choices: [
            {
                label: 'Stay in the shadows',
                desc: 'The work is the brand. Let the returns compound.',
                deltas: {},
                playerFlag: 'stayed_shadows_media',
                resultToast: 'Silent and profitable. The way the old guard did it.',
            },
            {
                label: 'Accept a panel invitation',
                desc: 'A macro conference wants you on their "New Voices" panel.',
                deltas: { xi: 0.005 },
                playerFlag: 'accepted_panel_media',
                resultToast: 'The panel goes well. You\'re now a "voice" in macro. The attention cuts both ways.',
            },
        ],
    },

    {
        id: 'desk_crisis_profiteer',
        trigger: (sim, world) => {
            const eq = _equity();
            if (eq <= 0) return false;
            return (world.geopolitical.mideastEscalation >= 2 || world.geopolitical.oilCrisis) &&
                eq > INITIAL_CAPITAL * 1.1 &&
                _shortDirectionalNotional() / eq > 0.15 * thresholdMultiplier();
        },
        cooldown: 300,
        popup: true,
        headline: 'Profiting from geopolitical crisis draws scrutiny',
        context: (sim, world) => {
            const crisis = world.geopolitical.oilCrisis ? 'oil crisis' : 'Middle East escalation';
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `The ${crisis} is deepening. You're short and making money. An investigative journalist from ProPublica is writing about "Wall Street winners in wartime." Your firm's compliance team received a FOIA request for communication records. Nobody is accusing you of anything illegal — shorting during a crisis is perfectly legal — but the court of public opinion operates by different rules.`;
        },
        choices: [
            {
                label: 'Cover all shorts',
                desc: 'Close all short directional exposure. Take profits and remove the target.',
                trades: [{ action: 'close_short' }],
                complianceTier: 'full',
                playerFlag: 'covered_crisis_short',
                resultToast: 'Short positions closed. The story runs without your firm\'s name.',
            },
            {
                label: 'Hold the position',
                desc: 'You have a fiduciary duty to your investors. The position is legal and well-reasoned.',
                complianceTier: 'defiant',
                deltas: { xi: 0.01 },
                playerFlag: 'held_crisis_short',
                resultToast: 'You hold. The article mentions Meridian in paragraph 14.',
            },
        ],
    },

    {
        id: 'desk_fomc_bond_compliance',
        trigger: (sim, world) => {
            const eq = _equity();
            if (eq <= 0) return false;
            return _bondNotional() / eq > 0.10 * thresholdMultiplier() && world.fed.hikeCycle;
        },
        cooldown: 200,
        era: 'mid',
        popup: true,
        headline: 'Compliance requires documentation on bond position during hiking cycle',
        context: (sim) => {
            const bondNot = _bondNotional();
            const tone = complianceTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `You have $${(bondNot / 1000).toFixed(1)}k in bond exposure during an active Fed hiking cycle. Every FOMC meeting is a binary event for your book. Compliance is requiring pre-trade documentation for all duration trades until the cycle ends. Every trade needs a written rationale filed before execution. It's bureaucratic, but it's also protection if anyone ever questions your timing.`;
        },
        choices: [
            {
                label: 'Close the bond book',
                desc: 'Not worth the hassle. Focus on equities and options.',
                trades: [{ action: 'close_type', type: 'bond' }],
                complianceTier: 'full',
                playerFlag: 'closed_bond_book',
                resultToast: 'Bond positions closed. One less thing for compliance to flag.',
            },
            {
                label: 'Accept the requirement',
                desc: 'File the paperwork. It\'s annoying but reasonable.',
                complianceTier: 'partial',
                playerFlag: 'accepted_bond_docs',
                resultToast: 'Documentation filed. Compliance is satisfied. Your paper trail is clean.',
            },
        ],
    },

    {
        id: 'desk_political_donation',
        trigger: (sim, world) => {
            const ld = _liveDay(sim.day);
            return ld > 700 && _equity() > INITIAL_CAPITAL * 1.4;
        },
        cooldown: 400,
        era: 'late',
        popup: true,
        headline: 'Senator\'s office calls about a fundraising dinner',
        context: (sim, world) => {
            const party = world.election.barronApproval > 45 ? 'Federalist' : 'Farmer-Labor';
            const eq = _equity();
            return `A ${party} senator's chief of staff called your office. There's a fundraising dinner next week — $10,000 a plate — and they want Meridian represented. "The Senator values the perspective of market participants," she says. Translation: they want your money and your implicit endorsement. Your P&L makes you attractive to both sides. You have $${(eq / 1000).toFixed(0)}k in equity. A $10k dinner is a rounding error — but the political entanglement isn't.`;
        },
        choices: [
            {
                label: 'Attend the dinner',
                desc: 'Access is currency. Play the long game.',
                deltas: { mu: 0.003 },
                effects: [
                    { path: 'election.barronApproval', op: 'add', value: -2 },
                ],
                playerFlag: 'attended_political_dinner',
                resultToast: 'You dined with power. The Senator remembers names, and now she knows yours.',
            },
            {
                label: 'Send a check, skip the dinner',
                desc: 'Support the cause without the photo ops.',
                deltas: {},
                playerFlag: 'sent_check_no_dinner',
                resultToast: 'The check clears. No photos, no handshakes, no complications.',
            },
            {
                label: 'Decline everything',
                desc: 'You trade markets. You don\'t play politics.',
                deltas: {},
                playerFlag: 'declined_political',
                resultToast: 'The chief of staff is disappointed but professional. Your compliance record stays pristine.',
            },
        ],
    },

    {
        id: 'desk_analyst_info_edge',
        trigger: (sim) => {
            const daysToEarnings = QUARTERLY_CYCLE - (sim.day % QUARTERLY_CYCLE);
            const eq = _equity();
            if (eq <= 0) return false;
            const optNotional = _totalOptionsNotional();
            return daysToEarnings <= 15 && daysToEarnings >= 5 && optNotional / eq >= 0.15;
        },
        cooldown: 200,
        popup: true,
        headline: 'A sellside analyst wants to meet for coffee',
        context: () => {
            return 'A well-known analyst sends a cryptic message: "I have some data you\'ll want to see before the print. Not on Bloomberg, not in any filing. Coffee tomorrow? Just us." The invitation is casual. The implication is not.';
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

    // ===================================================================
    //  SCRUTINY (~4)
    // ===================================================================

    {
        id: 'scrutiny_press_inquiry',
        trigger: (sim, world, portfolio) => getScrutinyLevel() >= 1,
        cooldown: 200,
        era: 'mid',
        popup: true,
        headline: 'Financial Times Inquiry',
        context: 'A reporter from the Financial Times has been asking questions about unusual trading patterns from the Meridian derivatives desk. Your name came up. The compliance department wants to know how you\u2019d like to handle it.',
        choices: [
            {
                label: 'No comment',
                desc: 'Decline the interview. The story might run anyway.',
                playerFlag: 'declined_ft_scrutiny',
                resultToast: 'No comment issued. The story runs with "Meridian declined to comment."',
            },
            {
                label: 'Cooperate with compliance review',
                desc: 'Open your books to the internal review team. Proactive transparency.',
                playerFlag: 'cooperated_scrutiny_review',
                complianceTier: 'full',
                resultToast: 'Internal review finds nothing actionable. For now.',
            },
        ],
    },
    {
        id: 'scrutiny_regulatory_letter',
        trigger: (sim, world, portfolio) => getScrutinyLevel() >= 2,
        cooldown: 300,
        era: 'mid',
        popup: true,
        headline: 'SEC Information Request',
        context: 'A formal letter from the SEC\u2019s Division of Enforcement has arrived at Meridian\u2019s legal department. They\u2019re requesting trading records, communications, and position histories for your desk. This is not a routine examination.',
        choices: [
            {
                label: 'Full cooperation',
                desc: 'Provide everything requested and offer to meet voluntarily.',
                playerFlag: 'cooperated_sec_letter',
                complianceTier: 'full',
                resultToast: 'Meridian\u2019s legal team begins assembling the response package.',
            },
            {
                label: 'Lawyer up',
                desc: 'Retain outside counsel. Respond only to what\u2019s legally required.',
                playerFlag: 'lawyered_up',
                resultToast: 'Outside counsel engaged. The meter is running.',
            },
            {
                label: 'Stonewall',
                desc: 'Delay, obfuscate, and challenge the scope of the request.',
                playerFlag: 'stonewalled_sec',
                complianceTier: 'defiant',
                resultToast: 'The SEC notes Meridian\u2019s "lack of cooperation" in their file.',
            },
        ],
    },
    {
        id: 'scrutiny_subpoena',
        trigger: (sim, world, portfolio) => getScrutinyLevel() >= 3,
        cooldown: 400,
        era: 'late',
        popup: true,
        headline: 'Federal Subpoena',
        context: 'A process server has delivered a federal subpoena to Meridian Capital\u2019s general counsel. The SEC has escalated to a formal investigation. You have been named as a person of interest. Congressional staffers are making calls.',
        choices: [
            {
                label: 'Testify fully',
                desc: 'Appear before the committee and answer every question.',
                playerFlag: 'testified_fully',
                complianceTier: 'full',
                resultToast: 'Your testimony is entered into the congressional record.',
            },
            {
                label: 'Invoke the Fifth',
                desc: 'Exercise your constitutional right against self-incrimination.',
                playerFlag: 'invoked_fifth',
                resultToast: 'You decline to answer on Fifth Amendment grounds. The cameras flash.',
            },
        ],
    },
    {
        id: 'scrutiny_enforcement',
        trigger: (sim, world, portfolio) => getScrutinyLevel() >= 4,
        cooldown: 9999,
        popup: true,
        headline: 'SEC Enforcement Action',
        context: () => {
            const level = getScrutinyLevel();
            if (level >= 4) return 'The SEC has filed a formal enforcement action against you personally. The complaint alleges insider trading, market manipulation, and failure to supervise. Meridian\u2019s board has called an emergency session. Your options are narrowing.';
            return 'The SEC is pursuing enforcement proceedings related to your trading activity. Meridian\u2019s legal team advises immediate action.';
        },
        choices: [
            {
                label: 'Settle',
                desc: 'Pay the fine, accept the censure, and move on. It will cost $2,000k.',
                playerFlag: 'settled_sec',
                resultToast: 'Settlement reached. $2,000k penalty paid. The investigation is closed.',
            },
            {
                label: 'Fight it',
                desc: 'Contest the charges in court. This will get worse before it gets better.',
                playerFlag: 'fought_sec',
                complianceTier: 'defiant',
                resultToast: 'Your legal team files a motion to dismiss. The SEC doubles down.',
            },
            {
                label: 'Cooperate and inform',
                desc: 'Offer full cooperation and information on broader market patterns.',
                playerFlag: 'informed_sec',
                complianceTier: 'full',
                resultToast: 'The SEC notes your cooperation. Scrutiny eases \u2014 for now.',
            },
        ],
    },
];

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export function evaluatePortfolioPopups(sim, world, portfolio, day) {
    const triggered = [];
    for (const pp of PORTFOLIO_POPUPS) {
        if (_cooldowns[pp.id] && day - _cooldowns[pp.id] < pp.cooldown * cooldownMultiplier() * getConvictionEffect('popupFrequencyMult', 1)) continue;
        if (pp.era === 'early' && _liveDay(day) > 500) continue;
        if (pp.era === 'mid'   && (_liveDay(day) < 500 || _liveDay(day) > 800)) continue;
        if (pp.era === 'late'  && _liveDay(day) < 800) continue;
        try {
            if (pp.trigger(sim, world, portfolio)) {
                _cooldowns[pp.id] = day;
                triggered.push(pp);
            }
        } catch (e) { /* guard — portfolio state may be inconsistent mid-reset */ }
    }
    return triggered;
}
