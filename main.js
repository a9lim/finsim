/* =====================================================
   main.js -- Entry point for the Shoals trading simulator.

   Wires together DOM cache, simulation loop, camera,
   rendering, autoplay, and event handlers.
   ===================================================== */

import { SPEED_OPTIONS, PRESETS, INTRADAY_STEPS, BOND_FACE_VALUE, HISTORY_CAPACITY, QUARTERLY_CYCLE, CHART_SLOT_PX, CHART_LEFT_MARGIN, CHART_AUTOSCROLL_PCT, DEFAULT_PRESET } from './src/config.js';
import { Simulation } from './src/simulation.js';
import { buildChainSkeleton, priceChainExpiry, ExpiryManager } from './src/chain.js';
import {
    portfolio, resetPortfolio, checkPendingOrders, processExpiry,
    chargeBorrowInterest, processDividends, checkMargin, aggregateGreeks,
    executeMarketOrder, closePosition, exerciseOption,
    liquidateAll, placePendingOrder, cancelOrder,
    computeBidAsk,
} from './src/portfolio.js';
import { ChartRenderer } from './src/chart.js';
import { StrategyRenderer } from './src/strategy.js';
import {
    cacheDOMElements, bindEvents, updateChainDisplay,
    rebuildTradeDropdown, rebuildStrategyDropdown,
    updatePortfolioDisplay, updateGreeksDisplay, updateRateDisplay, updateStockBondPrices,
    syncSettingsUI, toggleStrategyView, showMarginCall, showChainOverlay,
    updatePlayBtn, updateSpeedBtn,
    renderStrategyBuilder, wireInfoTips, updateStrategySelectors, updateStrategyChainDisplay,
    updateDynamicSections, updateEventLog, updateCongressDiagrams,
    refreshTooltip,
    updateStrategyDropdowns, updateCreditDebit,
} from './src/ui.js';
import { initTheme, toggleTheme } from './src/theme.js';
import { EventEngine } from './src/events.js';
import { LLMEventSource } from './src/llm.js';
import { generateEpilogue } from './src/epilogue.js';
import { computePositionValue } from './src/position-value.js';
import { posKey } from './src/chain-renderer.js';
import { REFERENCE } from './src/reference.js';
import { syncMarket, market } from './src/market.js';
import {
    listStrategies, getStrategy, saveStrategy, deleteStrategy,
    resolveLegs, computeNetCost, legsToRelative, nextAutoName,
} from './src/strategy-store.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const $ = {};
const sim = new Simulation();
const expiryMgr = new ExpiryManager();
let chart, strategy;
let camera;
let chainSkeleton = [];
let playing = false;
let speedIndex = 2;
let strategyMode = false;
let dirty = true;
let chainDirty = true;
let lastTickTime = 0;
let dayInProgress = false; // true between beginDay() and finalizeDay()
let mouseX = -1, mouseY = -1;
let strategyLegs = [];
let currentStrategyHash = null;
let isBuiltinLoaded = false;
let activeTab = 'trade';
let greekToggles = { delta: true, gamma: false, theta: false, vega: false, rho: false };
let sliderPct = 100;  // percentage of max DTE (100% = full time, 0% = at expiry)
let lastSpot = 0; // track spot changes for range reset
let eventEngine = null;  // EventEngine instance (null when not in Dynamic mode)
let llmSource = null;     // LLMEventSource singleton
let rateHistory = null;   // sparkline ring buffer for risk-free rate

// ---------------------------------------------------------------------------
// Rate sparkline helpers
// ---------------------------------------------------------------------------

function _initRateHistory() {
    rateHistory = createSparkHistory(HISTORY_CAPACITY);
    const h = sim.history;
    for (let d = h.minDay; d <= h.maxDay; d++) {
        const bar = h.get(d);
        if (bar) pushSparkSample(rateHistory, bar.r);
    }
}

// ---------------------------------------------------------------------------
// Position map builders (for chain pill indicators)
// ---------------------------------------------------------------------------

function _buildPosMap() {
    const map = {};
    for (const pos of portfolio.positions) {
        const key = posKey(pos.type, pos.strike, pos.expiryDay);
        map[key] = (map[key] || 0) + pos.qty;
    }
    return map;
}

function _buildStrategyPosMap() {
    const map = {};
    for (const leg of strategyLegs) {
        const key = posKey(leg.type, leg.strike, leg.expiryDay);
        map[key] = (map[key] || 0) + leg.qty;
    }
    return map;
}

// ---------------------------------------------------------------------------
// Lazy chain pricing helpers
// ---------------------------------------------------------------------------

/** Get the selected trade-tab expiry index, clamped to skeleton bounds. */
function _tradeExpiryIdx() {
    const raw = parseInt($.tradeExpiry?.value, 10);
    return Math.min(Math.max((isNaN(raw) ? chainSkeleton.length - 1 : raw), 0), chainSkeleton.length - 1);
}

/** Get the selected strategy-tab expiry index, clamped to skeleton bounds. */
function _strategyExpiryIdx() {
    const raw = parseInt($.strategyExpiry?.value, 10);
    return Math.min(Math.max((isNaN(raw) ? chainSkeleton.length - 1 : raw), 0), chainSkeleton.length - 1);
}

/** Price one skeleton expiry on demand (price-only, no greeks). */
function _priceExpiry(idx) {
    if (idx < 0 || idx >= chainSkeleton.length) return null;
    return priceChainExpiry(sim.S, sim.v, sim.r, chainSkeleton[idx], false, sim.q);
}

