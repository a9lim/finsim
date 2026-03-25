# CLAUDE.md

Part of the **a9l.im** portfolio. See root `CLAUDE.md` for the shared design system, head loading order, CSS conventions, and shared code policy. Sibling projects: `physsim`, `biosim`, `gerry`.

## Shared Code Policy

Always prefer shared modules over project-specific reimplementations. This project uses: `shared-tokens.js`, `shared-utils.js`, `shared-haptics.js`, `shared-toolbar.js`, `shared-forms.js`, `shared-intro.js`, `shared-base.css`, `shared-tabs.js`, `shared-camera.js`, `shared-info.js`, `shared-shortcuts.js`, `shared-touch.js`. Before adding utility code, check whether a `shared-*.js` file already provides it. New utilities useful across projects should be added to the shared files in the root repo.

## Style Rule

Never use the phrase "retarded potential(s)" in code, comments, or user-facing text. Use "signal delay" or "finite-speed force propagation" instead.

## Testing

Do not manually test via browser automation. The user will test changes themselves and provide feedback.

## Overview

Shoals -- interactive options trading simulator set at **Meridian Capital**, a major investment bank. The player is a senior derivatives trader during the Barron administration. GBM stock with Merton jumps + Heston stochastic vol; Vasicek interest rates. American options priced via CRR binomial tree (128 steps) with term-structure vol, moneyness skew, per-step Vasicek rate discounting. Strategy builder, full options chain, portfolio/margin system, Almgren-Chriss price impact, narrative event engine with interactive popup decisions, political lore, reputation system, and 4-page epilogue.

Zero dependencies -- vanilla HTML5/CSS3/JS with ES6 modules. No build step.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Serve from `a9lim.github.io/` -- shared files load via absolute paths (`/shared-*.js`, `/shared-base.css`).

## File Map

