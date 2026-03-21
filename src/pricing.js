/**
 * pricing.js — American option pricing via CRR binomial tree
 *
 * Optimised for batch pricing: tree parameters are cached and reused across
 * calls with the same (T, r, sigma, q, currentDay). Inner backward induction
 * uses incremental d² stepping instead of Math.pow (~12x faster per node).
 * Tree-based delta/gamma extracted from CRR nodes at steps 1 & 2, reducing
 * computeGreeks from 9 to 7 backward inductions.
 *
 * Dual call+put pricing (_pricePairCore) runs a single backward induction
 * for both option types simultaneously, halving tree traversals for chain
 * pricing where both call and put at each strike are always needed.
 *
 * Public API — single-option:
 *   priceAmerican(S, K, T, r, sigma, isPut, q, currentDay)
 *   computeGreeks(S, K, T, r, sigma, isPut, q, currentDay)
 *   prepareTree(T, r, sigma, q, currentDay)           -> tree object
 *   priceWithTree(S, K, isPut, tree)                   -> price
 *   prepareGreekTrees(T, r, sigma, q, currentDay)      -> greekTrees
 *   computeGreeksWithTrees(S, K, isPut, greekTrees)    -> Greeks object
 *
 * Public API — paired call+put (chain pricing):
 *   pricePairWithTree(S, K, tree)                      -> { call, put }
 *   computeGreeksPairWithTrees(S, K, greekTrees)       -> { call: Greeks, put: Greeks }
 *
 * References:
 *   Cox, J.C., Ross, S.A. & Rubinstein, M. (1979). "Option pricing:
 *     A simplified approach." Journal of Financial Economics, 7, 229-263.
 */

import { BINOMIAL_STEPS, TRADING_DAYS_PER_YEAR, QUARTERLY_CYCLE } from './config.js';

const _N = BINOMIAL_STEPS;

// ---------------------------------------------------------------------------
// Module-level reusable buffers (single-threaded — safe to reuse)
// ---------------------------------------------------------------------------

/** Backward-induction value buffer for single pricing / call values in pair mode. */
const _V = new Float64Array(_N + 1);

/** Put value buffer for dual call+put pricing. */
const _VP = new Float64Array(_N + 1);

// Tree intermediates saved during backward induction for delta/gamma extraction.
// Single-option path: set by _priceCore, read by _treeDeltaGamma.
let _f10 = 0, _f11 = 0;
let _f20 = 0, _f21 = 0, _f22 = 0;

// Pair path: set by _pricePairCore, read by _pairDeltaGamma.
let _cf10 = 0, _cf11 = 0;
let _cf20 = 0, _cf21 = 0, _cf22 = 0;
let _pf10 = 0, _pf11 = 0;
let _pf20 = 0, _pf21 = 0, _pf22 = 0;

// Pair delta/gamma results: set by _pairDeltaGamma, read by public pair APIs.
let _callDelta = 0, _callGamma = 0;
let _putDelta = 0, _putGamma = 0;

// ---------------------------------------------------------------------------
// Transparent parameter cache for priceAmerican
// ---------------------------------------------------------------------------

const _cache = {
    u: 0, d: 0, d2: 0, puDisc: 0, pdDisc: 0, useDiscrete: false,
    powU: new Float64Array(_N + 1),
    divAdj: new Float64Array(_N + 1),
};
const _NO_DAY = -Infinity; // sentinel for "no currentDay"
let _cT = NaN, _cR = NaN, _cSig = NaN, _cQ = NaN, _cDay = _NO_DAY;

// ---------------------------------------------------------------------------
// Tree preparation
// ---------------------------------------------------------------------------

/**
 * Fill a tree parameter object from pricing inputs.
 *
 * Precomputes: u^i powers (128 multiplies replacing thousands of Math.pow),
 * dividend adjustment factors, risk-neutral probabilities × discount factor.
 *
 * @param {object} tree - Object with powU and divAdj Float64Arrays
 */
