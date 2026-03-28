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

Interactive options trading simulator at **Meridian Capital**. Player is a senior derivatives trader during the Barron administration. GBM+Merton+Heston stock, Vasicek rates, CRR binomial tree pricing (128 steps, BSS smoothing), strategy builder, portfolio/margin system, Almgren-Chriss price impact, narrative event engine with popup decisions, political lore, chiptune jazz soundtrack, and 5-page adaptive epilogue with 6 ending types. Zero dependencies, vanilla ES6 modules, no build step.

## Architecture

**Orchestrator**: `main.js` (~2000 lines) — DOM cache `$`, rAF loop, sub-step streaming, all system wiring. Shared micro-helpers at module top: `_toast()` / `_haptic()` (guarded global access), `_clampRate()` (regulation rate bounds), `_runSubstep()` (full substep pipeline), `_refreshStrategyView()` / `_populateStrategyLegs()` (strategy UI update sequence).

**Module separation**: simulation.js/portfolio.js = state, ui.js = DOM, chart.js/strategy.js = renderers, main.js = orchestrator. `market.js` is shared mutable state (single-writer main.js via `syncMarket`, multiple readers).

**Narrative systems** (Dynamic mode only): events.js (Poisson scheduler + followup chains + filibuster/media/interjection recurring pulses + trait-aware likelihood weighting + `evaluateTriggers` for portfolio-triggered events), `src/events/` directory (12 domain files: fed.js, macro.js, pnth.js, congress.js, investigation.js, media.js, market.js, firm.js, tips.js, interjections.js, traits.js — all events share a unified schema; index.js merges pools with by-id lookup and followup chain validation; `_helpers.js` provides portfolio calculation helpers for trigger functions; `param-ranges.js` exports canonical parameter clamping ranges), world-state.js (congress/PNTH/geopolitical/Fed/media), faction-standing.js (unified 6-faction standing system: firmStanding, regulatoryExposure, federalistSupport, farmerLaborSupport, mediaTrust, fedRelations + capitalMultiplier), traits.js (12 permanent convictions + 6 dynamic reputation tags), regulations.js (event-driven regulatory pipeline — legislative bills move through introduced→committee→floor→active/failed, executive orders auto-expire via daily tick; no condition-based activation), lobbying.js (6-action 3-tier targeted PAC funding system), endings.js (6 ending conditions + 5-page adaptive epilogue generation).

**Audio**: `audio.js` — all Web Audio API synthesis, no external audio files. Three layers: (1) background jazz loop (128 BPM, 16-bar Am diatonic circle: smooth walking bass with sub-octave sine, voice-led 3-note rootless comping (triangle mains + square ghost fills), sparse hi-hat, cross-stick, kick with phrase-building dynamics, brush sweeps at section turnarounds), (2) continuous Am drone pad (sine/triangle/sawtooth oscillators), (3) event stingers + superevent chord stabs. Voicings use smooth semitone/step voice leading throughout the progression; E7 uses b9 for film-noir tension resolving to Am7. Drums build within each 4-bar phrase (sparse→full→resolve). `setAmbientMood(mood)` crossfades between jazz and drone: calm = full jazz, tense = jazz 55% / drone 45%, crisis = jazz 15% / drone 85%. Jazz loop uses a look-ahead scheduler (`_jazzSchedule`) that keeps 4s of audio queued. `playMusic(track)` ducks both jazz and drone to silence for superevent chord stabs, `stopMusic` restores them to the current mood mix. Volume slider is in the Settings group of the Info tab.

**Lore bible**: `lore.md` at project root — canonical creative reference for all named characters, nations, products, legislation, publications, and journalists. Not consumed by runtime code. Consult when writing new events or modifying narrative text.

## Data Flow

### Sub-Step Pipeline (playing)

1. `frame()` applies Layer 3 param overlays, calls `sim.beginDay()`
2. 16 sub-steps per day: `_runSubstep()` (substep → rate clamp → impact decay → market sync → MM rehedge → order check) → `chart.setLiveCandle()`
3. After substep batch: `_onSubstepUI()` (reprice chain sidebar, update portfolio display)
4. After all 16: `sim.finalizeDay()`, overlays removed. `_onDayComplete()` runs: borrow interest, expiry, dividends, quarterly review, trait eval, event engine, regulation eval, endings check, portfolio popups, Layer 3 shifts, scrutiny, ambient mood, rogue trading check, margin check, lobby pill update, standings update, popup queue drain

### Bootstrap

`sim.prepopulate()` backfills 252-bar history (negates `mu` for correct reverse drift). Must call `syncMarket(sim)` after `prepopulate()` in both `init()` and `_resetCore()` or market params will be zero.

### Reset

`_resetCore()` must call all narrative resets: `resetTraits()`, `resetRegulations()`, `resetFactions()`, `resetLobbying()`, `resetAudio()`, `resetImpactState()`, `eventEngine.resetTriggerCooldowns()`, `resetUsedTips()`. Also reset `dayInProgress`, `chart._lerp.day = -1`, `_lobbyCount = 0`. After `resetFactions()`, re-wire `eventEngine.world.factions = factions`.

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