```
main.js               1810 lines  Orchestrator: DOM cache $, rAF loop, sub-step streaming,
                                   live candle animation, camera, shortcuts, event wiring,
                                   strategy builder (with rollback), ExpiryManager, world state,
                                   executeWithRollback, selectable expiry resolution,
                                   Layer 3 param overlays, popup queue, playerChoices/
                                   impactHistory/quarterlyReviews tracking, rogue trading,
                                   declarative trade execution, compliance integration,
                                   insider tip scheduling, portfolioHistory sparkline buffer
index.html              691 lines  Toolbar, chart/strategy canvases, sidebar (4 tabs),
                                   chain/trade/popup/reference/epilogue overlays,
                                   intro (Meridian Capital framing), strategy save/load UI
styles.css             1065 lines  Chain, positions, strategy, trade dialog,
                                   popup decision events, P&L/Greek colors, responsive
                                   breakpoints, strategy groups, sim-input, credit/debit
colors.js                59 lines  Financial color aliases (up/down/call/put/stock/bond/
                                   delta/gamma/theta/vega/rho), CSS var injection
src/
  config.js             103 lines  All constants (timing, instruments, margin, spreads, events,
                                   rendering, price impact, rogue trading threshold, compliance),
                                   PRESETS (5 static + 2 dynamic), DEFAULT_PRESET=5
  simulation.js         251 lines  GBM + Merton + Heston + Vasicek; beginDay()/substep()/
                                   finalizeDay() pipeline; prepopulate() reverse-backfill
  pricing.js            834 lines  CRR binomial tree: term-structure vol, moneyness skew,
                                   Vasicek per-step discounting, discrete dividends. Dual
                                   call+put induction. Vasicek bond pricing + duration.
                                   Tree reuse API for zero-alloc pricing. All pricing
                                   uses prepareTree+priceWithTree (no priceAmerican).
  chain.js              230 lines  ExpiryManager, generateStrikes(), buildChainSkeleton(),
                                   priceChainExpiry() with reusable tree pool + per-strike
                                   impact overlay applied to displayed prices
  portfolio.js         1070 lines  Signed-qty positions, market/limit/stop orders, netting
                                   (includes strategyName), cash/margin, borrow interest,
                                   dividends, option expiry, bid/ask spreads, slippage
                                   integration, computeNetDelta(), computeGrossNotional()
  chart.js              728 lines  ChartRenderer: log Y-axis OHLC candles (rounded bodies),
                                   live candle cubic interpolation, position markers, strike
                                   lines; shared-camera.js; uses resizeCanvasDPR()
  strategy.js           ~1000 lines StrategyRenderer: payoff P&L, Greek overlays, breakevens
                                   (analytical at expiry), input-keyed caching, unitPrice-based
                                   entry values, tree-based hypothetical S sweep,
                                   computeSummary returns .greeks (aggregate at spot),
                                   bindPan() for left-click drag panning; uses
                                   resizeCanvasDPR()
  ui.js                1054 lines  DOM binding, display updaters, overlay management;
                                   delegates to chain-renderer.js and portfolio-renderer.js.
                                   Strategy dropdowns, credit/debit, built-in disable logic,
                                   showPopupEvent() with category theming
  events.js             529 lines  EventEngine: Poisson scheduler, MTTH followup chains, Fed
                                   schedule, boredom boost, midterms. maybeFire() returns
                                   { fired, popups }. Event coupling via _computeCoupling().
                                   Era gating (early/mid/late). scheduleFollowup() public API.
  event-pool.js        3210 lines  ~277 curated offline events across 12 categories (Fed,
                                   macro, sector, PNTH, congressional, investigation, political,
                                   market, neutral, compound, midterm). All events fire as
                                   toasts (no popups). 12 insider-tip outcome events (6 real +
                                   6 fake). ~20 events have portfolioFlavor functions. Exports
                                   OFFLINE_EVENTS, PARAM_RANGES, getEventById().
  price-impact.js       ~260 lines Almgren-Chriss price impact: single sqrt model with
                                   decaying cumulative volume (half-life 5 days). Impact
                                   is an overlay on sim.S, never mutates it. Dynamic MM
                                   rehedging tracks aggregate delta and records incremental
                                   hedge volume each substep. Modeled OI with moneyness +
                                   term-structure decay. Layer 3 parameter shifts.
                                   Impact toast generation.
  compliance.js          91 lines  Compliance heat/credibility state. effectiveHeat(),
                                   onComplianceTriggered(), onComplianceChoice(),
                                   cooldownMultiplier(), thresholdMultiplier(), complianceTone()
  popup-events.js      1248 lines  26 portfolio-triggered popup events (10 compliance with
                                   declarative trades + complianceTier, 3 insider tip with
                                   randomized tip pool, 12 atmosphere, 1 unlimited risk).
                                   Notional-based triggers, compliance-scaled cooldowns.
                                   evaluatePortfolioPopups(), pickTip()
  world-state.js        170 lines  Mutable narrative state: congressional seats (Senate/House
                                   by party), PNTH board factions, geopolitical escalation,
                                   Fed credibility, investigations, election cycle.
                                   Exports: createWorldState(), congressHelpers(),
                                   WORLD_STATE_RANGES, applyStructuredEffects()
  llm.js                271 lines  LLMEventSource: Anthropic API via structured tool use,
                                   universe lore in system prompt, offline fallback
  epilogue.js           567 lines  generateEpilogue(): 4-page narrative ending from world
                                   state + portfolio + event log + playerChoices +
                                   impactHistory + quarterlyReviews + terminationReason.
                                   Reputation synthesis, compliance termination ending.
                                   Congressional diagrams, financial scorecards.
  market.js              27 lines  Shared mutable market state + syncMarket(sim). Leaf module.
  history-buffer.js     103 lines  Ring buffer (capacity 252) for OHLC bars
  format-helpers.js      63 lines  fmtDollar() (appends "k"), fmtQty(), fmtNum(), pnlClass(),
                                   fmtDte(), fmtRelDay()
  strategy-store.js    ~370 lines Built-in strategy defs (22 presets, no unlimited-
                                   downside strategies). Groups: vertical spreads (bull/
                                   bear call/put), volatility (straddle/strangle/guts),
                                   butterflies & condors, stock+options (covered call/
                                   protective put/collar), asymmetric (risk reversal/
                                   jade lizard/put ratio/put ladder), arbitrage
                                   (conversion/reversal/box), calendars. localStorage
                                   CRUD (hash IDs, name collision enforcement),
                                   resolveLegs (with override expiry), formatLeg,
                                   computeNetCost (uses unitPrice), legsToRelative,
                                   nextAutoName
  position-value.js      88 lines  unitPrice() (uses vol surface + per-strike impact
                                   for options), computePositionValue(), computePositionPnl()
  chain-renderer.js     314 lines  Chain table DOM with event delegation: renderChainInto(),
                                   rebuildExpiryDropdown(), buildStockBondTable(), posKey().
                                   Full chain shows modeled OI (not delta) per strike.
  portfolio-renderer.js  ~420 lines Portfolio display with DOM diffing, strategy group
                                   boxes (name, expiry, multiplier, value, P/L, unwind),
                                   portfolio value sparkline (via portfolioHistory param),
                                   portfolio value colored vs buy-and-hold benchmark.
                                   Strategy pending orders render as strategy-group boxes
                                   with constituent leg detail line
  reference.js         1617 lines  29 reference entries with KaTeX math
  theme.js                9 lines  initTheme(), toggleTheme() (delegates to _toolbar)
```

## Module Dependencies

