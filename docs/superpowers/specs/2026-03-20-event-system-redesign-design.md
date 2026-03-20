# Event System Redesign — Design Spec

**Date:** 2026-03-20
**Scope:** `src/events.js`, `src/world-state.js` (new), `src/llm.js`, `src/config.js`, `main.js`

## 1. Goals

Rewrite the offline dynamic event system to be:
- **Narratively rich** — deep multi-step chains with branching paths, memorable characters, and dramatic resolutions
- **Mechanically varied** — parameter deltas that tell stories, compound crises, dynamic likelihoods
- **Balanced** — expected mu and theta deltas near zero per year; escalation ladders with natural caps
- **Stateful** — world flags (congress, PNTH board, geopolitics, investigations) gate events and create emergent storylines
- **Replayable** — ~200 events with probabilistic branching means each playthrough samples a different slice

## 2. Timeline Context

The simulation spans a single presidential term (~1000-2000 trading days, 4-8 years). Events build toward midterms at ~504 trading days, then evolve based on results. Arcs have definitive resolutions — storylines end, new ones begin from their ashes.

## 3. Characters

### The Administration

- **President John Barron** (Federalist Party) — Populist strongman. Won upset against Robin Clay. Military hawk, tariff enthusiast, Fed-basher. Erratic social media presence. Governing style oscillates between dealmaker and authoritarian.
- **Vice President Jay Bowman** — Former defense industry lobbyist. The connection between the White House and PNTH. Smooth operator in public, increasingly exposed in private. His corruption is an open secret that slowly becomes an open scandal. Andrea Dirks's college roommate.
- **Former President Robin Clay** (Farmer-Labor Party) — Establishment centrist. Lost the election but remains the face of the opposition. Writes memoirs, gives speeches, occasionally re-enters the political fray.

### The Fed

- **Chair Hayden Hartley** — Technocratic, principled, stubborn. Genuinely believes in Fed independence. Barron's attacks on her are personal and public. She doesn't crack, but the institution around her might.
- **Governor Marcus Vane** — Hartley's hawkish rival on the FOMC. Dissents frequently. Barron quietly backs him as a potential replacement. Creates internal Fed drama.

### Palanthropic (PNTH)

- **Chairwoman Andrea Dirks** — Political operative in a CEO's clothing. VP Bowman's college roommate. Sees PNTH's future as a defense/intelligence monopoly. Charismatic, ruthless, controls the board.
- **CEO Eugene Gottlieb** — Idealistic founder-type who built the technology and watches it get weaponized. Ethical objections are genuine but he's also protecting his legacy. Not a saint — he's made compromises too.
- **CTO Mira Kassis** — Hired from a major AI lab. Brilliant engineer, politically naive. Caught between Dirks and Gottlieb. Her technical decisions become plot points. Can become whistleblower, Dirks ally, or leave to start a competitor.
- **The Board** — 10 seats. Initially 7-3 Dirks. Composition shifts via activist investors, resignations, proxy fights.

### External Players

- **Senator Patricia Okafor** — Chair of Senate Intelligence Committee. Anti-PNTH, anti-Barron platform. Investigations are real but politically motivated. Potential presidential candidate.
- **Liang Wei** — CEO of Zhaowei Technologies, PNTH's main international rival. State-backed Chinese AI giant. Trade war and tech decoupling run through this competition.
- **Rachel Tan** — Investigative journalist at The Continental (fictional paper of record). Breaks the Bowman lobbying story, NSA data-sharing story, and eventually something bigger. Her reporting drives investigation arcs.

## 4. World State Machine

### 4.1 New File: `src/world-state.js`

Exports `createWorldState()` returning the mutable state object, and `congressHelpers(world)` returning derived booleans.

```js
export function createWorldState() {
    return {
        congress: {
            senate: { federalist: 52, farmerLabor: 46, independent: 2 },
            house: { federalist: 221, farmerLabor: 214 },
        },
        pnth: {
            boardDirks: 7,
            boardGottlieb: 3,
            ceoIsGottlieb: true,
            ctoIsMira: true,
            militaryContractActive: false,
            commercialMomentum: 0,     // -2 to +2
            ethicsBoardIntact: true,
            activistStakeRevealed: false,
            dojSuitFiled: false,
            senateProbeLaunched: false,
            whistleblowerFiled: false,
            acquired: false,            // true if hostile takeover event fired
            gottliebStartedRival: false, // true if Covenant AI founded
        },
        geopolitical: {
            tradeWarStage: 0,          // 0=peace, 1=tariffs, 2=retaliation, 3=decoupling, 4=deal
            mideastEscalation: 0,      // 0=baseline, 1=strikes, 2=deployment, 3=quagmire
            southAmericaOps: 0,        // 0=none, 1=covert, 2=overt, 3=occupation/withdrawal
            sanctionsActive: false,
            oilCrisis: false,
            recessionDeclared: false,
            chinaRelations: 0,         // -3 (cold war) to +3 (detente)
        },
        fed: {
            hikeCycle: false,
            cutCycle: false,
            qeActive: false,
            hartleyFired: false,
            vaneAppointed: false,
            credibilityScore: 10,      // 0-10
        },
        investigations: {
            tanBowmanStory: 0,         // 0=unpublished, 1=initial, 2=followup, 3=bombshell
            tanNsaStory: 0,
            okaforProbeStage: 0,       // 0=none, 1=hearings, 2=subpoenas, 3=referral
            impeachmentStage: 0,       // 0=none, 1=inquiry, 2=vote, 3=trial
        },
        election: {
            midtermComplete: false,
            midtermResult: null,       // 'fed_gain'|'fed_loss_house'|'fed_loss_both'|'fed_hold'
            barronApproval: 50,        // 0-100
            primarySeason: false,
            okaforRunning: false,
            presidentialResult: null,   // set by computeElectionOutcome() at term end
        },
    };
}

export function congressHelpers(world) {
    const s = world.congress.senate;
    const h = world.congress.house;
    const fedSenate = s.federalist >= 50;
    const fedHouse = h.federalist >= 218;
    return {
        fedControlsSenate: fedSenate,
        fedControlsHouse: fedHouse,
        trifecta: fedSenate && fedHouse,
        superMajority: s.federalist >= 60,
    };
}
```

