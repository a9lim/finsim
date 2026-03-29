/**
 * pricing.js — American option pricing via CRR binomial tree
 *
 * Optimised for batch pricing: tree parameters are cached and reused across
 * calls with the same (T, r, sigma, q, currentDay). Inner backward
 * induction uses incremental d² stepping instead of Math.pow (~12x faster per
 * node). Tree-based delta/gamma/theta extracted from CRR nodes at steps 1 & 2,
 * reducing computeGreeks from 9 to 5 backward inductions.
 *
 * BSS smoothing (Broadie-Detemple): every tree carries a companion tree with
 * N-1 steps. All public pricing/Greek APIs average the N and N-1 results,
 * cancelling odd-even oscillation inherent in binomial lattices.
 *
 * Term-structure enhancements:
 *   - computeEffectiveSigma: Heston expected integrated variance over [0, T]
 *     with vol-of-vol convexity correction (Gatheral 2006 / Lewis 2000)
 *   - computeSkewSigma: Heston moneyness-dependent vol skew with quadratic
 *     smile curvature (ξ²/12σ² second-order term)
 *   - Per-step Vasicek rate discounting via market.a / market.b (market.js)
 *
 * Dual call+put pricing (_pricePairCore) runs a single backward induction
 * for both option types simultaneously, halving tree traversals for chain
 * pricing where both call and put at each strike are always needed.
 *
 * Public API — term-structure utilities:
 *   computeEffectiveSigma(v, T, kappa, theta, xi?)      -> effective sigma
 *   computeSkewSigma(sigmaEff, S, K, T, rho, xi, kappa) -> skewed sigma
 *
 * Public API — single-option:
 *   allocTree()                                         -> tree object (reusable)
 *   prepareTree(T, r, sigma, q, currentDay, into?)      -> tree object
 *   priceWithTree(S, K, isPut, tree)                    -> price
 *   allocGreekTrees()                                   -> greekTrees (reusable)
 *   prepareGreekTrees(T, r, sigma, q, currentDay, into?)-> greekTrees
 *   computeGreeksWithTrees(S, K, isPut, greekTrees)     -> Greeks object
 *
 * Public API — paired call+put (chain pricing):
 *   pricePairWithTree(S, K, tree)                       -> { call, put }
 *   computeGreeksPairWithTrees(S, K, greekTrees)        -> { call: Greeks, put: Greeks }
 *
 * References:
 *   Cox, J.C., Ross, S.A. & Rubinstein, M. (1979). "Option pricing:
 *     A simplified approach." Journal of Financial Economics, 7, 229-263.
 */

import { BINOMIAL_STEPS, TRADING_DAYS_PER_YEAR, QUARTERLY_CYCLE } from './config.js';
import { market } from './market.js';

const _N = BINOMIAL_STEPS;

// ---------------------------------------------------------------------------
// Term-structure utilities
// ---------------------------------------------------------------------------

/**
 * Compute effective volatility from Heston expected integrated variance,
 * with optional vol-of-vol convexity correction.
 *
 * σ_eff²(T) = θ + (v - θ) · (1 - e^{-κT}) / (κT)
 *
 * Accounts for variance mean-reversion: long-dated options use a vol closer
 * to the long-run level θ, while short-dated options reflect the current
 * instantaneous variance v.
 *
 * When xi > 0, adds the Gatheral / Lewis vol-of-vol convexity correction:
 *   adj = ξ² / (2κ²·meanVar) · w(κT)
 * where w(x) = 2(x - 1 + e^{-x}) / x² is the normalised OU variance weight.
 * This lifts the overall vol level when vol-of-vol is significant.
 * (Gatheral 2006, ch. 3; Lewis 2000, sec. 5.3)
 *
 * @param {number} v      - Current instantaneous variance
 * @param {number} T      - Time to expiry in years
 * @param {number} kappa  - Mean-reversion speed of variance
 * @param {number} theta  - Long-run variance level
 * @param {number} [xi=0] - Vol-of-vol; enables convexity correction when > 0
 * @returns {number} Effective annualised volatility
 */
