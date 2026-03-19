# CLAUDE.md

Part of the **a9l.im** portfolio. See parent `site-meta/CLAUDE.md` for the shared design system specification. Sibling projects: `physsim`, `biosim`, `gerry`.

## Style Rule

Never use the phrase "retarded potential(s)" in code, comments, or user-facing text. Use "signal delay" or "finite-speed force propagation" instead.

## Testing

Do not manually test via browser automation. The user will test changes themselves and provide feedback.

## Overview

Shoals -- interactive options trading simulator. Models a stock as geometric Brownian motion with Merton jumps and Heston stochastic volatility; the risk-free rate follows a Vasicek process. Users buy and sell combinations of the underlying stock, zero-coupon bonds, and American options (calls/puts) at various strikes and expiries. Options priced via Bjerksund-Stensland 2002 analytical approximation. Includes a strategy builder with payoff diagrams and Greek overlays, a full interactive options chain, and a portfolio/margin system.

Zero dependencies -- vanilla HTML5/CSS3/JS with ES6 modules. No build step.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Serve from `a9lim.github.io/` -- shared files load via absolute paths (`/shared-*.js`, `/shared-base.css`). ES6 modules require HTTP. No build step, no test framework, no linter.

## File Map

```
main.js                846 lines  Entry point: DOM cache $, rAF loop, sub-step streaming,
                                   live candle animation, camera setup, shortcut registration,
                                   custom event wiring, strategy builder handlers, auto-scroll,
                                   resize handling, ExpiryManager wiring
index.html             496 lines  Toolbar, chart canvas, strategy canvas, sidebar (4 tabs:
                                   Trade/Portfolio/Strategy/Settings), chain overlay, trade dialog,
                                   margin call overlay, intro screen
styles.css             810 lines  Project-specific CSS overrides; chain table, position rows,
                                   strategy builder, trade dialog, margin alert, P&L coloring,
                                   Greeks grid, time slider bar, responsive breakpoints
colors.js               53 lines  Financial color aliases (_PALETTE.up/down/bond/delta/gamma/
                                   theta/vega/rho), CSS var injection (--up, --down, --bond,
                                   --delta, --gamma, --theta, --vega, --rho, --chart-grid,
                                   --chart-crosshair, --chart-axis, --chain-hover, --dialog-bg),
                                   freezes _PALETTE
src/
  history-buffer.js     86 lines  HistoryBuffer: fixed-capacity (256) ring buffer for OHLC bars.
                                   push(), get(day), last(), scaleAll(). Overwrites oldest when full.
  config.js             26 lines  Named constants (STRIKE_INTERVAL, STRIKE_RANGE, BOND_FACE_VALUE,
                                   MAINTENANCE_MARGIN, REG_T_MARGIN, HISTORY_CAPACITY, etc.) and
                                   PRESETS array (5 market regimes)
  simulation.js        208 lines  Simulation class: GBM + Merton jumps + Heston stoch vol +
                                   Vasicek rate; beginDay()/substep()/finalizeDay() sub-step
                                   pipeline for animated candles; tick() convenience wrapper;
                                   prepopulate() fills buffer and scales to INITIAL_PRICE;
                                   Box-Muller RNG, inverse-transform Poisson sampler
  pricing.js           467 lines  Bjerksund-Stensland 2002 American option pricing + bivariate
                                   normal CDF (Drezner-Wesolowsky 1990) + finite-diff Greeks +
                                   bid/ask spread model. Pure math -- no imports.
  chain.js             170 lines  ExpiryManager (rolling 8-expiry window, 21-day cycle),
                                   generateExpiries() (legacy stateless), generateStrikes()
                                   ($5 intervals, STRIKE_RANGE strikes each side), buildChain()
  portfolio.js         775 lines  Signed-qty positions, market/limit/stop orders, netting,
                                   strategy groups, cash/margin, processExpiry(),
                                   exerciseOption(), aggregateGreeks(), liquidateAll()
  chart.js             672 lines  ChartRenderer: logarithmic Y-axis OHLC candles, auto-scale,
                                   grid, crosshair, position entry markers, strike lines;
                                   live candle lerp animation (close lerps, high/low snap);
                                   uses shared-camera.js for horizontal pan/zoom.
                                   Accesses history via .get(day)/.last() (HistoryBuffer API).
  strategy.js          857 lines  StrategyRenderer: payoff P&L diagram, Greek overlays (Delta/
                                   Gamma/Theta/Vega/Rho), breakeven dots, scroll-wheel X zoom,
                                   clickable legend, computeSummary(). Own X-range management,
                                   does NOT use shared-camera.js.
  ui.js               1180 lines  cacheDOMElements($), bindEvents(), updateChainDisplay(),
                                   updatePortfolioDisplay(), updateGreeksDisplay(),
                                   syncSettingsUI(), showChainOverlay(), showTradeDialog(),
                                   showMarginCall(), toggleStrategyView(), updatePlayBtn(),
                                   updateSpeedBtn(), renderStrategyBuilder(), wireInfoTips(),
                                   updateStrategySelectors(). Pure functions -- no internal state.
  theme.js              20 lines  initTheme() (localStorage + prefers-color-scheme),
                                   toggleTheme() (2-state: light/dark)
```

## Module Dependencies

