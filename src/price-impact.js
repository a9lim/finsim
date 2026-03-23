import {
    ADV, PERM_COEFF, TEMP_COEFF,
    OPT_PERM_COEFF, OPT_TEMP_COEFF,
    OI_ATM_BASE, OI_MONEYNESS_DECAY,
    RECOVERY_HALF_LIFE, PARAM_SHIFT_HALF_LIFE,
    IMPACT_TOAST_COOLDOWN,
    IMPACT_THRESHOLD_25, IMPACT_THRESHOLD_50,
    IMPACT_THRESHOLD_75, IMPACT_THRESHOLD_100,
    MAX_PLAYER_MU_SHIFT, MAX_PLAYER_THETA_SHIFT,
    MAX_PLAYER_XI_SHIFT, MAX_PLAYER_KAPPA_SHIFT,
    MAX_PLAYER_SIGMAR_SHIFT,
    EVENT_COUPLING_CAP,
} from './config.js';

/* ── mutable state ── */
let _unrecoveredImpact = 0;
const _playerParamShifts = { mu: 0, theta: 0, xi: 0, kappa: 0, sigmaR: 0 };
const _playerParamCaps = {
    mu: MAX_PLAYER_MU_SHIFT, theta: MAX_PLAYER_THETA_SHIFT,
    xi: MAX_PLAYER_XI_SHIFT, kappa: MAX_PLAYER_KAPPA_SHIFT,
    sigmaR: MAX_PLAYER_SIGMAR_SHIFT,
};
let _lastToastDay = -Infinity;

/* ── per-strike option permanent impact (persists across days, decays) ── */
// key = `${strike}_${expiryDay}`, value = accumulated price shift
const _optionPermanentImpact = new Map();

/* ── temporary impact (resets each substep, reflects intra-substep liquidity depletion) ── */
let _stockTemporaryImpact = 0;
// key = `${type}_${strike}_${expiryDay}`, value = accumulated temporary shift
const _optionTemporaryImpact = new Map();

/* ── cumulative volume tracking (resets each day) ── */
let _cumStockBuy  = 0;   // shares bought this day
let _cumStockSell = 0;   // shares sold this day
let _cumHedgeBuy  = 0;   // hedge shares bought this day
let _cumHedgeSell = 0;   // hedge shares sold this day
// Per-strike cumulative option volume: key = `${strike}_${expiryDay}`, value = { buy, sell }
const _cumOption = new Map();

/* ── reset ── */
export function resetImpactState() {
    _unrecoveredImpact = 0;
    for (const k in _playerParamShifts) _playerParamShifts[k] = 0;
    _lastToastDay = -Infinity;
    _optionPermanentImpact.clear();
    resetDailyVolume();
}

/** Reset cumulative volume — call at start of each substep. */
export function resetDailyVolume() {
    _cumStockBuy = _cumStockSell = 0;
    _cumHedgeBuy = _cumHedgeSell = 0;
    _cumOption.clear();
    _stockTemporaryImpact = 0;
    _optionTemporaryImpact.clear();
}

/* ── Layer 1: Stock/Bond slippage ── */

/**
 * Compute permanent + temporary impact for a stock or bond trade.
 * @param {number} qty  Signed quantity (positive=buy, negative=sell)
 * @param {number} sigma Current vol (Heston sqrt(v) for stock, sigmaR for bond)
 * @returns {{ permanent: number, temporary: number, fillAdjustment: number }}
 */
export function computeStockImpact(qty, sigma) {
    const absQty = Math.abs(qty);
    const sign   = qty > 0 ? 1 : -1;
    // Incremental permanent impact: cost of going from cumVol to cumVol+qty
    const cumRef = qty > 0 ? _cumStockBuy : _cumStockSell;
    const perm   = PERM_COEFF * sigma * (Math.sqrt((cumRef + absQty) / ADV) - Math.sqrt(cumRef / ADV)) * sign;
    // Average marginal cost over [cum, cum+qty]
    const temp   = TEMP_COEFF * sigma * (2 * cumRef + absQty) / ADV * sign;
    // Update cumulative volume
    if (qty > 0) _cumStockBuy += absQty; else _cumStockSell += absQty;
    return { permanent: perm, temporary: temp, fillAdjustment: temp };
}

/**
 * Compute modeled open interest for an option at given moneyness and DTE.
 */
export function modeledOI(moneyness, dte) {
    return Math.max(1,
        OI_ATM_BASE
        * Math.exp(-OI_MONEYNESS_DECAY * moneyness * moneyness)
        * Math.sqrt(Math.max(1, dte) / 63)
    );
}

/**
 * Compute permanent + temporary impact for an options trade.
 * @param {number} qty       Signed quantity
 * @param {number} sigma     Current Heston vol
 * @param {number} moneyness abs(ln(S/K))
 * @param {number} dte       Days to expiry
 * @returns {{ permanent: number, temporary: number, fillAdjustment: number }}
 */
