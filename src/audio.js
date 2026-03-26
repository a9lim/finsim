/* ===================================================
   audio.js — Chiptune jazz for Shoals.
   Synthesized walking bass, swing comping, brushed
   hi-hat, and angular melody over Am diatonic circle.
   Event stingers and superevent chord stabs on top.
   All Web Audio API — no external audio files.
   Leaf module. No DOM access.
   =================================================== */

/* ---- State ---- */
let _ctx, _master, _jazzGain, _droneGain, _stingerGain, _musicGain;
let _volume = 0.3;
let _noiseBuffer = null;
let _jazzPlaying = false;
let _jazzTimer = null;
let _jazzNext = 0;
let _currentMood = null;
let _droneNodes = [];
let _musicNodes = [];
let _musicFadeTimer = null;

/* ---- Constants ---- */

const BPM = 128;
const BEAT = 60 / BPM;          // 0.46875 s
const LOOP_DUR = 64 * BEAT;     // 30 s (16 bars of 4)
const SW = 0.67;                // swing: upbeats at 2/3 of beat

/* Note frequency table (octaves 2–5, all chromatic) */
const N = (() => {
    const t = {};
    const S = { C:0,Db:1,D:2,Eb:3,E:4,F:5,Gb:6,G:7,Ab:8,A:9,Bb:10,B:11 };
    for (let o = 2; o <= 5; o++)
        for (const [n, s] of Object.entries(S))
            t[n + o] = +(440 * 2 ** ((s - 9) / 12 + (o - 4))).toFixed(2);
    return t;
})();

/* =============== COMPOSITION =============== */

/* Chord map: 16 bars — Am diatonic circle with dramatic turnaround.
   Am→Dm→G→C (ascending circle of 4ths) then F→Bm7b5→E7 (cinematic
   half-diminished turnaround resolving back to Am). */
const CHORDS = [
    'Am7','D7','GM7','CM7',       // A  — circle of 4ths, bright lift
    'FM7','Hd','E7', 'E7',       // B  — darkens, E7 tension held
    'Am7','D7','GM7','CM7',       // A' — return
    'FM7','Hd','E7', 'Am7',      // C  — resolves to Am
];

/* Shell voicings: 3rd + 7th */
const VOICING = {
    Am7: [N.C4, N.G4],
    D7:  [N.Gb3, N.C4],
    GM7: [N.B3, N.Gb4],
    CM7: [N.E4, N.B4],
    FM7: [N.A3, N.E4],
    Hd:  [N.D4, N.A4],      // Bm7b5: b3 + b7
    E7:  [N.Ab3, N.D4],
};

/* Walking bass: one quarter note per beat, 64 total.
   Angular lines with wide leaps and chromatic approaches. */
const BASS = [
    // A (bars 0–3: Am7 → D7 → GM7 → CM7)
    N.A2, N.C3, N.E3, N.Eb3,     N.D3, N.A2, N.Gb2, N.Ab2,
    N.G2, N.B2, N.D3, N.B2,      N.C3, N.E3, N.G2, N.E3,
    // B (bars 4–7: FM7 → Bm7b5 → E7 → E7)
    N.F2, N.A2, N.C3, N.Bb2,     N.B2, N.D3, N.F3, N.F3,
    N.E3, N.Ab2, N.B2, N.D3,     N.E2, N.Ab2, N.B2, N.Bb2,
    // A' (bars 8–11: Am7 → D7 → GM7 → CM7)
    N.A2, N.E3, N.C3, N.Eb3,     N.D3, N.Gb2, N.A2, N.Ab2,
    N.G2, N.D3, N.B2, N.B2,      N.C3, N.G2, N.E3, N.E3,
    // C (bars 12–15: FM7 → Bm7b5 → E7 → Am7 → loop)
    N.F2, N.C3, N.A2, N.Bb2,     N.B2, N.F3, N.D3, N.F3,
    N.E3, N.B2, N.Ab2, N.Ab2,    N.A2, N.E3, N.C3, N.Ab2,
];

/* Comp events: 2 hits per bar, section-start bars get strong downbeat */
const COMP = [];
for (let bar = 0; bar < 16; bar++) {
    const b = bar * 4, ch = CHORDS[bar];
    if (bar % 4 === 0) {
        // Section start: strong downbeat + and-of-2
        COMP.push({ beat: b,           ch, dur: 0.5 },
                   { beat: b + 2 + SW, ch, dur: 0.4 });
    } else if (bar % 2 === 0) {
        COMP.push({ beat: b + 1,       ch, dur: 0.7 },
                   { beat: b + 2 + SW, ch, dur: 0.4 });
    } else {
        COMP.push({ beat: b + SW,      ch, dur: 0.6 },
                   { beat: b + 3,      ch, dur: 0.6 });
    }
}

