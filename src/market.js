/* =====================================================
   market.js -- Shared market state for the Shoals
   trading simulator.

   Single-writer (main.js via syncMarket), multiple
   readers (portfolio.js, position-value.js, chain.js,
   strategy.js, ui.js). No imports — leaf module.
   ===================================================== */

export const market = {
    S: 0, v: 0, r: 0, day: 0, q: 0,
    sigma: 0,
    kappa: 0, theta: 0, xi: 0, rho: 0,
    a: 0, b: 0, sigmaR: 0,
    borrowSpread: 0,
};

/** Sync market state from simulation. Call once per substep/reset. */
export function syncMarket(sim) {
    market.S = sim.S;  market.v = sim.v;  market.r = sim.r;
    market.day = sim.day;  market.q = sim.q;
    market.sigma = Math.sqrt(Math.max(sim.v, 0));
    market.kappa = sim.kappa;  market.theta = sim.theta;
    market.xi = sim.xi;  market.rho = sim.rho;
    market.a = sim.a;  market.b = sim.b;  market.sigmaR = sim.sigmaR;
    market.borrowSpread = sim.borrowSpread;
}
