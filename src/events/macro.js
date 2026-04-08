/* macro.js -- Macroeconomic, trade war, geopolitical, and energy events. */

import { shiftFaction } from '../faction-standing.js';
import { activateRegulation } from '../regulations.js';

export const MACRO_EVENTS = [
    // =====================================================================
    //  ARC 3: TRADE WAR ESCALATION LADDER
    // =====================================================================
    {
        id: 'tariffs_announced',
        category: 'macro',
        likelihood: 0.5,
        headline: 'Barron signs executive order imposing 25% tariffs on $200B of imports; "Columbia will no longer be ripped off," he declares at signing ceremony',
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage === 0,
        params: { mu: -0.03, theta: 0.015, lambda: 0.6, muJ: -0.01 },
        effects: (world) => { world.geopolitical.tradeWarStage = 1; world.geopolitical.sericaRelations = Math.max(-3, world.geopolitical.sericaRelations - 1); world.election.barronApproval = Math.max(0, world.election.barronApproval - 2); shiftFaction('federalistSupport', -2); },
        followups: [ { id: 'trade_retaliation', mtth: 18, weight: 0.7 }, { id: 'tariff_selloff', mtth: 3, weight: 0.5 }, ],
    },
    {
        id: 'tariff_selloff',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Markets reel from tariff shock: industrials down 4%, transports down 6%, retailers scramble to quantify supply chain cost impact. Sharma on MarketWire: "Barron\'s tariff math is landing on Main Street."',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'trade_retaliation',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Liang Wei announces matching tariffs on Columbian agriculture and energy exports. Zhaowei unveils a "strategic decoupling plan." Lassiter on The Sentinel: "I warned you — pass the Serican Reciprocal Tariff Act now."',
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage === 1,
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, muJ: -0.01 },
        effects: [ { path: 'geopolitical.tradeWarStage', op: 'set', value: 2 }, { path: 'geopolitical.sericaRelations', op: 'add', value: -1 }, ],
        followups: [ { id: 'tariff_exemptions', mtth: 18, weight: 0.6 }, ],
    },
    {
        id: 'zhaowei_ban',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Barron bans Zhaowei from U.S. markets and imposes chip export controls: "They steal our technology and weaponize it." Full tech decoupling underway',
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.03, sigmaR: 0.005 },
        magnitude: 'major',
        minDay: 200,
        when: (sim, world) => world.geopolitical.tradeWarStage === 2,
        effects: (world) => {
            world.geopolitical.tradeWarStage = 3;
            world.geopolitical.sericaRelations = -3;
            shiftFaction('federalistSupport', -2);
        },
        followups: [
            { id: 'rare_earth_crisis', mtth: 25, weight: 0.7 },
        ],
    },
    {
        id: 'rare_earth_crisis',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Liang Wei restricts rare earth exports to Columbia in retaliation for the Zhaowei ban. Atlas Crucible warns of a six-month semiconductor supply shortage. Malhotra: "We are exploring alternative sourcing." Defense stocks crater',
        params: { mu: -0.08, theta: 0.04, lambda: 2.0, muJ: -0.05, sigmaR: 0.008, q: -0.002 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 3 && world.geopolitical.sericaRelations <= -2,
        portfolioFlavor: (portfolio) => {
            const putQty = portfolio.positions.filter(p => p.type === 'put').reduce((s, p) => s + p.qty, 0);
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (putQty < -3) return 'Your short put book is getting crushed as the rare earth embargo sends vol through the roof.';
            if (stockQty > 10) return 'Your long equity position is bleeding as the supply chain seizure ripples through every sector.';
            return null;
        },
    },
    {
        id: 'tariff_exemptions',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Barron quietly grants tariff exemptions to 40 product categories after a corporate lobbying blitz; partial de-escalation calms markets. Lassiter: "Barron blinks — but don\'t call it a retreat."',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 1 && world.geopolitical.tradeWarStage <= 3,
        effects: (world) => {
            world.geopolitical.sericaRelations = Math.min(3, world.geopolitical.sericaRelations + 1);
        },
    },
    {
        id: 'trade_deal_framework',
        category: 'macro',
        likelihood: (sim, world) => {
            let base = 0.5;
            if (world.election.barronApproval < 40) base += 0.4;
            if (sim.day > 750) base += 0.3;
            return base;
        },
        headline: 'Barron and Liang Wei announce a "Phase One" trade framework at the Meridia Summit. Tariffs to be rolled back over 18 months. Barron: "The biggest deal in history, maybe ever." Lassiter walks out of the briefing.',
        magnitude: 'major',
        minDay: 400,
        when: (sim, world) => world.geopolitical.tradeWarStage >= 2 && world.geopolitical.tradeWarStage < 4,
        params: { mu: 0.04, theta: -0.015, lambda: -0.6, muJ: 0.008, q: 0.002 },
        effects: (world) => { world.geopolitical.tradeWarStage = 4; world.geopolitical.sericaRelations = Math.min(3, world.geopolitical.sericaRelations + 2); world.election.barronApproval = Math.min(100, world.election.barronApproval + 3); shiftFaction('federalistSupport', 3); },
    },

    // =====================================================================
    //  ARC 4: OPERATION DUSTWALKER (FARSISTAN / MERIDIA)
    // =====================================================================
    {
        id: 'mideast_strikes',
        category: 'macro',
        likelihood: 0.6,
        headline: 'Operation Dustwalker begins: U.S. and Meridia launch precision strikes on Farsistani military targets using PNTH Atlas Aegis targeting. DoW: "Surgical, zero collateral." Navon: "We stand with our allies." Barron: "Mission accomplished."',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation === 0,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
            shiftFaction('fedRelations', -1);
        },
        followups: [
            { id: 'mideast_civilian_casualties', mtth: 15, weight: 0.7 },
            { id: 'mideast_oil_spike', mtth: 5, weight: 0.5 },
        ],
    },
    {
        id: 'mideast_civilian_casualties',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Leaked drone footage contradicts DoW "zero collateral" claims from Operation Dustwalker. 47 Farsistani civilians confirmed dead. Gottlieb: "This is a betrayal of everything Atlas was built for." Al-Farhan demands an emergency UN session.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation >= 1,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 4);
        },
        followups: [
            { id: 'mideast_ground_deployment', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'mideast_oil_spike',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Oil surges 12% as Operation Dustwalker threatens Strait of Hormuz shipping lanes. Al-Farhan warns: "Any further provocation and the Strait closes." Energy stocks rally but consumer discretionary tanks.',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, b: 0.005, sigmaR: 0.004 },
        magnitude: 'moderate',
        effects: (world) => { world.geopolitical.energyCrisis = true; },
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
            if (stockQty > 10) return 'Your long equity book is taking heat as energy costs crush margins across the board.';
            if (hasOptions) return 'Your options book is getting re-marked as implied vol spikes on the Farsistan oil shock.';
            return null;
        },
    },
    {
        id: 'mideast_ground_deployment',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Barron deploys 15,000 troops to Meridia for "stability operations" along the Farsistani border. Largest ground deployment in 20 years. Navon: "We welcome our allies." Okafor: "This is mission creep." Defense stocks surge, consumer confidence plummets.',
        params: { mu: -0.04, theta: 0.025, lambda: 1.2, muJ: -0.03, sigmaR: 0.005 },
        magnitude: 'major',
        minDay: 150,
        when: (sim, world) => world.geopolitical.mideastEscalation === 1,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 2;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 6);
            shiftFaction('fedRelations', -2);
            shiftFaction('farmerLaborSupport', 2);
        },
        followups: [
            { id: 'mideast_quagmire', mtth: 40, weight: 0.6 },
        ],
    },
    {
        id: 'mideast_quagmire',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Pentagon briefing leaked: 200+ Dustwalker casualties, $2B/month burn rate, no exit strategy. Farsistani militias control the border highlands. Okafor: "This is Vietnam with drones." Barron approval craters.',
        params: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.02 },
        magnitude: 'major',
        minDay: 300,
        when: (sim, world) => world.geopolitical.mideastEscalation === 2,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 3;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
            shiftFaction('farmerLaborSupport', 3);
            shiftFaction('mediaTrust', 2);
        },
        followups: [
            { id: 'mideast_ceasefire', mtth: 50, weight: 0.5 },
            { id: 'mideast_withdrawal', mtth: 40, weight: 0.4 },
        ],
    },
    {
        id: 'mideast_ceasefire',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Ceasefire brokered by Bowman and al-Farhan\'s envoy. Operation Dustwalker paused indefinitely. Barron takes credit despite opposition from his own DoW advisors. Navon: "A pause is not a peace." Markets rally on de-escalation hopes.',
        params: { mu: 0.04, theta: -0.02, lambda: -0.8, sigmaR: -0.003 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation >= 1,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 0;
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
        },
    },
    {
        id: 'mideast_withdrawal',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Under bipartisan pressure, Barron announces phased withdrawal from Meridia. Operation Dustwalker "concluded successfully." Polls show 68% support pulling out. Navon is visibly furious at the joint press conference.',
        params: { mu: 0.03, theta: -0.015, lambda: -0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation >= 2 && world.election.barronApproval < 35,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 0;
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        },
    },

    // =====================================================================
    //  ARC 8: SOUTHERN HEMISPHERE INITIATIVE (BOLIVIARA)
    // =====================================================================
    {
        id: 'south_america_covert_exposed',
        category: 'macro',
        likelihood: 0.5,
        headline: 'The Continental reveals the Southern Hemisphere Initiative: CIA and Palanthropic covert operations in Boliviara. Leaked memos show Atlas Sentinel used for surveillance of Madero\'s political opposition. Madero: "Columbia treats our nation as a laboratory."',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.southAmericaOps === 0,
        effects: (world) => {
            world.geopolitical.southAmericaOps = 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
        followups: [
            { id: 'south_america_advisors', mtth: 25, weight: 0.6 },
            { id: 'un_condemns_south_america', mtth: 15, weight: 0.5 },
        ],
    },
    {
        id: 'south_america_advisors',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Barron deploys 500 "military advisors" to Boliviara to "assist with counter-narcotics." DoW insists they are non-combat trainers. Madero expels the Columbian ambassador. Okafor: "This is the Southern Hemisphere Initiative with a new coat of paint."',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.southAmericaOps === 1,
        effects: (world) => {
            world.geopolitical.southAmericaOps = 2;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
        followups: [
            { id: 'south_america_collapse', mtth: 35, weight: 0.5 },
        ],
    },
    {
        id: 'south_america_collapse',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Madero\'s government collapses after a military coup. Transitional council installed under Columbian military protection. Protests erupt across Boliviara: "Yankee puppets out!" Lithium mines resume operations within 48 hours.',
        params: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.02 },
        magnitude: 'major',
        minDay: 250,
        when: (sim, world) => world.geopolitical.southAmericaOps === 2,
        effects: (world) => {
            world.geopolitical.southAmericaOps = 3;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 4);
        },
        followups: [
            { id: 'south_america_insurgency', mtth: 40, weight: 0.6 },
            { id: 'south_america_withdrawal', mtth: 50, weight: 0.4 },
        ],
    },
    {
        id: 'south_america_insurgency',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'Boliviaran insurgency intensifies. Columbian advisors come under fire in the lithium belt — three killed. Madero broadcasts from exile: "The resistance will prevail." Barron doubles down: "We will not be driven out by thugs."',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.southAmericaOps === 3,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
    },
    {
        id: 'south_america_withdrawal',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'White House announces withdrawal of all advisors from Boliviara. The Southern Hemisphere Initiative is quietly deemed "complete" despite no stated objectives being met. Madero supporters celebrate in the streets.',
        params: { mu: 0.02, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.southAmericaOps >= 2,
        effects: (world) => {
            world.geopolitical.southAmericaOps = 0;
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 1);
        },
    },
    {
        id: 'un_condemns_south_america',
        followupOnly: true,
        category: 'macro',
        likelihood: 1.0,
        headline: 'UN General Assembly passes non-binding resolution condemning Columbian operations in Boliviara, 124-8. Liang Wei co-sponsors the resolution. Barron calls it "meaningless theater from meaningless countries."',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.southAmericaOps >= 1,
    },

    // =====================================================================
    //  OTHER MACRO EVENTS
    // =====================================================================
    {
        id: 'oil_shock_opec',
        category: 'macro',
        likelihood: 0.35,
        headline: 'Al-Farhan brokers a surprise 2M barrel/day OPEC+ production cut. Oil surges 18% in a single session. Priya Sharma: "Farsistan just reminded everyone who controls the spigot." Energy costs ripple through supply chains.',
        magnitude: 'major',
        when: (sim, world) => !world.geopolitical.oilCrisis,
        params: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.02, b: 0.008, sigmaR: 0.006, q: -0.001 },
        effects: (world) => { world.geopolitical.oilCrisis = true; shiftFaction('fedRelations', -2); activateRegulation('oil_emergency'); },
    },
    {
        id: 'energy_sanctions',
        category: 'macro',
        likelihood: 0.3,
        headline: 'Barron imposes energy sanctions on Farsistan after al-Farhan refuses to reverse the production cut. "They will feel the full force of Columbian economic power." Crude jumps 8%. Navon publicly endorses the sanctions.',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, b: 0.005, sigmaR: 0.005, q: -0.001 },
        magnitude: 'moderate',
        when: (sim, world) => !world.geopolitical.sanctionsActive,
        effects: (world) => {
            world.geopolitical.sanctionsActive = true;
            shiftFaction('federalistSupport', 2);
            activateRegulation('sanctions_compliance');
        },
    },
    {
        id: 'cpi_surprise_high',
        category: 'macro',
        likelihood: 1.2,
        headline: 'CPI comes in hot at 5.4% annualized, well above 4.8% consensus; core inflation re-accelerates. Sharma on MarketWire: "Rate-cut hopes just died on the table." The Meridian Brief: "Reprice everything."',
        params: { mu: -0.02, theta: 0.01, b: 0.004, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.12,
        portfolioFlavor: (portfolio) => {
            const bondQty = portfolio.positions.filter(p => p.type === 'bond').reduce((s, p) => s + p.qty, 0);
            if (bondQty > 5) return 'Your long bond book is getting hammered as rate-cut expectations evaporate on the hot CPI print.';
            if (bondQty < -5) return 'Your short duration trade is paying off nicely as inflation re-accelerates.';
            return null;
        },
    },
    {
        id: 'cpi_surprise_low',
        category: 'macro',
        likelihood: 1.5,
        headline: 'CPI falls to 2.1% — lowest in three years. Sharma coins "immaculate disinflation" on MarketWire and the phrase trends within the hour. Bond rally accelerates.',
        params: { mu: 0.02, theta: -0.008, b: -0.003, sigmaR: -0.002 },
        magnitude: 'moderate',
        when: (sim) => sim.b > 0.01,
    },
    {
        id: 'jobs_report_strong',
        category: 'macro',
        likelihood: 2.0,
        headline: 'Nonfarm payrolls blow past estimates: +312K vs +180K expected. Unemployment ticks down to 3.5%. The Meridian Brief: "Goldilocks is back. Don\'t get comfortable."',
        params: { mu: 0.015, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'jobs_report_weak',
        category: 'macro',
        likelihood: 1.5,
        headline: 'Jobs disappoint: +82K vs +175K expected, prior month revised down 50K. Sharma on MarketWire: "The labor market just blinked." The Meridian Brief: "Recession whisperers are getting louder."',
        params: { mu: -0.015, theta: 0.008, lambda: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'recession_declared',
        category: 'macro',
        likelihood: 1.0,
        headline: 'NBER officially declares recession began two quarters ago; Barron blames "obstructionist Congress and a reckless Fed." Sharma on MarketWire: "The R-word is official. Markets already priced most of it — most."',
        magnitude: 'major',
        minDay: 200,
        when: (sim, world) => sim.mu < -0.05 && sim.theta > 0.12 && !world.geopolitical.recessionDeclared,
        params: { mu: -0.07, theta: 0.035, lambda: 1.8, muJ: -0.05, b: -0.012, q: -0.005 },
        effects: (world) => { world.geopolitical.recessionDeclared = true; world.election.barronApproval = Math.max(0, world.election.barronApproval - 8); shiftFaction('firmStanding', -5); activateRegulation('short_sale_ban'); },
    },
    {
        id: 'sovereign_debt_scare',
        category: 'macro',
        likelihood: 0.25,
        headline: 'Khasurian sovereign debt downgraded two notches as Volkov\'s military spending spirals. Contagion fears spike across Eastern European CDS markets. Flight to quality drives Columbian Treasury yields down.',
        params: { mu: -0.04, theta: 0.025, lambda: 1.5, muJ: -0.03, b: -0.005, sigmaR: 0.008, q: -0.002 },
        magnitude: 'major',
    },
    {
        id: 'gdp_surprise_beat',
        category: 'macro',
        likelihood: 1.5,
        headline: 'GDP grows 4.2% annualized, smashing 2.8% consensus; strongest quarter in three years. The Sentinel: "The Barron economy delivers again." Sharma: "Strong print. The question is whether it lasts."',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
    },
    {
        id: 'consumer_confidence_surge',
        category: 'macro',
        likelihood: 1.5,
        headline: 'Consumer confidence hits 20-year high as wages rise and gas prices fall; retail sector rallies. The Meridian Brief: "Consumer is bulletproof. For now."',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'manufacturing_renaissance',
        category: 'macro',
        likelihood: 1.0,
        headline: 'ISM Manufacturing surges to 58.4 on reshoring boom; new factory construction at highest level since 1990s. The Sentinel: "American reindustrialization is real." Sharma: "Tariff-driven reshoring. Costs are being passed to consumers."',
        params: { mu: 0.025, theta: -0.008, q: 0.001 },
        magnitude: 'moderate',
    },
    {
        id: 'tech_capex_boom',
        category: 'macro',
        likelihood: 1.2,
        headline: 'Corporate capex on AI infrastructure surges 45% YoY; Malhotra calls it "the biggest investment cycle since the internet." Atlas Crucible bookings are up accordingly. Semiconductor and cloud names rally broadly.',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
    },
    {
        id: 'productivity_miracle',
        category: 'macro',
        likelihood: 0.8,
        headline: 'BLS reports 3.8% productivity growth — highest since the dot-com era; economists credit AI-driven automation. Sharma on MarketWire: "This changes the inflation math entirely. Hartley has room to cut."',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2, b: -0.002 },
        magnitude: 'moderate',
    },
    {
        id: 'ceasefire_general',
        category: 'macro',
        likelihood: 0.8,
        headline: 'Diplomatic breakthrough: Bowman brokers a ceasefire at Camp David after weeks of secret back-channel talks with al-Farhan and Madero\'s envoys. Barron takes full credit in a primetime address. Priya Sharma: "The VP just saved the presidency."',
        params: { mu: 0.03, theta: -0.015, lambda: -0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation >= 1 || world.geopolitical.southAmericaOps >= 1,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        },
    },

    // =====================================================================
    //  ARC 9: KHASURIAN BORDER ESCALATION
    // =====================================================================
    {
        id: 'khasuria_border_probe',
        category: 'macro',
        headline: 'Khasurian reconnaissance drones cross the border accord line for the third time this month. Volkov\'s spokesman: "Equipment malfunction." The Meridian Brief: "Equipment doesn\'t malfunction this precisely."',
        likelihood: 2,
        params: { theta: 0.005, b: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.khasurianCrisis === 0,
        effects: (world) => { world.geopolitical.khasurianCrisis = 1; },
        era: 'early',
        followups: [
            { id: 'khasuria_troop_buildup', mtth: 60, weight: 1 },
        ],
    },
    {
        id: 'khasuria_troop_buildup',
        followupOnly: true,
        category: 'macro',
        headline: 'Satellite imagery shows Khasurian armored divisions massing 40km from the border. Volkov claims "defensive repositioning." Barron dispatches the Secretary of State. Bond markets price in risk.',
        likelihood: 0,
        params: { mu: -0.02, theta: 0.01, b: 0.008, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.khasurianCrisis === 1,
        effects: (world) => { world.geopolitical.khasurianCrisis = 2; },
        followups: [
            { id: 'khasuria_incursion', mtth: 45, weight: 0.67 },
            { id: 'khasuria_backs_down', mtth: 45, weight: 0.33 },
        ],
    },
    {
        id: 'khasuria_incursion',
        followupOnly: true,
        category: 'macro',
        headline: 'Khasurian forces cross the border in a "limited security operation." Three border towns occupied. The Khasurian Border Accord is officially dead. Barron faces his first real foreign policy crisis.',
        likelihood: 0,
        params: { mu: -0.04, theta: 0.03, lambda: 2.0, b: 0.015 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.khasurianCrisis === 2,
        effects: (world) => { world.geopolitical.khasurianCrisis = 3; world.geopolitical.aegisDemandSurge = true; shiftFaction('fedRelations', -2); },
        followups: [
            { id: 'pnth_international_expansion', mtth: 15, weight: 0.5 },
        ],
    },
    {
        id: 'khasuria_backs_down',
        followupOnly: true,
        category: 'macro',
        headline: 'Volkov recalls troops from the Khasurian border after Barron\'s back-channel threat of energy sanctions. "Exercises concluded successfully," his spokesman says. Markets exhale.',
        likelihood: 0,
        params: { mu: 0.02, theta: -0.01, b: -0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.khasurianCrisis === 2,
        effects: (world) => { world.geopolitical.khasurianCrisis = 1; },
    },

    // =====================================================================
    //  ARC 10: FARSISTAN / STRAIT OF FARSIS ESCALATION
    // =====================================================================
    {
        id: 'farsistan_tanker_inspections',
        category: 'macro',
        headline: 'Al-Farhan orders "security inspections" of all tankers transiting the Strait of Hormuz. Transit times double. Oil creeps up $8/barrel. Priya Sharma: "This is the warning shot."',
        likelihood: 2,
        params: { b: 0.008, mu: -0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.farsistanEscalation === 0,
        effects: (world) => { world.geopolitical.farsistanEscalation = 1; },
        era: 'mid',
        followups: [
            { id: 'farsistan_partial_closure', mtth: 50, weight: 1 },
        ],
    },
    {
        id: 'farsistan_partial_closure',
        followupOnly: true,
        category: 'macro',
        headline: 'Farsistan closes the Strait of Hormuz to non-allied shipping. Meridia-flagged tankers turned back. Oil surges past $120. Barron: "We will ensure free navigation." Navon: "We\'re ready."',
        likelihood: 0,
        params: { mu: -0.03, b: 0.015, theta: 0.015, sigmaR: 0.004 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.farsistanEscalation === 1,
        effects: (world) => { world.geopolitical.farsistanEscalation = 2; shiftFaction('fedRelations', -2); },
        followups: [
            { id: 'farsistan_full_closure', mtth: 40, weight: 1 },
            { id: 'farsistan_negotiation', mtth: 40, weight: 1 },
        ],
    },
    {
        id: 'farsistan_full_closure',
        followupOnly: true,
        category: 'macro',
        headline: 'Al-Farhan seals the Strait completely. "No ship passes without Farsistani consent." Oil gaps to $145. Emergency SPR release announced. The Sentinel runs a war countdown clock.',
        likelihood: 0,
        params: { mu: -0.06, b: 0.025, theta: 0.03, lambda: 2.0, sigmaR: 0.006 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.farsistanEscalation === 2,
        effects: (world) => {
            world.geopolitical.farsistanEscalation = 3;
            world.geopolitical.straitClosed = true;
            world.geopolitical.oilCrisis = true;
            world.geopolitical.energyCrisis = true;
            shiftFaction('fedRelations', -3);
            activateRegulation('oil_emergency');
        },
        followups: [
            { id: 'fed_50bps_emergency_cut', mtth: 5, weight: 0.8 },
        ],
    },
    {
        id: 'farsistan_negotiation',
        followupOnly: true,
        category: 'macro',
        headline: 'Back-channel talks between Bowman and al-Farhan\'s envoy produce a framework: Farsistan reopens the Strait in exchange for sanctions relief and a PNTH sovereign wealth fund stake. Markets rally cautiously.',
        likelihood: 0,
        params: { mu: 0.03, b: -0.01, theta: -0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.farsistanEscalation === 2,
        effects: (world) => { world.geopolitical.farsistanEscalation = 1; },
    },

    // =====================================================================
    //  SERICA TRADE EVENTS
    // =====================================================================
    {
        id: 'serica_retaliatory_tariffs',
        category: 'macro',
        headline: 'Liang Wei announces 25% tariffs on Columbian agricultural exports. Iowa soybean futures limit down. Lassiter goes on The Sentinel: "This proves we need to hit them harder." Oduya calls for auto worker protections.',
        likelihood: 2,
        params: { mu: -0.02, theta: 0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 1 && world.geopolitical.sericaRelations < 0,
    },
    {
        id: 'zhaowei_chip_ban',
        category: 'macro',
        headline: 'Serica bans Zhaowei from exporting semiconductors to Columbia. The Zhaowei Semiconductor Accord is dead. Atlas Crucible faces a hardware supply crisis. Malhotra: "We have six months of inventory."',
        likelihood: 2,
        params: { mu: -0.03, theta: 0.02, lambda: 1.0 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 3,
        effects: (world) => { world.geopolitical.sericaRelations = Math.max(-3, world.geopolitical.sericaRelations - 1); },
        era: 'mid',
    },

    // =====================================================================
    //  BOLIVIARA EVENTS
    // =====================================================================
    {
        id: 'boliviara_nationalization',
        category: 'macro',
        headline: 'Madero nationalizes Boliviara\'s lithium reserves on live television. "These minerals belong to the Boliviaran people, not to Columbian corporations." Three mining stocks halt. Rare earth futures spike.',
        likelihood: 2,
        params: { mu: -0.02, theta: 0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.southAmericaOps >= 1,
        era: 'mid',
        followups: [
            { id: 'boliviara_sentinel_leak', mtth: 60, weight: 1 },
        ],
    },
    {
        id: 'boliviara_sentinel_leak',
        followupOnly: true,
        category: 'macro',
        headline: 'Rachel Tan publishes Atlas Sentinel deployment logs from the Southern Hemisphere Initiative. "Palanthropic\'s AI Helped the CIA Target Boliviaran Dissidents." Madero holds a press conference demanding extradition.',
        likelihood: 0,
        params: { mu: -0.03, theta: 0.02, lambda: 1.5 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.southAmericaOps >= 2 && world.pnth.sentinelLaunched,
        effects: (world) => {
            world.media.tanCredibility = Math.min(10, world.media.tanCredibility + 1);
            shiftFaction('mediaTrust', 2);
        },
    },

    // ── One-shot compound events (macro domain) ──
    {
        id: 'compound_stagflation',
        category: 'macro',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.tradeWarStage >= 3 && world.geopolitical.recessionDeclared,
        headline: 'Lassiter\'s tariffs meet recession head-on. Premier Liang Wei retaliates with semiconductor export controls. Priya Sharma\'s MarketWire column: "Stagflation is no longer a textbook exercise."',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.08, theta: 0.04, lambda: 2.0, xi: 0.15 },
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 10);
            world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 2);
            shiftFaction('firmStanding', -5);
            shiftFaction('federalistSupport', -3);
        },
    },
    {
        id: 'compound_energy_war',
        category: 'macro',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.oilCrisis && world.geopolitical.mideastEscalation >= 3,
        headline: 'Al-Farhan closes the Strait of Hormuz as Meridia border tensions peak. Oil gaps above $140. Barron tweets: "The Emir will learn what Columbia does when you cut our energy supply." Bond vigilantes are already moving.',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.06, theta: 0.03, lambda: 2.5, b: 0.02, sigmaR: 0.005 },
    },
    {
        id: 'compound_strait_war_footing',
        category: 'macro',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.straitClosed &&
            world.geopolitical.farsistanEscalation >= 3,
        headline: 'Al-Farhan seals the Strait of Hormuz completely. Navon puts Meridia on war footing. Barron authorizes naval escort operations. Oil hits $160. The Sentinel runs a countdown clock: "Days Since the Strait Closed."',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.08, b: 0.03, sigmaR: 0.008, theta: 0.04, lambda: 3.0 },
    },
    {
        id: 'compound_khasuria_invasion',
        category: 'macro',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.khasurianCrisis >= 3 &&
            world.pnth.aegisDeployed,
        headline: 'Volkov sends armored columns across the Khasurian border at dawn. Barron holds an emergency NSC meeting. Hartley — or his replacement — signals emergency rate action. Atlas Aegis redeployment from Farsistan to Eastern Europe is on the table.',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.06, theta: 0.04, lambda: 3.0, b: 0.02, sigmaR: 0.006 },
    },
];
