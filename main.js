/* =====================================================
   main.js -- Entry point for the Shoals trading simulator.

   Wires together DOM cache, simulation loop, camera,
   rendering, autoplay, and event handlers.
   ===================================================== */

import { SPEED_OPTIONS, PRESETS, INTRADAY_STEPS, BOND_FACE_VALUE, HISTORY_CAPACITY, QUARTERLY_CYCLE, CHART_SLOT_PX, CHART_LEFT_MARGIN, CHART_RIGHT_MARGIN, DEFAULT_PRESET, ADV, ROGUE_TRADING_THRESHOLD } from './src/config.js';
import { fmtDollar } from './src/format-helpers.js';
import { Simulation } from './src/simulation.js';
import { buildChainSkeleton, priceChainExpiry, ExpiryManager } from './src/chain.js';
import {
    portfolio, resetPortfolio, checkPendingOrders, processExpiry,
    chargeBorrowInterest, processDividends, checkMargin, aggregateGreeks,
    executeMarketOrder, closePosition, exerciseOption,
    liquidateAll, placePendingOrder, cancelOrder,
    computeBidAsk, computeNetDelta, computeGrossNotional,
} from './src/portfolio.js';
import { ChartRenderer } from './src/chart.js';
import { StrategyRenderer } from './src/strategy.js';
import {
    cacheDOMElements, bindEvents, updateChainDisplay,
    rebuildTradeDropdown, rebuildStrategyDropdown,
    updatePortfolioDisplay, updateGreeksDisplay, updateRateDisplay, updateStockBondPrices,
    syncSettingsUI, toggleStrategyView, showChainOverlay,
    updatePlayBtn, updateSpeedBtn,
    renderStrategyBuilder, wireInfoTips, updateStrategySelectors, updateStrategyChainDisplay, updateTriggerPriceSlider,
    updateDynamicSections, updateEventLog, updateCongressDiagrams,
    refreshTooltip,
    updateStrategyDropdowns, updateCreditDebit,
    showPopupEvent,
} from './src/ui.js';
import { initTheme, toggleTheme } from './src/theme.js';
import { EventEngine } from './src/events.js';
import { LLMEventSource } from './src/llm.js';
import { generateEpilogue } from './src/epilogue.js';
import { computePositionValue, computePositionPnl } from './src/position-value.js';
import { posKey } from './src/chain-renderer.js';
import { REFERENCE } from './src/reference.js';
import { syncMarket, market } from './src/market.js';
import {
    resetImpactState, decayImpactVolumes,
    getStockImpact, rehedgeMM,
    updateParamShifts, decayParamShifts,
    applyParamOverlays, removeParamOverlays,
    selectImpactToast,
} from './src/price-impact.js';
import {
    listStrategies, getStrategy, saveStrategy, deleteStrategy,
    resolveLegs, computeNetCost, legsToRelative, nextAutoName,
} from './src/strategy-store.js';
import { applyStructuredEffects } from './src/world-state.js';
import { evaluatePortfolioPopups, resetPopupCooldowns, pickTip } from './src/popup-events.js';
import { getEventById } from './src/event-pool.js';
import {
    compliance, resetCompliance, effectiveHeat,
    onComplianceTriggered, onComplianceChoice,
} from './src/compliance.js';
import { COMPLIANCE_GAME_OVER_HEAT, TIP_REAL_PROBABILITY } from './src/config.js';

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
let portfolioHistory = null; // sparkline ring buffer for portfolio value
let _savedOverlays = {};

const _popupQueue = [];
const playerChoices = {};
const impactHistory = [];
const quarterlyReviews = [];

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

