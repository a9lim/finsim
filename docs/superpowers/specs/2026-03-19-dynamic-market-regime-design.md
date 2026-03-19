# Dynamic Market Regime -- Design Spec

## Overview

Add two new market regime modes to Shoals: **Dynamic (Offline)** and **Dynamic (LLM)**. Both use a shared event engine that fires narrative events on a Poisson schedule, shifting simulation parameters in real time. Offline mode draws from a curated pool of ~50-60 events; LLM mode generates events via the Anthropic Claude API with full sim-state context.

The simulated company is **Palanthropic (PNTH)**, a tech company with government defense contracts, ties to the Vice President, and an ethical code that puts it in tension with government surveillance demands.

Events support MTTH-style chains (Paradox-inspired): a fired event can schedule followup events with probabilistic delays, enabling multi-step narrative arcs like government contract disputes, rate hike cycles, and antitrust sagas.

Additionally, all 11 parameter slider ranges are expanded significantly to allow extreme-but-plausible regimes (e.g., rate mean -5% to 20% for ZIRP/NIRP/Volcker, drift -50% to +50% for individual stock swings, vol-of-vol up to 1.5).

## Event Data Structure

```js
{
  id: "fed_cut_50",                                   // unique key (for chain references)
  headline: "Fed cuts rates by 50bps amid recession fears",
  params: { b: -0.02, mu: -0.03, lambda: +2.0 },     // deltas applied to current params
  magnitude: "minor" | "moderate" | "major",
  when: (sim) => sim.b > 0.01,                        // optional precondition
  followups: [                                         // optional event chain
    { id: "market_relief_rally", mtth: 5, weight: 0.7 },
    { id: "fed_credibility_crisis", mtth: 30, weight: 0.3 },
  ]
}
```

- `params` are **deltas** (additive), not absolute values. Multiple events compose naturally.
- After applying deltas, each parameter is clamped to its valid range.
- `magnitude` controls toast duration and Poisson rate grouping.

## Event Chains (MTTH)

Inspired by Paradox-style Mean Time To Happen mechanics. When an event with `followups` fires, each followup is rolled independently:

**Scheduling:** For each followup entry, a pending followup is created with:
- `targetDay = currentDay + poisson_sample(mtth)` -- the MTTH is the expected delay in trading days, actual delay drawn from a Poisson distribution for variance
- `weight` -- probability that this followup actually fires when its target day arrives (0.0-1.0). Checked at fire time; if the roll fails, the followup is silently discarded.

**Pending followups** are stored in `_pendingFollowups[]` on the EventEngine. Each day in `maybeFire()`, pending followups whose `targetDay <= currentDay` are checked before the regular Poisson draw. This means chain events fire deterministically on schedule (not subject to the base Poisson rate), but their weight roll adds uncertainty about *whether* they actually happen.

**Followup events can themselves have followups**, enabling multi-step arcs. Max chain depth is 5 to prevent runaway cascades.

**Preconditions on followups:** Followup events still have their `when` precondition checked at fire time. If the sim state has shifted such that the followup no longer makes sense (e.g., rates already crashed before the "rate cut" followup fires), it's discarded.

**LLM mode:** The LLM prompt includes the pending followup queue so it can generate events that narratively lead into or branch from scheduled followups. The LLM can also return events with `followups` arrays.

**Example chains (offline):**

```
"PNTH refuses DOJ backdoor request"
  → (mtth: 15, weight: 0.8) "AG threatens to review all PNTH contracts"
    → (mtth: 40, weight: 0.5) "DOJ files antitrust suit against PNTH"
    → (mtth: 20, weight: 0.6) "VP intervenes; back-channel deal preserves contracts"
  → (mtth: 10, weight: 0.4) "PNTH whistleblower leaks internal ethics memo"

"Fed signals rate hike cycle"
  → (mtth: 30, weight: 0.7) "Fed raises rates 25bps"
    → (mtth: 30, weight: 0.6) "Fed raises rates another 25bps"
    → (mtth: 45, weight: 0.3) "Housing market shows stress; Fed pauses"
  → (mtth: 60, weight: 0.4) "Yield curve inverts; recession fears mount"

"PNTH awarded $2B defense surveillance contract"
  → (mtth: 20, weight: 0.5) "ACLU lawsuit challenges PNTH surveillance program"
  → (mtth: 10, weight: 0.6) "Competitor files patent infringement suit"
  → (mtth: 40, weight: 0.3) "Senate committee opens investigation into VP-PNTH ties"
```

