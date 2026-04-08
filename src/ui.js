/* =====================================================
   ui.js -- DOM manipulation, event binding, and display
   updates for the Shoals trading simulator.

   Owns all DOM access outside of canvas rendering.
   Pure functions -- no internal state.
   ===================================================== */

import { fmtNum, pnlClass, fmtDte, fmtRelDay, posTypeLabel } from './format-helpers.js';
import { computeBidAsk } from './portfolio.js';
import { renderChainInto, rebuildExpiryDropdown, posKey } from './chain-renderer.js';
import { vasicekBondPrice, computeVIXFuturePrice } from './pricing.js';
import { BOND_FACE_VALUE, STRIKE_INTERVAL, STRIKE_RANGE } from './config.js';
import { market } from './market.js';
import { getStockImpact, getBondImpact, getVixImpact } from './price-impact.js';
export { updatePortfolioDisplay } from './portfolio-renderer.js';

// ---------------------------------------------------------------------------
// Buy/Sell mode toggle (module-scoped)
// ---------------------------------------------------------------------------
let sellMode = false;
window._shoalsSellMode = () => sellMode;

// ---------------------------------------------------------------------------
// Focus trap state (module-scoped for overlay open/close)
// ---------------------------------------------------------------------------
let _tradeTrapCleanup = null;
let _tradePrevFocus = null;
let _popupTrapCleanup = null;
let _popupPrevFocus = null;

// ---------------------------------------------------------------------------
// Tooltip state (module-scoped so refreshTooltip can update visible tip)
// ---------------------------------------------------------------------------
let _tip = null;
let _tipTarget = null;

/**
 * If a bid/ask tooltip is currently visible, re-read data-tooltip from
 * the hovered element and update the displayed text.  Called each substep.
 */
export function refreshTooltip() {
    if (_tip && _tipTarget) {
        const text = _tipTarget.dataset.tooltip;
        if (text) _tip.el.textContent = text;
    }
}

// ---------------------------------------------------------------------------
// cacheDOMElements
// ---------------------------------------------------------------------------

export function cacheDOMElements($) {
    $.chartCanvas    = document.getElementById('chart-canvas');
    $.strategyCanvas = document.getElementById('strategy-canvas');
    $.playBtn     = document.getElementById('play-btn');
    $.speedBtn    = document.getElementById('speed-btn');
    $.stepBtn     = document.getElementById('step-btn');
    $.themeBtn    = document.getElementById('theme-btn');
    $.panelToggle = document.getElementById('panel-toggle');
    $.sidebar    = document.getElementById('sidebar');
    $.closePanel = document.getElementById('close-panel');
    $.tradeExpiry    = document.getElementById('trade-expiry');
    $.chainTable    = document.getElementById('chain-table');
    $.stockPriceCell = document.getElementById('stock-price-cell');
    $.bondPriceCell  = document.getElementById('bond-price-cell');
    $.vixPriceCell   = document.getElementById('vix-price-cell');
    $.defaultPositions  = document.getElementById('default-positions');
    $.strategyPositions = document.getElementById('strategy-positions');
    $.pendingOrders     = document.getElementById('pending-orders');
    $.cashDisplay       = document.getElementById('cash-display');
    $.portfolioValue    = document.getElementById('portfolio-value');
    $.portfolioSparkCanvas = document.getElementById('portfolio-sparkline');
    $.portfolioSparkCtx    = $.portfolioSparkCanvas ? $.portfolioSparkCanvas.getContext('2d') : null;
    $.marginStatus      = document.getElementById('margin-status');
    $.borrowCostDisplay = document.getElementById('borrow-cost');
    $.dividendDisplay   = document.getElementById('dividend-income');
    $.greekDelta      = document.getElementById('greek-delta');
    $.greekGamma      = document.getElementById('greek-gamma');
    $.greekTheta      = document.getElementById('greek-theta');
    $.greekVega       = document.getElementById('greek-vega');
    $.greekRho        = document.getElementById('greek-rho');
    $.presetSelect    = document.getElementById('preset-select');
    $.rateDisplay     = document.getElementById('rate-display');
    $.rateSparkCanvas = document.getElementById('rate-sparkline');
    $.rateSparkCtx    = $.rateSparkCanvas ? $.rateSparkCanvas.getContext('2d') : null;
    $.vixDisplay      = document.getElementById('vix-display');
    $.vixSparkCanvas  = document.getElementById('vix-sparkline');
    $.vixSparkCtx     = $.vixSparkCanvas ? $.vixSparkCanvas.getContext('2d') : null;
    $.advancedToggle  = document.getElementById('advanced-toggle');
    $.advancedSection = document.getElementById('advanced-section');
    $.resetBtn        = document.getElementById('reset-btn');
    $.sliders = {};
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread','q']) {
        $.sliders[p]         = document.getElementById('slider-' + p);
        $.sliders[p + 'Val'] = document.getElementById('slider-' + p + '-val');
    }
    $.zoomControls = document.getElementById('zoom-controls');
    $.zoomInBtn    = document.getElementById('zoom-in-btn');
    $.zoomOutBtn   = document.getElementById('zoom-out-btn');
    $.zoomResetBtn = document.getElementById('zoom-reset-btn');
    $.zoomLevel    = document.getElementById('zoom-level');
    $.timeSliderBar   = document.getElementById('time-slider-bar');
    $.timeSlider      = document.getElementById('time-slider');
    $.timeSliderLabel = document.getElementById('time-slider-label');
    $.tradeDialog         = document.getElementById('trade-dialog');
    $.tradeDialogTitle    = document.getElementById('trade-dialog-title');
    $.tradeDialogBody     = document.getElementById('trade-dialog-body');
    $.tradeConfirmBtn     = document.getElementById('trade-confirm-btn');
    $.tradeCancelBtn      = document.getElementById('trade-cancel-btn');
    $.tradeDialogClose    = document.getElementById('trade-dialog-close');
    $.popupOverlay   = document.getElementById('popup-event-overlay');
    $.popupHeadline  = document.getElementById('popup-event-headline');
    $.popupContext   = document.getElementById('popup-event-context');
    $.popupChoices   = document.getElementById('popup-event-choices');

    $.strategyLegsList = document.getElementById('strategy-legs-list');
    $.strategySummary  = document.getElementById('strategy-summary');
    $.stratGreekDelta  = document.getElementById('strat-greek-delta');
    $.stratGreekGamma  = document.getElementById('strat-greek-gamma');
    $.stratGreekTheta  = document.getElementById('strat-greek-theta');
    $.stratGreekVega   = document.getElementById('strat-greek-vega');
    $.stratGreekRho    = document.getElementById('strat-greek-rho');
    $.saveStrategyBtn  = document.getElementById('save-strategy-btn');
    $.deleteStrategyBtn  = document.getElementById('delete-strategy-btn');
    $.strategyNameInput  = document.getElementById('strategy-name');
    $.selectableExpiryToggle = document.getElementById('selectable-expiry-toggle');
    $.strategyLoadSelect = document.getElementById('strategy-load-select');
    $.strategyEditFields = document.getElementById('strategy-edit-fields');
    $.tradeStrategySelect = document.getElementById('trade-strategy-select');
    $.tradeExecStrategyBtn = document.getElementById('trade-exec-strategy-btn');
    $.strategyCreditDebit = document.getElementById('strategy-credit-debit');
    $.strategyNetCost    = document.getElementById('strategy-net-cost');
    $.strategyBuilder  = document.getElementById('strategy-builder');
    $.strategyExpiry   = document.getElementById('strategy-expiry');
    $.strategyChainTable = document.getElementById('strategy-chain-table');
    $.strategyStockCell  = document.getElementById('strategy-stock-cell');
    $.strategyBondCell   = document.getElementById('strategy-bond-cell');
    $.strategyVixCell    = document.getElementById('strategy-vix-cell');
    $.tradeQty         = document.getElementById('trade-qty');
    $.tradeQtyVal      = document.getElementById('trade-qty-val');
    $.strategyQty      = document.getElementById('strategy-qty');
    $.strategyQtyVal   = document.getElementById('strategy-qty-val');
    $.orderTypeToggles = document.getElementById('order-type-toggles');
    $.triggerPriceGroup = document.getElementById('trigger-price-group');
    $.triggerPrice     = document.getElementById('trigger-price');
    $.triggerPriceVal  = document.getElementById('trigger-price-val');
    $.llmSettingsSection = document.getElementById('llm-settings-section');
    $.eventLogSection    = document.getElementById('event-log-section');
    $.eventLog           = document.getElementById('event-log');
    $.llmApiKey          = document.getElementById('llm-api-key');
    $.llmKeyToggle       = document.getElementById('llm-key-toggle');
    $.llmModel           = document.getElementById('llm-model');
    $.llmProvider        = document.getElementById('llm-provider');
    $.congressSection    = document.getElementById('congress-section');
    $.senateDiagram      = document.getElementById('senate-diagram');
    $.houseDiagram       = document.getElementById('house-diagram');
    $.senateLegend       = document.getElementById('senate-legend');
    $.houseLegend        = document.getElementById('house-legend');
    $.lobbyBar           = document.getElementById('lobby-bar');
    $.lobbyActions       = document.getElementById('lobby-actions');
    $.standingsSection   = document.getElementById('standings-section');
    $.standingsWorld     = document.getElementById('standings-world');
    $.standingsFactions  = document.getElementById('standings-factions');
}

