# Event System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the offline dynamic event system with ~200 stateful, narratively rich events, world state machine, midterm elections, and a 4-page epilogue.

**Architecture:** New `world-state.js` module provides mutable political/corporate/geopolitical state. `event-pool.js` holds ~200 event definitions organized by category with `when`/`effects`/dynamic `likelihood`. Rewritten `EventEngine` in `events.js` adds cooldown-gated Poisson, FOMC jitter, Gaussian followup timing, boredom counter, midterm mechanic, and epilogue trigger. `epilogue.js` generates a 4-page narrative conclusion from accumulated state.

**Tech Stack:** Vanilla ES6 modules, no dependencies. Canvas 2D + HTML overlays.

**Spec:** `docs/superpowers/specs/2026-03-20-event-system-redesign-design.md`

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `src/world-state.js` | **NEW** | `createWorldState()`, `congressHelpers()`, world state field ranges/whitelist for LLM validation |
| `src/event-pool.js` | **NEW** | ~200 event definitions in category arrays, `OFFLINE_EVENTS` export, `getEventById()` |
| `src/epilogue.js` | **NEW** | `generateEpilogue(world, sim, portfolio, eventLog)` -> 4 page objects |
| `src/events.js` | **REWRITE** | `EventEngine` class -- world state integration, timing, midterm, epilogue check |
| `src/llm.js` | **UPDATE** | System prompt rewrite, world state serialization, structured effects DSL |
| `src/config.js` | **UPDATE** | New constants (midterm, timing, term end) |
| `src/portfolio.js` | **UPDATE** | Add tracking fields for epilogue scorecard |
| `main.js` | **UPDATE** | Wire epilogue trigger, pass world state, update reset logic |
| `index.html` | **UPDATE** | Epilogue overlay markup |
| `styles.css` | **UPDATE** | Epilogue overlay styles |

---

## Task 1: Config Constants

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add new constants to config.js**

Add after the existing `FED_MEETING_INTERVAL` line (~line 34):

```js
export const MIDTERM_DAY = 504;            // ~2 years of trading days
export const CAMPAIGN_START_DAY = 440;     // campaign season starts ~2 months before midterms
export const NON_FED_POISSON_RATE = 1 / 30; // base rate, effective ~1/41.5 with cooldown
export const NON_FED_COOLDOWN_MIN = 8;
export const NON_FED_COOLDOWN_MAX = 15;
export const FED_MEETING_JITTER = 4;       // +/-4 day jitter on FOMC schedule
export const BOREDOM_THRESHOLD = 3;        // consecutive minor events before boost
export const TERM_END_DAY = 1008;          // 4 years of trading days (252 * 4)
```

- [ ] **Step 2: Verify no import conflicts**

