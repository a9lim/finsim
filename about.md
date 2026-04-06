# Shoals — Interactive Options Trading Simulator

Shoals is an options trading simulator that models derivatives pricing under stochastic volatility. It combines quantitative pricing models with a narrative market event engine for scenario-based learning.

## Pricing Models

Stock prices follow geometric Brownian motion (GBM) with optional Merton jump diffusion and Heston stochastic volatility. Interest rates are modeled with a Vasicek mean-reverting process. American options are priced using a 128-step Cox-Ross-Rubinstein (CRR) binomial tree with term-structure volatility, moneyness skew, and discrete dividend adjustments.

## Options Chain

A 25-strike options chain displays calls and puts with real-time Greeks (delta, gamma, theta, vega, rho). Implied volatility surfaces show how the market prices risk across strikes and expirations.

## Strategy Builder

The multi-leg strategy builder lets users construct spreads, straddles, strangles, condors, butterflies, and custom combinations. Each strategy shows a payoff diagram, Greek overlays, maximum profit/loss, and break-even points. A margin system tracks portfolio-level exposure.

## Market Events

A narrative event engine with over 400 curated scenarios introduces market shocks: earnings surprises, Fed rate decisions, geopolitical events, sector rotations, and black swan events. Each event modifies the underlying price process parameters (drift, volatility, jump intensity) to simulate realistic market dynamics.

## Educational Use

Designed for quantitative finance education. Students learn options pricing theory by building positions and observing how Greeks respond to changes in the underlying price, volatility, time decay, and interest rates. The event engine connects abstract models to real-world market behavior.

## Narrative Event Engine

Over 400 curated market scenarios organized into six categories: earnings, monetary policy, geopolitical, sector rotation, technical signals, and black swan events. Each event modifies drift, volatility, and jump intensity parameters with configurable magnitude and decay. Events can chain — a rate hike may trigger a sector rotation, which triggers a technical breakout. Superevents receive full-screen treatment with chord stabs from the synthesized audio engine. A Poisson scheduler controls event arrival with trait-aware likelihood weighting based on player decisions.

## Faction System

Three market factions — momentum traders, value investors, and market makers — respond differently to events and shift the demand curve. Faction behavior is parameterized by sensitivity to price changes, mean reversion speed, and inventory limits.

## Accessibility

Shoals supports keyboard navigation for all controls and dialogs, high-contrast mode via the theme toggle, and ARIA labels on interactive elements. Chart data is accessible through the numerical sidebar displays. All popup dialogs are focus-trapped. No flashing content or motion hazards.

## Price Impact

The Almgren-Chriss model simulates temporary and permanent price impact from large trades. Temporary impact decays exponentially; permanent impact shifts the equilibrium price based on order flow. Impact is computed as an overlay on the simulated price — it never mutates the underlying stochastic process, preserving model consistency.
