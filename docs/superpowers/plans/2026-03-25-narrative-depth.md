# Narrative Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interconnected narrative systems (convictions, regulations, scrutiny, superevents with audio, consequence webs, lobbying, and thought interjections) that make the Shoals world feel cohesive and reactive to player behavior.

**Architecture:** Six new leaf modules (`convictions.js`, `regulations.js`, `scrutiny.js`, `audio.js`, `lobbying.js`, `compound-triggers.js`) plus presentation upgrades to `ui.js`/`styles.css`/`index.html`. Each module exports a singleton state object + reset function, following the pattern of `compliance.js`. `regulations.js` has a shallow dependency on `world-state.js` for `congressHelpers()` -- this is accepted because `world-state.js` is itself a pure leaf module, and passing congress as a parameter would leak that concern into every caller. Main.js orchestrates by calling into these modules at end-of-day and on popup choice callbacks. Consequence webs live in `compound-triggers.js` as a flat array of `{ condition, fire }` entries evaluated after event application. Event chain time-windowing is achieved by adding `minDay`/`maxDay` fields to existing event-pool entries alongside (not replacing) the current `era` system.

**Tech Stack:** Vanilla ES6 modules, Web Audio API for audio, no dependencies.

**Subsystem dependency order:**
1. **Audio** (standalone)
2. **Convictions** (reads playerChoices, impactHistory, quarterlyReviews, compliance)
3. **Regulations** (reads world state / congress)
4. **Scrutiny** (reads playerChoices, impactHistory; generates popup events)
5. **Compound triggers** (reads world state, regulations, convictions, scrutiny; fires events)
6. **Superevents** (presentation upgrade to popup system + audio integration)
7. **Lobbying** (reads regulations, world state; modifies world state)
8. **Thought interjections** (reads all state; purely atmospheric)
9. **Event chain time windows** (data-only changes to event-pool.js)
10. **Epilogue updates** (reads convictions, scrutiny, regulations)

**Note on innerHTML usage:** This project uses innerHTML extensively for rendering dynamic content (epilogue pages, chain tables, portfolio display, lobby actions). All user-facing string content originates from hardcoded module constants (event headlines, conviction names, regulation descriptions) -- never from user input, localStorage, or external APIs. The existing `escapeHtml()` utility from `shared-utils.js` is applied to any string that could theoretically contain special characters. This is consistent with the codebase's existing patterns in `ui.js`, `chain-renderer.js`, `portfolio-renderer.js`, and `epilogue.js`.

---

## Task 1: Audio System (`src/audio.js`)

**Files:**
- Create: `src/audio.js`
- Modify: `main.js` (import + init + hooks)
- Modify: `index.html` (volume control in Settings tab)
- Modify: `styles.css` (volume slider styling)

The audio module manages three layers: **ambient** (looping background drone), **stingers** (short event-triggered sounds), and **music** (longer tracks for superevents). All audio is synthesized via Web Audio API oscillators + filters to avoid loading audio files (zero dependencies, instant availability).

### Architecture

```
audio.js exports:
  initAudio()              -- create AudioContext on first user gesture
  setAmbientMood(mood)     -- crossfade ambient to 'calm'|'tense'|'crisis'
  playStinger(type)        -- one-shot: 'positive'|'negative'|'alert'|'superevent'
  playMusic(track)         -- fade in named music cue
  stopMusic(fadeMs)        -- fade out current music
  setVolume(0-1)           -- master volume
  getVolume()              -- current master volume
  resetAudio()             -- stop all, reset to calm ambient
  _ctx                     -- AudioContext (null until init)
```

Ambient moods are synthesized drones: filtered noise + sine oscillators at different pitches/filters per mood. Stingers are short oscillator sweeps with envelopes. Music cues for superevents use chord progressions on oscillators with reverb (convolver or delay-based). All synthesis is deterministic from mood/type parameters.

- [ ] **Step 1: Create `src/audio.js` with AudioContext management and ambient drone synthesis**

```javascript
/* ===================================================
   audio.js -- Synthesized audio system for Shoals.
   Three layers: ambient drone, event stingers, and
   superevent music. All synthesis via Web Audio API.
   No external audio files required.

   Leaf module. No DOM access.
   =================================================== */

let _ctx = null;       // AudioContext (lazy init)
let _master = null;    // GainNode (master volume)
let _ambientGain = null;
let _stingerGain = null;
let _musicGain = null;
let _volume = 0.3;     // default master volume
let _currentMood = null;
let _ambientNodes = []; // active ambient oscillators/sources
let _musicNodes = [];   // active music oscillators/sources
let _musicFadeTimer = null;

// -- Mood definitions: oscillator configs for ambient drones ----------------
// Each mood is an array of { type, freq, gain, filterFreq, filterQ }
const AMBIENT_MOODS = {
    calm: [
        { type: 'sine',     freq: 55,   gain: 0.08, filterFreq: 200,  filterQ: 1 },
        { type: 'sine',     freq: 82.5, gain: 0.05, filterFreq: 300,  filterQ: 1 },
        { type: 'triangle', freq: 110,  gain: 0.03, filterFreq: 400,  filterQ: 0.5 },
    ],
    tense: [
        { type: 'sawtooth', freq: 49,   gain: 0.06, filterFreq: 180,  filterQ: 2 },
        { type: 'sine',     freq: 73.5, gain: 0.07, filterFreq: 250,  filterQ: 1.5 },
        { type: 'square',   freq: 98,   gain: 0.02, filterFreq: 150,  filterQ: 3 },
    ],
    crisis: [
        { type: 'sawtooth', freq: 41,   gain: 0.08, filterFreq: 120,  filterQ: 4 },
        { type: 'square',   freq: 61.5, gain: 0.06, filterFreq: 100,  filterQ: 3 },
        { type: 'sawtooth', freq: 82,   gain: 0.04, filterFreq: 200,  filterQ: 2 },
        { type: 'sine',     freq: 123,  gain: 0.03, filterFreq: 300,  filterQ: 1 },
    ],
};

// -- Stinger definitions: { freqStart, freqEnd, duration, type, gain } ------
const STINGER_DEFS = {
    positive: { freqStart: 440, freqEnd: 880,  duration: 0.4, type: 'sine',     gain: 0.15 },
    negative: { freqStart: 440, freqEnd: 220,  duration: 0.5, type: 'triangle', gain: 0.15 },
    alert:    { freqStart: 660, freqEnd: 660,  duration: 0.3, type: 'square',   gain: 0.10, pulses: 2 },
    superevent: { freqStart: 220, freqEnd: 55, duration: 1.5, type: 'sawtooth', gain: 0.12 },
};

function _ensureCtx() {
    if (_ctx) return _ctx.state !== 'suspended'; // don't use a suspended context (needs user gesture)
    try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
        _master = _ctx.createGain();
        _master.gain.value = _volume;
        _master.connect(_ctx.destination);

        _ambientGain = _ctx.createGain();
        _ambientGain.gain.value = 1;
        _ambientGain.connect(_master);

        _stingerGain = _ctx.createGain();
        _stingerGain.gain.value = 1;
        _stingerGain.connect(_master);

        _musicGain = _ctx.createGain();
        _musicGain.gain.value = 1;
        _musicGain.connect(_master);
        return true;
    } catch { return false; }
}

/** Must be called from a user gesture (click/keydown) to unlock AudioContext. */
export function initAudio() {
    // Respect prefers-reduced-motion: default volume to 0 (user can still raise it)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && !localStorage.getItem('shoals_audio_volume')) {
        _volume = 0;
    }
    if (!_ensureCtx()) return;
    if (_ctx.state === 'suspended') _ctx.resume();
}

function _stopAmbient(fadeMs = 1000) {
    const now = _ctx.currentTime;
    for (const node of _ambientNodes) {
        if (node.gain) {
            node.gain.gain.setValueAtTime(node.gain.gain.value, now);
            node.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        }
        setTimeout(() => {
            try { node.osc.stop(); } catch {}
            try { node.osc.disconnect(); } catch {}
            try { node.gain.disconnect(); } catch {}
            try { node.filter.disconnect(); } catch {}
        }, fadeMs + 100);
    }
    _ambientNodes = [];
}

/**
 * Crossfade ambient to a new mood.
 * @param {'calm'|'tense'|'crisis'} mood
 */
export function setAmbientMood(mood) {
    if (!_ensureCtx() || mood === _currentMood) return;
    const def = AMBIENT_MOODS[mood];
    if (!def) return;

    // Fade out current
    if (_ambientNodes.length > 0) _stopAmbient(1500);

    _currentMood = mood;
    const now = _ctx.currentTime;

    for (const cfg of def) {
        const osc = _ctx.createOscillator();
        osc.type = cfg.type;
        osc.frequency.value = cfg.freq;

        const filter = _ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cfg.filterFreq;
        filter.Q.value = cfg.filterQ;

        const gain = _ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(cfg.gain, now + 1.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(_ambientGain);
        osc.start(now);

        _ambientNodes.push({ osc, filter, gain });
    }
}

/**
 * Play a one-shot stinger sound effect.
 * @param {'positive'|'negative'|'alert'|'superevent'} type
 */
export function playStinger(type) {
    if (!_ensureCtx()) return;
    const def = STINGER_DEFS[type];
    if (!def) return;

    const now = _ctx.currentTime;
    const count = def.pulses || 1;

    for (let i = 0; i < count; i++) {
        const offset = i * (def.duration / count + 0.05);
        const osc = _ctx.createOscillator();
        osc.type = def.type;
        osc.frequency.setValueAtTime(def.freqStart, now + offset);
        osc.frequency.linearRampToValueAtTime(def.freqEnd, now + offset + def.duration / count);

        const gain = _ctx.createGain();
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(def.gain, now + offset + 0.02);
        gain.gain.setValueAtTime(def.gain, now + offset + def.duration / count * 0.6);
        gain.gain.linearRampToValueAtTime(0, now + offset + def.duration / count);

        osc.connect(gain);
        gain.connect(_stingerGain);
        osc.start(now + offset);
        osc.stop(now + offset + def.duration / count + 0.1);
    }
}

/**
 * Play a sustained music cue (for superevents).
 * @param {'tension'|'triumph'|'collapse'|'revelation'} track
 */
export function playMusic(track) {
    if (!_ensureCtx()) return;
    stopMusic(500);

    const now = _ctx.currentTime;
    // Simple chord-based music cues
    const CHORDS = {
        tension:     [{ notes: [110, 130.8, 164.8], type: 'sawtooth', dur: 6 }],
        triumph:     [{ notes: [130.8, 164.8, 196],  type: 'sine',     dur: 5 }],
        collapse:    [{ notes: [98, 116.5, 138.6],   type: 'triangle', dur: 7 }],
        revelation:  [{ notes: [146.8, 185, 220],    type: 'sine',     dur: 5 }],
    };
    const chords = CHORDS[track];
    if (!chords) return;

    for (const chord of chords) {
        for (const freq of chord.notes) {
            const osc = _ctx.createOscillator();
            osc.type = chord.type;
            osc.frequency.value = freq;

            const filter = _ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            filter.Q.value = 1;

            const gain = _ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.06, now + 1.0);
            gain.gain.setValueAtTime(0.06, now + chord.dur - 1.5);
            gain.gain.linearRampToValueAtTime(0, now + chord.dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(_musicGain);
            osc.start(now);
            osc.stop(now + chord.dur + 0.2);

            _musicNodes.push({ osc, filter, gain });
        }
    }
}

/** Fade out any playing music. */
export function stopMusic(fadeMs = 1000) {
    if (!_ctx || _musicNodes.length === 0) return;
    clearTimeout(_musicFadeTimer);
    const now = _ctx.currentTime;
    for (const node of _musicNodes) {
        node.gain.gain.setValueAtTime(node.gain.gain.value, now);
        node.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    }
    const nodes = _musicNodes.slice();
    _musicFadeTimer = setTimeout(() => {
        for (const node of nodes) {
            try { node.osc.stop(); } catch {}
            try { node.osc.disconnect(); } catch {}
        }
    }, fadeMs + 200);
    _musicNodes = [];
}

/** Set master volume (0-1). Persisted in localStorage. */
export function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    if (_master) _master.gain.value = _volume;
    try { localStorage.setItem('shoals_audio_volume', String(_volume)); } catch {}
}

export function getVolume() { return _volume; }

export function resetAudio() {
    stopMusic(200);
    _stopAmbient(200);
    _currentMood = null;
}

// Restore saved volume
try {
    const saved = localStorage.getItem('shoals_audio_volume');
    if (saved != null) _volume = Math.max(0, Math.min(1, parseFloat(saved)));
} catch {}
```

