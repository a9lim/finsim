/**
 * strategy.js — Strategy View renderer for Shoals trading simulator.
 *
 * Renders a payoff/P&L diagram and optional Greek overlays on a dedicated
 * canvas. Does NOT use shared-camera.js; manages its own X-range with
 * scroll-wheel zoom centered on the current spot price.
 *
 * Exports: StrategyRenderer
 */

import { priceAmerican, computeGreeks } from './pricing.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_COUNT   = 200;  // Points across X range
const Y_PADDING_PCT  = 0.15; // 15% vertical padding
const MARGIN = { top: 24, right: 16, bottom: 48, left: 68 };

// Greek display metadata: key → { label }
const GREEK_META = {
    delta: { label: 'Delta' },
    gamma: { label: 'Gamma' },
    theta: { label: 'Theta' },
    vega:  { label: 'Vega' },
    rho:   { label: 'Rho' },
};

// Attempt to resolve colours from the frozen _PALETTE global at call time,
// falling back to the literal hex values above.
function _paletteColor(key, fallback) {
    try {
        if (typeof _PALETTE !== 'undefined') {
            const ext = _PALETTE.extended;
            if (ext && ext[key]) return ext[key];
            if (_PALETTE[key])   return _PALETTE[key];
        }
    } catch (_) { /* ignore */ }
    return fallback;
}

function _colors() {
    return {
        up:     _paletteColor('green',   '#509878'),
        down:   _paletteColor('rose',    '#C46272'),
        accent: _paletteColor('accent',  '#FE3B01'),
        delta:  _paletteColor('blue',    '#5C92A8'),
        gamma:  _paletteColor('orange',  '#CC8E4E'),
        theta:  _paletteColor('cyan',    '#4AACA0'),
        vega:   _paletteColor('purple',  '#9C7EB0'),
        rho:    _paletteColor('slate',   '#8A7E72'),
    };
}

/**
 * Get theme-aware text colors based on current data-theme attribute.
 */
