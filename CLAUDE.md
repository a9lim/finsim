# CLAUDE.md

Part of the **a9l.im** portfolio. See parent `site-meta/CLAUDE.md` for the shared design system specification. Sibling projects: `physsim`, `biosim`, `gerry`.

## Style Rule

Never use the phrase "retarded potential(s)" in code, comments, or user-facing text. Use "signal delay" or "finite-speed force propagation" instead.

## Testing

Do not manually test via browser automation. The user will test changes themselves and provide feedback.

## Overview

Shoals -- interactive options trading simulator. Models a stock as geometric Brownian motion with Merton jumps and Heston stochastic volatility; the risk-free rate follows a Vasicek process. Users buy and sell the underlying stock, zero-coupon bonds, and American options (calls/puts). Options priced via Bjerksund-Stensland 2002. Strategy builder with payoff diagrams and Greek overlays, full interactive options chain, portfolio/margin system.

Zero dependencies -- vanilla HTML5/CSS3/JS with ES6 modules. No build step.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Serve from `a9lim.github.io/` -- shared files load via absolute paths (`/shared-*.js`, `/shared-base.css`). ES6 modules require HTTP.

## File Map

```
main.js                810 lines  Entry point: DOM cache $, rAF loop, sub-step streaming,
                                   live candle animation, camera, shortcuts, event wiring,
                                   strategy builder (with rollback), auto-scroll, ExpiryManager
index.html             500 lines  Toolbar, chart/strategy canvases, sidebar (4 tabs:
                                   Trade/Portfolio/Strategy/Settings), chain overlay,
                                   trade dialog, margin call overlay, intro screen
styles.css             800 lines  Project CSS: chain table, position rows, strategy builder,
                                   trade dialog, margin alert, P&L coloring, Greek value
                                   colors, time slider, responsive breakpoints
colors.js               59 lines  Financial color aliases (_PALETTE.up/down/call/put/stock/
                                   bond/delta/gamma/theta/vega/rho), CSS var injection,
                                   freezes _PALETTE
src/
  config.js             26 lines  Named constants and PRESETS array (5 static + 2 dynamic regimes)
  format-helpers.js     48 lines  Shared formatting: fmtDollar(), fmtNum(), pnlClass(),
                                   fmtDte(), fmtRelDay(), posTypeLabel(). Single source for UI modules.
  position-value.js    ~40 lines  Unified position valuation: computePositionValue(),
                                   computePositionPnl(). Imports pricing, config.
  chain-renderer.js   ~220 lines  Chain table DOM building with event delegation:
                                   renderChainInto(), rebuildExpiryDropdown(),
                                   buildStockBondTable(), posKey(). Position indicators:
                                   accepts posMap param, applies .pos-long/.pos-short
                                   CSS classes to cells with positions.
  portfolio-renderer.js ~190 lines Portfolio display with DOM diffing:
                                   updatePortfolioDisplay(). Extracted from ui.js.
  events.js          ~500 lines  EventEngine: Poisson scheduler, MTTH followup chains,
                                   offline event pool (~88 curated events for Palanthropic/PNTH),
                                   PARAM_RANGES canonical clamping. Shared by offline and LLM modes.
  history-buffer.js    103 lines  HistoryBuffer: fixed-capacity (252) ring buffer for OHLC bars
  llm.js             ~170 lines  LLMEventSource: Anthropic API via structured tool use
                                   (emit_events tool with JSON schema, forced via tool_choice).
                                   Full universe lore in system prompt. Fallback to offline on failure.
  simulation.js        245 lines  GBM + Merton jumps + Heston stoch vol + Vasicek rate;
                                   beginDay()/substep()/finalizeDay() sub-step pipeline;
                                   prepopulate() synthetically backfills buffer via reverse
  pricing.js           435 lines  Bjerksund-Stensland 2002 American option pricing + bivariate
                                   normal CDF (Drezner-Wesolowsky 1990) + finite-diff Greeks.
                                   Exports: priceAmerican, computeGreeks
  chain.js             170 lines  ExpiryManager (rolling 8-expiry window, 63-day cycle),
                                   generateStrikes(), buildChainSkeleton(),
                                   priceChainExpiry() (lazy per-expiry pricing)
  portfolio.js         770 lines  Signed-qty positions, market/limit/stop orders, netting,
                                   strategy groups, cash/margin, chargeBorrowInterest() (short
                                   stock/bond daily borrow cost), processExpiry() (options + bonds),
                                   exerciseOption(), aggregateGreeks(), liquidateAll(),
                                   computeBidAsk(), computeOptionBidAsk()
  chart.js             650 lines  ChartRenderer: log Y-axis OHLC candles, auto-scale, grid,
                                   crosshair, position markers, strike lines, live candle
                                   cubic interpolation (smoothstep), setSubstepInterval(),
                                   batched wick drawing; uses shared-camera.js
                                   (worldToScreenX/screenToWorldX scalar methods) for pan/zoom
  strategy.js          830 lines  StrategyRenderer: payoff P&L diagram, Greek overlays,
                                   breakeven dots, scroll-wheel X zoom, clickable legend,
                                   computeSummary(). Input-keyed caching (_cache, _summaryCache)
                                   skips re-pricing when inputs unchanged. Precomputed per-leg
                                   entry values (_precomputeLegs). Per-leg T from
                                   evalDay/entryDay. No shared-camera.js.
  ui.js                670 lines  cacheDOMElements(), bindEvents(), updateChainDisplay(),
                                   rebuildTradeDropdown(), rebuildStrategyDropdown(),
                                   updateStrategyChainDisplay(), updateGreeksDisplay(),
                                   showChainOverlay(), showMarginCall(),
                                   toggleStrategyView(), renderStrategyBuilder(),
                                   updateStockBondPrices(), updateStrategySelectors();
                                   delegates to chain-renderer.js and portfolio-renderer.js
  theme.js              20 lines  initTheme(), toggleTheme() (2-state: light/dark)
```

