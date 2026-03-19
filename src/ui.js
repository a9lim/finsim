/* =====================================================
   ui.js -- DOM manipulation, event binding, and display
   updates for the Shoals trading simulator.

   Owns all DOM access outside of canvas rendering.
   Pure functions -- no internal state.
   ===================================================== */

import { TRADING_DAYS_PER_YEAR } from './config.js';
import { renderChainInto, buildStockBondTable, buildChainTable, bindChainTableClicks } from './chain-renderer.js';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtDollar(v) {
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : '') + '$' + formatted;
}

function fmtNum(v, dp = 4) { return Number(v).toFixed(dp); }

function pnlClass(v) {
    if (v > 0) return 'pnl-up';
    if (v < 0) return 'pnl-down';
    return '';
}

function fmtDte(dte) {
    if (dte >= TRADING_DAYS_PER_YEAR) return (dte / TRADING_DAYS_PER_YEAR).toFixed(1) + 'y';
    if (dte >= 21) return Math.round(dte / 21) + 'mo';
    return dte + 'd';
}

function posTypeLabel(type, sideOrQty) {
    // Accept either a string side ('long'/'short') or a signed qty number
    const isShort = typeof sideOrQty === 'number' ? sideOrQty < 0 : sideOrQty === 'short';
    const prefix = isShort ? 'S' : 'L';
    switch (type) {
        case 'stock': return prefix + ':STK';
        case 'bond':  return prefix + ':BND';
        case 'call':  return prefix + ':CALL';
        case 'put':   return prefix + ':PUT';
        default:      return type.toUpperCase();
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
    $.greeksAggregate = document.getElementById('greeks-aggregate');
    $.greekDelta      = document.getElementById('greek-delta');
    $.greekGamma      = document.getElementById('greek-gamma');
    $.greekTheta      = document.getElementById('greek-theta');
    $.greekVega       = document.getElementById('greek-vega');
    $.greekRho        = document.getElementById('greek-rho');
    $.presetSelect    = document.getElementById('preset-select');
    $.rateDisplay     = document.getElementById('rate-display');
    $.advancedToggle  = document.getElementById('advanced-toggle');
    $.advancedSection = document.getElementById('advanced-section');
    $.resetBtn        = document.getElementById('reset-btn');
    $.sliders = {};
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR']) {
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
        onTogglePlay, onStep, onSpeedChange, onToggleTheme, onToggleSidebar,
        onPresetChange, onReset, onSliderChange, onTimeSlider,
        onBuyStock, onShortStock, onBuyBond, onShortBond,
        onChainCellClick, onFullChainOpen, onExpiryChange,
        onTradeSubmit, onLiquidate, onDismissMargin,
        onLLMKeyChange, onLLMModelChange,
    } = handlers;

    $.playBtn.addEventListener('click', onTogglePlay);
    $.stepBtn.addEventListener('click', onStep);
    $.speedBtn.addEventListener('click', onSpeedChange);
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
        _haptics.trigger('selection');
    });

    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR']) {
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
        _haptics.trigger('light');
    });
    $.chainOverlay.addEventListener('click', (e) => {
        if (e.target === $.chainOverlay) $.chainOverlay.classList.add('hidden');
    });

    const closeTrade = () => {
        $.tradeDialog.classList.add('hidden');
        _haptics.trigger('light');
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
        _haptics.trigger('light');
    });
    $.marginCallLiquidate.addEventListener('click', () => {
        $.marginCallOverlay.classList.add('hidden');
        if (typeof onLiquidate === 'function') onLiquidate();
        _haptics.trigger('heavy');
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
                _haptics.trigger('selection');
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
        $.strategyStockCell.addEventListener('click', () => { _haptics.trigger('selection'); handlers.onAddLeg('stock', 'long'); });
        $.strategyStockCell.addEventListener('contextmenu', (e) => { e.preventDefault(); _haptics.trigger('selection'); handlers.onAddLeg('stock', 'short'); });
        $.strategyBondCell.addEventListener('click', () => { _haptics.trigger('selection'); handlers.onAddLeg('bond', 'long'); });
        $.strategyBondCell.addEventListener('contextmenu', (e) => { e.preventDefault(); _haptics.trigger('selection'); handlers.onAddLeg('bond', 'short'); });
    }
    if ($.saveStrategyBtn && typeof handlers.onSaveStrategy === 'function') {
        $.saveStrategyBtn.addEventListener('click', handlers.onSaveStrategy);
    }
    if ($.execStrategyBtn && typeof handlers.onExecStrategy === 'function') {
        $.execStrategyBtn.addEventListener('click', handlers.onExecStrategy);
    }
}

