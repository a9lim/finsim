/* media.js -- Media ecosystem events. */

import { equity, shortDirectionalNotional } from './_helpers.js';
import { firmThresholdMult, firmTone, shiftFaction } from '../faction-standing.js';
import { getActiveTraitIds, hasTrait } from '../traits.js';
import { INITIAL_CAPITAL } from '../config.js';

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

    // ===================================================================
    //  MEDIA POPUP EVENTS (migrated from popup-events.js)
    // ===================================================================

    {
        id: 'desk_ft_interview',
        trigger: () => equity() > INITIAL_CAPITAL * 1.5 || hasTrait('media_figure'),
        cooldown: 300,
        popup: true,
        headline: 'The Continental wants a profile',
        context: (sim, world) => {
            const eq = equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            const convIds = getActiveTraitIds();
            if (convIds.includes('media_darling')) {
                return `Your returns are up ${pct}% and Rachel Tan's editor at The Continental wants to run a feature. "The Meridian Trader Who Bet Against the Crowd." You already have a reputation — MarketWire, The Sentinel, and now The Continental. Tan's profiles are the gold standard. The PR team is thrilled. But the cover jinx is real.`;
            }
            if (convIds.includes('ghost_protocol')) {
                return `Your returns are up ${pct}% and somehow The Continental's markets desk has noticed. An editor reached out to Meridian's PR team — "The Trader Nobody Knows" is their working headline. You've stayed invisible this long. A profile in The Continental would change that permanently.`;
            }
            if (hasTrait('media_figure')) {
                return `Your returns are up ${pct}% and your growing public profile has caught The Continental's attention. Rachel Tan's editor wants an in-depth feature — "The Meridian Trader Everyone's Watching." Between the conference panels, the MarketWire mentions, and the sellside chatter, you're already half-famous. A Continental profile would finish the job.`;
            }
            return `Your returns are up ${pct}% and The Continental's markets desk wants an interview. "The Meridian Trader Who Bet Against the Crowd" — that's their working headline. The PR team is excited. Your MD is cautiously supportive. But every trader who's ever been profiled knows: the cover jinx is real. The moment the ink dries, the market gods come for you.`;
        },
        choices: [
            {
                label: 'Do the interview',
                desc: 'Enjoy the spotlight. You earned it.',
                factionShifts: [
                    { faction: 'mediaTrust', value: 8, when: { hasTrait: 'media_figure' }, bonus: 2 },
                    { faction: 'regulatoryExposure', value: 3, when: { hasTrait: 'under_scrutiny' }, bonus: 3 },
                ],
                deltas: { xi: 0.01 },
                playerFlag: 'did_ft_interview',
                resultToast: 'The profile runs in The Continental. Your LinkedIn explodes. The floor treats you differently now.',
            },
            {
                label: 'Decline politely',
                desc: 'Stay anonymous. The best traders are the ones nobody\'s heard of.',
                factionShifts: [{ faction: 'mediaTrust', value: -2 }],
                deltas: {},
                playerFlag: 'declined_ft_interview',
                resultToast: 'The Continental runs a piece about Meridian anyway, but without your name. Smart.',
            },
        ],
    },

    {
        id: 'desk_media_big_win',
        trigger: () => equity() > INITIAL_CAPITAL * (hasTrait('media_figure') ? 1.4 : 1.8),
        cooldown: 400,
        era: 'mid',
        popup: true,
        headline: 'MarketWire: "Meridian Capital\'s macro desk posts record quarter"',
        context: () => {
            const eq = equity();
            const pct = (((eq / INITIAL_CAPITAL) - 1) * 100).toFixed(0);
            return `Priya Sharma's MarketWire column picked up your desk's results: +${pct}%. Your name isn't in the story, but everyone on the street knows who's driving the P&L. Two hedge fund managers sent congratulations. Your MD is using your returns in the investor presentation. The question now: do you let the success speak for itself, or use the attention to build your brand?`;
        },
        choices: [
            {
                label: 'Stay in the shadows',
                desc: 'The work is the brand. Let the returns compound.',
                factionShifts: [{ faction: 'mediaTrust', value: -1 }],
                deltas: {},
                playerFlag: 'stayed_shadows_media',
                resultToast: 'Silent and profitable. The way the old guard did it.',
            },
            {
                label: 'Accept a panel invitation',
                desc: 'A macro conference wants you on their "New Voices" panel.',
                factionShifts: [
                    { faction: 'mediaTrust', value: 5, when: { hasTrait: 'media_figure' }, bonus: 2 },
                    { faction: 'regulatoryExposure', value: 2, when: { hasTrait: 'under_scrutiny' }, bonus: 2 },
                ],
                deltas: { xi: 0.005 },
                playerFlag: 'accepted_panel_media',
                resultToast: 'The panel goes well. You\'re now a "voice" in macro. The attention cuts both ways.',
            },
        ],
    },

    {
        id: 'desk_crisis_profiteer',
        trigger: (sim, world) => {
            const eq = equity();
            if (eq <= 0) return false;
            return (world.geopolitical.mideastEscalation >= 2 || world.geopolitical.oilCrisis) &&
                eq > INITIAL_CAPITAL * 1.1 &&
                shortDirectionalNotional() / eq > 0.15 * firmThresholdMult();
        },
        cooldown: 300,
        popup: true,
        headline: 'The Continental investigates "Meridian\'s crisis profits"',
        context: (sim, world) => {
            const crisis = world.geopolitical.oilCrisis ? 'Farsistan oil crisis' : 'Farsistan escalation';
            const tone = firmTone();
            const prefix = tone === 'warm' ? 'Routine review — '
                : tone === 'pointed' ? 'We need to talk again — '
                : tone === 'final_warning' ? 'This is being escalated to HR — '
                : '';
            return prefix + `The ${crisis} is deepening. You're short and making money. Rachel Tan at The Continental is writing about "Wall Street winners in wartime" — her editor told Meridian's PR team to expect a FOIA request for communication records. Nobody is accusing you of anything illegal — shorting during a crisis is perfectly legal — but Tan's investigative pieces have a way of becoming congressional inquiries.`;
        },
        choices: [
            {
                label: 'Cover all shorts',
                desc: 'Close all short directional exposure. Take profits and remove the target.',
                trades: [{ action: 'close_short' }],
                complianceTier: 'full',
                playerFlag: 'covered_crisis_short',
                resultToast: 'Short positions closed. The story runs without your firm\'s name.',
            },
            {
                label: 'Hold the position',
                desc: 'You have a fiduciary duty to your investors. The position is legal and well-reasoned.',
                factionShifts: [
                    { faction: 'regulatoryExposure', value: 3, when: { hasTrait: 'under_scrutiny' }, bonus: 3 },
                    { faction: 'mediaTrust', value: -2 },
                ],
                complianceTier: 'defiant',
                deltas: { xi: 0.01 },
                playerFlag: 'held_crisis_short',
                resultToast: 'You hold. The article mentions Meridian in paragraph 14.',
            },
        ],
    },
];
