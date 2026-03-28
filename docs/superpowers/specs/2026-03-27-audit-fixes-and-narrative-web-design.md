# Audit Fixes & Narrative Web Design

**Date:** 2026-03-27
**Branch:** feat/narrative-depth
**Scope:** Mechanical bug fixes, lore corrections, and cross-domain event interconnection overhaul

## Goals

1. Fix all mechanical bugs and lore inconsistencies found in the comprehensive audit
2. Transform the event system from mostly-isolated domain threads into a deeply interconnected narrative web
3. Minimize new event count — achieve interconnection by rewiring existing events with `when` guards, `effects`, followup links, and conditional context
4. Wire up unused `playerChoices` flags so player decisions have downstream narrative consequences

## Lore Rule

**Geography and institutions are real-world. Polities and people are fictional.**

- Real: Strait of Hormuz, Nanjing, Philadelphia, Little St. James, White House, West Wing, Federal Reserve, Wall Street, America (continent)
- Fictional: Federal States of Columbia, Serica, Farsistan, Khasuria, Meridia (demonym: Meridine), Boliviara, John Barron, Hayden Hartley, PNTH, Meridian Capital, etc.

## Phase 1: Foundation

### 1.1 Lore Text Fixes

| Current Text | Replacement | Files |
|---|---|---|
| "Beijing" | "Nanjing" | congress.js:261, market.js:110, firm.js:107 |
| "Mar-a-Lago" | "Little St. James" | firm.js:21, congress.js:1287 |
| "D.C." | "Philadelphia" | congress.js:226 |
| "Korindian" | "Meridine" | pnth.js:673 |
| "Strait of Farsis" | "Strait of Hormuz" | macro.js (5), endings.js (3), regulations.js (1) |
| "America will no longer be ripped off" | "Columbia will no longer be ripped off" | macro.js:14 |

Also update: CLAUDE.md (1 Strait of Farsis reference), lore.md (2 Strait of Farsis references + add geography rule, capitals, demonyms).

### 1.2 Engine Hardening

**`applyDeltas()` dev warning** (`src/events.js:175-183`):
Add `console.warn` when a param key has no matching entry in `PARAM_RANGES`. Only fires in development — helps catch typos in event definitions silently dropped today.

**One-shot guard in followup path** (`src/events.js:418-422`):
Before firing a followup event in `_checkFollowups()`, check `this._firedOneShot.has(event.id)`. If the event is a one-shot that already fired, skip it. Prevents the architectural gap where a one-shot event referenced as a followup could fire twice.

### 1.3 Followup Weight Normalization

`src/events/macro.js:491`: Change `weight: 2` to `weight: 0.67` and the sibling `weight: 1` to `weight: 0.33` on the Khasuria chain. Preserves the same 2:1 ratio but normalizes to [0, 1] consistent with every other followup.

### 1.4 New World-State Flags

Add to `createWorldState()` in `world-state.js`:

```js
geopolitical: {
    // ... existing fields ...
    aegisDemandSurge: false,          // set by Khasurian/Farsistan escalation
    foundryCompetitionPressure: false, // set by Serican compute buildout
    energyCrisis: false,               // set by strait closure / oil shock
},
investigations: {
    // ... existing fields ...
    meridianExposed: false,            // set when probes name the player's desk
},
media: {
    // ... existing fields ...
    lobbyingExposed: false,            // set when media discovers PAC contributions
},
```

### 1.5 Intro Text Rewrite

`index.html:100-103` — Replace current intro paragraph with:

> "You've just been poached from a rival firm to run Meridian Capital's most aggressive derivatives desk. President Barron has just taken office, volatility is spiking, and Meridian wants someone who can trade through the storm. Build positions, manage risk, navigate 4 years of market events — and try not to get fired."

### 1.6 Lore.md Additions