### 4.2 How Flags Interact With Events

Every event can have:
- `when: (sim, world, congress) => boolean` — gate that determines eligibility
- `effects: (world) => void` — mutates world state after firing
- `likelihood: number | ((sim, world, congress) => number)` — static or dynamic weight

The `congress` parameter is the pre-computed `congressHelpers(world)` result, avoiding recomputation per-event.

## 5. Revised Event Shape

```js
{
    id: 'string',
    category: 'fed' | 'macro' | 'pnth' | 'sector' | 'market' | 'neutral' | 'political' | 'investigation' | 'compound',
    likelihood: number | ((sim, world, congress) => number),
    headline: 'string',
    params: { mu: delta, theta: delta, ... },
    magnitude: 'minor' | 'moderate' | 'major',
    when: (sim, world, congress) => boolean,   // optional
    effects: (world) => void,                   // optional, NEW
    followups: [{ id, mtth, weight }],          // optional
}
```

Categories expanded from 5 to 9 to accommodate new arc types. The `fed` category still gets special treatment (FOMC schedule). All others draw from the Poisson pool.

**Migration note:** This is a full rewrite of the event pool. All ~88 existing events are replaced by ~200 new events. No existing events are carried forward — all new events use the 3-arity `when(sim, world, congress)` signature. The `category` field is **required** on every event in the new pool.

## 6. Pulse Event System

### 6.1 Concept

Events are divided into two categories by **scheduling mechanism**:

- **Pulse events** fire on a deterministic schedule (with optional jitter). They are not in the random pool. Examples: FOMC meetings, campaign season, midterm election, quarterly PNTH earnings, term-end epilogue check.
- **Random events** are drawn from the Poisson pool. Everything else — macro shocks, PNTH drama, investigations, neutral flavor, market structure, etc.

This replaces the previous design where FOMC and midterms were special-cased independently. Now all scheduled events use a unified pulse system.

### 6.2 Pulse Schedule

The pulse schedule is an array of pulse definitions, checked each day in `maybeFire()`:

```js
// Two pulse types:
// RECURRING: fires every `interval` days (± jitter), draws from a category pool
// FIXED: fires once at a specific day

this._pulses = [
    {
        type: 'recurring',
        id: 'fomc',
        interval: FED_MEETING_INTERVAL,  // 32 days
        jitter: FED_MEETING_JITTER,      // ±4 days
        nextDay: -1,                     // computed on first call
        pool: 'fed',                     // draw from FED_EVENTS
    },
    {
        type: 'recurring',
        id: 'pnth_earnings',
        interval: 63,                   // quarterly, aligned with QUARTERLY_CYCLE
        jitter: 5,                      // ±5 days
        nextDay: -1,
        pool: 'pnth_earnings',          // draw from a sub-pool of PNTH earnings events
    },
    {
        type: 'fixed',
        id: 'campaign_season',
        day: CAMPAIGN_START_DAY,         // ~440
        fired: false,
        handler: '_onCampaignSeason',    // method name on EventEngine
    },
    {
        type: 'fixed',
        id: 'midterm',
        day: MIDTERM_DAY,               // ~504
        fired: false,
        handler: '_onMidterm',
    },
];
```

**Recurring pulses**: When `day >= nextDay`, draw an eligible event from the pulse's category pool using the standard `_filterEligible` + `_weightedPick` flow. Then schedule next: `nextDay = day + interval + jitter_roll`. If no eligible event exists, skip (don't fire nothing, just reschedule).

**Fixed pulses**: When `day >= pulse.day && !pulse.fired`, call the handler method. Set `fired = true`. The handler builds and fires a hard-coded event (like the midterm scoring logic).

On `reset()`, all pulses reset: `nextDay = -1`, `fired = false`.

### 6.3 Revised EventEngine

**Constructor** creates `this.world = createWorldState()` and adds: `_pulses` (the schedule array above), `_randomCooldown`, `_consecutiveMinor`, `_epilogueFired`.

**`maybeFire(sim, day)`** flow:
```
1. If _epilogueFired, return []
2. Check all pulses (in array order = priority order):
   - For each recurring pulse: if day >= nextDay, draw from pool, fire, reschedule
   - For each fixed pulse: if day >= pulse.day && !fired, call handler
   - If ANY pulse fires, return its result (first pulse wins for the day)
3. Check pending followups
4. Random Poisson draw with cooldown
   - If cooldown > 0, decrement and skip
   - Roll against NON_FED_POISSON_RATE
   - On hit, apply boredom adjustment, draw from random pool, set cooldown
```

Only one pulse fires per day. If multiple are due on the same day, priority is array order (FOMC > earnings > campaign > midterm). This prevents event pile-ups.

### 6.4 Other Engine Methods

**`_fireEvent(event, sim, day, depth)`**: Same as before, plus: call `event.effects(this.world)` if function, `applyStructuredEffects` if array. Track `_consecutiveMinor` (increment on minor/neutral, reset on moderate/major).

**`_weightedPick(events, sim)`**: Resolves dynamic `likelihood` functions. Applies boredom boost (2x for non-minor when `_consecutiveMinor >= BOREDOM_THRESHOLD`).

**`_filterEligible(pool, sim)`**: Passes `(sim, this.world, congressHelpers(this.world))` to `when()` guards.

**`reset()`**: Resets `this.world = createWorldState()`, all pulse states, `_randomCooldown = 0`, `_consecutiveMinor = 0`, `_epilogueFired = false`.

## 7. Timing Mechanics

### 7.1 Random Event Rate

Base rate: `1/30`. After firing, cooldown of 8-15 days (uniform random) prevents clumping. Effective rate accounting for cooldown: ~1 per `30 + 11.5 = 41.5` eligible days, giving ~6 random events per year (252 / 41.5 ≈ 6.1). The random pool excludes all pulse-category events (`fed`, `pnth_earnings`, `midterm`).

### 7.2 Pulse Scheduling

