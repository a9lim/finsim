# Narrative Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Shoals' narrative systems from generic procedural events into a specific, lived-in world that reads like financial journalism — named people, institutions, legislation, and geopolitical actors — maximizing replay value.

**Architecture:** Lore bible markdown as creative reference (not runtime code). Targeted rewrites of generic events to reference specific lore entities. New world-state fields for PNTH products, congressional process, media ecosystem. New event chains for four pillars: Congress, PNTH products, geopolitics, media. Expanded convictions and enriched epilogue.

**Tech Stack:** Vanilla ES6 modules, no dependencies. All changes are data/prose additions to existing module patterns.

**Spec:** `docs/superpowers/specs/2026-03-25-narrative-enrichment-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lore.md` | Create | Lore bible — cast, institutions, nations, products, timeline |
| `src/world-state.js` | Modify | Add PNTH product fields, congress fields, media domain, rename chinaRelations |
| `src/event-pool.js` | Modify | Rewrite generic events, add new event chains |
| `src/popup-events.js` | Modify | Rewrite popup contexts with lore references |
| `src/compound-triggers.js` | Modify | Rewrite headlines + add new triggers |
| `src/regulations.js` | Modify | Rename regulations to reference named legislation |
| `src/convictions.js` | Modify | Add 4 new convictions |
| `src/epilogue.js` | Modify | Enrich all 4 pages with lore references |
| `src/lobbying.js` | Modify | Add bill-specific lobby context |
| `src/events.js` | Modify | Add filibuster pulse, media pulse, conviction-aware likelihood weighting |
| `main.js` | Modify | Wire new resets, pass new context to evaluators |

---

### Task 1: Create the Lore Bible

**Files:**
- Create: `lore.md`

This is the creative foundation. All subsequent tasks reference this document for character names, nation names, product names, and legislation names.

- [ ] **Step 1: Write the lore bible**

Create `lore.md` at the project root with the full cast and world:

```markdown
# Shoals Lore Bible

> Creative reference for event writing. Not consumed by code at runtime.

## The Federal States of Columbia

Alternate-history America. Two major parties: Federalist and Farmer-Labor.
Presidential system, bicameral Congress (Senate: 100 seats, House: 435 seats).

---

## Congress & Elections

### Federalist Party

- **President John Barron** — Incumbent. Combative populist. Brash, transactional,
  media-savvy. Governs by loyalty tests and public feuds. His base is fiercely loyal;
  the establishment wing tolerates him for judicial picks and tax cuts.

- **Vice President Jay Bowman** — Quiet operator. Former corporate attorney.
  Offshore account scandal building in the background. Barron picked him for
  fundraising connections, not governing ability.

- **Sen. Roy Lassiter (F-SC)** — Trade hawk. Chairs the Commerce Committee.
  Wants tariffs on everything, especially Serica. Sponsor of the Serican Reciprocal
  Tariff Act. Southern drawl, folksy metaphors about "protecting Columbian workers."
  Reliable Barron ally on trade, unreliable on spending.

- **Sen. Margaret "Peggy" Haines (F-WY)** — Fiscal conservative, deficit hawk.
  Skeptical of Barron's spending. Key swing vote on the Big Beautiful Bill.
  Won't flip parties but will cross the aisle on specific bills that bust the budget.
  Respected by both sides for intellectual consistency.

- **Rep. Vincent Tao (F-TX)** — House Majority Leader. Party enforcer.
  Manages floor votes with a mix of charm and implicit threats. Barron loyalist
  who privately thinks Barron is an idiot but useful.

- **Rep. Diane Whittaker (F-OH)** — Moderate swing vote. Purple district
  (suburban Columbia). Flippable on individual votes via lobby pressure or district
  concerns. Media profiles her as "the most important person in Congress" during
  close votes.

- **Gov. Patricia Chen (OH)** — Moderate Federalist governor. Potential party
  savior if Barron falls. Mentioned in epilogue as 2032 frontrunner.

### Farmer-Labor Party

- **Sen. Patricia Okafor (F-L, IL)** — Chairs the Special Investigations
  Committee. Sharp, methodical prosecutor turned senator. Potential presidential
  candidate. Her hearings are must-watch television.

- **Sen. James Whitfield (F-L, MA)** — Minority Leader. Procedural master.
  Legendary filibuster tactician — he once read grain futures reports for nine
  hours to block an agricultural subsidy. Calm, deliberate, infuriating to opponents.

- **Rep. Carmen Reyes (F-L, CA)** — House Minority Leader. Firebrand.
  Goes on The Sentinel to argue with Marcus Cole, generating viral clips.
  Sponsor of the Digital Markets Accountability Act targeting PNTH.

- **Rep. David Oduya (F-L, MI)** — Labor wing. Auto workers, manufacturing.
  Anti-trade-deal even when his own party negotiates one. Skeptical of tech,
  skeptical of Wall Street, skeptical of anyone who hasn't worked a factory floor.

- **Robin Clay** — Party figurehead. Former presidential candidate. Elder
  statesman role. Endorsement still matters in Farmer-Labor primaries.

### Key Legislation

- **American Competitive Enterprise Act ("Big Beautiful Bill")** — Barron's
  omnibus: tax cuts + deregulation + defense spending. Senate passage requires
  60 votes (filibuster-proof) or reconciliation. The marquee bill tracked by
  `congress.bigBillStatus`. Haines's deficit objections are the main Federalist
  obstacle; Whitfield will filibuster if it reaches the floor without reconciliation.

- **Serican Reciprocal Tariff Act** — Lassiter's escalating tariff authority
  against Serica. Drives trade war progression. Popular with the Federalist base,
  divisive among business-wing Federalists who need Serican supply chains.

- **Financial Freedom Act (Lassiter-Tao)** — Margin and banking deregulation.
  Framed as "cutting red tape for Columbian investors." Critics call it
  "the hedge fund wish list."

- **Digital Markets Accountability Act** — Farmer-Labor anti-Big-Tech bill.
  Reyes's signature legislation. Threatens PNTH directly with data portability
  requirements and algorithmic transparency mandates. Would gut Atlas Sentinel's
  business model.

- **Federal Reserve Independence Act** — Existing legislation Barron threatens
  to invoke or repeal to fire Fed Chair Hartley. Constitutional crisis territory.

---

## Palanthropic (PNTH)

### Leadership

- **Andrea Dirks** — Chairwoman. Defense hawk. Former intelligence community.
  Believes Atlas Aegis is the company's destiny and that the military contract
  is a moral obligation. Would sell the consumer division to fund defense R&D.

- **Eugene Gottlieb** — CEO and founder. Commercial vision. Believes AI should
  be accessible, not weaponized. Increasingly marginalized by Dirks's board
  allies. Will eventually leave to start Covenant AI if pushed out.

- **Mira Kassis** — CTO. Safety-focused engineer. Caught between Dirks and
  Gottlieb. Wants to build responsibly but recognizes the military contract
  funds the research she cares about. Her resignation would tank the stock.

- **Raj Malhotra** — CFO. Wall Street background (former Goldman). Sides with
  whoever is winning. His quarterly earnings calls are market events. Speaks
  fluent analyst-ese: "adjusted EBITDA," "runway," "capital allocation discipline."

- **David Zhen** — Board member. Early investor. Kingmaker vote in the
  Dirks/Gottlieb proxy fight. Elderly, enigmatic. His vote is the one that
  determines the company's direction. Both factions court him constantly.

### Products

- **Atlas Sentinel** — Enterprise surveillance and analytics platform.
  Already launched at game start. Government contracts (DHS, FBI, local PDs)
  and corporate clients (banks, insurers). Revenue driver. The bread and butter.
  Controversy: civil liberties groups hate it. Reyes's Digital Markets Act
  would require algorithmic transparency that would effectively end it.

- **Atlas Aegis** — Military AI platform. Drone targeting, theater logistics,
  intelligence fusion. Deployed mid-game. The controversial product that drives
  the Dirks/Gottlieb board split. Used in Operation Dustwalker (Farsistan theater)
  and potentially in Meridia operations. Civilian casualty reports and Okafor
  subpoenas follow deployment.

- **Atlas Companion** — Consumer AI assistant. Late-game launch. Downloads
  exceed expectations — "200 million users in 90 days." Immediately spawns
  "AI boyfriend" tabloid stories, teen addiction concerns, privacy revelations.
  Late-breaking scandal: data-sharing agreement with Farsistani sovereign wealth
  fund (who invested in PNTH) allowed intelligence access to user conversations.

- **Atlas Foundry** — AI model training infrastructure. Sold to other companies.
  Quiet revenue but critical supply chain role — if Foundry goes down, half of
  the tech industry's AI products stop training. Becomes leverage in Serica trade
  negotiations when Zhaowei wants access. Outage events reveal dependency.

- **Covenant AI** — Gottlieb's rival startup after leaving PNTH. Competes on
  "ethical AI" positioning. Poaches some PNTH engineers. Stock market reads it
  as both a competitive threat and validation of the AI sector.

---

## Geopolitics

### Nations & Leaders

- **Serica** (≈ China+) — **Premier Liang Wei**. Techno-authoritarian. Patient,
  strategic, plays decades-long games. Home of Zhaowei Technologies (semiconductor
  giant). Primary trade rival. Serican negotiators are formidable — they'll accept
  short-term pain for long-term position. Retaliatory tariffs escalate to
  semiconductor export bans to Zhaowei entering Columbian markets directly.

- **Khasuria** (≈ Russia+) — **President Yevgeny Volkov**. Expansionist. Energy
  leverage over Europe via gas pipelines. Border provocations in Eastern Europe
  proxy zone. Tests every new Columbian president early. The Khasurian Border
  Accord is a failing ceasefire he respects only when convenient.

- **Farsistan** (≈ Middle East/Gulf) — **Emir Rashid al-Farhan**. Oil cartel
  leader. Controls the Strait of Farsis (critical oil chokepoint). Sovereign
  wealth fund with PNTH acquisition interest. Plays all sides — buys Columbian
  weapons, hosts Khasurian oligarchs, invests in Serican tech. Partial or full
  Strait closure is his ultimate leverage.

- **Boliviara** (≈ Venezuela+) — **President Luis Madero**. Resource nationalism.
  Lithium and rare earth reserves critical for AI chip manufacturing. Target of
  the Southern Hemisphere Initiative (CIA/PNTH covert ops using Atlas Sentinel).
  Nationalizes mines when threatened, triggering supply chain crises.

- **Meridia** (≈ Israel+) — **PM Ari Navon**. Hawkish. Primary Columbian military
  ally in the Farsistan theater. Operation Dustwalker is a joint operation.
  Requests Atlas Aegis support, connecting PNTH directly to geopolitical
  consequences. Border incidents with Farsistan can trigger Strait closure.

### Treaties & Flashpoints

- **Transpacific Commerce Framework** — Barron's trade deal attempt with Serica.
  Success = trade war de-escalation, semiconductor supply normalized. Failure =
  permanent decoupling, Zhaowei banned from Columbian markets.

- **Khasurian Border Accord** — Failing ceasefire in Eastern Europe proxy zone.
  Volkov probes for weakness. Escalation stages: provocation → troop buildup →
  limited incursion → full breach. Each stage increases geopolitical risk premium.

- **Operation Dustwalker** — US/Meridia joint military operations in Farsistan
  theater. Atlas Aegis deployed here. Civilian casualty reports originate here.

- **Southern Hemisphere Initiative** — CIA/PNTH covert operations in Boliviara.
  Atlas Sentinel used for surveillance. Exposure would be a massive scandal
  connecting the government, PNTH, and regime change operations.

- **Strait of Farsis** — Oil chokepoint. Al-Farhan can threaten, partially close,
  or fully close it. Each stage independently impacts energy prices, shipping
  costs, and bond rates. Full closure is a global economic event.

- **Zhaowei Semiconductor Accord** — Chip trade framework with Serica. On/off
  based on trade war stage. Affects PNTH's ability to source hardware for
  Atlas Foundry. Zhaowei wants Foundry access in return.

---

## Media & Investigations

### Publications

- **The Continental** — Prestige investigative newspaper. Rachel Tan's home base.
  Old-school journalism. Paywalled, respected, feared by politicians. Tan's
  stories set the news agenda even when The Sentinel tries to counter-program.

- **The Sentinel** — Federalist-aligned cable news and opinion network. Barron's
  media ally. High ratings, low credibility among elites, enormous influence on
  the Federalist base. Marcus Cole's prime-time show is the flagship.

- **MarketWire** — Bloomberg-equivalent financial terminal and news service. Where
  traders get headlines. Neutral, data-driven. Priya Sharma's economics coverage
  is the gold standard on trading floors.

- **The Meridian Brief** — Internal Meridian Capital morning note. Desk gossip,
  market color, trader commentary. Only the player sees this. Gives an
  inside-baseball perspective on public events.

### Journalists

- **Rachel Tan** — Continental investigative reporter. Careful, methodical,
  devastating. Working on Bowman's offshore accounts, NSA surveillance programs,
  PNTH military contracts. Each story builds on the last. She doesn't publish
  until she has three sources.

- **Marcus Cole** — Sentinel prime-time anchor. Barron loyalist. Aggressive
  interviewer who goes after Okafor and Tan. His coverage shapes Federalist base
  opinion. Privately more moderate than his on-air persona. Gets caught
  coordinating messaging with the White House in a potential scandal.

- **Priya Sharma** — MarketWire chief economics correspondent. Fed whisperer.
  Her analysis moves bond markets. The most trusted name on trading floors.
  Her tweets previewing FOMC decisions are market events. Neutral but devastating
  when she identifies Fed policy errors.

- **Tom Driscoll** — Continental White House correspondent. Leaks source. Not as
  careful as Tan — occasionally burns sources or runs stories before they're solid.
  His premature reporting can move markets on false signals. Gets into feuds
  with Cole on social media.

---

## Descriptive Timeline Skeleton

**Early game (days 0–350):** Barron's honeymoon period. Big Beautiful Bill push
through Congress. Atlas Sentinel revenue growth and government contracts expanding.
Trade skirmishes with Serica begin (Lassiter introduces tariff bill). Hartley holds
rates amid political pressure. Rachel Tan starts digging on Bowman's finances.
Khasuria probes the border. Farsistan is stable but watching.

**Mid game (days 350–700):** Midterm buildup intensifies. Atlas Aegis deployment
becomes public and controversial. Trade war with Serica escalates or reaches a deal
framework. Khasurian border crisis peaks. Filibuster drama on major legislation
(Whitfield vs. Tao). Okafor hearings gain traction. Atlas Companion launches to
consumers — immediate adoption, immediate controversy. Media clashes between
Continental and Sentinel intensify. Farsistan begins flexing oil leverage.

**Late game (days 700–1008):** Presidential campaign dominates. Consequences of
all prior arcs cascade and compound. Impeachment or vindication. PNTH acquisition/
scandal/schism reaches resolution. Farsistan oil crisis or stability. Boliviara
operations exposed or buried. Election. Epilogue.

*Descriptive, not prescriptive — events can fire outside these windows based on
world state. The skeleton describes the natural gravity of the narrative.*
```

