/* silmarillion.js -- PNTH Silmarillion model release events.
   Headlines are tier-keyed and selected by _fireSilmarillionRelease in events.js.
   Headline strings use {version}, {prevVersion}, {tier}, {tierLabel} placeholders
   resolved by the pulse handler before _fireEvent.

   Followup chains carry the narrative consequences of tail-tier rolls.
   Mid-tier rolls (Mediocre on minor versions) fire only as toast headlines
   constructed inline by the pulse handler -- they do not appear in this file. */

export const SILMARILLION_EVENTS = [
    // =====================================================================
    //  TIER HEADLINE: BREAKTHROUGH
    // =====================================================================
    {
        id: 'silmarillion_breakthrough',
        category: 'model_release',
        magnitude: 'major',
        headline: 'Silmarillion {version} ships and obliterates internal benchmarks. AlphaCode-X solved on first attempt; reviewers reach for words like "paradigm shift." Malhotra immediately schedules a fresh investor day. Stock +12% on the open.',
        params: { mu: 0.04, theta: 0.015, lambda: 0.6, muJ: 0.02 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: 2 },
            { path: 'pnth.commercialMomentum', op: 'add', value: 1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: 3 },
            { faction: 'fedRelations', value: 1 },
        ],
        followups: [
            { id: 'serica_zhaowei_scrambles', mtth: 14, weight: 0.9 },
            { id: 'covenant_talent_raid',     mtth: 21, weight: 0.7 },
            { id: 'regulator_capability_concern', mtth: 18, weight: 0.7 },
            { id: 'aegis_demand_surge_followup',  mtth: 25, weight: 0.6 },
            { id: 'ptonos_allocates_to_covenant', mtth: 30, weight: 0.5 },
        ],
    },

    // -- Breakthrough followup chain ------------------------------------
    {
        id: 'serica_zhaowei_scrambles',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Zhaowei convenes an emergency strategy session in Nanjing in response to Silmarillion. Liang Wei calls it a "national-prestige issue." Tianxia roadmap accelerated; chip export controls on PNTH supply chain hinted at.',
        magnitude: 'moderate',
        params: { mu: -0.005, theta: 0.01 },
        effects: [
            { path: 'geopolitical.tradeWarStage',  op: 'add', value: 1 },
            { path: 'geopolitical.sericaRelations', op: 'add', value: -1 },
        ],
    },
    {
        id: 'covenant_talent_raid',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Covenant AI extends offers to a dozen Silmarillion engineers, citing "values alignment." The Continental: "Gottlieb wants the people who built the thing he was forced out of."',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.gottliebStartedRival,
        params: { mu: -0.005, theta: 0.005 },
        effects: [
            { path: 'pnth.commercialMomentum', op: 'add', value: -1 },
        ],
    },
    {
        id: 'regulator_capability_concern',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Rep. Carmen Reyes calls for hearings on dual-use AI capability disclosure: "If the Pentagon gets a peek before the public, we have a constitutional problem." Algorithmic Capability Disclosure Act introduced in committee.',
        magnitude: 'moderate',
        params: { mu: -0.01, theta: 0.008 },
        effects: (world) => {
            // Activate the bill via regulations.js advanceBill -- imported lazily
            // to avoid circular dependency at module load.
            import('../regulations.js').then(m => m.advanceBill('algorithmic_capability_disclosure_act', 'introduced'));
        },
        factionShifts: [
            { faction: 'regulatoryExposure', value: 2 },
        ],
    },
    {
        id: 'aegis_demand_surge_followup',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'DoD signals it wants Atlas Aegis rebuilt on the new Silmarillion generation. Expanded contract under negotiation. Andrea Dirks: "This validates everything." Civil-liberties groups and Mira Kassis are conspicuously silent.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.aegisDeployed && world.pnth.militaryContractActive,
        params: { mu: 0.015, theta: 0.005 },
        effects: [
            { path: 'pnth.aegisControversy', op: 'add', value: 1 },
        ],
    },
    {
        id: 'ptonos_allocates_to_covenant',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Ptonos Q&A discloses it has pledged 15% of next-quarter GPU allocation to Covenant AI. PNTH sources call the move "retaliatory." Malhotra placeholder-quoted: "Ptonos has been a great partner. We have alternatives."',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.gottliebStartedRival,
        params: { mu: -0.01, theta: 0.01 },
    },

    // =====================================================================
    //  TIER HEADLINE: STRONG
    // =====================================================================
    {
        id: 'silmarillion_strong',
        category: 'model_release',
        magnitude: 'moderate',
        headline: 'Silmarillion {version} ships with material gains across reasoning and code generation benchmarks. Wall Street takes the win; analysts revise targets up. Stock +5%.',
        params: { mu: 0.02, theta: 0.005, lambda: 0.3 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: 1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: 1 },
        ],
        followups: [
            { id: 'malhotra_victory_lap', mtth: 10, weight: 0.7 },
            { id: 'serica_quiet_response', mtth: 18, weight: 0.5 },
        ],
    },

    // -- Strong followup chain --------------------------------------------
    {
        id: 'malhotra_victory_lap',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Raj Malhotra books MarketWire and CNBC on the same morning. "Capital allocation discipline. Operational excellence. Adjusted EBITDA up sequentially. The Silmarillion line is the moat." Sharma asks one sharp question; he deflects.',
        magnitude: 'minor',
        params: { mu: 0.005 },
    },
    {
        id: 'serica_quiet_response',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Serica\'s state-controlled tech press downplays the latest Silmarillion release -- a brief paragraph buried under Tianxia coverage. Western Sericologists read this as nervousness, not confidence.',
        magnitude: 'minor',
    },

    // =====================================================================
    //  TIER HEADLINE: MEDIOCRE (MAJOR ONLY)
    //  Mediocre minor releases fire as inline toasts from the pulse handler
    //  and have no entry in this file.
    // =====================================================================
    {
        id: 'silmarillion_major_meh',
        category: 'model_release',
        magnitude: 'moderate',
        headline: 'Silmarillion {version} keynote underwhelms. Year-end major bump headlined the conference circuit but the demos felt rehearsed. The Continental: "Were they hiding something or do they have nothing?" Stock -3%.',
        params: { mu: -0.012, theta: 0.008, lambda: 0.2 },
        effects: [
            { path: 'pnth.commercialMomentum', op: 'add', value: -1 },
        ],
        followups: [
            { id: 'gottlieb_was_right_oped', mtth: 14, weight: 0.7 },
            { id: 'analyst_downgrades',      mtth: 8,  weight: 0.8 },
        ],
    },

    // -- Mediocre-major followup chain ------------------------------------
    {
        id: 'gottlieb_was_right_oped',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'The Continental publishes a 3,000-word Rachel Tan piece arguing PNTH lost its way when Dirks won the boardroom: "The military pivot starved the research bench. This release is the bill arriving."',
        magnitude: 'moderate',
        params: { mu: -0.01 },
        effects: (world) => {
            if (world.pnth.boardGottlieb < 12) world.pnth.boardGottlieb += 1;
            if (world.pnth.boardDirks > 0)     world.pnth.boardDirks -= 1;
        },
    },
    {
        id: 'analyst_downgrades',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Priya Sharma\'s MarketWire post-keynote piece: "The plateau thesis is no longer fringe." Three sell-side desks downgrade PNTH within 48 hours.',
        magnitude: 'moderate',
        params: { mu: -0.015, theta: 0.01 },
        factionShifts: [
            { faction: 'firmStanding', value: -1 },
        ],
    },

    // =====================================================================
    //  TIER HEADLINE: DISAPPOINTING
    // =====================================================================
    {
        id: 'silmarillion_disappointing',
        category: 'model_release',
        magnitude: 'moderate',
        headline: 'Silmarillion {version} ships and analysts immediately ask why. Capability gains marginal; safety regressions on multiple internal evals. Mira Kassis declines to comment. Stock -6%.',
        params: { mu: -0.015, theta: 0.01, lambda: 0.3, muJ: -0.01 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: -1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: -1 },
        ],
        followups: [
            { id: 'kassis_internal_doubt',   mtth: 12, weight: 0.7 },
            { id: 'talent_drift_to_covenant', mtth: 25, weight: 0.6 },
            { id: 'dirks_blames_gottlieb_loyalists', mtth: 18, weight: 0.6 },
        ],
    },

    // -- Disappointing followup chain -------------------------------------
    {
        id: 'kassis_internal_doubt',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'A leaked Kassis memo to her staff appears on TechCrunch: "We cannot keep promising what we cannot deliver. The pretraining bet is not paying back." Dirks orders an internal leak investigation.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira,
        params: { mu: -0.01, theta: 0.005 },
        effects: [
            { path: 'media.leakCount', op: 'add', value: 1 },
        ],
    },
    {
        id: 'talent_drift_to_covenant',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'A wave of mid-level Silmarillion researchers post arrival announcements at Covenant AI within the same week. "Aletheia is where the safety work happens now," one writes. PNTH HR scrambles.',
        magnitude: 'moderate',
        params: { mu: -0.01 },
        effects: (world) => {
            // If Gottlieb has resigned but not yet started the rival, this nudges
            // it forward -- the talent flight makes the rival viable.
            if (!world.pnth.ceoIsGottlieb && !world.pnth.gottliebStartedRival) {
                world.pnth.gottliebStartedRival = true;
            }
        },
    },
    {
        id: 'dirks_blames_gottlieb_loyalists',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Andrea Dirks calls out "a small minority of legacy engineers loyal to Eugene" in an all-hands. The room goes quiet. David Zhen requests a 1:1 with Dirks the same day.',
        magnitude: 'moderate',
        params: { mu: -0.005 },
        effects: (world) => {
            if (world.pnth.boardDirks < 12) world.pnth.boardDirks += 1;
            if (world.pnth.boardGottlieb > 0) world.pnth.boardGottlieb -= 1;
        },
    },

    // =====================================================================
    //  TIER HEADLINE: FAILURE
    // =====================================================================
    {
        id: 'silmarillion_failure',
        category: 'model_release',
        magnitude: 'major',
        headline: 'Silmarillion {version} launch is a fiasco. Live demo crashes on stage; benchmark numbers retracted within 24 hours after Tianxia researchers identify training-set contamination. Activist investors smell blood. Stock -14%.',
        params: { mu: -0.035, theta: 0.02, lambda: 0.6, muJ: -0.03 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: -2 },
            { path: 'pnth.commercialMomentum', op: 'add', value: -1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: -2 },
        ],
        followups: [
            { id: 'activist_stake_revealed',  mtth: 10, weight: 0.9 },
            { id: 'sec_inquiry_opened',       mtth: 18, weight: 0.7 },
            { id: 'kassis_resignation_threat', mtth: 14, weight: 0.6 },
            { id: 'serica_overtakes_headline', mtth: 25, weight: 0.5 },
            { id: 'ptonos_revises_pnth_bookings', mtth: 8, weight: 0.8 },
        ],
    },

    // -- Failure followup chain ------------------------------------------
    {
        id: 'activist_stake_revealed',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Trian-equivalent activist fund Lockstep Capital reveals a 4.8% PNTH stake and a public letter demanding "fundamental governance review." Dirks chairmanship explicitly named.',
        magnitude: 'major',
        params: { mu: -0.02, theta: 0.015 },
        effects: [
            { path: 'pnth.activistStakeRevealed', op: 'set', value: true },
        ],
    },
    {
        id: 'sec_inquiry_opened',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'SEC opens informal inquiry into PNTH disclosures around the latest Silmarillion benchmark methodology. Subpoenas hinted at. Compliance counsel works through the weekend.',
        magnitude: 'major',
        params: { mu: -0.015, theta: 0.012 },
        factionShifts: [
            { faction: 'regulatoryExposure', value: 3 },
        ],
    },
    {
        id: 'kassis_resignation_threat',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Mira Kassis tells the board she\'ll step down as CTO unless the Silmarillion roadmap is restructured. Wired publishes the threat verbatim within hours. Dirks "evaluating options."',
        magnitude: 'major',
        when: (sim, world) => world.pnth.ctoIsMira,
        params: { mu: -0.02, theta: 0.015 },
    },
    {
        id: 'serica_overtakes_headline',
        followupOnly: true,
        category: 'pnth',
        oneShot: true,
        likelihood: 1.0,
        headline: 'Tianxia 3.0 ships with capability evaluations exceeding Silmarillion across multiple benchmarks. Liang Wei: "The era of Western technological hegemony is over." Western press largely concedes the point.',
        magnitude: 'major',
        when: (sim, world) => world.pnth.frontierLead <= -2,
        params: { mu: -0.015, theta: 0.01 },
    },
    {
        id: 'ptonos_revises_pnth_bookings',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Ptonos earnings call mentions "softer demand from a key customer" -- Wall Street decodes it instantly. PNTH bookings revised down. Ptonos stock dips on the dependency reveal.',
        magnitude: 'moderate',
        params: { mu: -0.012, theta: 0.008 },
        factionShifts: [
            { faction: 'firmStanding', value: -1 },
        ],
    },
];