export function computeOptionImpact(qty, sigma, moneyness, dte, strike, expiryDay) {
    const absQty = Math.abs(qty);
    const sign   = qty > 0 ? 1 : -1;
    const oi     = modeledOI(moneyness, dte);
    // Per-strike cumulative volume
    const key = `${strike}_${expiryDay}`;
    let cum = _cumOption.get(key);
    if (!cum) { cum = { buy: 0, sell: 0 }; _cumOption.set(key, cum); }
    const cumRef = qty > 0 ? cum.buy : cum.sell;
    const perm   = OPT_PERM_COEFF * sigma * (Math.sqrt((cumRef + absQty) / oi) - Math.sqrt(cumRef / oi)) * sign;
    const temp   = OPT_TEMP_COEFF * sigma * (2 * cumRef + absQty) / oi * sign;
    // Update cumulative
    if (qty > 0) cum.buy += absQty; else cum.sell += absQty;
    return { permanent: perm, temporary: temp, fillAdjustment: temp };
}

/**
 * Compute secondary stock impact from market-maker delta hedging.
 * @param {number} optQty  Signed option quantity (positive = player buys)
 * @param {number} delta   Option delta (positive for calls, negative for puts)
 * @param {number} sigma   Current Heston vol
 * @returns {number} Permanent stock price shift from hedge
 */
export function computeDeltaHedgeImpact(optQty, delta, sigma) {
    // MM takes opposite side then hedges: buys stock for sold calls, sells for sold puts
    const hedgeQty = -optQty * delta;
    const absHedge = Math.abs(hedgeQty);
    if (absHedge < 0.01) return 0;
    const sign = hedgeQty > 0 ? 1 : -1;
    // Incremental: hedge volume cumulates with other hedges this day
    const cumRef = hedgeQty > 0 ? _cumHedgeBuy : _cumHedgeSell;
    const impact = PERM_COEFF * sigma * (Math.sqrt((cumRef + absHedge) / ADV) - Math.sqrt(cumRef / ADV)) * sign;
    if (hedgeQty > 0) _cumHedgeBuy += absHedge; else _cumHedgeSell += absHedge;
    return impact;
}

/**
 * Apply a permanent price shift to sim.S and track for recovery.
 * Call after every trade execution.
 */
export function applyPermanentImpact(sim, shift) {
    if (Math.abs(shift) < 1e-8) return;
    sim.S += shift;
    if (sim.S < 0.01) sim.S = 0.01;
    _unrecoveredImpact += shift;
}

/* ── Per-strike option permanent impact ── */

export function applyOptionPermanentImpact(type, strike, expiryDay, shift) {
    if (Math.abs(shift) < 1e-8) return;
    const key = `${type}_${strike}_${expiryDay}`;
    _optionPermanentImpact.set(key, (_optionPermanentImpact.get(key) || 0) + shift);
}

export function getOptionPermanentImpact(type, strike, expiryDay) {
    return _optionPermanentImpact.get(`${type}_${strike}_${expiryDay}`) || 0;
}

/* ── Temporary impact (intra-substep, resets each substep) ── */

export function addStockTemporaryImpact(shift) {
    _stockTemporaryImpact += shift;
}

export function getStockTemporaryImpact() {
    return _stockTemporaryImpact;
}

export function addOptionTemporaryImpact(type, strike, expiryDay, shift) {
    if (Math.abs(shift) < 1e-8) return;
    const key = `${type}_${strike}_${expiryDay}`;
    _optionTemporaryImpact.set(key, (_optionTemporaryImpact.get(key) || 0) + shift);
}

export function getOptionTemporaryImpact(type, strike, expiryDay) {
    return _optionTemporaryImpact.get(`${type}_${strike}_${expiryDay}`) || 0;
}

export function decayOptionPermanentImpact() {
    const factor = 1 - Math.pow(0.5, 1 / RECOVERY_HALF_LIFE);
    for (const [key, val] of _optionPermanentImpact) {
        const decayed = val * (1 - factor);
        if (Math.abs(decayed) < 1e-8) _optionPermanentImpact.delete(key);
        else _optionPermanentImpact.set(key, decayed);
    }
}

/* ── Recovery drift (called once per day) ── */

/**
 * Compute recovery drift overlay for sim.mu.
 * Also decays _unrecoveredImpact.
 * @returns {number} Drift overlay to add to sim.mu before beginDay()
 */
export function computeRecoveryDrift() {
    if (Math.abs(_unrecoveredImpact) < 1e-8) return 0;
    const decayFrac = 1 - Math.pow(0.5, 1 / RECOVERY_HALF_LIFE);
    const drift = -_unrecoveredImpact * decayFrac;
    _unrecoveredImpact *= (1 - decayFrac);
    return drift;
}

/* ── Layer 3: Parameter shifts from large exposure ── */

/**
 * Update Layer 3 parameter shifts based on gross notional exposure.
 * Called once per day from main.js.
 * @param {number} grossRatio  Gross notional / (ADV * S)
 */