```
main.js
  |- src/config.js        (SPEED_OPTIONS, PRESETS, INTRADAY_STEPS)
  |- src/simulation.js    (Simulation -- imports config, history-buffer)
  |- src/history-buffer.js (HistoryBuffer -- no imports)
  |- src/chain.js         (buildChain, ExpiryManager -- imports pricing, config)
  |- src/portfolio.js     (portfolio, resetPortfolio, checkPendingOrders, processExpiry,
  |                         checkMargin, aggregateGreeks, portfolioValue, executeMarketOrder,
  |                         closePosition, exerciseOption, liquidateAll, placePendingOrder,
  |                         cancelOrder, saveStrategy, executeStrategy -- imports pricing, config)
  |- src/chart.js         (ChartRenderer -- no ES6 imports; reads _PALETTE, _r globals)
  |- src/strategy.js      (StrategyRenderer -- imports pricing, config)
  |- src/ui.js            (cacheDOMElements, bindEvents, display updaters -- imports config;
  |                         reads _haptics, showToast, createInfoTip globals)
  +- src/theme.js         (initTheme, toggleTheme -- no imports)

Global scripts (loaded via <script> in <head>):
  shared-tokens.js  -> _PALETTE, _FONT, _r, _parseHex, color math
  shared-utils.js   -> showToast, debounce, throttle, clamp, lerp
  shared-haptics.js -> _haptics.trigger()
  shared-camera.js  -> createCamera()
  colors.js         -> extends _PALETTE, freezes, injects CSS vars

Global scripts (loaded via <script> in <head>, after colors.js):
  shared-touch.js      -> initSwipeDismiss()
  shared-info.js       -> createInfoTip()
  shared-shortcuts.js  -> initShortcuts()

Loaded at end of <body>:
  shared-tabs.js       -> tab switching IIFE
```

## Data Flow

### Animated Sub-Step Streaming (playing)

When `playing = true`, each trading day is streamed across the tick interval:

1. `frame()` calls `sim.beginDay()` — pushes a partial bar (open = close = high = low = current S) into `sim.history` by reference
2. Sub-steps are paced across the tick interval (`tickInterval / INTRADAY_STEPS`). Each frame, `sim.substep()` runs any due sub-steps, mutating the partial bar in-place (high/low/close updated)
3. After each sub-step, `chart.setLiveCandle(bar)` updates lerp targets. The close price lerps smoothly toward the target each frame (`lerpSpeed = 15`, frame-rate-independent exponential). High/low snap immediately (no lerp).
4. When all 16 sub-steps are done, `sim.finalizeDay()` increments the day counter. Then `_onDayComplete()` runs portfolio/chain/margin checks (same as the old `tick()` flow):
   - `checkPendingOrders()`, `processExpiry()`, `buildChain()`, `checkMargin()`
   - Auto-scroll, strategy range reset, UI update
5. At high speeds (16x → 62.5ms per tick, ~3.9ms per sub-step), multiple sub-steps batch per frame. Lerp still smooths between frames.

### Instant Tick (step button, prepopulation)

`sim.tick()` is a convenience wrapper: `beginDay()` + 16 `substep()` + `finalizeDay()`. Used by the step button and `prepopulate()`. Lerp state is snapped (no animation).

### Pause Behavior

Pausing mid-day leaves the partial bar frozen in its current state (`dayInProgress` remains `true`). Resuming continues sub-steps from where they left off. The partial bar is already in the history buffer and renders normally.

### Each completed day:
1. `portfolio.js` `checkPendingOrders()` evaluates limit/stop orders against new `S`, fills triggered orders; `processExpiry()` auto-exercises ITM longs, expires worthless OTMs, returns short margin
2. `chain.js` `buildChain()` reads `S, v, r` + expiries from `ExpiryManager.update()` -> generates strikes -> calls `pricing.js` `computeGreeks()` + `computeSpread()` for every option
3. `portfolio.js` `checkMargin()` -> if `equity < 25% * totalPositionValue`, sets `playing = false` and shows margin call modal
4. Auto-scroll: if playing, camera pans right to keep latest candle at ~85% screen width
5. Strategy range reset if spot moved >1% since last check
6. `ui.js` updates sidebar (chain display, portfolio positions, Greeks aggregate, strategy selectors)
7. `dirty = true` -> `renderCurrentView()` in next rAF frame draws either `chart.js` or `strategy.js`

Bootstrap: on init, `sim.prepopulate()` runs 256 ticks (filling the entire HistoryBuffer), then scales all OHLC prices so the final close = $100 (INITIAL_PRICE). This creates realistic-looking historical data that ends at the starting price. The `ExpiryManager` is initialised after prepopulation.

## Simulation Engine

### Stock Price Model

GBM with Merton jumps and Heston stochastic volatility (Euler-Maruyama, full truncation scheme):

```
dS/S = (mu - lambda*k)dt + sqrt(v) * dW1 + J * dN(lambda)
dv   = kappa(theta - v)dt + xi*sqrt(v) * dW2      (dW1*dW2 = rho*dt)
```

Parameters: `mu` (drift), `v` (variance), `kappa` (mean-reversion speed), `theta` (long-run variance), `xi` (vol-of-vol), `rho` (price/vol correlation), `lambda` (jump intensity, jumps/year), `J ~ N(muJ, sigmaJ)` (log-jump size), `k = E[e^J] - 1` (jump compensator).

Correlated Brownian increments via Cholesky: `z2 = rho*z1 + sqrt(1 - rho^2)*z_independent`. Variance `v` floored at 0 after each sub-step (full truncation scheme).

### Interest Rate Model

