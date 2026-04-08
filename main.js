/* =====================================================
   main.js -- Entry point for the Shoals trading simulator.

   Wires together DOM cache, simulation loop, camera,
   rendering, autoplay, and event handlers.
   ===================================================== */

import { SPEED_OPTIONS, PRESETS, INTRADAY_STEPS, HISTORY_CAPACITY, QUARTERLY_CYCLE, CHART_SLOT_PX, CHART_LEFT_MARGIN, CHART_RIGHT_MARGIN, DEFAULT_PRESET, ROGUE_TRADING_THRESHOLD } from './src/config.js';
import { fmtDollar } from './src/format-helpers.js';
import { Simulation } from './src/simulation.js';
import { buildChainSkeleton, priceChainExpiry, ExpiryManager } from './src/chain.js';
import {
    portfolio, resetPortfolio, checkPendingOrders, processExpiry,
    chargeBorrowInterest, processDividends, checkMargin, aggregateGreeks,
    executeMarketOrder, closePosition, exerciseOption,
    liquidateAll, placePendingOrder, cancelOrder,
    computeNetDelta, computeGrossNotional, portfolioValue,
} from './src/portfolio.js';
import { ChartRenderer } from './src/chart.js';
import { StrategyRenderer } from './src/strategy.js';
import {
    cacheDOMElements, bindEvents, updateChainDisplay,
    rebuildTradeDropdown, rebuildStrategyDropdown,
    updatePortfolioDisplay, updateGreeksDisplay, updateRateDisplay, updateVixDisplay, updateStockBondPrices,
    syncSettingsUI, toggleStrategyView,
    updatePlayBtn, updateSpeedBtn,
    renderStrategyBuilder, wireInfoTips, updateStrategySelectors, updateStrategyChainDisplay, updateTriggerPriceSlider,
    updateDynamicSections, updateEventLog, updateCongressDiagrams, updateStandings,
    refreshTooltip,
    updateStrategyDropdowns, updateCreditDebit,
    showPopupEvent,
} from './src/ui.js';
import { initTheme, toggleTheme } from './src/theme.js';
import { EventEngine } from './src/events.js';
import { LLMEventSource } from './src/llm.js';
import { checkEndings, generateEnding } from './src/endings.js';
import { computePositionValue, computePositionPnl } from './src/position-value.js';
import { posKey } from './src/chain-renderer.js';
import { REFERENCE } from './src/reference.js';
import { computeVIXSpot } from './src/pricing.js';
import { syncMarket, market } from './src/market.js';
import {
    resetImpactState, decayImpactVolumes,
    modeledStockADV, rehedgeMM,
    updateParamShifts, decayParamShifts,
    applyParamOverlays, removeParamOverlays,
    selectImpactToast,
} from './src/price-impact.js';
import {
    listStrategies, getStrategy, saveStrategy, deleteStrategy,
    resolveLegs, computeNetCost, legsToRelative, nextAutoName,
} from './src/strategy-store.js';
import { applyStructuredEffects } from './src/world-state.js';
import { pickTip, resetUsedTips } from './src/events/tips.js';
import { getEventById, ALL_EVENTS } from './src/events/index.js';
import {
    factions, resetFactions, getFaction,
    onQuarterlyReview, applyComplianceChoice,
    shiftFaction, getFactionDescriptor,
    settleRegulatory, cooperateRegulatory,
} from './src/faction-standing.js';
import {
    evaluateTraits, getActiveTraits, getTrait,
    getTraitEffect, resetTraits, getActiveTraitIds, hasTrait,
} from './src/traits.js';
import {
    tickRegulations, getActiveRegulations, getRegulation,
    getRegulationEffect, resetRegulations, getRegulationPipeline,
} from './src/regulations.js';
import { TIP_REAL_PROBABILITY } from './src/config.js';
import { initAudio, setAmbientMood, playStinger, playMusic, stopMusic, setVolume, getVolume, resetAudio } from './src/audio.js';
import { getAvailableActions, executeLobbyAction, resetLobbying, getLastLobbyDay } from './src/lobbying.js';


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
let vixHistory = null;    // sparkline ring buffer for VX
let portfolioHistory = null; // sparkline ring buffer for portfolio value
let _savedOverlays = {};

const _popupQueue = [];
const playerChoices = {};

const _LOBBY_META = {
    pac_federalist:  { cls: 'lobby-pill-fed',     label: '+Fed' },
    pac_farmerlabor: { cls: 'lobby-pill-fl',      label: '+F-L' },
    host_fundraiser: { cls: 'lobby-pill-pol',     label: 'Host' },
    broker_deal:     { cls: 'lobby-pill-pol',     label: 'Deal' },
    leak_to_media:   { cls: 'lobby-pill-media',   label: 'Leak' },
    counsel_fed:     { cls: 'lobby-pill-fed-rel', label: 'Fed' },
};
const impactHistory = [];
let _lobbyCount = 0;
const quarterlyReviews = [];


// ---------------------------------------------------------------------------
// Micro-helpers — eliminate repeated typeof guards & duplicated blocks
// ---------------------------------------------------------------------------