Search main.js and events.js for existing imports from config.js to confirm no name collisions with the new exports.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add event system timing and election constants"
```

---

## Task 2: World State Module

**Files:**
- Create: `src/world-state.js`

- [ ] **Step 1: Create world-state.js with createWorldState, congressHelpers, WORLD_STATE_RANGES, and applyStructuredEffects**

Contains:
- `createWorldState()` -- returns the full mutable state object per spec section 4.1 (congress, pnth, geopolitical, fed, investigations, election sub-objects)
- `congressHelpers(world)` -- returns derived `{ fedControlsSenate, fedControlsHouse, trifecta, superMajority }`
- `WORLD_STATE_RANGES` -- lookup table mapping dot-notation paths to `{ min, max, type }` for LLM effects validation
- `applyStructuredEffects(world, effects)` -- validates and applies an array of `{ path, op, value }` mutations from LLM events. Whitelist-checks paths against `WORLD_STATE_RANGES`, clamps numeric values, converts 0/1 to booleans, silently drops invalid entries.

See spec section 4.1 for the exact shape of the world state object. See spec section 14.3 for the effects validation rules.

- [ ] **Step 2: Commit**

```bash
git add src/world-state.js
git commit -m "feat: add world state module with congress helpers and LLM effects validation"
```

---

## Task 3: Rewrite EventEngine

**Files:**
- Rewrite: `src/events.js`

This is the engine rewrite. The event pool (Task 4) is separate. This task creates the engine that consumes events from `event-pool.js`.

- [ ] **Step 1: Rewrite events.js with the new EventEngine**

Replace the entire file. The new engine imports from `world-state.js`, `event-pool.js`, and `config.js`.

**Important:** Before writing events.js, create a minimal stub `src/event-pool.js` so the import resolves and the app can load:

```js
// Stub -- filled in Tasks 4-8
export const PARAM_RANGES = {
    mu: { min: -0.50, max: 0.50 }, theta: { min: 0.005, max: 1.00 },
    kappa: { min: 0.05, max: 10.0 }, xi: { min: 0.05, max: 1.50 },
    rho: { min: -0.99, max: 0.50 }, lambda: { min: 0.0, max: 15.0 },
    muJ: { min: -0.25, max: 0.15 }, sigmaJ: { min: 0.005, max: 0.25 },
    a: { min: 0.01, max: 2.0 }, b: { min: -0.05, max: 0.20 },
    sigmaR: { min: 0.001, max: 0.050 }, borrowSpread: { min: 0.0, max: 5.0 },
    q: { min: 0.0, max: 0.10 },
};
export const OFFLINE_EVENTS = [];
export function getEventById() { return null; }
```

Key changes from current implementation:

**Constructor** creates `this.world = createWorldState()` and adds fields: `_nonFedCooldown`, `_consecutiveMinor`, `_midtermWarningFired`, `_epilogueFired`.

**`maybeFire(sim, day)`** flow:
1. If `_epilogueFired`, return `[]` immediately
2. `_checkMidterm(sim, day)` -- fixed-day campaign season and election
3. `_checkFollowups(sim, day)` -- same grouping logic, but `when()` now receives `(sim, world, congress)`
4. FOMC schedule with jitter: `nextFedDay = day + FED_MEETING_INTERVAL + floor(random() * (JITTER*2+1)) - JITTER`
5. Non-fed Poisson with cooldown: decrement cooldown if > 0, else roll against `NON_FED_POISSON_RATE`, on hit set cooldown `MIN + floor(random() * (MAX-MIN+1))`

**`_fireEvent(event, sim, day, depth)`** adds:
- Calls `event.effects(this.world)` if function, `applyStructuredEffects(this.world, event.effects)` if array
- Tracks `_consecutiveMinor` (increment on minor/neutral, reset on moderate/major)
- Uses `_followupDelay(mtth)` instead of `_poissonSample(mtth)` for followup scheduling

**`_weightedPick(events, sim)`** resolves dynamic `likelihood` functions by calling `ev.likelihood(sim, this.world, congress)`. Applies boredom boost (2x likelihood for non-minor events when `_consecutiveMinor >= BOREDOM_THRESHOLD`).

**`_filterEligible(pool, sim)`** passes `(sim, this.world, congressHelpers(this.world))` to `when()` guards.

**`_followupDelay(mtth)`** uses clamped Gaussian: `center = mtth, sigma = mtth * 0.3, clamp = [mtth*0.4, mtth*2.0]`. Uses Box-Muller `_gaussianSample()`.

**`_checkMidterm(sim, day)`** handles:
- Campaign season at `CAMPAIGN_START_DAY`: fires a hard-coded campaign event, sets `_midtermWarningFired`
- Election at `MIDTERM_DAY`: computes score from `barronApproval`, recession, war penalties, +/-10 noise. Determines `fed_gain`/`fed_hold`/`fed_loss_house`/`fed_loss_both`. Mutates `congress` seat counts via `effects`. Sets `midtermComplete`, `midtermResult`.

**`isEpilogueReady(day)`** -- pure check: `day >= TERM_END_DAY && !_epilogueFired`

**`computeElectionOutcome(sim)`** -- scoring formula per spec section 16. Sets `world.election.presidentialResult` and `_epilogueFired = true`.

**`reset()`** also resets: `world = createWorldState()`, all timing fields to initial values.

**`applyDeltas(sim, params)`** -- preserve unchanged from current implementation. Iterates param entries, clamps to `PARAM_RANGES`, calls `sim._recomputeRhoDerived()` if rho changed. This is called internally by `_fireEvent` and may be used externally.

Add explicit re-export at the top of the file for backwards compatibility (llm.js imports PARAM_RANGES from events.js):
```js
export { PARAM_RANGES } from './event-pool.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/events.js src/event-pool.js
git commit -m "feat: rewrite EventEngine with world state, timing improvements, midterm, epilogue"
```

---

## Task 4: Event Pool -- Scaffold & Neutral/Market Events

**Files:**
- Create: `src/event-pool.js`

- [ ] **Step 1: Create event-pool.js with scaffold, PARAM_RANGES, getEventById, and neutral + market events**

Structure:
- `PARAM_RANGES` object (moved from events.js, same values)
- `NEUTRAL_EVENTS` array (~25 events, likelihood 2-6, minor magnitude)
- `MARKET_EVENTS` array (~12 events, dynamic likelihood functions for flash crash/liquidity crisis/etc.)
- Placeholder empty arrays for: `FED_EVENTS`, `MACRO_EVENTS`, `PNTH_EVENTS`, `SECTOR_EVENTS`, `POLITICAL_EVENTS`, `INVESTIGATION_EVENTS`, `COMPOUND_EVENTS`, `MIDTERM_EVENTS`
- `OFFLINE_EVENTS` merged via spread (includes all arrays)
- Note: `MIDTERM_EVENTS` are included in `OFFLINE_EVENTS` for `getEventById` lookup, but the engine's `_drawOffline` filters out both `category: 'fed'` and `category: 'midterm'` from the Poisson pool (this is already handled in Task 3's `_nonFedEvents` filter: `e.category !== 'fed' && e.category !== 'midterm'`)
- `getEventById(id)` with lazy Map cache

**Neutral events** must reference world state in `when()` guards per spec section 9.11:
- Barron golfing: `when: (s, w) => w.geopolitical.mideastEscalation < 2`
- Gottlieb TED talk: `when: (s, w) => w.pnth.ceoIsGottlieb`
- Kassis hackathon: `when: (s, w) => w.pnth.ctoIsMira`
- Hartley Jackson Hole: `when: (s, w) => !w.fed.hartleyFired`
- Congressional recess: `when: (s, w) => w.investigations.impeachmentStage === 0`
- Clay book tour: `effects: (w) => { w.election.barronApproval = Math.max(0, w.election.barronApproval - 1); }`

**Market events** use dynamic likelihood per spec section 9.10:
- Flash crash: `likelihood: (sim, w) => { let b = 0.2; if (sim.theta > 0.15) b += 0.2; if (sim.theta > 0.20) b += 0.3; if (w.fed.credibilityScore < 4) b += 0.15; return b; }`
- Low vol grind: `when: (sim) => sim.theta < 0.06 && sim.lambda < 1.5`

- [ ] **Step 2: Verify events.js + event-pool.js import chain resolves**

- [ ] **Step 3: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add event pool scaffold with neutral and market structure events"
```

