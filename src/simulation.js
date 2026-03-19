/* ===================================================
   simulation.js -- Pure math engine for Shoals.
   No DOM, no rendering. Advances one trading day
   at a time, producing OHLC bars with stochastic
   volatility, Merton jumps, and Vasicek rates.
   =================================================== */

import {
    TRADING_DAYS_PER_YEAR,
    INTRADAY_STEPS,
    INITIAL_PRICE,
    PRESETS,
    DEFAULT_PRESET,
    HISTORY_CAPACITY,
} from './config.js';
import { HistoryBuffer } from './history-buffer.js';

export class Simulation {
    constructor() {
        this.reset(DEFAULT_PRESET);
    }

    /* -----------------------------------------------
       reset(presetIndex)
       Load preset parameters and initialise state.
    ----------------------------------------------- */
    reset(presetIndex = DEFAULT_PRESET) {
        const p = PRESETS[presetIndex];

        // Model parameters (Heston + Merton jumps + Vasicek)
        this.mu     = p.mu;
        this.theta  = p.theta;   // long-run variance
        this.kappa  = p.kappa;   // mean-reversion speed (variance)
        this.xi     = p.xi;      // vol-of-vol
        this.rho    = p.rho;     // price/vol correlation
        this.lambda = p.lambda;  // Poisson jump intensity (jumps/year)
        this.muJ    = p.muJ;     // mean log-jump size
        this.sigmaJ = p.sigmaJ;  // std dev of log-jump size
        this.a      = p.a;       // mean-reversion speed (rate)
        this.b      = p.b;       // long-run rate
        this.sigmaR = p.sigmaR;  // rate vol

        // State
        this.day     = 0;
        this.S       = INITIAL_PRICE;
        this.v       = p.theta;  // start at long-run variance
        this.r       = p.b;      // start at long-run rate
        this.history = new HistoryBuffer(HISTORY_CAPACITY);
    }

    /* -----------------------------------------------
       tick()
       Advance one trading day using INTRADAY_STEPS
       sub-steps. Returns and appends the OHLC bar.
    ----------------------------------------------- */
    tick() {
        const dt = 1 / (TRADING_DAYS_PER_YEAR * INTRADAY_STEPS);

        // Jump compensator: k = E[e^J] - 1
        const k = Math.exp(this.muJ + 0.5 * this.sigmaJ * this.sigmaJ) - 1;

        let open = null, high = -Infinity, low = Infinity;

        for (let i = 0; i < INTRADAY_STEPS; i++) {
            // 1. Correlated Brownian increments
            const z1 = this._randn();
            const z2 = this.rho * z1 + Math.sqrt(1 - this.rho * this.rho) * this._randn();
            const z3 = this._randn(); // independent, for Vasicek

            // 2. Heston stochastic volatility (full truncation scheme)
            const sqrtV = Math.sqrt(Math.max(this.v, 0));
            this.v = this.v
                + this.kappa * (this.theta - this.v) * dt
                + this.xi * sqrtV * Math.sqrt(dt) * z2;
            this.v = Math.max(this.v, 0);

            // 3. Merton jumps
            const nJumps = this._poisson(this.lambda * dt);
            let jumpSum = 0;
            for (let j = 0; j < nJumps; j++) {
                jumpSum += this.muJ + this.sigmaJ * this._randn();
            }

            // 4. GBM with jumps (log-price update)
            const drift     = (this.mu - this.lambda * k) * dt;
            const diffusion = sqrtV * Math.sqrt(dt) * z1;
            this.S = this.S * Math.exp(drift + diffusion + jumpSum);

            // 5. Vasicek short rate
            this.r = this.r
                + this.a * (this.b - this.r) * dt
                + this.sigmaR * Math.sqrt(dt) * z3;

            // OHLC tracking
            if (i === 0) open = this.S;
            if (this.S > high) high = this.S;
            if (this.S < low)  low  = this.S;
        }

        const bar = {
            day:   this.day,
            open,
            high,
            low,
            close: this.S,
            v:     this.v,
            r:     this.r,
        };

        this.history.push(bar);
        this.day++;
        return bar;
    }

    /* -----------------------------------------------
       prepopulate()
       Fill the history buffer with dummy data that
       ends at INITIAL_PRICE. Runs the sim forward,
       then scales all OHLC prices so the final close
       lands exactly at the starting price.
    ----------------------------------------------- */
    prepopulate() {
        const count = HISTORY_CAPACITY;
        for (let i = 0; i < count; i++) this.tick();

        // Scale so that final close = INITIAL_PRICE
        const finalClose = this.S;
        const factor = INITIAL_PRICE / finalClose;
        this.history.scaleAll(factor);

        // Reset live state to the target starting point
        this.S = INITIAL_PRICE;
        this.v = this.theta;
        this.r = this.b;
    }

    /* -----------------------------------------------
       _randn()
       Box-Muller standard normal sample.
    ----------------------------------------------- */
    _randn() {
        // Box-Muller transform; discard second variate for simplicity
        const u1 = 1 - Math.random(); // exclude 0 to avoid log(0)
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    /* -----------------------------------------------
       _poisson(lam)
       Inverse-transform Poisson sampler.
       Suitable for small lambda*dt values.
    ----------------------------------------------- */
    _poisson(lam) {
        if (lam <= 0) return 0;
        const L = Math.exp(-lam);
        let k = 0;
        let p = 1;
        do {
            k++;
            p *= Math.random();
        } while (p > L);
        return k - 1;
    }
}