/** Price one skeleton expiry with full greeks (for overlay). */
function _priceExpiryGreeks(idx) {
    if (idx < 0 || idx >= chainSkeleton.length) return null;
    return priceChainExpiry(sim.S, sim.v, sim.r, chainSkeleton[idx], true, sim.q);
}

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
        const DEFAULT_ZOOM = CHART_SLOT_PX;
        const vpW = $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800;
        const vpH = $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600;
        camera = createCamera({
            width:   vpW,
            height:  vpH,
            x:       -(vpW / 2 - CHART_LEFT_MARGIN) / DEFAULT_ZOOM,
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
            onReset: () => {
                camera.zoom = DEFAULT_ZOOM;
                _repositionCamera();
            },
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

    // 7. Init sidebar (toggle, close, swipe dismiss)
    _toolbar.initSidebar($.panelToggle, $.sidebar, $.closePanel);

    // 8. Init keyboard shortcuts
    if (typeof initShortcuts !== 'undefined') {
        initShortcuts([
            { key: ' ',  label: 'Play / Pause', group: 'Simulation', action: () => togglePlay() },
            { key: '.', label: 'Step forward',  group: 'Simulation', action: () => step() },
            { key: 's', label: 'Strategy view',  group: 'View',       action: () => {
                if (!$.sidebar.classList.contains('open')) {
                    _toolbar.toggleSidebar($.panelToggle, $.sidebar);
                }
                const tab = document.querySelector('[data-tab="strategy"]');
                if (tab) tab.click();
            } },
            { key: 'b', label: 'Buy stock',      group: 'Trade',      action: () => handleBuyStock() },
            { key: 't', label: 'Toggle sidebar',  group: 'View',       action: () => { _toolbar.toggleSidebar($.panelToggle, $.sidebar); if (typeof _haptics !== 'undefined') _haptics.trigger('light'); } },
            { key: 'r', label: 'Reset',           group: 'Simulation', action: () => resetSim() },
            { key: '1', label: PRESETS[0].name,   group: 'Presets',    action: () => loadPreset(0) },
            { key: '2', label: PRESETS[1].name,   group: 'Presets',    action: () => loadPreset(1) },
            { key: '3', label: PRESETS[2].name,   group: 'Presets',    action: () => loadPreset(2) },
            { key: '4', label: PRESETS[3].name,   group: 'Presets',    action: () => loadPreset(3) },
            { key: '5', label: PRESETS[4].name,   group: 'Presets',    action: () => loadPreset(4) },
            { key: '6', label: PRESETS[5].name,   group: 'Presets',    action: () => loadPreset(5) },
            { key: '7', label: PRESETS[6].name,   group: 'Presets',    action: () => loadPreset(6) },
        ], { helpTitle: 'Shoals Keyboard Shortcuts' });
    }

    // 9. Bind UI events
    bindEvents($, {
        onTogglePlay:     () => togglePlay(),
        onStep:           () => step(),
        onSpeedUp:        () => cycleSpeed(),
        onSpeedDown:      () => decycleSpeed(),
        onToggleTheme:    () => toggleTheme(),
        onPresetChange:   (index) => loadPreset(index),
        onReset:          () => resetSim(),
        onSliderChange:   (param, value) => syncSliderToSim(param, value),
        onTimeSlider:     (pct) => { sliderPct = pct; updateTimeSliderRange(); dirty = true; },
        onBuyStock:       () => handleBuyStock(),
        onShortStock:     () => handleShortStock(),
        onBuyBond:        () => handleBuyBond(),
        onShortBond:      () => handleShortBond(),
        onChainCellClick: (info) => handleChainCellClick(info),
        onExpiryChange:   (idx) => {
            const pe = _priceExpiry(idx);
            updateChainDisplay($, pe, _buildPosMap());
            updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), strategyMode ? _buildStrategyPosMap() : null);
            if ($.tradeStrategySelect && $.tradeStrategySelect.value) {
                const ts = getStrategy($.tradeStrategySelect.value);
                if (ts && ts.selectableExpiry) _updateTradeCreditDebit();
            }
            dirty = true;
        },
        onFullChainOpen:  () => openFullChain(),
        onTradeSubmit:    (data) => handleTradeSubmit(data),
        onLiquidate:      () => handleLiquidate(),
        onDismissMargin:  () => { /* sim stays paused, overlay hidden by ui.js */ },
        onAddLeg:         (type, side, strike, expiryDay) => handleAddLeg(type, side, strike, expiryDay),
        onStrategyExpiryChange: (idx) => {
            const pe = _priceExpiry(idx);
            updateStrategyChainDisplay($, pe, handleAddLeg, _buildStrategyPosMap());
            updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
            if (_isSelectableExpiry()) {
                const sid = $.strategyLoadSelect ? $.strategyLoadSelect.value : '';
                const loaded = sid ? getStrategy(sid) : null;
                if (loaded && loaded.selectableExpiry) {
                    _reloadSelectableLegs();
                } else if (strategyLegs.length > 0) {
                    // Update manually-built legs to use the new expiry
                    const newDay = _strategyExpiryDay();
                    if (newDay != null) {
                        for (const leg of strategyLegs) {
                            if (leg.type !== 'stock') {
                                leg.expiryDay = newDay;
                                leg._refDay = sim.day;
                            }
                        }
                        strategy.resetRange(sim.S, strategyLegs);
                        updateStrategyBuilder();
                        updateTimeSliderRange();
                    }
                }
            }
            dirty = true;
        },
        onSaveStrategy:   () => handleSaveStrategy(),
        onDeleteStrategy:  () => handleDeleteStrategy(),
        onTradeExecStrategy: () => handleTradeExecStrategy(),
        onStrategySelectChange: (id) => {
            if (id) {
                handleLoadStrategy(id);
            } else {
                // "New strategy" selected — clear builder
                currentStrategyHash = null;
                isBuiltinLoaded = false;
                strategyLegs.length = 0;
                if ($.strategyNameInput) $.strategyNameInput.value = '';
                if ($.selectableExpiryToggle) $.selectableExpiryToggle.checked = true;
                strategy.resetRange(sim.S, strategyLegs);
                updateStrategyBuilder();
                updateTimeSliderRange();
                dirty = true;
            }
        },
        onTradeStrategySelectChange: (id) => {
            if ($.tradeExecStrategyBtn) $.tradeExecStrategyBtn.disabled = !id;
            if (id) {
                _updateTradeCreditDebit();
            } else {
                updateCreditDebit($, null);
            }
        },
        onLLMKeyChange:   (key) => { if (llmSource) llmSource.setApiKey(key); },
        onLLMModelChange: (model) => { if (llmSource) llmSource.setModel(model); },
    });

    _refreshStrategyDropdowns();

    // 10. Wire custom events from ui.js position rows
    document.addEventListener('shoals:closePosition', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            const ok = closePosition(id, sim.S, market.sigma, sim.r, sim.day, sim.q);
            if (ok && typeof showToast !== 'undefined') showToast('Position closed.');
            chainDirty = true;
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:exerciseOption', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            const result = exerciseOption(id, sim.S, sim.day, market.sigma, sim.r, sim.q);
            if (typeof showToast !== 'undefined') {
                showToast(result ? 'Option exercised.' : 'Cannot exercise.');
            }
            chainDirty = true;
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

    document.addEventListener('shoals:unwindStrategy', (e) => {
        const name = e.detail && e.detail.name;
        if (!name) return;
        const positions = portfolio.positions.filter(p => p.strategyName === name);
        let closed = 0;
        for (const pos of [...positions]) {
            if (closePosition(pos.id, sim.S, market.sigma, sim.r, sim.day, sim.q)) closed++;
        }
        if (closed > 0) {
            if (typeof showToast !== 'undefined') showToast('Unwound "' + name + '" (' + closed + ' position' + (closed > 1 ? 's' : '') + ').');
            chainDirty = true;
            updateUI();
            dirty = true;
        }
    });

    // 11. Wire intro screen
    _intro.init($.introScreen, $.introStart);

    // 12. Wire info tips for slider labels
    wireInfoTips();

    // 12b. Wire reference overlay
    const openReference = initReferenceOverlay(
        document.getElementById('reference-overlay'),
        document.getElementById('reference-title'),
        document.getElementById('reference-body'),
        document.getElementById('reference-close'),
        REFERENCE
    );
    bindReferenceTriggers(openReference);

    // 13. Pre-populate full history buffer (prices scaled so final close = $100)
    sim.prepopulate();
    syncMarket(sim);
    _initRateHistory();
    chart.dayOrigin = sim.day;

    // 14. Build initial chain and update UI
    expiryMgr.init(sim.day);
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex]);
    _syncLerpSpeed();
    lastSpot = sim.S;
    strategy.resetRange(sim.S, strategyLegs);

    // 14b. Initialize event engine for dynamic presets
    if (_isDynamicPreset(DEFAULT_PRESET)) {
        if (_isLLMPreset(DEFAULT_PRESET)) {
            llmSource = new LLMEventSource();
            eventEngine = new EventEngine('llm', llmSource);
            eventEngine.prefetch(sim);
        } else {
            eventEngine = new EventEngine('offline');
        }
    }
    updateDynamicSections($, DEFAULT_PRESET);
    updateEventLog($, eventEngine ? eventEngine.eventLog : [], chart.dayOrigin);
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);

    updateUI();

    // 15. Position camera so latest candle is visible
    if (camera) {
        const lastDay = sim.history.maxDay;
        const viewW = $.chartCanvas.clientWidth || $.chartCanvas.offsetWidth || 800;
        const targetScreenX = viewW * CHART_AUTOSCROLL_PCT;
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
        if (!strategyMode) dirty = true;
    });
    $.chartCanvas.addEventListener('mouseleave', () => {
        mouseX = -1;
        mouseY = -1;
        if (!strategyMode) dirty = true;
    });

    // 18. Wire tab switching to strategy mode
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab || 'trade';
            const isStrategy = activeTab === 'strategy';
            if (isStrategy !== strategyMode) {
                strategyMode = isStrategy;
                toggleStrategyView($, strategyMode);
                if (strategyMode) {
                    strategy.resize();
                    // Pause sim when entering strategy mode
                    if (playing) {
                        playing = false;
                        updatePlayBtn($, playing);
                    }
                }
                dirty = true;
            }
            if (isStrategy) {
                rebuildStrategyDropdown($, chainSkeleton);
                const stratPriced = _priceExpiry(_strategyExpiryIdx());
                updateStrategySelectors($, stratPriced, sim.S, handleAddLeg, _buildStrategyPosMap());
                updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
                updateTimeSliderRange();
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
            market.sigma,
            sim.r, _sliderFallbackDte(), greekToggles,
            _sliderEvalDay(), sim.day, sim.q
        );
    } else {
        chart.draw(
            sim.history, portfolio.positions,
            mouseX, mouseY,
            sim.history.last()
        );
    }
}