Vasicek (`dt = 1/(252 * INTRADAY_STEPS)`):

```
dr = a(b - r)dt + sigmaR * dW3      (dW3 independent of dW1, dW2)
```

Parameters: `a` (mean-reversion speed), `b` (long-run rate target), `sigmaR` (rate vol). Rate `r` is unconstrained (can go negative).

### OHLC Construction & Sub-Step Pipeline

Each trading day runs `INTRADAY_STEPS = 16` sub-steps at `dt = 1/(252 * 16)`. The simulation exposes a 3-phase pipeline for animated candle rendering:

1. **`beginDay()`** — initializes `_partial` bar (`open = close = high = low = S`), pushes it to `history` by reference, resets `_substepIndex = 0`
2. **`substep()`** — runs one sub-step of the stochastic model, updates `_partial` in-place (high/low/close/v/r). Returns the partial bar. Guard: no-ops if `_substepIndex >= INTRADAY_STEPS`.
3. **`finalizeDay()`** — clears `_partial`, increments `day`. The bar remains in history.

**`tick()`** is a convenience wrapper: `beginDay()` + 16 `substep()` + `finalizeDay()`. Used for step-forward, prepopulation, and backward compatibility.

Properties: `substepsDone` (getter, 0–16), `dayComplete` (getter, true when all 16 done), `_partial` (the live bar reference, or null).

Open = price at `beginDay()`, Close = price after last sub-step, High/Low = running max/min across all sub-steps. Only Close is carried forward as `S` for the next day. Each bar stores `{ day, open, high, low, close, v, r }`.

### Random Number Generation

Box-Muller transform for standard normals (discards second variate). Inverse-transform method for Poisson jump counts (suitable for small `lambda*dt`). Uses `Math.random()` -- no seeded RNG.

### Market Regime Presets

| Preset | mu | theta | kappa | xi | rho | lambda | muJ | sigmaJ | a | b | sigmaR |
|--------|-----|-------|-------|----|------|--------|------|--------|-----|------|--------|
| Calm Bull | 0.08 | 0.04 | 3.0 | 0.3 | -0.5 | 0.5 | -0.02 | 0.03 | 0.5 | 0.04 | 0.005 |
| Sideways | 0.02 | 0.06 | 2.0 | 0.4 | -0.6 | 1.0 | -0.01 | 0.04 | 0.5 | 0.03 | 0.008 |
| Volatile | 0.05 | 0.12 | 1.5 | 0.6 | -0.7 | 3.0 | -0.03 | 0.06 | 0.3 | 0.05 | 0.012 |
| Crisis | -0.10 | 0.25 | 0.5 | 0.8 | -0.85 | 8.0 | -0.08 | 0.10 | 0.2 | 0.02 | 0.020 |
| Rate Hike | 0.04 | 0.08 | 2.0 | 0.5 | -0.6 | 1.5 | -0.02 | 0.05 | 0.8 | 0.08 | 0.015 |

On `sim.reset(presetIndex)`, state initializes at `S = 100` (INITIAL_PRICE), `v = theta` (long-run variance), and `r = b` (long-run rate). History buffer is cleared. `sim.prepopulate()` then fills the entire 256-bar buffer with scaled historical data ending at $100.

## Options Pricing

### Bjerksund-Stensland 2002

Analytical approximation for American options. The algorithm:
1. Computes perpetual exercise boundary parameters: `beta = (b/v2 - 0.5) + sqrt((b/v2 - 0.5)^2 + 2*rEff/v2)`, `B_inf = beta/(beta-1) * K`, `B0 = max(K, rEff/(rEff-b) * K)`
2. Splits time-to-expiry at golden-ratio `t1 = (sqrt(5)-1)/2 * T`
3. Computes flat early-exercise boundaries `I1` (at `t1`) and `I2` (at `T`) via exponential approximation: `I = B0 + (B_inf - B0) * (1 - exp(h))` where `h = -(b*t + 2*sigma*sqrt(t)) * B0 / (B_inf - B0)`
4. Prices using `_phi()` (single-barrier expectation, BS2002 eq. A.2) and `_psi()` (bivariate-barrier expectation, BS2002 eq. A.3) helper functions, combined in eq. 10

If `S >= I2`, immediate exercise: price = `S - K`. Falls back to European Black-Scholes when `b >= r` (no dividends, early exercise never optimal). Small floor `rEff = max(r, 1e-7)` prevents `beta = 0` degenerate case when `r -> 0`. Price floored at intrinsic value.

**Put pricing via put-call symmetry** (Bjerksund-Stensland 1993, McDonald-Schroder 1998):
```
P_am(S, K, T, r, 0, sigma) = C_am(K, S, T, 0, r, sigma)
```

**Bivariate normal CDF**: Drezner-Wesolowsky (1990) 5-point Gauss-Legendre quadrature, as implemented in Haug (2007). Sign-case decomposition for general `(a, b, rho)` with degenerate-correlation guards.

### Finite-Difference Greeks

| Greek | Method | Step |
|-------|--------|------|
| Delta | central diff in S | `h_S = S * 0.01` |
| Gamma | second central diff in S | same `h_S` |
| Theta | forward diff in T | `h_T = 1/252` (1 trading day) |
| Vega | central diff in sigma | `h_sigma = 0.001` |
| Rho | central diff in r | `h_r = 0.0001` (1 basis point) |

Each Greek requires 2 additional `priceAmerican()` calls (except theta which needs 1). Total: 9 pricing calls per option per `computeGreeks()` invocation.