function _initPortfolioHistory() {
    portfolioHistory = createSparkHistory(HISTORY_CAPACITY);
    // Start with initial capital for the prepopulated history period
    for (let d = 0; d < HISTORY_CAPACITY; d++) {
        pushSparkSample(portfolioHistory, portfolio.initialCapital);
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
    var _shortcuts = [
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
    ];

    if (typeof initShortcuts !== 'undefined') {
        initShortcuts(_shortcuts, { helpTitle: 'Shoals Keyboard Shortcuts' });
    }

    if (typeof initAboutPanel === 'function') {
        initAboutPanel({
            title: 'Options Trading',
            description: 'Options trading simulator with GBM, Merton jump-diffusion, and Heston stochastic volatility stock models. Build strategies with CRR binomial tree pricing and navigate narrative-driven market events.',
            controls: [
                { label: 'Buy stock', value: 'Click Buy button' },
                { label: 'Place option', value: 'Configure in Strategy tab' },
            ],
            shortcuts: _shortcuts,
            repo: 'https://github.com/a9lim/finsim',
        });
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
        onChainClose:     () => setTimeout(_processPopupQueue, 100),
        onTradeClose:     () => setTimeout(_processPopupQueue, 100),
        onMarginClose:    () => setTimeout(_processPopupQueue, 100),
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
        onSelectableExpiryChange: (checked) => {
            if (checked && strategyLegs.length > 0) {
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
                    dirty = true;
                }
            }
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
            const ok = closePosition(sim, id, sim.S, market.sigma, sim.r, sim.day, sim.q);
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
            if (closePosition(sim, pos.id, sim.S, market.sigma, sim.r, sim.day, sim.q)) closed++;
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
    _initPortfolioHistory();
    chart.dayOrigin = sim.day;

    // 14. Build initial chain and update UI
    expiryMgr.init(sim.day);
    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
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
    _repositionCamera();

    // 16. Wire resize via ResizeObserver on chart container
    // This fires during CSS sidebar transition AND window resize.
    // We must redraw IMMEDIATELY after resize (same call stack) because
    // setting canvas.width clears the buffer — if we wait for the next
    // rAF frame, the user sees a blank flash.
    const chartContainer = document.getElementById('chart-container');
    let prevViewW = $.chartCanvas.clientWidth || $.chartCanvas.offsetWidth || 800;
    function handleResize() {
        chart.resize();
        if (strategyMode) strategy.resize();
        const newW = $.chartCanvas.clientWidth  || $.chartCanvas.offsetWidth  || 800;
        const newH = $.chartCanvas.clientHeight || $.chartCanvas.offsetHeight || 600;
        if (camera) {
            // Shift camera so the right edge stays anchored during sidebar slide
            const dw = newW - prevViewW;
            if (dw !== 0) camera.panBy(dw / 2, 0);
            camera.setViewport(newW, newH);
        }
        prevViewW = newW;
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
                } else {
                    // Chart canvas was hidden — re-sync buffer size
                    chart.resize();
                    _repositionCamera();
                }
                dirty = true;
            }
            if (isStrategy) {
                // Invalidate caches so chart/summary reprice with current impact state
                strategy._cache = null;
                strategy._summaryCache = null;
                rebuildStrategyDropdown($, chainSkeleton);
                const stratPriced = _priceExpiry(_strategyExpiryIdx());
                updateStrategySelectors($, stratPriced, sim.S, handleAddLeg, _buildStrategyPosMap());
                updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
                updateTimeSliderRange();
                if (strategyLegs.length > 0) updateStrategyBuilder();
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
                _savedOverlays = applyParamOverlays(sim);
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
                decayImpactVolumes();
                syncMarket(sim);
                rehedgeMM(portfolio.positions);
                _onSubstepTick();
                chart.setLiveCandle(sim._partial);
                stepped = true;
            }
            // UI update once per frame (repricing chain/sidebar is expensive)
            if (stepped) {
                _onSubstepUI();
                if (!strategyMode) dirty = true;
            }
            // All sub-steps done — finalize the day
            if (sim.dayComplete) {
                sim.finalizeDay();
                removeParamOverlays(sim, _savedOverlays);
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

/** Called after each individual substep — orders, margin tracking, peak/drawdown. */
function _onSubstepTick() {
    const vol = market.sigma;

    // Check pending orders at intraday price
    const filledOrders = checkPendingOrders(sim, sim.S, vol, sim.r, sim.day, sim.q);
    for (const pos of filledOrders) {
        if (typeof showToast !== 'undefined') {
            const side = pos.qty > 0 ? 'Bought' : 'Sold';
            showToast(side + ' ' + Math.abs(pos.qty) + 'k ' + pos.type + ' @ $' + pos.fillPrice.toFixed(2));
        }
        chainDirty = true;
    }

    // Track peak equity and drawdown for epilogue scorecard
    const substepMargin = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    if (eventEngine) {
        if (substepMargin.equity > portfolio.peakValue) portfolio.peakValue = substepMargin.equity;
        if (portfolio.peakValue > 0) {
            const dd = 1 - substepMargin.equity / portfolio.peakValue;
            if (dd > portfolio.maxDrawdown) portfolio.maxDrawdown = dd;
        }
    }
}

/** Called once per frame after substep batch — reprices chain/sidebar. */
function _onSubstepUI() {
    const substepMargin = checkMargin(sim.S, market.sigma, sim.r, sim.day, sim.q);
    updateSubstepUI(substepMargin);
}

/** Called after all 16 sub-steps complete — runs portfolio/chain/margin checks. */
function _processPopupQueue() {
    if (_popupQueue.length === 0) return;
    // Don't show if another overlay is open
    if (!$.chainOverlay.classList.contains('hidden')) return;
    if (!$.tradeDialog.classList.contains('hidden')) return;
    if (!$.popupOverlay.classList.contains('hidden')) return;

    const event = _popupQueue.shift();
    playing = false;
    updatePlayBtn($, playing);

    const contextText = typeof event.context === 'function'
        ? event.context(sim, eventEngine?.world, portfolio)
        : event.context || '';

    const popupCat = event.category || (event.id && event.id.startsWith('desk_') ? 'desk' : '');
    // Compliance pre-processing: check profitability since last review
    if (event.choices && event.choices.some(c => c.complianceTier)) {
        onComplianceTriggered(_portfolioEquity(), sim.day);
    }
    showPopupEvent($, event.headline, contextText, event.choices, (idx) => {
        const choice = event.choices[idx];
        if (choice.deltas && eventEngine) {
            eventEngine.applyDeltas(sim, choice.deltas);
        }
        if (choice.effects && eventEngine) {
            applyStructuredEffects(eventEngine.world, choice.effects);
        }
        if (choice.playerFlag) {
            playerChoices[choice.playerFlag] = sim.day;
        }
        if (choice.followups && eventEngine) {
            for (const fu of choice.followups) {
                eventEngine.scheduleFollowup(fu, sim.day);
            }
        }
        if (choice.resultToast) {
            showToast(choice.resultToast, 4000);
        }
        // -- Declarative trade execution --
        if (choice.trades) {
            const vol = market.sigma;
            const snapshot = [...portfolio.positions];
            let closed = 0;
            let pnlSum = 0;
            for (const trade of choice.trades) {
                let targets;
                if (trade.action === 'close_all') {
                    for (const p of snapshot) {
                        pnlSum += computePositionPnl(p, sim.S, vol, sim.r, sim.day, sim.q);
                    }
                    liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q);
                    closed = snapshot.length;
                    break;
                } else if (trade.action === 'close_type') {
                    targets = snapshot.filter(p => p.type === trade.type);
                } else if (trade.action === 'close_short') {
                    targets = snapshot.filter(p =>
                        (p.type === 'stock' && p.qty < 0) ||
                        (p.type === 'call' && p.qty < 0) ||
                        (p.type === 'put' && p.qty > 0)
                    );
                } else if (trade.action === 'close_long') {
                    targets = snapshot.filter(p =>
                        (p.type === 'stock' && p.qty > 0) ||
                        (p.type === 'call' && p.qty > 0) ||
                        (p.type === 'put' && p.qty < 0)
                    );
                } else if (trade.action === 'close_options') {
                    targets = snapshot.filter(p => p.type === 'call' || p.type === 'put');
                } else if (trade.action === 'hedge_unlimited_risk') {
                    let nuu = 0;
                    for (const p of portfolio.positions) {
                        if (p.type === 'stock' || p.type === 'call') nuu += p.qty;
                    }
                    if (nuu < 0) {
                        const hedgeQty = Math.abs(nuu);
                        executeMarketOrder(
                            sim, 'stock', 'long', hedgeQty,
                            sim.S, vol, sim.r, sim.day,
                            undefined, undefined, undefined, sim.q
                        );
                        showToast(`Hedge placed: bought ${hedgeQty} shares at market.`, 4000);
                    }
                    continue;
                }
                if (targets) {
                    for (const p of targets) {
                        pnlSum += computePositionPnl(p, sim.S, vol, sim.r, sim.day, sim.q);
                        if (closePosition(sim, p.id, sim.S, vol, sim.r, sim.day, sim.q)) {
                            closed++;
                        }
                    }
                }
            }
            if (closed > 0) {
                const sign = pnlSum >= 0 ? '+' : '';
                showToast(`Closed ${closed} position${closed > 1 ? 's' : ''}. P&L: ${sign}${fmtDollar(pnlSum)}`, 4000);
                chainDirty = true;
                updateUI();
            }
        }
        // -- Compliance tier processing --
        if (choice.complianceTier) {
            onComplianceChoice(choice.complianceTier);
            if (effectiveHeat() >= COMPLIANCE_GAME_OVER_HEAT) {
                _showComplianceTermination();
            }
        }
        // -- Insider tip scheduling --
        if (choice._tipAction && eventEngine) {
            const tip = pickTip();
            const isReal = Math.random() < TIP_REAL_PROBABILITY;
            const eventId = isReal ? tip.realEvent : tip.fakeEvent;
            showToast(`"Word is ${tip.hint}."`, 6000);
            eventEngine.scheduleFollowup({ id: eventId, mtth: 14 }, sim.day);
            if (isReal) {
                compliance.heat += 1;
            }
        }
        // Margin call actions
        if (event._marginAction) {
            const vol = market.sigma;
            if (choice.playerFlag === 'margin_liquidated') {
                liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q);
                chainDirty = true;
                updateUI();
                if (portfolio.cash < sim.S) {
                    _showGameOver('Forced liquidation left your account in deficit by '
                        + fmtDollar(Math.abs(portfolio.cash))
                        + '. Regulators have flagged the account for review.');
                }
            } else if (choice.playerFlag === 'margin_partial') {
                // Close stock positions only
                const stockPos = portfolio.positions.filter(p => p.type === 'stock');
                for (const p of stockPos) {
                    closePosition(sim, p.id, sim.S, vol, sim.r, sim.day, sim.q);
                }
                chainDirty = true;
                updateUI();
                // Re-check margin after partial liquidation
                const recheck = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
                if (recheck.triggered) {
                    showToast('Still below margin. Full liquidation required.', 4000);
                    liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q);
                    chainDirty = true;
                    updateUI();
                    if (portfolio.cash < sim.S) {
                        _showGameOver('Forced liquidation left your account in deficit.');
                    }
                }
            }
            if (typeof _haptics !== 'undefined') _haptics.trigger('heavy');
        }
        // Rogue trading / game over actions
        if (event._gameOverAction) {
            _resetCore(DEFAULT_PRESET);
            loadPreset(DEFAULT_PRESET);
        }
        dirty = true;
    }, popupCat, event.magnitude);
}

