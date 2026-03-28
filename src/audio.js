/* ===================================================
   audio.js — Melancholic lounge jazz for Shoals.
   Rhodes piano, upright bass, brush drums, and sparse
   muted trumpet over a slow Am progression with
   intimate room reverb.
   All Web Audio API — no external audio files.
   Leaf module. No DOM access.
   =================================================== */

/* ---- State ---- */
let _ctx, _master, _jazzGain, _droneGain, _stingerGain, _musicGain;
let _reverbSend = null;
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

const BPM = 72;
const BEAT = 60 / BPM;          // ~0.833 s
const LOOP_DUR = 64 * BEAT;     // ~53.3 s (16 bars of 4)
const SW = 0.62;                // swing: upbeats at 62% of beat

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

/* 16-bar form in Am — melancholic with bittersweet lift.

   A:  Am9  → Dm9  → Bm7b5 → E7b9    (home → yearning → tension → peak)
   A': Am9  → Fmaj7→ Bm7b5 → E7b9    (home → lift → tension → held)
   B:  Fmaj7→ Em7  → Dm9   → Cmaj7   (descending arc — momentary hope)
   C:  Bm7b5→ E7b9 → E7b9  → Am9     (extended dominant → resolution)

   The harmonic rhythm breathes: sections A/A' move chord-per-bar,
   section B descends stepwise through the relative major,
   and section C stretches E7b9 across two bars for maximum
   tension before the final Am9 release and loop. */

const CHORDS = [
    'Am9','Dm9','Hd','E7',          // A  — classic minor cadence
    'Am9','FM7','Hd','E7',          // A' — bittersweet variant
    'FM7','Em7','Dm9','CM7',        // B  — descending, bright
    'Hd','E7','E7','Am9',           // C  — long tension, resolve
];

/* Rhodes piano voicings: 3–4 note rootless voicings, spread
   across C3–B4. Wide intervals create the dark, open quality
   of Bill Evans or early Herbie Hancock ballads.

   Voice leading between adjacent chords:
     Am9→Dm9:  E→F, G→A, C→C, B→E  (steps + hold)
     Dm9→Hd:   F→F, A→A, C→B, E→D  (holds + steps)
     Hd→E7:    F→F, A→Ab, B→B, D→D (chromatic + holds)
     E7→Am9:   Ab→G(?), B→C(?), D→E(?), F→B(?)  — big resolution
     Am9→FM7:  E→A(?), G→C(?), C→E(?) — open shift
     FM7→Em7:  A→G, C→B, E→D+E — step descent
     Em7→Dm9:  G→F, B→A, D→C, E→E — smooth descent
     Dm9→CM7:  F→E, A→G, C→B, E→D — parallel descent
     CM7→Hd:   E→F, G→A, B→B, D→D — steps + holds */

const VOICING = {
    Am9: [N.E3, N.G3, N.C4, N.B4],  // 5 b7 b3 9   — open, lonely
    Dm9: [N.F3, N.A3, N.C4, N.E4],  // b3 5 b7 9   — warm, centered
    Hd:  [N.F3, N.A3, N.B3, N.D4],  // b5 b7 R b3  — half-dim cluster
    E7:  [N.Ab3, N.B3, N.D4, N.F4], // 3 5 b7 b9   — crunchy dominant
    FM7: [N.A3, N.C4, N.E4],        // 3 5 7        — clear, simple
    Em7: [N.G3, N.B3, N.D4, N.E4],  // b3 5 b7 R   — subdued
    CM7: [N.E3, N.G3, N.B3, N.D4],  // 3 5 7 9     — spacious, hopeful
};

/* Walking bass: spacious and melodic rather than constant
   quarter-note walking. Half notes let the room breathe;
   chromatic approaches (Ab→A, Db→D, Eb→E) connect phrases.
   The line traces the harmonic roots while singing its own
   counter-melody underneath the piano. */