function frame(now) {
    if (playing) {
        const tickInterval = 1000 / SPEED_OPTIONS[speedIndex];
        const substepInterval = tickInterval / INTRADAY_STEPS;

        if (!dayInProgress) {
            // Start a new day if enough time has passed since last tick
            if (now - lastTickTime >= tickInterval) {
                sim.beginDay();
                dayInProgress = true;
                // Advance by tickInterval (not now) to avoid drift; clamp
                // to prevent burst catch-up after tab was backgrounded
                lastTickTime = Math.max(lastTickTime + tickInterval, now - tickInterval);
                chart.setLiveCandle(sim._partial);
                if (!strategyMode) dirty = true;
            }
        }

        if (dayInProgress) {
            const elapsed = now - lastTickTime;
            // How many sub-steps should be done by now
            const targetSteps = Math.min(
                INTRADAY_STEPS,
                Math.floor(elapsed / substepInterval) + 1
            );
            // Run any pending sub-steps
            let stepped = false;
            while (sim.substepsDone < targetSteps) {
                sim.substep();
                chart.setLiveCandle(sim._partial);
                stepped = true;
            }
            // Update sidebar & check orders after each substep batch
            if (stepped) {
                syncMarket(sim);
                _onSubstep();
                if (!strategyMode) dirty = true;
            }
            // All sub-steps done — finalize the day
            if (sim.dayComplete) {
                sim.finalizeDay();
                dayInProgress = false;
                syncMarket(sim);
                _onDayComplete();
            }
        }
    }

    // Lerp animation runs every frame (even when paused, for settling)
    chart.update(now);
    // Lerp always causes a redraw while targets differ from display
    if (chart.isLerpActive() && !strategyMode) dirty = true;

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

/** Called after each substep batch — lightweight sidebar + order updates. */
function _onSubstep() {
    const vol = market.sigma;

    // Check pending orders at intraday price
    const filledOrders = checkPendingOrders(sim.S, vol, sim.r, sim.day, sim.q);
    for (const pos of filledOrders) {
        if (typeof showToast !== 'undefined') {
            const side = pos.qty > 0 ? 'Bought' : 'Sold';
            showToast(side + ' ' + Math.abs(pos.qty) + ' ' + pos.type + ' @ $' + pos.fillPrice.toFixed(2));
        }
        chainDirty = true;
    }

    // Track peak equity and drawdown for epilogue scorecard
    if (eventEngine) {
        let equity = portfolio.cash;
        for (const pos of portfolio.positions) {
            equity += computePositionValue(pos, sim.S, market.sigma, sim.r, sim.day, sim.q);
        }
        if (equity > portfolio.peakValue) portfolio.peakValue = equity;
        if (portfolio.peakValue > 0) {
            const dd = 1 - equity / portfolio.peakValue;
            if (dd > portfolio.maxDrawdown) portfolio.maxDrawdown = dd;
        }
    }

    // Lightweight UI update: reprice visible expiry, update portfolio, rate
    updateSubstepUI();
}

/** Called after all 16 sub-steps complete — runs portfolio/chain/margin checks. */
function _onDayComplete() {
    const vol = market.sigma;

    // Record rate for sparkline
    if (rateHistory) pushSparkSample(rateHistory, sim.r);

    chargeBorrowInterest(sim.S, vol, sim.r, sim.borrowSpread, sim.day);

    // Quarterly dividend payments (every 63 trading days, aligned with expiry cycle)
    // Discrete proportional drop: stock price falls by q/4, matching the option
    // pricing model (binomial tree with discrete dividends at QUARTERLY_CYCLE).
    if (sim.q > 0 && sim.day > 0 && sim.day % QUARTERLY_CYCLE === 0) {
        sim.S *= (1 - sim.q / 4);
        const divNet = processDividends(sim.S, sim.q);
        if (divNet !== 0 && typeof showToast !== 'undefined') {
            const label = divNet > 0 ? 'Dividend received' : 'Dividend charged';
            showToast(label + ': $' + Math.abs(divNet).toFixed(2));
        }
    }

    const { expired, unwound } = processExpiry(sim.day, sim.S, sim.day, market.sigma, sim.r, sim.q);
    if (unwound.length > 0) {
        const names = [...new Set(unwound.map(p => p.strategyName))];
        for (const name of names) {
            if (typeof showToast !== 'undefined') showToast('Strategy "' + name + '" expired — unwound all legs.');
        }
        chainDirty = true;
    }

    // Epilogue check (before regular events)
    if (eventEngine && eventEngine.isEpilogueReady(sim.day)) {
        playing = false;
        updatePlayBtn($, playing);
        eventEngine.computeElectionOutcome(sim);
        _showEpilogue();
        return;
    }

    // Fire dynamic events
    if (eventEngine) {
        const events = eventEngine.maybeFire(sim, sim.day);
        if (events.length > 0) {
            sim.recomputeK();
            syncMarket(sim);
            syncSettingsUI($, _simSettingsObj());
            updateEventLog($, eventEngine.eventLog, chart.dayOrigin);
            updateCongressDiagrams($, eventEngine.world);
            if (typeof showToast !== 'undefined') {
                for (let i = 0; i < events.length; i++) {
                    const ev = events[i];
                    const duration = ev.magnitude === 'major' ? 8000
                        : ev.magnitude === 'moderate' ? 5000 : 3000;
                    setTimeout(function() { showToast(ev.headline, duration); }, i * 1500);
                }
            }
        }
    }

    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    chainDirty = true;

    // Check margin
    const margin = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    if (margin.triggered) {
        portfolio.marginCallCount++;
        playing = false;
        updatePlayBtn($, playing);
        showMarginCall($, margin);
    }

    // Auto-scroll: keep latest candle near right edge when playing
    if (playing && camera) {
        const lastDay = sim.history.maxDay;
        const viewW = $.chartCanvas.clientWidth || 800;
        const targetWorldX = lastDay + 1;
        const rightEdgeWorld = camera.screenToWorldX
            ? camera.screenToWorldX(viewW * CHART_AUTOSCROLL_PCT)
            : camera.screenToWorld(viewW * CHART_AUTOSCROLL_PCT, 0).x;
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

    updateUI(margin);
    dirty = true;
}

// ---------------------------------------------------------------------------
// tick — advance one trading day
// ---------------------------------------------------------------------------

/** Instant full-day tick (used by step button). */
function tick() {
    if (dayInProgress) {
        // Finish remaining sub-steps instantly
        while (!sim.dayComplete) sim.substep();
        sim.finalizeDay();
        dayInProgress = false;
    } else {
        sim.tick();
    }
    // Snap the lerp to the final state (no animation for step)
    const last = sim.history.last();
    if (last) {
        chart._lerp.day = last.day;
        chart._lerp.close = last.close;
        chart._lerp.high  = last.high;
        chart._lerp.low   = last.low;
        chart._lerp._from = last.close;
        chart._lerp._t = 1;
        chart._lerp._targetClose = last.close;
        chart._lerp._targetHigh  = last.high;
        chart._lerp._targetLow   = last.low;
    }
    syncMarket(sim);
    _onDayComplete();
}

// ---------------------------------------------------------------------------
// UI update helper
// ---------------------------------------------------------------------------

function updateUI(precomputedMargin) {
    const vol = market.sigma;
    const margin = precomputedMargin || checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    const pMap = _buildPosMap();
    const sMap = strategyMode ? _buildStrategyPosMap() : null;
    if (chainDirty) {
        rebuildTradeDropdown($, chainSkeleton);
        const tradePriced = _priceExpiry(_tradeExpiryIdx());
        updateChainDisplay($, tradePriced, pMap);
        updateStockBondPrices($, sim.S, sim.r, vol, chainSkeleton, pMap, sMap);
        if (strategyMode) {
            rebuildStrategyDropdown($, chainSkeleton);
            const stratPriced = _priceExpiry(_strategyExpiryIdx());
            updateStrategySelectors($, stratPriced, sim.S, handleAddLeg, sMap);
        }
        chainDirty = false;
    }
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day, margin, sim.q);
    updateGreeksDisplay($, aggregateGreeks(sim.S, vol, sim.r, sim.day, sim.q));
    updateRateDisplay($, sim.r, rateHistory);
    if (strategyMode && strategyLegs.length > 0) {
        updateStrategyBuilder();
    }
}

/** Lightweight UI update called every substep — reprices visible expiry only. */
function updateSubstepUI() {
    const vol = market.sigma;
    const pMap = _buildPosMap();
    const sMap = strategyMode ? _buildStrategyPosMap() : null;

    // Reprice the visible trade chain expiry (no dropdown rebuild)
    const tradePriced = _priceExpiry(_tradeExpiryIdx());
    updateChainDisplay($, tradePriced, pMap);
    updateStockBondPrices($, sim.S, sim.r, vol, chainSkeleton, pMap, sMap);

    if (strategyMode) {
        const stratPriced = _priceExpiry(_strategyExpiryIdx());
        updateStrategySelectors($, stratPriced, sim.S, handleAddLeg, sMap);
    }

    // Portfolio mark-to-market
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day, undefined, sim.q);
    if (activeTab === 'portfolio') {
        updateGreeksDisplay($, aggregateGreeks(sim.S, vol, sim.r, sim.day, sim.q));
    }
    updateRateDisplay($, sim.r, rateHistory);

    if (strategyMode && strategyLegs.length > 0) {
        updateStrategyBuilder();
    }

    refreshTooltip();

    // Live credit/debit update for trade-tab strategy
    if ($.tradeStrategySelect && $.tradeStrategySelect.value) {
        _updateTradeCreditDebit();
    }

    chainDirty = false;
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

function _getMinDTE() {
    let minDTE = Infinity;
    for (const leg of strategyLegs) {
        if (leg.expiryDay != null) {
            const dte = leg.expiryDay - sim.day;
            if (dte < minDTE) minDTE = dte;
        }
    }
    return minDTE === Infinity ? 0 : minDTE;
}

/** Elapsed trading days at the current slider position (0 at 100%, minDTE at 0%). */
function _sliderElapsed(minDTE) {
    if (minDTE === undefined) minDTE = _getMinDTE();
    return Math.round(minDTE * (100 - sliderPct) / 100);
}

/** Evaluation day for strategy diagram at current slider position. */
function _sliderEvalDay() {
    return sim.day + _sliderElapsed();
}

/** Fallback DTE for legs without expiryDay (max leg's remaining DTE at evalDay). */
function _sliderFallbackDte() {
    return _getMaxDTE() - _sliderElapsed();
}

function updateTimeSliderRange() {
    const hasLegs = strategyLegs.length > 0;
    $.timeSliderBar.classList.toggle('hidden', !hasLegs);
    if (!hasLegs) return;
    const minDTE = _getMinDTE();
    if (minDTE > 0) {
        $.timeSlider.disabled = false;
    } else {
        $.timeSlider.disabled = true;
        sliderPct = 100;
        $.timeSlider.value = 100;
    }
    const elapsed = _sliderElapsed(minDTE);
    const maxRemaining = _getMaxDTE() - elapsed;
    if ($.timeSliderLabel) $.timeSliderLabel.textContent = maxRemaining + ' DTE';
}

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

function togglePlay() {
    playing = !playing;
    if (playing) {
        lastTickTime = performance.now();
        // If no day in progress, the first tick will start immediately
        // (lastTickTime - now >= tickInterval is false, but we want immediate start)
        if (!dayInProgress) lastTickTime -= 2000; // force immediate beginDay
    }
    updatePlayBtn($, playing);
    if (typeof _haptics !== 'undefined') _haptics.trigger(playing ? 'medium' : 'light');
}

function step() {
    if (playing) return;

    // Start a new day if none in progress
    if (!dayInProgress) {
        sim.beginDay();
        dayInProgress = true;
        chart.setLiveCandle(sim._partial);
    }

    // Advance one substep
    sim.substep();
    chart.setLiveCandle(sim._partial);
    syncMarket(sim);
    _onSubstep();

    // If all substeps done, finalize the day
    if (sim.dayComplete) {
        sim.finalizeDay();
        dayInProgress = false;
        syncMarket(sim);
        _onDayComplete();
    }

    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('light');
}

function _syncLerpSpeed() {
    chart.setSubstepInterval(1000 / (SPEED_OPTIONS[speedIndex] * INTRADAY_STEPS));
}

function cycleSpeed() {
    speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex]);
    _syncLerpSpeed();
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function decycleSpeed() {
    speedIndex = (speedIndex - 1 + SPEED_OPTIONS.length) % SPEED_OPTIONS.length;
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex]);
    _syncLerpSpeed();
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function _resetCore(index) {
    document.getElementById('epilogue-overlay')?.classList.add('hidden');
    sim.reset(index);
    resetPortfolio();
    sim.prepopulate();
    syncMarket(sim);
    _initRateHistory();
    chart.dayOrigin = sim.day;
    dayInProgress = false;
    chart._lerp.day = -1;
    expiryMgr.init(sim.day);
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    chainDirty = true;
    playing = false;
    lastSpot = sim.S;
    strategyLegs.length = 0;
    currentStrategyHash = null;
    isBuiltinLoaded = false;
    if ($.strategyNameInput) $.strategyNameInput.value = '';
    _refreshStrategyDropdowns();
    sliderPct = 100;
    strategy.resetRange(sim.S, strategyLegs);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateDynamicSections($, index);
}