function _showGameOver(contextText) {
    _popupQueue.unshift({
        category: 'gameover',
        magnitude: 'major',
        headline: 'Rogue Trading Investigation',
        context: contextText,
        choices: [
            {
                label: 'Accept your fate',
                desc: 'There is no way out. The investigation has begun.',
                playerFlag: 'game_over',
                resultToast: 'Your career at Meridian Capital is over.',
            },
        ],
        _gameOverAction: true,
    });
    _processPopupQueue();
}

function _showComplianceTermination() {
    playing = false;
    updatePlayBtn($, playing);
    playerChoices['compliance_terminated'] = sim.day;
    _showEpilogue('compliance');
}

function _portfolioEquity() {
    let equity = portfolio.cash;
    for (const p of portfolio.positions) {
        equity += computePositionValue(p, sim.S, market.sigma, sim.r, sim.day, sim.q);
    }
    return equity;
}

function _recordImpact(day, direction, magnitude, context) {
    if (Math.abs(magnitude) < 0.5) return;
    impactHistory.push({ day, direction, magnitude, context });
    if (impactHistory.length > 15) {
        impactHistory.sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
        impactHistory.length = 15;
    }
}

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

    // Quarterly desk review (live trading only)
    if (sim.day > HISTORY_CAPACITY && sim.day % QUARTERLY_CYCLE === 0) {
        const buyHoldPnl = (sim.S - 100) * (portfolio.initialCapital / 100);
        const actualPnl = _portfolioEquity() - portfolio.initialCapital;
        const vsBenchmark = actualPnl - buyHoldPnl;
        let rating;
        if (vsBenchmark > portfolio.initialCapital * 0.1) rating = 'strong';
        else if (vsBenchmark > 0) rating = 'solid';
        else if (vsBenchmark > -portfolio.initialCapital * 0.1) rating = 'underperform';
        else rating = 'poor';

        quarterlyReviews.push({ day: sim.day, pnl: actualPnl, vsBenchmark, rating });

        const texts = {
            strong: 'Quarterly Desk Review: Meridian\'s risk committee notes exceptional returns.',
            solid: 'Quarterly Desk Review: Solid quarter. Book within risk parameters.',
            underperform: 'Quarterly Desk Review: Returns lag benchmark. Risk committee requests position summary.',
            poor: 'Quarterly Desk Review: Managing Director Liu wants a meeting about your book.',
        };
        let text = texts[rating];
        if (playerChoices.cooperated_sec || playerChoices.silent_sec || playerChoices.accepted_insider_tip) {
            text += ' The SEC inquiry hasn\'t helped perception of the desk.';
        }
        showToast(text, rating === 'poor' ? 8000 : 5000);
    }

    const { expired, unwound } = processExpiry(sim, sim.day, sim.S, sim.day, market.sigma, sim.r, sim.q);
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
        const netDelta = computeNetDelta();
        const { fired, popups } = eventEngine.maybeFire(sim, sim.day, netDelta);
        for (const ev of popups) _popupQueue.push(ev);
        if (fired.length > 0) {
            sim.recomputeK();
            syncMarket(sim);
            syncSettingsUI($, _simSettingsObj());
            updateEventLog($, eventEngine.eventLog, chart.dayOrigin);
            updateCongressDiagrams($, eventEngine.world);
            if (typeof showToast !== 'undefined') {
                for (let i = 0; i < fired.length; i++) {
                    const ev = fired[i];
                    let headline = ev.headline;
                    if (ev.portfolioFlavor) {
                        const flavor = ev.portfolioFlavor(portfolio);
                        if (flavor) headline += ' ' + flavor;
                    }
                    const duration = ev.magnitude === 'major' ? 8000
                        : ev.magnitude === 'moderate' ? 5000 : 3000;
                    setTimeout(function() { showToast(headline, duration); }, i * 1500);
                }
            }
        }
    }

    // Portfolio-triggered popup events
    if (eventEngine) {
        const portfolioPopups = evaluatePortfolioPopups(sim, eventEngine.world, portfolio, sim.day);
        for (const pp of portfolioPopups) _popupQueue.push(pp);
    }

    // Layer 3: update param shifts based on gross exposure
    const grossNotional = computeGrossNotional();
    const grossRatio = grossNotional / (market.S * ADV);
    updateParamShifts(grossRatio);
    decayParamShifts();

    // Impact toast
    const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
    const toast = selectImpactToast(grossRatio, hasOptions ? 'option' : 'stock', sim.day);
    if (toast) showToast(toast, 3000);

    chainSkeleton = buildChainSkeleton(sim.S, sim.day, expiryMgr.update(sim.day));
    chainDirty = true;

    // Rogue trading check (before margin)
    const equity = _portfolioEquity();
    if (equity < portfolio.initialCapital * ROGUE_TRADING_THRESHOLD) {
        const lossAmt = fmtDollar(Math.abs(portfolio.initialCapital - equity));
        _showGameOver(`Meridian Capital's internal audit has uncovered ${lossAmt} in unauthorized losses on your desk. Bank security has been called. Your access has been revoked. The SEC has been notified.`);
        return;
    }

    // Check margin
    const margin = checkMargin(sim.S, vol, sim.r, sim.day, sim.q);
    if (margin.triggered) {
        portfolio.marginCallCount++;
        const shortfall = margin.required - margin.equity;
        _popupQueue.unshift({
            category: 'margin',
            magnitude: 'major',
            headline: 'Margin Call',
            context: `Portfolio equity ${fmtDollar(margin.equity)} is below the maintenance requirement of ${fmtDollar(margin.required)}. Shortfall: ${fmtDollar(shortfall)}. The risk desk is on the line.`,
            choices: [
                {
                    label: 'Liquidate all positions',
                    desc: 'Dump everything at market. Stop the bleeding.',
                    playerFlag: 'margin_liquidated',
                    resultToast: 'All positions liquidated.',
                },
                {
                    label: 'Sell stock first',
                    desc: 'Unload equity exposure, keep options book intact.',
                    playerFlag: 'margin_partial',
                    resultToast: 'Stock positions closed.',
                },
            ],
            _marginAction: true,
        });
        _processPopupQueue();
    }

    // Auto-scroll: keep latest candle near right edge when playing
    if (playing && camera) {
        const lastDay = sim.history.maxDay;
        const viewW = $.chartCanvas.clientWidth || 800;
        const targetWorldX = lastDay + 1;
        const rightEdgeWorld = camera.screenToWorldX
            ? camera.screenToWorldX(viewW - CHART_RIGHT_MARGIN)
            : camera.screenToWorld(viewW - CHART_RIGHT_MARGIN, 0).x;
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

    // Record portfolio value for sparkline
    if (portfolioHistory) pushSparkSample(portfolioHistory, _portfolioEquity());

    updateUI(margin);
    dirty = true;

    _processPopupQueue();
}