export function computeEffectiveSigma(v, T, kappa, theta, xi) {
    const kT = kappa * T;
    if (kT < 1e-6) return Math.sqrt(Math.max(v, 0));
    const expNkT = Math.exp(-kT);
    const meanVar = theta + (v - theta) * (1 - expNkT) / kT;
    if (meanVar < 1e-8) return Math.sqrt(Math.max(meanVar, 0));

    // Vol-of-vol convexity: additive variance correction from stochastic vol.
    // w(x) = (2/x²)(x - 1 + e^{-x}), the normalized OU variance weight.
    // The correction ξ²·w/(2κ²) is added to the mean integrated variance.
    // Gatheral 2006, ch. 3; Lewis 2000, sec. 5.3.
    let adj = 0;
    if (xi > 0) {
        const w = 2 / (kT * kT) * (kT - 1 + expNkT);
        adj = xi * xi / (2 * kappa * kappa) * w;
    }

    return Math.sqrt(Math.max(meanVar + adj, 0));
}

/**
 * Adjust volatility for moneyness using first-order Heston skew.
 *
 * ATM implied vol skew: dσ/d(log K) ≈ ρξ / (2σ), dampened at longer
 * tenors by the variance mean-reversion factor (1 - e^{-κT}) / (κT).
 *
 * When ρ < 0 (typical), OTM puts (K < S) get higher vol and OTM calls
 * (K > S) get lower vol — producing a realistic volatility skew.
 *
 * @param {number} sigmaEff - Effective ATM volatility (from computeEffectiveSigma)
 * @param {number} S        - Spot price
 * @param {number} K        - Strike price
 * @param {number} T        - Time to expiry in years
 * @param {number} rho      - Price-volatility correlation
 * @param {number} xi       - Vol-of-vol
 * @param {number} kappa    - Mean-reversion speed of variance
 * @returns {number} Skew-adjusted volatility for this strike
 */
export function computeSkewSigma(sigmaEff, S, K, T, rho, xi, kappa) {
    const x = Math.log(K / S);
    const kT = kappa * T;
    const dampen = kT < 1e-6 ? 1 : (1 - Math.exp(-kT)) / kT;
    const skewCoeff = rho * xi / (2 * sigmaEff) * dampen;
    // Second-order smile curvature: ξ²/(12σ²) makes both wings curve up.
    // Same dampen factor (approximation — exact Heston decays differently).
    const curvCoeff = xi * xi / (12 * sigmaEff * sigmaEff) * dampen;
    const adj = sigmaEff * (1 + skewCoeff * x + curvCoeff * x * x);
    return adj > 0.01 ? adj : 0.01;
}

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

const _NO_DAY = -Infinity; // sentinel for "no currentDay"

// ---------------------------------------------------------------------------
// Tree preparation
// ---------------------------------------------------------------------------

/**
 * Fill a tree parameter object from pricing inputs.
 *
 * Precomputes: u^i powers (128 multiplies replacing thousands of Math.pow),
 * dividend adjustment factors, per-step risk-neutral probabilities × discount
 * factors (with optional Vasicek term-structure rates).
 *
 * @param {object} tree         - Object with powU, divAdj, puDisc, pdDisc arrays
 * @param {number} T            - Time to expiry in years
 * @param {number} r            - Risk-free rate (spot rate / short rate)
 * @param {number} sigma        - Volatility (annualised)
 * @param {number} q            - Dividend yield
 * @param {number} currentDay   - Simulation day (enables discrete dividends)
 */