All recurring pulses use the same jitter formula: `nextDay = day + interval + floor(random() * (jitter * 2 + 1)) - jitter`. FOMC: interval 32, jitter ±4. Earnings: interval 63, jitter ±5. Fixed pulses fire exactly once at their configured day.

### 7.3 Followup Timing: Clamped Gaussian

Replace Poisson sample with Gaussian for followup delays:
- Center: `mtth`
- Stddev: `mtth * 0.3`
- Clamp: `[mtth * 0.4, mtth * 2.0]`

So `mtth: 25` → arrival between day 10 and 50, centered on 25, most results 17-33.

```js
_followupDelay(mtth) {
    const sigma = mtth * 0.3;
    const raw = mtth + this._gaussianSample() * sigma;
    return Math.max(Math.round(mtth * 0.4), Math.min(Math.round(mtth * 2.0), Math.round(raw)));
}

_gaussianSample() {
    const u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
```

### 7.4 MTTH Guidelines by Narrative Pacing

| Beat type | MTTH | Clamped window | Narrative feel |
|-----------|------|----------------|----------------|
| Immediate reaction | 3-5 | 2-10 days | "The next morning..." |
| Short-term escalation | 15-20 | 6-40 days | "A few weeks later..." |
| Medium-term development | 30-40 | 12-80 days | "Over the next couple months..." |
| Long-term resolution | 50-70 | 20-140 days | "After months of..." |
| Slow burn | 80-120 | 32-240 days | "Nearly a year later..." |

### 7.5 Boredom Counter

If 3+ consecutive minor/neutral events, temporarily double likelihood of all non-minor events on the next draw. Resets when a moderate or major event fires.

## 8. Likelihood Calibration

### 8.1 Tier System

| Tier | Likelihood range | Role | Examples |
|------|-----------------|------|----------|
| Filler | 4-6 | Dominates quiet periods | "Markets drift sideways", Barron tweets |
| Common | 2-3 | Regular bread-and-butter | Earnings in-line, jobs report, analyst note |
| Standard | 1-1.5 | Normal frequency | Fed minutes, contract renewal, tariff talk |
| Uncommon | 0.5-0.8 | Needs some luck | Oil shock, ethics revolt, major tariffs |
| Rare | 0.2-0.4 | May not appear | Flash crash, DOJ suit, indictment |
| Epic | 0.05-0.15 | Once-a-generation | Hartley fired, hostile takeover, full meltdown |

### 8.2 Anti-Double-Gating Rule

Events with restrictive `when` guards (requiring 3+ flags) should have likelihood >= 1.0 so they actually fire once unlocked. Rarity comes from conditions OR likelihood, not both.

### 8.3 Dynamic Likelihood Examples

```js
// Flash crash: base 0.2, scales with volatility and Fed weakness
likelihood: (sim, world, cg) => {
    let base = 0.2;
    if (sim.theta > 0.15) base += 0.2;
    if (sim.theta > 0.20) base += 0.3;
    if (world.fed.credibilityScore < 4) base += 0.15;
    return base;
},

// PNTH earnings beat: less likely during scandal
likelihood: (sim, world, cg) => {
    let base = 1.5;
    if (world.pnth.commercialMomentum < 0) base -= 0.5;
    if (world.investigations.okaforProbeStage >= 2) base -= 0.3;
    return Math.max(0.3, base);
},

// Trade deal: more likely when Barron needs a win
likelihood: (sim, world, cg) => {
    let base = 0.5;
    if (world.election.barronApproval < 40) base += 0.4;
    if (sim.day > 750) base += 0.3;
    return base;
},
```

## 9. Narrative Arcs

### 9.1 Arc 1: The Gottlieb-Dirks War (PNTH Core Arc)

Spine of the game. Runs throughout with ~6 possible resolutions.

**Inciting incidents** (early game, days 30-90):
- Gottlieb ethics keynote → Dirks CNBC rebuttal → board tension
- Kassis caught in the middle → sides with Gottlieb / sides with Dirks / quits

**Escalation** depends on `boardDirks` count:
- `boardDirks >= 8`: Dirks can strip Gottlieb of oversight, potentially fire him
- `boardDirks <= 6`: Gottlieb can block military expansion
- `7-3` (default): compromise possible but unstable

**Resolutions** (mutually exclusive, one per playthrough):
1. **Gottlieb wins** — flips board via proxy fight/activist/scandal. PNTH pivots commercial. `mu` positive long-term.
2. **Dirks wins** — fires Gottlieb. PNTH goes full defense. Volatile but upward on defense spending.
3. **Gottlieb resigns, starts Covenant AI** — PNTH loses talent, rival threat. Sustained hit + high vol.
4. **Hostile takeover** — activist/tech giant acquires during chaos. Massive one-time event.
5. **Compromise holds** — both stay, periodic flare-ups. Most stable for stock.
6. **Both ousted** — scandal takes down both factions. New leadership, max uncertainty.

### 9.2 Arc 2: The Bowman Investigation

Slow-burn corruption. Accelerated by journalism and Senate probes.