// ---------------------------------------------------------------------------
// bindEvents
// ---------------------------------------------------------------------------

export function bindEvents($, handlers) {
    const {
        onTogglePlay, onStep, onSpeedUp, onSpeedDown, onToggleTheme,
        onPresetChange, onReset, onSliderChange, onTimeSlider,
        onBuyStock, onShortStock, onBuyBond, onShortBond, onBuyVix, onShortVix,
        onChainCellClick, onExpiryChange,
        onTradeSubmit,
        onLLMKeyChange, onLLMModelChange,
        onTradeClose,
    } = handlers;

    $.playBtn.addEventListener('click', onTogglePlay);
    $.stepBtn.addEventListener('click', onStep);
    $.speedBtn.addEventListener('click', onSpeedUp);
    $.speedBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); onSpeedDown(); });
    $.themeBtn.addEventListener('click', onToggleTheme);
    $.presetSelect.addEventListener('change', () => {
        onPresetChange($.presetSelect.selectedIndex);
    });

    // LLM key show/hide toggle
    if ($.llmKeyToggle) {
        $.llmKeyToggle.addEventListener('click', () => {
            const isPassword = $.llmApiKey.type === 'password';
            $.llmApiKey.type = isPassword ? 'text' : 'password';
        });
    }

    // LLM API key persistence
    if ($.llmApiKey) {
        $.llmApiKey.value = localStorage.getItem('shoals_llm_key') || '';
        $.llmApiKey.addEventListener('change', () => {
            if (onLLMKeyChange) onLLMKeyChange($.llmApiKey.value);
        });
    }

    // LLM model persistence
    if ($.llmModel) {
        $.llmModel.value = localStorage.getItem('shoals_llm_model') || 'claude-haiku-4-5-20251001';
        $.llmModel.addEventListener('change', () => {
            if (onLLMModelChange) onLLMModelChange($.llmModel.value);
        });
    }

    $.resetBtn.addEventListener('click', onReset);

    $.advancedToggle.addEventListener('click', () => {
        $.advancedSection.classList.toggle('hidden');
        if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
    });

    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread','q']) {
        if (!$.sliders[p]) continue;
        _forms.bindSlider($.sliders[p], $.sliders[p + 'Val'], v => onSliderChange(p, v));
    }

    $.timeSlider.addEventListener('input', () => {
        const pct = parseInt($.timeSlider.value, 10);
        $.timeSlider.style.setProperty('--slider-fill', pct + '%');
        onTimeSlider(pct);
    });

    // Buy/sell mode toggle button
    const modeBtn = document.getElementById('mode-btn');
    const modeIconBuy  = document.getElementById('mode-icon-buy');
    const modeIconSell = document.getElementById('mode-icon-sell');
    if (modeBtn) {
        modeBtn.addEventListener('click', () => {
            sellMode = !sellMode;
            modeBtn.setAttribute('aria-pressed', String(sellMode));
            modeBtn.setAttribute('aria-label', sellMode ? 'Sell mode' : 'Buy mode');
            modeBtn.title = sellMode ? 'Sell mode (X)' : 'Buy mode (X)';
            modeIconBuy.style.display  = sellMode ? 'none' : '';
            modeIconSell.style.display = sellMode ? '' : 'none';
            modeBtn.style.color = sellMode ? 'var(--accent)' : '';
        });
    }

    // Stock price cell: left-click = buy (or sell in sell mode), right-click = short
    $.stockPriceCell.addEventListener('click', () => {
        if (sellMode) onShortStock(); else onBuyStock();
    });
    $.stockPriceCell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onShortStock();
    });
    // Bond price cell: left-click = buy (or sell in sell mode), right-click = sell/short
    $.bondPriceCell.addEventListener('click', () => {
        if (sellMode) { if (typeof onShortBond === 'function') onShortBond(); } else onBuyBond();
    });
    $.bondPriceCell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (typeof onShortBond === 'function') onShortBond();
    });
    // VIX futures price cell
    if ($.vixPriceCell) {
        $.vixPriceCell.addEventListener('click', () => {
            if (sellMode) { if (typeof onShortVix === 'function') onShortVix(); } else if (typeof onBuyVix === 'function') onBuyVix();
        });
        $.vixPriceCell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (typeof onShortVix === 'function') onShortVix();
        });
    }

    // Mobile hint text
    if (window.matchMedia('(pointer: coarse)').matches) {
        const hint = document.getElementById('trade-hint');
        if (hint) hint.textContent = 'Tap to Trade \u00b7 Long-press for Bid/Ask \u00b7 Pinch to Zoom Chart';
    }
    const closeTrade = () => {
        $.tradeDialog.classList.add('hidden');
        if (_tradeTrapCleanup) { _tradeTrapCleanup(); _tradeTrapCleanup = null; }
        if (_tradePrevFocus && _tradePrevFocus.focus) { _tradePrevFocus.focus(); _tradePrevFocus = null; }
        if (typeof onTradeClose === 'function') onTradeClose();
    };
    initOverlayDismiss($.tradeDialog, $.tradeDialogClose, closeTrade);
    $.tradeCancelBtn.addEventListener('click', closeTrade);

    $._onChainCellClick = onChainCellClick;
    $._onTradeSubmit    = onTradeSubmit;

    // Trade tab qty slider
    if ($.tradeQty) _forms.bindSlider($.tradeQty, $.tradeQtyVal, null, v => v + 'k');

    // Trade tab expiry dropdown
    if ($.tradeExpiry) {
        $.tradeExpiry.addEventListener('change', () => {
            if (typeof onExpiryChange === 'function') onExpiryChange(parseInt($.tradeExpiry.value, 10));
        });
    }

    // Strategy tab qty slider
    if ($.strategyQty) _forms.bindSlider($.strategyQty, $.strategyQtyVal);

    // Strategy expiry dropdown -- rebuild strategy chain on change
    if ($.strategyExpiry) {
        $.strategyExpiry.addEventListener('change', () => {
            if (typeof handlers.onStrategyExpiryChange === 'function') {
                handlers.onStrategyExpiryChange(parseInt($.strategyExpiry.value, 10));
            }
        });
    }

    // Selectable expiry toggle -- override legs when turned on
    if ($.selectableExpiryToggle) {
        $.selectableExpiryToggle.addEventListener('change', () => {
            if (typeof handlers.onSelectableExpiryChange === 'function') {
                handlers.onSelectableExpiryChange($.selectableExpiryToggle.checked);
            }
        });
    }

    // Order type toggle (Market / Limit / Stop)
    if ($.orderTypeToggles) {
        _forms.bindModeGroup($.orderTypeToggles, 'ordertype', v => {
            $.triggerPriceGroup.classList.toggle('hidden', v === 'market');
        });
    }

    // Trigger price slider
    if ($.triggerPrice) _forms.bindSlider($.triggerPrice, $.triggerPriceVal, null, v => '$' + v.toFixed(0));

    // Strategy builder: stock/bond cell clicks -> add leg
    if ($.strategyStockCell && typeof handlers.onAddLeg === 'function') {
        $.strategyStockCell.addEventListener('click', () => { if (typeof _haptics !== 'undefined') _haptics.trigger('selection'); handlers.onAddLeg('stock', 'long'); });
        $.strategyStockCell.addEventListener('contextmenu', (e) => { e.preventDefault(); if (typeof _haptics !== 'undefined') _haptics.trigger('selection'); handlers.onAddLeg('stock', 'short'); });
        $.strategyBondCell.addEventListener('click', () => { if (typeof _haptics !== 'undefined') _haptics.trigger('selection'); handlers.onAddLeg('bond', 'long'); });
        $.strategyBondCell.addEventListener('contextmenu', (e) => { e.preventDefault(); if (typeof _haptics !== 'undefined') _haptics.trigger('selection'); handlers.onAddLeg('bond', 'short'); });
        if ($.strategyVixCell) {
            $.strategyVixCell.addEventListener('click', () => { if (typeof _haptics !== 'undefined') _haptics.trigger('selection'); handlers.onAddLeg('vixfuture', 'long'); });
            $.strategyVixCell.addEventListener('contextmenu', (e) => { e.preventDefault(); if (typeof _haptics !== 'undefined') _haptics.trigger('selection'); handlers.onAddLeg('vixfuture', 'short'); });
        }
    }
    if ($.saveStrategyBtn && typeof handlers.onSaveStrategy === 'function') {
        $.saveStrategyBtn.addEventListener('click', handlers.onSaveStrategy);
    }
    if ($.deleteStrategyBtn && typeof handlers.onDeleteStrategy === 'function') {
        $.deleteStrategyBtn.addEventListener('click', handlers.onDeleteStrategy);
    }
    if ($.tradeExecStrategyBtn && typeof handlers.onTradeExecStrategy === 'function') {
        $.tradeExecStrategyBtn.addEventListener('click', handlers.onTradeExecStrategy);
    }
    if ($.strategyLoadSelect && typeof handlers.onStrategySelectChange === 'function') {
        $.strategyLoadSelect.addEventListener('change', () => {
            handlers.onStrategySelectChange($.strategyLoadSelect.value);
        });
    }
    if ($.tradeStrategySelect && typeof handlers.onTradeStrategySelectChange === 'function') {
        $.tradeStrategySelect.addEventListener('change', () => {
            handlers.onTradeStrategySelectChange($.tradeStrategySelect.value);
        });
    }

    // Tooltip delegation for [data-tooltip] cells
    if (typeof createSimTooltip === 'function') {
        _tip = createSimTooltip();
        const _wireTooltipDelegation = (el) => {
            el.addEventListener('mouseover', (e) => {
                const target = e.target.closest('[data-tooltip]');
                if (target === _tipTarget) return;
                if (target) {
                    _tipTarget = target;
                    _tip.show(e.clientX, e.clientY, target.dataset.tooltip);
                } else if (_tipTarget) {
                    _tipTarget = null;
                    _tip.hide();
                }
            });
            el.addEventListener('mouseout', (e) => {
                if (!_tipTarget) return;
                const related = e.relatedTarget;
                if (!related || !_tipTarget.contains(related)) {
                    _tipTarget = null;
                    _tip.hide();
                }
            });
        };
        _wireTooltipDelegation($.sidebar);
    }
}

