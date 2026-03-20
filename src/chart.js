/* ===================================================
   chart.js — Canvas 2D candlestick chart renderer
   for the Shoals trading simulator.

   Renders OHLC candles, axes, grid, crosshair,
   position entry markers, and option strike lines.
   Uses the shared camera module for horizontal
   zoom/pan; Y-axis auto-scales to visible range.
   =================================================== */

export class ChartRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.camera = null;

        // Logical (CSS) dimensions — updated by resize()
        this.width  = 0;
        this.height = 0;

        // Live candle lerp state
        this._lerp = {
            day: -1, close: 0, high: 0, low: 0,
            _targetClose: 0, _targetHigh: 0, _targetLow: 0,
        };
        this._lerpSpeed = 15;   // higher = snappier response
        this._lastFrameTime = 0;

        // Axis gutter sizes (CSS px)
        this.Y_AXIS_W  = 64;   // right-side Y-axis label area
        this.Y_LABEL_W = 18;   // left-side rotated Y-axis label
        this.X_AXIS_H  = 32;   // bottom X-axis label area
        this.PADDING_T = 24;   // top padding above chart area

        // Candle sizing: each day occupies SLOT_PX screen pixels at zoom=1
        this.SLOT_PX = 12;     // px per day at zoom=1 (body + gap)
        this.BODY_RATIO = 0.6; // fraction of slot that is candle body

        this._dpr = window.devicePixelRatio || 1;
        this.resize();
    }

    /* -----------------------------------------------
       setCamera(camera)
       Store reference to the shared camera object.
    ----------------------------------------------- */
    setCamera(camera) {
        this.camera = camera;
    }

    /* -----------------------------------------------
       resize()
       Sync canvas buffer size with CSS size * DPR.
       Call on window resize and after panel layout
       changes.
    ----------------------------------------------- */
    resize() {
        const dpr = window.devicePixelRatio || 1;
        this._dpr = dpr;

        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width  || this.canvas.offsetWidth  || 800;
        const h = rect.height || this.canvas.offsetHeight || 600;

        const newBufW = Math.round(w * dpr);
        const newBufH = Math.round(h * dpr);

        // Only reset canvas buffer if size actually changed
        // (setting canvas.width clears the canvas, causing flash)
        if (this.canvas.width !== newBufW || this.canvas.height !== newBufH) {
            this.canvas.width  = newBufW;
            this.canvas.height = newBufH;
        }

        this.width  = w;
        this.height = h;

        // Set DPR transform — draw() uses CSS-px coordinates
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Keep camera viewport in sync
        if (this.camera) {
            this.camera.setViewport(w, h);
        }
    }

    /* -----------------------------------------------
       update(now)
       Advance lerp state toward the live candle's
       actual values. Call once per frame before draw().
       @param {number} now  performance.now() timestamp
    ----------------------------------------------- */
    update(now) {
        const dt = this._lastFrameTime > 0
            ? Math.min((now - this._lastFrameTime) / 1000, 0.1) // cap at 100ms
            : 0;
        this._lastFrameTime = now;

        const L = this._lerp;
        if (L.day < 0) return; // no live candle yet

        const alpha = 1 - Math.exp(-this._lerpSpeed * dt);
        L.close += (L._targetClose - L.close) * alpha;
        // High/low are water marks of the lerped close path
        if (L.close > L.high) L.high = L.close;
        if (L.close < L.low)  L.low  = L.close;
    }

    /* -----------------------------------------------
       setLiveCandle(bar)
       Update the lerp targets from the current partial
       bar. If the day changed, snap instead of lerp.
       @param {Object} bar  The partial/live bar
    ----------------------------------------------- */
    setLiveCandle(bar) {
        if (!bar) return;
        const L = this._lerp;
        if (L.day !== bar.day) {
            // Finish previous day: snap close to its final target
            // so the last substep value is actually reached
            if (L.day >= 0) {
                L.close = L._targetClose;
                if (L.close > L.high) L.high = L.close;
                if (L.close < L.low)  L.low  = L.close;
            }
            // New day — snap to open price
            L.day   = bar.day;
            L.close = bar.open;
            L.high  = bar.open;
            L.low   = bar.open;
        } else {
            // New substep — snap close to previous target so every
            // substep value is visited, then water-mark high/low
            L.close = L._targetClose;
            if (L.close > L.high) L.high = L.close;
            if (L.close < L.low)  L.low  = L.close;
        }
        L._targetClose = bar.close;
        L._targetHigh = bar.high;
        L._targetLow  = bar.low;
    }

    /* -----------------------------------------------
       draw(history, positions, mouseX, mouseY, latestBar)

       @param {Object[]} history     Array of OHLC bar objects
                                     { day, open, high, low, close, v, r }
       @param {Object[]} positions   Portfolio positions array
                                     { type, side, qty, entryDay, strike?, expiryDay?, … }
       @param {number}   mouseX      Mouse X in CSS px, or <0 to hide crosshair
       @param {number}   mouseY      Mouse Y in CSS px, or <0 to hide crosshair
       @param {Object}   [latestBar] The most-recently-added bar (used for current-price line)
    ----------------------------------------------- */
    draw(history, positions, mouseX, mouseY, latestBar) {
        const ctx = this.ctx;
        const dpr = this._dpr;

        // Resolve theme-sensitive colors
        const theme     = document.documentElement.dataset.theme || 'light';
        const isDark    = theme === 'dark';
        const palette   = _PALETTE;
        const textMuted = isDark ? palette.dark.textMuted    : palette.light.textMuted;
        const textSec   = isDark ? palette.dark.textSecondary: palette.light.textSecondary;
        // Layout constants
        const W   = this.width;
        const H   = this.height;
        const yAW = this.Y_AXIS_W;    // Y-axis gutter on right
        const yLW = this.Y_LABEL_W;   // Y-axis label on left
        const xAH = this.X_AXIS_H;    // X-axis gutter at bottom
        const pT  = this.PADDING_T;   // top padding

        // Chart plot area (in CSS px, within the full canvas)
        const plotX = yLW;
        const plotY = pT;
        const plotW = W - yAW - yLW;
        const plotH = H - pT - xAH;

        // Clear (DPR transform already set by resize())
        ctx.clearRect(0, 0, W, H);

        if (!history || history.length === 0 || history.size === 0) {
            ctx.fillStyle = textMuted;
            ctx.font      = `13px var(--font-body, sans-serif)`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Awaiting market data\u2026', W / 2, H / 2);
            return;
        }

        // ── 1. Compute visible day range from camera ──────────────
        // Camera's world X corresponds to day index (day 0 = world X 0,
        // each day is 1 world unit wide). The camera's worldToScreen maps
        // world X to screen pixel X within plotW.
        // We use screenToWorld to find the left/right visible world X,
        // then clamp to [0, history.length-1].

        const cam = this.camera;

        // Camera zoom = pixels per world unit (1 world unit = 1 day).
        // Candle body is BODY_RATIO of the slot width.
        const zoom = cam ? cam.zoom : this.SLOT_PX;
        const candleWidthRaw = Math.max(2, Math.min(40, zoom * this.BODY_RATIO));

        // Map between screen X and day index.
        // We place day `d` candle centered at screen X:  plotX + (d * slotPx) + offset
        // where offset comes from camera pan.
        // Using camera: screenX for day d center:
        //   worldToScreen(d + 0.5)  → gives screen px in viewport coords
        // But camera was sized to the full canvas (W x H). The plot area
        // starts at plotX=0 so screen coords are directly usable in plotX range.

        // Buffer bounds (works for both HistoryBuffer and plain array)
        const hMinDay = history.minDay != null ? history.minDay : 0;
        const hMaxDay = history.maxDay != null ? history.maxDay : history.length - 1;

        let firstDay, lastDay;

        if (cam) {
            const worldLeft  = cam.screenToWorldX ? cam.screenToWorldX(plotX) : cam.screenToWorld(plotX, 0).x;
            const worldRight = cam.screenToWorldX ? cam.screenToWorldX(plotX + plotW) : cam.screenToWorld(plotX + plotW, 0).x;
            firstDay = Math.max(hMinDay, Math.floor(worldLeft)   - 1);
            lastDay  = Math.min(hMaxDay, Math.ceil(worldRight));
        } else {
            firstDay = hMinDay;
            lastDay  = hMaxDay;
        }

        if (firstDay > lastDay) return;

        // Collect visible bars via .get() (ring buffer) or direct index (array)
        const _get = typeof history.get === 'function'
            ? (d) => history.get(d)
            : (d) => history[d];

        // ── 2. Auto-scale Y (logarithmic) ──────────────────────────
        let minPrice =  Infinity;
        let maxPrice = -Infinity;
        for (let d = firstDay; d <= lastDay; d++) {
            const bar = _get(d);
            if (!bar) continue;
            if (bar.low  < minPrice) minPrice = bar.low;
            if (bar.high > maxPrice) maxPrice = bar.high;
        }

        // Floor to avoid log(0)
        if (minPrice <= 0) minPrice = 0.01;
        if (maxPrice <= minPrice) maxPrice = minPrice * 1.02;

        const logMin = Math.log(minPrice);
        const logMax = Math.log(maxPrice);
        const logRange = logMax - logMin;
        const padFrac  = 0.10;
        const logLo    = logMin - logRange * padFrac;
        const logHi    = logMax + logRange * padFrac;
        const logDelta = logHi - logLo;

        // Actual price bounds for labels/grid (exponentiated back)
        const priceLo = Math.exp(logLo);
        const priceHi = Math.exp(logHi);

        // Convert price → Y pixel (logarithmic scale)
        const priceToY = (price) => {
            const lp = Math.log(Math.max(price, 1e-10));
            return plotY + plotH - ((lp - logLo) / logDelta) * plotH;
        };

        // ── 3. Draw grid ─────────────────────────────────────────
        ctx.save();
        ctx.beginPath();
        // Clip grid lines to plot area
        ctx.rect(plotX, plotY, plotW, plotH);
        ctx.clip();

        // Horizontal grid lines at nice price intervals (log-aware)
        const linearRange = Math.exp(logHi) - Math.exp(logLo);
        const priceInterval = _niceInterval(linearRange, 6);
        const priceStart    = Math.ceil(priceLo / priceInterval) * priceInterval;

        const gridColor = isDark
            ? _r(palette.dark.text,  0.06)
            : _r(palette.light.text, 0.06);

        ctx.strokeStyle = gridColor;
        ctx.lineWidth   = 1;

        for (let p = priceStart; p <= priceHi + priceInterval * 0.01; p += priceInterval) {
            const py = Math.round(priceToY(p)) + 0.5;
            if (py < plotY || py > plotY + plotH) continue;
            ctx.beginPath();
            ctx.moveTo(plotX, py);
            ctx.lineTo(plotX + plotW, py);
            ctx.stroke();
        }

        // Vertical grid lines every N days (targeting ~5–8 vertical lines)
        const visibleDays = lastDay - firstDay + 1;
        let dayInterval   = _niceInterval(visibleDays, 6);
        if (dayInterval < 1) dayInterval = 1;
        const dayStart = Math.ceil(firstDay / dayInterval) * dayInterval;

        if (cam) {
            for (let d = dayStart; d <= lastDay + dayInterval; d += dayInterval) {
                const sx = Math.round(cam.worldToScreenX ? cam.worldToScreenX(d) : cam.worldToScreen(d, 0).x) + 0.5;
                if (sx < plotX || sx > plotX + plotW) continue;
                ctx.beginPath();
                ctx.moveTo(sx, plotY);
                ctx.lineTo(sx, plotY + plotH);
                ctx.stroke();
            }
        }

        ctx.restore();

        // ── 4. Draw candles ──────────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.rect(plotX, plotY, plotW, plotH);
        ctx.clip();

        const upWicks = [], downWicks = [], upBodies = [], downBodies = [];
        const liveDay = this._lerp.day;

        for (let i = firstDay; i <= lastDay; i++) {
            const bar = _get(i);
            if (!bar) continue;
            let bHigh, bLow, bClose;
            if (i === liveDay && liveDay >= 0) {
                bHigh = this._lerp.high; bLow = this._lerp.low; bClose = this._lerp.close;
            } else {
                bHigh = bar.high; bLow = bar.low; bClose = bar.close;
            }
            const isUp = bClose >= bar.open;
            let cx;
            if (cam) { cx = cam.worldToScreenX ? cam.worldToScreenX(i + 0.5) : cam.worldToScreen(i + 0.5, 0).x; }
            else { cx = plotX + ((i + 0.5) / history.length) * plotW; }
            const yHigh = priceToY(bHigh), yLow = priceToY(bLow);
            const yOpen = priceToY(bar.open), yClose = priceToY(bClose);
            const yTop = Math.min(yOpen, yClose), yBot = Math.max(yOpen, yClose);
            const bodyH = Math.max(1, yBot - yTop);
            const bodyLeft = cx - candleWidthRaw / 2;
            (isUp ? upWicks : downWicks).push(cx, yHigh, yLow);
            (isUp ? upBodies : downBodies).push(bodyLeft, yTop, candleWidthRaw, bodyH);
        }

        for (const [wicks, bodies, color] of [[upWicks, upBodies, palette.up], [downWicks, downBodies, palette.down]]) {
            if (wicks.length === 0) continue;
            ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
            for (let j = 0; j < wicks.length; j += 3) {
                ctx.moveTo(wicks[j], wicks[j + 1]); ctx.lineTo(wicks[j], wicks[j + 2]);
            }
            ctx.stroke();
            ctx.fillStyle = color;
            for (let j = 0; j < bodies.length; j += 4) {
                ctx.fillRect(bodies[j], bodies[j + 1], bodies[j + 2], bodies[j + 3]);
            }
        }

        ctx.restore();

        // ── 5. Current price line ─────────────────────────────────
        const lastBar = latestBar
            || (typeof history.last === 'function' ? history.last() : history[history.length - 1]);
        if (lastBar) {
            // Use lerped close for the live candle's price line
            const priceLineClose = (liveDay >= 0 && lastBar.day === liveDay)
                ? this._lerp.close
                : lastBar.close;
            const yLast = priceToY(priceLineClose);
            if (yLast >= plotY && yLast <= plotY + plotH) {
                ctx.save();
                ctx.strokeStyle = palette.accent;
                ctx.lineWidth   = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(plotX, yLast);
                ctx.lineTo(plotX + plotW, yLast);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // ── 6. Position entry markers ─────────────────────────────
        // Draw small triangles at each position's entry candle
        if (positions && positions.length > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();

            for (const pos of positions) {
                const d = pos.entryDay;
                if (d < hMinDay || d > hMaxDay) continue;
                const bar = _get(d);
                if (!bar) continue;

                let cx;
                if (cam) {
                    cx = cam.worldToScreenX ? cam.worldToScreenX(d + 0.5) : cam.worldToScreen(d + 0.5, 0).x;
                } else {
                    cx = plotX + ((d + 0.5) / history.length) * plotW;
                }
                if (cx < plotX - 6 || cx > plotX + plotW + 6) continue;

                const isLong = pos.qty > 0;
                const markerColor = isLong ? palette.up : palette.down;

                if (isLong) {
                    // Upward triangle below the low
                    const baseY = priceToY(bar.low) + 10;
                    _drawTriangle(ctx, cx, baseY, 5, 'up', markerColor);
                } else {
                    // Downward triangle above the high
                    const baseY = priceToY(bar.high) - 10;
                    _drawTriangle(ctx, cx, baseY, 5, 'down', markerColor);
                }
            }

            ctx.restore();
        }

        // ── 7. Strike lines for open option positions ─────────────
        const openOptions = positions
            ? positions.filter(p => (p.type === 'call' || p.type === 'put') && p.strike != null)
            : [];

        if (openOptions.length > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();

            const strikeDash = [6, 3];
            ctx.lineWidth   = 1;
            ctx.font        = `11px var(--font-mono, monospace)`;
            ctx.textBaseline = 'bottom';

            // Deduplicate strike levels to avoid drawing duplicate lines
            const drawnStrikes = new Set();

            for (const pos of openOptions) {
                const strike = pos.strike;
                if (drawnStrikes.has(strike)) continue;
                drawnStrikes.add(strike);

                const ys = priceToY(strike);
                if (ys < plotY || ys > plotY + plotH) continue;

                const py = Math.round(ys) + 0.5;

                // Color by call/put
                const lineColor = pos.type === 'call' ? (palette.call || palette.up) : (palette.put || palette.down);
                ctx.strokeStyle = lineColor + '99'; // semi-transparent
                ctx.setLineDash(strikeDash);
                ctx.beginPath();
                ctx.moveTo(plotX, py);
                ctx.lineTo(plotX + plotW, py);
                ctx.stroke();
                ctx.setLineDash([]);

                // Label
                ctx.fillStyle  = lineColor;
                ctx.textAlign  = 'left';
                ctx.fillText(`$${strike.toFixed(2)}`, plotX + 4, py - 2);
            }

            ctx.restore();
        }

        // ── 8. Y-axis labels ──────────────────────────────────────
        ctx.save();
        ctx.font        = `11px var(--font-mono, monospace)`;
        ctx.fillStyle   = textSec;
        ctx.textAlign   = 'right';
        ctx.textBaseline = 'middle';

        for (let p = priceStart; p <= priceHi + priceInterval * 0.01; p += priceInterval) {
            const py = priceToY(p);
            if (py < plotY - 8 || py > plotY + plotH + 8) continue;
            const label = _formatPrice(p);
            ctx.fillText(label, W - 4, py);
        }

        ctx.restore();

        // ── 8b. Y-axis rotated label "Price ($)" ────────────────
        ctx.save();
        ctx.fillStyle    = textMuted;
        ctx.font         = `11px var(--font-body, sans-serif)`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(10, plotY + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Price ($)', 0, 0);
        ctx.restore();

        // ── 9. X-axis labels ──────────────────────────────────────
        ctx.save();
        ctx.font        = `11px var(--font-mono, monospace)`;
        ctx.fillStyle   = textMuted;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'top';

        const xAxisY = plotY + plotH + 6;

        if (cam) {
            for (let d = dayStart; d <= lastDay + dayInterval; d += dayInterval) {
                const sx = cam.worldToScreenX ? cam.worldToScreenX(d) : cam.worldToScreen(d, 0).x;
                if (sx < plotX + 20 || sx > plotX + plotW - 20) continue;
                ctx.fillText(`D${d}`, sx, xAxisY);
            }
        }

        ctx.restore();

        // ── 10. Crosshair ─────────────────────────────────────────
        const inPlot = mouseX >= 0
            && mouseX >= plotX && mouseX <= plotX + plotW
            && mouseY >= plotY && mouseY <= plotY + plotH;

        if (mouseX >= 0 && inPlot) {
            const crossColor = isDark
                ? _r(palette.dark.text,  0.25)
                : _r(palette.light.text, 0.25);

            ctx.save();
            ctx.strokeStyle = crossColor;
            ctx.lineWidth   = 1;
            ctx.setLineDash([3, 3]);

            // Vertical line
            const vx = Math.round(mouseX) + 0.5;
            ctx.beginPath();
            ctx.moveTo(vx, plotY);
            ctx.lineTo(vx, plotY + plotH);
            ctx.stroke();

            // Horizontal line
            const hy = Math.round(mouseY) + 0.5;
            ctx.beginPath();
            ctx.moveTo(plotX, hy);
            ctx.lineTo(plotX + plotW, hy);
            ctx.stroke();

            ctx.setLineDash([]);

            // Price label on Y-axis (log scale: invert priceToY)
            const hoverLogP = logLo + ((plotY + plotH - mouseY) / plotH) * logDelta;
            const hoverPrice = Math.exp(hoverLogP);
            const priceLabelW = yAW - 4;
            const priceLabelH = 18;
            const priceLabelX = plotX + plotW;
            const priceLabelY = Math.round(mouseY) - priceLabelH / 2;

            ctx.fillStyle = palette.accent;
            ctx.fillRect(priceLabelX, priceLabelY, priceLabelW, priceLabelH);
            ctx.fillStyle = '#FFFFFF';
            ctx.font        = `11px var(--font-mono, monospace)`;
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                _formatPrice(hoverPrice),
                priceLabelX + priceLabelW / 2,
                priceLabelY + priceLabelH / 2
            );

            // Day label on X-axis
            let hoverDay = -1;
            if (cam) {
                hoverDay = Math.floor(cam.screenToWorldX ? cam.screenToWorldX(mouseX) : cam.screenToWorld(mouseX, 0).x);
            }

            if (hoverDay >= hMinDay && hoverDay <= hMaxDay) {
                const dayLabelW = 36;
                const dayLabelH = 18;
                const dayLabelX = Math.round(mouseX) - dayLabelW / 2;
                const dayLabelY = plotY + plotH;

                ctx.fillStyle = palette.accent;
                ctx.fillRect(dayLabelX, dayLabelY, dayLabelW, dayLabelH);
                ctx.fillStyle = '#FFFFFF';
                ctx.font        = `11px var(--font-mono, monospace)`;
                ctx.textAlign   = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`D${hoverDay}`, dayLabelX + dayLabelW / 2, dayLabelY + dayLabelH / 2);
            }

            ctx.restore();
        }

    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Choose a "nice" grid interval for `range` spread across `targetCount` ticks.
 * Rounds to the nearest value from {1, 2, 2.5, 5} * 10^n.
 *
 * @param {number} range        Total span to cover
 * @param {number} targetCount  Desired approximate number of intervals
 * @returns {number}
 */
function _niceInterval(range, targetCount) {
    if (range <= 0 || targetCount <= 0) return 1;
    const rough    = range / targetCount;
    const exponent = Math.floor(Math.log10(rough));
    const base     = Math.pow(10, exponent);
    const mantissa = rough / base;

    let nice;
    if      (mantissa <= 1.0) nice = 1;
    else if (mantissa <= 2.0) nice = 2;
    else if (mantissa <= 2.5) nice = 2.5;
    else if (mantissa <= 5.0) nice = 5;
    else                       nice = 10;

    return nice * base;
}

/**
 * Format a price value for axis labels.
 * Shows enough decimal places to distinguish nearby tick marks.
 *
 * @param {number} price
 * @returns {string}
 */
function _formatPrice(price) {
    if (price >= 1000) return `$${price.toFixed(0)}`;
    if (price >= 100)  return `$${price.toFixed(1)}`;
    if (price >= 10)   return `$${price.toFixed(2)}`;
    return `$${price.toFixed(3)}`;
}

/**
 * Draw a filled triangle marker.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx       Center X
 * @param {number} baseY    Y of the widest edge (point of triangle is above/below)
 * @param {number} size     Half-width of the base
 * @param {'up'|'down'} dir
 * @param {string}  color
 */
function _drawTriangle(ctx, cx, baseY, size, dir, color) {
    ctx.beginPath();
    ctx.fillStyle = color;
    if (dir === 'up') {
        ctx.moveTo(cx,         baseY - size * 1.5);
        ctx.lineTo(cx - size,  baseY);
        ctx.lineTo(cx + size,  baseY);
    } else {
        ctx.moveTo(cx,         baseY + size * 1.5);
        ctx.lineTo(cx - size,  baseY);
        ctx.lineTo(cx + size,  baseY);
    }
    ctx.closePath();
    ctx.fill();
}
