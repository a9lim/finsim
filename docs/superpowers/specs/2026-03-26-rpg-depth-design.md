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

### The Six Factions

| Faction | Starts | Replaces | What It Measures |
|---------|--------|----------|------------------|
| `firmStanding` | 65 | compliance heat + credibility | Meridian's trust in you. High = wider limits, gentler compliance, firm backs you. Low = book restrictions, hostile reviews, fired at 0. |
| `regulatoryExposure` | 10 | scrutiny score + level | SEC attention on you. Low = invisible. High = investigation popups escalate. Threshold levels at 25/50/75/90. |
| `federalistSupport` | 30 | new | Your standing with the ruling Federalist party. Gates access to Lassiter, Haines, Tao, Barron orbit. |
| `farmerLaborSupport` | 30 | new | Your standing with the opposition. Gates access to Okafor, Whitfield, Reyes, Clay orbit. |
| `mediaTrust` | 40 | new | How much the press trusts/targets you. High = Tan gives you advance warning, you can leak effectively. Low = press writes hostile stories, you're a target. |
| `fedRelations` | 40 | new | Your standing with Fed/monetary establishment. High = Hartley intelligence, advisory access. Low = shut out of rate signals. |

### Migration from Compliance/Scrutiny

**Compliance heat → firmStanding (inverted):**
- `effectiveHeat()` becomes `(100 - firmStanding) / 20` to preserve the 0-5 effective scale
- `thresholdMultiplier()` derives from `firmStanding` directly: `1 + (firmStanding / 100) * 0.75` (high standing = lenient thresholds, same 75% max leniency as current credibility cap)
- `cooldownMultiplier()` derives from `firmStanding`: low standing = more frequent compliance popups
- `complianceTone()` maps to firmStanding thresholds: terminated (<10), final_warning (10-25), pointed (25-45), professional (45-70), warm (>70)
- Game-over: `firmStanding <= 0` = fired (replaces `effectiveHeat >= 5`)
- Profitable quarters raise `firmStanding` directly (replaces asymmetric credibility accumulator)
- Defiant compliance choices lower `firmStanding` (replaces heat accumulation)

**Scrutiny → regulatoryExposure:**
- `getScrutinyLevel()` derives from thresholds: level 1 at 25, level 2 at 50, level 3 at 75, level 4 at 90
- `addScrutiny(amount)` becomes `addExposure('regulatoryExposure', amount)` — same conviction multipliers apply
- `settled` and `cooperating` flags remain as booleans on the faction entry (not everything is a score)
- Cap at 100 (replaces cap at 15)

**What stays the same mechanically:**
- `thresholdMultiplier()` and `cooldownMultiplier()` keep their function signatures — popup-events.js call sites don't change
- Conviction effects get unified multiplier keys but same multiplicative stacking
- Popup tone system still works, just backed by firmStanding thresholds instead of heat

### How Factions Interact