## Module Dependencies

```
main.js
  |- src/config.js        (SPEED_OPTIONS, PRESETS, INTRADAY_STEPS, BOND_FACE_VALUE)
  |- src/simulation.js    (Simulation -- imports config, history-buffer)
  |- src/history-buffer.js (HistoryBuffer -- no imports)
  |- src/chain.js         (buildChainSkeleton, priceChainExpiry, generateStrikes,
  |                         ExpiryManager -- imports pricing, portfolio, config)
  |- src/portfolio.js     (portfolio, resetPortfolio, executeMarketOrder, computeBidAsk,
  |                         checkPendingOrders, chargeBorrowInterest, processExpiry,
  |                         checkMargin, aggregateGreeks, closePosition, exerciseOption,
  |                         liquidateAll, placePendingOrder, cancelOrder, saveStrategy,
  |                         executeStrategy -- imports pricing, config, position-value)
  |- src/events.js      (EventEngine, OFFLINE_EVENTS, PARAM_RANGES -- no imports)
  |- src/llm.js         (LLMEventSource -- imports events.js)
  |- src/chart.js         (ChartRenderer -- imports format-helpers; reads _PALETTE, _r globals)
  |- src/strategy.js      (StrategyRenderer -- imports pricing, config)
  |- src/format-helpers.js  (fmtDollar, fmtNum, pnlClass, fmtDte, fmtRelDay, posTypeLabel -- imports config)
  |- src/position-value.js  (imports pricing, config)
  |- src/chain-renderer.js  (posKey, renderChainInto, rebuildExpiryDropdown,
  |                         buildStockBondTable, buildChainTable, bindChainTableClicks
  |                         -- imports format-helpers; reads _haptics globals)
  |- src/portfolio-renderer.js (imports position-value, format-helpers)
  |- src/ui.js            (cacheDOMElements, bindEvents, display updaters -- imports
  |                         format-helpers, chain-renderer, portfolio-renderer;
  |                         reads _haptics, showToast, createInfoTip globals)
  +- src/theme.js         (initTheme, toggleTheme -- no imports)
```

## Data Flow

### Animated Sub-Step Streaming (playing)

1. `frame()` calls `sim.beginDay()` -- pushes a partial bar into `sim.history` by reference
2. Sub-steps paced across tick interval (`tickInterval / INTRADAY_STEPS`). Each `sim.substep()` mutates partial bar in-place
3. `chart.setLiveCandle(bar)` snaps close to previous sub-step value, starts a new cubic interpolation segment toward the new target. Smoothstep (`t²(3-2t)`) fills the full substep interval so the candle is always in motion. High/low are water marks of the interpolated path
4. After each substep batch, `_onSubstep()` runs: `checkPendingOrders()` (fills limit/stop orders at intraday price), reprices the visible chain expiry (50 `priceAmerican` calls), updates portfolio mark-to-market, rate display, and strategy builder
5. After 16 sub-steps, `sim.finalizeDay()` increments day. `_onDayComplete()` runs `chargeBorrowInterest()`, `processExpiry()`, `buildChainSkeleton()`, `checkMargin()`, auto-scroll, full UI update with dropdown rebuild

