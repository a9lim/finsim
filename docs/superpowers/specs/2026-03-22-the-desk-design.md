# The Desk: Institutional Identity, Price Impact, & Interactive Narrative

**Date:** 2026-03-22
**Status:** Approved (brainstorm)
**Scope:** Shoals (finsim) — cohesive feature adding player agency, market feedback, and narrative integration

## Design Philosophy

The player is a senior derivatives trader at a major bank. The world creates events that affect the market and demand choices; the player's trades and choices affect the world, which creates new events. The player is thrown around by the world, but has small, impactful opportunities to shape it. The game notices the player's positions indirectly — through market effects, not by naming the player. Stakes escalate over the presidential term.

Inspirations: CK2 (emergent narrative from interconnected systems), Disco Elysium (the world as mirror — understanding it IS the reward), Red Autumn (political systems creating escalating mechanical pressure).

## System Overview

Five interconnected systems, designed as one cohesive feature:

```
World events ──→ Popup choices ──→ World state changes ──→ New events
     ↓                ↓                    ↑
Market params    Player trades ──→ Price impact ──→ Parameter shifts
     ↓                                    ↑
Player P&L  ──────────────────────────────┘
```

---

## 1. Institutional Reframing

### Player Identity

The player is a senior derivatives trader at **Meridian Capital**, a major investment bank. Wide latitude, no micromanagement.

- **Starting capital:** $10,000k (displayed) = $10,000 internally
- **Scaling:** Display-only. All internal values (cash, quantities, prices, margin) remain identical. The UI appends "k" to all displayed dollar amounts and share quantities. So the player sees "$10,000k" starting capital, trades "1k-100k shares," and P&L shows "$500k" — but under the hood it's $10,000, 1-100 shares, and $500. Pricing engine, margin math, and all sim parameters are completely untouched. Only `format-helpers.js` display functions change.

### Quarterly Performance Reviews (Flavor Only)

Uses the same `(day % QUARTERLY_CYCLE === 0)` check as dividends — fires on the same days. First review at the first multiple of 63 after live trading begins. Shown as a dismissible toast/popup comparing P&L vs buy-and-hold benchmark. No mechanical consequence.

Tone varies by performance:
- **Strong outperformance:** "Meridian's risk committee notes exceptional returns."
- **Mild outperformance:** "Solid quarter. Book within risk parameters."
- **Underperformance:** "Returns lag benchmark. Risk committee requests position summary."
- **Deep underperformance:** "Managing Director Liu wants a meeting about your book."

If the player has been flagged by portfolio-triggered popups (e.g., SEC inquiry), the review may reference it.

Data stored as `quarterlyReviews` array: `{ day, pnl, vsBenchmark, rating }` — consumed by the epilogue.

### Rogue Trading Game-Over

Replaces the current fraud screen. Two triggers, checked in this order at end-of-day:

1. **50% equity loss (checked first):** If portfolio equity drops below 50% of starting capital ($5,000,000), the game pauses with a rogue trading arrest screen. The bank discovers the losses and pulls the plug. This fires *before* the existing margin check — it's a harder floor. Players holding only long cash positions (no margin) can still trigger this.
2. **Negative equity after margin liquidation (checked second):** If margin-call forced liquidation still leaves negative equity (existing trigger), same arrest screen.

The rogue trading screen replaces the current fraud screen with updated narrative: unauthorized positions, hidden losses, bank investigators, regulators. Epilogue references the scandal.

### Intro Screen Update

Reframes the premise: joining Meridian Capital's trading desk during the Barron administration. Volatile political landscape. Mandate: generate returns. Risk: everything.

---

## 2. Price Impact System

Three layers building on each other.

### Layer 1: Realistic Slippage

Two impact models — one for stock/bond, one for options — both applied immediately at execution time. Built on the Almgren-Chriss framework (permanent + temporary components).

#### Stock/Bond Impact

```
ADV = 500 shares (configurable in config.js — displayed as "500k" to player)

permanent_impact = PERM_COEFF * sigma * sqrt(abs(qty) / ADV) * sign(qty)
temporary_impact = TEMP_COEFF * sigma * (abs(qty) / ADV) * sign(qty)
```

