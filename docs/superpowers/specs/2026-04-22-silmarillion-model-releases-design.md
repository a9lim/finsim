# Silmarillion Model Releases — Design

**Date:** 2026-04-22
**Status:** Approved for implementation planning
**Scope:** `shoals` only (no root-repo or sibling-sim impact)

---

## Summary

Add a quarterly PNTH foundation-model release cadence to the Shoals event engine. Silmarillion is PNTH's flagship model line; every quarter PNTH ships a new generation (3 minor bumps + 1 major bump per year). Each release rolls a performance tier from a five-bucket distribution that is biased by world state. Tail-tier rolls (Breakthrough / Failure) and all major-version rolls seed followup event chains; mid-tier minor rolls fire only as toast headlines. Two new rival entities (Tianxia in Serica, Aletheia at Covenant AI) and one new domestic supplier (Ptonos chip manufacturer) are added to lore as anchor points for cross-domain wiring.

---

## Goals

- Make PNTH's frontier-model trajectory a first-class narrative subplot, not just a backdrop to existing product/board arcs.
- Give the AI-race subplot a tractable mechanical handle (`pnth.frontierLead`) that ties PNTH performance, Sericam catch-up, Covenant emergence, and regulatory pressure into one coherent loop.
- Avoid popup fatigue: 16 quarterly events across a 4-year campaign should not each demand a player decision.
- Reuse the existing recurring-pulse and followup-chain infrastructure rather than introducing parallel mechanisms.

## Non-goals

- The player does not trade PNTH directly; releases affect the broader market via param shifts (mu / theta / lambda / muJ), same as existing PNTH events.
- No new tradable instrument tied to PNTH or Silmarillion.
- No new UI surface — releases appear in the existing event log / toast stream.
- No save-format migration (no save format exists today).

---

## Cadence & Versioning

### Pulse schedule

A new recurring pulse `model_release` runs at the same 63-day quarterly cadence as the existing `pnth_earnings` pulse, with a +32-day initial offset so the two pulses interleave:

| Day (Y1) | Beat |
|----------|------|
| 32 | release 1 (minor → 3.6) |
| 63 | earnings 1 |
| 95 | release 2 (minor → 3.7) |
| 126 | earnings 2 |
| 158 | release 3 (minor → 3.8) |
| 189 | earnings 3 |
| 221 | release 4 (**major → 4.0**) |
| 252 | earnings 4 |

Jitter ±5 days, matching `PNTH_EARNINGS_JITTER`.

### Version progression

- Game starts at Silmarillion **3.5** (implies pre-game history of 1.x research, 2.x first commercial, 3.0–3.4 production line).
- Each year: 3 minor releases (incrementing the patch position by 0.1) followed by 1 major release (incrementing the major position by 1, resetting patch to 0).
- A `releasesThisYear` counter on the engine tracks position. On each release: if `releasesThisYear === 3` (i.e., this is the 4th release), apply a major bump (major += 1, patch = 0) and reset the counter to 0; otherwise apply a minor bump (patch += 1) and increment the counter. Counter persists across game years naturally — the bump logic is purely modular on `releasesThisYear` and does not need to read `sim.day`.
- 4-year campaign trajectory: `3.5 → 3.6 → 3.7 → 3.8 → 4.0 → 4.1 → 4.2 → 4.3 → 5.0 → 5.1 → 5.2 → 5.3 → 6.0 → 6.1 → 6.2 → 6.3 → 7.0`.

### Major vs minor mechanics

| Property | Minor release | Major release |
|----------|---------------|---------------|
| Market param magnitude | 1.0× tier base | 1.5× tier base |
| `frontierLead` delta magnitude | 1.0× tier base | 2.0× tier base |
| Mediocre tier seeds chain? | No (toast only) | Yes (`silmarillion_major_meh`) |
| Always seeds chain? | Tail tiers only | All tiers |

---

## World State Additions

Three new fields under `world.pnth`:

| Field | Type | Default | LLM-writable? |
|-------|------|---------|---------------|
| `silmarillionVersion` | string | `"3.5"` | No (system-managed) |
| `lastReleaseTier` | string \| null | `null` | Yes (enum: breakthrough/strong/mediocre/disappointing/failure) |
| `frontierLead` | number | `0` | Yes (clamped -3..+3) |

Validation in `applyStructuredEffects` whitelist:

```js
'pnth.lastReleaseTier':   { type: 'enum', values: [
                              'breakthrough', 'strong', 'mediocre',
                              'disappointing', 'failure'] },
'pnth.frontierLead':      { min: -3, max: 3, type: 'number' },
// silmarillionVersion intentionally omitted — system-managed
```

(Enum type may need to be added to the validator if not already present; otherwise model as a number 0-4 with display mapping.)

