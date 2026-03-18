# CLAUDE.md

Part of the **a9l.im** portfolio. See parent `site-meta/CLAUDE.md` for the shared design system specification. Sibling projects: `physsim`, `biosim`, `gerry`.

## Overview

Shoals — interactive options trading simulator. Models a stock as geometric Brownian motion with Merton jumps and Heston stochastic volatility; the risk-free rate follows a Vasicek process. Users buy and sell combinations of the underlying stock, zero-coupon bonds, and American options (calls/puts) at various strikes and expiries. Options priced via Bjerksund-Stensland 2002 analytical approximation. Includes a strategy builder with payoff diagrams and Greek overlays, a full interactive options chain, and a portfolio/margin system.

Zero dependencies — vanilla HTML5/CSS3/JS with ES6 modules. No build step.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Serve from `a9lim.github.io/` — shared files load via absolute paths (`/shared-*.js`, `/shared-base.css`). ES6 modules require HTTP. No build step, no test framework, no linter.

## File Map

```
main.js                461 lines  Entry point: DOM cache $, rAF loop, tick(), speed/play/reset,
                                   camera setup, shortcut registration, custom event wiring
index.html             454 lines  Toolbar, chart canvas, strategy canvas, sidebar (4 tabs),
                                   chain overlay, trade dialog, margin call overlay, intro screen
styles.css             529 lines  Project-specific CSS overrides; chain table, position rows,
                                   strategy builder, trade dialog, margin alert, P&L coloring
colors.js               53 lines  Financial color aliases (_PALETTE.up/down/bond/delta/gamma/
                                   theta/vega/rho), CSS var injection (--up, --down, --bond,
                                   --delta, --gamma, --theta, --vega, --rho, --chart-grid,
                                   --chart-crosshair, --chart-axis, --chain-hover, --dialog-bg),
                                   freezes _PALETTE
src/
  config.js             25 lines  Named constants and PRESETS array (5 market regimes)
  simulation.js        140 lines  Simulation class: GBM + Merton jumps + Heston stoch vol +
                                   Vasicek rate; tick() produces OHLC bars via INTRADAY_STEPS
  pricing.js           467 lines  Bjerksund-Stensland 2002 American option pricing + bivariate
                                   normal CDF (Drezner-Wesolowsky) + finite-diff Greeks +
                                   bid/ask spread model. Pure math — no imports.
  chain.js             134 lines  generateExpiries() (21-day cycles), generateStrikes()
                                   ($5 intervals, STRIKE_RANGE strikes each side), buildChain()
  portfolio.js         690 lines  Positions, market/limit/stop orders, strategy groups,
                                   cash/margin, processExpiry(), exerciseOption(), aggregateGreeks()
  chart.js             571 lines  ChartRenderer: OHLC candles, Y auto-scale, grid, crosshair,
                                   position entry markers, strike lines; uses shared-camera.js
  strategy.js          708 lines  StrategyRenderer: payoff P&L diagram, Greek overlays (Delta/
                                   Gamma/Theta/Vega/Rho), breakeven dots, time slider support,
                                   computeSummary(). Does NOT use shared-camera.js.
  ui.js                ~1000 lines cacheDOMElements($), bindEvents(), updateChainDisplay(),
                                   updatePortfolioDisplay(), updateGreeksDisplay(),
                                   syncSettingsUI(), showChainOverlay(), showTradeDialog(),
                                   showMarginCall(), toggleStrategyView(), updatePlayBtn(),
                                   updateSpeedBtn(), renderStrategyBuilder(), wireInfoTips().
                                   Pure functions — no internal state.
  theme.js              20 lines  initTheme() (localStorage + prefers-color-scheme),
                                   toggleTheme() (2-state: light/dark)
```

## Module Dependencies

