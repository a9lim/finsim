/**
 * pricing.js — American option pricing via Bjerksund-Stensland 2002
 *
 * Pure math module: no imports, no DOM dependencies.
 *
 * Exports: priceAmerican, computeGreeks
 *
 * References:
 *   Bjerksund, P. & Stensland, G. (2002). "Closed Form Valuation of American Options."
 *   Abramowitz & Stegun §26.2.17 (CND approximation).
 *   Drezner, Z. & Wesolowsky, G.O. (1990). "On the computation of the bivariate
 *     normal integral." Journal of Statistical Computation and Simulation, 35, 101-107.
 */

// ---------------------------------------------------------------------------
// Univariate standard normal
// ---------------------------------------------------------------------------

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const SQRT_2    = Math.sqrt(2);

/**
 * Standard normal PDF at x.
 */
function phi_pdf(x) {
    return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Cumulative standard normal CDF via Abramowitz & Stegun 26.2.17.
 * Accuracy: ~7 significant digits.
 */
function cnd(x) {
    if (x >= 0) {
        const k = 1.0 / (1.0 + 0.2316419 * x);
        const poly = k * (0.319381530
                   + k * (-0.356563782
                   + k * (1.781477937
                   + k * (-1.821255978
                   + k * 1.330274429))));
        return 1.0 - phi_pdf(x) * poly;
    }
    return 1.0 - cnd(-x);
}

// ---------------------------------------------------------------------------
// Bivariate normal CDF — Drezner & Wesolowsky (1990)
// ---------------------------------------------------------------------------

/**
 * Bivariate standard normal CDF: P(X <= a, Y <= b) with correlation rho.
 *
 * Uses 20-point Gauss-Legendre quadrature on the integral representation,
 * based on the Drezner & Wesolowsky (1990) approach (also appears in Haug's
 * "The Complete Guide to Option Pricing Formulas"). The 20-point rule gives
 * higher precision than the original 5-point version.
 */
/**
 * cbnd(a, b, rho) — bivariate normal CDF using the Drezner-Wesolowsky
 * approach as implemented in Haug (2007), pp. 468-469.
 *
 * Returns P(X <= a, Y <= b) where (X,Y) ~ BVN(0,0,1,1,rho).
 */
function cbnd(a, b, rho) {
    // Handle degenerate correlations
    if (Math.abs(rho) > 0.9999) {
        // Perfect positive correlation: min of marginals
        if (rho > 0) return cnd(Math.min(a, b));
        // Perfect negative correlation
        return Math.max(0, cnd(a) + cnd(b) - 1);
    }

    // Use the standard A&S / Drezner formula via transformation
    // If both limits are large positive, return 1
    if (a > 6 && b > 6) return 1;
    if (a < -6 || b < -6) return 0;

    // Sign handling per Haug 2007 implementation
    if (a <= 0 && b <= 0 && rho <= 0) {
        // Direct quadrature region
        return _cbndCore(a, b, rho);
    }

    if (a <= 0 && b >= 0 && rho >= 0) {
        return cnd(a) - _cbndCore(a, -b, -rho);
    }

    if (a >= 0 && b <= 0 && rho >= 0) {
        return cnd(b) - _cbndCore(-a, b, -rho);
    }

    if (a >= 0 && b >= 0 && rho <= 0) {
        return cnd(a) + cnd(b) - 1 + _cbndCore(-a, -b, rho);
    }

    // General case: decompose using sign of rho
    const rhoA = (rho * a - b) / Math.sqrt(Math.max(a * a - 2 * rho * a * b + b * b, 1e-15));
    const rhoB = (rho * b - a) / Math.sqrt(Math.max(a * a - 2 * rho * a * b + b * b, 1e-15));
    const delta = (1 - Math.sign(a) * Math.sign(b)) / 4;

    return _cbndCore(a, 0, rhoA) + _cbndCore(b, 0, rhoB) - delta;
}

/**
 * Core quadrature for cbnd when a <= 0, b <= 0, rho <= 0.
 * Uses 20-point Gauss-Legendre on [0, rho] for higher precision.
 */
function _cbndCore(a, b, rho) {
    const X = [
        -0.9931285991850949, -0.9639719272779138,
        -0.9122344282513259, -0.8391169718222188,
        -0.7463319064601508, -0.6360536807265150,
        -0.5108670019508271, -0.3737060887154195,
        -0.2277858511416451, -0.0765265211334973,
         0.0765265211334973,  0.2277858511416451,
         0.3737060887154195,  0.5108670019508271,
         0.6360536807265150,  0.7463319064601508,
         0.8391169718222188,  0.9122344282513259,
         0.9639719272779138,  0.9931285991850949,
    ];
    const W = [
        0.0176140071391521, 0.0406014298003869,
        0.0626720483341091, 0.0832767415767048,
        0.1019301198172404, 0.1181945319615184,
        0.1316886384491766, 0.1420961093183820,
        0.1491729864726037, 0.1527533871307258,
        0.1527533871307258, 0.1491729864726037,
        0.1420961093183820, 0.1316886384491766,
        0.1181945319615184, 0.1019301198172404,
        0.0832767415767048, 0.0626720483341091,
        0.0406014298003869, 0.0176140071391521,
    ];

    const aS = a * a;
    const bS = b * b;
    const limit = rho;
    let sum = 0;

    for (let i = 0; i < 20; i++) {
        const r = limit * (1 + X[i]) / 2;
        const r2 = r * r;
        const denom = Math.sqrt(Math.max(1 - r2, 1e-15));
        const exponent = (2 * r * a * b - aS - bS) / (2 * (1 - r2));
        sum += W[i] * Math.exp(exponent) / denom;
    }
    return Math.max(0, (limit / 2) * sum / (2 * Math.PI) + cnd(a) * cnd(b));
}

// ---------------------------------------------------------------------------
// Black-Scholes European call
// ---------------------------------------------------------------------------

/**
 * European call price via Black-Scholes-Merton.
 * @param {number} S     - Spot price
 * @param {number} K     - Strike
 * @param {number} T     - Time to expiry in years
 * @param {number} r     - Risk-free rate (continuously compounded)
 * @param {number} q     - Dividend yield (continuously compounded)
 * @param {number} sigma - Volatility (annualised)
 */
function bsCall(S, K, T, r, q, sigma) {
    if (T <= 0) return Math.max(S - K, 0);
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    return S * Math.exp(-q * T) * cnd(d1) - K * Math.exp(-r * T) * cnd(d2);
}

// ---------------------------------------------------------------------------
// BS2002 helper: phi function (single-barrier expectation)
// ---------------------------------------------------------------------------

/**
 * phi(S, T, gamma, H, I, r, b, sigma)
 *
 * Used internally by bs2002Call. Computes a generalised expectation
 * involving the log-normal distribution and a single barrier.
 *
 * From BS2002 eq. (A.2):
 *   lambda = (-r + gamma*b + 0.5*gamma*(gamma-1)*sigma^2) * T
 *   d      = -(log(S/H) + (b + (gamma-0.5)*sigma^2)*T) / (sigma*sqrt(T))
 *   kappa  = 2*b/sigma^2 + (2*gamma - 1)
 *   phi    = exp(lambda) * S^gamma
 *            * [N(d) - (I/S)^kappa * N(d - 2*ln(I/S)/(sigma*sqrt(T)))]
 */
function _phi(S, T, gamma, H, I, r, b, sigma) {
    if (T <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const v2    = sigma * sigma;
    const lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1) * v2) * T;
    const d      = -(Math.log(S / H) + (b + (gamma - 0.5) * v2) * T) / (sigma * sqrtT);
    const kappa  = 2 * b / v2 + (2 * gamma - 1);
    const lnIS   = Math.log(I / S);
    const term2  = Math.pow(I / S, kappa) * cnd(d - 2 * lnIS / (sigma * sqrtT));
    return Math.exp(lambda) * Math.pow(S, gamma) * (cnd(d) - term2);
}

