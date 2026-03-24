# Popup Event Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclassify popup events so market-info popups become toasts, compliance popups execute real trades with a heat/credibility system, and insider-tip popups use vague descriptions with randomized followup outcomes.

**Architecture:** New `compliance.js` leaf module tracks heat/credibility state. Choice handler in `main.js` gains trade execution and compliance integration. `popup-events.js` gets notional helpers, portfolio-relative triggers, and insider tip pool. `event-pool.js` has ~55 popups demoted to regular events and 12 new tip outcome events added.

**Tech Stack:** Vanilla ES6 modules, no dependencies.

**Spec:** `docs/superpowers/specs/2026-03-22-popup-event-refactor-design.md`

---

### Task 1: Create compliance state module

**Files:**
- Create: `src/compliance.js`
- Modify: `src/config.js:53` (add compliance constants after rogue trading threshold)

- [ ] **Step 1: Add compliance constants to config.js**

After line 53 (`ROGUE_TRADING_THRESHOLD`), add:

```javascript
// -- Compliance system --
export const COMPLIANCE_GAME_OVER_HEAT = 5;   // effective heat >= this = fired
export const COMPLIANCE_CREDIBILITY_CAP = 5;  // max credibility accumulation
export const COMPLIANCE_COOLDOWN_HEAT_COEFF = 0.1;  // cooldown scaling per effective heat
export const COMPLIANCE_THRESHOLD_CRED_COEFF = 0.15; // threshold scaling per credibility
export const TIP_REAL_PROBABILITY = 0.70;     // probability insider tip is real
```

- [ ] **Step 2: Create src/compliance.js**

```javascript
/* ===================================================
   compliance.js -- Regulatory heat and credibility
   tracking for the Shoals trading simulator.

   Leaf module. No DOM access.
   =================================================== */

import {
    INITIAL_CAPITAL, COMPLIANCE_GAME_OVER_HEAT,
    COMPLIANCE_CREDIBILITY_CAP, COMPLIANCE_COOLDOWN_HEAT_COEFF,
    COMPLIANCE_THRESHOLD_CRED_COEFF,
} from './config.js';

export const compliance = {
    heat: 0,
    credibility: 0,
    equityAtLastReview: INITIAL_CAPITAL,
    lastReviewDay: 0,
};

export function resetCompliance() {
    compliance.heat = 0;
    compliance.credibility = 0;
    compliance.equityAtLastReview = INITIAL_CAPITAL;
    compliance.lastReviewDay = 0;
}

export function effectiveHeat() {
    return compliance.heat - compliance.credibility;
}

/**
 * Called when a compliance popup triggers, before presenting choices.
 * Checks whether the player has been profitable since last review.
 * If profitable: resets heat, gains credibility scaled by profit magnitude.
 * Always snapshots current equity for next review.
 */
export function onComplianceTriggered(currentEquity, currentDay) {
    const profitRatio = (currentEquity - compliance.equityAtLastReview) / compliance.equityAtLastReview;
    if (profitRatio > 0) {
        compliance.heat = 0;
        const gain = Math.min(2, Math.max(0, profitRatio * 5));
        compliance.credibility = Math.min(COMPLIANCE_CREDIBILITY_CAP, compliance.credibility + gain);
    }
    compliance.equityAtLastReview = currentEquity;
    compliance.lastReviewDay = currentDay;
}

/**
 * Called after the player makes a compliance choice.
 * @param {'full'|'partial'|'defiant'} tier
 * @param {number} [severity=1] - heat increment for defiance (1 or 2)
 */
export function onComplianceChoice(tier, severity = 1) {
    if (tier === 'full') {
        compliance.heat = Math.max(0, compliance.heat - 1);
    } else if (tier === 'defiant') {
        compliance.heat += severity;
    }
    // 'partial' leaves heat unchanged
}

/**
 * Multiplier for compliance popup cooldowns.
 * High effective heat = shorter cooldowns (they watch more closely).
 * Negative effective heat = longer cooldowns (they leave you alone).
 */
export function cooldownMultiplier() {
    const scaled = effectiveHeat() * COMPLIANCE_COOLDOWN_HEAT_COEFF;
    return 1 - Math.min(0.5, Math.max(-0.5, scaled));
}

/**
 * Multiplier for position-size trigger thresholds.
 * Higher credibility = more lenient thresholds.
 */
export function thresholdMultiplier() {
    return 1 + compliance.credibility * COMPLIANCE_THRESHOLD_CRED_COEFF;
}

/**
 * Returns a tone string based on effective heat, for use in
 * generating context text for compliance popups.
 */
export function complianceTone() {
    const eh = effectiveHeat();
    if (eh < 0) return 'warm';
    if (eh <= 1) return 'professional';
    if (eh <= 3) return 'pointed';
    if (eh <= 4) return 'final_warning';
    return 'terminated';
}
```

- [ ] **Step 3: Verify compliance.js imports resolve**

Run: `cd /Users/a9lim/Work/a9lim.github.io && python -m http.server 8000 &` then open browser console and check for import errors. (User will test.)

- [ ] **Step 4: Commit**

```bash
git add src/compliance.js src/config.js
git commit -m "feat: add compliance heat/credibility state module"
```

---

### Task 2: Add notional helpers and portfolio-relative triggers to popup-events.js

**Files:**
- Modify: `src/popup-events.js:1-70` (imports + helpers)
- Modify: `src/popup-events.js:77-1008` (trigger functions)
- Modify: `src/popup-events.js:1014-1029` (evaluator cooldown scaling)

- [ ] **Step 1: Add imports and notional helper functions**

At the top of `popup-events.js`, add imports for compliance and position-value:

```javascript
import { unitPrice } from './position-value.js';
import {
    compliance, effectiveHeat, onComplianceTriggered,
    cooldownMultiplier, thresholdMultiplier, complianceTone,
} from './compliance.js';
```