- `sigma`: current Heston vol (for stock) or `sigmaR` (for bonds)
- `PERM_COEFF`: permanent impact coefficient (~0.1), information component
- `TEMP_COEFF`: temporary impact coefficient (~0.05), liquidity component
- **Permanent impact** (square-root): represents information content of the trade. Shifts `sim.S` immediately and permanently. Recovers gradually via mean-reverting drift (half-life ~3 days).
- **Temporary impact** (linear): represents liquidity cost. Worsens the fill price but does NOT shift `sim.S`. The player pays `fillPrice = S + permanent + temporary` (buy) or `S - permanent - temporary` (sell).
- Both components are **on top of** the existing bid/ask spread from `computeBidAsk()`. The spread models the resting order book width; slippage models the cost of walking through it.

#### Options Impact

Options are much less liquid than stock. Impact scales with **order size relative to modeled open interest**, not ADV, and is heavily moneyness-dependent.

```
// Modeled open interest per strike (not a real OI tracker — synthetic based on moneyness/DTE)
baseOI = OI_ATM_BASE * exp(-OI_MONEYNESS_DECAY * moneyness^2) * sqrt(DTE / 63)

permanent_impact = OPT_PERM_COEFF * sigma * sqrt(abs(qty) / baseOI) * sign(qty)
temporary_impact = OPT_TEMP_COEFF * sigma * (abs(qty) / baseOI) * sign(qty)
```

- `moneyness`: `abs(ln(S / strike))` — same formula used in existing `computeOptionBidAsk()`
- `OI_ATM_BASE`: baseline open interest at ATM (~50 contracts, displayed as "50k")
- `OI_MONEYNESS_DECAY`: controls how fast OI drops for OTM strikes (~4.0). Deep OTM options have tiny modeled OI, so even small orders cause large slippage.
- `sqrt(DTE / 63)`: near-expiry options have lower OI (except ATM). Far-dated have more.
- The fill price for options includes both components on top of the existing `computeOptionBidAsk()` spread.

**Why OTM options are expensive to trade in size:** With `OI_MONEYNESS_DECAY = 4.0`, a 20% OTM option has `exp(-4 * 0.2^2) = exp(-0.16) ≈ 0.85` of ATM OI — still reasonable. But a 50% OTM option has `exp(-4 * 0.5^2) = exp(-1) ≈ 0.37` — roughly a third of ATM liquidity. Buying 30 contracts of a deep OTM with baseOI of ~18 means `qty/baseOI ≈ 1.7`, producing severe slippage. You can't quietly accumulate cheap OTM lottery tickets.

#### Market Maker Delta Hedge Feedback

When the player trades options, the market maker on the other side must delta-hedge. This creates **secondary stock impact**:

```
hedge_qty = delta * abs(qty) * contract_multiplier  // e.g., delta 0.3 * 50 contracts = 15 shares hedged
stock_impact = PERM_COEFF * sigma * sqrt(hedge_qty / ADV) * sign(hedge_qty)
```

- Player buys calls → market maker sells calls → market maker buys stock to hedge → S pushed up
- Player buys puts → market maker sells puts → market maker sells stock to hedge → S pushed down
- This is applied as an additional permanent shift to `sim.S`, with the same recovery drift as direct stock trades
- Creates a realistic feedback loop: large options trades move the underlying

#### Recovery Mechanism

All permanent impact (from stock trades, options trades, and delta hedge feedback) accumulates in `unrecoveredImpact`. Each day, a recovery drift is applied:

```
recoveryDrift = -unrecoveredImpact * (1 - Math.pow(0.5, 1/RECOVERY_HALF_LIFE))
```

This is applied as a transient overlay on `sim.mu` before `beginDay()`, removed after `finalizeDay()`. Represents other market participants absorbing the player's impact over ~3 days.

### Layer 2: Event Coupling

When an event fires and applies parameter deltas, the player's current **net delta exposure** amplifies or dampens the event's stock-price effect.

- Net long delta + bullish event → slightly larger price move (institutional buying compounds)
- Net short delta + bullish event → slightly smaller price move (institutional selling absorbs)
- Cap: **±20%** of event's base price effect at maximum position sizes
- Subtle effect — "the market moved a bit more because of positioning"

### Layer 3: Parameter-Shifting Large Trades

When gross notional exposure (stock + delta-equivalent options) crosses ADV-relative thresholds:

| Threshold (% of ADV) | Effect |
|---|---|
| 25% | Mild vol uptick (+5% theta), toast: "Unusual volume noted in PNTH trading" |
| 50% | Moderate vol + spread widening, toast: "Institutional flow dominates tape" |
| 75% | Vol spike + drift dampening, toast: "Market makers widen books on heavy positioning" |
| 100%+ | Above + potential popup event trigger (Section 3) |

