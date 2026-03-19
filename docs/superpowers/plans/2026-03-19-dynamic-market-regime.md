# Dynamic Market Regime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Dynamic market regime modes (Offline and LLM) with a shared MTTH event chain engine, plus expand all parameter slider ranges.

**Architecture:** Shared `EventEngine` class in `src/events.js` with pluggable event sources (offline pool or LLM). Events fire on Poisson schedule, apply parameter deltas to the simulation, and support MTTH-style followup chains. `src/llm.js` handles Anthropic API calls with batch prefetching. UI additions in Settings tab for LLM config and event log.

**Tech Stack:** Vanilla JS ES6 modules, Anthropic Messages API (browser-direct via `anthropic-dangerous-direct-browser-access`), no dependencies.

**Spec:** `docs/superpowers/specs/2026-03-19-dynamic-market-regime-design.md`

---

### Task 1: Expand slider ranges and add Dynamic presets to config

**Files:**
- Modify: `index.html:362-413` (all 11 slider ranges)
- Modify: `index.html:345-351` (preset dropdown options)
- Modify: `src/config.js:19-25` (PRESETS array)

- [ ] **Step 1: Update all 11 slider ranges in index.html**

```html
<!-- slider-mu: was min="-0.20" max="0.20" step="0.01" -->
<input type="range" id="slider-mu" min="-0.50" max="0.50" step="0.02" value="0.08">

<!-- slider-theta: was min="0.01" max="0.50" step="0.01" -->
<input type="range" id="slider-theta" min="0.005" max="1.00" step="0.005" value="0.04">

<!-- slider-kappa: was min="0.1" max="5.0" step="0.1" -->
<input type="range" id="slider-kappa" min="0.05" max="10.0" step="0.05" value="3.0">

<!-- slider-xi: was min="0.1" max="1.0" step="0.1" -->
<input type="range" id="slider-xi" min="0.05" max="1.50" step="0.05" value="0.3">

<!-- slider-rho: was min="-0.95" max="0.00" step="0.05" -->
<input type="range" id="slider-rho" min="-0.99" max="0.50" step="0.01" value="-0.50">

<!-- slider-lambda: was min="0.0" max="10.0" step="0.5" -->
<input type="range" id="slider-lambda" min="0.0" max="15.0" step="0.5" value="0.5">

<!-- slider-muJ: was min="-0.15" max="0.05" step="0.01" -->
<input type="range" id="slider-muJ" min="-0.25" max="0.15" step="0.01" value="-0.02">

<!-- slider-sigmaJ: was min="0.01" max="0.15" step="0.01" -->
<input type="range" id="slider-sigmaJ" min="0.005" max="0.25" step="0.005" value="0.03">

<!-- slider-a: was min="0.1" max="1.0" step="0.1" -->
<input type="range" id="slider-a" min="0.01" max="2.0" step="0.01" value="0.5">

<!-- slider-b: was min="0.01" max="0.10" step="0.01" -->
<input type="range" id="slider-b" min="-0.05" max="0.20" step="0.01" value="0.04">

<!-- slider-sigmaR: was min="0.001" max="0.025" step="0.001" -->
<input type="range" id="slider-sigmaR" min="0.001" max="0.050" step="0.001" value="0.005">
```

- [ ] **Step 2: Add Dynamic preset options to the dropdown in index.html**

After line 350 (`<option value="4">Rate Hike</option>`), add:

```html
<option value="5">Dynamic (Offline)</option>
<option value="6">Dynamic (LLM)</option>
```

- [ ] **Step 3: Add Dynamic presets to PRESETS in config.js**

Append two entries to the `PRESETS` array (using Calm Bull params as base starting point):

```js
{ name: 'Dynamic (Offline)', mu: 0.08, theta: 0.04, kappa: 3.0, xi: 0.3, rho: -0.5, lambda: 0.5, muJ: -0.02, sigmaJ: 0.03, a: 0.5, b: 0.04, sigmaR: 0.005 },
{ name: 'Dynamic (LLM)',     mu: 0.08, theta: 0.04, kappa: 3.0, xi: 0.3, rho: -0.5, lambda: 0.5, muJ: -0.02, sigmaJ: 0.03, a: 0.5, b: 0.04, sigmaR: 0.005 },
```

- [ ] **Step 4: Verify existing presets still load correctly**

Open in browser, click through all 5 original presets and confirm sliders update to correct values. Verify the new expanded ranges render properly (no visual breakage).

- [ ] **Step 5: Commit**