Replace the existing helper functions (`_stockQty`, `_bondQty`, `_optionCount`, `_netShortQty`, `_pnthQty`, `_strikeConcentration`) with notional-based versions. Keep `_equity()`, `_liveDay()`, `_anyInvestigationActive()`:

```javascript
function _posPrice(p) {
    return unitPrice(p.type, market.S, Math.sqrt(market.v), market.r, market.day, p.strike, p.expiryDay, market.q);
}

/** Sum of |qty| * price for all positions contributing short directional exposure. */
function _shortDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = _posPrice(p);
        if (p.type === 'stock' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'call' && p.qty < 0) total += Math.abs(p.qty) * price;
        else if (p.type === 'put' && p.qty > 0) total += p.qty * price;
        // short put = long directional, excluded
        // bonds excluded (handled by bond-specific events)
    }
    return total;
}

/** Sum of |qty| * price for all positions contributing long directional exposure. */
function _longDirectionalNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        const price = _posPrice(p);
        if (p.type === 'stock' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'call' && p.qty > 0) total += p.qty * price;
        else if (p.type === 'put' && p.qty < 0) total += Math.abs(p.qty) * price;
        // long put = short directional, excluded
    }
    return total;
}

/** Bond notional = |qty| * unitPrice for all bond positions. */
function _bondNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'bond') total += Math.abs(p.qty) * _posPrice(p);
    }
    return total;
}

/** Sum of |qty| * price for options at a single strike. */
function _strikeNotional(strike) {
    let total = 0;
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike === strike) {
            total += Math.abs(p.qty) * _posPrice(p);
        }
    }
    return total;
}

/** Sum of |qty| * price for all option positions. */
function _totalOptionsNotional() {
    let total = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'call' || p.type === 'put') {
            total += Math.abs(p.qty) * _posPrice(p);
        }
    }
    return total;
}

/** Max strike notional concentration across all strikes. Returns { strike, notional }. */
function _maxStrikeConcentration() {
    const byStrike = {};
    for (const p of portfolio.positions) {
        if ((p.type === 'call' || p.type === 'put') && p.strike != null) {
            byStrike[p.strike] = (byStrike[p.strike] || 0) + Math.abs(p.qty) * _posPrice(p);
        }
    }
    let maxStrike = null, maxNotional = 0;
    for (const k in byStrike) {
        if (byStrike[k] > maxNotional) { maxNotional = byStrike[k]; maxStrike = +k; }
    }
    return { strike: maxStrike, notional: maxNotional };
}

/**
 * Net uncovered upside = sum(stock qty) + sum(call qty).
 * Negative means unlimited upside risk (short stock/calls not covered by longs).
 */
function _netUncoveredUpside() {
    let net = 0;
    for (const p of portfolio.positions) {
        if (p.type === 'stock' || p.type === 'call') net += p.qty;
    }
    return net;
}
```

- [ ] **Step 2: Update trigger functions to use notional-relative thresholds**

Replace each compliance event's `trigger` function. Use `thresholdMultiplier()` for scaling. Here are all the updated triggers:

**desk_compliance_short:**
```javascript
trigger: (sim, world) => {
    const eq = _equity();
    if (eq <= 0) return false;
    return _shortDirectionalNotional() / eq > 0.30 * thresholdMultiplier() && _anyInvestigationActive(world);
},
```

**desk_suspicious_long:**
```javascript
trigger: (sim, world) => {
    const eq = _equity();
    if (eq <= 0) return false;
    return _longDirectionalNotional() / eq > 1.5 * thresholdMultiplier() &&
        (world.geopolitical.tradeWarStage >= 2 || world.geopolitical.recessionDeclared);
},
```

**desk_extreme_leverage** — unchanged (already ratio-based).

**desk_strike_concentration:**
```javascript
trigger: () => {
    const totalOpt = _totalOptionsNotional();
    if (totalOpt <= 0) return false;
    const eq = _equity();
    if (eq <= 0) return false;
    const { notional } = _maxStrikeConcentration();
    return notional / totalOpt > 0.50 && notional / eq > 0.10 * thresholdMultiplier();
},
```

**desk_name_on_tape** — unchanged (already ADV-scaled). Keep existing `_stockQty` helper just for this event (rename to `_absStockQty`):
```javascript
function _absStockQty() {
    return portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + Math.abs(p.qty), 0);
}
```

**desk_bond_fomc:**
```javascript
trigger: (sim, world) => {
    const eq = _equity();
    if (eq <= 0) return false;
    return _bondNotional() / eq > 0.20 * thresholdMultiplier() && !world.fed.hartleyFired;
},
```

**desk_fomc_bond_compliance:**
```javascript
trigger: (sim, world) => {
    const eq = _equity();
    if (eq <= 0) return false;
    return _bondNotional() / eq > 0.10 * thresholdMultiplier() && world.fed.hikeCycle;
},
```

**desk_crisis_profiteer:**
```javascript
trigger: (sim, world) => {
    const eq = _equity();
    if (eq <= 0) return false;
    return (world.geopolitical.mideastEscalation >= 2 || world.geopolitical.oilCrisis) &&
        eq > INITIAL_CAPITAL * 1.1 &&
        _shortDirectionalNotional() / eq > 0.15 * thresholdMultiplier();
},
```

**desk_risk_committee** — unchanged. **desk_md_meeting** — unchanged. Both are equity-ratio triggers already.

- [ ] **Step 3: Add desk_unlimited_risk event**

Add to the `PORTFOLIO_POPUPS` array, in the POSITION-BASED section:

```javascript
{
    id: 'desk_unlimited_risk',
    trigger: (sim) => {
        const nuu = _netUncoveredUpside();
        if (nuu >= 0) return false;
        const eq = _equity();
        if (eq <= 0) return false;
        return Math.abs(nuu) * market.S / eq > 0.10 * thresholdMultiplier();
    },
    cooldown: 120,
    popup: true,
    headline: 'Risk desk flags unlimited upside exposure',
    context: (sim) => {
        const nuu = _netUncoveredUpside();
        const tone = complianceTone();
        const tonePrefix = tone === 'warm'
            ? 'Routine check —'
            : tone === 'pointed'
            ? 'We\'ve talked about this before —'
            : tone === 'final_warning'
            ? 'This is your last warning —'
            : '';
        return `${tonePrefix} You have ${Math.abs(nuu)} units of net uncovered upside exposure — short stock or naked calls without offsetting longs. This is an unlimited-loss position. If the stock gaps up overnight, your losses have no ceiling. The risk desk requires either full closure or a hedge to cap the exposure.`;
    },
    choices: [
        {
            label: 'Close all short exposure',
            desc: 'Close every position contributing to the unlimited risk.',
            trades: [{ action: 'close_short' }],
            complianceTier: 'full',
            playerFlag: 'closed_unlimited_risk',
            resultToast: 'Short exposure closed. Risk desk signs off.',
        },
        {
            label: 'Hedge with stock',
            desc: 'Buy enough shares to fully offset the uncovered upside.',
            trades: [{ action: 'hedge_unlimited_risk' }],
            complianceTier: 'partial',
            playerFlag: 'hedged_unlimited_risk',
            resultToast: 'Hedge placed. Unlimited risk neutralized.',
        },
        {
            label: 'Push back',
            desc: 'The position is sized appropriately for the thesis. You\'ll manage the risk.',
            complianceTier: 'defiant',
            playerFlag: 'defied_unlimited_risk',
            resultToast: 'Risk desk notes your refusal. The file grows thicker.',
        },
    ],
},
```

- [ ] **Step 4: Update evaluator cooldown scaling**

In `evaluatePortfolioPopups` (line 1014-1029), modify the cooldown check to use the compliance multiplier:

```javascript
export function evaluatePortfolioPopups(sim, world, portfolio, day) {
    const triggered = [];
    for (const pp of PORTFOLIO_POPUPS) {
        const adjustedCooldown = pp.cooldown * cooldownMultiplier();
        if (_cooldowns[pp.id] && day - _cooldowns[pp.id] < adjustedCooldown) continue;
        if (pp.era === 'early' && _liveDay(day) > 500) continue;
        if (pp.era === 'mid'   && (_liveDay(day) < 500 || _liveDay(day) > 800)) continue;
        if (pp.era === 'late'  && _liveDay(day) < 800) continue;
        try {
            if (pp.trigger(sim, world, portfolio)) {
                _cooldowns[pp.id] = day;
                triggered.push(pp);
            }
        } catch (e) { /* guard */ }
    }
    return triggered;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/popup-events.js
git commit -m "feat: add notional helpers and portfolio-relative compliance triggers"
```

---

### Task 3: Add trades and compliance tiers to existing compliance popup choices

**Files:**
- Modify: `src/popup-events.js:77-926` (compliance event choices)

- [ ] **Step 1: Add complianceTier and trades to each compliance event**

Update each compliance event's choices with the three-tier pattern and tone-aware context. Each event gets a `complianceTier` on every choice. Choices that imply closing positions get a `trades` array. Context functions should use `complianceTone()` for escalating language.

**desk_compliance_short** (cover shorts during investigation):
```javascript
choices: [
    {
        label: 'Cover short positions',
        desc: 'Close all short directional exposure to appease compliance.',
        trades: [{ action: 'close_short' }],
        complianceTier: 'full',
        playerFlag: 'cooperated_with_compliance',
        resultToast: 'Short exposure closed. Compliance notes your cooperation.',
    },
    {
        label: 'Argue your thesis',
        desc: 'Present your fundamental case. The position is based on public information.',
        complianceTier: 'defiant',
        deltas: { xi: 0.01 },
        playerFlag: 'argued_with_compliance',
        resultToast: 'Compliance is unconvinced but allows the position. They\'re watching.',
    },
    {
        label: 'Ignore the email',
        desc: 'Delete it. You don\'t answer to paper-pushers.',
        complianceTier: 'defiant',
        deltas: { xi: 0.02, theta: 0.005 },
        playerFlag: 'ignored_compliance',
        resultToast: 'Bold move. Compliance escalates to the risk committee.',
    },
],
```

**desk_suspicious_long** (large long during deterioration):
```javascript
choices: [
    {
        label: 'Close long positions',
        desc: 'Close all long directional exposure. Remove the question mark.',
        trades: [{ action: 'close_long' }],
        complianceTier: 'full',
        playerFlag: 'closed_suspicious_long',
        resultToast: 'Long exposure closed. The whispers stop.',
    },
    {
        label: 'Close options only',
        desc: 'Keep the stock but close the leveraged option bets.',
        trades: [{ action: 'close_options' }],
        complianceTier: 'partial',
        playerFlag: 'trimmed_suspicious_long',
        resultToast: 'Options closed. The core position stays.',
    },
    {
        label: 'Stand your ground',
        desc: 'The crowd is wrong. You\'ve done the work.',
        complianceTier: 'defiant',
        playerFlag: 'stood_ground_long',
        resultToast: 'The floor is watching. If you\'re right, you\'re a legend.',
    },
],
```

**desk_extreme_leverage** (leverage ratio > 4x):
```javascript
choices: [
    {
        label: 'Close everything',
        desc: 'Liquidate all positions. Zero leverage. Maximum compliance.',
        trades: [{ action: 'close_all' }],
        complianceTier: 'full',
        playerFlag: 'deleveraged_fully',
        resultToast: 'All positions closed. Risk desk signs off. Good standing preserved.',
    },
    {
        label: 'Close options',
        desc: 'Close the leveraged option positions. Keep stock and bonds.',
        trades: [{ action: 'close_options' }],
        complianceTier: 'partial',
        playerFlag: 'deleveraged_options',
        resultToast: 'Options closed. Leverage reduced.',
    },
    {
        label: 'Push back hard',
        desc: '"I\'m the one making money on this floor." Risky, but maybe they back off.',
        complianceTier: 'defiant',
        deltas: { xi: 0.015 },
        playerFlag: 'pushed_back_risk_desk',
        resultToast: 'The head of risk blinks. But he writes it up. HR has a copy.',
    },
],
```

