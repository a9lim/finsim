# Popup Event Refactor — Design Spec

**Date:** 2026-03-22
**Scope:** Reclassify popup events into three categories (market info, compliance, insider tips), add compliance heat system, execute real trades from compliance choices, rework insider tips with randomized predictions.

## Problem

Every popup choice across both `event-pool.js` and `popup-events.js` only applies parameter deltas and world-state effects. Choices that say "cover your shorts" or "go flat" do not touch the player's portfolio. Market-info events pause the sim for positioning advice the player could act on themselves. Insider-tip events reveal too much information upfront.

## Design

### 1. Event Reclassification

**Market info (demote to toast):** All ~55 `event-pool.js` popup events. Every one has choices that are market positioning advice. Remove `popup`, `choices`, `context`, `era`. Keep `params`, `effects`, `followups`, `portfolioFlavor`, `when`, `magnitude`. Fire as normal events with toast headlines. Player trades manually.

**Compliance (keep popup, add trades):** 10 `popup-events.js` events where a supervisor or compliance officer directs the player. Choices execute real trades and interact with the compliance heat system.

Compliance events:
- `desk_compliance_short`
- `desk_suspicious_long`
- `desk_extreme_leverage`
- `desk_strike_concentration`
- `desk_name_on_tape`
- `desk_bond_fomc`
- `desk_fomc_bond_compliance`
- `desk_risk_committee`
- `desk_md_meeting`
- `desk_crisis_profiteer`
- `desk_unlimited_risk` (new — fires when net uncovered upside exposure is negative)

**Atmosphere (keep popup, no trades):** 12 `popup-events.js` events that are narrative/reputation moments without trade implications. Keep as-is.

Atmosphere events:
- `desk_ft_interview`
- `desk_headhunter`
- `desk_comeback_kid`
- `desk_first_milestone`
- `desk_media_big_win`
- `desk_unusual_activity`
- `desk_profiting_from_misery`
- `desk_campaign_donor`
- `desk_political_donation`
- `desk_short_in_rally` (market positioning, no supervisor)
- `desk_midterm_pressure` (election positioning, no supervisor)
- `desk_legacy_positioning` (end-of-term positioning, no supervisor)

**Insider tips (rework):** 3 `popup-events.js` events reworked with vague descriptions, randomized tips, and real/fake followup outcomes.

Insider events:
- `desk_insider_tip`
- `desk_analyst_info_edge`
- `desk_pnth_earnings` (analyst offering whisper numbers)

### 2. Compliance State Module (`src/compliance.js`)

New leaf module tracking regulatory pressure on the player.

**State:**
```
heat: 0                              // defiance accumulator
credibility: 0                       // "was right" counter (capped at 5)
equityAtLastReview: INITIAL_CAPITAL  // snapshot for profit check
lastReviewDay: 0                     // day of last compliance event
```

**Effective heat:** `heat - credibility` (can go negative)

**On compliance popup trigger (before presenting choices):**
Compare current equity to `equityAtLastReview`:
- If profitable: `profitRatio = (equity - equityAtLastReview) / equityAtLastReview`. Reset `heat = 0`, `credibility += clamp(profitRatio * 5, 0, 2)` (credibility capped at 5 total). Snapshot new equity.
- If not profitable: heat stays, tone escalates. Snapshot new equity.

**Choice effects on heat:**
- Full compliance (e.g. `close_all`): `heat -= 1` (clamped to 0)
- Partial compliance (e.g. `close_type`): heat unchanged
- Defiance (no trades): `heat += 1-2` depending on severity

**Tone thresholds (effective heat):**
- < 0: warm ("keep up the good work, but we do need to check the box")
- 0-1: professional, matter-of-fact
- 2-3: pointed ("we've discussed this before")
- 4: final warning, HR involved
- >= 5: game over — terminated for cause (triggers epilogue with "fired" ending)