function _fillTree(tree, T, r, sigma, q, currentDay) {
    const n = tree.n;
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

    // Per-step risk-neutral probability × discount factor.
    // With Vasicek term-structure: r(t_i) = b + (r₀ - b)·e^{-a·t_i}
    // Without: flat rate at every step.
    const puDiscArr = tree.puDisc;
    const pdDiscArr = tree.pdDisc;
    const uMinusD = u - d;

    if (market.a > 0) {
        const va = market.a, vb = market.b;
        const rDiff = r - vb;
        // Multiplicative recurrence for exp(-a·t_i): avoids N Math.exp calls
        let expDecay = 1;                   // exp(-a · 0) = 1
        const expStep = Math.exp(-va * dt); // constant step multiplier
        for (let i = 0; i < n; i++) {
            const r_i = vb + rDiff * expDecay;
            expDecay *= expStep;
            const drift_i = useDiscrete ? r_i : (r_i - q);
            const disc_i = Math.exp(-r_i * dt);
            // Clamp pu to [0,1] — negative rates can push e^{drift·dt} below d
            const pu_i = Math.max(0, Math.min(1, (Math.exp(drift_i * dt) - d) / uMinusD));
            puDiscArr[i] = pu_i * disc_i;
            pdDiscArr[i] = (1 - pu_i) * disc_i;
        }
    } else {
        // Flat rate — fill arrays with constant values
        const drift = useDiscrete ? r : (r - q);
        const disc = Math.exp(-r * dt);
        const pu = Math.max(0, Math.min(1, (Math.exp(drift * dt) - d) / uMinusD));
        const puDisc = pu * disc;
        const pdDisc = (1 - pu) * disc;
        puDiscArr.fill(puDisc, 0, n);
        pdDiscArr.fill(pdDisc, 0, n);
    }
}

/**
 * Allocate a fresh tree parameter object with typed arrays.
 * Use when you need a persistent tree (e.g. strategy pre-computation).
 * For hot-path chain pricing, pass this object back to prepareTree
 * via the `into` parameter to reuse the buffers.
 *
 * @returns {object} Empty tree parameter object
 */
export function allocTree() {
    return {
        n: _N, u: 0, d: 0, d2: 0, useDiscrete: false,
        powU: new Float64Array(_N + 1),
        divAdj: new Float64Array(_N + 1),
        puDisc: new Float64Array(_N),
        pdDisc: new Float64Array(_N),
        valid: false,
        // BSS companion tree (N-1 steps) for odd/even oscillation cancellation
        _b: {
            n: _N - 1, u: 0, d: 0, d2: 0, useDiscrete: false,
            powU: new Float64Array(_N + 1),
            divAdj: new Float64Array(_N + 1),
            puDisc: new Float64Array(_N),
            pdDisc: new Float64Array(_N),
            valid: false,
            _b: null,
        },
    };
}

/**
 * Prepare a reusable tree parameter object for batch pricing.
 *
 * When `into` is provided, fills the existing tree's typed arrays
 * instead of allocating new ones — eliminates GC pressure in hot loops.
 * When omitted, allocates fresh typed arrays.
 *
 * @param {number} T          - Time to expiry in years
 * @param {number} r          - Risk-free rate
 * @param {number} sigma      - Volatility (annualised)
 * @param {number} [q=0]      - Dividend yield
 * @param {number} [currentDay] - Simulation day (enables discrete dividends)
 * @param {object} [into]     - Existing tree object to fill (avoids allocation)
 * @returns {object} Tree parameter object for priceWithTree
 */