```bash
git add index.html src/config.js
git commit -m "feat: expand slider ranges and add Dynamic preset entries"
```

---

### Task 2: Create PARAM_RANGES and EventEngine core in `src/events.js`

**Files:**
- Create: `src/events.js`

This task creates the engine without any events (pool is empty). Tests come from manual verification since this is a zero-dependency vanilla JS project with no test framework.

- [ ] **Step 1: Create `src/events.js` with PARAM_RANGES, EventEngine class, and empty OFFLINE_EVENTS**

```js
/* ===================================================
   events.js -- Dynamic event engine for Shoals.
   Poisson-scheduled events that shift simulation
   parameters. Supports offline (curated) and LLM
   event sources, with MTTH-style followup chains.
   =================================================== */

// -- Canonical parameter clamping ranges --------------------------------
export const PARAM_RANGES = {
    mu:     { min: -0.50, max: 0.50 },
    theta:  { min: 0.005, max: 1.00 },
    kappa:  { min: 0.05,  max: 10.0 },
    xi:     { min: 0.05,  max: 1.50 },
    rho:    { min: -0.99, max: 0.50 },
    lambda: { min: 0.0,   max: 15.0 },
    muJ:    { min: -0.25, max: 0.15 },
    sigmaJ: { min: 0.005, max: 0.25 },
    a:      { min: 0.01,  max: 2.0 },
    b:      { min: -0.05, max: 0.20 },
    sigmaR: { min: 0.001, max: 0.050 },
};

const MAX_LOG = 20;
const MAX_CHAIN_DEPTH = 5;

// -- Offline event pool (populated in Task 3) ---------------------------
export const OFFLINE_EVENTS = [];

// -- Event-by-id lookup (built lazily) ----------------------------------
let _eventById = null;
function _getEventById(id) {
    if (!_eventById) {
        _eventById = new Map();
        for (const ev of OFFLINE_EVENTS) _eventById.set(ev.id, ev);
    }
    return _eventById.get(id) || null;
}

// -- EventEngine --------------------------------------------------------
export class EventEngine {
    constructor(source, llmSource = null) {
        this.source = source;           // 'offline' | 'llm'
        this._llm = llmSource;          // LLMEventSource instance (or null)
        this.eventLog = [];             // { day, headline, magnitude, params }
        this._queue = [];               // pre-fetched LLM events
        this._pendingFollowups = [];    // { id, targetDay, weight, depth }
        this._poissonRate = 0.05;       // ~1 event per 20 trading days
        this._prefetching = false;
    }

    /**
     * Called each completed trading day. May fire an event.
     * Returns the event object (for toast) or null.
     */
    maybeFire(sim, day) {
        // 1. Check pending followups first
        const firedFollowup = this._checkFollowups(sim, day);
        if (firedFollowup) return firedFollowup;

        // 2. Poisson draw for random event
        if (Math.random() >= this._poissonRate) return null;

        // 3. Draw from appropriate source
        const event = this.source === 'llm'
            ? this._drawLLM(sim)
            : this._drawOffline(sim);

        if (!event) return null;
        return this._fireEvent(event, sim, day, 0);
    }

    /** Kick off initial LLM batch fetch. */
    prefetch(sim) {
        if (this.source !== 'llm' || !this._llm) return;
        this._fetchBatch(sim);
    }

    /** Apply param deltas to sim, clamp to PARAM_RANGES. */
    applyDeltas(sim, params) {
        if (!params) return;
        for (const [key, delta] of Object.entries(params)) {
            const range = PARAM_RANGES[key];
            if (!range) continue;
            sim[key] = Math.min(range.max, Math.max(range.min, sim[key] + delta));
        }
    }

    /** Clear all state. */
    reset() {
        this.eventLog = [];
        this._queue = [];
        this._pendingFollowups = [];
        this._prefetching = false;
    }

    // -- Internal ---------------------------------------------------------

    _fireEvent(event, sim, day, depth) {
        this.applyDeltas(sim, event.params);

        const logEntry = {
            day,
            headline: event.headline,
            magnitude: event.magnitude || 'moderate',
            params: event.params || {},
        };
        this.eventLog.push(logEntry);
        if (this.eventLog.length > MAX_LOG) this.eventLog.shift();

        // Schedule followups (if any and within depth limit)
        if (event.followups && depth < MAX_CHAIN_DEPTH) {
            for (const fu of event.followups) {
                const delay = this._poissonSample(fu.mtth);
                this._pendingFollowups.push({
                    id: fu.id,
                    targetDay: day + Math.max(1, delay),
                    weight: fu.weight,
                    depth: depth + 1,
                });
            }
        }

        return logEntry;
    }

    _checkFollowups(sim, day) {
        const ready = [];
        const remaining = [];
        for (const pf of this._pendingFollowups) {
            if (pf.targetDay <= day) ready.push(pf);
            else remaining.push(pf);
        }
        this._pendingFollowups = remaining;

        // Process ALL ready followups (multiple can fire on the same day)
        let lastFired = null;
        for (const pf of ready) {
            // Weight roll
            if (Math.random() > pf.weight) continue;

            const event = _getEventById(pf.id);
            if (!event) continue;

            // Check precondition
            if (event.when && !event.when(sim)) continue;

            lastFired = this._fireEvent(event, sim, day, pf.depth);
        }
        return lastFired;
    }

    _drawOffline(sim) {
        const eligible = OFFLINE_EVENTS.filter(ev => !ev.when || ev.when(sim));
        if (eligible.length === 0) return null;
        return eligible[Math.floor(Math.random() * eligible.length)];
    }

    _drawLLM(sim) {
        if (this._queue.length > 0) return this._queue.shift();

        // Queue empty -- trigger fetch, return offline fallback
        if (!this._prefetching) this._fetchBatch(sim);
        return this._drawOffline(sim);
    }

    async _fetchBatch(sim) {
        if (!this._llm || this._prefetching) return;
        this._prefetching = true;
        try {
            const events = await this._llm.generateBatch(
                sim, this.eventLog, this._pendingFollowups
            );
            if (Array.isArray(events)) {
                for (const ev of events) {
                    if (ev && ev.headline && ev.params) this._queue.push(ev);
                }
            }
        } catch (e) {
            if (typeof showToast !== 'undefined')
                showToast('LLM event generation failed; using offline events.');
        }
        this._prefetching = false;
    }

    _poissonSample(mean) {
        if (mean <= 0) return 0;
        const L = Math.exp(-mean);
        let k = 0, p = 1;
        do { k++; p *= Math.random(); } while (p > L);
        return k - 1;
    }
}
```