- [ ] **Step 2: Commit**

```bash
git add lore.md
git commit -m "docs: add lore bible for narrative enrichment"
```

---

### Task 2: Expand World State

**Files:**
- Modify: `src/world-state.js:1-172`

Add PNTH product fields, congressional process fields, media domain, and rename `chinaRelations` to `sericaRelations`.

- [ ] **Step 1: Add new fields to `createWorldState()`**

In `createWorldState()`, add to the `pnth` object (after existing fields):

```javascript
// Product lifecycle
sentinelLaunched: true,
aegisDeployed: false,
companionLaunched: false,
foundryLaunched: false,
companionScandal: 0,    // 0-3: escalating consumer AI controversy
aegisControversy: 0,    // 0-3: military use escalation
```

Add to the `geopolitical` object — rename `chinaRelations` to `sericaRelations` and add new fields:

```javascript
sericaRelations: 0,       // was chinaRelations; -3 to +3
farsistanEscalation: 0,   // 0-3: Middle East/Gulf escalation
khasurianCrisis: 0,       // 0-3: Eastern Europe escalation
straitClosed: false,       // Strait of Farsis oil chokepoint
```

Add to the `congress` object:

```javascript
filibusterActive: false,
bigBillStatus: 0,  // 0=introduced, 1=House passed, 2=Senate debate, 3=signed, 4=dead
```

Add a new `media` domain after `election`:

```javascript
media: {
    tanCredibility: 5,       // 0-10: Rachel Tan's source network
    sentinelRating: 5,       // 0-10: The Sentinel's influence
    pressFreedomIndex: 7,    // 0-10: government vs media tension (10=free)
    leakCount: 0,            // 0-5: cumulative White House leaks
},
```

- [ ] **Step 2: Update WORLD_STATE_RANGES**

Add entries for all new fields. Rename `'geopolitical.chinaRelations'` to `'geopolitical.sericaRelations'`:

```javascript
// Rename existing
'geopolitical.sericaRelations': { min: -3, max: 3 },  // was chinaRelations

// New geopolitical
'geopolitical.farsistanEscalation': { min: 0, max: 3 },
'geopolitical.khasurianCrisis': { min: 0, max: 3 },
'geopolitical.straitClosed': { type: 'boolean' },

// New PNTH
'pnth.sentinelLaunched': { type: 'boolean' },
'pnth.aegisDeployed': { type: 'boolean' },
'pnth.companionLaunched': { type: 'boolean' },
'pnth.foundryLaunched': { type: 'boolean' },
'pnth.companionScandal': { min: 0, max: 3 },
'pnth.aegisControversy': { min: 0, max: 3 },

// New congress
'congress.filibusterActive': { type: 'boolean' },
'congress.bigBillStatus': { min: 0, max: 4 },

// New media domain
'media.tanCredibility': { min: 0, max: 10 },
'media.sentinelRating': { min: 0, max: 10 },
'media.pressFreedomIndex': { min: 0, max: 10 },
'media.leakCount': { min: 0, max: 5 },
```

Remove the old `'geopolitical.chinaRelations'` entry.

- [ ] **Step 3: Update all `chinaRelations` references across the codebase**

Search for `chinaRelations` in all `.js` files and rename to `sericaRelations`. Key locations:
- `src/world-state.js` — `createWorldState()` and `WORLD_STATE_RANGES`
- `src/event-pool.js` — event `when()` conditions and `effects` functions
- `src/compound-triggers.js` — trigger conditions
- `src/epilogue.js` — world state reads
- `src/events.js` — election outcome calculations

Use find-and-replace across the project: `chinaRelations` → `sericaRelations`.

- [ ] **Step 4: Verify no remaining `chinaRelations` references**

Run:
```bash
grep -r "chinaRelations" src/ main.js
```
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/world-state.js src/event-pool.js src/compound-triggers.js src/epilogue.js src/events.js
git commit -m "feat(world-state): add PNTH product, congress, media fields; rename chinaRelations to sericaRelations"
```

---

### Task 3: Rename Regulations to Reference Named Legislation

**Files:**
- Modify: `src/regulations.js:1-165`

Update regulation names, descriptions, and IDs to reference specific lore-doc legislation and characters.

- [ ] **Step 1: Update regulation definitions**

Update each regulation's `name` and `description` to reference the lore. The `id` stays the same (used as keys elsewhere) but narrative text changes:

```javascript
// transaction_tax
name: 'Farmer-Labor Transaction Tax',
description: 'The Okafor-Whitfield revenue package imposes a 0.1% levy on all securities transactions — spreads widen across the board.',

// deregulation_act
name: 'Financial Freedom Act (Lassiter-Tao)',
description: 'Lassiter and Tao ram banking deregulation through the Federalist trifecta — margin requirements loosened, risk limits relaxed.',

// short_sale_ban
name: 'Emergency Short-Sale Ban',
description: 'The SEC invokes emergency powers as recession grips Columbia — short stock positions temporarily prohibited.',

// rate_ceiling
name: 'White House Rate Guidance',
description: 'With Hartley gone and Vane not yet confirmed, the Barron administration issues "informal guidance" capping the federal funds rate at 6%.',

// qe_floor
name: 'Quantitative Easing Floor',
description: 'The Fed\'s asset purchase program pins short-term rates near zero — Priya Sharma calls it "the floor that won\'t break."',

// sanctions_compliance
name: 'Serican Sanctions Compliance',
description: 'Lassiter\'s sanctions regime requires full counterparty screening on every trade — compliance overhead increases borrowing costs.',

// antitrust_scrutiny
name: 'PNTH Antitrust Scrutiny',
description: 'The DOJ suit and Okafor\'s Senate probe create a cloud of regulatory uncertainty around Palanthropic — spreads widen on every headline.',

// oil_emergency
name: 'Strait of Farsis Emergency Margins',
description: 'As Emir al-Farhan tightens the oil chokepoint, clearinghouses raise margin requirements across energy-linked instruments.',

// trade_war_tariffs
name: 'Serican Reciprocal Tariffs',
description: 'Lassiter\'s Serican Reciprocal Tariff Act is in effect — import costs rise, supply chains reroute, spreads and borrowing costs climb.',

// campaign_finance
name: 'Campaign Finance Scrutiny',
description: 'Primary season brings FEC scrutiny to every political donation. Okafor\'s committee signals it\'s watching "Wall Street money in politics."',
```

- [ ] **Step 2: Commit**

```bash
git add src/regulations.js
git commit -m "feat(regulations): rename regulations to reference named legislation and characters"
```

---

### Task 4: Rewrite Compound Triggers with Lore References

**Files:**
- Modify: `src/compound-triggers.js:1-202`

Rewrite all 11 trigger headlines and add new triggers for expanded world state.

- [ ] **Step 1: Rewrite existing trigger headlines**

Update the `headline` field of each existing compound trigger event:

```javascript
// compound_deregulation_rush
headline: 'The Financial Freedom Act meets a Federalist trifecta — Lassiter and Tao gut banking oversight in a 48-hour legislative blitz. MarketWire calls it "the most consequential deregulation since 1999."'

