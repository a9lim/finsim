/* =====================================================
   main.js -- Entry point for the Shoals trading simulator.

   Wires together DOM cache, simulation loop, camera,
   rendering, autoplay, and event handlers.
   ===================================================== */

import { SPEED_OPTIONS, PRESETS } from './src/config.js';
import { Simulation } from './src/simulation.js';
import { buildChain } from './src/chain.js';
import {
    portfolio, resetPortfolio, checkPendingOrders, processExpiry,
    checkMargin, aggregateGreeks, portfolioValue,
    executeMarketOrder, closePosition, exerciseOption,
    liquidateAll, placePendingOrder, cancelOrder,
    saveStrategy, executeStrategy,
} from './src/portfolio.js';
import { ChartRenderer } from './src/chart.js';
import { StrategyRenderer } from './src/strategy.js';
import {
    cacheDOMElements, bindEvents, updateChainDisplay,
    updatePortfolioDisplay, updateGreeksDisplay, updateRateDisplay,
    syncSettingsUI, toggleStrategyView, showMarginCall, showChainOverlay,
    updatePlayBtn, updateSpeedBtn,
    renderStrategyBuilder, wireInfoTips, updateStrategySelectors,
} from './src/ui.js';
import { initTheme, toggleTheme } from './src/theme.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const $ = {};
const sim = new Simulation();
let chart, strategy;
let camera;
let chain = [];
let playing = false;
let speed = 1;
let speedIndex = 0;
let strategyMode = false;
let dirty = true;
let lastTickTime = 0;
let mouseX = -1, mouseY = -1;
let strategyLegs = [];
let greekToggles = { delta: true, gamma: false, theta: false, vega: false, rho: false };
let sliderPct = 100;  // percentage of max DTE (100% = full time, 0% = at expiry)
let lastSpot = 0; // track spot changes for range reset

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

cacheDOMElements($);
initTheme();
init();

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

