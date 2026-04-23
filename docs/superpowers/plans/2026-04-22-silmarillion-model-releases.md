# Silmarillion Model Releases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quarterly PNTH foundation-model release pulse to the Shoals event engine, with version progression (Silmarillion 3.5 → 7.0 over a 4-year campaign), 5-tier performance rolls modulated by world state, tier-gated followup chains, and supporting lore (Silmarillion / Tianxia / Aletheia / Ptonos).

**Architecture:** A new `modelRelease` pulse type in `src/events.js` runs every 63 days with a +32-day initial offset (interleaving with the existing `pnth_earnings` pulse). On fire, it bumps `world.pnth.silmarillionVersion`, computes a world-state-modulated tier shift, rolls a base tier and applies the shift, then selects the matching tier-keyed headline event from the `model_release` pool, substitutes the version into the headline template, and fires it through the standard `_fireEvent` machinery (which seeds followup chains via the existing followup mechanism). New events live in a new file `src/events/silmarillion.js` (the design spec said pnth.js; deviating because pnth.js is already 1080 lines and the new content would push it past the unwieldy threshold).

**Tech Stack:** Vanilla ES6 modules, no build step, no test framework. Verification is by inspection in browser console (`python -m http.server` from repo root, navigate to `/shoals/`, open DevTools, watch event log + console warnings).

**Spec reference:** `shoals/docs/superpowers/specs/2026-04-22-silmarillion-model-releases-design.md`

**User convention (from project CLAUDE.md):** "Do not manually test via browser automation. The user will test changes themselves." The engineer should serve locally and inspect, but not script browser automation. Commits in this plan are commit boundaries for review — the user prefers explicit-ask-before-commit, so an executor should pause at each commit step for approval.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lore.md` | modify | Section retitle + Silmarillion entry + new Industry & Suppliers section |
| `src/config.js` | modify | Add 3 timing constants |
| `src/world-state.js` | modify | Add 3 `pnth` fields + validation whitelist + enum support |
| `src/events.js` | modify | Add `modelRelease` pulse type, tier roll, version bump, fire helper, pool registration, reset |
| `src/events/silmarillion.js` | create | 5 tier-keyed headline events + 17 followup events |
| `src/events/index.js` | modify | Import + merge the new event array |
| `src/regulations.js` | modify | Add Algorithmic Capability Disclosure Act bill stub |
| `src/llm.js` | modify | Extend system prompt with Silmarillion lore + tool schema |
| `main.js` | modify | `_resetCore` initializes new fields |
| `CLAUDE.md` | modify | Document new pulse, fields, modulation in Gotchas |

---

## Task 1: Lore additions

**Files:**
- Modify: `lore.md`

- [ ] **Step 1: Retitle the Products subsection and add the Silmarillion entry**

In `lore.md`, locate the line `### Products` under the `## Palanthropic (PNTH)` section. Change it to `### Models & Products`. Insert this entry as the first product entry (before the existing `**Atlas Sentinel**` entry):

```markdown
- **Silmarillion** — PNTH's foundation model line. Every Atlas product (Sentinel,
  Aegis, Companion, Crucible) runs on top of the latest Silmarillion generation.
  Quarterly minor releases, annual major releases. The most-anticipated event in
  tech — major-version keynotes are the closest thing the AI industry has to an
  Apple keynote. Game starts at Silmarillion 3.5; the 1.x line was research,
  2.x was first commercial, 3.x is current production. Internally referred to
  as "Sil" or "the model"; press calls it Silmarillion.

```

- [ ] **Step 2: Add the new Industry & Suppliers section between PNTH and Geopolitics**

After the closing `---` of the `## Palanthropic (PNTH)` section and before `## Geopolitics`, insert:

```markdown
## Industry & Suppliers

The chip duopoly powers the AI race. Ptonos is the domestic anchor; Zhaowei is
the contested foreign alternative. Foundation-model labs (PNTH, Covenant,
Zhaowei) sit downstream of both.

- **Ptonos** — Columbia's primary domestic AI accelerator manufacturer.
  Headquartered in Austin. Sole vendor of the high-end GPUs that train
  Silmarillion, Aletheia, and most Columbian AI workloads. Capacity-constrained —
  every quarter Ptonos chooses who gets allocation. PNTH has historically been
  the priority customer; that arrangement is fragile when Aletheia exists or
  when PNTH stumbles. Ptonos earnings calls are read closely by anyone trying
  to forecast PNTH's next release. Greek-named after the family naming
  convention common across the AI sector.

- **Tianxia** (天下, "all under heaven") — Zhaowei Technologies' foundation
  model line. Serica's vertically-integrated answer to Silmarillion: Zhaowei
  makes the chips and trains the model on them. Tianxia 2.x is the current
  generation. Lags Silmarillion by ~1 generation but closes the gap on every
  PNTH stumble. State-aligned — Liang Wei treats Tianxia parity with
  Silmarillion as a national-prestige issue.

- **Aletheia** (Greek "truth, unconcealment") — Covenant AI's flagship model.
  Only exists once Gottlieb has started Covenant (`pnth.gottliebStartedRival
  = true`). Slower release cadence (~2/year), positioned on safety/transparency
  rather than capability. Aletheia launches are events that can spike PNTH
  talent flight if Silmarillion just disappointed. Depends on Ptonos for
  compute — competes with PNTH for the same chip allocation.

---

```

- [ ] **Step 3: Verify by reading the file**

Run: `grep -n "Silmarillion\|Ptonos\|Tianxia\|Aletheia\|Industry & Suppliers\|Models & Products" lore.md`
Expected: Silmarillion / Ptonos / Tianxia / Aletheia each appear ≥1 time, "Industry & Suppliers" appears once, "Models & Products" appears once.

- [ ] **Step 4: Commit**

```bash
git add lore.md
git commit -m "lore: add Silmarillion model line + Industry & Suppliers (Ptonos, Tianxia, Aletheia)"
```

---

## Task 2: Config constants

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add three constants near the existing PNTH_EARNINGS_INTERVAL**

In `src/config.js`, locate `export const PNTH_EARNINGS_JITTER = 5;` and add immediately after:

```js
export const MODEL_RELEASE_INTERVAL = 63;  // quarterly model releases, same cadence as earnings
export const MODEL_RELEASE_JITTER   = 5;   // +/-5 day jitter, matching earnings
export const MODEL_RELEASE_OFFSET   = 32;  // initial offset so releases interleave with earnings (32 days after game start)
```

- [ ] **Step 2: Verify**

Run: `grep -n "MODEL_RELEASE" src/config.js`
Expected: 3 lines printed.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "config: add model release pulse timing constants"
```

---

## Task 3: World state — add fields + extend validation

**Files:**
- Modify: `src/world-state.js`

- [ ] **Step 1: Add three fields to the `pnth` block in `createWorldState`**

In `src/world-state.js`, locate the `pnth: { ... }` block inside `createWorldState()`. Add these three fields just before the closing `}` of the pnth block (after `aegisControversy: 0,`):

```js
            silmarillionVersion: '3.5',
            lastReleaseTier:     null,
            frontierLead:        0,