// ---------------------------------------------------------------------------
// updateChainDisplay
// ---------------------------------------------------------------------------

/**
 * Update trade-tab chain table with a pre-priced expiry.
 */
export function updateChainDisplay($, pricedExpiry, posMap) {
    renderChainInto($.chainTable, pricedExpiry, $._onChainCellClick, posMap);
}

/**
 * Rebuild the trade-tab expiry dropdown from the skeleton.
 * Call only when skeleton changes (day complete, reset).
 */
export function rebuildTradeDropdown($, skeleton, selectedIndex) {
    rebuildExpiryDropdown($.tradeExpiry, skeleton, selectedIndex);
}

/**
 * Rebuild the strategy-tab expiry dropdown from the skeleton.
 */
export function rebuildStrategyDropdown($, skeleton, selectedIndex) {
    rebuildExpiryDropdown($.strategyExpiry, skeleton, selectedIndex);
}


// ---------------------------------------------------------------------------
// updateGreeksDisplay
// ---------------------------------------------------------------------------

export function updateGreeksDisplay($, greeks) {
    if (!greeks) return;
    $.greekDelta.textContent = fmtNum(greeks.delta, 4);
    $.greekGamma.textContent = fmtNum(greeks.gamma, 4);
    $.greekTheta.textContent = fmtNum(greeks.theta, 4);
    $.greekVega.textContent  = fmtNum(greeks.vega,  4);
    $.greekRho.textContent   = fmtNum(greeks.rho,   4);
}

// ---------------------------------------------------------------------------
// updateRateDisplay
// ---------------------------------------------------------------------------