```
main.js
  |- config.js             (constants, PRESETS)
  |- simulation.js         (imports config, history-buffer)
  |- market.js             (leaf module -- single-writer main.js, multiple readers)
  |- chain.js              (imports pricing, portfolio, price-impact, market, config)
  |- portfolio.js          (imports pricing, market, config, position-value, price-impact)
  |- events.js             (imports config, world-state, event-pool)
  |- event-pool.js         (OFFLINE_EVENTS, PARAM_RANGES, getEventById)
  |- llm.js                (imports events)
  |- world-state.js        (createWorldState, congressHelpers, applyStructuredEffects)
  |- price-impact.js       (imports config, pricing, market)
  |- compliance.js         (imports config; leaf module)
  |- popup-events.js       (imports config, portfolio, market, position-value, compliance)
  |- epilogue.js           (imports position-value, config)
  |- chart.js              (imports format-helpers, config; reads _PALETTE globals)
  |- strategy.js           (imports pricing, position-value, market, config)
  |- strategy-store.js     (imports portfolio, position-value, market)
  |- ui.js                 (imports format-helpers, chain-renderer, portfolio, pricing, price-impact, config)
  |- chain-renderer.js     (imports format-helpers, price-impact; reads _haptics globals)
  |- portfolio-renderer.js (imports position-value, format-helpers)
  |- format-helpers.js     (imports config)
  |- position-value.js     (imports pricing, price-impact, market, config)
  |- reference.js          (data only)
  +- theme.js              (delegates to _toolbar)
```

## Data Flow

### Sub-Step Streaming (playing)

1. `frame()` applies param overlays, calls `sim.beginDay()`
2. 16 sub-steps paced across tick interval. Each substep: `sim.substep()` (price/vol/rate evolution), `decayImpactVolumes()`, `syncMarket()`, `rehedgeMM()`, `_onSubstepTick()` (pending orders, peak/drawdown tracking), `chart.setLiveCandle()`
3. Once per frame after substep batch: `_onSubstepUI()` (reprice chain sidebar, update portfolio display)
4. After 16 sub-steps, `sim.finalizeDay()`, overlays removed. `_onDayComplete()`: borrow interest, expiry, dividends (quarterly), quarterly review, rogue trading check, event engine (with coupling), Layer 3 param shifts, impact toasts, portfolio-triggered popups, popup queue processing, margin check, skeleton rebuild

### Bootstrap

`sim.prepopulate()` backfills 252-bar history: negates `mu` during forward simulation so the reversed path trends in the correct drift direction. Resets to target state (S=100, v=theta, r=b) after. `ExpiryManager`, rate sparkline, and portfolio sparkline initialized after.

### Pause / Step

Pausing mid-day leaves the partial bar frozen. Step button advances one substep. `tick()` finishes any partial day or runs a full day (beginDay + 16 substeps + finalizeDay), running per-substep logic (decay, rehedge, orders) at each step.

## Simulation Models

**Stock**: GBM + Merton jumps + Heston stoch vol (Milstein, full truncation). Correlated Brownian via Cholesky. Dividends discrete quarterly, NOT in drift.

```
dS/S = (mu - lambda*k - 0.5*v)dt + sqrt(v)*dW1 + J*dN(lambda)
dv   = kappa(theta - v)dt + xi*sqrt(v)*dW2      (dW1*dW2 = rho*dt)
```

**Rate**: Vasicek `dr = a(b-r)dt + sigmaR*dW3` (independent). Can go negative.

**Reset**: S=100, v=theta, r=b. 5 static presets + 2 dynamic (Offline/LLM). See `config.js` for values.

## Options Pricing

CRR binomial tree (128 steps) for American options with BSS smoothing (Broadie-Detemple): every tree carries a companion N-1 step tree, and all pricing/Greek APIs average both results to cancel odd-even binomial oscillation. Per-strike volatility via:
- **Term-structure**: Heston integrated variance + vol-of-vol convexity (Gatheral 2006)
- **Skew**: first-order Heston `rho*xi/(2*sigma)` + quadratic curvature, dampened by mean-reversion

Per-step Vasicek rate discounting. Discrete proportional dividends at `QUARTERLY_CYCLE` boundaries. Dual call+put backward induction shares loop overhead for chain pricing.

**Greeks**: finite-difference via `prepareGreekTrees` + `computeGreeksWithTrees` (14 tree inductions per option with BSS). Delta/gamma from tree steps 1&2, theta/vega/rho via central differences. All pricing unified on `prepareTree` + `priceWithTree` — no `priceAmerican`.

**Bonds**: Vasicek closed-form. Duration `B(T) = (1 - e^{-aT})/a` caps at `1/a`.

**Spreads**: volatility-aware. `computeBidAsk` (stock/bond, uses `STOCKBOND_SPREAD_PCT` 0.1%) and `computeOptionBidAsk` (uses `OPTION_SPREAD_PCT` 1%, adds moneyness). Bond spreads use `sigmaR` (rate vol); stock/option spreads use Heston vol. Long fills at ask, short at bid.

## Price Impact (The Desk)

Almgren-Chriss framework with a single sqrt impact model and decaying cumulative volume. Impact is an **overlay** on `sim.S` — the simulation price is never mutated by trades.

**Stock impact**: `IMPACT_COEFF * sigma * sqrt(cumVol / ADV)` computed separately for buy/sell sides. Net overlay = buy impact − sell impact. Fill cost is the marginal increment: `coeff * sigma * (sqrt((cum+qty)/ADV) - sqrt(cum/ADV)) * sign`. Fill prices clamped to $0.01 minimum. `getStockImpact(sigma)` returns the current overlay; `recordStockTrade(qty, sigma)` updates cumulative volume and returns fill cost.

