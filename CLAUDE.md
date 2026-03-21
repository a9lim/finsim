# CLAUDE.md

Part of the **a9l.im** portfolio. See parent `site-meta/CLAUDE.md` for the shared design system. Sibling projects: `physsim`, `biosim`, `gerry`.

## Style Rule

Never use the phrase "retarded potential(s)" in code, comments, or user-facing text. Use "signal delay" or "finite-speed force propagation" instead.

## Testing

Do not manually test via browser automation. The user will test changes themselves and provide feedback.

## Overview

Shoals -- interactive options trading simulator. GBM stock with Merton jumps + Heston stochastic vol; Vasicek interest rates. American options priced via CRR binomial tree (128 steps) with term-structure vol, moneyness skew, per-step Vasicek rate discounting. Strategy builder, full options chain, portfolio/margin system, narrative event engine with political lore and epilogue.

Zero dependencies -- vanilla HTML5/CSS3/JS with ES6 modules. No build step.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Serve from `a9lim.github.io/` -- shared files load via absolute paths (`/shared-*.js`, `/shared-base.css`).

## File Map

```
main.js               1199 lines  Orchestrator: DOM cache $, rAF loop, sub-step streaming,
                                   live candle animation, camera, shortcuts, event wiring,
                                   strategy builder (with rollback), ExpiryManager, world state
index.html              601 lines  Toolbar, chart/strategy canvases, sidebar (4 tabs),
                                   chain/trade/margin-call/reference/epilogue overlays, intro
styles.css              918 lines  Chain, positions, strategy, trade dialog, margin alert,
                                   P&L/Greek colors, responsive breakpoints
colors.js                59 lines  Financial color aliases (up/down/call/put/stock/bond/
                                   delta/gamma/theta/vega/rho), CSS var injection
src/
  config.js              74 lines  All constants (timing, instruments, margin, spreads, events,
                                   rendering), PRESETS (5 static + 2 dynamic), DEFAULT_PRESET=5
  simulation.js         248 lines  GBM + Merton + Heston + Vasicek; beginDay()/substep()/
                                   finalizeDay() pipeline; prepopulate() reverse-backfill
  pricing.js            888 lines  CRR binomial tree: term-structure vol, moneyness skew,
                                   Vasicek per-step discounting, discrete dividends. Dual
                                   call+put induction. Vasicek bond pricing + duration.
                                   Tree reuse API for zero-alloc pricing.
  chain.js              230 lines  ExpiryManager, generateStrikes(), buildChainSkeleton(),
                                   priceChainExpiry() with reusable tree pool
  portfolio.js         1035 lines  Signed-qty positions, market/limit/stop orders, netting,
                                   strategy execution, cash/margin, borrow interest, dividends,
                                   option expiry, bid/ask spreads
  chart.js              720 lines  ChartRenderer: log Y-axis OHLC candles, live candle cubic
                                   interpolation, position markers, strike lines; shared-camera.js
  strategy.js           933 lines  StrategyRenderer: payoff P&L, Greek overlays, breakevens,
                                   input-keyed caching, precomputed per-leg entry values
  ui.js                 896 lines  DOM binding, display updaters, overlay management;
                                   delegates to chain-renderer.js and portfolio-renderer.js
  events.js             453 lines  EventEngine: Poisson scheduler, MTTH followup chains, Fed
                                   schedule, boredom boost, midterms. Re-exports PARAM_RANGES.
  event-pool.js        2933 lines  ~88 curated offline events (Fed, macro, sector, PNTH,
                                   neutral/flavor). Exports OFFLINE_EVENTS, PARAM_RANGES,
                                   getEventById(). World-state structured effects on events.
  world-state.js        170 lines  Mutable narrative state: congressional seats (Senate/House
                                   by party), PNTH board factions, geopolitical escalation,
                                   Fed credibility, investigations, election cycle.
                                   Exports: createWorldState(), congressHelpers(),
                                   WORLD_STATE_RANGES, applyStructuredEffects()
  llm.js                271 lines  LLMEventSource: Anthropic API via structured tool use,
                                   universe lore in system prompt, offline fallback
  epilogue.js           449 lines  generateEpilogue(): 4-page narrative ending from world
                                   state + portfolio + event log. Congressional diagrams,
                                   financial scorecards. Triggered at TERM_END_DAY (1008).
  market.js              27 lines  Shared mutable market state + syncMarket(sim). Leaf module.
  history-buffer.js     103 lines  Ring buffer (capacity 252) for OHLC bars
  format-helpers.js      59 lines  fmtDollar(), fmtNum(), pnlClass(), fmtDte(), fmtRelDay()
  strategy-store.js    215 lines  Built-in strategy defs (8 presets), localStorage CRUD
                                   (hash IDs), resolveLegs, formatLeg, computeNetCost,
                                   legsToRelative
  position-value.js      82 lines  computePositionValue(), computePositionPnl()
  chain-renderer.js     314 lines  Chain table DOM with event delegation: renderChainInto(),
                                   rebuildExpiryDropdown(), buildStockBondTable(), posKey()
  portfolio-renderer.js  307 lines  Portfolio display with DOM diffing
  reference.js          659 lines  30 reference entries with KaTeX math
  theme.js                9 lines  initTheme(), toggleTheme() (delegates to _toolbar)
```

