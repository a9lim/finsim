/* ===================================================
   audio.js — Background jazz loop for Shoals.
   Walking bass with sub-octave warmth, rich 3-note
   comping with ghost fills, ride cymbal, cross-stick,
   and brush sweeps over Am diatonic circle.
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

/* Three-note rootless voicings with smooth voice leading.
   Each chord connects to the next by semitone/step motion:
   Am7→D7: G→Gb only. D7→GM7: C→B, E→D. GM7→CM7: D→E, Gb→G.
   CM7→FM7: parallel 3rds down. FM7→Hd: C→D, E→F. Hd→E7: A→B only.
   E7(b9)→Am7: B→C, D→E, F→G (all steps — textbook resolution). */
const VOICING = {
    Am7: [N.C4, N.E4, N.G4],       // 3, 5, 7
    D7:  [N.C4, N.E4, N.Gb4],      // b7, 9, 3 — type B rootless
    GM7: [N.B3, N.D4, N.Gb4],      // 3, 5, 7
    CM7: [N.B3, N.E4, N.G4],       // 7, 3, 5
    FM7: [N.A3, N.C4, N.E4],       // 3, 5, 7
    Hd:  [N.A3, N.D4, N.F4],       // Bm7b5: b7, b3, b5
    E7:  [N.B3, N.D4, N.F4],       // 5, b7, b9 — tension into Am
};

/* Walking bass: one quarter note per beat, 64 total.
   Smooth stepwise motion with chromatic approaches on beat 4.
   Mostly 2nds and 3rds — no wide leaps. Suave, not angular. */
const BASS = [
    // A (bars 0–3: Am7 → D7 → GM7 → CM7)
    N.A2, N.B2, N.C3, N.Db3,     N.D3, N.C3, N.A2, N.Ab2,
    N.G2, N.A2, N.B2, N.B2,      N.C3, N.B2, N.G2, N.E2,
    // B (bars 4–7: FM7 → Bm7b5 → E7 → E7)
    N.F2, N.G2, N.A2, N.Bb2,     N.B2, N.A2, N.G2, N.F2,
    N.E2, N.Gb2, N.Ab2, N.B2,    N.E3, N.D3, N.B2, N.Bb2,
    // A' (bars 8–11: Am7 → D7 → GM7 → CM7)
    N.A2, N.C3, N.D3, N.Db3,     N.D3, N.C3, N.A2, N.Ab2,
    N.G2, N.B2, N.A2, N.B2,      N.C3, N.B2, N.A2, N.E2,
    // C (bars 12–15: FM7 → Bm7b5 → E7 → Am7 → loop)
    N.F2, N.G2, N.A2, N.Bb2,     N.B2, N.A2, N.G2, N.F2,
    N.E2, N.Gb2, N.G2, N.Ab2,    N.A2, N.G2, N.F2, N.Ab2,
];

/* Comp events: 2–3 hits per bar with ghost fills for texture.
   ghost = true → quiet square-wave percussive fill
   ghost = false/undefined → warm triangle-wave main voicing */
const COMP = [];
for (let bar = 0; bar < 16; bar++) {
    const b = bar * 4, ch = CHORDS[bar];
    if (bar % 4 === 0) {
        // Section start: strong downbeat + ghost fill + off-beat
        COMP.push({ beat: b,           ch, dur: 0.8, vol: 1.0 },
                   { beat: b + 1 + SW, ch, dur: 0.3, vol: 0.5, ghost: true },
                   { beat: b + 2 + SW, ch, dur: 0.5, vol: 0.7 });
    } else if (bar % 4 === 2) {
        // Mid-section: syncopated with trailing ghost
        COMP.push({ beat: b + SW,      ch, dur: 0.6, vol: 0.65 },
                   { beat: b + 2,      ch, dur: 0.5, vol: 0.8 },
                   { beat: b + 3 + SW, ch, dur: 0.3, vol: 0.4, ghost: true });
    } else if (bar % 2 === 0) {
        // Even bars: relaxed, two hits
        COMP.push({ beat: b + 1,       ch, dur: 0.7, vol: 0.7 },
                   { beat: b + 2 + SW, ch, dur: 0.4, vol: 0.5 });
    } else {
        // Odd bars: laid back with ghost texture
        COMP.push({ beat: b + SW,      ch, dur: 0.6, vol: 0.6 },
                   { beat: b + 2,      ch, dur: 0.3, vol: 0.35, ghost: true },
                   { beat: b + 3,      ch, dur: 0.6, vol: 0.7 });
    }
}

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