- [ ] **Step 2: Verify the module loads without errors**

Add a temporary `import { PARAM_RANGES } from './src/events.js';` at the top of `main.js`, open in browser, check console for import errors. Remove the temporary import after verification.

- [ ] **Step 3: Commit**

```bash
git add src/events.js
git commit -m "feat: add EventEngine core with PARAM_RANGES and MTTH chains"
```

---

### Task 3: Populate offline event pool

**Files:**
- Modify: `src/events.js` (replace empty `OFFLINE_EVENTS` array)

- [ ] **Step 1: Replace the empty OFFLINE_EVENTS array with ~55 curated events**

Populate `OFFLINE_EVENTS` with events across 5 categories. Each event has: `id`, `headline`, `params` (deltas), `magnitude`, optional `when` (precondition), optional `followups` (MTTH chains). Events should be inspired by real-world financial events.

Categories and approximate counts:
- **Fed/Monetary** (~10): rate cuts, rate hikes, QE, hawkish/dovish pivots, emergency meetings
- **Macro/Geopolitical** (~10): trade wars, tariffs, sanctions, recession data, inflation surprises, oil shocks, pandemic scares
- **Sector/Tech** (~8): AI regulation, antitrust probes, semiconductor shortages, data breach scandals, tech IPO frenzy
- **PNTH Company** (~18): defense contracts, DOJ conflicts, VP ties, ethics board drama, whistleblowers, earnings beats/misses, patent suits, congressional hearings, product launches, executive departures
- **Market Structure** (~8): flash crashes, short squeezes, liquidity crises, options expiry vol, dark pool activity, algo trading glitches

Key event chains to implement (from spec):
1. "PNTH refuses DOJ backdoor request" chain (AG threatens -> antitrust suit OR VP intervenes; whistleblower leak)
2. "Fed signals rate hike cycle" chain (rate hike -> another hike OR housing stress; yield curve inversion)
3. "PNTH awarded defense contract" chain (ACLU lawsuit, patent suit, Senate investigation)

Preconditions should prevent contradictions (e.g., rate hike events require `sim.b < 0.15`, rate cut events require `sim.b > -0.03`).