```
main.js
  ├─ src/config.js        (SPEED_OPTIONS, PRESETS)
  ├─ src/simulation.js    (Simulation — imports config)
  ├─ src/chain.js         (buildChain — imports pricing, config)
  ├─ src/portfolio.js     (portfolio, resetPortfolio, checkPendingOrders, processExpiry,
  │                         checkMargin, aggregateGreeks, portfolioValue, executeMarketOrder,
  │                         closePosition, exerciseOption, liquidateAll, placePendingOrder,
  │                         cancelOrder — imports pricing, config)
  ├─ src/chart.js         (ChartRenderer — no ES6 imports; reads _PALETTE global)
  ├─ src/strategy.js      (StrategyRenderer — imports pricing, config)
  ├─ src/ui.js            (cacheDOMElements, bindEvents, display updaters — imports config;
  │                         reads _haptics, showToast globals)
  └─ src/theme.js         (initTheme, toggleTheme — no imports)

Global scripts (loaded via <script> in <head>):
  shared-tokens.js  → _PALETTE, _FONT, _r, _parseHex, color math
  shared-utils.js   → showToast, debounce, throttle, clamp, lerp
  shared-haptics.js → _haptics.trigger()
  shared-camera.js  → createCamera()
  colors.js         → extends _PALETTE, freezes, injects CSS vars

Global scripts (loaded via <script> in <head>, after colors.js):
  shared-touch.js      → initSwipeDismiss()
  shared-info.js       → createInfoTip()
  shared-shortcuts.js  → initShortcuts()

Loaded at end of <body>:
  shared-tabs.js       → tab switching IIFE
```

## Data Flow

Each tick:
1. `simulation.js` tick → produces `{ day, open, high, low, close, v, r }` appended to `sim.history`
2. `chain.js` reads `S, v, r` → generates strikes + expiries → calls `pricing.js` for every option
3. `portfolio.js` checks pending orders against new `S` → fills triggered orders; processes expiry (ITM auto-exercise, OTM expire worthless); checks margin → margin call modal if triggered
4. `chart.js` or `strategy.js` renders the active view
5. `ui.js` updates sidebar (Portfolio tab, Greeks tab, Trade tab chain display)

## Simulation Engine

### Stock Price Model

GBM with Merton jumps and Heston stochastic volatility (Euler-Maruyama, `dt = 1/252` per intra-day sub-step):

```
dS/S = (μ − λk)dt + √v · dW₁ + J · dN(λ)
dv   = κ(θ − v)dt + ξ√v · dW₂      (dW₁·dW₂ = ρdt)
```

Parameters: `μ` (drift), `v` (variance), `κ` (mean-reversion speed), `θ` (long-run variance), `ξ` (vol-of-vol), `ρ` (price/vol correlation), `λ` (jump intensity, jumps/year), `J ~ N(μⱼ, σⱼ)` (log-jump size), `k = E[eᴶ − 1]` (jump compensator).

Variance `v` floored at 0 after each sub-step (full truncation scheme).

### Interest Rate Model

Vasicek (`dt = 1/(252 × INTRADAY_STEPS)`):

```
dr = a(b − r)dt + σᵣ · dW₃      (dW₃ independent of dW₁, dW₂)
```

Parameters: `a` (mean-reversion speed), `b` (long-run rate target), `σᵣ` (rate vol). Rate `r` is unconstrained (can go negative).

### OHLC Construction

Each trading day runs `INTRADAY_STEPS = 16` sub-steps at `dt = 1/(252 × 16)`. Open = first sub-step price, Close = last, High/Low = max/min across all 16 sub-steps. Only Close is carried forward as `S` for the next day.

### Random Number Generation

Box-Muller transform for standard normals. Inverse-transform method for Poisson jump counts (suitable for small `λ·dt`).

### Market Regime Presets

| Preset | μ | θ | κ | ξ | ρ | λ | μⱼ | σⱼ | a | b | σᵣ |
|--------|---|---|---|---|---|---|----|----|---|---|-----|
| Calm Bull | 0.08 | 0.04 | 3.0 | 0.3 | −0.5 | 0.5 | −0.02 | 0.03 | 0.5 | 0.04 | 0.005 |
| Sideways | 0.02 | 0.06 | 2.0 | 0.4 | −0.6 | 1.0 | −0.01 | 0.04 | 0.5 | 0.03 | 0.008 |
| Volatile | 0.05 | 0.12 | 1.5 | 0.6 | −0.7 | 3.0 | −0.03 | 0.06 | 0.3 | 0.05 | 0.012 |
| Crisis | −0.10 | 0.25 | 0.5 | 0.8 | −0.85 | 8.0 | −0.08 | 0.10 | 0.2 | 0.02 | 0.020 |
| Rate Hike | 0.04 | 0.08 | 2.0 | 0.5 | −0.6 | 1.5 | −0.02 | 0.05 | 0.8 | 0.08 | 0.015 |

On `sim.reset(presetIndex)`, state initializes at `v = θ` (long-run variance) and `r = b` (long-run rate).

## Options Pricing

### Bjerksund-Stensland 2002