**Reset behavior:** `eventEngine.reset()` clears `_pendingFollowups[]` along with log and queue.

## Event Engine (`src/events.js`)

### `PARAM_RANGES` -- canonical clamping source

`PARAM_RANGES` is the single source of truth for valid parameter bounds. `applyDeltas()` clamps against it. Slider HTML `min`/`max` must match these values (kept in sync manually).

```js
export const PARAM_RANGES = {
  mu:     { min: -0.50, max: 0.50 },   // individual stocks: -38% (2008 banks) to +50% (meme rallies)
  theta:  { min: 0.005, max: 1.00 },   // vol 7% (sleepy utility) to 100% (GME/meme territory)
  kappa:  { min: 0.05,  max: 10.0 },   // near-random-walk vol (0.05) to instant snap-back (10)
  xi:     { min: 0.05,  max: 1.50 },   // mild vol-of-vol to extreme; >1.5 risks Euler blow-up
  rho:    { min: -0.99, max: 0.50 },   // deep leverage effect to positive (commodities, some EM)
  lambda: { min: 0.0,   max: 15.0 },   // no jumps to ~monthly jump events
  muJ:    { min: -0.25, max: 0.15 },   // -22% avg crash jumps to +16% positive surprise jumps
  sigmaJ: { min: 0.005, max: 0.25 },   // tight jump clusters to fat-tailed dispersion
  a:      { min: 0.01,  max: 2.0 },    // very slow rate drift to aggressive mean-reversion
  b:      { min: -0.05, max: 0.20 },   // NIRP/ZIRP to Volcker-era rate targeting
  sigmaR: { min: 0.001, max: 0.050 },  // calm rate regime to crisis-level rate volatility
};
```

These ranges are substantially wider than the current slider bounds, enabling the event system to push the simulation into extreme-but-plausible regimes. Slider HTML `min`/`max` attributes must be updated to match. The key numerical constraint is `xi`: above ~1.5, the Euler-Maruyama discretization of the Heston variance process can produce large negative variance spikes before flooring, degrading path quality.

### `EventEngine` class

**Constructor:** `new EventEngine(source)` where `source` is `"offline"` or `"llm"`.

**State:**
- `eventLog[]` -- last 20 events with day numbers, for LLM context and UI display.
- `_queue[]` -- pending events (LLM mode pre-fetches batches).
- `_poissonRate` -- base rate ~0.05/day (~1 event per 20 trading days).
- `_prefetching` -- boolean, true while an LLM batch fetch is in flight.

**Methods:**
- `maybeFire(sim, day)` -- called each day from `_onDayComplete()`. Performs a Poisson draw. If an event fires, applies param deltas to `sim` (mutates `sim.mu`, `sim.theta`, etc. directly), pushes to `eventLog`, returns the event (for toast). Returns `null` if no event.
- `_drawOffline(sim)` -- filters `OFFLINE_EVENTS` by preconditions against current sim state, picks randomly.
- `_drawLLM(sim)` -- pops from `_queue`. If queue empty, triggers async batch fetch and returns an offline fallback for this tick. Shows a subtle toast ("Generating events...") on first LLM fetch so the user knows LLM mode is warming up.
- `prefetch(sim)` -- called once when LLM mode is activated (in `loadPreset`). Kicks off the first batch fetch immediately so events are ready before the first Poisson draw. Prevents the "silent offline fallback for 60+ days" problem.
- `applyDeltas(sim, params)` -- for each key in `params`, adds the delta to `sim[key]`, then clamps to `PARAM_RANGES[key]`. Does NOT touch the UI; the caller (`main.js`) is responsible for syncing sliders afterward.
- `reset()` -- clears log, queue, and cancels any in-flight fetch.

### `OFFLINE_EVENTS` array

~50-60 curated events across five categories:

| Category | Count | Example | Typical deltas |
|----------|-------|---------|---------------|
| Fed/Monetary | ~10 | "Fed cuts rates by 50bps amid slowing growth" | `b`, `sigmaR`, `a` |
| Macro/Geopolitical | ~10 | "Trade war escalates: new tariffs on tech imports" | `mu`, `theta`, `lambda`, `muJ` |
| Sector/Tech | ~8 | "Congress introduces AI regulation bill" | `mu`, `theta`, `xi` |
| PNTH Company | ~15-20 | "PNTH refuses DOJ backdoor request; AG threatens contract review" | varies by severity |
| Market Structure | ~8 | "Short squeeze triggers volatility spike" | `xi`, `lambda`, `sigmaJ`, `theta` |