// ---------------------------------------------------------------------------
// updateChainDisplay
// ---------------------------------------------------------------------------

export function updateChainDisplay($, chain, selectedExpiryIndex) {
    renderChainInto($.chainTable, chain, selectedExpiryIndex, $.tradeExpiry, $._onChainCellClick);
}

// ---------------------------------------------------------------------------
// updatePortfolioDisplay
// ---------------------------------------------------------------------------

export function updatePortfolioDisplay($, portfolio, currentPrice, vol, rate, day) {
    $.cashDisplay.textContent = fmtDollar(portfolio.cash);

    let totalValue = portfolio.cash;
    for (const pos of portfolio.positions) {
        totalValue += _posCurrentValue(pos, currentPrice, vol, rate, day);
    }
    $.portfolioValue.textContent = fmtDollar(totalValue);

    const pnl = totalValue - portfolio.initialCapital;
    $.totalPnl.textContent = fmtDollar(pnl);
    $.totalPnl.className   = 'stat-value ' + pnlClass(pnl);

    const marginInfo = _computeMarginDisplay(portfolio, currentPrice);
    $.marginStatus.textContent = marginInfo.label;
    $.marginStatus.className   = 'stat-value ' + marginInfo.cls;

    const defaultPos = portfolio.positions.filter(p => !p.strategyName);
    $.defaultPositions.textContent = '';
    if (defaultPos.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'panel-hint';
        hint.textContent = 'No open positions.';
        $.defaultPositions.appendChild(hint);
    } else {
        for (const pos of defaultPos) {
            $.defaultPositions.appendChild(_buildPositionRow(pos, currentPrice, vol, rate, day));
        }
    }

    const strategyNames = [...new Set(
        portfolio.positions.filter(p => p.strategyName).map(p => p.strategyName)
    )];
    $.strategyPositions.textContent = '';
    if (strategyNames.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'panel-hint';
        hint.textContent = 'No strategy positions.';
        $.strategyPositions.appendChild(hint);
    } else {
        for (const name of strategyNames) {
            const group = document.createElement('div');
            group.className = 'strategy-group';
            const label = document.createElement('div');
            label.className = 'group-label';
            label.textContent = name;
            group.appendChild(label);
            for (const pos of portfolio.positions.filter(p => p.strategyName === name)) {
                group.appendChild(_buildPositionRow(pos, currentPrice, vol, rate, day));
            }
            $.strategyPositions.appendChild(group);
        }
    }

    $.pendingOrders.textContent = '';
    if (portfolio.orders.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'panel-hint';
        hint.textContent = 'No pending orders.';
        $.pendingOrders.appendChild(hint);
    } else {
        for (const order of portfolio.orders) {
            $.pendingOrders.appendChild(_buildOrderRow(order));
        }
    }
}

function _posCurrentValue(pos, S, vol, rate, day) {
    const absQty = Math.abs(pos.qty);
    switch (pos.type) {
        case 'stock':
            return pos.qty > 0
                ? absQty * S
                : absQty * (2 * pos.entryPrice - S);
        case 'bond': {
            const dte = pos.expiryDay != null
                ? Math.max((pos.expiryDay - day) / TRADING_DAYS_PER_YEAR, 0)
                : 0;
            return absQty * 100 * Math.exp(-rate * dte);
        }
        default: return 0;
    }
}