Add to lore.md:
- **Geography rule:** Geography and institutions mirror the real world; polities and people are fictional.
- **Serica:** Capital is Nanjing.
- **Columbia:** Capital is Philadelphia. Presidential island resort is Little St. James.
- **Meridia:** Demonym is Meridine.
- **Farsistan:** Controls the Strait of Hormuz.

## Phase 2: Wiring

The core of the overhaul. Each subsection modifies existing events — no new events unless a structural gap demands one.

### 2A. Geopolitical → PNTH

**Effects-driven gating (world-state flags set by geopolitical events, read by PNTH events):**

| Geopolitical Event | Flag Set | PNTH Events Gated |
|---|---|---|
| Khasurian incursion (crisis=3) | `aegisDemandSurge = true` | Aegis contract/expansion events gain `when` guards or likelihood boosts |
| Serican compute buildout (Zhaowei/Liang Wei events in firm.js, market.js) | `foundryCompetitionPressure = true` | Foundry events acknowledge competitive threat |
| Strait closure / oil surge | `energyCrisis = true` | PNTH data center cost headlines; Fed emergency events |

**Direct followups (tight narrative beats):**

| Trigger Event | Followup Target | Rationale |
|---|---|---|
| Khasurian incursion (`khasuria_incursion`) | Existing PNTH Aegis expansion event (pnth.js:673) | Military crisis → Aegis demand spike is an immediate narrative beat |
| Strait closure event | Existing Fed emergency communication event | Energy shock forces Hartley/Vane's hand within days |

**Conditional headline additions:**
Existing PNTH Aegis events: if `khasurianCrisis >= 2`, append brief clause acknowledging the military situation (~5-8 words).
Existing Foundry events: if `foundryCompetitionPressure`, context text references Serican competition.

### 2B. Investigation Cross-Pollination

**The "dirty player" tripwire:**

Existing investigation events at Okafor probe stage 2+ and Tan-Bowman story stage 2+ gain `effects` functions that conditionally set `investigations.meridianExposed = true`. The condition uses `world.factions.regulatoryExposure` (always available in `effects`) plus checking `playerCtx` flags. Since `effects` functions don't receive `playerCtx`, the conditional logic lives in a `when` guard that gates a followup or in the `_fireEvent` path. Concretely: these investigation events gain followups to a new minimal bridge event (followupOnly, no params, no popup) whose `when` guard checks:
- `playerCtx.pursued_insider_tip` or `playerCtx.pursued_pnth_tip`
- `playerCtx.hosted_fundraiser`
- `world.factions.regulatoryExposure > 50`

If any condition is met, the bridge event fires and its `effects` set `meridianExposed = true` + `shiftFaction('regulatoryExposure', 10)`. This is the one place where a new (minimal) event is structurally required.

Clean players are not affected. Dirty players get caught in the investigative dragnet.

**When `meridianExposed` is true:**
- Existing firm/desk compliance events gain `when` guards boosting their likelihood
- `shiftFaction('regulatoryExposure', 10)` applied when the flag flips — a one-time exposure spike
- Existing investigation popup context text acknowledges the player's desk being named

**Media amplification:**
- Tan-Bowman followups: if `media.leakCount` is high, use shorter `mtth` values (story breaks faster)
- Okafor probe events: if `tanBowmanStory >= 2`, likelihood boost via `when` guard (published stories embolden the probe)
- Investigation → media: if `okaforProbeStage >= 2`, media events referencing Okafor gain likelihood boost

### 2C. Fed ↔ Geopolitical

**Energy shock → Fed response:**
- Existing Fed emergency/communication events gain `when` guards checking `energyCrisis` or `straitClosed`
- Strait closure event gains a direct followup to an existing Fed event (immediate rate communication)

**Recession ↔ Rate policy:**
- `recessionDeclared` (already exists, underused): Fed cut events gain `when` guards — if recession declared and no cut cycle active, cut events become highly likely
- Late-cycle hike events gain `effects` nudging `barronApproval` down (rate pain → political pain)

### 2D. Election Downstream Effects