**Preconditions:** Each event has an optional `when` function: `(sim) => boolean`. Events whose preconditions fail are filtered out before random selection. Examples:
- "Fed raises rates" requires `sim.b < 0.08`
- "PNTH awarded defense contract" requires `sim.mu > -0.05` (company not in freefall)
- "Rate cut to combat deflation" requires `sim.b > 0.01`

**Inspiration from real-world events:** Tariff escalations, FOMC pivots, antitrust probes (DOJ v. Google/Apple), defense contract awards (Palantir/Anduril), whistleblower scandals, congressional tech hearings, flash crashes, meme stock squeezes, pandemic supply shocks, semiconductor export controls.

## LLM Integration (`src/llm.js`)

### `LLMEventSource` class

**Configuration** (stored in localStorage):
- `provider`: `"anthropic"` (only supported provider for now; architected for future expansion)
- `apiKey`: user-provided key
- `model`: `"claude-haiku-4-5-20251001"` (default) or `"claude-sonnet-4-20250514"` (latest available models as of 2026-03-19)

**Batch fetching:**
- Each API call requests **3-5 events** as a JSON array.
- Events are queued and drawn one at a time by the event engine.
- ~1 API call per 60-100 trading days. Cost: ~$0.001-0.002 per batch.

**Prompt structure:**
- System prompt: PNTH universe lore, parameter schema with valid ranges and descriptions, JSON output format
- User message: current sim state -- sends `sqrt(v)` labeled as `"volatility"` (not raw variance `v`) so the LLM can reason about it correctly. Also sends: S, r, mu, theta, kappa, xi, rho, lambda, muJ, sigmaJ, a, b, sigmaR, day
- Last ~10 events from `eventLog[]` for narrative continuity
- Instruction: generate 3-5 events that build a coherent narrative, return as JSON array

**API call:**
```js
POST https://api.anthropic.com/v1/messages
Headers:
  content-type: application/json
  x-api-key: <user key>
  anthropic-version: 2023-06-01
  anthropic-dangerous-direct-browser-access: true
Body:
  model: "claude-haiku-4-5-20251001"
  max_tokens: 1024
  messages: [{ role: "user", content: <prompt> }]
  system: <system prompt>
Response text: response.content[0].text  (parsed as JSON)
```

**Fallback:** On any API failure (network, auth, parse error), show a warning toast and fall back to `_drawOffline()` for that batch. No sim interruption.

### Provider Abstraction

`llm.js` uses an internal `_call(messages)` method. Currently hardcoded to Anthropic. The structure allows adding OpenAI/Google providers later (would require a CORS proxy).

## UI Changes

### Settings Tab

**Market Regime dropdown** -- two new options appended:
```html
<option value="5">Dynamic (Offline)</option>
<option value="6">Dynamic (LLM)</option>
```

**Conditional sections** with defined DOM IDs:

**LLM Settings section** (`#llm-settings-section`, shown only when Dynamic LLM is selected):
- Provider dropdown (Anthropic only, disabled/grayed for now)
- API Key: `<input type="password" id="llm-api-key">` with show/hide toggle button (`#llm-key-toggle`)
- Model: `<select id="llm-model">` (`claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`)
- All values persist in localStorage under keys `shoals_llm_key`, `shoals_llm_model`

**Event Log section** (`#event-log-section`, shown for either Dynamic mode):
- Last ~5 events with day number and headline
- Scrollable container, compact styling, max-height ~120px
- Clears on reset

**Visibility logic:** On `#preset-select` `change` event, check `selectedIndex`:
- `>= 6` (LLM): show both `#llm-settings-section` and `#event-log-section`
- `== 5` (Offline): show `#event-log-section` only, hide `#llm-settings-section`
- `<= 4` (static presets): hide both sections

**Advanced parameter sliders** remain visible and functional in Dynamic modes. Events shift them; user can still manually override. When an event fires, `main.js` calls `syncSettingsUI($, _simSettingsObj())` to update slider positions and value labels (using the existing `_simSettingsObj()` wrapper pattern).

### Slider Range Expansion

All 11 parameter sliders are expanded to match the new `PARAM_RANGES`. This applies globally (all presets), not just Dynamic modes. The rate mean slider is the most notable change:

```html
<!-- rate mean: before -->
<input type="range" id="slider-b" min="0.01" max="0.10" step="0.01" value="0.04">
<!-- rate mean: after -->
<input type="range" id="slider-b" min="-0.05" max="0.20" step="0.01" value="0.04">
```