**desk_strike_concentration** (single-strike concentration):
```javascript
choices: [
    {
        label: 'Close concentrated options',
        desc: 'Close all option positions. Start fresh with diversified strikes.',
        trades: [{ action: 'close_options' }],
        complianceTier: 'full',
        playerFlag: 'closed_concentrated_options',
        resultToast: 'Options closed. The market maker backs off.',
    },
    {
        label: 'Let them complain',
        desc: 'You like this strike. Their job is to make markets.',
        complianceTier: 'defiant',
        deltas: { xi: 0.01 },
        playerFlag: 'ignored_mm_complaint',
        resultToast: 'Spreads widen on your positions. The desk takes note.',
    },
],
```

**desk_name_on_tape** (stock position > ADV):
```javascript
choices: [
    {
        label: 'Close stock positions',
        desc: 'Get your name off the tape. Close all stock exposure.',
        trades: [{ action: 'close_type', type: 'stock' }],
        complianceTier: 'full',
        playerFlag: 'cleared_tape_presence',
        resultToast: 'Stock positions closed. The street forgets your name.',
    },
    {
        label: 'Work the position slowly',
        desc: 'Use TWAP-style execution. Accept worse fills for less market impact.',
        complianceTier: 'partial',
        playerFlag: 'worked_position_slowly',
        resultToast: 'You\'re a known name now. The street adjusts.',
    },
    {
        label: 'Own it',
        desc: 'If they know your name, make them fear it. Add size.',
        complianceTier: 'defiant',
        deltas: { xi: 0.01, theta: 0.003 },
        playerFlag: 'owned_tape_presence',
        resultToast: 'Aggressive. The PB raises your margin requirement.',
    },
],
```

**desk_bond_fomc** (large bond position before FOMC):
```javascript
choices: [
    {
        label: 'Close bond positions',
        desc: 'Close all bonds before the meeting. Not worth the scrutiny.',
        trades: [{ action: 'close_type', type: 'bond' }],
        complianceTier: 'full',
        playerFlag: 'closed_bonds_before_fomc',
        resultToast: 'Bond positions closed. The flag is removed from your file.',
    },
    {
        label: 'File the documentation',
        desc: 'Comply fully with the paperwork. Tedious but keeps your record clean.',
        complianceTier: 'partial',
        playerFlag: 'filed_fomc_docs',
        resultToast: 'Documentation filed. Compliance satisfied.',
    },
],
```

**desk_fomc_bond_compliance** (bonds during hike cycle):
```javascript
choices: [
    {
        label: 'Close the bond book',
        desc: 'Not worth the hassle. Focus on equities and options.',
        trades: [{ action: 'close_type', type: 'bond' }],
        complianceTier: 'full',
        playerFlag: 'closed_bond_book',
        resultToast: 'Bond positions closed. One less thing for compliance to flag.',
    },
    {
        label: 'Accept the requirement',
        desc: 'File the paperwork. It\'s annoying but reasonable.',
        complianceTier: 'partial',
        playerFlag: 'accepted_bond_docs',
        resultToast: 'Documentation filed. Compliance is satisfied. Your paper trail is clean.',
    },
],
```

**desk_risk_committee** (equity < 60% of initial):
```javascript
choices: [
    {
        label: 'Close everything',
        desc: 'Liquidate all positions. Rebuild from cash.',
        trades: [{ action: 'close_all' }],
        complianceTier: 'full',
        playerFlag: 'liquidated_for_committee',
        resultToast: 'All positions closed. The committee notes your cooperation.',
    },
    {
        label: 'Present a recovery plan',
        desc: 'Show them the path back. Reduced risk, tighter stops, disciplined execution.',
        complianceTier: 'partial',
        deltas: { theta: -0.005 },
        playerFlag: 'presented_recovery_plan',
        resultToast: 'The committee gives you 30 days. The clock is ticking.',
    },
    {
        label: 'Blame the market',
        desc: 'It was an unprecedented move. Nobody saw it coming. The model was fine.',
        complianceTier: 'defiant',
        deltas: { xi: 0.02 },
        playerFlag: 'blamed_market',
        resultToast: 'Nobody buys it. Position limits imposed immediately.',
    },
],
```

**desk_md_meeting** (equity < 85% of initial, early era):
```javascript
choices: [
    {
        label: 'Promise to flatten',
        desc: '"I\'ll reduce risk and rebuild from a clean book."',
        trades: [{ action: 'close_all' }],
        complianceTier: 'full',
        deltas: { theta: -0.005, xi: -0.01 },
        playerFlag: 'promised_to_flatten',
        resultToast: 'All positions closed. Your MD looks relieved.',
    },
    {
        label: 'Ask for mentorship',
        desc: '"I could use guidance. Can you pair me with a senior PM?"',
        complianceTier: 'partial',
        deltas: { theta: -0.003 },
        playerFlag: 'asked_for_mentorship',
        resultToast: 'Your MD arranges weekly sessions with the head of macro.',
    },
    {
        label: 'Show conviction',
        desc: '"The positions are right. I need more time and a bit more risk budget."',
        complianceTier: 'defiant',
        playerFlag: 'showed_conviction_early',
        resultToast: 'Your MD nods slowly. "Don\'t make me regret this."',
    },
],
```

