/* market.js -- Sector events and market structure events. */

import { getPipelineStatus } from '../regulations.js';

export const MARKET_EVENTS = [
    // =====================================================================
    //  SECTOR EVENTS
    // =====================================================================
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
        headline: 'Zhaowei CEO Liang Wei keynotes Nanjing AI Summit; announces state-backed $50B compute buildout. Dirks calls it "a Sputnik moment for Columbian AI." The Meridian Brief: "Foundry just got a competitor with a sovereign balance sheet."',
        params: { mu: -0.005, theta: 0.003 },
        magnitude: 'minor',
        when: (sim, world) => world.geopolitical.sericaRelations <= 0,
        effects: (world) => { world.geopolitical.foundryCompetitionPressure = true; },
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

    // =====================================================================
    //  MARKET STRUCTURE EVENTS
    // =====================================================================
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