function init() {
    // 1. Create renderers
    chart    = new ChartRenderer($.chartCanvas);
    strategy = new StrategyRenderer($.strategyCanvas);

    // 2. Create camera for horizontal chart pan/zoom
    if (typeof createCamera !== 'undefined') {
        // Camera zoom = pixels per world unit. 1 world unit = 1 day.
        // Default zoom=12 → each day = 12 screen px. Range: 12 (100%) to 36 (300%).
        const DEFAULT_ZOOM = 12;
        const vpW = $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800;
        const vpH = $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600;
        // Position camera so day 0 starts near the left edge of the plot area
        // screenX = (worldX - cam.x) * zoom + vpW/2
        // We want worldX=0 at screenX ≈ 80 (left margin): cam.x = (vpW/2 - 80) / zoom
        const leftMargin = 80;
        camera = createCamera({
            width:   vpW,
            height:  vpH,
            x:       -(vpW / 2 - leftMargin) / DEFAULT_ZOOM,
            zoom:    DEFAULT_ZOOM,
            minZoom: DEFAULT_ZOOM,
            maxZoom: DEFAULT_ZOOM * 3,
            onUpdate: () => { dirty = true; },
        });

        // 3. Bind camera to chart canvas
        camera.bindWheel($.chartCanvas);
        camera.bindMousePan($.chartCanvas);
        camera.bindZoomButtons({
            zoomIn:  $.zoomInBtn,
            zoomOut: $.zoomOutBtn,
            reset:   $.zoomResetBtn,
            display: $.zoomLevel,
            formatZoom: (z) => Math.round(z / DEFAULT_ZOOM * 100) + '%',
        });

        // 4. Attach camera to chart renderer
        chart.setCamera(camera);
    }

    // 5. Bind strategy canvas wheel zoom
    strategy.bindWheel($.strategyCanvas);

    // 6. Bind click on strategy canvas for legend toggling
    $.strategyCanvas.addEventListener('click', (e) => {
        const rect = $.strategyCanvas.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        if (strategy.handleClick(cssX, cssY, greekToggles)) {
            dirty = true;
        }
    });

    // 7. Init swipe dismiss on sidebar for mobile
    if (typeof initSwipeDismiss !== 'undefined') {
        initSwipeDismiss($.sidebar, {
            onDismiss: () => { $.sidebar.classList.remove('open'); },
            handleSelector: '.sheet-handle',
        });
    }

    // 8. Init keyboard shortcuts
    if (typeof initShortcuts !== 'undefined') {
        initShortcuts([
            { key: ' ',  label: 'Play / Pause', group: 'Simulation', action: () => togglePlay() },
            { key: '.', label: 'Step forward',  group: 'Simulation', action: () => step() },
            { key: 's', label: 'Strategy view',  group: 'View',       action: () => toggleStrategy() },
            { key: 'b', label: 'Buy stock',      group: 'Trade',      action: () => handleBuyStock() },
            { key: 't', label: 'Toggle sidebar',  group: 'View',       action: () => toggleSidebar() },
            { key: 'r', label: 'Reset',           group: 'Simulation', action: () => resetSim() },
            { key: '1', label: PRESETS[0].name,   group: 'Presets',    action: () => loadPreset(0) },
            { key: '2', label: PRESETS[1].name,   group: 'Presets',    action: () => loadPreset(1) },
            { key: '3', label: PRESETS[2].name,   group: 'Presets',    action: () => loadPreset(2) },
            { key: '4', label: PRESETS[3].name,   group: 'Presets',    action: () => loadPreset(3) },
            { key: '5', label: PRESETS[4].name,   group: 'Presets',    action: () => loadPreset(4) },
        ], { helpTitle: 'Shoals Keyboard Shortcuts' });
    }

    // 9. Bind UI events
    bindEvents($, {
        onTogglePlay:     () => togglePlay(),
        onStep:           () => step(),
        onSpeedChange:    () => cycleSpeed(),
        onToggleTheme:    () => toggleTheme(),
        onToggleSidebar:  () => toggleSidebar(),
        onToggleStrategy: () => toggleStrategy(),
        onPresetChange:   (index) => loadPreset(index),
        onReset:          () => resetSim(),
        onSliderChange:   (param, value) => syncSliderToSim(param, value),
        onTimeSlider:     (pct) => { sliderPct = pct; dirty = true; },
        onBuyStock:       () => handleBuyStock(),
        onShortStock:     () => handleShortStock(),
        onBuyBond:        () => handleBuyBond(),
        onShortBond:      () => handleShortBond(),
        onChainCellClick: (info) => handleChainCellClick(info),
        onFullChainOpen:  () => showChainOverlay($, chain),
        onTradeSubmit:    (data) => handleTradeSubmit(data),
        onLiquidate:      () => handleLiquidate(),
        onDismissMargin:  () => { /* sim stays paused, overlay hidden by ui.js */ },
        onAddLeg:         (type, side) => handleAddLeg(type, side),
        onSaveStrategy:   () => handleSaveStrategy(),
        onExecStrategy:   () => handleExecStrategy(),
    });

    // 10. Wire custom events from ui.js position rows
    document.addEventListener('shoals:closePosition', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            const ok = closePosition(id, sim.S, Math.sqrt(Math.max(sim.v, 0)), sim.r, sim.day);
            if (ok && typeof showToast !== 'undefined') showToast('Position closed.');
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:exerciseOption', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            const result = exerciseOption(id, sim.S, sim.day);
            if (typeof showToast !== 'undefined') {
                showToast(result ? 'Option exercised.' : 'Cannot exercise.');
            }
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:cancelOrder', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            cancelOrder(id);
            if (typeof showToast !== 'undefined') showToast('Order cancelled.');
            updateUI();
            dirty = true;
        }
    });

    // 11. Wire intro screen
    if ($.introStart) {
        $.introStart.onclick = () => {
            if ($.introScreen) $.introScreen.classList.add('hidden');
            document.body.classList.add('app-ready');
            setTimeout(() => {
                if ($.introScreen && $.introScreen.parentNode) {
                    $.introScreen.remove();
                }
            }, 850);
            if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
        };
    }

    // 12. Wire info tips for slider labels
    wireInfoTips($);

    // 13. Generate historical data so chart isn't empty on load
    for (let i = 0; i < 60; i++) sim.tick();

    // 14. Build initial chain and update UI
    chain = buildChain(sim.S, sim.v, sim.r, sim.day);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateSpeedBtn($, speed);
    lastSpot = sim.S;
    strategy.resetRange(sim.S, strategyLegs);
    updateUI();

    // 15. Position camera so latest candle is visible
    if (camera) {
        const lastDay = sim.history.length - 1;
        const viewW = $.chartCanvas.clientWidth || $.chartCanvas.offsetWidth || 800;
        const leftMargin = 80;
        // Place latest candle at ~85% from left
        const targetScreenX = viewW * 0.85;
        // screenX = (worldX - cam.x) * zoom + vpW/2
        // cam.x = worldX - (targetScreenX - vpW/2) / zoom
        camera.x = (lastDay + 0.5) - (targetScreenX - viewW / 2) / camera.zoom;
    }

    // 16. Wire resize via ResizeObserver on chart container
    // This fires during CSS sidebar transition AND window resize.
    // We must redraw IMMEDIATELY after resize (same call stack) because
    // setting canvas.width clears the buffer — if we wait for the next
    // rAF frame, the user sees a blank flash.
    const chartContainer = document.getElementById('chart-container');
    function handleResize() {
        chart.resize();
        if (strategyMode) strategy.resize();
        if (camera) camera.setViewport(
            $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800,
            $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600
        );
        // Immediate redraw to avoid blank frame
        renderCurrentView();
        dirty = false; // already rendered this frame
    }
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(handleResize).observe(chartContainer);
    } else {
        window.addEventListener('resize', handleResize);
    }

    // 17. Wire mousemove/mouseleave on chart canvas for crosshair
    $.chartCanvas.addEventListener('mousemove', (e) => {
        const rect = $.chartCanvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        dirty = true;
    });
    $.chartCanvas.addEventListener('mouseleave', () => {
        mouseX = -1;
        mouseY = -1;
        dirty = true;
    });

    // 18. Wire tab switching to strategy mode
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isStrategy = btn.dataset.tab === 'strategy';
            if (isStrategy !== strategyMode) {
                strategyMode = isStrategy;
                toggleStrategyView($, strategyMode);
                if (strategyMode) strategy.resize();
                dirty = true;
            }
        });
    });

    // 19. Start animation loop
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// frame — rAF loop
// ---------------------------------------------------------------------------