## Module Dependencies

```
main.js
  |- config.js             (constants, PRESETS)
  |- simulation.js         (imports config, history-buffer)
  |- market.js             (leaf module -- single-writer main.js, multiple readers)
  |- chain.js              (imports pricing, portfolio, market, config)
  |- portfolio.js          (imports pricing, market, config, position-value)
  |- events.js             (imports event-pool)
  |- event-pool.js         (OFFLINE_EVENTS, PARAM_RANGES, getEventById)
  |- llm.js                (imports events)
  |- world-state.js        (createWorldState, congressHelpers, applyStructuredEffects)
  |- epilogue.js           (imports position-value, config)
  |- chart.js              (imports format-helpers; reads _PALETTE globals)
  |- strategy.js           (imports pricing, market, config)
  |- strategy-store.js     (imports pricing, portfolio, market, config)
  |- ui.js                 (imports format-helpers, chain-renderer, portfolio-renderer, portfolio)
  |- chain-renderer.js     (imports format-helpers; reads _haptics globals)
  |- portfolio-renderer.js (imports position-value, format-helpers)
  |- format-helpers.js     (imports config)
  |- position-value.js     (imports pricing, market, config)
  |- reference.js          (data only)
  +- theme.js              (delegates to _toolbar)
```

## Data Flow

### Sub-Step Streaming (playing)

1. `frame()` calls `sim.beginDay()` -- pushes partial bar into `sim.history` by reference
2. 16 sub-steps paced across tick interval. Each `sim.substep()` mutates partial bar in-place
3. `chart.setLiveCandle(bar)` does smoothstep cubic interpolation between sub-step values
4. `_onSubstep()`: checks pending orders, reprices visible chain expiry, updates portfolio/UI
5. After 16 sub-steps, `sim.finalizeDay()`. `_onDayComplete()`: borrow interest, expiry, dividends (quarterly), event engine, margin check, skeleton rebuild

### Bootstrap

`sim.prepopulate()` backfills 252-bar history: simulates forward from target state (S=100, v=theta, r=b), then reverses the path. `ExpiryManager` and rate sparkline initialized after.

### Pause / Step

Pausing mid-day leaves the partial bar frozen. Step button finishes any partial day instantly. `sim.tick()` = full day (beginDay + 16 substeps + finalizeDay).

## Simulation Models

**Stock**: GBM + Merton jumps + Heston stoch vol (Milstein, full truncation). Correlated Brownian via Cholesky. Dividends discrete quarterly, NOT in drift.

```
dS/S = (mu - lambda*k - 0.5*v)dt + sqrt(v)*dW1 + J*dN(lambda)
dv   = kappa(theta - v)dt + xi*sqrt(v)*dW2      (dW1*dW2 = rho*dt)
```

**Rate**: Vasicek `dr = a(b-r)dt + sigmaR*dW3` (independent). Can go negative.

**Reset**: S=100, v=theta, r=b. 5 static presets + 2 dynamic (Offline/LLM). See `config.js` for values.

## Options Pricing

CRR binomial tree (128 steps) for American options. Per-strike volatility via:
- **Term-structure**: Heston integrated variance + vol-of-vol convexity (Gatheral 2006)
- **Skew**: first-order Heston `rho*xi/(2*sigma)` + quadratic curvature, dampened by mean-reversion