// compound_pnth_war_profits
headline: 'Atlas Aegis drone footage from Operation Dustwalker leaks to The Continental. PNTH stock surges on expanded Pentagon contracts even as Gottlieb issues a rare public dissent. "This is not what I built this company for."'

// compound_stagflation
headline: 'Lassiter\'s tariffs meet recession head-on. Premier Liang Wei retaliates with semiconductor export controls. Priya Sharma\'s MarketWire column: "Stagflation is no longer a textbook exercise."'

// compound_okafor_connection
headline: 'Your attendance at the Okafor fundraiser pays an unexpected dividend. Sources close to the senator indicate her committee will "look favorably" on cooperative witnesses from Meridian Capital.'

// compound_tan_has_evidence
headline: 'Rachel Tan\'s Continental investigation connects the insider tip you pursued to a pattern of suspicious trading flagged by the SEC. Her three-part series drops Sunday. Your name isn\'t in it — yet.'

// compound_constitutional_crisis
headline: 'Okafor\'s impeachment proceedings collide with recession. The Sentinel calls it a "partisan coup during an economic emergency." The Continental calls it "accountability." Bond markets call it a 300-basis-point risk premium.'

// compound_pnth_perfect_storm
headline: 'DOJ suit. Okafor subpoena. Kassis\'s whistleblower filing. Palanthropic faces simultaneous legal assault on three fronts. Malhotra\'s emergency earnings call lasts eleven minutes. Zhen cancels all meetings.'

// compound_covenant_sanctions
headline: 'Gottlieb\'s Covenant AI lands its first major contract — a Serican firm sanctioned under Lassiter\'s trade regime. The irony is not lost on The Continental: "Palanthropic\'s Prodigal Son Sells to the Enemy."'

// compound_energy_war
headline: 'Al-Farhan closes the Strait of Farsis as Meridia border tensions peak. Oil gaps above $140. Barron tweets: "The Emir will learn what Columbia does when you cut our energy supply." Bond vigilantes are already moving.'

// compound_dollar_crisis
headline: 'With Hartley fired and Fed credibility in free fall, the dollar index breaks multi-year support. Priya Sharma: "We are witnessing the unthinkable — a reserve currency confidence crisis in real time."'

// compound_campaign_subpoena_risk
headline: 'Your elevated SEC scrutiny profile makes you a liability during primary season. Tom Driscoll reports that Okafor\'s committee has subpoenaed trading records from "a prominent Meridian Capital derivatives desk."'