const BASS_LINE = [
    // ---- A (bars 0–3): Am9 → Dm9 → Bm7b5 → E7b9 ----
    { beat: 0,  note: N.A2,  dur: 1.8 },   // root, let it ring
    { beat: 2,  note: N.C3,  dur: 0.9 },   // up to b3
    { beat: 3,  note: N.Db3, dur: 0.8 },   // chromatic approach → D
    { beat: 4,  note: N.D3,  dur: 1.8 },   // Dm root, sustained
    { beat: 6,  note: N.A2,  dur: 0.9 },   // drop to 5th
    { beat: 7,  note: N.Ab2, dur: 0.8 },   // chromatic down → B
    { beat: 8,  note: N.B2,  dur: 1.5 },   // half-dim root
    { beat: 10, note: N.D3,  dur: 0.9 },   // b3
    { beat: 11, note: N.Eb3, dur: 0.8 },   // chromatic approach → E
    { beat: 12, note: N.E2,  dur: 2.5 },   // dominant root, dramatic hold
    { beat: 15, note: N.Ab2, dur: 0.8 },   // chromatic lead-in → A

    // ---- A' (bars 4–7): Am9 → Fmaj7 → Bm7b5 → E7b9 ----
    { beat: 16, note: N.A2,  dur: 2.0 },   // resolution, relief
    { beat: 18, note: N.E2,  dur: 1.5 },   // open 5th, breathing room
    { beat: 20, note: N.F2,  dur: 1.5 },   // Fmaj root, warm
    { beat: 22, note: N.A2,  dur: 0.9 },   // walk up
    { beat: 23, note: N.Ab2, dur: 0.8 },   // chromatic approach → B
    { beat: 24, note: N.B2,  dur: 1.0 },   // half-dim root
    { beat: 25, note: N.A2,  dur: 1.0 },   // step down
    { beat: 26, note: N.F2,  dur: 1.0 },   // b5 — dark
    { beat: 27, note: N.E2,  dur: 0.8 },   // leading to dominant
    { beat: 28, note: N.E2,  dur: 2.5 },   // sustained dominant root
    { beat: 31, note: N.Ab2, dur: 0.8 },   // chromatic → F

    // ---- B (bars 8–11): Fmaj7 → Em7 → Dm9 → Cmaj7 ----
    { beat: 32, note: N.F2,  dur: 1.8 },   // bridge opens
    { beat: 34, note: N.E2,  dur: 0.9 },   // step down
    { beat: 35, note: N.D3,  dur: 0.8 },   // leap up — energy
    { beat: 36, note: N.E2,  dur: 2.0 },   // Em root, sustained
    { beat: 38, note: N.D3,  dur: 1.5 },   // walk across bar line
    { beat: 40, note: N.D3,  dur: 1.5 },   // Dm root
    { beat: 42, note: N.C3,  dur: 0.9 },   // descending walk
    { beat: 43, note: N.B2,  dur: 0.8 },   // approach → C
    { beat: 44, note: N.C3,  dur: 2.0 },   // Cmaj root, let ring
    { beat: 46, note: N.B2,  dur: 1.5 },   // gentle step down

    // ---- C (bars 12–15): Bm7b5 → E7b9 → E7b9 → Am9 ----
    { beat: 48, note: N.B2,  dur: 1.0 },   // tension returns
    { beat: 49, note: N.D3,  dur: 1.0 },   // ascending walk
    { beat: 50, note: N.F3,  dur: 0.9 },   // b5, peak of line
    { beat: 51, note: N.E3,  dur: 0.8 },   // approaching E
    { beat: 52, note: N.E2,  dur: 2.8 },   // long dominant — dramatic
    { beat: 55, note: N.Gb2, dur: 0.8 },   // chromatic color
    { beat: 56, note: N.Ab2, dur: 1.5 },   // 3rd of E7 — unusual, tense
    { beat: 58, note: N.E2,  dur: 1.5 },   // back to root
    { beat: 60, note: N.A2,  dur: 2.0 },   // home — resolution
    { beat: 62, note: N.E2,  dur: 1.0 },   // open 5th
    { beat: 63, note: N.Ab2, dur: 0.8 },   // chromatic approach → A (loop)
];

