/* firm.js -- Neutral/firm flavor events and portfolio-reactive events. */

import {
    equity, posPrice, absStockQty, shortDirectionalNotional,
    longDirectionalNotional, bondNotional, totalOptionsNotional,
    maxStrikeConcentration, netUncoveredUpside, anyInvestigationActive,
    liveDay, computeNetDelta, computeGrossNotional, portfolio, market,
} from './_helpers.js';
import { firmThresholdMult, firmCooldownMult, firmTone, getRegLevel, shiftFaction } from '../faction-standing.js';
import { getActiveTraitIds, hasTrait } from '../traits.js';
import {
    ADV, IMPACT_THRESHOLD_100, INITIAL_CAPITAL, ROGUE_TRADING_THRESHOLD,
    QUARTERLY_CYCLE,
} from '../config.js';

export const FIRM_EVENTS = [
    {
        id: 'barron_golfing',
        category: 'neutral',
        likelihood: 5,
        headline: 'President Barron spotted at Little St. James golf course for the third consecutive weekend. The Meridian Brief: "Nothing on the calendar. Enjoy the quiet."',
        params: { mu: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.mideastEscalation < 2,
    },
    {
        id: 'barron_cryptic_tweet_1',
        category: 'neutral',
        likelihood: 5,
        headline: 'Barron posts cryptic late-night tweet: "Big things coming. Very big. Markets will love it." The Meridian Brief: "Ignore the tweet. Trade the tape."',
        params: { theta: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'barron_cryptic_tweet_2',
        category: 'neutral',
        likelihood: 4,
        headline: 'Barron tweets "The Fake News won\'t tell you, but PNTH is doing TREMENDOUS things for this country." Sharma: "Presidential stock tips. We live in interesting times." Stock ticks up briefly.',
        params: { mu: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'barron_speech_no_policy',
        category: 'neutral',
        likelihood: 4,
        headline: 'President Barron delivers 90-minute speech at rally; The Sentinel runs it live. The Meridian Brief: "90 minutes, zero policy substance. Markets unmoved."',
        params: { mu: -0.001 },
        magnitude: 'minor',
    },
    {
        id: 'gottlieb_ted_talk',
        category: 'neutral',
        likelihood: 3,
        headline: 'Gottlieb delivers TED talk on "Ethical AI in an Age of Acceleration"; standing ovation. Sharma tweets: "Eloquent as always. Markets don\'t care."',
        params: { mu: 0.004 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },
    {
        id: 'kassis_hackathon',
        category: 'neutral',
        likelihood: 3,
        headline: 'PNTH CTO Mira Kassis demos Atlas Sentinel capabilities at company hackathon; viral clip boosts employer brand. MarketWire picks it up.',
        params: { mu: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ctoIsMira,
    },
    {
        id: 'hartley_jackson_hole',
        category: 'neutral',
        likelihood: 3,
        headline: 'Fed Chair Hartley delivers measured Jackson Hole keynote; reaffirms data-dependent approach. Sharma\'s MarketWire recap: "Nothing new. She wants you to know she\'s watching the data. Markets shrug."',
        params: { mu: 0.002, theta: -0.002 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
    },
    {
        id: 'clay_book_tour',
        category: 'neutral',
        likelihood: 3,
        headline: 'Former President Clay\'s memoir "Against the Current" debuts at #1; Barron fires back on social media',
        params: { mu: -0.002 },
        magnitude: 'minor',
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 1); },
    },
    {
        id: 'clay_university_speech',
        category: 'neutral',
        likelihood: 2,
        headline: 'Robin Clay gives commencement address at Georgetown, subtly criticizes current administration\'s trade policy. The Continental runs the transcript. The Sentinel ignores it.',
        params: { mu: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'congressional_recess',
        category: 'neutral',
        likelihood: 4,
        headline: 'Congress begins scheduled recess; no legislation expected for two weeks. The Meridian Brief: "Desk is flat into the recess. Nobody wants to be long risk with Congress out."',
        params: { theta: -0.002 },
        magnitude: 'minor',
        when: (sim, world) => world.investigations.impeachmentStage === 0,
    },
    {
        id: 'zhaowei_conference',
        category: 'neutral',
        likelihood: 3,
        headline: 'Zhaowei CEO Liang Wei showcases new chip architecture at Nanjing AI Forum; Sharma: "The Zhaowei gap is narrowing. Kassis knows it."',
        params: { mu: -0.002 },
        magnitude: 'minor',
        effects: (world) => { world.geopolitical.crucibleCompetitionPressure = true; },
    },
    {
        id: 'markets_drift_sideways_1',
        category: 'neutral',
        likelihood: 6,
        headline: 'Markets drift sideways on light volume. The Meridian Brief: "Quiet tape. This is usually when something happens."',
        params: { mu: 0.001, theta: -0.001 },
        magnitude: 'minor',
    },
    {
        id: 'markets_drift_sideways_2',
        category: 'neutral',
        likelihood: 6,
        headline: 'Another quiet session as major indices trade in a tight range; VIX slips below 14. The Meridian Brief: "Vol sellers are getting paid. Enjoy it while it lasts."',
        params: { theta: -0.002 },
        magnitude: 'minor',
    },
    {
        id: 'markets_drift_sideways_3',
        category: 'neutral',
        likelihood: 5,
        headline: 'Low-conviction session: breadth flat, volume below 30-day average. The Meridian Brief: "No leadership, no conviction. Market is waiting for Malhotra\'s earnings call."',
        params: { mu: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'holiday_thin_volume',
        category: 'neutral',
        likelihood: 4,
        headline: 'Holiday-shortened week sees thin volumes; institutional desks running skeleton crews. The Meridian Brief: "Half the Street is at the Hamptons. The other half wishes they were."',
        params: { theta: -0.003, lambda: -0.1 },
        magnitude: 'minor',
    },
    {
        id: 'sector_rotation_flavor',
        category: 'neutral',
        likelihood: 4,
        headline: 'Sector rotation continues as money flows from growth to value. The Meridian Brief: "Rotation, not distribution. Net index impact negligible."',
        params: { mu: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'opex_positioning',
        category: 'neutral',
        likelihood: 3,
        headline: 'Options expiration approaching; dealers adjust hedges as gamma exposure shifts near key strikes. The Meridian Brief flags unusual activity ahead of Malhotra\'s next earnings call.',
        params: { theta: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'overseas_markets_flat',
        category: 'neutral',
        likelihood: 5,
        headline: 'European and Asian bourses close mixed; no clear signal for U.S. open. The Meridian Brief: "Overnight session says nothing. We trade our own book."',
        params: { mu: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'buyback_season',
        category: 'neutral',
        likelihood: 3,
        headline: 'Corporate buyback window reopens post-earnings; S&P constituents authorized $180B in repurchases this quarter. Malhotra\'s buyback program is among the largest.',
        params: { mu: 0.005, theta: -0.002 },
        magnitude: 'minor',
    },
    {
        id: 'bond_auction_tepid',
        category: 'neutral',
        likelihood: 4,
        headline: '10-year Treasury auction draws tepid demand; tail of 1.2bps, bid-to-cover at 2.31x. Sharma on MarketWire: "The bond vigilantes are sending a message."',
        params: { b: 0.001, sigmaR: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'retail_sales_inline',
        category: 'neutral',
        likelihood: 4,
        headline: 'Retail sales come in exactly at consensus (+0.3% m/m); no revision to prior month. The Meridian Brief: "In-line data, in-line market. Next."',
        params: { mu: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_investor_conference',
        category: 'neutral',
        likelihood: 3,
        headline: 'PNTH holds annual investor conference; Gottlieb reiterates long-term Atlas Sentinel vision, no guidance change. Malhotra handles the Q&A. Dirks skips the event.',
        params: { mu: 0.004, theta: -0.001 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },
    {
        id: 'meme_stock_day',
        category: 'neutral',
        likelihood: 3,
        headline: 'Retail traders pile into meme stocks again; social media forums light up. The Meridian Brief: "The meme crowd is back. Index impact minimal but the vol desk is watching."',
        params: { theta: 0.003, xi: 0.01 },
        magnitude: 'minor',
    },
    {
        id: 'mixed_economic_data',
        category: 'neutral',
        likelihood: 5,
        headline: 'Mixed economic signals: jobless claims tick up while ISM manufacturing beats. The Meridian Brief: "Data is contradicting itself. Markets chop in a narrow range."',
        params: { mu: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'approval_mean_revert',
        category: 'neutral',
        likelihood: 4,
        headline: 'MarketWire tracking poll shows slight shift in Barron approval; The Sentinel and The Continental spin opposite narratives from the same data',
        params: {},
        magnitude: 'minor',
        effects: (world) => {
            // Nudge approval gently toward 45 to prevent extreme early drift
            if (world.election.barronApproval > 50) {
                world.election.barronApproval -= 1;
            } else if (world.election.barronApproval < 40) {
                world.election.barronApproval += 1;
            }
        },
    },

    // ── Low-firmStanding consequence events ──
    {
        id: 'firm_capital_cut',
        category: 'neutral',
        likelihood: 3,
        headline: 'Webb cuts your risk allocation by 20%. "Until we see consistent performance."',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => ctx.factions.firmStanding <= 30,
        effects: () => { shiftFaction('firmStanding', -2); },
    },
    {
        id: 'firm_riggs_promoted',
        category: 'neutral',
        likelihood: 1,
        headline: 'Riggs gets the corner office. Vasquez says it\'s "just logistics." Nobody believes her.',
        magnitude: 'minor',
        oneShot: true,
        when: (sim, world, congress, ctx) => ctx.factions.firmStanding <= 35 && sim.day > 300,
        effects: () => { shiftFaction('firmStanding', -3); },
    },
    {
        id: 'firm_vasquez_warning',
        category: 'neutral',
        likelihood: 2,
        headline: 'Vasquez takes you aside: "I went out on a limb to bring you here. Don\'t make me regret it."',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.firmStanding <= 40 && ctx.factions.firmStanding > 25 && sim.day > 200,
    },
    {
        id: 'firm_capital_boost',
        category: 'neutral',
        likelihood: 2,
        headline: 'Webb increases your allocation. "You\'ve earned more rope. Don\'t hang yourself with it."',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.firmStanding >= 80,
        effects: () => { shiftFaction('firmStanding', 1); },
    },

    // ── Portfolio-reactive events ──
    {
        id: 'portfolio_whale_whispers',
        category: 'neutral',
        likelihood: 2,
        headline: 'Riggs leans over: "People are talking about your book. The Street knows when someone\'s swinging big."',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.portfolio.grossLeverage > 3 && ctx.factions.firmStanding > 40,
        effects: () => { shiftFaction('regulatoryExposure', 2); shiftFaction('firmStanding', -2); },
    },
    {
        id: 'portfolio_drawdown_notice',
        category: 'neutral',
        likelihood: 2.5,
        headline: 'Webb stops by your desk. He doesn\'t say anything. He just looks at your screen and leaves.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.portfolio.pnlPct < -0.15 && ctx.factions.firmStanding < 50,
        effects: () => { shiftFaction('firmStanding', -3); },
    },
    {
        id: 'portfolio_streak_recognized',
        category: 'neutral',
        likelihood: 1.5,
        headline: 'Vasquez mentions your name in the partners\' meeting. "Best risk-adjusted returns on the floor."',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.portfolio.pnlPct > 0.3 && ctx.portfolio.grossLeverage < 2,
        effects: () => { shiftFaction('firmStanding', 4); },
    },
    {
        id: 'portfolio_flat_book',
        category: 'neutral',
        likelihood: 2,
        headline: 'Webb asks why your book is empty. "We\'re not paying you to watch."',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.portfolio.positionCount === 0 && sim.day > 280,
        effects: () => { shiftFaction('firmStanding', -2); },
    },

    // ===================================================================
    //  PORTFOLIO POPUP EVENTS (migrated from popup-events.js)
    // ===================================================================

    // -- Position-based --

    {
        id: 'desk_compliance_short',
        trigger: (sim, world) => {
            const eq = equity();
            if (eq <= 0) return false;
            const exposedMult = world?.investigations?.meridianExposed ? 0.7 : 1.0;
            const thresh = 0.30 * firmThresholdMult() * (hasTrait('under_scrutiny') ? 0.7 : 1) * exposedMult;
            return shortDirectionalNotional() / eq > thresh && anyInvestigationActive(world);
        },
        cooldown: 200,
        tone: 'negative',
        popup: true,
        headline: 'Meridian compliance flags short book — Okafor\'s committee is watching',
        context: (sim, world) => {
            const netDelta = computeNetDelta();
            const tone = firmTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            const okaforActive = world.investigations.okaforProbeStage > 0;
            const subpoenaLine = okaforActive
                ? ' Okafor\'s Special Investigations Committee has subpoena authority over trading records — Meridian\'s general counsel is already briefing outside attorneys.'
                : ' Congressional staffers have been making informal calls to prime brokers. Meridian\'s general counsel is asking pointed questions about your information sources.';
            const scrutinyLine = hasTrait('under_scrutiny')
                ? `Given your current visibility, this is extremely dangerous. `
                : '';
            return prefix + scrutinyLine + `Your net delta is ${netDelta.toFixed(0)} — deeply short — while federal investigators are circling. Compliance has pulled your trading records and wants a meeting. The optics of a large directional bet during an investigation are terrible.` + subpoenaLine;
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
                factionShifts: [{ faction: 'firmStanding', value: -3 }],
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
            const eq = equity();
            if (eq <= 0) return false;
            return longDirectionalNotional() / eq > 1.5 * firmThresholdMult() &&
                (world.geopolitical.tradeWarStage >= 2 || world.geopolitical.recessionDeclared);
        },
        cooldown: 250,
        tone: 'negative',
        popup: true,
        headline: 'Meridian CRO: "Do you know something we don\'t?"',
        context: (sim, world) => {
            const netDelta = computeNetDelta();
            const tone = firmTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            const macro = world.geopolitical.recessionDeclared
                ? 'Priya Sharma\'s MarketWire column called it "the worst macro backdrop in a decade."'
                : 'The trade war with Serica is deepening and Priya Sharma\'s MarketWire coverage is unrelentingly bearish.';
            return prefix + `You're carrying ${netDelta.toFixed(0)} delta — massively long — into what everyone else sees as a worsening macro picture. ${macro} Two PMs on the Meridian floor pulled you aside at lunch. The CRO wants to know your thesis. Either you're brilliant or reckless, and right now nobody can tell which.`;
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
            const totalOpt = totalOptionsNotional();
            if (totalOpt <= 0) return false;
            const eq = equity();
            if (eq <= 0) return false;
            const { notional } = maxStrikeConcentration();
            return notional / totalOpt > 0.50 && notional / eq > 0.10 * firmThresholdMult();
        },
        cooldown: 180,
        tone: 'negative',
        popup: true,
        headline: 'Market maker complains about single-strike concentration',
        context: () => {
            const { strike, notional } = maxStrikeConcentration();
            const tone = firmTone();
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
            const eq = equity();
            if (eq <= 0) return false;
            const gross = computeGrossNotional();
            return (gross / eq) > 4 * (hasTrait('under_scrutiny') ? 0.7 : 1);
        },
        cooldown: 120,
        tone: 'negative',
        popup: true,
        headline: 'Risk desk intervention: leverage ratio exceeds 4x',
        context: (sim) => {
            const eq = equity();
            const gross = computeGrossNotional();
            const ratio = (gross / eq).toFixed(1);
            const tone = firmTone();
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
                factionShifts: [{ faction: 'firmStanding', value: -5 }],
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
            const absStock = absStockQty();
            return absStock > ADV * IMPACT_THRESHOLD_100;
        },
        cooldown: 200,
        tone: 'positive',
        popup: true,
        headline: 'Your name is on the tape',
        context: () => {
            const absStock = absStockQty();
            const tone = firmTone();
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
            const nuu = netUncoveredUpside();
            if (nuu >= 0) return false;
            const eq = equity();
            if (eq <= 0) return false;
            return Math.abs(nuu) * market.S / eq > 0.10 * firmThresholdMult();
        },
        cooldown: 120,
        tone: 'negative',
        popup: true,
        headline: 'Risk desk flags unlimited upside exposure',
        context: (sim) => {
            const nuu = netUncoveredUpside();
            const tone = firmTone();
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
                factionShifts: [{ faction: 'firmStanding', value: -3 }],
                complianceTier: 'defiant',
                playerFlag: 'defied_unlimited_risk',
                resultToast: 'Risk desk notes your refusal. The file grows thicker.',
            },
        ],
    },

    {
        id: 'desk_bond_fomc',
        trigger: (sim, world) => {
            const eq = equity();
            if (eq <= 0) return false;
            return bondNotional() / eq > 0.20 * firmThresholdMult() && !world.fed.hartleyFired;
        },
        cooldown: 180,
        tone: 'negative',
        era: 'early',
        popup: true,
        headline: 'Compliance flags bond position ahead of Hartley\'s FOMC meeting',
        context: (sim, world) => {
            const bondNot = bondNotional();
            const tone = firmTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            let body = `You have $${(bondNot / 1000).toFixed(1)}k in bond exposure with Chair Hartley's FOMC meeting imminent. Priya Sharma's MarketWire preview is already moving bonds. The surveillance team has flagged the timing — they want documentation of your decision-making process, what public information you used, and whether you've had any contact with Fed officials or their staff. Standard protocol, but the paperwork is a headache.`;
            if (world?.geopolitical?.energyCrisis) {
                body += ' The energy crisis adds a new dimension — Hartley is caught between inflation from oil prices and recession from tightening.';
            }
            return prefix + body;
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
            const eq = equity();
            if (eq <= 0) return false;
            const pnthNotional = portfolio.positions.filter(p => p.type === 'stock')
                .reduce((s, p) => s + Math.abs(p.qty) * posPrice(p), 0);
            const daysToEarnings = QUARTERLY_CYCLE - (sim.day % QUARTERLY_CYCLE);
            return pnthNotional / eq > 0.15 * firmThresholdMult() && daysToEarnings <= 10;
        },
        cooldown: 150,
        tone: 'negative',
        popup: true,
        headline: 'Sellside salesman mentions "interesting flow" ahead of Malhotra\'s earnings call',
        context: (sim, world) => {
            let text = 'A salesman from a bulge bracket calls your line. "Listen, I can\'t say much, but there\'s been unusual activity in the PNTH options chain ahead of Malhotra\'s earnings call. Smart money is positioning before the print — someone on the sellside thinks Raj is going to guide higher. I think you\'d want to know." He trails off, waiting for you to bite.';
            if (world?.geopolitical?.khasurianCrisis >= 2) {
                text += ' The Khasurian border crisis has made Aegis a national security priority overnight.';
            }
            return text;
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
                factionShifts: [{ faction: 'regulatoryExposure', value: 13 }],
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
        tone: 'negative',
        popup: true,
        headline: 'The Meridian Brief: "One trader swimming against the tide"',
        context: (sim, world) => {
            const netDelta = computeNetDelta();
            let text = `PNTH is at $${sim.S.toFixed(0)} — well above where you started shorting — and your delta is ${netDelta.toFixed(0)}. Every tick higher costs you. The PM next to you on the Meridian floor just booked his best quarter ever going long. Your MarketWire chat is full of unsolicited advice. The desk head walks past without making eye contact. You're either early or wrong, and right now the P&L doesn't distinguish between the two.`;
            if (world?.geopolitical?.crucibleCompetitionPressure) {
                text += ' Zhaowei\'s sovereign-backed compute buildout looms over every Crucible projection.';
            }
            return text;
        },
        choices: [
            {
                label: 'Hold the line',
                desc: 'The thesis hasn\'t changed. Reaffirm your conviction to the desk and ride it out.',
                deltas: { xi: 0.01 },
                playerFlag: 'doubled_down_short',
                resultToast: 'Conviction noted. The floor thinks you\'ve lost it.',
            },
            {
                label: 'Admit defeat',
                desc: 'Cover everything. Take the loss. Live to fight another day.',
                trades: [{ action: 'close_short' }],
                deltas: { theta: -0.005 },
                playerFlag: 'covered_losing_short',
                resultToast: 'You eat the loss. It stings, but the bleeding stops.',
            },
            {
                label: 'Request a risk review',
                desc: 'Ask the desk head to review your exposure. Show you\'re managing this responsibly.',
                deltas: {},
                playerFlag: 'hedged_short_with_calls',
                resultToast: 'The desk head nods approvingly. Prudent move.',
            },
        ],
    },

    {
        id: 'desk_risk_committee',
        trigger: (sim, world) => {
            const exposedMult = world?.investigations?.meridianExposed ? 0.9 : 1.0;
            const eq = equity();
            return eq < INITIAL_CAPITAL * (1 - ROGUE_TRADING_THRESHOLD * 0.8 * exposedMult);
        },
        cooldown: 250,
        tone: 'negative',
        popup: true,
        headline: 'Emergency risk committee meeting',
        context: () => {
            const eq = equity();
            const loss = ((1 - eq / INITIAL_CAPITAL) * 100).toFixed(0);
            const tone = firmTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            const starLine = hasTrait('meridian_star')
                ? `Your track record buys you time, but `
                : '';
            return prefix + starLine + `You're down ${loss}%. The risk committee has convened an emergency session. The CRO, general counsel, and your MD are in the conference room. The conversation is short: explain the losses, present a plan, or face position limits. The compliance officer is taking notes. HR is cc'd on the meeting invite. This is not a drill.`;
        },
        choices: [
            {
                label: 'Close everything',
                desc: 'Liquidate all positions. Rebuild from cash.',
                factionShifts: [{ faction: 'firmStanding', value: 5 }],
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
                factionShifts: [{ faction: 'firmStanding', value: -8 }],
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
            return world.geopolitical.recessionDeclared && equity() > INITIAL_CAPITAL * 1.2;
        },
        cooldown: 300,
        tone: 'positive',
        popup: true,
        headline: 'MarketWire: "Meridian Capital profits surge amid recession"',
        context: (sim, world) => {
            const eq = equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `A recession has been declared and you're up ${pct}%. Someone found Meridian Capital's 13F filing and connected the dots. Priya Sharma's MarketWire column picked it up: "Meridian's derivatives desk posts record returns while Main Street bleeds." Rep. Oduya quoted the piece on the House floor. Your name isn't public — yet — but the firm is fielding press calls from The Continental and The Sentinel. The PR team wants to know if you'll issue a statement.`;
        },
        choices: [
            {
                label: 'Donate to charity publicly',
                desc: 'Pledge a portion of profits to recession relief. Good optics.',
                factionShifts: [
                    { faction: 'mediaTrust', value: 2, when: { hasTrait: 'media_figure' }, bonus: 2 },
                    { faction: 'farmerLaborSupport', value: 2 },
                ],
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
                label: 'Go on The Sentinel to defend capitalism',
                desc: 'Marcus Cole\'s show. Markets allocate risk. Your profits are price discovery. Someone has to say it.',
                factionShifts: [
                    { faction: 'mediaTrust', value: 3, when: { hasTrait: 'media_figure' }, bonus: 2 },
                    { faction: 'federalistSupport', value: 3 },
                    { faction: 'farmerLaborSupport', value: -5 },
                ],
                deltas: { xi: 0.015 },
                effects: [{ path: 'media.sentinelRating', op: 'add', value: 1 }],
                playerFlag: 'defended_capitalism_tv',
                resultToast: 'The clip from Cole\'s show goes viral. Half the finance world loves you. The other half doesn\'t.',
            },
        ],
    },

    {
        id: 'desk_md_meeting',
        trigger: () => {
            const eq = equity();
            return eq < INITIAL_CAPITAL * 0.85;
        },
        cooldown: 200,
        tone: 'negative',
        era: 'early',
        popup: true,
        headline: 'Your MD wants a word',
        context: () => {
            const eq = equity();
            const loss = ((1 - eq / INITIAL_CAPITAL) * 100).toFixed(0);
            const tone = firmTone();
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
                factionShifts: [{ faction: 'firmStanding', value: 3 }],
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
                factionShifts: [{ faction: 'firmStanding', value: -2 }],
                complianceTier: 'defiant',
                playerFlag: 'showed_conviction_early',
                resultToast: 'Your MD nods slowly. "Don\'t make me regret this."',
            },
        ],
    },

    {
        id: 'desk_unusual_activity',
        trigger: (sim, world) => {
            if (portfolio.peakValue <= INITIAL_CAPITAL) return false;
            const exposedMult = world?.investigations?.meridianExposed ? 0.7 : 1.0;
            const eq = equity();
            const dailySwing = Math.abs(eq - portfolio.peakValue) / portfolio.peakValue;
            return dailySwing > 0.08 * exposedMult;
        },
        cooldown: 120,
        tone: 'negative',
        popup: true,
        headline: 'Meridian compliance flags unusual P&L volatility',
        context: () => {
            const eq = equity();
            const swing = Math.abs(eq - portfolio.peakValue);
            return `Your book just swung $${(swing / 1000).toFixed(1)}k in a single period. That's more than most PMs at Meridian make in a quarter. Compliance has flagged the activity for review. They're not accusing you of anything — yet — but the pattern of outsized moves triggers Meridian's surveillance algorithms. Expect a call from the surveillance team and a formal review of your recent trades.`;
        },
        choices: [
            {
                label: 'Cooperate fully',
                desc: 'Open your books. Show them everything. Transparency is your friend.',
                factionShifts: [
                    { faction: 'firmStanding', value: 2 },
                    { faction: 'regulatoryExposure', value: -2 },
                ],
                deltas: {},
                playerFlag: 'cooperated_unusual_activity',
                resultToast: 'Review completed. No issues found. The flag is cleared.',
            },
            {
                label: 'Lawyer up',
                desc: 'Call your personal attorney before responding. Protect yourself.',
                factionShifts: [
                    { faction: 'firmStanding', value: -3 },
                    { faction: 'regulatoryExposure', value: 3, when: { hasTrait: 'under_scrutiny' }, bonus: 3 },
                ],
                deltas: { xi: 0.005 },
                playerFlag: 'lawyered_up_unusual',
                resultToast: 'The lawyer tells compliance you\'ll respond in writing within 5 business days. Tension rises.',
            },
        ],
    },

    {
        id: 'desk_headhunter',
        trigger: (sim) => {
            const eq = equity();
            const quarters = Math.floor(liveDay(sim.day) / QUARTERLY_CYCLE);
            return quarters >= 3 && (eq > INITIAL_CAPITAL * 1.3 || hasTrait('meridian_star'));
        },
        cooldown: 300,
        tone: 'positive',
        era: 'mid',
        popup: true,
        headline: 'A headhunter wants to poach you from Meridian',
        context: () => {
            const eq = equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `"I represent a multi-strategy fund that's building out its macro desk. Your track record at Meridian — up ${pct}% net over three quarters — is exactly what they're looking for. Guaranteed $2M first year, full P&L autonomy, and a 20% payout on everything above hurdle." The message arrives on your personal phone at 10pm. Flattering. Also suspicious timing.`;
        },
        choices: [
            {
                label: 'Take the meeting',
                desc: 'What\'s the harm? Always good to know your market value.',
                factionShifts: [{ faction: 'firmStanding', value: -3 }],
                deltas: {},
                playerFlag: 'took_headhunter_meeting',
                resultToast: 'You meet at a discreet restaurant in Midtown. The offer is real. Now you have leverage.',
            },
            {
                label: 'Tell your MD',
                desc: 'Loyalty play. Let Meridian match or beat the offer.',
                factionShifts: [{ faction: 'firmStanding', value: 5 }],
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
            const eq = equity();
            return portfolio.maxDrawdown > 0.20 && eq >= INITIAL_CAPITAL * 0.98;
        },
        cooldown: 300,
        tone: 'positive',
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
                factionShifts: [{ faction: 'firmStanding', value: -3 }],
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
        trigger: () => equity() > INITIAL_CAPITAL * 1.15,
        cooldown: 600,  // basically once
        tone: 'positive',
        era: 'early',
        popup: true,
        headline: 'The Meridian Brief mentions you by name',
        context: () => {
            const eq = equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `Up ${pct}%. For the first time, people on the Meridian floor know your name for the right reasons. The head of trading mentioned you in the morning brief. A sellside salesman sent a bottle of Macallan to your desk. Your MarketWire handle shows up in three different chat groups. You're no longer "the new kid" — you're "that trader who called the move." Enjoy it. This is the moment that defines careers.`;
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

    {
        id: 'desk_fomc_bond_compliance',
        trigger: (sim, world) => {
            const eq = equity();
            if (eq <= 0) return false;
            return bondNotional() / eq > 0.10 * firmThresholdMult() && world.fed.hikeCycle;
        },
        cooldown: 200,
        tone: 'negative',
        era: 'mid',
        popup: true,
        headline: 'Compliance requires documentation during Hartley\'s hiking cycle',
        context: (sim, world) => {
            const bondNot = bondNotional();
            const tone = firmTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            const chair = world.fed.hartleyFired ? (world.fed.vaneAppointed ? 'Vane' : 'the acting chair') : 'Hartley';
            return prefix + `You have $${(bondNot / 1000).toFixed(1)}k in bond exposure during ${chair}'s active hiking cycle. Every FOMC meeting is a binary event for your book — Priya Sharma's MarketWire preview alone can move yields 5 basis points. Compliance is requiring pre-trade documentation for all duration trades until the cycle ends. Every trade needs a written rationale filed before execution. It's bureaucratic, but it's protection if anyone ever questions your timing.`;
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
];