function _fillTree(tree, T, r, sigma, q, currentDay) {
    const n = _N;
    const dt = T / n;
    const u = Math.exp(sigma * Math.sqrt(dt));
    const d = 1 / u;

    tree.u = u;
    tree.d = d;
    tree.d2 = d * d;

    // Precompute u^i: 128 multiplies replaces ~8300 Math.pow calls per tree
    const powU = tree.powU;
    powU[0] = 1;
    for (let i = 1; i <= n; i++) powU[i] = powU[i - 1] * u;

    // Dividend adjustment factors: divAdj[i] = (1 - q/4)^(dividends at or before step i)
    const divYield = q * 0.25;
    let useDiscrete = q > 0 && currentDay != null && currentDay !== _NO_DAY;
    const divAdj = tree.divAdj;

    if (useDiscrete) {
        const dteDays = Math.round(T * TRADING_DAYS_PER_YEAR);
        const mulFactor = 1 - divYield;
        let hasDivs = false;
        let nextDiv = (Math.floor(currentDay / QUARTERLY_CYCLE) + 1) * QUARTERLY_CYCLE;

        // Collect dividend step indices (at most ~8 for 2-year options)
        // Steps are monotonically non-decreasing — build divAdj in one pass
        let adj = 1;
        let stepCursor = 0; // next unfilled divAdj index

        for (; nextDiv <= currentDay + dteDays; nextDiv += QUARTERLY_CYCLE) {
            const dayOffset = nextDiv - currentDay;
            const step = Math.round(dayOffset / dteDays * n);
            if (step >= 1 && step <= n) {
                hasDivs = true;
                // Fill divAdj[stepCursor..step-1] with current adj
                while (stepCursor < step) divAdj[stepCursor++] = adj;
                adj *= mulFactor;
            }
        }

        if (hasDivs) {
            // Fill remaining
            while (stepCursor <= n) divAdj[stepCursor++] = adj;
        } else {
            useDiscrete = false;
        }
    }

    if (!useDiscrete) {
        divAdj.fill(1, 0, n + 1);
    }

    tree.useDiscrete = useDiscrete;

    // Risk-neutral probability × discount factor (precomputed products save
    // 2 multiplies per inner-loop node = ~16,500 multiplies per tree)
    const drift = useDiscrete ? r : (r - q);
    const disc = Math.exp(-r * dt);
    const pu = (Math.exp(drift * dt) - d) / (u - d);
    tree.puDisc = pu * disc;
    tree.pdDisc = (1 - pu) * disc;
}

/**
 * Prepare a reusable tree parameter object for batch pricing.
 *
 * Allocates its own typed arrays — safe to store and reuse across many
 * priceWithTree / computeGreeksWithTrees calls. For one-off pricing,
 * prefer priceAmerican() which uses a transparent cache instead.
 *
 * @param {number} T          - Time to expiry in years
 * @param {number} r          - Risk-free rate
 * @param {number} sigma      - Volatility (annualised)
 * @param {number} [q=0]      - Dividend yield
 * @param {number} [currentDay] - Simulation day (enables discrete dividends)
 * @returns {object} Tree parameter object for priceWithTree
 */
export function prepareTree(T, r, sigma, q, currentDay) {
    q = q || 0;
    const tree = {
        u: 0, d: 0, d2: 0, puDisc: 0, pdDisc: 0, useDiscrete: false,
        powU: new Float64Array(_N + 1),
        divAdj: new Float64Array(_N + 1),
        valid: T > 0 && sigma > 0,
    };
    if (tree.valid) _fillTree(tree, T, r, sigma, q, currentDay);
    return tree;
}

// ---------------------------------------------------------------------------
// Core backward induction — single option
// ---------------------------------------------------------------------------