- [ ] **Step 2: Add volume control to Settings tab in `index.html`**

In `index.html`, inside `#tab-settings` (the Info/Settings tab panel), add a volume slider after the existing preset selector section. Find the settings tab panel content and add:

```html
<div class="ctrl-row">
    <label class="ctrl-label" for="volume-slider">Volume</label>
    <input type="range" id="volume-slider" min="0" max="100" value="30" class="sim-slider">
</div>
```

- [ ] **Step 3: Wire audio into `main.js`**

Add imports at the top of `main.js`:

```javascript
import { initAudio, setAmbientMood, playStinger, stopMusic, setVolume, getVolume, resetAudio } from './src/audio.js';
```

In `cacheDOMElements` additions (or after `cacheDOMElements($)` call), add:

```javascript
$.volumeSlider = document.getElementById('volume-slider');
```

In the `init()` function, after `bindEvents(...)`, add:

```javascript
// Audio: init on first user gesture via intro start button
$.volumeSlider.value = Math.round(getVolume() * 100);
$.volumeSlider.addEventListener('input', () => setVolume($.volumeSlider.value / 100));
```

In the intro start button handler (where `_intro.dismiss` is called), add:

```javascript
initAudio();
setAmbientMood('calm');
```

In `_onDayComplete()`, after event firing, add ambient mood logic:

```javascript
// Update ambient mood based on market regime
const vol = Math.sqrt(sim.v);
if (vol > 0.35 || sim.lambda > 5) setAmbientMood('crisis');
else if (vol > 0.20 || sim.lambda > 2) setAmbientMood('tense');
else setAmbientMood('calm');
```

In `_resetCore()`, add:

```javascript
resetAudio();
```

- [ ] **Step 4: Add stinger calls to event/popup handlers**

In `_onDayComplete()`, where toast events are shown, add stinger calls based on event magnitude/params:

```javascript
// After showing event toast
if (logEntry.params) {
    const mu = logEntry.params.mu || 0;
    if (mu > 0.02) playStinger('positive');
    else if (mu < -0.02) playStinger('negative');
    else playStinger('alert');
}
```

In `_processPopupQueue()`, when showing a popup, add:

```javascript
playStinger('alert');
```

- [ ] **Step 5: Style the volume slider**

In `styles.css`, add (the slider inherits shared-base.css slider styling, but ensure it fits):

```css
#volume-slider { margin-top: 4px; }
```

---

## Task 2: Convictions System (`src/convictions.js`)

**Files:**
- Create: `src/convictions.js`
- Modify: `main.js` (import, evaluate at end-of-day, pass to epilogue, add to `_resetCore`)
- Modify: `index.html` (conviction display in Portfolio tab)
- Modify: `styles.css` (conviction styling)
- Modify: `src/epilogue.js` (consume convictions in reputation/narrative)

Convictions are persistent gameplay modifiers unlocked by player behavior. They do NOT change market parameters (no mu/theta/vol shifts). Instead they change **gameplay mechanics**: information visibility, compliance scaling, popup frequency, event coupling.

### Conviction definitions

Each conviction has:
- `id`: string identifier
- `name`: display name (short, evocative)
- `description`: one-sentence tooltip
- `condition(ctx)`: returns true when unlock criteria met. `ctx` = `{ playerChoices, impactHistory, quarterlyReviews, compliance, portfolio, daysSinceLiveTrade }`
- `effects`: object of gameplay modifiers (read by other systems):
  - `eventHintArrows`: boolean -- show mu direction arrows on event toasts
  - `complianceCooldownMult`: number -- multiplier on compliance cooldown (stacks with existing)
  - `complianceThresholdMult`: number -- multiplier on compliance threshold (stacks)
  - `popupFrequencyMult`: number -- multiplier on portfolio popup cooldowns
  - `couplingCapMult`: number -- multiplier on EVENT_COUPLING_CAP
  - `layerThresholdMult`: number -- multiplier on Layer 3 ADV thresholds
  - `boredomImmune`: boolean -- boredom boost never fires
  - `tipAccuracy`: number -- override TIP_REAL_PROBABILITY
  - `scrutinyMult`: number -- multiplier on scrutiny gain rate (see Task 4)

- [ ] **Step 1: Create `src/convictions.js`**

