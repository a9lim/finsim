# Shoals RPG Depth Expansion — Design Spec

**Date:** 2026-03-26
**Branch:** feat/narrative-depth
**Status:** Approved

## Vision

Transform Shoals from a trading simulator with narrative events into a text-based RPG built around highly robust trading mechanics. Inspired by The New Order, Red Autumn, Suzerain, and Disco Elysium. The player is an experienced derivatives trader recently poached by Meridian Capital — trusted but not indispensable. Reputation opens doors for political agency; the world reaches back whether the player wants it or not.

**Design philosophy:** Narrative-driven politics (not spreadsheet faction management), a dedicated briefing layer for strategic decisions, the firm as a living institution entangled in your choices, and endgame consequences that carry real weight — personal, professional, and national.

---

## 1. Unified Faction Standing System

Replaces the separate `compliance.js` (heat/credibility) and `scrutiny.js` (SEC investigation) modules with a single `faction-standing.js` module. All six scores live in `world.factions`, use the same 0-100 scale, and integrate with the existing structured effects system (`{ path: 'factions.firmStanding', op: 'add', value: -5 }`).

**No compatibility layer.** All call sites in main.js, popup-events.js, convictions.js, and regulations.js are refactored to use the new faction API directly. The old `compliance.js` and `scrutiny.js` modules are deleted, not wrapped.

### The Six Factions

| Faction | Starts | Replaces | What It Measures |
|---------|--------|----------|------------------|
| `firmStanding` | 65 | compliance heat + credibility | Meridian's trust in you. High = wider limits, gentler compliance, firm backs you. Low = book restrictions, hostile reviews, fired at 0. |
| `regulatoryExposure` | 10 | scrutiny score + level | SEC attention on you. Low = invisible. High = investigation popups escalate. Threshold levels at 25/50/75/90. |
| `federalistSupport` | 30 | new | Your standing with the ruling Federalist party. Gates access to Lassiter, Haines, Tao, Barron orbit. |
| `farmerLaborSupport` | 30 | new | Your standing with the opposition. Gates access to Okafor, Whitfield, Reyes, Clay orbit. |
| `mediaTrust` | 40 | new | How much the press trusts/targets you. High = Tan gives you advance warning, you can leak effectively. Low = press writes hostile stories, you're a target. |
| `fedRelations` | 40 | new | Your standing with Fed/monetary establishment. High = Hartley intelligence, advisory access. Low = shut out of rate signals. |

### Migration from Compliance

The old compliance system has two independent variables (heat and credibility) that move in different directions. The migration collapses this into a single bidirectional axis. This is an intentional behavioral change — not a mechanical equivalence:

**Old behavior:** Heat goes up on defiance, credibility goes up on profitability. `effectiveHeat = heat - credibility`. A player with heat=3, credibility=3 has effectiveHeat=0 (fine). Game over at effectiveHeat >= 5.

**New behavior:** `firmStanding` is a single score that goes down on defiance and up on profitability. This is simpler and more intuitive — the player has one number representing how much the firm trusts them. The two-variable dance (accumulate heat, offset with credibility) is replaced by direct movement on one axis.

**Concrete mapping of old call sites in main.js:**

| Old Call (main.js) | New Call | Notes |
|---------------------|---------|-------|
| `effectiveHeat()` (line 951, game-over check) | `getFaction('firmStanding') <= 0` | Direct threshold check |
| `onComplianceTriggered(equity, day)` (line 845) | `onQuarterlyReview(equity, day)` | Lives in faction-standing.js. If profitable, raises `firmStanding` by 3-8 based on profit ratio (replaces credibility accumulation + heat reset). Snapshots equity for next review. |
| `onComplianceChoice(tier, severity)` (line 947) | `applyComplianceChoice(tier, severity)` | `'full'`: `firmStanding +3`. `'partial'`: no change. `'defiant'`: `firmStanding -(3 * severity)`, `regulatoryExposure +(severity * 3)`. Replaces both `heat += severity` and `addScrutiny(0.5)`. |
| `compliance.heat += 1` (line 963, direct mutation) | `shiftFaction('firmStanding', -5)` | Rescaled: 1 heat point on old 0-5 scale ≈ 5 firmStanding points on 0-100 scale. |
| `compliance` in `_convCtx` (line 1178) | `world.factions` in `_convCtx` | Conviction conditions refactored: `ctx.compliance.credibility >= 3` becomes `ctx.factions.firmStanding >= 60`. See Convictions section. |

**Derived functions (refactored, not wrapped):**

| Function | New Implementation | Consumers |
|----------|-------------------|-----------|
| `firmThresholdMult()` | `1 + (firmStanding / 100) * 0.75` | popup-events.js (15 call sites). Max 1.75× at firmStanding=100, 1.0× at 0. Replaces `1 + credibility * 0.15` (old max 1.75 at credibility=5 — same ceiling). |
| `firmCooldownMult()` | `0.5 + (firmStanding / 100)` | popup-events.js (1 call site). Range 0.5–1.5. Low standing = 50% shorter cooldowns (more frequent popups). High standing = 50% longer. |
| `firmTone()` | Thresholds: `terminated` (<10), `final_warning` (10-25), `pointed` (25-45), `professional` (45-70), `warm` (>70) | popup-events.js (12 call sites). **Behavioral migration note:** Old system required negative effectiveHeat for "warm" (net credibility). New system gives "warm" at firmStanding > 70 (starting value 65, so achievable quickly with good performance). This makes the early game feel friendlier, which fits the "poached veteran with a long leash" characterization. |

