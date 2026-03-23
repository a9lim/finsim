/* =====================================================
   ui.js -- DOM manipulation, event binding, and display
   updates for the Shoals trading simulator.

   Owns all DOM access outside of canvas rendering.
   Pure functions -- no internal state.
   ===================================================== */

import { fmtDollar, fmtNum, pnlClass, fmtDte, fmtRelDay, posTypeLabel } from './format-helpers.js';
import { computeBidAsk } from './portfolio.js';
import { renderChainInto, rebuildExpiryDropdown, buildStockBondTable, buildChainTable, bindChainTableClicks, posKey } from './chain-renderer.js';
import { vasicekBondPrice } from './pricing.js';
import { BOND_FACE_VALUE, STRIKE_INTERVAL, STRIKE_RANGE } from './config.js';
import { market } from './market.js';
export { updatePortfolioDisplay } from './portfolio-renderer.js';

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
    $.fullChainLink = document.getElementById('full-chain-link');
    $.stockPriceCell = document.getElementById('stock-price-cell');
    $.bondPriceCell  = document.getElementById('bond-price-cell');
    $.defaultPositions  = document.getElementById('default-positions');
    $.strategyPositions = document.getElementById('strategy-positions');
    $.pendingOrders     = document.getElementById('pending-orders');
    $.cashDisplay       = document.getElementById('cash-display');
    $.portfolioValue    = document.getElementById('portfolio-value');
    $.totalPnl          = document.getElementById('total-pnl');
    $.marginStatus      = document.getElementById('margin-status');
    $.borrowCostDisplay = document.getElementById('borrow-cost');
    $.dividendDisplay   = document.getElementById('dividend-income');
    $.greeksAggregate = document.getElementById('greeks-aggregate');
    $.greekDelta      = document.getElementById('greek-delta');
    $.greekGamma      = document.getElementById('greek-gamma');
    $.greekTheta      = document.getElementById('greek-theta');
    $.greekVega       = document.getElementById('greek-vega');
    $.greekRho        = document.getElementById('greek-rho');
    $.presetSelect    = document.getElementById('preset-select');
    $.rateDisplay     = document.getElementById('rate-display');
    $.rateSparkCanvas = document.getElementById('rate-sparkline');
    $.rateSparkCtx    = $.rateSparkCanvas ? $.rateSparkCanvas.getContext('2d') : null;
    $.advancedToggle  = document.getElementById('advanced-toggle');
    $.advancedSection = document.getElementById('advanced-section');
    $.resetBtn        = document.getElementById('reset-btn');
    $.sliders = {};
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread','q']) {
        $.sliders[p]         = document.getElementById('slider-' + p);
        $.sliders[p + 'Val'] = document.getElementById('slider-' + p + '-val');
    }
    $.zoomInBtn    = document.getElementById('zoom-in-btn');
    $.zoomOutBtn   = document.getElementById('zoom-out-btn');
    $.zoomResetBtn = document.getElementById('zoom-reset-btn');
    $.zoomLevel    = document.getElementById('zoom-level');
    $.timeSliderBar   = document.getElementById('time-slider-bar');
    $.timeSlider      = document.getElementById('time-slider');
    $.timeSliderLabel = document.getElementById('time-slider-label');
    $.chainOverlay        = document.getElementById('chain-overlay');
    $.chainOverlayClose   = document.getElementById('chain-overlay-close');
    $.chainOverlayTable   = document.getElementById('chain-overlay-table');
    $.tradeDialog         = document.getElementById('trade-dialog');
    $.tradeDialogTitle    = document.getElementById('trade-dialog-title');
    $.tradeDialogBody     = document.getElementById('trade-dialog-body');
    $.tradeConfirmBtn     = document.getElementById('trade-confirm-btn');
    $.tradeCancelBtn      = document.getElementById('trade-cancel-btn');
    $.tradeDialogClose    = document.getElementById('trade-dialog-close');
    $.marginCallOverlay   = document.getElementById('margin-call-overlay');
    $.marginCallMsg       = document.getElementById('margin-call-msg');
    $.marginCallLiquidate = document.getElementById('margin-call-liquidate');
    $.fraudOverlay        = document.getElementById('fraud-overlay');
    $.fraudMsg            = document.getElementById('fraud-msg');
    $.fraudReset          = document.getElementById('fraud-reset');
    $.popupOverlay   = document.getElementById('popup-event-overlay');
    $.popupHeadline  = document.getElementById('popup-event-headline');
    $.popupContext   = document.getElementById('popup-event-context');
    $.popupChoices   = document.getElementById('popup-event-choices');
    $.introScreen = document.getElementById('intro-screen');
    $.introStart  = document.getElementById('intro-start');
    $.strategyLegsList = document.getElementById('strategy-legs-list');
    $.strategySummary  = document.getElementById('strategy-summary');
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
}

