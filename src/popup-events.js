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

const _cooldowns = {}; // id → last fired day

export function resetPopupCooldowns() {
    for (const k in _cooldowns) delete _cooldowns[k];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _equity() {
    return portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
}

function _stockQty() {
    return portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
}

function _bondQty() {
    return portfolio.positions.filter(p => p.type === 'bond').reduce((s, p) => s + p.qty, 0);
}

function _optionCount() {
    return portfolio.positions.filter(p => p.type === 'call' || p.type === 'put').reduce((s, p) => s + Math.abs(p.qty), 0);
}

function _netShortQty() {
    return portfolio.positions.filter(p => p.qty < 0).reduce((s, p) => s + p.qty, 0);
}

function _anyInvestigationActive(world) {
    const inv = world.investigations;
    return inv.tanBowmanStory > 0 || inv.tanNsaStory > 0 ||
           inv.okaforProbeStage > 0 || inv.impeachmentStage > 0;
}

function _pnthQty() {
    // Stock positions represent PNTH shares in this universe
    return portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + Math.abs(p.qty), 0);
}

function _strikeConcentration() {
    const counts = {};
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike != null) {
            counts[p.strike] = (counts[p.strike] || 0) + Math.abs(p.qty);
        }
    }
    let maxCount = 0;
    for (const k in counts) if (counts[k] > maxCount) maxCount = counts[k];
    return maxCount;
}