**Progression:**
1. Tan initial report (Bowman held PNTH stock while lobbying) → `tanBowmanStory = 1`
2. Bowman denial + Barron defense
3. Tan followup (blind trust wasn't blind, traded options before announcements) → `tanBowmanStory = 2`
4. Branch: DOJ referral (if no trifecta) OR Tan bombshell (recorded Bowman-Dirks call) → `tanBowmanStory = 3`
5. Resolution: Bowman resigns / Bowman indicted / impeachment inquiry (if House flipped)

**Interaction with Arc 1:** Tan's bombshell implicates Dirks → board loyalty wavers → `boardDirks -1 to -2`.

### 9.3 Arc 3: Trade War Escalation Ladder

Multi-stage: peace → tariffs → retaliation → decoupling → deal (or permanent cold war).

**Stages gated by `tradeWarStage`:**
- 0→1: Barron announces tariffs
- 1→2: Trading partner retaliates
- 2→3: Barron doubles down (Zhaowei ban, chip controls, rare earth crisis)
- 3→4: Framework deal (more likely late game / low approval)
- OR: stays at 3 (permanent decoupling — good for PNTH if military contract active)

**`chinaRelations` tracking:** Trade war events move `chinaRelations` alongside `tradeWarStage`: tariffs → -1, retaliation → -1, Zhaowei ban → -2 (to -3 cap), trade deal → +2. Ceasefire/detente events can also push it positive. Used by neutral events for color and by compound events as a gate (e.g., Beijing propaganda requires `chinaRelations <= -2`).

**PNTH intersection:** At stage 3, if `militaryContractActive`, PNTH benefits from decoupling as domestic AI champion.

### 9.4 Arc 4: The Middle East Quagmire

Military escalation with PNTH targeting AI directly involved.

**Stages gated by `mideastEscalation`:**
- 0→1: Precision strikes using PNTH AI
- 1→2: Ground deployment (15,000 troops)
- 2→3: Quagmire (casualties, costs)
- Resolution: withdrawal (if `barronApproval < 35` or House lost) or ceasefire

**PNTH intersection:** Civilian casualty controversy, Gottlieb condemns strikes, ICC investigation threat, war crimes allegations from leaked PNTH memos.

### 9.5 Arc 5: Fed Independence Crisis

Barron-Hartley feud as multi-step drama.

**Progression:**
1. Barron public pressure (periodic, erodes `credibilityScore`)
2. Hartley defiance (builds credibility back partially)
3. Barron threatens to fire Hartley (requires approval > 40)
4. Branch: Actually fires Hartley (requires `trifecta` AND `credibilityScore <= 4`)
5. If fired: Vane nominated → confirmed (if Senate) or rejected. SCOTUS case possible.
6. If Vane installed: short-term rate cuts, long-term inflation return + dollar crisis

**Market impact:** Firing Hartley is the single most destabilizing event. `theta: +0.05, sigmaR: +0.02, lambda: +3.0`.

### 9.6 Arc 6: The Midterms

Fixed-day event at ~day 504. Outcome computed from `barronApproval`, `recessionDeclared`, active wars.

**Scoring:**
```
score = barronApproval
if recession: score -= 15
if at war (mideast >= 2 or southAmerica >= 2): score -= 8
noise: ± 10 (uniform random)
```

**Outcomes:**
- `score > 55` → `fed_gain`: Federalists expand. Barron empowered.
- `score 42-55` → `fed_hold`: Status quo. Mild relief.
- `score 28-42` → `fed_loss_house`: Farmer-Labor takes House. Impeachment unlocked.
- `score < 28` → `fed_loss_both`: Historic wipeout. Full opposition control.

**Post-midterm effects:** Reshape `congress` numbers. Unlock/block entire event categories (impeachment, legislative reversal, contract cancellation).

### 9.7 Arc 7: Senator Okafor's Rise

Political character whose arc intersects PNTH and election.

**Progression:**
1. Okafor grills Dirks in hearing → viral moment
2. Popularity surge → presidential bid buzz
3. Branch: Enters race (if election year approaching) OR scandal (opposition research on husband's Zhaowei stock)
4. If running: adds election uncertainty premium to markets

### 9.8 Arc 8: South America Operations

Parallel military arc with PNTH AI involvement.

**Stages gated by `southAmericaOps`:**
- 0→1: Covert CIA-PNTH operation exposed
- 1→2: Barron sends "military advisors"
- 2→3: Government collapses, transitional council
- Resolution: insurgency (ongoing cost) or withdrawal

**PNTH intersection:** Leaked memo about civilian targeting errors can break the Gottlieb-Dirks stalemate.

### 9.9 Compound Events

Require multiple flags from different arcs. Rare but devastating.

| Compound | Flags required | Effect |
|----------|---------------|--------|
| War + Recession | `mideastEscalation >= 2 AND recessionDeclared` | Military spending fails, stimulus needed |
| PNTH scandal + Trade war | `tanBowmanStory >= 2 AND tradeWarStage >= 3` | Beijing propaganda amplifies corruption |
| Fed crisis + Oil shock | `hartleyFired AND oilCrisis` | Stagflation, freefall |
| Full meltdown | `credibilityScore < 3 AND recessionDeclared AND theta > 0.15` | "Worst week since 2008" |

These have likelihood >= 1.0 (the rarity comes from the flag requirements).

### 9.10 Market Structure Events

Not narrative arcs but systemic shocks with dynamic likelihood:

Note: `theta` here is the Heston long-run variance parameter, not implied volatility. `theta = 0.15` corresponds to ~38.7% annualized vol (`sqrt(0.15)`). The Crisis preset has `theta = 0.25` (~50% vol), so these thresholds are reachable during escalation.

- **Flash crash**: more likely when `theta > 0.15` (~39% vol), `credibilityScore < 5`
- **Liquidity crisis**: more likely when `qeActive === false`, `credibilityScore < 5`
- **Short squeeze**: more likely when `borrowSpread` high, `theta` elevated
- **Low vol grind**: only when `theta < 0.06` (~24% vol), `lambda < 1.5`

Can trigger followups: SEC investigation, circuit breaker reform, etc.

### 9.11 Neutral/Flavor Events (~25)

High-likelihood, low-impact events that reference world state for color:

- Barron golfing (only when `mideastEscalation < 2`)
- Gottlieb TED talk (only when `ceoIsGottlieb`)
- Clay book tour (`barronApproval -1`)
- Kassis hackathon demo (only when `ctoIsMira`)
- Hartley Jackson Hole speech (only when `!hartleyFired`)
- Zhaowei conference (contextual with `chinaRelations`)
- Congressional recess, meme stock day, options expiry, bond auction, retail sales, mixed data, etc.

## 10. Parameter Design

### 10.1 Profiles by Event Type

**Fed events** primarily move `b`, `sigmaR`, `mu`:

| Scenario | mu | theta | b | sigmaR | lambda |
|----------|-----|-------|------|--------|--------|
| Dovish hold | +0.01 | -0.003 | — | — | — |
| Hawkish hold | -0.01 | +0.003 | — | — | — |
| 25bps hike | -0.02 | +0.008 | +0.0075 | +0.001 | +0.2 |
| 50bps emergency cut | +0.04 | +0.015 | -0.015 | +0.005 | +1.0 |
| Hartley fired | -0.04 | +0.05 | — | +0.02 | +3.0 |
| Vane cuts recklessly | +0.03 | +0.02 | -0.02 | +0.01 | +0.5 |
| QE announced | +0.05 | -0.015 | -0.01 | -0.003 | -0.5 |

**PNTH events** primarily move `mu`, `theta`, `lambda`:

| Scenario | mu | theta | lambda | muJ |
|----------|-----|-------|--------|------|
| Earnings beat | +0.04 | -0.01 | -0.3 | — |
| Earnings miss | -0.04 | +0.015 | +0.6 | -0.02 |
| Defense contract won | +0.06 | -0.01 | -0.4 | — |
| Contract cancelled | -0.05 | +0.02 | +0.8 | -0.03 |
| Gottlieb resigns | -0.06 | +0.03 | +1.5 | -0.04 |
| Hostile takeover bid | +0.08 | +0.04 | +2.0 | — |
| Whistleblower bombshell | -0.07 | +0.03 | +1.5 | -0.04 |

**Geopolitical events** move everything:

| Scenario | mu | theta | lambda | muJ | b | sigmaR |
|----------|-----|-------|--------|------|------|--------|
| Tariffs announced | -0.05 | +0.02 | +1.0 | -0.02 | — | — |
| Rare earth ban | -0.08 | +0.04 | +2.0 | -0.05 | — | +0.008 |
| Trade deal | +0.05 | -0.02 | -0.8 | +0.01 | — | — |
| War escalation | -0.04 | +0.025 | +1.2 | -0.03 | — | +0.005 |
| Oil crisis | -0.05 | +0.03 | +1.5 | -0.03 | +0.01 | +0.008 |
| Recession declared | -0.06 | +0.03 | +1.5 | -0.04 | -0.01 | — |

**Market structure events** slam `theta`, `lambda`, `xi`, `muJ`:

| Scenario | mu | theta | lambda | muJ | xi | rho |
|----------|-----|-------|--------|------|-----|------|
| Flash crash | -0.04 | +0.04 | +3.0 | -0.06 | +0.15 | -0.08 |
| Short squeeze | +0.05 | +0.03 | +2.0 | — | +0.12 | — |
| Repo crisis | -0.05 | +0.035 | +2.0 | -0.04 | — | — |
| VIX collapse | — | -0.015 | -0.8 | — | -0.08 | — |

### 10.2 Balance Targets

- **Expected mu delta per year ≈ 0**: Every bullish event has a bearish counterpart. Neutral events carry tiny positive mu (+0.003 to +0.005) to offset negativity bias.
- **Expected theta delta per year ≈ 0**: Crises spike theta, resolutions reduce it. Neutrals carry tiny negative theta.
- **Escalation ladders have caps**: `tradeWarStage` caps at 4, `mideastEscalation` at 3, etc. At cap, only resolution events are eligible.
- **`barronApproval` creates mean-reversion**: Bad events → low approval → midterm loss → opposition blocks further bad policy → recovery. Additionally, periodic neutral events nudge approval toward 45 (slight regression to mean) to prevent extreme early drift from locking in midterm outcomes.
- **Balance verification**: During implementation, compute `sum(likelihood_i * mu_i) / sum(likelihood_i)` across the ungated pool for both mu and theta. Target: absolute value < 0.005 for both. This is a spot-check, not a runtime mechanic.

### 10.3 `borrowSpread` and `q`

Only move on specific triggers:
- `borrowSpread`: financial crises (repo seizure, margin cascade), Fed events
- `q`: PNTH corporate actions (dividend cut during crisis, raise during prosperity). Rare, deliberate.

## 11. Event Pool Organization

```js
const FED_EVENTS = [ ... ];            // ~20
const MACRO_EVENTS = [ ... ];          // ~25
const PNTH_EVENTS = [ ... ];          // ~50 (deepest arcs)
const SECTOR_EVENTS = [ ... ];        // ~15
const MARKET_EVENTS = [ ... ];        // ~12
const NEUTRAL_EVENTS = [ ... ];       // ~25
const POLITICAL_EVENTS = [ ... ];     // ~20 (Barron, Okafor, elections)
const INVESTIGATION_EVENTS = [ ... ]; // ~15 (Tan, Bowman, probes)
const COMPOUND_EVENTS = [ ... ];      // ~10 (multi-flag rare)
const MIDTERM_EVENTS = [ ... ];       // ~8 (campaign + outcomes + followups)

export const OFFLINE_EVENTS = [
    ...FED_EVENTS, ...MACRO_EVENTS, ...PNTH_EVENTS,
    ...SECTOR_EVENTS, ...MARKET_EVENTS, ...NEUTRAL_EVENTS,
    ...POLITICAL_EVENTS, ...INVESTIGATION_EVENTS,
    ...COMPOUND_EVENTS, ...MIDTERM_EVENTS,
];
```

**Pulse vs Random pool separation:** Events with `category: 'fed'` are drawn only by the FOMC recurring pulse. Events with `category: 'pnth_earnings'` (a subset of PNTH events — earnings beat/miss) are drawn only by the earnings recurring pulse. Events with `category: 'midterm'` are only used for followup ID lookup from the midterm fixed pulse. All other categories are eligible for the random Poisson draw.

The engine pre-filters pools at startup:
- `_fedPool`: events with `category === 'fed'`
- `_earningsPool`: events with `category === 'pnth_earnings'`
- `_randomPool`: all events where category is NOT `'fed'`, `'pnth_earnings'`, or `'midterm'`

All events remain in `OFFLINE_EVENTS` for `getEventById` lookups (followup chains can reference any event by ID regardless of scheduling).

**File splitting:** With ~200 events, the event definitions alone will be 1500+ lines. Split into two files: `src/event-pool.js` (all event arrays + `OFFLINE_EVENTS` export) and `src/events.js` (EventEngine class, imports from event-pool.js and world-state.js). This keeps the engine logic readable and the event definitions editable independently.

## 12. Midterm Election Mechanic

Campaign season and midterm election are **fixed pulses** in the unified pulse system (see section 6.2). They fire at their configured days via the pulse check loop in `maybeFire()`, not via Poisson.

**Campaign season** — Fixed pulse at `CAMPAIGN_START_DAY`. Handler `_onCampaignSeason` fires a hard-coded campaign event. Returns a single log entry.

**Election** — Fixed pulse at `MIDTERM_DAY`. Handler `_onMidterm` computes outcome score, selects result, mutates congress, sets `midtermComplete = true`. Returns a single log entry. The four outcome events are built inline in the handler.

**Post-midterm followups** — Each outcome event has followups that ARE added to `_pendingFollowups` and fire via the normal followup mechanic. These post-midterm followups live in the `MIDTERM_EVENTS` pool array (for ID-based lookup) but are never drawn randomly.

Outcome computed:
```
score = barronApproval - (recessionDeclared ? 15 : 0) - (atWar ? 8 : 0) + uniform(-10, +10)
```

| Score | Result | Congress change | Unlocks |
|-------|--------|----------------|---------|
| > 55 | `fed_gain` | Federalist +seats | Aggressive Barron arcs |
| 42-55 | `fed_hold` | ~unchanged | Status quo |
| 28-42 | `fed_loss_house` | FL takes House | Impeachment, investigations |
| < 28 | `fed_loss_both` | FL takes both | Everything |

Effects mutate `congress` seat counts and derived `trifecta`/`fedControlsHouse` etc.

## 13. Config Changes

Add to `src/config.js`:
```js
export const MIDTERM_DAY = 504;
export const CAMPAIGN_START_DAY = 440;
export const NON_FED_POISSON_RATE = 1 / 30;
export const NON_FED_COOLDOWN_MIN = 8;
export const NON_FED_COOLDOWN_MAX = 15;
export const FED_MEETING_JITTER = 4;
export const BOREDOM_THRESHOLD = 3;
```

## 14. LLM Integration Update

### 14.1 System Prompt

Rewrite to include full updated cast, world state descriptions, and `effects` guidance. The LLM should understand the world state so it generates contextually appropriate events with sensible `effects` mutations.

### 14.2 User Message

Add serialized world state snapshot alongside sim parameters:
```
World state:
- Congress: Senate 52F/46FL, House 221F/214FL (trifecta: true)
- PNTH board: 7 Dirks / 3 Gottlieb, CEO: Gottlieb, CTO: Kassis
- Military contract: false
- Trade war stage: 2 (retaliation)
- Mideast: 1 (strikes)
- ...etc
```

### 14.3 Tool Schema & LLM Effects

LLM events **cannot return JavaScript functions**, so world state mutations use a structured DSL. The `emit_events` tool schema gains an optional `effects` array on each event:

```js
effects: {
    type: 'array',
    description: 'World state mutations. Each entry is a path + operation.',
    items: {
        type: 'object',
        properties: {
            path:  { type: 'string', description: 'Dot-notation path, e.g. "pnth.boardDirks"' },
            op:    { type: 'string', enum: ['set', 'add'] },
            value: { type: 'number' },
        },
        required: ['path', 'op', 'value'],
    },
}
```

The engine validates LLM effects before applying:
1. `path` must match a known key in the world state schema (whitelist check)
2. `op: 'add'` adds `value` to the current field; `op: 'set'` replaces it
3. Numeric fields are clamped to their valid ranges (e.g., `boardDirks` 0-10, `barronApproval` 0-100)
4. Boolean fields accept `set` with 0 (false) or 1 (true)
5. Invalid paths or ops are silently dropped (LLM is best-effort)

Offline events continue to use `effects: (world) => void` functions directly. The engine checks `typeof event.effects === 'function'` vs `Array.isArray(event.effects)` to dispatch.

## 15. Epilogue System

### 15.1 Overview

When the simulation reaches the end of the presidential term (~day 1008 for a 4-year term, configurable via `TERM_END_DAY` in config.js), the event engine fires a special epilogue sequence. The simulation pauses automatically (like a margin call) and displays a multi-page popup overlay. This is the narrative conclusion of the playthrough.

The epilogue uses the existing `.sim-overlay` / `.sim-overlay-panel` pattern (same as margin call overlay) but larger — full `.sim-overlay-body` with scrollable content. Each page has a title, rich narrative text, and navigation buttons.

### 15.2 Epilogue Pages

Four pages, displayed sequentially. Player clicks "Next" to advance, "Back" to revisit. Final page has "Restart" and "Keep Playing" buttons.

**Page 1: "The Election"**

Covers the presidential election that concludes the term. Content determined by world state:

- Who won? Computed from `barronApproval`, `midtermResult`, accumulated state. Possible outcomes:
  - **Barron re-elected**: If approval > 45 at term end, no impeachment, economy not in recession. Text covers his victory speech, second-term agenda, opposition's reaction.
  - **Barron loses to Okafor**: If `okaforRunning` and approval < 42. Text covers Okafor's historic win, her inauguration promises re: PNTH and AI regulation, Barron's bitter concession (or refusal to concede).
  - **Barron loses to generic Farmer-Labor candidate**: If approval < 42 but `!okaforRunning`. Less dramatic, more "change election."
  - **Barron removed/resigned**: If `impeachmentStage >= 3` reached. VP (or successor) ran instead. Text covers the unprecedented removal and its aftermath.
  - **Barron wins narrowly amid controversy**: If approval 42-45 range. Contested, recounts, legal challenges. Uncertainty premium.

Note: if `okaforRunning` is true, she is the opponent regardless of score range. The score determines whether Barron wins or loses against her specifically:
  - Score > 50: Barron defeats Okafor comfortably. "Okafor's campaign failed to overcome the incumbent advantage..."
  - Score 45-50: Barron narrowly defeats Okafor. "The closest election in a generation; Okafor conceded at 3AM..."
  - Score 38-45: Okafor defeats Barron. "Senator Okafor made history, the first woman and first Black woman to..."
  - Score < 38: Okafor wins decisively. "It wasn't even close by midnight..."
If `!okaforRunning`, the opponent is a generic Farmer-Labor candidate with less dramatic narrative.

Text references specific events that shaped the outcome — the midterms, the wars, the scandals, the economy. 3-5 paragraphs, written in a retrospective journalistic style ("Looking back, the turning point was...").

**Page 2: "The Fate of Palanthropic"**

Covers PNTH's corporate resolution. Content branches heavily on world state:

Branches are checked in priority order (first match wins):

1. **Post-acquisition PNTH** (if `world.pnth.acquired`): Acquired by tech giant or broken up. "The name Palanthropic still appears on the building, but..." Highest priority — acquisition overrides all internal dynamics.
2. **Scandal-ravaged PNTH** (if `dojSuitFiled && whistleblowerFiled && senateProbeLaunched`): Under consent decree, leadership replaced. "What was once the most promising AI company in America was now a cautionary tale..."
3. **Covenant AI rivalry** (if `!ceoIsGottlieb` and Gottlieb-starts-rival event fired): Two-company landscape. PNTH weakened, Covenant growing. "The AI industry had split along ethical lines..."
4. **Gottlieb's PNTH** (`ceoIsGottlieb && boardGottlieb >= 6`): Commercial pivot succeeded. Atlas AI dominates enterprise. "Gottlieb proved the skeptics wrong..."
5. **Dirks's PNTH** (`!ceoIsGottlieb && boardDirks >= 7`): Full defense contractor. Government revenue dominates. "Dirks had won, but the company Gottlieb built was unrecognizable..."
6. **Compromise PNTH** (fallback — none of the above matched): Both still there, uneasy peace. "The Gottlieb-Dirks détente held, but insiders said it was only a matter of time..."

Each branch also weaves in: Kassis's fate (based on `ctoIsMira`), board composition, key contract wins/losses, Bowman connection fallout. 3-5 paragraphs.

**Page 3: "The World"**

Covers geopolitical and economic state. Synthesizes multiple world flags:

- **Trade/China**: Based on `tradeWarStage` and `chinaRelations`. Decoupled tech blocs? Framework deal? Cold peace? "The Zhaowei ban had reshaped global supply chains permanently..." or "The framework deal was Barron's crowning achievement, even his critics admitted..."
- **Middle East**: Based on `mideastEscalation`. Withdrawal? Ceasefire? Ongoing quagmire? "The Department of War — as Barron insisted on calling it — had its first true test..."
- **South America**: Based on `southAmericaOps`. Regime change? Insurgency? Quiet withdrawal?
- **The Fed**: Based on `hartleyFired`, `vaneAppointed`, `credibilityScore`. "Hartley served her full term, her independence intact..." or "The Vane Fed had delivered the rate cuts Barron wanted, but the dollar never recovered..."
- **The Economy**: Based on `recessionDeclared`, current `b` (rates), `theta` (vol). Recession? Recovery? Boom? "Four years of whiplash had left the economy..."

2-4 paragraphs covering the most dramatic threads. Each subsection has an explicit skip condition:
- **Trade/China**: skip if `tradeWarStage === 0` (tariffs never imposed)
- **Middle East**: skip if `mideastEscalation === 0` (no military action)
- **South America**: skip if `southAmericaOps === 0` (no operations)
- **The Fed**: always included (Fed always acts; content varies by `hartleyFired`/`vaneAppointed`/`credibilityScore`)
- **The Economy**: always included (economy always has a state to describe)

**Page 4: "Your Legacy"**

A scorecard page with a different visual style — stat-rows and data rather than narrative prose. Contains:

- **Portfolio Performance**: Final portfolio value, total P&L (dollar and percentage), peak portfolio value, max drawdown
- **Trading Activity**: Total trades executed, options exercised, positions liquidated by margin call, margin calls survived
- **Market Summary**: Starting vs ending stock price, highest/lowest price seen, starting vs ending rate, peak volatility (theta)
- **Timeline Highlights**: The 3-5 most impactful events from `eventLog`, listed chronologically with day numbers. Selection heuristic: filter to `magnitude === 'major'` entries first; if fewer than 3, include `'moderate'` entries sorted by absolute sum of their parameter deltas (larger total delta = more impactful). The `magnitude` field is already present on all event log entries (set in `_fireEvent` from the event definition).
- **Rating**: A tongue-in-cheek title based on performance:
  - P&L > 200%: "Master of the Universe"
  - P&L > 100%: "Wolf of Wall Street"
  - P&L > 50%: "Seasoned Trader"
  - P&L > 0%: "Survived"
  - P&L > -50%: "Learning Experience"
  - P&L > -90%: "Blown Up"
  - P&L <= -90%: "Lehman'd"

Buttons at the bottom:
- **"Restart"**: Calls `resetSim()`. Clears everything, fresh playthrough.
- **"Keep Playing"**: Dismisses overlay, resumes simulation. Event pool is exhausted (no more narrative events fire) but the market model continues. Player can keep trading in a post-narrative sandbox. A small toast confirms: "Event storyline complete. Market simulation continues."

### 15.3 Epilogue Trigger

The epilogue does **not** go through the pulse system or `maybeFire()`. Instead, `main.js` checks a separate method before calling `maybeFire`:

```js
// In _onDayComplete() in main.js, before calling eventEngine.maybeFire():
if (eventEngine.isEpilogueReady(sim.day)) {
    playing = false;
    eventEngine.computeElectionOutcome(sim);  // stores in world.election.presidentialResult
    showEpilogue(eventEngine.world, sim, portfolio, eventEngine.eventLog);
    return;  // skip maybeFire entirely
}
```

`EventEngine.isEpilogueReady(day)` is a pure check: `day >= TERM_END_DAY && !this._epilogueFired`. `EventEngine.computeElectionOutcome(sim)` runs the scoring formula from section 16 and stores the result.

After the epilogue fires, `maybeFire()` checks `this._epilogueFired` at the top and returns `[]` immediately. The `maybeFire` return type remains `Array<LogEntry>` — no sentinel values, no contract change.

The "Keep Playing" button sets `this._epilogueFired = true` (already set) and resumes. The market model continues but no events fire.

### 15.4 Epilogue Content Generation

The epilogue text is generated by a pure function `generateEpilogue(world, sim, portfolio, eventLog)` in a new file `src/epilogue.js`. Returns an array of 4 page objects:

```js
[
    { title: 'The Election', body: 'html string...' },
    { title: 'The Fate of Palanthropic', body: 'html string...' },
    { title: 'The World', body: 'html string...' },
    { title: 'Your Legacy', body: 'html string...' },
]
```

Each page's body is built from conditional blocks keyed on world state flags. The function reads world state, sim parameters, portfolio stats, and event log to compose the narrative. No LLM involved — all offline, deterministic from state.

Page 4 reads from portfolio: `portfolio.cash`, `portfolio.positions`, `portfolio.closedBorrowCost`, `portfolio.marginDebitCost`, `portfolio.totalDividends`, and the event log for timeline highlights.

### 15.5 Epilogue UI

Uses the existing overlay pattern but with additions:

- `.epilogue-overlay` extends `.sim-overlay` with a wider panel (max-width ~600px vs the default)
- `.epilogue-title` — page title, uses `--font-display` (Noto Serif)
- `.epilogue-body` — narrative text, uses `--font-body`, line-height 1.6, scrollable
- `.epilogue-nav` — bottom button row with Back/Next/Restart/Keep Playing
- `.epilogue-dots` — page indicator dots (4 dots, active dot highlighted)
- Page 4 uses `.stat-row` / `.stat-value` patterns from shared-base.css for the scorecard
- Page transitions: fade applies only to `.epilogue-body` content (title and nav stay stable). Opacity transition 200ms. Scroll position resets to top on page change. Panel height is not animated — uses natural height of each page, with `min-height` to prevent jarring shrink.

Responsive: at <= 600px, overlay goes fullscreen (same as `.sim-overlay` default behavior).

### 15.6 Config

```js
export const TERM_END_DAY = 1008;  // 4 years of trading days (252 * 4)
```

### 15.7 Portfolio Stats Tracking

Some scorecard stats require tracking that doesn't currently exist. Add to portfolio.js:

- `portfolio.totalTrades` — incremented on every `executeMarketOrder` call (already countable, just not tracked)
- `portfolio.totalExercises` — incremented on every `exerciseOption` call
- `portfolio.marginCallCount` — incremented when margin call triggers
- `portfolio.peakValue` — updated each substep: `Math.max(peakValue, currentEquity)`
- `portfolio.maxDrawdown` — updated each substep: `Math.max(maxDrawdown, 1 - currentEquity / peakValue)`

`peakValue` and `maxDrawdown` piggyback on the equity value already computed in `_onSubstep()` for the portfolio display (the same value used by `checkMargin`). No separate valuation pass needed — just capture the equity number that's already being calculated and run two comparisons.

These are lightweight additions — one comparison per substep, reset on `resetPortfolio()`.

## 16. Election Outcome Computation

The presidential election outcome at `TERM_END_DAY` is determined by a scoring function similar to the midterm but with more variables. Note: `barronApproval` starts at 50 (defined in `createWorldState()`, section 4.1) and drifts throughout the game via event `effects`. By term end, it has typically drifted 10-25 points from baseline depending on what happened.

```
score = barronApproval
if recessionDeclared: score -= 12
if mideastEscalation >= 2: score -= 8
if southAmericaOps >= 2: score -= 5
if impeachmentStage >= 2: score -= 18
if hartleyFired: score -= 6
if tradeWarStage == 4 (deal): score += 6
if oilCrisis: score -= 5
noise: ± 5 (uniform random)
```

Noise is kept small (±5) so that accumulated world state events meaningfully determine the outcome. Individual penalties are large enough to survive the noise — a war alone (-8) shifts the result by roughly one tier.

| Score | Outcome |
|-------|---------|
| > 50 | Barron re-elected comfortably |
| 45-50 | Barron wins narrowly, contested |
| 38-45 | Barron loses to Okafor (if `okaforRunning`) or generic FL candidate |
| < 38 | Barron loses decisively |

If `impeachmentStage >= 3` (removal), Barron is already gone — the election is between VP successor and FL candidate, with different narrative text.

The outcome is stored in `world.election.presidentialResult` and consumed by `generateEpilogue()`.

## 17. File Change Summary

| File | Change type | Description |
|------|------------|-------------|
| `src/world-state.js` | **NEW** | World state factory + congress helpers |
| `src/event-pool.js` | **NEW** | ~200 event definitions organized by category |
| `src/epilogue.js` | **NEW** | `generateEpilogue(world, sim, portfolio, eventLog)` — builds 4-page epilogue from state |
| `src/events.js` | **REWRITE** | EventEngine class with world state, midterm mechanic, epilogue trigger, dynamic likelihood, timing improvements. Imports event pool from `event-pool.js` |
| `src/llm.js` | **UPDATE** | System prompt rewrite, world state in messages, structured effects DSL in tool schema |
| `src/config.js` | **UPDATE** | Add midterm/timing/cooldown/term-end constants |
| `src/portfolio.js` | **UPDATE** | Add tracking fields: `totalTrades`, `totalExercises`, `marginCallCount`, `peakValue`, `maxDrawdown` |
| `main.js` | **UPDATE** | Wire world state, epilogue overlay, reset on preset change |
| `index.html` | **UPDATE** | Add epilogue overlay markup |
| `styles.css` | **UPDATE** | Add epilogue overlay styles (`.epilogue-*`) |

### What stays the same

- `applyDeltas` core logic (additive, clamped to `PARAM_RANGES`)
- MTTH followup chain mechanics (same data structures, better timing)
- Fed meeting schedule concept (`FED_MEETING_INTERVAL = 32`, now with jitter)
- Poisson concept for non-fed events (tuned rate + cooldown)
- `MAX_FOLLOWUP_DEPTH = 5`
- LLM batch-fetch + offline fallback pattern
- `_checkFollowups` grouping by `chainId` for mutual exclusion

## 18. Event Count Target

~180-220 total events in the pool. With ~6 non-Fed draws/year over 4 years, plus ~32 FOMC meetings, plus followup chains, a playthrough sees ~60-80 events before the epilogue fires. Each run samples a different slice of the pool based on which arcs trigger and which branches fire. The epilogue synthesizes whatever state accumulated into a coherent conclusion.