### Instant Tick

`sim.tick()` = `beginDay()` + 16 `substep()` + `finalizeDay()`. Used by step button and `prepopulate()`.

### Pause Behavior

Pausing mid-day leaves the partial bar frozen. Resuming continues from where it left off. Step button finishes any partial day instantly.

### Bootstrap

`sim.prepopulate()` synthetically backfills the 252-bar HistoryBuffer: simulates forward from the target state (S=100, v=theta, r=b), then reverses the path so history naturally arrives at those values. No price scaling. `ExpiryManager` initialized after prepopulation. Rate history sparkline (`rateHistory`) also populated from the backfilled bars.

## Simulation Engine

### Stock Price Model

GBM with Merton jumps and Heston stochastic volatility (Euler-Maruyama, full truncation):

```
dS/S = (mu - lambda*k - 0.5*v)dt + sqrt(v) * dW1 + J * dN(lambda)
dv   = kappa(theta - v)dt + xi*sqrt(v) * dW2      (dW1*dW2 = rho*dt)
```

Correlated Brownian via Cholesky. Variance floored at 0. Box-Muller for normals, inverse-transform for Poisson.

### Interest Rate Model

Vasicek: `dr = a(b - r)dt + sigmaR * dW3` (independent of dW1, dW2). Rate unconstrained (can go negative).

### OHLC Sub-Step Pipeline

16 sub-steps per day at `dt = 1/(252 * 16)`:
1. **`beginDay()`** -- init partial bar, push to history by reference; caches `_sqrtDt` and `_sqrtOneMinusRhoSq`
2. **`substep()`** -- one step of stochastic model (with Ito correction), update partial in-place
3. **`finalizeDay()`** -- clear partial, increment day

### Market Regime Presets

| Preset | mu | theta | kappa | xi | rho | lambda | muJ | sigmaJ | a | b | sigmaR | borrowSpread |
|--------|-----|-------|-------|----|------|--------|------|--------|-----|------|--------|--------------|
| Calm Bull | 0.08 | 0.04 | 3.0 | 0.3 | -0.5 | 0.5 | -0.02 | 0.03 | 0.5 | 0.04 | 0.005 | 0.5 |
| Sideways | 0.02 | 0.06 | 2.0 | 0.4 | -0.6 | 1.0 | -0.01 | 0.04 | 0.5 | 0.03 | 0.008 | 0.5 |
| Volatile | 0.05 | 0.12 | 1.5 | 0.6 | -0.7 | 3.0 | -0.03 | 0.06 | 0.3 | 0.05 | 0.012 | 0.5 |
| Crisis | -0.10 | 0.25 | 0.5 | 0.8 | -0.85 | 8.0 | -0.08 | 0.10 | 0.2 | 0.02 | 0.020 | 0.5 |
| Rate Hike | 0.04 | 0.08 | 2.0 | 0.5 | -0.6 | 1.5 | -0.02 | 0.05 | 0.8 | 0.08 | 0.015 | 0.5 |

On reset: `S = 100`, `v = theta`, `r = b`. History cleared, prepopulated, camera repositioned.

## Options Pricing

### Bjerksund-Stensland 2002

Analytical approximation for American options. Computes perpetual exercise boundary, splits time at golden ratio, uses `_phi()` and `_psi()` helper functions. Falls back to European BS when early exercise is never optimal. Put pricing via put-call symmetry. Small floor `rEff = max(r, 1e-7)` prevents degenerate case. Bivariate normal CDF via Drezner-Wesolowsky 5-point Gauss-Legendre.

### Finite-Difference Greeks

| Greek | Method | Step |
|-------|--------|------|
| Delta | central diff in S | `h_S = S * 0.01` |
| Gamma | second central diff in S | same |
| Theta | central diff in T | `h_T = 1/252` (denominator adjusts near expiry) |
| Vega | central diff in sigma | `h_sigma = 0.001` |
| Rho | central diff in r | `h_r = 0.0001` |

9 pricing calls per option per `computeGreeks()` invocation.

### Bid/Ask Spread Model

All instruments use volatility-aware spreads. Two functions in `portfolio.js`. Callers pass `sigma = sqrt(v)` (not variance). Bids floored at 0.

**`computeOptionBidAsk(mid, S, K, sigma)`** -- options (includes moneyness):
```
halfSpread = max(0.025, mid * 0.01 * (1 + sigma) + 0.05 * |log(S/K)|)
bid = max(0, mid - halfSpread), ask = mid + halfSpread
```

