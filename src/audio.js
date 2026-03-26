/* ===================================================
   audio.js -- Synthesized audio system for Shoals.
   Three layers: ambient drone, event stingers, and
   superevent music. All synthesis via Web Audio API.
   No external audio files required.

   Leaf module. No DOM access.
   =================================================== */

let _ctx = null;
let _master = null;
let _ambientGain = null;
let _stingerGain = null;
let _musicGain = null;
let _volume = 0.3;
let _currentMood = null;
let _ambientNodes = [];
let _musicNodes = [];
let _musicFadeTimer = null;

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

const STINGER_DEFS = {
    positive: { freqStart: 440, freqEnd: 880,  duration: 0.4, type: 'sine',     gain: 0.15 },
    negative: { freqStart: 440, freqEnd: 220,  duration: 0.5, type: 'triangle', gain: 0.15 },
    alert:    { freqStart: 660, freqEnd: 660,  duration: 0.3, type: 'square',   gain: 0.10, pulses: 2 },
    superevent: { freqStart: 220, freqEnd: 55, duration: 1.5, type: 'sawtooth', gain: 0.12 },
};

function _ensureCtx() {
    if (_ctx) return _ctx.state !== 'suspended';
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

export function initAudio() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && !localStorage.getItem('shoals_audio_volume')) {
        _volume = 0;
    }
    if (!_ensureCtx()) return;
    if (_ctx.state === 'suspended') _ctx.resume();
}

function _stopAmbient(fadeMs = 1000) {
    if (!_ctx) return;
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

export function setAmbientMood(mood) {
    if (!_ensureCtx() || mood === _currentMood) return;
    const def = AMBIENT_MOODS[mood];
    if (!def) return;

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

export function playMusic(track) {
    if (!_ensureCtx()) return;
    stopMusic(500);

    const now = _ctx.currentTime;
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

try {
    const saved = localStorage.getItem('shoals_audio_volume');
    if (saved != null) _volume = Math.max(0, Math.min(1, parseFloat(saved)));
} catch {}