```javascript
/* ===================================================
   convictions.js -- Player conviction system. Persistent
   gameplay modifiers unlocked by accumulated choices
   and trading behavior. Does NOT change market params.

   Leaf module. No DOM access.
   =================================================== */

// -- Active convictions state ------------------------------------------------
const _active = new Set(); // set of conviction IDs

// -- Conviction definitions --------------------------------------------------
const CONVICTIONS = [
    // Note: all playerFlag keys used here must exist in popup-events.js.
    // Verified flags from existing popup events:
    //   cooperated_with_compliance, argued_with_compliance, ignored_compliance,
    //   declined_insider_tip, pursued_insider_tip, pursued_pnth_tip,
    //   declined_analyst_color, pursued_analyst_tip, passed_channel_check,
    //   did_ft_interview, declined_ft_interview, attended_fundraiser,
    //   declined_fundraiser, reported_lobbyist, donated_during_recession,
    //   cooperated_unusual_activity, lawyered_up_unusual,
    //   took_headhunter_meeting, disclosed_headhunter, ignored_headhunter,
    //   first_milestone_hungry, first_milestone_celebrated,
    //   pushed_back_risk_desk, defied_unlimited_risk
    {
        id: 'information_edge',
        name: 'Information Is Everything',
        description: 'Event toasts show parameter direction hints. Compliance watches more closely.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.pursued_insider_tip) score++;
            if (f.pursued_pnth_tip) score++;
            if (f.pursued_analyst_tip) score++;
            return score >= 2;
        },
        effects: {
            eventHintArrows: true,
            complianceCooldownMult: 0.8,
        },
    },
    {
        id: 'market_always_right',
        name: 'The Market Is Always Right',
        description: 'Compliance treats you well. Event coupling is dampened.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.cooperated_with_compliance) score++;
            if (f.cooperated_unusual_activity) score++;
            if (f.declined_insider_tip) score++;
            if (f.donated_during_recession) score++;
            if (f.passed_channel_check) score++;
            return score >= 3;
        },
        effects: {
            complianceThresholdMult: 1.3,
            couplingCapMult: 0.5,
        },
    },
    {
        id: 'contrarian_instinct',
        name: 'Contrarian Instinct',
        description: 'You thrive in chaos. Layer 3 thresholds raised. Boredom boost disabled.',
        condition: (ctx) => {
            // Profited during 3+ major events: check impactHistory entries during high-vol periods
            return ctx.impactHistory.length >= 8;
        },
        effects: {
            boredomImmune: true,
            layerThresholdMult: 1.25,
        },
    },
    {
        id: 'desk_protects',
        name: 'The Desk Protects Its Own',
        description: 'Compliance popup frequency reduced. Insider tip events stop firing.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            return f.donated_during_recession && f.cooperated_with_compliance &&
                   ctx.compliance.credibility >= 3;
        },
        effects: {
            popupFrequencyMult: 1.5,  // longer cooldowns between popups
            tipAccuracy: 0,           // tips stop firing (no insider tip popups)
        },
    },
    {
        id: 'master_of_leverage',
        name: 'Master of Leverage',
        description: 'Event coupling amplified. Scrutiny builds faster.',
        condition: (ctx) => {
            // Survived 3+ quarterly reviews with strong rating while having high impact
            const strong = ctx.quarterlyReviews.filter(r => r.rating === 'strong');
            return strong.length >= 3 && ctx.impactHistory.length >= 5;
        },
        effects: {
            couplingCapMult: 1.5,
            scrutinyMult: 1.3,
        },
    },
    {
        id: 'political_operator',
        name: 'Political Operator',
        description: 'Lobbying costs reduced. Regulatory events reference you by name.',
        condition: (ctx) => {
            const f = ctx.playerChoices;
            let score = 0;
            if (f.attended_fundraiser) score++;
            if (f.attended_political_dinner) score++;
            if (f.sent_check_no_dinner) score++;
            if (f.did_ft_interview) score++;
            if (f.accepted_panel_media) score++;
            return score >= 3;
        },
        effects: {
            lobbyingCostMult: 0.7,
        },
    },
    {
        id: 'ghost_protocol',
        name: 'Ghost Protocol',
        description: 'Scrutiny gain halved. Compliance rarely triggers. You are invisible.',
        condition: (ctx) => {
            const flags = Object.keys(ctx.playerChoices);
            // Ghost: very few choices AND low impact footprint
            return flags.length <= 3 && ctx.impactHistory.length <= 2 &&
                   ctx.daysSinceLiveTrade > 200;
        },
        effects: {
            scrutinyMult: 0.5,
            popupFrequencyMult: 2.0,
        },
    },
    {
        id: 'volatility_addict',
        name: 'Volatility Addict',
        description: 'You see the vol surface more clearly. Straddle/strangle strategies highlighted.',
        condition: (ctx) => {
            // Held simultaneous long calls and long puts (straddle-like) for multiple quarters
            const optionTrades = ctx.impactHistory.filter(h => h.context && h.context.includes('option'));
            return optionTrades.length >= 6;
        },
        effects: {
            eventHintArrows: true,  // sees vol direction too
        },
    },
];

/**
 * Evaluate all conviction conditions against current game state.
 * Newly unlocked convictions are permanent (added to _active, never removed).
 * @returns {string[]} Array of newly unlocked conviction IDs (empty if none new)
 */
export function evaluateConvictions(ctx) {
    if (_active.size === CONVICTIONS.length) return []; // all unlocked, skip
    const newlyUnlocked = [];
    for (const conv of CONVICTIONS) {
        if (_active.has(conv.id)) continue;
        try {
            if (conv.condition(ctx)) {
                _active.add(conv.id);
                newlyUnlocked.push(conv.id);
            }
        } catch { /* condition evaluation failure -- skip */ }
    }
    return newlyUnlocked;
}

/** Get all active conviction objects. */
export function getActiveConvictions() {
    return CONVICTIONS.filter(c => _active.has(c.id));
}

/** Get a specific conviction definition by ID. */
export function getConviction(id) {
    return CONVICTIONS.find(c => c.id === id) || null;
}

/**
 * Read a specific effect value across all active convictions.
 * For boolean effects: returns true if ANY active conviction has it.
 * For numeric multipliers: returns defaultVal * product of all active values.
 *   e.g., defaultVal=1, two convictions with 0.8 and 1.5 => 1 * 0.8 * 1.5 = 1.2
 * @param {string} effectKey
 * @param {*} defaultVal -- default if no conviction provides it (also the base for multiplication)
 */
export function getConvictionEffect(effectKey, defaultVal) {
    let result = defaultVal;
    for (const conv of CONVICTIONS) {
        if (!_active.has(conv.id)) continue;
        const val = conv.effects[effectKey];
        if (val === undefined) continue;
        if (typeof val === 'boolean') {
            if (val) return true;  // any true wins
        } else if (typeof val === 'number') {
            result *= val;         // multiply onto defaultVal base
        }
    }
    return result;
}

/** Reset all convictions (on sim reset). */
export function resetConvictions() {
    _active.clear();
}

/** Get conviction IDs as array (for epilogue serialization). */
export function getConvictionIds() {
    return [..._active];
}

export { CONVICTIONS };
```

- [ ] **Step 2: Wire convictions into `main.js`**

Add imports:

```javascript
import {
    evaluateConvictions, getActiveConvictions, getConviction,
    getConvictionEffect, resetConvictions, getConvictionIds,
} from './src/convictions.js';
```

In `_onDayComplete()`, after quarterly review logic and before event firing, add:

```javascript
// Evaluate convictions (once per day, cheap)
const _convCtx = {
    playerChoices,
    impactHistory,
    quarterlyReviews,
    compliance,
    portfolio,
    daysSinceLiveTrade: sim.history.maxDay - HISTORY_CAPACITY,
};
const newConvictions = evaluateConvictions(_convCtx);
for (const id of newConvictions) {
    const conv = getConviction(id);
    if (conv) showToast(`Conviction unlocked: ${conv.name}`, 4000);
}
```

In `_resetCore()`, add:

```javascript
resetConvictions();
```

- [ ] **Step 3: Integrate conviction effects into existing systems**

In `_onDayComplete()`, where event toasts are displayed, check for `eventHintArrows`:

```javascript
// When building toast message for an event
if (getConvictionEffect('eventHintArrows', false) && logEntry.params) {
    const mu = logEntry.params.mu || 0;
    const hint = mu > 0 ? ' \u2191' : mu < 0 ? ' \u2193' : '';
    // Append hint arrow to toast headline
    headline += hint;
}
```

In `popup-events.js`, modify cooldown checking to read conviction effect. In the `evaluatePortfolioPopups` function, where `cooldownMultiplier()` is used, multiply by conviction effect:

```javascript
const convPopupMult = getConvictionEffect('popupFrequencyMult', 1);
// In cooldown check: multiply effective cooldown by convPopupMult
```

This requires importing `getConvictionEffect` in `popup-events.js`.

In `events.js`, in `_computeCoupling`, read conviction multiplier:

```javascript
// The coupling cap is EVENT_COUPLING_CAP * getConvictionEffect('couplingCapMult', 1)
```

This requires importing `getConvictionEffect` in `events.js`.

In `events.js`, in `_weightedPick`, check boredom immunity:

```javascript
// const boostNonMinor = this._consecutiveMinor >= BOREDOM_THRESHOLD;
// becomes:
const boredomImmune = getConvictionEffect('boredomImmune', false);
const boostNonMinor = !boredomImmune && this._consecutiveMinor >= BOREDOM_THRESHOLD;
```

- [ ] **Step 4: Add conviction display to Portfolio tab in `index.html`**

After the Greeks display section in the Portfolio tab, add:

```html
<div id="convictions-section" class="convictions-section hidden">
    <div class="group-label">Convictions</div>
    <div id="convictions-list" class="convictions-list"></div>
</div>
```

- [ ] **Step 5: Add conviction rendering in `ui.js` or `main.js`**

In `updateUI()` (or a new `_updateConvictionDisplay()` called from `updateUI`), add:

```javascript
function _updateConvictionDisplay() {
    const convictions = getActiveConvictions();
    const section = $.convictionsSection;
    const list = $.convictionsList;
    if (!section || !list) return;
    if (convictions.length === 0) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    // Build DOM nodes instead of innerHTML for safety
    list.textContent = '';
    for (const c of convictions) {
        const item = document.createElement('div');
        item.className = 'conviction-item';
        item.title = c.description;
        const name = document.createElement('span');
        name.className = 'conviction-name';
        name.textContent = c.name;
        item.appendChild(name);
        list.appendChild(item);
    }
}
```

Cache `$.convictionsSection = document.getElementById('convictions-section')` and `$.convictionsList = document.getElementById('convictions-list')`.

Call `_updateConvictionDisplay()` from `_onDayComplete()` only (not from `updateUI()`) since convictions change at most once per day, not per substep.

- [ ] **Step 6: Style convictions in `styles.css`**

```css
.convictions-section { margin-top: 12px; }
.convictions-list { display: flex; flex-direction: column; gap: 4px; }
.conviction-item {
    padding: 6px 10px;
    font-size: 0.78rem;
    border-left: 2px solid var(--accent);
    background: var(--bg-hover);
    border-radius: var(--radius-sm);
    cursor: help;
}
.conviction-name { font-weight: 600; color: var(--text); }
```

- [ ] **Step 7: Update epilogue to consume convictions**

In `src/epilogue.js`, add convictions to the `generateEpilogue` signature:

```javascript
export function generateEpilogue(world, sim, portfolio, eventLog, playerChoices = {}, impactHistory = [], quarterlyReviews = [], terminationReason = null, convictionIds = []) {
```

In `_pageLegacy`, after reputation reveal, add conviction summary. Build the conviction names paragraph using string concatenation from a hardcoded name lookup (all conviction names are internal constants, not user input):

```javascript
if (convictionIds.length > 0) {
    const names = {
        information_edge: 'Information Is Everything',
        market_always_right: 'The Market Is Always Right',
        contrarian_instinct: 'Contrarian Instinct',
        desk_protects: 'The Desk Protects Its Own',
        master_of_leverage: 'Master of Leverage',
        political_operator: 'Political Operator',
        ghost_protocol: 'Ghost Protocol',
        volatility_addict: 'Volatility Addict',
    };
    const convNames = convictionIds.map(id => names[id] || id).join(', ');
    body += _h3('Trading Philosophy');
    body += _p('Over four years, certain convictions crystallized into permanent fixtures of your trading mind: ' + convNames + '.');
}
```

In `main.js`, where `generateEpilogue` is called, pass conviction IDs:

```javascript
generateEpilogue(world, sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews, terminationReason, getConvictionIds())
```

---

## Task 3: Regulations System (`src/regulations.js`)

**Files:**
- Create: `src/regulations.js`
- Modify: `main.js` (import, evaluate at end-of-day, display)
- Modify: `src/portfolio.js` (read active regulations for margin/spread changes)
- Modify: `index.html` (regulation display in Settings tab)
- Modify: `styles.css` (regulation badge styling)

Regulations are **world-state-derived rules** that change trading mechanics. They activate/deactivate automatically based on congressional control, world events, and geopolitical state.

- [ ] **Step 1: Create `src/regulations.js`**

```javascript
/* ===================================================
   regulations.js -- Regulatory environment system.
   Congressional control and world events create
   persistent rule changes affecting trading mechanics.

   Leaf module. No DOM access.
   =================================================== */

import { congressHelpers } from './world-state.js';

const _active = new Map(); // id -> regulation object

const REGULATIONS = [
    {
        id: 'transaction_tax',
        name: 'Financial Transaction Tax',
        description: 'Farmer-Labor controls both chambers and passes transaction tax over presidential veto. All spreads widen 50%.',
        condition: (world, congress) => !congress.fedControlsHouse && !congress.fedControlsSenate,
        effects: { spreadMult: 1.5 },
    },
    {
        id: 'deregulation_act',
        name: 'Deregulation Act',
        description: 'Federalist trifecta loosens margin rules. Requirements drop 20%, but rogue threshold drops too.',
        condition: (world, congress) => congress.trifecta,
        effects: { marginMult: 0.8, rogueThresholdMult: 0.85 },
    },
    {
        id: 'short_sale_ban',
        name: 'Emergency Short Sale Ban',
        description: 'Short stock positions temporarily banned after recession declaration.',
        condition: (world) => world.geopolitical.recessionDeclared,
        effects: { shortStockDisabled: true },
    },
    {
        id: 'rate_ceiling',
        name: 'Federal Reserve Independence Act (Repealed)',
        description: 'Barron fires Hartley and imposes political rate guidance. Rate ceiling in effect.',
        condition: (world) => world.fed.hartleyFired && !world.fed.vaneAppointed,
        effects: { rateCeiling: 0.06 },
    },
    {
        id: 'qe_floor',
        name: 'Quantitative Easing',
        description: 'Fed QE program places a floor on asset prices. Rate floored near zero.',
        condition: (world) => world.fed.qeActive,
        effects: { rateFloor: 0.001 },
    },
    {
        id: 'sanctions_compliance',
        name: 'Sanctions Compliance Order',
        description: 'Active sanctions increase compliance overhead. Borrow costs rise.',
        condition: (world) => world.geopolitical.sanctionsActive,
        effects: { borrowSpreadAdd: 0.3 },
    },
    {
        id: 'antitrust_scrutiny',
        name: 'Antitrust Investigation',
        description: 'DOJ suit against Palanthropic increases market volatility and scrutiny.',
        condition: (world) => world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched,
        effects: { spreadMult: 1.2 },
    },
    {
        id: 'oil_emergency',
        name: 'Oil Crisis Emergency Measures',
        description: 'Oil crisis triggers emergency market measures. Margin requirements increase.',
        condition: (world) => world.geopolitical.oilCrisis,
        effects: { marginMult: 1.3 },
    },
    {
        id: 'trade_war_tariffs',
        name: 'Trade War Tariffs',
        description: 'Escalating tariffs widen spreads and increase borrowing costs.',
        condition: (world) => world.geopolitical.tradeWarStage >= 2,
        effects: { spreadMult: 1.15, borrowSpreadAdd: 0.15 },
    },
    {
        id: 'campaign_finance',
        name: 'Campaign Finance Scrutiny',
        description: 'During election season, large trades attract extra regulatory attention.',
        condition: (world) => world.election.primarySeason,
        effects: {},
    },
];

/**
 * Re-evaluate which regulations are active based on current world state.
 * @returns {{ activated: string[], deactivated: string[] }}
 */
export function evaluateRegulations(world) {
    const congress = congressHelpers(world);
    const activated = [];
    const deactivated = [];

    for (const reg of REGULATIONS) {
        const shouldBeActive = reg.condition(world, congress);
        const wasActive = _active.has(reg.id);

        if (shouldBeActive && !wasActive) {
            _active.set(reg.id, reg);
            activated.push(reg.id);
        } else if (!shouldBeActive && wasActive) {
            _active.delete(reg.id);
            deactivated.push(reg.id);
        }
    }
    return { activated, deactivated };
}

/** Get all currently active regulation objects. */
export function getActiveRegulations() {
    return [..._active.values()];
}

/**
 * Read a specific effect value across all active regulations.
 * Boolean: true if ANY active. Mult: product. Add: sum. Ceiling: min. Floor: max.
 */
export function getRegulationEffect(effectKey, defaultVal) {
    let result = defaultVal;
    let found = false;

    for (const [, reg] of _active) {
        const val = reg.effects[effectKey];
        if (val === undefined) continue;

        if (typeof val === 'boolean') {
            if (val) return true;
        } else if (typeof val === 'number') {
            if (effectKey.endsWith('Mult')) {
                result = found ? result * val : val;
            } else if (effectKey.endsWith('Add')) {
                result = found ? result + val : val;
            } else if (effectKey === 'rateCeiling') {
                result = found ? Math.min(result, val) : val;
            } else if (effectKey === 'rateFloor') {
                result = found ? Math.max(result, val) : val;
            } else {
                result = val;
            }
            found = true;
        }
    }
    return found ? result : defaultVal;
}

export function getRegulation(id) {
    return REGULATIONS.find(r => r.id === id) || null;
}

export function resetRegulations() {
    _active.clear();
}

export { REGULATIONS };
```

- [ ] **Step 2: Wire regulations into `main.js`**

Add imports:

```javascript
import {
    evaluateRegulations, getActiveRegulations, getRegulation,
    getRegulationEffect, resetRegulations,
} from './src/regulations.js';
```