**Options impact**: same sqrt model but scaled by `qty / modeledOI` instead of `qty / ADV`. Modeled OI is asymmetric: `OI_ATM_BASE * decay * putSkew * sqrt(63/dte)` where decay uses `OI_MONEYNESS_DECAY` (steeper 2.5x for ITM options than OTM), OTM puts get 1.5x boost (hedging demand), and near-term expiries have more liquidity. Per-strike cumulative volume keyed by `type_strike_expiryDay`. `getOptionImpact(type, strike, expiryDay, sigma, logSK, dte)` returns the overlay; `recordOptionTrade(...)` updates volume and returns fill cost.

**Bonds**: spread only, no price impact (Vasicek-priced, deep market).

**Volume decay**: cumulative volumes (stock buy/sell, per-strike option buy/sell) decay every substep via `decayImpactVolumes()` with `VOLUME_HALF_LIFE` (1 day, applied as `2^(-1/(halfLife*16))` per substep). Since impact is `sqrt(cumVol)`, the effective impact half-life is ~2 days.

**Dynamic MM rehedging**: `rehedgeMM(positions)` called each substep after `syncMarket`. Computes `requiredHedge = sum(delta * qty)` across all player option positions using tree-computed deltas. The difference from `_mmCurrentHedge` is recorded as incremental stock buy/sell cumulative volume. This creates realistic gamma squeeze / pin-to-strike dynamics — large stock moves cause large MM rehedging flow, which adds to the stock impact overlay.

**Layer 3**: large gross notional exposure (25/50/75/100% of ADV thresholds) shifts vol/drift parameters. Logarithmic scaling past 50%. Decays with half-life 5 days. Generates atmospheric impact toasts.

**Event coupling**: player's net delta amplifies/dampens event deltas by ±20% via `_computeCoupling()` inside `_fireEvent()`.

## Popup Decision Events

~26 portfolio-triggered events in `popup-events.js` present interactive choices that pause the simulation. Event-pool events no longer use popups — they fire as toasts.

**Compliance popups** (10 events): supervisor/compliance directives with declarative `trades` arrays and `complianceTier` ('full'|'partial'|'defiant'). Full compliance executes trades (e.g. `close_all`, `close_short`, `close_type`). Triggers use notional-relative thresholds scaled by `thresholdMultiplier()`. Cooldowns scaled by `cooldownMultiplier()`. Context text uses `complianceTone()` for escalating language.

**Insider tip popups** (3 events): vague initial description. Player can decline (clean record) or ask for more (randomized tip from `INSIDER_TIPS` pool, 70% real / 30% fake, scheduled as followup ~14 days out). Real tips add compliance heat.

**Atmosphere popups** (12 events): narrative/reputation moments without trade implications. No `trades` or `complianceTier`.

**Unlimited risk popup** (1 event): fires when `netUncoveredUpside` (sum of stock qty + call qty) is negative and notional exceeds 10% of equity. Offers close_short, hedge_unlimited_risk (buys stock), or defy.

**Popup queue**: `_popupQueue` in main.js, processed at end-of-day and when blocking overlays close. Popups pause the sim, present choices, apply effects, execute trades, process compliance tier, record `playerFlag` in `playerChoices` map.

**Era gating**: `early` (day ≤500), `mid` (500-800), `late` (≥800). Escalating stakes over the presidential term.

**portfolioFlavor**: ~20 non-popup events have `portfolioFlavor(portfolio)` functions that append position-aware text to toast headlines.

## Compliance System

`compliance.js` tracks regulatory pressure on the player. State: `heat` (defiance accumulator), `credibility` (capped at 5, grows faster with bigger profits), `equityAtLastReview`, `lastReviewDay`.

**Effective heat** = `heat - credibility` (can go negative). Determines tone (warm < 0, professional 0-1, pointed 2-3, final_warning 4, terminated ≥5) and game over at ≥5 (triggers epilogue with "fired for cause" ending).

**On compliance trigger**: if profitable since last review, heat resets to 0 and credibility increases (scaled by profit ratio, capped per-review at +2). If not profitable, heat stays.

**Choice effects**: full compliance → heat -= 1, partial → unchanged, defiant → heat += 1-2.

**Scaling**: cooldowns × `cooldownMultiplier()` (high heat = shorter), thresholds × `thresholdMultiplier()` (high credibility = more lenient).

## Value Coloring

3-way pattern throughout: negative/debit → `pnl-down` (red), neutral/zero → no class (text color), positive/credit → `pnl-up` (green). Portfolio value is colored vs buy-and-hold benchmark (green if outpacing, red if underperforming, text if neutral). Both sparklines (portfolio value, risk-free rate) always use `--text` CSS var color. Greeks (both portfolio and strategy tabs) use per-Greek CSS colors (`--delta`, `--gamma`, `--theta`, `--vega`, `--rho`) on both labels (`.greek-label-*` classes) and values (by ID), NOT `pnl-up`/`pnl-down`.