---

## Task 5: Event Pool -- Fed Events (~20)

**Files:**
- Modify: `src/event-pool.js`

- [ ] **Step 1: Fill in FED_EVENTS array**

Write ~20 Fed events per spec Arc 5 (Fed Independence Crisis) and parameter profiles (spec section 10.1):

- 3 "holds steady" variants (likelihood 4-5, minor)
- Hike cycle: signals hike -> 25bps hike -> second hike (followup chain, `when: sim.b < 0.15`)
- Cut cycle: signals cut -> 50bps emergency (followup chain, `when: sim.b > -0.03`)
- QE restart (likelihood 0.3, major)
- Hawkish/dovish minutes (likelihood 1.2, minor)
- Barron pressures Hartley (likelihood 1.5, minor, `effects: credibilityScore -= 2`)
- Hartley pushes back (likelihood 1.0, minor, `effects: credibilityScore += 1`)
- Barron threatens to fire Hartley (likelihood 0.5, `when: barronApproval > 40 && !hartleyFired`)
- Barron fires Hartley (likelihood 0.15, `when: trifecta && credibilityScore <= 4 && !hartleyFired`, `effects: hartleyFired = true, barronApproval -= 10`)
- Vane nominated -> confirmed/rejected chain (gated by `fedControlsSenate`)
- SCOTUS case chain (followup from firing)
- Governor Vane dissents publicly (flavor)
- Reverse repo spike (likelihood 0.8, minor)