```

- [ ] **Step 2: Add LLM whitelist entries (skip silmarillionVersion — system-managed only)**

In `src/world-state.js`, locate the `WORLD_STATE_RANGES` object. Inside the `// pnth` block (after `'pnth.aegisControversy'`), add:

```js
    'pnth.lastReleaseTier':             { type: 'enum', values: ['breakthrough', 'strong', 'mediocre', 'disappointing', 'failure'] },
    'pnth.frontierLead':                { min: -3,  max: 3,   type: 'number' },
```

(Note: `silmarillionVersion` intentionally not whitelisted — system-managed only.)

- [ ] **Step 3: Add enum support to `applyStructuredEffects`**

In `src/world-state.js`, locate `applyStructuredEffects`. The existing code branches on `range.type === 'boolean'` and otherwise treats as numeric. Add an enum branch between them. Replace the existing if/else block (the one that ends with `obj[leafKey] = next;`) with:

```js
        if (range.type === 'boolean') {
            const boolVal = Boolean(value);
            obj[leafKey] = boolVal;
        } else if (range.type === 'enum') {
            // Enum: only accept values from the whitelist; 'set' op only
            if (op !== 'set') continue;
            if (!range.values.includes(value)) continue;
            obj[leafKey] = value;
        } else {
            // numeric
            const current = typeof obj[leafKey] === 'number' ? obj[leafKey] : 0;
            let next = op === 'add' ? current + value : value;
            next = Math.max(range.min, Math.min(range.max, next));
            obj[leafKey] = next;
        }
```

- [ ] **Step 4: Verify by serving and inspecting**

Run from repo root: `python -m http.server` (then navigate to `http://localhost:8000/shoals/` in browser).

In DevTools console, evaluate:

```js
// Open console on /shoals/ page
// (eventEngine is exposed if Dynamic preset is loaded; otherwise use Live mode default)
// Quick check:
const ws = (await import('/shoals/src/world-state.js')).createWorldState();
console.log(ws.pnth.silmarillionVersion, ws.pnth.lastReleaseTier, ws.pnth.frontierLead);
```

Expected output: `3.5 null 0`

- [ ] **Step 5: Commit**

```bash
git add src/world-state.js
git commit -m "world-state: add silmarillionVersion / lastReleaseTier / frontierLead with validation"
```

---

## Task 4: Engine — tier roll function

**Files:**
- Modify: `src/events.js`

- [ ] **Step 1: Add `_rollSilmarillionTier` method to `EventEngine` class**

In `src/events.js`, after the `_logEvent` method (around line 314, just before `_scheduleFollowups`), add:

```js
    /**
     * Roll a Silmarillion release tier using world-state-modulated distribution.
     * Returns one of: 'breakthrough', 'strong', 'mediocre', 'disappointing', 'failure'.
     *
     * Algorithm:
     *   1. Roll base tier from distribution {F:10, D:25, M:30, S:25, B:10} as index 0..4.
     *   2. Compute net shift in [-2, +2] from world state (see modulation table).
     *   3. Add shift to tier index, clamp to [0, 4], return label.
     */
    _rollSilmarillionTier(world) {
        // 1. Base roll: cumulative distribution F=0.10, D=0.35, M=0.65, S=0.90, B=1.00
        const r = Math.random();
        let tierIdx;
        if      (r < 0.10) tierIdx = 0; // failure
        else if (r < 0.35) tierIdx = 1; // disappointing
        else if (r < 0.65) tierIdx = 2; // mediocre
        else if (r < 0.90) tierIdx = 3; // strong
        else                tierIdx = 4; // breakthrough

        // 2. World-state modulation (sum of conditions, clamped to [-2, +2])
        let shift = 0;
        if (world.geopolitical.tradeWarStage >= 2)        shift -= 1;
        if (world.geopolitical.straitClosed)              shift -= 1;
        if (world.pnth.aegisControversy >= 2)             shift -= 1;
        if (world.pnth.commercialMomentum >= 1)           shift += 1;
        if (world.pnth.commercialMomentum <= -1)          shift -= 1;
        if (world.pnth.gottliebStartedRival &&
            (world.pnth.lastReleaseTier === 'disappointing' ||
             world.pnth.lastReleaseTier === 'failure'))   shift -= 1;
        if (world.pnth.frontierLead >= 2)                 shift += 1;
        shift = Math.max(-2, Math.min(2, shift));

        // 3. Apply shift, clamp, map to label
        tierIdx = Math.max(0, Math.min(4, tierIdx + shift));
        return ['failure', 'disappointing', 'mediocre', 'strong', 'breakthrough'][tierIdx];
    }
```

- [ ] **Step 2: Smoke test in console**

Serve and open `/shoals/` in browser. In DevTools console:

```js
// Need engine instance; easiest path is via a Dynamic preset
// Switch preset to "Dynamic" via UI dropdown, then:
const tiers = {failure:0, disappointing:0, mediocre:0, strong:0, breakthrough:0};
for (let i = 0; i < 1000; i++) tiers[eventEngine._rollSilmarillionTier(eventEngine.world)]++;
console.table(tiers);
```

Expected (default world state, no shifts): roughly F:100, D:250, M:300, S:250, B:100 (±50 noise).

- [ ] **Step 3: Commit**

```bash
git add src/events.js
git commit -m "events: add _rollSilmarillionTier with world-state modulation"
```

---

## Task 5: Engine — version bump function

**Files:**
- Modify: `src/events.js`

- [ ] **Step 1: Add `_releasesThisYear` counter to constructor**

In `src/events.js`, locate the `EventEngine` constructor. After `this._epilogueFired = false;` (around line 53), add:

```js
        // Silmarillion release counter -- 0..3 within each "year" of releases.
        // Counter logic is purely modular (4 releases per year, 4th is major bump);
        // does not depend on sim.day so it stays in sync if releases are missed.
        this._releasesThisYear = 0;
```

- [ ] **Step 2: Add `_bumpSilmarillionVersion` method**

After the `_rollSilmarillionTier` method, add:

```js
    /**
     * Bump world.pnth.silmarillionVersion in place.
     * 3 minor bumps (patch += 1) followed by 1 major bump (major += 1, patch = 0).
     * Counter logic is modular on _releasesThisYear, not sim.day.
     *
     * Examples (counter -> resulting version starting from 3.5):
     *   counter=0 -> 3.6 (minor), counter becomes 1
     *   counter=1 -> 3.7 (minor), counter becomes 2
     *   counter=2 -> 3.8 (minor), counter becomes 3
     *   counter=3 -> 4.0 (major), counter becomes 0
     */
    _bumpSilmarillionVersion(world) {
        const [majorStr, patchStr] = world.pnth.silmarillionVersion.split('.');
        let major = parseInt(majorStr, 10);
        let patch = parseInt(patchStr, 10);
        const isMajorBump = (this._releasesThisYear === 3);

        if (isMajorBump) {
            major += 1;
            patch = 0;
            this._releasesThisYear = 0;
        } else {
            patch += 1;
            this._releasesThisYear += 1;
        }

        world.pnth.silmarillionVersion = `${major}.${patch}`;
        return { isMajorBump, prevVersion: `${majorStr}.${patchStr}`, newVersion: world.pnth.silmarillionVersion };
    }
```

- [ ] **Step 3: Smoke test in console**

In DevTools console with Dynamic preset loaded:

```js
const w = eventEngine.world;
w.pnth.silmarillionVersion = '3.5';
eventEngine._releasesThisYear = 0;
const path = [];
for (let i = 0; i < 8; i++) {
    const r = eventEngine._bumpSilmarillionVersion(w);
    path.push(`${r.prevVersion} -> ${r.newVersion}${r.isMajorBump ? ' (MAJOR)' : ''}`);
}
console.log(path.join('\n'));
```

Expected output:
```
3.5 -> 3.6
3.6 -> 3.7
3.7 -> 3.8
3.8 -> 4.0 (MAJOR)
4.0 -> 4.1
4.1 -> 4.2
4.2 -> 4.3
4.3 -> 5.0 (MAJOR)
```

- [ ] **Step 4: Commit**

```bash
git add src/events.js
git commit -m "events: add _bumpSilmarillionVersion with modular counter"
```

---

## Task 6: Engine — release fire helper

**Files:**
- Modify: `src/events.js`

- [ ] **Step 1: Add `_fireSilmarillionRelease` method**

After the `_bumpSilmarillionVersion` method, add:

```js
    /**
     * Fire a Silmarillion release event.
     * Sequence: bump version -> roll tier -> select tier-keyed headline
     * from pool -> substitute {version}/{prevVersion}/{tierLabel}/{tier} placeholders
     * -> apply major-release multiplier if applicable -> fire through _fireEvent.
     *
     * Returns the result of _fireEvent (entry log + optional popup descriptor).
     */
    _fireSilmarillionRelease(sim, day, netDelta) {
        const { isMajorBump, prevVersion, newVersion } =
            this._bumpSilmarillionVersion(this.world);

        const tier = this._rollSilmarillionTier(this.world);
        this.world.pnth.lastReleaseTier = tier;

        // Mediocre-minor releases produce no chain headline event -- just log a
        // toast directly and skip _fireEvent entirely.
        if (tier === 'mediocre' && !isMajorBump) {
            const headline = `Silmarillion ${newVersion} ships. Reviewers: incremental. Aggregate benchmarks roughly flat vs. ${prevVersion}.`;
            return this._logEvent(day, { headline, category: 'model_release' }, {}, 'minor');
        }

        // Select the matching tier-keyed headline event from the pool.
        // For major releases on Mediocre, use the dedicated major-meh event.
        let eventId;
        if (tier === 'mediocre' && isMajorBump) {
            eventId = 'silmarillion_major_meh';
        } else {
            eventId = `silmarillion_${tier}`;
        }
        const baseEvent = getEventById(eventId);
        if (!baseEvent) {
            console.warn(`[events] _fireSilmarillionRelease: missing event '${eventId}'`);
            return null;
        }

        // Clone and substitute placeholders in the headline.
        const tierLabel = {
            breakthrough: 'breakthrough',
            strong: 'strong showing',
            mediocre: 'middling result',
            disappointing: 'underwhelming launch',
            failure: 'fiasco',
        }[tier];
        const resolvedHeadline = baseEvent.headline
            .replaceAll('{version}',     newVersion)
            .replaceAll('{prevVersion}', prevVersion)
            .replaceAll('{tierLabel}',   tierLabel)
            .replaceAll('{tier}',        tier);

        // Major release: multiply per-tier deltas (params and frontierLead-bearing
        // effects). _fireEvent applies clamping after delta addition, so the
        // multiplier is safe to apply here on the cloned params.
        let resolvedParams = baseEvent.params;
        let resolvedEffects = baseEvent.effects;
        if (isMajorBump && resolvedParams) {
            resolvedParams = {};
            for (const [k, v] of Object.entries(baseEvent.params)) {
                resolvedParams[k] = v * 1.5;
            }
        }
        if (isMajorBump && Array.isArray(baseEvent.effects)) {
            resolvedEffects = baseEvent.effects.map(eff => {
                if (eff.path === 'pnth.frontierLead' && eff.op === 'add') {
                    return { ...eff, value: eff.value * 2 };
                }
                return eff;
            });
        }

        const cloned = {
            ...baseEvent,
            headline: resolvedHeadline,
            params:   resolvedParams,
            effects:  resolvedEffects,
        };

        return this._fireEvent(cloned, sim, day, 0, netDelta);
    }
```

- [ ] **Step 2: Verify the helper compiles**

Reload `/shoals/` in browser. Open console. Confirm no parse errors. The helper isn't wired up yet — full smoke test happens in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/events.js
git commit -m "events: add _fireSilmarillionRelease with placeholder substitution and major multiplier"
```

---

## Task 7: Engine — wire up `modelRelease` pulse type + pool

**Files:**
- Modify: `src/events.js`

- [ ] **Step 1: Import the new constants**

In `src/events.js`, modify the import block at the top:

```js
import {
    MAX_EVENT_LOG, MAX_FOLLOWUP_DEPTH, FED_MEETING_INTERVAL,
    MIDTERM_DAY, CAMPAIGN_START_DAY, NON_FED_POISSON_RATE,
    NON_FED_COOLDOWN_MIN, NON_FED_COOLDOWN_MAX, FED_MEETING_JITTER,
    BOREDOM_THRESHOLD, TERM_END_DAY,
    PNTH_EARNINGS_INTERVAL, PNTH_EARNINGS_JITTER,
    MODEL_RELEASE_INTERVAL, MODEL_RELEASE_JITTER, MODEL_RELEASE_OFFSET,
    ADV, EVENT_COUPLING_CAP, HISTORY_CAPACITY,
} from './config.js';
```

- [ ] **Step 2: Add `model_release` to `_PULSE_CATEGORIES`**

Replace the existing line:

```js
const _PULSE_CATEGORIES = new Set(['fed', 'pnth_earnings', 'midterm', 'interjection']);
```

with:

```js
const _PULSE_CATEGORIES = new Set(['fed', 'pnth_earnings', 'midterm', 'interjection', 'model_release']);
```

- [ ] **Step 3: Register the `model_release` pool**

In the `_pools` block of the constructor, add `model_release` after `pnth_earnings`:

```js
        this._pools = {
            fed:            ALL_EVENTS.filter(e => e.category === 'fed' && !e.followupOnly),
            pnth_earnings:  ALL_EVENTS.filter(e => e.category === 'pnth_earnings' && !e.followupOnly),
            model_release:  ALL_EVENTS.filter(e => e.category === 'model_release' && !e.followupOnly),
            random:         ALL_EVENTS.filter(e => !_PULSE_CATEGORIES.has(e.category) && !e.followupOnly),
            filibuster:     ALL_EVENTS.filter(e => e.category === 'filibuster' && !e.followupOnly),
            media:          ALL_EVENTS.filter(e => e.category === 'media' && !e.followupOnly),
            interjection:   ALL_EVENTS.filter(e => e.category === 'interjection' && !e.followupOnly),
        };