Parameter shifts decay with half-life ~5-10 days if player reduces exposure.

**Decay storage model:** `price-impact.js` maintains two things:

1. **`unrecoveredImpact`** — cumulative permanent price impact not yet absorbed. Fed by stock trades, options trades, and delta hedge feedback. Recovery drift applied daily as transient `sim.mu` overlay (see Recovery Mechanism above).

2. **`playerParamShifts`** — Layer 3 parameter shifts (`{ theta, xi, kappa, sigmaR }`). Each day, shifts decay by `shift *= Math.pow(0.5, 1/halfLife)`. Applied as overlays on sim params before `beginDay()`, removed after `finalizeDay()`, so the sim's base parameters are never permanently mutated by player impact. Event-caused deltas (via `PARAM_RANGES`) continue to mutate sim params directly as they do today.

**`syncMarket` interaction:** `market.js` and `syncMarket()` are unchanged. The immediate `sim.S` shift from Layer 1 is visible to all consumers naturally (it's a real price change). Layer 3 overlays are transient and transparent.

### Anti-Spiral Dampening

- **Diminishing returns:** Logarithmic scaling past 50% ADV threshold
- **Impact decay:** Half-life 5 trading days — market absorbs known positions
- **Toast cooldown:** 10 days between portfolio-triggered impact toasts
- **Event coupling cap:** ±20% amplification regardless of position size
- **Parameter budget (player-caused only):**

| Parameter | Max player shift | Decay half-life |
|---|---|---|
| mu (drift) | ±0.05 | 5 days |
| theta (long-run var) | +0.01 | 5 days |
| xi (vol of vol) | +0.02 | 5 days |
| kappa (mean reversion) | ±0.5 | 5 days |
| sigmaR (rate vol) | +0.005 | 5 days |

Tracked separately from event-caused shifts. Independent of PARAM_RANGES.

---

## 3. Popup Decision Events

Major moments pause the simulation and present 2-3 choices with mechanically divergent outcomes.

### Popup Anatomy

- **Headline** — what's happening
- **Context paragraph** — 2-3 sentences, potentially referencing world state
- **2-3 choices** — short description of action (outcome uncertain)
- **Outcome** — parameter deltas, world state changes, followup chain scheduling, result toast

Uses existing overlay system (same z-index layer as chain/margin-call overlays). Sim pauses via `playing = false` (same mechanism as chain overlay). Lifecycle rules:

- **Popup vs other overlays:** Popups take priority. If chain overlay or trade dialog is open when a popup triggers, the popup is queued and fires after the existing overlay closes.
- **Multiple simultaneous popups:** Queued in FIFO order. If a narrative-triggered and portfolio-triggered popup fire on the same day, they present sequentially.
- **Popup while paused:** If the sim is already paused (user paused manually), the popup still fires immediately — it's a narrative moment, not a time-flow event.

### Two Trigger Sources

**Narrative-triggered:** ~50 existing events converted to interactive popups (see Section 6). The event's `when()` eligibility still gates firing. Instead of fixed parameter deltas, presents choices with different delta sets and world state effects.

Example — "SEC Investigating VP Bowman's PNTH Trades":
- **Cooperate with investigators** — accelerates Bowman's downfall, approval hit, vol spike, player flagged `cooperated_sec`
- **Say nothing** — no immediate effect, but if investigation widens, player becomes a target, flagged `silent_sec`
- **Quietly unwind PNTH positions** — sell pressure on PNTH, player is clean, flagged `fled_pnth`, forces liquidation of PNTH-related positions

**Portfolio-triggered:** ~25 new events that fire when portfolio state intersects world state. Each has a `trigger()` function and individual cooldown (60-120 days).

Examples:
- Massive net short + investigation active → "Senate Aide Asks About Your PNTH Position"
- Huge long delta + approaching midterm → "Campaign Donor Approaches You"
- Deep losses approaching rogue trading threshold → desperate measures offered

### Escalation Curve

- **Early term (days 252-500):** ~1 popup every 80-100 days. Low stakes, establishing role.
- **Mid term (days 500-800):** ~1 popup every 40-60 days. Real mechanical weight.
- **Late term (days 800-1260):** ~1 popup every 20-30 days. High stakes, choices determine outcomes.

Events tagged with `era` (`early`, `mid`, `late`) controlling eligibility. Untagged events fire anytime (gated by `when()`/`trigger()`).

### Data Structure

Extension of existing event format in `event-pool.js`:

```js
{
  id: 'bowman_sec_inquiry',
  category: 'investigation',          // matches existing event-pool.js field name
  likelihood: 3,                       // matches existing event-pool.js field name
  when: (sim, world) => world.investigations.tanBowmanStory >= 1,  // nested path per world-state.js
  popup: true,                         // NEW: renders as popup instead of toast
  headline: "Breaking: SEC Investigating VP Bowman's PNTH Trades",
  context: (sim, world, portfolio) => `...narrative text...`,      // consistent (sim, world, ...) ordering
  choices: [
    {
      label: "Cooperate with investigators",
      desc: "Provide your trading records voluntarily.",
      deltas: { theta: 0.002, xi: 0.01 },
      effects: [
        { path: 'investigations.tanBowmanStory', op: 'add', value: 1 },
        { path: 'election.barronApproval', op: 'add', value: -3 }
      ],
      followups: ['bowman_indictment_fast'],
      playerFlag: 'cooperated_sec'
    },
    // ... more choices
  ]
}
```

Portfolio-triggered events use `trigger()` instead of `when()`:

```js
{
  id: 'senate_aide_short',
  trigger: (sim, world, portfolio) =>           // consistent (sim, world, ...) ordering
    portfolio.computeNetDelta() < -LARGE_THRESHOLD
    && world.investigations.tanBowmanStory >= 1,  // nested path per world-state.js
  cooldown: 120,                                  // minimum days between re-triggering
  popup: true,
  headline: "Senate Aide Asks About Your PNTH Position",
  // ...
}
```

**Note on `effects` in popup choices:** Popup choice `effects` use the exact same `[{ path, op, value }]` array format as `applyStructuredEffects()` in `world-state.js` (used by LLM events). All values are **additive deltas** (`op: 'add'`), consistent with how existing event effects work. Paths must match `WORLD_STATE_RANGES` keys (e.g., `'election.barronApproval'`, `'investigations.tanBowmanStory'`). The property is named `effects` (not `worldEffects`) to match the existing event-pool convention. Popup choice application calls `applyStructuredEffects()` directly with no adapter needed.

**Note on `computeNetDelta()` and `computeGrossNotional()`:** These are new methods added to `portfolio.js`. They are computed on demand (not cached properties) using the portfolio's current positions and `market.S`. `computeNetDelta()` sums stock qty directly, and for option positions, prices each option via a lightweight tree call to get delta. This is acceptable because it runs only at end-of-day (not per-substep) and only when evaluating portfolio-triggered popup eligibility — at most ~20 option positions to price. `computeGrossNotional()` sums `abs(qty) * market.S` for stock and `abs(qty * delta) * market.S` for options. Both use the module's own reusable tree (same pattern as other modules).

### Player Flags

Each choice sets a `playerFlag` stored in a `playerChoices` map (`flag → day`). Flags are:
- Checked by later popup `when()` conditions (branching consequences)
- Read by epilogue for personalized narrative
- Never mechanically punitive on their own — consequences come through world state and followup events

---

## 4. Portfolio-Aware Narrative

The game notices positions indirectly — through market effects, never naming the player.

### Impact Toasts

When trades cause price impact (Section 2), atmospheric toasts describe the market effect:

**Stock trades:**
- Medium: "Unusual volume in afternoon session" / "Block trade reported on PNTH"
- Large: "Institutional flow dominates tape, market makers widen spreads"
- Extreme: "PNTH halted briefly on volatility — heavy directional flow cited"

**Options trades:**
- Large: "Unusual options activity detected in PNTH calls"
- Extreme: "Dealer hedging flows amplify selling pressure"

Pool of ~30-40 template strings, selected by direction, instrument, and magnitude. Some gated by world state ("amid ongoing SEC inquiry").

### Event Flavor Variants

Existing events gain optional `portfolioFlavor: (portfolio) => string | null`. Returns alternate/appended toast text when the player holds a relevant position. Does not change mechanical outcome.

Example — "Fed Cuts Rates 50bps":
- Default: "Emergency rate cut: Hartley slashes 50 basis points, citing deteriorating conditions."
- Player long bonds: "...Bond markets rally sharply on the move."
- Player short vol: "...Volatility compresses as markets stabilize."

### Quarterly Review Content

Review text varies by performance vs benchmark AND by popup history. If player was flagged by SEC-related popups, review may reference: "...the SEC inquiry hasn't helped perception of the desk."

---

## 5. Feedback Loop & Anti-Spiral Mechanics

### The Loop

```
Player trades stock/options
  → Slippage moves price (Layer 1)
  → Large exposure shifts vol/drift params (Layer 3)
  → Param shifts generate impact toasts
  → If exposure extreme + world state aligned → portfolio-triggered popup
  → Popup choice → world state change + param deltas + followup chain
  → Followup events fire days later (existing MTTH system)
  → Events shift market → player reacts with new trades
  → Loop continues
```

Parallel narrative loop:

```
Poisson/scheduled events fire on calendar
  → Major events become popups (narrative-triggered)
  → Popup choice → world state + params + followups
  → Player's net delta amplifies/dampens event price effect (Layer 2)
  → Event flavor text adapts to portfolio (portfolioFlavor)
```

Both loops share world state and model parameters.

### Dampening Mechanisms

1. **Diminishing impact returns** — Logarithmic scaling past 50% ADV
2. **Impact recovery** — Immediate price impact recovers via mean-reverting drift (half-life ~3 days); Layer 3 param shifts decay (half-life ~5 days)
3. **Portfolio-triggered popup cooldowns** — 60-120 days per event
4. **Event coupling cap** — ±20% max amplification
5. **Narrative pressure** — Impact toasts and popups create self-correcting social pressure
6. **Rogue trading threshold** — 50% equity loss is the hard floor

---

## 6. Event Pool Expansion & Popup Conversion

### Narrative-Triggered Popup Conversions (~50)

Selection criteria: the event represents a narrative fork AND a bank trader would plausibly have agency.

| Category | Total | Popups | Rationale |
|---|---|---|---|
| PNTH | 56 | ~12 | Board votes, earnings, military contracts |
| Investigation | 15 | ~8 | SEC inquiries, subpoenas, testimony |
| Congressional | 34 | ~6 | Key votes, lobbying, testimony |
| Fed | 23 | ~5 | Front-running, hedging, public stance |
| Macro | 34 | ~5 | Trade war positioning |
| Political | 16 | ~4 | Campaign moments, scandal response |
| Midterm | 5 | ~3 | Campaign season, donations |
| Sector/Market/Compound | 50 | ~5 | Select institutional decision points |
| Neutral | 25 | 0 | Data releases stay passive |
| PNTH Earnings | 7 | ~3 | Post-earnings strategy pivots |

### New Portfolio-Triggered Popup Events (~25)

**Position-based:**
- Massive net short + investigation → compliance/legal pressure
- Massive net long + approaching crash → suspicion
- Heavy options concentration at single strike → market maker complaints
- Extreme leverage (margin >80%) → risk desk intervention

**Performance-based:**
- Huge profit streak → media profile, political attention, donation requests
- Losses approaching rogue threshold → desperate measures (insider tips, accounting tricks — short-term salvation, epilogue consequences)
- Outperforming during crisis → "profiting from suffering" pressure

**Timing-based (portfolio + calendar):**
- Large PNTH position during earnings week → analyst calls, leak opportunities
- Heavy bonds during Fed week → front-running suspicion
- Any large position during campaign season → donor/lobbyist approaches

### Escalation Tags

Every popup gets `era` tag: `early` (days 252-500, ~15 popups), `mid` (500-800, ~25 popups), `late` (800-1260, ~35 popups). Untagged events gated only by `when()`/`trigger()`.

---

## 7. Epilogue Overhaul

### New Data Sources

Three new inputs alongside existing world state and portfolio:

1. **`playerChoices`** — Map of popup decision flags with day set
2. **`impactHistory`** — Top 10-15 most impactful trades: `{ day, direction, magnitude, context }`
3. **`quarterlyReviews`** — Array of `{ day, pnl, vsBenchmark, rating }`

### Narrative Thread Integration

Existing 4-page structure gains new conditional paragraphs (not new pages):

**Page 1 (The Election):** New paragraph on Meridian Capital's role, shaped by player's SEC cooperation, campaign donations, and visibility level.

**Page 2 (Congressional Aftermath):** References player testimony or subpoenas if triggered. "The Okafor hearings produced one memorable witness — a Meridian derivatives trader whose testimony [helped unravel / muddied] the Bowman connection."

**Page 3 (PNTH Resolution):** Player's PNTH trading history shapes tone. Short sellers referenced as "institutional pressure that accelerated the inevitable." Longs as "believers who held through the storm." Popup choices involving PNTH board dynamics woven in.

**Page 4 (Financial Scorecard):** Major overhaul:

- **Career arc** — from quarterly reviews: "Three strong quarters, then the wheels came off"
- **Signature moment** — largest impact trade narrated: "On day 847, a block sale of 50,000 shares preceded what analysts would later call the Hartley Crash by 72 hours"
- **The choices that mattered** — 2-3 most consequential popup decisions, briefly narrated
- **Reputation** — one-line archetype (see below)
- **Final line** — portfolio value + tonal coda matched to reputation

### Reputation System

Synthesized archetype revealed only in the epilogue. Not a visible meter during gameplay.

- **The Insider** — cooperated with investigations, had information edges, played both sides
- **The Principled** — refused insider tips, cooperated with regulators, took losses over cheating
- **The Speculator** — aggressive positioning, large market impact, rode volatility
- **The Survivor** — cautious trading, small positions, weathered storms without dominating
- **The Kingmaker** — choices consistently shaped political outcomes, donations, testimony
- **The Ghost** — few popup triggers, minimal narrative footprint. "One trader at Meridian made a fortune and left no fingerprints."

Determined by dominant player flags, with fallback to trading style metrics derived from existing data: `impactHistory` length and magnitude (position aggression), `quarterlyReviews` variance (P&L volatility), and popup trigger count (narrative visibility). No new tracking required beyond the three epilogue data sources already specified.

---

## Files Affected

### Modified
- `config.js` — New constants: ADV, IMPACT_COEFF, impact thresholds, decay rates, parameter budgets, starting capital, rogue trading threshold
- `main.js` — Price impact processing in substep/day loop, popup overlay management, playerChoices map, impactHistory tracking, quarterly review scheduling, rogue trading check
- `portfolio.js` — Net delta exposure computation for impact system, gross notional tracking
- `events.js` — Popup event handling (pause sim, present choices, apply selected deltas/effects), portfolio-triggered event pool, era gating, cooldown tracking
- `event-pool.js` — ~50 events converted to popup format with choices, ~25 new portfolio-triggered events, portfolioFlavor functions on existing events, impact toast templates
- `world-state.js` — `playerChoices` map integration, new world state fields for player reputation tracking
- `epilogue.js` — New data source consumption (playerChoices, impactHistory, quarterlyReviews), reputation synthesis, expanded Page 4, conditional paragraphs on Pages 1-3
- `ui.js` — Popup overlay rendering, choice button handling, quarterly review display
- `index.html` — Popup overlay HTML structure, updated intro screen text
- `styles.css` — Popup overlay styling, rogue trading screen reskin, choice button styles
- `format-helpers.js` — Scaled dollar formatting for institutional amounts

### New Files
- `src/price-impact.js` — Price impact computation (slippage, decay, parameter shifts, event coupling), impact toast generation, threshold detection
- `src/popup-events.js` — Portfolio-triggered event pool, trigger evaluation, cooldown management. Evaluated at end-of-day in `main.js` (not via `events.js`'s `maybeFire()`). `main.js` imports popup-events and checks `trigger()` functions after the narrative event engine runs, then queues any triggered popups into the popup overlay system.

### Unchanged
- `simulation.js` — No changes. Layer 1 slippage modifies `sim.S` directly at trade execution time. Recovery drift and Layer 3 param overlays are applied/removed externally by `main.js` orchestrating `price-impact.js` (before `beginDay()` / after `finalizeDay()`). Event coupling scaling handled in `main.js` when applying event deltas.
- `pricing.js` — No changes to options pricing engine
- `chain.js` — No changes to chain generation
- `strategy.js` — No changes to strategy renderer
- `chart.js` — No changes to chart renderer
- `market.js` — No changes to market state structure
- `history-buffer.js` — No changes
- `reference.js` — No changes
- `colors.js` — No changes
- `theme.js` — No changes
- `strategy-store.js` — No changes
- `chain-renderer.js` — No changes
- `portfolio-renderer.js` — No changes
- `position-value.js` — No changes
- `llm.js` — No changes
- All `shared-*.js` / `shared-*.css` files — No changes