// ---------------------------------------------------------------------------
// BS2002 helper: psi function (bivariate barrier expectation)
// ---------------------------------------------------------------------------

/**
 * psi(S, T, gamma, H, I2, I1, t1, r, b, sigma)
 *
 * From BS2002 eq. (A.3). Involves the bivariate normal CDF.
 *
 * Let:
 *   rho = sqrt(t1/T)  (correlation between W(t1) and W(T))
 *
 *   d1 = -(log(S/I1)  + (b + (gamma-0.5)*v2)*t1) / (sigma*sqrt(t1))
 *   d2 = -(log(I2^2/(S*I1)) + (b + (gamma-0.5)*v2)*t1) / (sigma*sqrt(t1))
 *   d3 = -(log(S/I1)  + (b + (gamma-0.5)*v2)*T)  / (sigma*sqrt(T))
 *   d4 = -(log(I2^2/(S*I1)) + (b + (gamma-0.5)*v2)*T)  / (sigma*sqrt(T))
 *
 *   lambda = (-r + gamma*b + 0.5*gamma*(gamma-1)*v2) * T
 *   kappa  = 2*b/v2 + (2*gamma - 1)
 *
 *   psi = exp(lambda) * S^gamma * [
 *     N2(-d3, -d1,  rho)
 *     - (I2/S)^kappa * N2(-d4, -d2, rho)
 *     - (I1/S)^kappa * N2(-d3 + 2*ln(I1/S)/(sigma*sqrt(T)),
 *                         -d1 + 2*ln(I1/S)/(sigma*sqrt(t1)), rho)
 *     + (I1/I2)^kappa * N2(-d4 + 2*ln(I1/S)/(sigma*sqrt(T)),    ← note: BS2002 uses I1/S here
 *                          -d2 + 2*ln(I1/S)/(sigma*sqrt(t1)), rho)
 *   ]
 *
 * Note: "H" in the psi signature is the lower barrier value used in the
 * d1/d2 terms. In the bs2002Call usage, H = I1 for the first two psi
 * terms and H = K for the last two.
 */