Analytical approximation for American options. The algorithm:
1. Computes perpetual exercise boundary parameters `β`, `B∞`, `B₀`
2. Splits time-to-expiry at golden-ratio `t₁ = (√5−1)/2 × T`
3. Computes flat early-exercise boundaries `I₁` (at `t₁`) and `I₂` (at `T`) via exponential approximation
4. Prices using Black-Scholes-Merton European formula plus early-exercise premium via `_phi()` and `_psi()` helper functions (single-barrier and bivariate-barrier expectations)

If `S ≥ I₂`, immediate exercise: price = `S − K`. Falls back to European Black-Scholes when `b ≥ r` (no dividends, early exercise never optimal). Small floor `rEff = max(r, 1e-7)` prevents `β = 0` degenerate case when `r → 0`.

**Put pricing via put-call symmetry** (Bjerksund-Stensland 1993):
```
P_am(S, K, T, r, 0, σ) = C_am(K, S, T, 0, r, σ)
```

**Bivariate normal CDF**: Drezner-Wesolowsky (1990) 5-point Gauss-Legendre quadrature, as implemented in Haug (2007). Sign-case decomposition for general `(a, b, ρ)`.

### Finite-Difference Greeks

| Greek | Method | Step |
|-------|--------|------|
| Delta | central diff in S | `h_S = S × 0.01` |
| Gamma | second central diff in S | same `h_S` |
| Theta | forward diff in T | `h_T = 1/252` (1 day) |
| Vega | central diff in σ | `h_σ = 0.001` |
| Rho | central diff in r | `h_r = 0.0001` |

### Bid/Ask Spread Model

```
spread = max(0.05, theoPrice × 0.02 × (1 + √v) + 0.10 × |log(S/K)|)
```

Bid = theo − spread/2, Ask = theo + spread/2. Market buy fills at ask; market sell at bid. Widens in high-vol regimes (when `v` is large) and for deep ITM/OTM strikes.

## Options Chain

### Strike Generation

ATM strike = `round(S / 5) × 5` (STRIKE_INTERVAL = 5). `STRIKE_RANGE = 12` strikes above and below ATM, filtered for positive values, sorted ascending → 25 strikes total.

### Expiry Generation

21-trading-day cycle (approximate monthly). First expiry = next 21-day boundary strictly above `currentDay`. 8 expiries generated by default. Identified by `{ day, dte }`.

### Chain Data Structure

`buildChain(S, v, r, currentDay)` returns:
```
[{
  day:     number,
  dte:     number,
  options: [{ strike, call: { price, delta, gamma, theta, vega, rho, bid, ask }, put: {...} }]
}]
```

Repriced once per simulation tick.

## Portfolio System

### Position Types

- **stock** — long or short shares. Short value = `qty × (2 × entryPrice − S)`.
- **bond** — zero-coupon, face value $100, priced at `100 × exp(−rT)`. Maturity aligned with options expiry days.
- **call** / **put** — American, at any available strike/expiry. Long or short (writing).

Position object shape: `{ id, type, side, qty, entryPrice, entryDay, strike?, expiryDay?, strategyName? }`

### Order Types

- **market** — instant fill at model mid ± bid/ask spread (options), or mid (stock/bond)
- **limit** — fills when spot reaches trigger: buy if `S ≤ triggerPrice`, sell if `S ≥ triggerPrice`
- **stop** — triggers a market order: buy if `S ≥ triggerPrice`, sell if `S ≤ triggerPrice`

Pending orders evaluated each tick by `checkPendingOrders()`. Orders silently dropped if unfillable.

### Margin Rules

| Position | Rule |
|----------|------|
| Short stock | Reg-T initial: 50% of position value |
| Short bond | 50% of fill value |
| Short option | `max(20% × underlying value, premium received)` |
| Long positions | Fully paid from cash (no leverage) |

**Maintenance margin**: `equity < 25% × totalPositionValue` triggers margin call. Sim loop pauses; modal offers Liquidate & Reset or Dismiss.

### Strategy System

Named multi-leg strategies saved via `saveStrategy(name, legs)`. `executeStrategy()` fires all legs as market orders tagged with the strategy name. Portfolio tab groups positions by `strategyName` in collapsible sections.

### Option Expiry

`processExpiry(expiryDay, currentPrice, currentDay)` called each tick:
- ITM long calls: `exerciseOption()` → deduct strike cash, add long stock position
- ITM long puts: `exerciseOption()` → credit strike cash
- OTM / short expiring: removed from positions; short option margin returned to cash

Manual early exercise: "Ex" button in Portfolio tab position rows dispatches `shoals:exerciseOption` custom event.

