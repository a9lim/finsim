/* ===================================================
   lobbying.js -- Player lobbying mechanic. Spend cash
   to nudge Barron's approval and tilt party momentum
   for midterms, special elections, and defections.

   A derivatives trader can't buy Congress — but dark
   money PAC contributions can shift the political wind.

   Three tiers: basic PAC funding (always), fundraisers
   (faction-gated), and high-access plays (high-faction).

   Leaf module. No DOM access.
   =================================================== */

import { getFaction, shiftFaction } from './faction-standing.js';
import { hasTrait, getTraitEffect } from './traits.js';

const LOBBY_COOLDOWN = 30;
const MOMENTUM_CAP = 3;
let _lastLobbyDay = -Infinity;

const LOBBY_ACTIONS = [
    // Tier 1 — always available
    {
        id: 'pac_federalist', tier: 1,
        name: 'Fund Federalist PAC',
        desc: 'Support the ruling party. Advances their legislative agenda.',
        baseCost: 400,
        gate: () => true,
        execute: (world) => {
            shiftFaction('federalistSupport', 4);
            shiftFaction('farmerLaborSupport', -1);
            shiftFaction('regulatoryExposure', 3);
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
            world.election.lobbyMomentum = Math.min(MOMENTUM_CAP, world.election.lobbyMomentum + 1);
        },
    },
    {
        id: 'pac_farmerlabor', tier: 1,
        name: 'Fund Farmer-Labor PAC',
        desc: 'Support the opposition. Signals independence.',
        baseCost: 400,
        gate: () => true,
        execute: (world) => {
            shiftFaction('farmerLaborSupport', 4);
            shiftFaction('federalistSupport', -1);
            shiftFaction('regulatoryExposure', 3);
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            world.election.lobbyMomentum = Math.max(-MOMENTUM_CAP, world.election.lobbyMomentum - 1);
        },
    },
    // Tier 2 — faction-gated
    {
        id: 'host_fundraiser', tier: 2,
        name: 'Host a Fundraiser',
        desc: 'Higher cost, builds access to multiple politicians.',
        baseCost: 800,
        gate: () => hasTrait('political_player') || getFaction('federalistSupport') > 50 || getFaction('farmerLaborSupport') > 50,
        execute: (world) => {
            const fedSup = getFaction('federalistSupport');
            const flSup = getFaction('farmerLaborSupport');
            if (fedSup >= flSup) shiftFaction('federalistSupport', 8);
            else shiftFaction('farmerLaborSupport', 8);
            shiftFaction('regulatoryExposure', hasTrait('under_scrutiny') ? 5 : 2);
        },
        playerFlag: 'hosted_fundraiser',
    },
    // Tier 3 — high-faction-gated
    {
        id: 'broker_deal', tier: 3,
        name: 'Broker a Deal',
        desc: 'Requires bipartisan access. Attempt a legislative compromise.',
        baseCost: 1200,
        gate: () => getFaction('federalistSupport') > 60 && getFaction('farmerLaborSupport') > 60,
        execute: (world) => {
            if (world.congress.bigBillStatus < 4) {
                world.congress.bigBillStatus = Math.min(4, world.congress.bigBillStatus + 1);
            }
            shiftFaction('federalistSupport', 3);
            shiftFaction('farmerLaborSupport', 3);
            shiftFaction('regulatoryExposure', 5);
        },
        playerFlag: 'brokered_deal',
    },
    {
        id: 'leak_to_media', tier: 3,
        name: 'Leak to Media',
        desc: 'Feed information to shape the narrative. High risk if traced.',
        baseCost: 0,
        gate: () => getFaction('mediaTrust') > 70,
        execute: (world) => {
            const traceChance = hasTrait('ghost_protocol') ? 0.25 : 0.5;
            const traced = Math.random() < traceChance;
            if (traced) {
                shiftFaction('mediaTrust', -20);
                shiftFaction('regulatoryExposure', 15);
            } else {
                shiftFaction('mediaTrust', 5);
            }
        },
        playerFlag: 'leaked_to_media',
    },
    {
        id: 'counsel_fed', tier: 3,
        name: 'Counsel the Fed',
        desc: 'Nudge rate policy through informal advisory access.',
        baseCost: 0,
        gate: () => getFaction('fedRelations') > 75,
        execute: (world) => {
            shiftFaction('fedRelations', 5);
        },
        playerFlag: 'counseled_fed',
    },
];

export { LOBBY_ACTIONS };

export function getAvailableActions(day, cash) {
    const costMult = getTraitEffect('lobbyingCostMult', 1);
    return LOBBY_ACTIONS
        .filter(a => a.gate())
        .map(a => ({
            ...a,
            cost: Math.round(a.baseCost * costMult),
            affordable: cash >= Math.round(a.baseCost * costMult),
            cooldownReady: day - _lastLobbyDay >= LOBBY_COOLDOWN,
        }));
}

export function executeLobbyAction(actionId, day, world) {
    const action = LOBBY_ACTIONS.find(a => a.id === actionId);
    if (!action) return null;
    const costMult = getTraitEffect('lobbyingCostMult', 1);
    const cost = Math.round(action.baseCost * costMult);
    action.execute(world);
    _lastLobbyDay = day;
    return { cost, action, playerFlag: action.playerFlag || null };
}

export function resetLobbying() {
    _lastLobbyDay = -Infinity;
}
