/* media.js -- Media ecosystem events. */

import { shiftFaction } from '../faction-standing.js';

export const MEDIA_EVENTS = [
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
];