## UI Architecture

### Toolbar

Brand "a9l / Shoals / Trading Simulator", then:
- **Strategy** button (`#strategy-btn`) — toggles chart/strategy canvas
- **Play/pause** button (`#play-btn`) — SVG icon, rebuilt on toggle
- **Speed** button (`#speed-btn`) — cycles 1×/2×/4×/8×/16×
- **Step** button (`#step-btn`) — visible only when paused
- **Theme** toggle (`#theme-btn`)
- **Panel** toggle (`#panel-toggle`)

### Sidebar Tabs (4 tabs via shared-tabs.js)

**Trade:**
- Quick buy/short stock buttons, buy bond button
- Expiry dropdown (`#expiry-select`) + compact chain table (`#chain-table`): Call | Strike | Put
- "Full Chain" link opens chain overlay

**Portfolio:**
- Default positions section (`#default-positions`) — individual trades
- Strategy positions section (`#strategy-positions`) — collapsible by strategy name
- Pending orders section (`#pending-orders`) with cancel buttons
- Cash, portfolio value, total P&L (`#cash-display`, `#portfolio-value`, `#total-pnl`)
- Margin status indicator (`#margin-status`)

**Greeks:**
- Aggregate portfolio Greeks: Δ, Γ, Θ, ν, ρ (`#greek-delta` etc.)
- Per-position breakdown (`#greeks-breakdown`)

**Settings:**
- Market regime preset selector (`#preset-select`)
- Advanced section (expandable, `#advanced-section`): sliders for all 11 model params (μ, θ, κ, ξ, ρ, λ, μⱼ, σⱼ, a, b, σᵣ)
- Initial capital input (`#capital-input`, pre-start only)
- Reset button with `_haptics.trigger('heavy')`

### Main View — Candlestick Chart (chart.js)

`ChartRenderer.draw(history, positions, mouseX, mouseY, latestBar)`:
1. Resolve visible day range from `shared-camera.js` (`screenToWorld` on left/right plot edge)
2. Auto-scale Y to visible bars' high/low + 10% padding
3. Draw grid (horizontal price intervals via `_niceInterval()`, vertical day intervals)
4. Draw OHLC candles: up = `_PALETTE.up` (green), down = `_PALETTE.down` (rose). Wicks as 1px lines, bodies as filled rects, min body height 1px
5. Current price dashed horizontal line (`_PALETTE.accent`)
6. Position entry markers: upward triangles (long, below low) / downward triangles (short, above high)
7. Strike lines for open option positions: dashed, color-coded call (green) / put (rose), labeled
8. Y-axis labels (right gutter, 64px), X-axis labels (`D{n}` format, 32px bottom)
9. Crosshair on hover: dashed lines + accent price label on Y-axis + day label on X-axis

Camera: horizontal pan/zoom via `shared-camera.js`. Y-axis always auto-scales. Day slot width = `clamp(2, 40, 8 × zoom)` px.

### Strategy View (strategy.js)

`StrategyRenderer.draw(legs, spot, vol, rate, dte, greekToggles)`:
- X-axis: `[spot × 0.5, spot × 1.5]` (fixed ±50% range), 200 sample points
- Y-axis: P&L auto-scaled to min/max of payoff curve + 15% padding
- Zero line prominent
- Current spot as dashed accent vertical line
- P&L curve: green above zero, rose below, colour splits at zero crossings (linearly interpolated)
- Greek overlays: each on independent secondary Y-axis, 50% opacity, 1.5px line
- Breakeven dots: accent colour circles at zero crossings, price labels below
- Legend: colour swatches for P&L + all Greeks, dimmed when toggle off

Does NOT use `shared-camera.js` — fixed X range, no pan/zoom.

`computeSummary(legs, spot, vol, rate, dte)` → `{ maxProfit, maxLoss, breakevens, netCost }`.

### Overlays

**Chain overlay** (`#chain-overlay`, `.sim-overlay`): expiry tabs across top, full chain table (7 columns: Call Bid, Call Ask, Call Δ, Strike, Put Δ, Put Bid, Put Ask). Click any price cell opens trade dialog.

**Trade dialog** (`#trade-dialog`, `.sim-overlay`): dynamically built DOM — side selector, quantity input, order type selector (market/limit/stop), conditional trigger price input. Confirm fires `$._onTradeSubmit`.

**Margin call overlay** (`#margin-call-overlay`): equity vs requirement, shortfall in red, Liquidate & Reset vs Dismiss buttons.

