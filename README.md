# Shoals

A full-featured options trading simulator at [a9l.im/finsim](https://a9l.im/finsim).

Trade stocks, zero-coupon bonds, and American options in a market driven by stochastic volatility, jump diffusion, and mean-reverting interest rates. Build multi-leg strategies, analyze Greeks, manage a margin portfolio, and watch narrative-driven market events unfold -- all in the browser with zero dependencies.

**[Live Demo](https://a9l.im/finsim)** | Part of the [a9l.im](https://a9l.im) portfolio

## Highlights

- **Realistic price dynamics** -- GBM with Merton jump diffusion, Heston stochastic volatility (mean-reverting, Cholesky-correlated), and Vasicek interest rates, with 16 intraday substeps and smooth cubic OHLC interpolation
- **American option pricing** -- CRR binomial tree (128 steps) with discrete proportional dividends and finite-difference Greeks (Delta, Gamma, Theta, Vega, Rho)
- **Full options chain** -- 25 strikes across 8 rolling expiries with volatility-aware, moneyness-adjusted bid/ask spreads
- **Portfolio system** -- market, limit, and stop orders; signed-quantity netting; short selling with daily borrow interest; Reg-T margin with margin call overlay and forced liquidation
- **Strategy builder** -- multi-leg construction with live payoff diagrams, Greek overlays on independent Y-axes, breakeven analysis, time-to-expiry slider showing theta decay, and atomic execution with rollback on partial failure
- **Narrative event engine** -- 88 curated scenarios across Fed monetary policy, macro/geopolitical, sector, and company-specific categories with Paradox-style MTTH followup chains (max depth 5)
- **LLM-generated events** -- optional Claude API integration generates market events with full universe lore (political context, corporate drama), structured via tool use
- **5 static + 2 dynamic market regimes** -- Calm Bull, Sideways, Volatile, Crisis, Rate Hike, plus offline and LLM-driven dynamic modes
- **Log-scale candlestick chart** -- DPR-aware OHLC rendering with position entry markers, strike lines, crosshair, and camera pan/zoom

## Features

### Trading

- **Three instrument types** -- stocks (long/short), zero-coupon bonds (face $100, maturity-aligned), and American options (calls and puts)
- **Three order types** -- market (instant fill at bid/ask), limit (fills when spot reaches trigger), stop (triggers market order at threshold)
- **Margin system** -- 50% initial / 25% maintenance Reg-T margin; short positions require margin; long positions can be purchased on margin (negative cash balance incurs borrow interest)
- **Borrow interest** -- daily cost on short stock/bond positions: `|qty| * notional * (max(r, 0) + borrowSpread * sigma) / 252`
- **Option expiry** -- ITM longs auto-exercised, OTM expire worthless, bonds settle at face value

### Strategy Builder

- Unlimited legs with inline quantity editing
- Live payoff diagram (P&L curve split at breakeven, green/rose)
- Greek overlays (Delta, Gamma, Theta, Vega, Rho) on independent Y-axes with clickable legend
- Summary: net cost, max profit, max loss, breakeven points
- Time-to-expiry slider showing theta decay and bond interest accrual
- Atomic execution: rolls back all filled legs if any single leg fails
- Save and load named strategies

### Dynamic Market Events

The event engine fires two types of events: scheduled FOMC meetings every 32 trading days (~8x/year) and Poisson-drawn non-Fed events (~1 per 60 trading days). Events apply additive parameter deltas and can trigger MTTH followup chains.

**Universe lore:** President John Barron (Federalist, military hawk) pressures Fed Chair Hayden Hartley on rates. Palanthropic (PNTH) -- an AI startup -- is torn between CEO Eugene Gottlieb (ethics) and Chairwoman Andrea Dirks (defense contracts). ~25 company-specific events drive multi-step narrative arcs.

**LLM mode:** Browser-direct Anthropic API generates batches of 3-5 events via structured tool use, with full universe context and simulation state. Falls back to offline pool on failure.

### Compliance & Reputation

- **Compliance system** -- regulatory pressure escalates based on player defiance. Heat vs credibility balance determines tone (warm → professional → pointed → final warning → terminated). Profitable track records reduce heat and raise credibility.
- **26 portfolio-triggered popup events** -- compliance directives with declarative trade execution, insider tip offers (70% real / 30% fake), and atmospheric narrative moments.
- **Reputation synthesis** -- Insider, Principled, Speculator, Survivor, Kingmaker, or Ghost, determined by player choices across the full term.

### Price Impact

- **Almgren-Chriss model** -- sqrt impact with decaying cumulative volume (half-life 5 days). Impact is an overlay on the simulation price, never mutating it.
- **Dynamic MM rehedging** -- market makers hedge aggregate player delta each substep, creating realistic gamma squeeze and pin-to-strike dynamics.
- **Layer 3 param shifts** -- large gross notional exposure shifts volatility and drift parameters with logarithmic scaling.

### Epilogue

4-page narrative ending generated from world state, portfolio history, event log, and player choices. Congressional diagrams, financial scorecards, career arc from quarterly reviews, and a signature moment from impact history. Triggered at the end of the presidential term (day 1008).

## Controls

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `.` | Step forward |
| `r` | Reset |
| `s` | Strategy view |
| `t` | Toggle sidebar |
| `b` | Buy stock |
| `1`-`5` | Load static preset |
| `6` | Dynamic (Offline) |
| `7` | Dynamic (LLM) |
| `?` | Shortcut help |

## Running Locally

Serve from the parent `a9lim.github.io/` directory (shared files load via absolute paths):

```bash
cd path/to/a9lim.github.io
python -m http.server
```

Then open `http://localhost:8000/finsim/`.

## Tech

Vanilla HTML/CSS/JS with ES6 modules. No build step, no bundler, no npm. Canvas 2D for charts. All pricing, simulation, and portfolio logic is hand-written -- no financial libraries.

## Architecture

```
main.js               1810 lines  Orchestrator: rAF loop, sub-step streaming, live candle animation,
                                   camera, shortcuts, strategy builder with rollback, ExpiryManager,
                                   popup queue, compliance integration, epilogue trigger
index.html             691 lines  Toolbar, chart/strategy canvases, sidebar (4 tabs), chain/trade/
                                   popup/reference/epilogue overlays, intro screen
styles.css            1065 lines  Chain table, positions, strategy builder, trade dialog, popup
                                   events, P&L/Greek colors, responsive breakpoints
colors.js               59 lines  Financial color aliases (up/down/call/put/stock/bond + Greeks)
src/
  config.js            103 lines  All constants (timing, instruments, margin, spreads, events,
                                   rendering, price impact), PRESETS (5 static + 2 dynamic)
  simulation.js        251 lines  GBM + Merton + Heston + Vasicek; beginDay/substep/finalizeDay
                                   pipeline; prepopulate() with reverse-backfill
  pricing.js           834 lines  CRR binomial tree (128 steps) with BSS smoothing, term-structure
                                   vol, moneyness skew, Vasicek per-step discounting, discrete
                                   dividends, dual call+put induction, finite-diff Greeks (14 trees)
  chain.js             230 lines  ExpiryManager (8 rolling expiries), strike generation, lazy pricing
                                   with reusable tree pool, per-strike impact overlay
  portfolio.js        1070 lines  Signed-qty positions, market/limit/stop orders, netting, margin,
                                   borrow interest, expiry, strategy execution with rollback
  chart.js             728 lines  Log Y-axis OHLC candles, live cubic interpolation, position markers,
                                   strike lines, crosshair, shared-camera.js integration
  strategy.js         1000 lines  Payoff diagram, Greek overlays, breakeven analysis, time slider,
                                   input-keyed caching, tree-based hypothetical S sweep
  ui.js               1054 lines  DOM binding, display updaters, overlay management, chain/portfolio
                                   renderers, strategy dropdowns, popup event display
  events.js            529 lines  EventEngine: Poisson scheduler, MTTH chains, Fed schedule,
                                   boredom boost, midterms, era gating
  event-pool.js       3210 lines  ~277 curated events across 12 categories (Fed, macro, sector,
                                   political, market, compound, etc.), insider tip outcomes
  popup-events.js     1248 lines  26 portfolio-triggered popup events: 10 compliance directives,
                                   3 insider tips, 12 atmosphere, 1 unlimited risk
  world-state.js       170 lines  Mutable narrative state: Congress, PNTH board, geopolitics,
                                   Fed credibility, election cycle
  price-impact.js      260 lines  Almgren-Chriss sqrt impact model with decaying cumulative volume,
                                   dynamic MM rehedging, Layer 3 param overlays
  compliance.js         91 lines  Regulatory heat/credibility state, escalating tone, game over
  epilogue.js          567 lines  4-page narrative ending from world state + portfolio + event log,
                                   reputation synthesis, congressional diagrams
  llm.js               271 lines  LLMEventSource: Anthropic API via structured tool use,
                                   full lore in system prompt, offline fallback
  strategy-store.js    370 lines  22 built-in strategy presets, localStorage CRUD, relative
                                   strike/DTE offsets, resolveLegs(), shared expiry toggle
  reference.js        1617 lines  29 reference entries with KaTeX math
  chain-renderer.js    314 lines  Chain table DOM with event delegation, modeled OI display
  portfolio-renderer.js 420 lines Portfolio display with DOM diffing, strategy group boxes,
                                   portfolio value sparkline vs buy-and-hold benchmark
  position-value.js     88 lines  unitPrice() (vol surface + impact), position value and P&L
  format-helpers.js     63 lines  fmtDollar (appends "k"), fmtQty, fmtNum, pnlClass, fmtDte
  market.js             27 lines  Shared mutable market state + syncMarket()
  history-buffer.js    103 lines  Fixed-capacity (252) ring buffer for OHLC bars
  theme.js               9 lines  Light/dark theme toggle (delegates to _toolbar)
```

## Sibling Projects

- [Geon](https://github.com/a9lim/physsim) -- [a9l.im/physsim](https://a9l.im/physsim)
- [Metabolism](https://github.com/a9lim/biosim) -- [a9l.im/biosim](https://a9l.im/biosim)
- [Redistricting](https://github.com/a9lim/gerry) -- [a9l.im/gerry](https://a9l.im/gerry)

## License

[AGPL-3.0](LICENSE)