/* Melody: 8-bar head (bars 0–7). Nocturne-inspired phrasing —
   warm stepwise motion in octave 3–4, building through sequences
   and appoggiaturas to a dramatic octave-leap climax on G5,
   then settling back into intimate chromatic descent.
   Bars 8–15 tacet (rhythm section breathes). */
const MELODY = [
    // Bar 0 (Am7): nocturne opening — long tones, unhurried
    { beat: 0,         freq: N.A3,  dur: 2 },
    { beat: 2 + SW,    freq: N.B3,  dur: 1 - SW },
    { beat: 3,         freq: N.C4,  dur: 1 },
    // Bar 1 (D7): ascending sequence continues, tritone color
    { beat: 4,         freq: N.D4,  dur: 1 },
    { beat: 5,         freq: N.Gb3, dur: SW },
    { beat: 5 + SW,    freq: N.A3,  dur: 1 - SW },
    { beat: 6,         freq: N.D4,  dur: 1.5 },
    // Bar 2 (GM7): building — stepwise through the 7th
    { beat: 8,         freq: N.B3,  dur: 1.5 },
    { beat: 10,        freq: N.D4,  dur: SW },
    { beat: 10 + SW,   freq: N.E4,  dur: 1 - SW },
    { beat: 11,        freq: N.Gb4, dur: 1 },
    // Bar 3 (CM7): climax — dramatic leap, then cascading descent
    { beat: 12,        freq: N.G4,  dur: 1.5 },
    { beat: 14,        freq: N.E4,  dur: SW },
    { beat: 14 + SW,   freq: N.D4,  dur: 1 - SW },
    { beat: 15,        freq: N.C4,  dur: 1 },
    // Bar 4 (FM7): second theme — intimate, sustained
    { beat: 16,        freq: N.A3,  dur: 2 },
    { beat: 18 + SW,   freq: N.C4,  dur: 1 - SW },
    { beat: 19,        freq: N.F4,  dur: 1 },
    // Bar 5 (Bm7b5): chromatic descent into shadow
    { beat: 20,        freq: N.D4,  dur: 1 },
    { beat: 21,        freq: N.C4,  dur: SW },
    { beat: 21 + SW,   freq: N.B3,  dur: 1 + (1 - SW) },
    // Bar 6 (E7): appoggiatura — C resolves to B, then leaps
    { beat: 24,        freq: N.C4,  dur: 1 },
    { beat: 25,        freq: N.B3,  dur: SW },
    { beat: 25 + SW,   freq: N.Ab3, dur: 1 - SW },
    { beat: 26,        freq: N.E4,  dur: 1.5 },
    // Bar 7 (E7): sustained suspense — fading into silence
    { beat: 28,        freq: N.D4,  dur: 1.5 },
    { beat: 30,        freq: N.B3,  dur: 2 },
    // Bars 8–15: tacet — rhythm section only
];

/* Stinger definitions (one-shot event feedback) */
const STINGER_DEFS = {
    positive:   { freqStart: 440, freqEnd: 880,  duration: 0.4, type: 'sine',     gain: 0.15 },
    negative:   { freqStart: 440, freqEnd: 220,  duration: 0.5, type: 'triangle', gain: 0.15 },
    alert:      { freqStart: 660, freqEnd: 660,  duration: 0.3, type: 'square',   gain: 0.10, pulses: 2 },
    superevent: { freqStart: 220, freqEnd: 55,   duration: 1.5, type: 'sawtooth', gain: 0.12 },
};

/* Superevent chord stabs */
const MUSIC_CHORDS = {
    tension:    [{ notes: [110, 130.8, 164.8], type: 'sawtooth', dur: 6 }],
    triumph:    [{ notes: [130.8, 164.8, 196],  type: 'sine',     dur: 5 }],
    collapse:   [{ notes: [98, 116.5, 138.6],   type: 'triangle', dur: 7 }],
    revelation: [{ notes: [146.8, 185, 220],    type: 'sine',     dur: 5 }],
};

/* Mood → [jazzGain, droneGain] crossfade levels */
const MOOD_MIX = {
    calm:   [1.0, 0.0],
    tense:  [0.55, 0.45],
    crisis: [0.15, 0.85],
};

/* Drone: low Am pad — continuous oscillators, gain-controlled */
const DRONE_VOICES = [
    { type: 'sine',     freq: 55,    gain: 0.12, filter: 200  },  // A1 sub
    { type: 'sine',     freq: 110,   gain: 0.09, filter: 300  },  // A2 root
    { type: 'triangle', freq: 164.8, gain: 0.05, filter: 400  },  // E3 fifth
    { type: 'sawtooth', freq: 82.4,  gain: 0.04, filter: 120  },  // E2 grit
];