Events are unified under `src/events/`. Toast-only events have `headline` + `params` but no `choices`. Popup events have `popup: true` + `choices`. Portfolio-triggered popups have `trigger` + `cooldown` + `tone` (`'positive'` or `'negative'`) evaluated daily by `EventEngine.evaluateTriggers`. Positive-tone events fire more often at high firm standing (inverse cooldown multiplier); negative-tone events fire less often. Superevents have `superevent: true` (full-screen treatment + chord stab). `showToast(message, duration)` — duration is numeric ms, no severity parameter. Long toasts auto-detect multiline and switch from pill to rounded-rect shape.

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
- Use `_haptic(pattern)` and `_toast(msg, duration)` — never raw `_haptics.trigger()` or `showToast()` in main.js
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
- Rate ceiling/floor is a permanent `sim.r` mutation (not an overlay) via `_clampRate()`. Mean-reversion operates from clamped value
- Event deltas are additive and clamped to `PARAM_RANGES` — never set absolute values
- Superevent params apply at fire time (in `_fireEvent`), not choice time — popup is informational only
- `minDay`/`maxDay` use live trading days (`day - 252`), different from `era` which uses absolute `day`
- `getTraitEffect(key, defaultVal)` multiplies all active effects onto defaultVal (boolean: any true wins)
- `getRegulationEffect(key, defaultVal)` — mult keys: product; add: sum; ceiling: min; floor: max; boolean: any true
- One-shot events (migrated compound triggers) fire at most once per game — tracked by event id in `EventEngine._firedOneShots` Set. Guard also applies in `_checkFollowups` so one-shots referenced as followups can't fire twice
- `advanceBill(id, 'failed')` and `advanceBill(id, 'repealed')` remove from `_state` entirely — they are terminal states, not display states
- `getPipelineStatus(id)` returns null if the regulation was never introduced or was removed — event guards must check for null, not 'inactive'
- `trigger` (portfolio-triggered, daily eval) vs `when` (world-state eligibility guard) — events with `trigger` are never Poisson-drawn
- `factionShifts` on choices are additive — conditional bonuses (`when.hasTrait`) add to the base `value`, not replace it
- `superevent: true` on event objects is the sole source of truth — no hardcoded sets or heuristics

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
- `compound-triggers.js` / `checkCompoundTriggers` / `resetCompoundTriggers` / `getFiredTriggerIds` — deleted; all 18 triggers migrated to domain files under `src/events/` as `oneShot: true` events, fired by the standard EventEngine one-shot pre-pass
- `interjections.js` / `checkInterjections` / `resetInterjections` — deleted; all interjections migrated to `src/events/interjections.js` as `category: 'interjection'` events with recurring pulse in events.js
- `epilogue.js` / `generateEpilogue` — deleted; replaced by `endings.js` with `checkEndings` + `generateEnding` supporting 6 ending types and 5-page adaptive epilogue
- `convictions.js` / `getConvictionEffect` / `getConvictionIds` / `evaluateConvictions` / `resetConvictions` — renamed to `traits.js` with `getTraitEffect` / `getActiveTraitIds` / `evaluateTraits` / `resetTraits`
- `evaluateRegulations` / condition-based regulation activation — regulations are now exclusively activated by events via `activateRegulation()` / `advanceBill()`, not by polling world state
- `event-pool.js` / `popup-events.js` as monolithic files — events live in `src/events/*.js` domain files
- `onChoose` on popup event choices — use declarative `factionShifts` arrays instead
- `SUPEREVENT_IDS` set in main.js — use `superevent: true` on the event object
- `resetPopupCooldowns` / `evaluatePortfolioPopups` — use `eventEngine.resetTriggerCooldowns()` and `eventEngine.evaluateTriggers()`
- Inline `typeof showToast !== 'undefined'` / `typeof _haptics !== 'undefined'` guards in main.js — use `_toast()` and `_haptic()` helpers
- Inline substep pipeline (substep + rate clamp + decay + sync + rehedge + tick) — use `_runSubstep()`
- Inline strategy refresh sequences (resetRange + priceExpiry + updateChainDisplay + updateStockBondPrices + updateStrategyBuilder + updateTimeSliderRange) — use `_refreshStrategyView()`
- `_LOBBY_COLORS` / `_LOBBY_LABELS` as separate objects — merged into `_LOBBY_META`
- `_active` + `_pipeline` dual maps in regulations.js — unified into single `_state` Map (id → `{ status, remainingDays }`)
- `_poisson(lam)` method on Simulation — dead code, only `_poissonFast()` is used
- Duplicate `.sim-input` CSS block — single definition at line ~534, not repeated
- Empty `.pos-row {}` / `.order-row {}` CSS rules — no-ops, removed
- `_hideClass` helper in ui.js — dead code, never called
- `factions` block in `createWorldState()` — removed; faction state lives solely in `faction-standing.js`, attached by reference
- `Strait of Farsis` / `Beijing` / `Mar-a-Lago` / `Korindian` — use real geography (Strait of Hormuz, Nanjing, Little St. James, Meridine)

