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

## 6. Revised EventEngine

### 6.1 New Fields

```js
constructor(source, llmSource = null) {
    // ...existing...
    this.world = createWorldState();
    this._nonFedCooldown = 0;
    this._consecutiveMinor = 0;
    this._midtermWarningFired = false;
}
```

### 6.2 Revised `maybeFire(sim, day)`

```
1. Check midterm (fixed day trigger) → fires campaign season or election results
2. Check pending followups (same as before, but when() now gets world)
3. Check FOMC schedule (with jitter)
4. Non-fed Poisson draw with cooldown
   - If cooldown > 0, decrement and skip
   - Roll against 1/40 rate
   - On hit, apply boredom adjustment, draw event, set cooldown 8-15 days
```

### 6.3 Revised `_fireEvent(event, sim, day, depth)`

Same as before, plus: call `event.effects(this.world)` if defined. Track `_consecutiveMinor` (reset on moderate/major, increment on minor).

### 6.4 Revised `_weightedPick(events, sim)`

Resolves dynamic `likelihood` functions before weighting. Uses `_adjustedLikelihood` from boredom system if present.

### 6.5 Revised `_filterEligible(pool, sim)`

Passes `(sim, this.world, congressHelpers(this.world))` to `when()` guards.

### 6.6 `reset()`

Also resets `this.world = createWorldState()`, `_nonFedCooldown = 0`, `_consecutiveMinor = 0`, `_midtermWarningFired = false`.

## 7. Timing Mechanics

### 7.1 Non-Fed Poisson Rate

Base rate: `1/40` (~6 events/year). After firing, cooldown of 8-15 days (uniform random) prevents clumping.

### 7.2 FOMC Schedule Jitter

Next meeting scheduled at `day + FED_MEETING_INTERVAL + floor(random() * 9) - 4`. Adds ±4 day jitter (±1 week).

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

- **Flash crash**: more likely when `theta > 0.15`, `credibilityScore < 5`
- **Liquidity crisis**: more likely when `qeActive === false`, `credibilityScore < 5`
- **Short squeeze**: more likely when `borrowSpread` high, `theta` elevated
- **Low vol grind**: only when `theta < 0.06`, `lambda < 1.5`

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
- **`barronApproval` creates mean-reversion**: Bad events → low approval → midterm loss → opposition blocks further bad policy → recovery.

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

Fed events are filtered out of the Poisson pool (drawn only on FOMC schedule). Midterm events are handled by the fixed-day mechanic, not the regular pool. All others eligible for Poisson draw.

## 12. Midterm Election Mechanic

Checked at the top of `maybeFire()`, before followups and regular draws.

**Campaign season** fires at ~day 440: theta +0.01 uncertainty premium.

**Election** fires at ~day 504. Outcome computed:
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
export const NON_FED_POISSON_RATE = 1 / 40;
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

### 14.3 Tool Schema

Add `effects` description to the tool schema so LLM can suggest world state mutations. These are validated and applied by the engine (not blindly trusted).

## 15. File Change Summary

| File | Change type | Description |
|------|------------|-------------|
| `src/world-state.js` | **NEW** | World state factory + congress helpers |
| `src/events.js` | **REWRITE** | ~200 events, revised EventEngine with world state, midterm mechanic, dynamic likelihood, timing improvements |
| `src/llm.js` | **UPDATE** | System prompt rewrite, world state in messages, effects in tool schema |
| `src/config.js` | **UPDATE** | Add midterm/timing/cooldown constants |
| `main.js` | **UPDATE** | Wire world state into event engine, reset on preset change, pass to UI for display |

### What stays the same

- `applyDeltas` core logic (additive, clamped to `PARAM_RANGES`)
- MTTH followup chain mechanics (same data structures, better timing)
- Fed meeting schedule concept (`FED_MEETING_INTERVAL = 32`, now with jitter)
- Poisson concept for non-fed events (tuned rate + cooldown)
- `MAX_FOLLOWUP_DEPTH = 5`
- LLM batch-fetch + offline fallback pattern
- `_checkFollowups` grouping by `chainId` for mutual exclusion

## 16. Event Count Target

~180-220 total events. With ~6 non-Fed draws/year over 4 years, plus ~32 FOMC meetings, plus followup chains, a playthrough sees ~60-80 events. Each run samples a different slice of the pool based on which arcs trigger and which branches fire.