## Display Scaling

All internal values (cash, quantities, prices, margin) remain at the original scale ($10,000 starting capital). The UI appends "k" to portfolio-scale dollar amounts via `fmtDollar()` and to quantities via `fmtQty()`. Per-unit prices (fills, strikes, option prices, strategy net debit/credit, breakevens) display raw `$X.XX` without "k". Strategy leg quantities are raw (1x call + 1x put); the "k" applies to the execution multiplier in the portfolio display and trade qty slider.

## Options Chain

ATM = `round(S/5)*5`, 10 strikes each side (21 total). `ExpiryManager` maintains 8 rolling expiries on 63-day cycle.

**Lazy pricing**: `buildChainSkeleton()` returns metadata only. `priceChainExpiry()` prices one expiry on demand — sidebar uses price-only (21 dual inductions/substep), full chain overlay adds Greeks (147 inductions) and displays modeled OI per strike (asymmetric: ITM penalty, OTM put boost). Pre-allocated tree pool for zero GC. Full chain overlay refreshes after trades via `_refreshChainOverlay` to reflect price impact.

## Portfolio System

**Positions**: signed qty (`qty > 0` = long, `< 0` = short). Types: stock, bond (zero-coupon, face $100), call, put. Netting by `type + strike + expiryDay + strategyName` (separate strategies with overlapping legs coexist).

**Orders**: market (instant), limit (trigger price), stop (trigger -> market). Strategy orders supported: `placePendingOrder` accepts `legs` and `execMult` for multi-leg orders. `checkPendingOrders` executes strategy orders with rollback (all-or-nothing); failed fills show a toast and drop the order.

**Margin**: short stock/bond 50% initial / 25% maintenance. Short options `max(20%*S*qty, premium*qty)`. Long on margin: Reg-T 50%/25%. `_postTradeMarginOk()` prevents trades that would immediately trigger margin call.

**Borrow interest**: daily on short stock/bond + negative cash. Does NOT apply to short options.

**Dividends**: every `QUARTERLY_CYCLE` (63) days. Stock drops by `q/4`, cash paid to/from shareholders.

**Expiry**: bonds at face ($100). Options closed at market value (intrinsic at DTE=0). If any expiring position belongs to a strategy, all remaining positions in that strategy are unwound at market value. Strategy display shows the minimum expiry across all legs.

**Rogue trading**: if portfolio equity drops below 50% of starting capital (`ROGUE_TRADING_THRESHOLD`), game ends with arrest screen. Checked at end-of-day before margin check.

**Quarterly reviews**: every `QUARTERLY_CYCLE` days during live trading. Compares P&L vs buy-and-hold benchmark. Flavor text varies by performance rating (strong/solid/underperform/poor). Pure atmosphere, no mechanical effect.

**Strategy**: legs in `main.js` (`strategyLegs[]`). Execution via `executeWithRollback()` rolls back all legs on partial failure. Strategies persisted in localStorage via `strategy-store.js` with hash-based IDs, 22 built-in presets (no unlimited-downside strategies), selectable expiry toggle, and relative strike/DTE offsets. Trade tab has saved strategy dropdown with live credit/debit and qty multiplier. Execute strategy respects order type selector — limit/stop places a pending strategy order instead of immediate execution.

## UI Architecture

Floating glass panels over full-viewport canvas. Fixed topbar, right slide-in sidebar (4 tabs: Trade/Portfolio/Strategy/Settings), bottom pill bar. Portfolio tab shows portfolio value (colored green/red/neutral vs buy-and-hold benchmark) with a sparkline below it. No separate Total P&L line. Both canvases support left-click drag to pan (chart via `camera.bindMousePan`, strategy via `strategy.bindPan`). Zoom controls hidden in strategy mode.

**Overlays**: chain (pauses sim), trade dialog (confirm button cloned each open), popup decision (pauses sim, glass panel, category-themed, used for narrative events + margin calls + game over), reference (KaTeX, 29 entries), epilogue (4-page narrative). Old standalone margin-call and fraud overlays removed — all decision points flow through the popup system.

**Popup overlay**: uses `sim-overlay-panel glass` wrapper with `sim-overlay-body` inside. Category badge (monospace, category-colored), headline, context paragraph, and choice buttons (bg-hover on glass panel, no nested glass). `showPopupEvent()` accepts category and magnitude — category sets accent color on badge/border, magnitude controls backdrop intensity. Queue drains when blocking overlays close (deferred via `setTimeout`).

**Custom events**: `shoals:closePosition`, `shoals:exerciseOption`, `shoals:cancelOrder`, `shoals:unwindStrategy` -- ui.js/portfolio-renderer.js -> main.js.

