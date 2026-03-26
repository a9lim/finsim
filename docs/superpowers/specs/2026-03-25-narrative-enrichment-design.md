# Narrative Enrichment Design

> **Goal:** Transform Shoals' narrative systems from generic procedural events into a specific, lived-in world that reads like financial journalism about named people, institutions, and places — maximizing replay value through divergent world-state paths and player-style-responsive storytelling.

**Approach:** Lore bible markdown file as single source of truth for the world + targeted rewrites of generic events + new event chains for four enrichment pillars + expanded world state + deepened player identity feedback. No templating machinery — events are hand-written strings that reference lore entities directly.

**Tech stack:** Vanilla ES6 modules, no dependencies. New content is data (event objects, world-state fields, prose). No new runtime systems beyond small field additions.

---

## 1. Lore Bible (`lore.md`)

A markdown reference document at the project root. Not consumed by code at runtime — serves as the canonical creative reference for writing and maintaining events. Checked into the repo.

### 1.1 The Federal States of Columbia

The nation the game takes place in. Alternate-history America with two major parties (Federalist, Farmer-Labor), a presidential system, bicameral Congress (Senate: 100 seats, House: 435 seats).

### 1.2 Cast — Congress & Elections

**Federalist Party:**
- **President John Barron** — incumbent, combative populist. Existing character.
- **VP Jay Bowman** — quiet operator, offshore account scandal. Existing character.
- **Sen. Roy Lassiter (F-SC)** — trade hawk, chairs Commerce Committee. Wants tariffs on everything, especially Serica. Sponsor of the Serican Reciprocal Tariff Act.
- **Sen. Margaret "Peggy" Haines (F-WY)** — fiscal conservative, deficit hawk. Skeptical of Barron's spending. Key swing vote on the Big Beautiful Bill. Won't flip parties but will cross the aisle on specific bills.
- **Rep. Vincent Tao (F-TX)** — House Majority Leader. Party enforcer, manages floor votes. Barron loyalist.
- **Rep. Diane Whittaker (F-OH)** — moderate swing vote. Represents a purple district. Flippable on individual votes via lobby pressure or events.
- **Gov. Patricia Chen (OH)** — moderate Federalist governor. Potential party savior if Barron falls. Mentioned in epilogue. Existing character.

**Farmer-Labor Party:**
- **Sen. Patricia Okafor (F-L, IL)** — investigations chair, potential presidential candidate. Existing character.
- **Sen. James Whitfield (F-L, MA)** — Minority Leader. Procedural master, filibuster tactician. His filibusters are events unto themselves.
- **Rep. Carmen Reyes (F-L, CA)** — House Minority Leader. Firebrand, media-savvy. Goes on The Sentinel to argue.
- **Rep. David Oduya (F-L, MI)** — labor wing. Auto workers, manufacturing. Anti-trade-deal even when his own party negotiates one.
- **Robin Clay** — party figurehead. Existing character.

### 1.3 Key Legislation

- **American Competitive Enterprise Act ("Big Beautiful Bill")** — Barron's omnibus: tax cuts + deregulation + defense spending. Senate passage requires 60 votes (filibuster-proof) or reconciliation. The marquee bill tracked by `congress.bigBillStatus`.
- **Serican Reciprocal Tariff Act** — Lassiter's escalating tariff authority against Serica. Drives trade war progression.
- **Financial Freedom Act** — margin/banking deregulation. Existing compound trigger. Sponsor: Lassiter-Tao.
- **Digital Markets Accountability Act** — Farmer-Labor anti-Big-Tech bill. Threatens PNTH directly. Reyes is the face of it.
- **Federal Reserve Independence Act** — existing. Barron repeals to fire Hartley.

### 1.4 Cast — Palanthropic (PNTH)

**Leadership:**
- **Andrea Dirks** — Chairwoman. Defense hawk. Existing character.
- **Eugene Gottlieb** — CEO/founder. Commercial vision. Existing character.
- **Mira Kassis** — CTO. Safety-focused engineer. Existing character.
- **Raj Malhotra** — CFO. Wall Street background. Sides with whoever is winning. His quarterly earnings calls are events.
- **David Zhen** — board member, early investor. Kingmaker vote in the Dirks/Gottlieb proxy fight.