/** Redraw the active canvas view. Called from frame() and handleResize(). */
function renderCurrentView() {
    if (strategyMode) {
        strategy.draw(
            strategyLegs, sim.S,
            Math.sqrt(Math.max(sim.v, 0)),
            sim.r, _pctToDTE(sliderPct), greekToggles
        );
    } else {
        chart.draw(
            sim.history, portfolio.positions,
            mouseX, mouseY,
            sim.history[sim.history.length - 1]
        );
    }
}

function frame(now) {
    if (playing) {
        const tickInterval = 1000 / speed;
        if (now - lastTickTime >= tickInterval) {
            tick();
            lastTickTime = now;
        }
    }
    // Check if strategy renderer flagged dirty from wheel zoom
    if (strategy._dirty) {
        strategy._dirty = false;
        dirty = true;
    }
    if (dirty) {
        dirty = false;
        renderCurrentView();
    }
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// tick — advance one trading day
// ---------------------------------------------------------------------------

function tick() {
    sim.tick();
    const vol = Math.sqrt(Math.max(sim.v, 0));

    checkPendingOrders(sim.S, vol, sim.r, sim.day);
    processExpiry(sim.day, sim.S, sim.day);

    chain = buildChain(sim.S, sim.v, sim.r, sim.day);

    // Check margin
    const margin = checkMargin(sim.S, vol, sim.r, sim.day);
    if (margin.triggered) {
        playing = false;
        updatePlayBtn($, playing);
        showMarginCall($, margin);
    }

    // Auto-scroll: keep latest candle near right edge when playing
    if (playing && camera) {
        const lastDay = sim.history.length - 1;
        const viewW = $.chartCanvas.clientWidth || 800;
        // Place latest candle at ~85% from left
        const targetWorldX = lastDay + 1;
        const rightEdgeWorld = camera.screenToWorld(viewW * 0.85, 0).x;
        if (targetWorldX > rightEdgeWorld) {
            const dx = targetWorldX - rightEdgeWorld;
            camera.panBy(-dx * camera.zoom, 0);
        }
    }

    // Reset strategy range if spot has changed significantly
    if (Math.abs(sim.S - lastSpot) / lastSpot > 0.01) {
        strategy.resetRange(sim.S, strategyLegs);
        lastSpot = sim.S;
    }

    updateUI();
    dirty = true;
}

// ---------------------------------------------------------------------------
// UI update helper
// ---------------------------------------------------------------------------

function updateUI() {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    updateChainDisplay($, chain);
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day);
    updateGreeksDisplay($, aggregateGreeks(sim.S, vol, sim.r, sim.day));
    updateRateDisplay($, sim.r);
    updateStrategySelectors($, chain, sim.S);
    updateStrategyBuilder();
    updateTimeSliderRange();
}