function _toast(msg, duration) {
    if (typeof showToast !== 'undefined') showToast(msg, duration);
}
function _haptic(pattern) {
    if (typeof _haptics !== 'undefined') _haptics.trigger(pattern);
}
function _syncAll() {
    syncMarket(sim);
    market.vix = computeVIXSpot(sim.v, sim.kappa, sim.theta, sim.xi);
}
function _clampRate() {
    const ceil = getRegulationEffect('rateCeiling', null);
    const flr  = getRegulationEffect('rateFloor', null);
    if (ceil !== null && sim.r > ceil) sim.r = ceil;
    if (flr  !== null && sim.r < flr)  sim.r = flr;
}
/** Run one substep + impact decay + market sync + MM rehedge + order check. */
function _runSubstep() {
    sim.substep();
    _clampRate();
    decayImpactVolumes();
    _syncAll();
    rehedgeMM(portfolio.positions);
    _onSubstepTick();
}
/** Common tail after modifying strategyLegs: reprice, rebuild UI, mark dirty. */
function _refreshStrategyView() {
    strategy.resetRange(sim.S, strategyLegs);
    const spe = _priceExpiry(_strategyExpiryIdx());
    updateStrategyChainDisplay($, spe, handleAddLeg, _buildStrategyPosMap());
    updateStockBondPrices($, sim.S, sim.r, market.sigma, chainSkeleton, _buildPosMap(), _buildStrategyPosMap());
    updateStrategyBuilder();
    updateTimeSliderRange();
    dirty = true;
}
/** Populate strategyLegs from resolved legs array. */
function _populateStrategyLegs(resolved) {
    strategyLegs.length = 0;
    for (const leg of resolved) {
        strategyLegs.push({
            type: leg.type, qty: leg.qty, strike: leg.strike,
            expiryDay: leg.expiryDay, _refS: sim.S, _refDay: sim.day,
        });
    }
}

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

function _initVixHistory() {
    vixHistory = createSparkHistory(HISTORY_CAPACITY);
    const h = sim.history;
    for (let d = h.minDay; d <= h.maxDay; d++) {
        const bar = h.get(d);
        if (bar) pushSparkSample(vixHistory, computeVIXSpot(bar.v, sim.kappa, sim.theta, sim.xi));
    }
}