All have `category: 'fed'`. All `when` guards use 3-arity `(sim, world, congress)`.

- [ ] **Step 2: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add ~20 Fed/monetary events with Hartley-Barron arc"
```

---

## Task 6: Event Pool -- PNTH Events (~50)

**Files:**
- Modify: `src/event-pool.js`

- [ ] **Step 1: Fill in PNTH_EVENTS array**

Largest category. Write ~50 events per spec Arcs 1 (Gottlieb-Dirks War) and related PNTH storylines:

**Gottlieb-Dirks arc (~20 events):**
- Ethics keynote -> Dirks CNBC rebuttal -> board closed session (followup chain)
- Board outcomes gated by `boardDirks` count: `>= 8` strip oversight, `<= 6` block contract, else compromise
- Gottlieb resignation -> successor search -> Covenant AI founding (followup chain with branching)
- Kassis caught in middle -> sides with Gottlieb (w:0.4) / Dirks (w:0.3) / quits (w:0.3)
- Hostile takeover bid (likelihood 0.1, `when: boardDirks <= 5 || (dojSuitFiled && whistleblowerFiled)`)
- Both ousted (rare, requires scandal flags)
- Proxy fight events (activist investor triggers board shift)
- Dirks resignation (rare, `when: boardDirks <= 4`)

**Bowman/corruption arc (~8 events):**
- Bowman lobbying report, ACLU lawsuit, Senate investigation
- DOJ antitrust suit against PNTH
- VP Bowman intervenes (positive for stock short-term)
- Congressional hearing, ethics board revolt
- Whistleblower complaint

**Routine PNTH (~22 events):**
- Earnings beat/miss (common, likelihood dynamic based on `commercialMomentum`)
- Defense contract won/cancelled
- Analyst upgrade/downgrade (likelihood 1.5 each)
- Product launch Atlas, cloud partnership, contract renewal, DHS expansion
- Hires CTO (Kassis), annual meeting, patent suit
- Activist stake revealed

All have `category: 'pnth'`. Include proper `effects` mutations for board composition, `ceoIsGottlieb`, `militaryContractActive`, `commercialMomentum`, etc.

- [ ] **Step 2: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add ~50 PNTH events with Gottlieb-Dirks and Bowman arcs"
```

---

## Task 7: Event Pool -- Macro, Political, Investigation Events (~60)

**Files:**
- Modify: `src/event-pool.js`

- [ ] **Step 1: Fill in MACRO_EVENTS (~25)**

Per spec Arcs 3 (Trade War), 4 (Middle East), 8 (South America):