// ---------------------------------------------------------------------------
// Time slider range management
// ---------------------------------------------------------------------------

function _getMaxDTE() {
    let maxDTE = 0;
    for (const leg of strategyLegs) {
        if (leg.expiryDay != null) {
            const dte = leg.expiryDay - sim.day;
            if (dte > maxDTE) maxDTE = dte;
        }
    }
    return maxDTE;
}

function _pctToDTE(pct) {
    return Math.round(_getMaxDTE() * pct / 100);
}

function updateTimeSliderRange() {
    const maxDTE = _getMaxDTE();
    if (maxDTE > 0) {
        $.timeSlider.disabled = false;
    } else {
        $.timeSlider.disabled = true;
        sliderPct = 100;
        $.timeSlider.value = 100;
    }
    const dte = _pctToDTE(sliderPct);
    if ($.timeSliderLabel) $.timeSliderLabel.textContent = sliderPct + '% (' + dte + 'd)';
}

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

function togglePlay() {
    playing = !playing;
    if (playing) lastTickTime = performance.now();
    updatePlayBtn($, playing);
    _haptics.trigger(playing ? 'medium' : 'light');
}

function step() {
    if (!playing) {
        tick();
        _haptics.trigger('light');
    }
}

function cycleSpeed() {
    speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    speed = SPEED_OPTIONS[speedIndex];
    updateSpeedBtn($, speed);
    _haptics.trigger('selection');
}

function toggleSidebar() {
    $.sidebar.classList.toggle('open');
    const isOpen = $.sidebar.classList.contains('open');
    $.panelToggle.setAttribute('aria-expanded', String(isOpen));
    _haptics.trigger('light');
}

function toggleStrategy() {
    strategyMode = !strategyMode;
    toggleStrategyView($, strategyMode);
    if (strategyMode) {
        // Canvas was hidden (display:none) so clientWidth/Height were 0 — resize now
        strategy.resize();
        // Also switch to strategy tab in sidebar
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const stratTab = document.querySelector('[data-tab="strategy"]');
        const stratPanel = document.getElementById('tab-strategy');
        if (stratTab) stratTab.classList.add('active');
        if (stratPanel) stratPanel.classList.add('active');
        // Open sidebar if closed
        if (!$.sidebar.classList.contains('open')) {
            $.sidebar.classList.add('open');
            $.panelToggle.setAttribute('aria-expanded', 'true');
        }
    } else {
        // Switch back to trade tab when exiting strategy mode
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const tradeTab = document.querySelector('[data-tab="trade"]');
        const tradePanel = document.getElementById('tab-trade');
        if (tradeTab) tradeTab.classList.add('active');
        if (tradePanel) tradePanel.classList.add('active');
    }
    dirty = true;
    _haptics.trigger('selection');
}

function loadPreset(index) {
    sim.reset(index);
    resetPortfolio();
    // Generate historical data so chart isn't empty
    for (let i = 0; i < 60; i++) sim.tick();
    chain = buildChain(sim.S, sim.v, sim.r, sim.day);
    playing = false;
    lastSpot = sim.S;
    strategy.resetRange(sim.S, strategyLegs);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateUI();
    _repositionCamera();
    dirty = true;
    _haptics.trigger('medium');
}

function resetSim() {
    sim.reset($.presetSelect.selectedIndex);
    resetPortfolio();
    // Generate historical data so chart isn't empty
    for (let i = 0; i < 60; i++) sim.tick();
    chain = buildChain(sim.S, sim.v, sim.r, sim.day);
    playing = false;
    lastSpot = sim.S;
    strategy.resetRange(sim.S, strategyLegs);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateUI();
    _repositionCamera();
    dirty = true;
    _haptics.trigger('heavy');
}