/* Rhodes comp: hand-placed for musical phrasing. Strong downbeats
   on phrase entries, ghostly fills between, bars of deliberate
   silence for breathing room. ghost=true → muted percussive touch
   (darker filter, lower volume, no bell partial emphasis). */
const COMP = [
    // ---- A (bars 0–3) ----
    { beat: 0,       ch: 'Am9', dur: 1.2, vol: 0.9 },               // opening chord
    { beat: 2 + SW,  ch: 'Am9', dur: 0.4, vol: 0.4, ghost: true },  // ghost fill
    { beat: 5,       ch: 'Dm9', dur: 0.8, vol: 0.65 },              // answer on beat 2
    { beat: 7,       ch: 'Dm9', dur: 0.6, vol: 0.5 },               // beat 4, leading
    { beat: 8 + SW,  ch: 'Hd',  dur: 0.7, vol: 0.55 },              // syncopated tension
    { beat: 13,      ch: 'E7',  dur: 1.0, vol: 0.7 },               // dominant on 2
    { beat: 15 + SW, ch: 'E7',  dur: 0.3, vol: 0.35, ghost: true }, // ghost upbeat

    // ---- A' (bars 4–7) ----
    { beat: 16,      ch: 'Am9', dur: 1.5, vol: 0.85 },              // long release
    { beat: 21,      ch: 'FM7', dur: 0.8, vol: 0.6 },               // bittersweet lift
    { beat: 22 + SW, ch: 'FM7', dur: 0.4, vol: 0.4, ghost: true },
    { beat: 24,      ch: 'Hd',  dur: 0.7, vol: 0.6 },               // darkening
    { beat: 26,      ch: 'Hd',  dur: 0.5, vol: 0.45 },
    { beat: 29,      ch: 'E7',  dur: 1.2, vol: 0.65 },              // sustained tension

    // ---- B (bars 8–11): bridge — sparser, lighter touch ----
    { beat: 32,      ch: 'FM7', dur: 1.0, vol: 0.7 },               // new section start
    { beat: 34 + SW, ch: 'FM7', dur: 0.3, vol: 0.3, ghost: true },
    { beat: 38,      ch: 'Em7', dur: 0.7, vol: 0.5 },               // just one hit — space
    { beat: 40 + SW, ch: 'Dm9', dur: 0.8, vol: 0.55 },              // syncopated descent
    { beat: 42 + SW, ch: 'Dm9', dur: 0.4, vol: 0.35, ghost: true },
    { beat: 44,      ch: 'CM7', dur: 0.9, vol: 0.7 },               // brightness
    { beat: 46,      ch: 'CM7', dur: 0.7, vol: 0.55 },              // two clear statements

    // ---- C (bars 12–15): tension → resolution ----
    { beat: 49,      ch: 'Hd',  dur: 0.7, vol: 0.6 },
    { beat: 51 + SW, ch: 'Hd',  dur: 0.3, vol: 0.3, ghost: true },
    { beat: 52,      ch: 'E7',  dur: 0.8, vol: 0.7 },               // dominant pedal begins
    { beat: 54 + SW, ch: 'E7',  dur: 0.4, vol: 0.4, ghost: true },
    { beat: 55,      ch: 'E7',  dur: 0.6, vol: 0.6 },
    { beat: 56 + SW, ch: 'E7',  dur: 0.5, vol: 0.45 },              // sparse held tension
    { beat: 60,      ch: 'Am9', dur: 1.8, vol: 0.9 },               // resolution
];

/* Melody fragments: muted trumpet, Am pentatonic (A C D E G).
   Two alternate phrases — randomly chosen per loop iteration.
   Each is ~5 notes, very sparse — a melodic suggestion, not a solo.
   60% chance of melody per loop for natural variation. */