function _initPortfolioHistory() {
    portfolioHistory = createSparkHistory(HISTORY_CAPACITY);
    // Prepopulate with buy-and-hold performance tracking the stock price
    const h = sim.history;
    const cap = portfolio.initialCapital;
    for (let d = h.minDay; d <= h.maxDay; d++) {
        const bar = h.get(d);
        if (bar) pushSparkSample(portfolioHistory, cap / 100 * bar.close);
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
    return clamp(isNaN(raw) ? chainSkeleton.length - 1 : raw, 0, chainSkeleton.length - 1);
}

/** Get the selected strategy-tab expiry index, clamped to skeleton bounds. */
function _strategyExpiryIdx() {
    const raw = parseInt($.strategyExpiry?.value, 10);
    return clamp(isNaN(raw) ? chainSkeleton.length - 1 : raw, 0, chainSkeleton.length - 1);
}

/** Price one skeleton expiry on demand (price-only, no greeks). */
function _priceExpiry(idx) {
    if (idx < 0 || idx >= chainSkeleton.length) return null;
    return priceChainExpiry(sim.S, sim.v, sim.r, chainSkeleton[idx], false, sim.q);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

cacheDOMElements($);
$.settingsBtn = document.getElementById('settings-btn');
$.convictionsSection = document.getElementById('convictions-section');
$.convictionsList = document.getElementById('convictions-list');
$.regulationsList = document.getElementById('regulations-list');
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
        camera.bindMousePan($.chartCanvas, { button: 0 });
        camera.bindTouch($.chartCanvas);
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

    // 5. Bind strategy canvas wheel zoom and drag pan
    strategy.bindWheel($.strategyCanvas);
    strategy.bindPan($.strategyCanvas);

    // 6. Bind click on strategy canvas for legend toggling (skip if drag)
    $.strategyCanvas.addEventListener('click', (e) => {
        if (strategy._wasDrag && strategy._wasDrag()) return;
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
        { key: ' ',  label: 'Play / Pause',      group: 'Simulation', action: () => togglePlay() },
        { key: '.', label: 'Speed up',            group: 'Simulation', action: () => cycleSpeed() },
        { key: ',', label: 'Slow down',            group: 'Simulation', action: () => decycleSpeed() },
        { key: '/', label: 'Step forward one day', group: 'Simulation', action: () => step() },
        { key: 'r', label: 'Reset simulation',    group: 'Simulation', action: () => resetSim() },
        { key: 's', label: 'Toggle sidebar',       group: 'View',       action: () => { _toolbar.toggleSidebar($.panelToggle, $.sidebar); _haptic('light'); } },
        { key: 't', label: 'Toggle sidebar',       group: 'View',       action: () => { _toolbar.toggleSidebar($.panelToggle, $.sidebar); _haptic('light'); } },
        { key: '[', label: 'Previous tab',         group: 'View',       action: () => cycleTab(-1) },
        { key: ']', label: 'Next tab',             group: 'View',       action: () => cycleTab(1) },
        { key: 'Escape', label: 'Close sidebar',   group: 'View',       action: () => { if ($.sidebar.classList.contains('open')) _toolbar.toggleSidebar($.panelToggle, $.sidebar); } },
        { key: '=', label: 'Zoom in',              group: 'View',       action: () => { if (camera) camera.zoomBy(1.2); } },
        { key: '-', label: 'Zoom out',             group: 'View',       action: () => { if (camera) camera.zoomBy(1 / 1.2); } },
        { key: '0', label: 'Reset zoom',           group: 'View',       action: () => { if (camera) { camera.zoom = CHART_SLOT_PX; _repositionCamera(); } } },
        { key: 'b', label: 'Buy / sell stock',     group: 'Trade',      action: () => handleBuyStock() },
        { key: 'n', label: 'Buy / sell bond',      group: 'Trade',      action: () => handleBuyBond() },
        { key: 'x', label: 'Toggle buy / sell',    group: 'Trade',      action: () => document.getElementById('mode-btn').click() },
        { key: 'Enter', label: 'Execute strategy', group: 'Trade',      action: () => handleTradeExecStrategy() },
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
            title: 'Shoals',
            lastUpdated: '2026-04-05',
            description: 'Trade stocks, bonds, and American options in a realistic market simulator. Build multi-leg strategies with live payoff diagrams, manage a margin portfolio, and navigate narrative-driven market events during a volatile political term.',
            controls: [
                { label: 'Buy / sell stock', value: 'Click Buy button or press B' },
                { label: 'Buy / sell bond', value: 'Click Bond button or press N' },
                { label: 'Trade options', value: 'Open chain (O) from Trade tab' },
                { label: 'Execute strategy', value: 'Enter key or Execute button' },
                { label: 'Build strategy', value: 'Add legs in Strategy tab' },
                { label: 'Pan / zoom chart', value: 'Drag to pan, = / - / 0 to zoom' },
                { label: 'Cycle tabs', value: '[ previous, ] next' },
                { label: 'Speed', value: '. faster, , slower, / step' },
                { label: 'Load preset', value: 'Settings tab or keys 1\u20137' },
            ],
            shortcuts: _shortcuts,
            repo: 'https://github.com/a9lim/shoals',
        });
    }

    // 9. Bind UI events
    bindEvents($, {
        onTogglePlay:     () => togglePlay(),
        onStep:           () => step(),
        onSpeedUp:        () => cycleSpeed(),
        onSpeedDown:      () => decycleSpeed(),
        onToggleTheme:    () => { toggleTheme(); updateUI(); dirty = true; },
        onPresetChange:   (index) => loadPreset(index),
        onReset:          () => resetSim(),
        onSliderChange:   (param, value) => syncSliderToSim(param, value),
        onTimeSlider:     (pct) => { sliderPct = pct; updateTimeSliderRange(); dirty = true; },
        onBuyStock:       () => handleBuyStock(),
        onShortStock:     () => handleShortStock(),
        onBuyBond:        () => handleBuyBond(),
        onShortBond:      () => handleShortBond(),
        onBuyVix:         () => handleBuyVix(),
        onShortVix:       () => handleShortVix(),
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
        onTradeSubmit:    (data) => handleTradeSubmit(data),
        onTradeClose:     () => setTimeout(_processPopupQueue, 100),
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
            if (ok) _toast('Position closed.');
            chainDirty = true;
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:exerciseOption', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            // Capture qty before exercise removes the position
            const pos = portfolio.positions.find(p => p.id === id);
            const qty = pos ? pos.qty : 0;
            const isCall = pos && pos.type === 'call';
            const result = exerciseOption(id, sim.S, sim.day, market.sigma, sim.r, sim.q);
            if (result && qty > 0) {
                _recordImpact(sim.day, isCall ? 1 : -1, qty, 'Option exercise');
            }
            _toast(result ? 'Option exercised.' : 'Cannot exercise.');
            chainDirty = true;
            updateUI();
            dirty = true;
        }
    });

    document.addEventListener('shoals:cancelOrder', (e) => {
        const id = e.detail && e.detail.id;
        if (id != null) {
            cancelOrder(id);
            _toast('Order cancelled.');
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
            _toast('Unwound "' + name + '" (' + closed + ' position' + (closed > 1 ? 's' : '') + ').');
            chainDirty = true;
            updateUI();
            dirty = true;
        }
    });

    // 11. Init audio on first user interaction (Web Audio API requires gesture)
    function _initAudioOnce() {
        initAudio();
        setAmbientMood('calm');
        document.removeEventListener('click', _initAudioOnce);
        document.removeEventListener('keydown', _initAudioOnce);
    }
    document.addEventListener('click', _initAudioOnce, { once: true });
    document.addEventListener('keydown', _initAudioOnce, { once: true });

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
    _syncAll();
    _initRateHistory();
    _initVixHistory();
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
        // Faction state lives in faction-standing.js; attach by reference so events can read it
        eventEngine.world.factions = factions;
    }
    updateDynamicSections($, DEFAULT_PRESET);
    updateEventLog($, eventEngine ? eventEngine.eventLog : [], chart.dayOrigin);
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);
    if (eventEngine) updateStandings($, eventEngine.world, factions, getFactionDescriptor);
    if ($.lobbyBar) $.lobbyBar.style.display = eventEngine ? '' : 'none';
    _updateLobbyPills();

    // Wire lobby pill buttons
    if ($.lobbyBar) {
        $.lobbyBar.addEventListener('click', (e) => {
            if (!eventEngine) return;
            const btn = e.target.closest('.lobby-pill');
            if (!btn || btn.disabled) return;
            const actionId = btn.dataset.lobby;
            const day = sim.history.maxDay;
            const result = executeLobbyAction(actionId, day, eventEngine.world);
            if (result) {
                portfolio.cash -= result.cost;
                if (result.playerFlag) playerChoices[result.playerFlag] = day;
                else playerChoices['lobbied_' + actionId] = day;
                _lobbyCount++;
                _toast('Lobbying: ' + result.action.name + (result.cost > 0 ? ' (-$' + result.cost + 'k)' : ''), 3000);
                _updateLobbyPills();
                dirty = true;
            }
        });
    }

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
                mouseX = -1; mouseY = -1;
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

    // Settings dropdown (volume)
    if ($.settingsBtn) {
        _settings.create($.settingsBtn, [
            { type: 'slider', label: 'Volume', min: 0, max: 100, step: 1,
              value: Math.round(getVolume() * 100),
              format: v => Math.round(v) + '%',
              onChange: v => setVolume(v / 100) }
        ]);
    }

    // 19. Debug console API — use window._debug in the browser console
    window._debug = {
        sim, portfolio, market, factions,
        get eventEngine() { return eventEngine; },
        get world() { return eventEngine?.world; },
        popupQueue: _popupQueue,
        /** Fire any event by id. Toast events apply immediately; popup events queue. */
        fireEvent(id) {
            const ev = getEventById(id);
            if (!ev) { console.error(`No event with id "${id}"`); return; }
            if (!eventEngine) { console.error('eventEngine is null (not in Dynamic mode)'); return; }
            const result = eventEngine._fireEvent(ev, sim, sim.day, 0, 0);
            if (result.queued) { _popupQueue.push(result.event); _processPopupQueue(); }
            else { updateEventLog($, eventEngine.eventLog, chart.dayOrigin); updateCongressDiagrams($, eventEngine.world); updateStandings($, eventEngine.world, factions, getFactionDescriptor); }
            console.log('Fired:', ev.id, result);
            return result;
        },
        /** Show an arbitrary popup (no event engine needed). */
        popup(headline, context, choices) {
            _popupQueue.push({ headline, context, choices: choices || [{ label: 'OK', desc: 'Dismiss' }], popup: true });
            _processPopupQueue();
        },
        /** Show a toast message. */
        toast(msg, ms) { _toast(msg, ms || 3000); },
        /** List all event ids, optionally filtered by substring. */
        listEvents(filter) {
            const list = ALL_EVENTS.map(e => ({ id: e.id, category: e.category, magnitude: e.magnitude, popup: !!e.popup, superevent: !!e.superevent }));
            if (filter) return list.filter(e => e.id.includes(filter) || (e.category && e.category.includes(filter)));
            return list;
        },
    };

    // 20. Start animation loop
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
                _runSubstep();
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
                dayInProgress = false;
                _syncAll();
                _onDayComplete();
                removeParamOverlays(sim, _savedOverlays);
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
        const side = pos.qty > 0 ? 'Bought' : 'Sold';
        _toast(side + ' ' + Math.abs(pos.qty) + 'k ' + pos.type + ' @ $' + pos.fillPrice.toFixed(2));
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