function syncSliderToSim(param, value) {
    sim[param] = value;
    dirty = true;
}

function _getTradeQty() {
    return parseInt($.tradeQty?.value, 10) || 1;
}

function _getOrderType() {
    const active = $.orderTypeToggles?.querySelector('.mode-btn.active');
    return active ? active.dataset.ordertype : 'market';
}

function _getTriggerPrice() {
    return parseFloat($.triggerPrice?.value) || sim.S;
}

function _executeOrPlace(type, side, qty, strike, expiryDay) {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const orderType = _getOrderType();
    if (orderType === 'market') {
        const pos = executeMarketOrder(type, side, qty, sim.S, vol, sim.r, sim.day, strike, expiryDay);
        if (pos) {
            const label = side === 'short' ? 'Shorted' : 'Bought';
            if (typeof showToast !== 'undefined') showToast(label + ' ' + qty + ' ' + type + ' at $' + sim.S.toFixed(2));
            _haptics.trigger('success');
        } else {
            if (typeof showToast !== 'undefined') showToast('Insufficient funds/margin.');
            _haptics.trigger('error');
        }
    } else {
        const triggerPrice = _getTriggerPrice();
        placePendingOrder(type, side, qty, orderType, triggerPrice, strike, expiryDay);
        if (typeof showToast !== 'undefined') showToast('Pending ' + orderType + ' order placed for ' + qty + ' ' + type + '.');
        _haptics.trigger('medium');
    }
    updateUI();
    dirty = true;
}

function handleBuyStock() {
    _executeOrPlace('stock', 'long', _getTradeQty());
}

function handleShortStock() {
    _executeOrPlace('stock', 'short', _getTradeQty());
}

function handleBuyBond() {
    const expiryDay = chain.length > 0 ? chain[0].day : sim.day + 21;
    _executeOrPlace('bond', 'long', _getTradeQty(), null, expiryDay);
}

function handleShortBond() {
    const expiryDay = chain.length > 0 ? chain[0].day : sim.day + 21;
    _executeOrPlace('bond', 'short', _getTradeQty(), null, expiryDay);
}

function handleChainCellClick(info) {
    _executeOrPlace(info.type, info.side, _getTradeQty(), info.strike, info.expiryDay);
}

function handleTradeSubmit(data) {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const { type, side, qty, strike, expiryDay, orderType, limitPrice } = data;

    if (orderType === 'market') {
        const pos = executeMarketOrder(
            type, side, qty, sim.S, vol, sim.r, sim.day, strike, expiryDay
        );
        if (pos) {
            if (typeof showToast !== 'undefined') showToast('Order filled: ' + type + ' x' + qty);
            _haptics.trigger('success');
        } else {
            if (typeof showToast !== 'undefined') showToast('Order failed — insufficient funds.');
            _haptics.trigger('error');
        }
    } else {
        placePendingOrder(type, side, qty, orderType, limitPrice, strike, expiryDay);
        if (typeof showToast !== 'undefined') showToast('Pending ' + orderType + ' order placed.');
        _haptics.trigger('medium');
    }

    updateUI();
    dirty = true;
}

function handleLiquidate() {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    liquidateAll(sim.S, vol, sim.r, sim.day);
    resetPortfolio(portfolio.cash);
    updateUI();
    dirty = true;
    if (typeof showToast !== 'undefined') showToast('All positions liquidated.');
    _haptics.trigger('heavy');
}

// ---------------------------------------------------------------------------
// Strategy builder handlers
// ---------------------------------------------------------------------------