export function updateParamShifts(grossRatio) {
    // Logarithmic scaling past 50%
    const effective = grossRatio <= IMPACT_THRESHOLD_50
        ? grossRatio
        : IMPACT_THRESHOLD_50 + Math.log(1 + grossRatio - IMPACT_THRESHOLD_50);

    if (effective >= IMPACT_THRESHOLD_25) {
        _playerParamShifts.theta = Math.min(
            _playerParamCaps.theta,
            0.05 * effective * _playerParamCaps.theta
        );
    }
    if (effective >= IMPACT_THRESHOLD_50) {
        _playerParamShifts.xi = Math.min(
            _playerParamCaps.xi,
            0.04 * effective * _playerParamCaps.xi
        );
    }
    if (effective >= IMPACT_THRESHOLD_75) {
        _playerParamShifts.mu = -Math.min(
            _playerParamCaps.mu,
            0.02 * effective * _playerParamCaps.mu
        );
    }
}

/**
 * Decay existing parameter shifts. Called once per day.
 */
export function decayParamShifts() {
    const factor = Math.pow(0.5, 1 / PARAM_SHIFT_HALF_LIFE);
    for (const k in _playerParamShifts) {
        _playerParamShifts[k] *= factor;
        if (Math.abs(_playerParamShifts[k]) < 1e-8) _playerParamShifts[k] = 0;
    }
}

/**
 * Apply parameter shift overlays to sim before beginDay().
 * Returns saved base values for removal after finalizeDay().
 */
export function applyParamOverlays(sim) {
    const saved = {};
    for (const k in _playerParamShifts) {
        if (_playerParamShifts[k] === 0) continue;
        saved[k] = sim[k];
        sim[k] += _playerParamShifts[k];
    }
    return saved;
}

/**
 * Remove parameter shift overlays from sim after finalizeDay().
 */
export function removeParamOverlays(sim, saved) {
    for (const k in saved) sim[k] = saved[k];
}

/* ── Layer 2: Event coupling ── */

/**
 * Compute event coupling factor based on player's net delta.
 * Scales event deltas by +/-EVENT_COUPLING_CAP.
 * @param {number} netDelta  Player's net delta exposure
 * @param {object} deltas    Event's param deltas (checks mu sign for direction)
 * @returns {number} Multiplier in [1-cap, 1+cap]
 */
export function computeEventCoupling(netDelta, deltas) {
    if (!deltas || !deltas.mu || Math.abs(netDelta) < 1) return 1.0;
    const alignment = Math.sign(netDelta) * Math.sign(deltas.mu);
    const magnitude = Math.min(1, Math.abs(netDelta) / (ADV * 0.5));
    return 1 + alignment * magnitude * EVENT_COUPLING_CAP;
}

/* ── Impact toasts ── */

const _stockToastsMedium = [
    'Unusual volume in afternoon session',
    'Block trade reported on PNTH',
    'Trading desk activity spikes midday',
];
const _stockToastsLarge = [
    'Institutional flow dominates tape, market makers widen spreads',
    'Dark pool activity surges as large orders cross',
    'Heavy directional flow noted by market analysts',
];
const _stockToastsExtreme = [
    'PNTH halted briefly on volatility \u2014 heavy directional flow cited',
    'Circuit breaker warning as volume surges',
];
const _optionToastsLarge = [
    'Unusual options activity detected in PNTH contracts',
    'Put open interest spikes near key strike levels',
    'Call volume surges well above 20-day average',
];
const _optionToastsExtreme = [
    'Dealer hedging flows amplify selling pressure',
    'Options market makers scramble to adjust positions',
];

/**
 * Select an impact toast if threshold crossed and cooldown elapsed.
 * @param {number} grossRatio   Gross notional / (ADV * S)
 * @param {string} instrument   'stock' | 'option'
 * @param {number} day          Current sim day
 * @returns {string|null}       Toast text or null
 */
export function selectImpactToast(grossRatio, instrument, day) {
    if (day - _lastToastDay < IMPACT_TOAST_COOLDOWN) return null;
    let pool;
    if (instrument === 'stock') {
        if (grossRatio >= IMPACT_THRESHOLD_75) pool = _stockToastsExtreme;
        else if (grossRatio >= IMPACT_THRESHOLD_50) pool = _stockToastsLarge;
        else if (grossRatio >= IMPACT_THRESHOLD_25) pool = _stockToastsMedium;
        else return null;
    } else {
        if (grossRatio >= IMPACT_THRESHOLD_75) pool = _optionToastsExtreme;
        else if (grossRatio >= IMPACT_THRESHOLD_25) pool = _optionToastsLarge;
        else return null;
    }
    _lastToastDay = day;
    return pool[Math.floor(Math.random() * pool.length)];
}

/* ── Accessors ── */
export function getUnrecoveredImpact() { return _unrecoveredImpact; }
export function getPlayerParamShifts() { return { ..._playerParamShifts }; }