```

- [ ] **Step 4: Register the `modelRelease` pulse**

In the `this._pulses = [...]` array in the constructor, add a new entry after the `pnth_earnings` recurring pulse:

```js
            { type: 'modelRelease', id: 'model_release', interval: MODEL_RELEASE_INTERVAL, jitter: MODEL_RELEASE_JITTER, offset: MODEL_RELEASE_OFFSET, nextDay: -1 },
```

- [ ] **Step 5: Add `modelRelease` branch in the pulse loop**

In `maybeFire`, locate the `for (const pulse of this._pulses)` loop. After the `'fixed'` branch (closing `}`) and before the loop's closing `}`, add a new branch:

```js
            } else if (pulse.type === 'modelRelease') {
                // Initialize nextDay on first call -- use offset, not interval, for first fire
                if (pulse.nextDay < 0) {
                    pulse.nextDay = day + pulse.offset + this._jitterRoll(pulse.jitter);
                }
                if (day >= pulse.nextDay) {
                    pulse.nextDay = day + pulse.interval + this._jitterRoll(pulse.jitter);
                    const result = this._fireSilmarillionRelease(sim, day, netDelta);
                    if (result) return _partition([result]);
                }
            }
```

- [ ] **Step 6: Reset the pulse state in `reset()`**

In `reset()`, locate the loop:

```js
        for (const pulse of this._pulses) {
            if (pulse.type === 'recurring') {
                pulse.nextDay = -1;
            } else if (pulse.type === 'fixed') {
                pulse.fired = false;
            }
        }
```

Extend it to handle `modelRelease`:

```js
        for (const pulse of this._pulses) {
            if (pulse.type === 'recurring' || pulse.type === 'modelRelease') {
                pulse.nextDay = -1;
            } else if (pulse.type === 'fixed') {
                pulse.fired = false;
            }
        }
        this._releasesThisYear = 0;
```

- [ ] **Step 7: Verify no parse errors**

Reload `/shoals/` in browser. Open console. Switch to Dynamic preset. Confirm no errors from the events.js module load.

(Pool will be empty until Task 8 lands — that's fine; the `if (result)` guard in the modelRelease branch prevents firing missing events, and `_fireSilmarillionRelease` warns and returns null when the pool is empty.)

- [ ] **Step 8: Commit**

```bash
git add src/events.js
git commit -m "events: register modelRelease pulse type, pool, and reset"
```

---

## Task 8a: Tier headline events — create file + breakthrough

**Files:**
- Create: `src/events/silmarillion.js`

- [ ] **Step 1: Create the file with the Breakthrough headline + 4 followup chains**

Create `src/events/silmarillion.js` with the following content:

```js
/* silmarillion.js -- PNTH Silmarillion model release events.
   Headlines are tier-keyed and selected by _fireSilmarillionRelease in events.js.
   Headline strings use {version}, {prevVersion}, {tier}, {tierLabel} placeholders
   resolved by the pulse handler before _fireEvent.

   Followup chains carry the narrative consequences of tail-tier rolls.
   Mid-tier rolls (Mediocre on minor versions) fire only as toast headlines
   constructed inline by the pulse handler -- they do not appear in this file. */