function _updateLobbyPills() {
    if (!$.lobbyBar || !$.lobbyActions) return;
    const day = sim.history.maxDay;
    const actions = getAvailableActions(day, portfolio.cash);
    while ($.lobbyActions.firstChild) $.lobbyActions.removeChild($.lobbyActions.firstChild);
    if (actions.length === 0 || !eventEngine) {
        $.lobbyBar.style.display = 'none';
        return;
    }
    $.lobbyBar.style.display = '';
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (i > 0) {
            const div = document.createElement('span');
            div.className = 'substrate-divider divider';
            $.lobbyActions.appendChild(div);
        }
        const btn = document.createElement('button');
        const colorCls = (_LOBBY_META[action.id] || {}).cls || '';
        const isFirst = i === 0;
        const isLast = i === actions.length - 1;
        let radiusCls = '';
        if (isFirst && isLast) radiusCls = 'pill-btn-solo';
        else if (isFirst) radiusCls = 'pill-btn-left';
        else if (isLast) radiusCls = 'pill-btn-right';
        btn.className = `pill-btn lobby-pill ${colorCls} ${radiusCls}`.trim();
        btn.dataset.lobby = action.id;
        btn.disabled = !action.affordable || !action.cooldownReady;
        const label = (_LOBBY_META[action.id] || {}).label || action.name;
        const cost = action.cost > 0 ? ` $${action.cost}k` : '';
        btn.textContent = label + cost;
        btn.title = action.desc + (action.cooldownReady ? '' : ' (cooldown)');
        $.lobbyActions.appendChild(btn);
    }
}

/** Called after all 16 sub-steps complete — runs portfolio/chain/margin checks. */
function _processPopupQueue() {
    if (_popupQueue.length === 0) return;
    // Don't show if another overlay is open
    if (!$.tradeDialog.classList.contains('hidden')) return;
    if (!$.popupOverlay.classList.contains('hidden')) return;

    const event = _popupQueue.shift();
    playing = false;
    updatePlayBtn($, playing);

    const contextText = typeof event.context === 'function'
        ? event.context(sim, eventEngine?.world, portfolio)
        : event.context || '';

    const popupCat = event.category || (event.id && event.id.startsWith('desk_') ? 'desk' : '');
    playStinger('alert');

    const isSuperevent = !!event.superevent;

    if (isSuperevent) {
        const _seMu = event.params?.mu || (event.choices?.[0]?.deltas?.mu) || 0;
        if (_seMu > 0) playMusic('triumph');
        else if (_seMu < -0.03) playMusic('collapse');
        else playMusic('tension');
    }

    if (event.choices && event.choices.some(c => c.complianceTier)) {
        factions.equityAtLastReview = _portfolioEquity();
        factions.lastReviewDay = sim.day;
    }
    showPopupEvent($, event.headline, contextText, event.choices, (idx) => {
        if (isSuperevent) stopMusic(2000);
        const choice = event.choices[idx];
        if (choice.deltas && eventEngine) {
            eventEngine.applyDeltas(sim, choice.deltas);
        }
        if (choice.effects && eventEngine) {
            applyStructuredEffects(eventEngine.world, choice.effects);
        }
        if (choice.factionShifts) {
            for (const fs of choice.factionShifts) {
                let value = fs.value;
                if (fs.when?.hasTrait && hasTrait(fs.when.hasTrait)) value += (fs.bonus || 0);
                shiftFaction(fs.faction, value);
            }
        }
        if (choice.playerFlag) {
            playerChoices[choice.playerFlag] = sim.day;
        }
        if (choice.cashPenalty) {
            portfolio.cash -= choice.cashPenalty;
        }
        if (choice.regulatoryAction === 'settle') {
            settleRegulatory();
        } else if (choice.regulatoryAction === 'cooperate') {
            cooperateRegulatory();
        }
        if (choice.followups && eventEngine) {
            for (const fu of choice.followups) {
                eventEngine.scheduleFollowup(fu, sim.day);
            }
        }
        if (choice.resultToast) {
            _toast(choice.resultToast, 4000);
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
                        _toast(`Hedge placed: bought ${hedgeQty} shares at market.`, 4000);
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
                _toast(`Closed ${closed} position${closed > 1 ? 's' : ''}. P&L: ${sign}${fmtDollar(pnlSum)}`, 4000);
                chainDirty = true;
                updateUI();
            }
        }
        // -- Compliance tier processing --
        if (choice.complianceTier) {
            applyComplianceChoice(choice.complianceTier);
            if (getFaction('firmStanding') <= 0) {
                _showComplianceTermination();
            }
        }
        // -- Insider tip scheduling --
        if (choice._tipAction && eventEngine) {
            const tip = pickTip();
            const isReal = Math.random() < TIP_REAL_PROBABILITY;
            const eventId = isReal ? tip.realEvent : tip.fakeEvent;
            _toast(`"Word is ${tip.hint}."`, 6000);
            eventEngine.scheduleFollowup({ id: eventId, mtth: 14 }, sim.day);
            if (isReal) {
                shiftFaction('firmStanding', -5);
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
                    _toast('Still below margin. Full liquidation required.', 4000);
                    liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q);
                    chainDirty = true;
                    updateUI();
                    if (portfolio.cash < sim.S) {
                        _showGameOver('Forced liquidation left your account in deficit.');
                    }
                }
            }
            _haptic('heavy');
        }
        // Rogue trading / game over actions
        if (event._gameOverAction) {
            _resetCore(DEFAULT_PRESET);
            loadPreset(DEFAULT_PRESET);
        }
        dirty = true;
    }, popupCat, event.magnitude, isSuperevent);
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
    const pages = generateEnding('forced_resignation', eventEngine?.world ?? {}, sim, portfolio,
        eventEngine ? eventEngine.eventLog : [], playerChoices, impactHistory, quarterlyReviews);
    _showEpilogue(pages);
}