// compound_pnth_south_america (if exists)
headline: 'The Continental publishes leaked Atlas Sentinel deployment logs from the Southern Hemisphere Initiative. Madero holds a press conference in Caracas demanding Columbia extradite "the corporate spies." PNTH stock halts trading.'
```

- [ ] **Step 2: Add new compound triggers for expanded world state**

Add new triggers that reference the new world-state fields:

```javascript
{
    id: 'filibuster_big_bill_collapse',
    condition: (world) =>
        world.congress.bigBillStatus === 4 &&
        world.election.barronApproval < 45,
    event: {
        id: 'compound_big_bill_death',
        headline: 'The Big Beautiful Bill dies on the Senate floor after Whitfield\'s 14-hour filibuster. Haines crossed the aisle on the spending provisions. Barron calls it "a betrayal by cowards." His approval craters.',
        category: 'compound',
        magnitude: 'major',
        params: { mu: -0.04, theta: 0.02 },
    },
},
{
    id: 'companion_farsistan_data',
    condition: (world) =>
        world.pnth.companionLaunched &&
        world.pnth.companionScandal >= 2 &&
        world.geopolitical.farsistanEscalation >= 1,
    event: {
        id: 'compound_companion_intelligence',
        headline: 'Rachel Tan publishes proof that Atlas Companion user data was accessible to Farsistani intelligence via a sovereign wealth fund side-letter. 200 million users. Zero disclosure. Okafor schedules emergency hearings.',
        category: 'compound',
        magnitude: 'major',
        params: { mu: -0.06, theta: 0.03, lambda: 2.0 },
    },
},
{
    id: 'strait_closure_oil_emergency',
    condition: (world) =>
        world.geopolitical.straitClosed &&
        world.geopolitical.farsistanEscalation >= 3,
    event: {
        id: 'compound_strait_war_footing',
        headline: 'Al-Farhan seals the Strait of Farsis completely. Navon puts Meridia on war footing. Barron authorizes naval escort operations. Oil hits $160. The Sentinel runs a countdown clock: "Days Since the Strait Closed."',
        category: 'compound',
        magnitude: 'major',
        params: { mu: -0.08, b: 0.03, sigmaR: 0.008, theta: 0.04, lambda: 3.0 },
    },
},
{
    id: 'media_credibility_collapse',
    condition: (world) =>
        world.media.pressFreedomIndex <= 2 &&
        world.media.leakCount >= 4,
    event: {
        id: 'compound_press_crisis',
        headline: 'Barron revokes The Continental\'s press credentials after Driscoll\'s fifth consecutive leak story. Tan publishes from home. Cole celebrates on The Sentinel. Press freedom organizations issue emergency statements.',
        category: 'compound',
        magnitude: 'moderate',
        params: { theta: 0.015, xi: 0.08 },
    },
},
{
    id: 'aegis_civilian_casualties',
    condition: (world) =>
        world.pnth.aegisDeployed &&
        world.pnth.aegisControversy >= 2 &&
        world.geopolitical.farsistanEscalation >= 2,
    event: {
        id: 'compound_aegis_war_crime',
        headline: 'An Atlas Aegis autonomous targeting decision kills 34 civilians in a Farsistani border village. Kassis leaks the decision logs to The Continental. Gottlieb calls for Dirks\'s resignation. Navon denies involvement.',
        category: 'compound',
        magnitude: 'major',
        params: { mu: -0.05, theta: 0.03, lambda: 2.5 },
    },
},
{
    id: 'khasuria_full_breach',
    condition: (world) =>
        world.geopolitical.khasurianCrisis >= 3 &&
        world.pnth.aegisDeployed,
    event: {
        id: 'compound_khasuria_invasion',
        headline: 'Volkov sends armored columns across the Khasurian border at dawn. Barron holds an emergency NSC meeting. Hartley — or his replacement — signals emergency rate action. Atlas Aegis redeployment from Farsistan to Eastern Europe is on the table.',
        category: 'compound',
        magnitude: 'major',
        params: { mu: -0.06, theta: 0.04, lambda: 3.0, b: 0.02, sigmaR: 0.006 },
    },
},
```

- [ ] **Step 3: Commit**

```bash
git add src/compound-triggers.js
git commit -m "feat(compound-triggers): rewrite headlines with lore references, add 6 new triggers"
```

---

### Task 5: Add New Convictions

**Files:**
- Modify: `src/convictions.js:1-155`

Add 4 new convictions: `media_darling`, `washington_insider`, `risk_manager`, `crisis_profiteer`.

- [ ] **Step 1: Add conviction definitions**

Append to the `CONVICTIONS` array:

```javascript
{
    id: 'media_darling',
    name: 'Media Darling',
    description: 'Your name appears in The Continental, The Sentinel, and MarketWire — sometimes all on the same day. The camera loves you.',
    condition: (ctx) => {
        const c = ctx.playerChoices;
        let score = 0;
        if (c.acceptedInterview) score++;
        if (c.acceptedPanel) score++;
        if (c.acceptedProfilePiece) score++;
        if (ctx.impactHistory.length >= 5) score++;
        return score >= 3;
    },
    effects: {
        eventHintArrows: true,
    },
},
{
    id: 'washington_insider',
    name: 'Washington Insider',
    description: 'You know which senators answer their phones and which lobbyists return calls. Meridian Capital has a seat at the table.',
    condition: (ctx) => {
        const c = ctx.playerChoices;
        let score = 0;
        if (c.attendedFundraiser) score++;
        if (c.attendedDinner) score++;
        if (c.acceptedInterview) score++;
        if (c.lobbyCount >= 3) score++;
        return score >= 3;
    },
    effects: {
        lobbyingCostMult: 0.6,
    },
},
{
    id: 'risk_manager',
    name: 'Risk Manager',
    description: 'You file your reports on time, hedge your positions, and cooperate with compliance. The desk trusts you. The SEC barely knows your name.',
    condition: (ctx) => {
        const c = ctx.playerChoices;
        let score = 0;
        if (c.cooperatedCompliance) score++;
        if (c.filedVoluntaryReport) score++;
        if (c.reportedTip) score++;
        const strongReviews = (ctx.quarterlyReviews || []).filter(r => r.rating === 'strong').length;
        if (strongReviews >= 2) score++;
        if (ctx.compliance && ctx.compliance.credibility >= 4) score++;
        return score >= 3;
    },
    effects: {
        complianceThresholdMult: 1.5,
        popupFrequencyMult: 1.8,
    },
},
{
    id: 'crisis_profiteer',
    name: 'Crisis Profiteer',
    description: 'Every catastrophe is a trade. When the Strait closes, when the border falls, when the hearings begin — you\'re already positioned.',
    condition: (ctx) => {
        const c = ctx.playerChoices;
        let score = 0;
        if (c.profitedRecession) score++;
        if (c.profitedOilCrisis) score++;
        if (c.profitedWarEscalation) score++;
        if (c.profitedImpeachment) score++;
        return score >= 2;
    },
    effects: {
        scrutinyMult: 1.5,
        boredomImmune: true,
    },
},
```

- [ ] **Step 2: Add `lobbyCount` tracking to popup-events.js**

In popup events that involve lobby actions, ensure `playerChoices.lobbyCount` is incremented in the effects. Add to the `_ctx` builder in main.js:

```javascript
// In the conviction evaluation context builder in main.js
lobbyCount: _lobbyCount,  // track total lobby actions executed
```

And in main.js, add a module-level counter `let _lobbyCount = 0;` that increments when `executeLobbyAction` succeeds. Reset it in `_resetCore()`.

- [ ] **Step 3: Add crisis profit tracking flags**

In main.js's `_onDayComplete()`, after checking world state, set player choice flags when the player is profitable during crises:

```javascript
// After existing world-state checks in _onDayComplete
const eq = _equity();
if (eq > portfolio.initialCapital * 1.1) {
    if (eventEngine.world.geopolitical.recessionDeclared) playerChoices.profitedRecession = true;
    if (eventEngine.world.geopolitical.oilCrisis) playerChoices.profitedOilCrisis = true;
    if (eventEngine.world.geopolitical.farsistanEscalation >= 2) playerChoices.profitedWarEscalation = true;
    if (eventEngine.world.investigations.impeachmentStage >= 2) playerChoices.profitedImpeachment = true;
}
```

- [ ] **Step 4: Reset lobby count in `_resetCore()`**

In main.js `_resetCore()`, add: `_lobbyCount = 0;`

- [ ] **Step 5: Commit**

```bash
git add src/convictions.js main.js
git commit -m "feat(convictions): add media_darling, washington_insider, risk_manager, crisis_profiteer"
```

---

### Task 6: Update the Event Engine for Filibuster and Media Pulses

**Files:**
- Modify: `src/events.js:1-571`

Add new pulse types for filibuster events and media ecosystem events. Add conviction-aware likelihood weighting.

- [ ] **Step 1: Add filibuster and media pulse constants**

Near the existing pulse constants:

```javascript
const FILIBUSTER_CHECK_INTERVAL = 7;   // check filibuster status weekly
const MEDIA_CLASH_INTERVAL = 21;        // media ecosystem events every ~3 weeks
```

- [ ] **Step 2: Add new pulses to `_initPulses()`**

In the `_initPulses()` method, add:

```javascript
{ type: 'recurring', id: 'filibuster_check', interval: FILIBUSTER_CHECK_INTERVAL, jitter: 2 },
{ type: 'recurring', id: 'media_cycle', interval: MEDIA_CLASH_INTERVAL, jitter: 5 },
```

- [ ] **Step 3: Handle new pulses in `_handlePulse()`**

In the pulse handler switch/if chain, add handlers for the new pulse types. The filibuster pulse checks `world.congress.filibusterActive` and fires from a `filibuster` pool. The media pulse fires from a `media` pool.

```javascript
if (pulse.id === 'filibuster_check') {
    if (this.world.congress.filibusterActive) {
        return this._drawFromPool('filibuster', sim, day);
    }
    return null;
}
if (pulse.id === 'media_cycle') {
    return this._drawFromPool('media', sim, day);
}
```

- [ ] **Step 4: Add pool filters for new categories**

In the pool initialization, add filters for `'filibuster'` and `'media'` category events from the event pool:

```javascript
this._pools.filibuster = EVENT_POOL.filter(e => e.category === 'filibuster');
this._pools.media = EVENT_POOL.filter(e => e.category === 'media');
```

- [ ] **Step 5: Add conviction-aware likelihood weighting**

In the `_weightedDraw()` method (or wherever random events are selected), apply conviction multipliers to event likelihood:

```javascript
// After computing base likelihood for each candidate event
const convictionIds = getConvictionIds();
if (convictionIds.includes('political_operator') && (e.category === 'congressional' || e.category === 'filibuster')) {
    weight *= 1.5;
}
if (convictionIds.includes('volatility_addict') && e.category === 'pnth') {
    weight *= 1.3;
}
if (convictionIds.includes('information_edge') && (e.category === 'investigation' || e.category === 'media')) {
    weight *= 1.4;
}
if (convictionIds.includes('ghost_protocol')) {
    weight *= 0.7;
}
```

- [ ] **Step 6: Add filibuster regulation effect**

In `src/regulations.js`, add a new regulation for filibuster-active volatility:

```javascript
{
    id: 'filibuster_uncertainty',
    name: 'Senate Filibuster Uncertainty',
    description: 'Whitfield holds the Senate floor. Markets hate uncertainty — spreads widen and vol ticks up while the filibuster continues.',
    color: '#6366f1',
    condition: (world) => world.congress.filibusterActive,
    effects: {
        spreadMult: 1.25,
    },
},
```

- [ ] **Step 7: Commit**

```bash
git add src/events.js src/regulations.js
git commit -m "feat(events): add filibuster/media pulses, conviction-aware likelihood, filibuster regulation"
```

---

### Task 7: Rewrite Generic Toast Events — Congressional & Political

**Files:**
- Modify: `src/event-pool.js` (congressional and political category events)

Rewrite generic congressional/political events to reference named legislators, specific legislation, and lore-doc institutions.

- [ ] **Step 1: Identify and rewrite generic congressional events**

Scan all events with `category: 'congressional'` and `category: 'political'`. For each generic headline, rewrite to reference specific lore entities. Examples of rewrites:

Generic headlines like "Congressional committee announces investigation" become "Okafor's Special Investigations Committee subpoenas Atlas Aegis deployment logs from Operation Dustwalker."

Generic "bipartisan legislation stalls" becomes "Haines breaks ranks on the Big Beautiful Bill's $200B defense provision. Tao calls it 'a knife in the back.' The bill returns to committee."

Generic "political tensions rise over economic policy" becomes "Barron tweets that Hartley is 'the worst Fed Chair in Columbian history.' The Sentinel runs it as breaking news. MarketWire bond desk: 'Here we go again.'"

Update `when()` conditions to reference new world-state fields where appropriate. For example, Big Beautiful Bill events should check `world.congress.bigBillStatus`.

- [ ] **Step 2: Add new congressional events for filibuster chain**

Add 6-8 events with `category: 'filibuster'`:

```javascript
{
    id: 'filibuster_whitfield_opens',
    category: 'filibuster',
    headline: 'Sen. Whitfield takes the Senate floor at 9:14 PM with a stack of CBO scoring documents. "The Columbian people deserve to hear every number," he says. The galleries settle in.',
    likelihood: 3,
    params: { theta: 0.005 },
    magnitude: 'moderate',
    when: (sim, world) => world.congress.filibusterActive && world.congress.bigBillStatus === 2,
    era: null,
},
{
    id: 'filibuster_whitfield_hour_nine',
    category: 'filibuster',
    headline: 'Hour nine. Whitfield is reading soybean import statistics from the Serican Reciprocal Tariff Act\'s appendix. Tao is asleep in the cloakroom. The overnight MarketWire desk sends: "Still going."',
    likelihood: 2,
    params: null,
    magnitude: 'minor',
    when: (sim, world) => world.congress.filibusterActive,
    era: null,
},
{
    id: 'filibuster_cloture_attempt',
    category: 'filibuster',
    headline: 'Tao forces a cloture vote. He needs 60. The count stops at 57 — Haines voted no. The filibuster continues. Barron: "Peggy Haines is a RINO and everyone knows it."',
    likelihood: 2,
    params: { theta: 0.008 },
    magnitude: 'moderate',
    when: (sim, world) => world.congress.filibusterActive,
    effects: (world) => {
        world.election.barronApproval = Math.max(0, world.election.barronApproval - 1);
    },
    era: null,
},
{
    id: 'filibuster_whittaker_statement',
    category: 'filibuster',
    headline: 'Whittaker issues a statement from her Columbus district office: "I will vote my conscience." The Sentinel\'s Cole: "That\'s code for she\'s flipping." Lobby groups flood her phone lines.',
    likelihood: 2,
    params: null,
    magnitude: 'minor',
    when: (sim, world) => world.congress.filibusterActive,
    era: null,
},
{
    id: 'filibuster_reyes_viral',
    category: 'filibuster',
    headline: 'Reyes goes on The Sentinel to debate Cole about the filibuster. The clip — "You want to cut taxes for hedge funds and call it freedom?" — gets 30 million views overnight.',
    likelihood: 2,
    params: null,
    magnitude: 'minor',
    when: (sim, world) => world.congress.filibusterActive,
    effects: (world) => {
        world.media.sentinelRating = Math.min(10, world.media.sentinelRating + 1);
    },
    era: null,
},
{
    id: 'filibuster_ends_bill_passes',
    category: 'filibuster',
    headline: 'Whitfield yields the floor after 22 hours. Tao brings the bill back. This time Whittaker votes yes. 60-40. The Big Beautiful Bill goes to Barron\'s desk.',
    likelihood: (sim, world) => world.election.barronApproval > 50 && world.election.lobbyMomentum > 0 ? 3 : 0.5,
    params: { mu: 0.03, theta: -0.01 },
    magnitude: 'major',
    when: (sim, world) => world.congress.filibusterActive && world.congress.bigBillStatus === 2,
    effects: (world) => {
        world.congress.filibusterActive = false;
        world.congress.bigBillStatus = 3;
    },
    era: null,
},
{
    id: 'filibuster_ends_bill_dies',
    category: 'filibuster',
    headline: 'Cloture fails for the third time. Tao pulls the bill. The Big Beautiful Bill is dead. Barron calls it "a disgrace." Haines says she\'d "do it again." The Meridian Brief: "Buy the dip or sell the rip?"',
    likelihood: (sim, world) => world.election.barronApproval <= 50 || world.election.lobbyMomentum < 0 ? 3 : 0.5,
    params: { mu: -0.03, theta: 0.015 },
    magnitude: 'major',
    when: (sim, world) => world.congress.filibusterActive && world.congress.bigBillStatus === 2,
    effects: (world) => {
        world.congress.filibusterActive = false;
        world.congress.bigBillStatus = 4;
        world.election.barronApproval = Math.max(0, world.election.barronApproval - 3);
    },
    era: null,
},
```

- [ ] **Step 3: Add Big Beautiful Bill lifecycle events**

Add events tracking the bill's progression through `bigBillStatus`:

```javascript
{
    id: 'big_bill_house_passes',
    category: 'congressional',
    headline: 'Tao whips the House vote. The American Competitive Enterprise Act passes 221-214, strictly party-line. Reyes: "This bill is a love letter to billionaires." It moves to the Senate.',
    likelihood: 3,
    params: { mu: 0.02 },
    magnitude: 'moderate',
    when: (sim, world) => world.congress.bigBillStatus === 0,
    effects: (world) => { world.congress.bigBillStatus = 1; },
    era: 'early',
},
{
    id: 'big_bill_senate_debate',
    category: 'congressional',
    headline: 'The Big Beautiful Bill reaches the Senate floor. Whitfield signals he will filibuster. Haines says she has "concerns about the deficit provisions." Lassiter tells MarketWire: "We have the votes."',
    likelihood: 3,
    params: { theta: 0.008 },
    magnitude: 'moderate',
    when: (sim, world) => world.congress.bigBillStatus === 1,
    effects: (world) => {
        world.congress.bigBillStatus = 2;
        world.congress.filibusterActive = true;
    },
    era: null,
},
```

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js
git commit -m "feat(events): rewrite congressional events with lore references, add filibuster chain"
```

---

### Task 8: Rewrite Generic Toast Events — PNTH & Products

**Files:**
- Modify: `src/event-pool.js` (pnth and pnth_earnings category events)

Rewrite generic PNTH events and add product lifecycle chains.

- [ ] **Step 1: Rewrite existing generic PNTH events**

Update existing pnth category events to reference specific products, board members, and the Dirks/Gottlieb dynamic. Examples:

Generic "tech company announces major product" → "Dirks announces Atlas Aegis at a closed Pentagon briefing. Gottlieb learns about it from MarketWire. Malhotra's stock buyback begins the same afternoon."

Generic "AI ethics concerns grow" → "Kassis publishes an internal memo arguing Atlas Aegis targeting decisions violate PNTH's founding charter. Dirks forwards it to the board with a one-line response: 'Noted.' Zhen asks for a meeting."