### Event Bus (Custom Events)

Position actions dispatch bubbling `CustomEvent` to `document` from within dynamically-built DOM rows:
- `shoals:closePosition` — `{ detail: { id } }`
- `shoals:exerciseOption` — `{ detail: { id } }`
- `shoals:cancelOrder` — `{ detail: { id } }`

Wired in `init()` (main.js). This decouples ui.js (which builds rows) from portfolio operations (which require sim state).

### Time-to-Expiry Slider

`#time-slider` (`#time-slider-bar` container) appears only in strategy mode. Range 1–365 (DTE integer). Value fed to `StrategyRenderer.draw()` as `dte`; curves morph in real time.

## Color System

`colors.js` extends `_PALETTE` (from `shared-tokens.js`) with financial aliases before freezing:

| Key | Extended source | Hex | Purpose |
|-----|----------------|-----|---------|
| `_PALETTE.up` | `extended.green` | `#509878` | Up candles, profit P&L, long markers, call chain |
| `_PALETTE.down` | `extended.rose` | `#C46272` | Down candles, loss P&L, short markers, put chain |
| `_PALETTE.bond` | `extended.blue` | `#5C92A8` | Bond positions |
| `_PALETTE.delta` | `extended.blue` | `#5C92A8` | Delta Greek overlay |
| `_PALETTE.gamma` | `extended.orange` | `#CC8E4E` | Gamma Greek overlay |
| `_PALETTE.theta` | `extended.cyan` | `#4AACA0` | Theta Greek overlay |
| `_PALETTE.vega` | `extended.purple` | `#9C7EB0` | Vega Greek overlay |
| `_PALETTE.rho` | `extended.slate` | `#8A7E72` | Rho Greek overlay, neutral text |

CSS variables injected into `<style id="project-vars">`:

| Variable | Light value | Dark value |
|----------|-------------|------------|
| `--up`, `--down`, `--bond`, `--delta`, `--gamma`, `--theta`, `--vega`, `--rho` | same both themes | same both themes |
| `--chart-grid` | `_r(light.text, 0.06)` | `_r(dark.text, 0.06)` |
| `--chart-crosshair` | `_r(light.text, 0.25)` | `_r(dark.text, 0.25)` |
| `--chart-axis` | `light.textSecondary` | `dark.textSecondary` |
| `--chain-hover` | `_r(light.text, 0.04)` | `_r(dark.text, 0.06)` |
| `--dialog-bg` | `light.panelSolid` | `dark.panelSolid` |

`strategy.js` resolves colors from `_PALETTE` global at draw time via `_paletteColor()`, falling back to literal hex strings if `_PALETTE` is unavailable.

`chart.js` reads `_PALETTE` and `_r()` globals directly (no guard — always loaded before the module).

## Keyboard Shortcuts

Registered via `initShortcuts()` from `shared-shortcuts.js`. `?` opens help overlay.

| Key | Action | Group |
|-----|--------|-------|
| `Space` | Play / Pause | Simulation |
| `.` | Step forward (when paused) | Simulation |
| `r` | Reset simulation | Simulation |
| `s` | Toggle Strategy view | View |
| `t` | Toggle sidebar | View |
| `b` | Buy stock (1 share, market order) | Trade |
| `1` | Load Calm Bull preset | Presets |
| `2` | Load Sideways preset | Presets |
| `3` | Load Volatile preset | Presets |
| `4` | Load Crisis preset | Presets |
| `5` | Load Rate Hike preset | Presets |

## Key Patterns