// ---------------------------------------------------------------------------
// bindEvents
// ---------------------------------------------------------------------------

export function bindEvents($, handlers) {
    const {
        onTogglePlay, onStep, onSpeedUp, onSpeedDown, onToggleTheme,
        onPresetChange, onReset, onSliderChange, onTimeSlider,
        onBuyStock, onShortStock, onBuyBond, onShortBond,
        onChainCellClick, onFullChainOpen, onExpiryChange,
        onTradeSubmit, onLiquidate,
        onLLMKeyChange, onLLMModelChange,
        onChainClose, onTradeClose, onMarginClose,
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

    // Stock price cell: left-click = buy, right-click = short
    $.stockPriceCell.addEventListener('click', onBuyStock);
    $.stockPriceCell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onShortStock();
    });
    // Bond price cell: left-click = buy, right-click = sell/short
    $.bondPriceCell.addEventListener('click', onBuyBond);
    $.bondPriceCell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (typeof onShortBond === 'function') onShortBond();
    });
    $.fullChainLink.addEventListener('click', onFullChainOpen);

    const _hideClass = (el, afterHide) => () => { el.classList.add('hidden'); if (typeof afterHide === 'function') afterHide(); };
    initOverlayDismiss($.chainOverlay, $.chainOverlayClose, _hideClass($.chainOverlay, onChainClose));

    const closeTrade = _hideClass($.tradeDialog, onTradeClose);
    initOverlayDismiss($.tradeDialog, $.tradeDialogClose, closeTrade);
    $.tradeCancelBtn.addEventListener('click', closeTrade);

    $.marginCallLiquidate.addEventListener('click', () => {
        $.marginCallOverlay.classList.add('hidden');
        if (typeof onLiquidate === 'function') onLiquidate();
        if (typeof onMarginClose === 'function') onMarginClose();
        if (typeof _haptics !== 'undefined') _haptics.trigger('heavy');
    });
    $.fraudReset.addEventListener('click', () => {
        $.fraudOverlay.classList.add('hidden');
        if (typeof onReset === 'function') onReset();
    });

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
        $.sidebar.addEventListener('mouseover', (e) => {
            const el = e.target.closest('[data-tooltip]');
            if (el === _tipTarget) return;
            if (el) {
                _tipTarget = el;
                _tip.show(e.clientX, e.clientY, el.dataset.tooltip);
            } else if (_tipTarget) {
                _tipTarget = null;
                _tip.hide();
            }
        });
        $.sidebar.addEventListener('mouseout', (e) => {
            if (!_tipTarget) return;
            const related = e.relatedTarget;
            if (!related || !_tipTarget.contains(related)) {
                _tipTarget = null;
                _tip.hide();
            }
        });
        // Also cover the chain overlay
        $.chainOverlay.addEventListener('mouseover', (e) => {
            const el = e.target.closest('[data-tooltip]');
            if (el === _tipTarget) return;
            if (el) {
                _tipTarget = el;
                _tip.show(e.clientX, e.clientY, el.dataset.tooltip);
            } else if (_tipTarget) {
                _tipTarget = null;
                _tip.hide();
            }
        });
        $.chainOverlay.addEventListener('mouseout', (e) => {
            if (!_tipTarget) return;
            const related = e.relatedTarget;
            if (!related || !_tipTarget.contains(related)) {
                _tipTarget = null;
                _tip.hide();
            }
        });
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
    $.greekDelta.classList.toggle('pnl-up',   greeks.delta > 0);
    $.greekDelta.classList.toggle('pnl-down', greeks.delta < 0);
    $.greekTheta.classList.toggle('pnl-down', greeks.theta < 0);
    $.greekVega.classList.toggle('pnl-up',    greeks.vega  > 0);
}

// ---------------------------------------------------------------------------
// updateRateDisplay
// ---------------------------------------------------------------------------