/**
 * Run CRR backward induction on a prepared tree.
 *
 * Inner loop uses incremental d² stepping for stock prices (no Math.pow).
 * Put/call branches are split to eliminate branching from the inner loop.
 * Saves intermediate values at steps 1 & 2 for tree-based delta/gamma.
 *
 * @param {number}  S     - Spot price
 * @param {number}  K     - Strike
 * @param {boolean} isPut - true = put, false = call
 * @param {object}  tree  - Prepared tree parameters
 * @returns {number} Option price
 */
function _priceCore(S, K, isPut, tree) {
    const { d2, puDisc, pdDisc, powU, divAdj } = tree;
    const n = _N;
    const V = _V;

    // Terminal payoffs — incremental d² stepping replaces Math.pow per node
    let Sj = S * divAdj[n] * powU[n]; // stock price at (n, 0)

    if (isPut) {
        for (let j = 0; j <= n; j++) {
            V[j] = K > Sj ? K - Sj : 0;
            Sj *= d2;
        }

        // Backward induction with early exercise (put)
        for (let i = n - 1; i >= 0; i--) {
            let Si = S * divAdj[i] * powU[i];
            for (let j = 0; j <= i; j++) {
                const hold = puDisc * V[j] + pdDisc * V[j + 1];
                const ex = K - Si;
                // max(hold, exercise, 0): floor at 0 guards extreme pu outside [0,1]
                const val = ex > hold ? ex : hold;
                V[j] = val > 0 ? val : 0;
                Si *= d2;
            }
            if (i === 2) { _f20 = V[0]; _f21 = V[1]; _f22 = V[2]; }
            else if (i === 1) { _f10 = V[0]; _f11 = V[1]; }
        }
    } else {
        for (let j = 0; j <= n; j++) {
            V[j] = Sj > K ? Sj - K : 0;
            Sj *= d2;
        }

        // Backward induction with early exercise (call)
        for (let i = n - 1; i >= 0; i--) {
            let Si = S * divAdj[i] * powU[i];
            for (let j = 0; j <= i; j++) {
                const hold = puDisc * V[j] + pdDisc * V[j + 1];
                const ex = Si - K;
                const val = ex > hold ? ex : hold;
                V[j] = val > 0 ? val : 0;
                Si *= d2;
            }
            if (i === 2) { _f20 = V[0]; _f21 = V[1]; _f22 = V[2]; }
            else if (i === 1) { _f10 = V[0]; _f11 = V[1]; }
        }
    }

    return V[0];
}

// ---------------------------------------------------------------------------
// Core backward induction — dual call+put
// ---------------------------------------------------------------------------

/**
 * Run CRR backward induction for both call and put simultaneously.
 *
 * Shares loop overhead, Si computation, and powU/divAdj lookups between
 * call and put, halving the number of tree traversals needed when both
 * option types at the same strike are required (the common case for chain
 * pricing: 25 strikes × 1 dual pass vs 25 × 2 single passes).
 *
 * Call price stored in _V[0], put price in _VP[0].
 * Pair intermediates (_cf10.._cf22, _pf10.._pf22) set for delta/gamma.
 *
 * @param {number} S    - Spot price
 * @param {number} K    - Strike
 * @param {object} tree - Prepared tree parameters
 */