export function updateRateDisplay($, rate, rateHistory) {
    if ($.rateDisplay) $.rateDisplay.textContent = (rate * 100).toFixed(2) + '%';
    if ($.rateSparkCtx && rateHistory && rateHistory.count >= 2
        && typeof drawSparkline !== 'undefined') {
        const c = $.rateSparkCanvas;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--rho').trim() || '#000000';
        drawSparkline($.rateSparkCtx, rateHistory, c.width, c.height, color, color + '44');
    }
}

// ---------------------------------------------------------------------------
// updateVixDisplay
// ---------------------------------------------------------------------------

export function updateVixDisplay($, vix, vixHistory) {
    if ($.vixDisplay) $.vixDisplay.textContent = vix.toFixed(2);
    if ($.vixSparkCtx && vixHistory && vixHistory.count >= 2
        && typeof drawSparkline !== 'undefined') {
        const c = $.vixSparkCanvas;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--vix').trim() || '#000000';
        drawSparkline($.vixSparkCtx, vixHistory, c.width, c.height, color, color + '44');
    }
}

// ---------------------------------------------------------------------------
// updateStockBondPrices -- updates both trade-tab and strategy-tab cells
// ---------------------------------------------------------------------------

function _applyPill(el, text, qty, tooltipText) {
    el.textContent = text;
    el.classList.remove('pos-long', 'pos-short');
    if (qty) el.classList.add(qty > 0 ? 'pos-long' : 'pos-short');
    if (tooltipText) el.dataset.tooltip = tooltipText;
    else delete el.dataset.tooltip;
}

function _bidAskTip(mid, vol) {
    if (mid == null || vol == null) return null;
    const ba = computeBidAsk(mid, vol);
    return 'Bid ' + ba.bid.toFixed(2) + ' / Ask ' + ba.ask.toFixed(2);
}

/**
 * @param {Array} skeleton - chain skeleton (has .day, .dte per entry)
 */
export function updateStockBondPrices($, spot, rate, sigma, skeleton, posMap, stratPosMap) {
    const dash = '\u2014';
    const displaySpot = spot != null ? spot + getStockImpact(sigma) : null;
    const stockTxt = displaySpot != null ? displaySpot.toFixed(2) : dash;
    const stockTip = _bidAskTip(displaySpot, sigma);

    // Trade tab bond: from trade expiry dropdown
    const tradeIdx = parseInt($.tradeExpiry?.value, 10);
    const tradeExp = skeleton && skeleton.length > 0
        ? skeleton[isNaN(tradeIdx) ? skeleton.length - 1 : Math.min(tradeIdx, skeleton.length - 1)]
        : null;
    const tradeBondMid = tradeExp && rate != null
        ? market.a >= 1e-8
            ? vasicekBondPrice(BOND_FACE_VALUE, rate, tradeExp.dte / 252, market.a, market.b, market.sigmaR)
            : BOND_FACE_VALUE * Math.exp(-rate * tradeExp.dte / 252)
        : null;
    const tradeBondDisplay = tradeBondMid != null ? tradeBondMid + getBondImpact(market.sigmaR) : null;
    const tradeBond = tradeBondDisplay != null ? tradeBondDisplay.toFixed(2) : dash;

    // Trade tab VIX futures: from trade expiry dropdown
    const tradeVixMid = tradeExp
        ? computeVIXFuturePrice(market.v, market.kappa, market.theta, market.xi, tradeExp.dte / 252)
        : null;
    const tradeVixDisplay = tradeVixMid != null ? tradeVixMid + getVixImpact(market.xi) : null;
    const tradeVix = tradeVixDisplay != null ? tradeVixDisplay.toFixed(2) : dash;

    if ($.stockPriceCell) _applyPill($.stockPriceCell, stockTxt, posMap && posMap['stock'], stockTip);
    if ($.bondPriceCell) {
        const bondQty = posMap && tradeExp
            ? posMap[posKey('bond', null, tradeExp.day)]
            : null;
        _applyPill($.bondPriceCell, tradeBond, bondQty, _bidAskTip(tradeBondMid, market.sigmaR));
    }
    if ($.vixPriceCell) {
        const vixQty = posMap && tradeExp
            ? posMap[posKey('vixfuture', null, tradeExp.day)]
            : null;
        _applyPill($.vixPriceCell, tradeVix, vixQty, _bidAskTip(tradeVixMid, market.xi));
    }

    // Strategy tab bond: from strategy expiry dropdown
    const stratIdx = parseInt($.strategyExpiry?.value, 10);
    const stratExp = skeleton && skeleton.length > 0
        ? skeleton[isNaN(stratIdx) ? skeleton.length - 1 : Math.min(stratIdx, skeleton.length - 1)]
        : null;
    const stratBondMid = stratExp && rate != null
        ? market.a >= 1e-8
            ? vasicekBondPrice(BOND_FACE_VALUE, rate, stratExp.dte / 252, market.a, market.b, market.sigmaR)
            : BOND_FACE_VALUE * Math.exp(-rate * stratExp.dte / 252)
        : null;
    const stratBondDisplay = stratBondMid != null ? stratBondMid + getBondImpact(market.sigmaR) : null;
    const stratBond = stratBondDisplay != null ? stratBondDisplay.toFixed(2) : dash;

    // Strategy tab VIX futures: from strategy expiry dropdown
    const stratVixMid = stratExp
        ? computeVIXFuturePrice(market.v, market.kappa, market.theta, market.xi, stratExp.dte / 252)
        : null;
    const stratVixDisplay = stratVixMid != null ? stratVixMid + getVixImpact(market.xi) : null;
    const stratVix = stratVixDisplay != null ? stratVixDisplay.toFixed(2) : dash;

    const sMap = stratPosMap || posMap;
    if ($.strategyStockCell) _applyPill($.strategyStockCell, stockTxt, sMap && sMap['stock'], stockTip);
    if ($.strategyBondCell) {
        const bondQty = sMap && stratExp
            ? sMap[posKey('bond', null, stratExp.day)]
            : null;
        _applyPill($.strategyBondCell, stratBond, bondQty, _bidAskTip(stratBondMid, market.sigmaR));
    }
    if ($.strategyVixCell) {
        const vixQty = sMap && stratExp
            ? sMap[posKey('vixfuture', null, stratExp.day)]
            : null;
        _applyPill($.strategyVixCell, stratVix, vixQty, _bidAskTip(stratVixMid, market.xi));
    }
}

// ---------------------------------------------------------------------------
// syncSettingsUI
// ---------------------------------------------------------------------------

export function syncSettingsUI($, sim) {
    if (!sim || !sim.params) return;
    if (sim.presetIndex != null) $.presetSelect.selectedIndex = sim.presetIndex;
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread','q']) {
        const slider  = $.sliders[p];
        const valSpan = $.sliders[p + 'Val'];
        if (!slider || sim.params[p] == null) continue;
        slider.value        = sim.params[p];
        valSpan.textContent = String(sim.params[p]);
        _forms.updateSliderFill(slider);
    }

}

// ---------------------------------------------------------------------------
// toggleStrategyView
// ---------------------------------------------------------------------------