In `_onDayComplete()`, after event application and world state mutations:

```javascript
if (eventEngine) {
    const regChanges = evaluateRegulations(eventEngine.world);
    for (const id of regChanges.activated) {
        const reg = getRegulation(id);
        if (reg) showToast('Regulation enacted: ' + reg.name, 4000);
    }
    for (const id of regChanges.deactivated) {
        const reg = getRegulation(id);
        if (reg) showToast('Regulation repealed: ' + reg.name, 3000);
    }
}
```

In `_resetCore()`: `resetRegulations();`

- [ ] **Step 3: Apply regulation effects to portfolio mechanics**

In `src/portfolio.js`, import and use:

```javascript
import { getRegulationEffect } from './regulations.js';
```

In `_fillPrice` spread computation: `spread *= getRegulationEffect('spreadMult', 1);`

In margin checks: `required *= getRegulationEffect('marginMult', 1);`

In `executeMarketOrder`, before executing short stock:

```javascript
if (side === 'short' && type === 'stock' && getRegulationEffect('shortStockDisabled', false)) {
    if (typeof showToast !== 'undefined') showToast('Short stock sales currently banned by regulation.', 3000);
    return null;
}
```

In `chargeBorrowInterest` (line 732), apply the `borrowSpreadAdd` regulation effect. The existing code computes:

```javascript
const annualRate = Math.max(currentRate, 0) + borrowSpread * currentVol;
```

Change to:

```javascript
const regBorrowAdd = getRegulationEffect('borrowSpreadAdd', 0);
const annualRate = Math.max(currentRate, 0) + (borrowSpread + regBorrowAdd) * currentVol;
```

This requires importing `getRegulationEffect` at the top of `portfolio.js` (same import added for spread/margin/short-ban effects).

- [ ] **Step 4: Apply rate ceiling/floor in simulation substep**

Rate clamping is an **intentional permanent mutation** of `sim.r`, not a display overlay. This simulates the Fed being politically constrained -- the Vasicek process still runs each step but the rate is hard-clamped. This means the rate path changes permanently while the regulation is active, and mean-reversion operates from the clamped value. This mirrors real-world rate pegs where central bank credibility loss causes the floor/ceiling to dominate.

Apply in **both** substep loops. In `main.js`:

In `frame()` (line ~648-656, the streaming substep loop), after `sim.substep()` and before `syncMarket(sim)`:

```javascript
// Rate regulation clamp (both loops must apply this)
const _rateCeil = getRegulationEffect('rateCeiling', null);
const _rateFlr = getRegulationEffect('rateFloor', null);
if (_rateCeil !== null && sim.r > _rateCeil) sim.r = _rateCeil;
if (_rateFlr !== null && sim.r < _rateFlr) sim.r = _rateFlr;
```

In `tick()` (line ~1125-1131, the instant full-day loop), after `sim.substep()` and before `syncMarket(sim)`:

```javascript
// Rate regulation clamp (same as frame() loop)
const _rateCeil = getRegulationEffect('rateCeiling', null);
const _rateFlr = getRegulationEffect('rateFloor', null);
if (_rateCeil !== null && sim.r > _rateCeil) sim.r = _rateCeil;
if (_rateFlr !== null && sim.r < _rateFlr) sim.r = _rateFlr;
```

Also apply in the `tick()` "finish remaining sub-steps" branch (line ~1113-1118), which runs when stepping through a partial day.

- [ ] **Step 5: Display active regulations in Settings tab**

In `index.html` `#tab-settings`:

```html
<div id="regulations-section" class="regulations-section">
    <div class="group-label">Active Regulations</div>
    <div id="regulations-list" class="regulations-list">
        <span class="text-muted" style="font-size:0.78rem">None</span>
    </div>
</div>
```

Rendering (DOM-based, no innerHTML with user content):

```javascript
function _updateRegulationDisplay() {
    const list = $.regulationsList;
    if (!list) return;
    const regs = getActiveRegulations();
    list.textContent = '';
    if (regs.length === 0) {
        const span = document.createElement('span');
        span.className = 'text-muted';
        span.style.fontSize = '0.78rem';
        span.textContent = 'None';
        list.appendChild(span);
        return;
    }
    for (const r of regs) {
        const badge = document.createElement('div');
        badge.className = 'regulation-badge';
        badge.title = r.description;
        badge.textContent = r.name;
        list.appendChild(badge);
    }
}
```

- [ ] **Step 6: Style regulation badges**

```css
.regulations-section { margin-top: 12px; }
.regulations-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.regulation-badge {
    font-size: 0.72rem; font-weight: 500;
    padding: 3px 8px; border-radius: var(--radius-pill);
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text-secondary); cursor: help;
}
```

---

## Task 4: Scrutiny System (`src/scrutiny.js`)

**Files:**
- Create: `src/scrutiny.js`
- Modify: `main.js` (import, hook into popup choice callbacks, end-of-day evaluation)
- Modify: `src/popup-events.js` (add scrutiny popup events)
- Modify: `src/epilogue.js` (scrutiny narrative on page 4)

Scrutiny is a hidden accumulator tracking SEC-level regulatory attention on the player specifically.

- [ ] **Step 1: Create `src/scrutiny.js`**

```javascript
/* ===================================================
   scrutiny.js -- SEC/regulatory scrutiny accumulator.
   Tracks player-specific investigation pressure from
   insider tips, crisis profits, and Layer 3 activity.
   Generates escalating popup events at thresholds.

   Leaf module. No DOM access.
   =================================================== */

import { getConvictionEffect } from './convictions.js';

const scrutiny = {
    score: 0,
    level: 0,
    sources: [],
    settled: false,
    cooperating: false,
};

const THRESHOLDS = [3, 6, 9, 12];

function _deriveLevel() {
    if (scrutiny.settled) return scrutiny.level;
    let level = 0;
    for (const t of THRESHOLDS) {
        if (scrutiny.score >= t) level++;
    }
    scrutiny.level = level;
    return level;
}

export function addScrutiny(amount, reason, day) {
    if (scrutiny.settled) return;
    const mult = getConvictionEffect('scrutinyMult', 1);
    const effective = amount * mult;
    scrutiny.score = Math.min(15, scrutiny.score + effective);
    scrutiny.sources.push({ day, amount: effective, reason });
    _deriveLevel();
}

export function getScrutinyLevel() { return _deriveLevel(); }

export function getScrutinyState() { return { ...scrutiny }; }

export function settleScrutiny() { scrutiny.settled = true; }

export function cooperateScrutiny() {
    scrutiny.cooperating = true;
    scrutiny.score = Math.max(0, scrutiny.score - 3);
    _deriveLevel();
}

export function resetScrutiny() {
    scrutiny.score = 0;
    scrutiny.level = 0;
    scrutiny.sources = [];
    scrutiny.settled = false;
    scrutiny.cooperating = false;
}

export { scrutiny };
```

- [ ] **Step 2: Wire scrutiny triggers into `main.js`**

Import `addScrutiny`, `getScrutinyLevel`, `getScrutinyState`, `settleScrutiny`, `cooperateScrutiny`, `resetScrutiny`.

In popup choice callback, add scrutiny for insider tip/compliance defiance choices (see detailed code in the brainstorm section -- add 2 points for insider tips, 1.5 for analyst hints, 0.5 for compliance defiance).

In `_onDayComplete()`, add 0.1 scrutiny for sustained Layer 3 activity (gross notional > 75% ADV).

In `_resetCore()`: `resetScrutiny();`

- [ ] **Step 3: Add scrutiny popup events to `popup-events.js`**

Add 4 escalating popup events: press inquiry (level 1), SEC letter (level 2), federal subpoena (level 3), enforcement action (level 4). Each with appropriate choices (cooperate/stonewall/lawyer up/settle/fight/inform). Import `getScrutinyLevel` in popup-events.js.

Settlement choice deducts `2000` from `portfolio.cash` (internal scale = displayed as "$2,000k" via `fmtDollar`; this is 20% of the $10,000 starting capital) and calls `settleScrutiny()`.
Cooperation choice calls `cooperateScrutiny()`.
Fighting adds 2 more scrutiny points.

In `_processPopupQueue` onChoice handler, the settlement effect:

```javascript
if (choice.playerFlag === 'settled_sec') {
    portfolio.cash -= 2000; // internal scale; displayed as "$2,000k"
    settleScrutiny();
}
```

- [ ] **Step 4: Add scrutiny to epilogue**

Update `generateEpilogue` to accept `scrutinyState` parameter. In `_pageLegacy`, add narrative text for scrutiny level >= 2 (settled, cooperating, unresolved, or cleared branches).

---

## Task 5: Compound Triggers / Consequence Webs (`src/compound-triggers.js`)

**Files:**
- Create: `src/compound-triggers.js`
- Modify: `main.js` (import, call after events at end-of-day)