function _pricePairCore(S, K, tree) {
    const { d2, puDisc, pdDisc, powU, divAdj } = tree;
    const n = _N;
    const VC = _V;
    const VP = _VP;

    // Terminal payoffs — compute both call and put from same stock price scan
    let Sj = S * divAdj[n] * powU[n];
    for (let j = 0; j <= n; j++) {
        const diff = Sj - K;
        VC[j] = diff > 0 ? diff : 0;
        VP[j] = diff < 0 ? -diff : 0;
        Sj *= d2;
    }

    // Backward induction with early exercise (call + put simultaneously)
    for (let i = n - 1; i >= 0; i--) {
        let Si = S * divAdj[i] * powU[i];
        for (let j = 0; j <= i; j++) {
            // Call: hold vs exercise (Si - K)
            const holdC = puDisc * VC[j] + pdDisc * VC[j + 1];
            const exC = Si - K;
            const valC = exC > holdC ? exC : holdC;
            VC[j] = valC > 0 ? valC : 0;

            // Put: hold vs exercise (K - Si = -exC)
            const holdP = puDisc * VP[j] + pdDisc * VP[j + 1];
            const exP = -exC;
            const valP = exP > holdP ? exP : holdP;
            VP[j] = valP > 0 ? valP : 0;

            Si *= d2;
        }
        if (i === 2) {
            _cf20 = VC[0]; _cf21 = VC[1]; _cf22 = VC[2];
            _pf20 = VP[0]; _pf21 = VP[1]; _pf22 = VP[2];
        } else if (i === 1) {
            _cf10 = VC[0]; _cf11 = VC[1];
            _pf10 = VP[0]; _pf11 = VP[1];
        }
    }
    // Call price = VC[0] = _V[0], Put price = VP[0] = _VP[0]
}

// ---------------------------------------------------------------------------
// Delta/gamma extraction
// ---------------------------------------------------------------------------

/**
 * Extract tree-based delta and gamma from saved intermediate values.
 *
 * Uses CRR option values at tree steps 1 and 2 (saved during _priceCore)
 * and the tree's stock price lattice. Eliminates 2 of 9 finite-difference
 * pricing calls that would otherwise be needed for delta/gamma.
 *
 * @param {number} S    - Spot price
 * @param {object} tree - Tree used in the most recent _priceCore call
 * @returns {{ delta: number, gamma: number }}
 */
function _treeDeltaGamma(S, tree) {
    const { u, d, divAdj } = tree;
    const adj1 = divAdj[1];
    const adj2 = divAdj[2];

    // Delta from step 1: (f(1,0) - f(1,1)) / (S_up - S_down)
    const S1u = S * adj1 * u;
    const S1d = S * adj1 * d;
    const delta = (_f10 - _f11) / (S1u - S1d);

    // Gamma from step 2: change in delta / change in S
    const S2u = S * adj2 * u * u;
    const S2m = S * adj2;
    const S2d = S * adj2 * d * d;
    const dUp = (_f20 - _f21) / (S2u - S2m);
    const dDn = (_f21 - _f22) / (S2m - S2d);
    const gamma = (dUp - dDn) / (0.5 * (S2u - S2d));

    return { delta, gamma };
}

/**
 * Extract tree-based delta and gamma for both call and put from pair
 * intermediates saved during _pricePairCore.
 *
 * Results stored in module-level _callDelta, _callGamma, _putDelta,
 * _putGamma to avoid object allocation in the hot path.
 *
 * @param {number} S    - Spot price
 * @param {object} tree - Tree used in the most recent _pricePairCore call
 */
function _pairDeltaGamma(S, tree) {
    const { u, d, divAdj } = tree;
    const adj1 = divAdj[1];
    const adj2 = divAdj[2];

    const S1u = S * adj1 * u;
    const S1d = S * adj1 * d;
    const dS1inv = 1 / (S1u - S1d);

    const S2u = S * adj2 * u * u;
    const S2m = S * adj2;
    const S2d = S * adj2 * d * d;
    const dS2um = S2u - S2m;
    const dS2md = S2m - S2d;
    const dS2halfInv = 2 / (S2u - S2d);

    // Call delta/gamma
    _callDelta = (_cf10 - _cf11) * dS1inv;
    const cDUp = (_cf20 - _cf21) / dS2um;
    const cDDn = (_cf21 - _cf22) / dS2md;
    _callGamma = (cDUp - cDDn) * dS2halfInv;

    // Put delta/gamma
    _putDelta = (_pf10 - _pf11) * dS1inv;
    const pDUp = (_pf20 - _pf21) / dS2um;
    const pDDn = (_pf21 - _pf22) / dS2md;
    _putGamma = (pDUp - pDDn) * dS2halfInv;
}