function loadPreset(index) {
    $.presetSelect.selectedIndex = index;
    _resetCore(index);

    if (_isDynamicPreset(index)) {
        if (_isLLMPreset(index)) {
            if (!llmSource) llmSource = new LLMEventSource();
            eventEngine = new EventEngine('llm', llmSource);
            eventEngine.prefetch(sim);
        } else {
            eventEngine = new EventEngine('offline');
        }
    } else {
        eventEngine = null;
    }
    updateEventLog($, eventEngine ? eventEngine.eventLog : [], chart.dayOrigin);
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);

    updateUI();
    _repositionCamera();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
}

function resetSim() {
    const index = $.presetSelect.selectedIndex;
    _resetCore(index);

    if (eventEngine) eventEngine.reset();
    if (_isLLMPreset(index) && eventEngine) eventEngine.prefetch(sim);
    updateEventLog($, eventEngine ? eventEngine.eventLog : [], chart.dayOrigin);
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);

    updateUI();
    _repositionCamera();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('heavy');
}

function _isDynamicPreset(index) { return index >= 5; }
function _isLLMPreset(index) { return index >= 6; }

function syncSliderToSim(param, value) {
    sim[param] = value;
    if (param === 'rho') sim._recomputeRhoDerived();
    syncMarket(sim);
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
    const vol = market.sigma;
    const orderType = _getOrderType();
    if (orderType === 'market') {
        const pos = executeMarketOrder(type, side, qty, sim.S, vol, sim.r, sim.day, strike, expiryDay, undefined, sim.q);
        if (pos) {
            const label = side === 'short' ? 'Shorted' : 'Bought';
            if (typeof showToast !== 'undefined') showToast(label + ' ' + qty + ' ' + type + ' at $' + pos.fillPrice.toFixed(2));
            if (typeof _haptics !== 'undefined') _haptics.trigger('success');
        } else {
            if (typeof showToast !== 'undefined') showToast('Insufficient margin.');
            if (typeof _haptics !== 'undefined') _haptics.trigger('error');
        }
    } else {
        const triggerPrice = _getTriggerPrice();
        placePendingOrder(type, side, qty, orderType, triggerPrice, strike, expiryDay);
        if (typeof showToast !== 'undefined') showToast('Pending ' + orderType + ' order placed for ' + qty + ' ' + type + '.');
        if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
    }
    chainDirty = true;
    updateUI();
    dirty = true;
}