### Bid/Ask Spread Model

```
halfSpread = max(0.05, theoPrice * 0.02 * (1 + sqrt(v)) + 0.10 * |log(S/K)|)
```

Bid = theo - halfSpread, Ask = theo + halfSpread. Long positions fill at ask; short positions fill at bid. Widens in high-vol regimes and for deep ITM/OTM strikes. Stock and bond have no spread model -- fill at mid.

## Options Chain

### Strike Generation

ATM strike = `round(S / STRIKE_INTERVAL) * STRIKE_INTERVAL` (STRIKE_INTERVAL = 5). `STRIKE_RANGE = 12` strikes above and below ATM, filtered for positive values, sorted ascending -> up to 25 strikes total.

### Expiry Management

`ExpiryManager` (in `chain.js`) maintains a persistent rolling window of 8 expiry dates on a 21-trading-day cycle. On each tick, `expiryMgr.update(currentDay)` drops any expired dates and appends new ones at the far end to maintain exactly 8 active expiries. This ensures the chain never shrinks over time.

`init(currentDay)` seeds the list from the next 21-day boundary. `update(currentDay)` returns `[{ day, dte }]`. A legacy stateless `generateExpiries()` function is retained for one-off use.

### Chain Data Structure

`buildChain(S, v, r, currentDay, expiries?)` returns (`expiries` from `ExpiryManager.update()`, falls back to `generateExpiries()` if omitted):
```
[{
  day:     number,        // simulation day of expiry
  dte:     number,        // days to expiry
  options: [{
    strike: number,
    call: { price, delta, gamma, theta, vega, rho, bid, ask },
    put:  { price, delta, gamma, theta, vega, rho, bid, ask }
  }]
}]
```

Note: `v` passed to `buildChain()` is the variance (not volatility). Inside, it passes `v` directly to `computeGreeks()` as the `sigma` parameter. The `computeGreeks()` function expects annualized volatility (sigma), so the caller in `main.js` passes `Math.sqrt(Math.max(sim.v, 0))` -- but `buildChain()` passes `v` raw. This means the chain uses `v` (variance) where it should use `sqrt(v)` (volatility). This is the current behavior.

Repriced once per simulation tick.

## Portfolio System

### Position Types

Positions use **signed qty**: positive = long, negative = short. There is no separate `side` field on position objects.

- **stock** -- long or short shares. Long value = `|qty| * S`. Short value = `|qty| * (2 * entryPrice - S)`.
- **bond** -- zero-coupon, face value $100 (`BOND_FACE_VALUE`), priced at `100 * exp(-r*T)`. Maturity aligned with options expiry days.
- **call** / **put** -- American, at any available strike/expiry. Long (buy) or short (write).

Position object shape: `{ id, type, qty, entryPrice, entryDay, strike?, expiryDay?, strategyName? }`

### Netting Behavior

`executeMarketOrder()` searches for an existing position of the same `type + strike + expiryDay`. If found:
- **Same direction**: extends the position (adds to qty)
- **Opposite direction, partial close**: reduces qty, credits/debits cash
- **Opposite direction, full close**: removes position from array
- **Opposite direction, flip**: closes old side, opens new side with updated entryPrice/entryDay

### Order Types

- **market** -- instant fill at model mid +/- bid/ask spread (options), or mid (stock/bond)
- **limit** -- fills when spot reaches trigger: long if `S <= triggerPrice`, short if `S >= triggerPrice`
- **stop** -- triggers a market order: long if `S >= triggerPrice`, short if `S <= triggerPrice`

Pending orders evaluated each tick by `checkPendingOrders()`. Unfillable triggered orders silently dropped. Order object: `{ id, type, side, qty, orderType, triggerPrice, strike?, expiryDay?, strategyName? }`.

### Margin Rules

| Position | Initial margin (at open) | Maintenance |
|----------|--------------------------|-------------|
| Short stock | Reg-T: 50% of `S * qty` | 25% of position value |
| Short bond | 50% of `fillPrice * qty` | 25% of bond value |
| Short option | `max(20% * S * qty, premium * qty)` | Same formula, marked to market |
| Long positions | Fully paid from cash (no leverage) | N/A |

**Margin call trigger**: `equity < MAINTENANCE_MARGIN * totalPositionValue` where `MAINTENANCE_MARGIN = 0.25`. Sim loop pauses (`playing = false`); modal offers "Liquidate Positions" (calls `liquidateAll()` then `resetPortfolio(cash)`) or "Dismiss" (sim stays paused, user manages manually).

### Strategy System

The strategy builder in the Strategy tab maintains an in-memory `strategyLegs[]` array (in `main.js`, not in `portfolio.js`). Each leg: `{ type, qty, strike?, expiryDay? }` with signed qty (positive = long, negative = short).

- **Adding legs**: same type+strike+expiry nets (merges qty); if netted qty = 0, leg is removed
- **Save**: `saveStrategy(name, legs)` stores in `portfolio.strategies[]` with absolute side/qty (converts signed to `{ side, qty }`)
- **Execute**: iterates legs, calls `executeMarketOrder()` for each; all fill as market orders

`computeSummary()` on `StrategyRenderer` returns `{ maxProfit, maxLoss, breakevens, netCost }`. Unbounded profit/loss detected by checking if P&L is still increasing/decreasing at the sample range boundary.

### Option Expiry

