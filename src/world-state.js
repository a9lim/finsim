/* ===================================================
   world-state.js -- Mutable world state machine for
   the Shoals event system. Tracks congressional
   control, PNTH corporate narrative, geopolitical
   escalation, Fed credibility, ongoing investigations,
   and election state. Provides LLM effect validation
   and application via structured path mutations.
   =================================================== */

// -- Fresh world state factory -------------------------------------------

export function createWorldState() {
    return {
        congress: {
            senate: { federalist: 52, farmerLabor: 48 },
            house:  { federalist: 221, farmerLabor: 214 },
            filibusterActive: false,
            bigBillStatus:    0,
        },
        pnth: {
            boardDirks:              7,
            boardGottlieb:           3,
            ceoIsGottlieb:           true,
            ctoIsMira:               true,
            militaryContractActive:  false,
            commercialMomentum:      0,
            ethicsBoardIntact:       true,
            activistStakeRevealed:   false,
            dojSuitFiled:            false,
            senateProbeLaunched:     false,
            whistleblowerFiled:      false,
            acquired:                false,
            gottliebStartedRival:    false,
            sentinelLaunched:        true,
            aegisDeployed:           false,
            companionLaunched:       false,
            crucibleLaunched:         false,
            companionScandal:        0,
            aegisControversy:        0,
        },
        geopolitical: {
            tradeWarStage:       0,
            mideastEscalation:   0,
            southAmericaOps:     0,
            sanctionsActive:     false,
            oilCrisis:           false,
            recessionDeclared:   false,
            sericaRelations:     0,
            farsistanEscalation: 0,
            khasurianCrisis:     0,
            straitClosed:              false,
            aegisDemandSurge:          false,
            crucibleCompetitionPressure: false,
            energyCrisis:               false,
        },
        fed: {
            hikeCycle:        false,
            cutCycle:         false,
            qeActive:         false,
            hartleyFired:     false,
            vaneAppointed:    false,
            credibilityScore: 10,
        },
        investigations: {
            tanBowmanStory:   0,
            tanNsaStory:      0,
            okaforProbeStage: 0,
            impeachmentStage: 0,
            meridianExposed:  false,
        },
        election: {
            midtermComplete:  false,
            midtermResult:    null,
            barronApproval:   50,
            lobbyMomentum:    0,
            primarySeason:    false,
            okaforRunning:    false,
            presidentialResult: null,
        },
        media: {
            tanCredibility:    5,
            sentinelRating:    5,
            pressFreedomIndex: 7,
            leakCount:         0,
            lobbyingExposed:   false,
        },
    };
}

// -- Congress derived helpers --------------------------------------------

export function congressHelpers(world) {
    const { senate, house } = world.congress;
    const fedControlsSenate = senate.federalist >= 50;
    const fedControlsHouse  = house.federalist  >= 218;
    return {
        fedControlsSenate,
        fedControlsHouse,
        trifecta:     fedControlsSenate && fedControlsHouse,
        superMajority: senate.federalist >= 60,
    };
}

/** Clamp congress seats to valid ranges and enforce conservation. */
export function validateCongress(world) {
    const { senate, house } = world.congress;
    senate.federalist = Math.max(0, Math.min(100, Math.round(senate.federalist)));
    senate.farmerLabor = 100 - senate.federalist;
    house.federalist = Math.max(0, Math.min(435, Math.round(house.federalist)));
    house.farmerLabor = 435 - house.federalist;
}

/** Clamp PNTH board seats so total does not exceed 12. */
export function validatePnthBoard(world) {
    world.pnth.boardDirks = Math.max(0, Math.min(12, Math.round(world.pnth.boardDirks)));
    world.pnth.boardGottlieb = Math.max(0, Math.min(12, Math.round(world.pnth.boardGottlieb)));
    const total = world.pnth.boardDirks + world.pnth.boardGottlieb;
    if (total > 12) {
        const excess = total - 12;
        if (world.pnth.boardDirks >= world.pnth.boardGottlieb) {
            world.pnth.boardDirks -= excess;
        } else {
            world.pnth.boardGottlieb -= excess;
        }
    }
}

// -- LLM effect validation ranges (whitelist) ----------------------------
// Numeric: { min, max, type: 'number' }
// Boolean: { type: 'boolean' }
// Null/string fields (midtermResult, presidentialResult) are omitted —
// the LLM cannot set them via structured effects.