Parameter deltas should be calibrated so:
- Minor events: 1-2 params, small deltas (e.g., `mu: +/-0.01`, `b: +/-0.005`)
- Moderate events: 2-3 params, medium deltas (e.g., `mu: +/-0.03`, `theta: +/-0.02`)
- Major events: 3-5 params, large deltas (e.g., `mu: +/-0.08`, `theta: +/-0.05`, `lambda: +/-2.0`)

- [ ] **Step 2: Verify event IDs are consistent**

Manually check that every `followups[].id` in the pool references an existing event's `id`. Mismatched IDs will silently fail (followup discarded).

- [ ] **Step 3: Commit**

```bash
git add src/events.js
git commit -m "feat: populate offline event pool with ~55 curated events and MTTH chains"
```

---

### Task 4: Create LLM event source in `src/llm.js`

**Files:**
- Create: `src/llm.js`

- [ ] **Step 1: Create `src/llm.js` with LLMEventSource class**

```js
/* ===================================================
   llm.js -- Anthropic API client for dynamic event
   generation in Shoals. Generates batches of narrative
   market events with parameter deltas.
   =================================================== */

import { PARAM_RANGES } from './events.js';

const LS_KEY_API  = 'shoals_llm_key';
const LS_KEY_MODEL = 'shoals_llm_model';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a financial event generator for a trading simulator. The simulated company is Palanthropic (ticker: PNTH), a tech company with government defense contracts. PNTH has close ties to the Vice President but frequently clashes with the government over ethical use of its surveillance technology.

Generate realistic market events that shift simulation parameters. Each event must be a JSON object with:
- "headline": string (1-2 sentence news headline)
- "params": object mapping parameter names to DELTA values (additive changes, not absolute). Valid keys and ranges:
${Object.entries(PARAM_RANGES).map(([k, r]) => '  ' + k + ': [' + r.min + ', ' + r.max + '] (delta should be a fraction of this range)').join('\n')}
- "magnitude": "minor" | "moderate" | "major"
- "followups": optional array of {id, mtth, weight} for chain events. id is a short snake_case identifier. mtth is mean trading days until followup. weight is probability (0-1) it fires.

Rules:
- Return a JSON array of 3-5 events
- Build a coherent narrative across events
- Events should reference current market conditions and past events
- Parameter deltas should be realistic: minor events touch 1-2 params with small deltas, major events touch 3-5 params with large deltas
- Mix company-specific (PNTH) events with macro/market events
- Do NOT include any text outside the JSON array`;

export class LLMEventSource {
    constructor() {
        this.apiKey = localStorage.getItem(LS_KEY_API) || '';
        this.model = localStorage.getItem(LS_KEY_MODEL) || DEFAULT_MODEL;
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem(LS_KEY_API, key);
    }

    setModel(model) {
        this.model = model;
        localStorage.setItem(LS_KEY_MODEL, model);
    }

    isConfigured() {
        return this.apiKey.length > 0;
    }

    async generateBatch(sim, eventLog, pendingFollowups) {
        if (!this.isConfigured()) throw new Error('API key not configured');

        const vol = Math.sqrt(Math.max(sim.v, 0));
        const stateLines = [
            'Current simulation state (day ' + sim.day + '):',
            '- Stock price: $' + sim.S.toFixed(2),
            '- Volatility: ' + (vol * 100).toFixed(1) + '% (annualized)',
            '- Risk-free rate: ' + (sim.r * 100).toFixed(2) + '%',
            '- Parameters: mu=' + sim.mu.toFixed(3) + ', theta=' + sim.theta.toFixed(4) +
              ', kappa=' + sim.kappa.toFixed(2) + ', xi=' + sim.xi.toFixed(2) +
              ', rho=' + sim.rho.toFixed(2) + ', lambda=' + sim.lambda.toFixed(1) +
              ', muJ=' + sim.muJ.toFixed(3) + ', sigmaJ=' + sim.sigmaJ.toFixed(3) +
              ', a=' + sim.a.toFixed(2) + ', b=' + sim.b.toFixed(4) +
              ', sigmaR=' + sim.sigmaR.toFixed(4),
        ];

        const recentEvents = eventLog.length > 0
            ? eventLog.slice(-10).map(e => 'Day ' + e.day + ': [' + e.magnitude + '] ' + e.headline).join('\n')
            : '(none yet)';

        const pendingLines = pendingFollowups.length > 0
            ? pendingFollowups.map(f => '"' + f.id + '" scheduled for day ' + f.targetDay).join('\n')
            : '(none)';

        const userMsg = stateLines.join('\n') +
            '\n\nRecent events:\n' + recentEvents +
            '\n\nPending followup events:\n' + pendingLines +
            '\n\nGenerate 3-5 new events that continue this narrative.';

        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 1024,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userMsg }],
            }),
        });

        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error('API ' + resp.status + ': ' + body.slice(0, 200));
        }

        const data = await resp.json();
        const text = data.content && data.content[0] && data.content[0].text || '';

        // Parse JSON from response (may be wrapped in markdown code fences)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array in response');

        const events = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(events)) throw new Error('Response is not an array');

        // Validate and sanitize
        return events
            .filter(ev => ev && typeof ev.headline === 'string' && ev.params && typeof ev.params === 'object')
            .map(ev => ({
                headline: ev.headline,
                params: ev.params,
                magnitude: ['minor', 'moderate', 'major'].includes(ev.magnitude) ? ev.magnitude : 'moderate',
                followups: Array.isArray(ev.followups) ? ev.followups : undefined,
            }));
    }
}
```

- [ ] **Step 2: Verify module loads**

Add temporary import in main.js: `import { LLMEventSource } from './src/llm.js';`. Open browser, check console. Remove after verification.

- [ ] **Step 3: Commit**

```bash
git add src/llm.js
git commit -m "feat: add LLM event source with Anthropic API integration"
```

---

### Task 5: Add UI sections to index.html and styles.css

**Files:**
- Modify: `index.html` (Settings tab, after the Market Regime stat-group's closing `</div>`)
- Modify: `styles.css` (append new styles)

- [ ] **Step 1: Add LLM settings and event log sections to index.html**

Insert after the closing `</div>` of the first `stat-group` in the Settings tab (the one containing `#preset-select` and `#rate-display`), and before the `stat-group` containing the "Advanced Parameters" button. Add:

```html
<div id="llm-settings-section" class="hidden">
    <div class="group-label">LLM Settings</div>
    <div class="ctrl-row">
        <label class="stat-label" for="llm-provider">Provider</label>
        <select id="llm-provider" class="sim-select" disabled>
            <option value="anthropic">Anthropic</option>
        </select>
    </div>
    <div class="ctrl-row">
        <label class="stat-label" for="llm-api-key">API Key</label>
        <div class="key-input-wrap">
            <input type="password" id="llm-api-key" class="sim-input" placeholder="sk-ant-...">
            <button type="button" id="llm-key-toggle" class="tool-btn key-toggle" aria-label="Toggle key visibility">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </button>
        </div>
    </div>
    <div class="ctrl-row">
        <label class="stat-label" for="llm-model">Model</label>
        <select id="llm-model" class="sim-select">
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
            <option value="claude-sonnet-4-20250514">Sonnet 4</option>
        </select>
    </div>
</div>
<div id="event-log-section" class="hidden">
    <div class="group-label">Event Log</div>
    <div id="event-log" class="event-log"></div>
</div>
```

- [ ] **Step 2: Add styles for LLM settings and event log to styles.css**

Append to `styles.css`:

```css
/* -- Dynamic regime: LLM settings & event log -- */
#llm-settings-section,
#event-log-section {
    margin-top: 8px;
}
#llm-settings-section.hidden,
#event-log-section.hidden {
    display: none;
}

.key-input-wrap {
    display: flex;
    gap: 4px;
    align-items: center;
}
.key-input-wrap .sim-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
}
.key-toggle {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
}

.event-log {
    max-height: 120px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.event-log-entry {
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 3px 0;
    font-size: 0.72rem;
    line-height: 1.3;
    border-bottom: 1px solid var(--border);
}
.event-log-entry:last-child {
    border-bottom: none;
}
.event-log-day {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--text-muted);
    flex-shrink: 0;
    min-width: 32px;
}
.event-log-headline {
    color: var(--text);
}
.event-log-entry[data-magnitude="major"] .event-log-headline {
    font-weight: 600;
}
.event-log-empty {
    color: var(--text-muted);
    font-size: 0.72rem;
    font-style: italic;
    padding: 4px 0;
}

/* Major event toast accent (provisional -- requires showToast extension in Task 8) */
.toast-event-positive {
    border-left: 3px solid var(--up);
}
.toast-event-negative {
    border-left: 3px solid var(--down);
}
```

- [ ] **Step 3: Verify sections appear when toggling hidden class manually**