function _psi(S, T, gamma, H, I2, I1, t1, r, b, sigma) {
    if (T <= 0 || t1 <= 0) return 0;

    const v2     = sigma * sigma;
    const sqrtT  = Math.sqrt(T);
    const sqrtt1 = Math.sqrt(t1);
    const rho    = Math.sqrt(t1 / T);  // Brownian motion correlation

    const lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1) * v2) * T;
    const kappa  = 2 * b / v2 + (2 * gamma - 1);

    // d1, d2 are evaluated at t1 using barrier H and I1 respectively
    const d1 = -(Math.log(S / H)  + (b + (gamma - 0.5) * v2) * t1) / (sigma * sqrtt1);
    const d2 = -(Math.log(I2 * I2 / (S * H)) + (b + (gamma - 0.5) * v2) * t1) / (sigma * sqrtt1);
    // d3, d4 evaluated at T
    const d3 = -(Math.log(S / H)  + (b + (gamma - 0.5) * v2) * T)  / (sigma * sqrtT);
    const d4 = -(Math.log(I2 * I2 / (S * H)) + (b + (gamma - 0.5) * v2) * T)  / (sigma * sqrtT);

    const lnI1S  = Math.log(I1 / S);
    const lnI1I2 = Math.log(I1 / I2);  // = ln(I1) - ln(I2) per BS2002 sign convention

    // Bivariate CDF terms — arguments are negated because we want the lower tail
    const n2_1 = cbnd(-d3, -d1,  rho);
    const n2_2 = cbnd(-d4, -d2,  rho);
    const n2_3 = cbnd(-d3 + 2 * lnI1S / (sigma * sqrtT),
                       -d1 + 2 * lnI1S / (sigma * sqrtt1),
                       rho);
    const n2_4 = cbnd(-d4 + 2 * lnI1S / (sigma * sqrtT),
                       -d2 + 2 * lnI1S / (sigma * sqrtt1),
                       rho);

    const term1 =  n2_1;
    const term2 = -Math.pow(I2 / S, kappa) * n2_2;
    const term3 = -Math.pow(I1 / S, kappa) * n2_3;
    // BS2002 eq. A.3, term 4: coefficient is (I1/I2)^kappa.
    // Derivation: (I1/S)^kappa * (I2/S)^{-kappa} = (I1/I2)^kappa. Matches Haug (2007) p. 89.
    const term4 =  Math.pow(I1 / I2, kappa) * n2_4;

    return Math.exp(lambda) * Math.pow(S, gamma) * (term1 + term2 + term3 + term4);
}

