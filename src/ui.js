/* =====================================================
   ui.js -- DOM manipulation, event binding, and display
   updates for the Shoals trading simulator.

   Owns all DOM access outside of canvas rendering.
   Pure functions -- no internal state.
   ===================================================== */

import { fmtDollar, fmtNum, pnlClass, fmtDte, fmtRelDay, posTypeLabel } from './format-helpers.js';
import { computeBidAsk } from './portfolio.js';
import { renderChainInto, rebuildExpiryDropdown, buildStockBondTable, buildChainTable, bindChainTableClicks, posKey } from './chain-renderer.js';
export { updatePortfolioDisplay } from './portfolio-renderer.js';

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
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread']) {
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
    $.marginCallClose     = document.getElementById('margin-call-close');
    $.marginCallMsg       = document.getElementById('margin-call-msg');
    $.marginCallLiquidate = document.getElementById('margin-call-liquidate');
    $.marginCallDismiss   = document.getElementById('margin-call-dismiss');
    $.introScreen = document.getElementById('intro-screen');
    $.introStart  = document.getElementById('intro-start');
    $.strategyLegsList = document.getElementById('strategy-legs-list');
    $.strategySummary  = document.getElementById('strategy-summary');
    $.saveStrategyBtn  = document.getElementById('save-strategy-btn');
    $.execStrategyBtn  = document.getElementById('exec-strategy-btn');
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
}

// ---------------------------------------------------------------------------
// bindEvents
// ---------------------------------------------------------------------------