function _updateTraitDisplay() {
    const traits = getActiveTraits();
    const section = $.convictionsSection;
    const list = $.convictionsList;
    if (!section || !list) return;
    if (traits.length === 0) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    list.textContent = '';
    for (const c of traits) {
        const item = document.createElement('div');
        item.className = 'conviction-item';
        item.title = c.description || c.name;
        const name = document.createElement('span');
        name.className = 'conviction-name';
        name.textContent = c.name;
        item.appendChild(name);
        list.appendChild(item);
    }
}

function _updateRegulationDisplay() {
    const list = $.regulationsList;
    if (!list) return;
    const pipeline = getRegulationPipeline();
    list.textContent = '';
    if (pipeline.length === 0) {
        const span = document.createElement('span');
        span.className = 'text-muted';
        span.style.fontSize = '0.78rem';
        span.textContent = 'None';
        list.appendChild(span);
        return;
    }
    for (const entry of pipeline) {
        const badge = document.createElement('div');
        badge.className = 'regulation-badge';
        const reg = getRegulation(entry.id);
        badge.dataset.tooltip = reg ? reg.description : '';
        badge.textContent = entry.name + ' — ' + _regStatusLabel(entry);
        if (entry.color) badge.style.color = entry.color;
        list.appendChild(badge);
    }
}

function _regStatusLabel(entry) {
    if (entry.status === 'active' && entry.remainingDays != null) {
        const months = entry.remainingDays / 21;
        if (months < 1) return '<1mo';
        return Math.round(months) + 'mo';
    }
    const labels = { introduced: 'Introduced', committee: 'Committee', floor: 'Floor', active: 'Active' };
    return labels[entry.status] || entry.status;
}

function _portfolioEquity() {
    let equity = portfolio.cash;
    for (const p of portfolio.positions) {
        equity += computePositionValue(p, sim.S, market.sigma, sim.r, sim.day, sim.q);
    }
    return equity;
}