### Migration from Scrutiny

**Scale rescaling:** Old scrutiny uses 0-15 with thresholds at [3, 6, 9, 12]. New `regulatoryExposure` uses 0-100 with thresholds at [25, 50, 75, 90]. All existing `addScrutiny()` amounts must be rescaled by ×6.67 (100/15). The level 4 threshold becomes proportionally harder to reach (90% vs. old 80%) — this is intentional, as Criminal Indictment should be rare.

**Concrete mapping of old call sites in main.js:**

| Old Call (main.js) | New Call | Rescaled Amount |
|---------------------|---------|----------------|
| `addScrutiny(2, 'insider_tip', day)` (line 860) | `shiftFaction('regulatoryExposure', 13)` | 2 × 6.67 ≈ 13 |
| `addScrutiny(1.5, 'analyst_tip', day)` (line 862) | `shiftFaction('regulatoryExposure', 10)` | 1.5 × 6.67 ≈ 10 |
| `addScrutiny(0.5, 'defiance', day)` (line 949) | Rolled into `applyComplianceChoice()` | See above |
| `addScrutiny(2, 'fought_sec', day)` (line 872) | `shiftFaction('regulatoryExposure', 13)` | 2 × 6.67 ≈ 13 |
| `addScrutiny(1, 'lobbying', day)` (line 562) | `shiftFaction('regulatoryExposure', 7)` | 1 × 6.67 ≈ 7 |
| `addScrutiny(0.1, 'high_volume', day)` (line 1311) | `shiftFaction('regulatoryExposure', 1)` | 0.1 × 6.67 ≈ 1 (floor to 1) |
| `getScrutinyLevel()` (popup triggers) | `getRegLevel()` | Thresholds: 25/50/75/90 |
| `settleScrutiny()` (line 866) | `settleRegulatory()` | Sets `world.factions.settled = true`, caps regulatoryExposure at current value |
| `cooperateScrutiny()` (line 869) | `cooperateRegulatory()` | `regulatoryExposure -20` (≈ old -3 × 6.67), sets `world.factions.cooperating = true` |
| `getScrutinyState()` (line 2160, epilogue) | `getFactionState()` | Returns full `world.factions` object. Epilogue refactored to read from this. |

**Boolean flags on the factions object:**

```javascript
world.factions = {
    firmStanding: 65,
    regulatoryExposure: 10,
    federalistSupport: 30,
    farmerLaborSupport: 30,
    mediaTrust: 40,
    fedRelations: 40,
    // Flags (not scores)
    settled: false,           // SEC settlement reached
    cooperating: false,       // cooperating with investigators
    liedInTestimony: false,   // perjury time bomb
    equityAtLastReview: INITIAL_CAPITAL,
    lastReviewDay: 0,
}
```

### Regulations System Integration

`regulations.js` (11 dynamic trading rules) evaluates world state to activate/deactivate rules. Currently, no regulation directly reads compliance or scrutiny state — they read `world.congress`, `world.geopolitical`, `world.fed`, etc. The regulations system does not need mechanical changes, but the `factions` domain should be available for future regulations that react to faction state (e.g., a "Campaign Finance Scrutiny" regulation could check `regulatoryExposure`). This requires adding `world.factions` to `WORLD_STATE_RANGES` validation, which is already planned.

`getRegulationEffect()` is unchanged — it reads from the regulation activation state, not from compliance/scrutiny. No call site changes needed.

### Conviction System Integration

The `_convCtx` object (main.js line 1174-1182) currently passes `compliance` directly. Convictions that reference compliance/scrutiny state:

| Conviction | Old Condition | New Condition |
|-----------|---------------|---------------|
| `desk_protects` | `ctx.compliance.credibility >= 3` | `ctx.factions.firmStanding >= 60` |
| `risk_manager` | `ctx.compliance.credibility >= 4` | `ctx.factions.firmStanding >= 70` |
| `ghost_protocol` | `ctx.lobbyCount <= 0` + few flags + low activity | Same, plus `ctx.factions.regulatoryExposure < 25` |

The `_convCtx` object is updated to include `factions: world.factions` instead of `compliance`. Conviction effect keys are also updated:

| Old Effect Key | New Effect Key | Consumers |
|----------------|----------------|-----------|
| `complianceThresholdMult` | `firmThresholdMult` | `firmThresholdMult()` in faction-standing.js |
| `scrutinyMult` | `regExposureMult` | `shiftFaction('regulatoryExposure', ...)` applies this multiplier |
| `popupFrequencyMult` | `firmCooldownMult` | `firmCooldownMult()` in faction-standing.js |
| `lobbyingCostMult` | `lobbyingCostMult` | Unchanged |

### Reset Sequence

`_resetCore()` in main.js currently calls `resetCompliance()` and `resetScrutiny()` separately. These two calls become a single `resetFactions()` which:
- Resets all six scores to starting values
- Clears all boolean flags (`settled`, `cooperating`, `liedInTestimony`)
- Resets `equityAtLastReview` to `INITIAL_CAPITAL`
- Resets `lastReviewDay` to 0

### How Factions Interact

