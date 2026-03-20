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
            senate: { federalist: 52, farmerLabor: 46, independent: 2 },
            house:  { federalist: 221, farmerLabor: 214 },
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
        },
        geopolitical: {
            tradeWarStage:    0,
            mideastEscalation:0,
            southAmericaOps:  0,
            sanctionsActive:  false,
            oilCrisis:        false,
            recessionDeclared:false,
            chinaRelations:   0,
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
        },
        election: {
            midtermComplete:  false,
            midtermResult:    null,
            barronApproval:   50,
            primarySeason:    false,
            okaforRunning:    false,
            presidentialResult: null,
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

// -- LLM effect validation ranges (whitelist) ----------------------------
// Numeric: { min, max, type: 'number' }
// Boolean: { type: 'boolean' }
// Null/string fields (midtermResult, presidentialResult) are omitted —
// the LLM cannot set them via structured effects.

export const WORLD_STATE_RANGES = {
    // congress.senate
    'congress.senate.federalist':       { min: 0,   max: 100, type: 'number' },
    'congress.senate.farmerLabor':      { min: 0,   max: 100, type: 'number' },
    'congress.senate.independent':      { min: 0,   max: 100, type: 'number' },
    // congress.house
    'congress.house.federalist':        { min: 0,   max: 435, type: 'number' },
    'congress.house.farmerLabor':       { min: 0,   max: 435, type: 'number' },
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
    // geopolitical
    'geopolitical.tradeWarStage':       { min: 0,   max: 4,   type: 'number' },
    'geopolitical.mideastEscalation':   { min: 0,   max: 3,   type: 'number' },
    'geopolitical.southAmericaOps':     { min: 0,   max: 3,   type: 'number' },
    'geopolitical.sanctionsActive':     { type: 'boolean' },
    'geopolitical.oilCrisis':           { type: 'boolean' },
    'geopolitical.recessionDeclared':   { type: 'boolean' },
    'geopolitical.chinaRelations':      { min: -3,  max: 3,   type: 'number' },
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
    'election.primarySeason':           { type: 'boolean' },
    'election.okaforRunning':           { type: 'boolean' },
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
