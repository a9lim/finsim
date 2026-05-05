# AGENTS.md

Part of the **a9l.im** portfolio. See root `AGENTS.md` for the shared design system, head loading order, CSS conventions, and shared code policy. Sibling projects: `geon`, `cyano`, `gerry`, `scripture`, `asteroids`.

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

Interactive options trading simulator at **Meridian Capital**. Player is a senior derivatives trader during the Barron administration. GBM+Merton+Heston stock, Vasicek rates, CRR binomial tree pricing (128 steps, BSS smoothing), VXPNT equity volatility index + tradeable VXPNT futures, strategy builder, portfolio/margin system, Almgren-Chriss price impact, narrative event engine with popup decisions, political lore, lounge jazz soundtrack, and 5-page adaptive epilogue with 6 ending types. Zero dependencies, vanilla ES6 modules, no build step.

## Architecture

**Orchestrator**: `main.js` (~2300 lines) — DOM cache `$`, rAF loop, sub-step streaming, all system wiring. Shared micro-helpers at module top: `_toast()` / `_haptic()` (guarded global access), `_syncAll()` (syncMarket + VIX computation), `_clampRate()` (regulation rate bounds), `_runSubstep()` (full substep pipeline), `_refreshStrategyView()` / `_populateStrategyLegs()` (strategy UI update sequence).

**Module separation**: simulation.js/portfolio.js = state, ui.js = DOM, chart.js/strategy.js = renderers, main.js = orchestrator. `market.js` is shared mutable state (single-writer main.js via `_syncAll`/`syncMarket`, multiple readers — includes `vix` field computed from Heston params).

**Narrative systems** (Dynamic and Dynamic (LLM) modes): events.js (Poisson scheduler + followup chains + filibuster/media/interjection recurring pulses + trait-aware likelihood weighting + `evaluateTriggers` for portfolio-triggered events), `src/events/` directory (12 domain files: fed.js, macro.js, pnth.js, congress.js, investigation.js, media.js, market.js, firm.js, tips.js, interjections.js, traits.js, silmarillion.js — all events share a unified schema; index.js merges pools with by-id lookup and followup chain validation; `_helpers.js` provides portfolio calculation helpers for trigger functions; `param-ranges.js` exports canonical parameter clamping ranges), world-state.js (congress/PNTH/geopolitical/Fed/media), faction-standing.js (unified 6-faction standing system: firmStanding, regulatoryExposure, federalistSupport, farmerLaborSupport, mediaTrust, fedRelations + capitalMultiplier), traits.js (12 permanent convictions + 6 dynamic reputation tags), regulations.js (event-driven regulatory pipeline — legislative bills move through introduced→committee→floor→active/failed, executive orders auto-expire via daily tick; no condition-based activation), lobbying.js (6-action 3-tier targeted PAC funding system), endings.js (6 ending conditions + 5-page adaptive epilogue generation). A new `model_release` pulse (32-day initial offset, 63-day interval, alternating with `pnth_earnings`) bumps `world.pnth.silmarillionVersion` quarterly (3 minor + 1 major per year, starting at "3.5") and rolls a tier from a 5-bucket distribution biased by world state (frontierLead, tradeWarStage, aegisControversy, commercialMomentum, gottliebStartedRival). Tier-keyed headline events live in `src/events/silmarillion.js` and seed followup chains via the existing followup mechanism.

**LLM event source**: `src/llm.js` (LLMEventSource) is an Anthropic API client for dynamic narrative event generation, activated via the "Dynamic (LLM)" mode (option 6 in the mode dropdown). Generates event batches with parameter deltas, faction shifts, and world state effects via structured tool use. API key and model are configured in the LLM Settings section of the sidebar (localStorage keys `shoals_llm_key`, `shoals_llm_model`; default model `claude-haiku-4-5-20251001`). `eventEngine = new EventEngine('llm', llmSource)` swaps in the LLM source at mode-select time; event schema and tool definitions reuse `PARAM_RANGES` from events.js.