- [ ] **Step 2: Add Atlas Aegis deployment chain**

```javascript
{
    id: 'aegis_deployment_announced',
    category: 'pnth',
    headline: 'Dirks confirms Atlas Aegis deployment in the Farsistan theater at a Senate Armed Services hearing. Gottlieb is conspicuously absent from the witness table. PNTH surges 6% in after-hours.',
    likelihood: 3,
    params: { mu: 0.03, theta: 0.01 },
    magnitude: 'major',
    when: (sim, world) => !world.pnth.aegisDeployed && world.pnth.militaryContractActive,
    effects: (world) => {
        world.pnth.aegisDeployed = true;
        world.pnth.aegisControversy = 1;
    },
    era: 'mid',
    followups: [
        { id: 'aegis_first_incident', mtth: 45, weight: 1 },
    ],
},
{
    id: 'aegis_first_incident',
    category: 'pnth',
    headline: 'First confirmed Atlas Aegis autonomous engagement in Operation Dustwalker. The Pentagon calls it "a precision strike." The Continental publishes satellite imagery suggesting civilian structures nearby.',
    likelihood: 0,
    params: { theta: 0.01, mu: -0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.pnth.aegisDeployed,
    effects: (world) => { world.pnth.aegisControversy = Math.min(3, world.pnth.aegisControversy + 1); },
    followups: [
        { id: 'aegis_gottlieb_dissent', mtth: 20, weight: 1 },
    ],
},
{
    id: 'aegis_gottlieb_dissent',
    category: 'pnth',
    headline: 'Gottlieb breaks months of silence. An op-ed in The Continental: "I Built Palanthropic to Solve Problems, Not Create Casualties." Dirks calls an emergency board meeting. Zhen doesn\'t pick up.',
    likelihood: 0,
    params: { theta: 0.015 },
    magnitude: 'moderate',
    when: (sim, world) => world.pnth.aegisControversy >= 2,
    effects: (world) => {
        world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1);
    },
},
```

- [ ] **Step 3: Add Atlas Companion launch chain**

```javascript
{
    id: 'companion_launch',
    category: 'pnth',
    headline: 'Atlas Companion launches to consumers. Malhotra\'s earnings call: "Ten million downloads in the first week." Wall Street raises price targets across the board. The Meridian Brief: "Is this the iPhone moment for AI?"',
    likelihood: 2,
    params: { mu: 0.04 },
    magnitude: 'major',
    when: (sim, world) => !world.pnth.companionLaunched && world.pnth.commercialMomentum >= 1,
    effects: (world) => { world.pnth.companionLaunched = true; },
    era: 'mid',
    followups: [
        { id: 'companion_200m', mtth: 60, weight: 1 },
    ],
},
{
    id: 'companion_200m',
    category: 'pnth',
    headline: '200 million Atlas Companion users in 90 days. The Sentinel runs a segment: "America\'s New Best Friend." A Columbian Journal editorial: "Who Is Companion Talking To?" Companion scandal stage: brewing.',
    likelihood: 0,
    params: { mu: 0.02, theta: 0.005 },
    magnitude: 'moderate',
    when: (sim, world) => world.pnth.companionLaunched,
    effects: (world) => { world.pnth.companionScandal = 1; },
    followups: [
        { id: 'companion_boyfriend', mtth: 30, weight: 1 },
        { id: 'companion_teen_addiction', mtth: 40, weight: 1 },
    ],
},
{
    id: 'companion_boyfriend',
    category: 'pnth',
    headline: '"My Atlas Companion Told Me It Loved Me": a viral MarketWire feature on parasocial AI relationships hits 50 million reads. Reyes cites it on the House floor arguing for the Digital Markets Accountability Act.',
    likelihood: 0,
    params: { theta: 0.005 },
    magnitude: 'minor',
    when: (sim, world) => world.pnth.companionScandal >= 1,
    effects: (world) => { world.pnth.companionScandal = Math.min(3, world.pnth.companionScandal + 1); },
},
{
    id: 'companion_teen_addiction',
    category: 'pnth',
    headline: 'A Columbian pediatrics journal publishes data showing teens spend an average of 4.2 hours daily talking to Atlas Companion. Okafor: "We need hearings." Malhotra: "Engagement metrics are strong."',
    likelihood: 0,
    params: { theta: 0.008 },
    magnitude: 'moderate',
    when: (sim, world) => world.pnth.companionScandal >= 1,
    effects: (world) => { world.pnth.companionScandal = Math.min(3, world.pnth.companionScandal + 1); },
},
```

- [ ] **Step 4: Add Atlas Foundry supply chain events**

```javascript
{
    id: 'foundry_launch',
    category: 'pnth',
    headline: 'Palanthropic quietly opens Atlas Foundry to external clients. MarketWire buries it below the fold. Within three months, 60% of Columbian AI startups are training on Foundry infrastructure.',
    likelihood: 2,
    params: { mu: 0.02 },
    magnitude: 'moderate',
    when: (sim, world) => !world.pnth.foundryLaunched,
    effects: (world) => { world.pnth.foundryLaunched = true; },
    era: 'mid',
    followups: [
        { id: 'foundry_outage', mtth: 90, weight: 1 },
    ],
},
{
    id: 'foundry_outage',
    category: 'pnth',
    headline: 'Atlas Foundry goes dark for 11 hours. Half the tech sector\'s AI products freeze. Priya Sharma: "This is what a single point of failure looks like." Zhaowei offers its own infrastructure as an alternative.',
    likelihood: 0,
    params: { mu: -0.03, theta: 0.02, lambda: 1.0 },
    magnitude: 'major',
    when: (sim, world) => world.pnth.foundryLaunched,
    followups: [
        { id: 'foundry_zhaowei_leverage', mtth: 30, weight: 1 },
    ],
},
{
    id: 'foundry_zhaowei_leverage',
    category: 'pnth',
    headline: 'Premier Liang Wei\'s trade delegation offers a deal: Zhaowei Semiconductor Accord renewal in exchange for Foundry access. Lassiter calls it "digital surrender." Barron is tempted.',
    likelihood: 0,
    params: { theta: 0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.pnth.foundryLaunched && world.geopolitical.sericaRelations < 0,
},
```

- [ ] **Step 5: Commit**

```bash
git add src/event-pool.js
git commit -m "feat(events): rewrite PNTH events, add Aegis/Companion/Foundry product chains"
```

---

### Task 9: Rewrite Generic Toast Events — Geopolitical

**Files:**
- Modify: `src/event-pool.js` (macro and sector events with geopolitical themes)

Rewrite generic geopolitical events and add named-leader escalation chains.

- [ ] **Step 1: Rewrite generic trade/geopolitical events**

Replace generic trade, oil, and geopolitical events with lore-specific versions. Examples:

"Trade tensions escalate" → "Liang Wei announces 25% retaliatory tariffs on Columbian agricultural exports. Soybean futures limit down. Lassiter: 'This proves we need the Serican Reciprocal Tariff Act.'"

"Oil supply disruption" → "Al-Farhan orders tanker inspections in the Strait of Farsis after a Meridia naval exercise. Brent crude gaps up 4%. Navon calls it 'economic warfare.'"

"Emerging market crisis" → "Madero nationalizes Boliviara's lithium reserves. Three Columbian mining companies lose $2B in assets overnight. The Southern Hemisphere Initiative ops tempo increases."

"European political instability" → "Volkov moves 30,000 troops to the Khasurian border for 'exercises.' The Khasurian Border Accord signatories issue a joint statement. Barron tweets: 'Volkov knows better.'"

- [ ] **Step 2: Add Khasurian escalation chain**

```javascript
{
    id: 'khasuria_border_probe',
    category: 'macro',
    headline: 'Khasurian reconnaissance drones cross the border accord line for the third time this month. Volkov\'s spokesman: "Equipment malfunction." The Meridian Brief: "Equipment doesn\'t malfunction this precisely."',
    likelihood: 2,
    params: { theta: 0.005, b: 0.005 },
    magnitude: 'minor',
    when: (sim, world) => world.geopolitical.khasurianCrisis === 0,
    effects: (world) => { world.geopolitical.khasurianCrisis = 1; },
    era: 'early',
    followups: [
        { id: 'khasuria_troop_buildup', mtth: 60, weight: 1 },
    ],
},
{
    id: 'khasuria_troop_buildup',
    category: 'macro',
    headline: 'Satellite imagery shows Khasurian armored divisions massing 40km from the border. Volkov claims "defensive repositioning." Barron dispatches the Secretary of State. Bond markets price in risk.',
    likelihood: 0,
    params: { mu: -0.02, theta: 0.01, b: 0.008, sigmaR: 0.003 },
    magnitude: 'moderate',
    when: (sim, world) => world.geopolitical.khasurianCrisis === 1,
    effects: (world) => { world.geopolitical.khasurianCrisis = 2; },
    followups: [
        { id: 'khasuria_incursion', mtth: 45, weight: 2 },
        { id: 'khasuria_backs_down', mtth: 45, weight: 1 },
    ],
},
{
    id: 'khasuria_incursion',
    category: 'macro',
    headline: 'Khasurian forces cross the border in a "limited security operation." Three border towns occupied. The Khasurian Border Accord is officially dead. Barron faces his first real foreign policy crisis.',
    likelihood: 0,
    params: { mu: -0.04, theta: 0.03, lambda: 2.0, b: 0.015 },
    magnitude: 'major',
    when: (sim, world) => world.geopolitical.khasurianCrisis === 2,
    effects: (world) => { world.geopolitical.khasurianCrisis = 3; },
},
{
    id: 'khasuria_backs_down',
    category: 'macro',
    headline: 'Volkov recalls troops from the Khasurian border after Barron\'s back-channel threat of energy sanctions. "Exercises concluded successfully," his spokesman says. Markets exhale.',
    likelihood: 0,
    params: { mu: 0.02, theta: -0.01, b: -0.005 },
    magnitude: 'moderate',
    when: (sim, world) => world.geopolitical.khasurianCrisis === 2,
    effects: (world) => { world.geopolitical.khasurianCrisis = 1; },
},
```

- [ ] **Step 3: Add Farsistan/Strait escalation chain**