function _showInterjection(text) {
    const container = document.getElementById('toast-container');
    _toast(text, 6000);
    requestAnimationFrame(() => {
        const last = container?.lastElementChild;
        if (last) last.classList.add('interjection-toast');
    });
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

    // Record rate + VIX for sparklines
    if (rateHistory) pushSparkSample(rateHistory, sim.r);
    if (vixHistory) pushSparkSample(vixHistory, market.vix);

    chargeBorrowInterest(sim.S, vol, sim.r, sim.borrowSpread, sim.day);

    // Quarterly dividend payments (every 63 trading days, aligned with expiry cycle)
    // Discrete proportional drop: stock price falls by q/4, matching the option
    // pricing model (binomial tree with discrete dividends at QUARTERLY_CYCLE).
    if (sim.q > 0 && sim.day > 0 && sim.day % QUARTERLY_CYCLE === 0) {
        sim.S *= (1 - sim.q / 4);
        const divNet = processDividends(sim.S, sim.q);
        if (divNet !== 0) {
            const label = divNet > 0 ? 'Dividend received' : 'Dividend charged';
            _toast(label + ': $' + Math.abs(divNet).toFixed(2));
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

        // Adjust firmStanding based on quarterly performance
        onQuarterlyReview(_portfolioEquity(), sim.day);

        const texts = {
            strong: 'Quarterly Desk Review: Meridian\'s risk committee notes exceptional returns.',
            solid: 'Quarterly Desk Review: Solid quarter. Book within risk parameters.',
            underperform: 'Quarterly Desk Review: Returns lag benchmark. Risk committee requests position summary.',
            poor: 'Quarterly Desk Review: Managing Director Vasquez wants a meeting about your book.',
        };
        let text = texts[rating];
        if (playerChoices.cooperated_sec || playerChoices.silent_sec || playerChoices.accepted_insider_tip) {
            text += ' The SEC inquiry hasn\'t helped perception of the desk.';
        }
        _toast(text, rating === 'poor' ? 8000 : 5000);
    }

    const { unwound } = processExpiry(sim, sim.day, sim.S, sim.day, market.sigma, sim.r, sim.q);
    if (unwound.length > 0) {
        const names = [...new Set(unwound.map(p => p.strategyName))];
        for (const name of names) {
            _toast('Strategy "' + name + '" expired — unwound all legs.');
        }
        chainDirty = true;
    }

    // Crisis profit tracking for trait system
    if (eventEngine) {
        const _eq = portfolioValue(market.S, Math.sqrt(market.v), market.r, market.day, market.q);
        if (_eq > portfolio.initialCapital * 1.1) {
            const _w = eventEngine.world;
            if (_w.geopolitical.recessionDeclared) playerChoices.profited_recession = true;
            if (_w.geopolitical.oilCrisis) playerChoices.profited_oil_crisis = true;
            if (_w.geopolitical.farsistanEscalation >= 2) playerChoices.profited_war_escalation = true;
            if (_w.investigations.impeachmentStage >= 2) playerChoices.profited_impeachment = true;
        }
    }

    const _traitCtx = {
        playerChoices,
        impactHistory,
        quarterlyReviews,
        factions,
        portfolio,
        daysSinceLiveTrade: sim.history.maxDay - HISTORY_CAPACITY,
        lobbyCount: _lobbyCount,
        flags: {
            largeImpactTrades: impactHistory.length,
            continentalMentions: playerChoices._continentalMentions || 0,
        },
    };
    const newTraits = evaluateTraits(_traitCtx);
    for (const id of newTraits) {
        const trait = getTrait(id);
        if (trait) _toast(`${trait.permanent ? 'Conviction unlocked' : 'Reputation earned'}: ${trait.name}`, 4000);
    }

    // Fire dynamic events
    if (eventEngine) {
        eventEngine.setPlayerContext(
            playerChoices,
            factions,
            getActiveRegulations().map(r => r.id),
            getActiveTraitIds(),
            {
                equity: _portfolioEquity(),
                peakEquity: portfolio.peakValue || portfolio.initialCapital,
                pnlPct: (_portfolioEquity() - portfolio.initialCapital) / portfolio.initialCapital,
                maxDrawdown: portfolio.maxDrawdown || 0,
                grossLeverage: computeGrossNotional() / Math.max(1, _portfolioEquity()),
                positionCount: portfolio.positions.length,
                netDelta: computeNetDelta(),
                cash: portfolio.cash,
                strongQuarters: quarterlyReviews.filter(r => r.rating === 'strong').length,
                impactTradeCount: impactHistory.length,
            },
            _lobbyCount,
            getLastLobbyDay()
        );
        const netDelta = computeNetDelta();
        const { fired, popups } = eventEngine.maybeFire(sim, sim.day, netDelta);
        for (const ev of popups) _popupQueue.push(ev);
        const hasSupereventPopups = popups.some(ev => ev.superevent);
        if (hasSupereventPopups) {
            sim.recomputeK();
            _syncAll();
            syncSettingsUI($, _simSettingsObj());
            updateEventLog($, eventEngine.eventLog, chart.dayOrigin);
            updateCongressDiagrams($, eventEngine.world);
            updateStandings($, eventEngine.world, factions, getFactionDescriptor);
        }
        if (fired.length > 0) {
            sim.recomputeK();
            _syncAll();
            syncSettingsUI($, _simSettingsObj());
            updateEventLog($, eventEngine.eventLog, chart.dayOrigin);
            updateCongressDiagrams($, eventEngine.world);
            updateStandings($, eventEngine.world, factions, getFactionDescriptor);
            for (let i = 0; i < fired.length; i++) {
                const ev = fired[i];
                let headline = ev.headline;
                if (ev.interjection) {
                    setTimeout(function() { _showInterjection(headline); }, i * 1500);
                    continue;
                }
                if (ev.portfolioFlavor) {
                    const flavor = ev.portfolioFlavor(portfolio);
                    if (flavor) headline += ' ' + flavor;
                }
                if (getTraitEffect('eventHintArrows', false) && ev.params) {
                    const _hintMu = ev.params.mu || 0;
                    if (_hintMu > 0) headline += ' \u2191';
                    else if (_hintMu < 0) headline += ' \u2193';
                }
                const duration = ev.magnitude === 'major' ? 8000
                    : ev.magnitude === 'moderate' ? 5000 : 3000;
                setTimeout(function() { _toast(headline, duration); }, i * 1500);
                setTimeout(function() {
                    const _mu = ev.params?.mu || 0;
                    if (_mu > 0.02) playStinger('positive');
                    else if (_mu < -0.02) playStinger('negative');
                    else playStinger('alert');
                }, i * 1500 + 200);
            }
        }
    }

    // Portfolio-triggered popup events
    if (eventEngine) {
        const portfolioPopups = eventEngine.evaluateTriggers(sim, sim.day);
        for (const pp of portfolioPopups) _popupQueue.push(pp);
    }

    if (eventEngine) {
        const { expired } = tickRegulations();
        for (const id of expired) {
            const reg = getRegulation(id);
            if (reg) _toast('Regulation expired: ' + reg.name, 3000);
        }
    }

    // Endings check (after events and faction shifts)
    if (eventEngine) {
        const endingId = checkEndings(sim, portfolio, eventEngine.world, playerChoices);
        if (endingId) {
            playing = false;
            updatePlayBtn($, playing);
            if (endingId === 'term_ends') eventEngine.computeElectionOutcome(sim);
            const pages = generateEnding(endingId, eventEngine.world, sim, portfolio,
                eventEngine.eventLog, playerChoices, impactHistory, quarterlyReviews);
            _showEpilogue(pages);
            return;
        }
    }

    // lobbyingExposed is set directly here (not via event system) because it's
    // a meta-flag derived from player behavior + faction state, not a narrative beat.
    // Check if lobbying has been exposed (heavy lobbying while media is watching)
    if (eventEngine && _lobbyCount >= 3 && factions.mediaTrust < 40 && !eventEngine.world.media.lobbyingExposed) {
        eventEngine.world.media.lobbyingExposed = true;
    }

    // Update ambient mood based on market regime
    const _ambientVol = Math.sqrt(sim.v);
    if (_ambientVol > 0.35 || sim.lambda > 5) setAmbientMood('crisis');
    else if (_ambientVol > 0.20 || sim.lambda > 2) setAmbientMood('tense');
    else setAmbientMood('calm');

    // Layer 3: update param shifts based on gross exposure
    const grossNotional = computeGrossNotional();
    const grossRatio = grossNotional / (market.S * modeledStockADV(market.sigma));
    updateParamShifts(grossRatio);
    decayParamShifts();

    // Impact toast
    const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
    const toast = selectImpactToast(grossRatio, hasOptions ? 'option' : 'stock', sim.day);
    if (toast) _toast(toast, 3000);

    if (grossRatio > 0.75) shiftFaction('regulatoryExposure', 1);

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
    _updateTraitDisplay();
    _updateRegulationDisplay();
    _updateLobbyPills();
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
        while (!sim.dayComplete) _runSubstep();
        sim.finalizeDay();
        dayInProgress = false;
    } else {
        // Full day: beginDay + substeps + finalizeDay
        sim.beginDay();
        for (let i = 0; i < INTRADAY_STEPS; i++) _runSubstep();
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
    updateVixDisplay($, market.vix, vixHistory);
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
    updateVixDisplay($, market.vix, vixHistory);

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
    _haptic(playing ? 'medium' : 'light');
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
    _runSubstep();
    chart.setLiveCandle(sim._partial);
    _onSubstepUI();

    // If all substeps done, finalize the day
    if (sim.dayComplete) {
        sim.finalizeDay();
        dayInProgress = false;
        _syncAll();
        _onDayComplete();
    }

    dirty = true;
    _haptic('light');
}

function _syncLerpSpeed() {
    chart.setSubstepInterval(1000 / (SPEED_OPTIONS[speedIndex] * INTRADAY_STEPS));
}

function cycleSpeed() {
    speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();
    _haptic('selection');
}

function decycleSpeed() {
    speedIndex = (speedIndex - 1 + SPEED_OPTIONS.length) % SPEED_OPTIONS.length;
    updateSpeedBtn($, SPEED_OPTIONS[speedIndex] * 2);
    _syncLerpSpeed();
    _haptic('selection');
}

function _resetCore(index) {
    document.getElementById('epilogue-overlay')?.classList.add('hidden');
    document.getElementById('fraud-overlay')?.classList.add('hidden');
    document.getElementById('popup-event-overlay')?.classList.add('hidden');
    _popupQueue.length = 0;
    for (const k in playerChoices) delete playerChoices[k];
    _lobbyCount = 0;
    impactHistory.length = 0;
    quarterlyReviews.length = 0;
    if (eventEngine) eventEngine.resetTriggerCooldowns();
    resetUsedTips();
    resetFactions();
    // Re-attach faction reference after reset (faction-standing.js is the source of truth)
    if (eventEngine) eventEngine.world.factions = factions;
    resetTraits();
    resetRegulations();
    resetLobbying();
    resetAudio();
    sim.reset(index);
    resetPortfolio();
    resetImpactState();
    sim.prepopulate();
    _syncAll();
    _initRateHistory();
    _initVixHistory();
    _initPortfolioHistory();
    chart.dayOrigin = sim.day;
    dayInProgress = false;
    Object.assign(chart._lerp, { day: -1, close: 0, high: 0, low: 0, _from: 0, _targetClose: 0, _targetHigh: 0, _targetLow: 0, _t: 1 });
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
    updateStrategyBuilder();
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
        // Attach faction reference (faction-standing.js is the source of truth)
        eventEngine.world.factions = factions;
    } else {
        eventEngine = null;
    }
    updateEventLog($, eventEngine ? eventEngine.eventLog : [], chart.dayOrigin);
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);
    if (eventEngine) updateStandings($, eventEngine.world, factions, getFactionDescriptor);
    if ($.lobbyBar) $.lobbyBar.style.display = eventEngine ? '' : 'none';

    updateUI();
    _repositionCamera();
    dirty = true;
    _haptic('medium');
}

