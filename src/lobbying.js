/* ===================================================
   lobbying.js -- Player lobbying mechanic. Spend cash
   to nudge Barron's approval and tilt party momentum
   for midterms, special elections, and defections.

   A derivatives trader can't buy Congress — but dark
   money PAC contributions can shift the political wind.

   Leaf module. No DOM access.
   =================================================== */

import { getTraitEffect } from './traits.js';

let _cooldown = 0;
const LOBBY_COOLDOWN = 30;
const MOMENTUM_CAP = 3;

const LOBBY_ACTIONS = [
    {
        id: 'lobby_federalist',
        name: 'Fund Federalist PACs',
        description: (world) => {
            if (world.congress.filibusterActive) {
                return 'Fund the Federalist PAC during the filibuster fight. Your money goes to pressuring Haines and Whittaker to vote for cloture. Barron approval +2, lobby momentum +1.';
            }
            if (world.congress.bigBillStatus <= 1) {
                return 'Fund the Federalist PAC. Your donation supports the Big Beautiful Bill\'s path through Congress. Barron approval +2, lobby momentum +1.';
            }
            return 'Fund the Federalist PAC. Lassiter\'s Commerce Committee thanks you. Barron approval +2, lobby momentum +1.';
        },
        baseCost: 400,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
            world.election.lobbyMomentum = Math.min(MOMENTUM_CAP,
                (world.election.lobbyMomentum || 0) + 1);
        },
    },
    {
        id: 'lobby_farmerlabor',
        name: 'Fund Farmer-Labor PACs',
        description: (world) => {
            if (world.congress.filibusterActive) {
                return 'Fund the Farmer-Labor PAC during the filibuster. Your money supports Whitfield\'s floor fight and Okafor\'s investigations. Barron approval -2, lobby momentum -1.';
            }
            if (world.investigations.okaforProbeStage >= 2) {
                return 'Fund the Farmer-Labor PAC. Okafor\'s investigation intensifies. Your donation signals which side you\'re on. Barron approval -2, lobby momentum -1.';
            }
            return 'Fund the Farmer-Labor PAC. Reyes and Okafor appreciate the support. Barron approval -2, lobby momentum -1.';
        },
        baseCost: 400,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
            world.election.lobbyMomentum = Math.max(-MOMENTUM_CAP,
                (world.election.lobbyMomentum || 0) - 1);
        },
    },
];

export function getAvailableActions(day, cash) {
    const costMult = getTraitEffect('lobbyingCostMult', 1);
    const cooldownRemaining = Math.max(0, _cooldown - day);
    return LOBBY_ACTIONS.map(action => {
        const cost = Math.round(action.baseCost * costMult);
        return {
            action,
            cost,
            available: cooldownRemaining <= 0 && cash >= cost,
            cooldownRemaining,
        };
    });
}

export function executeLobbyAction(actionId, day, world) {
    const entry = LOBBY_ACTIONS.find(a => a.id === actionId);
    if (!entry) return null;
    const costMult = getTraitEffect('lobbyingCostMult', 1);
    const cost = Math.round(entry.baseCost * costMult);
    if (day < _cooldown) return null;
    entry.effects(world);
    _cooldown = day + LOBBY_COOLDOWN;
    return { cost, action: entry };
}

export function resetLobbying() {
    _cooldown = 0;
}

export { LOBBY_ACTIONS };