/* =============== AUDIO CONTEXT =============== */

function _createCtx() {
    if (_ctx) return;
    try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
        _master = _ctx.createGain();
        _master.gain.value = _volume;
        _master.connect(_ctx.destination);

        _jazzGain = _ctx.createGain();
        _jazzGain.gain.value = 0;
        _jazzGain.connect(_master);

        _droneGain = _ctx.createGain();
        _droneGain.gain.value = 0;
        _droneGain.connect(_master);

        _stingerGain = _ctx.createGain();
        _stingerGain.gain.value = 1;
        _stingerGain.connect(_master);

        _musicGain = _ctx.createGain();
        _musicGain.gain.value = 1;
        _musicGain.connect(_master);
    } catch { /* AudioContext unavailable */ }
}

function _isReady() {
    return _ctx && _ctx.state === 'running';
}

/* =============== INSTRUMENT HELPERS =============== */

/** Oscillator note with ADSR envelope and lowpass filter. */
function _noteOn(type, freq, time, durBeats, vol, filterHz, dest) {
    const dur = durBeats * BEAT;
    const osc = _ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = filterHz;
    flt.Q.value = 1;

    const g = _ctx.createGain();
    const att = 0.01;
    const rel = Math.min(0.08, dur * 0.3);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + att);
    g.gain.setValueAtTime(vol, time + dur - rel);
    g.gain.linearRampToValueAtTime(0, time + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.02);
}

/** Noise burst for hi-hat / brush sounds. */
function _noise(time, dur, vol, hipassHz, dest) {
    if (!_noiseBuffer) {
        const len = _ctx.sampleRate * 2;
        _noiseBuffer = _ctx.createBuffer(1, len, _ctx.sampleRate);
        const d = _noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const flt = _ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = hipassHz;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.linearRampToValueAtTime(0, time + dur);

    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    src.start(time);
    src.stop(time + dur + 0.01);
}

/** Kick drum: sine with pitch drop. */
function _kick(time, vol, dest) {
    const osc = _ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.linearRampToValueAtTime(0, time + 0.15);

    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.2);
}

/* =============== JAZZ LOOP =============== */

/** Schedule one full 16-bar loop iteration starting at t0. */
function _scheduleLoop(t0) {
    const dest = _jazzGain;

    /* Walking bass (triangle, dark filter) */
    for (let i = 0; i < 64; i++) {
        _noteOn('triangle', BASS[i], t0 + i * BEAT, 0.9, 0.16, 280, dest);
    }

    /* Chord comping (square, mid filter) */
    for (const c of COMP) {
        const v = VOICING[c.ch];
        for (const freq of v) {
            _noteOn('square', freq, t0 + c.beat * BEAT, c.dur, 0.04, 900, dest);
        }
    }

    /* Melody (square, brighter filter) — bars 0–7 only */
    for (const m of MELODY) {
        _noteOn('square', m.freq, t0 + m.beat * BEAT, m.dur, 0.08, 1800, dest);
    }

    /* Hi-hat: swung eighth notes, accenting beats 2 & 4 */
    for (let i = 0; i < 64; i++) {
        const accent = (i % 4 === 1 || i % 4 === 3);
        _noise(t0 + i * BEAT, 0.05, accent ? 0.05 : 0.025, 8000, dest);
        _noise(t0 + (i + SW) * BEAT, 0.035, 0.012, 10000, dest);
    }

    /* Kick: beat 1 (strong) + beat 3 (ghost) of each bar */
    for (let i = 0; i < 64; i += 4) {
        _kick(t0 + i * BEAT, 0.07, dest);
        _kick(t0 + (i + 2) * BEAT, 0.04, dest);
    }
}

/** Look-ahead scheduler: keeps 4 s of audio queued at all times. */
function _jazzSchedule() {
    if (!_jazzPlaying || !_ctx) return;
    while (_jazzNext < _ctx.currentTime + 4) {
        _scheduleLoop(_jazzNext);
        _jazzNext += LOOP_DUR;
    }
    _jazzTimer = setTimeout(_jazzSchedule, 2000);
}

/* =============== DRONE =============== */