- Trade war ladder: tariffs announced -> retaliation -> Zhaowei ban -> rare earth crisis -> deal/permanent decoupling. Each stage-transition event must set `tradeWarStage` and `chinaRelations` via effects.
- Middle East: initial strikes -> ground deployment -> quagmire -> withdrawal/ceasefire. Each sets `mideastEscalation`.
- South America: covert ops exposed -> overt advisors -> regime falls -> insurgency/withdrawal. Sets `southAmericaOps`.
- Oil shock (sets `oilCrisis = true`), sanctions
- Recession declared (`when: sim.mu < -0.05 && sim.theta > 0.12`, sets `recessionDeclared = true`)
- CPI surprises (high/low), jobs reports (strong/weak)
- Geopolitical ceasefire, sovereign debt crisis

- [ ] **Step 2: Fill in POLITICAL_EVENTS (~20)**

Per spec Arc 7 (Okafor) and Barron politics:

- Okafor hearings -> popularity surge -> enters race / scandal (branching followups)
- Barron executive orders: DoW rename, various tariff announcements
- Congress gridlock events (gated by `trifecta`), spending bill fights
- Clay memoir, opposition rallies
- Barron approval nudge events (neutral-ish events that drift `barronApproval` toward 45 for mean reversion)
- Post-midterm followup events stored in `MIDTERM_EVENTS` array for ID lookup

- [ ] **Step 3: Fill in INVESTIGATION_EVENTS (~15)**

Per spec Arc 2 (Bowman) journalism thread:

- Rachel Tan initial report (`effects: tanBowmanStory = 1, barronApproval -= 3`)
- Bowman denial/Barron defense (immediate reaction followup, mtth: 3)
- Tan followup piece (`effects: tanBowmanStory = 2, barronApproval -= 5`)
- Tan bombshell (`effects: tanBowmanStory = 3, barronApproval -= 8`, implicates Dirks -> feeds Arc 1)
- Tan NSA story progression (parallel track, sets `tanNsaStory`)
- Okafor probe stages: hearings -> subpoenas -> referral (gated by Senate control or probe stage)
- DOJ Bowman referral (`when: !trifecta`), Bowman indictment
- Bowman resignation
- Impeachment stages: inquiry -> vote -> trial (`when: !fedControlsHouse`, `impeachmentStage` progression)

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add macro, political, and investigation events (~60)"
```

---

## Task 8: Event Pool -- Sector, Compound, and Balance

**Files:**
- Modify: `src/event-pool.js`

- [ ] **Step 1: Fill in SECTOR_EVENTS (~15)**

- AI regulation bill, antitrust big tech
- Semiconductor shortage/glut
- Mega data breach, cybersecurity attack on infrastructure
- Tech IPO frenzy, cloud spending boom
- AI boom sentiment, tech earnings mixed
- Zhaowei-specific: conference, model beats PNTH benchmarks

- [ ] **Step 2: Fill in COMPOUND_EVENTS (~10)**

Per spec section 9.9. All have `likelihood >= 1.0` (rarity from flag requirements):

- War + Recession: `when: (s, w) => w.geopolitical.mideastEscalation >= 2 && w.geopolitical.recessionDeclared`
- PNTH scandal + Trade war: `when: (s, w) => w.investigations.tanBowmanStory >= 2 && w.geopolitical.tradeWarStage >= 3`
- Fed crisis + Oil shock: `when: (s, w) => w.fed.hartleyFired && w.geopolitical.oilCrisis`
- Full meltdown: `when: (sim, w) => w.fed.credibilityScore < 3 && w.geopolitical.recessionDeclared && sim.theta > 0.15`
- Additional compound events as arcs suggest (e.g., impeachment + war, PNTH acquisition during crisis)

- [ ] **Step 3: Balance verification**

Compute `sum(likelihood_i * mu_i) / sum(likelihood_i)` across all events with static likelihoods (skip dynamic-likelihood events). Verify absolute value < 0.005 for both mu and theta weighted averages.

If the weighted average drifts, adjust neutral event params (which fire most often and dominate the average). Tiny compensating deltas on high-likelihood neutral events are the tuning mechanism.

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js
git commit -m "feat: add sector and compound events, verify parameter balance"
```