function handleBuyStock() {
    _executeOrPlace('stock', 'long', _getTradeQty());
}

function handleShortStock() {
    _executeOrPlace('stock', 'short', _getTradeQty());
}

function _getTradeExpiryDay() {
    const idx = parseInt($.tradeExpiry?.value, 10) || 0;
    return chainSkeleton.length > idx ? chainSkeleton[idx].day : sim.day + 21;
}

function handleBuyBond() {
    _executeOrPlace('bond', 'long', _getTradeQty(), null, _getTradeExpiryDay());
}

function handleShortBond() {
    _executeOrPlace('bond', 'short', _getTradeQty(), null, _getTradeExpiryDay());
}

function handleChainCellClick(info) {
    const expiryDay = info.expiryDay ?? (info.type === 'bond' ? _getTradeExpiryDay() : undefined);
    _executeOrPlace(info.type, info.side, _getTradeQty(), info.strike ?? undefined, expiryDay);
}

function openFullChain() {
    if (playing) togglePlay();
    const vol = market.sigma;
    const bondDte = _getTradeExpiryDay() - sim.day;
    const bondMid = BOND_FACE_VALUE * Math.exp(-sim.r * bondDte / 252);
    const stockBA = computeBidAsk(sim.S, sim.S, vol);
    const bondBA = computeBidAsk(bondMid, sim.S, vol);
    showChainOverlay($, chainSkeleton, _priceExpiryGreeks, stockBA, bondBA, _buildPosMap());
}

