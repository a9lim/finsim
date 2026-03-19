# Dynamic Market Regime -- Design Spec

## Overview

Add two new market regime modes to Shoals: **Dynamic (Offline)** and **Dynamic (LLM)**. Both use a shared event engine that fires narrative events on a Poisson schedule, shifting simulation parameters in real time. Offline mode draws from a curated pool of ~50-60 events; LLM mode generates events via the Anthropic Claude API with full sim-state context.

The simulated company is **Palanthropic (PNTH)**, a tech company with government defense contracts, ties to the Vice President, and an ethical code that puts it in tension with government surveillance demands.

Additionally, the rate mean (`b`) slider range expands from `[0.01, 0.10]` to `[-0.05, 0.10]` to support ZIRP/NIRP modeling.

## Event Data Structure

```js
{
  headline: "Fed cuts rates by 50bps amid recession fears",
  params: { b: -0.02, mu: -0.03, lambda: +2.0 },  // deltas applied to current params
  magnitude: "minor" | "moderate" | "major"
}
```

- `params` are **deltas** (additive), not absolute values. Multiple events compose naturally.
- After applying deltas, each parameter is clamped to its valid range (matching slider min/max).
- `magnitude` controls toast duration and Poisson rate grouping.

## Event Engine (`src/events.js`)

### `PARAM_RANGES` -- canonical clamping source

`PARAM_RANGES` is the single source of truth for valid parameter bounds. `applyDeltas()` clamps against it. Slider HTML `min`/`max` must match these values (kept in sync manually).

```js
export const PARAM_RANGES = {
  mu:     { min: -0.20, max: 0.20 },
  theta:  { min: 0.01,  max: 0.50 },
  kappa:  { min: 0.1,   max: 5.0 },
  xi:     { min: 0.1,   max: 1.0 },
  rho:    { min: -0.95, max: 0.00 },
  lambda: { min: 0.0,   max: 10.0 },
  muJ:    { min: -0.15, max: 0.05 },
  sigmaJ: { min: 0.01,  max: 0.15 },
  a:      { min: 0.1,   max: 1.0 },
  b:      { min: -0.05, max: 0.10 },
  sigmaR: { min: 0.001, max: 0.025 },
};
```

Note: `rho` max is `0.00` (matching the slider), `muJ` max is `0.05`, and `sigmaR` max is `0.025` -- all matching existing slider bounds exactly.

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

### Rate Mean Slider

```html
<!-- before -->
<input type="range" id="slider-b" min="0.01" max="0.10" step="0.01" value="0.04">
<!-- after -->
<input type="range" id="slider-b" min="-0.05" max="0.10" step="0.01" value="0.04">
```

This applies globally (all presets), enabling ZIRP/NIRP modeling regardless of mode.

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
| `src/events.js` | ~350 | `EventEngine`, `OFFLINE_EVENTS`, `PARAM_RANGES` |
| `src/llm.js` | ~150 | `LLMEventSource` |

## Modified Files

| File | Changes |
|------|---------|
| `src/config.js` | Add two Dynamic presets to `PRESETS` at indices 5 and 6, using Calm Bull params as base. These are real preset objects with `name`, `mu`, `theta`, etc. -- `sim.reset(5)` and `sim.reset(6)` work normally. The `name` field distinguishes them: `"Dynamic (Offline)"` and `"Dynamic (LLM)"`. |
| `index.html` | New `<option>`s in preset dropdown, LLM settings section, event log section, slider-b min to -0.05 |
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

Defined in `PARAM_RANGES` (see Event Engine section). Matches existing slider HTML `min`/`max` exactly:

| Param | Min | Max | Note |
|-------|-----|-----|------|
| mu | -0.20 | 0.20 | |
| theta | 0.01 | 0.50 | |
| kappa | 0.1 | 5.0 | |
| xi | 0.1 | 1.0 | |
| rho | -0.95 | 0.00 | Slider max is 0.00, not -0.1 |
| lambda | 0.0 | 10.0 | |
| muJ | -0.15 | 0.05 | Slider allows positive muJ |
| sigmaJ | 0.01 | 0.15 | |
| a | 0.1 | 1.0 | |
| b | -0.05 | 0.10 | Slider min changed from 0.01 |
| sigmaR | 0.001 | 0.025 | Slider max is 0.025 |

## Not in Scope

- Multi-provider LLM support (OpenAI, Google) -- requires CORS proxy, deferred
- Event chaining/storyline arcs in offline mode -- preconditions provide basic coherence
- User-editable event pool
- Event impact preview before application