**Products (lifecycle: announce → launch → adoption → controversy):**
- **Atlas Sentinel** — enterprise surveillance/analytics platform. First product. Government and corporate clients. Revenue driver. Already launched at game start.
- **Atlas Aegis** — military AI platform. Drone targeting, theater logistics. The controversial one. Drives the Dirks/Gottlieb split. Deployed mid-game.
- **Atlas Companion** — consumer AI assistant. Late-game launch. "AI boyfriend" headlines. Privacy scandals. Mass adoption metrics that make Wall Street salivate and ethicists despair.
- **Atlas Foundry** — AI model training infrastructure. Sold to other companies. Quiet revenue. Supply chain dependency angle — if Foundry goes down, half of Silicon Valley's AI products stop training.
- **Covenant AI** — Gottlieb's rival startup (existing). Competes on "ethical AI" positioning.

### 1.5 Cast — Geopolitics

**Nations & Leaders:**
- **Serica** (≈ China+) — **Premier Liang Wei**, techno-authoritarian. Home of Zhaowei Technologies. Primary trade rival. Semiconductor competition. Serican trade negotiators are formidable and patient.
- **Khasuria** (≈ Russia+) — **President Yevgeny Volkov**, expansionist. Energy leverage over Europe. Border provocations. Tests every new Columbian president.
- **Farsistan** (≈ Middle East/Gulf) — **Emir Rashid al-Farhan**, oil cartel leader. Sovereign wealth fund with PNTH acquisition interest. Controls the Strait of Farsis (oil chokepoint).
- **Boliviara** (≈ Venezuela+) — **President Luis Madero**, resource nationalism. Target of US covert operations. Lithium and rare earth reserves.
- **Meridia** (≈ Israel+) — **PM Ari Navon**, hawkish. Primary US military ally in the Farsistan theater. Flashpoint for broader regional escalation.

**Treaties & Flashpoints:**
- **Transpacific Commerce Framework** — Barron's trade deal attempt with Serica. Success = trade war de-escalation. Failure = permanent decoupling.
- **Khasurian Border Accord** — failing ceasefire in Eastern Europe proxy zone. Volkov probes for weakness.
- **Operation Dustwalker** — US/Meridia joint military operations in Farsistan theater. Atlas Aegis deployed here.
- **Southern Hemisphere Initiative** — CIA/PNTH covert operations in Boliviara. Atlas Sentinel used for surveillance.
- **Strait of Farsis** — oil chokepoint. Al-Farhan can partially or fully close it. Closure spikes energy prices globally.
- **Zhaowei Semiconductor Accord** — chip trade framework with Serica. On/off based on trade war stage.

### 1.6 Cast — Media & Investigations

**Publications:**
- **The Continental** — prestige investigative newspaper. Rachel Tan's home base. Existing.
- **The Sentinel** — Federalist-aligned cable news / opinion network. Barron's media ally. High ratings, low credibility among elites.
- **MarketWire** — Bloomberg-equivalent financial terminal/news service. Where traders get headlines. Neutral, data-driven.
- **The Meridian Brief** — internal Meridian Capital morning note. Desk gossip + market color. Only the player sees this.

**Journalists:**
- **Rachel Tan** — Continental investigative reporter. Existing character. Bowman offshore accounts, NSA surveillance, PNTH military contracts. Careful, methodical, devastating.
- **Marcus Cole** — Sentinel prime-time anchor. Barron loyalist. Aggressive interviewer who goes after Okafor and Tan. His coverage shapes Federalist base opinion.
- **Priya Sharma** — MarketWire chief economics correspondent. Fed whisperer. Her analysis moves bond markets. The most trusted name on trading floors.
- **Tom Driscoll** — Continental White House correspondent. Leaks source. Not as careful as Tan — occasionally burns sources or runs stories too early.

### 1.7 Descriptive Timeline Skeleton