export const SILMARILLION_EVENTS = [
    // =====================================================================
    //  TIER HEADLINE: BREAKTHROUGH
    // =====================================================================
    {
        id: 'silmarillion_breakthrough',
        category: 'model_release',
        magnitude: 'major',
        headline: 'Silmarillion {version} ships and obliterates internal benchmarks. AlphaCode-X solved on first attempt; reviewers reach for words like "paradigm shift." Malhotra immediately schedules a fresh investor day. Stock +12% on the open.',
        params: { mu: 0.04, theta: 0.015, lambda: 0.6, muJ: 0.02 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: 2 },
            { path: 'pnth.commercialMomentum', op: 'add', value: 1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: 3 },
            { faction: 'fedRelations', value: 1 },
        ],
        followups: [
            { id: 'serica_zhaowei_scrambles', mtth: 14, weight: 0.9 },
            { id: 'covenant_talent_raid',     mtth: 21, weight: 0.7 },
            { id: 'regulator_capability_concern', mtth: 18, weight: 0.7 },
            { id: 'aegis_demand_surge_followup',  mtth: 25, weight: 0.6 },
            { id: 'ptonos_allocates_to_covenant', mtth: 30, weight: 0.5 },
        ],
    },

    // -- Breakthrough followup chain ------------------------------------
    {
        id: 'serica_zhaowei_scrambles',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Zhaowei convenes an emergency strategy session in Nanjing in response to Silmarillion. Liang Wei calls it a "national-prestige issue." Tianxia roadmap accelerated; chip export controls on PNTH supply chain hinted at.',
        magnitude: 'moderate',
        params: { mu: -0.005, theta: 0.01 },
        effects: [
            { path: 'geopolitical.tradeWarStage',  op: 'add', value: 1 },
            { path: 'geopolitical.sericaRelations', op: 'add', value: -1 },
        ],
    },
    {
        id: 'covenant_talent_raid',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Covenant AI extends offers to a dozen Silmarillion engineers, citing "values alignment." The Continental: "Gottlieb wants the people who built the thing he was forced out of."',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.gottliebStartedRival,
        params: { mu: -0.005, theta: 0.005 },
        effects: [
            { path: 'pnth.commercialMomentum', op: 'add', value: -1 },
        ],
    },
    {
        id: 'regulator_capability_concern',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Rep. Carmen Reyes calls for hearings on dual-use AI capability disclosure: "If the Pentagon gets a peek before the public, we have a constitutional problem." Algorithmic Capability Disclosure Act introduced in committee.',
        magnitude: 'moderate',
        params: { mu: -0.01, theta: 0.008 },
        effects: (world) => {
            // Activate the bill via regulations.js advanceBill -- imported lazily
            // to avoid circular dependency at module load.
            import('../regulations.js').then(m => m.advanceBill('algorithmic_capability_disclosure_act', 'introduced'));
        },
        factionShifts: [
            { faction: 'regulatoryExposure', value: 2 },
        ],
    },
    {
        id: 'aegis_demand_surge_followup',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'DoD signals it wants Atlas Aegis rebuilt on the new Silmarillion generation. Expanded contract under negotiation. Andrea Dirks: "This validates everything." Civil-liberties groups and Mira Kassis are conspicuously silent.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.aegisDeployed && world.pnth.militaryContractActive,
        params: { mu: 0.015, theta: 0.005 },
        effects: [
            { path: 'pnth.aegisControversy', op: 'add', value: 1 },
        ],
    },
    {
        id: 'ptonos_allocates_to_covenant',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Ptonos Q&A discloses it has pledged 15% of next-quarter GPU allocation to Covenant AI. PNTH sources call the move "retaliatory." Malhotra placeholder-quoted: "Ptonos has been a great partner. We have alternatives."',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.gottliebStartedRival,
        params: { mu: -0.01, theta: 0.01 },
    },
];
```

- [ ] **Step 2: Verify the file parses**

In DevTools console (with `/shoals/` open):

```js
const m = await import('/shoals/src/events/silmarillion.js');
console.log(m.SILMARILLION_EVENTS.length);
```

Expected: `6`

- [ ] **Step 3: Commit**

```bash
git add src/events/silmarillion.js
git commit -m "events: add Silmarillion breakthrough tier + followup chain"
```

---

## Task 8b: Tier headline events — strong + major-mediocre

**Files:**
- Modify: `src/events/silmarillion.js`

- [ ] **Step 1: Append Strong tier + 2 followups**

Inside the `SILMARILLION_EVENTS` array in `src/events/silmarillion.js`, append (before the closing `]`):

```js
    // =====================================================================
    //  TIER HEADLINE: STRONG
    // =====================================================================
    {
        id: 'silmarillion_strong',
        category: 'model_release',
        magnitude: 'moderate',
        headline: 'Silmarillion {version} ships with material gains across reasoning and code generation benchmarks. Wall Street takes the win; analysts revise targets up. Stock +5%.',
        params: { mu: 0.02, theta: 0.005, lambda: 0.3 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: 1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: 1 },
        ],
        followups: [
            { id: 'malhotra_victory_lap', mtth: 10, weight: 0.7 },
            { id: 'serica_quiet_response', mtth: 18, weight: 0.5 },
        ],
    },

    // -- Strong followup chain --------------------------------------------
    {
        id: 'malhotra_victory_lap',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Raj Malhotra books MarketWire and CNBC on the same morning. "Capital allocation discipline. Operational excellence. Adjusted EBITDA up sequentially. The Silmarillion line is the moat." Sharma asks one sharp question; he deflects.',
        magnitude: 'minor',
        params: { mu: 0.005 },
    },
    {
        id: 'serica_quiet_response',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Serica\'s state-controlled tech press downplays Silmarillion {version} -- a brief paragraph buried under Tianxia coverage. Western Sericologists read this as nervousness, not confidence.',
        magnitude: 'minor',
    },

    // =====================================================================
    //  TIER HEADLINE: MEDIOCRE (MAJOR ONLY)
    //  Mediocre minor releases fire as inline toasts from the pulse handler
    //  and have no entry in this file.
    // =====================================================================
    {
        id: 'silmarillion_major_meh',
        category: 'model_release',
        magnitude: 'moderate',
        headline: 'Silmarillion {version} keynote underwhelms. Year-end major bump headlined the conference circuit but the demos felt rehearsed. The Continental: "Were they hiding something or do they have nothing?" Stock -3%.',
        params: { mu: -0.012, theta: 0.008, lambda: 0.2 },
        effects: [
            { path: 'pnth.commercialMomentum', op: 'add', value: -1 },
        ],
        followups: [
            { id: 'gottlieb_was_right_oped', mtth: 14, weight: 0.7 },
            { id: 'analyst_downgrades',      mtth: 8,  weight: 0.8 },
        ],
    },

    // -- Mediocre-major followup chain ------------------------------------
    {
        id: 'gottlieb_was_right_oped',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'The Continental publishes a 3,000-word Rachel Tan piece arguing PNTH lost its way when Dirks won the boardroom: "The military pivot starved the research bench. Silmarillion {version} is the bill arriving."',
        magnitude: 'moderate',
        params: { mu: -0.01 },
        effects: (world) => {
            if (world.pnth.boardGottlieb < 12) world.pnth.boardGottlieb += 1;
            if (world.pnth.boardDirks > 0)     world.pnth.boardDirks -= 1;
        },
    },
    {
        id: 'analyst_downgrades',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Priya Sharma\'s MarketWire post-keynote piece: "The plateau thesis is no longer fringe." Three sell-side desks downgrade PNTH within 48 hours.',
        magnitude: 'moderate',
        params: { mu: -0.015, theta: 0.01 },
        factionShifts: [
            { faction: 'firmStanding', value: -1 },
        ],
    },