### Cross-Domain Event Wiring

Events form an interconnected web, not isolated threads. Key cross-domain connections:
- **Geopolitical → PNTH**: Khasurian incursion sets `aegisDemandSurge` → Aegis events boost likelihood. Serican compute buildout sets `foundryCompetitionPressure` → Foundry events respond. Strait closure sets `energyCrisis` → Fed emergency followup.
- **Investigation cross-pollination**: Okafor probe / Tan-Bowman story at stage 2+ trigger `meridian_exposed` bridge event (followupOnly) — but only if player has dirty flags (`pursued_insider_tip`, `hosted_fundraiser`, etc.) or high `regulatoryExposure`. Clean players are unaffected.
- **Fed ↔ Geopolitical**: `recessionDeclared` / `energyCrisis` boost Fed cut event likelihood. Late-cycle hikes nudge `barronApproval` down.
- **Election downstream**: Midterm results (`midtermResult`) reshape event likelihood — F-L win boosts investigations, blocks Big Beautiful Bill. Federalist landslide boosts deregulation, penalizes investigations.
- **PNTH product spillover**: Companion scandal bumps `aegisControversy`, Aegis controversy reduces `commercialMomentum`, product outcomes shift board dynamics.
- **Lobbying → narrative**: `lobbyingExposed` flag (set when `lobbyCount >= 3` and `mediaTrust < 40`) boosts media/compliance events and feeds into `meridianExposed` conditions.
- **playerFlags → endings**: ~22 unused playerFlags wired into reputation synthesis in endings.js (compliance stance, trading style, political engagement, information edge).

### Lore Reference

**Lore rule:** Geography and institutions mirror the real world; polities and people are fictional. See `lore.md` for the full world bible. Key cast:

**Federal States of Columbia**. President John Barron (Federalist) vs Robin Clay (Farmer-Labor). VP Jay Bowman. Fed Chair Hayden Hartley. Player is at Meridian Capital. Term ends live day 1008. Midterm elections at live day 504.

**Congress**: Sen. Roy Lassiter (F-SC, trade hawk), Sen. Peggy Haines (F-WY, deficit hawk/swing vote), Rep. Vincent Tao (F-TX, Majority Leader), Rep. Diane Whittaker (F-OH, moderate), Sen. James Whitfield (F-L, MA, filibuster master), Rep. Carmen Reyes (F-L, CA, firebrand), Sen. Patricia Okafor (F-L, IL, investigations). Key bills: Big Beautiful Bill (omnibus), Serican Reciprocal Tariff Act, Financial Freedom Act, Digital Markets Accountability Act.

**PNTH**: Chairwoman Andrea Dirks vs CEO Eugene Gottlieb. CTO Mira Kassis, CFO Raj Malhotra, board kingmaker David Zhen. Products: Atlas Sentinel (enterprise), Atlas Aegis (military), Atlas Companion (consumer), Atlas Foundry (infrastructure), Covenant AI (Gottlieb's rival).

**Geopolitics**: Serica (Premier Liang Wei), Khasuria (President Volkov), Farsistan (Emir al-Farhan, Strait of Hormuz), Boliviara (President Madero), Meridia (PM Navon).

**Media**: The Continental (Rachel Tan, Tom Driscoll), The Sentinel (Marcus Cole), MarketWire (Priya Sharma), The Meridian Brief (internal).

### World State Domains

`congress` (seats + `filibusterActive` + `bigBillStatus` 0–4), `pnth` (board + products: `sentinelLaunched`/`aegisDeployed`/`companionLaunched`/`foundryLaunched` + `companionScandal`/`aegisControversy` 0–3), `geopolitical` (`sericaRelations` ±3, `farsistanEscalation`/`khasurianCrisis` 0–3, `straitClosed`, `aegisDemandSurge`, `foundryCompetitionPressure`, `energyCrisis`), `fed`, `investigations` (`tanBowmanStory`/`okaforProbeStage`/`impeachmentStage` 0–3, `meridianExposed` bool — set by bridge event when dirty player is caught in investigative crossfire), `election`, `media` (`tanCredibility`/`sentinelRating` 0–10, `pressFreedomIndex` 0–10, `leakCount` 0–5, `lobbyingExposed` bool — set when `lobbyCount >= 3` and `mediaTrust < 40`).

`factions` is NOT in `createWorldState()` — it lives in `faction-standing.js` and is attached by reference via `eventEngine.world.factions = factions` at init/reset/preset-load.

### Exercise Netting

`exerciseOption` nets delivered stock into existing stock positions (same `strategyName`). Call exercise buys stock (covers shorts first), put exercise sells stock (sells longs first, creates short if none). Exercise creates price impact via `recordStockTrade`.