export function prepareTree(T, r, sigma, q, currentDay, into) {
    q = q || 0;
    const tree = into || allocTree();
    tree.valid = T > 0 && sigma > 0;
    if (tree.valid) {
        _fillTree(tree, T, r, sigma, q, currentDay);
        if (tree._b) {
            tree._b.valid = true;
            _fillTree(tree._b, T, r, sigma, q, currentDay);
        }
    } else if (tree._b) {
        tree._b.valid = false;
    }
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
    const { d2, puDisc, pdDisc, powU, divAdj, n } = tree;
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
            const pu_i = puDisc[i], pd_i = pdDisc[i];
            let Si = S * divAdj[i] * powU[i];
            for (let j = 0; j <= i; j++) {
                const hold = pu_i * V[j] + pd_i * V[j + 1];
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
            const pu_i = puDisc[i], pd_i = pdDisc[i];
            let Si = S * divAdj[i] * powU[i];
            for (let j = 0; j <= i; j++) {
                const hold = pu_i * V[j] + pd_i * V[j + 1];
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
 * pricing: 21 strikes × 1 dual pass vs 21 × 2 single passes).
 *
 * Call price stored in _V[0], put price in _VP[0].
 * Pair intermediates (_cf10.._cf22, _pf10.._pf22) set for delta/gamma.
 *
 * @param {number} S    - Spot price
 * @param {number} K    - Strike
 * @param {object} tree - Prepared tree parameters
 */
function _pricePairCore(S, K, tree) {
    const { d2, puDisc, pdDisc, powU, divAdj, n } = tree;
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
        const pu_i = puDisc[i], pd_i = pdDisc[i];
        let Si = S * divAdj[i] * powU[i];
        for (let j = 0; j <= i; j++) {
            // Call: hold vs exercise (Si - K)
            const holdC = pu_i * VC[j] + pd_i * VC[j + 1];
            const exC = Si - K;
            const valC = exC > holdC ? exC : holdC;
            VC[j] = valC > 0 ? valC : 0;

            // Put: hold vs exercise (K - Si = -exC)
            const holdP = pu_i * VP[j] + pd_i * VP[j + 1];
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
    const p1 = _priceCore(S, K, isPut, tree);
    if (!tree._b || !tree._b.valid) return p1;
    const p2 = _priceCore(S, K, isPut, tree._b);
    return 0.5 * (p1 + p2);
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
    if (!tree._b || !tree._b.valid) return { call: _V[0], put: _VP[0] };
    const c1 = _V[0], p1 = _VP[0];
    _pricePairCore(S, K, tree._b);
    return { call: 0.5 * (c1 + _V[0]), put: 0.5 * (p1 + _VP[0]) };
}

// ---------------------------------------------------------------------------
// Batch Greeks API — single option
// ---------------------------------------------------------------------------

/**
 * Allocate a fresh Greek trees bundle with 5 tree objects.
 * Theta is computed from the tree's center node at step 2 (no bump trees).
 * Pass back to prepareGreekTrees via `into` to reuse buffers.
 *
 * @returns {object} Empty Greek trees bundle
 */
export function allocGreekTrees() {
    return {
        base: allocTree(),
        vegaUp: allocTree(), vegaDn: allocTree(),
        rhoUp: allocTree(), rhoDn: allocTree(),
        dt: 0, hSigma: 0, hR: 0,
    };
}

/**
 * Prepare all 5 tree variants needed for Greek computation.
 * Theta is derived from the base tree's center node at step 2
 * (no bump trees needed). Vega and rho use finite-difference bumps.
 *
 * Call once per (T, r, sigma, q, currentDay), then use
 * computeGreeksWithTrees for each (S, K, isPut) combination.
 *
 * When `into` is provided, fills existing tree buffers (zero allocation).
 *
 * @param {object} [into] - Existing Greek trees bundle to fill
 * @returns {object} Greek trees bundle for computeGreeksWithTrees
 */
export function prepareGreekTrees(T, r, sigma, q, currentDay, into) {
    q = q || 0;
    const h_sigma = 0.01;
    const h_r     = 0.001;

    const gt = into || allocGreekTrees();
    prepareTree(T, r, sigma, q, currentDay, gt.base);
    prepareTree(T, r, sigma + h_sigma, q, currentDay, gt.vegaUp);
    prepareTree(T, r, sigma - h_sigma, q, currentDay, gt.vegaDn);
    prepareTree(T, r + h_r, sigma, q, currentDay, gt.rhoUp);
    prepareTree(T, r - h_r, sigma, q, currentDay, gt.rhoDn);
    gt.dt = T / gt.base.n;
    gt.hSigma = h_sigma;
    gt.hR = h_r;
    return gt;
}

/**
 * Compute Greeks using pre-prepared trees.
 *
 * Tree-based delta/gamma/theta + finite-difference vega/rho.
 * Theta uses the center node at step 2: (V_mid2 - V_0) / (2·dt).
 * Each call runs 5 backward inductions (no tree preparation overhead).
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

    const bss = gt.base._b && gt.base._b.valid;

    // Base price — sets _f10..._f22; BSS average with companion tree
    let price = _priceCore(S, K, isPut, gt.base);
    let { delta, gamma } = _treeDeltaGamma(S, gt.base);
    let theta = (_f21 - price) / (2 * gt.dt);
    if (bss) {
        const p2 = _priceCore(S, K, isPut, gt.base._b);
        const dg2 = _treeDeltaGamma(S, gt.base._b);
        const theta2 = (_f21 - p2) / (2 * (gt.dt * gt.base.n / gt.base._b.n));
        price = 0.5 * (price + p2);
        delta = 0.5 * (delta + dg2.delta);
        gamma = 0.5 * (gamma + dg2.gamma);
        theta = 0.5 * (theta + theta2);
    }

    // Finite-difference vega/rho (BSS averaged)
    let pSu  = _priceCore(S, K, isPut, gt.vegaUp);
    let pSd  = _priceCore(S, K, isPut, gt.vegaDn);
    let pRu  = _priceCore(S, K, isPut, gt.rhoUp);
    let pRd  = _priceCore(S, K, isPut, gt.rhoDn);
    if (bss) {
        pSu  = 0.5 * (pSu  + _priceCore(S, K, isPut, gt.vegaUp._b));
        pSd  = 0.5 * (pSd  + _priceCore(S, K, isPut, gt.vegaDn._b));
        pRu  = 0.5 * (pRu  + _priceCore(S, K, isPut, gt.rhoUp._b));
        pRd  = 0.5 * (pRd  + _priceCore(S, K, isPut, gt.rhoDn._b));
    }

    const vega  = (pSu - pSd) / (2 * gt.hSigma);
    const rho   = (pRu - pRd) / (2 * gt.hR);

    return { price, delta, gamma, theta, vega, rho };
}

// ---------------------------------------------------------------------------
// Batch Greeks API — paired call+put
// ---------------------------------------------------------------------------

/**
 * Compute Greeks for both call and put at the same strike using dual
 * backward induction. Each of the 5 tree variants runs a single pass
 * producing both call and put values simultaneously.
 * Theta uses the center node at step 2 from the base tree.
 *
 * Total: 5 dual backward inductions instead of 10 single inductions.
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

    const bss = gt.base._b && gt.base._b.valid;
    const inv2dt = 1 / (2 * gt.dt);

    // Base price — sets pair intermediates (_cf10.._cf22, _pf10.._pf22)
    _pricePairCore(S, K, gt.base);
    let cP = _V[0], pP = _VP[0];
    _pairDeltaGamma(S, gt.base);
    let cD = _callDelta, cG = _callGamma;
    let pD = _putDelta,  pG = _putGamma;
    let cTh = (_cf21 - cP) * inv2dt;
    let pTh = (_pf21 - pP) * inv2dt;

    if (bss) {
        _pricePairCore(S, K, gt.base._b);
        const bdt2 = gt.dt * gt.base.n / gt.base._b.n;
        const cTh2 = (_cf21 - _V[0]) / (2 * bdt2);
        const pTh2 = (_pf21 - _VP[0]) / (2 * bdt2);
        cP = 0.5 * (cP + _V[0]); pP = 0.5 * (pP + _VP[0]);
        _pairDeltaGamma(S, gt.base._b);
        cD = 0.5 * (cD + _callDelta); cG = 0.5 * (cG + _callGamma);
        pD = 0.5 * (pD + _putDelta);  pG = 0.5 * (pG + _putGamma);
        cTh = 0.5 * (cTh + cTh2);
        pTh = 0.5 * (pTh + pTh2);
    }

    // Finite-difference vega/rho — 4 dual inductions (BSS averaged)
    _pricePairCore(S, K, gt.vegaUp);
    let cVu = _V[0], pVu = _VP[0];
    _pricePairCore(S, K, gt.vegaDn);
    let cVd = _V[0], pVd = _VP[0];
    _pricePairCore(S, K, gt.rhoUp);
    let cRu = _V[0], pRu = _VP[0];
    _pricePairCore(S, K, gt.rhoDn);
    let cRd = _V[0], pRd = _VP[0];

    if (bss) {
        _pricePairCore(S, K, gt.vegaUp._b);
        cVu = 0.5 * (cVu + _V[0]); pVu = 0.5 * (pVu + _VP[0]);
        _pricePairCore(S, K, gt.vegaDn._b);
        cVd = 0.5 * (cVd + _V[0]); pVd = 0.5 * (pVd + _VP[0]);
        _pricePairCore(S, K, gt.rhoUp._b);
        cRu = 0.5 * (cRu + _V[0]); pRu = 0.5 * (pRu + _VP[0]);
        _pricePairCore(S, K, gt.rhoDn._b);
        cRd = 0.5 * (cRd + _V[0]); pRd = 0.5 * (pRd + _VP[0]);
    }

    const inv2hSigma = 1 / (2 * gt.hSigma);
    const inv2hR = 1 / (2 * gt.hR);

    return {
        call: {
            price: cP, delta: cD, gamma: cG,
            theta: cTh,
            vega: (cVu - cVd) * inv2hSigma,
            rho: (cRu - cRd) * inv2hR,
        },
        put: {
            price: pP, delta: pD, gamma: pG,
            theta: pTh,
            vega: (pVu - pVd) * inv2hSigma,
            rho: (pRu - pRd) * inv2hR,
        },
    };
}

// ---------------------------------------------------------------------------
// Vasicek bond pricing
// ---------------------------------------------------------------------------

/**
 * Vasicek closed-form zero-coupon bond price.
 *
 * P(0,T) = face · A(T) · exp(-B(T) · r)
 *
 * where B(T) = (1 - e^{-aT}) / a
 *       ln A(T) = (B(T) - T)(b - σᵣ²/(2a²)) - σᵣ²B(T)²/(4a)
 *
 * Accounts for rate mean-reversion (duration caps at 1/a) and rate
 * volatility (convexity premium via Jensen's inequality).
 *
 * @param {number} face   - Face value (typically 100)
 * @param {number} r      - Current short rate
 * @param {number} T      - Time to maturity in years
 * @param {number} a      - Mean-reversion speed of rate
 * @param {number} b      - Long-run rate level
 * @param {number} sigmaR - Rate volatility
 * @returns {number} Bond price
 */
export function vasicekBondPrice(face, r, T, a, b, sigmaR) {
    if (T <= 0) return face;
    // Degrade to flat-rate discounting when a ≈ 0
    if (a < 1e-8) return face * Math.exp(-r * T);

    sigmaR = sigmaR || 0; // guard against undefined (callers may omit)
    const B = (1 - Math.exp(-a * T)) / a;
    const sig2 = sigmaR * sigmaR;
    const lnA = (B - T) * (b - sig2 / (2 * a * a)) - sig2 * B * B / (4 * a);
    return face * Math.exp(lnA - B * r);
}

/**
 * Vasicek bond duration B(T) = (1 - e^{-aT}) / a.
 *
 * This is -dP/(P·dr), the modified duration under Vasicek dynamics.
 * Caps at 1/a for long maturities (mean-reversion effect).
 * Falls back to T when a ≈ 0 (flat-rate model).
 *
 * @param {number} T - Time to maturity in years
 * @param {number} a - Mean-reversion speed of rate
 * @returns {number} Duration
 */
export function vasicekDuration(T, a) {
    if (T <= 0) return 0;
    if (a < 1e-8) return T;
    return (1 - Math.exp(-a * T)) / a;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