/** Start continuous drone oscillators (silent until _droneGain is raised). */
function _startDrone() {
    if (_droneNodes.length > 0) return;
    for (const v of DRONE_VOICES) {
        const osc = _ctx.createOscillator();
        osc.type = v.type;
        osc.frequency.value = v.freq;

        const flt = _ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = v.filter;
        flt.Q.value = 2;

        const g = _ctx.createGain();
        g.gain.value = v.gain;

        osc.connect(flt);
        flt.connect(g);
        g.connect(_droneGain);
        osc.start();

        _droneNodes.push({ osc, flt, gain: g });
    }
}

/** Stop drone oscillators. */
function _stopDrone() {
    for (const n of _droneNodes) {
        try { n.osc.stop(); } catch {}
        try { n.osc.disconnect(); } catch {}
        try { n.gain.disconnect(); } catch {}
        try { n.flt.disconnect(); } catch {}
    }
    _droneNodes = [];
}

/* =============== PUBLIC API =============== */

export function initAudio() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches
        && !localStorage.getItem('shoals_audio_volume')) {
        _volume = 0;
    }
    _createCtx();
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();
}

/**
 * Set ambient mood. Starts the jazz loop + drone on first call;
 * subsequent calls crossfade between them.
 *   calm   — full jazz, no drone
 *   tense  — jazz recedes, drone rises
 *   crisis — mostly drone, jazz barely audible
 */
export function setAmbientMood(mood) {
    if (!_isReady()) return;
    const mix = MOOD_MIX[mood];
    if (!mix) return;

    if (mood !== _currentMood) {
        const now = _ctx.currentTime;
        const ramp = _jazzPlaying ? 2 : 0;

        _jazzGain.gain.cancelScheduledValues(now);
        _jazzGain.gain.setValueAtTime(_jazzGain.gain.value, now);
        _jazzGain.gain.linearRampToValueAtTime(mix[0], now + ramp);

        _droneGain.gain.cancelScheduledValues(now);
        _droneGain.gain.setValueAtTime(_droneGain.gain.value, now);
        _droneGain.gain.linearRampToValueAtTime(mix[1], now + ramp);
    }
    _currentMood = mood;

    if (!_jazzPlaying) {
        _jazzPlaying = true;
        _jazzNext = _ctx.currentTime + 0.05;
        _jazzSchedule();
        _startDrone();
    }
}

export function playStinger(type) {
    if (!_isReady()) return;
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

export function playMusic(track) {
    if (!_isReady()) return;
    stopMusic(500);

    /* Fade out jazz + drone for the duration of the stab */
    const duck = _ctx.currentTime;
    if (_jazzGain) {
        _jazzGain.gain.setValueAtTime(_jazzGain.gain.value, duck);
        _jazzGain.gain.linearRampToValueAtTime(0, duck + 0.5);
    }
    if (_droneGain) {
        _droneGain.gain.setValueAtTime(_droneGain.gain.value, duck);
        _droneGain.gain.linearRampToValueAtTime(0, duck + 0.5);
    }

    const now = _ctx.currentTime;
    const chords = MUSIC_CHORDS[track];
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

    /* Restore jazz + drone to current mood mix */
    if (_jazzPlaying && _currentMood) {
        const mix = MOOD_MIX[_currentMood] || [1, 0];
        const now2 = _ctx.currentTime;
        const restoreAt = now2 + fadeMs / 1000;
        if (_jazzGain) {
            _jazzGain.gain.setValueAtTime(0, restoreAt);
            _jazzGain.gain.linearRampToValueAtTime(mix[0], restoreAt + 1);
        }
        if (_droneGain) {
            _droneGain.gain.setValueAtTime(0, restoreAt);
            _droneGain.gain.linearRampToValueAtTime(mix[1], restoreAt + 1);
        }
    }
}

export function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    if (_master) _master.gain.value = _volume;
    try { localStorage.setItem('shoals_audio_volume', String(_volume)); } catch {}
}

export function getVolume() { return _volume; }

export function resetAudio() {
    stopMusic(200);
    _jazzPlaying = false;
    clearTimeout(_jazzTimer);
    _jazzTimer = null;
    _currentMood = null;
    if (_ctx) {
        const now = _ctx.currentTime;
        if (_jazzGain) {
            _jazzGain.gain.setValueAtTime(_jazzGain.gain.value, now);
            _jazzGain.gain.linearRampToValueAtTime(0, now + 0.3);
        }
        if (_droneGain) {
            _droneGain.gain.setValueAtTime(_droneGain.gain.value, now);
            _droneGain.gain.linearRampToValueAtTime(0, now + 0.3);
        }
    }
    setTimeout(_stopDrone, 400);
}

/* ---- Volume persistence ---- */
try {
    const saved = localStorage.getItem('shoals_audio_volume');
    if (saved != null) _volume = Math.max(0, Math.min(1, parseFloat(saved)));
} catch {}