function _computeMarginDisplay(portfolio, currentPrice) {
    const shortPositions = portfolio.positions.filter(p => p.qty < 0);
    if (shortPositions.length === 0) return { label: 'OK', cls: '' };
    let shortNotional = 0;
    for (const pos of shortPositions) shortNotional += Math.abs(pos.qty) * currentPrice;
    const required = 0.25 * shortNotional;
    if (portfolio.cash < required) return { label: 'MARGIN CALL', cls: 'margin-alert' };
    const pct = required > 0 ? Math.min((portfolio.cash / required) * 100, 999) : 999;
    if (portfolio.cash < required * 1.2) return { label: 'Low (' + pct.toFixed(0) + '%)', cls: 'margin-warn' };
    return { label: 'OK (' + pct.toFixed(0) + '%)', cls: '' };
}

function _buildPositionRow(pos, currentPrice, vol, rate, day) {
    const absQty     = Math.abs(pos.qty);
    const typeLabel  = posTypeLabel(pos.type, pos.qty);
    const currentVal = _posCurrentValue(pos, currentPrice, vol, rate, day);
    const entryTotal = pos.entryPrice * absQty;
    const pnl        = pos.qty > 0 ? currentVal - entryTotal : entryTotal - currentVal;
    const isOption   = pos.type === 'call' || pos.type === 'put';
    const strikeStr  = isOption && pos.strike != null ? ' K' + pos.strike : '';
    const expiryStr  = pos.expiryDay != null ? ' ' + fmtDte(pos.expiryDay - day) : '';
    const labelStr   = typeLabel + strikeStr + expiryStr + ' x' + absQty;

    const row = document.createElement('div');
    row.className = 'pos-row stat-row';
    row.dataset.posId = pos.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'pos-label stat-label';
    labelEl.textContent = labelStr;

    const pnlEl = document.createElement('span');
    pnlEl.className = 'pos-pnl stat-value ' + pnlClass(pnl);
    pnlEl.textContent = fmtDollar(pnl);
    pnlEl.title = 'Entry ' + fmtDollar(entryTotal);

    const actions = document.createElement('div');
    actions.className = 'pos-actions';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ghost-btn pos-close-btn';
    closeBtn.textContent = 'X';
    closeBtn.title = 'Close position';
    closeBtn.addEventListener('click', () => {
        closeBtn.dispatchEvent(new CustomEvent('shoals:closePosition', { detail: { id: pos.id }, bubbles: true }));
        _haptics.trigger('medium');
    });
    actions.appendChild(closeBtn);

    if (isOption && pos.qty > 0) {
        const exBtn = document.createElement('button');
        exBtn.className = 'ghost-btn pos-exercise-btn';
        exBtn.textContent = 'Ex';
        exBtn.title = 'Exercise option';
        exBtn.addEventListener('click', () => {
            exBtn.dispatchEvent(new CustomEvent('shoals:exerciseOption', { detail: { id: pos.id }, bubbles: true }));
            _haptics.trigger('medium');
        });
        actions.appendChild(exBtn);
    }

    row.appendChild(labelEl);
    row.appendChild(pnlEl);
    row.appendChild(actions);
    return row;
}