// ---------------------------------------------------------------------------
// tick — advance one trading day
// ---------------------------------------------------------------------------

/** Instant full-day tick (used by step button). */
function tick() {
    if (dayInProgress) {
        // Finish remaining sub-steps instantly
        while (!sim.dayComplete) {
            sim.substep();
            decayImpactVolumes();
            syncMarket(sim);
            rehedgeMM(portfolio.positions);
            _onSubstepTick();
        }
        sim.finalizeDay();
        dayInProgress = false;
    } else {
        // Full day: beginDay + substeps + finalizeDay
        sim.beginDay();
        for (let i = 0; i < INTRADAY_STEPS; i++) {
            sim.substep();
            decayImpactVolumes();
            syncMarket(sim);
            rehedgeMM(portfolio.positions);
            _onSubstepTick();
        }
        sim.finalizeDay();
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
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day, margin, sim.q, portfolioHistory);
    updateGreeksDisplay($, aggregateGreeks(sim.S, vol, sim.r, sim.day, sim.q));
    updateRateDisplay($, sim.r, rateHistory);
    refreshTooltip();
    if ($.tradeStrategySelect && $.tradeStrategySelect.value) {
        _updateTradeCreditDebit();
    }
    if (strategyMode && strategyLegs.length > 0) {
        updateStrategyBuilder();
    }
}

