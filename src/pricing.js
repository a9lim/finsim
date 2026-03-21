/**
 * pricing.js — American option pricing via CRR binomial tree
 *
 * Pure math module: no DOM dependencies.
 *
 * Exports: priceAmerican, computeGreeks
 *
 * References:
 *   Cox, J.C., Ross, S.A. & Rubinstein, M. (1979). "Option pricing:
 *     A simplified approach." Journal of Financial Economics, 7, 229-263.
 */

import { BINOMIAL_STEPS, TRADING_DAYS_PER_YEAR, QUARTERLY_CYCLE } from './config.js';

// ---------------------------------------------------------------------------
// CRR Binomial Tree — American option pricing
// ---------------------------------------------------------------------------

/**
 * Price an American option via Cox-Ross-Rubinstein binomial tree.
 *
 * When currentDay is provided and q > 0, dividends are modelled as discrete
 * proportional drops of q/4 at each QUARTERLY_CYCLE boundary within [now, expiry].
 * The tree drift uses r (not r-q) and stock prices are adjusted multiplicatively
 * at dividend steps, preserving recombination.
 *
 * When currentDay is omitted, falls back to continuous dividend yield in the
 * risk-neutral drift (r-q), matching the classical CRR formulation.
 *
 * @param {number}  S          - Spot price
 * @param {number}  K          - Strike
 * @param {number}  T          - Time to expiry in years
 * @param {number}  r          - Risk-free rate (continuously compounded)
 * @param {number}  sigma      - Volatility (annualised)
 * @param {boolean} isPut      - true = put, false = call
 * @param {number}  [q=0]      - Continuous dividend yield
 * @param {number}  [currentDay] - Current simulation day (enables discrete dividends)
 * @returns {number} Option price
 */
function priceAmerican(S, K, T, r, sigma, isPut, q, currentDay) {
    q = q || 0;
    if (T <= 0) return isPut ? Math.max(K - S, 0) : Math.max(S - K, 0);
    if (sigma <= 0 || S <= 0 || K <= 0) return isPut ? Math.max(K - S, 0) : Math.max(S - K, 0);

    const n = BINOMIAL_STEPS;
    const dt = T / n;
    const u = Math.exp(sigma * Math.sqrt(dt));
    const d = 1 / u;
    const disc = Math.exp(-r * dt);

    // --- Discrete dividend schedule ---
    // Dividends fire every QUARTERLY_CYCLE trading days as proportional drops
    // of q/4 of the stock price.
    const divYield = q / 4;
    let useDiscrete = q > 0 && currentDay != null;
    let divStepCount = 0;
    // divCum[i] = number of dividends at or before step i
    const divCum = new Uint8Array(n + 1);

    if (useDiscrete) {
        const dteDays = Math.round(T * TRADING_DAYS_PER_YEAR);
        let count = 0;
        let nextDivDay = (Math.floor(currentDay / QUARTERLY_CYCLE) + 1) * QUARTERLY_CYCLE;
        for (; nextDivDay <= currentDay + dteDays; nextDivDay += QUARTERLY_CYCLE) {
            const dayOffset = nextDivDay - currentDay;
            const step = Math.min(Math.round(dayOffset / dteDays * n), n);
            if (step >= 1) {
                // Mark this step (may revisit same step — count accumulates)
                count++;
                for (let s = step; s <= n; s++) divCum[s] = count;
            }
        }
        divStepCount = count;
        if (count === 0) useDiscrete = false;
    }

    // Risk-neutral probability: drift = r when discrete, r-q when continuous
    const drift = useDiscrete ? r : (r - q);
    const p = (Math.exp(drift * dt) - d) / (u - d);

    // Terminal payoffs
    const V = new Float64Array(n + 1);
    const adjN = useDiscrete ? Math.pow(1 - divYield, divCum[n]) : 1;
    for (let j = 0; j <= n; j++) {
        const ST = S * adjN * Math.pow(u, n - 2 * j);
        V[j] = isPut ? Math.max(K - ST, 0) : Math.max(ST - K, 0);
    }

    // Backward induction with early exercise
    for (let i = n - 1; i >= 0; i--) {
        const adj = useDiscrete ? Math.pow(1 - divYield, divCum[i]) : 1;
        for (let j = 0; j <= i; j++) {
            const hold = disc * (p * V[j] + (1 - p) * V[j + 1]);
            const Si = S * adj * Math.pow(u, i - 2 * j);
            const exercise = isPut ? Math.max(K - Si, 0) : Math.max(Si - K, 0);
            V[j] = Math.max(hold, exercise);
        }
    }

    return V[0];
}

// ---------------------------------------------------------------------------
// Greeks via central finite differences
// ---------------------------------------------------------------------------

/**
 * Compute option Greeks via finite differences.
 *
 * 9 pricing calls per invocation. Bump sizes balance truncation vs.
 * floating-point error:
 *   h_S     = 1% of spot
 *   h_T     = 1 trading day
 *   h_sigma = 0.1 vol point
 *   h_r     = 1 basis point
 *
 * @returns {{ price, delta, gamma, theta, vega, rho }}
 */
export function computeGreeks(S, K, T, r, sigma, isPut, q, currentDay) {
    const h_S     = S * 0.01;
    const h_T     = 1 / TRADING_DAYS_PER_YEAR;
    const h_sigma = 0.001;
    const h_r     = 0.0001;

    const price = priceAmerican(S, K, T, r, sigma, isPut, q, currentDay);
    const pUp   = priceAmerican(S + h_S, K, T, r, sigma, isPut, q, currentDay);
    const pDn   = priceAmerican(S - h_S, K, T, r, sigma, isPut, q, currentDay);

    return {
        price,
        delta: (pUp - pDn) / (2 * h_S),
        gamma: (pUp - 2 * price + pDn) / (h_S * h_S),
        theta: (() => {
            const T_lo = Math.max(T - h_T, 1e-10);
            const T_hi = T + h_T;
            return (priceAmerican(S, K, T_lo, r, sigma, isPut, q, currentDay)
                  - priceAmerican(S, K, T_hi, r, sigma, isPut, q, currentDay)) / (T_hi - T_lo);
        })(),
        vega:  (priceAmerican(S, K, T, r, sigma + h_sigma, isPut, q, currentDay)
              - priceAmerican(S, K, T, r, sigma - h_sigma, isPut, q, currentDay)) / (2 * h_sigma),
        rho:   (priceAmerican(S, K, T, r + h_r, sigma, isPut, q, currentDay)
              - priceAmerican(S, K, T, r - h_r, sigma, isPut, q, currentDay)) / (2 * h_r),
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { priceAmerican };