- [ ] **Step 1: Create `src/compound-triggers.js`**

Contains ~12 cross-domain triggers, each with:
- `id`: unique string
- `condition(world, congress, playerChoices, scrutinyLevel, activeRegIds)`: returns boolean
- `event`: event object to fire (toast with params/effects)

Key triggers:
- Hartley fired + Federalist trifecta -> "Financial Freedom Act" (deregulation rush)
- PNTH military contract + Middle East escalation 2+ -> war profits surge
- Trade war stage 3+ recession -> stagflation
- Player cooperated with Okafor + Okafor running -> political connection
- Insider tip accepted + Tan investigation stage 2+ -> Tan has evidence
- Impeachment stage 2+ recession -> constitutional crisis
- All three PNTH investigations -> perfect storm
- Gottlieb rival + trade war + sanctions -> Covenant AI sanctions risk
- Oil crisis + Middle East 3 -> energy war
- Fed credibility <= 3 + Hartley fired -> dollar crisis
- High scrutiny + campaign season -> congressional oversight
- South America ops 2+ PNTH military -> leaked cables

Each fires at most once (tracked in `_fired` Set). `resetCompoundTriggers()` clears the Set. `getFiredTriggerIds()` returns the fired IDs for use in the epilogue narrative (e.g., "The stagflation crisis of Year 3...").

```javascript
/* ===================================================
   compound-triggers.js -- Cross-domain consequence web.
   Evaluates compound conditions across world state,
   regulations, convictions, and scrutiny to fire
   unique events that tie narrative threads together.

   Each trigger fires at most once per game.
   =================================================== */

const _fired = new Set();

const COMPOUND_TRIGGERS = [
    {
        id: 'hartley_fired_trifecta_deregulation',
        condition: (world, congress) =>
            world.fed.hartleyFired && congress.trifecta,
        event: {
            id: 'compound_deregulation_rush',
            category: 'political',
            headline: 'With Hartley gone and both chambers aligned, Barron signs sweeping Financial Freedom Act; margin rules relaxed across the board',
            magnitude: 'major',
            params: { theta: -0.02, lambda: 0.5 },
            effects: (world) => { world.election.barronApproval += 3; },
        },
    },
    {
        id: 'pnth_military_mideast',
        condition: (world) =>
            world.pnth.militaryContractActive && world.geopolitical.mideastEscalation >= 2,
        event: {
            id: 'compound_pnth_war_profits',
            category: 'pnth',
            headline: 'Palanthropic Atlas AI deployed in Middle East theater; defense revenue surges as Dirks faction consolidates control',
            magnitude: 'major',
            params: { mu: 0.04, theta: 0.01 },
            effects: (world) => {
                world.pnth.boardDirks = Math.min(12, world.pnth.boardDirks + 1);
                world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            },
        },
    },
    {
        id: 'trade_war_recession',
        condition: (world) =>
            world.geopolitical.tradeWarStage >= 3 && world.geopolitical.recessionDeclared,
        event: {
            id: 'compound_stagflation',
            category: 'macro',
            headline: 'Economists declare stagflation as tariff-driven inflation meets recessionary contraction; markets face worst of both worlds',
            magnitude: 'major',
            params: { mu: -0.08, theta: 0.04, lambda: 2.0, xi: 0.15 },
            effects: (world) => {
                world.election.barronApproval = Math.max(0, world.election.barronApproval - 10);
                world.fed.credibilityScore = Math.max(0, world.fed.credibilityScore - 2);
            },
        },
    },
    {
        id: 'player_cooperated_okafor_wins',
        condition: (world, congress, playerChoices) =>
            playerChoices.attended_political_dinner && world.election.okaforRunning,
        event: {
            id: 'compound_okafor_connection',
            category: 'political',
            headline: 'Sen. Okafor\'s campaign acknowledges "productive conversations with key financial sector voices"; your name appears in donor filings',
            magnitude: 'moderate',
            params: { mu: 0.01 },
        },
    },
    {
        id: 'insider_tip_tan_investigation',
        condition: (world, congress, playerChoices) =>
            (playerChoices.pursued_insider_tip || playerChoices.pursued_pnth_tip) &&
            world.investigations.tanBowmanStory >= 2,
        event: {
            id: 'compound_tan_has_evidence',
            category: 'investigation',
            headline: 'Rachel Tan publishes investigative piece linking Meridian trading patterns to material nonpublic information; compliance department launches internal review',
            magnitude: 'major',
            params: { theta: 0.015 },
        },
    },
    {
        id: 'impeachment_recession',
        condition: (world) =>
            world.investigations.impeachmentStage >= 2 && world.geopolitical.recessionDeclared,
        event: {
            id: 'compound_constitutional_crisis',
            category: 'political',
            headline: 'Constitutional crisis meets economic collapse; markets whipsaw as impeachment proceedings continue through recession',
            magnitude: 'major',
            params: { mu: -0.06, theta: 0.03, lambda: 3.0, xi: 0.2, rho: -0.1 },
            effects: (world) => {
                world.election.barronApproval = Math.max(0, world.election.barronApproval - 15);
            },
        },
    },
    {
        id: 'pnth_scandal_convergence',
        condition: (world) =>
            world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched && world.pnth.whistleblowerFiled,
        event: {
            id: 'compound_pnth_perfect_storm',
            category: 'pnth',
            headline: 'DOJ, Senate, and whistleblower actions converge on Palanthropic simultaneously; board calls emergency session as share price enters free fall',
            magnitude: 'major',
            params: { mu: -0.05, theta: 0.03, lambda: 2.0 },
            effects: (world) => {
                world.pnth.ethicsBoardIntact = false;
                world.pnth.commercialMomentum = -2;
            },
        },
    },
    {
        id: 'gottlieb_rival_trade_war',
        condition: (world) =>
            world.pnth.gottliebStartedRival && world.geopolitical.tradeWarStage >= 2 &&
            world.geopolitical.sanctionsActive,
        event: {
            id: 'compound_covenant_sanctions',
            category: 'pnth',
            headline: 'Gottlieb\'s Covenant AI faces sanctions review for Chinese partnerships; trade war threatens to split the AI industry along geopolitical lines',
            magnitude: 'moderate',
            params: { theta: 0.01, lambda: 0.5 },
        },
    },
    {
        id: 'oil_crisis_mideast',
        condition: (world) =>
            world.geopolitical.oilCrisis && world.geopolitical.mideastEscalation >= 3,
        event: {
            id: 'compound_energy_war',
            category: 'macro',
            headline: 'Full-scale Middle East conflict disrupts global energy supply chains; oil prices spike as strategic reserves are tapped',
            magnitude: 'major',
            params: { mu: -0.06, theta: 0.03, lambda: 2.5, b: 0.02, sigmaR: 0.005 },
        },
    },
    {
        id: 'fed_credibility_collapse',
        condition: (world) =>
            world.fed.credibilityScore <= 3 && world.fed.hartleyFired,
        event: {
            id: 'compound_dollar_crisis',
            category: 'fed',
            headline: 'Fed credibility collapse triggers dollar sell-off; foreign central banks begin diversifying reserves as markets question U.S. monetary independence',
            magnitude: 'major',
            params: { mu: -0.04, theta: 0.02, sigmaR: 0.008, b: -0.01 },
        },
    },
    {
        id: 'player_high_scrutiny_campaign',
        condition: (world, congress, playerChoices, scrutinyLevel) =>
            scrutinyLevel >= 2 && world.election.primarySeason,
        event: {
            id: 'compound_campaign_subpoena_risk',
            category: 'investigation',
            headline: 'Congressional oversight committee requests trading records from "individuals of interest" at major banks; your desk is on the list',
            magnitude: 'moderate',
            params: { theta: 0.005 },
        },
    },
    {
        id: 'south_america_pnth_ops',
        condition: (world) =>
            world.geopolitical.southAmericaOps >= 2 && world.pnth.militaryContractActive,
        event: {
            id: 'compound_pnth_south_america',
            category: 'pnth',
            headline: 'Leaked cables reveal Palanthropic Atlas AI active in South American operations; Gottlieb faction demands emergency board vote on military contracts',
            magnitude: 'moderate',
            params: { theta: 0.01 },
            effects: (world) => {
                world.pnth.boardGottlieb = Math.min(12, world.pnth.boardGottlieb + 1);
            },
        },
    },
];

export function checkCompoundTriggers(world, congress, playerChoices, scrutinyLevel, activeRegIds) {
    const events = [];
    for (const trigger of COMPOUND_TRIGGERS) {
        if (_fired.has(trigger.id)) continue;
        try {
            if (trigger.condition(world, congress, playerChoices, scrutinyLevel, activeRegIds)) {
                _fired.add(trigger.id);
                events.push(trigger.event);
            }
        } catch { /* skip */ }
    }
    return events;
}

export function getFiredTriggerIds() {
    return [..._fired];
}

export function resetCompoundTriggers() {
    _fired.clear();
}

export { COMPOUND_TRIGGERS };
```