**desk_crisis_profiteer** (short and profiting during crisis):
```javascript
choices: [
    {
        label: 'Cover all shorts',
        desc: 'Close all short directional exposure. Take profits and remove the target.',
        trades: [{ action: 'close_short' }],
        complianceTier: 'full',
        playerFlag: 'covered_crisis_short',
        resultToast: 'Short positions closed. The story runs without your firm\'s name.',
    },
    {
        label: 'Hold the position',
        desc: 'You have a fiduciary duty to your investors. The position is legal and well-reasoned.',
        complianceTier: 'defiant',
        deltas: { xi: 0.01 },
        playerFlag: 'held_crisis_short',
        resultToast: 'You hold. The article mentions Meridian in paragraph 14.',
    },
],
```

- [ ] **Step 2: Add tone-aware context to compliance events**

Update each compliance event's `context` function to use `complianceTone()` for escalating language. Example pattern:

```javascript
context: (sim, world) => {
    const tone = complianceTone();
    const prefix = tone === 'warm' ? 'Routine review —'
        : tone === 'pointed' ? 'We need to talk again —'
        : tone === 'final_warning' ? 'This is being escalated to HR —'
        : '';
    // ... rest of context with prefix prepended
},
```

Apply this pattern to all 11 compliance events. Keep the existing descriptive text after the prefix.

- [ ] **Step 3: Commit**

```bash
git add src/popup-events.js
git commit -m "feat: add trades, compliance tiers, and tone scaling to compliance popups"
```

---

### Task 4: Add trade execution and compliance processing to main.js choice handler

**Files:**
- Modify: `main.js:8` (add compliance import)
- Modify: `main.js:52` (add compliance import)
- Modify: `main.js:659-718` (choice handler)
- Modify: `main.js:721-738` (game over — add compliance variant)
- Modify: `main.js:1151-1163` (reset — add resetCompliance)

- [ ] **Step 1: Add imports**

Add to the import block at the top of `main.js`:

```javascript
import {
    compliance, resetCompliance, effectiveHeat,
    onComplianceTriggered, onComplianceChoice,
} from './src/compliance.js';
import { COMPLIANCE_GAME_OVER_HEAT, TIP_REAL_PROBABILITY } from './src/config.js';
import { computePositionPnl } from './src/position-value.js';
import { getEventById } from './src/event-pool.js';
import { pickTip } from './src/popup-events.js';
```

Update the existing `computePositionValue` import to also include `computePositionPnl`:
```javascript
import { computePositionValue, computePositionPnl } from './src/position-value.js';
```

- [ ] **Step 2: Add trade execution logic to choice handler**

In `_processPopupQueue`, after the existing `resultToast` block (line 677) and before the margin call block (line 678), add:

```javascript
        // -- Declarative trade execution --
        if (choice.trades) {
            const vol = market.sigma;
            const snapshot = [...portfolio.positions]; // snapshot before closure
            let closed = 0;
            let pnlSum = 0;
            for (const trade of choice.trades) {
                let targets;
                if (trade.action === 'close_all') {
                    liquidateAll(sim, sim.S, vol, sim.r, sim.day, sim.q);
                    closed = snapshot.length;
                    break;
                } else if (trade.action === 'close_type') {
                    targets = snapshot.filter(p => p.type === trade.type);
                } else if (trade.action === 'close_short') {
                    // Short directional: short stock, short calls, long puts
                    targets = snapshot.filter(p =>
                        (p.type === 'stock' && p.qty < 0) ||
                        (p.type === 'call' && p.qty < 0) ||
                        (p.type === 'put' && p.qty > 0)
                    );
                } else if (trade.action === 'close_long') {
                    // Long directional: long stock, long calls, short puts
                    targets = snapshot.filter(p =>
                        (p.type === 'stock' && p.qty > 0) ||
                        (p.type === 'call' && p.qty > 0) ||
                        (p.type === 'put' && p.qty < 0)
                    );
                } else if (trade.action === 'close_options') {
                    targets = snapshot.filter(p => p.type === 'call' || p.type === 'put');
                } else if (trade.action === 'hedge_unlimited_risk') {
                    // Buy stock to cover net uncovered upside
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
                        closed = 0; // not a closure
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
```

- [ ] **Step 3: Add compliance-triggered equity snapshot**

In `_processPopupQueue`, just before `showPopupEvent` is called (around line 658), add a compliance trigger check:

```javascript
    // Compliance pre-processing: check profitability since last review
    if (event.choices && event.choices.some(c => c.complianceTier)) {
        onComplianceTriggered(_portfolioEquity(), sim.day);
    }
```

- [ ] **Step 4: Add compliance termination game-over**

After the existing `_showGameOver` function, add:

```javascript
function _showComplianceTermination() {
    playing = false;
    updatePlayBtn($, playing);
    playerChoices['compliance_terminated'] = sim.day;
    // Trigger epilogue with compliance termination ending
    _showEpilogueWithReason('compliance');
}
```

This requires modifying `_showEpilogue` to accept an optional `terminationReason` parameter. Refactor the existing function (line 1622):

```javascript
function _showEpilogue(terminationReason = null) {
    const pages = generateEpilogue(eventEngine?.world ?? {}, sim, portfolio,
        eventEngine ? eventEngine.eventLog : [],
        playerChoices, impactHistory, quarterlyReviews, terminationReason);
    // ... rest unchanged
```

Then add a thin wrapper:
```javascript
function _showEpilogueWithReason(reason) { _showEpilogue(reason); }
```

The existing call site (the normal term-end trigger) continues calling `_showEpilogue()` with no argument.

- [ ] **Step 5: Add resetCompliance to _resetCore**

In `_resetCore` (line 1151), after `resetPopupCooldowns()` (line 1159), add:

```javascript
    resetCompliance();
```

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: wire trade execution and compliance processing into choice handler"
```

---

### Task 5: Demote ~55 event-pool.js popups to regular events

**Files:**
- Modify: `src/event-pool.js` (remove `popup`, `choices`, `context`, `era` from ~55 events)

- [ ] **Step 1: Remove popup fields from all popup events in event-pool.js**

For each of the ~55 events that have `popup: true` in `event-pool.js`, remove the following fields:
- `popup: true`
- `choices: [...]` (entire array)
- `context: ...` (function or string)
- `era: '...'` (if present)

Keep: `id`, `category`, `likelihood`, `headline`, `magnitude`, `when`, `params` (or inline `deltas` on the first choice — see step 2), `effects`, `followups`, `portfolioFlavor`.

- [ ] **Step 2: Migrate choice deltas to event params**

Many popup events have no top-level `params` — only `deltas` on choices. For these, pick the "middle" choice's deltas and add them as top-level `params`. For events that already have `params`, keep those (the popup choices had variant deltas which are now lost — acceptable since the player trades manually).

Events that need `params` extracted from choices (currently have no top-level `params`):
- `fed_signals_hike`: use middle choice deltas `{ mu: -0.015, theta: 0.005, sigmaR: 0.001 }`
- `fed_50bps_emergency_cut`: use middle choice `{ mu: 0.03, theta: 0.02, b: -0.015, sigmaR: 0.006, lambda: 1.5 }`
- `fed_qe_restart`: use middle choice `{ mu: 0.05, theta: -0.015, b: -0.01, sigmaR: -0.003, lambda: -0.5, q: 0.002 }`
- `barron_threatens_fire_hartley`: use middle choice `{ mu: -0.03, theta: 0.02, sigmaR: 0.008, lambda: 1.0 }`
- `barron_fires_hartley`: use middle choice `{ mu: -0.05, theta: 0.05, sigmaR: 0.025, lambda: 3.5 }`
- For all other popup-only events: similarly extract the moderate/middle choice deltas.

Events that already have top-level `params` — keep those, just remove popup fields.

**Important:** Some events have `effects` on choices (structured effects). These should be preserved. If only one choice had effects that represent the canonical outcome, move those effects to a top-level `effects` property (function form). If effects varied by choice, use the most narratively likely one.

**Important:** Some events have `followups` on choices. These should be moved to a top-level `followups` array. If followups varied by choice, use the most likely path's followups.

- [ ] **Step 3: Verify no broken references**

Search for any code that references removed choice `playerFlag` values from event-pool.js popups. These flags were consumed by epilogue.js — check if any of the removed flags are referenced there or in popup-events.js trigger conditions.

Run: `grep -r "front_ran_hike_signal\|rode_emergency_cut\|leveraged_into_qe\|bet_barron_fires\|called_barron_bluff\|flattened_on_hartley\|bought_hartley_firing" src/`

If any are referenced in epilogue.js or popup trigger conditions, those references need to be removed or adapted.

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js
git commit -m "refactor: demote ~55 event-pool popups to regular toast events"
```

---

### Task 6: Rework insider tip events with randomized tip pool

**Files:**
- Modify: `src/popup-events.js` (rework `desk_insider_tip`, `desk_analyst_info_edge`, `desk_pnth_earnings`)
- Modify: `src/event-pool.js` (add 12 tip outcome events)
- Modify: `main.js` (add tip scheduling logic to choice handler)

- [ ] **Step 1: Add INSIDER_TIPS pool to popup-events.js**

At the top of the file, after the helper functions:

```javascript
const INSIDER_TIPS = [
    {
        hint: 'PNTH is going to raise the dividend at the next earnings call',
        realEvent: 'tip_dividend_hike',
        fakeEvent: 'tip_dividend_flat',
    },
    {
        hint: 'the Fed is going to pause despite the hawkish rhetoric',
        realEvent: 'tip_fed_pause',
        fakeEvent: 'tip_fed_hike',
    },
    {
        hint: 'a major defense contract announcement is coming within two weeks',
        realEvent: 'tip_contract_win',
        fakeEvent: 'tip_contract_loss',
    },
    {
        hint: 'a big short position is about to unwind — something about a margin call',
        realEvent: 'tip_short_squeeze',
        fakeEvent: 'tip_squeeze_fizzle',
    },
    {
        hint: 'earnings are going to blow out expectations by double digits',
        realEvent: 'tip_earnings_beat',
        fakeEvent: 'tip_earnings_miss',
    },
    {
        hint: 'there\'s an acquisition offer coming — a foreign buyer',
        realEvent: 'tip_acquisition_bid',
        fakeEvent: 'tip_acquisition_denied',
    },
];

/** Pick a random tip not recently used. */
const _usedTips = new Set();
export function pickTip() {
    const available = INSIDER_TIPS.filter(t => !_usedTips.has(t.hint));
    const pool = available.length > 0 ? available : INSIDER_TIPS;
    const tip = pool[Math.floor(Math.random() * pool.length)];
    _usedTips.add(tip.hint);
    return tip;
}
```

Export `_usedTips` clear in `resetPopupCooldowns`:
```javascript
export function resetPopupCooldowns() {
    for (const k in _cooldowns) delete _cooldowns[k];
    _usedTips.clear();
}
```

- [ ] **Step 2: Rework desk_insider_tip**

Replace the existing event definition:

```javascript
{
    id: 'desk_insider_tip',
    trigger: (sim, world) => {
        return _anyInvestigationActive(world) && portfolio.positions.length >= 3;
    },
    cooldown: 400,
    era: 'mid',
    popup: true,
    headline: 'An old contact reaches out',
    context: () => {
        return 'Your phone buzzes at 9pm. A college friend who works in government sends a vague text: "Hey — can we talk? I\'ve come across something that might interest you. Can\'t say more here." You haven\'t spoken in months. This is either nothing, or it\'s the kind of call that changes everything.';
    },
    choices: [
        {
            label: 'Don\'t respond',
            desc: 'Whatever this is, you don\'t want any part of it.',
            playerFlag: 'declined_insider_tip',
            resultToast: 'You leave the text on read. Smart.',
        },
        {
            label: 'Call back',
            desc: 'Curiosity wins. You step outside and dial.',
            playerFlag: 'pursued_insider_tip',
            _tipAction: true,
        },
    ],
},
```