// ---------------------------------------------------------------------------
// Bjerksund-Stensland 2002 American Call
// ---------------------------------------------------------------------------

/**
 * American call price via Bjerksund-Stensland (2002) analytical approximation.
 *
 * @param {number} S     - Spot price
 * @param {number} K     - Strike
 * @param {number} T     - Time to expiry in years
 * @param {number} r     - Risk-free rate (continuously compounded)
 * @param {number} q     - Dividend yield (continuously compounded)
 * @param {number} sigma - Volatility (annualised)
 */
function bs2002Call(S, K, T, r, q, sigma) {
    // Guard: zero / negative time
    if (T <= 0) return Math.max(S - K, 0);

    // Guard: degenerate inputs
    if (sigma <= 0 || S <= 0 || K <= 0) return Math.max(S - K, 0);

    const intrinsic = Math.max(S - K, 0);
    const b = r - q;  // cost of carry

    // If no dividends (b >= r), early exercise never optimal → European price
    // (Still floor at intrinsic in case of numerical edge cases.)
    if (b >= r) return Math.max(bsCall(S, K, T, r, q, sigma), intrinsic);

    const v2 = sigma * sigma;

    // Use a small floor on r to avoid beta=0 when r→0.
    // When r is exactly 0 (e.g. for the put-call symmetry transform with q=0),
    // beta = b/v2 - 0.5 + sqrt((b/v2 - 0.5)^2) = 0, which breaks the algorithm.
    // A floor of 1e-7 has negligible pricing impact (< $0.001 on typical option).
    const rEff = Math.max(r, 1e-7);

    // Perpetual exercise boundary parameters
    const betaInner = (b / v2 - 0.5);
    const beta = betaInner + Math.sqrt(Math.max(betaInner * betaInner + 2 * rEff / v2, 0));

    if (beta <= 1) {
        // Degenerate beta — fall back to European, floor at intrinsic
        return Math.max(bsCall(S, K, T, rEff, q, sigma), intrinsic);
    }

    const BInfinity = beta / (beta - 1) * K;
    // B0: lower bound on exercise boundary (at T=0 it equals max(K, rEff/(rEff-b)*K))
    const B0 = (rEff - b > 0) ? Math.max(K, rEff / (rEff - b) * K) : K;

    // Guard: BInfinity must be > B0 for the formula to be valid
    if (BInfinity <= B0 + 1e-10) return Math.max(bsCall(S, K, T, rEff, q, sigma), intrinsic);

    // Golden-ratio time split
    const t1 = 0.5 * (Math.sqrt(5) - 1) * T;

    // Exercise boundary at t1
    const ht1 = -(b * t1 + 2 * sigma * Math.sqrt(t1)) * B0 / (BInfinity - B0);
    const I1  = B0 + (BInfinity - B0) * (1 - Math.exp(ht1));

    // Exercise boundary at T
    const ht2 = -(b * T + 2 * sigma * Math.sqrt(T)) * B0 / (BInfinity - B0);
    const I2  = B0 + (BInfinity - B0) * (1 - Math.exp(ht2));

    // Deep in-the-money: immediate exercise
    if (S >= I2) return S - K;

    // Alpha coefficients (early exercise premium scale factors)
    const alpha1 = (I1 - K) * Math.pow(I1, -beta);
    const alpha2 = (I2 - K) * Math.pow(I2, -beta);

    // Full BS2002 price formula (eq. 10 in the paper)
    // Uses rEff throughout to match beta/B0/BInfinity computation
    const price =
        alpha2 * Math.pow(S, beta)
        - alpha2 * _phi(S, t1, beta, I2, I2, rEff, b, sigma)
        + _phi(S, t1, 1,    I2, I2, rEff, b, sigma)
        - _phi(S, t1, 1,    I1, I2, rEff, b, sigma)
        - K    * _phi(S, t1, 0,    I2, I2, rEff, b, sigma)
        + K    * _phi(S, t1, 0,    I1, I2, rEff, b, sigma)
        + alpha1 * _phi(S, t1, beta, I1, I2, rEff, b, sigma)
        - alpha1 * _psi(S, T, beta, I1, I2, I1, t1, rEff, b, sigma)
        + _psi(S, T, 1,    I1, I2, I1, t1, rEff, b, sigma)
        - _psi(S, T, 1,    K,  I2, I1, t1, rEff, b, sigma)
        - K    * _psi(S, T, 0,    I1, I2, I1, t1, rEff, b, sigma)
        + K    * _psi(S, T, 0,    K,  I2, I1, t1, rEff, b, sigma);

    // Floor at intrinsic value
    return Math.max(price, S - K);
}

