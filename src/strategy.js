/**
 * strategy.js — Strategy View renderer for Shoals trading simulator.
 *
 * Renders a payoff/P&L diagram and optional Greek overlays on a dedicated
 * canvas. Does NOT use shared-camera.js; manages its own X-range with
 * scroll-wheel zoom centered on the current spot price.
 *
 * Exports: StrategyRenderer
 */

import { allocTree, prepareTree, priceWithTree, prepareGreekTrees, computeGreeksWithTrees, computeEffectiveSigma, computeSkewSigma } from './pricing.js';
import { unitPrice } from './position-value.js';
import {
    TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE,
    STRATEGY_SAMPLES, STRATEGY_Y_PAD, STRATEGY_MARGIN,
} from './config.js';
import { market } from './market.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_COUNT   = STRATEGY_SAMPLES;
const Y_PADDING_PCT  = STRATEGY_Y_PAD;
const MARGIN         = STRATEGY_MARGIN;

// Greek display metadata: key → { label }
const GREEK_META = {
    delta: { label: 'Delta' },
    gamma: { label: 'Gamma' },
    theta: { label: 'Theta' },
    vega:  { label: 'Vega' },
    rho:   { label: 'Rho' },
};

function _colors() {
    const ext = _PALETTE.extended;
    return {
        up:     ext.green,
        down:   ext.rose,
        accent: _PALETTE.accent,
        delta:  ext.blue,
        gamma:  ext.orange,
        theta:  ext.cyan,
        vega:   ext.purple,
        rho:    ext.slate,
    };
}