```

- [ ] **Step 2: Verify**

```js
const m = await import('/shoals/src/events/silmarillion.js');
console.log(m.SILMARILLION_EVENTS.length);
```

Expected: `6 + 6 = 12`

- [ ] **Step 3: Commit**

```bash
git add src/events/silmarillion.js
git commit -m "events: add Silmarillion strong + major-mediocre tiers + chains"
```

---

## Task 8c: Tier headline events — disappointing + failure

**Files:**
- Modify: `src/events/silmarillion.js`

- [ ] **Step 1: Append Disappointing + Failure tiers and followups**

Append before the closing `]` of `SILMARILLION_EVENTS`:

```js
    // =====================================================================
    //  TIER HEADLINE: DISAPPOINTING
    // =====================================================================
    {
        id: 'silmarillion_disappointing',
        category: 'model_release',
        magnitude: 'moderate',
        headline: 'Silmarillion {version} ships and analysts immediately ask why. Capability gains marginal; safety regressions on multiple internal evals. Mira Kassis declines to comment. Stock -6%.',
        params: { mu: -0.015, theta: 0.01, lambda: 0.3, muJ: -0.01 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: -1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: -1 },
        ],
        followups: [
            { id: 'kassis_internal_doubt',   mtth: 12, weight: 0.7 },
            { id: 'talent_drift_to_covenant', mtth: 25, weight: 0.6 },
            { id: 'dirks_blames_gottlieb_loyalists', mtth: 18, weight: 0.6 },
        ],
    },

    // -- Disappointing followup chain -------------------------------------
    {
        id: 'kassis_internal_doubt',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'A leaked Kassis memo to her staff appears on TechCrunch: "We cannot keep promising what we cannot deliver. The pretraining bet is not paying back." Dirks orders an internal leak investigation.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira,
        params: { mu: -0.01, theta: 0.005 },
        effects: [
            { path: 'media.leakCount', op: 'add', value: 1 },
        ],
    },
    {
        id: 'talent_drift_to_covenant',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'A wave of mid-level Silmarillion researchers post arrival announcements at Covenant AI within the same week. "Aletheia is where the safety work happens now," one writes. PNTH HR scrambles.',
        magnitude: 'moderate',
        params: { mu: -0.01 },
        effects: (world) => {
            // If Gottlieb has resigned but not yet started the rival, this nudges
            // it forward -- the talent flight makes the rival viable.
            if (!world.pnth.ceoIsGottlieb && !world.pnth.gottliebStartedRival) {
                world.pnth.gottliebStartedRival = true;
            }
        },
    },
    {
        id: 'dirks_blames_gottlieb_loyalists',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Andrea Dirks calls out "a small minority of legacy engineers loyal to Eugene" in an all-hands. The room goes quiet. David Zhen requests a 1:1 with Dirks the same day.',
        magnitude: 'moderate',
        params: { mu: -0.005 },
        effects: (world) => {
            if (world.pnth.boardDirks < 12) world.pnth.boardDirks += 1;
            if (world.pnth.boardGottlieb > 0) world.pnth.boardGottlieb -= 1;
        },
    },

    // =====================================================================
    //  TIER HEADLINE: FAILURE
    // =====================================================================
    {
        id: 'silmarillion_failure',
        category: 'model_release',
        magnitude: 'major',
        headline: 'Silmarillion {version} launch is a fiasco. Live demo crashes on stage; benchmark numbers retracted within 24 hours after Tianxia researchers identify training-set contamination. Activist investors smell blood. Stock -14%.',
        params: { mu: -0.035, theta: 0.02, lambda: 0.6, muJ: -0.03 },
        effects: [
            { path: 'pnth.frontierLead', op: 'add', value: -2 },
            { path: 'pnth.commercialMomentum', op: 'add', value: -1 },
        ],
        factionShifts: [
            { faction: 'firmStanding', value: -2 },
        ],
        followups: [
            { id: 'activist_stake_revealed',  mtth: 10, weight: 0.9 },
            { id: 'sec_inquiry_opened',       mtth: 18, weight: 0.7 },
            { id: 'kassis_resignation_threat', mtth: 14, weight: 0.6 },
            { id: 'serica_overtakes_headline', mtth: 25, weight: 0.5 },
            { id: 'ptonos_revises_pnth_bookings', mtth: 8, weight: 0.8 },
        ],
    },

    // -- Failure followup chain ------------------------------------------
    {
        id: 'activist_stake_revealed',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Trian-equivalent activist fund Lockstep Capital reveals a 4.8% PNTH stake and a public letter demanding "fundamental governance review." Dirks chairmanship explicitly named.',
        magnitude: 'major',
        params: { mu: -0.02, theta: 0.015 },
        effects: [
            { path: 'pnth.activistStakeRevealed', op: 'set', value: true },
        ],
    },
    {
        id: 'sec_inquiry_opened',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'SEC opens informal inquiry into PNTH disclosures around Silmarillion {version} benchmark methodology. Subpoenas hinted at. Compliance counsel works through the weekend.',
        magnitude: 'major',
        params: { mu: -0.015, theta: 0.012 },
        factionShifts: [
            { faction: 'regulatoryExposure', value: 3 },
        ],
    },
    {
        id: 'kassis_resignation_threat',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Mira Kassis tells the board she\'ll step down as CTO unless the Silmarillion roadmap is restructured. Wired publishes the threat verbatim within hours. Dirks "evaluating options."',
        magnitude: 'major',
        when: (sim, world) => world.pnth.ctoIsMira,
        params: { mu: -0.02, theta: 0.015 },
    },
    {
        id: 'serica_overtakes_headline',
        followupOnly: true,
        category: 'pnth',
        oneShot: true,
        likelihood: 1.0,
        headline: 'Tianxia 3.0 ships with capability evaluations exceeding Silmarillion across multiple benchmarks. Liang Wei: "The era of Western technological hegemony is over." Western press largely concedes the point.',
        magnitude: 'major',
        when: (sim, world) => world.pnth.frontierLead <= -2,
        params: { mu: -0.015, theta: 0.01 },
    },
    {
        id: 'ptonos_revises_pnth_bookings',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Ptonos earnings call mentions "softer demand from a key customer" -- Wall Street decodes it instantly. PNTH bookings revised down. Ptonos stock dips on the dependency reveal.',
        magnitude: 'moderate',
        params: { mu: -0.012, theta: 0.008 },
        factionShifts: [
            { faction: 'firmStanding', value: -1 },
        ],
    },
];
```

- [ ] **Step 2: Verify**

```js
const m = await import('/shoals/src/events/silmarillion.js');
console.log(m.SILMARILLION_EVENTS.length);
```

Expected: `12 + 10 = 22`

- [ ] **Step 3: Commit**

```bash
git add src/events/silmarillion.js
git commit -m "events: add Silmarillion disappointing + failure tiers + chains"
```

---

## Task 9: Wire silmarillion events into the registry

**Files:**
- Modify: `src/events/index.js`

- [ ] **Step 1: Import and merge SILMARILLION_EVENTS**

In `src/events/index.js`, add an import after `import { TRAIT_EVENTS } from './traits.js';`:

```js
import { SILMARILLION_EVENTS } from './silmarillion.js';
```

Then append `...SILMARILLION_EVENTS,` to the `ALL_EVENTS` array. The final array should look like:

```js
export const ALL_EVENTS = [
    ...FED_EVENTS,
    ...MACRO_EVENTS,
    ...PNTH_EVENTS,
    ...CONGRESS_EVENTS,
    ...INVESTIGATION_EVENTS,
    ...MEDIA_EVENTS,
    ...MARKET_EVENTS,
    ...FIRM_EVENTS,
    ...TIP_EVENTS,
    ...INTERJECTION_EVENTS,
    ...TRAIT_EVENTS,
    ...SILMARILLION_EVENTS,
];
```

- [ ] **Step 2: Verify followup chain integrity warnings are clean**

Reload `/shoals/` in browser. Open console. Check for warnings prefixed `[events]`. There should be no warnings about unknown followup ids or missing `followupOnly` flags from any of the 16 silmarillion followups.

- [ ] **Step 3: Verify the pool is populated**

```js
console.log(eventEngine._pools.model_release.length);
```

Expected: `5` — the 5 tier-keyed events (breakthrough, strong, major_meh, disappointing, failure) all have `category: 'model_release'` and none have `followupOnly: true`.

The 17 followup events are categorized `'pnth'` so they don't appear in the `model_release` pool. They're resolved by id via `getEventById` from the breakthrough/strong/major-meh/disappointing/failure event `followups` arrays.

- [ ] **Step 4: Commit**

```bash
git add src/events/index.js
git commit -m "events: register SILMARILLION_EVENTS in ALL_EVENTS"
```

---

## Task 10: main.js — initialize new fields on `_resetCore`

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Reset new world fields when EventEngine is reset**

The EventEngine's own `reset()` method (added in Task 7) already resets `_releasesThisYear` and pulse state. But when `_resetCore` runs, it does NOT call `eventEngine.reset()` directly — it only calls `eventEngine.resetTriggerCooldowns()` (line 1730 in main.js). The EventEngine constructor IS called fresh in `loadPreset` for Dynamic / Dynamic (LLM) presets, so the world state defaults flow naturally there.

For Live mode (no eventEngine), no Silmarillion state matters — the pulse never fires.

For Dynamic modes, `loadPreset` constructs a fresh EventEngine. The `createWorldState()` factory (modified in Task 3) sets `silmarillionVersion = '3.5'`, `lastReleaseTier = null`, `frontierLead = 0`. So no main.js change is strictly required for the *initial* values.

However, `_resetCore` is also called when *swapping presets within a session* (line 1090). In that path, the existing eventEngine instance is preserved if the new preset is the same family — and pulses are *not* automatically reset. So we need to ensure `_releasesThisYear` and the pulse state get reset whenever `_resetCore` runs.

In `main.js`, locate `_resetCore` (line 1721). After `if (eventEngine) eventEngine.resetTriggerCooldowns();` (line 1730), add:

```js
    if (eventEngine) {
        // Reset Silmarillion release state on game reset (preset re-load includes this path)
        eventEngine._releasesThisYear = 0;
        eventEngine.world.pnth.silmarillionVersion = '3.5';
        eventEngine.world.pnth.lastReleaseTier = null;
        eventEngine.world.pnth.frontierLead = 0;
        // Reset the modelRelease pulse so initial offset reapplies
        for (const pulse of eventEngine._pulses) {
            if (pulse.type === 'modelRelease') pulse.nextDay = -1;
        }
    }