---

## Task 9: Portfolio Stats Tracking

**Files:**
- Modify: `src/portfolio.js`

- [ ] **Step 1: Add tracking fields to portfolio object**

Add after `totalDividends` (~line 36):

```js
    totalTrades:      0,
    totalExercises:   0,
    marginCallCount:  0,
    peakValue:        INITIAL_CAPITAL,
    maxDrawdown:      0,
```

- [ ] **Step 2: Reset new fields in resetPortfolio()**

Add to the reset function (~line 58-62):

```js
    portfolio.totalTrades      = 0;
    portfolio.totalExercises   = 0;
    portfolio.marginCallCount  = 0;
    portfolio.peakValue        = cap;
    portfolio.maxDrawdown      = 0;
```

- [ ] **Step 3: Increment totalTrades in executeMarketOrder**

Find `executeMarketOrder` function. Add `portfolio.totalTrades++` at the top of the function body, after parameter validation but before any early returns that indicate failure.

- [ ] **Step 4: Increment totalExercises in exerciseOption**

Find `exerciseOption` function. Add `portfolio.totalExercises++` at the top, after validation.

- [ ] **Step 5: Commit**

```bash
git add src/portfolio.js
git commit -m "feat: add portfolio tracking fields for epilogue scorecard"
```

---

## Task 10: Epilogue Content Generator

**Files:**
- Create: `src/epilogue.js`

Note: This task creates epilogue.js BEFORE main.js integration (Task 12) so the import resolves.

- [ ] **Step 1: Create epilogue.js with generateEpilogue function**

Exports `generateEpilogue(world, sim, portfolio, eventLog)` returning array of 4 `{ title, body }` objects.

Internal structure:
- `_electionPage(world)` -- branches on `presidentialResult` (6 outcomes: barron_removed, barron_wins_comfortably, barron_wins_narrowly, okafor_wins, okafor_wins_decisively, fl_wins, fl_wins_decisively). References `okaforRunning`, `midtermResult`. 3-5 paragraphs in retrospective journalistic style.
- `_pnthPage(world)` -- priority-ordered branches (first match wins): acquired > scandal-ravaged > covenant rival > Gottlieb's PNTH > Dirks's PNTH > compromise. Weaves in Kassis fate, board composition, Bowman fallout. 3-5 paragraphs.
- `_worldPage(world, sim)` -- subsections for Trade/China (skip if stage 0), Middle East (skip if stage 0), South America (skip if stage 0), Fed (always), Economy (always). 2-4 paragraphs total.
- `_legacyPage(world, sim, portfolio, eventLog)` -- scorecard with stat-rows. Computes P&L including open positions (import `computePositionValue` from position-value.js). Rating title. Timeline highlights (filter major events, backfill with moderate sorted by param delta sum). Uses helper functions `_p(text)`, `_h3(text)`, `_statSection(title, rows)` for HTML generation.

**Critical:** Write the full narrative prose for each branch. Each election outcome, each PNTH resolution, each world subsection should have 2-5 paragraphs of engaging, specific text that references the characters and events from the spec. This is the payoff of the entire system -- do not skimp on the writing.

- [ ] **Step 2: Commit**

```bash
git add src/epilogue.js
git commit -m "feat: add epilogue content generator with 4-page narrative"
```

---

## Task 11: Epilogue UI (HTML + CSS)

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: Add epilogue overlay markup to index.html**

Add after the margin-call overlay block (~line 522). Uses the existing `.sim-overlay` / `.sim-overlay-panel` pattern:

```html
    <div id="epilogue-overlay" class="sim-overlay hidden">
        <div class="sim-overlay-panel glass epilogue-panel">
            <div class="epilogue-header">
                <h2 class="epilogue-title"></h2>
            </div>
            <div class="sim-overlay-body epilogue-body scrollbar-thin"></div>
            <div class="epilogue-footer">
                <div class="epilogue-dots">
                    <span class="epilogue-dot active"></span>
                    <span class="epilogue-dot"></span>
                    <span class="epilogue-dot"></span>
                    <span class="epilogue-dot"></span>
                </div>
                <div class="epilogue-nav">
                    <button id="epilogue-back" class="ghost-btn hidden">Back</button>
                    <button id="epilogue-next" class="ghost-btn">Next</button>
                    <button id="epilogue-restart" class="ghost-btn hidden">Restart</button>
                    <button id="epilogue-keep" class="ghost-btn hidden">Keep Playing</button>
                </div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: Add epilogue CSS to styles.css**

Styles for `.epilogue-panel` (max-width 600px), `.epilogue-title` (font-display), `.epilogue-body` (line-height 1.6, max-height 60vh, opacity transition 200ms), `.epilogue-footer`, `.epilogue-dots` + `.epilogue-dot` (8px circles, active = accent), `.epilogue-nav`, `.epilogue-scorecard`, `.epilogue-highlights` (list with day labels in mono font), responsive at 600px (fullscreen).

- [ ] **Step 3: Commit**

```bash
git add index.html styles.css
git commit -m "feat: add epilogue overlay markup and styles"
```

---

## Task 12: Main.js Integration

**Files:**
- Modify: `main.js`

Dependencies: Tasks 10 (epilogue.js exists) and 11 (HTML overlay exists).

- [ ] **Step 1: Add epilogue import**

Add to imports at top:
```js
import { generateEpilogue } from './src/epilogue.js';
```

- [ ] **Step 2: Add epilogue trigger to _onDayComplete**

In `_onDayComplete()` (~line 519), add before the existing `if (eventEngine)` block:

```js
    if (eventEngine && eventEngine.isEpilogueReady(sim.day)) {
        playing = false;
        updatePlayBtn($, playing);
        eventEngine.computeElectionOutcome(sim);
        _showEpilogue();
        return;
    }
```

- [ ] **Step 3: Add peakValue/maxDrawdown tracking to substep path**

In the substep callback, find where equity is computed for portfolio display / margin checks. The `updatePortfolioDisplay` function in ui.js computes equity internally. To avoid recomputing, add equity tracking directly in `_onSubstep` where the portfolio value is already available. If the equity isn't directly accessible, compute it as `portfolio.cash + sum(computePositionValue(pos, sim.S, sim.v, sim.r, sim.day, sim.q) * pos.qty for each position)`. Then:

```js
    if (equity > portfolio.peakValue) portfolio.peakValue = equity;
    if (portfolio.peakValue > 0) {
        const dd = 1 - equity / portfolio.peakValue;
        if (dd > portfolio.maxDrawdown) portfolio.maxDrawdown = dd;
    }
```

- [ ] **Step 4: Add marginCallCount increment**

Find where `showMarginCall` is called. Add `portfolio.marginCallCount++` just before it.

- [ ] **Step 5: Add _showEpilogue function**

Create function that:
1. Calls `generateEpilogue(eventEngine.world, sim, portfolio, eventEngine.eventLog)` to get 4 page objects
2. Gets DOM references from the epilogue overlay
3. Manages `currentPage` state with `render()` function that:
   - Fades `.epilogue-body` opacity to 0
   - After 200ms timeout: sets title via `textContent`, sets body content, resets scrollTop, fades opacity back to 1
   - Toggles dot active states, shows/hides Back/Next/Restart/Keep Playing buttons based on current page
4. Wires button onclick handlers:
   - Back/Next: decrement/increment page, re-render
   - Restart: hide overlay, call `_resetCore` with offline Dynamic preset index
   - Keep Playing: hide overlay, show toast "Event storyline complete. Market simulation continues."
5. Shows the overlay and calls initial render

**Security note:** The epilogue body content is generated entirely by our own `generateEpilogue` function from trusted state -- it is not user input or external data. The HTML is constructed from hardcoded template strings with numeric values inserted via string concatenation. This is safe in this context as there is no user-controlled or external input in the generated HTML.

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: wire epilogue trigger, portfolio tracking, and overlay controller"
```

