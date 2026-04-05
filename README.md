# Shoals

An interactive options trading simulator that runs entirely in the browser. You play a senior derivatives trader at a fictional firm during a four-year presidential term, trading stocks, bonds, and American options in a market shaped by stochastic processes and narrative events.

**[Try it](https://a9l.im/shoals)** | Part of the [a9l.im](https://a9l.im) portfolio

## What You Can Do

- **Trade three instrument types** -- stocks (long and short), zero-coupon bonds, and American options (calls and puts) with market, limit, and stop orders
- **Build multi-leg strategies** -- construct spreads, straddles, and custom combinations with live payoff diagrams, Greek overlays, breakeven analysis, and a time-decay slider
- **Manage a margin portfolio** -- Reg-T margin with initial and maintenance requirements, short-selling with borrow interest, and forced liquidation on margin calls
- **React to market events** -- a narrative engine fires Fed meetings, geopolitical crises, corporate scandals, and political developments that shift market dynamics, with branching followup chains
- **Make consequential choices** -- compliance directives, insider tips, and lobbying opportunities shape your reputation and determine one of six possible endings

## Financial Concepts Covered

- **Price dynamics** -- geometric Brownian motion, Merton jump diffusion, Heston stochastic volatility, Vasicek interest rates
- **Option pricing** -- Cox-Ross-Rubinstein binomial trees (128 steps) with discrete dividends and finite-difference Greeks (Delta, Gamma, Theta, Vega, Rho)
- **Options chains** -- 25 strikes across 8 rolling expiries with volatility-aware bid/ask spreads
- **Price impact** -- Almgren-Chriss model with market-maker rehedging that creates realistic gamma squeeze and pin-to-strike dynamics
- **Portfolio management** -- margin requirements, position netting, risk exposure, and the cost of leverage

## Market Modes

Five static presets (Calm Bull, Sideways, Volatile, Crisis, Rate Hike) and two dynamic modes. Dynamic mode runs a narrative event engine with over 400 curated scenarios across economics, politics, and corporate drama. An optional LLM mode connects to the Anthropic API for AI-generated events with full universe lore.

## Running Locally

Serve from the parent directory (shared files load via absolute paths):

```bash
cd path/to/a9lim.github.io
python -m http.server
```

Then open `http://localhost:8000/shoals/`.

## Tech

Vanilla HTML, CSS, and JavaScript with ES6 modules. No build step, no bundler, no dependencies. Canvas 2D for charts. All pricing, simulation, and portfolio logic is written from scratch. Web Audio API synthesizes a chiptune jazz soundtrack with no external audio files.

## License

[AGPL-3.0](LICENSE)