export function toggleStrategyView($, active) {
    if (active) {
        $.chartCanvas.classList.add('hidden');
        $.strategyCanvas.classList.remove('hidden');
        if ($.zoomControls) $.zoomControls.classList.add('hidden');
        if ($.lobbyBar) $.lobbyBar.classList.add('hidden');
    } else {
        $.chartCanvas.classList.remove('hidden');
        $.strategyCanvas.classList.add('hidden');
        $.timeSliderBar.classList.add('hidden');
        if ($.zoomControls) $.zoomControls.classList.remove('hidden');
        if ($.lobbyBar) $.lobbyBar.classList.remove('hidden');
    }
    if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
}

// ---------------------------------------------------------------------------
// updatePlayBtn
// ---------------------------------------------------------------------------

export function updatePlayBtn($, playing) {
    _toolbar.updatePlayBtn($.playBtn, playing);
}

export function updateSpeedBtn($, speed) {
    _toolbar.updateSpeedBtn($.speedBtn, speed);
}

// ---------------------------------------------------------------------------
// Strategy selectors & builder
// ---------------------------------------------------------------------------

/**
 * Update the strategy chain table, stock/bond prices, and trigger price slider.
 * Called whenever the chain is rebuilt.
 */
/**
 * Update trigger price slider range to match strike prices.
 */
export function updateTriggerPriceSlider($, spot) {
    if (!$.triggerPrice || !spot) return;
    const atm = Math.round(spot / STRIKE_INTERVAL) * STRIKE_INTERVAL;
    const trigMin = Math.max(STRIKE_INTERVAL, atm - STRIKE_RANGE * STRIKE_INTERVAL);
    const trigMax = atm + STRIKE_RANGE * STRIKE_INTERVAL;
    $.triggerPrice.min = trigMin;
    $.triggerPrice.max = trigMax;
    $.triggerPrice.step = STRIKE_INTERVAL;
    const curTrig = parseFloat($.triggerPrice.value);
    if (curTrig < trigMin || curTrig > trigMax) {
        $.triggerPrice.value = atm;
    }
    $.triggerPriceVal.textContent = '$' + parseFloat($.triggerPrice.value).toFixed(0);
}

/**
 * Update strategy selectors: chain table + trigger price slider.
 */
export function updateStrategySelectors($, pricedExpiry, spot, onAddLeg, posMap) {
    updateStrategyChainDisplay($, pricedExpiry, onAddLeg, posMap);
    updateTriggerPriceSlider($, spot);
}

/**
 * Update strategy chain table with a pre-priced expiry.
 */
export function updateStrategyChainDisplay($, pricedExpiry, onAddLeg, posMap) {
    if (!$.strategyChainTable) return;

    const onClick = typeof onAddLeg === 'function'
        ? (info) => onAddLeg(info.type, info.side, info.strike, info.expiryDay)
        : null;

    renderChainInto($.strategyChainTable, pricedExpiry, onClick, posMap);
}


const _STRATEGY_INFO = {
    netCost:    { title: 'Net Debit / Credit', body: 'Cost to enter the strategy at current prices. Debit = you pay; credit = you receive premium.' },
    breakevens: { title: 'Breakevens', body: 'Stock prices where strategy P&L crosses zero at expiry. Multi-leg strategies can have multiple breakevens.' },
};

export function renderStrategyBuilder($, legs, summary, onRemoveLeg, skeleton, onLegChange, currentStrategyHash, isBuiltin) {
    if (!$.strategyLegsList) return;

    $.strategyLegsList.textContent = '';

    if (!legs || legs.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'panel-hint';
        hint.textContent = 'No legs added. Click buttons above to build a strategy.';
        $.strategyLegsList.appendChild(hint);
    } else {
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            $.strategyLegsList.appendChild(_buildLegRow(leg, i, onRemoveLeg, skeleton, onLegChange));
        }
    }

    // Update summary
    if ($.strategySummary) {
        $.strategySummary.textContent = '';
        if (summary && legs && legs.length > 0) {
            const fmtVal = (v) => {
                if (v === Infinity) return '\u221E';
                if (v === -Infinity) return '-\u221E';
                return (v < 0 ? '-' : '') + Math.abs(v).toFixed(2);
            };
            const items = [
                { label: summary.netCost < 0 ? 'Net Credit' : summary.netCost > 0 ? 'Net Debit' : 'Net Cost', value: fmtVal(Math.abs(summary.netCost)), cls: pnlClass(-summary.netCost), info: 'netCost' },
                { label: 'Max Profit', value: fmtVal(summary.maxProfit), cls: summary.maxProfit > 0 ? 'pnl-up' : '' },
                { label: 'Max Loss', value: fmtVal(summary.maxLoss), cls: summary.maxLoss < 0 ? 'pnl-down' : '' },
            ];
            if (summary.breakevens.length > 0) {
                items.push({
                    label: 'Breakeven' + (summary.breakevens.length > 1 ? 's' : ''),
                    value: summary.breakevens.map(b => b.toFixed(2)).join(', '),
                    cls: '',
                    info: 'breakevens',
                });
            }
            for (const item of items) {
                const row = document.createElement('div');
                row.className = 'stat-row';
                const lbl = document.createElement('span');
                lbl.className = 'stat-label';
                lbl.textContent = item.label;
                if (item.info && typeof createInfoTip !== 'undefined') {
                    const btn = document.createElement('button');
                    btn.className = 'info-trigger';
                    btn.type = 'button';
                    btn.dataset.info = item.info;
                    btn.setAttribute('aria-label', 'Info: ' + item.label);
                    btn.textContent = '?';
                    lbl.appendChild(document.createTextNode(' '));
                    lbl.appendChild(btn);
                    createInfoTip(btn, _STRATEGY_INFO[item.info]);
                }
                const val = document.createElement('span');
                val.className = 'stat-value ' + item.cls;
                val.textContent = item.value;
                row.appendChild(lbl);
                row.appendChild(val);
                $.strategySummary.appendChild(row);
            }
        }
    }

    // Strategy Greeks at current price
    if ($.stratGreekDelta) {
        const g = (summary && legs && legs.length > 0) ? summary.greeks : null;
        $.stratGreekDelta.textContent = fmtNum(g ? g.delta : 0, 4);
        $.stratGreekGamma.textContent = fmtNum(g ? g.gamma : 0, 4);
        $.stratGreekTheta.textContent = fmtNum(g ? g.theta : 0, 4);
        $.stratGreekVega.textContent  = fmtNum(g ? g.vega  : 0, 4);
        $.stratGreekRho.textContent   = fmtNum(g ? g.rho   : 0, 4);
    }

    // Disable edit fields for built-in strategies
    if ($.strategyEditFields) $.strategyEditFields.classList.toggle('ctrl-disabled', !!isBuiltin);

    // Enable/disable save & delete buttons
    const hasLegs = legs && legs.length > 0;
    if ($.saveStrategyBtn) $.saveStrategyBtn.disabled = !hasLegs || !!isBuiltin;
    if ($.deleteStrategyBtn) $.deleteStrategyBtn.disabled = !currentStrategyHash || !!isBuiltin;
}

