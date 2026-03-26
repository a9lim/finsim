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
            headline: 'The Financial Freedom Act meets a Federalist trifecta — Lassiter and Tao gut banking oversight in a 48-hour legislative blitz. MarketWire calls it "the most consequential deregulation since 1999."',
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
            headline: 'Atlas Aegis drone footage from Operation Dustwalker leaks to The Continental. PNTH stock surges on expanded Pentagon contracts even as Gottlieb issues a rare public dissent. "This is not what I built this company for."',
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
            headline: 'Lassiter\'s tariffs meet recession head-on. Premier Liang Wei retaliates with semiconductor export controls. Priya Sharma\'s MarketWire column: "Stagflation is no longer a textbook exercise."',
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
            headline: 'Your attendance at the Okafor fundraiser pays an unexpected dividend. Sources close to the senator indicate her committee will "look favorably" on cooperative witnesses from Meridian Capital.',
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
            headline: 'Rachel Tan\'s Continental investigation connects the insider tip you pursued to a pattern of suspicious trading flagged by the SEC. Her three-part series drops Sunday. Your name isn\'t in it — yet.',
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
            headline: 'Okafor\'s impeachment proceedings collide with recession. The Sentinel calls it a "partisan coup during an economic emergency." The Continental calls it "accountability." Bond markets call it a 300-basis-point risk premium.',
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
            headline: 'DOJ suit. Okafor subpoena. Kassis\'s whistleblower filing. Palanthropic faces simultaneous legal assault on three fronts. Malhotra\'s emergency earnings call lasts eleven minutes. Zhen cancels all meetings.',
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
            headline: 'Gottlieb\'s Covenant AI lands its first major contract — a Serican firm sanctioned under Lassiter\'s trade regime. The irony is not lost on The Continental: "Palanthropic\'s Prodigal Son Sells to the Enemy."',
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
            headline: 'Al-Farhan closes the Strait of Farsis as Meridia border tensions peak. Oil gaps above $140. Barron tweets: "The Emir will learn what Columbia does when you cut our energy supply." Bond vigilantes are already moving.',
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
            headline: 'With Hartley fired and Fed credibility in free fall, the dollar index breaks multi-year support. Priya Sharma: "We are witnessing the unthinkable — a reserve currency confidence crisis in real time."',
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
            headline: 'Your elevated SEC scrutiny profile makes you a liability during primary season. Tom Driscoll reports that Okafor\'s committee has subpoenaed trading records from "a prominent Meridian Capital derivatives desk."',
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
            headline: 'The Continental publishes leaked Atlas Sentinel deployment logs from the Southern Hemisphere Initiative. Madero holds a press conference in Caracas demanding Columbia extradite "the corporate spies." PNTH stock halts trading.',
            magnitude: 'moderate',
            params: { theta: 0.01 },
            effects: (world) => {
                world.pnth.boardGottlieb = Math.min(12, world.pnth.boardGottlieb + 1);
            },
        },
    },
    {
        id: 'filibuster_big_bill_collapse',
        condition: (world) =>
            world.congress.bigBillStatus === 4 &&
            world.election.barronApproval < 45,
        event: {
            id: 'compound_big_bill_death',
            category: 'political',
            headline: 'The Big Beautiful Bill dies on the Senate floor after Whitfield\'s 14-hour filibuster. Haines crossed the aisle on the spending provisions. Barron calls it "a betrayal by cowards." His approval craters.',
            magnitude: 'major',
            params: { mu: -0.04, theta: 0.02 },
        },
    },
    {
        id: 'companion_farsistan_data',
        condition: (world) =>
            world.pnth.companionLaunched &&
            world.pnth.companionScandal >= 2 &&
            world.geopolitical.farsistanEscalation >= 1,
        event: {
            id: 'compound_companion_intelligence',
            category: 'pnth',
            headline: 'Rachel Tan publishes proof that Atlas Companion user data was accessible to Farsistani intelligence via a sovereign wealth fund side-letter. 200 million users. Zero disclosure. Okafor schedules emergency hearings.',
            magnitude: 'major',
            params: { mu: -0.06, theta: 0.03, lambda: 2.0 },
        },
    },
    {
        id: 'strait_closure_oil_emergency',
        condition: (world) =>
            world.geopolitical.straitClosed &&
            world.geopolitical.farsistanEscalation >= 3,
        event: {
            id: 'compound_strait_war_footing',
            category: 'macro',
            headline: 'Al-Farhan seals the Strait of Farsis completely. Navon puts Meridia on war footing. Barron authorizes naval escort operations. Oil hits $160. The Sentinel runs a countdown clock: "Days Since the Strait Closed."',
            magnitude: 'major',
            params: { mu: -0.08, b: 0.03, sigmaR: 0.008, theta: 0.04, lambda: 3.0 },
        },
    },
    {
        id: 'media_credibility_collapse',
        condition: (world) =>
            world.media.pressFreedomIndex <= 2 &&
            world.media.leakCount >= 4,
        event: {
            id: 'compound_press_crisis',
            category: 'political',
            headline: 'Barron revokes The Continental\'s press credentials after Driscoll\'s fifth consecutive leak story. Tan publishes from home. Cole celebrates on The Sentinel. Press freedom organizations issue emergency statements.',
            magnitude: 'moderate',
            params: { theta: 0.015, xi: 0.08 },
        },
    },
    {
        id: 'aegis_civilian_casualties',
        condition: (world) =>
            world.pnth.aegisDeployed &&
            world.pnth.aegisControversy >= 2 &&
            world.geopolitical.farsistanEscalation >= 2,
        event: {
            id: 'compound_aegis_war_crime',
            category: 'pnth',
            headline: 'An Atlas Aegis autonomous targeting decision kills 34 civilians in a Farsistani border village. Kassis leaks the decision logs to The Continental. Gottlieb calls for Dirks\'s resignation. Navon denies involvement.',
            magnitude: 'major',
            params: { mu: -0.05, theta: 0.03, lambda: 2.5 },
        },
    },
    {
        id: 'khasuria_full_breach',
        condition: (world) =>
            world.geopolitical.khasurianCrisis >= 3 &&
            world.pnth.aegisDeployed,
        event: {
            id: 'compound_khasuria_invasion',
            category: 'macro',
            headline: 'Volkov sends armored columns across the Khasurian border at dawn. Barron holds an emergency NSC meeting. Hartley — or his replacement — signals emergency rate action. Atlas Aegis redeployment from Farsistan to Eastern Europe is on the table.',
            magnitude: 'major',
            params: { mu: -0.06, theta: 0.04, lambda: 3.0, b: 0.02, sigmaR: 0.006 },
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
