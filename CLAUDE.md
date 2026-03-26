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

Interactive options trading simulator at **Meridian Capital**. Player is a senior derivatives trader during the Barron administration. GBM+Merton+Heston stock, Vasicek rates, CRR binomial tree pricing (128 steps, BSS smoothing), strategy builder, portfolio/margin system, Almgren-Chriss price impact, narrative event engine with popup decisions, political lore, chiptune jazz soundtrack, and 4-page epilogue. Zero dependencies, vanilla ES6 modules, no build step.

## Architecture

**Orchestrator**: `main.js` (~2100 lines) — DOM cache `$`, rAF loop, sub-step streaming, all system wiring.

**Module separation**: simulation.js/portfolio.js = state, ui.js = DOM, chart.js/strategy.js = renderers, main.js = orchestrator. `market.js` is shared mutable state (single-writer main.js via `syncMarket`, multiple readers).

**Narrative systems** (Dynamic mode only): events.js (Poisson scheduler + followup chains + filibuster/media recurring pulses + conviction-aware likelihood weighting), event-pool.js (~320 toast events with lore-specific headlines), popup-events.js (~30 interactive popup decisions with conviction-aware context variants), world-state.js (congress/PNTH/geopolitical/Fed/media), compliance.js, convictions.js (12 permanent modifiers), regulations.js (11 dynamic trading rules including filibuster uncertainty), scrutiny.js (hidden SEC investigation arc), compound-triggers.js (18 cross-domain one-shot triggers), lobbying.js (2 PAC-funding pills with bill-specific descriptions), interjections.js (lore-aware atmospheric text), epilogue.js (4-page ending with product/geopolitical/conviction-specific narratives).

**Audio**: `audio.js` — all Web Audio API synthesis, no external audio files. Three layers: (1) chiptune jazz loop (128 BPM, 16-bar Am diatonic circle: walking bass, shell-voicing comps, swung hi-hat, nocturne-influenced melody head), (2) continuous Am drone pad (sine/triangle/sawtooth oscillators), (3) event stingers + superevent chord stabs. `setAmbientMood(mood)` crossfades between jazz and drone: calm = full jazz, tense = jazz 55% / drone 45%, crisis = jazz 15% / drone 85%. Jazz loop uses a look-ahead scheduler (`_jazzSchedule`) that keeps 4s of audio queued. `playMusic(track)` ducks both jazz and drone to silence for superevent chord stabs, `stopMusic` restores them to the current mood mix. Volume slider is in the Settings group of the Info tab.

**Lore bible**: `lore.md` at project root — canonical creative reference for all named characters, nations, products, legislation, publications, and journalists. Not consumed by runtime code. Consult when writing new events or modifying narrative text.

## Data Flow

### Sub-Step Pipeline (playing)

1. `frame()` applies Layer 3 param overlays, calls `sim.beginDay()`
2. 16 sub-steps per day: `sim.substep()` → rate ceiling/floor clamp → `decayImpactVolumes()` → `syncMarket()` → `rehedgeMM()` → `_onSubstepTick()` (pending orders) → `chart.setLiveCandle()`
3. After substep batch: `_onSubstepUI()` (reprice chain sidebar, update portfolio display)
4. After all 16: `sim.finalizeDay()`, overlays removed. `_onDayComplete()` runs: borrow interest, expiry, dividends, quarterly review, conviction eval, epilogue check, event engine, regulation eval, portfolio popups, compound triggers (with `recomputeK`/`syncMarket`), Layer 3 shifts, scrutiny, ambient mood, rogue trading check, margin check, lobby pill update, interjection check, popup queue drain

### Bootstrap

`sim.prepopulate()` backfills 252-bar history (negates `mu` for correct reverse drift). Must call `syncMarket(sim)` after `prepopulate()` in both `init()` and `_resetCore()` or market params will be zero.

### Reset

`_resetCore()` must call all narrative resets: `resetConvictions()`, `resetRegulations()`, `resetScrutiny()`, `resetCompoundTriggers()`, `resetLobbying()`, `resetInterjections()`, `resetAudio()`, `resetImpactState()`, `resetPopupCooldowns()`, `resetCompliance()`. Also reset `dayInProgress`, `chart._lerp.day = -1`, `_lobbyCount = 0`.

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

Event-pool events (~320) fire as **toasts only**. Interactive popup decisions live exclusively in `popup-events.js`. `showToast(message, duration)` — duration is numeric ms, no severity parameter. Long toasts auto-detect multiline and switch from pill to rounded-rect shape.

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
- `chinaRelations` — renamed to `sericaRelations` everywhere
- Dark overlay backgrounds on popups — use blur-only (`background: none`), never `rgba(0,0,0,...)`
- `AMBIENT_MOODS` / `_stopAmbient` / `_ambientNodes` / `_ambientGain` — old drone-only ambient system replaced by jazz loop + drone crossfade via `MOOD_MIX`
- `_jazzFilter` for mood — mood is now a jazz↔drone crossfade, not a lowpass filter

### Lore Reference

See `lore.md` for the full world bible. Key cast:

**Federal States of Columbia**. President John Barron (Federalist) vs Robin Clay (Farmer-Labor). VP Jay Bowman. Fed Chair Hayden Hartley. Player is at Meridian Capital. Term ends live day 1008. Midterm elections at live day 504.

**Congress**: Sen. Roy Lassiter (F-SC, trade hawk), Sen. Peggy Haines (F-WY, deficit hawk/swing vote), Rep. Vincent Tao (F-TX, Majority Leader), Rep. Diane Whittaker (F-OH, moderate), Sen. James Whitfield (F-L, MA, filibuster master), Rep. Carmen Reyes (F-L, CA, firebrand), Sen. Patricia Okafor (F-L, IL, investigations). Key bills: Big Beautiful Bill (omnibus), Serican Reciprocal Tariff Act, Financial Freedom Act, Digital Markets Accountability Act.

**PNTH**: Chairwoman Andrea Dirks vs CEO Eugene Gottlieb. CTO Mira Kassis, CFO Raj Malhotra, board kingmaker David Zhen. Products: Atlas Sentinel (enterprise), Atlas Aegis (military), Atlas Companion (consumer), Atlas Foundry (infrastructure), Covenant AI (Gottlieb's rival).

**Geopolitics**: Serica (Premier Liang Wei), Khasuria (President Volkov), Farsistan (Emir al-Farhan, Strait of Farsis), Boliviara (President Madero), Meridia (PM Navon).

**Media**: The Continental (Rachel Tan, Tom Driscoll), The Sentinel (Marcus Cole), MarketWire (Priya Sharma), The Meridian Brief (internal).

### World State Domains

`congress` (seats + `filibusterActive` + `bigBillStatus` 0–4), `pnth` (board + products: `sentinelLaunched`/`aegisDeployed`/`companionLaunched`/`foundryLaunched` + `companionScandal`/`aegisControversy` 0–3), `geopolitical` (`sericaRelations` ±3, `farsistanEscalation`/`khasurianCrisis` 0–3, `straitClosed`), `fed`, `investigations`, `election`, `media` (`tanCredibility`/`sentinelRating` 0–10, `pressFreedomIndex` 0–10, `leakCount` 0–5).

### Exercise Netting

`exerciseOption` nets delivered stock into existing stock positions (same `strategyName`). Call exercise buys stock (covers shorts first), put exercise sells stock (sells longs first, creates short if none). Exercise creates price impact via `recordStockTrade`.