function handleTradeSubmit(data) {
    const vol = market.sigma;
    const { type, side, qty, strike, expiryDay, orderType, limitPrice } = data;

    if (orderType === 'market') {
        const pos = executeMarketOrder(
            type, side, qty, sim.S, vol, sim.r, sim.day, strike, expiryDay, undefined, sim.q
        );
        if (pos) {
            if (typeof showToast !== 'undefined') showToast('Order filled: ' + type + ' x' + qty);
            if (typeof _haptics !== 'undefined') _haptics.trigger('success');
        } else {
            if (typeof showToast !== 'undefined') showToast('Order failed — insufficient margin.');
            if (typeof _haptics !== 'undefined') _haptics.trigger('error');
        }
    } else {
        placePendingOrder(type, side, qty, orderType, limitPrice, strike, expiryDay);
        if (typeof showToast !== 'undefined') showToast('Pending ' + orderType + ' order placed.');
        if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
    }

    chainDirty = true;
    updateUI();
    dirty = true;
}

function handleLiquidate() {
    const vol = market.sigma;
    liquidateAll(sim.S, vol, sim.r, sim.day, sim.q);
    chainDirty = true;
    updateUI();
    dirty = true;
    if (typeof showToast !== 'undefined') showToast('All positions liquidated.');
    if (typeof _haptics !== 'undefined') _haptics.trigger('heavy');
}

// ---------------------------------------------------------------------------
// Strategy builder handlers
// ---------------------------------------------------------------------------

