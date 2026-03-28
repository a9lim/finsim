/* investigation.js -- Investigation, journalism, and impeachment events. */

import { equity } from './_helpers.js';
import { shiftFaction, getRegLevel } from '../faction-standing.js';
import { hasTrait } from '../traits.js';

export const INVESTIGATION_EVENTS = [
    // =====================================================================
    //  RACHEL TAN JOURNALISM CHAIN
    // =====================================================================
    {
        id: 'tan_bowman_initial',
        category: 'investigation',
        likelihood: (sim, world) => {
            let base = 0.7;
            if (world.election.midtermResult === 'fed_gain') base *= 0.5;
            return base;
        },
        headline: 'EXCLUSIVE (The Continental): Rachel Tan reveals VP Bowman held $4M in PNTH stock while personally lobbying Pentagon for Atlas contract. White House: "old news"',
        magnitude: 'moderate',
        maxDay: 600,
        when: (sim, world) => world.investigations.tanBowmanStory === 0,
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        effects: (world) => { world.investigations.tanBowmanStory = 1; world.election.barronApproval = Math.max(0, world.election.barronApproval - 3); shiftFaction('mediaTrust', 3); shiftFaction('regulatoryExposure', 3); },
        followups: [ { id: 'bowman_denial', mtth: 3, weight: 0.9 }, { id: 'tan_bowman_followup', mtth: 25, weight: 0.6 }, ],
    },
    {
        id: 'bowman_denial',
        followupOnly: true,
        category: 'investigation',
        likelihood: 1.0,
        headline: 'VP Bowman issues defiant denial: "I divested before taking office. This is partisan mudslinging." Barron tweets: "The Fake News Continental is DYING"',
        params: { mu: 0.01, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.investigations.tanBowmanStory >= 1,
        portfolioFlavor: (portfolio) => {
            const shortQty = portfolio.positions.filter(p => p.type === 'stock' && p.qty < 0).reduce((s, p) => s + p.qty, 0);
            if (shortQty < -10) return 'Short sellers groan as Bowman\'s denial sparks a relief rally.';
            return null;
        },
    },
    {
        id: 'tan_bowman_followup',
        followupOnly: true,
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Tan follow-up: Bowman\'s "blind trust" traded PNTH options 48 hours before contract announcements. Trust manager: Dirks\'s former assistant. The blind trust wasn\'t blind',
        magnitude: 'moderate',
        when: (sim, world) => world.investigations.tanBowmanStory === 1,
        params: { mu: -0.04, theta: 0.02, lambda: 0.6, muJ: -0.02 },
        effects: (world) => { world.investigations.tanBowmanStory = 2; world.election.barronApproval = Math.max(0, world.election.barronApproval - 5); shiftFaction('mediaTrust', 3); shiftFaction('regulatoryExposure', 5); },
        followups: [ { id: 'doj_bowman_referral', mtth: 30, weight: 0.5 }, { id: 'tan_bombshell_recording', mtth: 40, weight: 0.4 }, { id: 'meridian_exposed', mtth: 25, weight: 0.5 }, ],
    },
    {
        id: 'tan_bombshell_recording',
        followupOnly: true,
        category: 'investigation',
        likelihood: 1.0,
        headline: 'BOMBSHELL: Tan publishes recorded Bowman-Dirks phone call: "Just make sure the stock is in the trust before the announcement." Dirks: "Already done, Jay"',
        magnitude: 'major',
        minDay: 300,
        when: (sim, world) => world.investigations.tanBowmanStory >= 2,
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.04 },
        effects: (world) => { world.investigations.tanBowmanStory = 3; world.election.barronApproval = Math.max(0, world.election.barronApproval - 8); world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1); world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1); shiftFaction('mediaTrust', 3); shiftFaction('regulatoryExposure', 8); },
        followups: [{ id: 'bowman_resigns', mtth: 20, weight: 0.5 }, { id: 'meridian_exposed', mtth: 25, weight: 0.5 }],
    },
    {
        id: 'tan_nsa_initial',
        category: 'investigation',
        likelihood: 0.5,
        headline: 'Tan pivots to new story: PNTH provided NSA with backdoor access to Atlas commercial clients\' data. Three Fortune 500 companies threaten to sue',
        params: { mu: -0.04, theta: 0.02, lambda: 0.8 },
        magnitude: 'moderate',
        minDay: 200,
        when: (sim, world) => world.investigations.tanNsaStory === 0 && world.investigations.tanBowmanStory >= 1,
        effects: (world) => {
            world.investigations.tanNsaStory = 1;
            shiftFaction('mediaTrust', 2);
            shiftFaction('regulatoryExposure', 3);
        },
        followups: [
            { id: 'tan_nsa_followup', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'tan_nsa_followup',
        followupOnly: true,
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Tan\'s second NSA piece: backdoor was approved personally by Dirks without board knowledge. EU threatens to ban Atlas from European markets entirely',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        magnitude: 'major',
        when: (sim, world) => world.investigations.tanNsaStory === 1,
        effects: (world) => {
            world.investigations.tanNsaStory = 2;
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            shiftFaction('mediaTrust', 3);
            shiftFaction('regulatoryExposure', 5);
        },
    },

    // =====================================================================
    //  OKAFOR SENATE PROBE
    // =====================================================================
    {
        id: 'okafor_hearings_opened',
        category: 'investigation',
        likelihood: (sim, world) => {
            let base = 0.8;
            if (world.investigations.tanBowmanStory >= 2) base *= 1.5;
            if (world.election.midtermResult === 'fed_loss_both' ||
                world.election.midtermResult === 'fed_loss_house') base *= 1.5;
            return base;
        },
        headline: 'Sen. Okafor formally opens Intelligence Committee hearings into PNTH-White House ties; witness list includes current and former PNTH executives',
        magnitude: 'moderate',
        when: (sim, world) => world.investigations.okaforProbeStage === 0 && world.pnth.senateProbeLaunched,
        params: { mu: -0.02, theta: 0.01, lambda: 0.4 },
        effects: [ { path: 'investigations.okaforProbeStage', op: 'set', value: 1 }, ],
    },
    {
        id: 'okafor_subpoenas',
        category: 'investigation',
        likelihood: (sim, world) => {
            let base = 1.0;
            if (world.investigations.tanBowmanStory >= 2) base *= 1.5;
            if (world.election.midtermResult === 'fed_loss_both' ||
                world.election.midtermResult === 'fed_loss_house') base *= 1.5;
            return base;
        },
        headline: 'Okafor issues subpoenas for Bowman financial records and Dirks-Bowman communications; White House invokes executive privilege. Constitutional showdown looms',
        magnitude: 'moderate',
        minDay: 250,
        when: (sim, world) => world.investigations.okaforProbeStage >= 1,
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        effects: (world) => { world.investigations.okaforProbeStage = 2; shiftFaction('regulatoryExposure', 5); shiftFaction('farmerLaborSupport', 2); },
        followups: [{ id: 'meridian_exposed', mtth: 20, weight: 0.6 }],
    },
    {
        id: 'okafor_criminal_referral',
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Okafor\'s committee votes 8-6 to refer Bowman to DOJ for criminal investigation; "The evidence of insider trading is overwhelming," she says',
        magnitude: 'major',
        minDay: 400,
        when: (sim, world) => world.investigations.okaforProbeStage >= 2,
        params: { mu: -0.03, theta: 0.015, lambda: 0.6, muJ: -0.01 },
        effects: (world) => { world.investigations.okaforProbeStage = 3; world.election.barronApproval = Math.max(0, world.election.barronApproval - 3); shiftFaction('regulatoryExposure', 10); shiftFaction('farmerLaborSupport', 3); },
        followups: [{ id: 'meridian_exposed', mtth: 20, weight: 0.6 }],
    },

    // =====================================================================
    //  BOWMAN RESOLUTION
    // =====================================================================
    {
        id: 'doj_bowman_referral',
        followupOnly: true,
        category: 'investigation',
        likelihood: 1.0,
        headline: 'DOJ opens formal investigation into VP Bowman\'s PNTH stock trades; FBI agents visit Bowman\'s financial advisor. White House: "Full cooperation"',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta && world.investigations.tanBowmanStory >= 2,
    },
    {
        id: 'bowman_resigns',
        followupOnly: true,
        category: 'investigation',
        likelihood: 0.8,
        headline: 'BREAKING: VP Bowman resigns "to spend time with family and fight these baseless allegations." Barron: "Jay is a great patriot. Total witch hunt"',
        magnitude: 'major',
        minDay: 400,
        when: (sim, world) => world.investigations.tanBowmanStory >= 2,
        params: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 5); shiftFaction('regulatoryExposure', 5); },
    },
    {
        id: 'bowman_indicted',
        category: 'investigation',
        likelihood: (sim, world) => {
            let base = 0.3;
            if (world.election.midtermResult === 'fed_gain') base *= 0.5;
            return base;
        },
        headline: 'Federal grand jury indicts former VP Bowman on 12 counts of insider trading and conspiracy; bail set at $5M. First sitting or former VP indicted in U.S. history',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, muJ: -0.04 },
        magnitude: 'major',
        minDay: 500,
        when: (sim, world) => world.investigations.tanBowmanStory >= 3 && world.investigations.okaforProbeStage >= 2,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
            shiftFaction('regulatoryExposure', 8);
        },
        portfolioFlavor: (portfolio) => {
            const optQty = portfolio.positions.filter(p => p.type === 'call' || p.type === 'put').reduce((s, p) => s + Math.abs(p.qty), 0);
            if (optQty > 5) return 'Your options book is getting whipped by the vol spike on the indictment.';
            return null;
        },
    },

    // =====================================================================
    //  IMPEACHMENT
    // =====================================================================
    {
        id: 'impeachment_inquiry',
        category: 'investigation',
        likelihood: 0.8,
        headline: 'House Speaker announces formal impeachment inquiry into President Barron; cites "abuse of power, obstruction, and complicity in corruption"',
        magnitude: 'major',
        minDay: 400,
        when: (sim, world, congress) => !congress.fedControlsHouse && world.investigations.impeachmentStage === 0 && world.investigations.tanBowmanStory >= 2,
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, muJ: -0.015, sigmaR: 0.004 },
        effects: (world) => { world.investigations.impeachmentStage = 1; world.election.barronApproval = Math.max(0, world.election.barronApproval - 3); shiftFaction('farmerLaborSupport', 4); shiftFaction('regulatoryExposure', 5); },
        followups: [{ id: 'impeachment_vote', mtth: 40, weight: 0.6 }],
    },
    {
        id: 'impeachment_vote',
        followupOnly: true,
        category: 'investigation',
        likelihood: 1.0,
        headline: 'House votes 220-215 to impeach President Barron on two articles; only third presidential impeachment in U.S. history. Senate trial next',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, muJ: -0.03, sigmaR: 0.008 },
        magnitude: 'major',
        minDay: 500,
        when: (sim, world, congress) => !congress.fedControlsHouse && world.investigations.impeachmentStage === 1,
        effects: (world) => {
            world.investigations.impeachmentStage = 2;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 4);
        },
        followups: [
            { id: 'impeachment_trial', mtth: 30, weight: 0.7 },
        ],
    },
    {
        id: 'impeachment_trial',
        followupOnly: true,
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Senate impeachment trial begins; Chief Justice presides. Barron refuses to testify, calls it "the greatest political persecution in history"',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, sigmaR: 0.005 },
        magnitude: 'major',
        minDay: 600,
        when: (sim, world, congress) => !congress.fedControlsSenate && world.investigations.impeachmentStage === 2,
        effects: (world) => {
            world.investigations.impeachmentStage = 3;
        },
    },

    // ── One-shot compound events (investigation domain) ──
    {
        id: 'compound_tan_has_evidence',
        category: 'investigation',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            (ctx.playerChoices.pursued_insider_tip || ctx.playerChoices.pursued_pnth_tip) &&
            world.investigations.tanBowmanStory >= 2,
        headline: 'Rachel Tan\'s Continental investigation connects the insider tip you pursued to a pattern of suspicious trading flagged by the SEC. Her three-part series drops Sunday. Your name isn\'t in it — yet.',
        magnitude: 'major',
        superevent: true,
        params: { theta: 0.015 },
    },
    {
        id: 'compound_campaign_subpoena_risk',
        category: 'investigation',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            ctx.factions.regulatoryExposure >= 50 && world.election.primarySeason,
        headline: 'Your elevated SEC scrutiny profile makes you a liability during primary season. Tom Driscoll reports that Okafor\'s committee has subpoenaed trading records from "a prominent Meridian Capital derivatives desk."',
        magnitude: 'moderate',
        params: { theta: 0.005 },
    },

    // ── Firm dynamics events (investigation domain) ──
    {
        id: 'firm_congressional_subpoena',
        category: 'investigation',
        headline: 'Okafor subpoenas Meridian Capital trading records.',
        magnitude: 'major',
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            ctx.factions.regulatoryExposure >= 75 && world.investigations.okaforProbeStage >= 1,
        params: { xi: 0.01 },
    },
    {
        id: 'firm_crisis',
        category: 'investigation',
        headline: 'Meridian board considers shutting the derivatives desk.',
        magnitude: 'major',
        oneShot: true,
        superevent: true,
        crisisBriefing: true,
        when: (sim, world, congress, ctx) =>
            ctx.factions.firmStanding < 25 &&
            ctx.factions.regulatoryExposure > 60 &&
            (world.investigations.okaforProbeStage >= 1 || world.media.leakCount >= 2),
        effects: [],
    },

    // ── Trait-gated: scrutiny leak ──
    {
        id: 'tag_scrutiny_leak',
        category: 'investigation',
        likelihood: 2,
        headline: 'Your trading records appear in a Continental article. Someone at the SEC is talking.',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => hasTrait('under_scrutiny') && world.media.tanCredibility >= 5,
        params: { xi: 0.005 },
        effects: (world) => { shiftFaction('regulatoryExposure', 5); shiftFaction('mediaTrust', -3); world.media.leakCount = Math.min(5, world.media.leakCount + 1); },
    },

    // ===================================================================
    //  SCRUTINY POPUP EVENTS (migrated from popup-events.js)
    // ===================================================================

    {
        id: 'scrutiny_press_inquiry',
        trigger: (sim, world, portfolio) => getRegLevel() >= 1,
        cooldown: 200,
        era: 'mid',
        popup: true,
        headline: 'Rachel Tan is asking questions about Meridian\'s derivatives desk',
        context: 'Rachel Tan at The Continental has been asking questions about unusual trading patterns from the Meridian derivatives desk. Your name came up. When Tan starts digging, stories follow — and her stories have a way of reaching Okafor\'s committee. The compliance department wants to know how you\u2019d like to handle it.',
        choices: [
            {
                label: 'No comment',
                desc: 'Decline the interview. The story might run anyway.',
                factionShifts: [{ faction: 'mediaTrust', value: -5 }],
                effects: [{ path: 'media.tanCredibility', op: 'add', value: 1 }],
                playerFlag: 'declined_ft_scrutiny',
                resultToast: 'No comment issued. The story runs with "Meridian declined to comment."',
            },
            {
                label: 'Cooperate with compliance review',
                desc: 'Open your books to the internal review team. Proactive transparency.',
                factionShifts: [
                    { faction: 'mediaTrust', value: 3, when: { hasTrait: 'media_figure' }, bonus: 2 },
                    { faction: 'regulatoryExposure', value: -2 },
                ],
                playerFlag: 'cooperated_scrutiny_review',
                complianceTier: 'full',
                resultToast: 'Internal review finds nothing actionable. For now.',
            },
        ],
    },
    {
        id: 'scrutiny_regulatory_letter',
        trigger: (sim, world, portfolio) => getRegLevel() >= 2,
        cooldown: 300,
        era: 'mid',
        popup: true,
        headline: 'SEC Information Request',
        context: 'A formal letter from the SEC\u2019s Division of Enforcement has arrived at Meridian\u2019s legal department. They\u2019re requesting trading records, communications, and position histories for your desk. This is not a routine examination.',
        choices: [
            {
                label: 'Full cooperation',
                desc: 'Provide everything requested and offer to meet voluntarily.',
                factionShifts: [
                    { faction: 'regulatoryExposure', value: -3 },
                    { faction: 'firmStanding', value: 3 },
                ],
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
                factionShifts: [
                    { faction: 'regulatoryExposure', value: 5, when: { hasTrait: 'under_scrutiny' }, bonus: 5 },
                    { faction: 'firmStanding', value: -5 },
                ],
                effects: [{ path: 'investigations.okaforProbeStage', op: 'add', value: 1 }],
                playerFlag: 'stonewalled_sec',
                complianceTier: 'defiant',
                resultToast: 'The SEC notes Meridian\u2019s "lack of cooperation" in their file.',
            },
        ],
    },
    {
        id: 'scrutiny_subpoena',
        trigger: (sim, world, portfolio) => getRegLevel() >= 3,
        cooldown: 400,
        era: 'late',
        popup: true,
        headline: 'Federal Subpoena — Okafor\'s committee names you',
        context: 'A process server has delivered a federal subpoena to Meridian Capital\u2019s general counsel. The SEC has escalated to a formal investigation. You have been named as a person of interest. Okafor\u2019s Special Investigations Committee staffers are coordinating with the SEC. Rachel Tan has the story.',
        choices: [
            {
                label: 'Testify fully',
                desc: 'Appear before the committee and answer every question.',
                factionShifts: [
                    { faction: 'regulatoryExposure', value: -8 },
                    { faction: 'farmerLaborSupport', value: 5 },
                ],
                playerFlag: 'testified_fully',
                complianceTier: 'full',
                resultToast: 'Your testimony is entered into the congressional record.',
            },
            {
                label: 'Invoke the Fifth',
                desc: 'Exercise your constitutional right against self-incrimination.',
                factionShifts: [
                    { faction: 'regulatoryExposure', value: 5, when: { hasTrait: 'under_scrutiny' }, bonus: 5 },
                    { faction: 'farmerLaborSupport', value: -5 },
                ],
                playerFlag: 'invoked_fifth',
                resultToast: 'You decline to answer on Fifth Amendment grounds. The cameras flash.',
            },
        ],
    },
    // =====================================================================
    //  INVESTIGATION CROSS-POLLINATION BRIDGE
    // =====================================================================
    {
        id: 'meridian_exposed',
        followupOnly: true,
        category: 'investigation',
        headline: 'SEC compliance review flags Meridian Capital\'s derivatives desk in connection with ongoing federal probe. Your name appears in the filing.',
        likelihood: 0,
        magnitude: 'moderate',
        params: { theta: 0.005 },
        when: (sim, world, congress, ctx) =>
            !world.investigations.meridianExposed && (
                (ctx.playerChoices.pursued_insider_tip || ctx.playerChoices.pursued_pnth_tip || ctx.playerChoices.hosted_fundraiser) ||
                (ctx.factions && ctx.factions.regulatoryExposure > 50) ||
                world.media.lobbyingExposed
            ),
        effects: (world) => {
            world.investigations.meridianExposed = true;
        },
        factionShifts: [
            { faction: 'regulatoryExposure', value: 10 },
            { faction: 'firmStanding', value: -5 },
        ],
    },

    {
        id: 'scrutiny_enforcement',
        trigger: (sim, world, portfolio) => getRegLevel() >= 4,
        cooldown: 9999,
        popup: true,
        superevent: true,
        headline: 'SEC Enforcement Action',
        context: () => {
            const level = getRegLevel();
            if (level >= 4) return 'The SEC has filed a formal enforcement action against you personally. The complaint alleges insider trading, market manipulation, and failure to supervise. Marcus Cole is running the story on The Sentinel\u2019s prime-time show. Meridian\u2019s board has called an emergency session. Your options are narrowing.';
            return 'The SEC is pursuing enforcement proceedings related to your trading activity. Meridian\u2019s legal team advises immediate action.';
        },
        choices: [
            {
                label: 'Settle',
                desc: 'Pay the fine, accept the censure, and move on. It will cost $2,000k.',
                factionShifts: [
                    { faction: 'regulatoryExposure', value: -10 },
                    { faction: 'firmStanding', value: -5 },
                ],
                cashPenalty: 2000,
                regulatoryAction: 'settle',
                playerFlag: 'settled_sec',
                resultToast: 'Settlement reached. $2,000k penalty paid. The investigation is closed.',
            },
            {
                label: 'Fight it',
                desc: 'Contest the charges in court. This will get worse before it gets better.',
                factionShifts: [
                    { faction: 'regulatoryExposure', value: 5, when: { hasTrait: 'under_scrutiny' }, bonus: 5 },
                    { faction: 'firmStanding', value: 3, when: { hasTrait: 'meridian_star' }, bonus: 3 },
                    { faction: 'regulatoryExposure', value: 13 },
                ],
                playerFlag: 'fought_sec',
                complianceTier: 'defiant',
                resultToast: 'Your legal team files a motion to dismiss. The SEC doubles down.',
            },
            {
                label: 'Cooperate and inform',
                desc: 'Offer full cooperation and information on broader market patterns.',
                factionShifts: [
                    { faction: 'regulatoryExposure', value: -15 },
                    { faction: 'firmStanding', value: -8 },
                ],
                regulatoryAction: 'cooperate',
                playerFlag: 'informed_sec',
                complianceTier: 'full',
                resultToast: 'The SEC notes your cooperation. Scrutiny eases \u2014 for now.',
            },
        ],
    },
];