function _liveDay(day) {
    return day - HISTORY_CAPACITY;
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
            const netDelta = computeNetDelta();
            return netDelta < -30 && _anyInvestigationActive(world);
        },
        cooldown: 200,
        popup: true,
        headline: 'Compliance flags your short book during active investigation',
        context: (sim, world) => {
            const netDelta = computeNetDelta();
            return `Your net delta is ${netDelta.toFixed(0)} — deeply short — while federal investigators are circling. ` +
                'Compliance has pulled your trading records and wants a meeting. The optics of a large directional bet during an investigation ' +
                'are terrible. The general counsel is asking pointed questions about your information sources.';
        },
        choices: [
            {
                label: 'Reduce exposure',
                desc: 'Cover half the short book to appease compliance. It hurts, but it buys goodwill.',
                deltas: { theta: -0.005 },
                playerFlag: 'cooperated_with_compliance',
                resultToast: 'You covered some shorts. Compliance notes your cooperation.',
            },
            {
                label: 'Argue your thesis',
                desc: 'Present your fundamental case. The position is based on public information.',
                deltas: { xi: 0.01 },
                playerFlag: 'argued_with_compliance',
                resultToast: 'Compliance is unconvinced but allows the position. They\'re watching.',
            },
            {
                label: 'Ignore the email',
                desc: 'Delete it. You don\'t answer to paper-pushers.',
                deltas: { xi: 0.02, theta: 0.005 },
                playerFlag: 'ignored_compliance',
                resultToast: 'Bold move. Compliance escalates to the risk committee.',
            },
        ],
    },

    {
        id: 'desk_suspicious_long',
        trigger: (sim, world) => {
            const netDelta = computeNetDelta();
            return netDelta > 40 && (world.geopolitical.tradeWarStage >= 2 || world.geopolitical.recessionDeclared);
        },
        cooldown: 250,
        popup: true,
        headline: '"Do you know something we don\'t?"',
        context: (sim, world) => {
            const netDelta = computeNetDelta();
            return `You\'re carrying ${netDelta.toFixed(0)} delta — massively long — into what everyone else sees as a worsening macro picture. ` +
                'Two PMs on the floor pulled you aside at lunch. The CRO wants to know your thesis. Either you\'re brilliant or reckless, ' +
                'and right now nobody can tell which.';
        },
        choices: [
            {
                label: 'Stand your ground',
                desc: 'The crowd is wrong. You\'ve done the work.',
                deltas: {},
                playerFlag: 'stood_ground_long',
                resultToast: 'The floor is watching. If you\'re right, you\'re a legend.',
            },
            {
                label: 'Trim quietly',
                desc: 'Reduce by a third. No need to advertise the derisking.',
                deltas: { theta: -0.003 },
                playerFlag: 'trimmed_suspicious_long',
                resultToast: 'You lighten up. The whispers die down.',
            },
        ],
    },

    {
        id: 'desk_strike_concentration',
        trigger: () => _strikeConcentration() >= 15,
        cooldown: 180,
        popup: true,
        headline: 'Market maker complains about single-strike concentration',
        context: () => {
            const conc = _strikeConcentration();
            return `You have ${conc} contracts concentrated at a single strike. The designated market maker for that series called ` +
                'the head of trading to complain about your flow. They\'re widening spreads on your name specifically and threatening ' +
                'to pull liquidity if you keep stacking.';
        },
        choices: [
            {
                label: 'Spread it out',
                desc: 'Diversify across strikes. Wider exposure, tighter spreads.',
                deltas: {},
                playerFlag: 'spread_strikes',
                resultToast: 'The market maker backs off. Spreads normalize.',
            },
            {
                label: 'Let them complain',
                desc: 'You like this strike. Their job is to make markets.',
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
            return `Your gross notional is $${(gross / 1000).toFixed(0)}k against $${(eq / 1000).toFixed(0)}k equity — ` +
                `a ${ratio}x leverage ratio. The risk desk has flagged you for an intraday review. ` +
                'At Meridian, anything above 3x triggers a conversation. Above 5x triggers a forced reduction. ' +
                'The head of risk is on his way to your desk.';
        },
        choices: [
            {
                label: 'Deleverage immediately',
                desc: 'Cut positions to bring leverage under 3x. Show you\'re responsible.',
                deltas: { theta: -0.005 },
                playerFlag: 'deleveraged_voluntarily',
                resultToast: 'Risk desk logs your voluntary compliance. Good standing preserved.',
            },
            {
                label: 'Negotiate a temporary waiver',
                desc: 'Explain the thesis. Ask for 5 days to let the trade work.',
                deltas: {},
                playerFlag: 'negotiated_leverage_waiver',
                resultToast: 'Waiver granted — 5 days. The clock is ticking.',
            },
            {
                label: 'Push back hard',
                desc: '"I\'m the one making money on this floor." Risky, but maybe they back off.',
                deltas: { xi: 0.015 },
                playerFlag: 'pushed_back_risk_desk',
                resultToast: 'The head of risk blinks. But he writes it up. HR has a copy.',
            },
        ],
    },

    {
        id: 'desk_name_on_tape',
        trigger: () => {
            const absStock = Math.abs(_stockQty());
            return absStock > ADV * IMPACT_THRESHOLD_100;
        },
        cooldown: 200,
        popup: true,
        headline: 'Your name is on the tape',
        context: () => {
            const absStock = Math.abs(_stockQty());
            return `You\'re carrying ${absStock} shares — more than ${((absStock / ADV) * 100).toFixed(0)}% of average daily volume. ` +
                'The prime broker\'s execution desk called to let you know that "the street knows." Counterparties are positioning around ' +
                'your flow. Your entries and exits are being front-run. Every tick in your direction is cheaper; every tick against you is more expensive.';
        },
        choices: [
            {
                label: 'Work the position slowly',
                desc: 'Use TWAP-style execution. Accept worse fills for less market impact.',
                deltas: {},
                playerFlag: 'worked_position_slowly',
                resultToast: 'You\'re a known name now. The street adjusts.',
            },
            {
                label: 'Own it',
                desc: 'If they know your name, make them fear it. Add size.',
                deltas: { xi: 0.01, theta: 0.003 },
                playerFlag: 'owned_tape_presence',
                resultToast: 'Aggressive. The PB raises your margin requirement.',
            },
        ],
    },

    {
        id: 'desk_bond_fomc',
        trigger: (sim, world) => {
            const bondAbs = Math.abs(_bondQty());
            return bondAbs >= 20 && !world.fed.hartleyFired;
        },
        cooldown: 180,
        era: 'early',
        popup: true,
        headline: 'Compliance flags large bond position ahead of FOMC',
        context: (sim, world) => {
            const bondQty = _bondQty();
            const direction = bondQty > 0 ? 'long' : 'short';
            return `You\'re ${direction} ${Math.abs(bondQty)} bonds with an FOMC meeting imminent. ` +
                'The surveillance team has flagged the timing. They want documentation of your decision-making process — ' +
                'when you initiated the position, what public information you used, and whether you\'ve had any contact with ' +
                'Fed officials or their staff. Standard protocol, but the paperwork is a headache.';
        },
        choices: [
            {
                label: 'File the documentation',
                desc: 'Comply fully. Tedious but keeps your record clean.',
                deltas: {},
                playerFlag: 'filed_fomc_docs',
                resultToast: 'Documentation filed. Compliance satisfied.',
            },
            {
                label: 'Reduce before the meeting',
                desc: 'Close half the position. Not worth the scrutiny.',
                deltas: { sigmaR: -0.001 },
                playerFlag: 'reduced_before_fomc',
                resultToast: 'Position trimmed. The flag is removed from your file.',
            },
        ],
    },

    {
        id: 'desk_pnth_earnings',
        trigger: (sim) => {
            const pnth = _pnthQty();
            const daysToEarnings = QUARTERLY_CYCLE - (sim.day % QUARTERLY_CYCLE);
            return pnth >= 15 && daysToEarnings <= 10;
        },
        cooldown: 150,
        popup: true,
        headline: 'Analyst coverage intensifies before PNTH earnings',
        context: (sim) => {
            const pnth = _pnthQty();
            return `Your ${pnth}-share PNTH position has caught the attention of the sellside. ` +
                'Three analysts called this morning wanting to "compare notes." One casually mentioned an earnings whisper number ' +
                'that\'s well above consensus. Another hinted at a contract announcement. The information is free — but is it clean?';
        },
        choices: [
            {
                label: 'Listen politely, trade on your own analysis',
                desc: 'Hear them out. Use only public information for your decisions.',
                deltas: {},
                playerFlag: 'declined_analyst_color',
                resultToast: 'You stay clean. The analysts move on to the next whale.',
            },
            {
                label: 'Press for details',
                desc: 'The whisper number is valuable. Push for specifics.',
                deltas: { xi: -0.01 },
                playerFlag: 'pressed_analyst_color',
                resultToast: 'You got the number. Whether it\'s right — and whether anyone noticed — remains to be seen.',
            },
            {
                label: 'Cut the position before earnings',
                desc: 'Binary risk isn\'t worth it. Flatten and re-enter after.',
                deltas: { theta: -0.003 },
                playerFlag: 'cut_before_earnings',
                resultToast: 'You take the P&L and step aside. The analysts lose interest.',
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
            return `The index is at $${sim.S.toFixed(0)} — well above where you started shorting — and your delta is ` +
                `${netDelta.toFixed(0)}. Every tick higher costs you. The PM next to you just booked his best quarter ever going long. ` +
                'Your Bloomberg chat is full of unsolicited advice. The desk head walks past without making eye contact. ' +
                'You\'re either early or wrong, and right now the P&L doesn\'t distinguish between the two.';
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
            return `Your returns are up ${pct}% and the FT\'s markets desk wants an interview. "The Meridian Trader Who Bet Against ` +
                'the Crowd" — that\'s their working headline. The PR team is excited. Your MD is cautiously supportive. But every trader ' +
                'who\'s ever been profiled knows: the cover jinx is real. The moment the ink dries, the market gods come for you.';
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
            return `You\'re down ${loss}%. The risk committee has convened an emergency session. The CRO, general counsel, and your MD ` +
                'are in the conference room. The conversation is short: explain the losses, present a plan, or face position limits. ' +
                'The compliance officer is taking notes. HR is cc\'d on the meeting invite. This is not a drill.';
        },
        choices: [
            {
                label: 'Present a recovery plan',
                desc: 'Show them the path back. Reduced risk, tighter stops, disciplined execution.',
                deltas: { theta: -0.005 },
                playerFlag: 'presented_recovery_plan',
                resultToast: 'The committee gives you 30 days. The clock is ticking.',
            },
            {
                label: 'Blame the market',
                desc: 'It was an unprecedented move. Nobody saw it coming. The model was fine.',
                deltas: { xi: 0.02 },
                playerFlag: 'blamed_market',
                resultToast: 'Nobody buys it. Position limits imposed immediately.',
            },
            {
                label: 'Take responsibility',
                desc: 'Own it fully. Ask for support, not excuses.',
                deltas: {},
                playerFlag: 'took_responsibility',
                resultToast: 'Respect on the floor goes up. The committee loosens the leash slightly.',
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
            return `A recession has been declared and you\'re up ${pct}%. Someone on Twitter found Meridian\'s 13F filing and ` +
                'connected the dots. "Wall Street traders making millions while Main Street suffers" is trending. Your name isn\'t public — yet — ' +
                'but the firm is fielding press calls. The PR team wants to know if you\'ll issue a statement. The desk is nervous.';
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
            return `Down ${loss}% in your first year. Your MD closes the glass door and sits across from you. ` +
                '"Look, everyone has rough patches. But the partners are asking questions. I need to give them something. ` +
                'What\'s your plan?" This is the conversation every junior trader dreads. Your answer defines the next six months.';
        },
        choices: [
            {
                label: 'Show conviction',
                desc: '"The positions are right. I need more time and a bit more risk budget."',
                deltas: {},
                playerFlag: 'showed_conviction_early',
                resultToast: 'Your MD nods slowly. "Don\'t make me regret this."',
            },
            {
                label: 'Ask for mentorship',
                desc: '"I could use guidance. Can you pair me with a senior PM?"',
                deltas: { theta: -0.003 },
                playerFlag: 'asked_for_mentorship',
                resultToast: 'Your MD arranges weekly sessions with the head of macro. Humbling, but useful.',
            },
            {
                label: 'Promise to flatten',
                desc: '"I\'ll reduce risk and rebuild from a clean book."',
                deltas: { theta: -0.005, xi: -0.01 },
                playerFlag: 'promised_to_flatten',
                resultToast: 'Safe answer. Your MD looks relieved. But the partners wanted boldness.',
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
            return `Your book just swung $${(swing / 1000).toFixed(1)}k in a single period. That\'s more than most PMs make in a quarter. ` +
                'Compliance has flagged the activity for review. They\'re not accusing you of anything — yet — but the pattern of outsized ' +
                'moves triggers their surveillance algorithms. Expect a call from the surveillance team and a formal review of your recent trades.';
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
            return `"I represent a multi-strategy fund that\'s building out its macro desk. Your track record — up ${pct}% net ` +
                'over three quarters — is exactly what they\'re looking for. Guaranteed $2M first year, full P&L autonomy, and a ` +
                '20% payout on everything above hurdle." The message arrives on your personal phone at 10pm. Flattering. Also suspicious timing.';
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
            return `You were down ${dd}%. The risk committee had you on a watch list. Two analysts bet against your survival. ` +
                'And now you\'ve clawed your way back to breakeven. The floor is buzzing. Your MD just walked past and squeezed your shoulder — ' +
                'he never does that. The comeback says more about you than the drawdown ever did. ' +
                'But the scars are real. Do you trade the same way, or has something changed?';
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
            return `Up ${pct}%. For the first time, people on the floor know your name for the right reasons. ` +
                'The head of trading mentioned you in the morning meeting. A sellside salesman sent a bottle of Macallan to your desk. ' +
                'Your Bloomberg handle shows up in three different chat groups. You\'re no longer "the new kid" — you\'re "that trader ' +
                'who called the move." Enjoy it. This is the moment that defines careers.';
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
            return `Campaign season is heating up and a K Street lobbyist has reached out. She represents a coalition of financial firms ` +
                `concerned about the ${party} regulatory agenda. "We\'re not asking for a donation — we\'re asking for a seat at the table. ` +
                'Your firm\'s market position gives you unique insight into how these regulations affect liquidity." ' +
                'The subtext is clear: your money and your access are both on the menu.';
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
            return `Midterm elections are imminent. The Federalists hold ${fedSenate} Senate seats and ${fedHouse} House seats. ` +
                'Every PM on the floor is either hedging or speculating on the outcome. The vol surface is inverted — ` +
                'short-dated puts are trading at a massive premium. Your book is exposed. Do you want to be positioned, or do you ' +
                'want to be flat when the results come in?';
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
            return `The Barron administration is in its final weeks. Your total return stands at ${pct > 0 ? '+' : ''}${pct}%. ` +
                'The transition team is already briefing the incoming President. Policy continuity is uncertain. ` +
                'Your positions need to reflect the world that\'s coming, not the one that\'s ending. ' +
                'How do you want to close out the Barron era?';
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
        headline: 'An old friend calls with a "tip"',
        context: (sim, world) => {
            const probeActive = world.investigations.okaforProbeStage > 0 ? 'Okafor probe' :
                               world.investigations.tanBowmanStory > 0 ? 'Bowman investigation' : 'ongoing federal investigation';
            return `A college buddy who now works at a congressional staffer\'s office calls your personal cell. ` +
                `"Listen, I probably shouldn\'t be telling you this, but the ${probeActive} is about to produce a surprise witness. ` +
                'The market is going to move. Thought you should know." The line goes quiet. This is the moment every trader faces: ` +
                'free money, or a career-ending mistake?';
        },
        choices: [
            {
                label: 'Trade on it',
                desc: 'This is the edge everyone claims to have. Use it.',
                deltas: { mu: -0.01, xi: 0.02 },
                playerFlag: 'traded_on_tip',
                resultToast: 'You placed the trade. If anyone\'s listening, you just handed them the case.',
            },
            {
                label: 'Decline and hang up',
                desc: '"I can\'t hear this. Don\'t call me again."',
                deltas: {},
                playerFlag: 'declined_insider_tip',
                resultToast: 'You did the right thing. The silence on the other end told you he understood.',
            },
            {
                label: 'Report to compliance',
                desc: 'This isn\'t just unethical — it\'s a felony. Report it immediately.',
                deltas: {},
                effects: [
                    { path: 'fed.credibilityScore', op: 'add', value: 1 },
                ],
                playerFlag: 'reported_insider_tip',
                resultToast: 'Compliance opens a case. The SEC is notified. You may have just saved your career — and ended his.',
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
            return `The newswire picked up your desk\'s results: +${pct}%. Your name isn\'t in the story, but everyone on the street ` +
                'knows who\'s driving the P&L. Two hedge fund managers sent congratulations. Your MD is using your returns in the ' +
                'investor presentation. The question now: do you let the success speak for itself, or use the attention to build your brand?';
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
            return (world.geopolitical.mideastEscalation >= 2 || world.geopolitical.oilCrisis) &&
                   _equity() > INITIAL_CAPITAL * 1.1 &&
                   computeNetDelta() < -5;
        },
        cooldown: 300,
        popup: true,
        headline: 'Profiting from geopolitical crisis draws scrutiny',
        context: (sim, world) => {
            const crisis = world.geopolitical.oilCrisis ? 'oil crisis' : 'Middle East escalation';
            return `The ${crisis} is deepening. You\'re short and making money. An investigative journalist from ProPublica ` +
                'is writing about "Wall Street winners in wartime." Your firm\'s compliance team received a FOIA request for communication records. ' +
                'Nobody is accusing you of anything illegal — shorting during a crisis is perfectly legal — but the court of public opinion ' +
                'operates by different rules.';
        },
        choices: [
            {
                label: 'Cover the short quietly',
                desc: 'Take profits and reduce the headline risk.',
                deltas: { theta: -0.003 },
                playerFlag: 'covered_crisis_short',
                resultToast: 'Position closed. The story runs without your firm\'s name.',
            },
            {
                label: 'Hold the position',
                desc: 'You have a fiduciary duty to your investors. The position is legal and well-reasoned.',
                deltas: { xi: 0.01 },
                playerFlag: 'held_crisis_short',
                resultToast: 'You hold. The article mentions Meridian in paragraph 14. Nobody reads that far.',
            },
        ],
    },

    {
        id: 'desk_fomc_bond_compliance',
        trigger: (sim, world) => {
            const bondAbs = Math.abs(_bondQty());
            return bondAbs >= 10 && world.fed.hikeCycle;
        },
        cooldown: 200,
        era: 'mid',
        popup: true,
        headline: 'Compliance requires documentation on bond position during hiking cycle',
        context: (sim) => {
            const bondQty = _bondQty();
            const dir = bondQty > 0 ? 'long' : 'short';
            return `You\'re ${dir} ${Math.abs(bondQty)} bonds during an active Fed hiking cycle. Every FOMC meeting is a binary event for ` +
                'your book. Compliance is requiring pre-trade documentation for all duration trades until the cycle ends. ' +
                'Every trade needs a written rationale filed before execution. It\'s bureaucratic, but it\'s also protection if anyone ' +
                'ever questions your timing.';
        },
        choices: [
            {
                label: 'Accept the requirement',
                desc: 'File the paperwork. It\'s annoying but reasonable.',
                deltas: {},
                playerFlag: 'accepted_bond_docs',
                resultToast: 'Documentation filed. Compliance is satisfied. Your paper trail is clean.',
            },
            {
                label: 'Close the bond book',
                desc: 'Not worth the hassle. Focus on equities and options.',
                deltas: { sigmaR: -0.001 },
                playerFlag: 'closed_bond_book',
                resultToast: 'Bond positions closed. One less thing for compliance to flag.',
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
            return `A ${party} senator\'s chief of staff called your office. There\'s a fundraising dinner next week — ` +
                '$10,000 a plate — and they want Meridian represented. "The Senator values the perspective of market participants," ' +
                'she says. Translation: they want your money and your implicit endorsement. Your P&L makes you attractive to both sides. ' +
                `You have $${(eq / 1000).toFixed(0)}k in equity. A $10k dinner is a rounding error — but the political entanglement isn\'t.`;
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
            const optCount = _optionCount();
            return daysToEarnings <= 15 && daysToEarnings >= 5 && optCount >= 5;
        },
        cooldown: 200,
        popup: true,
        headline: 'Analyst offers "channel check" data before earnings',
        context: () => {
            return 'A well-known sellside analyst calls with what he calls a "channel check" — proprietary data on PNTH\'s enterprise pipeline. ' +
                '"This isn\'t inside information," he insists. "It\'s mosaic theory. We assembled it from public supplier filings and ' +
                'conference attendance logs." The data suggests earnings will beat by 8-12%. Your options book would benefit enormously ' +
                'if the number is right. The analyst wants your commission flow in return.';
        },
        choices: [
            {
                label: 'Use the channel check',
                desc: 'It\'s mosaic theory — perfectly legal. Adjust your book accordingly.',
                deltas: { xi: -0.005 },
                playerFlag: 'used_channel_check',
                resultToast: 'You adjusted your deltas based on the data. If the analyst is right, you\'re well positioned.',
            },
            {
                label: 'Politely pass',
                desc: 'The line between mosaic theory and material non-public information is thinner than analysts admit.',
                deltas: {},
                playerFlag: 'passed_channel_check',
                resultToast: 'You rely on your own analysis. The analyst sounds annoyed.',
            },
            {
                label: 'Route commissions anyway',
                desc: 'Keep the relationship without acting on the data. Analysts have long memories.',
                deltas: {},
                playerFlag: 'maintained_analyst_relationship',
                resultToast: 'The analyst is happy. You didn\'t trade on it, but you kept the channel open.',
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
        if (_cooldowns[pp.id] && day - _cooldowns[pp.id] < pp.cooldown) continue;
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
