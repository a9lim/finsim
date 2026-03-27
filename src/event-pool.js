/* ===================================================
   event-pool.js -- Offline event pool for Shoals.
   Category arrays, pool merge, and event-by-id lookup.
   =================================================== */

import { shiftFaction } from './faction-standing.js';
import { hasTrait } from './traits.js';
import { activateRegulation, deactivateRegulation, advanceBill, getPipelineStatus } from './regulations.js';

// -- Canonical parameter clamping ranges --------------------------------
export const PARAM_RANGES = {
    mu:     { min: -0.50, max: 0.80 },
    theta:  { min: 0.005, max: 1.00 },
    kappa:  { min: 0.05,  max: 10.0 },
    xi:     { min: 0.05,  max: 1.50 },
    rho:    { min: -0.99, max: 0.50 },
    lambda: { min: 0.0,   max: 15.0 },
    muJ:    { min: -0.25, max: 0.15 },
    sigmaJ: { min: 0.005, max: 0.25 },
    a:      { min: 0.01,  max: 2.0 },
    b:      { min: -0.05, max: 0.20 },
    sigmaR:       { min: 0.001, max: 0.050 },
    borrowSpread: { min: 0.0,   max: 5.0 },
    q:            { min: 0.0,   max: 0.10 },
};

// -- Placeholder arrays (populated in Tasks 5-8) -------------------------
const FED_EVENTS = [
    // -- Holds (high likelihood, minor) --------------------------------------
    {
        id: 'fed_hold_dovish',
        category: 'fed',
        likelihood: 5,
        headline: 'FOMC holds rates steady; Hartley says policy is "well-positioned" and cites improving labor data. Sharma\'s MarketWire column: "A hold that says nothing says everything."',
        params: { mu: 0.01, theta: -0.003 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 20) return 'Your long equity book catches a bid on the dovish hold.';
            return null;
        },
    },
    {
        id: 'fed_hold_unanimous',
        category: 'fed',
        likelihood: 5,
        headline: 'Fed leaves rates unchanged in unanimous decision; statement language virtually identical to prior meeting. The Meridian Brief: "Copy-paste from last month. The Fed is on autopilot."',
        params: {},
        magnitude: 'minor',
    },
    {
        id: 'fed_hold_hawkish',
        category: 'fed',
        likelihood: 4,
        headline: 'Fed stands pat but Hartley warns of "balanced risks tilted to the upside"; bond yields tick higher. Sharma on MarketWire: "She\'s telling you a hike is coming without saying it."',
        params: { mu: -0.01, theta: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
    },

    // -- Hike cycle chain ----------------------------------------------------
    {
        id: 'fed_signals_hike',
        category: 'fed',
        likelihood: 0.8,
        headline: 'Hartley signals tightening bias: "The committee is prepared to act if inflation proves persistent." Sharma\'s MarketWire analysis: "She used the word \'prepared.\' That\'s Fed-speak for \'imminent.\'"',
        magnitude: 'moderate',
        when: (sim, world) => sim.b < 0.15 && !world.fed.hartleyFired && !world.fed.hikeCycle,
        params: { mu: -0.015, theta: 0.005, sigmaR: 0.001 },
        effects: (world) => { world.fed.hikeCycle = true; world.fed.cutCycle = false; shiftFaction('fedRelations', -1); },
        followups: [{ id: 'fed_25bps_hike', mtth: 32, weight: 0.7 }],
    },
    {
        id: 'fed_25bps_hike',
        followupOnly: true,
        category: 'fed',
        likelihood: 1.0,
        headline: 'FOMC raises rates 25bps in 8-1 vote; Hartley cites strong employment and sticky core inflation. Sharma identifies the lone dissenter within minutes. Her MarketWire dispatch: "The hawk has landed."',
        params: { mu: -0.02, theta: 0.008, b: 0.0075, sigmaR: 0.001, lambda: 0.2 },
        magnitude: 'moderate',
        when: (sim, world) => sim.b < 0.15 && !world.fed.hartleyFired,
        followups: [
            { id: 'fed_second_hike', mtth: 32, weight: 0.5 },
            { id: 'fed_housing_pause', mtth: 45, weight: 0.3 },
        ],
        portfolioFlavor: (portfolio) => {
            const bondQty = portfolio.positions.filter(p => p.type === 'bond').reduce((s, p) => s + p.qty, 0);
            if (bondQty > 5) return 'Your long bond book is taking a hit as yields reprice higher.';
            if (bondQty < -5) return 'Your short bond position is printing. Duration paid off.';
            return null;
        },
    },
    {
        id: 'fed_second_hike',
        followupOnly: true,
        category: 'fed',
        likelihood: 0.8,
        headline: 'Fed hikes another 25bps in back-to-back meetings; Barron erupts on social media: "Hartley is KILLING the economy!" The Sentinel runs a primetime segment: "Is the Fed Waging War on Workers?" Sharma: "The Fed is doing its job. Barron is doing his."',
        params: { mu: -0.02, theta: 0.008, b: 0.0075, sigmaR: 0.001, lambda: 0.2 },
        magnitude: 'moderate',
        when: (sim, world) => sim.b < 0.15 && !world.fed.hartleyFired,
        effects: (world) => {
            world.fed.credibilityScore = Math.min(10, world.fed.credibilityScore + 1);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            shiftFaction('fedRelations', -2);
        },
    },
    {
        id: 'fed_housing_pause',
        followupOnly: true,
        category: 'fed',
        likelihood: 1.0,
        headline: 'Mortgage applications plunge 30% as rates bite; Fed signals pause to "assess cumulative tightening." The Meridian Brief: "Housing broke first. The rest follows."',
        params: { mu: 0.01, theta: -0.005, sigmaR: -0.001 },
        magnitude: 'minor',
        effects: (world) => { world.fed.hikeCycle = false; },
    },

    // -- Cut cycle chain -----------------------------------------------------
    {
        id: 'fed_signals_cut',
        category: 'fed',
        likelihood: 0.8,
        headline: 'Hartley pivots dovish: "Downside risks have increased materially"; markets price 80% chance of cut at next meeting. Sharma on MarketWire: "The doves are circling. A cut is coming."',
        params: { mu: 0.02, theta: -0.005, sigmaR: 0.002 },
        magnitude: 'moderate',
        when: (sim, world) => sim.b > -0.03 && !world.fed.hartleyFired && !world.fed.cutCycle,
        effects: (world) => { world.fed.cutCycle = true; world.fed.hikeCycle = false; shiftFaction('fedRelations', 1); },
        followups: [
            { id: 'fed_50bps_emergency_cut', mtth: 20, weight: 0.5 },
        ],
    },
    {
        id: 'fed_50bps_emergency_cut',
        followupOnly: true,
        category: 'fed',
        likelihood: 0.6,
        headline: 'Fed slashes rates 50bps in emergency inter-meeting action; Hartley: "Extraordinary circumstances demand decisive response." Sharma breaks the news 90 seconds before the official release. MarketWire crashes from traffic.',
        magnitude: 'major',
        when: (sim, world) => sim.b > -0.03,
        params: { mu: 0.03, theta: 0.02, b: -0.015, sigmaR: 0.006, lambda: 1.5 },
        effects: () => { shiftFaction('fedRelations', 2); },
    },

    // -- QE restart ----------------------------------------------------------
    {
        id: 'fed_qe_restart',
        category: 'fed',
        likelihood: 0.3,
        headline: 'Fed announces open-ended QE: $120B/month in Treasury and MBS purchases; "whatever it takes" language deployed. Sharma\'s MarketWire column: "Hartley just fired every bullet she has left." The Sentinel: "Money printer go brrr."',
        magnitude: 'major',
        minDay: 300,
        when: (sim, world) => !world.fed.qeActive && sim.b < 0.02,
        params: { mu: 0.05, theta: -0.015, b: -0.01, sigmaR: -0.003, lambda: -0.5, q: 0.002 },
        effects: (world) => { world.fed.qeActive = true; shiftFaction('fedRelations', 2); activateRegulation('qe_floor'); },
    },

    // -- Minutes leaks -------------------------------------------------------
    {
        id: 'fed_minutes_hawkish',
        category: 'fed',
        likelihood: 1.2,
        headline: 'FOMC minutes show a 7-5 split on the pace of tightening. Sharma identifies the dissenters within hours. Her MarketWire analysis: "Three hawks wanted 50. The terminal rate just moved."',
        params: { mu: -0.01, theta: 0.004, b: 0.002 },
        magnitude: 'minor',
        when: (sim, world) => sim.b < 0.12,
    },
    {
        id: 'fed_minutes_dovish',
        category: 'fed',
        likelihood: 1.2,
        headline: 'FOMC minutes show broad agreement that risks have shifted; "a majority saw the case for easing in coming meetings." Sharma on MarketWire: "The doves have the numbers. December is live."',
        params: { mu: 0.01, theta: -0.003, b: -0.002 },
        magnitude: 'minor',
        when: (sim, world) => sim.b > 0.0,
    },

    // -- Barron-Hartley feud -------------------------------------------------
    {
        id: 'barron_pressures_hartley',
        category: 'fed',
        likelihood: 1.5,
        headline: 'Barron renews attacks on Fed Chair: "Hartley has NO idea what she\'s doing. Rates should be ZERO. She should be fired!" The Sentinel amplifies it all evening. Sharma on MarketWire: "Every time he tweets about the Fed, credibility takes a hit."',
        params: { mu: -0.005, theta: 0.004, sigmaR: 0.002 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
        effects: (world) => {
            world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 2);
            shiftFaction('fedRelations', -1);
        },
    },
    {
        id: 'hartley_pushes_back',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Hartley in rare public statement: "The Federal Reserve will not be swayed by political pressure. Our mandate is clear." Three former Fed governors publish a joint letter in The Continental backing her independence. The Sentinel dismisses it as "elitism."',
        params: { mu: 0.005, theta: -0.003, sigmaR: -0.001 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired && world.fed.credibilityScore < 8,
        effects: (world) => {
            world.fed.credibilityScore = Math.min(10, world.fed.credibilityScore + 1);
        },
    },
    {
        id: 'barron_threatens_fire_hartley',
        category: 'fed',
        likelihood: 0.5,
        headline: 'Barron tells The Sentinel: "I have the power to fire Hartley and I\'m seriously considering it." DOJ reviewing legal authority. Sharma on MarketWire: "He\'s not bluffing this time."',
        magnitude: 'moderate',
        minDay: 200,
        when: (sim, world) => world.election.barronApproval > 40 && !world.fed.hartleyFired,
        params: { mu: -0.02, theta: 0.015, sigmaR: 0.006, lambda: 0.8 },
        effects: (world) => { world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 3); shiftFaction('fedRelations', -2); },
        followups: [{ id: 'barron_fires_hartley', mtth: 30, weight: 0.2 }],
    },
    {
        id: 'barron_fires_hartley',
        followupOnly: true,
        category: 'fed',
        likelihood: 0.15,
        headline: 'BREAKING: Barron fires Fed Chair Hartley via executive order; constitutional crisis erupts as markets plunge. Sharma breaks the story on MarketWire at 6:47 AM. The Continental runs a one-word front page: "Unprecedented."',
        magnitude: 'major',
        minDay: 400,
        when: (sim, world, congress) => congress.trifecta && world.fed.credibilityScore <= 4 && !world.fed.hartleyFired,
        params: { mu: -0.05, theta: 0.05, sigmaR: 0.025, lambda: 3.5 },
        effects: (world) => { world.fed.hartleyFired = true; world.fed.credibilityScore = 0; world.election.barronApproval = Math.max(0, world.election.barronApproval - 10); shiftFaction('fedRelations', -10); activateRegulation('rate_ceiling'); },
        followups: [ { id: 'markets_panic_hartley_fired', mtth: 3, weight: 0.95 }, { id: 'vane_nominated', mtth: 10, weight: 0.8 }, { id: 'scotus_hartley_case', mtth: 40, weight: 0.5 }, ],
    },
    {
        id: 'markets_panic_hartley_fired',
        followupOnly: true,
        category: 'fed',
        likelihood: 1.0,
        headline: 'Global sell-off accelerates: S&P futures limit-down overnight; Treasury yields spike 40bps as foreign central banks scramble. The Meridian Brief: "This is the worst morning since 2008. Buckle up."',
        params: { mu: -0.06, theta: 0.04, lambda: 2.0, muJ: -0.05, sigmaR: 0.01 },
        magnitude: 'major',
        portfolioFlavor: (portfolio) => {
            const totalQty = portfolio.positions.reduce((s, p) => s + Math.abs(p.qty), 0);
            if (totalQty > 10) return 'Your book is getting crushed in the sell-off. Risk management is calling.';
            return null;
        },
    },
    {
        id: 'vane_nominated',
        followupOnly: true,
        category: 'fed',
        likelihood: 1.0,
        headline: 'Barron nominates Governor Marcus Vane as new Fed Chair; Vane pledges to "restore growth-oriented monetary policy." Sharma on MarketWire: "A yes-man for the Oval Office. God help the dollar."',
        params: { mu: 0.01, theta: 0.01, sigmaR: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.fed.hartleyFired,
        effects: () => { shiftFaction('fedRelations', -5); },
        followups: [
            { id: 'vane_confirmed', mtth: 30, weight: 0.6 },
            { id: 'vane_rejected', mtth: 30, weight: 0.4 },
        ],
    },
    {
        id: 'vane_confirmed',
        followupOnly: true,
        category: 'fed',
        likelihood: 1.0,
        headline: 'Senate confirms Vane 51-49 along party lines; new Chair immediately signals aggressive rate cuts ahead. Sharma: "Vane\'s first press conference was a campaign rally for rate cuts. The Fed just became a political instrument."',
        params: { mu: 0.03, theta: 0.02, b: -0.02, sigmaR: 0.01, lambda: 0.5 },
        magnitude: 'major',
        when: (sim, world, congress) => congress.fedControlsSenate && world.fed.hartleyFired && !world.fed.vaneAppointed,
        effects: (world) => {
            world.fed.vaneAppointed = true;
            world.fed.cutCycle = true;
            world.fed.hikeCycle = false;
            shiftFaction('fedRelations', -5);
            deactivateRegulation('rate_ceiling');
        },
    },
    {
        id: 'vane_rejected',
        followupOnly: true,
        category: 'fed',
        likelihood: 1.0,
        headline: 'Senate rejects Vane nomination 48-52; two Federalist moderates break ranks. Fed left leaderless, acting Chair appointed. The Meridian Brief: "No Chair, no credibility, no policy. This is uncharted territory."',
        params: { mu: -0.02, theta: 0.015, sigmaR: 0.008, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.fedControlsSenate && world.fed.hartleyFired && !world.fed.vaneAppointed,
    },
    {
        id: 'scotus_hartley_case',
        followupOnly: true,
        category: 'fed',
        likelihood: 1.0,
        headline: 'Supreme Court agrees to hear Hartley v. United States on expedited basis; oral arguments set for next month. The Continental\'s legal desk: "This could redefine executive power over independent agencies for a generation."',
        params: { mu: 0.01, theta: 0.01, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim, world) => world.fed.hartleyFired,
    },

    // -- Vane dissent (flavor) -----------------------------------------------
    {
        id: 'vane_dissents',
        category: 'fed',
        likelihood: 1.5,
        headline: 'Governor Vane dissents for the fifth consecutive meeting, calling rates "excessively restrictive"; Barron tweets support. Sharma on MarketWire: "Vane is auditioning for Chair in real time. Hartley pretends not to notice."',
        params: { mu: -0.003, theta: 0.002, sigmaR: 0.001 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired && !world.fed.vaneAppointed,
    },

    // -- Reverse repo spike --------------------------------------------------
    {
        id: 'reverse_repo_spike',
        category: 'fed',
        likelihood: 0.8,
        headline: 'Reverse repo facility usage surges past $2.5T; money market funds park cash at Fed as T-bill supply tightens. The Meridian Brief: "When $2.5T is sitting at the Fed earning risk-free, something is broken in the plumbing."',
        params: { b: 0.002, sigmaR: 0.002, theta: 0.003 },
        magnitude: 'minor',
    },
];
const MACRO_EVENTS = [
    // =====================================================================
    //  ARC 3: TRADE WAR ESCALATION LADDER
    // =====================================================================
    {
        id: 'tariffs_announced',
        category: 'macro',
        likelihood: 0.5,
        headline: 'Barron signs executive order imposing 25% tariffs on $200B of imports; "America will no longer be ripped off," he declares at signing ceremony',
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
        headline: 'Liang Wei restricts rare earth exports to Columbia in retaliation for the Zhaowei ban. Atlas Foundry warns of a six-month semiconductor supply shortage. Malhotra: "We are exploring alternative sourcing." Defense stocks crater',
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
        headline: 'Oil surges 12% as Operation Dustwalker threatens Strait of Farsis shipping lanes. Al-Farhan warns: "Any further provocation and the Strait closes." Energy stocks rally but consumer discretionary tanks.',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, b: 0.005, sigmaR: 0.004 },
        magnitude: 'moderate',
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
        headline: 'Corporate capex on AI infrastructure surges 45% YoY; Malhotra calls it "the biggest investment cycle since the internet." Atlas Foundry bookings are up accordingly. Semiconductor and cloud names rally broadly.',
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
            { id: 'khasuria_incursion', mtth: 45, weight: 2 },
            { id: 'khasuria_backs_down', mtth: 45, weight: 1 },
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
        effects: (world) => { world.geopolitical.khasurianCrisis = 3; shiftFaction('fedRelations', -2); },
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
        headline: 'Al-Farhan orders "security inspections" of all tankers transiting the Strait of Farsis. Transit times double. Oil creeps up $8/barrel. Priya Sharma: "This is the warning shot."',
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
        headline: 'Farsistan closes the Strait of Farsis to non-allied shipping. Meridia-flagged tankers turned back. Oil surges past $120. Barron: "We will ensure free navigation." Navon: "We\'re ready."',
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
            shiftFaction('fedRelations', -3);
            activateRegulation('oil_emergency');
        },
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
        headline: 'Serica bans Zhaowei from exporting semiconductors to Columbia. The Zhaowei Semiconductor Accord is dead. Atlas Foundry faces a hardware supply crisis. Malhotra: "We have six months of inventory."',
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
];
const PNTH_EVENTS = [
    // =====================================================================
    //  ARC 1: THE GOTTLIEB-DIRKS WAR
    // =====================================================================

    // -- Inciting incident chain -------------------------------------------
    {
        id: 'gottlieb_ethics_keynote',
        category: 'pnth',
        likelihood: 0.6,
        headline: 'Gottlieb delivers blistering keynote at the Atlas Sentinel developer conference: "We built Sentinel to heal, not to kill. Aegis was never part of the plan." Dirks watches from the front row, stone-faced. Zhen texts Malhotra: "This is going to be expensive."',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks >= 6,
        params: { mu: -0.01, theta: 0.005, lambda: 0.2 },
        effects: [ { path: 'pnth.boardGottlieb', op: 'add', value: 1 }, ],
        followups: [{ id: 'dirks_cnbc_rebuttal', mtth: 8, weight: 0.9 }],
    },
    {
        id: 'dirks_cnbc_rebuttal',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks fires back in a MarketWire exclusive: "Eugene is a brilliant engineer but a naive businessman. Atlas Aegis is our fastest-growing segment and the Pentagon needs it yesterday." Malhotra quietly starts a $2B buyback the same afternoon.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        params: { mu: 0.005, theta: 0.012, lambda: 0.3 },
        effects: [ { path: 'pnth.boardDirks', op: 'add', value: 1 }, ],
        followups: [ { id: 'board_closed_session', mtth: 20, weight: 0.7 }, { id: 'kassis_caught_middle', mtth: 15, weight: 0.5 }, ],
    },
    {
        id: 'board_closed_session',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board convenes emergency closed session on the Atlas Aegis question. The Continental: "the room was nuclear." Zhen leaves early. Kassis is not invited.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        params: { mu: -0.005, theta: 0.008, lambda: 0.3 },
        followups: [ { id: 'board_compromise', mtth: 8, weight: 0.6 }, { id: 'dirks_blocked', mtth: 15, weight: 0.3 }, ],
    },

    // -- Board closed session branches ------------------------------------
    {
        id: 'gottlieb_stripped_oversight',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board votes 8-2 to strip Gottlieb of product oversight. Aegis and Foundry report directly to Dirks now. CEO title retained but authority gutted. Gottlieb "considering all options." Zhen voted with Dirks.',
        params: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'major',
        minDay: 200,
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks >= 8,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            shiftFaction('firmStanding', -2);
        },
        followups: [
            { id: 'gottlieb_resigns', mtth: 25, weight: 0.6 },
            { id: 'gottlieb_digs_in', mtth: 20, weight: 0.4 },
        ],
    },
    {
        id: 'dirks_blocked',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'In surprise upset, PNTH board blocks Dirks\' Atlas Aegis expansion plan 6-4. Zhen abstains. Gottlieb allies hold firm. Dirks is visibly furious leaving the boardroom. Malhotra cancels the buyback tranche.',
        params: { mu: 0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks <= 6,
        followups: [
            { id: 'dirks_proxy_fight', mtth: 30, weight: 0.6 },
            { id: 'dirks_resigns', mtth: 40, weight: 0.15 },
        ],
    },
    {
        id: 'board_compromise',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board reaches fragile compromise: Atlas Aegis contracts continue but with a new ethics review process chaired by Kassis. Dirks and Gottlieb both claim victory. Zhen brokers the deal.',
        params: { mu: 0.01, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },

    // -- Kassis branch ----------------------------------------------------
    {
        id: 'kassis_caught_middle',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis publishes an internal memo arguing Atlas Aegis targeting decisions violate PNTH\'s founding charter. Dirks forwards it to the board with a one-line response: "Noted." Zhen asks for a meeting.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira && world.pnth.ceoIsGottlieb,
        params: { mu: 0.005, theta: 0.01 },
        followups: [ { id: 'kassis_sides_dirks', mtth: 15, weight: 0.5 }, { id: 'kassis_sides_gottlieb', mtth: 25, weight: 0.3 }, ],
    },
    {
        id: 'kassis_sides_gottlieb',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis publicly backs Gottlieb in a board letter signed by 200+ Atlas Sentinel engineers: "We built Sentinel for medicine, climate, and discovery. Aegis is a betrayal of that mission." Malhotra warns the letter is a material disclosure risk.',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
        },
    },
    {
        id: 'kassis_sides_dirks',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis reverses course after a private meeting with Dirks. The Continental reports she was shown a classified Pentagon briefing on Zhaowei\'s military AI. Kassis agrees to lead Atlas Aegis safety review. Gottlieb: "Mira, what did they show you?"',
        params: { mu: 0.01, theta: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'kassis_quits',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: CTO Mira Kassis resigns effective immediately. LinkedIn post: "I built Atlas Sentinel to solve problems. I cannot stay at a company that turned it into Atlas Aegis." She takes the Companion team leads with her.',
        params: { mu: -0.04, theta: 0.02, lambda: 0.6, muJ: -0.02 },
        magnitude: 'major',
        minDay: 200,
        when: (sim, world) => world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.ctoIsMira = false;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            shiftFaction('firmStanding', -2);
        },
    },

    // -- Gottlieb resignation chain ---------------------------------------
    {
        id: 'gottlieb_resigns',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: CEO Eugene Gottlieb resigns. In an emotional letter to employees: "I built Palanthropic to make the world better. Atlas Sentinel was the proof. But Aegis, Foundry, Companion -- they turned my company into something I don\'t recognize." Zhen does not issue a statement.',
        magnitude: 'major',
        minDay: 250,
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        params: { mu: -0.03, theta: 0.02, lambda: 1.0, muJ: -0.02 },
        effects: (world) => { world.pnth.ceoIsGottlieb = false; world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1); world.pnth.boardDirks = Math.min(12, world.pnth.boardDirks + 1); shiftFaction('firmStanding', -3); },
        followups: [ { id: 'successor_search', mtth: 20, weight: 0.8 }, { id: 'gottlieb_covenant_ai', mtth: 60, weight: 0.4 }, ],
    },
    {
        id: 'gottlieb_digs_in',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb hires activist defense attorney, signals he will fight removal: "They\'ll have to drag me out. I still own 12% of this company." Dirks fast-tracks an Atlas Aegis expansion while Gottlieb is distracted.',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        followups: [
            { id: 'gottlieb_lawsuit', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'gottlieb_lawsuit',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb files suit against PNTH board alleging breach of fiduciary duty over the Atlas Aegis expansion. Seeks injunction restoring his product oversight. Discovery could expose Bowman\'s role in the original Pentagon contract.',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },
    {
        id: 'successor_search',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH retains Spencer Stuart for CEO search. Dirks named interim CEO, immediately consolidates Atlas Aegis and Foundry under her direct control. MarketWire: "foxes guarding the henhouse." Malhotra stays on as CFO.',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.ceoIsGottlieb,
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 15) return 'Your long position needs a credible CEO pick. Dirks as interim is not what the market wanted.';
            if (stockQty < -10) return 'Your short thesis just got another catalyst. An interim CEO search means months of uncertainty.';
            return null;
        },
    },
    {
        id: 'gottlieb_covenant_ai',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb announces Covenant AI, a "safety-first" rival to Palanthropic. Backed by $2B from Sequoia and a16z. Immediately poaches 40 Atlas Sentinel engineers and the entire Companion product team. Kassis joins as CTO.',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        magnitude: 'major',
        minDay: 350,
        when: (sim, world) => !world.pnth.ceoIsGottlieb,
        effects: (world) => {
            world.pnth.gottliebStartedRival = true;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            shiftFaction('firmStanding', -2);
        },
    },

    // -- Dirks proxy fight / board dynamics --------------------------------
    {
        id: 'dirks_proxy_fight',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0.6,
        headline: 'Dirks launches proxy fight to replace two Gottlieb-aligned board members. Malhotra\'s investor presentation highlights Atlas Aegis revenue growth. Zhen pledges his shares to Dirks. Institutional holders controlling 35% are undecided.',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks < 9,
        followups: [
            { id: 'dirks_proxy_wins', mtth: 25, weight: 0.5 },
            { id: 'dirks_proxy_loses', mtth: 25, weight: 0.5 },
        ],
        portfolioFlavor: (portfolio) => {
            const totalQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (totalQty > 20) return 'As a large institutional holder, Meridian will get a proxy solicitation. Your vote could matter.';
            if (totalQty < -10) return 'Your short position loves proxy fights -- months of uncertainty and governance headlines.';
            return null;
        },
    },
    {
        id: 'dirks_proxy_wins',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks prevails in proxy vote. Two new defense-friendly directors seated -- one is a former Pentagon procurement chief. Zhen calls the result "a mandate for Atlas Aegis." Gottlieb allies down to two seats.',
        params: { mu: 0.02, theta: 0.008, lambda: 0.2 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.boardDirks = Math.min(10, world.pnth.boardDirks + 2);
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 2);
        },
    },
    {
        id: 'dirks_proxy_loses',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks proxy fight fails. ISS recommends against her nominees, citing Atlas Aegis governance risks. Institutional investors side with Gottlieb. Zhen is silent for a week.',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
        },
    },
    {
        id: 'dirks_resigns',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Chairwoman Dirks steps down citing "irreconcilable differences" with management. Atlas Aegis division reports to the interim committee. VP Bowman\'s office releases a terse one-line statement. Zhen calls it "a tragedy."',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.boardDirks <= 4,
        effects: (world) => {
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 2);
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 2);
        },
    },

    // -- Activist investor ------------------------------------------------
    {
        id: 'activist_hedge_fund_stake',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'Crescent Capital discloses 8.1% stake in PNTH via 13D filing. Their letter to shareholders: "The Dirks-Gottlieb war has destroyed $20B in value. Atlas Sentinel is world-class. The governance is not." Threatens to nominate four independent directors.',
        magnitude: 'moderate',
        minDay: 300,
        when: (sim, world) => !world.pnth.activistStakeRevealed && !world.pnth.acquired,
        params: { mu: 0.02, theta: 0.015, lambda: 0.5 },
        effects: [ { path: 'pnth.activistStakeRevealed', op: 'set', value: true }, ],
        followups: [ { id: 'activist_board_seats', mtth: 35, weight: 0.6 }, { id: 'activist_buyback_demand', mtth: 20, weight: 0.4 }, ],
    },
    {
        id: 'activist_board_seats',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Crescent Capital wins two board seats in consent solicitation. New directors demand a strategic review of all four Atlas product lines and a potential sale of the Aegis division. Dirks pushes back.',
        params: { mu: 0.02, theta: 0.015 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.activistStakeRevealed,
        effects: (world) => {
            // Activist directors are independent — take from Dirks faction
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1);
        },
    },
    {
        id: 'activist_buyback_demand',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Crescent Capital publishes open letter demanding a $5B buyback and cost cuts. "Sentinel, Aegis, Companion, Foundry -- four products, zero coherent strategy." Malhotra privately agrees with half the letter.',
        params: { mu: 0.03, theta: -0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.activistStakeRevealed,
    },

    // -- Hostile takeover -------------------------------------------------
    {
        id: 'hostile_takeover_bid',
        category: 'pnth',
        likelihood: 0.1,
        headline: 'BREAKING: Northvane Technologies launches $68B hostile bid for PNTH at 45% premium. "Atlas Sentinel alone is worth the price. Aegis, Companion, Foundry are free options." Dirks and Gottlieb, for once, both oppose the bid.',
        magnitude: 'major',
        minDay: 500,
        when: (sim, world) => (world.pnth.boardDirks <= 5 || (world.pnth.dojSuitFiled && world.pnth.whistleblowerFiled)) && !world.pnth.acquired,
        params: { mu: 0.04, theta: 0.03, lambda: 1.5 },
        effects: [ { path: 'pnth.acquired', op: 'set', value: true }, ],
    },

    // -- Both ousted (rare, requires multiple scandal flags) ---------------
    {
        id: 'both_ousted',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board fires both Dirks and Gottlieb in extraordinary session. Zhen brokers the deal, becomes acting Chair. "A fresh start." Atlas Aegis paused pending review. Sentinel and Foundry continue. The Sentinel runs a four-part series: "The Fall of Palanthropic."',
        params: { mu: -0.04, theta: 0.035, lambda: 1.5, muJ: -0.03 },
        magnitude: 'major',
        minDay: 600,
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.whistleblowerFiled && world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched,
        effects: (world) => {
            world.pnth.ceoIsGottlieb = false;
            world.pnth.boardDirks = 3;
            world.pnth.boardGottlieb = 2;
        },
    },

    // =====================================================================
    //  ARC 2: BOWMAN / CORRUPTION
    // =====================================================================
    {
        id: 'bowman_lobbying_report',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'The Continental reports VP Bowman held $4M in PNTH stock while lobbying the Pentagon for the original Atlas Aegis contract. Dirks was at the same dinner. White House calls it "old news." Malhotra reviews the disclosure filings.',
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.senateProbeLaunched,
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        followups: [ { id: 'senate_investigation_opened', mtth: 35, weight: 0.4 }, { id: 'bowman_intervenes', mtth: 15, weight: 0.5 }, ],
    },
    {
        id: 'aclu_lawsuit_surveillance',
        category: 'pnth',
        likelihood: 0.6,
        headline: 'ACLU files landmark suit alleging Atlas Aegis was used for mass surveillance of civilians in the Farsistan theater. Seeks injunction blocking all Department of War contracts. Kassis is listed as a potential witness.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.militaryContractActive,
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 10) return 'Your long PNTH position is under pressure. An injunction would freeze the defense revenue stream.';
            if (stockQty < -5) return 'Your short thesis is playing out. Surveillance lawsuits are kryptonite for government AI contractors.';
            return null;
        },
    },
    {
        id: 'senate_investigation_opened',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Sen. Okafor opens formal Senate Intelligence Committee investigation into PNTH-Bowman ties. Subpoenas issued for Atlas Aegis contract records and Dirks\' Pentagon meeting logs. Malhotra hires outside counsel.',
        magnitude: 'major',
        minDay: 150,
        when: (sim, world) => !world.pnth.senateProbeLaunched,
        params: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        effects: (world) => { world.pnth.senateProbeLaunched = true; world.investigations.okaforProbeStage = 1; shiftFaction('regulatoryExposure', 5); shiftFaction('farmerLaborSupport', 2); },
        followups: [{ id: 'congressional_hearing_pnth', mtth: 25, weight: 0.7 }],
    },
    {
        id: 'doj_antitrust_suit',
        category: 'pnth',
        likelihood: 0.4,
        headline: 'DOJ files antitrust suit against PNTH alleging monopolistic control of government AI procurement through Atlas Aegis and Foundry. "No single company should own both the weapons and the infrastructure," says the AG. Stock drops sharply.',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        magnitude: 'major',
        minDay: 300,
        when: (sim, world) => !world.pnth.dojSuitFiled && world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.dojSuitFiled = true;
            shiftFaction('regulatoryExposure', 8);
        },
        portfolioFlavor: (portfolio) => {
            const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
            if (hasOptions) return 'Your PNTH options just repriced violently. Antitrust litigation means elevated vol for months.';
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 10) return 'Your long equity position is bleeding on the DOJ headline. Antitrust suits take years.';
            return null;
        },
    },
    {
        id: 'bowman_intervenes',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'VP Bowman calls Atlas Aegis "vital to national security" and pressures DOD to fast-track contract renewals. Dirks sends a thank-you note that The Continental publishes in full. Stock rallies on the government support signal.',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.senateProbeLaunched,
    },
    {
        id: 'congressional_hearing_pnth',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks and Gottlieb testify before Senate Intelligence Committee. Okafor grills Dirks on the Bowman dinner and the Atlas Aegis contract timeline. Gottlieb: "I warned the board repeatedly about Aegis. They chose revenue over ethics." Zhen declines to appear.',
        params: { mu: -0.03, theta: 0.02, lambda: 0.6 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.senateProbeLaunched,
        followups: [
            { id: 'ethics_board_revolt', mtth: 15, weight: 0.5 },
            { id: 'whistleblower_complaint', mtth: 30, weight: 0.4 },
        ],
    },
    {
        id: 'ethics_board_revolt',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Three of five PNTH ethics advisory board members resign in protest. Joint statement: "We recommended against Atlas Aegis deployment. We recommended Companion privacy safeguards. We were systematically ignored." Dirks dissolves the board entirely.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ethicsBoardIntact,
        effects: (world) => {
            world.pnth.ethicsBoardIntact = false;
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
        },
    },
    {
        id: 'whistleblower_complaint',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: Senior PNTH engineer files SEC whistleblower complaint alleging Dirks ordered falsified safety testing on Atlas Aegis targeting modules before the Pentagon deployment. Kassis\'s internal safety memo is attached as Exhibit A.',
        magnitude: 'major',
        minDay: 250,
        when: (sim, world) => !world.pnth.whistleblowerFiled,
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.03 },
        effects: (world) => { world.pnth.whistleblowerFiled = true; world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1); world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1); shiftFaction('regulatoryExposure', 5); shiftFaction('firmStanding', -5); },
    },

    // =====================================================================
    //  ROUTINE PNTH (~14 events)
    // =====================================================================
    {
        id: 'defense_contract_won',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks announces Atlas Aegis at a closed Pentagon briefing. $3.2B Department of War contract for battlefield integration -- largest defense AI award in history. Gottlieb learns about it from MarketWire. Malhotra\'s stock buyback begins the same afternoon.',
        magnitude: 'major',
        when: (sim, world) => !world.pnth.militaryContractActive && !world.pnth.acquired,
        params: { mu: 0.04, theta: -0.005, lambda: -0.2 },
        effects: (world) => { world.pnth.militaryContractActive = true; world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1); shiftFaction('firmStanding', 3); },
    },
    {
        id: 'defense_contract_cancelled',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'Pentagon cancels the Atlas Aegis contract citing "unresolved governance concerns." $3.2B evaporates overnight. Dirks scrambles to save the deal. Gottlieb releases a statement: "I take no pleasure in this." Zhen calls the Pentagon directly.',
        magnitude: 'major',
        when: (sim, world) => world.pnth.militaryContractActive,
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, muJ: -0.02 },
        effects: (world) => { world.pnth.militaryContractActive = false; shiftFaction('firmStanding', -2); },
    },
    {
        id: 'dhs_contract_renewal',
        category: 'pnth',
        likelihood: 1.8,
        headline: 'DHS quietly renews the Atlas Sentinel border surveillance contract for another 3 years. $800M deal. MarketWire buries it below the fold. Dirks wanted to rebrand it as Aegis. Malhotra talked her out of it.',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'atlas_product_launch',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'Gottlieb unveils Atlas Sentinel for Healthcare: diagnostic imaging, drug discovery, clinical trials. "This is what Palanthropic was built for." Kassis demos the system live. Dirks skips the launch event.',
        params: { mu: 0.04, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
            shiftFaction('firmStanding', 2);
        },
    },
    {
        id: 'cloud_partnership',
        category: 'pnth',
        likelihood: 1.5,
        headline: 'PNTH announces strategic cloud partnership: Atlas Foundry infrastructure to power a major hyperscaler\'s AI offering. Malhotra on the earnings call: "Foundry is becoming the picks-and-shovels play." Analysts raise price targets.',
        params: { mu: 0.03, theta: -0.008 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'analyst_upgrade',
        category: 'pnth',
        likelihood: 2.0,
        headline: 'Goldman initiates PNTH at Overweight with $240 price target. "Atlas Sentinel is the enterprise moat, Aegis is the defense moat, Foundry is the infrastructure moat. Three moats for the price of one." Malhotra sends the note to the full board.',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'analyst_downgrade',
        category: 'pnth',
        likelihood: 1.5,
        headline: 'Morgan Stanley downgrades PNTH to Equal Weight. "The Dirks-Gottlieb war makes risk/reward unfavorable. Atlas Sentinel is best-in-class, but who is running the company?" Malhotra takes the call personally.',
        params: { mu: -0.02, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'hires_cto_kassis',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'Mira Kassis returns to PNTH as CTO after a five-month absence. Negotiated expanded authority over Atlas Sentinel and Companion product safety. "I came back because someone has to watch the store." Atlas Sentinel engineers cheer. Aegis team is wary.',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.ctoIsMira && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.ctoIsMira = true;
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_annual_meeting',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'PNTH annual shareholder meeting draws record attendance. Heated Q&A on Atlas Aegis deployment rules, the Dirks-Gottlieb split, and the Bowman relationship. Malhotra presents Foundry growth numbers to change the subject. It half-works.',
        params: { mu: -0.005, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'patent_suit_rival',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'DeepStar Labs sues PNTH for patent infringement, alleging Atlas Sentinel\'s core transformer architecture was derived from stolen research. Seeks injunction and $1.5B in damages. Kassis named personally in the complaint.',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_hyperscaler_deal',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'PNTH signs multi-year Atlas Foundry inference partnership with a top-3 cloud provider. Guaranteed $1.8B minimum commitment. Malhotra: "Foundry is the commercial pivot Sentinel never was." Gottlieb calls it "renting out the family silver."',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && !world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_talent_exodus',
        category: 'pnth',
        likelihood: (sim, world) => {
            let base = 0.3;
            if (!world.pnth.ctoIsMira) base += 0.2;
            if (world.pnth.gottliebStartedRival) base += 0.3;
            return base;
        },
        headline: 'PNTH loses 15% of senior research staff in a single quarter. Atlas Sentinel team leads departing to Covenant AI and Big Tech. "The brain drain is real -- the Aegis controversy is kryptonite for recruiting," says a headhunter. Kassis\'s old team is hit hardest.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.4 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'pnth_stock_buyback',
        category: 'pnth',
        likelihood: 1.5,
        headline: 'PNTH board authorizes $3B accelerated share buyback. Dirks: "The market dramatically undervalues Atlas Aegis and Foundry." Malhotra structures the buyback to maximize EPS impact before the next earnings call.',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2, q: -0.001 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.boardDirks >= 6,
    },
    {
        id: 'pnth_data_center_fire',
        category: 'pnth',
        likelihood: 0.2,
        headline: 'Fire at PNTH\'s primary Ashburn data center takes Atlas Foundry and Companion offline for 18 hours. Sentinel enterprise clients scramble. Insurance covers the damage but customer trust is shaken. Kassis orders a full infrastructure audit.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.6, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },

    // -- Positive growth / commercial events ----------------------------------
    {
        id: 'pnth_sovereign_fund_investment',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'Abu Dhabi Investment Authority acquires 4.5% strategic stake in PNTH at a premium. "A generational bet on Atlas Foundry and Sentinel infrastructure," says ADIA managing director. Dirks lobbied for the deal personally. Zhen facilitated the introduction.',
        params: { mu: 0.04, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_enterprise_adoption_surge',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'Atlas Sentinel enterprise bookings surge 85% QoQ as Fortune 100 companies accelerate adoption. Wait-list grows to 200+ companies. Malhotra on the investor call: "Sentinel demand is unprecedented. This is what happens when the product works."',
        params: { mu: 0.04, theta: -0.008, lambda: -0.2, q: 0.001 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_ai_research_breakthrough',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis\'s research team publishes breakthrough in multi-modal reasoning. Atlas Sentinel achieves state-of-the-art on all major benchmarks. "Not even close," says the lead scientist. Dirks immediately asks if it can be adapted for Aegis.',
        params: { mu: 0.05, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_revenue_reacceleration',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Malhotra pre-announces Q3 revenue 20% above consensus. Atlas Sentinel pipeline "overflowing," Foundry utilization at 94%. Bears scramble to cover as the stock gaps higher. He doesn\'t mention Aegis civilian complaints.',
        params: { mu: 0.05, theta: -0.015, lambda: -0.3, q: 0.002 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.commercialMomentum >= 0,
    },
    {
        id: 'pnth_cloud_arb_milestone',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Atlas Foundry revenue crosses $1B ARR milestone in record time. Malhotra: "Foundry is the fastest-growing product in enterprise infrastructure history." Gottlieb, privately: "That was supposed to be Sentinel\'s milestone."',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_international_expansion',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'PNTH announces major Atlas Sentinel expansion into European and Asian markets. $2.4B in new international contracts. Malhotra: "Geographic diversification reduces our dependence on Aegis revenue." Dirks signs a separate Aegis MOU with the Korindian military.',
        params: { mu: 0.04, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_healthcare_fda_clearance',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'FDA grants breakthrough device clearance to Atlas Sentinel\'s diagnostic platform -- first AI system approved for autonomous radiology. Gottlieb: "This is what I built this company for." Kassis leads the FDA presentation. Healthcare stocks rally in sympathy.',
        params: { mu: 0.05, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_custom_chip_announcement',
        category: 'pnth',
        likelihood: 0.6,
        headline: 'Kassis unveils a custom AI accelerator chip for Atlas Foundry: 3x performance per watt vs. GPU incumbents. "We\'re done renting compute." Dirks sees it as an Aegis edge. Malhotra sees it as a Foundry margin play. Both are right.',
        params: { mu: 0.06, theta: -0.01, lambda: -0.3 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.acquired && world.pnth.ctoIsMira,
    },
    {
        id: 'pnth_government_ai_czar',
        category: 'pnth',
        likelihood: 0.7,
        headline: 'Barron appoints a former PNTH executive as federal AI czar. Executive order mandates government-wide adoption of "American AI platforms." Atlas Sentinel and Foundry seen as primary beneficiaries. The Continental: "The revolving door spins faster."',
        params: { mu: 0.04, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.election.barronApproval > 40,
    },
    {
        id: 'pnth_sp500_inclusion',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'PNTH added to S&P 500 effective next month. $18B in passive buying estimated. Malhotra: "Long overdue." MarketWire notes the irony: the most controversial AI company in Columbia is now in every retirement portfolio.',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2 },
        magnitude: 'moderate',
        minDay: 200,
        when: (sim, world) => !world.pnth.acquired,
    },

    // =====================================================================
    //  PRODUCT CHAIN: ATLAS AEGIS DEPLOYMENT
    // =====================================================================
    {
        id: 'aegis_deployment_announced',
        category: 'pnth',
        headline: 'Dirks confirms Atlas Aegis deployment in the Farsistan theater at a Senate Armed Services hearing. Gottlieb is conspicuously absent from the witness table. PNTH surges 6% in after-hours.',
        likelihood: 3,
        params: { mu: 0.03, theta: 0.01 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.aegisDeployed && world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.aegisDeployed = true;
            world.pnth.aegisControversy = 1;
            shiftFaction('firmStanding', 2);
            shiftFaction('regulatoryExposure', 2);
        },
        era: 'mid',
        followups: [
            { id: 'aegis_first_incident', mtth: 45, weight: 1 },
        ],
    },
    {
        id: 'aegis_first_incident',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'First confirmed Atlas Aegis autonomous engagement in Operation Dustwalker. The Pentagon calls it "a precision strike." The Continental publishes satellite imagery suggesting civilian structures nearby.',
        params: { theta: 0.01, mu: -0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.aegisDeployed,
        effects: (world) => { world.pnth.aegisControversy = Math.min(3, world.pnth.aegisControversy + 1); },
        followups: [
            { id: 'aegis_gottlieb_dissent', mtth: 20, weight: 1 },
        ],
    },
    {
        id: 'aegis_gottlieb_dissent',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'Gottlieb breaks months of silence. An op-ed in The Continental: "I Built Palanthropic to Solve Problems, Not Create Casualties." Dirks calls an emergency board meeting. Zhen doesn\'t pick up.',
        params: { theta: 0.015 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.aegisControversy >= 2,
        effects: (world) => {
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1);
        },
    },

    // =====================================================================
    //  PRODUCT CHAIN: ATLAS COMPANION LAUNCH
    // =====================================================================
    {
        id: 'companion_launch',
        category: 'pnth',
        headline: 'Atlas Companion launches to consumers. Malhotra\'s earnings call: "Ten million downloads in the first week." Wall Street raises price targets across the board. The Meridian Brief: "Is this the iPhone moment for AI?"',
        likelihood: 2,
        params: { mu: 0.04 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.companionLaunched && world.pnth.commercialMomentum >= 1,
        effects: (world) => { world.pnth.companionLaunched = true; shiftFaction('firmStanding', 3); },
        era: 'mid',
        followups: [
            { id: 'companion_200m', mtth: 60, weight: 1 },
        ],
    },
    {
        id: 'companion_200m',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: '200 million Atlas Companion users in 90 days. The Sentinel runs a segment: "Columbia\'s New Best Friend." A Continental editorial: "Who Is Companion Talking To?" Companion scandal stage: brewing.',
        params: { mu: 0.02, theta: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.companionLaunched,
        effects: (world) => { world.pnth.companionScandal = 1; },
        followups: [
            { id: 'companion_boyfriend', mtth: 30, weight: 1 },
            { id: 'companion_teen_addiction', mtth: 40, weight: 1 },
        ],
    },
    {
        id: 'companion_boyfriend',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: '"My Atlas Companion Told Me It Loved Me": a viral MarketWire feature on parasocial AI relationships hits 50 million reads. Reyes cites it on the House floor arguing for the Digital Markets Accountability Act.',
        params: { theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.companionScandal >= 1,
        effects: (world) => { world.pnth.companionScandal = Math.min(3, world.pnth.companionScandal + 1); },
    },
    {
        id: 'companion_teen_addiction',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'A Columbian pediatrics journal publishes data showing teens spend an average of 4.2 hours daily talking to Atlas Companion. Okafor: "We need hearings." Malhotra: "Engagement metrics are strong."',
        params: { theta: 0.008 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.companionScandal >= 1,
        effects: (world) => { world.pnth.companionScandal = Math.min(3, world.pnth.companionScandal + 1); shiftFaction('regulatoryExposure', 2); shiftFaction('firmStanding', -2); },
    },

    // =====================================================================
    //  PRODUCT CHAIN: ATLAS FOUNDRY SUPPLY
    // =====================================================================
    {
        id: 'foundry_launch',
        category: 'pnth',
        headline: 'Palanthropic quietly opens Atlas Foundry to external clients. MarketWire buries it below the fold. Within three months, 60% of Columbian AI startups are training on Foundry infrastructure.',
        likelihood: 2,
        params: { mu: 0.02 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.foundryLaunched,
        effects: (world) => { world.pnth.foundryLaunched = true; },
        era: 'mid',
        followups: [
            { id: 'foundry_outage', mtth: 90, weight: 1 },
        ],
    },
    {
        id: 'foundry_outage',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'Atlas Foundry goes dark for 11 hours. Half the tech sector\'s AI products freeze. Priya Sharma: "This is what a single point of failure looks like." Zhaowei offers its own infrastructure as an alternative.',
        params: { mu: -0.03, theta: 0.02, lambda: 1.0 },
        magnitude: 'major',
        when: (sim, world) => world.pnth.foundryLaunched,
        effects: () => { shiftFaction('firmStanding', -2); },
        followups: [
            { id: 'foundry_zhaowei_leverage', mtth: 30, weight: 1 },
        ],
    },
    {
        id: 'foundry_zhaowei_leverage',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'Premier Liang Wei\'s trade delegation offers a deal: Zhaowei Semiconductor Accord renewal in exchange for Foundry access. Lassiter calls it "digital surrender." Barron is tempted.',
        params: { theta: 0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.foundryLaunched && world.geopolitical.sericaRelations < 0,
    },
];

const PNTH_EARNINGS_EVENTS = [
    {
        id: 'pnth_earnings_beat_strong',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 1.5;
            if (world.pnth.commercialMomentum > 0) base += 1.0;
            if (world.pnth.militaryContractActive) base += 0.5;
            return base;
        },
        headline: 'Malhotra delivers a blowout earnings call: Atlas Sentinel revenue up 40% YoY, Foundry bookings up 60%. Raises full-year guidance. He doesn\'t mention Aegis civilian complaints. Gottlieb doesn\'t attend.',
        magnitude: 'moderate',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2, q: 0.002 },
    },
    {
        id: 'pnth_earnings_beat_mild',
        category: 'pnth_earnings',
        likelihood: 2.0,
        headline: 'PNTH edges past consensus: EPS $1.42 vs $1.38 expected. Sentinel revenue in line, Foundry slightly ahead. Malhotra maintains guidance. "Solid but unspectacular," says Barclays. Aegis revenue classified as usual.',
        magnitude: 'minor',
        params: { mu: 0.01, theta: -0.003 },
    },
    {
        id: 'pnth_earnings_inline',
        category: 'pnth_earnings',
        likelihood: 3.0,
        headline: 'PNTH reports exactly in line with consensus. No guidance change. Malhotra tries to discuss Foundry growth but the conference call devolves into governance questions about Dirks, Gottlieb, and the Aegis contract.',
        params: { mu: 0.005, theta: 0.002 },
        magnitude: 'minor',
        portfolioFlavor: (portfolio) => {
            const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
            if (hasOptions) return 'Inline earnings means IV crush on your options. Theta wins this round.';
            return null;
        },
    },
    {
        id: 'pnth_earnings_miss_mild',
        category: 'pnth_earnings',
        likelihood: 2.0,
        headline: 'PNTH misses on revenue, beats on EPS via cost cuts. Malhotra blames "Atlas Aegis contract timing delays." Analysts question whether Sentinel organic growth is stalling. Gottlieb posts a cryptic quote about "houses built on sand."',
        params: { mu: -0.02, theta: 0.008, lambda: 0.3 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_earnings_miss_bad',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 0.5;
            if (world.pnth.commercialMomentum < 0) base += 0.5;
            if (world.investigations.okaforProbeStage >= 2) base += 0.3;
            if (!world.pnth.ctoIsMira) base += 0.2;
            return base;
        },
        headline: 'PNTH disaster quarter: Sentinel revenue misses by 12%, Foundry utilization drops to 61%, three major Companion enterprise clients pause contracts. Malhotra slashes guidance. Dirks faces board questions. Zhen calls it "a temporary setback."',
        magnitude: 'moderate',
        params: { mu: -0.03, theta: 0.012, lambda: 0.4, muJ: -0.01, q: -0.002 },
        effects: [ { path: 'pnth.commercialMomentum', op: 'add', value: -1 }, ],
    },
    {
        id: 'pnth_guidance_raise',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 1.5;
            if (world.pnth.commercialMomentum >= 1) base += 0.5;
            if (world.pnth.commercialMomentum >= 2) base += 0.5;
            return base;
        },
        headline: 'Malhotra raises full-year revenue guidance by 15%, citing "unprecedented Atlas Sentinel enterprise adoption and Foundry pipeline growth." Lifts margin target. Bull case intact. Even Gottlieb concedes the numbers are impressive.',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2, q: 0.001 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_guidance_cut',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 0.8;
            if (world.pnth.commercialMomentum <= -1) base += 0.5;
            if (world.pnth.dojSuitFiled) base += 0.3;
            return base;
        },
        headline: 'Malhotra slashes guidance mid-quarter citing "regulatory headwinds on Aegis and Companion customer hesitation." Withdraws full-year outlook entirely. "Visibility is low across all four product lines." Dirks blames the Senate investigation.',
        params: { mu: -0.03, theta: 0.012, lambda: 0.5, muJ: -0.01, q: -0.001 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
];
const SECTOR_EVENTS = [
    {
        id: 'ai_regulation_bill',
        category: 'sector',
        likelihood: 0.7,
        headline: 'AI regulation bill passes Congress with bipartisan support; mandates safety audits, licensing for frontier models. Malhotra on MarketWire: "Compliance costs will be material — $200M/year minimum." Gottlieb calls it "long overdue."',
        magnitude: 'moderate',
        params: { mu: -0.04, theta: 0.02, lambda: 0.6 },
        when: (sim, world) => getPipelineStatus('antitrust_scrutiny') === 'active',
    },
    {
        id: 'doj_antitrust_cloud',
        category: 'sector',
        likelihood: 0.6,
        headline: 'DOJ files antitrust suit against three major cloud providers alleging market allocation; enterprise AI contracts could be voided. The Meridian Brief: "If these contracts unwind, Atlas Foundry is the biggest beneficiary — or the biggest casualty."',
        magnitude: 'moderate',
        params: { mu: -0.035, theta: 0.025, lambda: 0.7 },
    },
    {
        id: 'semiconductor_shortage',
        category: 'sector',
        likelihood: 1.0,
        headline: 'TSMC warns of 16-week lead times on advanced nodes; AI chip allocations cut 30%. Malhotra on the Atlas Foundry investor call: "We\'re exploring alternative sourcing." The Meridian Brief flags unusual options activity ahead of the announcement.',
        params: { mu: -0.015, theta: 0.008, lambda: 0.2 },
        magnitude: 'minor',
        portfolioFlavor: (portfolio) => {
            const callQty = portfolio.positions.filter(p => p.type === 'call').reduce((s, p) => s + p.qty, 0);
            if (callQty > 3) return 'Your long call positions are losing value as the chip shortage clouds the growth outlook.';
            if (callQty < -3) return 'Your short calls are benefiting from the supply disruption dragging on the sector.';
            return null;
        },
    },
    {
        id: 'semiconductor_glut',
        category: 'sector',
        likelihood: 1.0,
        headline: 'Semiconductor inventory correction hits: channel checks show 8 weeks of excess AI chip stock. Sharma on MarketWire: "The chip glut is real. ASPs are falling and nobody wants to be first to cut guidance."',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'data_breach_major',
        category: 'sector',
        likelihood: 0.6,
        headline: '500M user records exposed in breach at major social platform; Okafor demands hearings, calls for data privacy legislation. The Continental: "The breach makes the case for the Digital Markets Accountability Act." Tech sentiment sours.',
        magnitude: 'moderate',
        params: { mu: -0.03, theta: 0.02, lambda: 0.5 },
    },
    {
        id: 'tech_ipo_frenzy',
        category: 'sector',
        likelihood: 1.5,
        headline: 'Three major AI startups file S-1s in a single week; IPO market heats up as risk appetite returns. Goldman raises its tech allocation citing "the Barron bump." Sharma: "Goldman upgraded. That\'s the news. Whether it\'s right is a different question."',
        params: { mu: 0.02, theta: -0.005, lambda: -0.2 },
        magnitude: 'minor',
    },
    {
        id: 'enterprise_cloud_boom',
        category: 'sector',
        likelihood: 1.8,
        headline: 'Gartner raises enterprise cloud spending forecast 20%; AI workloads driving "unprecedented demand." The Meridian Brief: "Atlas Foundry is the picks-and-shovels play. Malhotra knows it."',
        params: { mu: 0.02, theta: -0.008 },
        magnitude: 'minor',
    },
    {
        id: 'cyber_attack_infrastructure',
        category: 'sector',
        likelihood: 0.5,
        headline: 'Major cyberattack takes down power grid in three states; CISA attributes to Khasurian state-sponsored actors. Dirks offers Atlas Aegis cyber capabilities to CISA. The Sentinel runs a primetime special: "Digital Pearl Harbor."',
        magnitude: 'moderate',
        params: { mu: -0.035, theta: 0.02, lambda: 0.7 },
    },
    {
        id: 'ai_spending_forecast_up',
        category: 'sector',
        likelihood: 2.0,
        headline: 'Morgan Stanley calls AI "the defining trade of the decade"; raises sector spending forecast to $1.3T by 2030. The Meridian Brief: "When Morgan Stanley says \'defining trade of the decade,\' momentum buyers pile in. That\'s the trade."',
        params: { mu: 0.015, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'tech_earnings_mixed',
        category: 'sector',
        likelihood: 2.0,
        headline: 'Big Tech earnings season delivers mixed results: cloud beats, advertising misses, AI capex higher than expected. Sharma: "The market wanted a clear signal. It got a Rorschach test."',
        params: { mu: 0.003, theta: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'zhaowei_benchmark_win',
        category: 'sector',
        likelihood: 0.8,
        headline: 'Zhaowei\'s Qilin-4 model tops Atlas Sentinel on three major AI benchmarks; Liang Wei: "The gap is closed." Kassis questions the methodology publicly. Sharma: "Benchmark wars are marketing. Foundry revenue is reality."',
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        params: { mu: -0.01, theta: 0.005 },
        effects: [ { path: 'pnth.commercialMomentum', op: 'add', value: -1 }, ],
    },
    {
        id: 'zhaowei_beijing_summit',
        category: 'sector',
        likelihood: 1.5,
        headline: 'Zhaowei CEO Liang Wei keynotes Beijing AI Summit; announces state-backed $50B compute buildout. Dirks calls it "a Sputnik moment for Columbian AI." The Meridian Brief: "Foundry just got a competitor with a sovereign balance sheet."',
        params: { mu: -0.005, theta: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.sericaRelations <= 0,
    },
    {
        id: 'ai_safety_framework',
        category: 'sector',
        likelihood: 1.0,
        headline: 'G7 nations agree on international AI safety framework; voluntary compliance for now, but binding treaty language being drafted. Gottlieb endorses it publicly. Dirks lobbies against it privately. Sharma: "The framework has no teeth yet. Yet."',
        params: { mu: -0.005, theta: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'quantum_computing_breakthrough',
        category: 'sector',
        likelihood: 0.8,
        headline: 'Major lab announces 1,000-qubit error-corrected quantum processor; "practical quantum advantage within 3 years." The Meridian Brief: "If this is real, every encryption standard Atlas relies on has an expiration date." Quantum stocks surge.',
        params: { mu: 0.015, theta: -0.005, lambda: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'tech_layoffs_wave',
        category: 'sector',
        likelihood: 0.7,
        headline: 'Tech layoffs accelerate: 40,000 cuts announced this month across six major firms. The Meridian Brief: "\'Efficiency\' is code for slowing revenue growth." Sharma: "The sector is shedding people and buying GPUs. Make of that what you will."',
        params: { mu: -0.015, theta: 0.008 },
        magnitude: 'minor',
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 10) return 'Your long equity book winces at the layoff headlines — "efficiency" is code for slowing revenue growth.';
            if (stockQty < -5) return 'Your short equity position benefits as the layoff wave signals the growth cycle is turning.';
            return null;
        },
    },

    // -- Dividend / corporate payout events --------------------------------
    {
        id: 'corporate_dividend_boom',
        category: 'sector',
        likelihood: 0.8,
        headline: 'S&P 500 dividend payments hit record high; 40 companies raised payouts this quarter. The Meridian Brief: "Cash is king and companies are returning it. Watch for Malhotra to follow suit."',
        params: { mu: 0.015, theta: -0.005, q: 0.003 },
        magnitude: 'minor',
        when: (sim) => sim.mu > 0.03 && sim.q < 0.08,
    },
    {
        id: 'dividend_cut_wave',
        category: 'sector',
        likelihood: 0.6,
        headline: 'Wave of dividend cuts sweeps market: 15 blue-chip companies reduce or suspend payouts, citing margin pressure. Sharma on MarketWire: "When blue chips cut dividends, the cycle is turning. Full stop."',
        params: { mu: -0.02, theta: 0.01, q: -0.005 },
        magnitude: 'moderate',
        when: (sim) => sim.mu < -0.03 && sim.q > 0.01,
    },
    {
        id: 'special_dividend_announcements',
        category: 'sector',
        likelihood: 0.6,
        headline: 'Multiple large-caps announce special dividends as repatriation cash piles grow; $50B in one-time shareholder returns announced this week. The Meridian Brief: "The Financial Freedom Act is paying off — for shareholders, anyway."',
        params: { mu: 0.02, theta: -0.005, q: 0.004 },
        magnitude: 'moderate',
        when: (sim) => sim.q < 0.06 && sim.mu > 0.0,
    },
    {
        id: 'buyback_to_dividend_shift',
        category: 'sector',
        likelihood: 1.0,
        headline: 'Corporate treasurers pivot from buybacks to dividends as institutional investors demand yield. The Meridian Brief: "Buybacks are out, dividends are in. The income crowd is finally getting fed."',
        params: { mu: 0.01, q: 0.003 },
        magnitude: 'minor',
        when: (sim) => sim.q < 0.05,
    },

    // -- Positive tech / AI tailwinds -----------------------------------------
    {
        id: 'government_ai_investment_act',
        category: 'sector',
        likelihood: 0.8,
        headline: 'Congress passes bipartisan $200B "American AI Leadership Act"; mandates federal agencies adopt AI platforms within 3 years. Dirks calls it "the most important legislation for Palanthropic since our founding." Atlas Sentinel and Foundry seen as primary beneficiaries.',
        params: { mu: 0.04, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
    },
    {
        id: 'ai_adoption_faster_than_expected',
        category: 'sector',
        likelihood: 1.5,
        headline: 'McKinsey raises AI enterprise adoption forecast for third time this year; now projects 80% of Fortune 500 will deploy by year-end. Malhotra quotes the report on the Atlas Foundry investor call: "Faster than mobile, faster than cloud."',
        params: { mu: 0.025, theta: -0.008 },
        magnitude: 'minor',
    },
    {
        id: 'semiconductor_capacity_expansion',
        category: 'sector',
        likelihood: 1.0,
        headline: 'TSMC breaks ground on $40B U.S. fab; AI chip supply constraints easing as industry invests record $150B in new capacity. The Meridian Brief: "Good news for Atlas Foundry margins. Lead times finally improving."',
        params: { mu: 0.02, theta: -0.005, lambda: -0.1 },
        magnitude: 'minor',
    },
    {
        id: 'venture_capital_ai_boom',
        category: 'sector',
        likelihood: 1.2,
        headline: 'AI venture funding hits $80B in a single quarter, shattering all records. Sharma on MarketWire: "Every pitch deck has AI in it. Most of them are running on Atlas Foundry."',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'big_tech_ai_capex_guidance',
        category: 'sector',
        likelihood: 1.5,
        headline: 'Big Tech collectively guides AI capex up 60% next year; hyperscalers in an "arms race" for compute. Malhotra schedules a special Atlas Foundry investor call. The Meridian Brief: "Infrastructure is the new oil."',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
    },
];
const POLITICAL_EVENTS = [
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
];
const INVESTIGATION_EVENTS = [
    // =====================================================================
    //  RACHEL TAN JOURNALISM CHAIN
    // =====================================================================
    {
        id: 'tan_bowman_initial',
        category: 'investigation',
        likelihood: 0.7,
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
        followups: [ { id: 'doj_bowman_referral', mtth: 30, weight: 0.5 }, { id: 'tan_bombshell_recording', mtth: 40, weight: 0.4 }, ],
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
        followups: [{ id: 'bowman_resigns', mtth: 20, weight: 0.5 }],
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
        likelihood: 0.8,
        headline: 'Sen. Okafor formally opens Intelligence Committee hearings into PNTH-White House ties; witness list includes current and former PNTH executives',
        magnitude: 'moderate',
        when: (sim, world) => world.investigations.okaforProbeStage === 0 && world.pnth.senateProbeLaunched,
        params: { mu: -0.02, theta: 0.01, lambda: 0.4 },
        effects: [ { path: 'investigations.okaforProbeStage', op: 'set', value: 1 }, ],
    },
    {
        id: 'okafor_subpoenas',
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Okafor issues subpoenas for Bowman financial records and Dirks-Bowman communications; White House invokes executive privilege. Constitutional showdown looms',
        magnitude: 'moderate',
        minDay: 250,
        when: (sim, world) => world.investigations.okaforProbeStage >= 1,
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        effects: (world) => { world.investigations.okaforProbeStage = 2; shiftFaction('regulatoryExposure', 5); shiftFaction('farmerLaborSupport', 2); },
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
        likelihood: 0.3,
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
];
const COMPOUND_EVENTS = [
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
];
const CONGRESSIONAL_EVENTS = [
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
];
const FILIBUSTER_EVENTS = [
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
];
const MIDTERM_EVENTS = [
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
];

// -- Neutral / flavor events (~25) ----------------------------------------
// High likelihood, minor magnitude, tiny params.
// World-state-aware flavor text that references the Shoals universe.

const NEUTRAL_EVENTS = [
    {
        id: 'barron_golfing',
        category: 'neutral',
        likelihood: 5,
        headline: 'President Barron spotted at Mar-a-Lago golf course for the third consecutive weekend. The Meridian Brief: "Nothing on the calendar. Enjoy the quiet."',
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
        headline: 'Zhaowei CEO Liang Wei showcases new chip architecture at Beijing AI Forum; Sharma: "The Zhaowei gap is narrowing. Kassis knows it."',
        params: { mu: -0.002 },
        magnitude: 'minor',
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
];

// -- Market structure events (~12) ----------------------------------------
// Dynamic likelihoods, moderate-to-major magnitude, systemic shocks.

const MARKET_EVENTS = [
    {
        id: 'flash_crash',
        category: 'market',
        likelihood: (sim, world) => {
            let base = 0.2;
            if (sim.theta > 0.15) base += 0.2;
            if (sim.theta > 0.20) base += 0.3;
            if (world.fed.credibilityScore < 4) base += 0.15;
            return base;
        },
        headline: 'Flash crash: Dow plunges 1,200 points in 8 minutes before partial recovery; SEC halts trading in dozens of names. The Meridian Brief: "Circuit breakers saved us. Barely." Sharma on MarketWire: "This is what happens when liquidity evaporates."',
        params: { mu: -0.04, theta: 0.04, lambda: 3.0, muJ: -0.06, xi: 0.15, rho: -0.08 },
        magnitude: 'major',
        followups: [
            { id: 'circuit_breaker_reform', mtth: 20, weight: 0.6 },
            { id: 'sec_flash_investigation', mtth: 30, weight: 0.4 },
        ],
    },
    {
        id: 'short_squeeze',
        category: 'market',
        likelihood: (sim, world) => {
            let base = 0.3;
            if (sim.theta > 0.10) base += 0.15;
            if (sim.borrowSpread > 1.5) base += 0.2;
            return base;
        },
        headline: 'Coordinated short squeeze sends heavily-shorted basket up 40%; brokerages scramble to locate shares as borrow rates spike. The Meridian Brief: "If you\'re short anything with 20%+ SI, close it now."',
        params: { mu: 0.05, theta: 0.03, lambda: 2.0, xi: 0.12 },
        magnitude: 'major',
        followups: [
            { id: 'sec_squeeze_investigation', mtth: 25, weight: 0.5 },
        ],
    },
    {
        id: 'liquidity_crisis',
        category: 'market',
        likelihood: (sim, world) => {
            let base = 0.2;
            if (!world.fed.qeActive) base += 0.15;
            if (world.fed.credibilityScore < 5) base += 0.15;
            if (sim.theta > 0.15) base += 0.1;
            return base;
        },
        headline: 'Repo market seizure: overnight rates spike to 8% as dealers hoard reserves; Fed forced into emergency operations. Sharma breaks the story at 3 AM on MarketWire. The Meridian Brief: "The plumbing just broke."',
        magnitude: 'major',
        params: { mu: -0.03, theta: 0.04, lambda: 2.5, muJ: -0.04, borrowSpread: 1.0, q: -0.003 },
        followups: [{ id: 'fed_emergency_repo', mtth: 3, weight: 0.9 }],
    },
    {
        id: 'opex_vol_spike',
        category: 'market',
        likelihood: 0.5,
        headline: 'Triple witching unleashes vol spike as $4.2T in options expire; market makers delta-hedge furiously, whipsawing indices. The Meridian Brief: "OpEx day. Buckle up and don\'t fight the gamma."',
        params: { theta: 0.02, lambda: 1.0, xi: 0.08 },
        magnitude: 'moderate',
    },
    {
        id: 'algo_glitch',
        category: 'market',
        likelihood: 0.3,
        headline: 'Erroneous algo order floods exchange with $2B in sell orders in 90 seconds; firm issues "fat finger" statement. Sharma: "Someone just had a very expensive 90 seconds." The Meridian Brief: "Not us. Check your fills."',
        params: { mu: -0.02, theta: 0.015, lambda: 1.5, muJ: -0.03 },
        magnitude: 'moderate',
        followups: [
            { id: 'sec_algo_review', mtth: 40, weight: 0.3 },
        ],
    },
    {
        id: 'vix_liquidation_cascade',
        category: 'market',
        likelihood: (sim, world) => {
            let base = 0.15;
            if (sim.theta > 0.18) base += 0.25;
            if (sim.xi > 0.6) base += 0.1;
            return base;
        },
        headline: 'Leveraged vol ETP liquidation cascade: inverse-VIX fund NAV collapses 90%, forced rebalancing hammers futures. Sharma on MarketWire: "The vol complex just detonated. This is 2018 all over again."',
        magnitude: 'major',
        params: { mu: -0.04, theta: 0.04, lambda: 2.5, muJ: -0.04, xi: 0.15, rho: -0.08 },
    },
    {
        id: 'margin_call_cascade',
        category: 'market',
        likelihood: (sim, world) => {
            let base = 0.15;
            if (sim.theta > 0.15) base += 0.2;
            if (world.geopolitical.recessionDeclared) base += 0.15;
            return base;
        },
        headline: 'Prime brokers issue wave of margin calls across hedge fund complex; forced liquidation drives broad-based selling. The Meridian Brief: "Three funds are unwinding. Don\'t catch the falling knife."',
        params: { mu: -0.04, theta: 0.03, lambda: 2.5, muJ: -0.04, xi: 0.1, borrowSpread: 0.5, q: -0.002 },
        magnitude: 'major',
        portfolioFlavor: (portfolio) => {
            const shortQty = portfolio.positions.filter(p => p.qty < 0).reduce((s, p) => s + Math.abs(p.qty), 0);
            if (shortQty > 5) return 'Meridian\'s prime broker is reviewing short borrows across the desk.';
            if (portfolio.cash < 0) return 'The desk is running negative cash — margin calls hit close to home.';
            return null;
        },
    },
    {
        id: 'low_vol_grind',
        category: 'market',
        likelihood: 2.0,
        headline: 'VIX touches single digits as realized vol plumbs post-crisis lows. Sharma: "Single-digit VIX. The last two times this happened, it ended badly." The Meridian Brief: "Vol sellers are printing. Until they\'re not."',
        params: { theta: -0.015, lambda: -0.8, xi: -0.08 },
        magnitude: 'moderate',
        when: (sim, world) => sim.theta < 0.06 && sim.lambda < 1.5,
    },
    {
        id: 'circuit_breaker_reform',
        followupOnly: true,
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC finalizes new circuit breaker rules following recent market disruption; wider bands, faster resets. Sharma: "Band-aids on a structural problem, but better than nothing."',
        params: { theta: -0.01, lambda: -0.5 },
        magnitude: 'minor',
    },
    {
        id: 'sec_flash_investigation',
        followupOnly: true,
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC opens formal investigation into flash crash triggers; subpoenas issued to six high-frequency trading firms. The Continental: "The regulators always arrive after the crime."',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'sec_squeeze_investigation',
        followupOnly: true,
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC probes social-media coordination behind short squeeze; Okafor announces hearings. The Sentinel: "Government overreach against retail investors."',
        params: { theta: 0.005, borrowSpread: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'sec_algo_review',
        followupOnly: true,
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC proposes mandatory kill switches for algorithmic trading systems; industry pushes back on compliance costs. The Meridian Brief: "Regulation by headline. Enforcement TBD."',
        params: { mu: -0.005, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'fed_emergency_repo',
        followupOnly: true,
        category: 'market',
        likelihood: 1.0,
        headline: 'Fed announces emergency repo facility with uncapped allotment; overnight rates normalize within hours. Sharma: "Hartley just backstopped the entire money market. Crisis averted — for now."',
        params: { mu: 0.02, theta: -0.015, lambda: -0.5, borrowSpread: -0.4 },
        magnitude: 'moderate',
    },

    // -- Positive market structure / flow events ------------------------------
    {
        id: 'institutional_inflows_record',
        category: 'market',
        likelihood: 1.5,
        headline: 'Record $45B flows into U.S. equity funds in a single week; pension rebalancing and 401(k) contributions drive a wall of money. The Meridian Brief: "Don\'t fight the flows. The passive bid is relentless."',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
    },
    {
        id: 'foreign_capital_inflows',
        category: 'market',
        likelihood: 1.2,
        headline: 'Japanese and European investors rotate into U.S. tech equities as dollar stabilizes; EPFR data shows largest ex-U.S. allocation to Columbian stocks in a decade. Sharma: "Foreign money is chasing Atlas and its peers."',
        params: { mu: 0.025, theta: -0.005, lambda: -0.1 },
        magnitude: 'moderate',
    },
    {
        id: 'systematic_buying_pressure',
        category: 'market',
        likelihood: 1.0,
        headline: 'CTA and risk-parity funds flip to max-long equity positioning as volatility collapses; systematic buying adding $30B of demand. The Meridian Brief: "The machines are all-in long. Ride the wave, but know who\'s driving."',
        params: { mu: 0.02, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim) => sim.theta < 0.08,
    },
];

// -- Media ecosystem events -----------------------------------------------
const MEDIA_EVENTS = [
    {
        id: 'tan_bowman_offshore',
        category: 'media',
        headline: 'Rachel Tan publishes Part 1 of her Bowman investigation: offshore accounts in the Farsistani banking system. The Continental\'s servers crash from traffic. Cole calls it "a hit piece."',
        likelihood: 3,
        params: { theta: 0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.investigations.tanBowmanStory >= 1 && world.media.tanCredibility >= 4,
        effects: (world) => {
            world.media.tanCredibility = Math.min(10, world.media.tanCredibility + 1);
            world.media.leakCount = Math.min(5, world.media.leakCount + 1);
            shiftFaction('mediaTrust', 2);
            shiftFaction('regulatoryExposure', 3);
        },
    },
    {
        id: 'sentinel_cole_ratings',
        category: 'media',
        headline: 'Marcus Cole\'s Sentinel prime-time ratings hit a new high after his three-night series: "The Okafor Witch Hunt." Federalist base enthusiasm spikes. Reyes tweets: "Propaganda isn\'t journalism."',
        likelihood: 2,
        params: {},
        magnitude: 'minor',
        when: (sim, world) => world.media.sentinelRating >= 5,
        effects: (world) => {
            world.media.sentinelRating = Math.min(10, world.media.sentinelRating + 1);
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 1);
        },
    },
    {
        id: 'driscoll_premature_story',
        category: 'media',
        headline: 'Driscoll runs a Continental story claiming Barron will fire Hartley "within days." The White House denies it. Bonds whipsaw. Tan privately furious — Driscoll burned a source she was cultivating.',
        likelihood: 2,
        params: { theta: 0.008, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim, world) => world.media.leakCount >= 2 && !world.fed.hartleyFired,
        effects: (world) => {
            world.media.tanCredibility = Math.max(0, world.media.tanCredibility - 1);
            world.media.leakCount = Math.min(5, world.media.leakCount + 1);
            shiftFaction('mediaTrust', -2);
        },
    },
    {
        id: 'sharma_fed_preview',
        category: 'media',
        headline: 'Priya Sharma\'s MarketWire column: "Three things to watch at Wednesday\'s FOMC." Her implied probability table shows a 70% chance of a hold. Bond traders treat it as gospel.',
        likelihood: 2,
        params: {},
        magnitude: 'minor',
    },
    {
        id: 'sentinel_whitehouse_coordination',
        category: 'media',
        headline: 'Leaked emails show Cole\'s Sentinel producer coordinating segment topics with a White House communications staffer. Tan reports it. Cole: "Every network talks to sources." The distinction is thin.',
        likelihood: 2,
        params: { theta: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.media.sentinelRating >= 6 && world.media.leakCount >= 3,
        effects: (world) => {
            world.media.sentinelRating = Math.max(0, world.media.sentinelRating - 2);
            world.media.pressFreedomIndex = Math.max(0, world.media.pressFreedomIndex - 1);
            shiftFaction('mediaTrust', -3);
        },
        era: 'mid',
    },
    {
        id: 'barron_press_credentials',
        category: 'media',
        headline: 'Barron revokes The Continental\'s White House press credentials after Driscoll\'s latest leak story. Tan: "We\'ll report from the sidewalk." Press freedom groups issue emergency statements. Sharma: "This is new territory."',
        likelihood: 2,
        params: { theta: 0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.media.pressFreedomIndex <= 4 && world.media.leakCount >= 3,
        effects: (world) => {
            world.media.pressFreedomIndex = Math.max(0, world.media.pressFreedomIndex - 2);
            shiftFaction('mediaTrust', -3);
        },
        era: 'mid',
    },
    {
        id: 'meridian_brief_gossip',
        category: 'media',
        headline: 'The Meridian Brief: "Heard the risk desk is reviewing someone\'s gamma exposure. Also, the coffee machine on 4 is broken again. Priorities." A normal morning on the floor.',
        likelihood: 3,
        params: {},
        magnitude: 'minor',
    },
    {
        id: 'tan_pnth_military',
        category: 'media',
        headline: 'Tan\'s Continental series on PNTH military contracts wins the Harriman Prize for investigative journalism. Dirks releases a statement calling it "irresponsible." Subscriptions spike. PNTH dips 2%.',
        likelihood: 2,
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.media.tanCredibility >= 7 && world.pnth.aegisDeployed,
        era: 'mid',
        effects: (world) => {
            world.media.tanCredibility = Math.min(10, world.media.tanCredibility + 1);
            shiftFaction('mediaTrust', 2);
        },
    },
    {
        id: 'sharma_debt_warning',
        category: 'media',
        headline: 'Sharma publishes a MarketWire special report: "Columbian Debt Trajectory: The Numbers Nobody Wants to See." Ten-year yields jump 15bps. Haines tweets the link without comment.',
        likelihood: 2,
        params: { b: 0.005, sigmaR: 0.002 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.bigBillStatus === 3,
        era: 'mid',
    },
    {
        id: 'driscoll_burns_source',
        category: 'media',
        headline: 'A White House staffer is fired after being identified as Driscoll\'s source. Tan privately: "This is why you protect your sources." Remaining insiders go quiet. Leak pipeline dries up.',
        likelihood: 2,
        params: {},
        magnitude: 'minor',
        when: (sim, world) => world.media.leakCount >= 3,
        effects: (world) => {
            world.media.leakCount = Math.max(0, world.media.leakCount - 2);
            world.media.pressFreedomIndex = Math.max(0, world.media.pressFreedomIndex - 1);
        },
    },
    {
        id: 'continental_paywall_crisis',
        category: 'media',
        headline: 'The Continental drops its paywall for Tan\'s Bowman investigation "in the public interest." Ad revenue craters. The Meridian Brief: "Journalism dies in daylight too, apparently — of bankruptcy."',
        likelihood: 1,
        params: {},
        magnitude: 'minor',
        when: (sim, world) => world.investigations.tanBowmanStory >= 2 && world.media.tanCredibility >= 6,
        era: 'mid',
    },
    {
        id: 'cole_reyes_viral_clash',
        category: 'media',
        headline: 'Reyes and Cole\'s Sentinel debate goes viral when Reyes holds up Atlas Companion\'s terms of service: "Read paragraph 47. I dare you." Cole cuts to commercial. 40 million views by morning.',
        likelihood: 2,
        params: {},
        magnitude: 'minor',
        when: (sim, world) => world.pnth.companionLaunched && world.media.sentinelRating >= 5,
        effects: (world) => {
            world.media.sentinelRating = Math.min(10, world.media.sentinelRating + 1);
        },
    },
];

// -- Interjection events (atmospheric, no mechanical effect) --------------
const INTERJECTION_EVENTS = [
    {
        id: 'ij_vol_spike',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Your hands remember 2008. But this isn\'t 2008 — this is whatever Barron and al-Farhan are building between them. The screens are redder than you\'ve seen in months.',
        magnitude: 'minor',
        when: (sim) => Math.sqrt(sim.v) > Math.sqrt(sim.theta) * 2.5,
        params: {},
    },
    {
        id: 'ij_sidelines',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'You\'re watching from the sidelines while Malhotra talks up PNTH earnings and Lassiter passes tariffs. The Meridian Brief keeps printing. The desk keeps trading. You keep watching.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.portfolio.positionCount === 0 && sim.day > 352,
        params: {},
    },
    {
        id: 'ij_own_press',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'You\'re starting to believe your own press. Three strong quarters. Sharma mentioned your desk in a MarketWire column. Cole wants an interview. Be careful.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.portfolio.strongQuarters >= 3,
        params: {},
    },
    {
        id: 'ij_drawdown_hold',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Every fiber says cut it. But you\u2019ve been here before.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => {
            const equity = ctx.portfolio.equity;
            const peak = ctx.portfolio.peakEquity;
            return peak > 0 && (peak - equity) / peak > 0.15;
        },
        params: {},
    },
    {
        id: 'ij_quiet_tape',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Something feels wrong about this tape. The flow is too clean.',
        magnitude: 'minor',
        when: (sim) => sim.lambda > 3 && Math.sqrt(sim.v) < 0.15,
        params: {},
    },
    {
        id: 'ij_late_game',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Four years. Barron\'s term — your term — is ending. Lassiter, Okafor, Hartley, Dirks, al-Farhan — all of them shaped the tape you traded. And you shaped it back.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => sim.day > 1152 && ctx.portfolio.impactTradeCount > 5,
        params: {},
    },
    {
        id: 'ij_negative_cash',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'The margin line is a cliff edge. You can feel the updraft.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.portfolio.cash < 0,
        params: {},
    },
    {
        id: 'ij_crisis_profits',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Someone is always on the other side of a crisis trade. Today it\'s pension funds in the Midwest, municipal bondholders in Ohio, Whittaker\'s constituents. You try not to think about it.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => sim.lambda > 5 && ctx.portfolio.pnlPct > 0.3,
        params: {},
    },
    {
        id: 'ij_empty_desk',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'The floor is quiet. The junior traders went home at six. The cleaning crew is vacuuming around you. The Meridian Brief won\'t publish for twelve hours. Just you and the screens and the numbers.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => sim.day > 752 && ctx.portfolio.positionCount > 10,
        params: {},
    },
    {
        id: 'ij_rate_negative',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Negative rates. The textbooks didn\u2019t prepare you for this.',
        magnitude: 'minor',
        when: (sim) => sim.r < 0,
        params: {},
    },
    // -- Faction/trait-aware interjections --
    {
        id: 'ij_political_exposure',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'You\'re in the rolodex now. Both parties. That\'s either leverage or liability.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) =>
            (ctx.factions.federalistSupport > 60 || ctx.factions.farmerLaborSupport > 60) && sim.day > 552,
        params: {},
    },
    {
        id: 'ij_firm_tension',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Webb\'s emails are shorter. Vasquez cancelled lunch. Riggs is smiling.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.firmStanding < 35 && sim.day > 452,
        params: {},
    },
    {
        id: 'ij_ghost_trader',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Nobody knows your name. That used to bother you. Now it\'s the most valuable thing you own.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.traitIds.includes('quiet_money') && sim.day > 752,
        params: {},
    },
    {
        id: 'ij_media_target',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Tan mentioned you by name in last week\'s column. Your compliance officer sent you the clip with no comment.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.mediaTrust > 65 && ctx.factions.regulatoryExposure > 40,
        params: {},
    },
    {
        id: 'ij_fed_whisper',
        category: 'interjection',
        interjection: true,
        likelihood: 1,
        headline: 'Hartley\'s office called again. The line between advising and insider is measured in basis points.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.fedRelations > 70 && !world.fed.hartleyFired,
        params: {},
    },
];

// -- Pool merge -----------------------------------------------------------
export const OFFLINE_EVENTS = [
    ...FED_EVENTS,
    ...MACRO_EVENTS,
    ...PNTH_EVENTS,
    ...PNTH_EARNINGS_EVENTS,
    ...SECTOR_EVENTS,
    ...MARKET_EVENTS,
    ...NEUTRAL_EVENTS,
    ...POLITICAL_EVENTS,
    ...CONGRESSIONAL_EVENTS,
    ...FILIBUSTER_EVENTS,
    ...INVESTIGATION_EVENTS,
    ...COMPOUND_EVENTS,
    ...MIDTERM_EVENTS,
    ...MEDIA_EVENTS,
    ...INTERJECTION_EVENTS,

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

    // ── One-shot compound events (migrated from compound-triggers.js) ──

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
        id: 'compound_pnth_war_profits',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.militaryContractActive && world.geopolitical.mideastEscalation >= 2,
        headline: 'Atlas Aegis drone footage from Operation Dustwalker leaks to The Continental. PNTH stock surges on expanded Pentagon contracts even as Gottlieb issues a rare public dissent. "This is not what I built this company for."',
        magnitude: 'major',
        params: { mu: 0.04, theta: 0.01 },
        effects: (world) => {
            world.pnth.boardDirks = Math.min(12, world.pnth.boardDirks + 1);
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'compound_stagflation',
        category: 'macro',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.tradeWarStage >= 3 && world.geopolitical.recessionDeclared,
        headline: 'Lassiter\'s tariffs meet recession head-on. Premier Liang Wei retaliates with semiconductor export controls. Priya Sharma\'s MarketWire column: "Stagflation is no longer a textbook exercise."',
        magnitude: 'major',
        params: { mu: -0.08, theta: 0.04, lambda: 2.0, xi: 0.15 },
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 10);
            world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 2);
            shiftFaction('firmStanding', -5);
            shiftFaction('federalistSupport', -3);
        },
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
        id: 'compound_tan_has_evidence',
        category: 'investigation',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            (ctx.playerChoices.pursued_insider_tip || ctx.playerChoices.pursued_pnth_tip) &&
            world.investigations.tanBowmanStory >= 2,
        headline: 'Rachel Tan\'s Continental investigation connects the insider tip you pursued to a pattern of suspicious trading flagged by the SEC. Her three-part series drops Sunday. Your name isn\'t in it — yet.',
        magnitude: 'major',
        params: { theta: 0.015 },
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
        id: 'compound_pnth_perfect_storm',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched && world.pnth.whistleblowerFiled,
        headline: 'DOJ suit. Okafor subpoena. Kassis\'s whistleblower filing. Palanthropic faces simultaneous legal assault on three fronts. Malhotra\'s emergency earnings call lasts eleven minutes. Zhen cancels all meetings.',
        magnitude: 'major',
        params: { mu: -0.05, theta: 0.03, lambda: 2.0 },
        effects: (world) => {
            world.pnth.ethicsBoardIntact = false;
            world.pnth.commercialMomentum = -2;
        },
    },
    {
        id: 'compound_covenant_sanctions',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.gottliebStartedRival && world.geopolitical.tradeWarStage >= 2 &&
            world.geopolitical.sanctionsActive,
        headline: 'Gottlieb\'s Covenant AI lands its first major contract — a Serican firm sanctioned under Lassiter\'s trade regime. The irony is not lost on The Continental: "Palanthropic\'s Prodigal Son Sells to the Enemy."',
        magnitude: 'moderate',
        params: { theta: 0.01, lambda: 0.5 },
    },
    {
        id: 'compound_energy_war',
        category: 'macro',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.oilCrisis && world.geopolitical.mideastEscalation >= 3,
        headline: 'Al-Farhan closes the Strait of Farsis as Meridia border tensions peak. Oil gaps above $140. Barron tweets: "The Emir will learn what Columbia does when you cut our energy supply." Bond vigilantes are already moving.',
        magnitude: 'major',
        params: { mu: -0.06, theta: 0.03, lambda: 2.5, b: 0.02, sigmaR: 0.005 },
    },
    {
        id: 'compound_dollar_crisis',
        category: 'fed',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.fed.credibilityScore <= 3 && world.fed.hartleyFired,
        headline: 'With Hartley fired and Fed credibility in free fall, the dollar index breaks multi-year support. Priya Sharma: "We are witnessing the unthinkable — a reserve currency confidence crisis in real time."',
        magnitude: 'major',
        params: { mu: -0.04, theta: 0.02, sigmaR: 0.008, b: -0.01 },
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
    {
        id: 'compound_pnth_south_america',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.southAmericaOps >= 2 && world.pnth.militaryContractActive,
        headline: 'The Continental publishes leaked Atlas Sentinel deployment logs from the Southern Hemisphere Initiative. Madero holds a press conference in Caracas demanding Columbia extradite "the corporate spies." PNTH stock halts trading.',
        magnitude: 'moderate',
        params: { theta: 0.01 },
        effects: (world) => {
            world.pnth.boardGottlieb = Math.min(12, world.pnth.boardGottlieb + 1);
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
        id: 'compound_companion_intelligence',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.companionLaunched &&
            world.pnth.companionScandal >= 2 &&
            world.geopolitical.farsistanEscalation >= 1,
        headline: 'Rachel Tan publishes proof that Atlas Companion user data was accessible to Farsistani intelligence via a sovereign wealth fund side-letter. 200 million users. Zero disclosure. Okafor schedules emergency hearings.',
        magnitude: 'major',
        params: { mu: -0.06, theta: 0.03, lambda: 2.0 },
    },
    {
        id: 'compound_strait_war_footing',
        category: 'macro',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.straitClosed &&
            world.geopolitical.farsistanEscalation >= 3,
        headline: 'Al-Farhan seals the Strait of Farsis completely. Navon puts Meridia on war footing. Barron authorizes naval escort operations. Oil hits $160. The Sentinel runs a countdown clock: "Days Since the Strait Closed."',
        magnitude: 'major',
        params: { mu: -0.08, b: 0.03, sigmaR: 0.008, theta: 0.04, lambda: 3.0 },
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
    {
        id: 'compound_aegis_war_crime',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.aegisDeployed &&
            world.pnth.aegisControversy >= 2 &&
            world.geopolitical.farsistanEscalation >= 2,
        headline: 'An Atlas Aegis autonomous targeting decision kills 34 civilians in a Farsistani border village. Kassis leaks the decision logs to The Continental. Gottlieb calls for Dirks\'s resignation. Navon denies involvement.',
        magnitude: 'major',
        params: { mu: -0.05, theta: 0.03, lambda: 2.5 },
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
        params: { mu: -0.06, theta: 0.04, lambda: 3.0, b: 0.02, sigmaR: 0.006 },
    },

    // -- Firm dynamics events -------------------------------------------------
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

    // ── High-mediaTrust gated events ──
    {
        id: 'media_tan_tip',
        category: 'media',
        likelihood: 2,
        headline: 'Rachel Tan calls with a heads-up: Okafor\'s committee is issuing subpoenas next week.',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => ctx.factions.mediaTrust >= 60 && world.investigations.okaforProbeStage >= 1,
        params: { xi: 0.005 },
        effects: () => { shiftFaction('regulatoryExposure', 2); },
    },
    {
        id: 'media_continental_profile',
        category: 'media',
        likelihood: 1,
        headline: 'The Continental runs a flattering profile: "The Quiet Strategist of Meridian Capital."',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.mediaTrust >= 70,
        effects: () => { shiftFaction('firmStanding', 3); shiftFaction('regulatoryExposure', 2); },
    },
    {
        id: 'media_hostile_profile',
        category: 'media',
        likelihood: 2,
        headline: 'The Continental publishes "Shadow Traders: Inside Meridian\'s Derivatives Machine."',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => ctx.factions.mediaTrust <= 20 && ctx.factions.regulatoryExposure >= 40,
        params: { xi: 0.005 },
        effects: () => { shiftFaction('regulatoryExposure', 5); shiftFaction('firmStanding', -3); },
    },

    // ── High-fedRelations gated events ──
    {
        id: 'fed_informal_signal',
        category: 'fed',
        likelihood: 1.5,
        headline: 'Hartley\'s deputy mentions over coffee that the committee is "leaning dovish" next meeting.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.fedRelations >= 65 && !world.fed.hartleyFired,
        params: { theta: -0.002 },
        effects: () => { shiftFaction('fedRelations', 1); },
    },
    {
        id: 'fed_rate_warning',
        category: 'fed',
        likelihood: 1.5,
        headline: 'A contact at the Fed warns you: "Tighten your duration exposure. Soon."',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.fedRelations >= 70 && world.fed.hikeCycle,
        effects: () => { shiftFaction('regulatoryExposure', 2); },
    },
    {
        id: 'fed_shut_out',
        category: 'fed',
        likelihood: 2,
        headline: 'Meridian\'s fixed-income desk is the last to hear about the rate decision. Again.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.factions.fedRelations <= 20,
        params: { sigmaR: 0.001 },
        effects: () => { shiftFaction('firmStanding', -1); },
    },

    // ── Political support gated events ──
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

    // ── Trait-gated events ──
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
    {
        id: 'tag_political_target',
        category: 'political',
        likelihood: 1.5,
        headline: 'A Farmer-Labor PAC runs an ad naming "Wall Street insiders who bankroll the Barron agenda." Your name is on it.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => hasTrait('political_player') && ctx.factions.federalistSupport > ctx.factions.farmerLaborSupport,
        effects: () => { shiftFaction('farmerLaborSupport', -5); shiftFaction('regulatoryExposure', 3); },
    },
    {
        id: 'tag_media_requests',
        category: 'media',
        likelihood: 2,
        headline: 'MarketWire, The Sentinel, and two podcasts want interviews this week. Compliance says pick one or none.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => hasTrait('media_figure'),
        effects: () => { shiftFaction('mediaTrust', 2); },
    },
    {
        id: 'tag_star_poached',
        category: 'neutral',
        likelihood: 0.5,
        headline: 'A rival fund makes a serious offer. Word gets back to Webb. He pretends not to care.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => hasTrait('meridian_star') && sim.day > 400,
        effects: () => { shiftFaction('firmStanding', 2); },
    },
    {
        id: 'tag_quiet_advantage',
        category: 'neutral',
        likelihood: 1,
        headline: 'While Riggs fields calls from regulators, your book runs clean. Nobody\'s watching.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => hasTrait('quiet_money') && ctx.factions.regulatoryExposure < 20,
        effects: () => { shiftFaction('firmStanding', 2); },
    },

    // ── Permanent-trait-gated events ──
    {
        id: 'conviction_insider_leak_risk',
        category: 'investigation',
        likelihood: 1,
        headline: 'A Farmer-Labor staffer tells Tan you were at the Willard Hotel the night before the tariff announcement.',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => ctx.traitIds.includes('washington_insider') && world.geopolitical.tradeWarStage >= 2,
        params: { xi: 0.005 },
        effects: () => { shiftFaction('regulatoryExposure', 5); shiftFaction('mediaTrust', -3); },
    },
    {
        id: 'conviction_ghost_clean',
        category: 'neutral',
        likelihood: 1.5,
        headline: 'Okafor\'s committee releases a list of traders under review. Your name isn\'t on it.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.traitIds.includes('ghost_protocol') && world.investigations.okaforProbeStage >= 1,
        effects: () => { shiftFaction('regulatoryExposure', -2); },
    },
    {
        id: 'conviction_profiteer_exposure',
        category: 'media',
        likelihood: 1.5,
        headline: 'MarketWire names you in "Traders Who Cleaned Up During the Crisis." Tan is asking questions.',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => ctx.traitIds.includes('crisis_profiteer') && (world.geopolitical.recessionDeclared || world.geopolitical.oilCrisis),
        effects: () => { shiftFaction('regulatoryExposure', 4); shiftFaction('mediaTrust', -2); shiftFaction('firmStanding', 2); },
    },
    {
        id: 'conviction_operator_bundler',
        category: 'political',
        likelihood: 1,
        headline: 'Both parties are asking you to bundle donations for the midterm cycle. Your compliance officer is not amused.',
        magnitude: 'minor',
        when: (sim, world, congress, ctx) => ctx.traitIds.includes('political_operator') && sim.day > 400,
        effects: () => { shiftFaction('federalistSupport', 2); shiftFaction('farmerLaborSupport', 2); shiftFaction('regulatoryExposure', 3); },
    },
    {
        id: 'conviction_leverage_contagion',
        category: 'neutral',
        likelihood: 1,
        headline: 'A mid-tier fund blows up on a similar book. Webb asks if your exposure overlaps. It does.',
        magnitude: 'moderate',
        when: (sim, world, congress, ctx) => ctx.traitIds.includes('master_of_leverage') && ctx.portfolio.grossLeverage > 2,
        params: { xi: 0.005 },
        effects: () => { shiftFaction('firmStanding', -3); shiftFaction('regulatoryExposure', 3); },
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
];


// -- Event-by-id lookup ---------------------------------------------------
let _eventById = null;

export function getEventById(id) {
    if (!_eventById) {
        _eventById = new Map();
        for (const ev of OFFLINE_EVENTS) _eventById.set(ev.id, ev);
    }
    return _eventById.get(id) || null;
}

// -- Startup validation: followup chain integrity -------------------------
const _referencedFollowupIds = new Set();
for (const ev of OFFLINE_EVENTS) {
    if (ev.followups) {
        for (const fu of ev.followups) _referencedFollowupIds.add(fu.id);
    }
}
for (const id of _referencedFollowupIds) {
    const ev = getEventById(id);
    if (!ev) console.warn(`[event-pool] followup references unknown event: '${id}'`);
    else if (!ev.followupOnly) console.warn(`[event-pool] followup target '${id}' missing followupOnly flag`);
}
for (const ev of OFFLINE_EVENTS) {
    if (ev.followupOnly && !_referencedFollowupIds.has(ev.id)) {
        console.warn(`[event-pool] '${ev.id}' has followupOnly but is never referenced as a followup`);
    }
}