In browser dev tools, remove `hidden` class from `#llm-settings-section` and `#event-log-section`. Verify they render correctly within the Settings tab.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat: add LLM settings and event log UI sections"
```

---

### Task 6: Wire UI bindings in ui.js

**Files:**
- Modify: `src/ui.js:80-90` (cacheDOMElements -- add new elements)
- Modify: `src/ui.js:140-175` (bindEvents -- add new handlers)
- Add new export functions: `updateEventLog`, `updateDynamicSections`

- [ ] **Step 1: Add new DOM elements to cacheDOMElements**

In `cacheDOMElements()`, after the existing slider caching block (around line 90), add:

```js
$.llmSettingsSection = document.getElementById('llm-settings-section');
$.eventLogSection    = document.getElementById('event-log-section');
$.eventLog           = document.getElementById('event-log');
$.llmApiKey          = document.getElementById('llm-api-key');
$.llmKeyToggle       = document.getElementById('llm-key-toggle');
$.llmModel           = document.getElementById('llm-model');
$.llmProvider        = document.getElementById('llm-provider');
```

- [ ] **Step 2: Add new handler bindings in bindEvents**

Add these handlers to the `bindEvents` function, after the existing preset change listener. First, update the destructured handlers at the top of `bindEvents` to include the new names:

```js
const {
    onTogglePlay, onStep, onSpeedChange, onToggleTheme, onToggleSidebar,
    onPresetChange, onReset, onSliderChange, onTimeSlider,
    onBuyStock, onShortStock, onBuyBond, onShortBond,
    onChainCellClick, onFullChainOpen, onExpiryChange,
    onTradeSubmit, onLiquidate, onDismissMargin,
    onLLMKeyChange, onLLMModelChange,  // <-- add these two
} = handlers;
```

Then add the bindings after the preset change listener:

```js
// LLM key show/hide toggle
if ($.llmKeyToggle) {
    $.llmKeyToggle.addEventListener('click', () => {
        const isPassword = $.llmApiKey.type === 'password';
        $.llmApiKey.type = isPassword ? 'text' : 'password';
    });
}

// LLM API key persistence
if ($.llmApiKey) {
    $.llmApiKey.value = localStorage.getItem('shoals_llm_key') || '';
    $.llmApiKey.addEventListener('change', () => {
        if (onLLMKeyChange) onLLMKeyChange($.llmApiKey.value);
    });
}

// LLM model persistence
if ($.llmModel) {
    $.llmModel.value = localStorage.getItem('shoals_llm_model') || 'claude-haiku-4-5-20251001';
    $.llmModel.addEventListener('change', () => {
        if (onLLMModelChange) onLLMModelChange($.llmModel.value);
    });
}
```

- [ ] **Step 3: Add updateDynamicSections and updateEventLog exports**

Add at the end of ui.js:

```js
export function updateDynamicSections($, presetIndex) {
    const isLLM = presetIndex >= 6;
    const isOffline = presetIndex === 5;
    const isDynamic = isLLM || isOffline;

    if ($.llmSettingsSection) {
        $.llmSettingsSection.classList.toggle('hidden', !isLLM);
    }
    if ($.eventLogSection) {
        $.eventLogSection.classList.toggle('hidden', !isDynamic);
    }
}

