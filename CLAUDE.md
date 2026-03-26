# CLAUDE.md

Part of the **a9l.im** portfolio. See root `CLAUDE.md` for the shared design system, head loading order, CSS conventions, and shared code policy. Sibling projects: `geon`, `cyano`, `gerry`.

## Rules

- Always prefer shared modules (`shared-*.js`, `shared-base.css`) over project-specific reimplementations. Check the root repo before adding utility code.
- Never use the phrase "retarded potential(s)" in code, comments, or user-facing text. Use "signal delay" or "finite-speed force propagation" instead.
- Do not manually test via browser automation. The user will test changes themselves.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Serve from the root — shared files load via absolute paths (`/shared-*.js`, `/shared-base.css`).

## Overview

Interactive options trading simulator at **Meridian Capital**. Player is a senior derivatives trader during the Barron administration. GBM+Merton+Heston stock, Vasicek rates, CRR binomial tree pricing (128 steps, BSS smoothing), strategy builder, portfolio/margin system, Almgren-Chriss price impact, narrative event engine with popup decisions, political lore, and 4-page epilogue. Zero dependencies, vanilla ES6 modules, no build step.

## Architecture

**Orchestrator**: `main.js` (~2100 lines) — DOM cache `$`, rAF loop, sub-step streaming, all system wiring.

**Module separation**: simulation.js/portfolio.js = state, ui.js = DOM, chart.js/strategy.js = renderers, main.js = orchestrator. `market.js` is shared mutable state (single-writer main.js via `syncMarket`, multiple readers).

**Narrative systems** (Dynamic mode only): events.js (Poisson scheduler + followup chains), event-pool.js (~277 toast-only events), popup-events.js (~30 interactive popup decisions), world-state.js (congress/PNTH/geopolitical/Fed), compliance.js, convictions.js (8 permanent modifiers), regulations.js (10 dynamic trading rules), scrutiny.js (hidden SEC investigation arc), compound-triggers.js (12 cross-domain one-shot triggers), lobbying.js (2 PAC-funding pills: +Fed/+F-L, nudge `barronApproval` ±2 and `lobbyMomentum` ±1 capped ±3), interjections.js, epilogue.js (4-page ending).

## Data Flow

### Sub-Step Pipeline (playing)

1. `frame()` applies Layer 3 param overlays, calls `sim.beginDay()`
2. 16 sub-steps per day: `sim.substep()` → rate ceiling/floor clamp → `decayImpactVolumes()` → `syncMarket()` → `rehedgeMM()` → `_onSubstepTick()` (pending orders) → `chart.setLiveCandle()`
3. After substep batch: `_onSubstepUI()` (reprice chain sidebar, update portfolio display)
4. After all 16: `sim.finalizeDay()`, overlays removed. `_onDayComplete()` runs: borrow interest, expiry, dividends, quarterly review, conviction eval, epilogue check, event engine, regulation eval, portfolio popups, compound triggers (with `recomputeK`/`syncMarket`), Layer 3 shifts, scrutiny, ambient mood, rogue trading check, margin check, lobby pill update, interjection check, popup queue drain

### Bootstrap

`sim.prepopulate()` backfills 252-bar history (negates `mu` for correct reverse drift). Must call `syncMarket(sim)` after `prepopulate()` in both `init()` and `_resetCore()` or market params will be zero.

### Reset

`_resetCore()` must call all narrative resets: `resetConvictions()`, `resetRegulations()`, `resetScrutiny()`, `resetCompoundTriggers()`, `resetLobbying()`, `resetInterjections()`, `resetAudio()`, `resetImpactState()`, `resetPopupCooldowns()`, `resetCompliance()`. Also reset `dayInProgress`, `chart._lerp.day = -1`.

## Key Conventions

### Display Scaling

Internal values use original scale ($10,000 starting capital). `fmtDollar()` appends "k" for portfolio-scale amounts. Per-unit prices (fills, strikes, breakevens, strategy net debit) display raw `$X.XX` — do NOT use `fmtDollar` for per-unit values.

### Value Coloring

- P&L: `pnl-down` (red) / no class (neutral) / `pnl-up` (green)
- Portfolio value: colored vs buy-and-hold benchmark, not absolute
- Greeks: per-Greek CSS vars (`--delta`/`--gamma`/`--theta`/`--vega`/`--rho`), NOT `pnl-up`/`pnl-down`
- Sparklines: always `--text` CSS var color

### Pricing

