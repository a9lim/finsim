/* ===================================================
   lobbying.js -- Player lobbying mechanic. Spend cash
   to influence congress and presidential approval via
   shell companies and presidential cryptocurrency.

   Leaf module. No DOM access.
   =================================================== */

import { getConvictionEffect } from './convictions.js';

const _cooldowns = { congress: 0, president: 0 };
const LOBBY_COOLDOWN = 30;

const LOBBY_ACTIONS = [
    {
        id: 'lobby_congress_federalist',
        name: 'Support Federalist Caucus',
        description: 'Channel funds through shell companies to Federalist PACs. Shifts House and Senate seats.',
        target: 'congress',
        baseCost: 500,
        effects: (world) => {
            world.congress.senate.federalist = Math.min(100, world.congress.senate.federalist + 1);
            world.congress.senate.farmerLabor = Math.max(0, world.congress.senate.farmerLabor - 1);
            world.congress.house.federalist = Math.min(435, world.congress.house.federalist + 3);
            world.congress.house.farmerLabor = Math.max(0, world.congress.house.farmerLabor - 3);
        },
    },
    {
        id: 'lobby_congress_farmerlabor',
        name: 'Support Farmer-Labor Coalition',
        description: 'Quietly fund Farmer-Labor candidates through intermediary organizations.',
        target: 'congress',
        baseCost: 500,
        effects: (world) => {
            world.congress.senate.farmerLabor = Math.min(100, world.congress.senate.farmerLabor + 1);
            world.congress.senate.federalist = Math.max(0, world.congress.senate.federalist - 1);
            world.congress.house.farmerLabor = Math.min(435, world.congress.house.farmerLabor + 3);
            world.congress.house.federalist = Math.max(0, world.congress.house.federalist - 3);
        },
    },
    {
        id: 'lobby_president_crypto',
        name: 'Buy Presidential Cryptocurrency',
        description: 'Purchase the president\'s cryptocurrency. Boosts Barron\'s approval and your political visibility.',
        target: 'president',
        baseCost: 300,
        effects: (world) => {
            world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        },
    },
    {
        id: 'lobby_president_opposition',
        name: 'Fund Opposition Research',
        description: 'Finance opposition research against Barron through dark money networks.',
        target: 'president',
        baseCost: 400,
        effects: (world) => {
            world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
        },
    },
];

export function getAvailableActions(day, cash) {
    const costMult = getConvictionEffect('lobbyingCostMult', 1);
    return LOBBY_ACTIONS.map(action => {
        const cost = Math.round(action.baseCost * costMult);
        const cd = _cooldowns[action.target] || 0;
        const cooldownRemaining = Math.max(0, cd - day);
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
    const costMult = getConvictionEffect('lobbyingCostMult', 1);
    const cost = Math.round(entry.baseCost * costMult);
    const cd = _cooldowns[entry.target] || 0;
    if (day < cd) return null;
    entry.effects(world);
    _cooldowns[entry.target] = day + LOBBY_COOLDOWN;
    return { cost, action: entry };
}

export function resetLobbying() {
    _cooldowns.congress = 0;
    _cooldowns.president = 0;
}

export { LOBBY_ACTIONS };