- [ ] **Step 2: Wire into `main.js`**

In `_onDayComplete()`, after event + regulation evaluation:

```javascript
if (eventEngine) {
    const congress = congressHelpers(eventEngine.world);
    const compoundEvents = checkCompoundTriggers(
        eventEngine.world, congress, playerChoices,
        getScrutinyLevel(),
        getActiveRegulations().map(r => r.id),
    );
    for (const evt of compoundEvents) {
        if (evt.params) eventEngine.applyDeltas(sim, evt.params);
        if (typeof evt.effects === 'function') evt.effects(eventEngine.world);
        else if (Array.isArray(evt.effects)) applyStructuredEffects(eventEngine.world, evt.effects);
        eventEngine.eventLog.push({
            day: sim.history.maxDay,
            headline: evt.headline,
            magnitude: evt.magnitude || 'moderate',
            params: evt.params || {},
        });
        showToast(evt.headline, 5000);
        const mu = evt.params?.mu || 0;
        if (mu > 0.02) playStinger('positive');
        else if (mu < -0.02) playStinger('negative');
        else playStinger('alert');
    }
    // Sync sim state after compound trigger param changes (same pattern as toast events at line 997-1001)
    if (compoundEvents.length > 0) {
        sim.recomputeK();
        syncMarket(sim);
        syncSettingsUI($, _simSettingsObj());
        updateEventLog($, eventEngine.eventLog, chart.dayOrigin);
        updateCongressDiagrams($, eventEngine.world);
    }
}
```

In `_resetCore()`: `resetCompoundTriggers();`

---

## Task 6: Superevent Presentation

**Files:**
- Modify: `src/ui.js` (`showPopupEvent` enhanced with superevent mode)
- Modify: `styles.css` (superevent styling, typewriter effect)
- Modify: `main.js` (mark certain events as superevents, play music)

- [ ] **Step 1: Add superevent CSS to `styles.css`**

```css
#popup-event-overlay.superevent { background: rgba(0, 0, 0, 0.7); transition: background 1.5s ease; }
#popup-event-overlay.superevent .popup-event-body { max-width: 600px; border-top-width: 4px; animation: superEventIn 1.5s ease both; }
#popup-event-overlay.superevent .popup-headline { font-size: 1.5rem; line-height: 1.3; }
#popup-event-overlay.superevent .popup-context { font-size: 0.9rem; line-height: 1.7; }
@keyframes superEventIn {
    0% { opacity: 0; transform: translateY(20px) scale(0.97); }
    40% { opacity: 0; transform: translateY(20px) scale(0.97); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
}
.typewriter-cursor {
    display: inline-block; width: 2px; height: 1em;
    background: var(--text); animation: blink 0.8s step-end infinite;
    vertical-align: text-bottom; margin-left: 1px;
}
@keyframes blink { 50% { opacity: 0; } }
```

- [ ] **Step 2: Modify `showPopupEvent` in `ui.js`**

Add `superevent` as the 8th parameter. New signature:

```javascript
export function showPopupEvent($, headline, context, choices, onChoice, category, magnitude, superevent = false) {
```

When `superevent` is true:
- Add `superevent` class to `$.popupOverlay`
- After setting `$.popupContext.textContent = ''`, run typewriter effect:

```javascript
if (superevent) {
    $.popupOverlay.classList.add('superevent');
    $.popupChoices.style.display = 'none'; // hide choices until typing done
    const fullContext = context;
    let charIdx = 0;
    const cursor = document.createElement('span');
    cursor.className = 'typewriter-cursor';
    $.popupContext.appendChild(cursor);
    const typeInterval = setInterval(() => {
        if (charIdx < fullContext.length) {
            cursor.before(document.createTextNode(fullContext[charIdx]));
            charIdx++;
        } else {
            clearInterval(typeInterval);
            cursor.remove();
            $.popupChoices.style.display = '';
            const firstBtn = $.popupChoices.querySelector('button');
            if (firstBtn) firstBtn.focus();
        }
    }, 25);
} else {
    $.popupOverlay.classList.remove('superevent');
    $.popupContext.textContent = context;
}
```

Move the existing `$.popupContext.textContent = context` (line 1118) inside the `else` branch above, since the typewriter case handles context differently.

In the button click handler (dismiss), also clean up superevent class:

```javascript
$.popupOverlay.classList.remove('superevent');
```

- [ ] **Step 3: Mark specific events as superevents and wire into `_processPopupQueue` in `main.js`**

Define the superevent ID set at module scope:

```javascript
const SUPEREVENT_IDS = new Set([
    'midterm_election_fed_gain', 'midterm_election_fed_hold',
    'midterm_election_fed_loss_house', 'midterm_election_fed_loss_both',
    'compound_stagflation', 'compound_constitutional_crisis',
    'compound_pnth_perfect_storm', 'compound_dollar_crisis',
    'compound_energy_war', 'scrutiny_enforcement',
]);
```

In `_processPopupQueue`, detect superevent BEFORE the `showPopupEvent` call at line 742. The updated call becomes:

```javascript
const isSuperevent = SUPEREVENT_IDS.has(event.id) ||
    (event.magnitude === 'major' && event.id?.startsWith('compound_'));

// Play music before showing the popup
if (isSuperevent) {
    const mu = event.params?.mu || (event.choices?.[0]?.deltas?.mu) || 0;
    if (mu > 0) playMusic('triumph');
    else if (mu < -0.03) playMusic('collapse');
    else playMusic('tension');
}

showPopupEvent($, event.headline, contextText, event.choices, (idx) => {
    // Stop superevent music after choice
    if (isSuperevent) stopMusic(2000);
    // ... existing onChoice handler ...
}, popupCat, event.magnitude, isSuperevent);
```

- [ ] **Step 4: Make midterm elections superevents**

Modify `_onMidterm` in `events.js`. The midterm event needs to become a popup event, but the params and effects must still be applied. The approach: apply params/effects **at queue time** (when `_fireEvent` is called), then show the popup as purely informational.

Change the event object constructed in `_onMidterm` to add:

```javascript
popup: true,
superevent: true,
choices: [
    {
        label: 'Acknowledged',
        desc: 'The markets have spoken.',
        // No deltas or effects -- the event params/effects are applied at fire time
    },
],
```

Then modify `_fireEvent` to handle the `superevent` case. When `event.popup && event.superevent`, apply the event's params and effects immediately (like a toast event) but ALSO queue the event for popup display:

```javascript
// In _fireEvent, before the existing popup check:
if (event.popup && event.superevent) {
    // Apply params/effects immediately (superevent is informational, not a choice)
    const coupling = this._computeCoupling(netDelta, event.params);
    if (event.params && coupling !== 1.0) {
        const scaled = {};
        for (const k in event.params) scaled[k] = event.params[k] * coupling;
        this.applyDeltas(sim, scaled);
    } else {
        this.applyDeltas(sim, event.params);
    }
    if (typeof event.effects === 'function') event.effects(this.world);
    else if (Array.isArray(event.effects)) applyStructuredEffects(this.world, event.effects);

    // Track in log
    this.eventLog.push({ day, headline: event.headline, magnitude: event.magnitude || 'major', params: event.params || {} });
    if (this.eventLog.length > MAX_LOG) this.eventLog.shift();

    // Schedule followups
    if (event.followups && depth < MAX_CHAIN_DEPTH) {
        const chainId = event.id || ('chain_' + day);
        for (const fu of event.followups) {
            const delay = this._followupDelay(fu.mtth);
            this._pendingFollowups.push({
                event: getEventById(fu.id) || fu,
                chainId,
                targetDay: day + Math.max(1, delay),
                weight: fu.weight ?? 1,
                depth: depth + 1,
            });
        }
    }

    // Queue for popup display (effects already applied)
    return { queued: true, event: { ...event } };
}
```

This ensures the params and world effects are applied immediately (the player can see the candle forming behind the superevent overlay), while the popup serves as a dramatic reveal of what just happened. The "Acknowledged" button simply dismisses the overlay.

**Important sync note:** Because the superevent result is routed to `popups` (not `fired`) by `_partition`, the existing sync code at main.js line 997-1001 (`recomputeK`, `syncMarket`, `syncSettingsUI`, etc.) will NOT run. To fix this, in `_onDayComplete()`, after the existing `for (const ev of popups)` loop at line 996, add a check:

```javascript
// Superevent popups may have already applied params -- sync sim state
const hasSupereventPopups = popups.some(ev => ev.superevent);
if (hasSupereventPopups) {
    sim.recomputeK();
    syncMarket(sim);
    syncSettingsUI($, _simSettingsObj());
    updateEventLog($, eventEngine.eventLog, chart.dayOrigin);
    updateCongressDiagrams($, eventEngine.world);
}
```

---

## Task 7: Lobbying System (`src/lobbying.js`)