Factions create natural tension:
- Funding Federalist PACs raises `federalistSupport` but may lower `farmerLaborSupport`
- High `mediaTrust` + leaking information raises `regulatoryExposure` if traced
- High `regulatoryExposure` drags down `firmStanding` (the firm doesn't like SEC attention)
- High `firmStanding` unlocks the firm's Washington lobbyist, which makes political faction shifts more effective
- Attending political events raises the relevant party faction but may raise `regulatoryExposure` if you're already under investigation

Cross-faction effects are expressed as structured effects in event/popup outcomes — no hidden coupling logic.

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

Each score has a short prose descriptor derived from thresholds (like complianceTone but for all factions). These descriptors double as the disposition text in the dossiers tab.

---

## 2. The Briefing System

Quarterly and crisis briefings fire as full-screen overlays. The market pauses automatically. Three-panel layout:

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

### Right Panel: "After Hours" — Personal Decisions

What you do with your time off. 2-3 options each quarter, weighted by faction scores and narrative arcs:

- **"Fed Gala at the Willard"** — `fedRelations +6`, `regulatoryExposure +3` if exposure > 50. Gated by: `fedRelations >= 30`.
- **"Quiet Quarter"** — `firmStanding +3` (low-key, Webb approves). Always available.
- **"Drinks with Tom Driscoll"** — `mediaTrust +5`, risk of `regulatoryExposure +2` if leaks surface. Gated by: `mediaTrust >= 25`.
- **"Prep the CRO Presentation"** — `firmStanding +5`. Always available.

The player makes choices across all three panels, then clicks "Back to the Desk" — market resumes with consequences queued.

### Briefing Cadence

- **Quarterly briefings** (every 63 trading days): Full three-panel layout. News digest + 1-3 strategic decisions + personal choice. Replaces the current quarterly review popup system.
- **Crisis briefings**: Fire after narrative-shifting superevents (constitutional crises, war escalation, firm existential threats — not routine parameter-shift events). Shorter format — just the crisis and response options. No after-hours panel.

---

## 3. Firm Dynamics — Meridian Capital as a Living Institution

### Player Characterization

The player is an experienced trader recently poached by Meridian. They have credibility but no institutional loyalty bank. Meridian gave them a big book and a long leash. All events, popups, briefings, and NPC dialogue must be consistent with this characterization — NPCs treat the player as a peer, never as a junior.

### firmStanding as the Firm's Pulse

`firmStanding` (the faction score) replaces the old compliance heat/credibility duality and the separate firm-standing composite from the earlier design iteration. Everything the firm thinks about you is one number:

- **Quarterly P&L vs. benchmark** — strongest upward pressure. Good quarters raise firmStanding by 5-10 depending on outperformance.
- **Defiant compliance choices** — lower firmStanding (replaces heat accumulation). Full cooperation raises it slightly.
- **External exposure** — media appearances, political activity, SEC attention all lower firmStanding when they reflect badly on the firm.
- **Client impact** — positions contributing to market dislocations hurt firmStanding.

What firmStanding determines:
- **Capital allocation** — risk capital scales with standing. High standing = bigger book = more leverage for political influence.
- **Compliance monitoring** — `cooldownMultiplier()` and `thresholdMultiplier()` derive from firmStanding. Low standing = more frequent, stricter popups.
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
- **Firm crisis** — compound trigger: `firmStanding < 25` AND `regulatoryExposure > 60` AND any of (active subpoena, client complaints > 2, media exposure > 3). Board considers shutting the derivatives desk. This gates the Firm Collapse ending.

### Quarterly Reviews (Part of Briefing System)

The quarterly briefing's center panel includes the review as a decision card. Webb reviews numbers, Vasquez weighs in, Riggs mentioned. Tone derives from `firmStanding` thresholds:

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

Tags are re-evaluated daily from faction scores and accumulated flags. They can appear and disappear as scores change (except Quiet Money, which is permanently lost once any public faction exceeds its threshold).

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
- **Host a fundraiser** — higher cost, raises both the relevant party faction and `regulatoryExposure`. Builds access to multiple politicians. Risk: `regulatoryExposure +5` if already Under Scrutiny.

**Tier 3 — Requires faction score > 75 with relevant power center:**
- **Broker a deal** — requires `federalistSupport > 60` AND `farmerLaborSupport > 60`. Attempt legislative compromises. Haines might break with Federalists on the omnibus if she trusts your bond market read.
- **Leak to media** — requires `mediaTrust > 70`. Feed Tan or Cole information to shape narrative. Boost or torpedo a bill. High risk: if traced, `regulatoryExposure +15` and `mediaTrust` drops to 20 (trust destroyed).
- **Counsel the Fed** — requires `fedRelations > 75`. Invited to informal advisory meetings. Can nudge rate policy. Most powerful lever, most dangerous: if discovered, `regulatoryExposure +20`, `firmStanding -15`, `fedRelations` drops to 10.

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

Lying successfully is possible but creates a ticking time bomb — if contradictory evidence surfaces later (compound trigger: `liedInTestimony` AND relevant investigation advances), `regulatoryExposure +25` and Criminal Indictment ending becomes available.

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

Crises overlap. Player's faction scores are high enough that the world reacts to them specifically. Midterms reshape Congress. PNTH schism goes public. Geopolitical crises compound. Compound triggers start firing.

Key shifts:
- Faction scores gate meaningful content — Tier 2 lobbying unlocks for active players
- Firm dynamics become charged (Riggs makes his play when firmStanding dips, sulks when it's high)
- Political exposure escalates for players with high party faction scores
- Investigations gain momentum — regulatoryExposure climbing toward testimony thresholds
- Crisis briefings start firing

**Act III: Reckoning (Days 757-1008, Years 3-4)**

Everything converges. Presidential election looms. PNTH board war resolves. Geopolitical crises climax. Accumulated choices produce final consequences.

Key features:
- Late-game compound triggers requiring conditions from all three acts
- Tier 3 lobbying available for players who built extreme faction scores — the most powerful and dangerous moves
- "Point of no return" decisions that lock in endings
- Faction scores at peak consequence — high firmStanding means Vasquez testifies for you; low means she testifies against
- Election as capstone where lobbying, faction scores, and positioning pay off or collapse

---

## 7. Ending System (Complete Overhaul)

Six endings replace all current fail/end states. Each has its own epilogue tone. Terminal conditions evaluated daily from faction scores and game state.

### Endings Triggered by External Pressure

**Criminal Indictment** — `regulatoryExposure >= 95` AND `liedInTestimony` flag set AND contradictory evidence surfaces (compound trigger). SEC refers to DOJ. Epilogue framed as courtroom retrospective: what prosecution presented, what defense argued, what the jury never saw.

**Firm Collapse** — `firmStanding < 15` AND `regulatoryExposure > 60` AND accumulated firm crisis conditions (subpoena + client complaints + media exposure). Meridian institutional health bottoms out. Epilogue framed as post-mortem: a Priya Sharma MarketWire feature on "What Killed Meridian Capital." Vasquez, Webb, Riggs each get a paragraph on where they landed.

**Forced Resignation** — `firmStanding <= 0` but Firm Collapse conditions not met (Meridian survives, you don't). Webb and Vasquez sit you down. Epilogue framed as quiet aftermath: you leave, desk continues, Riggs gets your book. The world keeps turning.

**Margin Call Liquidation** — Equity collapses past maintenance margin. Prime broker liquidates your book publicly. Epilogue framed as MarketWire ticker reconstruction: "At 2:47 PM, the prime broker began unwinding what sources described as a highly concentrated derivatives portfolio..." Cascading price impact becomes part of the story.

### Ending Triggered by Player Choice

**Whistleblower** — Available when `regulatoryExposure > 75` AND player has been cooperating with investigators (cooperation flags set). Player becomes cooperating witness. Career over, but walks free. Epilogue framed as deposition transcript: clinical, devastating, plain text dismantling the networks you built.

### The Natural Ending

**Term Ends** — Survive all four years. Barron's term concludes. Election resolves. Full playthrough, richest epilogue: all five pages, full accounting of every thread. Tone ranges from triumphant to haunted depending on final faction scores and world state.

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

- **`faction-standing.js`** — Unified faction system replacing `compliance.js` and `scrutiny.js`. Six faction scores (0-100) in `world.factions`. Exports compatibility functions: `thresholdMultiplier()`, `cooldownMultiplier()`, `complianceTone()`, `getScrutinyLevel()` — all backed by faction scores internally. Also exports `shiftFaction(factionId, delta)`, `getFactionLevel(factionId)`, `getFactionDescriptor(factionId)`, `resetFactions()`. Handles cross-faction effects (e.g., high regulatoryExposure dragging firmStanding). Boolean flags (`settled`, `cooperating`, `liedInTestimony`) stored alongside scores.

- **`briefing.js`** — Quarterly and crisis briefing overlay. Generates three-panel layout from world state and faction scores. Manages briefing lifecycle (pause → present → collect choices → apply faction effects → resume). Decision cards gated by faction thresholds and reputation tags.

- **`reputation.js`** — Public reputation tag evaluation. Re-evaluates daily from faction scores and accumulated flags. Tags are derived state, not stored — computed from current faction scores and player history. Also manages conviction-to-epilogue integration.

- **`testimony.js`** — Multi-choice testimony sequences. Generates question chains from world state, faction scores, and player history. Each answer shifts faction scores via structured effects. Tracks `liedInTestimony` flag for Indictment ending trigger.

- **`endings.js`** — Replaces `epilogue.js`. Evaluates six terminal conditions daily from faction scores and game state. Generates appropriate epilogue variant with 5-page adaptive structure. Terminal conditions expressed as faction score thresholds + compound flags.

### Expanded Existing Modules

- **`events.js`** — New event categories for firm dynamics, faction-gated political events, conviction-specific events. Event `when()` guards check `world.factions.*` scores. Event effects shift factions via structured effects.

- **`popup-events.js`** — Testimony sequences, firm confrontation scenes, NPC-specific decision popups. Choice outcomes express faction shifts as structured effects. All context text consistent with experienced-veteran player characterization. Existing compliance popups migrate to faction-backed thresholds (function signatures unchanged).

- **`lobbying.js`** — Expanded from 2 blanket PAC actions to targeted politician/caucus funding with 3 tiers gated by faction scores and reputation tags. Each action shifts specific faction scores. Available targets expand as relevant faction score rises.

- **`compound-triggers.js`** — New triggers using faction scores: firm crisis (`firmStanding < 25` AND `regulatoryExposure > 60`), testimony trigger (`regulatoryExposure > 75` during active investigation), perjury bomb (`liedInTestimony` AND evidence surfaces), conviction-specific late-game triggers.

- **`world-state.js`** — New `factions` domain with six scores and boolean flags. Integrated into `WORLD_STATE_RANGES` for structured effects validation. Existing `compliance` and `scrutiny` references removed.

- **`convictions.js`** — Conviction effects updated to use unified faction multiplier keys. Conviction conditions can now reference `world.factions.*` scores. New conviction-specific event triggers added.

- **`interjections.js`** — Expanded pool with conviction-aware and faction-aware variants. Different interjections fire based on public reputation tags (Ghost Protocol player gets different inner monologue than Media Figure).

### Removed Modules

- **`compliance.js`** — Replaced by `faction-standing.js`. All mechanical functions (`thresholdMultiplier`, `cooldownMultiplier`, `complianceTone`) preserved as compatibility exports from the new module.
- **`scrutiny.js`** — Replaced by `faction-standing.js`. `getScrutinyLevel()` preserved as compatibility export backed by `regulatoryExposure` thresholds.
- **`epilogue.js`** — Replaced by `endings.js` with expanded 5-page structure and 6 ending variants.

### UI Changes

- **Info tab** — Two new sub-tabs:
  - **Standings**: World state scoreboard (political, PNTH, geopolitical, Fed, investigations) plus faction score summary with prose descriptors.
  - **Dossiers**: NPC profiles with faction-derived dispositions and interaction history. Unlocked as player encounters characters.
- **Briefing overlay** — Full-screen glass overlay for quarterly/crisis briefings. Three-panel layout. Consistent with existing popup styling but larger.
- **Lobby bar** — Expanded to show targeted politician options. Available targets gated by faction scores and reputation tags. Tiered access (1/2/3) visually indicated.

### Unchanged

- Trading engine (simulation.js, portfolio.js, strategy.js, chart.js, pricing)
- Core game loop and sub-step pipeline
- Audio system
- Event/toast/popup infrastructure (new content plugs into existing vocabulary)
- Shared modules (shared-*.js, shared-base.css)