- **`$` DOM cache**: plain object `{}`, populated by `cacheDOMElements($)`, passed to all ui.js functions and most init() helpers. Avoids repeated `getElementById` calls.
- **Dirty flag**: `dirty = true` set whenever state changes; rAF loop skips canvas render when false. Prevents needless repaints when sim is paused and user is not interacting.
- **Speed multiplier loop**: `for (let i = 0; i < speed; i++) tick()` inside `frame()`. No accumulator — each rAF frame runs exactly `speed` ticks. SPEED_OPTIONS = [1, 2, 4, 8, 16].
- **Camera integration (chart only)**: `createCamera()` from `shared-camera.js` attached to `#chart-canvas`. World X = day index (day 0 at X=0, each day is 1 world unit wide). `worldToScreen(d + 0.5)` gives candle center pixel. Strategy canvas uses its own fixed X mapping — no camera.
- **Pure module separation**: `simulation.js` and `portfolio.js` are pure state — no DOM. `ui.js` is pure DOM manipulation — no sim state. `chart.js` and `strategy.js` are pure renderers — no state mutation. `main.js` orchestrates all of them.
- **`portfolio` singleton**: exported mutable object from `portfolio.js`. `resetPortfolio()` mutates in place (no re-import needed).
- **Custom event bus**: position row action buttons (built in ui.js) dispatch `shoals:*` events to `document`, caught in main.js. Keeps ui.js decoupled from portfolio functions and sim state.
- **`_haptics.trigger()` call sites**: play/pause (medium/light), step (light), speed cycle (selection), sidebar toggle (light), strategy toggle (selection), preset load (medium), reset (heavy), buy/sell success (success), buy/sell failure (error), trade submit (medium), liquidate (heavy), chain cell click (selection), order cancel (light), expiry tab (selection).
- **Theme**: two-state only (light/dark). `initTheme()` reads `localStorage('shoals-theme')`, falls back to `prefers-color-scheme`. `toggleTheme()` writes to localStorage. `data-theme` on `<html>`. No "simulation-follows-sunlight" mode unlike biosim.
- **Bond pricing**: `100 × exp(−r × T)` where T = DTE/252. Bonds have no spread model — fill at mid. Bond Greeks: only rho is non-zero (`∂B/∂r = −T × 100 × exp(−rT)`).
- **Short position mark-to-market**: `qty × (2 × entryPrice − S)` for stock (gains when S falls). Options shorts: `qty × (entryPrice − currentMid)`.
- **`_PALETTE` read timing**: `chart.js` reads `_PALETTE` at draw time (inside `draw()` method), not at module load time. This avoids stale references since `_PALETTE` is frozen after `colors.js` runs but the module may load before that.

## Gotchas

- **`data-theme` is on `<html>` (`document.documentElement`)** — `src/theme.js` uses `document.documentElement.dataset.theme`, and `index.html` has `<html lang="en" data-theme="light">`. CSS selectors `[data-theme="dark"]` target the root element, same as all sibling projects.
- **No `@import` in CSS** — fonts loaded via `<link>` in HTML. `shared-base.css` loaded via `/shared-base.css` (absolute path). Serve from `a9lim.github.io/` or shared files won't resolve.
- **Strategy renderer uses no camera** — `strategy.js` has its own fixed `xMin/xMax` mapping. Do not pass `camera` to `StrategyRenderer`. The `#time-slider` controls the temporal dimension instead.
- **`portfolio` is a mutable exported singleton** — `resetPortfolio()` modifies it in place. Never replace the object reference (e.g. `portfolio = {}` in another module breaks all imports).
- **Margin call pauses sim but does not prevent interaction** — `playing = false` is set in main.js when `checkMargin().triggered`. The user can still manually call `tick()` via step button after dismissing the modal.
- **`_phi` and `_psi` functions in pricing.js** are not exported — they are internal helpers for `bs2002Call`. Only `priceAmerican`, `computeGreeks`, and `computeSpread` are exported.
- **Chain cell clicks use `data-*` attributes** — `_bindChainTableClicks()` in ui.js attaches handlers to cells with `[data-type]`. Both the compact sidebar chain and the full overlay chain use the same mechanism. The chain table is rebuilt entirely on each `updateChainDisplay()` call — do not cache references to table cells.
- **Trade dialog confirm button is replaced on each open** — `showTradeDialog()` does `oldBtn.parentNode.replaceChild(newBtn, oldBtn)` to avoid stacking multiple listeners. The `$.tradeConfirmBtn` reference is updated to the new node.
- **`INTRADAY_STEPS` affects chain pricing** — it is only a simulation constant (controls OHLC realism), not used in pricing. Options are priced at `T = DTE / 252` years using the closing `v` and `r`.
- **Vasicek rate can go negative** — `r` is unconstrained. BS2002 `rEff = max(r, 1e-7)` floors it for the `β` computation, but the actual `r` passed to all other pricing functions may be negative; Black-Scholes handles this correctly (negative discount rates are unusual but mathematically valid).
- **`shared-tabs.js` loaded at end of `<body>`** — tab switching works before the ES6 module loads, in case of slow network. Do not move it to `<head>`.
- **`strategy.js` GREEK_META colors are hardcoded literals** — the `_paletteColor()` guard resolves them from `_PALETTE` at draw time, but keeps literal fallbacks in `GREEK_META` and `_colors()`. If adding a new Greek, update both `GREEK_META` and `_colors()`.