`processExpiry(expiryDay, currentPrice, currentDay)` called each tick:
- ITM long calls (`S > K`): `exerciseOption()` -> deduct `strike * qty` cash, add long stock position at entry price = strike
- ITM long puts (`S < K`): `exerciseOption()` -> credit `strike * qty` cash, remove option
- OTM longs: expire worthless, removed from positions
- Short options (ITM or OTM): removed from positions, margin returned to cash. Short ITM options are NOT assigned -- they simply expire (simplified model).

Manual early exercise: "Ex" button in Portfolio tab position rows dispatches `shoals:exerciseOption` custom event. Only available for long options (`qty > 0`).

## UI Architecture

### Toolbar

Logo + brand "Shoals", then toolbar actions:
- **Strategy** button (`#strategy-btn`) -- toggles chart/strategy canvas, activates strategy tab
- Separator
- **Play/pause** button (`#play-btn`) -- SVG icon rebuilt (play triangle / pause bars) on toggle
- **Speed** button (`#speed-btn`) -- cycles through SPEED_OPTIONS: 1x/2x/4x/8x/16x
- **Step** button (`#step-btn`) -- advances one tick (only effective when paused)
- Separator (hidden at <=440px)
- **Theme** toggle (`#theme-btn`, hidden at <=440px)
- **Panel** toggle (`#panel-toggle`)

### Sidebar (4 tabs via shared-tabs.js)

**Trade tab:**
- Quantity slider (`#trade-qty`, 1--100, step 1)
- Order type segmented toggle (`.mode-toggles`): Market | Limit | Stop
- Trigger price slider (`#trigger-price`, conditional -- hidden for Market orders, shown for Limit/Stop), range dynamically set to spot +/-30%
- Stock and Bond buttons (`#stock-btn`, `#bond-btn`): left-click = buy/long, right-click = sell/short
- "Left-click: buy / Right-click: sell/short" hint
- Expiry dropdown (`#expiry-select`) + compact chain table (3 columns: Call | Strike | Put)
- "View Full Chain" button opens chain overlay

**Portfolio tab:**
- Account summary: Cash, Portfolio Value, Total P&L (color-coded), Margin Status (OK / Low / MARGIN CALL with info tip)
- Positions section (`#default-positions`) -- individual (non-strategy) trades with close (X) and exercise (Ex) buttons
- Strategy positions section (`#strategy-positions`) -- grouped by `strategyName`, each group with a label header
- Pending orders section (`#pending-orders`) -- with cancel (X) buttons
- Greeks aggregate (`#greeks-aggregate`) -- 2x2+1 grid: Delta, Gamma, Theta, Vega, Rho (5th spans full width). Display font: Noto Serif at 1.5rem. Color-coded by `--delta`, `--gamma`, etc.

**Strategy tab:**
- Quantity slider (`#strategy-qty`, 1--100, step 1)
- Strike slider (`#strategy-strike`, range dynamically updated from chain data, step $5)
- Expiry slider (`#strategy-expiry`, range from chain DTEs, step = chain interval typically 21)
- Call / Put / Stock / Bond buttons: left-click = long, right-click = short
- "Left-click: long / Right-click: short" hint
- Legs list (`#strategy-legs-list`) -- each row shows description, inline qty input (editable), remove button
- Summary section (`#strategy-summary`) -- Net Cost, Max Profit, Max Loss, Breakeven(s)
- Save / Execute buttons (disabled when no legs)

**Settings tab:**
- Market Regime preset dropdown (`#preset-select`): Calm Bull, Sideways, Volatile, Crisis, Rate Hike
- Advanced Parameters (expandable `#advanced-section`): 11 range sliders for model params (mu, theta, kappa, xi, rho, lambda, muJ, sigmaJ, a, b, sigmaR) with info tip popovers
- Starting Capital number input (`#capital-input`)
- Reset Simulation button (red-styled)

### Candlestick Chart (chart.js)

`ChartRenderer.draw(history, positions, mouseX, mouseY, latestBar)`:
1. Resolve visible day range from `shared-camera.js` (`screenToWorld` on left/right plot edge)
2. **Logarithmic Y-axis** auto-scaled to visible bars' high/low + 10% padding. `priceToY(price) = plotY + plotH - ((log(price) - logLo) / logDelta) * plotH`
3. Draw grid (horizontal price intervals via `_niceInterval()`, vertical day intervals)
4. Draw OHLC candles: up = `_PALETTE.up` (green), down = `_PALETTE.down` (rose). Wicks as 1px lines, bodies as filled rects, min body height 1px. Body width = `clamp(2, 40, zoom * BODY_RATIO)` where BODY_RATIO = 0.6
5. Current price dashed horizontal line (`_PALETTE.accent`)
6. Position entry markers: upward triangles (long, below low) / downward triangles (short, above high)
7. Strike lines for open option positions: dashed, semi-transparent, color-coded call (green) / put (rose), labeled with `$strike` text. Deduplicated by strike value.
8. Y-axis labels (right gutter, 64px), rotated "Price ($)" label (left, 18px), X-axis labels (`D{n}` format, 32px bottom)
9. Crosshair on hover: dashed lines + accent price label badge on Y-axis + day label badge on X-axis

**Camera**: `createCamera()` from `shared-camera.js`. World X = day index. Default zoom = 12 px/day, range 12--36 (100%--300%). Camera binds wheel zoom + mouse pan on chart canvas, plus zoom-in/out/reset buttons. Y-axis always auto-scales (no camera on Y).