**Strategy tab**: sets `strategyMode = true`, pauses sim, shows strategy canvas + time-to-expiry slider (percentage maps to `evalDay`, clamped to min DTE). "Greeks (at current price/time)" section below legs shows aggregate delta/gamma/theta/vega/rho computed at entry day (not slider), colored with per-Greek CSS vars (`--delta` through `--rho`). Strategy summary shows Net Debit/Credit and Breakevens with info tip buttons. Strategy dropdown auto-loads on select ("New strategy" clears builder). Built-in strategies disable name/toggle/save/delete via `ctrl-disabled`. "Shared Expiry" toggle (internal: `selectableExpiry`) controls whether legs use the selected expiry or per-leg DTE offsets. On tab switch, `strategy._cache` and `_summaryCache` are invalidated and `updateStrategyBuilder()` is called so chart/summary/chain reflect current price impact state from trades on other tabs.

## Dynamic Regime

Two dynamic presets use `EventEngine` (events.js) + event pool (event-pool.js):
- **Offline** (preset 5, default): draws from curated events via weighted random
- **LLM** (preset 6): Claude API generates batches, offline fallback on failure

### Event Scheduling

- **Fed**: every ~32 days (with jitter). Excluded from Poisson pool.
- **Non-Fed**: Poisson rate 1/30 with 8-15 day cooldown (effective ~1/41.5). Boredom boost after 3 minor events.
- **PNTH earnings**: quarterly (~63 days with jitter)
- **Followups**: MTTH chains, Poisson-sampled delay, recursive (max depth 5). Public `scheduleFollowup()` for popup choice followups.
- **Midterm elections**: live day 504, campaign season from live day 440. Term ends live day 1008. (Config constants add `HISTORY_CAPACITY` offset: e.g. `TERM_END_DAY = 252 + 1008 = 1260`.)

### World State

`world-state.js` tracks persistent narrative state consumed by events and epilogue:
- **Congress**: Senate/House seats by party (Federalist vs Farmer-Labor)
- **PNTH board**: Dirks/Gottlieb faction balance, investigation status
- **Geopolitical**: escalation level, active conflicts
- **Fed**: credibility score, Hartley's independence
- **Elections**: campaign phase, midterm results

Events apply `structuredEffects` via `applyStructuredEffects()`, clamped to `WORLD_STATE_RANGES`.

### Lore

President John Barron (Federalist, orange) vs Robin Clay (Farmer-Labor, green). VP Jay Bowman. Fed Chair Hayden Hartley. Palanthropic (PNTH): Chairwoman Andrea Dirks (pro-military) vs CEO Eugene Gottlieb (ethics). ~25 PNTH events with multi-step narrative chains. Event pool balanced (weighted avg mu/b deltas ~ 0). Player is a senior trader at **Meridian Capital**.

### Epilogue

`generateEpilogue(world, sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews)`: 4-page narrative from world state + portfolio + event log + player choices. Reputation synthesis (Insider/Principled/Speculator/Survivor/Kingmaker/Ghost) revealed on Page 4. Career arc from quarterly reviews, signature moment from impact history. Congressional diagrams, financial scorecards. Triggered at `TERM_END_DAY` (1008).

### LLM Integration

Browser-direct Anthropic API (`anthropic-dangerous-direct-browser-access` header). Structured tool use (`emit_events`, forced `tool_choice`). Full lore in system prompt. Key/model in localStorage (`shoals_llm_key`, `shoals_llm_model`). Batches pre-fetched.

## Key Patterns

- **`$` DOM cache**: populated by `cacheDOMElements($)`, passed to all ui.js functions
- **Dirty flag**: `dirty = true` on state change; rAF loop skips render when false
- **Module separation**: simulation.js/portfolio.js = state, ui.js = DOM, chart.js/strategy.js = renderers, main.js = orchestrator
- **`market` shared state**: single-writer (main.js via `syncMarket`), multiple readers
- **Custom event bus**: `shoals:*` events from ui.js -> main.js
- **Chain event delegation**: 3 listeners on container, not per-cell. Bound once (`_chainClicksBound`)
- **Tree reuse**: every module owns reusable trees -- chain.js (`_rTree`/`_rGreekTrees`), portfolio.js (`_greekTrees`/`_gt`), position-value.js (`_tree`), strategy.js (per-leg `info.tree`)
- **Strategies in localStorage**: `shoals_strategies` key, hash-based IDs. Built-ins are const in `strategy-store.js`, never in localStorage. `currentStrategyHash` in main.js tracks loaded user strategy.
- **Relative legs**: all saved strategies store `strikeOffset` / `dteOffset`, resolved at execution time via `resolveLegs()`.
- **Price impact overlays**: Layer 3 param shifts (`_savedOverlays`) applied before `beginDay()`, removed after `finalizeDay()`. Layer 1 impact is a pure overlay computed from decaying cumulative volume — never mutates `sim.S`. `getStockImpact(sigma)` and `getOptionImpact(...)` called by position-value.js, chain.js, ui.js, and main.js for display/valuation.
- **Popup queue**: `_popupQueue` in main.js. Popups queued from `maybeFire()` and `evaluatePortfolioPopups()`. Processed at end-of-day and on overlay close. FIFO, one at a time.
- **Player choices**: `playerChoices` map (flag → day) in main.js. Set by popup choice `playerFlag`. Read by epilogue and subsequent popup `trigger()` conditions.
- **Cumulative volume**: `price-impact.js` tracks buy/sell volume (stock + per-strike options). Decays every substep via `decayImpactVolumes()` with `VOLUME_HALF_LIFE` (1 day). `rehedgeMM(positions)` called each substep adds incremental MM hedge volume. Impact = `coeff * sigma * sqrt(cumVol / ref)`. Fill cost is the marginal sqrt increment. Volume persists and decays gradually.
- **Dynamic MM rehedging**: `rehedgeMM` computes `sum(delta * qty)` for all player option positions each substep. Diff from `_mmCurrentHedge` is recorded as stock cumulative volume. Position closes are handled naturally — removed positions reduce required hedge on next rehedge call.