**Early game (days 0–350):** Barron's honeymoon period. Big Beautiful Bill push through Congress. Atlas Sentinel revenue growth and government contracts expanding. Trade skirmishes with Serica begin (Lassiter introduces tariff bill). Hartley holds rates amid political pressure. Rachel Tan starts digging on Bowman's finances. Khasuria probes the border. Farsistan is stable but watching.

**Mid game (days 350–700):** Midterm buildup intensifies. Atlas Aegis deployment becomes public and controversial. Trade war with Serica escalates or reaches a deal framework. Khasurian border crisis peaks. Filibuster drama on major legislation (Whitfield vs. Tao). Okafor hearings gain traction. Atlas Companion launches to consumers — immediate adoption, immediate controversy. Media clashes between Continental and Sentinel intensify. Farsistan begins flexing oil leverage.

**Late game (days 700–1008):** Presidential campaign dominates. Consequences of all prior arcs cascade and compound. Impeachment or vindication. PNTH acquisition/scandal/schism reaches resolution. Farsistan oil crisis or stability. Boliviara operations exposed or buried. Election. Epilogue.

*This is descriptive, not prescriptive — events can fire outside these windows based on world state. The skeleton describes the natural gravity of the narrative.*

---

## 2. World State Expansion

### 2.1 New Fields in Existing Domains

**`pnth` (new fields):**
- `sentinelLaunched: true` — already launched at game start
- `aegisDeployed: false` — military platform deployed
- `companionLaunched: false` — consumer AI released
- `foundryLaunched: false` — training infrastructure sold externally
- `companionScandal: 0` — (0–3) escalating consumer AI controversy
- `aegisControversy: 0` — (0–3) military use escalation

**`geopolitical` (renames + new fields):**
- `sericaRelations: 0` — renamed from `chinaRelations` (–3 to +3). All existing code referencing `chinaRelations` must be updated.
- `farsistanEscalation: 0` — (0–3) replaces/supplements `mideastEscalation`
- `khasurianCrisis: 0` — (0–3) Eastern Europe escalation
- `straitClosed: false` — Strait of Farsis oil chokepoint closed

**`congress` (new fields):**
- `filibusterActive: false` — is a filibuster currently blocking legislation
- `bigBillStatus: 0` — (0–4) 0=introduced, 1=House passed, 2=Senate debate, 3=signed into law, 4=dead (filibustered/vetoed/failed)

### 2.2 New Domain: `media`

```
media: {
    tanCredibility: 5,      // (0–10) Rachel Tan's source network strength
    sentinelRating: 5,       // (0–10) The Sentinel's influence/viewership
    pressFreedomIndex: 7,    // (0–10) government vs media tension (10=free, 0=hostile)
    leakCount: 0,            // (0–5) cumulative White House leaks
}
```

### 2.3 WORLD_STATE_RANGES Updates

All new numeric fields get corresponding entries in `WORLD_STATE_RANGES` for LLM effect validation. All new boolean fields get `{ type: 'boolean' }` entries.

---

## 3. Event Rewrite Strategy

### 3.1 Triage Categories

**Already specific (~40–50 events):** Reference Barron, Hartley, Dirks, Gottlieb, Okafor, etc. Light polish only — update nation names to Serica/Farsistan/Columbia, ensure lore-doc consistency. No structural changes.

**Generic but important (~80–100 events):** Moderate/major magnitude events with generic headlines. Full rewrites referencing specific lore entities.

Example before: `"Oil supply disruption raises energy costs across sectors"`
Example after: `"Emir al-Farhan orders partial closure of the Strait of Farsis after Meridia border incident; Brent crude gaps up 8% at the open"`

**Generic and minor (~130–150 events):** Minor/neutral filler events. Lighter enrichment — named journalist attribution, specific publication, product name.

Example before: `"Analysts debate whether volatility is structural or cyclical"`
Example after: `"Priya Sharma's MarketWire column asks whether post-Aegis vol is structural; three desks publish rebuttals before lunch"`

### 3.2 Popup Rewrites

All ~30 popup events get full rewrites. Context paragraphs reference specific lore characters and read like scenes from a financial thriller. Compliance popups reference the player's known convictions in their tone.

