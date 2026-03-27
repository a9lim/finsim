/* congress.js -- Congressional, political, filibuster, and midterm events. */

import { shiftFaction } from '../faction-standing.js';
import { activateRegulation, deactivateRegulation, advanceBill, getPipelineStatus } from '../regulations.js';

export const CONGRESS_EVENTS = [
    // -- Political events --
    // =====================================================================
    //  ARC 7: SENATOR OKAFOR'S RISE
    // =====================================================================
    {
        id: 'okafor_grills_dirks',
        category: 'political',
        likelihood: 0.8,
        headline: 'Sen. Okafor grills Dirks for six hours in televised hearing; "Did you or did you not discuss Atlas targeting with VP Bowman?" Clip goes viral, 40M views',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        minDay: 200,
        when: (sim, world) => world.pnth.senateProbeLaunched,
        effects: (world) => {
            world.investigations.okaforProbeStage = Math.max(1, world.investigations.okaforProbeStage);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            shiftFaction('farmerLaborSupport', 3);
            shiftFaction('regulatoryExposure', 3);
        },
        followups: [
            { id: 'okafor_popularity_surge', mtth: 10, weight: 0.7 },
        ],
    },
    {
        id: 'okafor_popularity_surge',
        followupOnly: true,
        category: 'political',
        likelihood: 1.0,
        headline: 'Okafor\'s favorability jumps 12 points post-hearing; "Okafor 2028" trending on social media. DNC donors reach out quietly',
        params: { mu: -0.005, theta: 0.003 },
        magnitude: 'minor',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
        },
    },
    {
        id: 'okafor_enters_race',
        category: 'political',
        likelihood: 0.7,
        headline: 'BREAKING: Sen. Okafor announces presidential bid from the steps of the Capitol: "This administration has failed every test of leadership. I will not"',
        magnitude: 'moderate',
        minDay: 700,
        when: (sim, world) => sim.day > 750 && !world.election.okaforRunning,
        params: { mu: -0.015, theta: 0.008, lambda: 0.2 },
        effects: (world) => { world.election.okaforRunning = true; world.election.barronApproval = Math.max(0, world.election.barronApproval - 2); shiftFaction('farmerLaborSupport', 4); },
    },
    {
        id: 'okafor_scandal',
        category: 'political',
        likelihood: 0.5,
        headline: 'Opposition research bombshell: Okafor\'s husband held Zhaowei stock while she chaired the Intelligence Committee. She calls it "a smear campaign"',
        magnitude: 'moderate',
        when: (sim, world) => world.election.okaforRunning || world.investigations.okaforProbeStage >= 1,
        params: { mu: 0.015, theta: 0.008 },
        effects: (world) => { world.election.barronApproval = Math.min(100, world.election.barronApproval + 2); shiftFaction('farmerLaborSupport', -3); shiftFaction('federalistSupport', 2); },
    },

    // =====================================================================
    //  BARRON POLITICS
    // =====================================================================
    {
        id: 'dow_rename_eo',
        category: 'political',
        likelihood: 0.6,
        headline: 'Barron signs executive order renaming Department of Defense to "Department of War"; says the old name was "weak and passive." Bipartisan backlash ensues',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
        maxDay: 300,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
        },
    },
    {
        id: 'barron_primetime_address',
        category: 'political',
        likelihood: 1.5,
        headline: 'Barron delivers primetime Oval Office address; long on patriotic rhetoric, short on policy specifics. Ratings strong, markets unmoved',
        params: { mu: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'barron_approval_recovery_high',
        category: 'political',
        likelihood: 3,
        headline: 'MarketWire tracking poll shows Barron approval ticking up 3 points; Tao credits the Financial Freedom Act. Haines: "The economy is doing the work, not the White House"',
        params: { mu: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.election.barronApproval < 40,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        },
    },
    {
        id: 'barron_approval_erosion',
        category: 'political',
        likelihood: 3,
        headline: 'The Continental\'s latest tracking poll: Barron approval slides 4 points. Whitfield on the Senate floor: "The Columbian people are waking up." Tao dismisses it as "fake polling"',
        params: { mu: -0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.election.barronApproval > 52,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
    },

    // =====================================================================
    //  CONGRESS
    // =====================================================================
    {
        id: 'gridlock_spending',
        category: 'political',
        likelihood: 1.0,
        headline: 'Reyes blocks Barron\'s defense spending bill on the House floor; Tao cannot whip the votes. Continuing resolution buys 45 days. The Meridian Brief: "Gridlock is the market\'s favorite word"',
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta,
        params: { mu: -0.008, theta: 0.003 },
    },
    {
        id: 'budget_deal_passes',
        category: 'political',
        likelihood: 0.8,
        headline: 'Tao rams the omnibus through 218-215, strictly party-line. Lassiter shepherds the Senate vote. $1.4T in discretionary spending, defense up 8%. Haines votes yes after extracting a deficit review clause',
        params: { mu: 0.02, theta: -0.005, b: 0.002 },
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.trifecta,
        portfolioFlavor: (portfolio) => {
            const bondQty = portfolio.positions.filter(p => p.type === 'bond').reduce((s, p) => s + p.qty, 0);
            if (bondQty > 5) return 'Your long bond book winces as $1.4T in new spending means more Treasury supply.';
            if (bondQty < -5) return 'Your short bond position benefits as the spending bill pushes yields higher.';
            return null;
        },
    },
    {
        id: 'bipartisan_infrastructure',
        category: 'political',
        likelihood: 0.4,
        headline: 'Whittaker and Oduya co-sponsor $500B infrastructure package; Tao lets it pass over hard-right objections. Lassiter on MarketWire: "Even a broken Congress builds a bridge sometimes"',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2, q: 0.001 },
        magnitude: 'moderate',
    },
    {
        id: 'shutdown_threat',
        category: 'political',
        likelihood: 0.8,
        headline: 'Midnight deadline: Reyes refuses to bring Tao\'s CR to a vote without Oduya\'s labor provisions. Agencies prepare furlough notices. The Sentinel\'s Cole: "Shutdown theater, act three"',
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta,
        params: { mu: -0.025, theta: 0.012, lambda: 0.4, sigmaR: 0.004 },
        followups: [ { id: 'shutdown_resolved', mtth: 10, weight: 0.6 }, ],
    },
    {
        id: 'shutdown_resolved',
        followupOnly: true,
        category: 'political',
        likelihood: 1.0,
        headline: 'Whittaker brokers a last-minute deal with Oduya; short-term CR funds government through next quarter. Okafor on The Continental: "Kicking the can is not governance"',
        params: { mu: 0.015, theta: -0.005, lambda: -0.2 },
        magnitude: 'minor',
    },
    {
        id: 'barron_tax_cut_proposal',
        category: 'congressional',
        likelihood: 0.6,
        headline: 'Barron unveils the Financial Freedom Act: corporate tax cut from 21% to 15%. Haines flags a $400B revenue shortfall. Lassiter on The Sentinel: "Growth pays for itself." Reyes: "Math doesn\'t lie"',
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.trifecta && getPipelineStatus('deregulation_act') === null,
        params: { mu: 0.025, theta: -0.003, b: 0.005, q: 0.002 },
        effects: (world) => { world.election.barronApproval = Math.min(100, world.election.barronApproval + 2); shiftFaction('federalistSupport', 3); advanceBill('deregulation_act', 'introduced'); },
        followups: [{ id: 'ffa_committee_markup', mtth: 25, weight: 1 }],
    },
    {
        id: 'ffa_committee_markup',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Banking Committee begins markup of the Financial Freedom Act. Lassiter chairs a 14-hour session. Haines proposes an amendment capping the repatriation holiday at 3 years. Lassiter kills it in committee.',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'introduced',
        params: { mu: 0.01, theta: -0.002 },
        effects: () => { advanceBill('deregulation_act', 'committee'); },
        followups: [
            { id: 'ffa_floor_passes', mtth: 30, weight: 0.6 },
            { id: 'ffa_floor_fails', mtth: 30, weight: 0.4 },
            { id: 'ffa_haines_opposition', mtth: 12, weight: 0.5 },
            { id: 'ffa_reyes_floor_speech', mtth: 15, weight: 0.4 },
        ],
    },
    {
        id: 'ffa_haines_opposition',
        category: 'congressional',
        likelihood: 2,
        headline: 'Haines breaks with party leadership on the Financial Freedom Act, citing deficit projections. "I will not vote for a bill that adds $400B to the debt without offsets." Barron: "Peggy is confused again."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: { theta: 0.003 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 1); },
    },
    {
        id: 'ffa_reyes_floor_speech',
        category: 'congressional',
        likelihood: 2,
        headline: 'Reyes delivers a blistering 40-minute floor speech against the Financial Freedom Act. "This bill is a permission slip for Wall Street to gamble with the economy." The Sentinel\'s Cole calls it "theatrics."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: {},
        effects: (world) => { shiftFaction('farmerLaborSupport', 1); },
    },
    {
        id: 'clay_opposition_rally',
        category: 'political',
        likelihood: 1.0,
        headline: 'Former President Clay headlines massive opposition rally in D.C.; 200K attend. "This is not who we are," she declares to thunderous applause',
        params: { mu: -0.005, theta: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.election.barronApproval > 35,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
        },
    },
    {
        id: 'barron_executive_overreach',
        category: 'political',
        likelihood: 0.6,
        headline: 'Federal court blocks Barron executive order on media regulation; ruling calls it "a frontal assault on the First Amendment." DOJ will appeal',
        magnitude: 'moderate',
        minDay: 150,
        params: { mu: -0.015, theta: 0.008, sigmaR: 0.003 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 2); shiftFaction('mediaTrust', 2); },
    },

    // -- Compound political events --
    {
        id: 'compound_war_recession',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Military spending bill fails as Congress balks at deficit during recession; defense stocks crater. Barron blames "weak politicians who don\'t support the troops"',
        magnitude: 'major',
        minDay: 350,
        when: (sim, world) => world.geopolitical.mideastEscalation >= 2 && world.geopolitical.recessionDeclared,
        params: { mu: -0.04, theta: 0.025, lambda: 1.0 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 5); shiftFaction('federalistSupport', -3); shiftFaction('firmStanding', -3); },
    },
    {
        id: 'compound_pnth_scandal_trade_war',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Beijing state media runs week-long exposé on Bowman-PNTH corruption; frames U.S. tech sector as "fundamentally compromised." Allied nations reconsider Atlas contracts',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0 },
        magnitude: 'major',
        minDay: 400,
        when: (sim, world) => world.investigations.tanBowmanStory >= 2 && world.geopolitical.tradeWarStage >= 3,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            world.geopolitical.sericaRelations = Math.max(-3, world.geopolitical.sericaRelations - 1);
            shiftFaction('firmStanding', -3);
            shiftFaction('regulatoryExposure', 3);
        },
        portfolioFlavor: (portfolio) => {
            const longStock = portfolio.positions.filter(p => p.type === 'stock' && p.qty > 0).reduce((s, p) => s + p.qty, 0);
            if (longStock > 10) return 'Meridian\'s tech-heavy long book is feeling the geopolitical heat.';
            return null;
        },
    },
    {
        id: 'compound_fed_oil_stagflation',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Stagflation fears grip markets as oil hits $140 and Fed leadership vacuum deepens; no policy response in sight. "Who\'s steering the ship?" asks Okafor',
        params: { mu: -0.07, theta: 0.04, lambda: 2.0, sigmaR: 0.01, q: -0.003 },
        magnitude: 'major',
        when: (sim, world) => world.fed.hartleyFired && world.geopolitical.oilCrisis,
    },
    {
        id: 'compound_full_meltdown',
        category: 'compound',
        likelihood: 1.0,
        headline: '"Worst week since 2008": margin calls cascade as institutional investors flee; regulators hold emergency session. Circuit breakers triggered three days running. Sharma on MarketWire: "The Fed has lost the room — and the market knows it."',
        magnitude: 'major',
        minDay: 500,
        when: (sim, world) => world.fed.credibilityScore < 3 && world.geopolitical.recessionDeclared && sim.theta > 0.15,
        params: { mu: -0.06, theta: 0.04, lambda: 2.0, muJ: -0.04, xi: 0.1, q: -0.003 },
    },
    {
        id: 'compound_impeachment_war',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Constitutional crisis deepens as Barron faces impeachment trial while troops remain deployed in Meridia; markets price in maximum political uncertainty. The Continental: "Two fronts, zero precedent."',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, sigmaR: 0.008 },
        magnitude: 'major',
        minDay: 500,
        when: (sim, world) => world.investigations.impeachmentStage >= 1 && world.geopolitical.mideastEscalation >= 2,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
            shiftFaction('firmStanding', -3);
        },
    },
    {
        id: 'compound_pnth_hostile_bid_crisis',
        category: 'compound',
        likelihood: 1.0,
        headline: 'A Serica-linked sovereign tech fund launches a hostile bid for scandal-plagued PNTH at 40% premium. Dirks calls it "a hostile act dressed as an investment." The Meridian Brief: "Palanthropic for sale — at a discount no one wanted."',
        params: { mu: 0.08, theta: 0.04, lambda: 2.0 },
        magnitude: 'major',
        minDay: 500,
        when: (sim, world) => (world.pnth.dojSuitFiled || world.pnth.whistleblowerFiled) && sim.theta > 0.12 && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.acquired = true;
        },
    },
    {
        id: 'compound_war_crimes_pnth',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Leaked PNTH internal memo shows engineers flagged civilian targeting errors and were overruled by management; ICC opens preliminary investigation',
        params: { mu: -0.07, theta: 0.03, lambda: 1.5 },
        magnitude: 'major',
        minDay: 400,
        when: (sim, world) => world.geopolitical.mideastEscalation >= 2 && world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
        },
    },
    {
        id: 'compound_dollar_crisis_vane',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Dollar drops 8% against reserve currency basket; foreign central banks accelerate reserve diversification as Vane\'s rate cuts erode confidence',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, b: 0.01, sigmaR: 0.01, q: -0.002 },
        magnitude: 'major',
        minDay: 500,
        when: (sim, world) => world.fed.vaneAppointed && sim.b < 0.02,
    },
    {
        id: 'compound_recession_recovery',
        category: 'compound',
        likelihood: 1.5,
        headline: 'GDP rebounds sharply; recession officially over after two quarters of contraction. "V-shaped recovery" narrative takes hold, shorts scramble to cover',
        params: { mu: 0.04, theta: -0.015, lambda: -0.5, q: 0.003 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.recessionDeclared && sim.mu > 0.03,
        effects: (world) => {
            world.geopolitical.recessionDeclared = false;
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
            shiftFaction('firmStanding', 5);
        },
    },
    {
        id: 'compound_oil_crisis_resolves',
        category: 'compound',
        likelihood: 1.5,
        headline: 'OPEC+ reverses supply cuts; oil prices stabilize as geopolitical tensions ease. Consumer confidence rebounds on cheaper gas',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3, q: 0.001 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.oilCrisis && sim.theta < 0.10,
        effects: (world) => {
            world.geopolitical.oilCrisis = false;
        },
    },

    // -- Congressional legislation --
    // =====================================================================
    //  ARC 9: CONGRESSIONAL DYNAMICS
    //  Resignations, defections, special elections, leadership crises,
    //  debt ceiling, and dividend-affecting legislation.
    // =====================================================================

    // -- Senate resignations & special elections ----------------------------
    {
        id: 'fed_senator_resigns_scandal',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Federalist Sen. Hargrove resigns amid campaign finance indictment; Federalist governor appoints placeholder. Special election in 90 days',
        params: { mu: -0.01, theta: 0.008, lambda: 0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.senate.federalist >= 50,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
        },
        followups: [
            { id: 'special_election_senate_fed_holds', mtth: 45, weight: 0.4 },
            { id: 'special_election_senate_fl_flips', mtth: 45, weight: 0.6 },
        ],
    },
    {
        id: 'fl_senator_resigns_health',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Farmer-Labor Sen. Vasquez announces retirement citing health; Federalist-leaning state holds special election in deep-orange territory',
        params: { mu: 0.01, theta: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.senate.farmerLabor >= 46,
        followups: [
            { id: 'special_election_senate_fed_gains', mtth: 45, weight: 0.7 },
            { id: 'special_election_senate_fl_defends', mtth: 45, weight: 0.3 },
        ],
    },
    {
        id: 'special_election_senate_fed_holds',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Federalists hold Senate seat in special election; new senator pledges to continue Barron\'s agenda. Majority preserved',
        params: { mu: 0.01, theta: -0.003 },
        magnitude: 'minor',
    },
    {
        id: 'special_election_senate_fl_flips',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Farmer-Labor flips Senate seat in special election upset; margin now razor-thin. Barron\'s legislative agenda in jeopardy',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        effects: (world) => {
            world.congress.senate.federalist -= 1;
            world.congress.senate.farmerLabor += 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            shiftFaction('farmerLaborSupport', 3);
        },
        portfolioFlavor: (portfolio) => {
            const longStock = portfolio.positions.filter(p => p.type === 'stock' && p.qty > 0).reduce((s, p) => s + p.qty, 0);
            if (longStock > 10) return 'Your long equity book dips as the Federalist majority narrows and deregulation odds shrink.';
            return null;
        },
    },
    {
        id: 'special_election_senate_fed_gains',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Federalists pick up Senate seat in special election; expanded majority strengthens Barron\'s hand on confirmations',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'moderate',
        effects: (world) => {
            world.congress.senate.federalist += 1;
            world.congress.senate.farmerLabor -= 1;
            shiftFaction('federalistSupport', 3);
        },
    },
    {
        id: 'special_election_senate_fl_defends',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Farmer-Labor holds seat in hostile territory; surprise special election victory energizes opposition base',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
        },
    },

    // -- House vacancies & special elections --------------------------------
    {
        id: 'house_reps_resign_wave',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Three Federalist House members announce early departures; two join lobbying firms, one takes a corporate board seat. Governing majority thins',
        params: { mu: -0.01, theta: 0.005, lambda: 0.1 },
        magnitude: 'minor',
        when: (sim, world, congress) => congress.fedControlsHouse && world.congress.house.federalist >= 220,
        effects: (world) => {
            world.congress.house.federalist -= 3;
        },
        followups: [
            { id: 'house_special_elections_mixed', mtth: 50, weight: 0.7 },
        ],
    },
    {
        id: 'house_special_elections_mixed',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Special elections fill House vacancies: Federalists hold two of three seats, Farmer-Labor flips one in suburban district',
        params: { mu: 0.005 },
        magnitude: 'minor',
        effects: (world) => {
            // Fill 3 vacancies: Fed wins 2, FL wins 1
            world.congress.house.federalist += 2;
            world.congress.house.farmerLabor += 1;
        },
    },
    {
        id: 'fl_house_reps_resign_wave',
        category: 'congressional',
        likelihood: 0.3,
        headline: 'Two veteran Farmer-Labor House members retire mid-term in safe green districts; replacements expected to be more progressive',
        params: { mu: 0.005, theta: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.congress.house.farmerLabor >= 210,
        effects: (world) => {
            // Safe seats, replacements assumed same party
        },
    },

    // -- Party defections --------------------------------------------------
    {
        id: 'fed_rep_defects_to_fl',
        category: 'congressional',
        likelihood: 0.3,
        headline: 'Rep. Calloway switches from Federalist to Farmer-Labor on House floor: "I can no longer support a party that has abandoned its principles"',
        magnitude: 'moderate',
        when: (sim, world) => world.congress.house.federalist >= 216 && world.election.barronApproval < 45 - (world.election.lobbyMomentum || 0) * 2,
        params: { mu: -0.01, theta: 0.005, lambda: 0.1 },
        effects: [ { path: 'congress.house.federalist', op: 'add', value: -1 }, { path: 'congress.house.farmerLabor', op: 'add', value: 1 }, { path: 'election.barronApproval', op: 'add', value: -2 }, ],
        followups: [ { id: 'defection_fallout_fed', mtth: 12, weight: 0.4 }, ],
    },
    {
        id: 'defection_fallout_fed',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Calloway\'s defection triggers soul-searching in Federalist caucus; two more moderates reportedly "exploring options." Leadership scrambles to shore up ranks',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.congress.house.federalist >= 214,
        followups: [
            { id: 'second_defection', mtth: 30, weight: 0.3 },
        ],
    },
    {
        id: 'second_defection',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Second Federalist representative switches parties; House majority hangs by a thread. Barron: "Good riddance to a FINO traitor"',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        effects: (world) => {
            world.congress.house.federalist -= 1;
            world.congress.house.farmerLabor += 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
    },
    {
        id: 'fl_rep_defects_to_fed',
        category: 'congressional',
        likelihood: 0.2,
        headline: 'Conservative Farmer-Labor Rep. Hendricks switches to Federalist Party: "The radical left has taken over my party." Barron celebrates on social media',
        params: { mu: 0.015, theta: -0.005, lambda: -0.1 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.house.farmerLabor >= 210 && world.election.barronApproval > 45 - (world.election.lobbyMomentum || 0) * 2,
        effects: (world) => {
            world.congress.house.farmerLabor -= 1;
            world.congress.house.federalist += 1;
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 1);
        },
    },
    {
        id: 'fed_senator_defects',
        category: 'congressional',
        likelihood: 0.15,
        headline: 'BREAKING: Sen. Morrison announces switch from Federalist to Independent, will caucus with Farmer-Labor. "I swore an oath to the Constitution, not to a party"',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, sigmaR: 0.003 },
        magnitude: 'major',
        minDay: 300,
        when: (sim, world) => world.congress.senate.federalist >= 50 && world.election.barronApproval < 42 - (world.election.lobbyMomentum || 0) * 2,
        effects: (world) => {
            world.congress.senate.federalist -= 1;
            world.congress.senate.farmerLabor += 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
            shiftFaction('federalistSupport', -4);
            shiftFaction('farmerLaborSupport', 3);
        },
    },

    // -- Speaker / leadership crises ---------------------------------------
    {
        id: 'speaker_challenge',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Hard-right Federalist bloc files motion to vacate; Tao scrambles to save his speakership as Whittaker and six moderates demand concessions on the Big Beautiful Bill',
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.fedControlsHouse && world.congress.house.federalist <= 225,
        params: { mu: -0.015, theta: 0.005, lambda: 0.2 },
        followups: [ { id: 'speaker_survives', mtth: 5, weight: 0.6 }, { id: 'speaker_ousted', mtth: 5, weight: 0.4 }, ],
    },
    {
        id: 'speaker_survives',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Tao survives the motion to vacate 218-212; Whittaker votes to save him after extracting a floor vote on the Digital Markets Accountability Act. The Meridian Brief: "Tao lives to whip another day"',
        params: { mu: 0.01, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'speaker_ousted',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Tao ousted as Speaker in historic 221-214 vote; Reyes provides the margin. Chamber paralyzed — no candidate can secure 218. MarketWire: "All legislation dead until further notice"',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, sigmaR: 0.004 },
        magnitude: 'major',
        when: (sim, world, congress) => congress.fedControlsHouse,
        effects: () => { shiftFaction('federalistSupport', -3); },
        followups: [
            { id: 'new_speaker_elected', mtth: 12, weight: 0.7 },
            { id: 'speaker_chaos_continues', mtth: 12, weight: 0.3 },
        ],
    },
    {
        id: 'new_speaker_elected',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Whittaker elected Speaker on the fourth ballot as compromise candidate; Tao concedes gracefully. The Continental: "The most powerful moderate in Columbia." Markets relieved',
        params: { mu: 0.02, theta: -0.008, lambda: -0.3 },
        magnitude: 'moderate',
    },
    {
        id: 'speaker_chaos_continues',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Week two without a Speaker; 11 rounds, no winner. Tao and Whittaker each fall short. Lassiter from the Senate: "The House is an embarrassment." Funding deadline T-minus 9 days',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5, sigmaR: 0.005 },
        magnitude: 'moderate',
        followups: [
            { id: 'new_speaker_elected', mtth: 10, weight: 0.8 },
        ],
    },

    // -- Debt ceiling ------------------------------------------------------
    {
        id: 'debt_ceiling_standoff',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Treasury invokes extraordinary measures as debt ceiling deadline looms. Haines demands spending cuts; Whitfield vows to block any "hostage deal." Rating agencies put Columbia on negative watch',
        magnitude: 'major',
        minDay: 250,
        when: (sim, world, congress) => !congress.trifecta,
        params: { mu: -0.04, theta: 0.025, lambda: 1.2, sigmaR: 0.01, b: 0.008 },
        followups: [ { id: 'debt_ceiling_last_minute_deal', mtth: 18, weight: 0.5 }, { id: 'debt_ceiling_technical_default', mtth: 15, weight: 0.3 }, { id: 'debt_ceiling_clean_raise', mtth: 12, weight: 0.2 }, ],
    },
    {
        id: 'debt_ceiling_last_minute_deal',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Haines and Whitfield strike a debt ceiling deal at 2 AM: two-year suspension with discretionary caps. Tao brings it to a floor vote before the hard right can organize. Okafor: "Government by crisis"',
        params: { mu: 0.03, theta: -0.01, lambda: -0.5, sigmaR: -0.003 },
        magnitude: 'moderate',
    },
    {
        id: 'debt_ceiling_technical_default',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Columbia briefly misses a Treasury coupon payment — first technical default in history. S&P strips the AAA rating. Okafor: "Barron held the full faith and credit of this nation hostage." Dollar tumbles as global shockwave hits',
        params: { mu: -0.08, theta: 0.05, lambda: 3.0, muJ: -0.06, sigmaR: 0.02, b: 0.015, borrowSpread: 1.0, q: -0.003 },
        magnitude: 'major',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 10);
            shiftFaction('fedRelations', -5);
            shiftFaction('firmStanding', -5);
        },
        followups: [
            { id: 'debt_ceiling_last_minute_deal', mtth: 5, weight: 0.9 },
        ],
        portfolioFlavor: (portfolio) => {
            const bondQty = portfolio.positions.filter(p => p.type === 'bond').reduce((s, p) => s + p.qty, 0);
            if (bondQty > 5) return 'Your bond portfolio is in freefall as the U.S. loses its AAA rating. This is unprecedented.';
            if (bondQty < -5) return 'Your short bond position is exploding in value. The unthinkable just happened.';
            const totalVal = Math.abs(portfolio.cash) + portfolio.positions.reduce((s, p) => s + Math.abs(p.qty) * 100, 0);
            if (totalVal > 5000) return 'Meridian\'s risk systems are flashing red. Every desk on the Street is getting margin-called.';
            return null;
        },
    },
    {
        id: 'debt_ceiling_clean_raise',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Clean debt ceiling raise passes 68-32; Lassiter and Whitfield both vote yes. The Meridian Brief: "The most boring outcome on the Street. Thank God." Markets barely react',
        params: { mu: 0.01, theta: -0.005, sigmaR: -0.002 },
        magnitude: 'minor',
    },

    // -- Congressional investigations & ethics -----------------------------
    {
        id: 'congressional_insider_trading_scandal',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'DOJ charges four members of Congress with insider trading on PNTH defense contracts — two Federalists, one Farmer-Labor rep, and Sen. Hargrove (F-GA). Okafor: "I warned you all. I warned you"',
        params: { mu: -0.02, theta: 0.01, lambda: 0.4, borrowSpread: 0.1 },
        magnitude: 'moderate',
        minDay: 200,
        effects: (world) => {
            world.congress.house.federalist -= 2;
            world.congress.house.farmerLabor -= 1;
            world.congress.senate.federalist -= 1;
        },
        followups: [
            { id: 'stock_act_reform', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'stock_act_reform',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Okafor\'s STOCK Act reform passes unanimously: blind trusts mandatory for all members. Lassiter co-sponsors from across the aisle. The Continental: "Should have been done years ago"',
        params: { mu: 0.01, theta: -0.003 },
        magnitude: 'minor',
    },
    {
        id: 'congressional_censure_barron',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Reyes brings censure resolution to the floor; passes 220-215. Whittaker votes yes. Barron: "A badge of honor from do-nothing losers." Tao vows retribution against Whittaker\'s district',
        params: { mu: -0.015, theta: 0.008, lambda: 0.3 },
        magnitude: 'moderate',
        minDay: 350,
        when: (sim, world, congress) => !congress.fedControlsHouse && world.election.barronApproval < 45,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
    },

    // -- Filibuster & procedural -------------------------------------------
    {
        id: 'filibuster_nuclear_option',
        category: 'congressional',
        likelihood: 0.3,
        headline: 'Lassiter invokes the nuclear option: legislative filibuster eliminated by 52-48 vote. Whitfield: "You will regret this for a generation." Haines votes yes. MarketWire: "Everything passes at 51 now"',
        magnitude: 'major',
        minDay: 250,
        when: (sim, world, congress) => congress.fedControlsSenate && world.congress.senate.federalist >= 52,
        params: { mu: -0.025, theta: 0.02, lambda: 0.6, sigmaR: 0.005 },
        effects: (world) => { world.election.barronApproval = Math.min(100, world.election.barronApproval + 2); shiftFaction('federalistSupport', 3); shiftFaction('farmerLaborSupport', -2); },
    },
    {
        id: 'senate_rejects_barron_nominee',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Senate rejects Barron\'s Commerce Secretary nominee 47-53. Haines leads three Federalist defections, citing conflicts of interest. Lassiter: "Peggy just handed the opposition a talking point"',
        params: { mu: -0.01, theta: 0.005, lambda: 0.2 },
        magnitude: 'minor',
        when: (sim, world) => world.congress.senate.federalist <= 53,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
        },
    },
    {
        id: 'congress_overrides_veto',
        category: 'congressional',
        likelihood: 0.15,
        headline: 'Congress overrides Barron\'s veto of the Serican sanctions bill 78-22. Lassiter and Whitfield vote together for the first time all session. Barron: "An unconstitutional coup by RINOs and radicals"',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.superMajority || (!congress.fedControlsHouse && world.congress.senate.federalist <= 55),
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
    },

    // -- Dividend & tax legislation ----------------------------------------
    {
        id: 'dividend_tax_hike_bill',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Oduya introduces bill to raise qualified dividend tax from 20% to 39.6%; Reyes co-sponsors. Corporate treasurers signal immediate pivot to buybacks. Lassiter: "Class warfare, plain and simple"',
        params: { mu: -0.02, theta: 0.008, q: -0.005 },
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta && sim.q > 0.01,
        followups: [
            { id: 'dividend_tax_bill_stalls', mtth: 20, weight: 0.6 },
            { id: 'dividend_tax_bill_compromise', mtth: 30, weight: 0.4 },
        ],
    },
    {
        id: 'dividend_tax_bill_stalls',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Lassiter filibusters Oduya\'s dividend tax bill for nine hours; it dies in committee. Corporate treasurers resume normal payout plans. Oduya: "The Senate is where good ideas go to die"',
        params: { mu: 0.01, q: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'dividend_tax_bill_compromise',
        followupOnly: true,
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Haines brokers a compromise: qualified dividend rate rises to 25% from 20%. Oduya calls it "a start." Lassiter votes no but doesn\'t filibuster. The Meridian Brief: "Modest but meaningful"',
        params: { mu: -0.01, theta: 0.005, q: -0.003 },
        magnitude: 'moderate',
    },
    {
        id: 'ffa_floor_passes',
        category: 'congressional',
        headline: 'The Financial Freedom Act passes both chambers: corporate rate cut to 15%, repatriation holiday. Tao celebrates on the House floor. Reyes walks out. MarketWire: "Shareholder returns about to explode"',
        likelihood: (sim, world, congress) => {
            let w = congress.trifecta ? 3 : 0.3;
            w *= (1 + (world.election.lobbyMomentum || 0) * 0.15);
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: { mu: 0.03, theta: -0.005, b: 0.002, q: 0.004 },
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
            shiftFaction('federalistSupport', 4);
            shiftFaction('firmStanding', 2);
            advanceBill('deregulation_act', 'active');
        },
    },
    {
        id: 'ffa_floor_fails',
        category: 'congressional',
        headline: 'The Financial Freedom Act fails 48-52 as Haines and two other Federalist moderates defect. Lassiter storms out of the chamber. Barron: "We will primary every one of them." Tao vows to bring it back.',
        likelihood: (sim, world, congress) => {
            let w = congress.trifecta ? 0.5 : 3;
            w *= (1 - (world.election.lobbyMomentum || 0) * 0.15);
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('deregulation_act') === 'committee',
        params: { mu: -0.02, theta: 0.008 },
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            shiftFaction('farmerLaborSupport', 3);
            advanceBill('deregulation_act', 'failed');
        },
    },
    {
        id: 'capital_gains_tax_scare',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Okafor\'s Senate Finance Committee floats doubling capital gains tax to 40%. Lassiter calls it "dead on arrival." But wealthy investors front-run anyway — selling pressure intensifies across the board',
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta,
        params: { mu: -0.02, theta: 0.008, lambda: 0.3, q: -0.001 },
        effects: [ { path: 'election.barronApproval', op: 'add', value: -1 }, ],
    },

    // -- Serican Reciprocal Tariff Act lifecycle ------------------------------
    {
        id: 'tariff_act_introduced',
        category: 'congressional',
        likelihood: 2,
        headline: 'Lassiter introduces the Serican Reciprocal Tariff Act in the Senate. "If Serica taxes our goods, we tax theirs — dollar for dollar." Bipartisan support from both hawks. Reyes abstains. MarketWire: "This one has legs."',
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 1 && getPipelineStatus('trade_war_tariffs') === null,
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('trade_war_tariffs', 'introduced'); },
        followups: [
            { id: 'tariff_act_committee', mtth: 20, weight: 1 },
            { id: 'tariff_act_lassiter_pushes', mtth: 10, weight: 0.5 },
        ],
    },
    {
        id: 'tariff_act_lassiter_pushes',
        category: 'congressional',
        likelihood: 2,
        headline: 'Lassiter brings Serican factory workers to testify before the Foreign Relations Committee. "These are the jobs we lost." The footage dominates The Sentinel for three days. Cole: "His best performance yet."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'introduced',
        params: {},
        effects: (world) => { shiftFaction('federalistSupport', 1); },
    },
    {
        id: 'tariff_act_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Foreign Relations Committee advances the Serican Reciprocal Tariff Act 14-8 with bipartisan support. Haines votes yes. "This isn\'t about politics — it\'s about leverage," she tells MarketWire.',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'introduced',
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('trade_war_tariffs', 'committee'); },
        followups: [
            { id: 'tariff_act_passes', mtth: 25, weight: 0.7 },
            { id: 'tariff_act_fails', mtth: 25, weight: 0.3 },
        ],
    },
    {
        id: 'tariff_act_passes',
        category: 'congressional',
        headline: 'The Serican Reciprocal Tariff Act passes 68-32 with bipartisan support. Lassiter and Whitfield both vote yes. Barron signs it in the Rose Garden. Liang Wei recalls Columbia\'s ambassador within the hour.',
        likelihood: (sim, world) => {
            let w = world.geopolitical.tradeWarStage >= 2 ? 3 : 1;
            w *= (1 + (world.election.lobbyMomentum || 0) * 0.1);
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'committee',
        params: { mu: -0.02, theta: 0.01, lambda: 0.5 },
        effects: (world) => {
            shiftFaction('federalistSupport', 3);
            world.geopolitical.sericaRelations = Math.max(-3, world.geopolitical.sericaRelations - 1);
            advanceBill('trade_war_tariffs', 'active');
        },
    },
    {
        id: 'tariff_act_fails',
        category: 'congressional',
        headline: 'The Serican Reciprocal Tariff Act fails 45-55 as business-wing Federalists break ranks. Lassiter: "Corporate cowards." Barron threatens executive tariffs instead. Markets rally on the news.',
        likelihood: (sim, world) => {
            let w = world.geopolitical.tradeWarStage >= 2 ? 0.3 : 2;
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('trade_war_tariffs') === 'committee',
        params: { mu: 0.02, theta: -0.005 },
        effects: (world) => {
            shiftFaction('farmerLaborSupport', 2);
            advanceBill('trade_war_tariffs', 'failed');
        },
    },

    // -- Okafor-Whitfield Revenue Package lifecycle ---------------------------
    {
        id: 'transaction_tax_introduced',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Okafor and Whitfield introduce the Revenue Stabilization Act: a 0.1% tax on all securities transactions. "Wall Street should pay its fair share," Okafor says. Lassiter calls it "a declaration of war on capital markets."',
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta && getPipelineStatus('transaction_tax') === null,
        params: { mu: -0.015, theta: 0.005 },
        effects: () => { advanceBill('transaction_tax', 'introduced'); shiftFaction('farmerLaborSupport', 2); },
        followups: [
            { id: 'transaction_tax_committee', mtth: 25, weight: 1 },
            { id: 'transaction_tax_lobbying', mtth: 10, weight: 0.5 },
        ],
    },
    {
        id: 'transaction_tax_lobbying',
        category: 'congressional',
        likelihood: 2,
        headline: 'Wall Street lobbying blitz against the transaction tax: $40M in two weeks. Meridian Capital\'s government affairs team is working overtime. The Meridian Brief: "If this passes, every desk in the building feels it."',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'introduced',
        params: {},
    },
    {
        id: 'transaction_tax_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Finance Committee advances the transaction tax 12-10 on a party-line vote. Lassiter vows to filibuster. Whitfield: "Let him. We have the patience." MarketWire: "Markets pricing in a wider spread regime."',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'introduced',
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('transaction_tax', 'committee'); },
        followups: [
            { id: 'transaction_tax_passes', mtth: 30, weight: 0.5 },
            { id: 'transaction_tax_fails', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'transaction_tax_passes',
        category: 'congressional',
        headline: 'The Okafor-Whitfield Revenue Package passes 52-48. Every Farmer-Labor senator votes yes. Lassiter\'s filibuster attempt collapses after six hours. Barron vetoes — but Okafor has the override votes. Spreads widen immediately.',
        likelihood: (sim, world, congress) => {
            let w = !congress.fedControlsSenate ? 3 : 0.3;
            w *= (1 - (world.election.lobbyMomentum || 0) * 0.15);
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'committee',
        params: { mu: -0.02, theta: 0.01 },
        effects: (world) => {
            shiftFaction('farmerLaborSupport', 4);
            shiftFaction('firmStanding', -3);
            advanceBill('transaction_tax', 'active');
        },
    },
    {
        id: 'transaction_tax_fails',
        category: 'congressional',
        headline: 'The transaction tax fails 47-53 as three moderate Farmer-Labor senators defect, citing impact on pension funds. Okafor: "We will be back." Lassiter pops champagne on the Senate steps — The Continental photographs it.',
        likelihood: (sim, world, congress) => {
            let w = congress.fedControlsSenate ? 3 : 0.8;
            w *= (1 + (world.election.lobbyMomentum || 0) * 0.15);
            return Math.max(0.1, w);
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('transaction_tax') === 'committee',
        params: { mu: 0.015, theta: -0.003 },
        effects: (world) => {
            shiftFaction('firmStanding', 2);
            advanceBill('transaction_tax', 'failed');
        },
    },

    // -- Digital Markets Accountability Act lifecycle -------------------------
    {
        id: 'digital_markets_introduced',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Reyes introduces the Digital Markets Accountability Act targeting AI monopolies. "Palanthropic controls the government\'s eyes, ears, and now its weapons." Whittaker co-sponsors after extracting a small-business exemption.',
        magnitude: 'moderate',
        when: (sim, world) => (world.pnth.companionScandal >= 1 || world.pnth.aegisControversy >= 1 || world.pnth.dojSuitFiled) && getPipelineStatus('antitrust_scrutiny') === null,
        params: { mu: -0.015, theta: 0.008 },
        effects: () => { advanceBill('antitrust_scrutiny', 'introduced'); shiftFaction('regulatoryExposure', 3); },
        followups: [
            { id: 'digital_markets_committee', mtth: 25, weight: 1 },
            { id: 'digital_markets_tech_lobby', mtth: 12, weight: 0.5 },
        ],
    },
    {
        id: 'digital_markets_tech_lobby',
        category: 'congressional',
        likelihood: 2,
        headline: 'Malhotra flies to Washington for closed-door meetings with the Commerce Committee. "Atlas Sentinel protects 200 million Columbians. Regulate us out of existence and see what happens." Three senators privately back off.',
        magnitude: 'minor',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'introduced',
        params: { mu: 0.005 },
    },
    {
        id: 'digital_markets_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Commerce Committee advances the Digital Markets Accountability Act 13-9. Whittaker\'s small-business exemption survives. Reyes: "Now let\'s see if the full Senate has the guts."',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'introduced',
        params: { mu: -0.01, theta: 0.005 },
        effects: () => { advanceBill('antitrust_scrutiny', 'committee'); },
        followups: [
            { id: 'digital_markets_passes', mtth: 30, weight: 0.5 },
            { id: 'digital_markets_fails', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'digital_markets_passes',
        category: 'congressional',
        headline: 'The Digital Markets Accountability Act passes 54-46 with five Federalist defections. AI companies face mandatory safety audits and licensing. Malhotra: "Compliance costs will be material." Gottlieb calls it "long overdue."',
        likelihood: (sim, world) => {
            let w = world.pnth.dojSuitFiled ? 2.5 : 1;
            if (world.pnth.senateProbeLaunched) w *= 1.5;
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'committee',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        effects: (world) => {
            shiftFaction('regulatoryExposure', 5);
            shiftFaction('farmerLaborSupport', 3);
            advanceBill('antitrust_scrutiny', 'active');
        },
    },
    {
        id: 'digital_markets_fails',
        category: 'congressional',
        headline: 'The Digital Markets Accountability Act fails 44-56 as the tech lobby holds the line. Reyes: "Money won today." Whittaker votes no after Tao applies pressure. The Meridian Brief: "PNTH exhales."',
        likelihood: (sim, world, congress) => {
            let w = congress.trifecta ? 2.5 : 1;
            return w;
        },
        magnitude: 'major',
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'committee',
        params: { mu: 0.015, theta: -0.005 },
        effects: (world) => {
            shiftFaction('regulatoryExposure', -2);
            advanceBill('antitrust_scrutiny', 'failed');
        },
    },

    // -- Campaign Finance Reform Act lifecycle --------------------------------
    {
        id: 'campaign_finance_introduced',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Okafor introduces the Campaign Finance Reform Act as primary season opens. "If you want to buy a senator, you should at least have to put your name on the receipt." Lassiter calls it "a naked power grab disguised as reform."',
        magnitude: 'moderate',
        when: (sim, world) => world.election.primarySeason && getPipelineStatus('campaign_finance') === null,
        params: { theta: 0.003 },
        effects: () => { advanceBill('campaign_finance', 'introduced'); shiftFaction('farmerLaborSupport', 2); },
        followups: [
            { id: 'campaign_finance_committee', mtth: 20, weight: 1 },
        ],
    },
    {
        id: 'campaign_finance_committee',
        category: 'congressional',
        likelihood: 3,
        headline: 'Senate Rules Committee advances the Campaign Finance Reform Act along party lines. Lassiter: "They want to muzzle the people who actually create jobs." Okafor: "We want to unmask them."',
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('campaign_finance') === 'introduced',
        params: {},
        effects: () => { advanceBill('campaign_finance', 'committee'); },
        followups: [
            { id: 'campaign_finance_passes', mtth: 25, weight: 0.4 },
            { id: 'campaign_finance_fails', mtth: 25, weight: 0.6 },
        ],
    },
    {
        id: 'campaign_finance_passes',
        category: 'congressional',
        headline: 'The Campaign Finance Reform Act squeaks through 51-49. Haines is the deciding vote. PAC disclosure requirements take effect immediately. Okafor\'s committee signals it\'s watching "Wall Street money in politics."',
        likelihood: (sim, world, congress) => !congress.fedControlsSenate ? 2.5 : 0.5,
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('campaign_finance') === 'committee',
        params: { theta: 0.005 },
        effects: (world) => {
            shiftFaction('farmerLaborSupport', 3);
            shiftFaction('regulatoryExposure', 3);
            advanceBill('campaign_finance', 'active');
        },
    },
    {
        id: 'campaign_finance_fails',
        category: 'congressional',
        headline: 'The Campaign Finance Reform Act dies 46-54. Lassiter whips every Federalist into line. Okafor: "Dark money wins again." The Meridian Brief: "Business as usual — literally."',
        likelihood: (sim, world, congress) => congress.fedControlsSenate ? 2.5 : 0.5,
        magnitude: 'moderate',
        when: (sim, world) => getPipelineStatus('campaign_finance') === 'committee',
        params: {},
        effects: () => { advanceBill('campaign_finance', 'failed'); },
    },

    // -- Big Beautiful Bill lifecycle -----------------------------------------
    {
        id: 'big_bill_house_passes',
        category: 'congressional',
        headline: 'Tao whips the House vote. The American Competitive Enterprise Act passes 221-214, strictly party-line. Reyes: "This bill is a love letter to billionaires." It moves to the Senate.',
        likelihood: 3,
        params: { mu: 0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.bigBillStatus === 0,
        effects: (world) => { world.congress.bigBillStatus = 1; shiftFaction('federalistSupport', 2); },
        era: 'early',
    },
    {
        id: 'big_bill_senate_debate',
        category: 'congressional',
        headline: 'The Big Beautiful Bill reaches the Senate floor. Whitfield signals he will filibuster. Haines says she has "concerns about the deficit provisions." Lassiter tells MarketWire: "We have the votes."',
        likelihood: 3,
        params: { theta: 0.008 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.bigBillStatus === 1,
        effects: (world) => {
            world.congress.bigBillStatus = 2;
            world.congress.filibusterActive = true;
            activateRegulation('filibuster_uncertainty');
        },
    },

    // -- Filibuster events --
    // =====================================================================
    //  FILIBUSTER CHAIN
    //  Fires when world.congress.filibusterActive is true.
    // =====================================================================
    {
        id: 'filibuster_whitfield_opens',
        category: 'filibuster',
        headline: 'Sen. Whitfield takes the Senate floor at 9:14 PM with a stack of CBO scoring documents. "The Columbian people deserve to hear every number," he says. The galleries settle in.',
        likelihood: 3,
        params: { theta: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.filibusterActive && world.congress.bigBillStatus === 2,
    },
    {
        id: 'filibuster_whitfield_hour_nine',
        category: 'filibuster',
        headline: 'Hour nine. Whitfield is reading soybean import statistics from the Serican Reciprocal Tariff Act\'s appendix. Tao is asleep in the cloakroom. The overnight MarketWire desk sends: "Still going."',
        likelihood: 2,
        params: {},
        magnitude: 'minor',
        when: (sim, world) => world.congress.filibusterActive,
    },
    {
        id: 'filibuster_cloture_attempt',
        category: 'filibuster',
        headline: 'Tao forces a cloture vote. He needs 60. The count stops at 57 — Haines voted no. The filibuster continues. Barron: "Peggy Haines is a RINO and everyone knows it."',
        likelihood: 2,
        params: { theta: 0.008 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.filibusterActive,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
        },
    },
    {
        id: 'filibuster_whittaker_statement',
        category: 'filibuster',
        headline: 'Whittaker issues a statement from her Columbus district office: "I will vote my conscience." The Sentinel\'s Cole: "That\'s code for she\'s flipping." Lobby groups flood her phone lines.',
        likelihood: 2,
        params: {},
        magnitude: 'minor',
        when: (sim, world) => world.congress.filibusterActive,
    },
    {
        id: 'filibuster_reyes_viral',
        category: 'filibuster',
        headline: 'Reyes goes on The Sentinel to debate Cole about the filibuster. The clip — "You want to cut taxes for hedge funds and call it freedom?" — gets 30 million views overnight.',
        likelihood: 2,
        params: {},
        magnitude: 'minor',
        when: (sim, world) => world.congress.filibusterActive,
        effects: (world) => {
            world.media.sentinelRating = Math.min(10, world.media.sentinelRating + 1);
        },
    },
    {
        id: 'filibuster_ends_bill_passes',
        category: 'filibuster',
        headline: 'Whitfield yields the floor after 22 hours. Tao brings the bill back. This time Whittaker votes yes. 60-40. The Big Beautiful Bill goes to Barron\'s desk.',
        likelihood: (sim, world) => world.election.barronApproval > 50 && (world.election.lobbyMomentum || 0) > 0 ? 3 : 0.5,
        params: { mu: 0.03, theta: -0.01 },
        magnitude: 'major',
        when: (sim, world) => world.congress.filibusterActive && world.congress.bigBillStatus === 2,
        effects: (world) => {
            world.congress.filibusterActive = false;
            world.congress.bigBillStatus = 3;
            shiftFaction('federalistSupport', 4);
            deactivateRegulation('filibuster_uncertainty');
        },
    },
    {
        id: 'filibuster_ends_bill_dies',
        category: 'filibuster',
        headline: 'Cloture fails for the third time. Tao pulls the bill. The Big Beautiful Bill is dead. Barron calls it "a disgrace." Haines says she\'d "do it again." The Meridian Brief: "Buy the dip or sell the rip?"',
        likelihood: (sim, world) => world.election.barronApproval <= 50 || (world.election.lobbyMomentum || 0) < 0 ? 3 : 0.5,
        params: { mu: -0.03, theta: 0.015 },
        magnitude: 'major',
        when: (sim, world) => world.congress.filibusterActive && world.congress.bigBillStatus === 2,
        effects: (world) => {
            world.congress.filibusterActive = false;
            world.congress.bigBillStatus = 4;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
            shiftFaction('farmerLaborSupport', 3);
            deactivateRegulation('filibuster_uncertainty');
        },
    },

    // -- Midterm events --
    // Post-midterm followup events (referenced by ID from midterm handler)
    {
        id: 'midterm_barron_declares_mandate',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Barron declares "massive mandate" after Federalist gains; announces aggressive second-half agenda. "The people have spoken, and they want MORE"',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
            shiftFaction('federalistSupport', 5);
        },
    },
    {
        id: 'midterm_fl_speaker_elected',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Farmer-Labor elects new House Speaker; pledges immediate investigations into Barron administration. "Accountability starts now"',
        magnitude: 'moderate',
        params: { mu: -0.02, theta: 0.008, lambda: 0.3 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 2); shiftFaction('farmerLaborSupport', 5); },
    },
    {
        id: 'midterm_lame_duck_barron',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Barron retreats to Mar-a-Lago after historic losses; agenda effectively dead. Aides describe him as "furious and isolated." Markets rally on gridlock',
        magnitude: 'major',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3, sigmaR: -0.002 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 8); shiftFaction('farmerLaborSupport', 5); shiftFaction('federalistSupport', -5); },
    },
    {
        id: 'midterm_status_quo',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Midterms produce no major shift; Federalists and Farmer-Labor both claim moral victory. Sharma on MarketWire: "The most boring election in a generation — and that\'s bullish." Markets shrug',
        params: { mu: 0.01, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'midterm_fl_senate_majority',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Farmer-Labor takes Senate majority by one seat; committee chairmanships flip. Okafor gains full subpoena power over Intelligence Committee',
        magnitude: 'moderate',
        params: { mu: -0.015, theta: 0.008, lambda: 0.2 },
        effects: (world) => { world.election.barronApproval = Math.max(0, world.election.barronApproval - 3); shiftFaction('farmerLaborSupport', 5); shiftFaction('regulatoryExposure', 3); },
    },

    // -- One-shot compound events --
    {
        id: 'compound_deregulation_rush',
        category: 'political',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.fed.hartleyFired && congress.trifecta && getPipelineStatus('deregulation_act') === null,
        headline: 'The Financial Freedom Act meets a Federalist trifecta — Lassiter and Tao gut banking oversight in a 48-hour legislative blitz. MarketWire calls it "the most consequential deregulation since 1999."',
        magnitude: 'major',
        params: { theta: -0.02, lambda: 0.5 },
        effects: (world) => { world.election.barronApproval += 3; shiftFaction('federalistSupport', 4); shiftFaction('regulatoryExposure', -3); activateRegulation('deregulation_act'); },
    },
    {
        id: 'compound_okafor_connection',
        category: 'political',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            ctx.playerChoices.attended_political_dinner && world.election.okaforRunning,
        headline: 'Your attendance at the Okafor fundraiser pays an unexpected dividend. Sources close to the senator indicate her committee will "look favorably" on cooperative witnesses from Meridian Capital.',
        magnitude: 'moderate',
        params: { mu: 0.01 },
    },
    {
        id: 'compound_constitutional_crisis',
        category: 'political',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.investigations.impeachmentStage >= 2 && world.geopolitical.recessionDeclared,
        headline: 'Okafor\'s impeachment proceedings collide with recession. The Sentinel calls it a "partisan coup during an economic emergency." The Continental calls it "accountability." Bond markets call it a 300-basis-point risk premium.',
        magnitude: 'major',
        params: { mu: -0.06, theta: 0.03, lambda: 3.0, xi: 0.2, rho: -0.1 },
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 15);
            shiftFaction('firmStanding', -5);
            shiftFaction('fedRelations', -3);
        },
    },
    {
        id: 'compound_big_bill_death',
        category: 'political',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.congress.bigBillStatus === 4 &&
            world.election.barronApproval < 45,
        headline: 'The Big Beautiful Bill dies on the Senate floor after Whitfield\'s 14-hour filibuster. Haines crossed the aisle on the spending provisions. Barron calls it "a betrayal by cowards." His approval craters.',
        magnitude: 'major',
        params: { mu: -0.04, theta: 0.02 },
    },
    {
        id: 'compound_press_crisis',
        category: 'political',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.media.pressFreedomIndex <= 2 &&
            world.media.leakCount >= 4,
        headline: 'Barron revokes The Continental\'s press credentials after Driscoll\'s fifth consecutive leak story. Tan publishes from home. Cole celebrates on The Sentinel. Press freedom organizations issue emergency statements.',
        magnitude: 'moderate',
        params: { theta: 0.015, xi: 0.08 },
    },

    // -- Faction-gated political events --
    {
        id: 'political_lassiter_favor',
        category: 'political',
        likelihood: 1,
        headline: 'Lassiter\'s office asks you to host a quiet dinner with trade lobbyists.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.federalistSupport >= 65,
        effects: () => { shiftFaction('federalistSupport', 3); shiftFaction('regulatoryExposure', 3); },
    },
    {
        id: 'political_okafor_olive_branch',
        category: 'political',
        likelihood: 1,
        headline: 'Okafor sends a note: she appreciates your cooperation. The committee may go easier on derivatives traders.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.farmerLaborSupport >= 60 && world.investigations.okaforProbeStage >= 1,
        effects: () => { shiftFaction('regulatoryExposure', -3); shiftFaction('farmerLaborSupport', 2); },
    },
    {
        id: 'political_bipartisan_access',
        category: 'political',
        likelihood: 0.5,
        headline: 'Both parties want you at the table. The Big Beautiful Bill negotiations need a "market perspective."',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => ctx.factions.federalistSupport >= 50 && ctx.factions.farmerLaborSupport >= 50 && world.congress.bigBillStatus >= 1 && world.congress.bigBillStatus < 4,
        effects: () => { shiftFaction('federalistSupport', 2); shiftFaction('farmerLaborSupport', 2); shiftFaction('regulatoryExposure', 4); },
    },
];