**Files:**
- Create: `src/lobbying.js`
- Modify: `main.js` (import, wire button handler)
- Modify: `index.html` (add Lobby button to pill bar + lobbying overlay)
- Modify: `styles.css` (lobbying overlay styling)

- [ ] **Step 1: Create `src/lobbying.js`**

4 lobbying actions (all costs in **internal scale** -- displayed with "k" suffix via `fmtDollar`):
- Support Federalist Caucus (baseCost: 500, displayed "$500k"): +1 Senate Fed, +3 House Fed
- Support Farmer-Labor Coalition (baseCost: 500, displayed "$500k"): +1 Senate FL, +3 House FL
- Buy Presidential Cryptocurrency (baseCost: 300, displayed "$300k"): +2 Barron approval
- Fund Opposition Research (baseCost: 400, displayed "$400k"): -3 Barron approval

Each has a 30-day cooldown per target (congress / president). Costs multiplied by `getConvictionEffect('lobbyingCostMult', 1)`. Exports `getAvailableActions(day, cash)`, `executeLobbyAction(actionId, day, world)`, `resetLobbying()`.

Note: 500 internal = 5% of starting capital ($10,000 internal). This is a significant but not game-ending expenditure.

- [ ] **Step 2: Add Lobby button and overlay to `index.html`**

Add lobby tool button to `.sim-toolbar-actions` (line 158 of `index.html`), after the mode button and before the theme toggle. There is no "pill bar" in this project -- all tool buttons live in the toolbar. The button:

```html
<button id="lobby-btn" class="tool-btn" aria-label="Lobby" title="Lobby Congress or the President" style="display:none">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 20h20"/><path d="M5 20V10l7-5 7 5v10"/><path d="M9 20v-4h6v4"/><path d="M10 6h4"/>
    </svg>
</button>
```

Add lobby overlay after the other overlays (after `#popup-event-overlay`):

```html
<div id="lobby-overlay" class="sim-overlay hidden" role="dialog" aria-label="Lobbying" aria-modal="true">
    <div class="sim-overlay-panel glass">
        <div class="stats-header">
            <h2 class="stats-title">Lobbying</h2>
            <button id="lobby-close" class="tool-btn" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="sim-overlay-body">
            <p class="text-muted" style="font-size:0.8rem;margin-bottom:12px">
                Channel funds to influence the political landscape. Costs are deducted from cash. Each channel has a cooldown.
            </p>
            <div id="lobby-actions"></div>
        </div>
    </div>
</div>
```

- [ ] **Step 3: Wire lobbying in `main.js`**

Button click opens overlay (only in Dynamic mode). Action clicks call `executeLobbyAction`, deduct cash, add 1 scrutiny point, record playerChoice, show toast, close overlay. Hidden when not in Dynamic mode.

In `_resetCore()`: `resetLobbying();`

- [ ] **Step 4: Style lobbying overlay**

Reuse `.popup-choice-btn` styling for action buttons. Disabled buttons get opacity 0.4.

---

## Task 8: Event Chain Time Windows

**Files:**
- Modify: `src/events.js` (`_filterEligible` to check `minDay`/`maxDay`)
- Modify: `src/event-pool.js` (add `minDay`/`maxDay` to events)

- [ ] **Step 1: Add `minDay`/`maxDay` filtering to `_filterEligible`**

First, add `HISTORY_CAPACITY` to the import statement at the top of `events.js` (line 10-16). The existing import is:

```javascript
import {
    MAX_EVENT_LOG, MAX_FOLLOWUP_DEPTH, FED_MEETING_INTERVAL,
    MIDTERM_DAY, CAMPAIGN_START_DAY, NON_FED_POISSON_RATE,
    NON_FED_COOLDOWN_MIN, NON_FED_COOLDOWN_MAX, FED_MEETING_JITTER,
    BOREDOM_THRESHOLD, TERM_END_DAY,
    PNTH_EARNINGS_INTERVAL, PNTH_EARNINGS_JITTER,
    ADV, EVENT_COUPLING_CAP,
} from './config.js';
```

Add `HISTORY_CAPACITY` to this import list.

Then in `_filterEligible` (line 356-367), after the existing era check block, add:

```javascript
// Fine-grained time window (live trading days since HISTORY_CAPACITY)
const liveDay = day - HISTORY_CAPACITY;
if (ev.minDay != null && liveDay < ev.minDay) return false;
if (ev.maxDay != null && liveDay > ev.maxDay) return false;
```

- [ ] **Step 2: Add time windows to event-pool.js events**

Review each event's narrative role and assign `minDay`/`maxDay`:
- Early establishment events: `maxDay: 300`
- Mid-game escalation: `minDay: 200, maxDay: 750`
- Late-game resolution: `minDay: 600`
- Endgame: `minDay: 800`

Events without these fields remain eligible at any time (backward compatible).

---

## Task 9: Thought Interjections (Low Priority)

**Files:**
- Create: `src/interjections.js`
- Modify: `main.js` (import, evaluate at end-of-day)
- Modify: `styles.css` (interjection toast styling)

- [ ] **Step 1: Create `src/interjections.js`**

~10 atmospheric interjections with conditions:
- Vol spike: "Your hands remember 2008..."
- Sidelines: "You're watching from the sidelines..."
- Own press: "You're starting to believe your own press clippings."
- Drawdown hold: "Every fiber says cut it..."
- Quiet tape: "Something feels wrong about this tape..."
- Late game: "Four years. You can feel the weight of every trade."
- Negative cash: "The margin line is a cliff edge..."
- Crisis profits: "Someone is always on the other side of a crisis trade..."
- Empty desk: "The floor is quiet. Everyone else went home..."
- Negative rates: "Negative rates. The textbooks didn't prepare you for this."

50-day minimum cooldown between any interjection. 150-day per-interjection cooldown. Returns at most one text string or null.

- [ ] **Step 2: Wire into `main.js`**

In `_onDayComplete()`, after all event/regulation/compound processing:

```javascript
const interjection = checkInterjections(ctx, sim.history.maxDay);
if (interjection) _showInterjection(interjection);
```

Use the existing `showToast(message, duration)` function to display interjections. The interjection text is styled differently via a CSS class added to the toast container temporarily. This avoids bypassing the existing toast pattern:

```javascript
function _showInterjection(text) {
    // Use standard showToast, then style the last toast element as an interjection.
    // Assumption: showToast() synchronously appends the toast DOM element (verified in
    // shared-utils.js). If showToast ever becomes async, this approach would need updating.
    const container = document.getElementById('toast-container');
    showToast(text, 6000);
    requestAnimationFrame(() => {
        const last = container?.lastElementChild;
        if (last) last.classList.add('interjection-toast');
    });
}
```

In `_resetCore()`: `resetInterjections();`

- [ ] **Step 3: Style interjection toasts**

The `.interjection-toast` class is applied to individual toast elements by `_showInterjection`. This works alongside the existing `.toast` class (no conflict):

```css
.toast.interjection-toast {
    font-style: italic; color: var(--text-muted);
    border-color: transparent; background: var(--bg-panel);
    font-size: 0.8rem; max-width: 360px; text-align: center;
}
```

---

## Task 10: Epilogue & Integration Updates

**Files:**
- Modify: `src/epilogue.js` (new parameters)
- Modify: `main.js` (pass all new state, update `_resetCore`)

- [ ] **Step 1: Update `generateEpilogue` signature**

Add `convictionIds = []` and `scrutinyState = null` parameters. Pass through to `_pageLegacy`.

- [ ] **Step 2: Ensure all resets in `_resetCore`**

```javascript
resetConvictions(); resetRegulations(); resetScrutiny();
resetCompoundTriggers(); resetLobbying(); resetInterjections(); resetAudio();
```

- [ ] **Step 3: Pass new state to `generateEpilogue`**

```javascript
generateEpilogue(world, sim, portfolio, eventLog,
    playerChoices, impactHistory, quarterlyReviews,
    terminationReason, getConvictionIds(), getScrutinyState())
```

- [ ] **Step 4: Add new flags to reputation synthesis**

Lobbying flags to Kingmaker. Scrutiny flags (stonewalled, invoked fifth) to Insider. Cooperation flags (testified, informed) to Principled.

---

## Execution Order Summary

```
Task 1 (Audio)         --- standalone
Task 2 (Convictions)   --- standalone (provides getConvictionEffect for Tasks 3,4,7)
Task 3 (Regulations)   --- depends on Task 2
Task 4 (Scrutiny)      --- depends on Task 2
Task 5 (Compound)      --- depends on Tasks 2,3,4
Task 6 (Superevents)   --- depends on Task 1
Task 7 (Lobbying)      --- depends on Tasks 2,3,4
Task 8 (Time Windows)  --- standalone
Task 9 (Interjections) --- standalone
Task 10 (Integration)  --- depends on all above
```

**Parallelizable:** Tasks 1, 2, 8, 9 can all run simultaneously.