export function updateRateDisplay($, rate, rateHistory) {
    if ($.rateDisplay) $.rateDisplay.textContent = (rate * 100).toFixed(2) + '%';
    if ($.rateSparkCtx && rateHistory && rateHistory.count >= 2
        && typeof drawSparkline !== 'undefined') {
        const c = $.rateSparkCanvas;
        const accent = typeof _PALETTE !== 'undefined' ? _PALETTE.accent : '#E11107';
        drawSparkline($.rateSparkCtx, rateHistory, c.width, c.height, accent, accent + '44');
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
    const stockTxt = spot != null ? spot.toFixed(2) : dash;
    const stockTip = _bidAskTip(spot, sigma);

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
    const tradeBond = tradeBondMid != null ? tradeBondMid.toFixed(2) : dash;

    if ($.stockPriceCell) _applyPill($.stockPriceCell, stockTxt, posMap && posMap['stock'], stockTip);
    if ($.bondPriceCell) {
        const bondQty = posMap && tradeExp
            ? posMap[posKey('bond', null, tradeExp.day)]
            : null;
        _applyPill($.bondPriceCell, tradeBond, bondQty, _bidAskTip(tradeBondMid, market.sigmaR));
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
    const stratBond = stratBondMid != null ? stratBondMid.toFixed(2) : dash;

    const sMap = stratPosMap || posMap;
    if ($.strategyStockCell) _applyPill($.strategyStockCell, stockTxt, sMap && sMap['stock'], stockTip);
    if ($.strategyBondCell) {
        const bondQty = sMap && stratExp
            ? sMap[posKey('bond', null, stratExp.day)]
            : null;
        _applyPill($.strategyBondCell, stratBond, bondQty, _bidAskTip(stratBondMid, market.sigmaR));
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
// showChainOverlay
// ---------------------------------------------------------------------------

/**
 * @param {Array} skeleton - chain skeleton
 * @param {function} priceExpiry - (index) => priced expiry with greeks
 * @param {{ bid, ask }} stockBA
 * @param {{ bid, ask }} bondBA
 * @param {object} posMap
 */
export function showChainOverlay($, skeleton, priceExpiry, stockBA, bondBA, posMap) {
    $.chainOverlayTable.textContent = '';

    if (!skeleton || skeleton.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'panel-hint';
        hint.textContent = 'No chain data available.';
        $.chainOverlayTable.appendChild(hint);
        $.chainOverlay.classList.remove('hidden');
        return;
    }

    let selectedExpiry = 0;

    function renderOverlay() {
        $.chainOverlayTable.textContent = '';

        const tabBar = document.createElement('div');
        tabBar.className = 'chain-expiry-tabs';
        skeleton.forEach((exp, i) => {
            const btn = document.createElement('button');
            btn.className = 'ghost-btn chain-expiry-tab' + (i === selectedExpiry ? ' active' : '');
            btn.textContent = fmtDte(exp.dte);
            btn.addEventListener('click', () => {
                selectedExpiry = i;
                if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
                renderOverlay();
            });
            tabBar.appendChild(btn);
        });
        $.chainOverlayTable.appendChild(tabBar);

        // Stock / Bond price table
        $.chainOverlayTable.appendChild(
            buildStockBondTable(stockBA, bondBA, $._onChainCellClick, posMap)
        );

        const expiry = priceExpiry(selectedExpiry);
        $.chainOverlayTable.appendChild(buildChainTable(expiry, false, posMap));
        if (!$.chainOverlayTable._chainClicksBound) {
            bindChainTableClicks($.chainOverlayTable, $._onChainCellClick);
            $.chainOverlayTable._chainClicksBound = true;
        }
    }

    renderOverlay();
    $.chainOverlay.classList.remove('hidden');
    if (typeof _haptics !== 'undefined') _haptics.trigger('light');
}

// ---------------------------------------------------------------------------
// showMarginCall
// ---------------------------------------------------------------------------

export function showMarginCall($, marginInfo) {
    const { equity, required } = marginInfo;
    const shortfall = required - equity;
    const msg = $.marginCallMsg;
    msg.textContent = '';
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('Portfolio equity '));
    const eq = document.createElement('strong');
    eq.textContent = fmtDollar(equity);
    frag.appendChild(eq);
    frag.appendChild(document.createTextNode(' is below the maintenance requirement of '));
    const req = document.createElement('strong');
    req.textContent = fmtDollar(required);
    frag.appendChild(req);
    frag.appendChild(document.createTextNode('. Shortfall: '));
    const sf = document.createElement('strong');
    sf.className = 'margin-alert';
    sf.textContent = fmtDollar(shortfall);
    frag.appendChild(sf);
    frag.appendChild(document.createTextNode('.'));
    msg.appendChild(frag);
    $.marginCallOverlay.classList.remove('hidden');
    if (typeof _haptics !== 'undefined') _haptics.trigger('error');
}

export function showRogueTrading($, equity, initialCapital) {
    const lossAmt = Math.abs(initialCapital - equity);
    const h2 = document.createElement('h2');
    h2.style.cssText = 'color:var(--ext-red);margin:0 0 12px';
    h2.textContent = 'ROGUE TRADING INVESTIGATION';

    const p1 = document.createElement('p');
    p1.textContent = 'Meridian Capital\'s internal audit has uncovered '
        + fmtDollar(lossAmt) + ' in unauthorized losses on your desk.';

    const p2 = document.createElement('p');
    p2.textContent = 'Bank security has been called. Your access has been revoked. The SEC has been notified.';

    const p3 = document.createElement('p');
    p3.style.cssText = 'color:var(--text-muted);margin-top:16px;font-style:italic';
    p3.textContent = '"The losses were hidden across multiple accounts using a series of fictitious hedging transactions." \u2014 Internal report';

    $.fraudMsg.textContent = '';
    $.fraudMsg.appendChild(h2);
    $.fraudMsg.appendChild(p1);
    $.fraudMsg.appendChild(p2);
    $.fraudMsg.appendChild(p3);
    $.fraudOverlay.classList.remove('hidden');
}

export function showFraudScreen($, equity) {
    const loss = fmtDollar(Math.abs(equity));
    $.fraudMsg.textContent = '';
    const frag = document.createDocumentFragment();

    const p1 = document.createElement('p');
    p1.className = 'fraud-message';
    p1.textContent = 'Following the forced liquidation of all positions, your account '
        + 'remains in deficit by ' + loss + '. Regulators have flagged the account for '
        + 'review.';
    frag.appendChild(p1);

    const p2 = document.createElement('p');
    p2.className = 'fraud-message';
    p2.textContent = 'After a brief but enthusiastic investigation, a federal grand jury has '
        + 'returned indictments on the following charges:';
    const c1 = document.createElement('span');
    c1.className = 'fraud-charge';
    c1.textContent = '18 U.S.C. \u00A7 1348 \u2014 Securities Fraud';
    p2.appendChild(c1);
    const c2 = document.createElement('span');
    c2.className = 'fraud-charge';
    c2.textContent = '26 U.S.C. \u00A7 7201 \u2014 Tax Evasion';
    p2.appendChild(c2);
    frag.appendChild(p2);

    const p3 = document.createElement('p');
    p3.className = 'fraud-message';
    p3.textContent = 'You have been sentenced to 25 years at a minimum-security federal '
        + 'correctional facility. Your broker sends their regards.';
    const sent = document.createElement('span');
    sent.className = 'fraud-sentence';
    sent.textContent = 'Better luck next time.';
    p3.appendChild(sent);
    frag.appendChild(p3);

    $.fraudMsg.appendChild(frag);
    $.fraudOverlay.classList.remove('hidden');
    if (typeof _haptics !== 'undefined') _haptics.trigger('error');
}

// ---------------------------------------------------------------------------
// toggleStrategyView
// ---------------------------------------------------------------------------

export function toggleStrategyView($, active) {
    if (active) {
        $.chartCanvas.classList.add('hidden');
        $.strategyCanvas.classList.remove('hidden');
    } else {
        $.chartCanvas.classList.remove('hidden');
        $.strategyCanvas.classList.add('hidden');
        $.timeSliderBar.classList.add('hidden');
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
                return fmtDollar(v);
            };
            const items = [
                { label: summary.netCost < 0 ? 'Net Credit' : 'Net Debit', value: fmtVal(Math.abs(summary.netCost)), cls: summary.netCost < 0 ? 'pnl-up' : 'pnl-down' },
                { label: 'Max Profit', value: fmtVal(summary.maxProfit), cls: 'pnl-up' },
                { label: 'Max Loss', value: fmtVal(summary.maxLoss), cls: 'pnl-down' },
            ];
            if (summary.breakevens.length > 0) {
                items.push({
                    label: 'Breakeven' + (summary.breakevens.length > 1 ? 's' : ''),
                    value: summary.breakevens.map(b => '$' + b.toFixed(2)).join(', '),
                    cls: '',
                });
            }
            for (const item of items) {
                const row = document.createElement('div');
                row.className = 'stat-row';
                const lbl = document.createElement('span');
                lbl.className = 'stat-label';
                lbl.textContent = item.label;
                const val = document.createElement('span');
                val.className = 'stat-value ' + item.cls;
                val.textContent = item.value;
                row.appendChild(lbl);
                row.appendChild(val);
                $.strategySummary.appendChild(row);
            }
        }
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
    const isCredit = netCost < 0;
    const label = isCredit ? 'Net Credit' : 'Net Debit';
    const value = '$' + Math.abs(netCost).toFixed(2);
    $.strategyCreditDebit.querySelector('.stat-label').textContent = label;
    $.strategyNetCost.textContent = value;
    $.strategyNetCost.className = 'stat-value ' + (isCredit ? 'pnl-up' : 'pnl-down');
}

function _buildLegRow(leg, index, onRemoveLeg, skeleton, onLegChange) {
    const row = document.createElement('div');
    row.className = 'leg-row stat-row';

    // Label: "Long CALL K105 12d" or "Short STOCK" etc.
    const label = document.createElement('span');
    label.className = 'stat-label';
    const isShort = leg.qty < 0;
    const sideStr = isShort ? 'Short' : 'Long';
    let desc = sideStr + ' ' + leg.type.toUpperCase();
    if (leg.strike != null) {
        const atm = Math.round((leg._refS || 100) / 5) * 5;
        const offset = leg.strike - atm;
        desc += ' ' + (offset === 0 ? 'ATM' : offset > 0 ? 'ATM+' + offset : 'ATM' + offset);
    }
    if (leg.expiryDay != null) {
        const expiry = skeleton ? skeleton.find(e => e.day === leg.expiryDay) : null;
        if (expiry) {
            desc += ' ' + expiry.dte + 'd';
        } else {
            const refDay = leg._refDay || 0;
            desc += ' ' + Math.max(1, leg.expiryDay - refDay) + 'd';
        }
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
        leg.qty = isShort ? -newAbsQty : newAbsQty;
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
        totalPnl:     { title: 'Total P&L', body: 'Portfolio value minus initial capital ($10,000). Includes realised/unrealised P&L, dividends, borrow costs, and spread costs.' },
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
        payoff:       { title: 'Payoff Diagram', body: 'P&L profile across stock prices. Green = profit, rose = loss. Use the time slider and Greek overlays to explore risk.' },
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
        { label: 'Farmer-Labor', count: s.farmerLabor, color: c.farmerLabor },
        { label: 'Federalist', count: s.federalist, color: c.federalist },
    ];
    const senateTotal = s.federalist + s.farmerLabor;
    _drawParliament($.senateDiagram, senateSegs, senateTotal);
    _updateLegend($.senateLegend, senateSegs, 51);

    const houseSegs = [
        { label: 'Farmer-Labor', count: h.farmerLabor, color: c.farmerLabor },
        { label: 'Federalist', count: h.federalist, color: c.federalist },
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

export function showPopupEvent($, headline, context, choices, onChoice, category, magnitude) {
    // Category badge + accent color
    const meta = _popupCategoryMeta[category] || _popupCategoryMeta.desk;
    const panel = $.popupOverlay.querySelector('.sim-overlay-panel');
    panel.style.borderTopColor = meta.color;

    // Magnitude-based backdrop
    if (magnitude === 'major') {
        $.popupOverlay.style.background = 'rgba(0,0,0,0.55)';
        $.popupOverlay.style.backdropFilter = 'blur(8px) saturate(1.2)';
    } else {
        $.popupOverlay.style.background = '';
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
    $.popupContext.textContent = context;
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
            onChoice(i);
        });
        $.popupChoices.appendChild(btn);
    });
    $.popupOverlay.classList.remove('hidden');
    if (typeof _haptics !== 'undefined') _haptics.trigger(magnitude === 'major' ? 'medium' : 'light');
}

export function hidePopupEvent($) {
    $.popupOverlay.classList.add('hidden');
}

export function isPopupVisible($) {
    return !$.popupOverlay.classList.contains('hidden');
}