const MELODY_A = [
    // Bars 1–4: descending sigh (A → G → E ... E → D)
    { beat: 6,  note: N.A4, dur: 2.0 },   // over Dm9 — 5th, open
    { beat: 9,  note: N.G4, dur: 1.5 },   // stepping down over Hd
    { beat: 11, note: N.E4, dur: 2.5 },   // settling into E7
    { beat: 16, note: N.E4, dur: 2.0 },   // echo on Am resolution
    { beat: 19, note: N.D4, dur: 1.5 },   // tail off
];

const MELODY_B = [
    // Bars 8–11: arching figure (C → A → D ... E → G)
    { beat: 33, note: N.C5, dur: 1.5 },   // high point over Fmaj7
    { beat: 36, note: N.A4, dur: 2.0 },   // drop to Em7
    { beat: 40, note: N.D4, dur: 2.5 },   // nadir on Dm9
    { beat: 44, note: N.E4, dur: 1.5 },   // rising on Cmaj7
    { beat: 46, note: N.G4, dur: 1.5 },   // open 5th, fading out
];

/* ---- Stingers, music, mood, drone (unchanged) ---- */

const STINGER_DEFS = {
    positive:   { freqStart: 440, freqEnd: 880,  duration: 0.4, type: 'sine',     gain: 0.15 },
    negative:   { freqStart: 440, freqEnd: 220,  duration: 0.5, type: 'triangle', gain: 0.15 },
    alert:      { freqStart: 660, freqEnd: 660,  duration: 0.3, type: 'square',   gain: 0.10, pulses: 2 },
    superevent: { freqStart: 220, freqEnd: 55,   duration: 1.5, type: 'sawtooth', gain: 0.12 },
};

const MUSIC_CHORDS = {
    tension:    [{ notes: [110, 130.8, 164.8], type: 'sawtooth', dur: 6 }],
    triumph:    [{ notes: [130.8, 164.8, 196],  type: 'sine',     dur: 5 }],
    collapse:   [{ notes: [98, 116.5, 138.6],   type: 'triangle', dur: 7 }],
    revelation: [{ notes: [146.8, 185, 220],    type: 'sine',     dur: 5 }],
};

const MOOD_MIX = {
    calm:   [1.0, 0.0],
    tense:  [0.55, 0.45],
    crisis: [0.15, 0.85],
};

const DRONE_VOICES = [
    { type: 'sine',     freq: 55,    gain: 0.12, filter: 200  },
    { type: 'sine',     freq: 110,   gain: 0.09, filter: 300  },
    { type: 'triangle', freq: 164.8, gain: 0.05, filter: 400  },
    { type: 'sawtooth', freq: 82.4,  gain: 0.04, filter: 120  },
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

        _setupReverb();
    } catch { /* AudioContext unavailable */ }
}

function _isReady() {
    return _ctx && _ctx.state === 'running';
}

/* ---- Reverb: convolver with synthetic impulse response ----
   Small intimate room — 1.8 s tail with 12 ms predelay,
   darkened via lowpass on the return to simulate air absorption.
   Sounds like a late-night jazz club. */

function _setupReverb() {
    if (_reverbSend) return;

    const dur = 1.8;
    const rate = _ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = _ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.012);

    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = pre; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * Math.exp(-3.5 * (i - pre) / rate);
    }

    const conv = _ctx.createConvolver();
    conv.buffer = buf;

    _reverbSend = _ctx.createGain();
    _reverbSend.gain.value = 0.3;

    const lp = _ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.Q.value = 0.5;

    const ret = _ctx.createGain();
    ret.gain.value = 0.5;

    _reverbSend.connect(conv);
    conv.connect(lp);
    lp.connect(ret);
    ret.connect(_jazzGain);
}

/* =============== INSTRUMENT HELPERS =============== */