**DPR-aware**: canvas buffer sized at `cssWidth * devicePixelRatio`, DPR transform applied in `resize()`.

**ResizeObserver**: on `#chart-container`, fires immediate re-render (not deferred to rAF) to avoid blank flash when sidebar opens/closes and CSS transition changes container width.

### Strategy View (strategy.js)

`StrategyRenderer.draw(legs, spot, vol, rate, dte, greekToggles)`:
- X-axis: centered on spot, default range = spot +/-30%, dynamically extended to cover all leg strikes with 10% padding. 200 sample points across range.
- **Scroll-wheel X zoom**: `_xRange` scales by 1.1x per wheel tick, clamped to `[spot*0.05, spot*1.0]`. Sets `_dirty = true` which main.js detects in frame loop.
- Y-axis: P&L auto-scaled to min/max of payoff curve + 15% padding
- Grid: 5x5 divisions
- Zero line: prominent 1.5px gray
- Current spot: dashed accent vertical line with price label above
- P&L curve: 2.5px line, green above zero, rose below. Color splits at zero crossings via linear interpolation for clean transitions.
- Greek overlays: each on independent auto-scaled Y-axis, 50% opacity, 1.5px line. Colors from `_PALETTE` with hardcoded fallbacks.
- Breakeven dots: accent-colored 4px circles at P&L zero crossings, price labels below
- **Clickable legend**: top-left box with color swatches for P&L + all 5 Greeks. Click toggles Greek on/off (hit detection via stored bounding boxes in `_legendItems[]`). Inactive items dimmed to 35% opacity. Theme-aware background and text colors.
- Empty state: draws axes and grid with no curves when legs array is empty

`computeSummary(legs, spot, vol, rate, dte)` -> `{ maxProfit, maxLoss, breakevens, netCost }`. Samples from `0.01` to `5*spot` (or `5*maxStrike`). Detects unbounded profit/loss by checking if P&L is still monotonically increasing/decreasing at sample boundary.

### Time-to-Expiry Slider

`#time-slider` (`#time-slider-bar` container) appears only in strategy mode. Range dynamically set to max DTE across strategy legs. Value fed to `StrategyRenderer.draw()` as `dte`; curves morph in real time. Label shows "{n} DTE". Disabled when no legs have expiry days.

### Overlays

**Chain overlay** (`#chain-overlay`, `.sim-overlay`): expiry tabs across top as ghost buttons, full chain table (7 columns: Call Bid, Call Ask, Call Delta, Strike, Put Delta, Put Bid, Put Ask). ATM row highlighted with left accent border. Click any bid/ask price cell opens trade dialog. Max-width 560px, scrollable.

**Trade dialog** (`#trade-dialog`, `.sim-overlay`): dynamically built DOM -- side dropdown (Long/Short), quantity number input, order type dropdown (Market/Limit/Stop), conditional trigger price input (hidden for Market). Confirm button is `cloneNode()` replaced on each open to avoid stacking listeners. `$._onTradeSubmit` closure reference. Max-width 380px.

**Margin call overlay** (`#margin-call-overlay`): shows equity, required margin, and shortfall (in red bold). "Liquidate Positions" and "Dismiss" buttons. Max-width 380px.

### Custom Events

Position actions dispatch bubbling `CustomEvent` to `document` from dynamically-built DOM rows in ui.js:
- `shoals:closePosition` -- `{ detail: { id } }` -- closes position at current market prices
- `shoals:exerciseOption` -- `{ detail: { id } }` -- early-exercises a long option
- `shoals:cancelOrder` -- `{ detail: { id } }` -- removes pending order from queue

Wired in `init()` (main.js). Decouples ui.js (builds rows with event listeners) from portfolio operations (require sim state: `S`, `v`, `r`, `day`).

### Tab-Strategy Mode Coupling

Clicking the Strategy tab automatically activates strategy mode (`strategyMode = true`) and shows the strategy canvas. Clicking any other tab deactivates strategy mode. The Strategy toolbar button (`#strategy-btn`) toggles mode AND switches the active sidebar tab (opens sidebar if closed, switches to Strategy tab when activating, back to Trade tab when deactivating).

## Color System

`colors.js` extends `_PALETTE` (from `shared-tokens.js`) with financial aliases before freezing:

| Key | Extended source | Hex | Purpose |
|-----|----------------|-----|---------|
| `_PALETTE.up` | `extended.green` | `#509878` | Up candles, profit P&L, long markers, call chain |
| `_PALETTE.down` | `extended.rose` | `#C46272` | Down candles, loss P&L, short markers, put chain |
| `_PALETTE.bond` | `extended.blue` | `#5C92A8` | Bond button/position styling |
| `_PALETTE.delta` | `extended.blue` | `#5C92A8` | Delta Greek overlay + display |
| `_PALETTE.gamma` | `extended.orange` | `#CC8E4E` | Gamma Greek overlay + display |
| `_PALETTE.theta` | `extended.cyan` | `#4AACA0` | Theta Greek overlay + display |
| `_PALETTE.vega` | `extended.purple` | `#9C7EB0` | Vega Greek overlay + display |
| `_PALETTE.rho` | `extended.slate` | `#8A7E72` | Rho Greek overlay + display |

CSS variables injected into `<style id="project-vars">`:

| Variable | Light value | Dark value |
|----------|-------------|------------|
| `--up`, `--down`, `--bond`, `--delta`, `--gamma`, `--theta`, `--vega`, `--rho` | same both themes | same both themes |
| `--chart-grid` | `_r(light.text, 0.06)` | `_r(dark.text, 0.06)` |
| `--chart-crosshair` | `_r(light.text, 0.25)` | `_r(dark.text, 0.25)` |
| `--chart-axis` | `light.textSecondary` | `dark.textSecondary` |
| `--chain-hover` | `_r(light.text, 0.04)` | `_r(dark.text, 0.06)` |
| `--dialog-bg` | `light.panelSolid` | `dark.panelSolid` |

`strategy.js` resolves colors from `_PALETTE` at draw time via `_paletteColor()` with literal hex fallbacks in `GREEK_META` and `_colors()`.

`chart.js` reads `_PALETTE` and `_r()` globals directly at draw time (inside `draw()` method), not at module load time.

## Keyboard Shortcuts

Registered via `initShortcuts()` from `shared-shortcuts.js`. `?` opens help overlay.

| Key | Action | Group |
|-----|--------|-------|
| `Space` | Play / Pause | Simulation |
| `.` | Step forward (when paused) | Simulation |
| `r` | Reset simulation | Simulation |
| `s` | Toggle Strategy view | View |
| `t` | Toggle sidebar | View |
| `b` | Buy stock (market order, uses trade qty slider) | Trade |
| `1` | Load Calm Bull preset | Presets |
| `2` | Load Sideways preset | Presets |
| `3` | Load Volatile preset | Presets |
| `4` | Load Crisis preset | Presets |
| `5` | Load Rate Hike preset | Presets |

## Key Patterns

- **`$` DOM cache**: plain object `{}`, populated by `cacheDOMElements($)` (135 element references), passed to all ui.js functions. Avoids repeated `getElementById` calls. Also stores closures: `$._onChainCellClick`, `$._onTradeSubmit`.
- **Dirty flag**: `dirty = true` set on any state change; rAF loop skips canvas render when false. `strategy._dirty` also checked (set by wheel zoom). Prevents needless repaints when sim is paused and user is not interacting.
- **Sub-step streaming**: `frame()` distributes 16 intraday sub-steps across the tick interval (`1000 / speed` ms). `dayInProgress` flag tracks whether a day is being streamed. `lastTickTime` advances by `tickInterval` (not `now`) to prevent drift; clamped to avoid burst catch-up after tab backgrounding.
- **Live candle lerp**: `ChartRenderer` has `_lerp` state with `update(now)` (frame-rate-independent exponential lerp, speed=15) and `setLiveCandle(bar)` (sets targets, snaps on day boundary). Close price lerps smoothly; high/low snap immediately. Only the latest candle uses lerped values; historical candles draw raw.
- **Camera integration (chart only)**: `createCamera()` from `shared-camera.js` attached to `#chart-canvas`. World X = day index (day 0 at X=0, each day is 1 world unit wide). `worldToScreen(d + 0.5)` gives candle center pixel. Default zoom 12px/day (100%), max 36px/day (300%). Strategy canvas manages its own X-range.
- **`renderCurrentView()`**: single function that draws either chart or strategy based on `strategyMode` flag. Called from rAF frame loop and from `handleResize()` (immediate, to avoid blank flash on resize).
- **Pure module separation**: `simulation.js` and `portfolio.js` are pure state -- no DOM. `ui.js` is pure DOM -- no sim state. `chart.js` and `strategy.js` are pure renderers -- no state mutation. `main.js` orchestrates.
- **`portfolio` singleton**: exported mutable object from `portfolio.js`. `resetPortfolio()` mutates in place. Positions use signed qty (`qty > 0` = long, `qty < 0` = short).
- **Custom event bus**: position/order action buttons (built in ui.js) dispatch `shoals:*` events to `document`, caught in main.js. Decouples ui.js from portfolio functions and sim state.
- **`_haptics.trigger()` sites**: play/pause (medium/light), step (light), speed cycle (selection), sidebar toggle (light), strategy toggle (selection), preset load (medium), reset (heavy), trade success (success), trade failure (error), pending order placed (medium), liquidate (heavy), chain cell click (selection), order cancel (light), expiry tab (selection), advanced toggle (selection), overlay open/close (light), margin call (error), strategy leg add (selection), strategy save (success), strategy execute (success/error).
- **Theme**: two-state only (light/dark). `initTheme()` reads `localStorage('shoals-theme')`, falls back to system `prefers-color-scheme`. `toggleTheme()` toggles + writes to localStorage. `data-theme` on `<html>`.
- **Bond pricing**: `BOND_FACE_VALUE * exp(-r * T)` where T = DTE/252. No spread model -- fill at mid. Bond Greeks in strategy view: only rho is non-zero (`dB/dr = -T * 100 * exp(-rT)`). Bond P&L in strategy view is always 0 (same T and r for entry and current evaluation).
- **Short position mark-to-market**: stock shorts: `|qty| * (2 * entryPrice - S)`. Option shorts: `|qty| * (entryPrice - currentMid)`.
- **Auto-scroll**: when `playing` and camera is bound, keeps latest candle at ~85% from left edge by computing world-space offset and calling `camera.panBy()`.

## Gotchas