function _themeTextColors() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    try {
        if (typeof _PALETTE !== 'undefined') {
            const pal = isDark ? _PALETTE.dark : _PALETTE.light;
            return {
                text:          pal.text          || (isDark ? '#E8DED4' : '#1A1612'),
                textSecondary: pal.textSecondary || (isDark ? '#8A8278' : '#78706A'),
                textMuted:     pal.textMuted     || (isDark ? '#5A544C' : '#A8A098'),
            };
        }
    } catch (_) { /* ignore */ }
    return isDark
        ? { text: '#E8DED4', textSecondary: '#8A8278', textMuted: '#5A544C' }
        : { text: '#1A1612', textSecondary: '#78706A', textMuted: '#A8A098' };
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

    const result = [];
    for (let i = 0; i < ys.length - 1; i++) {
        if (ys[i] === 0) {
            result.push(xs[i]);
            continue;
        }
        if (Math.sign(ys[i]) !== Math.sign(ys[i + 1])) {
            // Linear interpolation
            const t = ys[i] / (ys[i] - ys[i + 1]);
            result.push(xs[i] + t * (xs[i + 1] - xs[i]));
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
        this._dpr    = window.devicePixelRatio || 1;
        this._dirty  = false;

        // X-range zoom state (set per draw via resetRange or wheel)
        this._xCenter = 100;
        this._xRange  = 30;    // half-width
        this._xRangeMin = 5;   // will be recomputed per spot
        this._xRangeMax = 100; // will be recomputed per spot

        // Legend hit areas (populated during draw)
        this._legendItems = [];

        this.resize();
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Update canvas dimensions accounting for device pixel ratio. */
    resize() {
        const canvas = this._canvas;
        const dpr    = window.devicePixelRatio || 1;
        this._dpr    = dpr;
        const cssW   = canvas.clientWidth  || canvas.width  / dpr;
        const cssH   = canvas.clientHeight || canvas.height / dpr;
        const newBufW = Math.round(cssW * dpr);
        const newBufH = Math.round(cssH * dpr);
        // Only reset buffer if size changed (setting canvas.width clears it)
        if (canvas.width !== newBufW || canvas.height !== newBufH) {
            canvas.width  = newBufW;
            canvas.height = newBufH;
        }
        this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._cssW = cssW;
        this._cssH = cssH;
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
    draw(legs, spot, vol, rate, dte, greekToggles, evalDay, entryDay) {
        const ctx  = this._ctx;
        const cssW = this._cssW;
        const cssH = this._cssH;
        const clrs = _colors();
        const themeClrs = _themeTextColors();

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

        // --- Build sample arrays ---
        const xs   = [];
        const pnls = [];

        for (let i = 0; i < SAMPLE_COUNT; i++) {
            const S = xMin + (i / (SAMPLE_COUNT - 1)) * (xMax - xMin);
            xs.push(S);
            pnls.push(this._totalPnl(legs, S, vol, rate, evalDay, entryDay, fallbackDte, spot));
        }

        // --- Y scale for P&L ---
        let pnlMin = Infinity, pnlMax = -Infinity;
        for (const p of pnls) { if (p < pnlMin) pnlMin = p; if (p > pnlMax) pnlMax = p; }
        if (pnlMin === pnlMax) { pnlMin -= 1; pnlMax += 1; }
        const pnlPad = (pnlMax - pnlMin) * Y_PADDING_PCT;
        const yLo = pnlMin - pnlPad;
        const yHi = pnlMax + pnlPad;

        const xToPixel  = (S)   => plotX + ((S   - xMin) / (xMax - xMin)) * plotW;
        const pnlToPixel = (p)  => plotY + ((yHi - p)    / (yHi - yLo))   * plotH;

        // --- Greek data (only for enabled toggles) ---
        const activeGreeks = Object.keys(greekToggles || {}).filter(k => greekToggles[k]);
        const greekData = {};

        if (activeGreeks.length > 0) {
            const greekArrays = {};
            for (const gKey of activeGreeks) greekArrays[gKey] = new Array(SAMPLE_COUNT);

            for (let i = 0; i < SAMPLE_COUNT; i++) {
                const allGreeks = this._totalGreeksAll(legs, xs[i], vol, rate, evalDay, fallbackDte);
                for (const gKey of activeGreeks) {
                    greekArrays[gKey][i] = allGreeks[gKey] ?? 0;
                }
            }

            for (const gKey of activeGreeks) {
                const vals = greekArrays[gKey];
                let gMin = Infinity, gMax = -Infinity;
                for (const v of vals) { if (v < gMin) gMin = v; if (v > gMax) gMax = v; }
                if (gMin === gMax) { gMin -= 0.01; gMax += 0.01; }
                const gPad = (gMax - gMin) * Y_PADDING_PCT;
                const gLo = gMin - gPad;
                const gHi = gMax + gPad;
                greekData[gKey] = {
                    vals, yLo: gLo, yHi: gHi,
                    toPixel: (v) => plotY + ((gHi - v) / (gHi - gLo)) * plotH,
                };
            }
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
            const col = clrs[gKey] || '#888';
            this._drawLine(ctx, xs, gd.vals, gd.toPixel, xToPixel, col, 0.5, 1.5);
        }

        // --- Draw P&L curve (colour-split at zero) ---
        this._drawPnlCurve(ctx, xs, pnls, xToPixel, pnlToPixel, clrs.up, clrs.down);

        // --- Breakeven dots + labels ---
        const breakevens = _zeroCrossings(xs, pnls);
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
    computeSummary(legs, spot, vol, rate, dte, evalDay, entryDay) {
        if (!legs || legs.length === 0) {
            return { maxProfit: 0, maxLoss: 0, breakevens: [], netCost: 0 };
        }

        const fallbackDte = dte;
        // Extend sampling range to cover near-zero and far-upside
        let xMin = 0.01;
        let xMax = spot * 5;
        for (const leg of legs) {
            if (leg.strike != null) {
                xMax = Math.max(xMax, leg.strike * 5);
            }
        }
        const xs   = [];
        const pnls = [];

        for (let i = 0; i < SAMPLE_COUNT; i++) {
            const S = xMin + (i / (SAMPLE_COUNT - 1)) * (xMax - xMin);
            xs.push(S);
            pnls.push(this._totalPnl(legs, S, vol, rate, evalDay, entryDay, fallbackDte, spot));
        }

        let maxProfit = -Infinity, maxLoss = Infinity;
        for (const p of pnls) { if (p > maxProfit) maxProfit = p; if (p < maxLoss) maxLoss = p; }

        // Check endpoints for unbounded profit/loss
        const pnlAtLow  = pnls[0];
        const pnlAtHigh = pnls[pnls.length - 1];
        const pnlNearHigh = pnls[pnls.length - 2];

        // If P&L is still increasing at the high end, profit is unbounded
        if (pnlAtHigh > pnlNearHigh + 0.01 && pnlAtHigh === maxProfit) {
            maxProfit = Infinity;
        }
        // If P&L is still decreasing at the high end, loss is unbounded
        if (pnlAtHigh < pnlNearHigh - 0.01 && pnlAtHigh === maxLoss) {
            maxLoss = -Infinity;
        }

        const breakevens = _zeroCrossings(xs, pnls);

        // Net cost = sum of entry costs (value at entry time)
        let netCost = 0;
        for (const leg of legs) {
            const legEntryDte = (leg.expiryDay != null && entryDay != null)
                ? Math.max(leg.expiryDay - entryDay, 0) : fallbackDte;
            netCost += this._legEntryCost(leg, spot, vol, rate, _dteToT(legEntryDte));
        }

        return { maxProfit, maxLoss, breakevens, netCost };
    }

    // -----------------------------------------------------------------------
    // P&L / Greeks helpers
    // -----------------------------------------------------------------------

    /**
     * Compute the entry cost of a single leg at the original spot price.
     * Positive = debit paid, negative = credit received.
     */
    _legEntryCost(leg, spot, vol, rate, T) {
        const sign = (typeof leg.qty === 'number' && leg.qty < 0) ? -1
                   : (leg.side === 'short') ? -1 : 1;
        const qty  = Math.abs(leg.qty ?? 1);

        switch (leg.type) {
            case 'call':
            case 'put': {
                const isPut = leg.type === 'put';
                const K     = leg.strike ?? spot;
                const price = priceAmerican(spot, K, T, rate, vol, isPut);
                return price * qty * sign;
            }
            case 'stock':
                // Entry cost for hypothetical stock position is spot * qty * sign
                return spot * qty * sign;
            case 'bond': {
                const bVal = BOND_FACE_VALUE * Math.exp(-rate * T);
                return bVal * qty * sign;
            }
            default:
                return 0;
        }
    }

    /**
     * P&L for a single leg at price S (current_value - entry_cost_at_spot).
     *
     * @param {object} leg
     * @param {number} S          - Hypothetical spot to evaluate at
     * @param {number} vol
     * @param {number} rate
     * @param {number} evalDay    - Evaluation day (sim day number)
     * @param {number} entryDay   - Entry day (sim day number)
     * @param {number} fallbackDte - Fallback DTE for legs without expiryDay
     * @param {number} entryS     - Original spot (entry price reference)
     */
    _legPnl(leg, S, vol, rate, evalDay, entryDay, fallbackDte, entryS) {
        const sign  = (typeof leg.qty === 'number' && leg.qty < 0) ? -1
                    : (leg.side === 'short') ? -1 : 1;
        const qty   = Math.abs(leg.qty ?? 1);
        const curDte   = _legDte(leg, evalDay, fallbackDte);
        const entryDte = (leg.expiryDay != null && entryDay != null)
            ? Math.max(leg.expiryDay - entryDay, 0) : fallbackDte;
        const T      = _dteToT(curDte);
        const entryT = _dteToT(entryDte);

        switch (leg.type) {
            case 'call':
            case 'put': {
                const isPut    = leg.type === 'put';
                const K        = leg.strike ?? entryS;
                const curVal   = priceAmerican(S,      K, T,      rate, vol, isPut);
                const entryVal = priceAmerican(entryS, K, entryT, rate, vol, isPut);
                return (curVal - entryVal) * qty * sign;
            }
            case 'stock': {
                return (S - entryS) * qty * sign;
            }
            case 'bond': {
                const curVal   = BOND_FACE_VALUE * Math.exp(-rate * T);
                const entryVal = BOND_FACE_VALUE * Math.exp(-rate * entryT);
                return (curVal - entryVal) * qty * sign;
            }
            default:
                return 0;
        }
    }

    /**
     * Sum P&L across all legs at price S.
     */
    _totalPnl(legs, S, vol, rate, evalDay, entryDay, fallbackDte, entryS) {
        let total = 0;
        for (const leg of legs) {
            total += this._legPnl(leg, S, vol, rate, evalDay, entryDay, fallbackDte, entryS);
        }
        return total;
    }

    /**
     * Greeks for a single leg at price S.
     *
     * @returns {object} { delta, gamma, theta, vega, rho }
     */
    _legGreeks(leg, S, vol, rate, evalDay, fallbackDte) {
        const sign = (typeof leg.qty === 'number' && leg.qty < 0) ? -1
                   : (leg.side === 'short') ? -1 : 1;
        const qty  = Math.abs(leg.qty ?? 1);
        const mult = qty * sign;
        const T = _dteToT(_legDte(leg, evalDay, fallbackDte));

        switch (leg.type) {
            case 'call':
            case 'put': {
                const isPut = leg.type === 'put';
                const K     = leg.strike ?? S;
                const g     = computeGreeks(S, K, T, rate, vol, isPut);
                return {
                    delta: g.delta * mult,
                    gamma: g.gamma * mult,
                    theta: g.theta * mult,
                    vega:  g.vega  * mult,
                    rho:   g.rho   * mult,
                };
            }
            case 'stock':
                return { delta: mult, gamma: 0, theta: 0, vega: 0, rho: 0 };
            case 'bond': {
                const bv = BOND_FACE_VALUE * Math.exp(-rate * T);
                const bRho = -T * bv * mult;
                const bTheta = rate * bv / 252 * mult;
                return { delta: 0, gamma: 0, theta: bTheta, vega: 0, rho: bRho };
            }
            default:
                return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
        }
    }

    /**
     * Sum a specific Greek key across all legs at price S.
     */
    _totalGreek(legs, S, vol, rate, evalDay, fallbackDte, gKey) {
        let total = 0;
        for (const leg of legs) {
            const g = this._legGreeks(leg, S, vol, rate, evalDay, fallbackDte);
            total += g[gKey] ?? 0;
        }
        return total;
    }

    /**
     * Sum ALL Greeks across all legs at price S in a single pass.
     * Computes computeGreeks() once per option leg instead of once per Greek key.
     */
    _totalGreeksAll(legs, S, vol, rate, evalDay, fallbackDte) {
        let delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0;
        for (const leg of legs) {
            const g = this._legGreeks(leg, S, vol, rate, evalDay, fallbackDte);
            delta += g.delta;
            gamma += g.gamma;
            theta += g.theta;
            vega  += g.vega;
            rho   += g.rho;
        }
        return { delta, gamma, theta, vega, rho };
    }

    // -----------------------------------------------------------------------
    // Drawing helpers
    // -----------------------------------------------------------------------

    _drawZeroLine(ctx, plotX, plotW, pnlToPixel) {
        const y0 = pnlToPixel(0);
        ctx.save();
        ctx.strokeStyle = '#A8A09899';
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
        ctx.font         = '11px var(--font-mono, monospace)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(_fmt$(spot), x, plotY - 4);
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

        // Walk segments, splitting at zero crossings
        let segStart = 0;

        for (let i = 1; i <= xs.length; i++) {
            const atEnd = i === xs.length;
            const crossed = !atEnd && Math.sign(pnls[i]) !== Math.sign(pnls[i - 1])
                            && pnls[i - 1] !== 0 && pnls[i] !== 0;

            if (atEnd || crossed) {
                // Draw segment from segStart..i-1 (plus interpolated zero if crossing)
                const segColor = pnls[segStart] >= 0 ? colorUp : colorDown;
                ctx.strokeStyle = segColor;
                ctx.beginPath();
                for (let j = segStart; j <= (atEnd ? i - 1 : i - 1); j++) {
                    const px = xToPixel(xs[j]);
                    const py = pnlToPixel(pnls[j]);
                    if (j === segStart) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                if (crossed) {
                    // Interpolate zero crossing and add as endpoint
                    const t  = pnls[i - 1] / (pnls[i - 1] - pnls[i]);
                    const zx = xs[i - 1] + t * (xs[i] - xs[i - 1]);
                    ctx.lineTo(xToPixel(zx), pnlToPixel(0));
                }
                ctx.stroke();

                if (crossed) {
                    // Start next segment from zero-crossing point
                    segStart = i - 1; // Will be redrawn from crossing onward
                    // Start the new segment colour at the interpolated zero
                    const t  = pnls[i - 1] / (pnls[i - 1] - pnls[i]);
                    const zx = xs[i - 1] + t * (xs[i] - xs[i - 1]);
                    const nextColor = pnls[i] >= 0 ? colorUp : colorDown;
                    ctx.strokeStyle = nextColor;
                    ctx.beginPath();
                    ctx.moveTo(xToPixel(zx), pnlToPixel(0));
                    ctx.lineTo(xToPixel(xs[i]), pnlToPixel(pnls[i]));
                    segStart = i;
                }
            }
        }

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
            ctx.font         = '11px var(--font-mono, monospace)';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(_fmt$(bx), px, y0 + 7);
        }
        ctx.restore();
    }

    _drawGrid(ctx, plotX, plotY, plotW, plotH, xMin, xMax, yLo, yHi, xToPixel, pnlToPixel) {
        ctx.save();
        ctx.strokeStyle = '#A8A09826';
        ctx.lineWidth   = 1;

        // Horizontal grid lines (5 divisions)
        const yStep = (yHi - yLo) / 5;
        for (let i = 0; i <= 5; i++) {
            const y = pnlToPixel(yLo + i * yStep);
            ctx.beginPath();
            ctx.moveTo(plotX, y);
            ctx.lineTo(plotX + plotW, y);
            ctx.stroke();
        }

        // Vertical grid lines (5 divisions)
        const xStep = (xMax - xMin) / 5;
        for (let i = 0; i <= 5; i++) {
            const x = xToPixel(xMin + i * xStep);
            ctx.beginPath();
            ctx.moveTo(x, plotY);
            ctx.lineTo(x, plotY + plotH);
            ctx.stroke();
        }

        ctx.restore();
    }

    _drawYAxis(ctx, plotX, plotY, plotH, yLo, yHi, pnlToPixel, themeClrs) {
        ctx.save();
        ctx.fillStyle    = themeClrs.textSecondary;
        ctx.font         = '11px var(--font-mono, monospace)';
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
        ctx.font         = '11px var(--font-body, sans-serif)';
        ctx.fillStyle    = themeClrs.textMuted;
        ctx.fillText('P&L', 0, 0);
        ctx.restore();

        ctx.restore();
    }

    _drawXAxis(ctx, plotX, plotY, plotW, plotH, xMin, xMax, xToPixel, themeClrs) {
        const baseY = plotY + plotH;
        ctx.save();
        ctx.fillStyle    = themeClrs.textSecondary;
        ctx.font         = '11px var(--font-mono, monospace)';
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
        ctx.font         = '11px var(--font-body, sans-serif)';
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
                color:  clrs[key] || '#888',
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
        ctx.fillStyle   = isDark ? 'rgba(12,11,9,0.55)' : 'rgba(240,235,228,0.75)';
        ctx.strokeStyle = isDark ? 'rgba(168,160,152,0.3)' : 'rgba(168,160,152,0.4)';
        ctx.lineWidth   = 1;
        _roundRect(ctx, lx, ly, boxW, legendH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.font         = '11px var(--font-body, sans-serif)';
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