function handleAddLeg(type, side, strike, expiryDay) {
    const absQty = parseInt($.strategyQty?.value, 10) || 1;
    const signedQty = side === 'short' ? -absQty : absQty;

    // For stock/bond clicked from the strategy table (no strike/expiryDay passed)
    if (strike == null && (type === 'call' || type === 'put')) {
        strike = Math.round(sim.S / 5) * 5;
    }
    if (expiryDay == null && (type === 'call' || type === 'put' || type === 'bond')) {
        const idx = parseInt($.strategyExpiry?.value, 10);
        const expiry = chainSkeleton.length > 0 ? chainSkeleton[isNaN(idx) ? chainSkeleton.length - 1 : Math.min(idx, chainSkeleton.length - 1)] : null;
        expiryDay = expiry ? expiry.day : sim.day + 21;
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
        const leg = { type, qty: signedQty, strike, expiryDay, _refS: sim.S, _refDay: sim.day };
        strategyLegs.push(leg);
    }

    strategy.resetRange(sim.S, strategyLegs);
    const spe = _priceExpiry(_strategyExpiryIdx());
    updateStrategyChainDisplay($, spe, handleAddLeg, _buildStrategyPosMap());
    updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function handleRemoveLeg(index) {
    strategyLegs.splice(index, 1);
    strategy.resetRange(sim.S, strategyLegs);
    const spe = _priceExpiry(_strategyExpiryIdx());
    updateStrategyChainDisplay($, spe, handleAddLeg, _buildStrategyPosMap());
    updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
}

function _isSelectableExpiry() {
    return $.selectableExpiryToggle ? $.selectableExpiryToggle.checked : true;
}

function _expiryDayFromSelect(sel) {
    const idx = parseInt(sel?.value, 10);
    if (isNaN(idx) || !chainSkeleton.length) return null;
    const entry = chainSkeleton[Math.min(idx, chainSkeleton.length - 1)];
    return entry ? entry.day : null;
}

function _tradeExpiryDay() { return _expiryDayFromSelect($.tradeExpiry); }
function _strategyExpiryDay() { return _expiryDayFromSelect($.strategyExpiry); }

function handleSaveStrategy() {
    if (strategyLegs.length === 0) return;
    const name = $.strategyNameInput ? $.strategyNameInput.value : '';
    const selExpiry = _isSelectableExpiry();
    const relLegs = legsToRelative(strategyLegs, sim.S, sim.day, selExpiry);
    const id = saveStrategy(currentStrategyHash, name, relLegs, selExpiry);
    if (id === 'collision') {
        if (typeof showToast !== 'undefined') showToast('A strategy with that name already exists.');
        if (typeof _haptics !== 'undefined') _haptics.trigger('error');
        return;
    }
    if (id === null) {
        if (typeof showToast !== 'undefined') showToast('Strategy limit reached (max 50).');
        if (typeof _haptics !== 'undefined') _haptics.trigger('error');
        return;
    }
    currentStrategyHash = id;
    isBuiltinLoaded = false;
    _refreshStrategyDropdowns();
    if ($.strategyLoadSelect) $.strategyLoadSelect.value = id;
    if (typeof showToast !== 'undefined') {
        const saved = getStrategy(id);
        showToast('Strategy "' + (saved ? saved.name : '') + '" saved.');
    }
    if (typeof _haptics !== 'undefined') _haptics.trigger('success');
    updateStrategyBuilder();
}

function executeWithRollback(resolvedLegs, strategyName) {
    const savedCash = portfolio.cash;
    const savedPositions = portfolio.positions.map(p => ({ ...p }));
    const savedClosedBorrowCost = portfolio.closedBorrowCost;
    const savedMarginDebitCost = portfolio.marginDebitCost;
    const savedTotalDividends = portfolio.totalDividends;
    const savedTotalTrades = portfolio.totalTrades;

    const results = [];
    let failed = false;
    for (const leg of resolvedLegs) {
        const side = leg.qty < 0 ? 'short' : 'long';
        const absQty = Math.abs(leg.qty);
        const pos = executeMarketOrder(
            leg.type, side, absQty, sim.S, market.sigma, sim.r, sim.day,
            leg.strike, leg.expiryDay, strategyName, sim.q
        );
        if (pos) {
            if (!pos.strategyBaseQty) pos.strategyBaseQty = absQty;
            results.push(pos);
        } else {
            failed = true;
            break;
        }
    }

    if (failed) {
        portfolio.cash = savedCash;
        portfolio.closedBorrowCost = savedClosedBorrowCost;
        portfolio.marginDebitCost = savedMarginDebitCost;
        portfolio.totalDividends = savedTotalDividends;
        portfolio.totalTrades = savedTotalTrades;
        portfolio.positions.length = 0;
        for (const p of savedPositions) portfolio.positions.push(p);
        if (typeof showToast !== 'undefined') showToast('Strategy failed (leg ' + (results.length + 1) + ' rejected) \u2014 all legs unwound.');
        if (typeof _haptics !== 'undefined') _haptics.trigger('error');
    } else if (results.length > 0) {
        if (typeof showToast !== 'undefined') showToast('Executed ' + results.length + ' leg(s).');
        if (typeof _haptics !== 'undefined') _haptics.trigger('success');
    }
    chainDirty = true;
    updateUI();
    dirty = true;
}

function handleLoadStrategy(id) {
    if (!id) return;
    const strat = getStrategy(id);
    if (!strat) return;

    const expiries = expiryMgr.update(sim.day);
    const overrideDay = strat.selectableExpiry ? _strategyExpiryDay() : null;
    const resolved = resolveLegs(strat.legs, sim.S, sim.day, expiries, overrideDay);

    strategyLegs.length = 0;
    for (const leg of resolved) {
        strategyLegs.push({
            type: leg.type,
            qty: leg.qty,
            strike: leg.strike,
            expiryDay: leg.expiryDay,
            _refS: sim.S,
            _refDay: sim.day,
        });
    }

    isBuiltinLoaded = !!strat.builtin;
    currentStrategyHash = strat.builtin ? null : id;
    if ($.strategyNameInput) $.strategyNameInput.value = strat.name;
    if ($.selectableExpiryToggle) $.selectableExpiryToggle.checked = !!strat.selectableExpiry;

    strategy.resetRange(sim.S, strategyLegs);
    const spe = _priceExpiry(_strategyExpiryIdx());
    updateStrategyChainDisplay($, spe, handleAddLeg, _buildStrategyPosMap());
    updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function handleDeleteStrategy() {
    // Delete from currentStrategyHash (loaded) or from dropdown selection
    const id = currentStrategyHash || ($.strategyLoadSelect ? $.strategyLoadSelect.value : '');
    if (!id) return;
    const strat = getStrategy(id);
    if (!strat || strat.builtin) return;
    deleteStrategy(id);
    currentStrategyHash = null;
    isBuiltinLoaded = false;
    strategyLegs.length = 0;
    if ($.strategyNameInput) $.strategyNameInput.value = '';
    strategy.resetRange(sim.S, strategyLegs);
    _refreshStrategyDropdowns();
    if ($.strategyLoadSelect) $.strategyLoadSelect.value = '';
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
    if (typeof showToast !== 'undefined') showToast('Strategy "' + (strat ? strat.name : '') + '" deleted.');
    if (typeof _haptics !== 'undefined') _haptics.trigger('light');
}

function handleTradeExecStrategy() {
    const id = $.tradeStrategySelect ? $.tradeStrategySelect.value : '';
    if (!id) return;
    const strat = getStrategy(id);
    if (!strat) return;
    const expiries = expiryMgr.update(sim.day);
    const overrideDay = strat.selectableExpiry ? _tradeExpiryDay() : null;
    const resolved = resolveLegs(strat.legs, sim.S, sim.day, expiries, overrideDay);
    const mult = parseInt($.tradeQty?.value, 10) || 1;
    const scaled = mult === 1 ? resolved : resolved.map(l => ({ ...l, qty: l.qty * mult }));
    executeWithRollback(scaled, strat.name);
}

function _updateTradeCreditDebit() {
    const id = $.tradeStrategySelect ? $.tradeStrategySelect.value : '';
    if (!id) { updateCreditDebit($, null); return; }
    const strat = getStrategy(id);
    if (!strat) { updateCreditDebit($, null); return; }
    try {
        const expiries = expiryMgr.update(sim.day);
        const overrideDay = strat.selectableExpiry ? _tradeExpiryDay() : null;
        const net = computeNetCost(strat.legs, sim.S, market.sigma, sim.r, sim.day, sim.q, expiries, overrideDay);
        const mult = parseInt($.tradeQty?.value, 10) || 1;
        updateCreditDebit($, net * mult);
    } catch { updateCreditDebit($, null); }
}

function _reloadSelectableLegs() {
    const id = $.strategyLoadSelect ? $.strategyLoadSelect.value : '';
    if (!id) return;
    const strat = getStrategy(id);
    if (!strat || !strat.selectableExpiry) return;
    const expiries = expiryMgr.update(sim.day);
    const overrideDay = _strategyExpiryDay();
    const resolved = resolveLegs(strat.legs, sim.S, sim.day, expiries, overrideDay);
    strategyLegs.length = 0;
    for (const leg of resolved) {
        strategyLegs.push({
            type: leg.type, qty: leg.qty, strike: leg.strike,
            expiryDay: leg.expiryDay, _refS: sim.S, _refDay: sim.day,
        });
    }
    strategy.resetRange(sim.S, strategyLegs);
    updateStrategyBuilder();
    updateTimeSliderRange();
}

function _refreshStrategyDropdowns() {
    updateStrategyDropdowns($, listStrategies());
    if ($.strategyNameInput) $.strategyNameInput.placeholder = nextAutoName();
}

function updateStrategyBuilder() {
    const summary = strategyLegs.length > 0
        ? strategy.computeSummary(strategyLegs, sim.S, market.sigma, sim.r, _sliderFallbackDte(),
            _sliderEvalDay(), sim.day, sim.q)
        : null;
    renderStrategyBuilder($, strategyLegs, summary, handleRemoveLeg, chainSkeleton, () => {
        strategy.resetRange(sim.S, strategyLegs);
        updateStrategyBuilder();
        dirty = true;
    }, currentStrategyHash, isBuiltinLoaded);
}

// ---------------------------------------------------------------------------
// Epilogue overlay controller
// ---------------------------------------------------------------------------

function _showEpilogue() {
    const pages = generateEpilogue(eventEngine.world, sim, portfolio, eventEngine.eventLog);
    let currentPage = 0;

    const overlay = document.getElementById('epilogue-overlay');
    const title = overlay.querySelector('.epilogue-title');
    const body = overlay.querySelector('.epilogue-body');
    const dots = overlay.querySelectorAll('.epilogue-dot');
    const backBtn = overlay.querySelector('#epilogue-back');
    const nextBtn = overlay.querySelector('#epilogue-next');
    const restartBtn = overlay.querySelector('#epilogue-restart');
    const keepBtn = overlay.querySelector('#epilogue-keep');

    function render() {
        const page = pages[currentPage];
        body.style.opacity = '0';
        setTimeout(() => {
            title.textContent = page.title;
            // SECURITY: page.body is generated entirely by generateEpilogue()
            // from trusted world state -- no user input or external data
            body.innerHTML = page.body;  // eslint-disable-line no-unsanitized/property
            body.scrollTop = 0;
            body.style.opacity = '1';
            dots.forEach((d, i) => d.classList.toggle('active', i === currentPage));
            backBtn.classList.toggle('hidden', currentPage === 0);
            nextBtn.classList.toggle('hidden', currentPage === pages.length - 1);
            restartBtn.classList.toggle('hidden', currentPage !== pages.length - 1);
            keepBtn.classList.toggle('hidden', currentPage !== pages.length - 1);
        }, 200);
    }

    backBtn.onclick = () => { if (currentPage > 0) { currentPage--; render(); } };
    nextBtn.onclick = () => { if (currentPage < pages.length - 1) { currentPage++; render(); } };
    restartBtn.onclick = () => {
        overlay.classList.add('hidden');
        // Find the Dynamic (Offline) preset index
        const offlineIdx = PRESETS.findIndex(p => p.name.includes('Offline'));
        if (offlineIdx >= 0) _resetCore(offlineIdx);
    };
    keepBtn.onclick = () => {
        overlay.classList.add('hidden');
        if (typeof showToast !== 'undefined') showToast('Event storyline complete. Market simulation continues.');
    };

    overlay.classList.remove('hidden');
    render();
}

// ---------------------------------------------------------------------------
// Helper: reposition camera so latest candle is near the right edge
// ---------------------------------------------------------------------------

function _repositionCamera() {
    if (!camera) return;
    const lastDay = sim.history.maxDay;
    const viewW = $.chartCanvas.clientWidth || $.chartCanvas.offsetWidth || 800;
    const targetScreenX = viewW * CHART_AUTOSCROLL_PCT;
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
            borrowSpread: sim.borrowSpread,
            q: sim.q,
        },
        initialCapital: portfolio.initialCapital,
    };
}