---

## Tier Matrix

Base distribution before world-state modulation:

| Tier | Base P | mu | theta | lambda | muJ | frontierLead Δ | Faction effects |
|------|--------|----|----|--------|-----|----------------|-----------------|
| Breakthrough | 10% | +0.04 | +0.015 | +0.6 | +0.02 | +2 | firmStanding +3, fedRelations +1 |
| Strong | 25% | +0.02 | +0.005 | +0.3 | 0 | +1 | firmStanding +1 |
| Mediocre | 30% | 0 | 0 | +0.1 | 0 | 0 | none |
| Disappointing | 25% | -0.015 | +0.01 | +0.3 | -0.01 | -1 | firmStanding -1 |
| Failure | 10% | -0.035 | +0.02 | +0.6 | -0.03 | -2 | firmStanding -2 |

All deltas are additive and clamped to `PARAM_RANGES` per existing convention. Major-release multiplier is applied to the per-tier deltas *before* they are added to params (so clamping still applies to the final value): for major releases, multiply each market-param delta by 1.5 and the `frontierLead` delta by 2, then add to current values and clamp.

---

## World-State Modulation

Before each tier roll, compute a net `tierShift` in [-2, +2] from world state:

| Condition | Shift |
|-----------|-------|
| `geopolitical.tradeWarStage >= 2` | -1 (Zhaowei chips cut off; PNTH stuck with Ptonos at higher cost / lower allocation) |
| `geopolitical.straitClosed` | -1 (energy crisis disrupts compute) |
| `pnth.aegisControversy >= 2` | -1 (talent flight to Covenant) |
| `pnth.commercialMomentum >= 1` | +1 (good run compounds) |
| `pnth.commercialMomentum <= -1` | -1 |
| `pnth.gottliebStartedRival && lastReleaseTier in {disappointing, failure}` | -1 (Aletheia momentum) |
| `pnth.frontierLead >= 2` | +1 (lead reinforces lead — talent magnet) |

Shifts are summed and clamped to [-2, +2]. Implementation: roll a tier index from the base distribution (0 = Failure, 1 = Disappointing, 2 = Mediocre, 3 = Strong, 4 = Breakthrough), then add the net shift and clamp to [0, 4]. So a +1 shift means "if you rolled Mediocre, you get Strong; if you rolled Breakthrough, you stay at Breakthrough." This produces the same expected-value behavior as redistributing probability mass but is trivial to implement and reason about.

Effective probabilities at +1 shift: Failure 0%, Disappointing 10%, Mediocre 25%, Strong 30%, Breakthrough 35% (clamped from rolled 25% Strong + 10% Breakthrough). At -1 shift: symmetric inverse.

A healthy company in a clean trade environment can hit Breakthrough probability ~35%. A beleaguered post-controversy PNTH in a closed-strait recession sees Failure probability climb to ~35%. Frontier-lead -3 remains achievable only after sustained world-state pressure — frontier labs are sticky by design.

---

## Followup Chain Catalog

One headline event per tier is selected by event id matching the rolled tier. Each headline references `world.pnth.silmarillionVersion` and the rolled tier in templated copy. Approximate scope: 5 headline events + ~20 followup events.

### Breakthrough — `silmarillion_breakthrough`
Seeds 4 followup chains:
- `serica_zhaowei_scrambles` — Zhaowei accelerates Tianxia. Can advance `geopolitical.tradeWarStage +1` (Serica retaliates with chip restrictions).
- `covenant_talent_raid` — Aletheia tries to poach Silmarillion engineers. Active only when `gottliebStartedRival = true`.
- `regulator_capability_concern` — Reyes demands hearings. Can introduce **Algorithmic Capability Disclosure Act** in `regulations.js`.
- `aegis_demand_surge_followup` — DoD wants Aegis built on the new gen. Bumps `pnth.aegisControversy +1` if `aegisDeployed`.
- `ptonos_allocates_to_covenant` — Active only when `gottliebStartedRival = true`. Ptonos rate-limits PNTH allocation in favor of the rival; supply tension event.

### Strong — `silmarillion_strong_lift`
Seeds 2 followup chains:
- `malhotra_victory_lap` — CFO talks book on MarketWire. Sentiment flavor.
- `serica_quiet_response` — State-controlled paper plays it down. Lore color, no mechanical effect.

### Mediocre minor — no chain
Toast-only: "Silmarillion {version} ships. Reviewers: incremental. Stock: flat."

### Mediocre major — `silmarillion_major_meh`
Seeds 2 followup chains:
- `gottlieb_was_right_oped` — Continental piece argues PNTH lost its way. Shifts `boardGottlieb +1` if Gottlieb still on board.
- `analyst_downgrades` — Sharma piece on plateau risk. Faction shift: firmStanding -1.

