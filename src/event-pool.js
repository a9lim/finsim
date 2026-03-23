/* ===================================================
   event-pool.js -- Offline event pool for Shoals.
   Category arrays, pool merge, and event-by-id lookup.
   =================================================== */

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
        headline: 'FOMC holds rates steady; Hartley says policy is "well-positioned" and cites improving labor data',
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
        magnitude: 'moderate',
        when: (sim, world) => sim.b < 0.15 && !world.fed.hartleyFired && !world.fed.hikeCycle,
        popup: true,
        era: 'early',
        context: (sim, world, portfolio) =>
            'Fed Chair Hartley just telegraphed a hawkish pivot at a Brookings panel. Bond futures are already selling off in after-hours. The desk expects a 25bps hike within two meetings. Your portfolio needs to be positioned before the street fully reprices.',
        choices: [
            {
                label: 'Front-run the hike',
                desc: 'Short bonds and reduce equity exposure ahead of tightening.',
                deltas: { mu: -0.02, theta: 0.008, sigmaR: 0.002 },
                effects: [
                    { path: 'fed.hikeCycle', op: 'set', value: true },
                    { path: 'fed.cutCycle', op: 'set', value: false },
                ],
                followups: [{ id: 'fed_25bps_hike', mtth: 28, weight: 0.8 }],
                playerFlag: 'front_ran_hike_signal',
                resultToast: 'You positioned short duration ahead of the crowd. The hike cycle is underway.',
            },
            {
                label: 'Hold steady',
                desc: 'Wait for confirmation before repositioning. The signal could be a bluff.',
                deltas: { mu: -0.015, theta: 0.005, sigmaR: 0.001 },
                effects: [
                    { path: 'fed.hikeCycle', op: 'set', value: true },
                    { path: 'fed.cutCycle', op: 'set', value: false },
                ],
                followups: [{ id: 'fed_25bps_hike', mtth: 32, weight: 0.7 }],
                playerFlag: 'held_through_hike_signal',
                resultToast: 'You wait for the actual hike. Markets drift lower on the hawkish rhetoric.',
            },
            {
                label: 'Fade the signal',
                desc: 'Buy the dip. Hartley has bluffed before and the economy is slowing.',
                deltas: { mu: -0.01, theta: 0.003, sigmaR: 0.001 },
                effects: [
                    { path: 'fed.hikeCycle', op: 'set', value: true },
                    { path: 'fed.cutCycle', op: 'set', value: false },
                ],
                followups: [{ id: 'fed_25bps_hike', mtth: 35, weight: 0.6 }],
                playerFlag: 'faded_hike_signal',
                resultToast: 'A contrarian bet. If Hartley follows through, you\'ll be offside.',
            },
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
        portfolioFlavor: (portfolio) => {
            const bondQty = portfolio.positions.filter(p => p.type === 'bond').reduce((s, p) => s + p.qty, 0);
            if (bondQty > 5) return 'Your long bond book is taking a hit as yields reprice higher.';
            if (bondQty < -5) return 'Your short bond position is printing. Duration paid off.';
            return null;
        },
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
        magnitude: 'major',
        when: (sim, world) => sim.b > -0.03,
        popup: true,
        era: 'mid',
        context: (sim, world, portfolio) =>
            'The Fed just announced an emergency 50bps inter-meeting cut. This is panic territory -- the last time the Fed acted between meetings was 2008. Futures are whipsawing. The desk needs to decide how to play the aftermath before Asia opens.',
        choices: [
            {
                label: 'Ride the rally',
                desc: 'Go long into the liquidity wave. Emergency cuts mean the Fed put is back.',
                deltas: { mu: 0.05, theta: 0.01, b: -0.015, sigmaR: 0.004, lambda: 0.8 },
                effects: [],
                playerFlag: 'rode_emergency_cut_rally',
                resultToast: 'You lean into the Fed put. Risk assets surge on the liquidity injection.',
            },
            {
                label: 'Hedge the tail',
                desc: 'The emergency cut signals something is broken. Buy protection.',
                deltas: { mu: 0.03, theta: 0.02, b: -0.015, sigmaR: 0.006, lambda: 1.5 },
                effects: [],
                playerFlag: 'hedged_emergency_cut',
                resultToast: 'You buy vol and puts. If the cut signals deeper trouble, you\'re covered.',
            },
            {
                label: 'Sell into strength',
                desc: 'Emergency cuts are a sign of desperation. Fade the pop and get defensive.',
                deltas: { mu: 0.02, theta: 0.025, b: -0.015, sigmaR: 0.008, lambda: 1.2 },
                effects: [],
                playerFlag: 'faded_emergency_cut',
                resultToast: 'You sell the relief rally. If markets realize the cut was desperation, you profit.',
            },
        ],
    },

    // -- QE restart ----------------------------------------------------------
    {
        id: 'fed_qe_restart',
        category: 'fed',
        likelihood: 0.3,
        headline: 'Fed announces open-ended QE: $120B/month in Treasury and MBS purchases; "whatever it takes" language deployed',
        magnitude: 'major',
        when: (sim, world) => !world.fed.qeActive && sim.b < 0.02,
        popup: true,
        era: 'late',
        context: (sim, world, portfolio) =>
            'The Fed just announced unlimited quantitative easing. Treasury and MBS purchases at $120 billion per month. The "whatever it takes" language means they\'re backstopping everything. This is the trade of the cycle -- but the question is whether it works or whether confidence is already broken.',
        choices: [
            {
                label: 'Go all in on risk',
                desc: 'The Fed is printing. Buy everything with a coupon and lever up.',
                deltas: { mu: 0.06, theta: -0.02, b: -0.01, sigmaR: -0.004, lambda: -0.8, q: 0.003 },
                effects: [
                    { path: 'fed.qeActive', op: 'set', value: true },
                ],
                playerFlag: 'leveraged_into_qe',
                resultToast: 'You load the boat on risk assets. If QE works, this is generational alpha.',
            },
            {
                label: 'Play it measured',
                desc: 'Add exposure but keep hedges. QE takes time to work through the system.',
                deltas: { mu: 0.05, theta: -0.015, b: -0.01, sigmaR: -0.003, lambda: -0.5, q: 0.002 },
                effects: [
                    { path: 'fed.qeActive', op: 'set', value: true },
                ],
                playerFlag: 'measured_qe_positioning',
                resultToast: 'You add risk gradually. A balanced approach to the liquidity wave.',
            },
            {
                label: 'Sell into the sugar rush',
                desc: 'QE is a sign of desperation. Position for the stimulus to fail.',
                deltas: { mu: 0.03, theta: -0.005, b: -0.01, sigmaR: 0.002, lambda: 0.3, q: 0.001 },
                effects: [
                    { path: 'fed.qeActive', op: 'set', value: true },
                ],
                playerFlag: 'sold_into_qe',
                resultToast: 'You stay defensive. If QE can\'t fix what\'s broken, the reckoning comes later.',
            },
        ],
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
        magnitude: 'moderate',
        when: (sim, world) => world.election.barronApproval > 40 && !world.fed.hartleyFired,
        popup: true,
        era: 'mid',
        context: (sim, world, portfolio) =>
            'Barron just threatened to fire the Fed Chair on live television. Constitutional scholars are split. If he follows through, it would be unprecedented -- and the market is already pricing in chaos. Rate vol is spiking. The desk needs a view on whether this is bluster or real.',
        choices: [
            {
                label: 'Bet he does it',
                desc: 'Buy rate vol and equity puts. If Barron fires Hartley, markets crash.',
                deltas: { mu: -0.04, theta: 0.025, sigmaR: 0.01, lambda: 1.5 },
                effects: [
                    { path: 'fed.credibilityScore', op: 'add', value: -3 },
                ],
                followups: [{ id: 'barron_fires_hartley', mtth: 18, weight: 0.5 }],
                playerFlag: 'bet_barron_fires_hartley',
                resultToast: 'You position for the worst case. If Barron follows through, you\'re ready.',
            },
            {
                label: 'Call the bluff',
                desc: 'This is political theater. Fade the vol spike -- Barron won\'t cross that line.',
                deltas: { mu: -0.02, theta: 0.015, sigmaR: 0.006, lambda: 0.8 },
                effects: [
                    { path: 'fed.credibilityScore', op: 'add', value: -3 },
                ],
                followups: [{ id: 'barron_fires_hartley', mtth: 30, weight: 0.2 }],
                playerFlag: 'called_barron_bluff',
                resultToast: 'You sell vol into the panic. Just bluster -- right?',
            },
            {
                label: 'Flatten everything',
                desc: 'Too much uncertainty. Cut risk across the board until it resolves.',
                deltas: { mu: -0.03, theta: 0.02, sigmaR: 0.008, lambda: 1.0 },
                effects: [
                    { path: 'fed.credibilityScore', op: 'add', value: -3 },
                ],
                followups: [{ id: 'barron_fires_hartley', mtth: 25, weight: 0.3 }],
                playerFlag: 'flattened_on_hartley_threat',
                resultToast: 'You pull risk. Better to miss the move than get caught wrong-footed.',
            },
        ],
    },
    {
        id: 'barron_fires_hartley',
        category: 'fed',
        likelihood: 0.15,
        headline: 'BREAKING: Barron fires Fed Chair Hartley via executive order; constitutional crisis erupts as markets plunge',
        magnitude: 'major',
        when: (sim, world, congress) => congress.trifecta && world.fed.credibilityScore <= 4 && !world.fed.hartleyFired,
        popup: true,
        era: 'late',
        context: (sim, world, portfolio) =>
            'It happened. Barron signed the executive order twenty minutes ago. Hartley has been removed as Fed Chair. S&P futures are limit-down, the dollar is cratering, and Treasury yields are spiking. Every desk on the street is scrambling. This is a once-in-a-career dislocation.',
        choices: [
            {
                label: 'Buy the crash',
                desc: 'This is capitulation. Institutions will be forced to cover. Go long into the panic.',
                deltas: { mu: -0.02, theta: 0.04, sigmaR: 0.02, lambda: 2.5 },
                effects: [
                    { path: 'fed.hartleyFired', op: 'set', value: true },
                    { path: 'fed.credibilityScore', op: 'set', value: 0 },
                    { path: 'election.barronApproval', op: 'add', value: -10 },
                ],
                followups: [
                    { id: 'markets_panic_hartley_fired', mtth: 3, weight: 0.7 },
                    { id: 'vane_nominated', mtth: 10, weight: 0.8 },
                    { id: 'scotus_hartley_case', mtth: 40, weight: 0.5 },
                ],
                playerFlag: 'bought_hartley_firing_crash',
                resultToast: 'You buy into the abyss. Either a hero trade or career-ending.',
            },
            {
                label: 'Sell everything',
                desc: 'Fed independence is gone. This is systemic. Get to cash and wait.',
                deltas: { mu: -0.05, theta: 0.05, sigmaR: 0.025, lambda: 3.5 },
                effects: [
                    { path: 'fed.hartleyFired', op: 'set', value: true },
                    { path: 'fed.credibilityScore', op: 'set', value: 0 },
                    { path: 'election.barronApproval', op: 'add', value: -10 },
                ],
                followups: [
                    { id: 'markets_panic_hartley_fired', mtth: 3, weight: 0.95 },
                    { id: 'vane_nominated', mtth: 10, weight: 0.8 },
                    { id: 'scotus_hartley_case', mtth: 40, weight: 0.5 },
                ],
                playerFlag: 'sold_everything_hartley_fired',
                resultToast: 'You liquidate. If the system is breaking, cash is the only safe haven.',
            },
            {
                label: 'Load up on volatility',
                desc: 'The direction is unclear but vol will stay elevated for weeks. Buy straddles.',
                deltas: { mu: -0.04, theta: 0.05, sigmaR: 0.02, lambda: 3.0 },
                effects: [
                    { path: 'fed.hartleyFired', op: 'set', value: true },
                    { path: 'fed.credibilityScore', op: 'set', value: 0 },
                    { path: 'election.barronApproval', op: 'add', value: -10 },
                ],
                followups: [
                    { id: 'markets_panic_hartley_fired', mtth: 3, weight: 0.9 },
                    { id: 'vane_nominated', mtth: 10, weight: 0.8 },
                    { id: 'scotus_hartley_case', mtth: 40, weight: 0.5 },
                ],
                playerFlag: 'bought_vol_hartley_fired',
                resultToast: 'You buy vol across the curve. Constitutional crises don\'t resolve quickly.',
            },
        ],
    },
    {
        id: 'markets_panic_hartley_fired',
        category: 'fed',
        likelihood: 1.0,
        headline: 'Global sell-off accelerates: S&P futures limit-down overnight; Treasury yields spike 40bps as foreign central banks scramble',
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
const MACRO_EVENTS = [
    // =====================================================================
    //  ARC 3: TRADE WAR ESCALATION LADDER
    // =====================================================================
    {
        id: 'tariffs_announced',
        category: 'macro',
        likelihood: 0.5,
        headline: 'Barron signs executive order imposing 25% tariffs on $200B of imports; "America will no longer be ripped off," he declares at signing ceremony',
        params: { mu: -0.05, theta: 0.02, lambda: 1.0, muJ: -0.02, q: -0.001 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage === 0,
        effects: (world) => {
            world.geopolitical.tradeWarStage = 1;
            world.geopolitical.chinaRelations = Math.max(-3, world.geopolitical.chinaRelations - 1);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
        followups: [
            { id: 'trade_retaliation', mtth: 15, weight: 0.8 },
            { id: 'tariff_selloff', mtth: 3, weight: 0.6 },
        ],
    },
    {
        id: 'tariff_selloff',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Markets reel from tariff shock: industrials down 4%, transports down 6%, retailers scramble to quantify supply chain cost impact',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'trade_retaliation',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Beijing retaliates with matching tariffs on U.S. agriculture and energy; Liang Wei\'s Zhaowei announces "strategic decoupling plan"',
        params: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage === 1,
        effects: (world) => {
            world.geopolitical.tradeWarStage = 2;
            world.geopolitical.chinaRelations = Math.max(-3, world.geopolitical.chinaRelations - 1);
        },
        followups: [
            { id: 'zhaowei_ban', mtth: 30, weight: 0.6 },
            { id: 'tariff_exemptions', mtth: 20, weight: 0.4 },
        ],
    },
    {
        id: 'zhaowei_ban',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Barron bans Zhaowei from U.S. markets and imposes chip export controls: "They steal our technology and weaponize it." Full tech decoupling underway',
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.03, sigmaR: 0.005 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.tradeWarStage === 2,
        effects: (world) => {
            world.geopolitical.tradeWarStage = 3;
            world.geopolitical.chinaRelations = -3;
        },
        followups: [
            { id: 'rare_earth_crisis', mtth: 25, weight: 0.7 },
        ],
    },
    {
        id: 'rare_earth_crisis',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Beijing restricts rare earth exports to U.S. in retaliation; chip manufacturers warn of 6-month supply shortage. Defense stocks crater',
        params: { mu: -0.08, theta: 0.04, lambda: 2.0, muJ: -0.05, sigmaR: 0.008, q: -0.002 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 3 && world.geopolitical.chinaRelations <= -2,
    },
    {
        id: 'tariff_exemptions',
        category: 'macro',
        likelihood: 1.0,
        headline: 'White House quietly grants tariff exemptions to 40 product categories after corporate lobbying blitz; partial de-escalation calms markets',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 1 && world.geopolitical.tradeWarStage <= 3,
        effects: (world) => {
            world.geopolitical.chinaRelations = Math.min(3, world.geopolitical.chinaRelations + 1);
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
        headline: 'Barron and Beijing announce "Phase One" trade deal framework; tariffs to be rolled back over 18 months. Barron: "The biggest deal in history, maybe ever"',
        params: { mu: 0.05, theta: -0.02, lambda: -0.8, muJ: 0.01, q: 0.002 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.tradeWarStage >= 2 && world.geopolitical.tradeWarStage < 4,
        effects: (world) => {
            world.geopolitical.tradeWarStage = 4;
            world.geopolitical.chinaRelations = Math.min(3, world.geopolitical.chinaRelations + 2);
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
        },
    },

    // =====================================================================
    //  ARC 4: MIDDLE EAST QUAGMIRE
    // =====================================================================
    {
        id: 'mideast_strikes',
        category: 'macro',
        likelihood: 0.6,
        headline: 'U.S. launches precision strikes using PNTH Atlas AI targeting; Department of War calls it "surgical, zero collateral." Barron: "Mission accomplished"',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation === 0,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
        followups: [
            { id: 'mideast_civilian_casualties', mtth: 15, weight: 0.7 },
            { id: 'mideast_oil_spike', mtth: 5, weight: 0.5 },
        ],
    },
    {
        id: 'mideast_civilian_casualties',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Al Jazeera footage contradicts DoW "zero collateral" claims; 47 civilian casualties confirmed. Gottlieb calls it "a betrayal of everything Atlas was built for"',
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
        category: 'macro',
        likelihood: 1.0,
        headline: 'Oil prices surge 12% as strikes threaten Strait shipping lanes; energy stocks rally but consumer discretionary tanks',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, b: 0.005, sigmaR: 0.004 },
        magnitude: 'moderate',
    },
    {
        id: 'mideast_ground_deployment',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Barron deploys 15,000 troops for "stability operations"; largest ground deployment in 20 years. Defense stocks surge, but consumer confidence plummets',
        params: { mu: -0.04, theta: 0.025, lambda: 1.2, muJ: -0.03, sigmaR: 0.005 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.mideastEscalation === 1,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 2;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 6);
        },
        followups: [
            { id: 'mideast_quagmire', mtth: 40, weight: 0.6 },
        ],
    },
    {
        id: 'mideast_quagmire',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Pentagon briefing leaked: 200+ casualties, $2B/month burn rate, no exit strategy. Okafor: "This is Vietnam with drones." Barron approval craters',
        params: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.02 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.mideastEscalation === 2,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 3;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
        },
        followups: [
            { id: 'mideast_ceasefire', mtth: 50, weight: 0.5 },
            { id: 'mideast_withdrawal', mtth: 40, weight: 0.4 },
        ],
    },
    {
        id: 'mideast_ceasefire',
        category: 'macro',
        likelihood: 1.0,
        headline: 'Ceasefire brokered by Turkey and UAE; Barron takes credit despite opposition from his own DoW advisors. Markets rally on de-escalation hopes',
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
        category: 'macro',
        likelihood: 1.0,
        headline: 'Under bipartisan pressure, Barron announces phased withdrawal: "We\'ve achieved our objectives." Polls show 68% support pulling out',
        params: { mu: 0.03, theta: -0.015, lambda: -0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation >= 2 && world.election.barronApproval < 35,
        effects: (world) => {
            world.geopolitical.mideastEscalation = 0;
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        },
    },

    // =====================================================================
    //  ARC 8: SOUTH AMERICA OPERATIONS
    // =====================================================================
    {
        id: 'south_america_covert_exposed',
        category: 'macro',
        likelihood: 0.5,
        headline: 'The Continental reveals CIA-PNTH covert operations in South America; leaked memos show Atlas AI used for surveillance of civilian population',
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
        category: 'macro',
        likelihood: 1.0,
        headline: 'Barron deploys 500 "military advisors" to South American nation; DoW insists they are "non-combat trainers." Congress skeptical',
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
        category: 'macro',
        likelihood: 1.0,
        headline: 'South American government collapses; transitional council installed under U.S. military protection. Street protests against "American puppets" spread regionally',
        params: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.02 },
        magnitude: 'major',
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
        category: 'macro',
        likelihood: 1.0,
        headline: 'Insurgency intensifies in South America; U.S. advisors come under fire, three killed. Barron doubles down: "We will not be driven out by thugs"',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.southAmericaOps === 3,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
    },
    {
        id: 'south_america_withdrawal',
        category: 'macro',
        likelihood: 1.0,
        headline: 'White House announces withdrawal of all military advisors from South America; operation quietly deemed "complete" despite no stated objectives being met',
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
        category: 'macro',
        likelihood: 1.0,
        headline: 'UN General Assembly passes non-binding resolution condemning U.S. operations in South America 124-8; Barron calls it "meaningless theater"',
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
        headline: 'OPEC+ announces surprise 2M barrel/day production cut; oil surges 18% in a single session. Energy costs ripple through supply chains',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, muJ: -0.03, b: 0.01, sigmaR: 0.008, q: -0.002 },
        magnitude: 'major',
        when: (sim, world) => !world.geopolitical.oilCrisis,
        effects: (world) => {
            world.geopolitical.oilCrisis = true;
        },
    },
    {
        id: 'energy_sanctions',
        category: 'macro',
        likelihood: 0.3,
        headline: 'Barron imposes energy sanctions on major oil-exporting state; "They will feel the full force of American economic power." Crude jumps 8%',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, b: 0.005, sigmaR: 0.005, q: -0.001 },
        magnitude: 'moderate',
        when: (sim, world) => !world.geopolitical.sanctionsActive,
        effects: (world) => {
            world.geopolitical.sanctionsActive = true;
        },
    },
    {
        id: 'cpi_surprise_high',
        category: 'macro',
        likelihood: 1.2,
        headline: 'CPI comes in hot at 5.4% annualized, well above 4.8% consensus; core inflation re-accelerates. Rate-cut hopes evaporate immediately',
        params: { mu: -0.02, theta: 0.01, b: 0.004, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.12,
    },
    {
        id: 'cpi_surprise_low',
        category: 'macro',
        likelihood: 1.5,
        headline: 'CPI falls to 2.1% — lowest in three years; "immaculate disinflation" narrative takes hold. Bond rally accelerates',
        params: { mu: 0.02, theta: -0.008, b: -0.003, sigmaR: -0.002 },
        magnitude: 'moderate',
        when: (sim) => sim.b > 0.01,
    },
    {
        id: 'jobs_report_strong',
        category: 'macro',
        likelihood: 2.0,
        headline: 'Nonfarm payrolls blow past estimates: +312K vs +180K expected. Unemployment ticks down to 3.5%. "Goldilocks" chatter returns',
        params: { mu: 0.015, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'jobs_report_weak',
        category: 'macro',
        likelihood: 1.5,
        headline: 'Jobs disappoint: +82K vs +175K expected, prior month revised down 50K. Recession whisperers grow louder',
        params: { mu: -0.015, theta: 0.008, lambda: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'recession_declared',
        category: 'macro',
        likelihood: 1.0,
        headline: 'NBER officially declares recession began two quarters ago; Barron blames "obstructionist Congress and a reckless Fed." Markets already priced most of it',
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.04, b: -0.01, q: -0.005 },
        magnitude: 'major',
        when: (sim, world) => sim.mu < -0.05 && sim.theta > 0.12 && !world.geopolitical.recessionDeclared,
        effects: (world) => {
            world.geopolitical.recessionDeclared = true;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 8);
        },
    },
    {
        id: 'sovereign_debt_scare',
        category: 'macro',
        likelihood: 0.25,
        headline: 'Major European sovereign downgraded two notches; contagion fears spike as CDS spreads widen across periphery. Flight to quality drives Treasury yields down',
        params: { mu: -0.04, theta: 0.025, lambda: 1.5, muJ: -0.03, b: -0.005, sigmaR: 0.008, q: -0.002 },
        magnitude: 'major',
    },
    {
        id: 'gdp_surprise_beat',
        category: 'macro',
        likelihood: 1.5,
        headline: 'GDP grows 4.2% annualized, smashing 2.8% consensus; strongest quarter in three years. "Goldilocks is back," declares CNBC panel',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
    },
    {
        id: 'consumer_confidence_surge',
        category: 'macro',
        likelihood: 1.5,
        headline: 'Consumer confidence hits 20-year high as wages rise and gas prices fall; retail sector rallies on spending outlook upgrade',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'manufacturing_renaissance',
        category: 'macro',
        likelihood: 1.0,
        headline: 'ISM Manufacturing surges to 58.4 on reshoring boom; new factory construction at highest level since 1990s. "American reindustrialization is real," says Commerce Secretary',
        params: { mu: 0.025, theta: -0.008, q: 0.001 },
        magnitude: 'moderate',
    },
    {
        id: 'tech_capex_boom',
        category: 'macro',
        likelihood: 1.2,
        headline: 'Corporate capex on AI infrastructure surges 45% YoY; every major CEO cites AI investment as top priority. Semiconductor and cloud names rally broadly',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
    },
    {
        id: 'productivity_miracle',
        category: 'macro',
        likelihood: 0.8,
        headline: 'BLS reports 3.8% productivity growth — highest since the dot-com era; economists credit AI-driven automation. "This changes the inflation math entirely"',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2, b: -0.002 },
        magnitude: 'moderate',
    },
    {
        id: 'ceasefire_general',
        category: 'macro',
        likelihood: 0.8,
        headline: 'Diplomatic breakthrough: ceasefire agreement signed at Camp David after weeks of secret negotiations. Barron takes full credit in primetime address',
        params: { mu: 0.03, theta: -0.015, lambda: -0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.geopolitical.mideastEscalation >= 1 || world.geopolitical.southAmericaOps >= 1,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
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
        likelihood: 0.5,
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
        likelihood: 1.0,
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
        likelihood: 1.8,
        headline: 'DHS quietly renews PNTH border surveillance contract for another 3 years; $800M deal draws little public attention',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'atlas_product_launch',
        category: 'pnth',
        likelihood: 1.2,
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
        likelihood: 1.5,
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
        likelihood: 2.0,
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
        likelihood: 1.2,
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
        likelihood: 1.2,
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
            let base = 0.3;
            if (!world.pnth.ctoIsMira) base += 0.2;
            if (world.pnth.gottliebStartedRival) base += 0.3;
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
        likelihood: 1.5,
        headline: 'PNTH board authorizes $3B accelerated share buyback program; Dirks: "The market dramatically undervalues this company"',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2, q: -0.001 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.boardDirks >= 6,
    },
    {
        id: 'pnth_data_center_fire',
        category: 'pnth',
        likelihood: 0.2,
        headline: 'Fire at PNTH primary data center in Ashburn; Atlas AI services offline for 18 hours. Insurance covers damage but customer trust shaken',
        params: { mu: -0.03, theta: 0.015, lambda: 0.6, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },

    // -- Positive growth / commercial events ----------------------------------
    {
        id: 'pnth_sovereign_fund_investment',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'Abu Dhabi Investment Authority acquires 4.5% strategic stake in PNTH at premium; "a generational bet on AI infrastructure," says ADIA managing director',
        params: { mu: 0.04, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_enterprise_adoption_surge',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'Atlas AI enterprise bookings surge 85% QoQ as Fortune 100 companies accelerate adoption; wait-list grows to 200+ companies. "Demand is unprecedented," says COO',
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
        headline: 'PNTH researchers publish breakthrough in multi-modal reasoning; Atlas achieves state-of-the-art on all major benchmarks. "Not even close," says lead scientist',
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
        headline: 'PNTH pre-announces Q3 revenue 20% above consensus; enterprise AI pipeline "overflowing." Bears scramble to cover as stock gaps higher',
        params: { mu: 0.05, theta: -0.015, lambda: -0.3, q: 0.002 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.commercialMomentum >= 0,
    },
    {
        id: 'pnth_cloud_arb_milestone',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH cloud AI revenue crosses $1B ARR milestone in record time; management calls it "the fastest-growing product in enterprise software history"',
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
        headline: 'PNTH announces major expansion into European and Asian markets; signs $2.4B in new international contracts. Geographic diversification praised by analysts',
        params: { mu: 0.04, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_healthcare_fda_clearance',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'FDA grants breakthrough device clearance to Atlas AI diagnostic platform; first AI system approved for autonomous radiology. Healthcare stocks rally in sympathy',
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
        headline: 'PNTH unveils custom AI accelerator chip; 3x performance per watt vs. GPU incumbents. Jensen Huang congratulates them publicly. Supply chain independence play',
        params: { mu: 0.06, theta: -0.01, lambda: -0.3 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.acquired && world.pnth.ctoIsMira,
    },
    {
        id: 'pnth_government_ai_czar',
        category: 'pnth',
        likelihood: 0.7,
        headline: 'Barron appoints former PNTH executive as federal AI czar; executive order mandates government-wide adoption of "American AI platforms." PNTH seen as primary beneficiary',
        params: { mu: 0.04, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.election.barronApproval > 40,
    },
    {
        id: 'pnth_sp500_inclusion',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'PNTH added to S&P 500 index effective next month; $18B in passive buying estimated. "Long overdue," says index committee chair',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
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
        headline: 'PNTH crushes estimates: revenue +32% YoY, Atlas AI bookings up 60%. Raises full-year guidance. Stock surges after hours',
        params: { mu: 0.04, theta: -0.01, lambda: -0.3, q: 0.002 },
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
            let base = 0.5;
            if (world.pnth.commercialMomentum < 0) base += 0.5;
            if (world.investigations.okaforProbeStage >= 2) base += 0.3;
            if (!world.pnth.ctoIsMira) base += 0.2;
            return base;
        },
        headline: 'PNTH disaster quarter: revenue misses by 12%, operating loss widens, three major customers paused contracts. Guidance slashed. Dirks faces board questions',
        params: { mu: -0.04, theta: 0.015, lambda: 0.6, muJ: -0.02, q: -0.002 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
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
        headline: 'PNTH raises full-year revenue guidance by 15% citing "unprecedented enterprise AI adoption"; lifts margin target. Bull case intact',
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
        headline: 'PNTH slashes guidance mid-quarter citing "regulatory headwinds and customer hesitation"; withdraws full-year outlook entirely. CFO: "Visibility is low"',
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
        headline: 'AI regulation bill passes Congress with bipartisan support; mandates safety audits, licensing for frontier models. PNTH compliance costs estimated at $200M/year',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'doj_antitrust_cloud',
        category: 'sector',
        likelihood: 0.6,
        headline: 'DOJ files antitrust suit against three major cloud providers alleging market allocation; enterprise AI contracts could be voided. Sector-wide repricing',
        params: { mu: -0.03, theta: 0.02, lambda: 0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'semiconductor_shortage',
        category: 'sector',
        likelihood: 1.0,
        headline: 'TSMC warns of 16-week lead times on advanced nodes; AI chip allocations cut 30%. PNTH scrambles for alternative supply',
        params: { mu: -0.015, theta: 0.008, lambda: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'semiconductor_glut',
        category: 'sector',
        likelihood: 1.0,
        headline: 'Semiconductor inventory correction hits: channel checks show 8 weeks of excess AI chip stock. ASPs under pressure across the supply chain',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'data_breach_major',
        category: 'sector',
        likelihood: 0.6,
        headline: '500M user records exposed in breach at major social platform; Congress demands hearings, calls for data privacy legislation. Tech sentiment sours',
        params: { mu: -0.025, theta: 0.015, lambda: 0.4 },
        magnitude: 'moderate',
    },
    {
        id: 'tech_ipo_frenzy',
        category: 'sector',
        likelihood: 1.5,
        headline: 'Three major AI startups file S-1s in a single week; IPO market heats up as risk appetite returns. "Animal spirits are back," says Goldman',
        params: { mu: 0.02, theta: -0.005, lambda: -0.2 },
        magnitude: 'minor',
    },
    {
        id: 'enterprise_cloud_boom',
        category: 'sector',
        likelihood: 1.8,
        headline: 'Gartner raises enterprise cloud spending forecast 20%; AI workloads driving "unprecedented demand." Hyperscaler capex guides surge',
        params: { mu: 0.02, theta: -0.008 },
        magnitude: 'minor',
    },
    {
        id: 'cyber_attack_infrastructure',
        category: 'sector',
        likelihood: 0.5,
        headline: 'Major cyberattack takes down power grid in three states; CISA attributes to state-sponsored actors. Congress fast-tracks cybersecurity spending bill',
        params: { mu: -0.025, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'ai_spending_forecast_up',
        category: 'sector',
        likelihood: 2.0,
        headline: 'Morgan Stanley calls AI "the defining trade of the decade"; raises sector spending forecast to $1.3T by 2030. Momentum buyers pile in',
        params: { mu: 0.015, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'tech_earnings_mixed',
        category: 'sector',
        likelihood: 2.0,
        headline: 'Big Tech earnings season delivers mixed results: cloud beats, advertising misses, AI capex higher than expected. Sector churns sideways',
        params: { mu: 0.003, theta: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'zhaowei_benchmark_win',
        category: 'sector',
        likelihood: 0.8,
        headline: 'Zhaowei\'s Qilin-4 model tops PNTH Atlas on three major AI benchmarks; Liang Wei: "The gap is closed." Western analysts skeptical of methodology',
        params: { mu: -0.02, theta: 0.01 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'zhaowei_beijing_summit',
        category: 'sector',
        likelihood: 1.5,
        headline: 'Zhaowei CEO Liang Wei keynotes Beijing AI Summit; announces state-backed $50B compute buildout. PNTH investors weigh competitive threat',
        params: { mu: -0.005, theta: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.chinaRelations <= 0,
    },
    {
        id: 'ai_safety_framework',
        category: 'sector',
        likelihood: 1.0,
        headline: 'G7 nations agree on international AI safety framework; voluntary compliance for now, but binding treaty language being drafted. Markets digest implications',
        params: { mu: -0.005, theta: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'quantum_computing_breakthrough',
        category: 'sector',
        likelihood: 0.8,
        headline: 'Major lab announces 1,000-qubit error-corrected quantum processor; "practical quantum advantage within 3 years." Quantum stocks surge, crypto trembles',
        params: { mu: 0.015, theta: -0.005, lambda: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'tech_layoffs_wave',
        category: 'sector',
        likelihood: 0.7,
        headline: 'Tech layoffs accelerate: 40,000 cuts announced this month across six major firms. "Efficiency era" rhetoric masks slowing growth',
        params: { mu: -0.015, theta: 0.008 },
        magnitude: 'minor',
    },

    // -- Dividend / corporate payout events --------------------------------
    {
        id: 'corporate_dividend_boom',
        category: 'sector',
        likelihood: 0.8,
        headline: 'S&P 500 dividend payments hit record high; 40 companies raised payouts this quarter on strong free cash flow and low leverage',
        params: { mu: 0.015, theta: -0.005, q: 0.003 },
        magnitude: 'minor',
        when: (sim) => sim.mu > 0.03 && sim.q < 0.08,
    },
    {
        id: 'dividend_cut_wave',
        category: 'sector',
        likelihood: 0.6,
        headline: 'Wave of dividend cuts sweeps market: 15 blue-chip companies reduce or suspend payouts, citing margin pressure and uncertain outlook',
        params: { mu: -0.02, theta: 0.01, q: -0.005 },
        magnitude: 'moderate',
        when: (sim) => sim.mu < -0.03 && sim.q > 0.01,
    },
    {
        id: 'special_dividend_announcements',
        category: 'sector',
        likelihood: 0.6,
        headline: 'Multiple large-caps announce special dividends as repatriation cash piles grow; $50B in one-time shareholder returns announced this week',
        params: { mu: 0.02, theta: -0.005, q: 0.004 },
        magnitude: 'moderate',
        when: (sim) => sim.q < 0.06 && sim.mu > 0.0,
    },
    {
        id: 'buyback_to_dividend_shift',
        category: 'sector',
        likelihood: 1.0,
        headline: 'Corporate treasurers pivot from buybacks to dividends as institutional investors demand yield; dividend payout ratios rise across sectors',
        params: { mu: 0.01, q: 0.003 },
        magnitude: 'minor',
        when: (sim) => sim.q < 0.05,
    },

    // -- Positive tech / AI tailwinds -----------------------------------------
    {
        id: 'government_ai_investment_act',
        category: 'sector',
        likelihood: 0.8,
        headline: 'Congress passes bipartisan $200B "American AI Leadership Act"; mandates federal agencies adopt AI platforms within 3 years. PNTH and peers surge',
        params: { mu: 0.04, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
    },
    {
        id: 'ai_adoption_faster_than_expected',
        category: 'sector',
        likelihood: 1.5,
        headline: 'McKinsey raises AI enterprise adoption forecast for third time this year; now projects 80% of Fortune 500 will deploy by year-end. "Faster than mobile, faster than cloud"',
        params: { mu: 0.025, theta: -0.008 },
        magnitude: 'minor',
    },
    {
        id: 'semiconductor_capacity_expansion',
        category: 'sector',
        likelihood: 1.0,
        headline: 'TSMC breaks ground on $40B U.S. fab; AI chip supply constraints easing as industry invests record $150B in new capacity. Lead times improving',
        params: { mu: 0.02, theta: -0.005, lambda: -0.1 },
        magnitude: 'minor',
    },
    {
        id: 'venture_capital_ai_boom',
        category: 'sector',
        likelihood: 1.2,
        headline: 'AI venture funding hits $80B in a single quarter, shattering all records; "Every pitch deck has AI in it, and for once, the hype is justified," says a16z partner',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'big_tech_ai_capex_guidance',
        category: 'sector',
        likelihood: 1.5,
        headline: 'Big Tech collectively guides AI capex up 60% next year; hyperscalers in "arms race" for compute. Infrastructure and chip stocks rally hard',
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
        when: (sim, world) => world.pnth.senateProbeLaunched,
        effects: (world) => {
            world.investigations.okaforProbeStage = Math.max(1, world.investigations.okaforProbeStage);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
        followups: [
            { id: 'okafor_popularity_surge', mtth: 10, weight: 0.7 },
        ],
    },
    {
        id: 'okafor_popularity_surge',
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
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => sim.day > 750 && !world.election.okaforRunning,
        effects: (world) => {
            world.election.okaforRunning = true;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
    },
    {
        id: 'okafor_scandal',
        category: 'political',
        likelihood: 0.5,
        headline: 'Opposition research bombshell: Okafor\'s husband held Zhaowei stock while she chaired the Intelligence Committee. She calls it "a smear campaign"',
        params: { mu: 0.02, theta: 0.008 },
        magnitude: 'moderate',
        when: (sim, world) => world.election.okaforRunning || world.investigations.okaforProbeStage >= 1,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
        },
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
        headline: 'New polls show slight uptick in Barron approval; economy cited as primary driver. "Things could be worse" sentiment prevails',
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
        headline: 'Barron approval slips in latest tracking poll; "fatigue factor" cited by analysts as scandals accumulate',
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
        headline: 'Government funding bill stalls as House Democrats refuse to pass Barron\'s defense spending increase; continuing resolution buys 45 days',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world, congress) => !congress.trifecta,
    },
    {
        id: 'budget_deal_passes',
        category: 'political',
        likelihood: 0.8,
        headline: 'Omnibus spending bill passes 218-215 on party-line vote; $1.4T in discretionary spending, defense up 8%. Bond yields tick higher',
        params: { mu: 0.02, theta: -0.005, b: 0.002 },
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.trifecta,
    },
    {
        id: 'bipartisan_infrastructure',
        category: 'political',
        likelihood: 0.4,
        headline: 'In rare bipartisan moment, Congress passes $500B infrastructure package; both parties claim credit. Construction and materials stocks jump',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2, q: 0.001 },
        magnitude: 'moderate',
    },
    {
        id: 'shutdown_threat',
        category: 'political',
        likelihood: 0.8,
        headline: 'Government shutdown looms as midnight deadline approaches; agencies prepare furlough notices. Markets pricing in 2-week disruption',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3, sigmaR: 0.003 },
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta,
        followups: [
            { id: 'shutdown_resolved', mtth: 8, weight: 0.7 },
        ],
    },
    {
        id: 'shutdown_resolved',
        category: 'political',
        likelihood: 1.0,
        headline: 'Last-minute deal averts shutdown; short-term CR funds government through next quarter. "Kicking the can," says Okafor',
        params: { mu: 0.015, theta: -0.005, lambda: -0.2 },
        magnitude: 'minor',
    },
    {
        id: 'barron_tax_cut_proposal',
        category: 'political',
        likelihood: 0.6,
        headline: 'Barron proposes sweeping corporate tax cut from 21% to 15%; analysts project $400B revenue shortfall. Markets rally, bond bears growl',
        params: { mu: 0.03, theta: -0.005, b: 0.003, q: 0.002 },
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.trifecta,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        },
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
        params: { mu: -0.01, theta: 0.005, sigmaR: 0.002 },
        magnitude: 'minor',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
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
        when: (sim, world) => world.investigations.tanBowmanStory === 0,
        popup: true,
        era: 'early',
        context: (sim, world, portfolio) =>
            'Rachel Tan just dropped a bombshell on The Continental: VP Bowman held $4M in PNTH stock while lobbying for the Atlas contract. The story is gaining traction fast. As a senior trader at Meridian Capital, you have significant PNTH-adjacent exposure across the desk. The question is how this plays out.',
        choices: [
            {
                label: 'Front-run the fallout',
                desc: 'Get ahead of the selling. Reduce exposure and short into the scandal.',
                deltas: { mu: -0.04, theta: 0.02, lambda: 0.7 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 1 },
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                followups: [
                    { id: 'bowman_denial', mtth: 3, weight: 0.9 },
                    { id: 'tan_bowman_followup', mtth: 20, weight: 0.7 },
                ],
                playerFlag: 'front_ran_tan_story',
                resultToast: 'You cut exposure fast. If there\'s more to come, you\'re positioned for it.',
            },
            {
                label: 'Hold and monitor',
                desc: 'Scandals come and go. Wait to see if this has legs before reacting.',
                deltas: { mu: -0.03, theta: 0.015, lambda: 0.5 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 1 },
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                followups: [
                    { id: 'bowman_denial', mtth: 3, weight: 0.9 },
                    { id: 'tan_bowman_followup', mtth: 25, weight: 0.6 },
                ],
                playerFlag: 'held_through_tan_initial',
                resultToast: 'You wait it out. The White House says it\'s "old news" -- maybe they\'re right.',
            },
            {
                label: 'Buy the dip',
                desc: 'The market is overreacting. Political scandals rarely move fundamentals.',
                deltas: { mu: -0.02, theta: 0.01, lambda: 0.3 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 1 },
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                followups: [
                    { id: 'bowman_denial', mtth: 3, weight: 0.9 },
                    { id: 'tan_bowman_followup', mtth: 25, weight: 0.6 },
                ],
                playerFlag: 'bought_tan_dip',
                resultToast: 'You add risk into the weakness. If the scandal fizzles, you profit.',
            },
        ],
    },
    {
        id: 'bowman_denial',
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
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Tan follow-up: Bowman\'s "blind trust" traded PNTH options 48 hours before contract announcements. Trust manager: Dirks\'s former assistant. The blind trust wasn\'t blind',
        magnitude: 'moderate',
        when: (sim, world) => world.investigations.tanBowmanStory === 1,
        popup: true,
        era: 'mid',
        context: (sim, world, portfolio) =>
            'Tan\'s second story is worse. The "blind trust" was trading PNTH options with perfect timing -- and the trust manager worked for Andrea Dirks. This implicates both the VP and PNTH leadership. The compliance team at Meridian is already asking questions about the desk\'s PNTH exposure.',
        choices: [
            {
                label: 'Dump PNTH-linked positions',
                desc: 'This is escalating. Clear anything tied to PNTH before compliance forces you to.',
                deltas: { mu: -0.05, theta: 0.025, lambda: 0.8, muJ: -0.03 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 2 },
                    { path: 'election.barronApproval', op: 'add', value: -5 },
                ],
                followups: [
                    { id: 'doj_bowman_referral', mtth: 25, weight: 0.6 },
                    { id: 'tan_bombshell_recording', mtth: 35, weight: 0.5 },
                ],
                playerFlag: 'dumped_pnth_on_followup',
                resultToast: 'You clear PNTH exposure. Compliance nods approvingly.',
            },
            {
                label: 'Stay the course',
                desc: 'The market has already priced in the scandal. Further selling is a gift to shorts.',
                deltas: { mu: -0.04, theta: 0.02, lambda: 0.6, muJ: -0.02 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 2 },
                    { path: 'election.barronApproval', op: 'add', value: -5 },
                ],
                followups: [
                    { id: 'doj_bowman_referral', mtth: 30, weight: 0.5 },
                    { id: 'tan_bombshell_recording', mtth: 40, weight: 0.4 },
                ],
                playerFlag: 'held_through_tan_followup',
                resultToast: 'You hold your positions. The scandal deepens but maybe the bottom is in.',
            },
            {
                label: 'Short the administration',
                desc: 'This goes higher than Bowman. Position for maximum political fallout.',
                deltas: { mu: -0.06, theta: 0.03, lambda: 1.0, muJ: -0.03 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 2 },
                    { path: 'election.barronApproval', op: 'add', value: -7 },
                ],
                followups: [
                    { id: 'doj_bowman_referral', mtth: 20, weight: 0.7 },
                    { id: 'tan_bombshell_recording', mtth: 30, weight: 0.6 },
                ],
                playerFlag: 'shorted_administration',
                resultToast: 'You bet against the Barron administration. A bold call with big upside if you\'re right.',
            },
        ],
    },
    {
        id: 'tan_bombshell_recording',
        category: 'investigation',
        likelihood: 1.0,
        headline: 'BOMBSHELL: Tan publishes recorded Bowman-Dirks phone call: "Just make sure the stock is in the trust before the announcement." Dirks: "Already done, Jay"',
        magnitude: 'major',
        when: (sim, world) => world.investigations.tanBowmanStory >= 2,
        popup: true,
        era: 'mid',
        context: (sim, world, portfolio) =>
            'The tape is out. Bowman and Dirks on a recorded line coordinating insider trades. There is no ambiguity. PNTH is in freefall in pre-market, the Dirks faction on the board is finished, and resignation talk is everywhere. Meridian\'s risk committee has called an emergency session.',
        choices: [
            {
                label: 'Aggressive short',
                desc: 'The tape is a kill shot. Load up on downside exposure before the full crash.',
                deltas: { mu: -0.08, theta: 0.04, lambda: 2.0, muJ: -0.05 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 3 },
                    { path: 'election.barronApproval', op: 'add', value: -10 },
                    { path: 'pnth.boardDirks', op: 'add', value: -1 },
                    { path: 'pnth.boardGottlieb', op: 'add', value: 1 },
                ],
                followups: [{ id: 'bowman_resigns', mtth: 12, weight: 0.7 }],
                playerFlag: 'shorted_bombshell_tape',
                resultToast: 'You go heavy short. The tape is undeniable -- this administration is wounded.',
            },
            {
                label: 'Reduce and wait',
                desc: 'Cut risk but don\'t bet the farm. The market could snap back on a resignation.',
                deltas: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.04 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 3 },
                    { path: 'election.barronApproval', op: 'add', value: -8 },
                    { path: 'pnth.boardDirks', op: 'add', value: -1 },
                    { path: 'pnth.boardGottlieb', op: 'add', value: 1 },
                ],
                followups: [{ id: 'bowman_resigns', mtth: 20, weight: 0.5 }],
                playerFlag: 'reduced_on_bombshell',
                resultToast: 'You de-risk. The tape changes everything but markets can be irrational.',
            },
            {
                label: 'Buy the capitulation',
                desc: 'Everyone is panic-selling. A resignation clears the decks and markets rally.',
                deltas: { mu: -0.04, theta: 0.02, lambda: 1.0, muJ: -0.03 },
                effects: [
                    { path: 'investigations.tanBowmanStory', op: 'set', value: 3 },
                    { path: 'election.barronApproval', op: 'add', value: -8 },
                    { path: 'pnth.boardDirks', op: 'add', value: -1 },
                    { path: 'pnth.boardGottlieb', op: 'add', value: 1 },
                ],
                followups: [{ id: 'bowman_resigns', mtth: 15, weight: 0.6 }],
                playerFlag: 'bought_bombshell_capitulation',
                resultToast: 'You buy into the panic. If Bowman resigns quickly, the market finds a floor.',
            },
        ],
    },
    {
        id: 'tan_nsa_initial',
        category: 'investigation',
        likelihood: 0.5,
        headline: 'Tan pivots to new story: PNTH provided NSA with backdoor access to Atlas commercial clients\' data. Three Fortune 500 companies threaten to sue',
        params: { mu: -0.04, theta: 0.02, lambda: 0.8 },
        magnitude: 'moderate',
        when: (sim, world) => world.investigations.tanNsaStory === 0 && world.investigations.tanBowmanStory >= 1,
        effects: (world) => {
            world.investigations.tanNsaStory = 1;
        },
        followups: [
            { id: 'tan_nsa_followup', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'tan_nsa_followup',
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
        popup: true,
        era: 'mid',
        context: (sim, world, portfolio) =>
            'Senator Okafor has convened Intelligence Committee hearings on the PNTH-White House nexus. The witness list is aggressive -- current PNTH executives and former government officials. Meridian\'s legal team flagged that the committee may request trading records from major institutional desks.',
        choices: [
            {
                label: 'Cooperate proactively',
                desc: 'Reach out to the committee. Show Meridian has nothing to hide and build goodwill.',
                deltas: { mu: -0.015, theta: 0.008, lambda: 0.3 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 1 },
                ],
                playerFlag: 'cooperated_with_okafor',
                resultToast: 'Meridian offers full cooperation. Okafor\'s staff takes note.',
            },
            {
                label: 'Keep distance',
                desc: 'Stay quiet and maintain positions. The hearings are political theater.',
                deltas: { mu: -0.02, theta: 0.01, lambda: 0.4 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 1 },
                ],
                playerFlag: 'distanced_from_hearings',
                resultToast: 'You keep your head down. The hearings are someone else\'s problem -- for now.',
            },
            {
                label: 'Position for escalation',
                desc: 'Okafor doesn\'t open hearings unless she has the goods. Get defensive.',
                deltas: { mu: -0.03, theta: 0.015, lambda: 0.6 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 1 },
                ],
                playerFlag: 'positioned_for_probe_escalation',
                resultToast: 'You hedge against a deeper investigation. If Okafor has more, you\'re ready.',
            },
        ],
    },
    {
        id: 'okafor_subpoenas',
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Okafor issues subpoenas for Bowman financial records and Dirks-Bowman communications; White House invokes executive privilege. Constitutional showdown looms',
        magnitude: 'moderate',
        when: (sim, world) => world.investigations.okaforProbeStage >= 1,
        popup: true,
        era: 'mid',
        context: (sim, world, portfolio) =>
            'Okafor issued subpoenas for Bowman\'s financials and the Dirks-Bowman communications. The White House is fighting it on executive privilege grounds. Legal analysts say this goes to the Supreme Court. Meanwhile, the committee staff contacted Meridian about providing anonymized trading data around key PNTH dates.',
        choices: [
            {
                label: 'Provide the records',
                desc: 'Comply voluntarily. If Meridian\'s trades are clean, transparency is the best defense.',
                deltas: { mu: -0.025, theta: 0.012, lambda: 0.4 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 2 },
                ],
                playerFlag: 'provided_subpoena_records',
                resultToast: 'You hand over the records. Meridian\'s lawyers wince, but the data is clean.',
            },
            {
                label: 'Push back through counsel',
                desc: 'Have legal challenge the scope. Protect the desk\'s proprietary trading data.',
                deltas: { mu: -0.03, theta: 0.015, lambda: 0.5 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 2 },
                ],
                playerFlag: 'challenged_subpoena_scope',
                resultToast: 'Meridian\'s lawyers push back on scope. It buys time but draws attention.',
            },
            {
                label: 'Quietly restructure the book',
                desc: 'Before records are produced, clean up anything that could look suspicious in hindsight.',
                deltas: { mu: -0.035, theta: 0.02, lambda: 0.6 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 2 },
                ],
                playerFlag: 'restructured_before_subpoena',
                resultToast: 'You quietly adjust positions. Nothing illegal -- but it doesn\'t look great.',
            },
        ],
    },
    {
        id: 'okafor_criminal_referral',
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Okafor\'s committee votes 8-6 to refer Bowman to DOJ for criminal investigation; "The evidence of insider trading is overwhelming," she says',
        magnitude: 'major',
        when: (sim, world) => world.investigations.okaforProbeStage >= 2,
        popup: true,
        era: 'late',
        context: (sim, world, portfolio) =>
            'The Intelligence Committee just voted to refer Bowman to the DOJ for criminal prosecution. Okafor called the evidence "overwhelming." This crosses the line from political theater to real legal jeopardy. Markets are digesting the news -- this could either be the climax of the scandal or just the beginning of a longer ordeal.',
        choices: [
            {
                label: 'Position for indictment',
                desc: 'A criminal referral usually leads to charges. Prepare for the next shoe to drop.',
                deltas: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 3 },
                    { path: 'election.barronApproval', op: 'add', value: -5 },
                ],
                playerFlag: 'positioned_for_indictment',
                resultToast: 'You bet the DOJ acts. If charges come, the market will convulse again.',
            },
            {
                label: 'Treat it as the climax',
                desc: 'The worst is known. Markets price forward. Start buying the resolution.',
                deltas: { mu: -0.03, theta: 0.015, lambda: 0.6, muJ: -0.01 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 3 },
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                playerFlag: 'bought_referral_as_climax',
                resultToast: 'You treat the referral as peak uncertainty. If it\'s priced in, the bottom is near.',
            },
            {
                label: 'Stay neutral',
                desc: 'Too many possible outcomes. Keep the book balanced until clarity emerges.',
                deltas: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
                effects: [
                    { path: 'investigations.okaforProbeStage', op: 'set', value: 3 },
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                playerFlag: 'stayed_neutral_on_referral',
                resultToast: 'You wait for the DOJ\'s next move. No need to bet on the legal outcome.',
            },
        ],
    },

    // =====================================================================
    //  BOWMAN RESOLUTION
    // =====================================================================
    {
        id: 'doj_bowman_referral',
        category: 'investigation',
        likelihood: 1.0,
        headline: 'DOJ opens formal investigation into VP Bowman\'s PNTH stock trades; FBI agents visit Bowman\'s financial advisor. White House: "Full cooperation"',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta && world.investigations.tanBowmanStory >= 2,
    },
    {
        id: 'bowman_resigns',
        category: 'investigation',
        likelihood: 0.8,
        headline: 'BREAKING: VP Bowman resigns "to spend time with family and fight these baseless allegations." Barron: "Jay is a great patriot. Total witch hunt"',
        magnitude: 'major',
        when: (sim, world) => world.investigations.tanBowmanStory >= 2,
        popup: true,
        era: 'late',
        context: (sim, world, portfolio) =>
            'Bowman just resigned. The letter went out ten minutes ago. Markets are whipsawing -- the initial drop reversed as traders price in "scandal resolution." The question is whether this is the end of the crisis or whether it drags Barron down further. Meridian needs a view.',
        choices: [
            {
                label: 'Buy the resolution',
                desc: 'The albatross is gone. Markets rally when uncertainty lifts. Go long.',
                deltas: { mu: -0.01, theta: 0.015, lambda: 0.5, muJ: -0.01 },
                effects: [
                    { path: 'election.barronApproval', op: 'add', value: -2 },
                ],
                playerFlag: 'bought_bowman_resignation',
                resultToast: 'You buy the relief. If the scandal dies with Bowman\'s career, you profit.',
            },
            {
                label: 'Sell the news',
                desc: 'Resignations mean more indictments are coming. This isn\'t over.',
                deltas: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.03 },
                effects: [
                    { path: 'election.barronApproval', op: 'add', value: -5 },
                ],
                playerFlag: 'sold_bowman_resignation',
                resultToast: 'You sell the pop. Resignations are just the beginning of the legal process.',
            },
            {
                label: 'Trade the volatility',
                desc: 'Direction is uncertain but the swings will continue. Buy straddles.',
                deltas: { mu: -0.03, theta: 0.02, lambda: 0.8, muJ: -0.02 },
                effects: [
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                playerFlag: 'traded_vol_bowman_resignation',
                resultToast: 'You buy volatility. VP resignations keep the news cycle hot for weeks.',
            },
        ],
    },
    {
        id: 'bowman_indicted',
        category: 'investigation',
        likelihood: 0.3,
        headline: 'Federal grand jury indicts former VP Bowman on 12 counts of insider trading and conspiracy; bail set at $5M. First sitting or former VP indicted in U.S. history',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, muJ: -0.04 },
        magnitude: 'major',
        when: (sim, world) => world.investigations.tanBowmanStory >= 3 && world.investigations.okaforProbeStage >= 2,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
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
        when: (sim, world, congress) => !congress.fedControlsHouse && world.investigations.impeachmentStage === 0 && world.investigations.tanBowmanStory >= 2,
        popup: true,
        era: 'late',
        context: (sim, world, portfolio) =>
            'The House Speaker just announced a formal impeachment inquiry. This is the first time in decades. Markets are selling off but the process will take months. The macro question is whether impeachment paralyzes policy or creates a buying opportunity once the uncertainty is bounded.',
        choices: [
            {
                label: 'Hedge the macro',
                desc: 'Impeachment means policy paralysis. Buy puts and reduce equity beta.',
                deltas: { mu: -0.05, theta: 0.03, lambda: 1.2, muJ: -0.03, sigmaR: 0.006 },
                effects: [
                    { path: 'investigations.impeachmentStage', op: 'set', value: 1 },
                    { path: 'election.barronApproval', op: 'add', value: -5 },
                ],
                followups: [{ id: 'impeachment_vote', mtth: 35, weight: 0.7 }],
                playerFlag: 'hedged_impeachment',
                resultToast: 'You buy protection. Constitutional crises suppress risk appetite for months.',
            },
            {
                label: 'Lean into the process',
                desc: 'Markets learned from history: impeachment rarely leads to removal. Stay long.',
                deltas: { mu: -0.03, theta: 0.02, lambda: 0.8, muJ: -0.015, sigmaR: 0.004 },
                effects: [
                    { path: 'investigations.impeachmentStage', op: 'set', value: 1 },
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                followups: [{ id: 'impeachment_vote', mtth: 40, weight: 0.6 }],
                playerFlag: 'leaned_into_impeachment',
                resultToast: 'You stay long. History says impeachment is noise, not signal.',
            },
            {
                label: 'Go to cash',
                desc: 'This is uncharted political territory. Sit in cash until the dust settles.',
                deltas: { mu: -0.04, theta: 0.025, lambda: 1.0, muJ: -0.02, sigmaR: 0.005 },
                effects: [
                    { path: 'investigations.impeachmentStage', op: 'set', value: 1 },
                    { path: 'election.barronApproval', op: 'add', value: -3 },
                ],
                followups: [{ id: 'impeachment_vote', mtth: 40, weight: 0.6 }],
                playerFlag: 'went_to_cash_impeachment',
                resultToast: 'You flatten the book. Sometimes the best trade is no trade.',
            },
        ],
    },
    {
        id: 'impeachment_vote',
        category: 'investigation',
        likelihood: 1.0,
        headline: 'House votes 220-215 to impeach President Barron on two articles; only third presidential impeachment in U.S. history. Senate trial next',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, muJ: -0.03, sigmaR: 0.008 },
        magnitude: 'major',
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
        category: 'investigation',
        likelihood: 1.0,
        headline: 'Senate impeachment trial begins; Chief Justice presides. Barron refuses to testify, calls it "the greatest political persecution in history"',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, sigmaR: 0.005 },
        magnitude: 'major',
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
        params: { mu: -0.06, theta: 0.03, lambda: 1.5 },
        magnitude: 'major',
        when: (sim, world) => world.geopolitical.mideastEscalation >= 2 && world.geopolitical.recessionDeclared,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
        },
    },
    {
        id: 'compound_pnth_scandal_trade_war',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Beijing state media runs week-long exposé on Bowman-PNTH corruption; frames U.S. tech sector as "fundamentally compromised." Allied nations reconsider Atlas contracts',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0 },
        magnitude: 'major',
        when: (sim, world) => world.investigations.tanBowmanStory >= 2 && world.geopolitical.tradeWarStage >= 3,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            world.geopolitical.chinaRelations = Math.max(-3, world.geopolitical.chinaRelations - 1);
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
        headline: '"Worst week since 2008": margin calls cascade as institutional investors flee; regulators hold emergency session. Circuit breakers triggered three days running',
        params: { mu: -0.08, theta: 0.05, lambda: 3.0, muJ: -0.06, xi: 0.15, q: -0.005 },
        magnitude: 'major',
        when: (sim, world) => world.fed.credibilityScore < 3 && world.geopolitical.recessionDeclared && sim.theta > 0.15,
    },
    {
        id: 'compound_impeachment_war',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Constitutional crisis deepens as President faces impeachment while troops are deployed abroad; markets price in maximum political uncertainty',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, sigmaR: 0.008 },
        magnitude: 'major',
        when: (sim, world) => world.investigations.impeachmentStage >= 1 && world.geopolitical.mideastEscalation >= 2,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 5);
        },
    },
    {
        id: 'compound_pnth_hostile_bid_crisis',
        category: 'compound',
        likelihood: 1.0,
        headline: 'Major tech conglomerate launches hostile bid for scandal-plagued PNTH at 40% premium; "buying at the point of maximum pessimism," says acquirer CEO',
        params: { mu: 0.08, theta: 0.04, lambda: 2.0 },
        magnitude: 'major',
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
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Federalists hold Senate seat in special election; new senator pledges to continue Barron\'s agenda. Majority preserved',
        params: { mu: 0.01, theta: -0.003 },
        magnitude: 'minor',
    },
    {
        id: 'special_election_senate_fl_flips',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Farmer-Labor flips Senate seat in special election upset; margin now razor-thin. Barron\'s legislative agenda in jeopardy',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        effects: (world) => {
            world.congress.senate.federalist -= 1;
            world.congress.senate.farmerLabor += 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
    },
    {
        id: 'special_election_senate_fed_gains',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Federalists pick up Senate seat in special election; expanded majority strengthens Barron\'s hand on confirmations',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'moderate',
        effects: (world) => {
            world.congress.senate.federalist += 1;
            world.congress.senate.farmerLabor -= 1;
        },
    },
    {
        id: 'special_election_senate_fl_defends',
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
        params: { mu: -0.015, theta: 0.008, lambda: 0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.congress.house.federalist >= 216 && world.election.barronApproval < 45,
        effects: (world) => {
            world.congress.house.federalist -= 1;
            world.congress.house.farmerLabor += 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
        followups: [
            { id: 'defection_fallout_fed', mtth: 10, weight: 0.6 },
        ],
    },
    {
        id: 'defection_fallout_fed',
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
        when: (sim, world) => world.congress.house.farmerLabor >= 210 && world.election.barronApproval > 45,
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
        when: (sim, world) => world.congress.senate.federalist >= 50 && world.election.barronApproval < 42,
        effects: (world) => {
            world.congress.senate.federalist -= 1;
            world.congress.senate.farmerLabor += 1;
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
    },

    // -- Speaker / leadership crises ---------------------------------------
    {
        id: 'speaker_challenge',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Hard-right Federalist bloc files motion to vacate the chair; House Speaker faces confidence vote as party fractures over spending bill',
        params: { mu: -0.02, theta: 0.01, lambda: 0.4 },
        magnitude: 'moderate',
        when: (sim, world, congress) => congress.fedControlsHouse && world.congress.house.federalist <= 225,
        followups: [
            { id: 'speaker_survives', mtth: 5, weight: 0.5 },
            { id: 'speaker_ousted', mtth: 5, weight: 0.5 },
        ],
    },
    {
        id: 'speaker_survives',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Speaker survives no-confidence vote 218-212 with help from three Farmer-Labor moderates; battered but still standing',
        params: { mu: 0.01, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'speaker_ousted',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'House Speaker ousted in historic vote; chamber paralyzed as no candidate can secure 218 votes. All legislation halted indefinitely',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, sigmaR: 0.004 },
        magnitude: 'major',
        when: (sim, world, congress) => congress.fedControlsHouse,
        followups: [
            { id: 'new_speaker_elected', mtth: 12, weight: 0.7 },
            { id: 'speaker_chaos_continues', mtth: 12, weight: 0.3 },
        ],
    },
    {
        id: 'new_speaker_elected',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'After four rounds of voting, new House Speaker elected; moderate compromise candidate. Markets relieved as legislative function restored',
        params: { mu: 0.02, theta: -0.008, lambda: -0.3 },
        magnitude: 'moderate',
    },
    {
        id: 'speaker_chaos_continues',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Week two without a House Speaker; 11 rounds of voting yield no winner. Government funding deadline approaching with no one to bring a bill to the floor',
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
        headline: 'Treasury warns of "extraordinary measures" as debt ceiling deadline looms; rating agencies put U.S. on negative watch. T-bill yields spike',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8, sigmaR: 0.008, b: 0.005 },
        magnitude: 'major',
        when: (sim, world, congress) => !congress.trifecta,
        followups: [
            { id: 'debt_ceiling_last_minute_deal', mtth: 15, weight: 0.6 },
            { id: 'debt_ceiling_technical_default', mtth: 20, weight: 0.2 },
            { id: 'debt_ceiling_clean_raise', mtth: 10, weight: 0.2 },
        ],
    },
    {
        id: 'debt_ceiling_last_minute_deal',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Debt ceiling raised in last-minute bipartisan deal with spending caps; markets rally in relief. "Government by crisis," says Okafor',
        params: { mu: 0.03, theta: -0.01, lambda: -0.5, sigmaR: -0.003 },
        magnitude: 'moderate',
    },
    {
        id: 'debt_ceiling_technical_default',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'U.S. briefly misses Treasury coupon payment; first technical default in history. S&P strips AAA rating. Dollar tumbles as global shockwave hits',
        params: { mu: -0.08, theta: 0.05, lambda: 3.0, muJ: -0.06, sigmaR: 0.02, b: 0.015, borrowSpread: 1.0, q: -0.003 },
        magnitude: 'major',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 10);
        },
        followups: [
            { id: 'debt_ceiling_last_minute_deal', mtth: 5, weight: 0.9 },
        ],
    },
    {
        id: 'debt_ceiling_clean_raise',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Clean debt ceiling increase passes with bipartisan vote; crisis averted without drama for once. Markets barely react',
        params: { mu: 0.01, theta: -0.005, sigmaR: -0.002 },
        magnitude: 'minor',
    },

    // -- Congressional investigations & ethics -----------------------------
    {
        id: 'congressional_insider_trading_scandal',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'DOJ charges four sitting members of Congress with insider trading; trades traced to classified briefings on defense contracts. Bipartisan outrage erupts',
        params: { mu: -0.02, theta: 0.01, lambda: 0.4, borrowSpread: 0.1 },
        magnitude: 'moderate',
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
        category: 'congressional',
        likelihood: 1.0,
        headline: 'STOCK Act reform passes both chambers unanimously: blind trusts mandatory for all members of Congress. "Should have been done years ago"',
        params: { mu: 0.01, theta: -0.003 },
        magnitude: 'minor',
    },
    {
        id: 'congressional_censure_barron',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'House passes censure resolution against President Barron for "abuse of executive power"; symbolic but historic. Barron: "A badge of honor"',
        params: { mu: -0.015, theta: 0.008, lambda: 0.3 },
        magnitude: 'moderate',
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
        headline: 'Senate Majority Leader invokes nuclear option to eliminate legislative filibuster; major policy shifts now possible with bare 51-vote majority',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5, sigmaR: 0.004 },
        magnitude: 'major',
        when: (sim, world, congress) => congress.fedControlsSenate && world.congress.senate.federalist >= 52,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        },
    },
    {
        id: 'senate_rejects_barron_nominee',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Senate rejects Barron\'s pick for Secretary of Commerce 47-53; three Federalist moderates break ranks over nominee\'s conflicts of interest',
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
        headline: 'Congress overrides presidential veto for the first time in Barron\'s term; bipartisan supermajority passes sanctions bill 78-22. Barron calls it "an unconstitutional coup"',
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
        headline: 'Farmer-Labor introduces bill to raise qualified dividend tax from 20% to 39.6%; corporations signal immediate pivot from dividends to buybacks',
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
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Dividend tax bill dies in committee as Federalist senators filibuster; corporate treasurers resume normal payout plans',
        params: { mu: 0.01, q: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'dividend_tax_bill_compromise',
        category: 'congressional',
        likelihood: 1.0,
        headline: 'Compromise dividend tax bill passes: qualified rate increases to 25% from 20%. Modest but meaningful shift toward retained earnings and buybacks',
        params: { mu: -0.01, theta: 0.005, q: -0.003 },
        magnitude: 'moderate',
    },
    {
        id: 'corporate_tax_reform_passes',
        category: 'congressional',
        likelihood: 0.4,
        headline: 'Barron\'s corporate tax reform passes both chambers: rate cut to 15%, repatriation holiday. Analysts project massive surge in shareholder returns',
        params: { mu: 0.04, theta: -0.01, b: 0.003, q: 0.005 },
        magnitude: 'major',
        when: (sim, world, congress) => congress.trifecta,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 3);
        },
    },
    {
        id: 'capital_gains_tax_scare',
        category: 'congressional',
        likelihood: 0.5,
        headline: 'Senate Finance Committee floats doubling capital gains tax to 40%; wealthy investors front-run by locking in gains. Selling pressure intensifies',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, q: -0.002 },
        magnitude: 'moderate',
        when: (sim, world, congress) => !congress.trifecta,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
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
        },
    },
    {
        id: 'midterm_fl_speaker_elected',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Farmer-Labor elects new House Speaker; pledges immediate investigations into Barron administration. "Accountability starts now"',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        },
    },
    {
        id: 'midterm_lame_duck_barron',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Barron retreats to Mar-a-Lago after historic losses; agenda effectively dead. Aides describe him as "furious and isolated." Markets rally on gridlock',
        params: { mu: 0.04, theta: -0.02, lambda: -0.5, sigmaR: -0.003 },
        magnitude: 'major',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 8);
        },
    },
    {
        id: 'midterm_status_quo',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Midterms produce no major shift; both parties claim moral victory. Analysts call it "the most boring election in a generation." Markets shrug',
        params: { mu: 0.01, theta: -0.005 },
        magnitude: 'minor',
    },
    {
        id: 'midterm_fl_senate_majority',
        category: 'midterm',
        likelihood: 1.0,
        headline: 'Farmer-Labor takes Senate majority by one seat; committee chairmanships flip. Okafor gains full subpoena power over Intelligence Committee',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
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
        params: { mu: -0.05, theta: 0.035, lambda: 2.0, muJ: -0.04, borrowSpread: 0.8, q: -0.003 },
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
        params: { mu: -0.04, theta: 0.03, lambda: 2.5, muJ: -0.04, xi: 0.1, borrowSpread: 0.5, q: -0.002 },
        magnitude: 'major',
    },
    {
        id: 'low_vol_grind',
        category: 'market',
        likelihood: 2.0,
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

    // -- Positive market structure / flow events ------------------------------
    {
        id: 'institutional_inflows_record',
        category: 'market',
        likelihood: 1.5,
        headline: 'Record $45B flows into U.S. equity funds in a single week; pension rebalancing and 401(k) contributions drive "wall of money." Dip-buying accelerates',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
    },
    {
        id: 'foreign_capital_inflows',
        category: 'market',
        likelihood: 1.2,
        headline: 'Japanese and European investors rotate into U.S. tech equities as dollar stabilizes; EPFR data shows largest ex-U.S. allocation to American stocks in a decade',
        params: { mu: 0.025, theta: -0.005, lambda: -0.1 },
        magnitude: 'moderate',
    },
    {
        id: 'systematic_buying_pressure',
        category: 'market',
        likelihood: 1.0,
        headline: 'CTA and risk-parity funds flip to max-long equity positioning as volatility collapses; systematic buying adding $30B of demand over next two weeks',
        params: { mu: 0.02, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim) => sim.theta < 0.08,
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