```

- [ ] **Step 2: Verify by clicking through preset reset in the UI**

Serve `/shoals/` and open browser. Switch to Dynamic preset. In console:

```js
eventEngine._releasesThisYear = 5;
eventEngine.world.pnth.silmarillionVersion = '7.3';
eventEngine.world.pnth.frontierLead = -2;
```

Click the reset button (or re-select the same preset in the dropdown). In console:

```js
console.log(eventEngine._releasesThisYear,
            eventEngine.world.pnth.silmarillionVersion,
            eventEngine.world.pnth.frontierLead);
```

Expected: `0 3.5 0`

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "main: reset Silmarillion state on game reset"
```

---

## Task 11: LLM mode — system prompt + tool schema

**Files:**
- Modify: `src/llm.js`

- [ ] **Step 1: Locate the system prompt**

Open `src/llm.js`. Find the constant or template-literal that contains the system prompt for the LLM (look for keywords like "Palanthropic", "Atlas Aegis", "Barron", or the world-state list). It's likely a top-level `const SYSTEM_PROMPT = \`...\`` or similar.

- [ ] **Step 2: Add Silmarillion lore block to the system prompt**

Add the following paragraph immediately after the existing PNTH/Atlas-products description (search for "Atlas Sentinel" or similar to find the right insertion point):

```
SILMARILLION (PNTH foundation model line):
Silmarillion is PNTH's frontier foundation model line. Every Atlas product runs
on top of the latest Silmarillion generation. The game tracks
world.pnth.silmarillionVersion (string, e.g. "3.5", "4.0") which the engine
bumps on a quarterly schedule (3 minor bumps + 1 major bump per year). After
each release the engine sets world.pnth.lastReleaseTier to one of:
"breakthrough", "strong", "mediocre", "disappointing", "failure".
world.pnth.frontierLead (-3..+3) tracks PNTH's lead vs the global frontier
(Tianxia at Zhaowei in Serica; Aletheia at Covenant once Gottlieb has
resigned). Ptonos (Austin-headquartered) is PNTH's domestic GPU supplier;
Zhaowei is the contested foreign alternative. When you write events about
the AI race, reference these names and the current version when relevant.
You may set lastReleaseTier (enum) and add to frontierLead, but you cannot
modify silmarillionVersion -- the engine owns version bumps.
```

- [ ] **Step 3: Update the tool schema to include the new writable paths**

Locate the tool schema definition (likely a `world_state_path` enum or a list of allowed paths in a JSON schema). Add `pnth.lastReleaseTier` and `pnth.frontierLead` to the list of allowed paths.

If the schema enumerates paths explicitly (look for `"pnth.commercialMomentum"` or similar in a string array), add the two new entries to that array. If the schema uses a wildcard or pattern matcher, no schema change is needed beyond the world-state validation already added in Task 3.

- [ ] **Step 4: Smoke test**

This requires an Anthropic API key configured in localStorage. Skip this step if no key is available — the plan's offline path does not require LLM smoke testing. If a key is available:

1. Switch to "Dynamic (LLM)" preset
2. Wait for the first LLM batch
3. Check the event log for any LLM-generated events that reference Silmarillion or the new fields
4. Confirm no errors in console

- [ ] **Step 5: Commit**

```bash
git add src/llm.js
git commit -m "llm: extend system prompt and tool schema with Silmarillion lore"
```

---

## Task 12: Regulations — Algorithmic Capability Disclosure Act

**Files:**
- Modify: `src/regulations.js`

- [ ] **Step 1: Add the bill stub**

In `src/regulations.js`, locate the `REGULATIONS` array (starts around line 14). Append a new entry just before the closing `];` (after the `filibuster_uncertainty` entry around line 109):

```js
    {
        id: 'algorithmic_capability_disclosure_act',
        name: 'Algorithmic Capability Disclosure Act',
        description: 'Reyes\'s response to the Silmarillion capability surge — mandatory pre-release disclosure of foundation-model evaluations to the FTC. Compliance overhead increases borrowing costs across AI-exposed names.',
        color: 'var(--ext-purple)',
        type: 'legislative',
        effects: { borrowSpreadAdd: 0.2 },
    },
```

- [ ] **Step 2: Verify the bill is referenced from the breakthrough chain**

Recall that Task 8a's `regulator_capability_concern` event has an `effects` function that calls `advanceBill('algorithmic_capability_disclosure_act', 'introduced')`. Confirm the id matches exactly:

Run: `grep -n "algorithmic_capability_disclosure_act" src/`
Expected: at least 2 matches — one in `src/regulations.js` (the new entry) and one in `src/events/silmarillion.js` (the lazy import in the breakthrough followup).

- [ ] **Step 3: Commit**

```bash
git add src/regulations.js
git commit -m "regulations: add Algorithmic Capability Disclosure Act bill stub"
```

---

