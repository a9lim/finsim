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
