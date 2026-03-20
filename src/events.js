/* ===================================================
   events.js -- Dynamic event engine for Shoals.
   Poisson-scheduled events that shift simulation
   parameters. Supports offline (curated) and LLM
   event sources, with MTTH-style followup chains.
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
};

const MAX_LOG = 20;
const MAX_CHAIN_DEPTH = 5;
const FED_MEETING_INTERVAL = 32;  // ~252/8 = 31.5 → 32 trading days between FOMC meetings

// -- Offline event pool -------------------------------------------------
export const OFFLINE_EVENTS = [

    // ================================================================
    // FED / MONETARY (~15)
    // ================================================================
    {
        id: 'fed_holds_steady_1', category: 'fed', likelihood: 5,
        headline: 'Fed holds rates steady; Hartley says policy is "well-positioned" given current data',
        params: { theta: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'fed_holds_steady_2', category: 'fed', likelihood: 5,
        headline: 'FOMC votes unanimously to hold rates; statement largely unchanged from prior meeting',
        params: { theta: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'fed_holds_steady_3', category: 'fed', likelihood: 4,
        headline: 'Fed stands pat as expected; Hartley notes "balanced risks" in post-meeting presser',
        params: { mu: 0.005, theta: -0.002 },
        magnitude: 'minor',
    },
    {
        id: 'fed_signals_hike_cycle', category: 'fed', likelihood: 0.8,
        headline: 'Hartley signals rate hike cycle beginning; inflation remains above target',
        params: { mu: -0.03, theta: 0.015, b: 0.01 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.15,
        followups: [
            { id: 'fed_hikes_25bps', mtth: 30, weight: 0.75 },
        ],
    },
    {
        id: 'fed_hikes_25bps', category: 'fed', likelihood: 1.0,
        headline: 'Fed raises benchmark rate 25bps; Hartley says "further increases may be appropriate"',
        params: { mu: -0.02, b: 0.0075, theta: 0.008 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.15,
        followups: [
            { id: 'fed_hikes_again_25bps', mtth: 35, weight: 0.55 },
            { id: 'housing_stress_fed_pauses', mtth: 30, weight: 0.40 },
        ],
    },
    {
        id: 'fed_hikes_again_25bps', category: 'fed', likelihood: 0.7,
        headline: 'Fed delivers second consecutive 25bps hike; labor market still tight',
        params: { mu: -0.02, b: 0.0075, lambda: 0.4 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.15,
    },
    {
        id: 'housing_stress_fed_pauses', category: 'fed', likelihood: 0.8,
        headline: 'Housing starts collapse; Hartley signals pause as credit conditions tighten',
        params: { mu: -0.02, theta: 0.01, lambda: 0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'fed_signals_cut_cycle', category: 'fed', likelihood: 0.8,
        headline: 'Fed pivots dovish; Hartley cites softening labor market and falling inflation',
        params: { mu: 0.04, theta: -0.01, b: -0.008 },
        magnitude: 'moderate',
        when: (sim) => sim.b > -0.03,
        followups: [
            { id: 'fed_cuts_50bps_emergency', mtth: 30, weight: 0.45 },
        ],
    },
    {
        id: 'fed_cuts_50bps_emergency', category: 'fed', likelihood: 0.4,
        headline: 'Fed delivers surprise 50bps cut in inter-meeting action; recession fears spike',
        params: { mu: 0.05, theta: 0.02, b: -0.015, lambda: 1.5 },
        magnitude: 'major',
        when: (sim) => sim.b > -0.03,
    },
    {
        id: 'fed_qe_restart', category: 'fed', likelihood: 0.3,
        headline: 'Fed announces $80B/month asset purchase program to support credit markets',
        params: { mu: 0.06, theta: -0.015, b: -0.01, xi: -0.05 },
        magnitude: 'major',
    },
    {
        id: 'fed_hawkish_minutes', category: 'fed', likelihood: 1.2,
        headline: 'FOMC minutes show broad support for "higher for longer" stance',
        params: { mu: -0.02, theta: 0.008, b: 0.005 },
        magnitude: 'minor',
        when: (sim) => sim.b < 0.12,
    },
    {
        id: 'fed_dovish_minutes', category: 'fed', likelihood: 1.2,
        headline: 'FOMC minutes reveal several members favored a cut; dovish tilt surprises markets',
        params: { mu: 0.02, theta: -0.008, b: -0.005 },
        magnitude: 'minor',
        when: (sim) => sim.b > 0.0,
    },
    {
        id: 'fed_reverse_repo_spike', category: 'fed', likelihood: 0.8,
        headline: 'Fed reverse repo usage hits $2.5T; excess liquidity drains from money markets',
        params: { mu: -0.01, theta: 0.005, sigmaR: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'barron_pressures_hartley', category: 'fed', likelihood: 1.5,
        headline: 'Barron publicly demands Hartley cut rates, calls Fed policy "a disaster for working people"',
        params: { mu: 0.01, theta: 0.005, b: -0.003, sigmaR: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'hartley_pushes_back', category: 'fed', likelihood: 1.0,
        headline: 'Hartley rebuffs Barron, reaffirms Fed independence: "We follow the data, not politics"',
        params: { mu: -0.01, theta: -0.003, b: 0.002 },
        magnitude: 'minor',
    },

    // ================================================================
    // MACRO / GEOPOLITICAL (~15)
    // ================================================================
    {
        id: 'tariff_escalation', likelihood: 0.8,
        headline: 'Barron announces 25% tariff on $300B of imported goods; trading partners vow retaliation',
        params: { mu: -0.05, theta: 0.02, lambda: 1.0, muJ: -0.02 },
        magnitude: 'major',
        followups: [
            { id: 'trade_partner_retaliates', mtth: 25, weight: 0.70 },
        ],
    },
    {
        id: 'trade_partner_retaliates', likelihood: 0.7,
        headline: 'Major trading bloc imposes counter-tariffs on agricultural exports and tech goods',
        params: { mu: -0.03, theta: 0.015, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'trade_deal_signed', likelihood: 0.8,
        headline: 'Barron signs framework trade agreement with Pacific Rim nations; tariffs to be phased out',
        params: { mu: 0.04, theta: -0.01, lambda: -0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'sanctions_energy_sector', likelihood: 0.5,
        headline: 'Barron imposes sweeping sanctions against major oil exporter; energy prices surge',
        params: { mu: -0.04, theta: 0.025, lambda: 1.2, muJ: -0.03 },
        magnitude: 'major',
    },
    {
        id: 'recession_confirmed', likelihood: 0.3,
        headline: 'GDP contracts for second consecutive quarter; recession officially declared',
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, b: -0.01 },
        magnitude: 'major',
    },
    {
        id: 'cpi_surprise_high', likelihood: 1.2,
        headline: 'CPI comes in at 7.2% YoY, well above consensus of 5.8%; rate hike bets surge',
        params: { mu: -0.03, theta: 0.012, b: 0.008 },
        magnitude: 'moderate',
        when: (sim) => sim.b < 0.14,
    },
    {
        id: 'cpi_surprise_low', likelihood: 1.2,
        headline: 'Inflation cools sharply to 2.1%; rate cut bets jump, bonds rally broadly',
        params: { mu: 0.03, theta: -0.008, b: -0.006 },
        magnitude: 'moderate',
        when: (sim) => sim.b > 0.00,
    },
    {
        id: 'oil_shock_supply', likelihood: 0.8,
        headline: 'Surprise OPEC+ supply cut of 1.5M barrels/day; crude rallies 8%',
        params: { mu: -0.03, theta: 0.018, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'geopolitical_ceasefire', likelihood: 0.8,
        headline: 'Ceasefire agreement reached in Middle East conflict zone; risk assets rally globally',
        params: { mu: 0.04, theta: -0.012, lambda: -0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'sovereign_debt_crisis', likelihood: 0.3,
        headline: 'Mid-tier sovereign unable to refinance debt; contagion fears spread to emerging markets',
        params: { mu: -0.05, theta: 0.03, lambda: 1.5, sigmaR: 0.008 },
        magnitude: 'major',
    },
    {
        id: 'barron_mideast_strikes', likelihood: 1.0,
        headline: 'Barron orders airstrikes in the Middle East; Pentagon deploys carrier group',
        params: { mu: -0.03, theta: 0.015, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'barron_south_america_ops', likelihood: 0.8,
        headline: 'Barron authorizes "stabilization operations" in South America using PNTH AI targeting',
        params: { mu: -0.02, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'barron_renames_dod', likelihood: 0.4,
        headline: 'Barron signs executive order renaming Department of Defense to "Department of War"',
        params: { mu: -0.01, theta: 0.008, lambda: 0.4 },
        magnitude: 'minor',
    },
    {
        id: 'strong_jobs_report', likelihood: 1.5,
        headline: 'Nonfarm payrolls blow past expectations; unemployment falls to 3.5%',
        params: { mu: 0.02, theta: -0.005, b: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'weak_jobs_report', likelihood: 1.5,
        headline: 'Jobs report badly misses; unemployment rises to 5.1%, worst in three years',
        params: { mu: -0.02, theta: 0.008, b: -0.004 },
        magnitude: 'minor',
    },

    // ================================================================
    // SECTOR / TECH (~10)
    // ================================================================
    {
        id: 'ai_regulation_bill', likelihood: 0.8,
        headline: 'Congress passes sweeping AI regulation bill requiring model audits and liability frameworks',
        params: { mu: -0.04, theta: 0.015, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'antitrust_big_tech', likelihood: 0.6,
        headline: 'DOJ files landmark antitrust suit against two largest cloud providers',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'semiconductor_shortage', likelihood: 0.8,
        headline: 'Leading-edge chip shortage intensifies; lead times extend to 52 weeks',
        params: { mu: -0.02, theta: 0.01, lambda: 0.5 },
        magnitude: 'minor',
    },
    {
        id: 'semiconductor_glut', likelihood: 0.8,
        headline: 'Chip inventory correction deepens; major fab cuts production outlook by 30%',
        params: { mu: -0.02, theta: 0.008, lambda: 0.4 },
        magnitude: 'minor',
    },
    {
        id: 'mega_data_breach', likelihood: 0.5,
        headline: '500M user records exposed in breach at major social platform; FTC probe launched',
        params: { mu: -0.03, theta: 0.012, lambda: 0.7 },
        magnitude: 'moderate',
    },
    {
        id: 'tech_ipo_frenzy', likelihood: 0.8,
        headline: 'Wave of high-profile tech IPOs oversubscribed 20x; risk appetite surges',
        params: { mu: 0.03, theta: -0.008, xi: 0.05 },
        magnitude: 'minor',
    },
    {
        id: 'cloud_spending_boom', likelihood: 1.0,
        headline: 'Enterprise cloud spending grows 45% YoY; hyperscalers raise full-year guidance',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3 },
        magnitude: 'minor',
    },
    {
        id: 'cybersecurity_attack_infrastructure', likelihood: 0.4,
        headline: 'Nation-state cyberattack disrupts critical infrastructure; markets reprice tail risk',
        params: { mu: -0.04, theta: 0.02, lambda: 1.0, muJ: -0.02 },
        magnitude: 'moderate',
    },
    {
        id: 'ai_boom_sentiment', likelihood: 1.2,
        headline: 'AI spending forecasts revised sharply upward; Goldman calls it "the defining trade of the decade"',
        params: { mu: 0.03, theta: -0.008, lambda: -0.3 },
        magnitude: 'minor',
    },
    {
        id: 'tech_earnings_mixed', likelihood: 2.0,
        headline: 'Tech earnings season delivers mixed results; megacaps split between beats and misses',
        params: { theta: 0.003, lambda: 0.2 },
        magnitude: 'minor',
    },

    // ================================================================
    // PNTH COMPANY (~25)
    // ================================================================
    {
        id: 'pnth_gottlieb_refuses_military', likelihood: 0.8,
        headline: 'PNTH CEO Gottlieb publicly refuses to deploy AI for Barron military ops, citing ethical red lines',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
        followups: [
            { id: 'pnth_dirks_overrules', mtth: 20, weight: 0.80 },
        ],
    },
    {
        id: 'pnth_dirks_overrules', likelihood: 0.7,
        headline: 'Chairwoman Dirks overrules Gottlieb, authorizes PNTH military contract; board backs her 7-3',
        params: { mu: 0.02, theta: 0.008, lambda: 0.4 },
        magnitude: 'moderate',
        followups: [
            { id: 'pnth_board_crisis', mtth: 25, weight: 0.60 },
        ],
    },
    {
        id: 'pnth_board_crisis', likelihood: 0.5,
        headline: 'Gottlieb threatens resignation; three independent directors demand emergency board meeting',
        params: { mu: -0.04, theta: 0.018, lambda: 0.8 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_defense_contract_2b', likelihood: 0.6,
        headline: 'Barron awards PNTH $2B Pentagon contract for battlefield AI intelligence platform',
        params: { mu: 0.06, theta: -0.012, lambda: -0.4 },
        magnitude: 'major',
        followups: [
            { id: 'pnth_aclu_lawsuit', mtth: 30, weight: 0.50 },
        ],
    },
    {
        id: 'pnth_aclu_lawsuit', likelihood: 0.5,
        headline: 'ACLU sues to block PNTH battlefield surveillance contract over civil liberties concerns',
        params: { mu: -0.03, theta: 0.010, lambda: 0.5 },
        magnitude: 'moderate',
        followups: [
            { id: 'pnth_senate_investigation', mtth: 35, weight: 0.40 },
        ],
    },
    {
        id: 'pnth_senate_investigation', likelihood: 0.4,
        headline: 'Senate opens investigation into VP Bowman ties to PNTH; Dirks called to testify',
        params: { mu: -0.05, theta: 0.02, lambda: 1.0 },
        magnitude: 'major',
    },
    {
        id: 'pnth_bowman_lobbying', likelihood: 0.8,
        headline: 'Report reveals VP Bowman lobbied Pentagon officials on behalf of PNTH before taking office',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
        followups: [
            { id: 'pnth_senate_investigation', mtth: 30, weight: 0.50 },
        ],
    },
    {
        id: 'pnth_doj_antitrust_suit', likelihood: 0.3,
        headline: 'DOJ files antitrust suit against PNTH alleging monopolization of federal data analytics',
        params: { mu: -0.07, theta: 0.03, lambda: 1.5, muJ: -0.04 },
        magnitude: 'major',
    },
    {
        id: 'pnth_vp_intervenes', likelihood: 0.6,
        headline: 'VP Bowman publicly backs PNTH, calls DOJ review "politically motivated"; shares rebound',
        params: { mu: 0.05, theta: -0.012, lambda: -0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_earnings_beat', likelihood: 1.5,
        headline: 'PNTH beats Q3 estimates by 18%; government revenue up 42% YoY, guidance raised',
        params: { mu: 0.05, theta: -0.010, lambda: -0.4 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_earnings_miss', likelihood: 1.5,
        headline: 'PNTH misses Q2 estimates; commercial segment underperforms, government contracts delayed',
        params: { mu: -0.05, theta: 0.018, lambda: 0.8, muJ: -0.02 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_ceo_threatens_resign', likelihood: 0.7,
        headline: 'Gottlieb tells WSJ he will resign if PNTH deploys AI in "offensive military operations"',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_ethics_board_revolt', likelihood: 0.6,
        headline: 'Three PNTH ethics board members resign in protest over classified contract scope',
        params: { mu: -0.03, theta: 0.012, lambda: 0.6 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_whistleblower', likelihood: 0.4,
        headline: 'Former PNTH engineer files whistleblower complaint over undisclosed data sharing with NSA',
        params: { mu: -0.06, theta: 0.025, lambda: 1.2, muJ: -0.03 },
        magnitude: 'major',
    },
    {
        id: 'pnth_product_launch_atlas', likelihood: 1.0,
        headline: 'PNTH launches Atlas AI platform for commercial enterprises; $500M revenue pipeline announced',
        params: { mu: 0.04, theta: -0.008, lambda: -0.3 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_congressional_hearing', likelihood: 0.8,
        headline: 'Dirks and Gottlieb testify before House Intelligence Committee; tense exchanges on ethics',
        params: { mu: -0.02, theta: 0.010, lambda: 0.5 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_contract_renewal', likelihood: 1.2,
        headline: 'DHS renews multi-year PNTH contract, expanding scope to border analytics systems',
        params: { mu: 0.03, theta: -0.006, lambda: -0.2 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_contract_cancelled', likelihood: 0.5,
        headline: 'Army cancels $400M PNTH contract following cybersecurity audit findings',
        params: { mu: -0.05, theta: 0.018, lambda: 0.9, muJ: -0.025 },
        magnitude: 'major',
    },
    {
        id: 'pnth_activist_stake', likelihood: 0.7,
        headline: 'Activist hedge fund discloses 8% stake in PNTH, demands sale of commercial division',
        params: { mu: 0.04, theta: 0.008, lambda: 0.5 },
        magnitude: 'moderate',
    },
    {
        id: 'pnth_patent_suit', likelihood: 0.6,
        headline: 'Rival files patent suit claiming PNTH core algorithm infringes 3 key patents',
        params: { mu: -0.02, theta: 0.008, lambda: 0.4 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_analyst_upgrade', likelihood: 1.5,
        headline: 'Morgan Stanley upgrades PNTH to Overweight; cites "unmatched government moat"',
        params: { mu: 0.02, theta: -0.005, lambda: -0.2 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_analyst_downgrade', likelihood: 1.5,
        headline: 'Citi downgrades PNTH to Sell; cites regulatory overhang and Gottlieb-Dirks rift',
        params: { mu: -0.02, theta: 0.006, lambda: 0.3 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_hires_cto', likelihood: 1.5,
        headline: 'PNTH hires former Google DeepMind VP as new CTO; market reacts positively',
        params: { mu: 0.02, theta: -0.004 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_annual_meeting', likelihood: 2.0,
        headline: 'PNTH holds annual shareholder meeting; Dirks deflects questions about military contracts',
        params: { theta: 0.003, lambda: 0.1 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_partnership_cloud', likelihood: 1.0,
        headline: 'PNTH announces strategic cloud partnership with major hyperscaler; shares rally',
        params: { mu: 0.03, theta: -0.006, lambda: -0.2 },
        magnitude: 'minor',
    },

    // ================================================================
    // MARKET STRUCTURE (~8)
    // ================================================================
    {
        id: 'flash_crash', likelihood: 0.2,
        headline: 'Flash crash: Dow drops 1800 points in 9 minutes before partial recovery; cause unknown',
        params: { mu: -0.04, theta: 0.04, lambda: 3.0, muJ: -0.06, xi: 0.15 },
        magnitude: 'major',
    },
    {
        id: 'short_squeeze_meme', likelihood: 0.3,
        headline: 'Coordinated retail buying triggers short squeeze; short interest in several names exceeds 150%',
        params: { mu: 0.05, theta: 0.03, lambda: 2.0, xi: 0.12 },
        magnitude: 'major',
    },
    {
        id: 'liquidity_crisis_repo', likelihood: 0.3,
        headline: 'Overnight repo market seizes; Fed injects $200B in emergency liquidity',
        params: { mu: -0.05, theta: 0.035, lambda: 2.0, muJ: -0.04, sigmaR: 0.012 },
        magnitude: 'major',
    },
    {
        id: 'options_expiry_vol_spike', likelihood: 1.0,
        headline: 'Triple witching exacerbated by record open interest; intraday vol spikes 40%',
        params: { theta: 0.02, lambda: 1.0, xi: 0.08 },
        magnitude: 'moderate',
    },
    {
        id: 'algo_glitch_erroneous_orders', likelihood: 0.5,
        headline: 'Major market maker algo malfunction floods exchange with erroneous orders; trading halted 18 minutes',
        params: { mu: -0.02, theta: 0.02, lambda: 1.5, muJ: -0.02 },
        magnitude: 'moderate',
    },
    {
        id: 'vix_spike_contagion', likelihood: 0.3,
        headline: 'VIX spikes to 45 on global risk-off; leveraged vol ETPs face liquidation cascade',
        params: { mu: -0.06, theta: 0.05, lambda: 2.5, xi: 0.18, rho: -0.08 },
        magnitude: 'major',
    },
    {
        id: 'margin_call_cascade', likelihood: 0.3,
        headline: 'Prime broker issues wave of margin calls; forced selling cascades across sectors',
        params: { mu: -0.04, theta: 0.025, lambda: 1.5, muJ: -0.03 },
        magnitude: 'major',
    },
    {
        id: 'low_vol_grind', likelihood: 1.0,
        headline: 'VIX falls to multi-year low of 11; options sellers dominate as complacency sets in',
        params: { theta: -0.015, lambda: -0.8, xi: -0.08 },
        magnitude: 'minor',
    },

    // ================================================================
    // NEUTRAL / FLAVOR (~15, high likelihood)
    // ================================================================
    {
        id: 'neutral_sideways_1', likelihood: 5,
        headline: 'Markets drift sideways on light volume; traders await next week\'s data releases',
        params: { theta: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_sideways_2', likelihood: 5,
        headline: 'Quiet trading day as investors position ahead of earnings season',
        params: { mu: 0.003, theta: -0.001 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_mixed_data', likelihood: 4,
        headline: 'Mixed economic data leaves markets directionless; ISM and PMI send conflicting signals',
        params: { theta: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'barron_cryptic_tweet', likelihood: 4,
        headline: 'President Barron posts cryptic tweet about "big changes coming"; markets shrug',
        params: { theta: 0.002, lambda: 0.1 },
        magnitude: 'minor',
    },
    {
        id: 'barron_speech_nothing', likelihood: 4,
        headline: 'Barron gives lengthy primetime address; no new policy changes announced',
        params: { mu: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_holiday_volume', likelihood: 3,
        headline: 'Thin pre-holiday trading session; volume at lowest level of the year',
        params: { theta: -0.002, lambda: -0.1 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_sector_rotation', likelihood: 3,
        headline: 'Sector rotation continues as money moves from growth to value; net impact negligible',
        params: { theta: 0.002 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_opex_positioning', likelihood: 3,
        headline: 'Options expiration week sees heavy dealer hedging; market pins near round number',
        params: { theta: 0.003, lambda: 0.2 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_congress_gridlock', likelihood: 4,
        headline: 'Congress remains gridlocked on spending bill; Federalists blame Farmer-Labor holdouts',
        params: { theta: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_overseas_flat', likelihood: 4,
        headline: 'Asian and European markets close flat; US futures follow suit',
        params: { mu: 0.003 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_buyback_season', likelihood: 3,
        headline: 'Corporate buyback window opens; steady bid supports markets without catalyst',
        params: { mu: 0.01, theta: -0.002 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_clay_memoir', likelihood: 2,
        headline: 'Former President Clay releases memoir blaming Barron\'s "reckless populism"; no market impact',
        params: { mu: 0.005 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_bond_auction', likelihood: 3,
        headline: '10-year Treasury auction meets tepid demand; yield backs up 3bps before settling',
        params: { theta: 0.002, b: 0.001 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_pnth_conf', likelihood: 2,
        headline: 'PNTH presents at investor conference; Gottlieb stresses commercial growth, avoids military topic',
        params: { mu: 0.01, theta: -0.001 },
        magnitude: 'minor',
    },
    {
        id: 'neutral_retail_data', likelihood: 3,
        headline: 'Retail sales come in roughly in line with expectations; consumer spending holds steady',
        params: { theta: 0.001 },
        magnitude: 'minor',
    },
];

const _FED_EVENTS = OFFLINE_EVENTS.filter(e => e.category === 'fed');
const _NON_FED_EVENTS = OFFLINE_EVENTS.filter(e => e.category !== 'fed');

// -- Event-by-id lookup (built lazily) ----------------------------------
let _eventById = null;
function _getEventById(id) {
    if (!_eventById) {
        _eventById = new Map();
        for (const ev of OFFLINE_EVENTS) _eventById.set(ev.id, ev);
    }
    return _eventById.get(id) || null;
}

// -- EventEngine --------------------------------------------------------
export class EventEngine {
    constructor(source, llmSource = null) {
        this.source = source;           // 'offline' | 'llm'
        this._llm = llmSource;          // LLMEventSource instance (or null)
        this.eventLog = [];             // { day, headline, magnitude, params }
        this._queue = [];               // pre-fetched LLM events
        this._pendingFollowups = [];    // { event, chainId, targetDay, weight, depth }
        this._poissonRate = 1 / 60;     // ~1 non-fed event per 60 trading days
        this._prefetching = false;
        this._nextFedDay = -1;          // day of next scheduled FOMC meeting
    }

    /**
     * Called each completed trading day. May fire an event.
     * Returns an array of fired event log entries (may be empty).
     */
    maybeFire(sim, day) {
        // 1. Check pending followups first (returns array)
        const firedFollowups = this._checkFollowups(sim, day);
        if (firedFollowups.length > 0) return firedFollowups;

        // 2. Scheduled FOMC meeting
        if (this._nextFedDay < 0) this._nextFedDay = day + FED_MEETING_INTERVAL;
        if (day >= this._nextFedDay) {
            this._nextFedDay += FED_MEETING_INTERVAL;
            const fedEvent = this._drawFed(sim);
            if (fedEvent) return [this._fireEvent(fedEvent, sim, day, 0)];
        }

        // 3. Poisson draw for non-fed event
        if (Math.random() >= this._poissonRate) return [];

        // 4. Draw from appropriate source
        const event = this.source === 'llm'
            ? this._drawLLM(sim)
            : this._drawOffline(sim, true);

        if (!event) return [];
        return [this._fireEvent(event, sim, day, 0)];
    }

    /** Kick off initial LLM batch fetch. */
    prefetch(sim) {
        if (this.source !== 'llm' || !this._llm) return;
        this._fetchBatch(sim);
    }

    /** Apply param deltas to sim, clamp to PARAM_RANGES. */
    applyDeltas(sim, params) {
        if (!params) return;
        for (const [key, delta] of Object.entries(params)) {
            const range = PARAM_RANGES[key];
            if (!range) continue;
            sim[key] = Math.min(range.max, Math.max(range.min, sim[key] + delta));
        }
        if (params.rho !== undefined) sim._recomputeRhoDerived();
    }

    /** Clear all state. */
    reset() {
        this.eventLog = [];
        this._queue = [];
        this._pendingFollowups = [];
        this._prefetching = false;
        this._nextFedDay = -1;
    }

    // -- Internal ---------------------------------------------------------

    _fireEvent(event, sim, day, depth) {
        this.applyDeltas(sim, event.params);

        const logEntry = {
            day,
            headline: event.headline,
            magnitude: event.magnitude || 'moderate',
            params: event.params || {},
        };
        this.eventLog.push(logEntry);
        if (this.eventLog.length > MAX_LOG) this.eventLog.shift();

        // Schedule followups (if any and within depth limit)
        if (event.followups && depth < MAX_CHAIN_DEPTH) {
            const chainId = event.id || ('chain_' + day + '_' + Math.random().toString(36).slice(2, 8));
            for (const fu of event.followups) {
                const delay = this._poissonSample(fu.mtth);
                this._pendingFollowups.push({
                    event: _getEventById(fu.id) || fu,
                    chainId,
                    targetDay: day + Math.max(1, delay),
                    weight: fu.weight ?? 1,
                    depth: depth + 1,
                });
            }
        }

        return logEntry;
    }

    _checkFollowups(sim, day) {
        const ready = [];
        const remaining = [];
        for (const pf of this._pendingFollowups) {
            if (pf.targetDay <= day) ready.push(pf);
            else remaining.push(pf);
        }
        this._pendingFollowups = remaining;

        if (ready.length === 0) return [];

        // Group by chainId for mutually exclusive branching
        const chains = new Map();
        for (const pf of ready) {
            const key = pf.chainId || '_ungrouped';
            if (!chains.has(key)) chains.set(key, []);
            chains.get(key).push(pf);
        }

        // Pick one from each chain via weighted selection, then fire
        const fired = [];
        for (const [, group] of chains) {
            const totalWeight = group.reduce((sum, pf) => sum + (pf.weight ?? 1), 0);
            let roll = Math.random() * totalWeight;
            let picked = group[group.length - 1];
            for (const pf of group) {
                roll -= (pf.weight ?? 1);
                if (roll <= 0) { picked = pf; break; }
            }

            const event = picked.event ?? _getEventById(picked.id);
            if (!event) continue;
            if (event.when && !event.when(sim)) continue;

            fired.push(this._fireEvent(event, sim, day, picked.depth));
        }
        return fired;
    }

    _weightedPick(events) {
        const totalWeight = events.reduce((sum, ev) => sum + (ev.likelihood || 1), 0);
        let roll = Math.random() * totalWeight;
        for (const ev of events) {
            roll -= (ev.likelihood || 1);
            if (roll <= 0) return ev;
        }
        return events[events.length - 1];
    }

    _drawFed(sim) {
        const fedEvents = _FED_EVENTS.filter(
            ev => !ev.when || ev.when(sim)
        );
        if (fedEvents.length === 0) return null;
        return this._weightedPick(fedEvents);
    }

    _drawOffline(sim, excludeFed = false) {
        const pool = excludeFed ? _NON_FED_EVENTS : OFFLINE_EVENTS;
        const eligible = pool.filter(ev => !ev.when || ev.when(sim));
        if (eligible.length === 0) return null;
        return this._weightedPick(eligible);
    }

    _drawLLM(sim) {
        if (this._queue.length > 0) return this._queue.shift();

        // Queue empty -- trigger fetch, return offline fallback
        if (!this._prefetching) this._fetchBatch(sim);
        return this._drawOffline(sim, true);
    }

    async _fetchBatch(sim) {
        if (!this._llm || this._prefetching) return;
        this._prefetching = true;
        try {
            const events = await this._llm.generateBatch(
                sim, this.eventLog, this._pendingFollowups
            );
            if (Array.isArray(events)) {
                for (const ev of events) {
                    if (ev && ev.headline && ev.params) this._queue.push(ev);
                }
            }
        } catch (e) {
            if (typeof showToast !== 'undefined')
                showToast('LLM event generation failed; using offline events.');
        }
        this._prefetching = false;
    }

    _poissonSample(mean) {
        if (mean <= 0) return 0;
        if (mean > 500) return Math.round(mean);
        const L = Math.exp(-mean);
        let k = 0, p = 1;
        do { k++; p *= Math.random(); } while (p > L);
        return k - 1;
    }
}