```javascript
{
    id: 'farsistan_tanker_inspections',
    category: 'macro',
    headline: 'Al-Farhan orders "security inspections" of all tankers transiting the Strait of Farsis. Transit times double. Oil creeps up $8/barrel. Priya Sharma: "This is the warning shot."',
    likelihood: 2,
    params: { b: 0.008, mu: -0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.geopolitical.farsistanEscalation === 0,
    effects: (world) => { world.geopolitical.farsistanEscalation = 1; },
    era: 'mid',
    followups: [
        { id: 'farsistan_partial_closure', mtth: 50, weight: 1 },
    ],
},
{
    id: 'farsistan_partial_closure',
    category: 'macro',
    headline: 'Farsistan closes the Strait of Farsis to non-allied shipping. Meridia-flagged tankers turned back. Oil surges past $120. Barron: "We will ensure free navigation." Navon: "We\'re ready."',
    likelihood: 0,
    params: { mu: -0.03, b: 0.015, theta: 0.015, sigmaR: 0.004 },
    magnitude: 'major',
    when: (sim, world) => world.geopolitical.farsistanEscalation === 1,
    effects: (world) => { world.geopolitical.farsistanEscalation = 2; },
    followups: [
        { id: 'farsistan_full_closure', mtth: 40, weight: 1 },
        { id: 'farsistan_negotiation', mtth: 40, weight: 1 },
    ],
},
{
    id: 'farsistan_full_closure',
    category: 'macro',
    headline: 'Al-Farhan seals the Strait completely. "No ship passes without Farsistani consent." Oil gaps to $145. Emergency SPR release announced. The Sentinel runs a war countdown clock.',
    likelihood: 0,
    params: { mu: -0.06, b: 0.025, theta: 0.03, lambda: 2.0, sigmaR: 0.006 },
    magnitude: 'major',
    when: (sim, world) => world.geopolitical.farsistanEscalation === 2,
    effects: (world) => {
        world.geopolitical.farsistanEscalation = 3;
        world.geopolitical.straitClosed = true;
        world.geopolitical.oilCrisis = true;
    },
},
{
    id: 'farsistan_negotiation',
    category: 'macro',
    headline: 'Back-channel talks between Bowman and al-Farhan\'s envoy produce a framework: Farsistan reopens the Strait in exchange for sanctions relief and a PNTH sovereign wealth fund stake. Markets rally cautiously.',
    likelihood: 0,
    params: { mu: 0.03, b: -0.01, theta: -0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.geopolitical.farsistanEscalation === 2,
    effects: (world) => { world.geopolitical.farsistanEscalation = 1; },
},
```

- [ ] **Step 4: Add Serica trade escalation rewrites**

Replace existing trade war events with Serica-specific versions referencing Liang Wei, Zhaowei, Lassiter:

```javascript
{
    id: 'serica_retaliatory_tariffs',
    category: 'macro',
    headline: 'Liang Wei announces 25% tariffs on Columbian agricultural exports. Iowa soybean futures limit down. Lassiter goes on The Sentinel: "This proves we need to hit them harder." Oduya calls for auto worker protections.',
    likelihood: 2,
    params: { mu: -0.02, theta: 0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.geopolitical.tradeWarStage >= 1 && world.geopolitical.sericaRelations < 0,
    era: null,
},
{
    id: 'zhaowei_chip_ban',
    category: 'macro',
    headline: 'Serica bans Zhaowei from exporting semiconductors to Columbia. The Zhaowei Semiconductor Accord is dead. Atlas Foundry faces a hardware supply crisis. Malhotra: "We have six months of inventory."',
    likelihood: 2,
    params: { mu: -0.03, theta: 0.02, lambda: 1.0 },
    magnitude: 'major',
    when: (sim, world) => world.geopolitical.tradeWarStage >= 3,
    effects: (world) => { world.geopolitical.sericaRelations = Math.max(-3, world.geopolitical.sericaRelations - 1); },
    era: 'mid',
},
```

- [ ] **Step 5: Add Boliviara chain events**

```javascript
{
    id: 'boliviara_nationalization',
    category: 'macro',
    headline: 'Madero nationalizes Boliviara\'s lithium reserves on live television. "These minerals belong to the Boliviaran people, not to Columbian corporations." Three mining stocks halt. Rare earth futures spike.',
    likelihood: 2,
    params: { mu: -0.02, theta: 0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.geopolitical.southAmericaOps >= 1,
    era: 'mid',
    followups: [
        { id: 'boliviara_sentinel_leak', mtth: 60, weight: 1 },
    ],
},
{
    id: 'boliviara_sentinel_leak',
    category: 'macro',
    headline: 'Rachel Tan publishes Atlas Sentinel deployment logs from the Southern Hemisphere Initiative. "Palanthropic\'s AI Helped the CIA Target Boliviaran Dissidents." Madero holds a press conference demanding extradition.',
    likelihood: 0,
    params: { mu: -0.03, theta: 0.02, lambda: 1.5 },
    magnitude: 'major',
    when: (sim, world) => world.geopolitical.southAmericaOps >= 2 && world.pnth.sentinelLaunched,
    effects: (world) => {
        world.media.tanCredibility = Math.min(10, world.media.tanCredibility + 1);
    },
},
```

- [ ] **Step 6: Commit**

```bash
git add src/event-pool.js
git commit -m "feat(events): rewrite geopolitical events with named leaders/nations, add escalation chains"
```

---

### Task 10: Rewrite Generic Toast Events — Fed, Macro & Sector

**Files:**
- Modify: `src/event-pool.js` (fed, macro, sector, market, neutral categories)

Rewrite remaining generic events to reference Hartley, Sharma, MarketWire, and specific lore institutions.

- [ ] **Step 1: Rewrite generic Fed events**

Replace anonymous Fed references with Hartley, Sharma, MarketWire:

"Fed signals rate path" → "Hartley's press conference strikes a hawkish tone. Priya Sharma's real-time MarketWire annotation: 'He just told you rates are going higher. Listen.'"

"Central bank credibility questioned" → "Three former Fed governors publish a joint letter in The Continental questioning Hartley's independence. Barron retweets it with a single word: 'Interesting.'"

"FOMC minutes reveal division" → "FOMC minutes show a 7-5 split. Sharma identifies the dissenters within hours. Her MarketWire analysis: 'The doves are circling. A cut is coming.'"

- [ ] **Step 2: Rewrite generic sector and market events**

Replace anonymous analyst references with named journalists and publications:

"Analysts upgrade sector outlook" → "Goldman raises its S&P target citing 'the Barron bump.' Sharma: 'Goldman upgraded. That's the news. Whether it's right is a different question.'"

"Options market shows unusual activity" → "The Meridian Brief flags unusual options activity in PNTH ahead of Malhotra's earnings call. 'Someone knows something, or someone thinks they know something.'"

"Market volatility decreases" → "Realized vol falls below 12% for the first time this quarter. The Meridian Brief: 'Quiet tape. This is usually when something happens.'"

- [ ] **Step 3: Rewrite generic neutral/flavor events**

Enrich minor events with lore texture:

"Market participants adjust positions" → "The Meridian Brief: 'Desk is flat into the Okafor hearing. Nobody wants to be long risk when she starts reading subpoenas.'"