/** Lightweight UI update called every substep — reprices visible expiry only. */
function updateSubstepUI(marginInfo) {
    const vol = market.sigma;
    const pMap = _buildPosMap();
    const sMap = strategyMode ? _buildStrategyPosMap() : null;

    // Reprice the visible trade chain expiry (no dropdown rebuild)
    const tradePriced = _priceExpiry(_tradeExpiryIdx());
    updateChainDisplay($, tradePriced, pMap);
    updateStockBondPrices($, sim.S, sim.r, vol, chainSkeleton, pMap, sMap);

    updateTriggerPriceSlider($, sim.S);

    if (strategyMode) {
        const stratPriced = _priceExpiry(_strategyExpiryIdx());
        updateStrategySelectors($, stratPriced, sim.S, handleAddLeg, sMap);
    }

    // Portfolio mark-to-market
    updatePortfolioDisplay($, portfolio, sim.S, vol, sim.r, sim.day, marginInfo, sim.q, portfolioHistory);
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
    decayImpactVolumes();
    syncMarket(sim);
    rehedgeMM(portfolio.positions);
    _onSubstepTick();
    chart.setLiveCandle(sim._partial);
    _onSubstepUI();

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
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function decycleSpeed() {
    speedIndex = (speedIndex - 1 + SPEED_OPTIONS.length) % SPEED_OPTIONS.length;
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

function _resetCore(index) {
    document.getElementById('epilogue-overlay')?.classList.add('hidden');
    document.getElementById('fraud-overlay')?.classList.add('hidden');
    document.getElementById('popup-event-overlay')?.classList.add('hidden');
    _popupQueue.length = 0;
    for (const k in playerChoices) delete playerChoices[k];
    impactHistory.length = 0;
    quarterlyReviews.length = 0;
    resetPopupCooldowns();
    resetCompliance();
    sim.reset(index);
    resetPortfolio();
    resetImpactState();
    sim.prepopulate();
    syncMarket(sim);
    _initRateHistory();
    _initPortfolioHistory();
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
        const pos = executeMarketOrder(sim, type, side, qty, sim.S, vol, sim.r, sim.day, strike, expiryDay, undefined, sim.q);
        if (pos) {
            const label = side === 'short' ? 'Shorted' : 'Bought';
            if (typeof showToast !== 'undefined') showToast(label + ' ' + qty + 'k ' + type + ' at $' + pos.fillPrice.toFixed(2));
            if (typeof _haptics !== 'undefined') _haptics.trigger('success');
            if (type === 'stock') _recordImpact(sim.day, side === 'long' ? 1 : -1, qty, 'Stock trade');
        } else {
            if (typeof showToast !== 'undefined') showToast('Insufficient margin.');
            if (typeof _haptics !== 'undefined') _haptics.trigger('error');
        }
    } else {
        const triggerPrice = _getTriggerPrice();
        placePendingOrder(type, side, qty, orderType, triggerPrice, strike, expiryDay);
        if (typeof showToast !== 'undefined') showToast('Pending ' + orderType + ' order placed for ' + qty + 'k ' + type + '.');
        if (typeof _haptics !== 'undefined') _haptics.trigger('medium');
    }
    chainDirty = true;
    updateUI();
    dirty = true;
    _refreshChainOverlayIfOpen();
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
    const displaySpot = sim.S + getStockImpact(market.sigma);
    const bondDte = _getTradeExpiryDay() - sim.day;
    const bondMid = BOND_FACE_VALUE * Math.exp(-sim.r * bondDte / 252);
    const stockBA = computeBidAsk(displaySpot, displaySpot, vol);
    const bondBA = computeBidAsk(bondMid, displaySpot, vol);
    showChainOverlay($, chainSkeleton, _priceExpiryGreeks, stockBA, bondBA, _buildPosMap(), displaySpot);
}

function handleTradeSubmit(data) {
    const vol = market.sigma;
    const { type, side, qty, strike, expiryDay, orderType, limitPrice } = data;

    if (orderType === 'market') {
        const pos = executeMarketOrder(
            sim, type, side, qty, sim.S, vol, sim.r, sim.day, strike, expiryDay, undefined, sim.q
        );
        if (pos) {
            if (typeof showToast !== 'undefined') showToast('Order filled: ' + type + ' x' + qty + 'k');
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
    _refreshChainOverlayIfOpen();
}

function _refreshChainOverlayIfOpen() {
    if ($.chainOverlay.classList.contains('hidden') || !$._refreshChainOverlay) return;
    const vol = market.sigma;
    const displaySpot = sim.S + getStockImpact(market.sigma);
    const bondDte = _getTradeExpiryDay() - sim.day;
    const bondMid = BOND_FACE_VALUE * Math.exp(-sim.r * bondDte / 252);
    const stockBA = computeBidAsk(displaySpot, displaySpot, vol);
    const bondBA = computeBidAsk(bondMid, displaySpot, vol);
    $._refreshChainOverlay(stockBA, bondBA, _buildPosMap(), displaySpot);
}

function handleLiquidate() {
    const vol = market.sigma;
    liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q);
    chainDirty = true;
    updateUI();
    dirty = true;
    if (typeof _haptics !== 'undefined') _haptics.trigger('heavy');

    if (portfolio.cash < sim.S) {
        _showGameOver('Following the forced liquidation of all positions, your account remains in deficit by '
            + fmtDollar(Math.abs(portfolio.cash))
            + '. Regulators have flagged the account for review.');
    } else {
        if (typeof showToast !== 'undefined') showToast('All positions liquidated.');
    }
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

function executeWithRollback(resolvedLegs, strategyName, execMult) {
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
            sim, leg.type, side, absQty, sim.S, market.sigma, sim.r, sim.day,
            leg.strike, leg.expiryDay, strategyName, sim.q
        );
        if (pos) {
            if (!pos.strategyBaseQty) pos.strategyBaseQty = leg._baseQty || absQty;
            pos._fillCost = pos.fillPrice * absQty * (side === 'long' ? 1 : -1);
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
        const netDebit = results.reduce((sum, r) => sum + r._fillCost, 0);
        const mult = execMult || 1;
        const perUnit = Math.abs(netDebit / mult);
        const verb = netDebit > 0 ? 'at' : 'for credit';
        const name = strategyName + 's';
        if (typeof showToast !== 'undefined') showToast('Executed ' + mult + 'k ' + name + ' ' + verb + ' $' + perUnit.toFixed(2));
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
    const scaled = resolved.map(l => ({ ...l, _baseQty: Math.abs(l.qty), qty: l.qty * mult }));
    executeWithRollback(scaled, strat.name, mult);
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
        updateCreditDebit($, net);
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

function _showEpilogue(terminationReason = null) {
    const pages = generateEpilogue(eventEngine?.world ?? {}, sim, portfolio, eventEngine ? eventEngine.eventLog : [], playerChoices, impactHistory, quarterlyReviews, terminationReason);
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
    const targetScreenX = viewW - CHART_RIGHT_MARGIN;
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
