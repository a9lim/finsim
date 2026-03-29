import {
    ADV, BOND_ADV, IMPACT_COEFF, BOND_IMPACT_COEFF, OPT_IMPACT_COEFF,
    OI_ATM_BASE, OI_MONEYNESS_DECAY, OI_SIGMA_BASE, BOND_SIGMA_BASE,
    VOLUME_HALF_LIFE, INTRADAY_STEPS,
    PARAM_SHIFT_HALF_LIFE,
    IMPACT_TOAST_COOLDOWN,
    IMPACT_THRESHOLD_25, IMPACT_THRESHOLD_50,
    IMPACT_THRESHOLD_75, IMPACT_THRESHOLD_100,
    MAX_PLAYER_MU_SHIFT, MAX_PLAYER_THETA_SHIFT,
    MAX_PLAYER_XI_SHIFT, MAX_PLAYER_KAPPA_SHIFT,
    MAX_PLAYER_SIGMAR_SHIFT,
    EVENT_COUPLING_CAP,
    TRADING_DAYS_PER_YEAR,
} from './config.js';
import { allocGreekTrees, prepareGreekTrees, computeGreeksWithTrees, computeEffectiveSigma, computeSkewSigma } from './pricing.js';
import { market } from './market.js';

/* ── Layer 3: parameter shifts from large exposure ── */
const _playerParamShifts = { mu: 0, theta: 0, xi: 0, kappa: 0, sigmaR: 0 };
const _playerParamCaps = {
    mu: MAX_PLAYER_MU_SHIFT, theta: MAX_PLAYER_THETA_SHIFT,
    xi: MAX_PLAYER_XI_SHIFT, kappa: MAX_PLAYER_KAPPA_SHIFT,
    sigmaR: MAX_PLAYER_SIGMAR_SHIFT,
};
let _lastToastDay = -Infinity;

/* ── Decaying cumulative volume ── */
let _cumStockBuy  = 0;
let _cumStockSell = 0;
let _cumBondBuy   = 0;
let _cumBondSell  = 0;
// Per-strike: key = `${type}_${strike}_${expiryDay}`, value = { buy, sell }
const _cumOption = new Map();

/* ── Dynamic MM rehedging state ── */
// Aggregate shares the MM currently holds to hedge player option positions.
// Positive = long stock, negative = short stock.
let _mmCurrentHedge = 0;
// Reusable greek trees for MM delta computation
let _mmGreekTrees = null;

/* ── reset ── */
export function resetImpactState() {
    for (const k in _playerParamShifts) _playerParamShifts[k] = 0;
    _lastToastDay = -Infinity;
    _cumStockBuy = _cumStockSell = 0;
    _cumBondBuy = _cumBondSell = 0;
    _cumOption.clear();
    _mmCurrentHedge = 0;
}

/* ── Decay cumulative volumes — call once per substep ── */

const _volDecayFactor = Math.pow(0.5, 1 / (VOLUME_HALF_LIFE * INTRADAY_STEPS));

export function decayImpactVolumes() {
    _cumStockBuy  *= _volDecayFactor;
    _cumStockSell *= _volDecayFactor;
    if (_cumStockBuy  < 1e-6) _cumStockBuy  = 0;
    if (_cumStockSell < 1e-6) _cumStockSell = 0;
    _cumBondBuy  *= _volDecayFactor;
    _cumBondSell *= _volDecayFactor;
    if (_cumBondBuy  < 1e-6) _cumBondBuy  = 0;
    if (_cumBondSell < 1e-6) _cumBondSell = 0;
    for (const [key, cum] of _cumOption) {
        cum.buy  *= _volDecayFactor;
        cum.sell *= _volDecayFactor;
        if (cum.buy < 1e-6 && cum.sell < 1e-6) _cumOption.delete(key);
    }
}

/* ── Stock impact overlay (computed from decaying cumulative volume) ── */

/**
 * Get the current stock price impact overlay.
 * @param {number} sigma  Current Heston vol (sqrt(v))
 * @returns {number} Signed price shift to add to sim.S for display/valuation
 */