**`computeBidAsk(mid, S, sigma)`** -- stock/bond (moneyness = 0):
```
halfSpread = max(0.025, mid * 0.01 * (1 + sigma))
bid = max(0, mid - halfSpread), ask = mid + halfSpread
```

Long fills at ask, short fills at bid. `chain.js` imports `computeOptionBidAsk` for chain construction. `_fillPrice()` in portfolio.js dispatches to the appropriate function. `closePosition()` uses `_fillPrice()` internally (no duplicated spread logic).

## Options Chain

### Strike Generation

ATM = `round(S / 5) * 5`. 12 strikes each side, filtered positive, sorted ascending -> up to 25 total.

### Expiry Management

`ExpiryManager` maintains 8 rolling expiry dates on a 63-day cycle (~quarterly). `update(currentDay)` drops expired, appends new. Returns `[{ day, dte }]`.

### Lazy Chain Architecture

The chain uses a two-tier lazy pricing model to avoid computing Greeks for all 8 expiries × 25 strikes on every update:

**`buildChainSkeleton(S, currentDay, expiries)`** returns the lightweight skeleton (no pricing calls):
```
[{ day, dte, strikes: number[] }]
```

**`priceChainExpiry(S, v, r, expiry, greeks?)`** prices a single expiry on demand:
- `greeks=false` (default): 50 `priceAmerican` calls (1 per option). Returns price + bid/ask, Greeks zeroed. Used for sidebar compact chain (updated every substep).
- `greeks=true`: 450 `computeGreeks` calls (9 per option). Returns full Greeks. Used only for the full chain overlay (delta column).

Expiry dropdown is rebuilt only when the skeleton changes (day complete, reset) via `rebuildExpiryDropdown()`, not on every substep reprice.

## Portfolio System

### Position Types

Signed qty: `qty > 0` = long, `qty < 0` = short. No `side` field on positions.

- **stock** -- long/short shares
- **bond** -- zero-coupon, face $100, maturity aligned with chain expiry dates
- **call/put** -- American, any strike/expiry

### Netting