See the Clamping Ranges table for all updated min/max values.

### Toasts

Events use `showToast()` with magnitude-based behavior:

| Magnitude | Duration | Style |
|-----------|----------|-------|
| minor | 3s | Default toast |
| moderate | 5s | Default toast |
| major | 8s | Accent border (`--up` for positive, `--down` for negative sentiment) |

Sentiment determined by net effect: if sum of deltas on `mu` is positive, it's positive sentiment; negative otherwise. If no `mu` delta, infer from majority of deltas.

### Keyboard Shortcuts

`6` and `7` load Dynamic (Offline) and Dynamic (LLM) presets respectively (extending the existing `1`-`5` pattern).

## New Files

| File | Lines (est.) | Exports |
|------|-------------|---------|
| `src/events.js` | ~500 | `EventEngine`, `OFFLINE_EVENTS`, `PARAM_RANGES` |
| `src/llm.js` | ~150 | `LLMEventSource` |

## Modified Files

| File | Changes |
|------|---------|
| `src/config.js` | Add two Dynamic presets to `PRESETS` at indices 5 and 6, using Calm Bull params as base. These are real preset objects with `name`, `mu`, `theta`, etc. -- `sim.reset(5)` and `sim.reset(6)` work normally. The `name` field distinguishes them: `"Dynamic (Offline)"` and `"Dynamic (LLM)"`. |
| `index.html` | New `<option>`s in preset dropdown, LLM settings section, event log section, all 11 slider ranges expanded to match `PARAM_RANGES` |
| `src/ui.js` | Bind LLM settings inputs, show/hide conditional sections, render event log, update sliders on event fire |
| `main.js` | Import/instantiate `EventEngine`, wire into `_onDayComplete()`, handle Dynamic preset selection (detect index >= 5, create/destroy `EventEngine`, call `prefetch()` for LLM mode), call `syncSettingsUI($, _simSettingsObj())` after each event fires, call `eventEngine.reset()` in `loadPreset()`/`resetSim()`, null out `eventEngine` when switching to non-Dynamic presets, keyboard shortcuts 6/7 |
| `styles.css` | Event log styles, LLM settings section, major-event toast accent |
| `CLAUDE.md` | Update file map and module dependencies |

## Module Dependency Graph (additions)

```
main.js
  |- src/events.js    (EventEngine, OFFLINE_EVENTS, PARAM_RANGES)
  |    |- src/llm.js  (LLMEventSource -- lazy-loaded only for LLM mode)
  ...existing deps...
```

## Clamping Ranges

Defined in `PARAM_RANGES` (see Event Engine section). All slider HTML `min`/`max` attributes must be updated to match these expanded ranges.

| Param | Old Min | New Min | Old Max | New Max | Rationale |
|-------|---------|---------|---------|---------|-----------|
| mu | -0.20 | **-0.50** | 0.20 | **0.50** | Individual stocks swing far wider than indices |
| theta | 0.01 | **0.005** | 0.50 | **1.00** | VIX 7 to VIX 100 equivalent |
| kappa | 0.1 | **0.05** | 5.0 | **10.0** | Near-random-walk to instant snap-back |
| xi | 0.1 | **0.05** | 1.0 | **1.50** | Capped at 1.5 for Euler stability |
| rho | -0.95 | **-0.99** | 0.00 | **0.50** | Allows positive correlation (commodities) |
| lambda | 0.0 | 0.0 | 10.0 | **15.0** | More frequent jump events |
| muJ | -0.15 | **-0.25** | 0.05 | **0.15** | Deeper crashes, bigger positive surprises |
| sigmaJ | 0.01 | **0.005** | 0.15 | **0.25** | Tighter and fatter jump tails |
| a | 0.1 | **0.01** | 1.0 | **2.0** | Very slow drift to aggressive reversion |
| b | 0.01 | **-0.05** | 0.10 | **0.20** | NIRP to Volcker-era |
| sigmaR | 0.001 | 0.001 | 0.025 | **0.050** | Crisis-level rate volatility |

Slider `step` values should also be reviewed for the expanded ranges (e.g., `mu` step could go from 0.01 to 0.02, `theta` step from 0.01 to 0.005 at the low end). Implementation should pick sensible steps that don't create an unwieldy number of slider positions.

## Not in Scope

- Multi-provider LLM support (OpenAI, Google) -- requires CORS proxy, deferred
- User-editable event pool
- Event impact preview before application
