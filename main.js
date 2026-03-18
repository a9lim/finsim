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
} from './src/portfolio.js';
import { ChartRenderer } from './src/chart.js';
import { StrategyRenderer } from './src/strategy.js';
import {
    cacheDOMElements, bindEvents, updateChainDisplay,
    updatePortfolioDisplay, updateGreeksDisplay, syncSettingsUI,
    toggleStrategyView, showMarginCall, showChainOverlay,
    showTradeDialog, updatePlayBtn, updateSpeedBtn,
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
        camera = createCamera({
            width:   $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800,
            height:  $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600,
            zoom:    1,
            minZoom: 0.1,
            maxZoom: 10,
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
        onChainCellClick: (info) => handleChainCellClick(info),
        onFullChainOpen:  () => showChainOverlay($, chain),
        onTradeSubmit:    (data) => handleTradeSubmit(data),
        onLiquidate:      () => handleLiquidate(),
        onDismissMargin:  () => { /* sim stays paused, overlay hidden by ui.js */ },
    });

    // 8. Wire custom events from ui.js position rows
    document.addEventListener('shoals:closePosition', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            closePosition(id, sim.S, Math.sqrt(Math.max(sim.v, 0)), sim.r, sim.day);
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:exerciseOption', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            exerciseOption(id, sim.S, sim.day);
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:cancelOrder', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            cancelOrder(id);
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
            _haptics.trigger('medium');
        };
    }

    // 10. Build initial chain and update UI
    chain = buildChain(sim.S, sim.v, sim.r, sim.day);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateSpeedBtn($, speed);
    updateUI();

    // 11. Wire window resize
    const onResize = typeof debounce !== 'undefined'
        ? debounce(() => {
            chart.resize();
            strategy.resize();
            if (camera) camera.setViewport(
                $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800,
                $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600
            );
            dirty = true;
        }, 150)
        : () => {
            chart.resize();
            strategy.resize();
            if (camera) camera.setViewport(
                $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800,
                $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600
            );
            dirty = true;
        };
    window.addEventListener('resize', onResize);

    // 12. Wire mousemove/mouseleave on chart canvas for crosshair
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

    // 13. Start animation loop
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// frame — rAF loop
// ---------------------------------------------------------------------------

function frame() {
    if (playing) {
        for (let i = 0; i < speed; i++) tick();
    }
    if (dirty) {
        dirty = false;
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
}

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

function togglePlay() {
    playing = !playing;
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
