# Shoals

An interactive options trading simulator that runs entirely in the browser. You play as a derivatives trader during a four-year presidential term, trading stocks, bonds, and options in a fully dynamic simulated market.

**[Try it](https://a9l.im/shoals)** | Part of the [a9l.im](https://a9l.im) portfolio

## What You Can Do

- **Trade four instrument types**: stocks, bonds, American options, and volatility futures with market, limit, and stop orders
- **Build multi-leg strategies**: construct spreads with live payoff diagrams, Greek overlays, breakeven analysis, and a time-decay slider
- **Manage a margin portfolio**: Reg-T margin with initial and maintenance requirements, short-selling with borrow interest, and forced liquidation on margin calls
- **React to market events**: a narrative engine fires Fed meetings, geopolitical crises, corporate scandals, and political developments that shift market dynamics, with branching followup chains
- **Make consequential choices**: compliance directives, insider tips, and lobbying opportunities shape your reputation and determine one of six possible endings

## Financial Concepts Covered

- **Price dynamics**: geometric Brownian motion, Merton jump diffusion, Heston stochastic volatility, Vasicek interest rates
- **Option pricing**: Cox-Ross-Rubinstein binomial trees (128 steps) with discrete dividends and finite-difference Greeks (Delta, Gamma, Theta, Vega, Rho)
- **Options chains**: 21 strikes across 8 rolling expiries with volatility-aware bid/ask spreads
- **Price impact**: Almgren-Chriss model with market-maker rehedging that creates realistic gamma squeeze and pin-to-strike dynamics
- **Portfolio management**: margin requirements, position netting, risk exposure, and the cost of leverage

## Running Locally

Serve from the parent directory (shared files load via absolute paths):

```bash
cd path/to/a9lim.github.io
python -m http.server
```

Then open `http://localhost:8000/shoals/`.

## Tech

Vanilla HTML, CSS, and JavaScript with ES6 modules. There's no build step, bundler, or dependencies. Canvas 2D for charts. All the pricing, simulation, and portfolio logic is written from scratch. The lounge jazz soundtrack is synthesized at runtime via the Web Audio API, so there are no external audio files.

## License

[AGPL-3.0](LICENSE)
