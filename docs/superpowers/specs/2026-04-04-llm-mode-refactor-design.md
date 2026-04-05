# LLM Dynamic Mode Refactor

> Bring the LLM dynamic mode to full parity with the offline dynamic mode.

## Problem

The LLM mode (`llm.js`) was written early in development. Since then the offline dynamic mode gained: a 6-faction standing system, 12 permanent traits + 6 reputation tags, a legislative regulation pipeline, a 6-action lobbying mechanic, a media domain in world state, geopolitical fields (Khasuria, Farsistan, energy crisis, Strait closure, Aegis demand surge, Foundry competition), PNTH product fields (Sentinel/Aegis/Companion/Foundry launch states, scandal/controversy levels), player flags, portfolio-triggered popup events with declarative choices (faction shifts, player flags, followups, declarative trades), superevents, and a full lore bible with named characters.

The LLM mode is unaware of all of this. Its system prompt uses outdated names, its tool schema only supports toast events, and the context it sends to the API is missing most of the game state.

## Goals

1. **System prompt parity** — rewrite with current lore, full world state schema, all narrative systems
2. **Tool schema parity** — support popup events, choices with faction shifts/player flags/followups/trades, categories, IDs
3. **Full context serialization** — send all game state to the API: world state (all 7 domains), faction standing, active traits, active regulations, player flags, lobbying state
4. **Unified pipeline** — LLM-generated events flow through the same `_fireEvent` → popup processing pipeline as offline events

## Non-Goals

- LLM events with JS `when()` guards, `trigger()` functions, or `context()` functions (these require code, not data)
- LLM-generated `oneShot` events (one-shot tracking is curated-event territory)
- Any changes to the offline event engine (`events.js`), world state, factions, traits, regulations, or lobbying
- UI changes beyond what's needed for LLM popup events (none expected — they already share the pipeline)

## Design

### 1. System Prompt Rewrite

Replace the entire `SYSTEM_PROMPT` constant in `llm.js`. The new prompt covers:

**Universe section** — condensed from `lore.md`:
- Federal States of Columbia, all named characters with roles (Barron, Bowman, Hartley, Vane, Okafor, Whitfield, Reyes, Tao, Whittaker, Haines, Clay, Lassiter)
- PNTH leadership (Dirks, Gottlieb, Kassis, Malhotra, Zhen) and products (Sentinel, Aegis, Companion, Foundry, Covenant)
- Geopolitics: Serica (Liang Wei, Zhaowei), Khasuria (Volkov), Farsistan (al-Farhan, Strait of Hormuz), Boliviara (Madero), Meridia (Navon)
- Media: The Continental (Tan, Driscoll), The Sentinel (Cole), MarketWire (Sharma), The Meridian Brief
- Key legislation: Big Beautiful Bill, Serican Reciprocal Tariff Act, Financial Freedom Act, Digital Markets Accountability Act
- Meridian Capital (player's firm), faction standing system overview, trait system overview

**World state schema** — all 7 domains with field descriptions:
- Congress (seats, filibuster, big bill status)
- PNTH (board, CEO/CTO, products launched, scandals, military contract, commercial momentum)
- Geopolitical (trade war, Khasuria, Farsistan, Strait, energy crisis, Serica relations, Aegis demand, Foundry competition)
- Fed (cycles, Hartley/Vane, credibility)
- Investigations (Tan stories, Okafor probe, impeachment, meridian exposed)
- Election (midterm, approval, lobby momentum, primary, Okafor running)
- Media (Tan credibility, Sentinel rating, press freedom, leaks, lobbying exposed)

**Faction standing** — 6 factions with descriptions:
- firmStanding, regulatoryExposure, federalistSupport, farmerLaborSupport, mediaTrust, fedRelations

**Event design rules** — updated:
- Categories: pnth, macro, sector, neutral, political, investigation, congressional, filibuster, media, desk, compound. Do NOT generate fed, pnth_earnings, midterm, interjection.
- Popup events: when the event presents a meaningful choice to the player, set `popup: true` and provide 2-3 `choices` with labels, descriptions, and consequences (deltas, effects, factionShifts, playerFlags). About 1 in 4 events should be popups.
- Toast events: informational, no choices. Just headline + params + magnitude.
- Superevent guidance: reserve for truly dramatic moments (1 per batch at most). Full-screen treatment.
- Faction shifts on choices: additive shifts to faction scores. Keep proportional to choice severity.
- Player flags: snake_case strings recording what the player chose. Used downstream by traits and endings.
- Magnitude guidelines: minor (1-2 small param deltas), moderate (2-3 params), major (3-5 params with significant deltas)
- Followup chains: multi-step narratives. Each followup has id, headline, params, magnitude, mtth (days), weight (0-1 probability).
- Effects: world state mutations via dot-notation paths. Use `add` for incremental, `set` for absolute. Keep proportional to event magnitude.
- Mix event types: political, corporate, geopolitical, macro, desk/firm. Include neutral flavor events.
- Reference named characters and publications in headlines.
- Do NOT generate events that duplicate pulse-scheduled categories (fed, pnth_earnings, midterm, interjection).

**Era guidance** — early (days 0-350), mid (350-700), late (700-1008). Adjust narrative focus accordingly.

### 2. Tool Schema Update

Expand the `emit_events` tool schema:

```
event: {
  id:        string (optional, short snake_case — used for followup references)
  category:  string (enum: pnth, macro, sector, neutral, political, investigation,
             congressional, filibuster, media, desk, compound)
  headline:  string (1-2 sentence news headline)
  params:    object (parameter deltas, same as current)
  magnitude: string (enum: minor, moderate, major)
  popup:     boolean (optional, default false — true = interactive decision)
  superevent: boolean (optional, default false — full-screen dramatic treatment)
  choices:   array (required when popup=true, 2-3 choices)
  followups: array (optional, same as current)
  effects:   array (optional, world state mutations, same as current)
  factionShifts: array (optional, top-level faction shifts applied on fire, not on choice)
}

choice: {
  label:     string (button text, 2-5 words)
  desc:      string (1-2 sentence description of what this choice means)
  deltas:    object (optional, parameter deltas applied on this choice)
  effects:   array (optional, world state effects applied on this choice)
  factionShifts: array (optional, [{faction, value}])
  playerFlag: string (optional, snake_case flag to record)
  resultToast: string (optional, toast message after choosing)
  followups: array (optional, [{id, mtth}] — schedule followups from this choice)
}
```

Fields NOT supported from LLM (require runtime code): `when`, `trigger`, `context` (function), `trades`, `complianceTier`, `regulatoryAction`, `cashPenalty`, `portfolioFlavor`, `era`, `minDay`, `maxDay`, `oneShot`, `followupOnly`, `tone`, `cooldown`.

### 3. Context Serialization

Expand `generateBatch()` to send comprehensive state. New parameters added to the method signature and serialized into the user message:

**Simulation state** (existing, kept as-is):
- Day, price, vol, rate, all model parameters

**World state** (existing but expanded):
- All 7 domains serialized (add media domain, expand geopolitical and PNTH)

**New context sections:**

**Faction standing:**
```
Faction standing: firmStanding=65, regulatoryExposure=10, federalistSupport=30,
farmerLaborSupport=30, mediaTrust=40, fedRelations=40
```

**Active traits:**
```
Active traits: information_edge, political_operator, market_mover
```

**Active regulations:**
```
Active regulations: deregulation_act (active), transaction_tax (committee),
short_sale_ban (active, 45 days remaining)
```

**Player flags:**
```
Player flags: pursued_insider_tip (day 45), cooperated_with_compliance (day 120),
hosted_fundraiser (day 200)
```

**Lobbying state:**
```
Lobby actions taken: 3, last lobby day: 180
```

**Recent events** (existing, kept as-is but include category):
```
Day 45: [moderate/investigation] Rachel Tan reveals...
```

**Pending followups** (existing, kept as-is)

### 4. `generateBatch()` Signature Change

```js
async generateBatch(sim, eventLog, pendingFollowups, world, extras)
```

Where `extras` is:
```js
{
  factions,       // faction-standing.js factions object
  traitIds,       // getActiveTraitIds() result
  regulations,    // getActiveRegulations() or serialized regulation state
  playerChoices,  // playerChoices object from main.js
  lobbyCount,     // _lobbyCount from main.js
  lastLobbyDay,   // from lobbying.js or main.js
}
```

The `_fetchBatch()` call in `events.js` will pass these extras. This requires `events.js` to receive the extras from main.js — the `setPlayerContext` method already carries `playerChoices`, `factions`, and `traitIds`. We'll extend it to also carry regulation IDs and lobby state, then pass `this._playerCtx` into `_fetchBatch`.

### 5. Event Processing Pipeline

LLM-generated events already flow through `_fireEvent()` in `events.js`. The existing pipeline handles:
- Parameter deltas with coupling scaling
- World state effects (both function and array forms)
- Congress/PNTH board validation
- Boredom tracking
- Event logging
- Followup scheduling
- Popup queuing (events with `popup: true` return `{ queued: true, event }`)

And `_processPopupQueue()` in `main.js` handles:
- Choice deltas
- Choice effects
- Choice factionShifts
- Player flags
- Cash penalties
- Followup scheduling from choices
- Result toasts

**No changes needed to either pipeline.** LLM events in the expanded schema will flow through unchanged. The key insight is that the event processing code is already data-driven — it checks for the presence of fields like `popup`, `choices`, `factionShifts`, etc. and processes them if present. LLM events that include these fields will be processed identically to offline events.

The only processing difference: LLM popup events won't have `context` (a function) or `complianceTier` or `trades` or `regulatoryAction` or `cashPenalty`. These are all optional fields that the pipeline already guards with `if (choice.X)` checks. LLM choices that omit them will simply skip those branches.

### 6. Regulation State Export

`regulations.js` currently has no public API to enumerate active regulations with their status. Add:

```js
export function getRegulationSummary() {
    const result = [];
    for (const [id, entry] of _state) {
        const reg = _regById.get(id);
        result.push({
            id,
            name: reg?.name || id,
            status: entry.status,
            remainingDays: entry.remainingDays,
        });
    }
    return result;
}
```

### 7. Lobbying State Export

`lobbying.js` needs a getter for last lobby day:

```js
export function getLastLobbyDay() { return _lastLobbyDay; }
```

### 8. Events.js Changes

Minimal changes to wire the extras through:

1. `_fetchBatch(sim)` → `_fetchBatch(sim)` (no signature change — reads from `this._playerCtx`)
2. Inside `_fetchBatch`, pass extras to `generateBatch`:
   ```js
   const events = await this._llm.generateBatch(
       sim, this.eventLog, this._pendingFollowups, this.world,
       {
           factions: this._playerCtx.factions,
           traitIds: this._playerCtx.traitIds,
           regulations: getRegulationSummary(),
           playerChoices: this._playerCtx.playerChoices,
           lobbyCount: this._playerCtx.lobbyCount || 0,
           lastLobbyDay: this._playerCtx.lastLobbyDay || 0,
       }
   );
   ```
3. Import `getRegulationSummary` from `regulations.js`
4. `setPlayerContext` — add `lobbyCount` and `lastLobbyDay` to the signature/storage

### 9. Main.js Changes

Update `setPlayerContext` call in `_onDayComplete` to pass lobby state:

```js
eventEngine.setPlayerContext(
    playerChoices, factions, activeRegIds, traitIds, portfolioMetrics,
    _lobbyCount, getLastLobbyDay()
);
```

Import `getLastLobbyDay` from `lobbying.js`.

## Files Changed

| File | Change |
|------|--------|
| `src/llm.js` | Rewrite system prompt, expand tool schema, expand `generateBatch()` context serialization |
| `src/events.js` | Wire extras into `_fetchBatch`, expand `setPlayerContext` signature |
| `src/regulations.js` | Add `getRegulationSummary()` export |
| `src/lobbying.js` | Add `getLastLobbyDay()` export |
| `main.js` | Pass lobby state to `setPlayerContext`, import `getLastLobbyDay` |

## Testing

- Load LLM preset with API key configured
- Verify events generate with categories, proper magnitudes
- Verify popup events render and choices process correctly (faction shifts applied, player flags recorded, followups scheduled)
- Verify world state serialization includes all domains
- Verify fallback to offline still works when API fails
- Verify toast on API error still fires
