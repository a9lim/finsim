/* fed.js -- Federal Reserve events. */

import { shiftFaction } from '../faction-standing.js';
import { activateRegulation, deactivateRegulation } from '../regulations.js';

export const FED_EVENTS = [
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

    // ── One-shot compound: dollar crisis ──
    {
        id: 'compound_dollar_crisis',
        category: 'fed',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.fed.credibilityScore <= 3 && world.fed.hartleyFired,
        headline: 'With Hartley fired and Fed credibility in free fall, the dollar index breaks multi-year support. Priya Sharma: "We are witnessing the unthinkable — a reserve currency confidence crisis in real time."',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.04, theta: 0.02, sigmaR: 0.008, b: -0.01 },
    },
];
