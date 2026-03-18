/**
 * strategy.js — Strategy View renderer for Shoals trading simulator.
 *
 * Renders a payoff/P&L diagram and optional Greek overlays on a dedicated
 * canvas. Does NOT use shared-camera.js; manages its own fixed X-range
 * centered on the current spot price.
 *
 * Exports: StrategyRenderer
 */

import { priceAmerican, computeGreeks } from './pricing.js';
import { TRADING_DAYS_PER_YEAR, BOND_FACE_VALUE } from './config.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_COUNT   = 200;  // Points across X range
const X_RANGE_FACTOR = 0.5;  // X spans [spot*(1-f), spot*(1+f)]
const Y_PADDING_PCT  = 0.15; // 15% vertical padding
const MARGIN = { top: 24, right: 16, bottom: 48, left: 68 };

// Greek display metadata: key → { label, color }
const GREEK_META = {
    delta: { label: 'Delta', color: '#5C92A8' },
    gamma: { label: 'Gamma', color: '#CC8E4E' },
    theta: { label: 'Theta', color: '#4AACA0' },
    vega:  { label: 'Vega',  color: '#9C7EB0' },
    rho:   { label: 'Rho',   color: '#8A7E72' },
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
 */
function _zeroCrossings(xs, ys) {
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
        canvas.width  = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._cssW = cssW;
        this._cssH = cssH;
    }

    /**
     * Main render entry point.
     *
     * @param {Array<{type:string, side:string, qty:number, strike?:number, expiryDay?:number}>} legs
     * @param {number}  spot         - Current stock price
     * @param {number}  vol          - Current volatility (sqrt(v), annualised)
     * @param {number}  rate         - Risk-free rate (continuously compounded)
     * @param {number}  dte          - Days to expiry (integer)
     * @param {Object}  greekToggles - { delta, gamma, theta, vega, rho } booleans
     */
    draw(legs, spot, vol, rate, dte, greekToggles) {
        const ctx  = this._ctx;
        const cssW = this._cssW;
        const cssH = this._cssH;
        const clrs = _colors();

        // Clear
        ctx.clearRect(0, 0, cssW, cssH);

        if (!legs || legs.length === 0) {
            this._drawEmpty(ctx, cssW, cssH);
            return;
        }

        const T = _dteToT(dte);

        // --- Build sample arrays ---
        // Compute X range: at least ±30% from spot, extended to cover all strikes with 10% padding
        let xMin = spot * 0.7;
        let xMax = spot * 1.3;
        for (const leg of legs) {
            if (leg.strike != null) {
                xMin = Math.min(xMin, leg.strike * 0.9);
                xMax = Math.max(xMax, leg.strike * 1.1);
            }
        }
        const xs   = [];
        const pnls = [];

        for (let i = 0; i < SAMPLE_COUNT; i++) {
            const S = xMin + (i / (SAMPLE_COUNT - 1)) * (xMax - xMin);
            xs.push(S);
            pnls.push(this._totalPnl(legs, S, vol, rate, T, spot));
        }

        // --- Plot area ---
        const plotX = MARGIN.left;
        const plotY = MARGIN.top;
        const plotW = cssW - MARGIN.left - MARGIN.right;
        const plotH = cssH - MARGIN.top  - MARGIN.bottom;

        if (plotW <= 0 || plotH <= 0) return;

        // --- Y scale for P&L ---
        let pnlMin = Math.min(...pnls);
        let pnlMax = Math.max(...pnls);
        if (pnlMin === pnlMax) { pnlMin -= 1; pnlMax += 1; }
        const pnlPad = (pnlMax - pnlMin) * Y_PADDING_PCT;
        const yLo = pnlMin - pnlPad;
        const yHi = pnlMax + pnlPad;

        const xToPixel  = (S)   => plotX + ((S   - xMin) / (xMax - xMin)) * plotW;
        const pnlToPixel = (p)  => plotY + ((yHi - p)    / (yHi - yLo))   * plotH;

        // --- Greek data (only for enabled toggles) ---
        const activeGreeks = Object.keys(greekToggles || {}).filter(k => greekToggles[k]);
        const greekData = {}; // key → { vals, yLo, yHi, toPixel }

        for (const gKey of activeGreeks) {
            const vals = xs.map(S => this._totalGreek(legs, S, vol, rate, T, gKey));
            let gMin = Math.min(...vals);
            let gMax = Math.max(...vals);
            if (gMin === gMax) { gMin -= 0.01; gMax += 0.01; }
            const gPad  = (gMax - gMin) * Y_PADDING_PCT;
            const gLo   = gMin - gPad;
            const gHi   = gMax + gPad;
            greekData[gKey] = {
                vals,
                yLo: gLo,
                yHi: gHi,
                toPixel: (v) => plotY + ((gHi - v) / (gHi - gLo)) * plotH,
            };
        }

        // --- Draw background ---
        this._drawBackground(ctx, cssW, cssH);

        // --- Draw grid / axes ---
        this._drawGrid(ctx, plotX, plotY, plotW, plotH, xMin, xMax, yLo, yHi, xToPixel, pnlToPixel);

        // --- Draw zero line ---
        this._drawZeroLine(ctx, plotX, plotW, pnlToPixel);

        // --- Draw spot marker ---
        this._drawSpotMarker(ctx, spot, plotY, plotH, xToPixel, clrs.accent);

        // --- Draw Greek overlays ---
        for (const gKey of activeGreeks) {
            const gd  = greekData[gKey];
            const col = clrs[gKey] || GREEK_META[gKey]?.color || '#888';
            this._drawLine(ctx, xs, gd.vals, gd.toPixel, xToPixel, col, 0.5, 1.5);
        }

        // --- Draw P&L curve (colour-split at zero) ---
        this._drawPnlCurve(ctx, xs, pnls, xToPixel, pnlToPixel, clrs.up, clrs.down);

        // --- Breakeven dots + labels ---
        const breakevens = _zeroCrossings(xs, pnls);
        this._drawBreakevens(ctx, breakevens, pnlToPixel(0), xToPixel, clrs.accent);

        // --- Y axis labels ---
        this._drawYAxis(ctx, plotX, plotY, plotH, yLo, yHi, pnlToPixel);

        // --- X axis labels ---
        this._drawXAxis(ctx, plotX, plotY, plotW, plotH, xMin, xMax, xToPixel);

        // --- Legend ---
        this._drawLegend(ctx, cssW, greekToggles, clrs);
    }

    /**
     * Compute summary statistics for the strategy.
     *
     * @returns {{ maxProfit: number, maxLoss: number, breakevens: number[], netCost: number }}
     */
    computeSummary(legs, spot, vol, rate, dte) {
        if (!legs || legs.length === 0) {
            return { maxProfit: 0, maxLoss: 0, breakevens: [], netCost: 0 };
        }

        const T    = _dteToT(dte);
        let xMin = spot * 0.7;
        let xMax = spot * 1.3;
        for (const leg of legs) {
            if (leg.strike != null) {
                xMin = Math.min(xMin, leg.strike * 0.9);
                xMax = Math.max(xMax, leg.strike * 1.1);
            }
        }
        const xs   = [];
        const pnls = [];

        for (let i = 0; i < SAMPLE_COUNT; i++) {
            const S = xMin + (i / (SAMPLE_COUNT - 1)) * (xMax - xMin);
            xs.push(S);
            pnls.push(this._totalPnl(legs, S, vol, rate, T, spot));
        }

        const maxProfit = Math.max(...pnls);
        const maxLoss   = Math.min(...pnls);
        const breakevens = _zeroCrossings(xs, pnls);

        // Net cost = sum of entry costs (value at spot)
        let netCost = 0;
        for (const leg of legs) {
            netCost += this._legEntryCost(leg, spot, vol, rate, T);
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
        const sign = leg.side === 'long' ? 1 : -1;
        const qty  = leg.qty ?? 1;

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
     * @param {number} S      - Hypothetical spot to evaluate at
     * @param {number} vol
     * @param {number} rate
     * @param {number} T      - Time to expiry in years
     * @param {number} entryS - Original spot (entry price reference)
     */
    _legPnl(leg, S, vol, rate, T, entryS) {
        const sign  = leg.side === 'long' ? 1 : -1;
        const qty   = leg.qty ?? 1;

        switch (leg.type) {
            case 'call':
            case 'put': {
                const isPut    = leg.type === 'put';
                const K        = leg.strike ?? entryS;
                const curVal   = priceAmerican(S,      K, T, rate, vol, isPut);
                const entryVal = priceAmerican(entryS, K, T, rate, vol, isPut);
                return (curVal - entryVal) * qty * sign;
            }
            case 'stock': {
                // P&L = (S - entryS) * qty * sign
                return (S - entryS) * qty * sign;
            }
            case 'bond': {
                // Bond value is path-independent; P&L relative to entry = 0
                // (both evaluated at same T, same rate, same face value)
                return 0;
            }
            default:
                return 0;
        }
    }

    /**
     * Sum P&L across all legs at price S.
     */
    _totalPnl(legs, S, vol, rate, T, entryS) {
        let total = 0;
        for (const leg of legs) {
            total += this._legPnl(leg, S, vol, rate, T, entryS);
        }
        return total;
    }

    /**
     * Greeks for a single leg at price S.
     *
     * @returns {object} { delta, gamma, theta, vega, rho }
     */
    _legGreeks(leg, S, vol, rate, T) {
        const sign = leg.side === 'long' ? 1 : -1;
        const qty  = leg.qty ?? 1;
        const mult = qty * sign;

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
                // dBond/dr = -T * BOND_FACE_VALUE * exp(-r*T)
                // Rho for long bond: negative (price falls as rate rises)
                const bRho = -T * BOND_FACE_VALUE * Math.exp(-rate * T) * mult;
                return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: bRho };
            }
            default:
                return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
        }
    }

    /**
     * Sum a specific Greek key across all legs at price S.
     */
    _totalGreek(legs, S, vol, rate, T, gKey) {
        let total = 0;
        for (const leg of legs) {
            const g = this._legGreeks(leg, S, vol, rate, T);
            total += g[gKey] ?? 0;
        }
        return total;
    }

    // -----------------------------------------------------------------------
    // Drawing helpers
    // -----------------------------------------------------------------------

    _drawBackground(ctx, cssW, cssH) {
        // Transparent — let the canvas background CSS handle it
        ctx.clearRect(0, 0, cssW, cssH);
    }

    _drawEmpty(ctx, cssW, cssH) {
        ctx.save();
        ctx.fillStyle = 'rgba(168,160,152,0.4)';
        ctx.font = '14px var(--font-body, sans-serif)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Add legs to see the payoff diagram', cssW / 2, cssH / 2);
        ctx.restore();
    }

    _drawZeroLine(ctx, plotX, plotW, pnlToPixel) {
        const y0 = pnlToPixel(0);
        ctx.save();
        ctx.strokeStyle = 'rgba(168,160,152,0.6)';
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
        ctx.strokeStyle = 'rgba(168,160,152,0.15)';
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

    _drawYAxis(ctx, plotX, plotY, plotH, yLo, yHi, pnlToPixel) {
        ctx.save();
        ctx.fillStyle    = 'rgba(168,160,152,0.8)';
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
        ctx.fillText('P&L', 0, 0);
        ctx.restore();

        ctx.restore();
    }

    _drawXAxis(ctx, plotX, plotY, plotW, plotH, xMin, xMax, xToPixel) {
        const baseY = plotY + plotH;
        ctx.save();
        ctx.fillStyle    = 'rgba(168,160,152,0.8)';
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
        ctx.fillText('Stock Price', plotX + plotW / 2, baseY + 42);
        ctx.restore();
    }

    _drawLegend(ctx, cssW, greekToggles, clrs) {
        const items = [
            { label: 'P&L',   color: clrs.up,    active: true },
        ];
        for (const [key, meta] of Object.entries(GREEK_META)) {
            items.push({
                label:  meta.label,
                color:  clrs[key] || meta.color,
                active: !!(greekToggles && greekToggles[key]),
            });
        }

        const boxW = 110;
        const lineH = 18;
        const padX  = 10;
        const padY  = 8;
        const legendH = padY * 2 + items.length * lineH;
        const lx = cssW - MARGIN.right - boxW;
        const ly = MARGIN.top;

        ctx.save();
        ctx.fillStyle   = 'rgba(12,11,9,0.55)';
        ctx.strokeStyle = 'rgba(168,160,152,0.3)';
        ctx.lineWidth   = 1;
        _roundRect(ctx, lx, ly, boxW, legendH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.font         = '11px var(--font-body, sans-serif)';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const iy   = ly + padY + i * lineH + lineH / 2;

            // Swatch
            ctx.fillStyle   = item.color;
            ctx.globalAlpha = item.active ? 1 : 0.35;
            ctx.fillRect(lx + padX, iy - 4, 12, 8);

            // Label
            ctx.globalAlpha = item.active ? 1 : 0.35;
            ctx.fillStyle   = item.active ? '#E8DED4' : '#8A8278';
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