- [ ] **Step 3: Rework desk_analyst_info_edge**

Replace the existing event definition:

```javascript
{
    id: 'desk_analyst_info_edge',
    trigger: (sim) => {
        const daysToEarnings = QUARTERLY_CYCLE - (sim.day % QUARTERLY_CYCLE);
        const eq = _equity();
        if (eq <= 0) return false;
        const optNotional = _totalOptionsNotional();
        return daysToEarnings <= 15 && daysToEarnings >= 5 && optNotional / eq >= 0.15;
    },
    cooldown: 200,
    popup: true,
    headline: 'A sellside analyst wants to meet for coffee',
    context: () => {
        return 'A well-known analyst sends a cryptic message: "I have some data you\'ll want to see before the print. Not on Bloomberg, not in any filing. Coffee tomorrow? Just us." The invitation is casual. The implication is not.';
    },
    choices: [
        {
            label: 'Politely decline',
            desc: 'The line between mosaic theory and material non-public information is thin.',
            playerFlag: 'passed_channel_check',
            resultToast: 'You rely on your own analysis. The analyst sounds annoyed.',
        },
        {
            label: 'Take the meeting',
            desc: 'Information is the currency of this business. Hear what he has.',
            playerFlag: 'pursued_analyst_tip',
            _tipAction: true,
        },
    ],
},
```

- [ ] **Step 4: Rework desk_pnth_earnings (analyst whisper numbers)**

Replace the existing event definition:

```javascript
{
    id: 'desk_pnth_earnings',
    trigger: (sim) => {
        const eq = _equity();
        if (eq <= 0) return false;
        const pnthNotional = portfolio.positions.filter(p => p.type === 'stock')
            .reduce((s, p) => s + Math.abs(p.qty) * _posPrice(p), 0);
        const daysToEarnings = QUARTERLY_CYCLE - (sim.day % QUARTERLY_CYCLE);
        return pnthNotional / eq > 0.15 * thresholdMultiplier() && daysToEarnings <= 10;
    },
    cooldown: 150,
    popup: true,
    headline: 'Sellside salesman mentions "interesting flow" in PNTH options',
    context: () => {
        return 'A salesman from a bulge bracket calls your line. "Listen, I can\'t say much, but there\'s been some unusual activity in the PNTH options chain. Smart money is positioning ahead of the print. I think you\'d want to know." He trails off, waiting for you to bite.';
    },
    choices: [
        {
            label: 'Hang up',
            desc: 'You don\'t trade on tips from salesmen.',
            playerFlag: 'declined_analyst_color',
            resultToast: 'You stay clean. The salesman moves on.',
        },
        {
            label: 'Ask what he\'s hearing',
            desc: 'The curiosity is killing you.',
            playerFlag: 'pursued_pnth_tip',
            _tipAction: true,
        },
    ],
},
```

- [ ] **Step 5: Add tip scheduling logic to main.js choice handler**

In the choice handler in `_processPopupQueue`, after the compliance tier processing block, add:

```javascript
        // -- Insider tip scheduling --
        if (choice._tipAction && eventEngine) {
            const tip = pickTip();
            const isReal = Math.random() < TIP_REAL_PROBABILITY;
            const eventId = isReal ? tip.realEvent : tip.fakeEvent;
            showToast(`"Word is ${tip.hint}."`, 6000);
            // scheduleFollowup expects { id, mtth } — it handles jitter internally
            eventEngine.scheduleFollowup({ id: eventId, mtth: 14 }, sim.day);
            if (isReal) {
                // Acting on insider info carries investigation risk
                compliance.heat += 1;
            }
        }
```

The needed imports (`TIP_REAL_PROBABILITY`, `getEventById`, `pickTip`, `computePositionPnl`) were already added in Step 1 of this task. Update the existing popup-events import:

```javascript
import { evaluatePortfolioPopups, resetPopupCooldowns, pickTip } from './src/popup-events.js';
```

- [ ] **Step 6: Add 12 tip outcome events to event-pool.js**

Add to the end of the `OFFLINE_EVENTS` array in `event-pool.js`:

```javascript
// -- Insider tip outcome events (real) --
{
    id: 'tip_dividend_hike',
    category: 'pnth_earnings',
    likelihood: 0,  // never drawn randomly, only via followup
    headline: 'PNTH announces surprise dividend hike — payout doubles',
    params: { mu: 0.03, theta: -0.01 },
    magnitude: 'moderate',
},
{
    id: 'tip_fed_pause',
    category: 'fed',
    likelihood: 0,
    headline: 'Fed holds steady in surprise decision — doves prevail',
    params: { mu: 0.02, theta: -0.005, b: -0.005, sigmaR: -0.002 },
    magnitude: 'moderate',
},
{
    id: 'tip_contract_win',
    category: 'sector',
    likelihood: 0,
    headline: 'PNTH wins $2.8B defense contract — shares surge',
    params: { mu: 0.04, theta: -0.015 },
    magnitude: 'moderate',
},
{
    id: 'tip_short_squeeze',
    category: 'market',
    likelihood: 0,
    headline: 'Short squeeze erupts — forced covering drives 8% rally in hours',
    params: { mu: 0.05, theta: 0.02, lambda: 1.5 },
    magnitude: 'major',
},
{
    id: 'tip_earnings_beat',
    category: 'pnth_earnings',
    likelihood: 0,
    headline: 'PNTH crushes earnings — revenue up 25%, guidance raised',
    params: { mu: 0.04, theta: -0.01, q: 0.002 },
    magnitude: 'moderate',
},
{
    id: 'tip_acquisition_bid',
    category: 'sector',
    likelihood: 0,
    headline: 'Foreign consortium launches $55B bid for PNTH — 30% premium',
    params: { mu: 0.06, theta: -0.02, xi: 0.03 },
    magnitude: 'major',
},

// -- Insider tip outcome events (fake — "despite rumors") --
{
    id: 'tip_dividend_flat',
    category: 'pnth_earnings',
    likelihood: 0,
    headline: 'PNTH maintains dividend despite rumors of increase — board prioritizes buybacks',
    params: { mu: -0.01, theta: 0.005 },
    magnitude: 'minor',
},
{
    id: 'tip_fed_hike',
    category: 'fed',
    likelihood: 0,
    headline: 'Despite rumors of a pause, Fed hikes 25bps — Hartley cites persistent inflation',
    params: { mu: -0.02, theta: 0.01, b: 0.005, sigmaR: 0.003 },
    magnitude: 'moderate',
},
{
    id: 'tip_contract_loss',
    category: 'sector',
    likelihood: 0,
    headline: 'PNTH loses defense bid to rival despite rumors of a win — shares slide',
    params: { mu: -0.03, theta: 0.01 },
    magnitude: 'moderate',
},
{
    id: 'tip_squeeze_fizzle',
    category: 'market',
    likelihood: 0,
    headline: 'Rumored short squeeze fizzles — shorts hold firm, longs trapped',
    params: { mu: -0.02, theta: 0.015 },
    magnitude: 'minor',
},
{
    id: 'tip_earnings_miss',
    category: 'pnth_earnings',
    likelihood: 0,
    headline: 'Despite whisper-number optimism, PNTH misses estimates — guidance lowered',
    params: { mu: -0.03, theta: 0.015, q: -0.001 },
    magnitude: 'moderate',
},
{
    id: 'tip_acquisition_denied',
    category: 'sector',
    likelihood: 0,
    headline: 'PNTH denies acquisition rumors — "not in discussions with any party"',
    params: { mu: -0.02, theta: 0.01, xi: -0.01 },
    magnitude: 'minor',
},
```

- [ ] **Step 7: Commit**

```bash
git add src/popup-events.js src/event-pool.js main.js
git commit -m "feat: rework insider tips with randomized pool and 70/30 real/fake outcomes"
```

---

### Task 7: Update epilogue for compliance termination

**Files:**
- Modify: `src/epilogue.js:554` (add terminationReason parameter)

- [ ] **Step 1: Add compliance termination support to generateEpilogue**

The epilogue signature gains an optional `terminationReason` parameter. If `'compliance'`, page 4 (career arc) reflects the player being fired for compliance defiance rather than the normal end-of-term wind-down.

At line 554, change:
```javascript
export function generateEpilogue(world, sim, portfolio, eventLog, playerChoices = {}, impactHistory = [], quarterlyReviews = []) {
```
to:
```javascript
export function generateEpilogue(world, sim, portfolio, eventLog, playerChoices = {}, impactHistory = [], quarterlyReviews = [], terminationReason = null) {
```

In the page 4 career arc section, add a branch for compliance termination. Find the reputation synthesis section and add before it:

```javascript
if (terminationReason === 'compliance') {
    html += _h3('Terminated for Cause');
    html += _p('Your tenure at Meridian Capital ended not with a market catastrophe, but with a compliance file thick enough to serve as a doorstop. Repeated defiance of risk limits and regulatory directives left the firm no choice. The official termination letter cited "persistent non-compliance with internal risk management policies." The unofficial version was simpler: you didn\'t know when to listen.');
}
```

- [ ] **Step 2: Commit**

The main.js `_showComplianceTermination` function (already added in Task 4 Step 4) calls `_showEpilogue('compliance')`, which passes the reason through to `generateEpilogue`. The `_showEpilogue` refactor (also in Task 4 Step 4) already accepts the optional `terminationReason` parameter. No additional main.js changes needed here.

```bash
git add src/epilogue.js
git commit -m "feat: add compliance termination ending to epilogue"
```

---

### Task 8: Final integration and cleanup

**Files:**
- Modify: `main.js` (verify all imports, ensure reset flow is complete)
- Modify: `src/popup-events.js` (verify no broken references)
- Modify: `CLAUDE.md` (update file map line counts and module description)

- [ ] **Step 1: Verify imports are complete**

Ensure main.js has all needed imports:
- `compliance.js`: `compliance`, `resetCompliance`, `effectiveHeat`, `onComplianceTriggered`, `onComplianceChoice`
- `config.js`: `COMPLIANCE_GAME_OVER_HEAT`, `TIP_REAL_PROBABILITY`
- `event-pool.js`: `getEventById`
- `popup-events.js`: `pickTip`

- [ ] **Step 2: Verify reset flow**

In `_resetCore`, confirm this order:
1. `resetPopupCooldowns()` (clears cooldowns AND `_usedTips` set)
2. `resetCompliance()` (resets heat, credibility, equity snapshot)
3. Everything else (existing reset logic)

Verify the chain: `_resetCore()` → `resetPopupCooldowns()` → `_usedTips.clear()` works end-to-end.

- [ ] **Step 3: Search for broken references to removed playerFlags**

```bash
grep -rn "front_ran_hike\|rode_emergency_cut\|leveraged_into_qe\|bet_barron_fires\|called_barron_bluff\|flattened_on_hartley\|bought_hartley_firing\|faded_emergency_cut\|faded_hike_signal\|held_through_hike" src/epilogue.js src/popup-events.js
```

Remove or update any references found.

- [ ] **Step 4: Update CLAUDE.md**

Update the file map to include `compliance.js` with line count. Update the module dependencies section to show `compliance.js` as a dependency of `popup-events.js` and `main.js`. Update the event system documentation to reference the compliance heat system.

- [ ] **Step 5: Commit**

```bash
git add main.js src/popup-events.js CLAUDE.md
git commit -m "chore: final integration, cleanup broken refs, update docs"
```