### Disappointing — `silmarillion_underwhelms`
Seeds 3 followup chains:
- `kassis_internal_doubt` — CTO publicly worried. Sets up potential resignation arc.
- `talent_drift_to_covenant` — Engineers leaving. Can flip `gottliebStartedRival = true` if Gottlieb has already resigned.
- `dirks_blames_gottlieb_loyalists` — Board friction. Shifts `boardDirks +1`.

### Failure — `silmarillion_fiasco`
Seeds 4 followup chains:
- `activist_stake_revealed` — Sets `pnth.activistStakeRevealed = true`.
- `sec_inquiry_opened` — `regulatoryExposure +3` faction shift.
- `kassis_resignation_threat` — Mira may walk. Could later flip `ctoIsMira = false`.
- `serica_overtakes_headline` — One-time event (guarded via the standard `oneShot: true` mechanism in `EventEngine._firedOneShots`) that fires when `frontierLead` drops to -2 or below. Downstream Serica events read `frontierLead` directly to gate on the lead deficit; no separate flag is introduced.
- `ptonos_revises_pnth_bookings` — Ptonos earnings call mentions softer PNTH demand. Faction shift: firmStanding -1.

---

## Cross-Domain Wiring

Touches existing arcs:

- **Gottlieb-Dirks war** (`pnth.boardDirks` / `boardGottlieb`):
  - Failure tier shifts `boardGottlieb +1` (vindication narrative).
  - Breakthrough on a Dirks-led PNTH (`!ceoIsGottlieb`) shifts `boardDirks +1`.
  - Mediocre-major chain `gottlieb_was_right_oped` shifts `boardGottlieb +1`.

- **Aegis arc** (`pnth.aegisControversy` / `aegisDeployed`):
  - Breakthrough on heavy-Aegis PNTH (`aegisDeployed && militaryContractActive`) bumps `aegisControversy +1` via `aegis_demand_surge_followup`.
  - High `aegisControversy` already modulates tier down (loop closed).

- **Serica trade war** (`geopolitical.tradeWarStage` / `sericaRelations`):
  - `tradeWarStage >= 2` modulates tier down (Zhaowei chip cutoff).
  - Breakthrough chain `serica_zhaowei_scrambles` can advance `tradeWarStage +1`.
  - Failure tier reduces Serican competitive threat — small `sericaRelations +0` (no de-escalation, but no new escalation pressure either).

- **Covenant rivalry** (`pnth.gottliebStartedRival`):
  - Disappointing/Failure tiers can flip `gottliebStartedRival = true` if Gottlieb has already resigned.
  - Once true, Aletheia launches become a separate event class — fired as conditional events ~every 6 months, not on the Silmarillion pulse. (Out of scope for this design; sketch only.)

- **Regulatory pipeline** (`regulations.js`):
  - Breakthrough chain `regulator_capability_concern` can introduce `algorithmic_capability_disclosure_act`. New bill stub added.

---

## Lore Additions

### `lore.md` — Palanthropic (PNTH) > Models & Products

Section retitled from **Products** to **Models & Products**. New entry at top:

> **Silmarillion** — PNTH's foundation model line. Every Atlas product (Sentinel, Aegis, Companion, Crucible) runs on top of the latest Silmarillion generation. Quarterly minor releases, annual major releases. The most-anticipated event in tech — major-version keynotes are the closest thing the AI industry has to an Apple keynote. Game starts at Silmarillion 3.5; the 1.x line was research, 2.x was first commercial, 3.x is current production. Internally referred to as "Sil" or "the model"; press calls it Silmarillion.

### `lore.md` — new section **Industry & Suppliers** (between PNTH and Geopolitics)

> **Ptonos** — Columbia's primary domestic AI accelerator manufacturer. Headquartered in Austin. Sole vendor of the high-end GPUs that train Silmarillion, Aletheia, and most Columbian AI workloads. Capacity-constrained — every quarter Ptonos chooses who gets allocation. PNTH has historically been the priority customer; that arrangement is fragile when Aletheia exists or when PNTH stumbles. Ptonos earnings calls are read closely by anyone trying to forecast PNTH's next release. Greek-named after the family naming convention common across the AI sector.

> **Tianxia** (天下, "all under heaven") — Zhaowei Technologies' foundation model line. Serica's vertically-integrated answer to Silmarillion: Zhaowei makes the chips and trains the model on them. Tianxia 2.x is the current generation. Lags Silmarillion by ~1 generation but closes the gap on every PNTH stumble. State-aligned — Liang Wei treats Tianxia parity with Silmarillion as a national-prestige issue.