---

## Task 13: LLM Integration Update

**Files:**
- Modify: `src/llm.js`

- [ ] **Step 1: Update system prompt with new cast and world state**

Rewrite `SYSTEM_PROMPT` to include:
- Full updated character list (Barron, Bowman, Clay, Hartley, Vane, Dirks, Gottlieb, Kassis, Okafor, Wei, Tan) with their relationships and motivations
- World state descriptions and what each flag means
- `effects` guidance: when to suggest world state mutations, valid paths
- Updated event design rules referencing the new arc system and likelihood tiers

- [ ] **Step 2: Add structured effects to tool schema**

Add `effects` field to the event item schema in `TOOL_DEF`. Array of objects with `path` (string, dot-notation), `op` (enum: set/add), `value` (number).

- [ ] **Step 3: Update generateBatch to accept and serialize world state**

Signature changes to `(sim, eventLog, pendingFollowups, world)`. Add world state serialization to user message (congress seats, board composition, CEO/CTO status, all flags). The engine already passes `this.world` in Task 3's updated `_fetchBatch`.

- [ ] **Step 4: Parse effects from LLM response**

Include effects in the response mapping alongside headline, params, magnitude, followups.

- [ ] **Step 5: Commit**

```bash
git add src/llm.js
git commit -m "feat: update LLM integration with new cast, world state, and structured effects"
```

---

## Task 14: Final Integration & Polish

**Files:**
- Modify: `main.js`, potentially `src/events.js`

- [ ] **Step 1: Verify full import chain**

Ensure all imports resolve without circular dependencies:
- `main.js` -> `events.js` -> `event-pool.js` + `world-state.js` + `config.js`
- `main.js` -> `epilogue.js` -> `config.js` + `position-value.js`
- `main.js` -> `llm.js` -> `event-pool.js` (for PARAM_RANGES)

- [ ] **Step 2: Verify reset path**

When switching presets or resetting:
- `eventEngine.reset()` resets world state and all timing fields
- `resetPortfolio()` resets new tracking fields
- Epilogue overlay is hidden on reset
- Chart and strategy canvases re-render

- [ ] **Step 3: Verify Dynamic preset switching**

Switching between non-Dynamic and Dynamic presets correctly creates/destroys `eventEngine`. World state is fresh on each Dynamic start.

- [ ] **Step 4: Verify event log display still works**

`updateEventLog` in ui.js reads `eventLog` entries with `day`, `headline`, `magnitude`, `params` -- all unchanged. No ui.js modifications needed.

- [ ] **Step 5: Commit**

```bash
git add main.js src/events.js
git commit -m "feat: final integration and wiring for event system redesign"
```

---

## Task Summary

| Task | Files | ~Events | Description |
|------|-------|---------|-------------|
| 1 | config.js | 0 | New constants |
| 2 | world-state.js | 0 | World state module |
| 3 | events.js + event-pool.js stub | 0 | Engine rewrite |
| 4 | event-pool.js | ~37 | Scaffold + neutral + market |
| 5 | event-pool.js | ~20 | Fed events |
| 6 | event-pool.js | ~50 | PNTH events |
| 7 | event-pool.js | ~60 | Macro + political + investigation |
| 8 | event-pool.js | ~25 | Sector + compound + balance check |
| 9 | portfolio.js | 0 | Tracking fields |
| 10 | epilogue.js | 0 | Content generator |
| 11 | index.html, styles.css | 0 | Epilogue UI |
| 12 | main.js | 0 | Epilogue trigger + wiring |
| 13 | llm.js | 0 | LLM update |
| 14 | main.js | 0 | Final integration |
