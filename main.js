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
    updatePortfolioDisplay, updateGreeksDisplay, syncSettingsUI,
    toggleStrategyView, showMarginCall, showChainOverlay,
    showTradeDialog, updatePlayBtn, updateSpeedBtn,
    renderStrategyBuilder, wireInfoTips,
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
let sliderDTE = 30;

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

    // 5. Init swipe dismiss on sidebar for mobile
    if (typeof initSwipeDismiss !== 'undefined') {
        initSwipeDismiss($.sidebar, {
            onDismiss: () => { $.sidebar.classList.remove('open'); },
            handleSelector: '.sheet-handle',
        });
    }

    // 6. Init keyboard shortcuts
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

    // 7. Bind UI events
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
        onTimeSlider:     (dte) => { sliderDTE = dte; dirty = true; },
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

    // 8. Wire custom events from ui.js position rows
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

    // 9. Wire intro screen
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

    // 10. Wire info tips for slider labels
    wireInfoTips($);

    // 11. Build initial chain and update UI
    chain = buildChain(sim.S, sim.v, sim.r, sim.day);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateSpeedBtn($, speed);
    updateUI();

    // 12. Wire resize via ResizeObserver on chart container
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

    // 13. Wire mousemove/mouseleave on chart canvas for crosshair
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

    // 14. Start animation loop
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
            sim.r, sliderDTE, greekToggles
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
    updateStrategyBuilder();
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
    }
    dirty = true;
    _haptics.trigger('selection');
}

function loadPreset(index) {
    sim.reset(index);
    resetPortfolio();
    chain = buildChain(sim.S, sim.v, sim.r, sim.day);
    playing = false;
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateUI();
    dirty = true;
    _haptics.trigger('medium');
}

function resetSim() {
    sim.reset($.presetSelect.selectedIndex);
    resetPortfolio();
    chain = buildChain(sim.S, sim.v, sim.r, sim.day);
    playing = false;
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateUI();
    dirty = true;
    _haptics.trigger('heavy');
}

function syncSliderToSim(param, value) {
    sim[param] = value;
    dirty = true;
}

function handleBuyStock() {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const pos = executeMarketOrder('stock', 'long', 1, sim.S, vol, sim.r, sim.day);
    if (pos) {
        if (typeof showToast !== 'undefined') showToast('Bought 1 share at $' + sim.S.toFixed(2));
        _haptics.trigger('success');
    } else {
        if (typeof showToast !== 'undefined') showToast('Insufficient cash.');
        _haptics.trigger('error');
    }
    updateUI();
    dirty = true;
}

function handleShortStock() {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const pos = executeMarketOrder('stock', 'short', 1, sim.S, vol, sim.r, sim.day);
    if (pos) {
        if (typeof showToast !== 'undefined') showToast('Shorted 1 share at $' + sim.S.toFixed(2));
        _haptics.trigger('success');
    } else {
        if (typeof showToast !== 'undefined') showToast('Insufficient margin.');
        _haptics.trigger('error');
    }
    updateUI();
    dirty = true;
}

function handleBuyBond() {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const expiryDay = chain.length > 0 ? chain[0].day : sim.day + 21;
    const pos = executeMarketOrder('bond', 'long', 1, sim.S, vol, sim.r, sim.day, null, expiryDay);
    if (pos) {
        if (typeof showToast !== 'undefined') showToast('Bought 1 bond, expires day ' + expiryDay);
        _haptics.trigger('success');
    } else {
        if (typeof showToast !== 'undefined') showToast('Insufficient cash.');
        _haptics.trigger('error');
    }
    updateUI();
    dirty = true;
}

function handleShortBond() {
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const expiryDay = chain.length > 0 ? chain[0].day : sim.day + 21;
    const pos = executeMarketOrder('bond', 'short', 1, sim.S, vol, sim.r, sim.day, null, expiryDay);
    if (pos) {
        if (typeof showToast !== 'undefined') showToast('Shorted 1 bond, expires day ' + expiryDay);
        _haptics.trigger('success');
    } else {
        if (typeof showToast !== 'undefined') showToast('Insufficient margin.');
        _haptics.trigger('error');
    }
    updateUI();
    dirty = true;
}

function handleChainCellClick(info) {
    showTradeDialog($, {
        type:      info.type,
        strike:    info.strike,
        expiryDay: info.expiryDay,
    });
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
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const nearestExpiry = chain.length > 0 ? chain[0] : null;
    const expiryDay = nearestExpiry ? nearestExpiry.day : sim.day + 21;
    const atm = Math.round(sim.S / 5) * 5;

    const leg = {
        type,
        side: side || 'long',
        qty: 1,
    };
    if (type === 'call' || type === 'put') {
        leg.strike = atm;
        leg.expiryDay = expiryDay;
    }
    if (type === 'bond') {
        leg.expiryDay = expiryDay;
    }

    strategyLegs.push(leg);
    updateStrategyBuilder();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function handleRemoveLeg(index) {
    strategyLegs.splice(index, 1);
    updateStrategyBuilder();
    dirty = true;
}

function handleSaveStrategy() {
    if (strategyLegs.length === 0) return;
    const name = prompt('Strategy name:');
    if (!name || !name.trim()) return;
    saveStrategy(name.trim(), strategyLegs.map(l => ({ ...l })));
    if (typeof showToast !== 'undefined') showToast('Strategy "' + name.trim() + '" saved.');
    if (typeof _haptics !== 'undefined') _haptics.trigger('success');
}

function handleExecStrategy() {
    if (strategyLegs.length === 0) return;
    const vol = Math.sqrt(Math.max(sim.v, 0));
    const results = [];
    for (const leg of strategyLegs) {
        const pos = executeMarketOrder(
            leg.type, leg.side, leg.qty, sim.S, vol, sim.r, sim.day,
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
        ? strategy.computeSummary(strategyLegs, sim.S, vol, sim.r, sliderDTE)
        : null;
    renderStrategyBuilder($, strategyLegs, summary, handleRemoveLeg, chain, () => {
        updateStrategyBuilder();
        dirty = true;
    });
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