/** Ensure noise buffer exists for percussion instruments. */
function _ensureNoise() {
    if (_noiseBuffer) return;
    const len = _ctx.sampleRate * 2;
    _noiseBuffer = _ctx.createBuffer(1, len, _ctx.sampleRate);
    const d = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

/** Rhodes piano note: sine fundamental + detuned bell partial (2×).
    Ghost voicings use darker filter and suppress the bell. */
function _rhodesNote(freq, time, durBeats, vol, isGhost) {
    const dur = durBeats * BEAT;
    const dest = _jazzGain;

    const osc1 = _ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;

    const osc2 = _ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.003;   // ~2.6 cents sharp — warmth

    const bellG = _ctx.createGain();
    bellG.gain.value = isGhost ? 0.15 : 0.3;

    const flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = isGhost ? 1200 : 2200;
    flt.Q.value = 0.7;

    const rel = Math.min(0.25, dur * 0.3);
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.012);
    g.gain.linearRampToValueAtTime(vol * 0.85, time + 0.062);
    g.gain.linearRampToValueAtTime(vol * 0.7, time + dur - rel);
    g.gain.linearRampToValueAtTime(0, time + dur);

    osc1.connect(flt);
    osc2.connect(bellG);
    bellG.connect(flt);
    flt.connect(g);
    g.connect(dest);
    if (_reverbSend) g.connect(_reverbSend);

    osc1.start(time);  osc1.stop(time + dur + 0.02);
    osc2.start(time);  osc2.stop(time + dur + 0.02);
}

/** Upright bass: triangle body + sub-octave sine warmth.
    Pluck envelope — fast attack, natural decay into sustain. */
function _bassNote(freq, time, durBeats, vol) {
    const dur = durBeats * BEAT;
    const dest = _jazzGain;
    const decay = Math.max(dur * 0.3, 0.1);

    const osc1 = _ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    const flt1 = _ctx.createBiquadFilter();
    flt1.type = 'lowpass';
    flt1.frequency.value = 350;
    flt1.Q.value = 1;

    const g1 = _ctx.createGain();
    g1.gain.setValueAtTime(0, time);
    g1.gain.linearRampToValueAtTime(vol * 0.5, time + 0.008);
    g1.gain.linearRampToValueAtTime(vol * 0.2, time + decay);
    g1.gain.linearRampToValueAtTime(0, time + dur);

    const osc2 = _ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 0.5;

    const flt2 = _ctx.createBiquadFilter();
    flt2.type = 'lowpass';
    flt2.frequency.value = 200;
    flt2.Q.value = 1;

    const g2 = _ctx.createGain();
    g2.gain.setValueAtTime(0, time);
    g2.gain.linearRampToValueAtTime(vol, time + 0.005);
    g2.gain.linearRampToValueAtTime(vol * 0.5, time + decay);
    g2.gain.linearRampToValueAtTime(0, time + dur);

    osc1.connect(flt1); flt1.connect(g1); g1.connect(dest);
    osc2.connect(flt2); flt2.connect(g2); g2.connect(dest);

    osc1.start(time); osc1.stop(time + dur + 0.02);
    osc2.start(time); osc2.stop(time + dur + 0.02);
}

/** Brush circle swish: wideband noise, gentle decay. */
function _brushSwish(time, dur, vol, dest) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3500;
    bp.Q.value = 0.5;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);

    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + dur + 0.01);
}

/** Brush dab: focused noise burst, short accent on backbeats. */
function _brushDab(time, vol, dest) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4500;
    bp.Q.value = 1.5;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.003);
    g.gain.linearRampToValueAtTime(vol * 0.15, time + 0.015);
    g.gain.linearRampToValueAtTime(0, time + 0.045);

    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + 0.06);
}

/** Kick: sine with pitch drop. Very sparse in this arrangement. */
function _kick(time, vol, dest) {
    const osc = _ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.linearRampToValueAtTime(0, time + 0.15);

    osc.connect(g); g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.2);
}