// ---------------------------------------------------------------------------
// Public API: single-call pricing
// ---------------------------------------------------------------------------

/**
 * Price an American option via CRR binomial tree.
 *
 * Tree parameters are transparently cached: consecutive calls with the same
 * (T, r, sigma, q, currentDay) skip tree preparation entirely. This makes
 * batch pricing over varying S/K nearly free after the first call.
 *
 * @param {number}  S          - Spot price
 * @param {number}  K          - Strike
 * @param {number}  T          - Time to expiry in years
 * @param {number}  r          - Risk-free rate (continuously compounded)
 * @param {number}  sigma      - Volatility (annualised)
 * @param {boolean} isPut      - true = put, false = call
 * @param {number}  [q=0]      - Dividend yield
 * @param {number}  [currentDay] - Simulation day (enables discrete dividends)
 * @returns {number} Option price
 */
function priceAmerican(S, K, T, r, sigma, isPut, q, currentDay) {
    q = q || 0;
    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0)
        return isPut ? (K > S ? K - S : 0) : (S > K ? S - K : 0);

    // Check transparent cache — 5 scalar comparisons, no allocation
    const day = currentDay ?? _NO_DAY;
    if (T !== _cT || r !== _cR || sigma !== _cSig || q !== _cQ || day !== _cDay) {
        _fillTree(_cache, T, r, sigma, q, currentDay);
        _cT = T; _cR = r; _cSig = sigma; _cQ = q; _cDay = day;
    }

    return _priceCore(S, K, isPut, _cache);
}

/**
 * Price using a pre-prepared tree (from prepareTree).
 *
 * Use when multiple options share the same (T, r, sigma, q, currentDay)
 * and you want to avoid even the cache-check overhead, or when you need
 * the tree to persist across interleaved calls with different parameters.
 *
 * @param {number}  S     - Spot price
 * @param {number}  K     - Strike
 * @param {boolean} isPut - true = put, false = call
 * @param {object}  tree  - From prepareTree()
 * @returns {number} Option price
 */
export function priceWithTree(S, K, isPut, tree) {
    if (!tree.valid || S <= 0 || K <= 0)
        return isPut ? (K > S ? K - S : 0) : (S > K ? S - K : 0);
    return _priceCore(S, K, isPut, tree);
}

// ---------------------------------------------------------------------------
// Public API: paired call+put pricing
// ---------------------------------------------------------------------------

/**
 * Price both call and put at the same strike using a single backward
 * induction pass. ~2x faster than two separate priceWithTree calls.
 *
 * @param {number} S    - Spot price
 * @param {number} K    - Strike
 * @param {object} tree - From prepareTree()
 * @returns {{ call: number, put: number }}
 */
export function pricePairWithTree(S, K, tree) {
    if (!tree.valid || S <= 0 || K <= 0) {
        return {
            call: S > K ? S - K : 0,
            put: K > S ? K - S : 0,
        };
    }
    _pricePairCore(S, K, tree);
    return { call: _V[0], put: _VP[0] };
}

// ---------------------------------------------------------------------------
// Greeks — single option
// ---------------------------------------------------------------------------

/**
 * Compute option Greeks.
 *
 * Delta and gamma are extracted directly from the CRR tree (steps 1 & 2),
 * eliminating 2 finite-difference pricing calls. Theta, vega, and rho use
 * central finite differences (6 additional backward inductions).
 *
 * Total: 7 backward inductions instead of 9 in the classical approach.
 *
 * @returns {{ price, delta, gamma, theta, vega, rho }}
 */