function _themeTextColors() {
    const pal = document.documentElement.dataset.theme === 'dark' ? _PALETTE.dark : _PALETTE.light;
    return { text: pal.text, textSecondary: pal.textSecondary, textMuted: pal.textMuted };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Format a dollar value concisely (e.g. "$12.34", "-$5.00").
 */
function _fmt$(v) {
    const abs = Math.abs(v);
    const str = abs >= 1000
        ? abs.toFixed(0)
        : abs >= 100
        ? abs.toFixed(1)
        : abs.toFixed(2);
    return (v < 0 ? '-$' : '$') + str;
}

/**
 * Find zero-crossings in a y-array paired with an x-array.
 * Returns interpolated X values where sign changes occur.
 * Skips if all values are effectively zero (within epsilon).
 */
function _zeroCrossings(xs, ys) {
    // Check if all values are effectively zero
    const eps = 0.001;
    let allZero = true;
    for (let i = 0; i < ys.length; i++) {
        if (Math.abs(ys[i]) > eps) { allZero = false; break; }
    }
    if (allZero) return [];

    // Only count crossings where at least one side exceeds eps
    // (filters noise from near-zero P&L regions)
    const raw = [];
    for (let i = 0; i < ys.length - 1; i++) {
        if (Math.sign(ys[i]) !== Math.sign(ys[i + 1]) && ys[i + 1] !== 0) {
            if (Math.abs(ys[i]) > eps || Math.abs(ys[i + 1]) > eps) {
                const t = ys[i] / (ys[i] - ys[i + 1]);
                raw.push(xs[i] + t * (xs[i + 1] - xs[i]));
            }
        }
    }

    // Deduplicate crossings within $0.50 of each other
    const result = [];
    for (const x of raw) {
        if (result.length === 0 || x - result[result.length - 1] > 0.50) {
            result.push(x);
        }
    }
    return result;
}

/**
 * Convert days-to-expiry to years (using TRADING_DAYS_PER_YEAR).
 * Returns a small positive floor so T > 0 is always satisfied.
 */
function _dteToT(dte) {
    return Math.max(dte / TRADING_DAYS_PER_YEAR, 1e-10);
}

/**
 * Per-leg time-to-expiry in years. Legs without expiryDay use the fallback.
 */
function _legDte(leg, evalDay, fallbackDte) {
    if (leg.expiryDay != null) return Math.max(leg.expiryDay - evalDay, 0);
    return fallbackDte;
}

/**
 * Precompute per-leg constants that don't vary across sample prices.
 * Entry values (priceWithTree at entryS) are computed once instead of
 * 200× per leg in the sample loop. Prepared trees are stored per-leg
 * so the sample loop avoids redundant tree preparation when legs have
 * different T values (which defeats the transparent parameter cache).
 */
function _precomputeLegs(legs, entryS, vol, rate, evalDay, entryDay, fallbackDte, q) {
    return legs.map(leg => {
        const sign = (typeof leg.qty === 'number' && leg.qty < 0) ? -1
                   : (leg.side === 'short') ? -1 : 1;
        const qty  = Math.abs(leg.qty ?? 1);
        const mult = qty * sign;
        const curDte   = _legDte(leg, evalDay, fallbackDte);
        const entryDte = (leg.expiryDay != null && entryDay != null)
            ? Math.max(leg.expiryDay - entryDay, 0) : fallbackDte;
        const T      = _dteToT(curDte);
        const entryT = _dteToT(entryDte);

        const info = { type: leg.type, mult, T, rate, vol };

        // Entry value via unitPrice (includes vol surface + price impact)
        const K = leg.strike ?? entryS;
        const entryExpiryDay = entryDay != null ? entryDay + Math.round(entryT * TRADING_DAYS_PER_YEAR) : null;
        info.entryVal = unitPrice(leg.type, entryS, vol, rate, entryDay ?? 0, K, entryExpiryDay, q);

        switch (leg.type) {
            case 'call':
            case 'put': {
                const isPut = leg.type === 'put';
                // Term-structure vol + moneyness skew for evaluation tree
                const sigmaEff = computeEffectiveSigma(market.v, T, market.kappa, market.theta, market.xi);
                const sigma = computeSkewSigma(sigmaEff, entryS, K, T, market.rho, market.xi, market.kappa);
                info.K = K;
                info.isPut = isPut;
                info.vol = sigma;
                info.q = q;
                info.evalDay = evalDay;
                info.tree = prepareTree(T, rate, sigma, q, evalDay);
                info.greekTrees = null;
                break;
            }
            case 'stock':
                info.entryS = info.entryVal; // unitPrice includes temporary impact
                break;
            case 'bond':
                info.bondCurVal = unitPrice('bond', entryS, vol, rate, evalDay ?? 0, null,
                    entryDay != null ? entryDay + Math.round(T * TRADING_DAYS_PER_YEAR) : null, q);
                break;
        }
        return info;
    });
}

/** P&L for a precomputed leg at hypothetical price S. Uses pre-prepared tree. */
function _legPnlFast(info, S) {
    switch (info.type) {
        case 'call':
        case 'put':
            return (priceWithTree(S, info.K, info.isPut, info.tree) - info.entryVal) * info.mult;
        case 'stock':
            return (S - info.entryS) * info.mult;
        case 'bond':
            return (info.bondCurVal - info.entryVal) * info.mult;
        default:
            return 0;
    }
}

/** Greeks for a precomputed leg at hypothetical price S. Uses pre-prepared Greek trees. */
function _legGreeksFast(info, S) {
    switch (info.type) {
        case 'call':
        case 'put': {
            if (!info.greekTrees) {
                info.greekTrees = prepareGreekTrees(info.T, info.rate, info.vol, info.q, info.evalDay);
            }
            const g = computeGreeksWithTrees(S, info.K, info.isPut, info.greekTrees);
            return {
                delta: g.delta * info.mult, gamma: g.gamma * info.mult,
                theta: g.theta * info.mult, vega:  g.vega  * info.mult,
                rho:   g.rho   * info.mult,
            };
        }
        case 'stock':
            return { delta: info.mult, gamma: 0, theta: 0, vega: 0, rho: 0 };
        case 'bond': {
            // Vasicek duration B(T) = (1-e^{-aT})/a caps at 1/a; falls back to T when a≈0
            const B = vasicekDuration(info.T, market.a);
            const bRho = -B * info.bondCurVal * info.mult;
            // Theta: bond accrual per trading day. For Vasicek:
            // dP/dT = P * [e^{-aT}(b - σ²/(2a²)) + σ²B/(2a) - e^{-aT}·r]
            // We negate because theta = -dP/dT (value gained as T shrinks)
            const a = market.a;
            let bTheta;
            if (a >= 1e-8) {
                const expAT = Math.exp(-a * info.T);
                const sig2 = market.sigmaR * market.sigmaR;
                const dLnP = expAT * (market.b - sig2 / (2 * a * a)) + sig2 * B / (2 * a) - expAT * info.rate;
                bTheta = -info.bondCurVal * dLnP / TRADING_DAYS_PER_YEAR * info.mult;
            } else {
                bTheta = info.rate * info.bondCurVal / TRADING_DAYS_PER_YEAR * info.mult;
            }
            return { delta: 0, gamma: 0, theta: bTheta, vega: 0, rho: bRho };
        }
        default:
            return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
}

/**
 * Build a cache key string from draw/summary inputs.
 * Cheap string comparison avoids re-pricing when nothing changed.
 */
function _modelKey() {
    return (market.v * 1e6 | 0) + ',' + (market.kappa * 1e4 | 0) + ','
        + (market.theta * 1e6 | 0) + ',' + (market.rho * 1e4 | 0) + ',' + (market.xi * 1e4 | 0)
        + ',' + (market.a * 1e4 | 0) + ',' + (market.b * 1e6 | 0);
}

function _cacheKey(legs, vol, rate, evalDay, entryDay, dte, extra) {
    let k = '';
    if (legs) {
        for (const l of legs) k += l.type + l.qty + (l.strike ?? '') + (l.expiryDay ?? '') + '|';
    }
    // Round floats to avoid spurious misses from floating-point noise
    k += (vol * 1e6 | 0) + ',' + (rate * 1e6 | 0) + ',' + evalDay + ',' + entryDay + ',' + dte;
    if (extra) k += ',' + extra;
    return k;
}

// ---------------------------------------------------------------------------
// StrategyRenderer
// ---------------------------------------------------------------------------

export class StrategyRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx    = canvas.getContext('2d');
        this._dirty  = false;

        // X-range zoom state (set per draw via resetRange or wheel)
        this._xCenter = 100;
        this._xRange  = 30;    // half-width
        this._xRangeMin = 5;   // will be recomputed per spot
        this._xRangeMax = 100; // will be recomputed per spot

        // Computation cache — avoids re-pricing when inputs haven't changed
        this._cache = null;    // { key, xs, pnls, greekData, breakevens }
        this._summaryCache = null; // { key, result }

        // Theme color cache — invalidated when data-theme changes
        this._cachedTheme = null;
        this._cachedColors = null;
        this._cachedThemeColors = null;

        // Legend hit areas (populated during draw)
        this._legendItems = [];

        this.resize();
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Update canvas dimensions accounting for device pixel ratio. */
    resize() {
        const r = resizeCanvasDPR(this._canvas, this._ctx);
        this._dpr  = r.dpr;
        this._cssW = r.width;
        this._cssH = r.height;
    }

    /**
     * Reset X center and range based on current spot and legs.
     * Called when spot changes or legs change.
     */
    resetRange(spot, legs) {
        this._xCenter   = spot;
        this._xRange    = spot * 0.3;
        this._xRangeMin = spot * 0.05;
        this._xRangeMax = spot * 1.0;

        // Extend range to cover all strikes with padding
        if (legs) {
            for (const leg of legs) {
                if (leg.strike != null) {
                    const dist = Math.abs(leg.strike - spot) * 1.1;
                    if (dist > this._xRange) this._xRange = Math.min(dist, this._xRangeMax);
                }
            }
        }
    }

    /**
     * Bind mouse wheel zoom on X axis.
     * @param {HTMLElement} el
     */
    bindWheel(el) {
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
            this._xRange = Math.max(this._xRangeMin, Math.min(this._xRangeMax, this._xRange * factor));
            this._dirty = true;
        }, { passive: false });
    }

    bindPan(el) {
        let panning = false, lastX = 0, startX = 0, dragged = false;
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            panning = true; dragged = false;
            lastX = startX = e.clientX;
            el.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!panning) return;
            const dx = e.clientX - lastX;
            if (Math.abs(e.clientX - startX) > 3) dragged = true;
            // Convert pixel delta to world units: pixels / (plotW / (2 * xRange))
            const plotW = this._cssW - MARGIN.left - MARGIN.right;
            if (plotW > 0) this._xCenter -= dx * (2 * this._xRange) / plotW;
            lastX = e.clientX;
            this._dirty = true;
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button !== 0 || !panning) return;
            panning = false;
            el.style.cursor = '';
        });
        // Expose drag state for click handler
        this._wasDrag = () => dragged;

        // Touch pan (single finger)
        let touchPanning = false, touchLastX = 0;
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            touchPanning = true;
            touchLastX = e.touches[0].clientX;
        }, { passive: true });
        el.addEventListener('touchmove', (e) => {
            if (!touchPanning || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - touchLastX;
            const plotW = this._cssW - MARGIN.left - MARGIN.right;
            if (plotW > 0) this._xCenter -= dx * (2 * this._xRange) / plotW;
            touchLastX = e.touches[0].clientX;
            this._dirty = true;
            e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchend', () => { touchPanning = false; }, { passive: true });
        el.addEventListener('touchcancel', () => { touchPanning = false; }, { passive: true });
    }

    /**
     * Handle a click on the canvas. Checks legend item bounding boxes
     * and toggles the corresponding Greek in greekToggles if hit.
     *
     * @param {number} cssX - Click X in CSS pixels relative to canvas
     * @param {number} cssY - Click Y in CSS pixels relative to canvas
     * @param {Object} greekToggles - Mutable { delta, gamma, theta, vega, rho } booleans
     * @returns {boolean} true if a legend item was toggled
     */
    handleClick(cssX, cssY, greekToggles) {
        for (const item of this._legendItems) {
            if (cssX >= item.x && cssX <= item.x + item.w &&
                cssY >= item.y && cssY <= item.y + item.h) {
                if (item.key && greekToggles.hasOwnProperty(item.key)) {
                    greekToggles[item.key] = !greekToggles[item.key];
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Main render entry point.
     *
     * @param {Array<{type:string, side:string, qty:number, strike?:number, expiryDay?:number}>} legs
     * @param {number}  spot         - Current stock price
     * @param {number}  vol          - Current volatility (sqrt(v), annualised)
     * @param {number}  rate         - Risk-free rate (continuously compounded)
     * @param {number}  dte          - Days to expiry for display (slider value)
     * @param {Object}  greekToggles - { delta, gamma, theta, vega, rho } booleans
     * @param {number}  [evalDay]    - Evaluation day (sim day number); per-leg T computed from leg.expiryDay
     * @param {number}  [entryDay]   - Entry day (sim day number); per-leg entryT computed from leg.expiryDay
     */
    draw(legs, spot, vol, rate, dte, greekToggles, evalDay, entryDay, q) {
        const ctx  = this._ctx;
        const cssW = this._cssW;
        const cssH = this._cssH;
        const currentTheme = document.documentElement.dataset.theme || 'light';
        if (currentTheme !== this._cachedTheme) {
            this._cachedTheme = currentTheme;
            this._cachedColors = _colors();
            this._cachedThemeColors = _themeTextColors();
        }
        const clrs = this._cachedColors;
        const themeClrs = this._cachedThemeColors;

        // Clear
        ctx.clearRect(0, 0, cssW, cssH);

        // --- X range from zoom state ---
        const xMin = this._xCenter - this._xRange;
        const xMax = this._xCenter + this._xRange;

        // --- Plot area ---
        const plotX = MARGIN.left;
        const plotY = MARGIN.top;
        const plotW = cssW - MARGIN.left - MARGIN.right;
        const plotH = cssH - MARGIN.top  - MARGIN.bottom;

        if (plotW <= 0 || plotH <= 0) return;

        if (!legs || legs.length === 0) {
            // Draw axes and grid but no curves
            const xToPixel   = (S) => plotX + ((S   - xMin) / (xMax - xMin)) * plotW;
            const pnlToPixel = (p) => plotY + ((1 - p) / 2) * plotH; // map -1..1 to plot
            this._drawGrid(ctx, plotX, plotY, plotW, plotH, xMin, xMax, -1, 1, xToPixel, pnlToPixel);
            this._drawZeroLine(ctx, plotX, plotW, pnlToPixel);
            this._drawYAxis(ctx, plotX, plotY, plotH, -1, 1, pnlToPixel, themeClrs);
            this._drawXAxis(ctx, plotX, plotY, plotW, plotH, xMin, xMax, xToPixel, themeClrs);
            // Draw spot marker if in range
            if (spot >= xMin && spot <= xMax) {
                this._drawSpotMarker(ctx, spot, plotY, plotH, xToPixel, clrs.accent);
            }
            this._legendItems = [];
            return;
        }

        const fallbackDte = dte;
        const activeGreeks = Object.keys(greekToggles || {}).filter(k => greekToggles[k]);

        // --- Cached computation: only re-price when inputs change ---
        const drawKey = _cacheKey(legs, vol, rate, evalDay, entryDay, dte,
            (xMin * 100 | 0) + ',' + (xMax * 100 | 0) + ',' + (spot * 100 | 0) + ',' + activeGreeks.join('') + ',' + (q * 1e6 | 0) + ',' + _modelKey());
        let xs, pnls, greekData, breakevens;

        if (this._cache && this._cache.key === drawKey) {
            ({ xs, pnls, greekData, breakevens } = this._cache);
        } else {
            // Precompute per-leg entry values (constant across all sample Ss)
            const legInfos = _precomputeLegs(legs, spot, vol, rate, evalDay, entryDay, fallbackDte, q);

            const wantGreeks = activeGreeks.length > 0;
            xs   = new Array(SAMPLE_COUNT);
            pnls = new Array(SAMPLE_COUNT);
            const greekArrays = {};
            if (wantGreeks) {
                for (const gKey of activeGreeks) greekArrays[gKey] = new Array(SAMPLE_COUNT);
            }

            for (let i = 0; i < SAMPLE_COUNT; i++) {
                const S = xMin + (i / (SAMPLE_COUNT - 1)) * (xMax - xMin);
                xs[i] = S;

                let pnl = 0;
                let gDelta = 0, gGamma = 0, gTheta = 0, gVega = 0, gRho = 0;
                for (const info of legInfos) {
                    pnl += _legPnlFast(info, S);
                    if (wantGreeks) {
                        const g = _legGreeksFast(info, S);
                        gDelta += g.delta; gGamma += g.gamma;
                        gTheta += g.theta; gVega  += g.vega; gRho += g.rho;
                    }
                }
                pnls[i] = pnl;
                if (wantGreeks) {
                    const totals = { delta: gDelta, gamma: gGamma, theta: gTheta, vega: gVega, rho: gRho };
                    for (const gKey of activeGreeks) greekArrays[gKey][i] = totals[gKey] ?? 0;
                }
            }

            greekData = {};
            if (wantGreeks) {
                for (const gKey of activeGreeks) {
                    const vals = greekArrays[gKey];
                    let gMin = Infinity, gMax = -Infinity;
                    for (const v of vals) { if (v < gMin) gMin = v; if (v > gMax) gMax = v; }
                    if (gMin === gMax) { gMin -= 0.01; gMax += 0.01; }
                    const gPad = (gMax - gMin) * Y_PADDING_PCT;
                    greekData[gKey] = { vals, yLo: gMin - gPad, yHi: gMax + gPad };
                }
            }

            breakevens = _zeroCrossings(xs, pnls);
            this._cache = { key: drawKey, xs, pnls, greekData, breakevens };
        }

        // --- Y scale for P&L ---
        let pnlMin = Infinity, pnlMax = -Infinity;
        for (const p of pnls) { if (p < pnlMin) pnlMin = p; if (p > pnlMax) pnlMax = p; }
        if (pnlMin === pnlMax) { pnlMin -= 1; pnlMax += 1; }
        const pnlPad = (pnlMax - pnlMin) * Y_PADDING_PCT;
        const yLo = pnlMin - pnlPad;
        const yHi = pnlMax + pnlPad;

        const xToPixel   = (S) => plotX + ((S   - xMin) / (xMax - xMin)) * plotW;
        const pnlToPixel = (p) => plotY + ((yHi - p)    / (yHi - yLo))   * plotH;

        // Rebuild pixel mappers for cached greek data (depend on plotH which may change)
        for (const gKey of activeGreeks) {
            const gd = greekData[gKey];
            gd.toPixel = (v) => plotY + ((gd.yHi - v) / (gd.yHi - gd.yLo)) * plotH;
        }

        // --- Draw grid / axes ---
        this._drawGrid(ctx, plotX, plotY, plotW, plotH, xMin, xMax, yLo, yHi, xToPixel, pnlToPixel);

        // --- Draw zero line ---
        this._drawZeroLine(ctx, plotX, plotW, pnlToPixel);

        // --- Draw spot marker ---
        if (spot >= xMin && spot <= xMax) {
            this._drawSpotMarker(ctx, spot, plotY, plotH, xToPixel, clrs.accent);
        }

        // --- Draw Greek overlays ---
        for (const gKey of activeGreeks) {
            const gd  = greekData[gKey];
            const col = clrs[gKey] || themeClrs.textMuted;
            this._drawLine(ctx, xs, gd.vals, gd.toPixel, xToPixel, col, 0.5, 1.5);
        }

        // --- Draw P&L curve (colour-split at zero) ---
        this._drawPnlCurve(ctx, xs, pnls, xToPixel, pnlToPixel, clrs.up, clrs.down);

        // --- Breakeven dots + labels ---
        this._drawBreakevens(ctx, breakevens, pnlToPixel(0), xToPixel, clrs.accent);

        // --- Y axis labels ---
        this._drawYAxis(ctx, plotX, plotY, plotH, yLo, yHi, pnlToPixel, themeClrs);

        // --- X axis labels ---
        this._drawXAxis(ctx, plotX, plotY, plotW, plotH, xMin, xMax, xToPixel, themeClrs);

        // --- Legend ---
        this._drawLegend(ctx, cssW, greekToggles, clrs, themeClrs);
    }

    /**
     * Compute summary statistics for the strategy.
     *
     * @returns {{ maxProfit: number, maxLoss: number, breakevens: number[], netCost: number }}
     */
    computeSummary(legs, spot, vol, rate, dte, evalDay, entryDay, q) {
        if (!legs || legs.length === 0) {
            return { maxProfit: 0, maxLoss: 0, breakevens: [], netCost: 0, greeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 } };
        }

        const sumKey = _cacheKey(legs, vol, rate, evalDay, entryDay, dte, (spot * 100 | 0) + ',' + (q * 1e6 | 0) + ',' + _modelKey());
        if (this._summaryCache && this._summaryCache.key === sumKey) {
            return this._summaryCache.result;
        }

        const fallbackDte = dte;

        // Net cost = sum of entry costs (value at entry time)
        let netCost = 0;
        for (const leg of legs) {
            const legEntryDte = (leg.expiryDay != null && entryDay != null)
                ? Math.max(leg.expiryDay - entryDay, 0) : fallbackDte;
            netCost += this._legEntryCost(leg, spot, vol, rate, _dteToT(legEntryDte), q, entryDay);
        }

        // Intrinsic payoff at expiry is piecewise linear — extremes occur at
        // strike prices and endpoints (S=0, S→∞). Evaluate at each kink point.
        const _pnlAt = (S) => {
            let pnl = 0;
            for (const leg of legs) {
                const sign = (typeof leg.qty === 'number' && leg.qty < 0) ? -1 : 1;
                const qty = Math.abs(leg.qty ?? 1);
                const mult = qty * sign;
                switch (leg.type) {
                    case 'call': pnl += Math.max(0, S - (leg.strike ?? spot)) * mult; break;
                    case 'put':  pnl += Math.max(0, (leg.strike ?? spot) - S) * mult; break;
                    case 'stock': pnl += S * mult; break;
                    case 'bond': pnl += BOND_FACE_VALUE * mult; break;
                }
            }
            return pnl - netCost;
        };

        // Collect kink points (strikes + S=0)
        const kinks = [0];
        for (const leg of legs) {
            if (leg.strike != null) kinks.push(leg.strike);
        }

        let maxProfit = -Infinity, maxLoss = Infinity;
        for (const S of kinks) {
            const p = _pnlAt(S);
            if (p > maxProfit) maxProfit = p;
            if (p < maxLoss) maxLoss = p;
        }

        // Check slope as S→∞ to determine if profit/loss is unbounded
        let slopeAtInf = 0;
        for (const leg of legs) {
            const sign = (typeof leg.qty === 'number' && leg.qty < 0) ? -1 : 1;
            const qty = Math.abs(leg.qty ?? 1);
            const mult = qty * sign;
            if (leg.type === 'call' || leg.type === 'stock') slopeAtInf += mult;
        }
        if (slopeAtInf > 0) maxProfit = Infinity;
        else if (slopeAtInf < 0) maxLoss = -Infinity;

        // Breakevens from piecewise linear payoff — sample between kink points
        kinks.sort((a, b) => a - b);
        const farPoint = (kinks[kinks.length - 1] || spot) * 3;
        const samplePts = [...kinks, farPoint];
        const xs = samplePts;
        const pnls = samplePts.map(S => _pnlAt(S));
        const breakevens = _zeroCrossings(xs, pnls);

        // Aggregate Greeks at current spot/time (always use entry day, not slider)
        const greekInfos = _precomputeLegs(legs, spot, vol, rate, entryDay, entryDay, fallbackDte, q);
        const greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
        for (const info of greekInfos) {
            const g = _legGreeksFast(info, spot);
            greeks.delta += g.delta;
            greeks.gamma += g.gamma;
            greeks.theta += g.theta;
            greeks.vega  += g.vega;
            greeks.rho   += g.rho;
        }

        const result = { maxProfit, maxLoss, breakevens, netCost, greeks };
        this._summaryCache = { key: sumKey, result };
        return result;
    }

    // -----------------------------------------------------------------------
    // P&L / Greeks helpers
    // -----------------------------------------------------------------------

    /**
     * Compute the entry cost of a single leg at the original spot price.
     * Positive = debit paid, negative = credit received.
     */
    _legEntryCost(leg, spot, vol, rate, T, q, entryDay) {
        const sign = (typeof leg.qty === 'number' && leg.qty < 0) ? -1
                   : (leg.side === 'short') ? -1 : 1;
        const qty  = Math.abs(leg.qty ?? 1);
        const K = leg.strike ?? spot;
        const expiryDay = entryDay != null ? entryDay + Math.round(T * TRADING_DAYS_PER_YEAR) : null;
        const mid = unitPrice(leg.type, spot, vol, rate, entryDay ?? 0, K, expiryDay, q);
        return mid * qty * sign;
    }

    // -----------------------------------------------------------------------
    // Drawing helpers
    // -----------------------------------------------------------------------

    _drawZeroLine(ctx, plotX, plotW, pnlToPixel) {
        const isDark = (this._cachedTheme || document.documentElement.dataset.theme) === 'dark';
        const muted = isDark ? _PALETTE.dark.textMuted : _PALETTE.light.textMuted;
        const y0 = pnlToPixel(0);
        ctx.save();
        ctx.strokeStyle = _r(muted, 0.6);
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(plotX, y0);
        ctx.lineTo(plotX + plotW, y0);
        ctx.stroke();
        ctx.restore();
    }

    _drawSpotMarker(ctx, spot, plotY, plotH, xToPixel, accentColor) {
        const x = xToPixel(spot);
        ctx.save();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, plotY);
        ctx.lineTo(x, plotY + plotH);
        ctx.stroke();
        // Label
        ctx.setLineDash([]);
        ctx.globalAlpha  = 1;
        ctx.fillStyle    = accentColor;
        ctx.font         = `11px ${_FONT.mono}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(_fmt$(spot), x, plotY + plotH + 4);
        ctx.restore();
    }

    /**
     * Draw a polyline with a given colour and opacity.
     */
    _drawLine(ctx, xs, ys, yToPixel, xToPixel, color, alpha, lineWidth) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha ?? 1;
        ctx.lineWidth   = lineWidth ?? 1.5;
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        for (let i = 0; i < xs.length; i++) {
            const px = xToPixel(xs[i]);
            const py = yToPixel(ys[i]);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draw P&L curve, switching colour between positive (up) and negative (down)
     * segments. Zero crossings are interpolated for a clean colour transition.
     */
    _drawPnlCurve(ctx, xs, pnls, xToPixel, pnlToPixel, colorUp, colorDown) {
        if (xs.length < 2) return;

        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.lineJoin  = 'round';
        ctx.lineCap   = 'round';

        // Walk points, splitting into segments at zero crossings.
        // Each segment is a single colour (up or down).
        ctx.strokeStyle = pnls[0] >= 0 ? colorUp : colorDown;
        ctx.beginPath();
        ctx.moveTo(xToPixel(xs[0]), pnlToPixel(pnls[0]));

        for (let i = 1; i < xs.length; i++) {
            const crossed = Math.sign(pnls[i]) !== Math.sign(pnls[i - 1])
                            && pnls[i - 1] !== 0 && pnls[i] !== 0;

            if (crossed) {
                // Interpolate zero crossing
                const t  = pnls[i - 1] / (pnls[i - 1] - pnls[i]);
                const zx = xs[i - 1] + t * (xs[i] - xs[i - 1]);
                const zPx = xToPixel(zx);
                const zPy = pnlToPixel(0);
                // Finish current segment at the crossing
                ctx.lineTo(zPx, zPy);
                ctx.stroke();
                // Start new segment from the crossing in the new colour
                ctx.strokeStyle = pnls[i] >= 0 ? colorUp : colorDown;
                ctx.beginPath();
                ctx.moveTo(zPx, zPy);
            }

            ctx.lineTo(xToPixel(xs[i]), pnlToPixel(pnls[i]));
        }
        ctx.stroke();

        ctx.restore();
    }

    _drawBreakevens(ctx, breakevens, y0, xToPixel, accentColor) {
        ctx.save();
        for (const bx of breakevens) {
            const px = xToPixel(bx);
            // Dot
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.arc(px, y0, 4, 0, Math.PI * 2);
            ctx.fill();
            // Label
            ctx.fillStyle    = accentColor;
            ctx.font         = `11px ${_FONT.mono}`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(_fmt$(bx), px, y0 + 7);
        }
        ctx.restore();
    }

    _drawGrid(ctx, plotX, plotY, plotW, plotH, xMin, xMax, yLo, yHi, xToPixel, pnlToPixel) {
        const isDark = (this._cachedTheme || document.documentElement.dataset.theme) === 'dark';
        const muted = isDark ? _PALETTE.dark.textMuted : _PALETTE.light.textMuted;
        ctx.save();
        ctx.strokeStyle = _r(muted, 0.15);
        ctx.lineWidth   = 1;
        ctx.beginPath();
        const yStep = (yHi - yLo) / 5;
        for (let i = 0; i <= 5; i++) {
            const y = pnlToPixel(yLo + i * yStep);
            ctx.moveTo(plotX, y);
            ctx.lineTo(plotX + plotW, y);
        }
        const xStep = (xMax - xMin) / 5;
        for (let i = 0; i <= 5; i++) {
            const x = xToPixel(xMin + i * xStep);
            ctx.moveTo(x, plotY);
            ctx.lineTo(x, plotY + plotH);
        }
        ctx.stroke();
        ctx.restore();
    }

    _drawYAxis(ctx, plotX, plotY, plotH, yLo, yHi, pnlToPixel, themeClrs) {
        ctx.save();
        ctx.fillStyle    = themeClrs.textSecondary;
        ctx.font         = `11px ${_FONT.mono}`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';

        const ticks = 6;
        const step  = (yHi - yLo) / (ticks - 1);
        for (let i = 0; i < ticks; i++) {
            const v = yLo + i * step;
            const y = pnlToPixel(v);
            ctx.fillText(_fmt$(v), plotX - 6, y);
        }

        // Axis label
        ctx.save();
        ctx.translate(14, plotY + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `11px ${_FONT.mono}`;
        ctx.fillStyle    = themeClrs.textMuted;
        ctx.fillText('P&L', 0, 0);
        ctx.restore();

        ctx.restore();
    }

    _drawXAxis(ctx, plotX, plotY, plotW, plotH, xMin, xMax, xToPixel, themeClrs) {
        const baseY = plotY + plotH;
        ctx.save();
        ctx.fillStyle    = themeClrs.textSecondary;
        ctx.font         = `11px ${_FONT.mono}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';

        const ticks = 6;
        const step  = (xMax - xMin) / (ticks - 1);
        for (let i = 0; i < ticks; i++) {
            const v = xMin + i * step;
            const x = xToPixel(v);
            ctx.fillText(_fmt$(v), x, baseY + 6);
        }

        // Axis label
        ctx.textBaseline = 'bottom';
        ctx.font         = `11px ${_FONT.mono}`;
        ctx.fillStyle    = themeClrs.textMuted;
        ctx.fillText('Stock Price', plotX + plotW / 2, baseY + 42);
        ctx.restore();
    }

    _drawLegend(ctx, cssW, greekToggles, clrs, themeClrs) {
        const items = [
            { label: 'P&L',   color: clrs.up,    active: true, key: null },
        ];
        for (const [key, meta] of Object.entries(GREEK_META)) {
            items.push({
                label:  meta.label,
                color:  clrs[key] || _PALETTE.light.textMuted,
                active: !!(greekToggles && greekToggles[key]),
                key:    key,
            });
        }

        const boxW = 110;
        const lineH = 18;
        const padX  = 10;
        const padY  = 8;
        const legendH = padY * 2 + items.length * lineH;
        // Position in top-LEFT of plot area (inside MARGIN.left)
        const lx = MARGIN.left + 8;
        const ly = MARGIN.top + 4;

        const isDark = document.documentElement.dataset.theme === 'dark';

        ctx.save();
        ctx.fillStyle   = isDark ? _r(_PALETTE.dark.canvas, 0.55) : _r(_PALETTE.light.canvas, 0.75);
        ctx.strokeStyle = _r(isDark ? _PALETTE.dark.textMuted : _PALETTE.light.textMuted, isDark ? 0.3 : 0.4);
        ctx.lineWidth   = 1;
        _roundRect(ctx, lx, ly, boxW, legendH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.font         = `11px ${_FONT.body}`;
        ctx.textBaseline = 'middle';

        // Reset legend hit areas
        this._legendItems = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const iy   = ly + padY + i * lineH + lineH / 2;

            // Store bounding box for click detection
            this._legendItems.push({
                x: lx,
                y: ly + padY + i * lineH,
                w: boxW,
                h: lineH,
                key: item.key,
            });

            // Swatch
            ctx.fillStyle   = item.color;
            ctx.globalAlpha = item.active ? 1 : 0.35;
            ctx.fillRect(lx + padX, iy - 4, 12, 8);

            // Label — theme-aware text colors
            ctx.globalAlpha = item.active ? 1 : 0.35;
            ctx.fillStyle   = item.active ? themeClrs.text : themeClrs.textMuted;
            ctx.textAlign   = 'left';
            ctx.fillText(item.label, lx + padX + 18, iy);
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Internal canvas utility
// ---------------------------------------------------------------------------

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