**Cooldown scaling:** `baseCooldown * (1 - clamp(effectiveHeat * 0.1, -0.5, 0.5))`
- Negative effective heat: longer cooldowns (they leave you alone)
- High effective heat: shorter cooldowns (they're watching closely)

**Threshold scaling:** Position thresholds multiplied by `(1 + credibility * 0.15)`.

**Reset:** `resetCompliance()` called in `_resetCore()`.

**Exports:** `compliance` (state object), `resetCompliance()`, `effectiveHeat()`, `onComplianceTriggered(equity)`, `onComplianceChoice(tier)`, `cooldownMultiplier()`, `thresholdMultiplier()`.

### 3. Declarative Trades on Choices

New `trades` field on choice objects — array of trade actions:

```javascript
trades: [
  { action: 'close_all' },
  { action: 'close_type', type: 'bond' },     // close all bonds
  { action: 'close_type', type: 'stock' },     // close all stock
  { action: 'close_type', type: 'call' },      // close all calls
  { action: 'close_type', type: 'put' },       // close all puts
  { action: 'close_short' },                   // close all short directional exposure
  { action: 'close_long' },                    // close all long directional exposure
  { action: 'close_options' },                 // close all calls + puts
  { action: 'hedge_unlimited_risk' },          // buy stock to cover net uncovered upside
]
```

No fractional closes — always full position closure for the matched set.

`close_short` and `close_long` operate on **directional exposure**, not raw `qty` sign:
- `close_short`: closes short stock, short calls, long puts
- `close_long`: closes long stock, long calls, short puts

`hedge_unlimited_risk` computes `netUncoveredUpside = sum(all stock qty) + sum(all call qty)`. If negative, executes `executeMarketOrder(sim, 'stock', 'long', Math.abs(netUncoveredUpside), ...)` to buy enough shares to bring the metric to zero. Stock is used (not calls) because compliance requires a full delta-1 hedge with no Greek drift.

**Processing** in main.js choice handler, after deltas/effects:
1. Snapshot `portfolio.positions` into a separate array (positions are removed by index during closure)
2. Filter snapshot matching the trade spec
3. For each matched position, call `closePosition(sim, p.id, sim.S, market.sigma, sim.r, sim.day, sim.q)` — same signature pattern as existing margin handler (main.js line 694)
4. Show summary toast: "Closed X positions. Realized P&L: +$Y.Yk"
5. Set `chainDirty = true` and call `updateUI()`

**Three-tier choice pattern for compliance events:**
1. Full compliance: `trades: [{ action: 'close_all' }]`, `complianceTier: 'full'`
2. Partial compliance: `trades: [{ action: 'close_type', type: 'X' }]`, `complianceTier: 'partial'`
3. Defiance: no `trades`, `complianceTier: 'defiant'`

The `complianceTier` field tells the compliance module what heat adjustment to apply.

### 4. Portfolio-Relative Trigger Thresholds

Replace absolute position counts with equity-relative ratios using notional exposure (not delta, since compliance flags the size of the position regardless of Greeks):

| Event | Current Trigger | New Trigger |
|-------|----------------|-------------|
| `desk_compliance_short` | net delta < -30 | shortNotional / equity > 0.30 AND investigation active |
| `desk_suspicious_long` | net delta > 40 | longNotional / equity > 1.5 AND macro deteriorating |
| `desk_bond_fomc` | bond count >= 20 | bondNotional / equity > 0.20 |
| `desk_fomc_bond_compliance` | bond count >= 10 | bondNotional / equity > 0.10 |
| `desk_strike_concentration` | count >= 15 | strikeNotional / totalOptionsNotional > 0.50 AND strikeNotional / equity > 0.10 |
| `desk_crisis_profiteer` | net delta < -5 | shortNotional / equity > 0.15 AND equity > 1.1x initial AND crisis |
| `desk_unlimited_risk` | (new) | netUncoveredUpside < 0 AND |netUncoveredUpside| * S / equity > 0.10 |
| `desk_extreme_leverage` | gross/equity > 4x | unchanged (already ratio-based) |
| `desk_name_on_tape` | stock > ADV% | unchanged (correctly market-scaled) |
| `desk_risk_committee` | equity < 60% initial | unchanged (already ratio-based) |

Notional helpers needed in `popup-events.js` — computed as **directional notional** (accounts for the fact that a long put is short exposure on the underlying, a short put is long exposure, etc.):

```
_shortDirectionalNotional():
  short stock:  |qty| * unitPrice
  short call:   |qty| * unitPrice
  long put:      qty  * unitPrice

_longDirectionalNotional():
  long stock:    qty  * unitPrice
  long call:     qty  * unitPrice
  short put:    |qty| * unitPrice
```

Bonds excluded from directional notional (handled by bond-specific events separately).

- `_strikeNotional(strike)`: sum of `|qty| * unitPrice` for options at a given strike
- `_totalOptionsNotional()`: sum of `|qty| * unitPrice` for all options
- All use `unitPrice()` from `position-value.js` for accurate option valuation via vol surface

All thresholds further scaled by `thresholdMultiplier()` from compliance module.
All cooldowns further scaled by `cooldownMultiplier()` from compliance module.

### 5. Insider Tip Rework

**Tip pool** (6 randomized tips):
```javascript
const INSIDER_TIPS = [
  { hint: 'PNTH will raise their dividend at the earnings call',
    realEvent: 'tip_dividend_hike', fakeEvent: 'tip_dividend_flat' },
  { hint: 'The Fed is going to pause despite the hawkish rhetoric',
    realEvent: 'tip_fed_pause', fakeEvent: 'tip_fed_hike' },
  { hint: 'There\'s a major defense contract announcement coming',
    realEvent: 'tip_contract_win', fakeEvent: 'tip_contract_loss' },
  { hint: 'A big short position is about to unwind',
    realEvent: 'tip_short_squeeze', fakeEvent: 'tip_squeeze_fizzle' },
  { hint: 'Earnings are going to blow out expectations',
    realEvent: 'tip_earnings_beat', fakeEvent: 'tip_earnings_miss' },
  { hint: 'An acquisition offer is imminent',
    realEvent: 'tip_acquisition_bid', fakeEvent: 'tip_acquisition_denied' },
]
```

**Flow:**
1. Popup fires with vague description: "An old friend calls. 'I've heard something you should know about.'"
2. Choices:
   - Decline: nothing happens, clean record
   - Ask for more: random tip selected, 70/30 real/fake rolled at choice time, toast reveals prediction, followup event scheduled ~14 days out via `scheduleFollowup({ event, chainId, targetDay, weight, depth })` format
3. If real (70%): predicted event fires as a normal toast event with appropriate params. The tip outcome event applies `effects: [{ path: 'compliance.heat', op: 'add', value: 1 }]` via a new structured-effects path for compliance heat (investigation risk from acting on insider info).
4. If fake (30%): opposite event fires with "despite rumors to the contrary..." in the headline. Player who positioned for the tip gets burned.

**Tip outcome events** added to event-pool.js — 12 new events (6 real + 6 fake variants). Each has appropriate `params` and `magnitude`. Real variants include compliance heat effect. Fake variants have opposite params.

**All three insider popup events** (`desk_insider_tip`, `desk_analyst_info_edge`, `desk_pnth_earnings`) use the same tip pool but with different framing (friend / analyst / sellside contact).

### 6. Files Touched

| File | Change | Scope |
|------|--------|-------|
| `src/compliance.js` | **New** | Leaf module: state, heat/credibility logic, scaling functions |
| `src/event-pool.js` | **Heavy** | Remove popup/choices/context/era from ~55 events. Add 12 tip outcome events. |
| `src/popup-events.js` | **Heavy** | Add `trades` + `complianceTier` to compliance choices. Rework triggers to equity-relative. Rework insider events with tip pool. Import compliance module. |
| `main.js` | **Medium** | Choice handler: execute trades (snapshot positions, close loop, summary toast), call compliance, schedule tips. New game-over path for compliance termination (triggers epilogue). Import compliance module. |
| `src/config.js` | **Light** | Compliance constants (heat thresholds, credibility cap, cooldown/threshold multiplier coefficients, tip probability) |
| `src/epilogue.js` | **Light** | Add "fired for cause" ending variant alongside existing rogue trading ending |

### 7. Compliance Game-Over

When `effectiveHeat() >= 5`, triggered at end of compliance choice processing:
- Triggers epilogue with a "fired for cause" ending (distinct from rogue trading arrest)
- Epilogue's reputation synthesis produces a "Reckless" or similar archetype
- Context references the player's history of defiance against compliance
- Uses `generateEpilogue()` with a flag indicating termination reason, then shows epilogue overlay