### 3.3 Compound Trigger & Regulation Rewrites

All 12 compound triggers rewritten with specific legislation, products, and characters by name. All 10 regulations updated to reference specific bills (e.g., "Deregulation Act" → "Financial Freedom Act (Lassiter-Tao)").

---

## 4. New Event Chains

### 4.1 PNTH Product Lifecycle (~15–20 events)

Events covering each product's arc: announcement, launch, adoption metrics, controversy, consequences. Each product's events are gated by the corresponding `pnth.*Launched` / `*Controversy` / `*Scandal` world-state fields.

- Atlas Aegis: deployment → civilian casualty reports → Gottlieb's public objection → Okafor subpoena for deployment records → either grounding or expansion
- Atlas Companion: launch → "200 million users in 90 days" → "AI boyfriend" tabloid stories → data privacy revelation → Farsistani intelligence data-sharing scandal (connects to geopolitics)
- Atlas Foundry: quiet launch → supply chain dependency revealed when outage hits → becomes leverage in Serica trade negotiations (Zhaowei wants Foundry access)

### 4.2 Congressional Drama (~10–15 events)

Big Beautiful Bill lifecycle events. Filibuster showdowns with named senators. Haines defections on spending provisions. Whittaker as swing vote responding to lobby pressure and district concerns. Lassiter's tariff bill moving through committee. Reyes's Digital Markets Act threatening PNTH.

**Filibuster mechanic:**
- When a bill enters Senate debate, `congress.filibusterActive` flips true if opposition has 41+ senators
- Generates events: Whitfield taking the floor, reading statistics, procedural maneuvers
- Mechanically: widens spreads and increases vol while active (temporary regulation-like effect)
- Cloture vote fires after a delay. Outcome depends on `barronApproval`, `lobbyMomentum`, and whether swing senators have been moved by prior events
- Player can lobby during filibusters — existing lobby mechanic becomes more impactful with specific legislation at stake
- Lobbying shifts votes on specific legislation, not party allegiance. Haines might vote against the Big Beautiful Bill on spending grounds even though she's Federalist. Lobby pressure can push her back in line on that vote, but she remains a deficit hawk on the next bill.
- Bills that pass or die generate cascading world-state effects

### 4.3 Geopolitical Specificity (~10–15 events)

Named leaders making specific moves with specific consequences:
- Liang Wei announcing retaliatory tariffs, then semiconductor export bans, then Zhaowei entering Columbian markets
- Volkov probing the Khasurian border, then escalating, then either backing down or triggering a NATO-equivalent response
- Al-Farhan threatening Strait closure, then partial closure, then full closure (each stage independently impactful on oil/rates)
- Madero nationalizing lithium mines, triggering Southern Hemisphere Initiative escalation
- Navon requesting Atlas Aegis support for Meridia operations, connecting PNTH to geopolitics

Each escalation stage references specific leaders, specific actions, and has specific market parameter effects (e.g., Strait closure → `b: +0.02, sigmaR: +0.005, mu: -0.03`).

### 4.4 Media Ecosystem (~10–15 events)

- Tan investigation chain: each story builds on the last, tracked by `tanCredibility` and `investigations.*` fields
- Sentinel vs Continental clashes: Cole attacks Tan on air, Barron tweets about "fake news Continental"
- Driscoll leaks: White House leaks that move markets, sometimes accurate, sometimes premature (generates both real events and head-fakes)
- Sharma's market-moving reporting: her Fed analysis previews rate decisions, her tweets about Columbian debt move bond yields
- Press freedom events: government subpoenas journalist sources, Barron revokes Continental press credentials, Sentinel gets exclusive access
- Media scandals: Driscoll burns a source, Sentinel anchor caught coordinating with White House, Continental paywall controversy during crisis

---

## 5. Player Style Feedback

### 5.1 Event Likelihood Weighting by Convictions

Active convictions shift which events the engine prefers to surface via the existing `likelihood` weighting system. Not exclusive gating — all events can still fire. A thumb on the scale.