export function getStockImpact(sigma) {
    const adv = modeledStockADV(sigma);
    const buyImpact  = IMPACT_COEFF * sigma * Math.sqrt(_cumStockBuy  / adv);
    const sellImpact = IMPACT_COEFF * sigma * Math.sqrt(_cumStockSell / adv);
    return buyImpact - sellImpact;
}

/**
 * Record a stock trade: updates cumulative volume and returns the marginal
 * fill cost (the price penalty for this specific trade).
 * @param {number} qty    Signed quantity (positive=buy, negative=sell)
 * @param {number} sigma  Current Heston vol
 * @returns {number} Signed fill cost adjustment
 */
export function recordStockTrade(qty, sigma) {
    const absQty = Math.abs(qty);
    const sign   = qty > 0 ? 1 : -1;
    const adv    = modeledStockADV(sigma);
    const cumRef = qty > 0 ? _cumStockBuy : _cumStockSell;
    const cost   = IMPACT_COEFF * sigma * (Math.sqrt((cumRef + absQty) / adv) - Math.sqrt(cumRef / adv)) * sign;
    if (qty > 0) _cumStockBuy += absQty; else _cumStockSell += absQty;
    return cost;
}

/**
 * Vol-scaled stock ADV. Higher equity vol deepens the liquidity pool.
 */
export function modeledStockADV(sigma) {
    return sigma > 0 ? ADV * Math.sqrt(sigma / OI_SIGMA_BASE) : ADV;
}

/* ── Bond impact overlay (analogous to stock, keyed off rate vol sigmaR) ── */

/**
 * Vol-scaled bond ADV. Higher rate vol deepens the bond liquidity pool.
 */
export function modeledBondADV(sigmaR) {
    return sigmaR > 0 ? BOND_ADV * Math.sqrt(sigmaR / BOND_SIGMA_BASE) : BOND_ADV;
}

/**
 * Get the current bond price impact overlay.
 * @param {number} sigmaR  Current Vasicek rate vol
 * @returns {number} Signed price shift to add to bond price for display/valuation
 */
export function getBondImpact(sigmaR) {
    const adv = modeledBondADV(sigmaR);
    const buyImpact  = BOND_IMPACT_COEFF * sigmaR * Math.sqrt(_cumBondBuy  / adv);
    const sellImpact = BOND_IMPACT_COEFF * sigmaR * Math.sqrt(_cumBondSell / adv);
    return buyImpact - sellImpact;
}

/**
 * Record a bond trade: updates cumulative volume and returns fill cost.
 * @param {number} qty     Signed quantity (positive=buy, negative=sell)
 * @param {number} sigmaR  Current Vasicek rate vol
 * @returns {number} Signed fill cost adjustment
 */
export function recordBondTrade(qty, sigmaR) {
    const absQty = Math.abs(qty);
    const sign   = qty > 0 ? 1 : -1;
    const adv    = modeledBondADV(sigmaR);
    const cumRef = qty > 0 ? _cumBondBuy : _cumBondSell;
    const cost   = BOND_IMPACT_COEFF * sigmaR * (Math.sqrt((cumRef + absQty) / adv) - Math.sqrt(cumRef / adv)) * sign;
    if (qty > 0) _cumBondBuy += absQty; else _cumBondSell += absQty;
    return cost;
}

/* ── Option impact overlay ── */

/**
 * Compute modeled open interest for an option.
 * Higher vol deepens the liquidity pool (more hedging/speculative activity).
 */
export function modeledOI(type, logSK, dte, sigma) {
    const absM = Math.abs(logSK);
    const isITM = (type === 'call' && logSK > 0) || (type === 'put' && logSK < 0);
    const decay = isITM
        ? Math.exp(-OI_MONEYNESS_DECAY * 2.5 * absM * absM)
        : Math.exp(-OI_MONEYNESS_DECAY * absM * absM);
    const putSkew = (type === 'put' && !isITM) ? 1.5 : 1.0;
    const volScale = sigma > 0 ? Math.sqrt(sigma / OI_SIGMA_BASE) : 1;
    return Math.max(1,
        OI_ATM_BASE * decay * putSkew
        * Math.sqrt(63 / Math.max(1, dte))
        * volScale
    );
}

