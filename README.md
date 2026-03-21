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
main.js                810 lines  Entry point: rAF loop, sub-step streaming, live candle animation,
                                   camera, shortcuts, strategy builder with rollback, ExpiryManager
index.html             500 lines  Toolbar, chart/strategy canvases, sidebar (4 tabs), chain overlay,
                                   trade dialog, margin call overlay, intro screen
styles.css             800 lines  Chain table, position rows, strategy builder, trade dialog,
                                   margin alert, P&L coloring, Greek colors, responsive breakpoints
colors.js               59 lines  Financial color aliases (up/down/call/put/stock/bond + Greeks)
src/
  config.js             26 lines  Named constants and PRESETS array (5 static + 2 dynamic)
  simulation.js        245 lines  GBM + Merton + Heston + Vasicek; beginDay/substep/finalizeDay
                                   pipeline; prepopulate() with synthetic backfill
  pricing.js           120 lines  CRR binomial tree (128 steps) + discrete dividends + finite-diff Greeks
  chain.js             170 lines  ExpiryManager (8 rolling expiries), strike generation, lazy pricing
  portfolio.js         770 lines  Signed-qty positions, order execution, netting, margin, borrow
                                   interest, expiry processing, strategy execution with rollback
  chart.js             650 lines  Log Y-axis OHLC candles, auto-scale, position markers, strike lines,
                                   live candle cubic interpolation, shared-camera.js integration
  strategy.js          830 lines  Payoff diagram, Greek overlays, breakeven analysis, time slider,
                                   input-keyed caching, precomputed per-leg entry values
  events.js            500 lines  EventEngine: Poisson scheduler, MTTH chains, 88 curated events
  llm.js               170 lines  LLMEventSource: Anthropic API via structured tool use
  ui.js                670 lines  DOM cache, event binding, chain/portfolio display, overlays
  format-helpers.js     48 lines  Shared formatting: fmtDollar, fmtNum, pnlClass, fmtDte
  position-value.js     40 lines  Unified position valuation and P&L computation
  chain-renderer.js    220 lines  Chain table DOM with event delegation and position indicators
  portfolio-renderer.js 190 lines Portfolio display with DOM diffing
  history-buffer.js    103 lines  Fixed-capacity (252) ring buffer for OHLC bars
  theme.js              20 lines  Light/dark theme toggle
```

## Sibling Projects

- [Geon](https://github.com/a9lim/physsim) -- [a9l.im/physsim](https://a9l.im/physsim)
- [Metabolism](https://github.com/a9lim/biosim) -- [a9l.im/biosim](https://a9l.im/biosim)
- [Redistricting](https://github.com/a9lim/gerry) -- [a9l.im/gerry](https://a9l.im/gerry)

## License

[AGPL-3.0](LICENSE)