Per-step Vasicek rate discounting. Discrete proportional dividends at `QUARTERLY_CYCLE` boundaries. Dual call+put backward induction shares loop overhead for chain pricing.

**Greeks**: finite-difference (7 tree inductions per option). Delta/gamma from tree steps 1&2, theta/vega/rho via central differences.

**Bonds**: Vasicek closed-form. Duration `B(T) = (1 - e^{-aT})/a` caps at `1/a`.

**Spreads**: volatility-aware. `computeBidAsk` (stock/bond) and `computeOptionBidAsk` (adds moneyness). Long fills at ask, short at bid.

## Options Chain

ATM = `round(S/5)*5`, 12 strikes each side (up to 25). `ExpiryManager` maintains 8 rolling expiries on 63-day cycle.

**Lazy pricing**: `buildChainSkeleton()` returns metadata only. `priceChainExpiry()` prices one expiry on demand -- sidebar uses price-only (25 dual inductions/substep), full chain overlay adds Greeks (175 inductions). Pre-allocated tree pool for zero GC.

## Portfolio System

**Positions**: signed qty (`qty > 0` = long, `< 0` = short). Types: stock, bond (zero-coupon, face $100), call, put. Netting by `type + strike + expiryDay`.

**Orders**: market (instant), limit (trigger price), stop (trigger -> market).

**Margin**: short stock/bond 50% initial / 25% maintenance. Short options `max(20%*S*qty, premium*qty)`. Long on margin: Reg-T 50%/25%. `_postTradeMarginOk()` prevents trades that would immediately trigger margin call.

**Borrow interest**: daily on short stock/bond + negative cash. Does NOT apply to short options.

**Dividends**: every `QUARTERLY_CYCLE` (63) days. Stock drops by `q/4`, cash paid to/from shareholders.

**Expiry**: bonds at face ($100). ITM option longs auto-exercised. Short ITM NOT assigned (simplified).

**Strategy**: legs in `main.js` (`strategyLegs[]`). Execution rolls back all legs on partial failure.

## UI Architecture

Floating glass panels over full-viewport canvas. Fixed topbar, right slide-in sidebar (4 tabs: Trade/Portfolio/Strategy/Settings), bottom pill bar.

**Overlays**: chain (pauses sim), trade dialog (confirm button cloned each open), margin call, reference (KaTeX, 30 entries), epilogue (4-page narrative).

**Custom events**: `shoals:closePosition`, `shoals:exerciseOption`, `shoals:cancelOrder` -- ui.js -> main.js.

**Strategy tab**: sets `strategyMode = true`, pauses sim, shows strategy canvas + time-to-expiry slider (percentage maps to `evalDay`, clamped to min DTE).

## Dynamic Regime

Two dynamic presets use `EventEngine` (events.js) + event pool (event-pool.js):
- **Offline** (preset 5, default): draws from 88 curated events via weighted random
- **LLM** (preset 6): Claude API generates batches, offline fallback on failure

### Event Scheduling

- **Fed**: every ~32 days (with jitter). Excluded from Poisson pool.
- **Non-Fed**: Poisson rate 1/30 with 8-15 day cooldown (effective ~1/41.5). Boredom boost after 3 minor events.
- **PNTH earnings**: quarterly (~63 days with jitter)
- **Followups**: MTTH chains, Poisson-sampled delay, recursive (max depth 5)
- **Midterm elections**: day 504, campaign season from day 440. Term ends day 1008.

### World State

`world-state.js` tracks persistent narrative state consumed by events and epilogue:
- **Congress**: Senate/House seats by party (Federalist vs Farmer-Labor)
- **PNTH board**: Dirks/Gottlieb faction balance, investigation status
- **Geopolitical**: escalation level, active conflicts
- **Fed**: credibility score, Hartley's independence
- **Elections**: campaign phase, midterm results

Events apply `structuredEffects` via `applyStructuredEffects()`, clamped to `WORLD_STATE_RANGES`.

### Lore