> **Aletheia** (Greek "truth, unconcealment") — Covenant AI's flagship model. Only exists once Gottlieb has started Covenant (`pnth.gottliebStartedRival = true`). Slower release cadence (~2/year), positioned on safety/transparency rather than capability. Aletheia launches are events that can spike PNTH talent flight if Silmarillion just disappointed. Depends on Ptonos for compute — competes with PNTH for the same chip allocation.

(Existing Zhaowei references in the Geopolitics section are preserved; Industry & Suppliers cross-references them.)

---

## File-Level Changes

| File | Change |
|------|--------|
| `src/world-state.js` | Add three `pnth` fields. Update `applyStructuredEffects` whitelist (omit `silmarillionVersion`). Add enum validator if needed. |
| `src/config.js` | Add `MODEL_RELEASE_INTERVAL = 63`, `MODEL_RELEASE_JITTER = 5`, `MODEL_RELEASE_OFFSET = 32`. |
| `src/events.js` | Add `model_release` to `_PULSE_CATEGORIES`. Build pool from new category. Add recurring pulse with `+MODEL_RELEASE_OFFSET` initial offset. Add `_rollSilmarillionTier(world)` (modulation + roll). Add `_bumpSilmarillionVersion(world, releasesThisYear)` (minor-vs-major logic). Track `releasesThisYear` counter on engine; reset annually and on game reset. |
| `src/events/pnth.js` | Add 5 tier-keyed headline events + ~20 followup events under `category: 'model_release'`. Headlines reference `world.pnth.silmarillionVersion` and `lastReleaseTier` in templated copy via headline functions, not static strings. |
| `src/llm.js` | Extend system prompt with Silmarillion / Tianxia / Aletheia / Ptonos lore (~150 words). Allow LLM to read all new fields; allow write to `frontierLead` and `lastReleaseTier` only. |
| `src/regulations.js` | Add `algorithmic_capability_disclosure_act` bill stub (introduced→committee→floor→active/failed lifecycle, like existing bills). |
| `lore.md` | Section retitle + Silmarillion entry + new Industry & Suppliers section with Ptonos/Tianxia/Aletheia. |
| `main.js` | `_resetCore` initializes `silmarillionVersion = "3.5"`, `frontierLead = 0`, `lastReleaseTier = null`, `releasesThisYear = 0`. |
| `CLAUDE.md` (shoals project) | Document new pulse, fields, version-progression invariant, and modulation semantics in Gotchas section. |

---

## LLM Mode Considerations

- `EventEngine` is constructed with the LLM source via `eventEngine = new EventEngine('llm', llmSource)`. The `model_release` recurring pulse fires from the engine itself, independent of source — LLM-generated events run alongside Silmarillion releases without conflict.
- LLM tool schema extended:
  - Read-only: `silmarillionVersion`, `lastReleaseTier`, `frontierLead`.
  - Writable via structured effects: `frontierLead` (clamped -3..+3), `lastReleaseTier` (enum-validated).
  - `silmarillionVersion` is system-managed only — LLM cannot bump the version.
- LLM system prompt addition: a ~150-word block explaining the Silmarillion line, current version, tier semantics, and rival entities, so LLM-generated events stay coherent with the new lore.

---

## Reset / Migration

- `_resetCore` resets all three new fields to defaults: version `"3.5"`, frontierLead `0`, lastReleaseTier `null`.
- EventEngine reset clears the `model_release` pulse `nextDay` to -1 (will reseed with `+MODEL_RELEASE_OFFSET` jitter on first tick) and resets the `releasesThisYear` counter to 0.
- No save format exists today — no migration required.
- LLM mode preset reset: same fields, no preset-specific overrides for the initial implementation.

---

## Open Questions / Future Work

- **Aletheia release cadence** — the lore specifies Aletheia exists post-`gottliebStartedRival` and releases ~2/year, but mechanically modeling Aletheia releases as conditional events (not a separate pulse) is sketched but not specified in detail. Defer to a follow-up design.
- **Tianxia release cadence** — Tianxia is referenced as "lagging Silmarillion by ~1 generation" but no Tianxia release events are specified. For now Tianxia appears only in Silmarillion-triggered chains (`serica_zhaowei_scrambles`). A future expansion could give Tianxia its own quarterly cadence offset from Silmarillion.
- **Ptonos as a Tradable** — Ptonos is currently lore-only. Future expansion could add Ptonos as a tradable equity with its own price series tied to PNTH/Aletheia release events, but that's well outside this scope.
- **Capability score** — explicitly rejected during brainstorming in favor of `frontierLead`. If `frontierLead` proves too coarse in practice, a future design can add a monotonic capability score.
- **Visual surface** — no UI changes proposed. If players miss the version cadence in the event log, a future design could add a small "Sil 4.2" badge in the PNTH section of the world-state sidebar.
