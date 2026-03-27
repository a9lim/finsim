/* traits.js -- Trait-gated and conviction-gated events. */

import { shiftFaction } from '../faction-standing.js';
import { hasTrait } from '../traits.js';

export const TRAIT_EVENTS = [
    // ── Trait-gated events ──
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
];