export function updateEventLog($, eventLog) {
    if (!$.eventLog) return;
    if (!eventLog || eventLog.length === 0) {
        $.eventLog.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'event-log-empty';
        empty.textContent = 'No events yet.';
        $.eventLog.appendChild(empty);
        return;
    }
    // Show last 5, newest first
    $.eventLog.textContent = '';
    const recent = eventLog.slice(-5).reverse();
    for (const e of recent) {
        const row = document.createElement('div');
        row.className = 'event-log-entry';
        row.dataset.magnitude = e.magnitude;

        const daySpan = document.createElement('span');
        daySpan.className = 'event-log-day';
        daySpan.textContent = 'D' + e.day;

        const headlineSpan = document.createElement('span');
        headlineSpan.className = 'event-log-headline';
        headlineSpan.textContent = e.headline;

        row.appendChild(daySpan);
        row.appendChild(headlineSpan);
        $.eventLog.appendChild(row);
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui.js
git commit -m "feat: wire LLM settings UI and event log display"
```

---

### Task 7: Wire EventEngine into main.js

**Files:**
- Modify: `main.js` (imports, state, loadPreset, resetSim, _onDayComplete, shortcuts, handlers)

This is the integration task. All the pieces come together here.

- [ ] **Step 1: Add imports**

At the top of `main.js`, add:

```js
import { EventEngine } from './src/events.js';
import { LLMEventSource } from './src/llm.js';
```

Also add `updateDynamicSections` and `updateEventLog` to the ui.js import list.

- [ ] **Step 2: Add event engine state**

After the existing state variables (around line 50), add:

```js
let eventEngine = null;  // EventEngine instance (null when not in Dynamic mode)
let llmSource = null;     // LLMEventSource singleton
```

- [ ] **Step 3: Add helper to detect dynamic mode**

```js
function _isDynamicPreset(index) { return index >= 5; }
function _isLLMPreset(index) { return index >= 6; }
```

- [ ] **Step 4: Modify loadPreset to create/destroy EventEngine**

Replace the `loadPreset` function (lines 571-588) with:

```js
function loadPreset(index) {
    // Sync dropdown when called from keyboard shortcut (keys 6/7)
    $.presetSelect.selectedIndex = index;

    sim.reset(index);
    resetPortfolio();
    sim.prepopulate();
    dayInProgress = false;
    chart._lerp.day = -1;
    expiryMgr.init(sim.day);
    chain = buildChain(sim.S, sim.v, sim.r, sim.day, expiryMgr.update(sim.day));
    playing = false;
    lastSpot = sim.S;
    strategy.resetRange(sim.S, strategyLegs);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateDynamicSections($, index);

    // Event engine lifecycle
    if (_isDynamicPreset(index)) {
        if (_isLLMPreset(index)) {
            if (!llmSource) llmSource = new LLMEventSource();
            eventEngine = new EventEngine('llm', llmSource);
            eventEngine.prefetch(sim);
        } else {
            eventEngine = new EventEngine('offline');
        }
    } else {
        eventEngine = null;
    }
    updateEventLog($, eventEngine ? eventEngine.eventLog : []);

    updateUI();
    _repositionCamera();
    dirty = true;
    _haptics.trigger('medium');
}
```

- [ ] **Step 5: Modify resetSim similarly**

Replace `resetSim` (lines 590-607) with:

```js
function resetSim() {
    const index = $.presetSelect.selectedIndex;
    sim.reset(index);
    resetPortfolio();
    sim.prepopulate();
    dayInProgress = false;
    chart._lerp.day = -1;
    expiryMgr.init(sim.day);
    chain = buildChain(sim.S, sim.v, sim.r, sim.day, expiryMgr.update(sim.day));
    playing = false;
    lastSpot = sim.S;
    strategy.resetRange(sim.S, strategyLegs);
    syncSettingsUI($, _simSettingsObj());
    updatePlayBtn($, playing);
    updateDynamicSections($, index);

    // Reset event engine if in dynamic mode
    if (eventEngine) eventEngine.reset();
    if (_isLLMPreset(index) && eventEngine) eventEngine.prefetch(sim);
    updateEventLog($, eventEngine ? eventEngine.eventLog : []);

    updateUI();
    _repositionCamera();
    dirty = true;
    _haptics.trigger('heavy');
}
```

- [ ] **Step 6: Wire event engine into _onDayComplete**

In `_onDayComplete()` (line 395), add event firing after `processExpiry` (line 399) and before `chain = buildChain(...)` (line 401):

```js
// Fire dynamic events
if (eventEngine) {
    const event = eventEngine.maybeFire(sim, sim.day);
    if (event) {
        // Sync sliders to reflect new params
        syncSettingsUI($, _simSettingsObj());
        updateEventLog($, eventEngine.eventLog);

        // Toast with magnitude-based duration
        if (typeof showToast !== 'undefined') {
            const duration = event.magnitude === 'major' ? 8000
                : event.magnitude === 'moderate' ? 5000 : 3000;
            showToast(event.headline, duration);
        }
    }
}
```

Note: Check `showToast` signature in `shared-utils.js`. If it only accepts `(msg)` without duration, use `showToast(event.headline)` and handle duration/styling in Task 8.

- [ ] **Step 7: Add keyboard shortcuts for presets 6 and 7**

In the `initShortcuts` array (lines 146-151), add after the `key: '5'` entry:

```js
{ key: '6', label: PRESETS[5].name, group: 'Presets', action: () => loadPreset(5) },
{ key: '7', label: PRESETS[6].name, group: 'Presets', action: () => loadPreset(6) },
```

- [ ] **Step 8: Add LLM settings handlers to bindEvents call**

In the `bindEvents($, { ... })` call (lines 155-178), add to the handler object:

```js
onLLMKeyChange:   (key) => { if (llmSource) llmSource.setApiKey(key); },
onLLMModelChange: (model) => { if (llmSource) llmSource.setModel(model); },
```

- [ ] **Step 9: Verify full integration**

Open in browser:
1. Select "Dynamic (Offline)" -- events should fire roughly every ~20 days, toasts appear, sliders update, event log populates
2. Select "Dynamic (LLM)" -- LLM settings should appear. Without API key, should gracefully fall back to offline events
3. Switch to "Calm Bull" -- event engine should stop, sections should hide
4. Press `6` key -- should load Dynamic (Offline)
5. Press `r` -- should reset and clear event log

- [ ] **Step 10: Commit**

```bash
git add main.js
git commit -m "feat: wire EventEngine into main loop with full lifecycle management"
```

---

### Task 8: Check showToast signature and adapt if needed

**Files:**
- Possibly modify: `main.js` (toast call in _onDayComplete)

- [ ] **Step 1: Read shared-utils.js showToast function**

Read the `showToast` function in the root site's `shared-utils.js` (served from `a9lim.github.io/shared-utils.js`). Check if it accepts a duration parameter and/or a CSS class parameter.

If `showToast(msg)` only accepts one param, the duration/class styling won't work and we need an alternative approach. Options:
- Extend `showToast` in shared-utils.js (affects all projects -- coordinate with user)
- Create a local wrapper `_eventToast(headline, magnitude)` in main.js that creates/removes toast DOM elements directly
- Just use `showToast(headline)` with default duration

Adapt the toast call in `_onDayComplete` based on findings.

- [ ] **Step 2: Commit if changes were made**

```bash
git add main.js
git commit -m "fix: adapt event toast to showToast signature"
```

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update file map**

Add entries for `src/events.js` and `src/llm.js`:

```
src/
  events.js          ~500 lines  EventEngine: Poisson scheduler, MTTH chains, offline pool
                                  (~55 events), PARAM_RANGES. Shared by offline and LLM modes.
  llm.js             ~120 lines  LLMEventSource: Anthropic API batch fetcher, prompt
                                  construction, JSON parsing, fallback handling.
```

- [ ] **Step 2: Update module dependencies**

Add to the dependency tree:

```
  |- src/events.js      (EventEngine, OFFLINE_EVENTS, PARAM_RANGES -- no imports)
  |- src/llm.js         (LLMEventSource -- imports events.js)
```

- [ ] **Step 3: Add Dynamic Regime section**

Add a new section documenting the event system, MTTH chains, LLM integration, and the PNTH company lore.

- [ ] **Step 4: Update keyboard shortcuts table**

Add `6` and `7` entries.

- [ ] **Step 5: Update Gotchas section**

Add:
- `eventEngine` is null in non-Dynamic presets -- always check before calling methods
- Event deltas are additive and clamped to `PARAM_RANGES` -- never set absolute values
- LLM followup events from the API don't get added to the `_eventById` lookup (only offline events do)
- `_pendingFollowups` cleared on reset -- switching presets mid-chain drops scheduled followups

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with dynamic event system documentation"
```

---

### Task 10: Final integration testing and polish

- [ ] **Step 1: Full manual test of offline mode**

1. Select "Dynamic (Offline)", press Play
2. Let sim run for ~100 days at 16x speed
3. Verify: events fire at reasonable frequency, toasts appear, sliders visibly update, event log shows entries, parameters stay within valid ranges
4. Verify: followup chain events fire (watch for sequential related headlines)
5. Reset -- verify event log clears
6. Switch to Calm Bull -- verify event log section hides, no more events fire

- [ ] **Step 2: Full manual test of LLM mode**

1. Select "Dynamic (LLM)"
2. Verify LLM settings section appears
3. Enter a valid Anthropic API key
4. Press Play, let run for ~50 days
5. Verify: LLM-generated events appear in toasts and log
6. Verify: with invalid key, warning toast appears and offline fallback kicks in
7. Verify: model dropdown changes persist across page reload

- [ ] **Step 3: Test expanded slider ranges with static presets**

1. Load each of the 5 original presets
2. Manually drag sliders to their new extremes (e.g., mu to -0.50 and 0.50)
3. Run sim briefly at extreme values -- verify no NaN or Infinity in prices
4. Verify theta at 1.0 (vol 100%) produces extremely volatile but non-crashing sim
5. Verify b at -0.05 works (negative rates)

- [ ] **Step 4: Fix any issues found**

Address bugs, adjust event deltas if too extreme, tune Poisson rate if events are too frequent/rare.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Dynamic Market Regime complete -- offline events, LLM integration, expanded ranges"
```