export function updateStrategyDropdowns($, strategies) {
    const selects = [$.strategyLoadSelect, $.tradeStrategySelect];
    for (const sel of selects) {
        if (!sel) continue;
        const prev = sel.value;
        while (sel.options.length > 0) sel.remove(0);
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = sel === $.strategyLoadSelect ? 'New strategy' : 'Select a strategy\u2026';
        sel.appendChild(defOpt);
        for (const s of strategies) {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            sel.appendChild(opt);
        }
        if (prev && Array.from(sel.options).some(o => o.value === prev)) {
            sel.value = prev;
        }
    }
}

export function updateCreditDebit($, netCost) {
    if (!$.strategyCreditDebit || !$.strategyNetCost) return;
    if (netCost == null || !isFinite(netCost)) {
        $.strategyCreditDebit.querySelector('.stat-label').textContent = 'Net Cost';
        $.strategyNetCost.textContent = '\u2014';
        $.strategyNetCost.className = 'stat-value';
        return;
    }
    const label = netCost < 0 ? 'Net Credit' : netCost > 0 ? 'Net Debit' : 'Net Cost';
    const value = Math.abs(netCost).toFixed(2);
    $.strategyCreditDebit.querySelector('.stat-label').textContent = label;
    $.strategyNetCost.textContent = value;
    $.strategyNetCost.className = 'stat-value ' + pnlClass(-netCost);
}

function _buildLegRow(leg, index, onRemoveLeg, skeleton, onLegChange) {
    const row = document.createElement('div');
    row.className = 'leg-row stat-row';

    // Label: "L:CALL ATM+5 3mo" matching portfolio format
    const label = document.createElement('span');
    label.className = 'stat-label';
    let desc = posTypeLabel(leg.type, leg.qty);
    if (leg.strike != null) {
        const atm = Math.round((leg._refS || 100) / 5) * 5;
        const offset = leg.strike - atm;
        desc += ' ' + (offset === 0 ? 'ATM' : offset > 0 ? 'ATM+' + offset : 'ATM' + offset);
    }
    if (leg.expiryDay != null) {
        const expiry = skeleton ? skeleton.find(e => e.day === leg.expiryDay) : null;
        const dte = expiry ? expiry.dte : Math.max(1, leg.expiryDay - (leg._refDay || 0));
        desc += ' ' + fmtDte(dte);
    }
    label.textContent = desc;

    // Inline qty input
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'leg-qty-input';
    qtyInput.value = Math.abs(leg.qty);
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.title = 'Quantity';
    qtyInput.addEventListener('change', () => {
        const newAbsQty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        leg.qty = (leg.qty < 0) ? -newAbsQty : newAbsQty;
        if (typeof onLegChange === 'function') onLegChange();
    });

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'ghost-btn pos-close-btn';
    removeBtn.textContent = 'X';
    removeBtn.title = 'Remove leg';
    removeBtn.addEventListener('click', () => {
        if (typeof onRemoveLeg === 'function') onRemoveLeg(index);
        if (typeof _haptics !== 'undefined') _haptics.trigger('light');
    });

    const actions = document.createElement('div');
    actions.className = 'pos-actions';
    actions.appendChild(qtyInput);
    actions.appendChild(removeBtn);

    row.appendChild(label);
    row.appendChild(actions);

    return row;
}

// ---------------------------------------------------------------------------
// wireInfoTips
// ---------------------------------------------------------------------------

/**
 * Attach info tip popovers to slider labels and other UI elements.
 * Must be called after DOM is ready.
 */
export function wireInfoTips() {
    const data = {
        // --- Simulation parameters ---
        mu:           { title: 'Drift (\u03BC)', body: 'Expected annualised return of the stock. Positive = bullish tendency. The actual drift also accounts for dividends, jumps, and the Itô correction.' },
        theta:        { title: 'Vol Mean (\u03B8)', body: 'Long-run variance level. Volatility reverts toward $\\sqrt{\\theta}$ over time. $\\theta = 0.04$ corresponds to ~20% annualised vol.' },
        kappa:        { title: 'Mean Reversion (\u03BA)', body: 'Speed at which variance returns to $\\theta$. Half-life of a vol shock is $\\ln(2)/\\kappa$. Higher = faster reversion, shallower term structure.' },
        xi:           { title: 'Vol of Vol (\u03BE)', body: 'Volatility of the variance process. Higher $\\xi$ steepens the volatility skew and fattens return tails.' },
        rho:          { title: 'Correlation (\u03C1)', body: 'Correlation between price and variance shocks. Negative = leverage effect (price drops cause vol spikes, steepening the skew).' },
        lambda:       { title: 'Jump Rate (\u03BB)', body: 'Expected Poisson jump count per year. $\\lambda = 0.5$: ~1 jump every 2 years. $\\lambda = 8$: crisis-level discontinuity.' },
        muJ:          { title: 'Jump Mean (\u03BCJ)', body: 'Average log-jump size. Negative = predominantly downward jumps (crash risk). The drift compensator $\\lambda k$ offsets the expected jump effect.' },
        sigmaJ:       { title: 'Jump Vol (\u03C3J)', body: 'Standard deviation of jump sizes. Higher = more unpredictable jump magnitudes, fattening both tails of the return distribution.' },
        a:            { title: 'Rate Reversion (a)', body: 'Speed of Vasicek mean reversion. Higher $a$ means rate shocks are transient. Bond duration capped at $1/a$.' },
        b:            { title: 'Rate Mean (b)', body: 'Long-run equilibrium rate in the Vasicek model. Rates revert toward $b$ over time. Affects bond prices inversely.' },
        sigmaR:       { title: 'Rate Vol (\u03C3R)', body: 'Volatility of the interest rate process. Higher = wider rate swings, more volatile bond prices.' },
        borrowSpread: { title: 'Borrow Spread (k)', body: 'Volatility-scaled borrow cost factor. Daily charge = notional $\\times$ (max($r$,0) + $k \\sigma$) / 252. Events like short squeezes spike this.' },
        q:            { title: 'Dividend Yield (q)', body: 'Continuous dividend yield. Reduces stock drift and option cost of carry ($b = r - q$). Cash dividends paid quarterly.' },
        // --- Portfolio / Account ---
        margin:       { title: 'Margin Status', body: 'Your margin health. OK = well-collateralised. Low = approaching maintenance threshold. MARGIN CALL = equity below required level.' },
        cash:         { title: 'Cash', body: 'Available cash. Changes with trades, dividends, borrow costs, and exercises. Can go negative (buying on margin).' },
        portfolioValue: { title: 'Portfolio Value', body: 'Total equity: cash plus mark-to-market value of all open positions at mid-price.' },
        borrowCost:   { title: 'Borrow Cost', body: 'Cumulative interest on short positions and margin debit. Charged daily using the borrow spread formula.' },
        dividends:    { title: 'Dividends', body: 'Net cumulative dividends. Long stock receives cash quarterly; short stock pays. Amount = $S \\times q/4$ per share.' },
        // --- Greeks ---
        delta:        { title: 'Delta ($\\Delta$)', body: 'Rate of change of option price w.r.t. stock price. Calls: 0 to +1, puts: $-1$ to 0. Measures directional exposure.' },
        gamma:        { title: 'Gamma ($\\Gamma$)', body: 'Rate of change of delta. Measures convexity — how fast your hedge ratio changes. Highest ATM near expiry.' },
        theta_greek:  { title: 'Theta ($\\Theta$)', body: 'Daily time decay. Long options lose value each day (negative $\\Theta$); short options gain. Accelerates near expiry.' },
        vega:         { title: 'Vega ($\\mathcal{V}$)', body: 'Sensitivity to implied volatility. Long options benefit from rising vol. ATM and longer-dated options have the most vega.' },
        rho_greek:    { title: 'Rho ($\\rho$)', body: 'Sensitivity to interest rates. Calls have positive rho (higher rates help); puts negative. More meaningful with Vasicek stochastic rates.' },
        // --- Trade tab ---
        orderTypes:   { title: 'Order Types', body: 'Market: fills immediately at bid/ask. Limit: waits until price reaches your target. Stop: triggers a market order when price crosses a level.' },
        expiry:       { title: 'Expiry', body: '8 rolling expiry dates, each 63 trading days apart (~quarterly). Nearer expiries have faster theta decay and higher ATM gamma.' },
        bidask:       { title: 'Bid-Ask Spread', body: 'You buy at the ask and sell at the bid. Spreads widen with higher volatility and deeper OTM strikes. Hover any cell to see bid/ask.' },
        // --- Strategy ---
        strategies:   { title: 'Strategy Builder', body: 'Build multi-leg strategies: left-click for long, right-click for short. Execute fills all legs atomically with rollback on failure.' },
        sharedExpiry: { title: 'Shared Expiry', body: 'On: all legs share the expiry dropdown selection. Off: each leg keeps its own DTE offset (for calendar spreads).' },
        // --- Settings ---
        regime:       { title: 'Market Regime', body: '5 static presets (Calm Bull to Rate Hike) plus 2 dynamic modes with narrative events. Changing preset resets the simulation.' },
        riskFreeRate: { title: 'Risk-Free Rate', body: 'Current Vasicek rate $r$. Drives option pricing, bond values, and borrow costs. Sparkline shows recent history.' },
        events:       { title: 'Event Engine', body: 'Generates narrative events that shift parameters. Fed ~every 32 days, non-Fed Poisson ~1/30 days. Followup chains create storylines.' },
        llm:          { title: 'LLM Integration', body: 'Dynamic (LLM) uses Claude to generate contextual events. Set your API key in Settings. Falls back to offline events on failure.' },
        gbm:          { title: 'Pricing Models', body: 'GBM + Merton jumps + Heston stochastic vol + Vasicek rates. American options priced via 128-step CRR binomial tree.' },
    };
    registerInfoTips(data);
}