Factions create natural tension:
- Funding Federalist PACs raises `federalistSupport` but may lower `farmerLaborSupport`
- High `mediaTrust` + leaking information raises `regulatoryExposure` if traced
- High `regulatoryExposure` drags down `firmStanding`: when `regulatoryExposure` crosses a level threshold (25/50/75/90), `firmStanding` takes a one-time hit of -5/-8/-12/-15. This is a discrete one-shot event, not continuous coupling.
- High `firmStanding` unlocks the firm's Washington lobbyist, which makes political faction shifts more effective
- Attending political events raises the relevant party faction but may raise `regulatoryExposure` if you're already under investigation

Cross-faction effects are expressed as structured effects in event/popup outcomes or as one-shot events with multi-domain guards — no hidden continuous coupling logic.

### Event System Unification

The current codebase has two parallel narrative engines: the event system (`events.js` + `event-pool.js`) for probabilistic/scheduled events, and `compound-triggers.js` for deterministic one-shot cross-domain events. These are unified into a single event system.

**The problem:** Compound triggers are mechanically equivalent to one-shot events with multi-domain `when()` guards, but the event engine's guard signature is too narrow — `when(sim, world, congress)` doesn't expose `playerChoices`, faction state, or active regulations.

**The fix:** Widen the event guard signature with a context bag:

```javascript
// Old: when(sim, world, congress)
// New: when(sim, world, congress, ctx)
// ctx = { playerChoices, factions, activeRegIds }
```

Existing events that don't need context simply ignore the 4th argument — no existing guards break. The context bag is set once per day via `eventEngine.setPlayerContext(playerChoices, factions, activeRegIds)` before `maybeFire()` is called.

**New event schema field: `oneShot: true`**

Events with `oneShot: true` fire at most once per game, tracked in a `_firedOneShot` Set on the engine. This replaces the compound trigger `_fired` Set.

**Evaluation order in `maybeFire()`:**

1. **Deterministic pre-pass:** Filter eligible one-shot events (unfired, `when()` passes). If any match, fire the highest-priority one deterministically. This preserves compound trigger behavior — they fire reliably when conditions are met.
2. **Pulse schedule:** FOMC meetings, PNTH earnings, filibuster cycle, media cycle (existing behavior).
3. **Followup queue:** Pending MTTH-based followups (existing behavior).
4. **Poisson random draw:** Regular probabilistic events from the pool (existing behavior).

**Migration:** The 18 existing compound triggers move into `event-pool.js` as events with `oneShot: true` and multi-domain `when()` guards that read from `ctx`. `compound-triggers.js` is deleted. `checkCompoundTriggers()` call in main.js is removed. All new RPG expansion triggers (firm crisis, testimony, perjury, regulatory-to-firm drag, conviction-specific) go directly into the event pool as one-shot events.

**What this enables:** Any event can now check player choices, faction state, or active regulations in its guard. The entire narrative system speaks one language. A future event refactor can further enrich guards without architectural changes.

### Faction-Derived NPC Dispositions

Named NPCs don't have individual disposition scores. Instead, their behavior derives from faction scores:

- **Marcus Webb (CRO)** reacts to `firmStanding`. High = trusting. Low = restrictive.
- **Elena Vasquez (MD)** reacts to `firmStanding` with a loyalty offset — she championed you, so she stays positive longer than Webb, but has a floor.
- **Carter Riggs (PM rival)** reacts inversely to your `firmStanding` relative to his performance. Your success = his resentment. Your failure = his opportunity.
- **Sen. Lassiter** reacts to `federalistSupport`. High = offers access. Low = ignores you.
- **Sen. Okafor** reacts to `farmerLaborSupport`, modified by `regulatoryExposure` (she's an investigator — high exposure makes her more interested in you regardless of faction).
- **Rachel Tan** reacts to `mediaTrust`. High = collaborative. Low = adversarial.
- **Hayden Hartley** reacts to `fedRelations`. High = informal advisory access. Low = no signal.

This gives the feel of individual relationships without the per-NPC tracking overhead. The dossiers tab shows derived dispositions with interaction history.

### Standings in the Info Tab

The "Standings" sub-tab shows both world state and faction scores:

**World State** (existing, surfaced):
- Barron Approval, Congress composition, bill status, filibuster, PNTH board, trade war stage, Fed status, investigation stages

**Your Standing** (new):
- Firm Standing: 72/100 — "Webb is giving you room"
- Regulatory Exposure: 18/100 — "Below the radar"
- Federalist Support: 45/100 — "They know your name"
- Farmer-Labor Support: 22/100 — "Distant"
- Media Trust: 55/100 — "Tan considers you a useful source"
- Fed Relations: 38/100 — "No access"

Each score has a short prose descriptor derived from thresholds (like firmTone but for all factions). These descriptors double as the disposition text in the dossiers tab.

---

## 2. The Briefing System

Quarterly and crisis briefings fire as full-screen overlays. The market pauses automatically. Three-panel layout.

**Note on UI complexity:** The three-panel briefing overlay is architecturally distinct from the existing single-panel popup system. It requires: responsive layout (panels stack on mobile), keyboard navigation across panels, focus trapping across multiple interactive sections, and a "collect all choices then apply" pattern (unlike the current popup system's one-at-a-time flow). The implementation plan should treat this as a significant UI task.

### Left Panel: "The Wire" — News Digest

A curated summary of developments since the last briefing, written in terse wire-service prose. 3-5 items drawn from world-state changes, organized by domain:

- **Capitol Hill:** "Haines signals she may break with Federalists on the omnibus. Whip count now 51-49 with Lassiter furious."
- **PNTH:** "Dirks secured Zhen's proxy at Tuesday's board dinner. Gottlieb camp down to 4 seats."
- **Global:** "Liang Wei recalled ambassador after Barron's Zhaowei semiconductor ban. Strait traffic down 15%."
- **Markets:** "Your book is up 8.2% this quarter. Desk benchmark: +3.1%. The CRO noticed."

Each item has a colored pip showing whether the development is good/bad/neutral for current positions. Generated procedurally from world-state deltas since the last briefing.

### Center Panel: "Your Desk" — Strategic Decisions

1-3 decision cards representing the quarter's key choices. These are the statecraft/political moments. Each choice shifts faction scores via structured effects. Examples:

- **"Lassiter's Chief of Staff Calls"** — The senator wants to discuss the tariff bill over lunch. (a) Accept — `federalistSupport +5`, `regulatoryExposure +2` if exposure > 50, (b) Decline politely — no change, (c) Accept but bring compliance officer — `federalistSupport +2`, `firmStanding +3`. Gated by: `federalistSupport >= 35`.
- **"Continental Interview Request"** — Rachel Tan wants 20 minutes on PNTH's military contracts. (a) Talk — `mediaTrust +8`, `regulatoryExposure +3`, (b) Decline — `mediaTrust -3`, (c) Offer background only — `mediaTrust +4`. Gated by: `mediaTrust >= 30`.
- **"Firm Allocation Meeting"** — Webb reviews your book. Capital allocation adjusts based on `firmStanding`. High standing = bigger book. Scene text references Vasquez and Riggs based on their derived dispositions.

**Capital allocation is mechanical, not flavor.** Firm allocation sets a `capitalMultiplier` (0.5 at firmStanding=0, 1.0 at firmStanding=50, 1.5 at firmStanding=100) that scales the player's maximum position notional. This creates a gameplay loop: good performance → higher firmStanding → bigger book → more market impact → more political leverage (and more risk).

### Right Panel: "After Hours" — Personal Decisions

What you do with your time off. 2-3 options each quarter, weighted by faction scores and narrative arcs:

- **"Fed Gala at the Willard"** — `fedRelations +6`, `regulatoryExposure +3` if exposure > 50. Gated by: `fedRelations >= 30`.
- **"Quiet Quarter"** — `firmStanding +3` (low-key, Webb approves). Always available.
- **"Drinks with Tom Driscoll"** — `mediaTrust +5`, risk of `regulatoryExposure +2` if leaks surface. Gated by: `mediaTrust >= 25`.
- **"Prep the CRO Presentation"** — `firmStanding +5`. Always available.

The player makes choices across all three panels, then clicks "Back to the Desk" — market resumes with consequences queued.

### Quarterly Review Integration

The quarterly briefing replaces the current quarterly review toast (main.js line 1127-1151). The review logic is preserved but relocated:

- **`quarterlyReviews[]` is still populated.** The briefing system calls `onQuarterlyReview()` which pushes a review record (rating, equity, day) into the array. Convictions that check `ctx.quarterlyReviews` continue to work.
- **`onQuarterlyReview()` replaces `onComplianceTriggered()`.** Same profitability check, but instead of resetting heat and accumulating credibility, it raises `firmStanding` by 3-8 based on profit ratio.
- **Existing quarterly text referencing "Managing Director Liu"** (main.js line 1144) is replaced with Vasquez. All existing NPC name references are audited and updated.

### Briefing Cadence

- **Quarterly briefings** (every 63 trading days): Full three-panel layout. News digest + 1-3 strategic decisions + personal choice + quarterly review scene.
- **Crisis briefings**: Fire when a superevent has `crisisBriefing: true` in its definition. The superevent popup fires first (existing behavior), then the crisis briefing overlay follows immediately. Crisis briefings are shorter — just the crisis and response options. No after-hours panel. New superevents (testimony triggers, firm crisis) are added to `SUPEREVENT_IDS` in main.js.

---

## 3. Firm Dynamics — Meridian Capital as a Living Institution

### Player Characterization

The player is an experienced trader recently poached by Meridian. They have credibility but no institutional loyalty bank. Meridian gave them a big book and a long leash. All events, popups, briefings, and NPC dialogue must be consistent with this characterization — NPCs treat the player as a peer, never as a junior.

### firmStanding as the Firm's Pulse

`firmStanding` (the faction score) replaces the old compliance heat/credibility duality. Everything the firm thinks about you is one number:

- **Quarterly P&L vs. benchmark** — strongest upward pressure. Good quarters raise firmStanding by 3-8 depending on outperformance (via `onQuarterlyReview()`).
- **Defiant compliance choices** — lower firmStanding (via `applyComplianceChoice()`). Full cooperation raises it slightly.
- **External exposure** — media appearances, political activity, SEC attention all lower firmStanding when they reflect badly on the firm.
- **Client impact** — positions contributing to market dislocations hurt firmStanding.

What firmStanding determines:
- **Capital allocation** — `capitalMultiplier` scales with standing (0.5–1.5×). Affects maximum position notional.
- **Compliance monitoring** — `firmCooldownMult()` and `firmThresholdMult()` derive from firmStanding. Low standing = more frequent, stricter popups.
- **Cover** — whether Meridian backs you in SEC hearings (firmStanding > 60) or throws you to the wolves (firmStanding < 30).
- **Access** — high standing unlocks firm resources: Vasquez's Washington introductions (firmStanding > 70), firm's legal counsel for political meetings (firmStanding > 55), the MD's rolodex (firmStanding > 80).

### Named Characters at the Desk

- **Marcus Webb, CRO** — Direct oversight. Conservative, respects profitability, hates surprises. His behavior derives from `firmStanding`: trusting above 60, businesslike 35-60, hostile below 35. He fires you at firmStanding 0.
- **Elena Vasquez, Managing Director** — Runs the derivatives desk. She poached you. Her support tracks `firmStanding` with a +15 loyalty offset (she stays positive longer). High standing = she opens doors. Standing below 20 = she distances herself. She's your champion until the firm itself is at risk.
- **Carter Riggs, Senior PM** — Peer and quiet rival. Decade at Meridian, resents your bigger book. His attitude inverts your success — when your firmStanding is high, he's resentful but quiet. When it drops, he's the first to suggest reallocation at the partners' meeting.

### How Meridian Gets Pulled In

- **Congressional subpoena** — `regulatoryExposure >= 75` during active Okafor investigation triggers Meridian subpoena. `firmStanding -15`, crisis briefing fires.
- **Client pressure** — large PNTH positions during antitrust probe or visible lobbying: `firmStanding -5` per incident.
- **Reputational contagion** — Tan naming you in a Continental story: `firmStanding -8`, `mediaTrust +3` (you're more interesting now).
- **Firm crisis** — one-shot event: `firmStanding < 25` AND `regulatoryExposure > 60` AND any of (active subpoena, client complaints > 2, media exposure > 3). Board considers shutting the derivatives desk. This gates the Firm Collapse ending.

### Quarterly Reviews (Part of Briefing System)

The quarterly briefing's center panel includes the review as a decision card. Webb reviews numbers, Vasquez weighs in, Riggs mentioned. Tone derives from `firmTone()` thresholds:

- **High (>70):** "Webb slides the quarterly across. 'Another strong quarter. Elena's been talking about expanding your mandate.' Riggs is quiet."
- **Mid (35-70):** "Webb is businesslike. 'Numbers are fine. Keep the risk profile clean.' Vasquez nods but doesn't add anything."
- **Low (<35):** "'We need to talk about your exposure.' Webb has printouts. Vasquez isn't in the room. Riggs suggested a reallocation at the partners' meeting."

---

## 4. Public Reputation Tags

Built from observable actions. Tags are boolean flags that accumulate and determine which narrative content fires. They sit alongside faction scores but are qualitative, not quantitative:

- **Market Mover** — caused visible price dislocations (large impact trades)
- **Political Player** — attended fundraisers, lobbied, met with officials (`federalistSupport > 50` OR `farmerLaborSupport > 50`)
- **Media Figure** — given interviews, been named in stories (`mediaTrust > 60` OR named in 2+ Continental stories)
- **Under Scrutiny** — SEC has you on radar (`regulatoryExposure > 50`)
- **Meridian's Star** — high firm standing, Vasquez talks you up (`firmStanding > 80`)
- **Quiet Money** — low profile across all public factions (`federalistSupport < 40` AND `farmerLaborSupport < 40` AND `mediaTrust < 40` AND `regulatoryExposure < 25`)

Tags gate content: Quiet Money doesn't get invited to Fed galas. Media Figure gets approached by Tan uninvited. Political Player unlocks Tier 2 lobbying. Under Scrutiny makes political meetings riskier.

Tags are re-evaluated daily from faction scores and accumulated flags. Evaluation is O(1) per tag (simple threshold checks on faction scores) — negligible cost in the `_onDayComplete()` pipeline. Tags can appear and disappear as scores change (except Quiet Money, which is permanently lost once any public faction exceeds its threshold).

### Convictions (Existing System, Integrated)

The 12 existing convictions remain hidden, still unlocking from cumulative behavior. New: convictions now feed directly into the epilogue and trigger conviction-specific events:

- **Information Is Everything** → Tan offers a quid pro quo: her sources for yours
- **Ghost Protocol** → late-game: Webb realizes your book has been suspiciously clean, initiates internal audit
- **Crisis Profiteer** → Okafor names you in a congressional hearing on market manipulation during recession
- **Political Operator** → both parties approach you as a bundler during election season
- **Master of Leverage** → blowup at another fund (your counterparty) cascades back to you

### Reputation in Epilogue

- Public reputation tags determine how the world remembers you
- Private convictions determine who you actually became
- Final faction scores determine your standing with each power center
- The gap between public and private is the most interesting narrative: "The Continental called you a principled voice for market integrity. The SEC file, sealed as part of your settlement, told a different story."

---

## 5. Statecraft & Political Agency

**Core principle:** You earn the right to intervene through faction scores and reputation tags, but every intervention has costs and risks.

### Lobbying Expansion (Targeted PAC Funding)

The current 2 blanket PAC actions become targeted politician/caucus funding. You fund specific politicians, and bill implications flow from their agenda. Lassiter's PAC advances the tariff act because that's his priority.

**Tier 1 — Always Available:**
- Fund specific Federalist or Farmer-Labor politicians' PACs. Costs cash, shifts the relevant faction score and Barron approval, adds `regulatoryExposure`. Available targets expand as faction scores rise (low support = only generic PAC; higher support = specific politicians you've met).

**Tier 2 — Requires Political Player tag OR relevant faction score > 50:**
- **Host a fundraiser** — Cost: 800 × `lobbyingCostMult`. Raises relevant party faction by 8, `regulatoryExposure +5` if Under Scrutiny tag active (else +2). Sets `playerChoices.hosted_fundraiser` flag.

**Tier 3 — Requires faction score > 75 with relevant power center:**
- **Broker a deal** — Requires `federalistSupport > 60` AND `farmerLaborSupport > 60`. Costs 1200 × `lobbyingCostMult`. Advances the current bill one stage if both sides are near agreement (`bigBillStatus` or tariff act). `federalistSupport +3`, `farmerLaborSupport +3`, `regulatoryExposure +5`. Sets `playerChoices.brokered_deal` flag.
- **Leak to media** — Requires `mediaTrust > 70`. No direct cost. Player selects target (politician, bill, or investigation). `mediaTrust -20` if traced (50% chance, modified by Ghost Protocol conviction). `regulatoryExposure +15` if traced. If successful: target's approval or bill status shifts, `mediaTrust +5`. Sets `playerChoices.leaked_to_media` flag.
- **Counsel the Fed** — Requires `fedRelations > 75`. No direct cost. Player can nudge rate guidance (±25bp ceiling/floor suggestion). If adopted: rate guidance shifts, `fedRelations +5`. If discovered (one-shot event: media leak OR investigation): `regulatoryExposure +20`, `firmStanding -15`, `fedRelations` drops to 10. Sets `playerChoices.counseled_fed` flag.

### Consequences That Find You

Regardless of engagement, the political system generates consequences from positions and visibility:

- **Position-based exposure:** Large PNTH positions during antitrust probe → `regulatoryExposure +3`. Heavy oil exposure during Farsistan crisis → named in speculation testimony. Short positions during crash → "predatory short-selling" rhetoric, `farmerLaborSupport -5`.
- **Guilt by association:** If someone connected to you falls (Bowman exposed, Dirks indicted, Hartley fired) → relevant faction score drops, `regulatoryExposure` rises.
- **Collateral damage from lobbying:** PAC money traced after a bill passes → `regulatoryExposure +5`, `mediaTrust -5` (journalists smell blood).
- **Investigation reaches you:** `regulatoryExposure > 75` during active Okafor investigation or Tan's Bowman story → testimony sequence fires.

### Testimony System

When pulled in formally (SEC hearing, congressional testimony, deposition), a multi-choice popup sequence fires. Not a single decision — 3-5 questions where answers compound. Each answer shifts faction scores.

Example — Congressional testimony during Okafor's investigation:

1. "Senator Okafor asks about your relationship with Vice President Bowman. How do you characterize it?" — Professional acquaintance (`regulatoryExposure -2`) / We've met socially (neutral) / I decline to answer on counsel's advice (`regulatoryExposure +3`, `farmerLaborSupport -5`)
2. "She presents records of a dinner at the Willard Hotel. What was discussed?" — Policy in general terms (`farmerLaborSupport +2`, honest) / I don't recall specifics (sets `liedInTestimony` flag) / Market conditions, not politics (`firmStanding +2`, deflection)
3. "She asks whether your PNTH positions were informed by non-public information." — Absolutely not, my analysis is public record (honest if true, sets `liedInTestimony` if insider tip was pursued) / I'd like to consult with my attorney (`regulatoryExposure +5`) / My positions reflect professional judgment (neutral)
4. "Will you cooperate with the committee's ongoing investigation?" — Fully (`regulatoryExposure -10`, `farmerLaborSupport +5`, but opens your records) / With limitations (neutral) / I'll review with counsel (`regulatoryExposure +3`)

Lying successfully is possible but creates a ticking time bomb — if contradictory evidence surfaces later (one-shot event: `liedInTestimony` AND relevant investigation advances), `regulatoryExposure +25` and Criminal Indictment ending becomes available.

---

## 6. Narrative Arc Structure

### Three-Act Structure

**Act I: Proving Ground (Days 1-252, Year 1)**

Stable landscape. Barron's honeymoon, Federalist trifecta, PNTH riding high. Lower-stakes events, relationship-building opportunities, firm dynamics establishing. First quarterly briefing sets the tone.

Threads introduced:
- Dirks/Gottlieb tension simmering
- Lassiter's tariff ambitions forming
- Tan starts investigating Bowman
- First lobbying opportunities appear (Tier 1 only — player hasn't built faction scores yet)
- Player establishes reputation baseline — faction scores begin diverging from starting values

**Act II: Escalation (Days 253-756, Years 2-3)**

Crises overlap. Player's faction scores are high enough that the world reacts to them specifically. Midterms reshape Congress. PNTH schism goes public. Geopolitical crises compound. One-shot cross-domain events start firing.

Key shifts:
- Faction scores gate meaningful content — Tier 2 lobbying unlocks for active players
- Firm dynamics become charged (Riggs makes his play when firmStanding dips, sulks when it's high)
- Political exposure escalates for players with high party faction scores
- Investigations gain momentum — regulatoryExposure climbing toward testimony thresholds
- Crisis briefings start firing

**Act III: Reckoning (Days 757-1008, Years 3-4)**

Everything converges. Presidential election looms. PNTH board war resolves. Geopolitical crises climax. Accumulated choices produce final consequences.

Key features:
- Late-game one-shot events requiring conditions accumulated across all three acts
- Tier 3 lobbying available for players who built extreme faction scores — the most powerful and dangerous moves
- "Point of no return" decisions that lock in endings
- Faction scores at peak consequence — high firmStanding means Vasquez testifies for you; low means she testifies against
- Election as capstone where lobbying, faction scores, and positioning pay off or collapse

---

## 7. Ending System (Complete Overhaul)

Six endings replace all current fail/end states. Each has its own epilogue tone. Terminal conditions evaluated daily in `_onDayComplete()`, **after** events and faction shifts have been applied for that day.

### Ending Priority Order

When multiple endings are simultaneously eligible, the first match in this order fires:

1. **Criminal Indictment** (highest priority — most dramatic, most specific conditions)
2. **Margin Call Liquidation** (mechanical — equity check, no narrative ambiguity)
3. **Firm Collapse** (requires both low firmStanding AND external crisis conditions)
4. **Forced Resignation** (firmStanding ≤ 0 without firm collapse conditions)
5. **Whistleblower** (player-initiated, only available when conditions met)
6. **Term Ends** (day 1008 reached — lowest priority, the "survived" ending)

### Endings Triggered by External Pressure

**Criminal Indictment** — `regulatoryExposure >= 95` AND `liedInTestimony` flag set AND contradictory evidence surfaces (one-shot event). SEC refers to DOJ. Epilogue framed as courtroom retrospective: what prosecution presented, what defense argued, what the jury never saw.

**Firm Collapse** — `firmStanding < 15` AND `regulatoryExposure > 60` AND accumulated firm crisis conditions (subpoena + client complaints + media exposure). Meridian institutional health bottoms out. Epilogue framed as post-mortem: a Priya Sharma MarketWire feature on "What Killed Meridian Capital." Vasquez, Webb, Riggs each get a paragraph on where they landed.

**Forced Resignation** — `firmStanding <= 0` AND Firm Collapse conditions NOT met (Meridian survives, you don't). Webb and Vasquez sit you down. Epilogue framed as quiet aftermath: you leave, desk continues, Riggs gets your book. The world keeps turning.

**Margin Call Liquidation** — Equity collapses past maintenance margin. Prime broker liquidates your book publicly. Epilogue framed as MarketWire ticker reconstruction: "At 2:47 PM, the prime broker began unwinding what sources described as a highly concentrated derivatives portfolio..." Cascading price impact becomes part of the story.

### Ending Triggered by Player Choice

**Whistleblower** — Available when `regulatoryExposure > 75` AND player has been cooperating with investigators (`cooperating` flag set). Offered as a choice in a crisis briefing or testimony sequence. Player becomes cooperating witness. Career over, but walks free. Epilogue framed as deposition transcript: clinical, devastating, plain text dismantling the networks you built.

### The Natural Ending

**Term Ends** — Survive all four years (day 1008). Barron's term concludes. Election resolves. Full playthrough, richest epilogue: all five pages, full accounting of every thread. Tone ranges from triumphant to haunted depending on final faction scores and world state.

### Epilogue Structure (5 Pages)

All endings produce an epilogue. Page depth adapts per ending type:

1. **The Election & Columbia's Direction** — Political outcome with player's fingerprints noted. References `federalistSupport`, `farmerLaborSupport`, and lobbying history. Premature endings compress this into a "the world goes on" summary.
2. **PNTH & Corporate America** — How player's positions and political activity shaped PNTH's outcome.
3. **The World** — Geopolitical consequences with human weight: casualties, refugees, economic fallout. Connects player's lobbying and crisis profiteering to real outcomes without being preachy.
4. **Meridian Capital** — What happened to the firm. Derives from final `firmStanding` and firm crisis history. Ranges from thriving (Vasquez made partner, Riggs transferred) to collapsed (Vasquez's career is collateral damage, Webb's warnings went unheeded).
5. **Your Legacy** — Public reputation tags vs. private convictions. Final faction score summary. Most consequential decision. Final paragraph varying by archetype.

Premature endings compress pages 1-3 into shorter summaries. Pages 4-5 always get full treatment. Whistleblower ending replaces Page 5 with deposition transcript format.

---

## 8. Module Architecture

### New Modules

- **`faction-standing.js`** — Unified faction system. Six scores (0-100) plus boolean flags in `world.factions`. Exports: `shiftFaction(id, delta)` (applies conviction multipliers), `getFaction(id)`, `getRegLevel()` (regulatory threshold levels), `firmThresholdMult()`, `firmCooldownMult()`, `firmTone()`, `onQuarterlyReview(equity, day)`, `applyComplianceChoice(tier, severity)`, `settleRegulatory()`, `cooperateRegulatory()`, `getFactionState()`, `getFactionDescriptor(id)`, `resetFactions()`. No compatibility exports — all consumers refactored.

- **`briefing.js`** — Quarterly and crisis briefing overlay. Three-panel layout with responsive stacking, keyboard navigation, and focus trapping. Manages briefing lifecycle (pause → present → collect choices → apply faction effects → populate quarterlyReviews[] → resume). Decision cards gated by faction thresholds and reputation tags. Crisis briefings fire after superevent popups when `crisisBriefing: true` flag is set.

- **`reputation.js`** — Public reputation tag evaluation. Six tags re-evaluated daily (O(1) per tag). Tags are derived state computed from current faction scores and player history. Also manages conviction-to-epilogue integration and conviction-specific event triggers.

- **`testimony.js`** — Multi-choice testimony sequences. Generates question chains from world state, faction scores, and player history. Each answer shifts faction scores via `shiftFaction()`. Manages `liedInTestimony` flag. Integrates with popup system for sequential question delivery.

- **`endings.js`** — Replaces `epilogue.js`. Evaluates six terminal conditions in priority order daily (after events/faction shifts). Generates appropriate epilogue variant with 5-page adaptive structure. Reads full `getFactionState()` plus world state for epilogue generation.

### Expanded Existing Modules

- **`main.js`** — All compliance/scrutiny call sites refactored to faction API. `_convCtx` updated to include `factions: world.factions`. `_resetCore()` calls `resetFactions()`. Quarterly review toast replaced by briefing trigger. `SUPEREVENT_IDS` expanded for crisis briefing triggers. `onComplianceTriggered`/`onComplianceChoice` calls replaced with `onQuarterlyReview`/`applyComplianceChoice`. Direct `compliance.heat` mutation replaced with `shiftFaction()`. `checkCompoundTriggers()` call removed — one-shot events handled by the event engine. Player context set per day via `eventEngine.setPlayerContext()`.

- **`events.js`** — Event guard signature widened to `when(sim, world, congress, ctx)` where `ctx = { playerChoices, factions, activeRegIds }`. New `oneShot: true` schema field with `_firedOneShot` Set tracking. Deterministic pre-pass for one-shot events before Poisson draw. `setPlayerContext(playerChoices, factions, activeRegIds)` method added. New event categories for firm dynamics, faction-gated political events, conviction-specific events. Event effects shift factions via structured effects.

- **`popup-events.js`** — All 15 `thresholdMultiplier()` call sites updated to `firmThresholdMult()`. `cooldownMultiplier()` updated to `firmCooldownMult()`. 12 `complianceTone()` sites updated to `firmTone()`. Imports changed from `compliance.js` to `faction-standing.js`. New testimony sequences, firm confrontation scenes, NPC-specific decision popups added. All context text consistent with experienced-veteran player characterization.

- **`lobbying.js`** — Expanded from 2 blanket PAC actions to targeted politician/caucus funding with 3 tiers. Tier gating reads faction scores and reputation tags. Each action calls `shiftFaction()` for relevant factions. `addScrutiny` calls replaced with `shiftFaction('regulatoryExposure', ...)` at rescaled amounts.

- **`event-pool.js`** — Absorbs all 18 existing compound triggers as `oneShot: true` events with multi-domain `when()` guards reading from `ctx`. New one-shot events added: firm crisis, testimony trigger, perjury bomb, regulatory-to-firm drag (one-time hits when regulatoryExposure crosses level thresholds), conviction-specific late-game triggers. Regular events also gain access to `ctx` in their guards for richer conditional logic.

- **`world-state.js`** — New `factions` domain with six scores, boolean flags, and review state. Added to `WORLD_STATE_RANGES` for structured effects validation (all scores: `{ min: 0, max: 100, type: 'number' }`). Old compliance/scrutiny state removed from any world-state references.

- **`convictions.js`** — Conviction conditions updated to read from `ctx.factions.*` instead of `ctx.compliance.*`. Effect keys renamed (`complianceThresholdMult` → `firmThresholdMult`, `scrutinyMult` → `regExposureMult`, `popupFrequencyMult` → `firmCooldownMult`). New conviction-specific event triggers added.

- **`interjections.js`** — Expanded pool with conviction-aware and faction-aware variants. Different interjections fire based on public reputation tags (Ghost Protocol player gets different inner monologue than Media Figure).

### Removed Modules

- **`compliance.js`** — Deleted. All functionality moved to `faction-standing.js`. All consumers refactored.
- **`scrutiny.js`** — Deleted. All functionality moved to `faction-standing.js`. All consumers refactored.
- **`compound-triggers.js`** — Deleted. All 18 triggers migrated to `event-pool.js` as `oneShot: true` events. `checkCompoundTriggers()` call removed from main.js.
- **`epilogue.js`** — Deleted. Replaced by `endings.js` with expanded 5-page structure and 6 ending variants.

### UI Changes

- **Info tab** — Two new sub-tabs:
  - **Standings**: World state scoreboard (political, PNTH, geopolitical, Fed, investigations) plus faction score summary with prose descriptors.
  - **Dossiers**: NPC profiles with faction-derived dispositions and interaction history. Unlocked as player encounters characters.
- **Briefing overlay** — Full-screen glass overlay for quarterly/crisis briefings. Three-panel responsive layout (stacks on mobile). Keyboard navigation across panels. Focus trapping. "Collect all choices then apply" interaction pattern.
- **Lobby bar** — Expanded to show targeted politician options. Available targets gated by faction scores and reputation tags. Tiered access (1/2/3) visually indicated.
- **index.html** — New elements: briefing overlay container, standings sub-tab panel, dossiers sub-tab panel, expanded lobby bar structure. Implementation plan should include HTML skeleton.

### Audio (Opportunity, Not Required)

The audio system is listed as unchanged, but crisis briefings, testimony sequences, and firm confrontation scenes would benefit from mood shifts via the existing `setAmbientMood()` system. Testimony could trigger `'tense'`, firm crisis could trigger `'crisis'`, quarterly review could match firmTone. This is a polish pass, not a structural requirement.

### Unchanged

- Trading engine (simulation.js, portfolio.js, strategy.js, chart.js, pricing)
- Core game loop and sub-step pipeline (except call site refactoring in `_onDayComplete`)
- Regulations system (reads world state, not compliance/scrutiny directly)
- Event/toast/popup infrastructure (new content plugs into existing vocabulary; guard signature widened but backward-compatible)
- Shared modules (shared-*.js, shared-base.css)