// ---------------------------------------------------------------------------
// American option pricing (call + put via put-call symmetry)
// ---------------------------------------------------------------------------

/**
 * Price an American option.
 *
 * Put-call symmetry for American options (Bjerksund & Stensland 1993):
 *   P_am(S, K, T, r, q, σ) = C_am(K, S, T, q, r, σ)
 *
 * With q = 0 for puts (the simulator carries no dividend on the underlying
 * in the put direction), this simplifies to:
 *   P_am(S, K, T, r, 0, σ) = C_am(K, S, T, 0, r, σ)
 *
 * @param {number}  S      - Spot price
 * @param {number}  K      - Strike
 * @param {number}  T      - Time to expiry in years
 * @param {number}  r      - Risk-free rate
 * @param {number}  sigma  - Volatility
 * @param {boolean} isPut  - true = put, false = call
 */
function priceAmerican(S, K, T, r, sigma, isPut) {
    if (isPut) {
        // Put-call symmetry (McDonald & Schroder 1998, Bjerksund & Stensland 1993):
        //   P_am(S, K, T, r, q, σ) = C_am(K, S, T, q, r, σ)
        // With q=0 (no dividend on underlying in put direction):
        //   P_am(S, K, T, r, 0, σ) = C_am(K, S, T, q_new=0, r_new=r, σ)
        // The "transformed call" has: r_new=q_original=0, q_new=r_original=r
        // so we call bs2002Call(K, S, T, r_new=0, q_new=r, sigma).
        return bs2002Call(K, S, T, 0, r, sigma);
    }
    return bs2002Call(S, K, T, r, 0, sigma);
}

// ---------------------------------------------------------------------------
// Greeks via central finite differences
// ---------------------------------------------------------------------------

/**
 * Compute option Greeks via finite differences.
 *
 * All bump sizes chosen to balance truncation vs. floating-point errors:
 *   h_S     = 1% of spot (central difference for delta, gamma)
 *   h_T     = 1 trading day = 1/252 years (forward difference for theta)
 *   h_sigma = 0.1 vol point (central difference for vega)
 *   h_r     = 1 basis point (central difference for rho)
 *
 * @returns {{ price, delta, gamma, theta, vega, rho }}
 */
export function computeGreeks(S, K, T, r, sigma, isPut) {
    const h_S     = S * 0.01;
    const h_T     = 1 / 252;
    const h_sigma = 0.001;
    const h_r     = 0.0001;

    const price = priceAmerican(S, K, T, r, sigma, isPut);
    const pUp   = priceAmerican(S + h_S, K, T, r, sigma, isPut);
    const pDn   = priceAmerican(S - h_S, K, T, r, sigma, isPut);

    return {
        price,
        delta: (pUp - pDn) / (2 * h_S),
        gamma: (pUp - 2 * price + pDn) / (h_S * h_S),
        theta: (priceAmerican(S, K, Math.max(T - h_T, 1e-10), r, sigma, isPut) - price) / h_T,
        vega:  (priceAmerican(S, K, T, r, sigma + h_sigma, isPut)
              - priceAmerican(S, K, T, r, sigma - h_sigma, isPut)) / (2 * h_sigma),
        rho:   (priceAmerican(S, K, T, r + h_r, sigma, isPut)
              - priceAmerican(S, K, T, r - h_r, sigma, isPut)) / (2 * h_r),
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { priceAmerican };