// ---------------------------------------------------------------------------
// updateDynamicSections
// ---------------------------------------------------------------------------

export function updateDynamicSections($, presetIndex) {
    const isLLM = presetIndex >= 6;
    const isOffline = presetIndex === 5;
    const isDynamic = isLLM || isOffline;

    if ($.llmSettingsSection) {
        $.llmSettingsSection.classList.toggle('hidden', !isLLM);
    }
    if ($.eventLogSection) {
        $.eventLogSection.classList.toggle('hidden', !isDynamic);
    }
    if ($.congressSection) {
        $.congressSection.classList.toggle('hidden', !isDynamic);
    }
    if ($.standingsSection) {
        $.standingsSection.classList.toggle('hidden', !isDynamic);
    }
}

// ---------------------------------------------------------------------------
// Standings panel
// ---------------------------------------------------------------------------

const _FACTION_IDS = ['firmStanding', 'regulatoryExposure', 'federalistSupport', 'farmerLaborSupport', 'mediaTrust', 'fedRelations'];

export function updateStandings($, world, factions, getFactionDescriptor) {
    if (!$.standingsWorld || !$.standingsFactions) return;
    _renderWorldState($.standingsWorld, world);
    _renderFactionScores($.standingsFactions, factions, getFactionDescriptor);
}

function _renderWorldState(container, world) {
    container.textContent = '';
    const entries = [
        ['Barron Approval', (world?.election?.barronApproval ?? '?') + '%'],
        ['Fed Stance', (world?.fed?.hikeCycle) ? 'Hiking' : (world?.fed?.cutCycle) ? 'Cutting' : 'Holding'],
        ['Fed Credibility', (world?.fed?.credibilityScore ?? '?') + '/10'],
    ];
    for (const [label, value] of entries) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const lbl = document.createElement('span');
        lbl.className = 'stat-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = 'stat-value';
        val.textContent = value;
        row.appendChild(lbl);
        row.appendChild(val);
        container.appendChild(row);
    }
}

const _FACTION_LABELS = {
    firmStanding: 'Firm',
    regulatoryExposure: 'Regulatory',
    federalistSupport: 'Federalists',
    farmerLaborSupport: 'Farmer-Labor',
    mediaTrust: 'Media',
    fedRelations: 'Fed Relations',
};

function _renderFactionScores(container, factions, getFactionDescriptor) {
    container.textContent = '';
    for (const id of _FACTION_IDS) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const lbl = document.createElement('span');
        lbl.className = 'stat-label';
        lbl.textContent = _FACTION_LABELS[id] || id;
        const val = document.createElement('span');
        val.className = 'stat-value';
        val.textContent = getFactionDescriptor(id);
        row.appendChild(lbl);
        row.appendChild(val);
        container.appendChild(row);
    }
}

// ---------------------------------------------------------------------------
// updateEventLog
// ---------------------------------------------------------------------------

export function updateEventLog($, eventLog, dayOrigin) {
    if (!$.eventLog) return;
    if (!eventLog || eventLog.length === 0) {
        $.eventLog.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'event-log-empty';
        empty.textContent = 'No events yet.';
        $.eventLog.appendChild(empty);
        return;
    }
    // Show last 5, newest first
    $.eventLog.textContent = '';
    const recent = eventLog.slice(-5).reverse();
    for (const e of recent) {
        const row = document.createElement('div');
        row.className = 'event-log-entry';
        row.dataset.magnitude = e.magnitude;

        const daySpan = document.createElement('span');
        daySpan.className = 'event-log-day';
        daySpan.textContent = fmtRelDay(e.day, dayOrigin || 0);

        const headlineSpan = document.createElement('span');
        headlineSpan.className = 'event-log-headline';
        headlineSpan.textContent = e.headline;

        row.appendChild(daySpan);
        row.appendChild(headlineSpan);
        $.eventLog.appendChild(row);
    }
}

// ---------------------------------------------------------------------------
// updateCongressDiagrams -- parliament-style semicircle diagrams
// ---------------------------------------------------------------------------

function _congressColors() {
    return {
        federalist: _PALETTE.extended.orange,
        farmerLabor: _PALETTE.extended.lime,
    };
}

function _drawParliament(canvas, segments, total) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width / dpr || 120;
    const h = canvas.clientHeight || canvas.height / dpr || 60;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h - 4;
    const outerR = Math.min(cx - 4, h - 8);
    const innerR = outerR * 0.45;

    // Single solid semicircle per segment (no rows, no gaps)
    let startAngle = Math.PI; // left (180 deg)
    for (const seg of segments) {
        const sweep = (seg.count / total) * Math.PI;
        if (sweep <= 0) continue;

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep, false);
        ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();

        startAngle += sweep;
    }
}

