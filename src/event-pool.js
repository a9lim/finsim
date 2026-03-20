/* ===================================================
   event-pool.js -- Offline event pool for Shoals.
   Category arrays, pool merge, and event-by-id lookup.
   =================================================== */

// -- Canonical parameter clamping ranges --------------------------------
export const PARAM_RANGES = {
    mu:     { min: -0.50, max: 0.50 },
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
        headline: 'FOMC holds rates steady; Hartley says policy is "well-positioned" and cites improving labor data',
        params: { mu: 0.01, theta: -0.003 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
    },
    {
        id: 'fed_hold_unanimous',
        category: 'fed',
        likelihood: 5,
        headline: 'Fed leaves rates unchanged in unanimous decision; statement language virtually identical to prior meeting',
        params: {},
        magnitude: 'minor',
    },
    {
        id: 'fed_hold_hawkish',
        category: 'fed',
        likelihood: 4,
        headline: 'Fed stands pat but Hartley warns of "balanced risks tilted to the upside"; bond yields tick higher',
        params: { mu: -0.01, theta: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
    },

    // -- Hike cycle chain ----------------------------------------------------
    {
        id: 'fed_signals_hike',
        category: 'fed',
        likelihood: 0.8,
        headline: 'Hartley signals tightening bias: "The committee is prepared to act if inflation proves persistent"',
        params: { mu: -0.015, theta: 0.005, sigmaR: 0.001 },
        magnitude: 'moderate',
        when: (sim, world) => sim.b < 0.15 && !world.fed.hartleyFired && !world.fed.hikeCycle,
        effects: (world) => { world.fed.hikeCycle = true; world.fed.cutCycle = false; },
        followups: [
            { id: 'fed_25bps_hike', mtth: 32, weight: 0.7 },
        ],
    },
    {
        id: 'fed_25bps_hike',
        category: 'fed',
        likelihood: 1.0,
        headline: 'FOMC raises rates 25bps in 8-1 vote; Hartley cites strong employment and sticky core inflation',
        params: { mu: -0.02, theta: 0.008, b: 0.0075, sigmaR: 0.001, lambda: 0.2 },
        magnitude: 'moderate',
        when: (sim, world) => sim.b < 0.15 && !world.fed.hartleyFired,
        followups: [
            { id: 'fed_second_hike', mtth: 32, weight: 0.5 },
            { id: 'fed_housing_pause', mtth: 45, weight: 0.3 },
        ],
    },
    {
        id: 'fed_second_hike',
        category: 'fed',
        likelihood: 0.8,
        headline: 'Fed hikes another 25bps in back-to-back meetings; Barron erupts on social media: "Hartley is KILLING the economy!"',
        params: { mu: -0.02, theta: 0.008, b: 0.0075, sigmaR: 0.001, lambda: 0.2 },
        magnitude: 'moderate',
        when: (sim, world) => sim.b < 0.15 && !world.fed.hartleyFired,
        effects: (world) => {
            world.fed.credibilityScore = Math.min(10, world.fed.credibilityScore + 1);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
    },
    {
        id: 'fed_housing_pause',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Mortgage applications plunge 30% as rates bite; Fed signals pause to "assess cumulative tightening"',
        params: { mu: 0.01, theta: -0.005, sigmaR: -0.001 },
        magnitude: 'minor',
        effects: (world) => { world.fed.hikeCycle = false; },
    },

    // -- Cut cycle chain -----------------------------------------------------
    {
        id: 'fed_signals_cut',
        category: 'fed',
        likelihood: 0.8,
        headline: 'Hartley pivots dovish: "Downside risks have increased materially"; markets price 80% chance of cut at next meeting',
        params: { mu: 0.02, theta: -0.005, sigmaR: 0.002 },
        magnitude: 'moderate',
        when: (sim, world) => sim.b > -0.03 && !world.fed.hartleyFired && !world.fed.cutCycle,
        effects: (world) => { world.fed.cutCycle = true; world.fed.hikeCycle = false; },
        followups: [
            { id: 'fed_50bps_emergency_cut', mtth: 20, weight: 0.5 },
        ],
    },
    {
        id: 'fed_50bps_emergency_cut',
        category: 'fed',
        likelihood: 0.6,
        headline: 'Fed slashes rates 50bps in emergency inter-meeting action; Hartley: "Extraordinary circumstances demand decisive response"',
        params: { mu: 0.04, theta: 0.015, b: -0.015, sigmaR: 0.005, lambda: 1.0 },
        magnitude: 'major',
        when: (sim, world) => sim.b > -0.03,
    },

    // -- QE restart ----------------------------------------------------------
    {
        id: 'fed_qe_restart',
        category: 'fed',
        likelihood: 0.3,
        headline: 'Fed announces open-ended QE: $120B/month in Treasury and MBS purchases; "whatever it takes" language deployed',
        params: { mu: 0.05, theta: -0.015, b: -0.01, sigmaR: -0.003, lambda: -0.5 },
        magnitude: 'major',
        when: (sim, world) => !world.fed.qeActive && sim.b < 0.02,
        effects: (world) => { world.fed.qeActive = true; },
    },

    // -- Minutes leaks -------------------------------------------------------
    {
        id: 'fed_minutes_hawkish',
        category: 'fed',
        likelihood: 1.2,
        headline: 'FOMC minutes reveal "several participants" favored larger hike; markets reprice terminal rate higher',
        params: { mu: -0.01, theta: 0.004, b: 0.002 },
        magnitude: 'minor',
        when: (sim, world) => sim.b < 0.12,
    },
    {
        id: 'fed_minutes_dovish',
        category: 'fed',
        likelihood: 1.2,
        headline: 'FOMC minutes show broad agreement that risks have shifted; "a majority saw the case for easing in coming meetings"',
        params: { mu: 0.01, theta: -0.003, b: -0.002 },
        magnitude: 'minor',
        when: (sim, world) => sim.b > 0.0,
    },

    // -- Barron-Hartley feud -------------------------------------------------
    {
        id: 'barron_pressures_hartley',
        category: 'fed',
        likelihood: 1.5,
        headline: 'Barron renews attacks on Fed Chair: "Hartley has NO idea what she\'s doing. Rates should be ZERO. She should be fired!"',
        params: { mu: -0.005, theta: 0.004, sigmaR: 0.002 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired,
        effects: (world) => {
            world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 2);
        },
    },
    {
        id: 'hartley_pushes_back',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Hartley in rare public statement: "The Federal Reserve will not be swayed by political pressure. Our mandate is clear."',
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
        headline: 'Barron tells Fox Business: "I have the power to fire Hartley and I\'m seriously considering it." DOJ reviewing legal authority',
        params: { mu: -0.03, theta: 0.02, sigmaR: 0.008, lambda: 1.0 },
        magnitude: 'moderate',
        when: (sim, world) => world.election.barronApproval > 40 && !world.fed.hartleyFired,
        effects: (world) => {
            world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 3);
        },
        followups: [
            { id: 'barron_fires_hartley', mtth: 25, weight: 0.3 },
        ],
    },
    {
        id: 'barron_fires_hartley',
        category: 'fed',
        likelihood: 0.15,
        headline: 'BREAKING: Barron fires Fed Chair Hartley via executive order; constitutional crisis erupts as markets plunge',
        params: { mu: -0.04, theta: 0.05, sigmaR: 0.02, lambda: 3.0 },
        magnitude: 'major',
        when: (sim, world, congress) => congress.trifecta && world.fed.credibilityScore <= 4 && !world.fed.hartleyFired,
        effects: (world) => {
            world.fed.hartleyFired = true;
            world.fed.credibilityScore = 0;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 10);
        },
        followups: [
            { id: 'markets_panic_hartley_fired', mtth: 3, weight: 0.9 },
            { id: 'vane_nominated', mtth: 10, weight: 0.8 },
            { id: 'scotus_hartley_case', mtth: 40, weight: 0.5 },
        ],
    },
    {
        id: 'markets_panic_hartley_fired',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Global sell-off accelerates: S&P futures limit-down overnight; Treasury yields spike 40bps as foreign central banks scramble',
        params: { mu: -0.06, theta: 0.04, lambda: 2.0, muJ: -0.05, sigmaR: 0.01 },
        magnitude: 'major',
    },
    {
        id: 'vane_nominated',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Barron nominates Governor Marcus Vane as new Fed Chair; Vane pledges to "restore growth-oriented monetary policy"',
        params: { mu: 0.01, theta: 0.01, sigmaR: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.fed.hartleyFired,
        followups: [
            { id: 'vane_confirmed', mtth: 30, weight: 0.6 },
            { id: 'vane_rejected', mtth: 30, weight: 0.4 },
        ],
    },
    {
        id: 'vane_confirmed',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Senate confirms Vane 51-49 along party lines; new Chair immediately signals aggressive rate cuts ahead',
        params: { mu: 0.03, theta: 0.02, b: -0.02, sigmaR: 0.01, lambda: 0.5 },
        magnitude: 'major',
        when: (sim, world, congress) => congress.fedControlsSenate && world.fed.hartleyFired && !world.fed.vaneAppointed,
        effects: (world) => {
            world.fed.vaneAppointed = true;
            world.fed.cutCycle = true;
            world.fed.hikeCycle = false;
        },
    },
    {
        id: 'vane_rejected',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Senate rejects Vane nomination 48-52; two Federalist moderates break ranks. Fed left leaderless, acting Chair appointed',
        params: { mu: -0.02, theta: 0.015, sigmaR: 0.008, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.fedControlsSenate && world.fed.hartleyFired && !world.fed.vaneAppointed,
    },
    {
        id: 'scotus_hartley_case',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Supreme Court agrees to hear Hartley v. United States on expedited basis; oral arguments set for next month',
        params: { mu: 0.01, theta: 0.01, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim, world) => world.fed.hartleyFired,
    },

    // -- Vane dissent (flavor) -----------------------------------------------
    {
        id: 'vane_dissents',
        category: 'fed',
        likelihood: 1.5,
        headline: 'Governor Vane dissents for the fifth consecutive meeting, calling rates "excessively restrictive"; Barron tweets support',
        params: { mu: -0.003, theta: 0.002, sigmaR: 0.001 },
        magnitude: 'minor',
        when: (sim, world) => !world.fed.hartleyFired && !world.fed.vaneAppointed,
    },

    // -- Reverse repo spike --------------------------------------------------
    {
        id: 'reverse_repo_spike',
        category: 'fed',
        likelihood: 0.8,
        headline: 'Reverse repo facility usage surges past $2.5T; money market funds park cash at Fed as T-bill supply tightens',
        params: { b: 0.002, sigmaR: 0.002, theta: 0.003 },
        magnitude: 'minor',
    },
];
const MACRO_EVENTS = [];
const PNTH_EVENTS = [
    // =====================================================================
    //  ARC 1: THE GOTTLIEB-DIRKS WAR
    // =====================================================================

    // -- Inciting incident chain -------------------------------------------
    {
        id: 'gottlieb_ethics_keynote',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'PNTH CEO Gottlieb delivers blistering keynote: "We built Atlas to heal, not to kill. I will not let this company become a weapons factory"',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks >= 6,
        followups: [
            { id: 'dirks_cnbc_rebuttal', mtth: 10, weight: 0.8 },
        ],
    },
    {
        id: 'dirks_cnbc_rebuttal',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks fires back on CNBC: "Eugene is a brilliant engineer but a naive businessman. Defense contracts are our fastest-growing segment"',
        params: { mu: 0.01, theta: 0.008, lambda: 0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        followups: [
            { id: 'board_closed_session', mtth: 20, weight: 0.7 },
            { id: 'kassis_caught_middle', mtth: 15, weight: 0.5 },
        ],
    },
    {
        id: 'board_closed_session',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board convenes emergency closed session; sources say "the room was nuclear" as Dirks and Gottlieb factions clash',
        params: { mu: -0.01, theta: 0.01, lambda: 0.4 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        followups: [
            { id: 'gottlieb_stripped_oversight', mtth: 15, weight: 0.5 },
            { id: 'dirks_blocked', mtth: 15, weight: 0.3 },
            { id: 'board_compromise', mtth: 10, weight: 0.5 },
        ],
    },

    // -- Board closed session branches ------------------------------------
    {
        id: 'gottlieb_stripped_oversight',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board votes 8-2 to strip Gottlieb of product oversight; CEO title retained but authority gutted. Gottlieb "considering all options"',
        params: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'major',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks >= 8,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
        followups: [
            { id: 'gottlieb_resigns', mtth: 25, weight: 0.6 },
            { id: 'gottlieb_digs_in', mtth: 20, weight: 0.4 },
        ],
    },
    {
        id: 'dirks_blocked',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'In surprise upset, PNTH board blocks Dirks\' military expansion plan 6-4; Gottlieb allies hold firm. Dirks visibly furious leaving boardroom',
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
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board reaches fragile compromise: defense contracts continue but with new ethics review process. Both sides claim victory',
        params: { mu: 0.01, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },

    // -- Kassis branch ----------------------------------------------------
    {
        id: 'kassis_caught_middle',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'CTO Kassis breaks silence in internal all-hands: "I didn\'t leave Google to build targeting systems." Standing ovation from engineers, cold stares from defense team',
        params: { mu: -0.01, theta: 0.008 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira && world.pnth.ceoIsGottlieb,
        followups: [
            { id: 'kassis_sides_gottlieb', mtth: 20, weight: 0.4 },
            { id: 'kassis_sides_dirks', mtth: 20, weight: 0.3 },
            { id: 'kassis_quits', mtth: 20, weight: 0.3 },
        ],
    },
    {
        id: 'kassis_sides_gottlieb',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis publicly backs Gottlieb in board letter signed by 200+ engineers; "Atlas was built for medicine, climate, and discovery — not warfare"',
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
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis reverses course after private meeting with Dirks; sources say she was shown classified Pentagon briefing on Zhaowei\'s military AI',
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
        headline: 'BREAKING: PNTH CTO Mira Kassis resigns effective immediately. LinkedIn post: "I cannot in good conscience remain at a company at war with itself"',
        params: { mu: -0.04, theta: 0.02, lambda: 0.6, muJ: -0.02 },
        magnitude: 'major',
        when: (sim, world) => world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.ctoIsMira = false;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },

    // -- Gottlieb resignation chain ---------------------------------------
    {
        id: 'gottlieb_resigns',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: PNTH CEO Eugene Gottlieb resigns. In emotional letter to employees: "I built this company to make the world better. I no longer believe it will."',
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.04 },
        magnitude: 'major',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        effects: (world) => {
            world.pnth.ceoIsGottlieb = false;
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1);
            world.pnth.boardDirks = Math.min(10, world.pnth.boardDirks + 1);
        },
        followups: [
            { id: 'successor_search', mtth: 20, weight: 0.8 },
            { id: 'gottlieb_covenant_ai', mtth: 60, weight: 0.4 },
        ],
    },
    {
        id: 'gottlieb_digs_in',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb hires activist defense attorney, signals he will fight removal: "They\'ll have to drag me out. This is still my company"',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        followups: [
            { id: 'gottlieb_lawsuit', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'gottlieb_lawsuit',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb files suit against PNTH board alleging breach of fiduciary duty; seeks injunction restoring oversight powers. Discovery could expose Bowman ties',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },
    {
        id: 'successor_search',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH retains Spencer Stuart for CEO search; Dirks named interim CEO. Street skeptical of "foxes guarding the henhouse" governance',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.ceoIsGottlieb,
    },
    {
        id: 'gottlieb_covenant_ai',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb announces Covenant AI, a "safety-first" rival to PNTH. Backed by $2B from Sequoia and a16z. Immediately poaches 40 PNTH engineers',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.ceoIsGottlieb,
        effects: (world) => {
            world.pnth.gottliebStartedRival = true;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },

    // -- Dirks proxy fight / board dynamics --------------------------------
    {
        id: 'dirks_proxy_fight',
        category: 'pnth',
        likelihood: 0.6,
        headline: 'Dirks launches proxy fight to replace two Gottlieb-aligned board members; solicits support from institutional holders controlling 35% of shares',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks < 9,
        followups: [
            { id: 'dirks_proxy_wins', mtth: 25, weight: 0.5 },
            { id: 'dirks_proxy_loses', mtth: 25, weight: 0.5 },
        ],
    },
    {
        id: 'dirks_proxy_wins',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks prevails in proxy vote; two new defense-friendly directors seated. Board now firmly in Dirks camp. Gottlieb allies down to two seats',
        params: { mu: 0.02, theta: 0.008, lambda: 0.2 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.boardDirks = Math.min(10, world.pnth.boardDirks + 2);
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 2);
        },
    },
    {
        id: 'dirks_proxy_loses',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks proxy fight fails as ISS recommends against her nominees; institutional investors side with Gottlieb on governance concerns',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
        },
    },
    {
        id: 'dirks_resigns',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH Chairwoman Dirks steps down citing "irreconcilable differences" with management; VP Bowman\'s office releases terse one-line statement',
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
        headline: 'Crescent Capital discloses 8.1% stake in PNTH via 13D filing; demands board overhaul, threatens to nominate four independent directors',
        params: { mu: 0.03, theta: 0.02, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.activistStakeRevealed && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.activistStakeRevealed = true;
        },
        followups: [
            { id: 'activist_board_seats', mtth: 35, weight: 0.6 },
            { id: 'activist_buyback_demand', mtth: 20, weight: 0.4 },
        ],
    },
    {
        id: 'activist_board_seats',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Crescent Capital wins two board seats in consent solicitation; new directors demand strategic review including potential sale',
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
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Crescent Capital publishes open letter demanding $5B buyback and cost cuts; says PNTH "trades at a conglomerate discount due to governance chaos"',
        params: { mu: 0.03, theta: -0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.activistStakeRevealed,
    },

    // -- Hostile takeover -------------------------------------------------
    {
        id: 'hostile_takeover_bid',
        category: 'pnth',
        likelihood: 0.1,
        headline: 'BREAKING: Northvane Technologies launches $68B hostile bid for PNTH at 45% premium; "the internal dysfunction has created a generational buying opportunity"',
        params: { mu: 0.08, theta: 0.04, lambda: 2.0 },
        magnitude: 'major',
        when: (sim, world) => (world.pnth.boardDirks <= 5 || (world.pnth.dojSuitFiled && world.pnth.whistleblowerFiled)) && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.acquired = true;
        },
    },

    // -- Both ousted (rare, requires multiple scandal flags) ---------------
    {
        id: 'both_ousted',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board fires both Dirks and Gottlieb in extraordinary session; independent directors take control. "A fresh start," says acting Chair. Street reels',
        params: { mu: -0.04, theta: 0.035, lambda: 1.5, muJ: -0.03 },
        magnitude: 'major',
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
        likelihood: 0.7,
        headline: 'The Continental reports VP Bowman held $4M in PNTH stock while lobbying Pentagon for Atlas AI contract; White House calls it "old news"',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.senateProbeLaunched,
        followups: [
            { id: 'senate_investigation_opened', mtth: 30, weight: 0.5 },
            { id: 'bowman_intervenes', mtth: 15, weight: 0.4 },
        ],
    },
    {
        id: 'aclu_lawsuit_surveillance',
        category: 'pnth',
        likelihood: 0.6,
        headline: 'ACLU files landmark suit alleging PNTH battlefield AI used for mass surveillance of civilians; seeks injunction blocking Department of War contracts',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.militaryContractActive,
    },
    {
        id: 'senate_investigation_opened',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Sen. Okafor opens formal Senate Intelligence Committee investigation into PNTH-Bowman ties; subpoenas issued for financial records',
        params: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.senateProbeLaunched,
        effects: (world) => {
            world.pnth.senateProbeLaunched = true;
            world.investigations.okaforProbeStage = Math.max(world.investigations.okaforProbeStage, 1);
        },
        followups: [
            { id: 'congressional_hearing_pnth', mtth: 25, weight: 0.7 },
        ],
    },
    {
        id: 'doj_antitrust_suit',
        category: 'pnth',
        likelihood: 0.4,
        headline: 'DOJ files antitrust suit against PNTH alleging monopolistic control of government AI procurement; stock drops sharply on headline',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.dojSuitFiled && world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.dojSuitFiled = true;
        },
    },
    {
        id: 'bowman_intervenes',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'VP Bowman calls PNTH contracts "vital to national security" and pressures DOD to fast-track renewals; stock rallies on government support signal',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.senateProbeLaunched,
    },
    {
        id: 'congressional_hearing_pnth',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks and Gottlieb testify before Senate Intelligence Committee; Okafor grills Dirks on Bowman meetings. Gottlieb: "I warned the board repeatedly"',
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
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Three of five PNTH ethics advisory board members resign in protest; joint statement says company "systematically ignored our recommendations"',
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
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: Senior PNTH engineer files SEC whistleblower complaint alleging company falsified safety testing on Atlas military modules',
        params: { mu: -0.07, theta: 0.03, lambda: 1.5, muJ: -0.04 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.whistleblowerFiled,
        effects: (world) => {
            world.pnth.whistleblowerFiled = true;
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
        },
    },

    // =====================================================================
    //  ROUTINE PNTH (~14 events)
    // =====================================================================
    {
        id: 'defense_contract_won',
        category: 'pnth',
        likelihood: 0.7,
        headline: 'PNTH wins $3.2B Department of War contract for Atlas AI battlefield integration; largest defense AI award in history',
        params: { mu: 0.06, theta: -0.01, lambda: -0.4 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.militaryContractActive && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.militaryContractActive = true;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'defense_contract_cancelled',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'Pentagon cancels PNTH Atlas contract citing "unresolved governance concerns"; $3.2B evaporates overnight. Dirks scrambles to save deal',
        params: { mu: -0.05, theta: 0.02, lambda: 0.8, muJ: -0.03 },
        magnitude: 'major',
        when: (sim, world) => world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.militaryContractActive = false;
        },
    },
    {
        id: 'dhs_contract_renewal',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'DHS quietly renews PNTH border surveillance contract for another 3 years; $800M deal draws little public attention',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'atlas_product_launch',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'PNTH unveils Atlas AI for Healthcare: diagnostic imaging, drug discovery, clinical trials. Gottlieb: "This is what we were built for"',
        params: { mu: 0.04, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'cloud_partnership',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH announces strategic cloud partnership with major hyperscaler; Atlas AI to be offered as managed service. Analysts raise price targets',
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
        likelihood: 1.5,
        headline: 'Goldman initiates PNTH at Overweight with $240 price target; cites "unmatched AI moat" and defense revenue visibility',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'analyst_downgrade',
        category: 'pnth',
        likelihood: 1.5,
        headline: 'Morgan Stanley downgrades PNTH to Equal Weight; "governance overhang makes risk/reward unfavorable despite strong fundamentals"',
        params: { mu: -0.02, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'hires_cto_kassis',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'PNTH hires back Mira Kassis as CTO after five-month absence; negotiated expanded authority over product safety. Engineers cheer',
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
        headline: 'PNTH annual shareholder meeting draws record attendance; heated Q&A on military contracts, governance, and Bowman relationship',
        params: { mu: -0.005, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'patent_suit_rival',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'DeepStar Labs sues PNTH for patent infringement on transformer architecture; seeks injunction and $1.5B in damages',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_hyperscaler_deal',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'PNTH signs multi-year inference partnership with top-3 cloud provider; guaranteed $1.8B minimum commitment. Commercial pivot gains traction',
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
            let base = 0.4;
            if (!world.pnth.ctoIsMira) base += 0.3;
            if (world.pnth.gottliebStartedRival) base += 0.4;
            return base;
        },
        headline: 'PNTH loses 15% of senior research staff in a single quarter; departures accelerating to Covenant AI and Big Tech. "Brain drain is real," says recruiter',
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
        likelihood: 1.0,
        headline: 'PNTH board authorizes $3B accelerated share buyback program; Dirks: "The market dramatically undervalues this company"',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.boardDirks >= 6,
    },
    {
        id: 'pnth_data_center_fire',
        category: 'pnth',
        likelihood: 0.3,
        headline: 'Fire at PNTH primary data center in Ashburn; Atlas AI services offline for 18 hours. Insurance covers damage but customer trust shaken',
        params: { mu: -0.03, theta: 0.015, lambda: 0.6, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
];

const PNTH_EARNINGS_EVENTS = [
    {
        id: 'pnth_earnings_beat_strong',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 1.0;
            if (world.pnth.commercialMomentum > 0) base += 0.8;
            if (world.pnth.militaryContractActive) base += 0.3;
            return base;
        },
        headline: 'PNTH crushes estimates: revenue +32% YoY, Atlas AI bookings up 60%. Raises full-year guidance. Stock surges after hours',
        params: { mu: 0.04, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_earnings_beat_mild',
        category: 'pnth_earnings',
        likelihood: 2.0,
        headline: 'PNTH edges past consensus: EPS $1.42 vs $1.38 expected. Revenue in line. Guidance maintained. "Solid but unspectacular," says Barclays',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_earnings_inline',
        category: 'pnth_earnings',
        likelihood: 3.0,
        headline: 'PNTH reports exactly in line with consensus; no guidance change. Conference call focused on governance questions rather than financials',
        params: { mu: 0.005, theta: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_earnings_miss_mild',
        category: 'pnth_earnings',
        likelihood: 2.0,
        headline: 'PNTH misses on revenue, beats on EPS via cost cuts. Management blames "contract timing delays." Analysts question organic growth trajectory',
        params: { mu: -0.02, theta: 0.008, lambda: 0.3 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_earnings_miss_bad',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 0.8;
            if (world.pnth.commercialMomentum < 0) base += 0.5;
            if (world.investigations.okaforProbeStage >= 2) base += 0.4;
            if (!world.pnth.ctoIsMira) base += 0.2;
            return base;
        },
        headline: 'PNTH disaster quarter: revenue misses by 12%, operating loss widens, three major customers paused contracts. Guidance slashed. Dirks faces board questions',
        params: { mu: -0.04, theta: 0.015, lambda: 0.6, muJ: -0.02 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'pnth_guidance_raise',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 1.0;
            if (world.pnth.commercialMomentum >= 2) base += 0.5;
            return base;
        },
        headline: 'PNTH raises full-year revenue guidance by 15% citing "unprecedented enterprise AI adoption"; lifts margin target. Bull case intact',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
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
        headline: 'PNTH slashes guidance mid-quarter citing "regulatory headwinds and customer hesitation"; withdraws full-year outlook entirely. CFO: "Visibility is low"',
        params: { mu: -0.03, theta: 0.012, lambda: 0.5, muJ: -0.01 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
];
const SECTOR_EVENTS = [];
const POLITICAL_EVENTS = [];
const INVESTIGATION_EVENTS = [];
const COMPOUND_EVENTS = [];
const MIDTERM_EVENTS = [];

// -- Neutral / flavor events (~25) ----------------------------------------
// High likelihood, minor magnitude, tiny params.
// World-state-aware flavor text that references the Shoals universe.

const NEUTRAL_EVENTS = [
    {
        id: 'barron_golfing',
        category: 'neutral',
        likelihood: 5,
        headline: 'President Barron spotted at Mar-a-Lago golf course for the third consecutive weekend; no policy announcements expected',
        params: { mu: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.mideastEscalation < 2,
    },
    {
        id: 'barron_cryptic_tweet_1',
        category: 'neutral',
        likelihood: 5,
        headline: 'Barron posts cryptic late-night tweet: "Big things coming. Very big. Markets will love it." No further details',
        params: { theta: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'barron_cryptic_tweet_2',
        category: 'neutral',
        likelihood: 4,
        headline: 'Barron tweets "The Fake News won\'t tell you, but PNTH is doing TREMENDOUS things for this country." Stock ticks up briefly',
        params: { mu: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'barron_speech_no_policy',
        category: 'neutral',
        likelihood: 4,
        headline: 'President Barron delivers 90-minute speech at rally; analysts note zero policy substance amid crowd-pleasing rhetoric',
        params: { mu: -0.001 },
        magnitude: 'minor',
    },
    {
        id: 'gottlieb_ted_talk',
        category: 'neutral',
        likelihood: 3,
        headline: 'Gottlieb delivers TED talk on "Ethical AI in an Age of Acceleration"; standing ovation, no market impact',
        params: { mu: 0.004 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },
    {
        id: 'kassis_hackathon',
        category: 'neutral',
        likelihood: 3,
        headline: 'PNTH CTO Mira Kassis demos Atlas AI capabilities at company hackathon; viral clip boosts employer brand',
        params: { mu: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ctoIsMira,
    },
    {
        id: 'hartley_jackson_hole',
        category: 'neutral',
        likelihood: 3,
        headline: 'Fed Chair Hartley delivers measured Jackson Hole keynote; reaffirms data-dependent approach, markets shrug',
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
        headline: 'Robin Clay gives commencement address at Georgetown, subtly criticizes current administration\'s trade policy',
        params: { mu: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'congressional_recess',
        category: 'neutral',
        likelihood: 4,
        headline: 'Congress begins scheduled recess; no legislation expected for two weeks. Traders enjoy the quiet',
        params: { theta: -0.002 },
        magnitude: 'minor',
        when: (sim, world) => world.investigations.impeachmentStage === 0,
    },
    {
        id: 'zhaowei_conference',
        category: 'neutral',
        likelihood: 3,
        headline: 'Zhaowei CEO Liang Wei showcases new chip architecture at Beijing AI Forum; analysts see PNTH rival closing gap',
        params: { mu: -0.002 },
        magnitude: 'minor',
    },
    {
        id: 'markets_drift_sideways_1',
        category: 'neutral',
        likelihood: 6,
        headline: 'Markets drift sideways on light volume; traders await next catalyst',
        params: { mu: 0.001, theta: -0.001 },
        magnitude: 'minor',
    },
    {
        id: 'markets_drift_sideways_2',
        category: 'neutral',
        likelihood: 6,
        headline: 'Another quiet session as major indices trade in a tight range; VIX slips below 14',
        params: { theta: -0.002 },
        magnitude: 'minor',
    },
    {
        id: 'markets_drift_sideways_3',
        category: 'neutral',
        likelihood: 5,
        headline: 'Low-conviction session: breadth flat, volume below 30-day average, no sector leadership',
        params: { mu: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'holiday_thin_volume',
        category: 'neutral',
        likelihood: 4,
        headline: 'Holiday-shortened week sees thin volumes; institutional desks running skeleton crews',
        params: { theta: -0.003, lambda: -0.1 },
        magnitude: 'minor',
    },
    {
        id: 'sector_rotation_flavor',
        category: 'neutral',
        likelihood: 4,
        headline: 'Sector rotation continues as money flows from growth to value; net index impact negligible',
        params: { mu: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'opex_positioning',
        category: 'neutral',
        likelihood: 3,
        headline: 'Options expiration approaching; dealers adjust hedges as gamma exposure shifts near key strikes',
        params: { theta: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'overseas_markets_flat',
        category: 'neutral',
        likelihood: 5,
        headline: 'European and Asian bourses close mixed; no clear signal for U.S. open',
        params: { mu: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'buyback_season',
        category: 'neutral',
        likelihood: 3,
        headline: 'Corporate buyback window reopens post-earnings; S&P constituents authorized $180B in repurchases this quarter',
        params: { mu: 0.005, theta: -0.002 },
        magnitude: 'minor',
    },
    {
        id: 'bond_auction_tepid',
        category: 'neutral',
        likelihood: 4,
        headline: '10-year Treasury auction draws tepid demand; tail of 1.2bps, bid-to-cover at 2.31x',
        params: { b: 0.001, sigmaR: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'retail_sales_inline',
        category: 'neutral',
        likelihood: 4,
        headline: 'Retail sales come in exactly at consensus (+0.3% m/m); no revision to prior month. Markets unmoved',
        params: { mu: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_investor_conference',
        category: 'neutral',
        likelihood: 3,
        headline: 'PNTH holds annual investor conference; Gottlieb reiterates long-term vision, no guidance change',
        params: { mu: 0.004, theta: -0.001 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },
    {
        id: 'meme_stock_day',
        category: 'neutral',
        likelihood: 3,
        headline: 'Retail traders pile into meme stocks again; social media forums light up but index impact minimal',
        params: { theta: 0.003, xi: 0.01 },
        magnitude: 'minor',
    },
    {
        id: 'mixed_economic_data',
        category: 'neutral',
        likelihood: 5,
        headline: 'Mixed economic signals: jobless claims tick up while ISM manufacturing beats; markets chop in a narrow range',
        params: { mu: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'approval_mean_revert',
        category: 'neutral',
        likelihood: 4,
        headline: 'Latest polling shows slight shift in presidential approval; pundits debate whether the trend is meaningful',
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
        headline: 'Flash crash: Dow plunges 1,200 points in 8 minutes before partial recovery; SEC halts trading in dozens of names',
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
        headline: 'Coordinated short squeeze sends heavily-shorted basket up 40%; brokerages scramble to locate shares as borrow rates spike',
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
        headline: 'Repo market seizure: overnight rates spike to 8% as dealers hoard reserves; Fed forced into emergency operations',
        params: { mu: -0.05, theta: 0.035, lambda: 2.0, muJ: -0.04, borrowSpread: 0.8 },
        magnitude: 'major',
        followups: [
            { id: 'fed_emergency_repo', mtth: 3, weight: 0.8 },
        ],
    },
    {
        id: 'opex_vol_spike',
        category: 'market',
        likelihood: 0.5,
        headline: 'Triple witching unleashes vol spike as $4.2T in options expire; market makers delta-hedge furiously, whipsawing indices',
        params: { theta: 0.02, lambda: 1.0, xi: 0.08 },
        magnitude: 'moderate',
    },
    {
        id: 'algo_glitch',
        category: 'market',
        likelihood: 0.3,
        headline: 'Erroneous algo order floods exchange with $2B in sell orders in 90 seconds; firm issues "fat finger" statement',
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
        headline: 'Leveraged vol ETP liquidation cascade: inverse-VIX fund NAV collapses 90%, forced rebalancing hammers futures',
        params: { mu: -0.06, theta: 0.05, lambda: 3.5, muJ: -0.05, xi: 0.2, rho: -0.1 },
        magnitude: 'major',
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
        headline: 'Prime brokers issue wave of margin calls across hedge fund complex; forced liquidation drives broad-based selling',
        params: { mu: -0.04, theta: 0.03, lambda: 2.5, muJ: -0.04, xi: 0.1, borrowSpread: 0.5 },
        magnitude: 'major',
    },
    {
        id: 'low_vol_grind',
        category: 'market',
        likelihood: 1.5,
        headline: 'VIX touches single digits as realized vol plumbs post-crisis lows; strategists warn of complacency, but dip-buyers remain in control',
        params: { theta: -0.015, lambda: -0.8, xi: -0.08 },
        magnitude: 'moderate',
        when: (sim, world) => sim.theta < 0.06 && sim.lambda < 1.5,
    },
    {
        id: 'circuit_breaker_reform',
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC finalizes new circuit breaker rules following recent market disruption; wider bands, faster resets',
        params: { theta: -0.01, lambda: -0.5 },
        magnitude: 'minor',
    },
    {
        id: 'sec_flash_investigation',
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC opens formal investigation into flash crash triggers; subpoenas issued to six high-frequency trading firms',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'sec_squeeze_investigation',
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC probes social-media coordination behind short squeeze; congressional hearings announced',
        params: { theta: 0.005, borrowSpread: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'sec_algo_review',
        category: 'market',
        likelihood: 1.0,
        headline: 'SEC proposes mandatory kill switches for algorithmic trading systems; industry pushes back on compliance costs',
        params: { mu: -0.005, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'fed_emergency_repo',
        category: 'market',
        likelihood: 1.0,
        headline: 'Fed announces emergency repo facility with uncapped allotment; overnight rates normalize within hours',
        params: { mu: 0.02, theta: -0.015, lambda: -0.5, borrowSpread: -0.4 },
        magnitude: 'moderate',
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
    ...INVESTIGATION_EVENTS,
    ...COMPOUND_EVENTS,
    ...MIDTERM_EVENTS,
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
