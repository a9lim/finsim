/* ===================================================
   compound-triggers.js -- Cross-domain consequence web.
   Evaluates compound conditions across world state,
   regulations, convictions, and scrutiny to fire
   unique events that tie narrative threads together.

   Each trigger fires at most once per game.
   =================================================== */

const _fired = new Set();

const COMPOUND_TRIGGERS = [
    {
        id: 'hartley_fired_trifecta_deregulation',
        condition: (world, congress) =>
            world.fed.hartleyFired && congress.trifecta,
        event: {
            id: 'compound_deregulation_rush',
            category: 'political',
            headline: 'With Hartley gone and both chambers aligned, Barron signs sweeping Financial Freedom Act; margin rules relaxed across the board',
            magnitude: 'major',
            params: { theta: -0.02, lambda: 0.5 },
            effects: (world) => { world.election.barronApproval += 3; },
        },
    },
    {
        id: 'pnth_military_mideast',
        condition: (world) =>
            world.pnth.militaryContractActive && world.geopolitical.mideastEscalation >= 2,
        event: {
            id: 'compound_pnth_war_profits',
            category: 'pnth',
            headline: 'Palanthropic Atlas AI deployed in Middle East theater; defense revenue surges as Dirks faction consolidates control',
            magnitude: 'major',
            params: { mu: 0.04, theta: 0.01 },
            effects: (world) => {
                world.pnth.boardDirks = Math.min(12, world.pnth.boardDirks + 1);
                world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            },
        },
    },
    {
        id: 'trade_war_recession',
        condition: (world) =>
            world.geopolitical.tradeWarStage >= 3 && world.geopolitical.recessionDeclared,
        event: {
            id: 'compound_stagflation',
            category: 'macro',
            headline: 'Economists declare stagflation as tariff-driven inflation meets recessionary contraction; markets face worst of both worlds',
            magnitude: 'major',
            params: { mu: -0.08, theta: 0.04, lambda: 2.0, xi: 0.15 },
            effects: (world) => {
                world.election.barronApproval = Math.max(0, world.election.barronApproval - 10);
                world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 2);
            },
        },
    },
    {
        id: 'player_cooperated_okafor_wins',
        condition: (world, congress, playerChoices) =>
            playerChoices.attended_political_dinner && world.election.okaforRunning,
        event: {
            id: 'compound_okafor_connection',
            category: 'political',
            headline: 'Sen. Okafor\'s campaign acknowledges "productive conversations with key financial sector voices"; your name appears in donor filings',
            magnitude: 'moderate',
            params: { mu: 0.01 },
        },
    },
    {
        id: 'insider_tip_tan_investigation',
        condition: (world, congress, playerChoices) =>
            (playerChoices.pursued_insider_tip || playerChoices.pursued_pnth_tip) &&
            world.investigations.tanBowmanStory >= 2,
        event: {
            id: 'compound_tan_has_evidence',
            category: 'investigation',
            headline: 'Rachel Tan publishes investigative piece linking Meridian trading patterns to material nonpublic information; compliance department launches internal review',
            magnitude: 'major',
            params: { theta: 0.015 },
        },
    },
    {
        id: 'impeachment_recession',
        condition: (world) =>
            world.investigations.impeachmentStage >= 2 && world.geopolitical.recessionDeclared,
        event: {
            id: 'compound_constitutional_crisis',
            category: 'political',
            headline: 'Constitutional crisis meets economic collapse; markets whipsaw as impeachment proceedings continue through recession',
            magnitude: 'major',
            params: { mu: -0.06, theta: 0.03, lambda: 3.0, xi: 0.2, rho: -0.1 },
            effects: (world) => {
                world.election.barronApproval = Math.max(0, world.election.barronApproval - 15);
            },
        },
    },
    {
        id: 'pnth_scandal_convergence',
        condition: (world) =>
            world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched && world.pnth.whistleblowerFiled,
        event: {
            id: 'compound_pnth_perfect_storm',
            category: 'pnth',
            headline: 'DOJ, Senate, and whistleblower actions converge on Palanthropic simultaneously; board calls emergency session as share price enters free fall',
            magnitude: 'major',
            params: { mu: -0.05, theta: 0.03, lambda: 2.0 },
            effects: (world) => {
                world.pnth.ethicsBoardIntact = false;
                world.pnth.commercialMomentum = -2;
            },
        },
    },
    {
        id: 'gottlieb_rival_trade_war',
        condition: (world) =>
            world.pnth.gottliebStartedRival && world.geopolitical.tradeWarStage >= 2 &&
            world.geopolitical.sanctionsActive,
        event: {
            id: 'compound_covenant_sanctions',
            category: 'pnth',
            headline: 'Gottlieb\'s Covenant AI faces sanctions review for Chinese partnerships; trade war threatens to split the AI industry along geopolitical lines',
            magnitude: 'moderate',
            params: { theta: 0.01, lambda: 0.5 },
        },
    },
    {
        id: 'oil_crisis_mideast',
        condition: (world) =>
            world.geopolitical.oilCrisis && world.geopolitical.mideastEscalation >= 3,
        event: {
            id: 'compound_energy_war',
            category: 'macro',
            headline: 'Full-scale Middle East conflict disrupts global energy supply chains; oil prices spike as strategic reserves are tapped',
            magnitude: 'major',
            params: { mu: -0.06, theta: 0.03, lambda: 2.5, b: 0.02, sigmaR: 0.005 },
        },
    },
    {
        id: 'fed_credibility_collapse',
        condition: (world) =>
            world.fed.credibilityScore <= 3 && world.fed.hartleyFired,
        event: {
            id: 'compound_dollar_crisis',
            category: 'fed',
            headline: 'Fed credibility collapse triggers dollar sell-off; foreign central banks begin diversifying reserves as markets question U.S. monetary independence',
            magnitude: 'major',
            params: { mu: -0.04, theta: 0.02, sigmaR: 0.008, b: -0.01 },
        },
    },
    {
        id: 'player_high_scrutiny_campaign',
        condition: (world, congress, playerChoices, scrutinyLevel) =>
            scrutinyLevel >= 2 && world.election.primarySeason,
        event: {
            id: 'compound_campaign_subpoena_risk',
            category: 'investigation',
            headline: 'Congressional oversight committee requests trading records from "individuals of interest" at major banks; your desk is on the list',
            magnitude: 'moderate',
            params: { theta: 0.005 },
        },
    },
    {
        id: 'south_america_pnth_ops',
        condition: (world) =>
            world.geopolitical.southAmericaOps >= 2 && world.pnth.militaryContractActive,
        event: {
            id: 'compound_pnth_south_america',
            category: 'pnth',
            headline: 'Leaked cables reveal Palanthropic Atlas AI active in South American operations; Gottlieb faction demands emergency board vote on military contracts',
            magnitude: 'moderate',
            params: { theta: 0.01 },
            effects: (world) => {
                world.pnth.boardGottlieb = Math.min(12, world.pnth.boardGottlieb + 1);
            },
        },
    },
];

export function checkCompoundTriggers(world, congress, playerChoices, scrutinyLevel, activeRegIds) {
    const events = [];
    for (const trigger of COMPOUND_TRIGGERS) {
        if (_fired.has(trigger.id)) continue;
        try {
            if (trigger.condition(world, congress, playerChoices, scrutinyLevel, activeRegIds)) {
                _fired.add(trigger.id);
                events.push(trigger.event);
            }
        } catch { /* skip */ }
    }
    return events;
}

export function getFiredTriggerIds() {
    return [..._fired];
}

export function resetCompoundTriggers() {
    _fired.clear();
}

export { COMPOUND_TRIGGERS };