function resetSim() {
    const index = $.presetSelect.selectedIndex;
    _resetCore(index);

    if (eventEngine) eventEngine.reset();
    if (_isLLMPreset(index) && eventEngine) eventEngine.prefetch(sim);
    updateEventLog($, eventEngine ? eventEngine.eventLog : [], chart.dayOrigin);
    updateCongressDiagrams($, eventEngine ? eventEngine.world : null);
    if (eventEngine) updateStandings($, eventEngine.world, factions, getFactionDescriptor);

    updateUI();
    _repositionCamera();
    dirty = true;
    _haptic('heavy');
}

function _isDynamicPreset(index) { return index >= 5; }
function _isLLMPreset(index) { return index >= 6; }

function syncSliderToSim(param, value) {
    sim[param] = value;
    if (param === 'rho') sim._recomputeRhoDerived();
    _syncAll();
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
            _toast(label + ' ' + qty + 'k ' + type + ' at $' + pos.fillPrice.toFixed(2));
            _haptic('success');
            if (type === 'stock') _recordImpact(sim.day, side === 'long' ? 1 : -1, qty, 'Stock trade');
        } else {
            _toast('Insufficient margin.');
            _haptic('error');
        }
    } else {
        const triggerPrice = _getTriggerPrice();
        placePendingOrder(type, side, qty, orderType, triggerPrice, strike, expiryDay);
        _toast('Pending ' + orderType + ' order placed for ' + qty + 'k ' + type + '.');
        _haptic('medium');
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

function handleBuyVix() {
    _executeOrPlace('vixfuture', 'long', _getTradeQty(), null, _getTradeExpiryDay());
}

function handleShortVix() {
    _executeOrPlace('vixfuture', 'short', _getTradeQty(), null, _getTradeExpiryDay());
}

function handleChainCellClick(info) {
    const expiryDay = info.expiryDay ?? ((info.type === 'bond' || info.type === 'vixfuture') ? _getTradeExpiryDay() : undefined);
    _executeOrPlace(info.type, info.side, _getTradeQty(), info.strike ?? undefined, expiryDay);
}


function handleTradeSubmit(data) {
    const vol = market.sigma;
    const { type, side, qty, strike, expiryDay, orderType, limitPrice } = data;

    if (orderType === 'market') {
        const pos = executeMarketOrder(
            sim, type, side, qty, sim.S, vol, sim.r, sim.day, strike, expiryDay, undefined, sim.q
        );
        if (pos) {
            _toast('Order filled: ' + type + ' x' + qty + 'k');
            _haptic('success');
        } else {
            _toast('Order failed — insufficient margin.');
            _haptic('error');
        }
    } else {
        placePendingOrder(type, side, qty, orderType, limitPrice, strike, expiryDay);
        _toast('Pending ' + orderType + ' order placed.');
        _haptic('medium');
    }

    chainDirty = true;
    updateUI();
    dirty = true;
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
    if (expiryDay == null && (type === 'call' || type === 'put' || type === 'bond' || type === 'vixfuture')) {
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

    _refreshStrategyView();
    _haptic('selection');
}

function handleRemoveLeg(index) {
    strategyLegs.splice(index, 1);
    _refreshStrategyView();
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
        _toast('A strategy with that name already exists.');
        _haptic('error');
        return;
    }
    if (id === null) {
        _toast('Strategy limit reached (max 50).');
        _haptic('error');
        return;
    }
    currentStrategyHash = id;
    isBuiltinLoaded = false;
    _refreshStrategyDropdowns();
    if ($.strategyLoadSelect) $.strategyLoadSelect.value = id;
    const saved = getStrategy(id);
    _toast('Strategy "' + (saved ? saved.name : '') + '" saved.');
    _haptic('success');
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
        _toast('Strategy failed (leg ' + (results.length + 1) + ' rejected) \u2014 all legs unwound.');
        _haptic('error');
    } else if (results.length > 0) {
        const netDebit = results.reduce((sum, r) => sum + r._fillCost, 0);
        const mult = execMult || 1;
        const perUnit = Math.abs(netDebit / mult);
        const verb = netDebit > 0 ? 'at' : 'for credit';
        const name = strategyName + 's';
        _toast('Executed ' + mult + 'k ' + name + ' ' + verb + ' $' + perUnit.toFixed(2));
        _haptic('success');
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

    _populateStrategyLegs(resolved);

    isBuiltinLoaded = !!strat.builtin;
    currentStrategyHash = strat.builtin ? null : id;
    if ($.strategyNameInput) $.strategyNameInput.value = strat.name;
    if ($.selectableExpiryToggle) $.selectableExpiryToggle.checked = !!strat.selectableExpiry;

    _refreshStrategyView();
    _haptic('selection');
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
    _refreshStrategyDropdowns();
    if ($.strategyLoadSelect) $.strategyLoadSelect.value = '';
    _refreshStrategyView();
    _toast('Strategy "' + (strat ? strat.name : '') + '" deleted.');
    _haptic('light');
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

    const orderType = _getOrderType();
    if (orderType === 'market') {
        executeWithRollback(scaled, strat.name, mult);
    } else {
        const triggerPrice = _getTriggerPrice();
        placePendingOrder(null, null, null, orderType, triggerPrice, null, null, strat.name, scaled, mult);
        _toast('Pending ' + orderType + ' for ' + mult + 'k ' + strat.name + 's @ $' + triggerPrice.toFixed(0));
        _haptic('medium');
        chainDirty = true;
        updateUI();
        dirty = true;
    }
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
    _populateStrategyLegs(resolved);
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

function _showEpilogue(pages) {
    let currentPage = 0;

    const overlay = document.getElementById('epilogue-overlay');
    const title = overlay.querySelector('.epilogue-title');
    const body = overlay.querySelector('.epilogue-body');
    // Dynamically generate dots to match page count
    const dotsContainer = overlay.querySelector('.epilogue-dots');
    while (dotsContainer.firstChild) dotsContainer.removeChild(dotsContainer.firstChild);
    for (let i = 0; i < pages.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'epilogue-dot' + (i === 0 ? ' active' : '');
        dotsContainer.appendChild(dot);
    }
    const dots = dotsContainer.querySelectorAll('.epilogue-dot');
    const backBtn = overlay.querySelector('#epilogue-back');
    const nextBtn = overlay.querySelector('#epilogue-next');
    const restartBtn = overlay.querySelector('#epilogue-restart');
    const keepBtn = overlay.querySelector('#epilogue-keep');

    function render() {
        const page = pages[currentPage];
        body.style.opacity = '0';
        setTimeout(() => {
            title.textContent = page.title;
            // SECURITY: page.body is generated entirely by generateEnding()
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

    let _epiloguePrevFocus = document.activeElement;
    let _epilogueTrapCleanup = null;

    function _cleanupEpilogue() {
        if (_epilogueTrapCleanup) { _epilogueTrapCleanup(); _epilogueTrapCleanup = null; }
        if (_epiloguePrevFocus && _epiloguePrevFocus.focus) { _epiloguePrevFocus.focus(); _epiloguePrevFocus = null; }
    }

    backBtn.onclick = () => { if (currentPage > 0) { currentPage--; render(); } };
    nextBtn.onclick = () => { if (currentPage < pages.length - 1) { currentPage++; render(); } };
    restartBtn.onclick = () => {
        overlay.classList.add('hidden');
        _cleanupEpilogue();
        // Find the Dynamic (Offline) preset index
        const offlineIdx = PRESETS.findIndex(p => p.name.includes('Offline'));
        if (offlineIdx >= 0) _resetCore(offlineIdx);
    };
    keepBtn.onclick = () => {
        overlay.classList.add('hidden');
        _cleanupEpilogue();
        _toast('Event storyline complete. Market simulation continues.');
    };

    overlay.classList.remove('hidden');
    if (typeof trapFocus === 'function') _epilogueTrapCleanup = trapFocus(overlay);
    render();
    const firstBtn = overlay.querySelector('button:not(.hidden)');
    if (firstBtn) firstBtn.focus();
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