function handleAddLeg(type, side) {
    const absQty = parseInt($.strategyQty?.value, 10) || 1;
    const signedQty = side === 'short' ? -absQty : absQty;
    const strike = (type === 'call' || type === 'put')
        ? parseInt($.strategyStrike?.value) || Math.round(sim.S / 5) * 5
        : undefined;
    // Expiry slider gives DTE; find the closest chain expiry day
    const sliderDte = parseInt($.strategyExpiry?.value, 10) || 21;
    let expiryDay;
    if (type === 'call' || type === 'put' || type === 'bond') {
        // Find chain expiry closest to the slider DTE
        const targetDay = sim.day + sliderDte;
        if (chain.length > 0) {
            let best = chain[0];
            for (const exp of chain) {
                if (Math.abs(exp.day - targetDay) < Math.abs(best.day - targetDay)) best = exp;
            }
            expiryDay = best.day;
        } else {
            expiryDay = sim.day + sliderDte;
        }
    }

    // Find existing leg of same type/strike/expiry for netting
    const existing = strategyLegs.find(l =>
        l.type === type && l.strike === strike && l.expiryDay === expiryDay
    );

    if (existing) {
        existing.qty += signedQty;
        if (existing.qty === 0) {
            strategyLegs.splice(strategyLegs.indexOf(existing), 1);
        }
    } else {
        const leg = { type, qty: signedQty, strike, expiryDay };
        strategyLegs.push(leg);
    }

    strategy.resetRange(sim.S, strategyLegs);
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function handleRemoveLeg(index) {
    strategyLegs.splice(index, 1);
    strategy.resetRange(sim.S, strategyLegs);
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
}

function handleSaveStrategy() {
    if (strategyLegs.length === 0) return;
    const name = prompt('Strategy name:');
    if (!name || !name.trim()) return;
    // Convert signed qty to side/qty for portfolio storage
    const legsForSave = strategyLegs.map(l => ({
        ...l,
        side: l.qty < 0 ? 'short' : 'long',
        qty: Math.abs(l.qty),
    }));
    saveStrategy(name.trim(), legsForSave);
    if (typeof showToast !== 'undefined') showToast('Strategy "' + name.trim() + '" saved.');
    if (typeof _haptics !== 'undefined') _haptics.trigger('success');
}

function handleExecStrategy() {
    if (strategyLegs.length === 0) return;
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const results = [];
    for (const leg of strategyLegs) {
        const side = leg.qty < 0 ? 'short' : 'long';
        const absQty = Math.abs(leg.qty);
        const pos = executeMarketOrder(
            leg.type, side, absQty, sim.S, vol, sim.r, sim.day,
            leg.strike, leg.expiryDay
        );
        if (pos) results.push(pos);
    }
    if (results.length > 0) {
        if (typeof showToast !== 'undefined') showToast('Executed ' + results.length + ' leg(s).');
        if (typeof _haptics !== 'undefined') _haptics.trigger('success');
    } else {
        if (typeof showToast !== 'undefined') showToast('Execution failed -- insufficient funds.');
        if (typeof _haptics !== 'undefined') _haptics.trigger('error');
    }
    updateUI();
    dirty = true;
}

function updateStrategyBuilder() {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const summary = strategyLegs.length > 0
        ? strategy.computeSummary(strategyLegs, sim.S, vol, sim.r, _pctToDTE(sliderPct))
        : null;
    renderStrategyBuilder($, strategyLegs, summary, handleRemoveLeg, chain, () => {
        strategy.resetRange(sim.S, strategyLegs);
        updateStrategyBuilder();
        dirty = true;
    });
}

// ---------------------------------------------------------------------------
// Helper: reposition camera so latest candle is near the right edge
// ---------------------------------------------------------------------------

function _repositionCamera() {
    if (!camera) return;
    const lastDay = sim.history.length - 1;
    const viewW = $.chartCanvas.clientWidth || $.chartCanvas.offsetWidth || 800;
    const targetScreenX = viewW * 0.85;
    camera.x = (lastDay + 0.5) - (targetScreenX - viewW / 2) / camera.zoom;
}

// ---------------------------------------------------------------------------
// Helper: build a settings object matching syncSettingsUI expectations
// ---------------------------------------------------------------------------

function _simSettingsObj() {
    return {
        presetIndex: $.presetSelect.selectedIndex,
        params: {
            mu:     sim.mu,
            theta:  sim.theta,
            kappa:  sim.kappa,
            xi:     sim.xi,
            rho:    sim.rho,
            lambda: sim.lambda,
            muJ:    sim.muJ,
            sigmaJ: sim.sigmaJ,
            a:      sim.a,
            b:      sim.b,
            sigmaR: sim.sigmaR,
        },
        initialCapital: portfolio.initialCapital,
    };
}