function _updateLegend(el, segments, majority) {
    if (!el) return;
    el.textContent = '';
    for (const seg of segments) {
        if (seg.count <= 0) continue;
        const item = document.createElement('span');
        item.className = 'congress-legend-item';

        const dot = document.createElement('span');
        dot.className = 'congress-legend-dot';
        dot.style.background = seg.color;

        const label = document.createElement('span');
        label.textContent = seg.label + ' ' + seg.count;
        if (seg.count >= majority) label.style.fontWeight = '600';

        item.appendChild(dot);
        item.appendChild(label);
        el.appendChild(item);
    }
}

export function updateCongressDiagrams($, world) {
    if (!world || !$.senateDiagram) return;
    const c = _congressColors();
    const s = world.congress.senate;
    const h = world.congress.house;

    const senateSegs = [
        { label: 'F-L', count: s.farmerLabor, color: c.farmerLabor },
        { label: 'Fed', count: s.federalist, color: c.federalist },
    ];
    const senateTotal = s.federalist + s.farmerLabor;
    _drawParliament($.senateDiagram, senateSegs, senateTotal);
    _updateLegend($.senateLegend, senateSegs, 51);

    const houseSegs = [
        { label: 'F-L', count: h.farmerLabor, color: c.farmerLabor },
        { label: 'Fed', count: h.federalist, color: c.federalist },
    ];
    const houseTotal = h.federalist + h.farmerLabor;
    _drawParliament($.houseDiagram, houseSegs, houseTotal);
    _updateLegend($.houseLegend, houseSegs, 218);
}

const _popupCategoryMeta = {
    fed:            { label: 'Federal Reserve',    color: 'var(--ext-blue)' },
    investigation:  { label: 'Investigation',      color: 'var(--ext-red)' },
    pnth:           { label: 'Palanthropic',       color: 'var(--ext-purple)' },
    pnth_earnings:  { label: 'PNTH Earnings',      color: 'var(--ext-purple)' },
    congressional:  { label: 'Congress',            color: 'var(--ext-indigo)' },
    political:      { label: 'Political',           color: 'var(--ext-orange)' },
    midterm:        { label: 'Election',            color: 'var(--ext-rose)' },
    macro:          { label: 'Macro',               color: 'var(--ext-cyan)' },
    sector:         { label: 'Sector',              color: 'var(--ext-lime)' },
    market:         { label: 'Markets',             color: 'var(--ext-yellow)' },
    compound:       { label: 'Crisis',              color: 'var(--ext-red)' },
    desk:           { label: 'Meridian Capital',    color: 'var(--accent)' },
    margin:         { label: 'Margin Call',         color: 'var(--down)' },
    gameover:       { label: 'Game Over',           color: 'var(--ext-red)' },
};

export function showPopupEvent($, headline, context, choices, onChoice, category, magnitude, superevent = false) {
    // Category badge + accent color
    const meta = _popupCategoryMeta[category] || _popupCategoryMeta.desk;
    const panel = $.popupOverlay.querySelector('.sim-overlay-panel');
    panel.style.borderTopColor = meta.color;

    // Magnitude-based backdrop (blur only, no darkening)
    if (magnitude === 'major') {
        $.popupOverlay.style.backdropFilter = 'blur(8px) saturate(1.2)';
    } else {
        $.popupOverlay.style.backdropFilter = '';
    }

    // Category tag
    let tag = $.popupOverlay.querySelector('.popup-tag');
    if (!tag) {
        tag = document.createElement('span');
        tag.className = 'popup-tag';
        $.popupHeadline.parentNode.insertBefore(tag, $.popupHeadline);
    }
    tag.textContent = meta.label;
    tag.style.color = meta.color;
    tag.style.borderColor = meta.color;

    $.popupHeadline.textContent = headline;
    if (superevent) {
        $.popupOverlay.classList.add('superevent');
        $.popupContext.textContent = '';
        $.popupChoices.style.display = 'none';
        const fullContext = context;
        let charIdx = 0;
        const cursor = document.createElement('span');
        cursor.className = 'typewriter-cursor';
        $.popupContext.appendChild(cursor);
        const typeInterval = setInterval(() => {
            if (charIdx < fullContext.length) {
                cursor.before(document.createTextNode(fullContext[charIdx]));
                charIdx++;
            } else {
                clearInterval(typeInterval);
                cursor.remove();
                // Staggered fade-in for each choice button
                $.popupChoices.style.display = '';
                const btns = $.popupChoices.querySelectorAll('.popup-choice-btn');
                btns.forEach((btn, i) => {
                    btn.classList.add('choice-animate-in');
                    btn.style.animationDelay = (i * 150) + 'ms';
                });
                const lastBtn = btns[btns.length - 1];
                if (lastBtn) {
                    lastBtn.addEventListener('animationend', () => {
                        const firstBtn = $.popupChoices.querySelector('button');
                        if (firstBtn) firstBtn.focus();
                    }, { once: true });
                }
            }
        }, 25);
    } else {
        $.popupOverlay.classList.remove('superevent');
        $.popupContext.textContent = context;
    }
    $.popupChoices.textContent = '';
    choices.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = 'popup-choice-btn';
        const lbl = document.createElement('span');
        lbl.className = 'popup-choice-label';
        lbl.textContent = c.label;
        const desc = document.createElement('span');
        desc.className = 'popup-choice-desc';
        desc.textContent = c.desc;
        btn.appendChild(lbl);
        btn.appendChild(desc);
        btn.addEventListener('click', () => {
            $.popupOverlay.classList.add('hidden');
            // Clean up inline styles
            panel.style.borderTopColor = '';
            $.popupOverlay.style.background = '';
            $.popupOverlay.style.backdropFilter = '';
            $.popupOverlay.classList.remove('superevent');
            if (_popupTrapCleanup) { _popupTrapCleanup(); _popupTrapCleanup = null; }
            if (_popupPrevFocus && _popupPrevFocus.focus) { _popupPrevFocus.focus(); _popupPrevFocus = null; }
            onChoice(i);
        });
        $.popupChoices.appendChild(btn);
    });
    _popupPrevFocus = document.activeElement;
    $.popupOverlay.classList.remove('hidden');
    if (typeof trapFocus === 'function') _popupTrapCleanup = trapFocus($.popupOverlay);
    const firstChoice = $.popupChoices.querySelector('button');
    if (firstChoice) firstChoice.focus();
    if (typeof _haptics !== 'undefined') _haptics.trigger(magnitude === 'major' ? 'medium' : 'light');
}

export function hidePopupEvent($) {
    $.popupOverlay.classList.add('hidden');
    if (_popupTrapCleanup) { _popupTrapCleanup(); _popupTrapCleanup = null; }
    if (_popupPrevFocus && _popupPrevFocus.focus) { _popupPrevFocus.focus(); _popupPrevFocus = null; }
}

export function isPopupVisible($) {
    return !$.popupOverlay.classList.contains('hidden');
}