`executeMarketOrder()` finds matching `type + strike + expiryDay`. Same direction extends, opposite reduces/closes/flips. Returns position object with `entryPrice` (original entry) and `fillPrice` (this order's actual fill price including spread).

### Order Types

- **market** -- instant fill at bid/ask
- **limit** -- fills when spot reaches trigger (long: `S <= trigger`, short: `S >= trigger`)
- **stop** -- triggers market order (long: `S >= trigger`, short: `S <= trigger`)

### Margin

| Position | Initial | Maintenance |
|----------|---------|-------------|
| Short stock | 50% of notional | 25% |
| Short bond | 50% of fill | 25% |
| Short option | max(20% * S * qty, premium * qty) | same, marked to market |
| Long on margin (negative cash) | equity >= 50% of debit | 25% of debit balance |

Long positions can be bought on margin -- cash goes negative when insufficient, up to a limit. `_checkInitialMarginDebit()` enforces Reg-T: post-trade equity must be >= `REG_T_MARGIN (50%) * |newCash|`. This prevents buying into a margin call. Negative cash incurs the same volatility-weighted borrow cost as short positions: `dailyCost = |cash| * (max(r,0) + borrowSpread * sigma) / 252`. Tracked in `portfolio.marginDebitCost`.

Margin call at `equity < marginRequirement` (considers short positions + margin debit). Pauses sim, shows overlay. Cash display turns red when negative; margin status value colored (OK/LOW/MARGIN CALL), label stays default color. Short trades also checked at open time via `_postTradeMarginOk()` to prevent immediately triggering a margin call.

### Short Borrow Interest

`chargeBorrowInterest()` in portfolio.js charges daily interest on short stock and bond positions:

```
dailyCost = |qty| * notional * (max(r, 0) + borrowSpread * sigma) / 252
```

- `borrowSpread` (default 0.5, range [0, 5]) is a sim parameter controllable via slider and events
- Stock shorts: notional = `|qty| * S`. Bond shorts: notional = `|qty| * 100 * exp(-r * T)`
- Deducted from `portfolio.cash` daily. Cumulative cost tracked per-position (`pos.borrowCost`) and for closed positions (`portfolio.closedBorrowCost`)
- Does NOT apply to short options (writing doesn't require borrowing)
- Also charges on negative cash (margin debit): `dailyCost = |cash| * dailyRate`. Tracked in `portfolio.marginDebitCost`
- Called in `_onDayComplete()` before `processExpiry()`

### Option Expiry

`processExpiry()`: Bonds settle at face value ($100) on maturity. ITM option longs auto-exercised, OTM longs expire worthless, shorts removed with margin returned. Short ITM options are NOT assigned (simplified model).

### Strategy System

`strategyLegs[]` lives in `main.js`. Each leg: `{ type, qty, strike?, expiryDay? }` with signed qty. `saveStrategy()`/`executeStrategy()` in portfolio.js handle persistence and execution. `handleExecStrategy()` in main.js executes legs sequentially; if any leg fails (e.g. insufficient margin), all previously filled legs are rolled back by restoring a portfolio snapshot.

## UI Architecture

### Toolbar

Play/pause, speed (0.25x-4x, left-click faster / right-click slower), step, reset, theme toggle (hidden <=440px), panel toggle.

### Sidebar (4 tabs)

**Trade tab:**
- Quantity slider (1-100)
- Order type toggle: Market | Limit | Stop
- Trigger price slider (conditional, shown for Limit/Stop)
- Expiry dropdown (`#trade-expiry`) -- bond price updates when expiry changes
- Stock/Bond price table -- chain-style, clickable mid-price cells (stock = orange, bond = blue)
- Compact options chain (Call | Strike | Put, mid prices)
- "View Full Chain" button (pauses simulation)
- "Left-click: buy / Right-click: sell/short" hint

**Portfolio tab:**
- Account: Cash, Portfolio Value, Total P&L, Margin Status, Borrow Cost
- Positions with close (X) and exercise (Ex) buttons
- Strategy positions grouped by name
- Pending orders with cancel buttons
- Greeks aggregate as stat-rows (Delta, Gamma, Theta, Vega, Rho)

**Strategy tab:**
- Quantity slider (1-100)
- Expiry dropdown (`#strategy-expiry`) -- bond price updates when expiry changes
- Stock/Bond price table (mirrors trade tab layout, stock = orange, bond = blue)
- Compact options chain (Call | Strike | Put, mirrors trade tab)
- Left-click: long, right-click: short (on any cell)
- Legs list with inline qty editing
- Summary: Net Cost, Max Profit, Max Loss, Breakevens
- Save / Execute buttons

**Settings tab:**
- Market Regime preset dropdown
- Advanced Parameters (12 sliders)

### Candlestick Chart

Log Y-axis OHLC candles. Up = green, down = rose. Auto-scale, grid, crosshair, position entry markers, strike lines (call = green, put = rose). Camera via `shared-camera.js` (X = day index, zoom 12-36 px/day). DPR-aware, ResizeObserver for immediate re-render.

### Strategy View

`draw(legs, spot, vol, rate, dte, greekToggles, evalDay, entryDay)`: P&L curve (green/rose split at zero), Greek overlays on independent Y-axes, breakeven dots, clickable legend. Per-leg T from `leg.expiryDay - evalDay`; entry T from `leg.expiryDay - entryDay`. Results cached by input key -- repeated calls with unchanged inputs skip all pricing.

`computeSummary(legs, spot, vol, rate, dte, evalDay, entryDay)` -> `{ maxProfit, maxLoss, breakevens, netCost }`. Detects unbounded P&L at sample boundary. Cached separately from `draw()`.

Both use `_precomputeLegs()` to compute entry values once per leg (not per sample point), then `_legPnlFast()`/`_legGreeksFast()` for the 200-point sample loop.

### Time-to-Expiry Slider

Appears in strategy mode. Slider percentage (100% = entry, 0% = first leg expires) maps to `evalDay`. Clamped to min DTE across legs -- stops at first expiry. Label shows nearest leg's remaining DTE. Options show theta decay, bonds show interest accrual as slider moves.

### Overlays

**Chain overlay**: Pauses simulation on open. Expiry tabs, stock/bond price table (bid/ask format), options table (5 columns: Call, Call Delta, Strike, Put Delta, Put) with combined "bid / ask" cells. Left-click = buy at ask, right-click = sell at bid.

**Trade dialog**: Side, quantity, order type, conditional trigger price. Confirm button cloned on each open to avoid stacking listeners.

**Margin call overlay**: Equity, required margin, shortfall. Liquidate or Dismiss.

### Custom Events

`shoals:closePosition`, `shoals:exerciseOption`, `shoals:cancelOrder` -- dispatched from ui.js DOM rows, caught in main.js. Decouples UI from portfolio state.

### Tab-Strategy Coupling

Clicking Strategy tab sets `strategyMode = true`, pauses the simulation, shows strategy canvas + time slider. Clicking other tabs reverts. `s` keyboard shortcut clicks the strategy tab (opens sidebar if closed).

## Color System

`colors.js` extends `_PALETTE` with financial aliases:

| Key | Source | Hex | Purpose |
|-----|--------|-----|---------|
| `up` | `extended.green` | `#509878` | Up candles, profit P&L |
| `down` | `extended.rose` | `#C46272` | Down candles, loss P&L, danger |
| `call` | `extended.green` | `#509878` | Call cells, call strike lines |
| `put` | `extended.rose` | `#C46272` | Put cells, put strike lines |
| `stock` | `extended.orange` | `#CC8E4E` | Stock price cell/button |
| `bond` | `extended.blue` | `#5C92A8` | Bond price cell/button |
| `delta` | `extended.blue` | `#5C92A8` | Delta Greek |
| `gamma` | `extended.orange` | `#CC8E4E` | Gamma Greek |
| `theta` | `extended.cyan` | `#4AACA0` | Theta Greek |
| `vega` | `extended.purple` | `#9C7EB0` | Vega Greek |
| `rho` | `extended.slate` | `#8A7E72` | Rho Greek |

CSS vars injected: `--up`, `--down`, `--call`, `--put`, `--stock`, `--bond`, `--delta`, `--gamma`, `--theta`, `--vega`, `--rho` (same both themes). Themed vars: `--chart-grid`, `--chart-crosshair`, `--chart-axis`, `--chain-hover`, `--dialog-bg`.

## Dynamic Regime

Two dynamic market regime modes use a shared event engine (`src/events.js`):

### Event Engine

`EventEngine` fires narrative events via two mechanisms: scheduled FOMC meetings (every 32 trading days, ~8x/year) and Poisson-drawn non-Fed events (~1 per 60 trading days). Events apply additive parameter deltas to the simulation, clamped to `PARAM_RANGES`. Called from `_onDayComplete()` in main.js. Events have `likelihood` weights for weighted random selection (`_weightedPick`); high-likelihood neutral/flavor events dilute directional bias so the stock doesn't drift to zero or infinity.

Two event sources:
- **Offline** (preset index 5): draws from `OFFLINE_EVENTS` pool (88 curated events across Fed/monetary, macro/geopolitical, sector/tech, PNTH company, market structure, and neutral/flavor categories)
- **LLM** (preset index 6): generates batches of 3-5 events via Anthropic Claude API (Haiku 4.5 default), with offline fallback on failure

### Event Scheduling

- **Fed events** (`category: 'fed'`): fire on a fixed schedule every 32 trading days (~8x/year, like real FOMC). One eligible Fed event drawn via weighted random. Fed events excluded from the Poisson pool.
- **Non-Fed events**: Poisson rate 1/60 (~1 event per 60 trading days). Drawn from all non-fed events via weighted random.
- **Followup chain events**: fire on their scheduled `targetDay`, independent of both the Fed schedule and Poisson rate.

### MTTH Chains

Events can schedule followup events (Paradox-style Mean Time To Happen). Each followup has an `mtth` (mean delay in trading days, Poisson-sampled) and a `weight` (probability of firing). Followups can chain recursively (max depth 5). `_pendingFollowups[]` checked each day before the regular Poisson draw.

### Universe / Lore

**Political context:** President John Barron (Federalist Party) won an upset against incumbent Robin Clay (Farmer-Labor Party). Military hawk -- renamed DoD to "Department of War", launches strikes in Middle East and South America using PNTH AI. Pressures Fed Chair Hayden Hartley to cut rates.

**Palanthropic (PNTH):** Up-and-coming AI giant. Chairwoman Andrea Dirks (close to VP Jay Bowman, supports military contracts) vs CEO Eugene Gottlieb (opposes military use on ethical grounds). ~25 company-specific events with multi-step narrative chains (ethics disputes, board crises, defense contracts, Senate investigations into Bowman ties).

**Event balance:** Weighted average mu and b deltas are approximately zero across the full pool. High-likelihood neutral/flavor events (likelihood 2-5) heavily dilute directional bias from rarer major events.

### LLM Integration

Browser-direct Anthropic API via `anthropic-dangerous-direct-browser-access` header. Uses structured tool use: `emit_events` tool with full JSON schema for events array, forced via `tool_choice`. No freeform JSON parsing -- response is read directly from `toolBlock.input.events`. System prompt contains full universe lore (political landscape, PNTH characters, Fed, macro context). API key and model stored in localStorage (`shoals_llm_key`, `shoals_llm_model`). Batches pre-fetched to minimize API calls (~1 call per 60-100 trading days). User message includes current sim state (with `sqrt(v)` as volatility), last 10 events, and pending followups.

## Keyboard Shortcuts

| Key | Action | Group |
|-----|--------|-------|
| `Space` | Play / Pause | Simulation |
| `.` | Step forward | Simulation |
| `r` | Reset | Simulation |
| `s` | Strategy view | View |
| `t` | Toggle sidebar | View |
| `b` | Buy stock | Trade |
| `1`-`5` | Load preset | Presets |
| `6` | Dynamic (Offline) | Presets |
| `7` | Dynamic (LLM) | Presets |

## Key Patterns

- **`$` DOM cache**: populated by `cacheDOMElements($)`, passed to all ui.js functions. Also stores closures: `$._onChainCellClick`, `$._onTradeSubmit`.
- **Dirty flag**: `dirty = true` on state change; rAF loop skips render when false.
- **Sub-step streaming**: 16 intraday sub-steps distributed across tick interval. `dayInProgress` tracks active streaming. `lastTickTime` advances by `tickInterval` to prevent drift.
- **Live candle interpolation**: smoothstep cubic (`t²(3-2t)`) fills the full substep interval. `setSubstepInterval(ms)` tunes segment duration to match current speed. `_syncLerpSpeed()` in main.js calls it on init and speed changes. High/low are water marks that never retract.
- **Camera (chart only)**: `shared-camera.js`, world X = day index. Strategy canvas manages its own X-range.
- **Pure module separation**: simulation.js/portfolio.js = state, ui.js = DOM, chart.js/strategy.js = renderers, main.js = orchestrator.
- **Custom event bus**: `shoals:*` events from ui.js to main.js, decouples DOM from portfolio state.
- **Bond pricing**: `100 * exp(-r * T)`. Volatility-aware spread via `computeBidAsk()`. Strategy view shows theta (interest accrual) and rho.
- **Auto-scroll**: keeps latest candle at ~85% from left when playing.
- **Toast fill price**: trade toast shows actual fill price (including bid/ask spread) via `pos.fillPrice`.
- **Shared chain renderer**: `renderChainInto()` in chain-renderer.js builds both trade-tab and strategy-tab chain tables from a pre-priced expiry. `rebuildExpiryDropdown()` populates expiry dropdowns from the skeleton (only on day-complete/reset, not every substep). Uses event delegation (3 listeners on container, not per-cell). Trade tab passes `$._onChainCellClick`, strategy tab wraps `onAddLeg`.
- **`_resetCore` helper**: shared reset logic for `loadPreset()` and `resetSim()` in main.js.
- **Unified stock/bond prices**: `updateStockBondPrices($, spot, rate, skeleton, posMap, stratPosMap)` computes bond price from each tab's selected expiry and updates all four cells (trade + strategy). Applies position indicator classes via posMap.
- **Position indicators on chain cells**: Chain cells show **bold** text for long positions, **bold italic** for short. `posKey(type, strike, expiryDay)` generates map keys. `_buildPosMap()` (portfolio) and `_buildStrategyPosMap()` (strategy legs) in main.js build maps passed to all chain rendering functions. Trade tab uses portfolio positions; strategy tab uses strategy legs. `chainDirty = true` set after every trade action for immediate update.

## Gotchas

- **Signed qty, no side field** -- `qty > 0` = long, `qty < 0` = short on position objects.
- **`sim.history` is a `HistoryBuffer`** -- use `.get(day)`, `.last()`, `.minDay`/`.maxDay`. Not array-indexable.
- **`sim._partial` is pushed by reference** -- `beginDay()` pushes, `substep()` mutates in-place. Do not clone mid-day.
- **`dayInProgress` must be reset** on preset load and sim reset. Pausing does NOT finalize the day.
- **Step button finishes partial days** -- completes remaining sub-steps instantly.
- **`chart._lerp.day = -1`** disables live candle rendering. Set on reset.
- **`setLiveCandle()` finalizes previous day** -- snaps to final target before transitioning to new open. Sets `_from` and resets `_t = 0` for new cubic segment.
- **Strategy renderer has no camera** -- manages `_xRange`/`_xCenter` directly.
- **Strategy legs live in main.js** -- `strategyLegs[]` is local state, not in portfolio.js.
- **Inline qty editing** in strategy leg rows mutates `leg.qty` directly, bypasses netting.
- **`portfolio` singleton** -- `resetPortfolio()` mutates in place. Never replace the reference.
- **Chain table rebuilt every call** -- do not cache cell references. Clicks use event delegation on container (not per-cell listeners). Delegation is bound once per container (`_chainClicksBound` flag) -- never re-bind.
- **Trade dialog confirm button cloned** on each open to avoid stacking listeners.
- **`ExpiryManager` is stateful** -- lives in main.js, `.init()` on reset, `.update()` each tick.
- **Vasicek rate can go negative** -- BS2002 uses `rEff = max(r, 1e-7)` for beta only.
- **`_phi`/`_psi` not exported** from pricing.js. Only `priceAmerican` and `computeGreeks` exported.
- **Opening full chain pauses sim** -- `playing` set to false before showing overlay.
- **Time slider clamped to min DTE** -- stops at first leg expiry; per-leg T computed individually.
- **`eventEngine` is null in non-Dynamic presets** -- always check `if (eventEngine)` before calling methods. `maybeFire()` returns an array of fired events (may be empty), not a single event/null.
- **`_reservedMargin` field on short positions** stores actual margin reserved at open time. Use `?? _marginForShort(...)` fallback when reading.
- **`_postTradeMarginOk()` guards all short-opening paths** -- new short, extend short, flip long-to-short. Simulates post-trade equity vs maintenance margin to prevent trades that would immediately trigger a margin call. `_maintenanceForShort()` computes single-position maintenance.
- **Event deltas are additive and clamped** to `PARAM_RANGES` -- never set absolute values via events.
- **LLM followup events** now include `headline`, `params`, `magnitude` in the tool schema. Offline followups still resolved via `_getEventById`; LLM followups carry their own data.
- **`_pendingFollowups` cleared on reset** -- switching presets mid-chain drops all scheduled followups.
- **Slider ranges expanded globally** -- all 12 parameter sliders have wider min/max than the original presets use. Events can push params to extremes.
- **`borrowCost` on positions** -- cumulative borrow interest charged to short stock/bond positions. Preserved in `portfolio.closedBorrowCost` when positions close/flip/expire.
- **`portfolio.marginDebitCost`** -- cumulative interest charged on negative cash (buying on margin). Included in borrow cost display. Reset on `resetPortfolio()`.
- **`_haptics` must always be guarded** -- use `if (typeof _haptics !== 'undefined') _haptics.trigger(...)`. The global loads from `/shared-haptics.js`; ES6 modules may execute before it's defined.
- **`generateStrikes` is exported** from chain.js.
- **Strategy execution rolls back on partial failure** -- `handleExecStrategy()` snapshots portfolio state before executing legs; if any leg fails, it restores the snapshot.
- **`speed` variable removed** -- use `SPEED_OPTIONS[speedIndex]` directly. `speedIndex` is the single source of truth for simulation speed.
- **`worldToScreenX`/`screenToWorldX`** -- scalar camera methods in `shared-camera.js` avoid object allocation. chart.js uses these with fallback to `worldToScreen().x` for backwards compatibility.
- **Strategy caches invalidate by key** -- `_cache` and `_summaryCache` use string keys from inputs. Changing legs, vol, rate, evalDay, zoom, or greek toggles auto-invalidates. Do not manually clear caches; they self-manage.
- **`_precomputeLegs` / `_legPnlFast` / `_legGreeksFast`** -- standalone functions (not class methods) that precompute per-leg entry values once. The old `_legPnl`, `_totalPnl`, `_legGreeks`, `_totalGreeksAll` instance methods have been removed.
- **Lazy chain: skeleton vs priced expiry** -- `chainSkeleton` (in main.js) holds expiry metadata + strikes with no pricing. `_priceExpiry(idx)` / `_priceExpiryGreeks(idx)` compute prices on demand for one expiry. Only the currently visible expiry is priced each substep (50 calls). Full Greeks only computed for the chain overlay.
- **Substep UI updates** -- `_onSubstep()` fires after each substep batch during playback. It checks pending orders at intraday prices, reprices the visible expiry, and updates the sidebar (portfolio, rate, chain table). Dropdown rebuild happens only on day-complete via `chainDirty`.
- **Strategy tab pauses sim** -- switching to the strategy tab sets `playing = false`. The user must manually resume after leaving the tab.
- **No hardcoded colors in JS** -- chart.js and strategy.js use `_PALETTE` and `_r()` for all colors. CSS slider-track fallbacks in styles.css are the only remaining hardcoded rgba values (defensive fallback for when shared-tokens.js hasn't loaded).
