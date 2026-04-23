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
];