President John Barron (Federalist, orange) vs Robin Clay (Farmer-Labor, green). VP Jay Bowman. Fed Chair Hayden Hartley. Palanthropic (PNTH): Chairwoman Andrea Dirks (pro-military) vs CEO Eugene Gottlieb (ethics). ~25 PNTH events with multi-step narrative chains. Event pool balanced (weighted avg mu/b deltas ~ 0).

### Epilogue

`generateEpilogue()`: 4-page narrative from world state + portfolio + event log. Congressional diagrams, financial scorecards. Triggered at `TERM_END_DAY` (1008).

### LLM Integration

Browser-direct Anthropic API (`anthropic-dangerous-direct-browser-access` header). Structured tool use (`emit_events`, forced `tool_choice`). Full lore in system prompt. Key/model in localStorage (`shoals_llm_key`, `shoals_llm_model`). Batches pre-fetched.

## Key Patterns

- **`$` DOM cache**: populated by `cacheDOMElements($)`, passed to all ui.js functions
- **Dirty flag**: `dirty = true` on state change; rAF loop skips render when false
- **Module separation**: simulation.js/portfolio.js = state, ui.js = DOM, chart.js/strategy.js = renderers, main.js = orchestrator
- **`market` shared state**: single-writer (main.js via `syncMarket`), multiple readers
- **Custom event bus**: `shoals:*` events from ui.js -> main.js
- **Chain event delegation**: 3 listeners on container, not per-cell. Bound once (`_chainClicksBound`)
- **Tree reuse**: chain.js pre-allocates `_rTree`/`_rGreekTrees`; `_rResult` singleton consumed synchronously
- **Strategies in localStorage**: `shoals_strategies` key, hash-based IDs. Built-ins are const in `strategy-store.js`, never in localStorage. `currentStrategyHash` in main.js tracks loaded user strategy.
- **Relative legs**: all saved strategies store `strikeOffset` / `dteOffset`, resolved at execution time via `resolveLegs()`.

## Gotchas

- **Signed qty, no side field** -- `qty > 0` = long, `qty < 0` = short. No `side` property.
- **`sim.history` is `HistoryBuffer`** -- `.get(day)`, `.last()`, `.minDay`/`.maxDay`. Not array-indexable.
- **`sim._partial` pushed by reference** -- `beginDay()` pushes, `substep()` mutates in-place. Do not clone mid-day.
- **`dayInProgress` must be reset** on preset load and sim reset. Pausing does NOT finalize the day.
- **`chart._lerp.day = -1`** disables live candle rendering. Must set on reset.
- **`portfolio` singleton** -- `resetPortfolio()` mutates in place. Never replace the reference.
- **Chain table rebuilt every call** -- never cache cell refs. Delegation bound once, never re-bind.
- **Trade dialog confirm cloned** on each open to avoid stacking listeners.
- **`eventEngine` null in non-Dynamic** -- always guard. `maybeFire()` returns array (may be empty).
- **Event deltas additive and clamped** to `PARAM_RANGES` -- never set absolute values.
- **`_pendingFollowups` cleared on reset** -- switching presets drops scheduled followups.
- **`_haptics` guard required** -- `if (typeof _haptics !== 'undefined')`. Modules may execute before global loads.
- **Vasicek rate can go negative** -- tree handles via per-step `pu` clamped to [0,1].
- **`q` NOT in GBM drift** -- stock grows at `mu`, not `mu - q`. Only discrete quarterly drops.
- **`computeEffectiveSigma` takes variance** (not vol). Includes vol-of-vol convexity when `xi > 0`.
- **Dual pricing shares `_V` buffer** -- `_priceCore` after `_pricePairCore` overwrites call values. Pair uses `_cf*`/`_pf*` intermediates, single uses `_f*`.
- **`ExpiryManager` is stateful** -- lives in main.js, `.init()` on reset, `.update()` each tick.
- **`speed` variable removed** -- use `SPEED_OPTIONS[speedIndex]` directly.
- **`portfolio.strategies` removed** -- strategies now live in localStorage via `strategy-store.js`. Do NOT add strategy storage back to portfolio.
- **Strategy legs are relative** -- stored as `strikeOffset`/`dteOffset`. Use `legsToRelative()` to convert from absolute, `resolveLegs()` to convert back. In-memory `strategyLegs` in main.js use absolute values with `_refS`/`_refDay` for display.