function _buildOrderRow(order) {
    const typeLabel = posTypeLabel(order.type, order.side);
    const strikeStr = order.strike != null ? ' K' + order.strike : '';
    const labelStr  = typeLabel + strikeStr + ' x' + order.qty + ' ' + order.orderType + ' @ ' + fmtDollar(order.triggerPrice);

    const row = document.createElement('div');
    row.className = 'order-row stat-row';
    row.dataset.orderId = order.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'order-label stat-label';
    labelEl.textContent = labelStr;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost-btn order-cancel-btn';
    cancelBtn.textContent = 'X';
    cancelBtn.title = 'Cancel order';
    cancelBtn.addEventListener('click', () => {
        cancelBtn.dispatchEvent(new CustomEvent('shoals:cancelOrder', { detail: { id: order.id }, bubbles: true }));
        _haptics.trigger('light');
    });

    row.appendChild(labelEl);
    row.appendChild(cancelBtn);
    return row;
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

export function updateRateDisplay($, rate) {
    if ($.rateDisplay) $.rateDisplay.textContent = (rate * 100).toFixed(2) + '%';
}

// ---------------------------------------------------------------------------
// updateStockBondPrices -- updates both trade-tab and strategy-tab cells
// ---------------------------------------------------------------------------

export function updateStockBondPrices($, spot, rate, chain) {
    const dash = '\u2014';
    const stockTxt = spot != null ? spot.toFixed(2) : dash;

    // Trade tab bond: from trade expiry dropdown
    const tradeIdx = parseInt($.tradeExpiry?.value, 10);
    const tradeExp = chain && chain.length > 0
        ? chain[isNaN(tradeIdx) ? chain.length - 1 : Math.min(tradeIdx, chain.length - 1)]
        : null;
    const tradeBond = tradeExp && rate != null
        ? (100 * Math.exp(-rate * tradeExp.dte / 252)).toFixed(2)
        : dash;

    if ($.stockPriceCell) $.stockPriceCell.textContent = stockTxt;
    if ($.bondPriceCell) $.bondPriceCell.textContent = tradeBond;

    // Strategy tab bond: from strategy expiry dropdown
    const stratIdx = parseInt($.strategyExpiry?.value, 10);
    const stratExp = chain && chain.length > 0
        ? chain[isNaN(stratIdx) ? chain.length - 1 : Math.min(stratIdx, chain.length - 1)]
        : null;
    const stratBond = stratExp && rate != null
        ? (100 * Math.exp(-rate * stratExp.dte / 252)).toFixed(2)
        : dash;

    if ($.strategyStockCell) $.strategyStockCell.textContent = stockTxt;
    if ($.strategyBondCell) $.strategyBondCell.textContent = stratBond;
}

// ---------------------------------------------------------------------------
// syncSettingsUI
// ---------------------------------------------------------------------------

export function syncSettingsUI($, sim) {
    if (!sim || !sim.params) return;
    if (sim.presetIndex != null) $.presetSelect.selectedIndex = sim.presetIndex;
    for (const p of ['mu','theta','kappa','xi','rho','lambda','muJ','sigmaJ','a','b','sigmaR']) {
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

export function showChainOverlay($, chain, stockBA, bondBA) {
    $.chainOverlayTable.textContent = '';

    if (!chain || chain.length === 0) {
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
        chain.forEach((exp, i) => {
            const btn = document.createElement('button');
            btn.className = 'ghost-btn chain-expiry-tab' + (i === selectedExpiry ? ' active' : '');
            btn.textContent = fmtDte(exp.dte);
            btn.addEventListener('click', () => {
                selectedExpiry = i;
                _haptics.trigger('selection');
                renderOverlay();
            });
            tabBar.appendChild(btn);
        });
        $.chainOverlayTable.appendChild(tabBar);

        // Stock / Bond price table
        $.chainOverlayTable.appendChild(
            buildStockBondTable(stockBA, bondBA, $._onChainCellClick)
        );

        const expiry = chain[selectedExpiry];
        $.chainOverlayTable.appendChild(buildChainTable(expiry, false));
        bindChainTableClicks($.chainOverlayTable, $._onChainCellClick);
    }

    renderOverlay();
    $.chainOverlay.classList.remove('hidden');
    _haptics.trigger('light');
}

// ---------------------------------------------------------------------------
// showTradeDialog
// ---------------------------------------------------------------------------

export function showTradeDialog($, tradeInfo) {
    const { type, strike, expiryDay, side } = tradeInfo;

    let titleText = 'Trade';
    if (type === 'stock')     titleText = 'Trade Stock';
    else if (type === 'bond') titleText = 'Trade Bond';
    else if (type === 'call') titleText = 'Call Option -- Strike ' + strike;
    else if (type === 'put')  titleText = 'Put Option -- Strike ' + strike;
    $.tradeDialogTitle.textContent = titleText;

    const body = $.tradeDialogBody;
    body.textContent = '';

    if (strike != null || expiryDay != null) {
        const info = document.createElement('div');
        info.className = 'trade-info';
        if (strike != null) {
            const p = document.createElement('p');
            p.className = 'trade-info-line';
            p.textContent = 'Strike: $' + strike;
            info.appendChild(p);
        }
        if (expiryDay != null) {
            const p = document.createElement('p');
            p.className = 'trade-info-line';
            p.textContent = 'Expiry day: ' + expiryDay;
            info.appendChild(p);
        }
        body.appendChild(info);
    }

    body.appendChild(_buildSelectRow('Side', 'trade-side-select', [
        { value: 'long',  label: 'Long (Buy)',   selected: !side || side === 'long' },
        { value: 'short', label: 'Short (Sell)', selected: side === 'short' },
    ]));

    const qtyRow = document.createElement('div');
    qtyRow.className = 'ctrl-row';
    const qtyLabel = document.createElement('label');
    qtyLabel.className = 'stat-label';
    qtyLabel.setAttribute('for', 'trade-qty-input');
    qtyLabel.textContent = 'Quantity';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.id = 'trade-qty-input';
    qtyInput.className = 'sim-input';
    qtyInput.value = '1';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyRow.appendChild(qtyLabel);
    qtyRow.appendChild(qtyInput);
    body.appendChild(qtyRow);

    body.appendChild(_buildSelectRow('Order Type', 'trade-order-type', [
        { value: 'market', label: 'Market', selected: true },
        { value: 'limit',  label: 'Limit',  selected: false },
        { value: 'stop',   label: 'Stop',   selected: false },
    ]));

    const limitRow = document.createElement('div');
    limitRow.className = 'ctrl-row';
    limitRow.id = 'trade-limit-row';
    limitRow.style.display = 'none';
    const limitLabel = document.createElement('label');
    limitLabel.className = 'stat-label';
    limitLabel.setAttribute('for', 'trade-limit-price');
    limitLabel.textContent = 'Trigger Price ($)';
    const limitInput = document.createElement('input');
    limitInput.type = 'number';
    limitInput.id = 'trade-limit-price';
    limitInput.className = 'sim-input';
    limitInput.value = strike != null ? String(strike) : '100';
    limitInput.min = '0.01';
    limitInput.step = '0.5';
    limitRow.appendChild(limitLabel);
    limitRow.appendChild(limitInput);
    body.appendChild(limitRow);

    body.querySelector('#trade-order-type').addEventListener('change', function() {
        limitRow.style.display = this.value === 'market' ? 'none' : '';
    });

    const oldBtn = $.tradeConfirmBtn;
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    $.tradeConfirmBtn = newBtn;

    newBtn.addEventListener('click', () => {
        const sideVal      = body.querySelector('#trade-side-select').value;
        const qtyVal       = parseInt(body.querySelector('#trade-qty-input').value, 10);
        const orderTypeVal = body.querySelector('#trade-order-type').value;
        const limitPrice   = orderTypeVal !== 'market'
            ? parseFloat(body.querySelector('#trade-limit-price').value)
            : null;
        if (!qtyVal || qtyVal < 1) { if (typeof showToast !== 'undefined') showToast('Enter a valid quantity.'); return; }
        if (typeof $._onTradeSubmit === 'function') {
            $._onTradeSubmit({ type, strike, expiryDay, side: sideVal, qty: qtyVal, orderType: orderTypeVal, limitPrice });
        }
        $.tradeDialog.classList.add('hidden');
        _haptics.trigger('medium');
    });

    $.tradeDialog.classList.remove('hidden');
    _haptics.trigger('light');
}

function _buildSelectRow(labelText, selectId, options) {
    const row = document.createElement('div');
    row.className = 'ctrl-row';
    const label = document.createElement('label');
    label.className = 'stat-label';
    label.setAttribute('for', selectId);
    label.textContent = labelText;
    const sel = document.createElement('select');
    sel.id = selectId;
    sel.className = 'sim-select';
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.selected) o.selected = true;
        sel.appendChild(o);
    }
    row.appendChild(label);
    row.appendChild(sel);
    return row;
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
    _haptics.trigger('error');
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
    _haptics.trigger('selection');
}

// ---------------------------------------------------------------------------
// updatePlayBtn
// ---------------------------------------------------------------------------

export function updatePlayBtn($, playing) {
    $.playBtn.setAttribute('aria-label', playing ? 'Pause simulation' : 'Play simulation');
    $.playBtn.title = playing ? 'Pause' : 'Play';
    $.playBtn.textContent = '';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    if (playing) {
        for (const [x, y, w, h] of [[6,4,4,16],[14,4,4,16]]) {
            const rect = document.createElementNS(NS, 'rect');
            rect.setAttribute('x', x); rect.setAttribute('y', y);
            rect.setAttribute('width', w); rect.setAttribute('height', h);
            svg.appendChild(rect);
        }
    } else {
        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', '5 3 19 12 5 21 5 3');
        svg.appendChild(poly);
    }
    $.playBtn.appendChild(svg);
}

// ---------------------------------------------------------------------------
// updateSpeedBtn
// ---------------------------------------------------------------------------

export function updateSpeedBtn($, speed) {
    const label = $.speedBtn.querySelector('.speed-label');
    if (label) label.textContent = speed + 'x';
    $.speedBtn.title = 'Speed: ' + speed + 'x';
}

// ---------------------------------------------------------------------------
// updateZoomLevel
// ---------------------------------------------------------------------------

export function updateZoomLevel($, factor) {
    $.zoomLevel.textContent = Math.round(factor * 100) + '%';
}

// ---------------------------------------------------------------------------
// Strategy selectors & builder
// ---------------------------------------------------------------------------

/**
 * Update the strategy chain table, stock/bond prices, and trigger price slider.
 * Called whenever the chain is rebuilt.
 */
export function updateStrategySelectors($, chain, spot, onAddLeg) {
    // Strategy chain table + expiry dropdown (built together by renderChainInto)
    updateStrategyChainDisplay($, chain, null, onAddLeg);

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

export function updateStrategyChainDisplay($, chain, selectedIndex, onAddLeg) {
    if (!$.strategyChainTable) return;

    // Wrap onAddLeg into the { type, side, strike, expiryDay } callback shape
    const onClick = typeof onAddLeg === 'function'
        ? (info) => onAddLeg(info.type, info.side, info.strike, info.expiryDay)
        : null;

    renderChainInto($.strategyChainTable, chain, selectedIndex, $.strategyExpiry, onClick);
}


export function renderStrategyBuilder($, legs, summary, onRemoveLeg, chain, onLegChange) {
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
            $.strategyLegsList.appendChild(_buildLegRow(leg, i, onRemoveLeg, chain, onLegChange));
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

function _buildLegRow(leg, index, onRemoveLeg, chain, onLegChange) {
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
        const expiry = chain ? chain.find(e => e.day === leg.expiryDay) : null;
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
    const marginLabel = $.marginStatus?.closest('.stat-row')?.querySelector('.stat-label');
    if (marginLabel && !marginLabel.parentElement.querySelector('.info-trigger')) {
        const btn = document.createElement('button');
        btn.className = 'info-trigger';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Info: Margin Status');
        btn.textContent = '?';
        marginLabel.parentElement.insertBefore(btn, marginLabel.nextSibling);
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

export function updateEventLog($, eventLog) {
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
        daySpan.textContent = 'D' + e.day;

        const headlineSpan = document.createElement('span');
        headlineSpan.className = 'event-log-headline';
        headlineSpan.textContent = e.headline;

        row.appendChild(daySpan);
        row.appendChild(headlineSpan);
        $.eventLog.appendChild(row);
    }
}