export const WORLD_STATE_RANGES = {
    // congress.senate
    'congress.senate.federalist':       { min: 0,   max: 100, type: 'number' },
    'congress.senate.farmerLabor':      { min: 0,   max: 100, type: 'number' },
    // congress.house
    'congress.house.federalist':        { min: 0,   max: 435, type: 'number' },
    'congress.house.farmerLabor':       { min: 0,   max: 435, type: 'number' },
    // congress
    'congress.filibusterActive':        { type: 'boolean' },
    'congress.bigBillStatus':           { min: 0,   max: 4,   type: 'number' },
    // pnth
    'pnth.boardDirks':                  { min: 0,   max: 12,  type: 'number' },
    'pnth.boardGottlieb':               { min: 0,   max: 12,  type: 'number' },
    'pnth.ceoIsGottlieb':               { type: 'boolean' },
    'pnth.ctoIsMira':                   { type: 'boolean' },
    'pnth.militaryContractActive':      { type: 'boolean' },
    'pnth.commercialMomentum':          { min: -2,  max: 2,   type: 'number' },
    'pnth.ethicsBoardIntact':           { type: 'boolean' },
    'pnth.activistStakeRevealed':       { type: 'boolean' },
    'pnth.dojSuitFiled':                { type: 'boolean' },
    'pnth.senateProbeLaunched':         { type: 'boolean' },
    'pnth.whistleblowerFiled':          { type: 'boolean' },
    'pnth.acquired':                    { type: 'boolean' },
    'pnth.gottliebStartedRival':        { type: 'boolean' },
    'pnth.sentinelLaunched':            { type: 'boolean' },
    'pnth.aegisDeployed':               { type: 'boolean' },
    'pnth.companionLaunched':           { type: 'boolean' },
    'pnth.crucibleLaunched':             { type: 'boolean' },
    'pnth.companionScandal':            { min: 0,   max: 3,   type: 'number' },
    'pnth.aegisControversy':            { min: 0,   max: 3,   type: 'number' },
    // geopolitical
    'geopolitical.tradeWarStage':       { min: 0,   max: 4,   type: 'number' },
    'geopolitical.mideastEscalation':   { min: 0,   max: 3,   type: 'number' },
    'geopolitical.southAmericaOps':     { min: 0,   max: 3,   type: 'number' },
    'geopolitical.sanctionsActive':     { type: 'boolean' },
    'geopolitical.oilCrisis':           { type: 'boolean' },
    'geopolitical.recessionDeclared':   { type: 'boolean' },
    'geopolitical.sericaRelations':      { min: -3,  max: 3,   type: 'number' },
    'geopolitical.farsistanEscalation': { min: 0,   max: 3,   type: 'number' },
    'geopolitical.khasurianCrisis':     { min: 0,   max: 3,   type: 'number' },
    'geopolitical.straitClosed':        { type: 'boolean' },
    // fed
    'fed.hikeCycle':                    { type: 'boolean' },
    'fed.cutCycle':                     { type: 'boolean' },
    'fed.qeActive':                     { type: 'boolean' },
    'fed.hartleyFired':                 { type: 'boolean' },
    'fed.vaneAppointed':                { type: 'boolean' },
    'fed.credibilityScore':             { min: 0,   max: 10,  type: 'number' },
    // investigations
    'investigations.tanBowmanStory':    { min: 0,   max: 3,   type: 'number' },
    'investigations.tanNsaStory':       { min: 0,   max: 3,   type: 'number' },
    'investigations.okaforProbeStage':  { min: 0,   max: 3,   type: 'number' },
    'investigations.impeachmentStage':  { min: 0,   max: 3,   type: 'number' },
    // election
    'election.midtermComplete':         { type: 'boolean' },
    'election.barronApproval':          { min: 0,   max: 100, type: 'number' },
    'election.lobbyMomentum':           { min: -3,  max: 3,   type: 'number' },
    'election.primarySeason':           { type: 'boolean' },
    'election.okaforRunning':           { type: 'boolean' },
    // media
    'media.tanCredibility':             { min: 0,   max: 10,  type: 'number' },
    'media.sentinelRating':             { min: 0,   max: 10,  type: 'number' },
    'media.pressFreedomIndex':          { min: 0,   max: 10,  type: 'number' },
    'media.leakCount':                  { min: 0,   max: 5,   type: 'number' },
    // factions
    'factions.firmStanding':            { min: 0,   max: 100, type: 'number' },
    'factions.regulatoryExposure':      { min: 0,   max: 100, type: 'number' },
    'factions.federalistSupport':       { min: 0,   max: 100, type: 'number' },
    'factions.farmerLaborSupport':      { min: 0,   max: 100, type: 'number' },
    'factions.mediaTrust':              { min: 0,   max: 100, type: 'number' },
    'factions.fedRelations':            { min: 0,   max: 100, type: 'number' },
};

// -- Apply structured effects from LLM -----------------------------------
// effects: [{ path, op, value }, ...]
// op: 'add' | 'set'
// Skips unknown paths and unknown ops. Clamps numbers, coerces booleans.

export function applyStructuredEffects(world, effects) {
    if (!Array.isArray(effects)) return;
    for (const effect of effects) {
        const { path, op, value } = effect;
        const range = WORLD_STATE_RANGES[path];
        if (!range) continue;                  // not in whitelist
        if (op !== 'add' && op !== 'set') continue;

        // Navigate to parent object and leaf key
        const parts = path.split('.');
        const leafKey = parts[parts.length - 1];
        let obj = world;
        let valid = true;
        for (let i = 0; i < parts.length - 1; i++) {
            if (obj == null || typeof obj !== 'object') { valid = false; break; }
            obj = obj[parts[i]];
        }
        if (!valid || obj == null) continue;

        if (range.type === 'boolean') {
            const boolVal = Boolean(value);
            obj[leafKey] = boolVal;
        } else {
            // numeric
            const current = typeof obj[leafKey] === 'number' ? obj[leafKey] : 0;
            let next = op === 'add' ? current + value : value;
            next = Math.max(range.min, Math.min(range.max, next));
            obj[leafKey] = next;
        }
    }
}