export function bindEvents($, handlers) {
    const {
        onTogglePlay, onStep, onSpeedUp, onSpeedDown, onToggleTheme, onToggleSidebar,
        onPresetChange, onReset, onSliderChange, onTimeSlider,
        onBuyStock, onShortStock, onBuyBond, onShortBond,
        onChainCellClick, onFullChainOpen, onExpiryChange,
        onTradeSubmit, onLiquidate, onDismissMargin,
        onLLMKeyChange, onLLMModelChange,
    } = handlers;

    $.playBtn.addEventListener('click', onTogglePlay);
    $.stepBtn.addEventListener('click', onStep);
    $.speedBtn.addEventListener('click', onSpeedUp);
    $.speedBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); onSpeedDown(); });
    $.themeBtn.addEventListener('click', onToggleTheme);
    $.panelToggle.addEventListener('click', onToggleSidebar);
    $.closePanel.addEventListener('click', onToggleSidebar);
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

    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread']) {
        const slider  = $.sliders[p];
        const valSpan = $.sliders[p + 'Val'];
        if (!slider) continue;
        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            valSpan.textContent = v.toString();
            onSliderChange(p, v);
        });
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

    $.chainOverlayClose.addEventListener('click', () => {
        $.chainOverlay.classList.add('hidden');
        if (typeof _haptics !== 'undefined') _haptics.trigger('light');
    });
    $.chainOverlay.addEventListener('click', (e) => {
        if (e.target === $.chainOverlay) $.chainOverlay.classList.add('hidden');
    });

    const closeTrade = () => {
        $.tradeDialog.classList.add('hidden');
        if (typeof _haptics !== 'undefined') _haptics.trigger('light');
    };
    $.tradeDialogClose.addEventListener('click', closeTrade);
    $.tradeCancelBtn.addEventListener('click', closeTrade);
    $.tradeDialog.addEventListener('click', (e) => {
        if (e.target === $.tradeDialog) closeTrade();
    });

    $.marginCallClose.addEventListener('click', () => $.marginCallOverlay.classList.add('hidden'));
    $.marginCallDismiss.addEventListener('click', () => {
        $.marginCallOverlay.classList.add('hidden');
        if (typeof onDismissMargin === 'function') onDismissMargin();
        if (typeof _haptics !== 'undefined') _haptics.trigger('light');
    });
    $.marginCallLiquidate.addEventListener('click', () => {
        $.marginCallOverlay.classList.add('hidden');
        if (typeof onLiquidate === 'function') onLiquidate();
        if (typeof _haptics !== 'undefined') _haptics.trigger('heavy');
    });
    $.marginCallOverlay.addEventListener('click', (e) => {
        if (e.target === $.marginCallOverlay) $.marginCallOverlay.classList.add('hidden');
    });

    $._onChainCellClick = onChainCellClick;
    $._onTradeSubmit    = onTradeSubmit;

    // Trade tab qty slider
    if ($.tradeQty) {
        $.tradeQty.addEventListener('input', () => {
            $.tradeQtyVal.textContent = $.tradeQty.value;
        });
    }

    // Trade tab expiry dropdown
    if ($.tradeExpiry) {
        $.tradeExpiry.addEventListener('change', () => {
            if (typeof onExpiryChange === 'function') onExpiryChange(parseInt($.tradeExpiry.value, 10));
        });
    }

    // Strategy tab qty slider
    if ($.strategyQty) {
        $.strategyQty.addEventListener('input', () => {
            $.strategyQtyVal.textContent = $.strategyQty.value;
        });
    }

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
        $.orderTypeToggles.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $.orderTypeToggles.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const isMarket = btn.dataset.ordertype === 'market';
                $.triggerPriceGroup.classList.toggle('hidden', isMarket);
                if (typeof _haptics !== 'undefined') _haptics.trigger('selection');
            });
        });
    }

    // Trigger price slider
    if ($.triggerPrice) {
        $.triggerPrice.addEventListener('input', () => {
            $.triggerPriceVal.textContent = '$' + parseFloat($.triggerPrice.value).toFixed(2);
        });
    }

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
    if ($.execStrategyBtn && typeof handlers.onExecStrategy === 'function') {
        $.execStrategyBtn.addEventListener('click', handlers.onExecStrategy);
    }

    // Tooltip delegation for [data-tooltip] cells
    if (typeof createSimTooltip === 'function') {
        const tip = createSimTooltip();
        let tipTarget = null;
        $.sidebar.addEventListener('mouseover', (e) => {
            const el = e.target.closest('[data-tooltip]');
            if (el === tipTarget) return;
            if (el) {
                tipTarget = el;
                tip.show(e.clientX, e.clientY, el.dataset.tooltip);
            } else if (tipTarget) {
                tipTarget = null;
                tip.hide();
            }
        });
        $.sidebar.addEventListener('mouseout', (e) => {
            if (!tipTarget) return;
            const related = e.relatedTarget;
            if (!related || !tipTarget.contains(related)) {
                tipTarget = null;
                tip.hide();
            }
        });
        // Also cover the chain overlay
        $.chainOverlay.addEventListener('mouseover', (e) => {
            const el = e.target.closest('[data-tooltip]');
            if (el === tipTarget) return;
            if (el) {
                tipTarget = el;
                tip.show(e.clientX, e.clientY, el.dataset.tooltip);
            } else if (tipTarget) {
                tipTarget = null;
                tip.hide();
            }
        });
        $.chainOverlay.addEventListener('mouseout', (e) => {
            if (!tipTarget) return;
            const related = e.relatedTarget;
            if (!related || !tipTarget.contains(related)) {
                tipTarget = null;
                tip.hide();
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
        const accent = typeof _PALETTE !== 'undefined' ? _PALETTE.accent : '#FE3B01';
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

function _bidAskTip(mid, spot, sigma) {
    if (mid == null || spot == null || sigma == null) return null;
    const ba = computeBidAsk(mid, spot, sigma);
    return 'Bid ' + ba.bid.toFixed(2) + ' / Ask ' + ba.ask.toFixed(2);
}

/**
 * @param {Array} skeleton - chain skeleton (has .day, .dte per entry)
 */
export function updateStockBondPrices($, spot, rate, sigma, skeleton, posMap, stratPosMap) {
    const dash = '\u2014';
    const stockTxt = spot != null ? spot.toFixed(2) : dash;
    const stockTip = _bidAskTip(spot, spot, sigma);

    // Trade tab bond: from trade expiry dropdown
    const tradeIdx = parseInt($.tradeExpiry?.value, 10);
    const tradeExp = skeleton && skeleton.length > 0
        ? skeleton[isNaN(tradeIdx) ? skeleton.length - 1 : Math.min(tradeIdx, skeleton.length - 1)]
        : null;
    const tradeBondMid = tradeExp && rate != null
        ? 100 * Math.exp(-rate * tradeExp.dte / 252)
        : null;
    const tradeBond = tradeBondMid != null ? tradeBondMid.toFixed(2) : dash;

    if ($.stockPriceCell) _applyPill($.stockPriceCell, stockTxt, posMap && posMap['stock'], stockTip);
    if ($.bondPriceCell) {
        const bondQty = posMap && tradeExp
            ? posMap[posKey('bond', null, tradeExp.day)]
            : null;
        _applyPill($.bondPriceCell, tradeBond, bondQty, _bidAskTip(tradeBondMid, spot, sigma));
    }

    // Strategy tab bond: from strategy expiry dropdown
    const stratIdx = parseInt($.strategyExpiry?.value, 10);
    const stratExp = skeleton && skeleton.length > 0
        ? skeleton[isNaN(stratIdx) ? skeleton.length - 1 : Math.min(stratIdx, skeleton.length - 1)]
        : null;
    const stratBondMid = stratExp && rate != null
        ? 100 * Math.exp(-rate * stratExp.dte / 252)
        : null;
    const stratBond = stratBondMid != null ? stratBondMid.toFixed(2) : dash;

    const sMap = stratPosMap || posMap;
    if ($.strategyStockCell) _applyPill($.strategyStockCell, stockTxt, sMap && sMap['stock'], stockTip);
    if ($.strategyBondCell) {
        const bondQty = sMap && stratExp
            ? sMap[posKey('bond', null, stratExp.day)]
            : null;
        _applyPill($.strategyBondCell, stratBond, bondQty, _bidAskTip(stratBondMid, spot, sigma));
    }
}

// ---------------------------------------------------------------------------
// syncSettingsUI
// ---------------------------------------------------------------------------

export function syncSettingsUI($, sim) {
    if (!sim || !sim.params) return;
    if (sim.presetIndex != null) $.presetSelect.selectedIndex = sim.presetIndex;
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR','borrowSpread']) {
        const slider  = $.sliders[p];
        const valSpan = $.sliders[p + 'Val'];
        if (!slider || sim.params[p] == null) continue;
        slider.value        = sim.params[p];
        valSpan.textContent = String(sim.params[p]);
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
    frag.appendChild(document.createTextNode('Your portfolio equity ('));
    const eq = document.createElement('strong');
    eq.textContent = fmtDollar(equity);
    frag.appendChild(eq);
    frag.appendChild(document.createTextNode(') is below the maintenance margin requirement ('));
    const req = document.createElement('strong');
    req.textContent = fmtDollar(required);
    frag.appendChild(req);
    frag.appendChild(document.createTextNode('). Shortfall: '));
    const sf = document.createElement('strong');
    sf.className = 'margin-alert';
    sf.textContent = fmtDollar(shortfall);
    frag.appendChild(sf);
    frag.appendChild(document.createTextNode('. Liquidate positions or dismiss and manage risk manually.'));
    msg.appendChild(frag);
    $.marginCallOverlay.classList.remove('hidden');
    if (typeof _haptics !== 'undefined') _haptics.trigger('error');
}

// ---------------------------------------------------------------------------
// toggleStrategyView
// ---------------------------------------------------------------------------

export function toggleStrategyView($, active) {
    if (active) {
        $.chartCanvas.classList.add('hidden');
        $.strategyCanvas.classList.remove('hidden');
        $.timeSliderBar.classList.remove('hidden');
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
    _playback.updatePlayBtn($.playBtn, playing);
}

export function updateSpeedBtn($, speed) {
    _playback.updateSpeedBtn($.speedBtn, speed);
}

// ---------------------------------------------------------------------------
// Strategy selectors & builder
// ---------------------------------------------------------------------------

/**
 * Update the strategy chain table, stock/bond prices, and trigger price slider.
 * Called whenever the chain is rebuilt.
 */
/**
 * Update strategy selectors: chain table + trigger price slider.
 */
export function updateStrategySelectors($, pricedExpiry, spot, onAddLeg, posMap) {
    updateStrategyChainDisplay($, pricedExpiry, onAddLeg, posMap);

    // Trigger price slider range based on current spot (+-30%)
    if ($.triggerPrice && spot) {
        const trigMin = Math.max(1, Math.round(spot * 0.7 * 2) / 2);
        const trigMax = Math.round(spot * 1.3 * 2) / 2;
        $.triggerPrice.min = trigMin;
        $.triggerPrice.max = trigMax;
        const curTrig = parseFloat($.triggerPrice.value);
        if (curTrig < trigMin || curTrig > trigMax) {
            $.triggerPrice.value = Math.round(spot * 2) / 2;
        }
        $.triggerPriceVal.textContent = '$' + parseFloat($.triggerPrice.value).toFixed(2);
    }
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


export function renderStrategyBuilder($, legs, summary, onRemoveLeg, skeleton, onLegChange) {
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
                { label: 'Net Cost', value: fmtVal(summary.netCost), cls: pnlClass(-summary.netCost) },
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

    // Enable/disable save & execute buttons
    const hasLegs = legs && legs.length > 0;
    if ($.saveStrategyBtn) $.saveStrategyBtn.disabled = !hasLegs;
    if ($.execStrategyBtn) $.execStrategyBtn.disabled = !hasLegs;
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
    if (leg.strike != null) desc += ' K' + leg.strike;
    if (leg.expiryDay != null) {
        const expiry = skeleton ? skeleton.find(e => e.day === leg.expiryDay) : null;
        if (expiry) desc += ' ' + expiry.dte + 'd';
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
export function wireInfoTips($) {
    if (typeof createInfoTip === 'undefined') return;

    const tips = {
        'slider-mu':     { title: 'Drift (mu)', body: 'Expected annualised return of the underlying asset. Positive = bullish tendency.' },
        'slider-theta':  { title: 'Vol Mean (theta)', body: 'Long-run variance level the volatility reverts to over time.' },
        'slider-kappa':  { title: 'Mean Reversion (kappa)', body: 'Speed at which volatility returns to its long-run mean. Higher = faster reversion.' },
        'slider-xi':     { title: 'Vol of Vol (xi)', body: 'Volatility of the variance process itself. Higher = more erratic vol swings.' },
        'slider-rho':    { title: 'Correlation (rho)', body: 'Correlation between price and volatility shocks. Negative = leverage effect (drops cause vol spikes).' },
        'slider-lambda': { title: 'Jump Rate (lambda)', body: 'Expected number of price jumps per year. Higher = more frequent sudden moves.' },
        'slider-muJ':    { title: 'Jump Mean (muJ)', body: 'Average size of log-price jumps. Negative = jumps tend to be downward.' },
        'slider-sigmaJ': { title: 'Jump Vol (sigmaJ)', body: 'Standard deviation of jump sizes. Higher = more variable jump magnitudes.' },
        'slider-a':      { title: 'Rate Reversion (a)', body: 'Speed at which the risk-free rate reverts to its long-run level.' },
        'slider-b':      { title: 'Rate Mean (b)', body: 'Long-run equilibrium level for the risk-free interest rate.' },
        'slider-sigmaR': { title: 'Rate Vol (sigmaR)', body: 'Volatility of the interest rate process.' },
        'slider-borrowSpread': { title: 'Borrow Spread (k)', body: 'Volatility scaling factor for short borrow cost. Daily charge = notional × (max(r,0) + k×σ) / 252. Events like short squeezes can push this higher.' },
    };

    for (const [sliderId, tipData] of Object.entries(tips)) {
        const slider = document.getElementById(sliderId);
        if (!slider) continue;
        const label = slider.previousElementSibling || slider.closest('.ctrl-row')?.querySelector('.stat-label');
        if (!label) continue;

        // Check if an info trigger already exists next to this label
        if (label.parentElement.querySelector('.info-trigger')) continue;

        const triggerBtn = document.createElement('button');
        triggerBtn.className = 'info-trigger';
        triggerBtn.type = 'button';
        triggerBtn.setAttribute('aria-label', 'Info: ' + tipData.title);
        triggerBtn.textContent = '?';
        label.parentElement.insertBefore(triggerBtn, label.nextSibling);
        createInfoTip(triggerBtn, { title: tipData.title, body: tipData.body, maxWidth: 260 });
    }

    // Margin status info tip
    const marginWrap = document.getElementById('margin-label-wrap');
    if (marginWrap && !marginWrap.querySelector('.info-trigger')) {
        const btn = document.createElement('button');
        btn.className = 'info-trigger';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Info: Margin Status');
        btn.textContent = '?';
        marginWrap.appendChild(btn);
        createInfoTip(btn, {
            title: 'Margin Status',
            body: 'Shows your margin health. OK = well-collateralised. Low = approaching maintenance margin. MARGIN CALL = equity below required level; close positions or add cash.',
            maxWidth: 280,
        });
    }
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