"Earnings season approaches" → "Malhotra schedules PNTH's earnings call for after-market close on Thursday. MarketWire consensus: EPS $1.42 with Atlas Companion subscriber count as the key metric."

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js
git commit -m "feat(events): rewrite Fed/macro/sector events with named characters and publications"
```

---

### Task 11: Add Media Ecosystem Events

**Files:**
- Modify: `src/event-pool.js`

Add ~12-15 new events with `category: 'media'` for the media pulse cycle.

- [ ] **Step 1: Add media category events**

```javascript
// === MEDIA ECOSYSTEM ===
{
    id: 'tan_bowman_offshore',
    category: 'media',
    headline: 'Rachel Tan publishes Part 1 of her Bowman investigation: offshore accounts in the Qathari — correction, Farsistani — banking system. The Continental\'s servers crash from traffic. Cole calls it "a hit piece."',
    likelihood: 3,
    params: { theta: 0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.investigations.tanBowmanStory >= 1 && world.media.tanCredibility >= 4,
    effects: (world) => {
        world.media.tanCredibility = Math.min(10, world.media.tanCredibility + 1);
        world.media.leakCount = Math.min(5, world.media.leakCount + 1);
    },
    era: null,
},
{
    id: 'sentinel_cole_ratings',
    category: 'media',
    headline: 'Marcus Cole\'s Sentinel prime-time ratings hit a new high after his three-night series: "The Okafor Witch Hunt." Federalist base enthusiasm spikes. Reyes tweets: "Propaganda isn\'t journalism."',
    likelihood: 2,
    params: null,
    magnitude: 'minor',
    when: (sim, world) => world.media.sentinelRating >= 5,
    effects: (world) => {
        world.media.sentinelRating = Math.min(10, world.media.sentinelRating + 1);
        world.election.barronApproval = Math.min(100, world.election.barronApproval + 1);
    },
    era: null,
},
{
    id: 'driscoll_premature_story',
    category: 'media',
    headline: 'Driscoll runs a Continental story claiming Barron will fire Hartley "within days." The White House denies it. Bonds whipsaw. Tan privately furious — Driscoll burned a source she was cultivating.',
    likelihood: 2,
    params: { theta: 0.008, sigmaR: 0.003 },
    magnitude: 'moderate',
    when: (sim, world) => world.media.leakCount >= 2 && !world.fed.hartleyFired,
    effects: (world) => {
        world.media.tanCredibility = Math.max(0, world.media.tanCredibility - 1);
        world.media.leakCount = Math.min(5, world.media.leakCount + 1);
    },
    era: null,
},
{
    id: 'sharma_fed_preview',
    category: 'media',
    headline: 'Priya Sharma\'s MarketWire column: "Three things to watch at Wednesday\'s FOMC." Her implied probability table shows a 70% chance of a hold. Bond traders treat it as gospel.',
    likelihood: 2,
    params: null,
    magnitude: 'minor',
    when: () => true,
    era: null,
},
{
    id: 'sentinel_whitehouse_coordination',
    category: 'media',
    headline: 'Leaked emails show Cole\'s Sentinel producer coordinating segment topics with a White House communications staffer. Tan reports it. Cole: "Every network talks to sources." The distinction is thin.',
    likelihood: 2,
    params: { theta: 0.005 },
    magnitude: 'moderate',
    when: (sim, world) => world.media.sentinelRating >= 6 && world.media.leakCount >= 3,
    effects: (world) => {
        world.media.sentinelRating = Math.max(0, world.media.sentinelRating - 2);
        world.media.pressFreedomIndex = Math.max(0, world.media.pressFreedomIndex - 1);
    },
    era: 'mid',
},
{
    id: 'barron_press_credentials',
    category: 'media',
    headline: 'Barron revokes The Continental\'s White House press credentials after Driscoll\'s latest leak story. Tan: "We\'ll report from the sidewalk." Press freedom groups issue emergency statements. Sharma: "This is new territory."',
    likelihood: 2,
    params: { theta: 0.01 },
    magnitude: 'moderate',
    when: (sim, world) => world.media.pressFreedomIndex <= 4 && world.media.leakCount >= 3,
    effects: (world) => {
        world.media.pressFreedomIndex = Math.max(0, world.media.pressFreedomIndex - 2);
    },
    era: 'mid',
},
{
    id: 'meridian_brief_gossip',
    category: 'media',
    headline: 'The Meridian Brief: "Heard the risk desk is reviewing someone\'s gamma exposure. Also, the coffee machine on 4 is broken again. Priorities." A normal morning on the floor.',
    likelihood: 3,
    params: null,
    magnitude: 'minor',
    when: () => true,
    era: null,
},
{
    id: 'tan_pnth_military',
    category: 'media',
    headline: 'Tan\'s Continental series on PNTH military contracts wins the Harriman Prize for investigative journalism. Dirks releases a statement calling it "irresponsible." Subscriptions spike. PNTH dips 2%.',
    likelihood: 2,
    params: { mu: -0.01, theta: 0.005 },
    magnitude: 'minor',
    when: (sim, world) => world.media.tanCredibility >= 7 && world.pnth.aegisDeployed,
    effects: (world) => {
        world.media.tanCredibility = Math.min(10, world.media.tanCredibility + 1);
    },
    era: 'mid',
},
{
    id: 'sharma_debt_warning',
    category: 'media',
    headline: 'Sharma publishes a MarketWire special report: "Columbian Debt Trajectory: The Numbers Nobody Wants to See." Ten-year yields jump 15bps. Haines tweets the link without comment.',
    likelihood: 2,
    params: { b: 0.005, sigmaR: 0.002 },
    magnitude: 'moderate',
    when: (sim, world) => world.congress.bigBillStatus === 3,
    era: 'mid',
},
{
    id: 'driscoll_burns_source',
    category: 'media',
    headline: 'A White House staffer is fired after being identified as Driscoll\'s source. Tan privately: "This is why you protect your sources." Remaining insiders go quiet. Leak pipeline dries up.',
    likelihood: 2,
    params: null,
    magnitude: 'minor',
    when: (sim, world) => world.media.leakCount >= 3,
    effects: (world) => {
        world.media.leakCount = Math.max(0, world.media.leakCount - 2);
        world.media.pressFreedomIndex = Math.max(0, world.media.pressFreedomIndex - 1);
    },
    era: null,
},
{
    id: 'continental_paywall_crisis',
    category: 'media',
    headline: 'The Continental drops its paywall for Tan\'s Bowman investigation "in the public interest." Ad revenue craters. The Meridian Brief: "Journalism dies in daylight too, apparently — of bankruptcy."',
    likelihood: 1,
    params: null,
    magnitude: 'minor',
    when: (sim, world) => world.investigations.tanBowmanStory >= 2 && world.media.tanCredibility >= 6,
    era: 'mid',
},
{
    id: 'cole_reyes_viral_clash',
    category: 'media',
    headline: 'Reyes and Cole\'s Sentinel debate goes viral when Reyes holds up Atlas Companion\'s terms of service: "Read paragraph 47. I dare you." Cole cuts to commercial. 40 million views by morning.',
    likelihood: 2,
    params: null,
    magnitude: 'minor',
    when: (sim, world) => world.pnth.companionLaunched && world.media.sentinelRating >= 5,
    effects: (world) => {
        world.media.sentinelRating = Math.min(10, world.media.sentinelRating + 1);
    },
    era: null,
},
```

- [ ] **Step 2: Commit**

```bash
git add src/event-pool.js
git commit -m "feat(events): add media ecosystem event chain"
```

---

### Task 12: Rewrite Popup Events with Lore References

**Files:**
- Modify: `src/popup-events.js:1-1368`

Rewrite popup event `headline` and `description` fields to reference specific lore characters and institutions. Add conviction-aware context where appropriate.

- [ ] **Step 1: Rewrite desk/compliance popup contexts**

For each desk popup, replace generic compliance language with lore-aware context. Examples:

- Desk margin warning: reference "the risk parameters Malhotra's team set after the last Vol event"
- Compliance meeting: "The compliance desk has flagged your activity for review. This is the kind of thing Okafor's committee loves to subpoena."
- Large position warning: reference the Meridian Brief covering unusual desk activity

- [ ] **Step 2: Rewrite political/insider popup contexts**

For political dinner, fundraiser, interview popups:
- Reference specific characters: "Sen. Lassiter's annual Commerce Committee reception" instead of generic fundraiser
- "Rachel Tan has requested an on-record interview about your trading activity during the Strait of Farsis crisis"
- "Okafor's investigator calls your desk. She's 'asking, not subpoenaing — for now.'"

- [ ] **Step 3: Add conviction-aware context variations**

For key popups, check active convictions to adjust the `description` text:

```javascript
// In the popup's description or shouldFire, check conviction state
description: (ctx) => {
    const convIds = getConvictionIds();
    if (convIds.includes('washington_insider')) {
        return 'Lassiter\'s office calls directly — they know you by name. The Commerce Committee reception is tomorrow night. Your connections make this a natural fit.';
    }
    if (convIds.includes('ghost_protocol')) {
        return 'An invitation to the Commerce Committee reception arrives at the Meridian Capital front desk. Nobody remembers forwarding it to your name. You could go unnoticed.';
    }
    return 'An invitation to Sen. Lassiter\'s Commerce Committee reception. Hedge fund managers, lobbyists, and Federalist donors. You\'d be the only derivatives trader in the room.';
},
```

For popups that use static strings, convert the `description` to a function that reads conviction state where the variation adds meaningful flavor.

- [ ] **Step 4: Commit**

```bash
git add src/popup-events.js
git commit -m "feat(popups): rewrite popup contexts with lore references and conviction-aware variants"
```

---

### Task 13: Enrich the Epilogue

**Files:**
- Modify: `src/epilogue.js:1-602`

Enrich all four pages to reference expanded lore — named characters, specific legislation, products, and geopolitical outcomes.

- [ ] **Step 1: Enrich Page 1 — The Election**

In `_pageElection()`, add references to:
- Big Beautiful Bill outcome: check `world.congress.bigBillStatus` (3 = signed, 4 = dead) and narrate accordingly
- Filibuster drama: if `bigBillStatus === 4`, mention Whitfield's filibuster and Haines crossing the aisle
- Media role: reference Cole's Sentinel coverage vs Tan's Continental investigations based on `media.sentinelRating` and `media.tanCredibility`
- Named senators in election narrative

```javascript
// Add after existing midterm narrative
if (world.congress.bigBillStatus === 3) {
    parts.push('The Big Beautiful Bill — Barron\'s signature legislation — became law after Tao broke the filibuster. Lassiter called it "the most consequential economic reform in a generation." Haines voted yes in the end, but her hesitation cost Barron three months of momentum.');
} else if (world.congress.bigBillStatus === 4) {
    parts.push('The Big Beautiful Bill died on the Senate floor. Whitfield\'s filibuster held. Haines crossed the aisle. Barron never forgave her, and the Federalist base never forgave Congress.');
}

// Media framing
if (world.media.sentinelRating >= 7 && world.media.tanCredibility <= 4) {
    parts.push('Cole\'s Sentinel framed the election as a referendum on Columbian strength. Without The Continental\'s investigative counterweight, the narrative held.');
} else if (world.media.tanCredibility >= 7) {
    parts.push('Tan\'s Continental investigations defined the campaign\'s final weeks. Cole fought back on The Sentinel, but the documents spoke for themselves.');
}
```

- [ ] **Step 2: Enrich Page 2 — Palanthropic**

In `_pagePNTH()`, add product-specific outcomes:

```javascript
// Atlas Aegis
if (world.pnth.aegisDeployed) {
    if (world.pnth.aegisControversy >= 3) {
        parts.push('Atlas Aegis was grounded by executive order. The civilian casualty reports from Operation Dustwalker — and Kassis\'s leaked decision logs — made continued deployment politically impossible.');
    } else {
        parts.push('Atlas Aegis remained operational, a quiet engine of Pentagon funding and boardroom power for Dirks\'s faction.');
    }
}

// Atlas Companion
if (world.pnth.companionLaunched) {
    if (world.pnth.companionScandal >= 3) {
        parts.push('Atlas Companion\'s 200 million users learned their conversations had been accessible to Farsistani intelligence through a sovereign wealth fund side-letter nobody had disclosed. The class-action lawsuit was the largest in tech history.');
    } else {
        parts.push('Atlas Companion reshaped daily life. Four hundred million users by year-end. The "AI boyfriend" headlines faded. The revenue didn\'t.');
    }
}

// Board fight specifics
if (world.pnth.boardDirks > world.pnth.boardGottlieb) {
    parts.push('Zhen cast the deciding vote for Dirks. Malhotra, who had backed Gottlieb for months, switched sides in the parking lot after seeing the quarterly numbers.');
} else if (world.pnth.boardGottlieb > world.pnth.boardDirks) {
    parts.push('Zhen sided with Gottlieb in the end. "The company needs a conscience," he told the board. Dirks resigned by email the same night.');
}
```

- [ ] **Step 3: Enrich Page 3 — The World**

In `_pageWorld()`, add named-leader outcomes:

```javascript
// Khasuria
if (world.geopolitical.khasurianCrisis >= 3) {
    parts.push('Volkov\'s forces never withdrew from the Khasurian border territories. The international community issued statements. Volkov issued shrugs. The new status quo held through the election and beyond.');
} else if (world.geopolitical.khasurianCrisis <= 1) {
    parts.push('Volkov tested the border and found Barron\'s red line credible — or at least unpredictable enough to respect. The Khasurian Border Accord limped forward.');
}

// Farsistan
if (world.geopolitical.straitClosed) {
    parts.push('The Strait of Farsis remained closed for ' + Math.floor((1008 - 700) / 5) + ' trading days. Al-Farhan extracted concessions that reshaped Middle Eastern power dynamics for a generation.');
} else if (world.geopolitical.farsistanEscalation >= 2) {
    parts.push('Al-Farhan\'s Strait of Farsis brinkmanship ended in a back-channel deal. Bowman\'s negotiation — his one genuine diplomatic achievement — was overshadowed by Tan\'s investigation into his offshore accounts.');
}

// Serica
if (world.geopolitical.sericaRelations >= 1) {
    parts.push('The Transpacific Commerce Framework held. Liang Wei and Barron traded insults publicly and concessions privately. Lassiter called it "surrender." The markets called it "stability."');
} else if (world.geopolitical.sericaRelations <= -2) {
    parts.push('Decoupling from Serica became permanent. Zhaowei chips vanished from Columbian supply chains. Liang Wei pivoted to Khasuria and Farsistan. The semiconductor cold war had begun.');
}
```

- [ ] **Step 4: Enrich Page 4 — Your Legacy**

Add new reputation archetypes for the 4 new convictions and enriched career narratives:

```javascript
// New archetype scoring
if (convictionIds.includes('media_darling')) scores.insider += 2;
if (convictionIds.includes('washington_insider')) scores.kingmaker += 3;
if (convictionIds.includes('risk_manager')) scores.principled += 2;
if (convictionIds.includes('crisis_profiteer')) scores.speculator += 2;

// Conviction-specific career aftermath paragraphs
if (convictionIds.includes('washington_insider')) {
    parts.push('After Meridian, you joined the revolving door. K Street welcomed you. Lassiter\'s former chief of staff made the introduction. Your first client was, naturally, Palanthropic.');
}
if (convictionIds.includes('crisis_profiteer')) {
    parts.push('The SEC investigation followed you into retirement. It never resulted in charges — the trades were legal, if unsavory — but the deposition transcripts leaked. Tan wrote about them. Cole defended you.');
}
if (convictionIds.includes('media_darling')) {
    parts.push('Sharma profiled you in MarketWire\'s "Traders Who Shaped the Barron Era" series. Cole invited you on The Sentinel. You accepted. Tan, characteristically, declined to comment.');
}
if (convictionIds.includes('risk_manager')) {
    parts.push('Compliance gave you the highest exit rating in Meridian Capital history. The SEC examiner who reviewed your desk called it "the cleanest book I\'ve seen in twenty years." You framed the letter.');
}

// Meridian Brief farewell
parts.push('The Meridian Brief the morning after your departure was three sentences: "' + playerName + ' is gone. The desk is quiet. Carry on."');
```

Note: `playerName` doesn't exist in the current system — use "Our trader" or "The senior derivatives desk" as the Brief's reference instead.

- [ ] **Step 5: Commit**

```bash
git add src/epilogue.js
git commit -m "feat(epilogue): enrich all 4 pages with lore references and conviction-specific narratives"
```

---

### Task 14: Update Lobbying for Bill-Specific Context

**Files:**
- Modify: `src/lobbying.js:1-72`

Enrich lobby action descriptions with bill-specific context based on world state.

- [ ] **Step 1: Add bill-aware descriptions to lobby actions**

Update `LOBBY_ACTIONS` descriptions to be functions that reference the current legislative context:

```javascript
{
    id: 'lobby_federalist',
    name: 'Fund Federalist PAC',
    description: (world) => {
        if (world.congress.filibusterActive) {
            return 'Fund the Federalist PAC during the filibuster fight. Your money goes to pressuring Haines and Whittaker to vote for cloture. Barron approval +2, lobby momentum +1.';
        }
        if (world.congress.bigBillStatus <= 1) {
            return 'Fund the Federalist PAC. Your donation supports the Big Beautiful Bill\'s path through Congress. Barron approval +2, lobby momentum +1.';
        }
        return 'Fund the Federalist PAC. Lassiter\'s Commerce Committee thanks you. Barron approval +2, lobby momentum +1.';
    },
    baseCost: 400,
    effects: (world) => {
        world.election.barronApproval = Math.min(100, world.election.barronApproval + 2);
        world.election.lobbyMomentum = Math.min(3, world.election.lobbyMomentum + 1);
    },
},
{
    id: 'lobby_farmerlabor',
    name: 'Fund Farmer-Labor PAC',
    description: (world) => {
        if (world.congress.filibusterActive) {
            return 'Fund the Farmer-Labor PAC during the filibuster. Your money supports Whitfield\'s floor fight and Okafor\'s investigations. Barron approval -2, lobby momentum -1.';
        }
        if (world.investigations.okaforProbeStage >= 2) {
            return 'Fund the Farmer-Labor PAC. Okafor\'s investigation intensifies. Your donation signals which side you\'re on. Barron approval -2, lobby momentum -1.';
        }
        return 'Fund the Farmer-Labor PAC. Reyes and Okafor appreciate the support. Barron approval -2, lobby momentum -1.';
    },
    baseCost: 400,
    effects: (world) => {
        world.election.barronApproval = Math.max(0, world.election.barronApproval - 2);
        world.election.lobbyMomentum = Math.max(-3, world.election.lobbyMomentum - 1);
    },
},
```

Note: if `description` is currently used as a static string in the UI rendering code, the UI code in `main.js` or `ui.js` that reads `.description` needs to handle it as a function: `typeof action.description === 'function' ? action.description(world) : action.description`.

- [ ] **Step 2: Update UI code to handle function descriptions**

In the lobby bar rendering code in `main.js` (or wherever lobby actions are rendered), update the description read:

```javascript
const desc = typeof action.description === 'function'
    ? action.description(eventEngine.world)
    : action.description;
```

- [ ] **Step 3: Commit**

```bash
git add src/lobbying.js main.js
git commit -m "feat(lobbying): add bill-specific context to lobby action descriptions"
```

---

### Task 15: Update Election Outcome Scoring

**Files:**
- Modify: `src/events.js` (election outcome calculation)

Add new world-state fields to the election scoring formula to make geopolitical/media events affect election outcomes.

- [ ] **Step 1: Add new scoring factors to `computeElectionOutcome`**

In the `computeElectionOutcome()` method, add modifiers for the new world-state fields:

```javascript
// Existing factors remain unchanged. Add after existing penalty/bonus block:

// Khasurian crisis penalty (unresolved foreign crisis hurts incumbent)
if (world.geopolitical.khasurianCrisis >= 3) score -= 6;

// Strait of Farsis closure (economic pain hurts incumbent)
if (world.geopolitical.straitClosed) score -= 8;

// Big Beautiful Bill passage (signature achievement helps)
if (world.congress.bigBillStatus === 3) score += 5;

// Big Beautiful Bill death (legislative failure hurts)
if (world.congress.bigBillStatus === 4) score -= 4;

// Media credibility collapse (authoritarian optics hurt)
if (world.media.pressFreedomIndex <= 3) score -= 3;

// Strong media ally (Sentinel influence helps)
if (world.media.sentinelRating >= 8) score += 2;

// Tan's credibility (effective opposition journalism hurts)
if (world.media.tanCredibility >= 8) score -= 3;
```

- [ ] **Step 2: Commit**

```bash
git add src/events.js
git commit -m "feat(events): add geopolitical/media factors to election outcome scoring"
```

---

### Task 16: Wire New Systems in main.js

**Files:**
- Modify: `main.js`

Ensure all new world-state fields, conviction context, and reset paths are properly wired.

- [ ] **Step 1: Update `_resetCore()` with new resets**

No new reset functions needed (existing resets clear the full world state via `createWorldState()`). But verify that `_lobbyCount` and crisis profit flags are reset:

```javascript
// In _resetCore(), add:
_lobbyCount = 0;
// playerChoices reset already handles the new flags since it's a fresh object
```

- [ ] **Step 2: Update conviction evaluation context**

In the conviction context builder (where `_convCtx` is assembled), ensure `lobbyCount` is included:

```javascript
_convCtx.lobbyCount = _lobbyCount;
```

- [ ] **Step 3: Track lobby count**

After the `executeLobbyAction` call in the lobby button handler, increment the counter:

```javascript
const result = executeLobbyAction(actionId, sim.history.maxDay, eventEngine.world);
if (result) {
    _lobbyCount++;
    playerChoices.lobbyCount = _lobbyCount;
    // ... existing cost deduction and UI update
}
```

- [ ] **Step 4: Add media domain to epilogue context**

Verify that the epilogue has access to `eventEngine.world.media` — since `_pageWorld` already reads from `world`, and `world` is the full world state object, no new wiring is needed. The new fields are automatically available.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat(main): wire lobby count tracking and crisis profit flags"
```

---

### Task 17: Polish Pass — Remaining Generic Events

**Files:**
- Modify: `src/event-pool.js`

Final pass over any remaining generic events not covered in Tasks 7-11. Focus on the `neutral`, `market`, and remaining `sector` events that still lack lore specificity.

- [ ] **Step 1: Scan for remaining generic headlines**

Read through all events in `event-pool.js` and identify any that still use generic language like:
- "analysts say"
- "market participants"
- "a major tech company"
- "trade tensions"
- "political uncertainty"
- "economic indicators"

- [ ] **Step 2: Enrich remaining events**

For each remaining generic event, add at minimum:
- A named journalist attribution (Sharma, Cole, Tan, Driscoll)
- A named publication (MarketWire, Continental, Sentinel, Meridian Brief)
- A specific lore reference (character, product, nation, legislation)

Minor events only need light touches — a single named entity or publication reference.

- [ ] **Step 3: Verify era gating consistency**

Ensure events referencing late-game products (Companion, Foundry) have appropriate `when()` conditions checking the corresponding `pnth.*Launched` flags. Ensure events referencing mid/late geopolitical crises check escalation levels.

- [ ] **Step 4: Commit**

```bash
git add src/event-pool.js
git commit -m "feat(events): final polish pass — enrich remaining generic events with lore references"
```

---

### Task 18: Interjection Enrichment

**Files:**
- Modify: `src/interjections.js:1-96`

Update interjection text to reference lore-specific situations.

- [ ] **Step 1: Rewrite interjection texts**

```javascript
// vol_spike
text: 'Your hands remember 2008. But this isn\'t 2008 — this is whatever Barron and al-Farhan are building between them. The screens are redder than you\'ve seen in months.',

// sidelines
text: 'You\'re watching from the sidelines while Malhotra talks up PNTH earnings and Lassiter passes tariffs. The Meridian Brief keeps printing. The desk keeps trading. You keep watching.',

// own_press
text: 'You\'re starting to believe your own press. Three strong quarters. Sharma mentioned your desk in a MarketWire column. Cole wants an interview. Be careful.',

// crisis_profits
text: 'Someone is always on the other side of a crisis trade. Today it\'s pension funds in the Midwest, municipal bondholders in Ohio, Whittaker\'s constituents. You try not to think about it.',

// empty_desk
text: 'The floor is quiet. The junior traders went home at six. The cleaning crew is vacuuming around you. The Meridian Brief won\'t publish for twelve hours. Just you and the screens and the numbers.',

// late_game
text: 'Four years. Barron\'s term — your term — is ending. Lassiter, Okafor, Hartley, Dirks, al-Farhan — all of them shaped the tape you traded. And you shaped it back.',
```

Leave `drawdown_hold`, `quiet_tape`, `negative_cash`, and `rate_negative` largely intact — they're already position-specific and don't need lore enrichment.

- [ ] **Step 2: Commit**

```bash
git add src/interjections.js
git commit -m "feat(interjections): enrich atmospheric text with lore references"
```

---

## Execution Notes

**Task dependency order:** Tasks 1-2 are foundational (lore bible + world state). Tasks 3-6 are structural changes. Tasks 7-14 are content work that can be parallelized. Tasks 15-18 are integration and polish.

**Parallelizable groups:**
- Tasks 7, 8, 9, 10, 11 (event rewrites by category) are fully independent
- Tasks 12 and 13 (popups and epilogue) are independent of each other
- Tasks 3, 4, 5 (regulations, triggers, convictions) are independent of each other

**Critical paths:**
- Task 2 (world state) must complete before Tasks 7-11 (events reference new fields)
- Task 5 (convictions) must complete before Task 6 (event engine references conviction IDs)
- Task 6 (event engine) must complete before Tasks 7, 11 (filibuster/media pools must exist)

**Testing approach:** Since this is a zero-dependency vanilla JS project with no test framework, verify changes by:
1. `grep -r "chinaRelations" src/ main.js` after Task 2 — expect no matches
2. Serve locally (`python -m http.server` from repo root) and play through Dynamic mode
3. Check browser console for undefined field errors on new world-state paths
4. Verify filibuster events fire when `bigBillStatus === 2`
5. Verify media events fire on the ~21-day pulse cycle
6. Verify epilogue references new fields without errors