**Audio**: `audio.js` — all Web Audio API synthesis, no external audio files. Three layers: (1) background jazz loop (72 BPM, 16-bar Am form: Rhodes piano (sine+bell partial) with hand-placed comp events and ghost voicings, spacious walking bass (triangle+sub-sine) with chromatic approaches, brush drums (swish circles + dab backbeats), sparse ride cymbal shimmer on swung upbeats, and muted trumpet melody fragments (60% chance per loop, two alternating pentatonic phrases). Convolution reverb (1.8s synthetic IR, 12ms predelay, darkened via LP return) on piano and trumpet. Form: A(Am9→Dm9→Hd→E7) A'(Am9→FM7→Hd→E7) B(FM7→Em7→Dm9→CM7) C(Hd→E7→E7→Am9). 4-note spread voicings (Bill Evans style). (2) continuous Am drone pad (sine/triangle/sawtooth oscillators), (3) event stingers + superevent chord stabs. `setAmbientMood(mood)` crossfades between jazz and drone: calm = full jazz, tense = jazz 55% / drone 45%, crisis = jazz 15% / drone 85%. Jazz loop uses a look-ahead scheduler (`_jazzSchedule`) that keeps 4s of audio queued. `playMusic(track)` ducks both jazz and drone to silence for superevent chord stabs, `stopMusic` restores them to the current mood mix. Volume slider is in the settings dropdown, triggered by the gear icon (`#settings-btn`) in the toolbar. The dropdown uses `_settings.create()` from `shared-settings.js`. `$.settingsBtn` is the DOM cache reference.

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
- VIX cells: `--vix` (purple) — `#vix-price-cell`, `#strategy-vix-cell`, `.vix-overlay-cell`
- VXPNT sparkline: `--vix` CSS var color
- Sparklines: rate/portfolio use `--text` CSS var color

### Pricing

Always use `unitPrice()` (position-value.js) — includes vol surface + impact overlay. Handles 5 types: `stock`, `bond`, `vixfuture`, `call`, `put`. Only exception: strategy.js payoff curve sweeps via direct tree pricing.

All option pricing uses `prepareTree` + `priceWithTree`. No `priceAmerican` function exists. Each module owns reusable trees for zero-alloc pricing. VXPNT spot uses `computeVIXSpot()` (Heston 30-day expected integrated vol × 100). VXPNT futures use `computeVIXFuturePrice()` (forward variance curve → forward integrated vol). Both in `pricing.js`.

### Price Impact

Impact is an **overlay** on `sim.S` — never mutates it. `getStockImpact(sigma)`, `getBondImpact(sigmaR)`, `getVixImpact(xi)`, and `getOptionImpact(...)` each require their respective vol parameter at read time. VIX futures impact is keyed off `xi` (vol-of-vol) — higher xi deepens the VIX liquidity pool. Only `resetImpactState()` clears cumulative volumes.

### Popups vs Toasts

Events are unified under `src/events/`. Toast-only events have `headline` + `params` but no `choices`. Popup events have `popup: true` + `choices`. Portfolio-triggered popups have `trigger` + `cooldown` + `tone` (`'positive'` or `'negative'`) evaluated daily by `EventEngine.evaluateTriggers`. Positive-tone events fire more often at high firm standing (inverse cooldown multiplier); negative-tone events fire less often. Superevents have `superevent: true` (full-screen treatment + chord stab). `showToast(message, duration)` — duration is numeric ms, no severity parameter. Long toasts auto-detect multiline and switch from pill to rounded-rect shape.

### Positions

Signed qty: `qty > 0` = long, `qty < 0` = short. No `side` property. Netting key: `type + strike + expiryDay + strategyName`. Five position types: `stock`, `bond`, `vixfuture`, `call`, `put`. VIX futures are cash-settled at VXPNT spot on expiry, use Reg-T margin for shorts, and contribute vega + theta to portfolio greeks.

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
- `initAudio()` must be called from a user gesture handler (deferred to first click/keydown via one-shot listeners in `main.js`)
- `scheduleFollowup` must use `{ event, chainId, targetDay, weight, depth }` — NOT `{ id, fireDay }`
- `world.pnth.silmarillionVersion` is system-managed via `_bumpSilmarillionVersion` and `_releasesThisYear`; the LLM whitelist excludes it. Never write to it from event effects.
- The `model_release` pulse is `type: 'modelRelease'` (not `'recurring'`) — the reset loop in `EventEngine.reset()` and `_resetCore` both must handle this branch or pulses will never reseed after a game reset.
- `_fireSilmarillionRelease` resolves headline placeholders via `replaceAll('{version}', ...)` etc. Don't use literal curly braces in unrelated headlines or they may collide if the substitution is later generalized.
- Major-release magnitude multiplier (1.5× params, 2× frontierLead delta) is applied in `_fireSilmarillionRelease` BEFORE `_fireEvent`, so the cloned event flows through normal clamping.
- Followup events do NOT receive `{version}` placeholder substitution — they go through the standard `_fireEvent` path. Only the 5 tier-keyed `category: 'model_release'` headlines (selected by `_fireSilmarillionRelease`) have `{version}` substituted. If you add `{version}` to a followup headline it will render as the literal text in-game; either drop the placeholder, use a phrase like "the latest Silmarillion release", or extend `_fireEvent` to substitute.
- Adding a 6th tier requires updating: distribution thresholds in `_rollSilmarillionTier`, return-label array in same, tier label map in `_fireSilmarillionRelease`, validation enum in `WORLD_STATE_RANGES['pnth.lastReleaseTier'].values`, and a new `silmarillion_<tier>` headline event in `src/events/silmarillion.js`. Five touchpoints; consider extracting a shared `SILMARILLION_TIERS` constant before adding.

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
- VIX futures `spreadVol` uses `market.xi` (vol-of-vol), not `market.sigma` — same pattern as bonds using `market.sigmaR`
- `computeVIXSpot` and `computeVIXFuturePrice` take **variance** `v`, not vol — same convention as `computeEffectiveSigma`
- VIX futures have no borrow cost — `chargeBorrowInterest` only processes `stock` and `bond`
- VIX futures theta is positive in backwardation (v > θ), negative in contango (v < θ) — for long positions

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
- `_noteOn` / generic `_noise` in audio.js — replaced by specialized instrument functions (`_rhodesNote`, `_bassNote`, `_brushSwish`, `_brushDab`, `_rideTing`, `_trumpetNote`)
- Algorithmic COMP generation loop in audio.js — comp events are hand-placed for musical phrasing
- `BPM = 128` — tempo is 72 BPM for melancholic lounge feel; do not speed up
- `factions` block in `createWorldState()` — removed; faction state lives solely in `faction-standing.js`, attached by reference
- `Strait of Farsis` / `Beijing` / `Mar-a-Lago` / `Korindian` — use real geography (Strait of Hormuz, Nanjing, Little St. James, Meridine)
- `$.volumeSlider` / `#volume-slider` in the Info tab — volume slider moved to the settings dropdown (`#settings-btn` toolbar gear icon); DOM cache is `$.settingsBtn`
- `<h2 class="stats-title">Trading</h2>` in the main sidebar — replaced by `.sidebar-tabs` inside `.stats-header` with tab buttons directly in the header (matches scripture's pattern)
- `syncMarket(sim)` calls in main.js — use `_syncAll()` which also computes `market.vix`
- `category: 'pnth_silmarillion'` or other variant category for model release events — the canonical category is `'model_release'` for the 5 tier headlines, and `'pnth'` for the 17 followups.
- A separate `releasesThisYear` reset based on `sim.day` modular arithmetic — the counter is purely incremental on the engine instance and resets only via `EventEngine.reset()` / `_resetCore`.

### Cross-Domain Event Wiring

Events form an interconnected web, not isolated threads. Key cross-domain connections:
- **Geopolitical → PNTH**: Khasurian incursion sets `aegisDemandSurge` → Aegis events boost likelihood. Serican compute buildout sets `crucibleCompetitionPressure` → Crucible events respond. Strait closure sets `energyCrisis` → Fed emergency followup.
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

**PNTH**: Chairwoman Andrea Dirks vs CEO Eugene Gottlieb. CTO Mira Kassis, CFO Raj Malhotra, board kingmaker David Zhen. Products: Atlas Sentinel (enterprise), Atlas Aegis (military), Atlas Companion (consumer), Atlas Crucible (infrastructure), Covenant AI (Gottlieb's rival).

**Geopolitics**: Serica (Premier Liang Wei), Khasuria (President Volkov), Farsistan (Emir al-Farhan, Strait of Hormuz), Boliviara (President Madero), Meridia (PM Navon).

**Media**: The Continental (Rachel Tan, Tom Driscoll), The Sentinel (Marcus Cole), MarketWire (Priya Sharma), The Meridian Brief (internal).

### World State Domains

`congress` (seats + `filibusterActive` + `bigBillStatus` 0–4), `pnth` (board + products: `sentinelLaunched`/`aegisDeployed`/`companionLaunched`/`crucibleLaunched` + `companionScandal`/`aegisControversy` 0–3 + `silmarillionVersion` (string default "3.5") + `lastReleaseTier` (enum, set after each release) + `frontierLead` (-3..+3, PNTH lead vs Tianxia/Aletheia)), `geopolitical` (`sericaRelations` ±3, `farsistanEscalation`/`khasurianCrisis` 0–3, `straitClosed`, `aegisDemandSurge`, `crucibleCompetitionPressure`, `energyCrisis`), `fed`, `investigations` (`tanBowmanStory`/`okaforProbeStage`/`impeachmentStage` 0–3, `meridianExposed` bool — set by bridge event when dirty player is caught in investigative crossfire), `election`, `media` (`tanCredibility`/`sentinelRating` 0–10, `pressFreedomIndex` 0–10, `leakCount` 0–5, `lobbyingExposed` bool — set when `lobbyCount >= 3` and `mediaTrust < 40`).

`factions` is NOT in `createWorldState()` — it lives in `faction-standing.js` and is attached by reference via `eventEngine.world.factions = factions` at init/reset/preset-load.

### Exercise Netting

`exerciseOption` nets delivered stock into existing stock positions (same `strategyName`). Call exercise buys stock (covers shorts first), put exercise sells stock (sells longs first, creates short if none). Exercise creates price impact via `recordStockTrade`.