/** Cross-stick: tight bandpass noise for woody turnaround accent. */
function _crossStick(time, vol, dest) {
    _ensureNoise();
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

    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + 0.05);
}

/** Ride cymbal shimmer: high-passed noise, short natural decay. */
function _rideTing(time, vol, dest) {
    _ensureNoise();
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer;

    const hp = _ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    src.connect(hp); hp.connect(g); g.connect(dest);
    src.start(time);
    src.stop(time + 0.25);
}

/** Muted trumpet: heavily filtered sawtooth with vibrato.
    Slow attack, nasal quality from LP resonance. */
function _trumpetNote(freq, time, durBeats, vol) {
    const dur = durBeats * BEAT;
    const dest = _jazzGain;

    const osc = _ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const vib = _ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibAmt = _ctx.createGain();
    vibAmt.gain.value = freq * 0.006;   // ~10 cents depth
    vib.connect(vibAmt);
    vibAmt.connect(osc.frequency);

    const flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 900;
    flt.Q.value = 2;

    const g = _ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.06);
    g.gain.linearRampToValueAtTime(vol * 0.85, time + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, time + dur);

    osc.connect(flt); flt.connect(g);
    g.connect(dest);
    if (_reverbSend) g.connect(_reverbSend);

    osc.start(time);  osc.stop(time + dur + 0.05);
    vib.start(time);  vib.stop(time + dur + 0.05);
}

/* =============== JAZZ LOOP =============== */

/** Schedule one full 16-bar loop starting at t0. */
function _scheduleLoop(t0) {
    const dest = _jazzGain;

    /* Walking bass */
    for (const b of BASS_LINE)
        _bassNote(b.note, t0 + b.beat * BEAT, b.dur, 0.20);

    /* Rhodes comping */
    for (const c of COMP) {
        const v = VOICING[c.ch];
        const baseVol = c.ghost ? 0.015 : 0.035;
        for (const freq of v)
            _rhodesNote(freq, t0 + c.beat * BEAT, c.dur, baseVol * c.vol, !!c.ghost);
    }

    /* Drums: continuous brush circles with dab backbeats,
       sparse kick on structural downbeats, cross-stick on
       turnaround bars, ride shimmer on swung upbeats. */
    for (let bar = 0; bar < 16; bar++) {
        const b = bar * 4;

        // Brush circles: forward stroke on beats, back stroke on upbeats
        for (let i = 0; i < 4; i++) {
            _brushSwish(t0 + (b + i) * BEAT, 0.30, 0.018, dest);
            _brushSwish(t0 + (b + i + SW) * BEAT, 0.22, 0.010, dest);
        }

        // Dab accents on 2 and 4
        _brushDab(t0 + (b + 1) * BEAT, 0.030, dest);
        _brushDab(t0 + (b + 3) * BEAT, 0.030, dest);

        // Kick: only at section starts (every 4 bars)
        if (bar % 4 === 0)
            _kick(t0 + b * BEAT, 0.035, dest);

        // Cross-stick on beat 4 of turnaround bars
        if (bar === 3 || bar === 7 || bar === 15)
            _crossStick(t0 + (b + 3) * BEAT, 0.025, dest);
    }

    // Ride shimmer: swung upbeats, every other bar
    for (let bar = 0; bar < 16; bar += 2) {
        const b = bar * 4;
        _rideTing(t0 + (b + SW) * BEAT, 0.012, dest);
        _rideTing(t0 + (b + 2 + SW) * BEAT, 0.010, dest);
    }

    /* Melody: 60% chance per loop, alternate phrases for variety */
    if (Math.random() < 0.6) {
        const phrase = Math.random() < 0.5 ? MELODY_A : MELODY_B;
        for (const m of phrase)
            _trumpetNote(m.note, t0 + m.beat * BEAT, m.dur, 0.018);
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