## Gotchas

- **Signed qty, no side field** -- `qty > 0` = long, `qty < 0` = short. No `side` property.
- **`sim.history` is `HistoryBuffer`** -- `.get(day)`, `.last()`, `.minDay`/`.maxDay`. Not array-indexable.
- **`sim._partial` pushed by reference** -- `beginDay()` pushes, `substep()` mutates in-place. Do not clone mid-day.
- **`dayInProgress` must be reset** on preset load and sim reset. Pausing does NOT finalize the day.
- **`chart._lerp.day = -1`** disables live candle rendering. Must set on reset.
- **`portfolio` singleton** -- `resetPortfolio()` mutates in place. Never replace the reference.
- **Chain table rebuilt every call** -- never cache cell refs. Delegation bound once, never re-bind.
- **Trade dialog confirm cloned** on each open to avoid stacking listeners.
- **`eventEngine` null in non-Dynamic** -- always guard. `maybeFire()` returns `{ fired, popups }`.
- **Event deltas additive and clamped** to `PARAM_RANGES` -- never set absolute values.
- **`_pendingFollowups` cleared on reset** -- switching presets drops scheduled followups.
- **`_haptics` guard required** -- `if (typeof _haptics !== 'undefined')`. Modules may execute before global loads.
- **Vasicek rate can go negative** -- tree handles via per-step `pu` clamped to [0,1].
- **`q` NOT in GBM drift** -- stock grows at `mu`, not `mu - q`. Only discrete quarterly drops.
- **`computeEffectiveSigma` takes variance** (not vol). Includes vol-of-vol convexity when `xi > 0`.
- **Dual pricing shares `_V` buffer** -- `_priceCore` after `_pricePairCore` overwrites call values. Pair uses `_cf*`/`_pf*` intermediates, single uses `_f*`.
- **`ExpiryManager` is stateful** -- lives in main.js, `.init()` on reset, `.update()` each tick.
- **`speed` variable removed** -- use `SPEED_OPTIONS[speedIndex]` directly.
- **`priceAmerican` removed** -- all pricing uses `prepareTree` + `priceWithTree`. Each module owns its own reusable tree(s). Do NOT re-add `priceAmerican` or its transparent cache.
- **`portfolio.strategies` removed** -- strategies live in localStorage via `strategy-store.js`. Do NOT add strategy storage back to portfolio.
- **Strategy legs are relative** -- stored as `strikeOffset`/`dteOffset` (or `null` for selectable expiry). Use `legsToRelative()` to convert from absolute, `resolveLegs()` to convert back. In-memory `strategyLegs` in main.js use absolute values with `_refS`/`_refDay` for display.
- **Shared expiry** (internal: `selectableExpiry`) -- UI label "Shared Expiry". When `selectableExpiry: true`, option legs store `dteOffset: null` and use the expiry dropdown's selection at execution/load time. Most built-in strategies use shared expiry; calendar spreads use fixed `dteOffset` (63/126 days) since they need different expiries per leg.
- **Position netting includes `strategyName`** -- two strategies with the same type/strike/expiry but different names create separate positions.
- **`syncMarket` after `prepopulate`** -- must call `syncMarket(sim)` after `sim.prepopulate()` in both `init()` and `_resetCore()` or market params (v, kappa, theta, xi, rho) will be zero.
- **`strategyBaseQty` on positions** -- set at first strategy execution, preserved through netting. Used by portfolio-renderer to compute execution multiplier vs per-unit leg quantities.
- **`executeWithRollback` toast uses `execMult`** -- the multiplier passed from the caller, NOT derived from the netted position. Toast shows net debit (sum of fill × qty × sign), not cash change (which includes margin reserves for short legs).
- **`executeMarketOrder` takes `sim` first** -- signature is `(sim, type, side, qty, ...)`. All portfolio functions that execute trades (`closePosition`, `checkPendingOrders`, `processExpiry`, `liquidateAll`) also take `sim` as first parameter.
- **`_fillPrice` includes slippage** -- signature is `(sim, type, side, qty, mid, currentPrice, strike, currentVol, expiryDay, currentDay)`. Bonds skip slippage (spread only). Fills clamped to $0.01 minimum. Stock/option fills record cumulative volume via `recordStockTrade`/`recordOptionTrade` and add the marginal fill cost. MM delta hedging is handled dynamically by `rehedgeMM()` each substep, not at fill time.
- **`showToast` takes `(message, duration)` only** -- duration is numeric milliseconds, NOT a severity string. No severity parameter exists.
- **`scheduleFollowup` structure** -- must push `{ event, chainId, targetDay, weight, depth }` matching `_checkFollowups` format. Do NOT use `{ id, fireDay }`.
- **Impact state must be reset** -- `resetImpactState()`, `resetPopupCooldowns()`, and `resetCompliance()` in `_resetCore()`. `decayImpactVolumes()` runs every substep (in `frame()`, `tick()`, and step-button path). `resetPopupCooldowns()` also clears `_usedTips`.
- **Impact is an overlay, not a mutation** -- `sim.S` is never modified by trades. Stock impact is computed from decaying cumulative volume via `getStockImpact(sigma)`. Option impact per-strike via `getOptionImpact(...)`. Both require current `sigma` at read time. Only `resetImpactState()` clears cumulative volumes (on sim reset).
- **Compliance triggers use notional, not delta** -- `_shortDirectionalNotional()` and `_longDirectionalNotional()` account for directional exposure (long put = short, short put = long). Do not use raw `qty` sign for directional classification.
- **`close_short` is directional** -- closes short stock, short calls, AND long puts (all short-directional). Similarly `close_long` closes long stock, long calls, short puts.
- **Compliance game over triggers epilogue** -- `_showComplianceTermination()` calls `_showEpilogue('compliance')`, not `_resetCore()`. The epilogue shows a "fired for cause" ending.
- **Event-pool events have no popups** -- all ~277 events in `event-pool.js` fire as toasts only. Popup decision events live exclusively in `popup-events.js`.
- **Insider tip events use `_tipAction` flag** -- choices with `_tipAction: true` trigger tip scheduling in the choice handler. The tip is rolled (70/30 real/fake) at choice time, not at followup time.
- **Always use `unitPrice()` for pricing** -- canonical pricing function in position-value.js. Includes vol surface (term structure + skew) and impact overlay (stock + per-strike options). Use it for fills, net cost, entry cost, mark-to-market, and margin. The only exception is payoff curve sampling in strategy.js, which evaluates at many hypothetical stock prices via direct tree pricing. Do NOT use direct tree pricing or raw `sim.S` for display/valuation.
- **`computeEffectiveSigma` signature** -- `(v, T, kappa, theta, xi)` — takes variance `v`, NOT vol. Do NOT pass extra args (S, K, rho) — those go to `computeSkewSigma`.
- **No nested `.glass`** -- elements inside a `.glass` panel should NOT also have `.glass` class. Nested backdrop-filter stacks, making inner elements more opaque. Use `bg-hover` or `bg-elevated` for differentiation within glass panels.
- **`fmtDollar` appends "k"** -- portfolio-scale dollar values only. Per-unit prices (fills, strategy net debit, breakevens, trigger prices) use raw `$X.XX`. Do NOT use `fmtDollar` for per-unit values.
- **Portfolio value vs benchmark** -- colored by `totalValue - buyHoldValue` (buy-and-hold = `initialCapital / 100 * currentPrice`). Both sparklines (portfolio value, rate) always use `--text` CSS var, not accent or pnl colors. Theme toggle calls `updateUI()` to redraw with the correct `--text` value.
- **`portfolioHistory` ring buffer** -- lives in main.js, pushed once per day in `_onDayComplete()`. Passed to `updatePortfolioDisplay()` as 9th arg. Prepopulated with buy-and-hold performance (`initialCapital / 100 * bar.close`) from history bars, so sparkline shows stock tracking instead of a flat line.
- **Greek coloring is per-Greek, not pnl-based** -- DO NOT toggle `pnl-up`/`pnl-down` on Greek values. They are colored by CSS via `--delta`/`--gamma`/`--theta`/`--vega`/`--rho` vars. Both portfolio and strategy tabs use the same pattern.
- **Strategy tab Greeks use entry day, not slider** -- `computeSummary` passes `entryDay` (not `evalDay`) to `_precomputeLegs` for the Greek computation, so Greeks always reflect current time regardless of slider position. The P&L curve and chart overlays still follow the slider.
- **Strategy pending orders** -- `placePendingOrder` accepts `legs` array and `execMult` for multi-leg orders. These have `type: null, side: null, qty: null` with `order.legs` containing the resolved/scaled leg array. `checkPendingOrders` detects `order.legs` and runs rollback execution. Strategy limit orders trigger when `currentPrice <= triggerPrice`; strategy stop orders trigger when `currentPrice >= triggerPrice`.
- **No Total P&L row** -- removed from HTML. Do NOT re-add `$.totalPnl` references.