Always use `unitPrice()` (position-value.js) — includes vol surface + impact overlay. Only exception: strategy.js payoff curve sweeps via direct tree pricing.

All pricing uses `prepareTree` + `priceWithTree`. No `priceAmerican` function exists. Each module owns reusable trees for zero-alloc pricing.

### Price Impact

Impact is an **overlay** on `sim.S` — never mutates it. `getStockImpact(sigma)` and `getOptionImpact(...)` both require current `sigma` at read time. Only `resetImpactState()` clears cumulative volumes.

### Popups vs Toasts

Event-pool events (~277) fire as **toasts only**. Interactive popup decisions live exclusively in `popup-events.js`. `showToast(message, duration)` — duration is numeric ms, no severity parameter.

### Positions

Signed qty: `qty > 0` = long, `qty < 0` = short. No `side` property. Netting key: `type + strike + expiryDay + strategyName`.

### Strategies

Saved as relative offsets (`strikeOffset`/`dteOffset`) in localStorage. `selectableExpiry: true` → `dteOffset: null`, uses expiry dropdown at execution. Built-ins are const in strategy-store.js, never in localStorage. `executeWithRollback()` rolls back all legs on partial failure.

## Gotchas

### Will Cause Bugs

- `sim.history` is `HistoryBuffer` (`.get(day)`, `.last()`, `.minDay`/`.maxDay`) — not array-indexable
- `sim._partial` pushed by reference — `beginDay()` pushes, `substep()` mutates in-place
- `portfolio` is a singleton — `resetPortfolio()` mutates in place, never replace the reference
- `eventEngine` is null in non-Dynamic mode — always guard
- `_haptics` guard required: `if (typeof _haptics !== 'undefined')`
- `computeEffectiveSigma(v, T, kappa, theta, xi)` takes **variance** `v`, not vol. `computeSkewSigma` takes the additional S, K, rho args
- Dual pricing shares `_V` buffer — `_priceCore` after `_pricePairCore` overwrites call values
- Chain table rebuilt every call — never cache cell refs; delegation bound once via `_chainClicksBound`
- Trade dialog confirm button cloned on each open to avoid stacking listeners
- `initAudio()` must be called from a user gesture handler (in `_intro.init`'s `onDismiss` callback)
- `scheduleFollowup` must use `{ event, chainId, targetDay, weight, depth }` — NOT `{ id, fireDay }`

### Semantic Traps

- `close_short` is **directional** — closes short stock, short calls, AND long puts. `close_long` is the inverse
- Compliance triggers use directional notional, not raw `qty` sign
- `q` (dividend) NOT in GBM drift — stock grows at `mu`, not `mu - q`; only discrete quarterly drops
- Vasicek rate can go negative — tree handles via per-step `pu` clamped to [0,1]
- Rate ceiling/floor is a permanent `sim.r` mutation (not an overlay). Mean-reversion operates from clamped value
- Event deltas are additive and clamped to `PARAM_RANGES` — never set absolute values
- Superevent params apply at fire time (in `_fireEvent`), not choice time — popup is informational only
- `minDay`/`maxDay` use live trading days (`day - 252`), different from `era` which uses absolute `day`
- `getConvictionEffect(key, defaultVal)` multiplies all active effects onto defaultVal (boolean: any true wins)
- `getRegulationEffect(key, defaultVal)` — mult keys: product; add: sum; ceiling: min; floor: max; boolean: any true
- Compound triggers fire at most once per game (`_fired` Set)

### Do NOT Re-add

- `priceAmerican` function or its transparent cache — use `prepareTree` + `priceWithTree`
- `portfolio.strategies` — strategies live in localStorage via strategy-store.js
- `speed` variable — use `SPEED_OPTIONS[speedIndex]`
- `$.totalPnl` references — Total P&L row removed from HTML
- Nested `.glass` — backdrop-filter stacks make inner elements opaque; use `bg-hover`/`bg-elevated`
- Lobby overlay / `lobbyOverlay` / `_lobbyTrapCleanup` — lobbying is inline pill buttons in `#lobby-bar`, no overlay
- Lobby actions that directly set congress seats — use `barronApproval` ±2 and `lobbyMomentum` ±1 instead

### Lore Reference

President John Barron (Federalist) vs Robin Clay (Farmer-Labor). VP Jay Bowman. Fed Chair Hayden Hartley. Palanthropic (PNTH): Chairwoman Andrea Dirks vs CEO Eugene Gottlieb. Player is at Meridian Capital. Term ends live day 1008. Midterm elections at live day 504.