export function computeGreeks(S, K, T, r, sigma, isPut, q, currentDay) {
    q = q || 0;
    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
        const intrinsic = isPut ? (K > S ? K - S : 0) : (S > K ? S - K : 0);
        return { price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }

    // Base price — sets _f10..._f22 for tree-based delta/gamma
    const price = priceAmerican(S, K, T, r, sigma, isPut, q, currentDay);

    // Tree-based delta/gamma (read _cache which was filled by priceAmerican).
    // ORDERING: must run before any subsequent priceAmerican call that changes
    // parameters, which would overwrite _cache and _f10..._f22.
    const { delta, gamma } = _treeDeltaGamma(S, _cache);

    // Finite-difference theta, vega, rho (6 backward inductions)
    const h_T     = 1 / TRADING_DAYS_PER_YEAR;
    const h_sigma = 0.001;
    const h_r     = 0.0001;

    const T_lo = Math.max(T - h_T, 1e-10);
    const T_hi = T + h_T;
    const theta = (priceAmerican(S, K, T_lo, r, sigma, isPut, q, currentDay)
                 - priceAmerican(S, K, T_hi, r, sigma, isPut, q, currentDay)) / (T_hi - T_lo);

    const vega = (priceAmerican(S, K, T, r, sigma + h_sigma, isPut, q, currentDay)
               - priceAmerican(S, K, T, r, sigma - h_sigma, isPut, q, currentDay)) / (2 * h_sigma);

    const rho = (priceAmerican(S, K, T, r + h_r, sigma, isPut, q, currentDay)
              - priceAmerican(S, K, T, r - h_r, sigma, isPut, q, currentDay)) / (2 * h_r);

    return { price, delta, gamma, theta, vega, rho };
}

// ---------------------------------------------------------------------------
// Batch Greeks API — single option
// ---------------------------------------------------------------------------

/**
 * Prepare all 7 tree variants needed for Greek computation.
 *
 * Call once per (T, r, sigma, q, currentDay), then use
 * computeGreeksWithTrees for each (S, K, isPut) combination.
 * Eliminates redundant tree preparation when pricing many options
 * at the same expiry (e.g. chain overlay: 50 options × 7 trees = 350
 * tree preps reduced to 7).
 *
 * @returns {object} Greek trees bundle for computeGreeksWithTrees
 */
export function prepareGreekTrees(T, r, sigma, q, currentDay) {
    q = q || 0;
    const h_T     = 1 / TRADING_DAYS_PER_YEAR;
    const h_sigma = 0.001;
    const h_r     = 0.0001;

    const T_lo = Math.max(T - h_T, 1e-10);
    const T_hi = T + h_T;

    return {
        base:    prepareTree(T, r, sigma, q, currentDay),
        thetaLo: prepareTree(T_lo, r, sigma, q, currentDay),
        thetaHi: prepareTree(T_hi, r, sigma, q, currentDay),
        vegaUp:  prepareTree(T, r, sigma + h_sigma, q, currentDay),
        vegaDn:  prepareTree(T, r, sigma - h_sigma, q, currentDay),
        rhoUp:   prepareTree(T, r + h_r, sigma, q, currentDay),
        rhoDn:   prepareTree(T, r - h_r, sigma, q, currentDay),
        hT:      T_hi - T_lo,
        hSigma:  h_sigma,
        hR:      h_r,
    };
}

/**
 * Compute Greeks using pre-prepared trees.
 *
 * Tree-based delta/gamma + finite-difference theta/vega/rho.
 * Each call runs 7 backward inductions (no tree preparation overhead).
 *
 * @param {number}  S     - Spot price
 * @param {number}  K     - Strike
 * @param {boolean} isPut - true = put, false = call
 * @param {object}  gt    - From prepareGreekTrees()
 * @returns {{ price, delta, gamma, theta, vega, rho }}
 */