/** Cross-stick: short bandpass noise burst for woody backbeat. */
function _crossStick(time, vol, dest) {
    if (!_noiseBuffer) {
        const len = _ctx.sampleRate * 2;
        _noiseBuffer = _ctx.createBuffer(1, len, _ctx.sampleRate);
        const d = _noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 4;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.linearRampToValueAtTime(vol * 0.25, time + 0.012);
    g.gain.linearRampToValueAtTime(0, time + 0.04);

    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(time);
    src.stop(time + 0.05);
}

/* =============== JAZZ LOOP =============== */

/** Schedule one full 16-bar loop iteration starting at t0. */
function _scheduleLoop(t0) {
    const dest = _jazzGain;

    /* Walking bass: triangle at written pitch (audible on all speakers)
       + sub-octave sine for warmth on full-range systems */
    for (let i = 0; i < 64; i++) {
        _noteOn('triangle', BASS[i],       t0 + i * BEAT, 0.9, 0.12, 280, dest);
        _noteOn('sine',     BASS[i] * 0.5, t0 + i * BEAT, 0.9, 0.22, 220, dest);
    }

    /* Chord comping: warm triangle mains + quiet square ghost fills */
    for (const c of COMP) {
        const v = VOICING[c.ch];
        const isGhost = c.ghost;
        const baseVol = isGhost ? 0.01 : 0.025;
        const filterHz = isGhost ? 700 : 1100;
        const type = isGhost ? 'square' : 'triangle';
        for (const freq of v) {
            _noteOn(type, freq, t0 + c.beat * BEAT, c.dur, baseVol * c.vol, filterHz, dest);
        }
    }

    /* Drums: unified kit pattern that builds within each 4-bar phrase.
       phrase 0 = sparse (just kick + hat), 1 = developing (add cross-stick,
       kick ghost), 2 = full groove, 3 = resolve with brush sweep. */
    for (let bar = 0; bar < 16; bar++) {
        const b = bar * 4;
        const p = bar % 4;  // phrase position: 0 start → 3 resolve

        /* Kick: always on 1, ghost on 3 enters at phrase 1 and grows */
        _kick(t0 + b * BEAT, 0.06 + p * 0.005, dest);
        if (p >= 1) {
            _kick(t0 + (b + 2) * BEAT, 0.015 + p * 0.005, dest);
        }

        /* Cross-stick: beat 2 enters at phrase 1, beat 4 at phrase 2 */
        if (p >= 1) {
            _crossStick(t0 + (b + 1) * BEAT, 0.04 + p * 0.005, dest);
        }
        if (p >= 2) {
            _crossStick(t0 + (b + 3) * BEAT, 0.04, dest);
        }

        /* Hi-hat: downbeat always; swing ghosts layer in as phrase builds */
        _noise(t0 + b * BEAT, 0.05, 0.03 + (p === 0 ? 0.01 : 0), 8000, dest);
        if (p >= 1) {
            _noise(t0 + (b + 2 + SW) * BEAT, 0.035, 0.012, 10000, dest);
        }
        if (p >= 2) {
            _noise(t0 + (b + SW) * BEAT, 0.03, 0.008, 10000, dest);
        }

        /* Brush sweep on resolve bar — leads into next phrase */
        if (p === 3) {
            _noise(t0 + (b + 3) * BEAT, BEAT * 1.5, 0.015, 3000, dest);
        }
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