## Task 13: CLAUDE.md — document the new mechanics

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a Silmarillion entry to the Architecture > Narrative systems paragraph**

In `shoals/CLAUDE.md`, locate the "Narrative systems" paragraph that begins "Dynamic and Dynamic (LLM) modes". After the description of `events.js`, append a sentence to that paragraph:

```
A new `model_release` pulse (32-day initial offset, 63-day interval, alternating with `pnth_earnings`) bumps `world.pnth.silmarillionVersion` quarterly (3 minor + 1 major per year, starting at "3.5") and rolls a tier from a 5-bucket distribution biased by world state (frontierLead, tradeWarStage, aegisControversy, commercialMomentum, gottliebStartedRival). Tier-keyed headline events live in `src/events/silmarillion.js` and seed followup chains via the existing followup mechanism.
```

- [ ] **Step 2: Add to the World State Domains list**

Locate the "### World State Domains" section. In the `pnth` description, append:

```
+ `silmarillionVersion` (string default "3.5") + `lastReleaseTier` (enum, set after each release) + `frontierLead` (-3..+3, PNTH lead vs Tianxia/Aletheia)
```

- [ ] **Step 3: Add to "Will Cause Bugs" section**

In the `### Will Cause Bugs` subsection of Gotchas, add:

```
- `world.pnth.silmarillionVersion` is system-managed via `_bumpSilmarillionVersion` and `_releasesThisYear`; the LLM whitelist excludes it. Never write to it from event effects.
- The `model_release` pulse is `type: 'modelRelease'` (not `'recurring'`) — the reset loop in `EventEngine.reset()` and `_resetCore` both must handle this branch or pulses will never reseed after a game reset.
- `_fireSilmarillionRelease` resolves headline placeholders via `replaceAll('{version}', ...)` etc. Don't use literal curly braces in unrelated headlines or they may collide if the substitution is later generalized.
- Major-release magnitude multiplier (1.5× params, 2× frontierLead delta) is applied in `_fireSilmarillionRelease` BEFORE `_fireEvent`, so the cloned event flows through normal clamping.
```

- [ ] **Step 4: Add to "Do NOT Re-add" section**

```
- `category: 'pnth_silmarillion'` or other variant category for model release events — the canonical category is `'model_release'` for the 5 tier headlines, and `'pnth'` for the 16 followups.
- A separate `releasesThisYear` reset based on `sim.day` modular arithmetic — the counter is purely incremental on the engine instance and resets only via `EventEngine.reset()` / `_resetCore`.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Silmarillion model release pulse and gotchas"
```

---

## Task 14: End-to-end smoke test

**Files:** none (verification only)

- [ ] **Step 1: Serve and load a long simulated trading session**

Run from repo root: `python -m http.server`. Navigate to `http://localhost:8000/shoals/`. Switch preset to "Dynamic". Set speed to maximum. Click play. Let it run.

- [ ] **Step 2: Watch the event log for Silmarillion releases**

Within ~32 trading days of game start, expect to see the first Silmarillion 3.6 release. Within ~252 days expect to have seen all four releases of year 1, with the 4th being a major bump to 4.0.

- [ ] **Step 3: Confirm tier diversity over many releases**

Let the simulation run for the full 4 years (1008 days). Check `eventEngine.eventLog` in console for entries with `category: 'model_release'` (and the inline mediocre-minor toasts which have category 'model_release' too). Filter:

```js
const releases = eventEngine.eventLog.filter(e => e.category === 'model_release');
console.log('Total releases:', releases.length);
console.log('Versions seen:', releases.map(r => r.headline.match(/Silmarillion (\d+\.\d+)/)?.[1]).filter(Boolean));
```

Expected: ~16 releases (one per quarter beat), versions stepping cleanly from 3.6 → 7.0 with major bumps at year boundaries.

- [ ] **Step 4: Confirm followup chains fire**

```js
const pnthEvents = eventEngine.eventLog.filter(e =>
    ['serica_zhaowei_scrambles', 'covenant_talent_raid', 'kassis_internal_doubt',
     'activist_stake_revealed', 'analyst_downgrades', 'ptonos_revises_pnth_bookings']
    .some(id => e.headline.includes('Zhaowei') || e.headline.includes('Covenant') ||
                e.headline.includes('Lockstep') || e.headline.includes('Ptonos earnings'))
);
console.log('Followup events seen:', pnthEvents.length);
```

Expected: > 0 (exact number depends on tier roll RNG; over 16 releases at least a handful of tail-tier rolls should fire chains).

- [ ] **Step 5: Confirm `frontierLead` evolves**

```js
console.log('Final frontierLead:', eventEngine.world.pnth.frontierLead);
```

Expected: Some value in [-3, +3] reflecting the cumulative tier rolls. Likely positive in a clean run, negative in a turbulent one.

- [ ] **Step 6: No commit** (this is verification only)

---

## Self-Review

**Spec coverage check:**

| Spec section | Plan task |
|--------------|-----------|
| Cadence & versioning | Tasks 2, 5, 7 |
| World state additions | Task 3 |
| Tier matrix | Tasks 4, 8a-8c |
| World-state modulation | Task 4 |
| Followup chain catalog | Tasks 8a-8c |
| Cross-domain wiring (Gottlieb, Aegis, Serica, Covenant, Regulatory) | Tasks 8a-8c, 12 |
| Lore additions | Task 1 |
| File-level changes | Tasks 1-13 |
| LLM mode considerations | Task 11 |
| Reset / migration | Tasks 7, 10 |

**Coverage gaps:** None identified.

**Type consistency check:**
- `_rollSilmarillionTier` returns one of 5 string labels. `_fireSilmarillionRelease` uses those labels for both `world.pnth.lastReleaseTier` assignment and `eventId` construction (`silmarillion_${tier}`). Event ids in `silmarillion.js` match: `silmarillion_breakthrough`, `silmarillion_strong`, `silmarillion_major_meh` (special case), `silmarillion_disappointing`, `silmarillion_failure`. ✓
- `releasesThisYear` consistent across constructor (Task 5), `_bumpSilmarillionVersion` (Task 5), `reset()` (Task 7), `_resetCore` (Task 10). ✓
- `MODEL_RELEASE_INTERVAL` / `JITTER` / `OFFSET` defined in Task 2, imported in Task 7. ✓
- `algorithmic_capability_disclosure_act` id consistent between Task 8a (event effect) and Task 12 (bill stub). ✓
- World state field names (`silmarillionVersion`, `lastReleaseTier`, `frontierLead`) consistent across Tasks 3, 4, 5, 6, 7, 10, 11, 13. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" present. All code blocks contain complete implementation. Headline copy is finished prose, not placeholder text.

---

## Execution Handoff

Plan complete and saved to `shoals/docs/superpowers/plans/2026-04-22-silmarillion-model-releases.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