- **Positions have signed qty, NOT a side field** -- `qty > 0` = long, `qty < 0` = short. The `side` parameter exists only in the `executeMarketOrder()` API for convenience; it is converted to signed qty internally. Do not add a `side` property to position objects.
- **`data-theme` is on `<html>` (`document.documentElement`)** -- consistent with all sibling projects. CSS selectors `[data-theme="dark"]` target the root element.
- **No `@import` in CSS** -- fonts loaded via `<link>` in HTML. `shared-base.css` loaded via `/shared-base.css` (absolute path). Serve from `a9lim.github.io/` or shared files won't resolve.
- **Strategy renderer has scroll-wheel zoom but no camera** -- `strategy.js` manages `_xRange`/`_xCenter` directly, NOT via `shared-camera.js`. `bindWheel()` scales `_xRange` and sets `_dirty`. Do not pass a camera to `StrategyRenderer`.
- **`portfolio` is a mutable exported singleton** -- `resetPortfolio()` modifies it in place. Never replace the object reference (e.g. `portfolio = {}` in another module breaks all imports).
- **Margin call pauses sim but does not prevent interaction** -- `playing = false` is set in main.js when `checkMargin().triggered`. The user can still call `tick()` via the step button or keyboard shortcut after dismissing the modal.
- **`_phi` and `_psi` are NOT exported from pricing.js** -- internal helpers for `bs2002Call`. Only `priceAmerican`, `computeGreeks`, and `computeSpread` are exported.
- **Chain table is rebuilt on every `updateChainDisplay()` call** -- do not cache references to table cells. `_bindChainTableClicks()` re-attaches click handlers via `data-*` attribute selectors after each rebuild. Both sidebar chain and overlay chain use the same mechanism.
- **Trade dialog confirm button is replaced on each open** -- `showTradeDialog()` calls `oldBtn.cloneNode(true)` + `replaceChild()` to avoid stacking event listeners. The `$.tradeConfirmBtn` reference is updated to the new node.
- **`INTRADAY_STEPS` does not affect option pricing** -- only controls OHLC bar realism (16 sub-steps per day). Options are priced at `T = DTE / 252` years using closing `v` and `r`.
- **Vasicek rate can go negative** -- `r` is unconstrained. BS2002 uses `rEff = max(r, 1e-7)` for the `beta` computation only. Negative rates are passed through to all other pricing functions; Black-Scholes handles them correctly (unusual but mathematically valid).
- **`shared-tabs.js` loaded at end of `<body>`** -- tab switching works before ES6 module loads, in case of slow network. Do not move it to `<head>`.
- **`strategy.js` GREEK_META uses hardcoded hex colors** -- `_paletteColor()` resolves from `_PALETTE` at draw time with literal fallbacks in `GREEK_META` and `_colors()`. If adding a new Greek, update both.
- **`buildChain()` receives `v` (variance) as its second argument** -- but passes it directly to `computeGreeks()` which expects volatility (sigma). The `main.js` tick function passes `sim.v` (variance) to `buildChain()` and `Math.sqrt(sim.v)` (volatility) to portfolio functions. This means chain Greeks use variance where they should use volatility.
- **256-bar prepopulation on init and reset** -- `sim.prepopulate()` fills the entire `HistoryBuffer` (capacity 256) then scales all OHLC prices by `INITIAL_PRICE / finalClose` so the last bar closes at exactly $100. After scaling, `S`, `v`, and `r` are reset to their starting values. Camera is repositioned after to show latest candle at ~85% from left.
- **Strategy legs live in main.js, not portfolio.js** -- the `strategyLegs[]` array is local state in `main.js`. `portfolio.js` has `saveStrategy()`/`executeStrategy()` but the builder UI works against the main.js array directly.
- **Inline qty editing in leg rows** -- leg rows in the strategy builder have an `<input type="number">` that directly mutates the leg object's `qty` field and triggers `onLegChange()` callback (which resets range and redraws). This bypasses netting logic.
- **`sim.history` is a `HistoryBuffer`, not an array** -- access bars via `.get(day)`, not `history[day]`. Use `.last()` for the most recent bar, `.minDay`/`.maxDay` for bounds, `.length` for total days produced (same semantics as old array length). Direct bracket indexing will NOT work. Capacity is `HISTORY_CAPACITY = 256`; oldest bars are silently overwritten when full.
- **`ExpiryManager` is stateful and lives in main.js** -- the `expiryMgr` instance persists between ticks. It must be `.init(currentDay)` on reset/preset load, and `.update(currentDay)` each tick. The returned expiries array is passed to `buildChain()`. Do not call `generateExpiries()` directly in the tick loop.
- **Position entry markers for very old positions may not render** -- if a position's `entryDay` has been evicted from the ring buffer (older than 256 days), `history.get(entryDay)` returns `undefined` and the marker is skipped. The position itself still works correctly.
- **`sim._partial` is pushed to history by reference** -- `beginDay()` creates a bar object and pushes it to `HistoryBuffer`. `substep()` mutates this same object in-place. The ring buffer stores the reference, so `history.last()` and `history.get(day)` return the live, mutating bar. Do not clone or replace `_partial` mid-day.
- **`dayInProgress` flag in main.js** -- tracks whether a streamed day is active (between `beginDay()` and `finalizeDay()`). Must be reset to `false` on preset load and sim reset. Pausing does NOT finalize the day — the partial bar stays frozen mid-formation until the user resumes or steps.
- **Step button finishes partial days** -- if `dayInProgress` is true when step is pressed, remaining sub-steps are completed instantly (no new `beginDay()`). Lerp state is snapped to final values.
- **`chart._lerp.day = -1` means no live candle** -- set on reset/preset load to disable lerp rendering. `setLiveCandle()` sets it to the bar's day on first call.
