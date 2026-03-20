# Shoals

Interactive options trading simulator at [a9l.im/finsim](https://a9l.im/finsim).

Trade stocks, zero-coupon bonds, and American options in a market driven by stochastic volatility, jump diffusion, and mean-reverting interest rates. Build multi-leg strategies, analyze Greeks, and manage a margin portfolio — all in the browser with zero dependencies.

## Features

- **Realistic price dynamics** — GBM with Merton jumps, Heston stochastic volatility, Vasicek interest rates
- **American option pricing** — Bjerksund-Stensland 2002 analytical approximation with finite-difference Greeks
- **Full options chain** — 25 strikes across 8 rolling expiries with bid/ask spreads
- **Portfolio system** — Market, limit, and stop orders; signed-quantity netting; short selling with borrow interest; Reg-T margin
- **Strategy builder** — Multi-leg construction with payoff diagrams, Greek overlays, time-to-expiry slider, and atomic execution with rollback
- **Dynamic regimes** — Narrative event engine with 88 curated events, MTTH followup chains, and optional LLM-generated events via Claude API
- **5 static presets** — Calm Bull, Sideways, Volatile, Crisis, Rate Hike

## Running Locally

Serve from the parent `a9lim.github.io/` directory (shared files load via absolute paths):

```bash
cd path/to/a9lim.github.io
python -m http.server
```

Then open `http://localhost:8000/finsim/`.

## Tech Stack

Vanilla HTML/CSS/JS with ES6 modules. No build step, no bundler, no npm. Canvas 2D for charts.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `.` | Step forward |
| `r` | Reset |
| `s` | Strategy view |
| `t` | Toggle sidebar |
| `b` | Buy stock |
| `1`–`7` | Load preset |
| `?` | Shortcut help |

## License

## Sibling Projects

- [Geon](https://github.com/a9lim/physsim) -- [a9l.im/physsim](https://a9l.im/physsim)
- [Metabolism](https://github.com/a9lim/biosim) -- [a9l.im/biosim](https://a9l.im/biosim)
- [Redistricting](https://github.com/a9lim/gerry) -- [a9l.im/gerry](https://a9l.im/gerry)

## License

Part of the [a9l.im](https://a9l.im) portfolio.