export function computeGreeksWithTrees(S, K, isPut, gt) {
    if (S <= 0 || K <= 0 || !gt.base.valid) {
        const intrinsic = isPut ? (K > S ? K - S : 0) : (S > K ? S - K : 0);
        return { price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }

    // Base price — sets _f10..._f22
    const price = _priceCore(S, K, isPut, gt.base);

    // Tree-based delta/gamma
    const { delta, gamma } = _treeDeltaGamma(S, gt.base);

    // Finite-difference theta/vega/rho
    const pTlo = _priceCore(S, K, isPut, gt.thetaLo);
    const pThi = _priceCore(S, K, isPut, gt.thetaHi);
    const theta = (pTlo - pThi) / gt.hT;

    const pSu = _priceCore(S, K, isPut, gt.vegaUp);
    const pSd = _priceCore(S, K, isPut, gt.vegaDn);
    const vega = (pSu - pSd) / (2 * gt.hSigma);

    const pRu = _priceCore(S, K, isPut, gt.rhoUp);
    const pRd = _priceCore(S, K, isPut, gt.rhoDn);
    const rho = (pRu - pRd) / (2 * gt.hR);

    return { price, delta, gamma, theta, vega, rho };
}

// ---------------------------------------------------------------------------
// Batch Greeks API — paired call+put
// ---------------------------------------------------------------------------

/**
 * Compute Greeks for both call and put at the same strike using dual
 * backward induction. Each of the 7 tree variants runs a single pass
 * producing both call and put values simultaneously.
 *
 * Total: 7 dual backward inductions instead of 14 single inductions.
 * Shares loop overhead, Si computation, and array lookups between
 * call and put within each induction pass.
 *
 * @param {number} S  - Spot price
 * @param {number} K  - Strike
 * @param {object} gt - From prepareGreekTrees()
 * @returns {{ call: { price, delta, gamma, theta, vega, rho },
 *             put:  { price, delta, gamma, theta, vega, rho } }}
 */
export function computeGreeksPairWithTrees(S, K, gt) {
    if (S <= 0 || K <= 0 || !gt.base.valid) {
        const intrC = S > K ? S - K : 0;
        const intrP = K > S ? K - S : 0;
        return {
            call: { price: intrC, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
            put:  { price: intrP, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
        };
    }

    // Base price — sets pair intermediates (_cf10.._cf22, _pf10.._pf22)
    _pricePairCore(S, K, gt.base);
    const callPrice = _V[0];
    const putPrice = _VP[0];

    // Tree-based delta/gamma for both (reads pair intermediates)
    _pairDeltaGamma(S, gt.base);
    const cDelta = _callDelta, cGamma = _callGamma;
    const pDelta = _putDelta, pGamma = _putGamma;

    // Finite-difference theta/vega/rho — 6 dual inductions
    _pricePairCore(S, K, gt.thetaLo);
    const cTlo = _V[0], pTlo = _VP[0];

    _pricePairCore(S, K, gt.thetaHi);
    const cThi = _V[0], pThi = _VP[0];

    _pricePairCore(S, K, gt.vegaUp);
    const cVu = _V[0], pVu = _VP[0];

    _pricePairCore(S, K, gt.vegaDn);
    const cVd = _V[0], pVd = _VP[0];

    _pricePairCore(S, K, gt.rhoUp);
    const cRu = _V[0], pRu = _VP[0];

    _pricePairCore(S, K, gt.rhoDn);
    const cRd = _V[0], pRd = _VP[0];

    const invHT = 1 / gt.hT;
    const inv2hSigma = 1 / (2 * gt.hSigma);
    const inv2hR = 1 / (2 * gt.hR);

    return {
        call: {
            price: callPrice, delta: cDelta, gamma: cGamma,
            theta: (cTlo - cThi) * invHT,
            vega: (cVu - cVd) * inv2hSigma,
            rho: (cRu - cRd) * inv2hR,
        },
        put: {
            price: putPrice, delta: pDelta, gamma: pGamma,
            theta: (pTlo - pThi) * invHT,
            vega: (pVu - pVd) * inv2hSigma,
            rho: (pRu - pRd) * inv2hR,
        },
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { priceAmerican };