/**
 * Get the current option impact overlay for a specific strike.
 * @param {string} type      'call' or 'put'
 * @param {number} strike    Strike price
 * @param {number} expiryDay Expiry day
 * @param {number} sigma     Current Heston vol
 * @param {number} logSK     ln(S/K)
 * @param {number} dte       Days to expiry
 * @returns {number} Signed price shift
 */
export function getOptionImpact(type, strike, expiryDay, sigma, logSK, dte) {
    const key = `${type}_${strike}_${expiryDay}`;
    const cum = _cumOption.get(key);
    if (!cum) return 0;
    const oi = modeledOI(type, logSK, dte, sigma);
    const buyImpact  = OPT_IMPACT_COEFF * sigma * Math.sqrt(cum.buy  / oi);
    const sellImpact = OPT_IMPACT_COEFF * sigma * Math.sqrt(cum.sell / oi);
    return buyImpact - sellImpact;
}

/**
 * Record an option trade: updates cumulative volume and returns fill cost.
 * @returns {number} Signed fill cost adjustment
 */
export function recordOptionTrade(type, qty, sigma, logSK, dte, strike, expiryDay) {
    const absQty = Math.abs(qty);
    const sign   = qty > 0 ? 1 : -1;
    const oi     = modeledOI(type, logSK, dte, sigma);
    const key    = `${type}_${strike}_${expiryDay}`;
    let cum = _cumOption.get(key);
    if (!cum) { cum = { buy: 0, sell: 0 }; _cumOption.set(key, cum); }
    const cumRef = qty > 0 ? cum.buy : cum.sell;
    const cost   = OPT_IMPACT_COEFF * sigma * (Math.sqrt((cumRef + absQty) / oi) - Math.sqrt(cumRef / oi)) * sign;
    if (qty > 0) cum.buy += absQty; else cum.sell += absQty;
    return cost;
}

/* ── Dynamic market-maker rehedging ── */

/**
 * Recompute the MM's required delta hedge from the player's current option
 * positions and record any incremental stock volume.
 *
 * Call once per substep (after stock price moves) so that delta changes
 * from price movement generate hedging flow.
 *
 * @param {Object[]} positions  portfolio.positions array
 */
export function rehedgeMM(positions) {
    let requiredHedge = 0;
    for (const p of positions) {
        if (p.type !== 'call' && p.type !== 'put') continue;
        const dte = p.expiryDay - market.day;
        if (dte <= 0) continue;
        const T = dte / TRADING_DAYS_PER_YEAR;
        const sigEff = computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi);
        const sigma = computeSkewSigma(sigEff, market.S, p.strike, T, market.rho, market.xi, market.kappa);
        if (!_mmGreekTrees) _mmGreekTrees = allocGreekTrees();
        prepareGreekTrees(T, market.r, sigma, market.q, market.day, _mmGreekTrees);
        const delta = computeGreeksWithTrees(market.S, p.strike, p.type === 'put', _mmGreekTrees).delta;
        // MM is short what player is long: hedges by buying delta*qty shares
        requiredHedge += delta * p.qty;
    }

    const diff = requiredHedge - _mmCurrentHedge;
    const absDiff = Math.abs(diff);
    if (absDiff < 0.01) return;

    // Record the incremental hedge as stock volume
    if (diff > 0) _cumStockBuy  += absDiff;
    else           _cumStockSell += absDiff;
    _mmCurrentHedge = requiredHedge;
}

/* ── Layer 3: Parameter shifts from large exposure ── */

export function updateParamShifts(grossRatio) {
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

export function decayParamShifts() {
    const factor = Math.pow(0.5, 1 / PARAM_SHIFT_HALF_LIFE);
    for (const k in _playerParamShifts) {
        _playerParamShifts[k] *= factor;
        if (Math.abs(_playerParamShifts[k]) < 1e-8) _playerParamShifts[k] = 0;
    }
}

export function applyParamOverlays(sim) {
    const saved = {};
    for (const k in _playerParamShifts) {
        if (_playerParamShifts[k] === 0) continue;
        saved[k] = sim[k];
        sim[k] += _playerParamShifts[k];
    }
    return saved;
}

export function removeParamOverlays(sim, saved) {
    for (const k in saved) sim[k] = saved[k];
}

/* ── Layer 2: Event coupling ── */

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
export function getPlayerParamShifts() { return { ..._playerParamShifts }; }