- `political_operator` → more congressional/lobbying events
- `volatility_addict` → more PNTH product launch events (vol-moving)
- `information_edge` → more insider-tip-adjacent events and media leak stories
- `ghost_protocol` → fewer events overall (quieter experience)

### 5.2 Conviction-Aware Headline Variants

For popup events, the `context` paragraph can reference the player's reputation. Extends the existing `complianceTone()` pattern to other popup types.

- FT interview popup for `political_operator`: mentions "your connections to the Lassiter circle"
- FT interview popup for `volatility_addict`: mentions "your aggressive options strategies"
- Compliance popup for `risk_manager`: collegial tone, "we know you'll handle this"

### 5.3 New Convictions (expanding from 8 to ~12)

- **`media_darling`** — unlocked by: FT interview + panel appearances + high-visibility trades. Effect: media events reference you by name, Sentinel covers your trades. `eventHintArrows: true`.
- **`washington_insider`** — unlocked by: attending fundraisers + lobbying + political dinner choices. Effect: legislative events include "sources close to Meridian Capital" language. `lobbyingCostMult: 0.6`.
- **`risk_manager`** — unlocked by: consistently hedging, filing compliance docs, cooperating with risk desk. Effect: compliance popups collegial, quarterly reviews more forgiving. `complianceThresholdMult: 1.5, popupFrequencyMult: 1.8`.
- **`crisis_profiteer`** — unlocked by: making money during recession/oil crisis/war events. Effect: scrutiny builds faster, but boredom threshold eliminated during crises. `scrutinyMult: 1.5, boredomImmune: true`.

---

## 6. Epilogue Enrichment

All four pages enriched to reference expanded lore. No new mechanical systems — richer branching prose driven by the same world-state and conviction checks.

### 6.1 Page 1 — The Election

- References specific legislation outcomes: Big Beautiful Bill passage/failure, filibuster drama, named senators' roles
- Names media's role: Cole's Sentinel coverage vs Tan's Continental investigations
- References Whitfield's filibuster if it happened

### 6.2 Page 2 — Fate of Palanthropic

- References specific products: Atlas Aegis grounding, Companion user count and scandals, Foundry supply chain
- Named board members in proxy fight: Zhen's kingmaker vote, Malhotra switching sides
- Product-specific outcomes in each branch (acquisition, scandal, schism, etc.)

### 6.3 Page 3 — The World

- Named leaders and specific consequences: Volkov testing borders post-election, Liang Wei's diplomatic calls, al-Farhan's oil decisions
- Specific treaty outcomes: Transpacific Commerce Framework success/failure, Khasurian Border Accord collapse
- Strait of Farsis resolution or crisis referenced by name

### 6.4 Page 4 — Your Legacy

- New reputation archetypes: `media_darling`, `washington_insider`, `risk_manager`, `crisis_profiteer` added to synthesis scoring with corresponding narrative paragraphs
- Conviction-specific career aftermath paragraphs: `washington_insider` gets post-career lobbying narrative, `crisis_profiteer` gets SEC follow-up narrative
- The Meridian Brief references your departure

---

## 7. Scope Summary

| Category | Count | Effort |
|---|---|---|
| Lore bible (`lore.md`) | 1 file | Medium — creative writing |
| World state new fields | ~12 fields + 1 new domain | Small — data additions |
| Event rewrites (important) | ~80–100 events | Large — hand-written prose |
| Event rewrites (minor) | ~130–150 events | Medium — lighter enrichment |
| Popup rewrites | ~30 events | Medium — bespoke context prose |
| Compound trigger rewrites | 12 triggers | Small — headline updates |
| Regulation rewrites | 10 regulations | Small — name/description updates |
| New PNTH product events | ~15–20 events | Medium — new chains |
| New congressional events | ~10–15 events | Medium — new chains |
| New geopolitical events | ~10–15 events | Medium — new chains |
| New media events | ~10–15 events | Medium — new chains |
| New convictions | 4 convictions | Small — data + conditions |
| Epilogue enrichment | 4 pages | Medium — prose additions |
| Filibuster mechanic | 1 system | Small — world-state gating + temp regulation effect |