**Midterm results reshape event likelihood:**

| Midterm Result | Downstream Effect |
|---|---|
| `fl_gain` (Farmer-Labor takeover) | Okafor probe events: likelihood boost (subpoena power). Big Beautiful Bill events: `when` guard blocks advancement. Filibuster events: tone shift. |
| `fed_gain` (Federalist landslide) | Deregulation/Financial Freedom Act events: likelihood boost. Investigation events: likelihood penalty (political cover). |

All implemented as `when` guard additions to existing events. No new events.

### 2E. PNTH Product Arc Cross-References

Currently Companion scandal, Aegis controversy, and Foundry launch are parallel tracks. Wire them:

| Source Arc | Target Arc | Mechanism |
|---|---|---|
| Companion scandal (stage 2+) | Aegis controversy | `effects`: bump `aegisControversy` +1 (scrutiny spillover) |
| Aegis controversy (stage 2+) | Sentinel/commercial | `effects`: reduce `commercialMomentum` (enterprise clients nervous) |
| Foundry success | Commercial momentum | `effects`: boost `commercialMomentum` |
| Product outcomes | Board dynamics | `effects`: Aegis success → `boardDirks` +1; Companion scandal → `boardGottlieb` -1 |

Headline additions: Aegis events acknowledge Companion scandal context when active. Foundry events reference "pivoting away from military" when `aegisControversy >= 2`.

### 2F. Lobbying → Narrative Consequences

**Context-sensitive triggers on existing events:**

| Condition | Existing Events Affected | Mechanism |
|---|---|---|
| `hosted_fundraiser` AND `mediaTrust < 30` | Rachel Tan media events | Likelihood boost + context acknowledging the fundraiser |
| `lobbied_pac_federalist` AND `okaforProbeStage >= 2` | Investigation events | More likely to set `meridianExposed` |
| `lobbied_pac_farmerlabor` AND `federalistSupport > 50` | Congressional events | Context text acknowledges bipartisan positioning |
| `lobbyCount >= 3` AND `mediaTrust < 40` | Sets `media.lobbyingExposed` | Firm compliance events gain likelihood boost; investigation events can reference PAC contributions |

No new events needed — all `when` guards, `effects`, and conditional context on existing events.

### 2G. Unused playerFlags Audit

57 `playerChoices` flags are set but never read. During the wiring pass, integrate ~15-20 of the most narratively relevant into event `when` guards and ending conditions. Priority flags:

- Insider tip flags (`pursued_insider_tip`, `pursued_pnth_tip`) → investigation cross-pollination (2B)
- Lobby flags (`hosted_fundraiser`, `lobbied_pac_*`) → lobbying consequences (2F)
- Compliance flags (`cooperated_with_compliance`, `lawyered_up`, `stonewalled_sec`) → ending tone, firm event context
- Risk flags (`hedged_unlimited_risk`, `closed_suspicious_long`) → desk event likelihood, quarterly review context

Remaining unused flags are left for future use or removed if truly dead.

## Phase 3: Polish

### 3.1 Conditional Context Functions

Popup events that now participate in cross-domain narratives gain `context` functions (or have existing ones enriched) that check world state and produce richer descriptions when cross-domain conditions are active.

Principle: `context` functions do the heavy lifting for popups. Toast-only events get brief headline clause additions (5-8 words max).

### 3.2 Final Consistency Pass

- Verify all new `when` guards reference valid world-state paths
- Verify all new `effects` set valid fields
- Verify no circular dependencies were introduced (use the existing domain interaction matrix as baseline)
- Verify conditional context functions handle missing/null world state gracefully

## Out of Scope

- New event creation (except if a structural gap is found during wiring that cannot be bridged with existing events)
- `firmCooldownMult` semantic rework (documented as a known design issue but not causing bugs with current event definitions)
- World-state `factions` duplication cleanup (works correctly via manual sync, fragile but not buggy)
- Midterm election noise term rebalancing (design choice, not a bug)
