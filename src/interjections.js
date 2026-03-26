/* ===================================================
   interjections.js -- Trader inner monologue system.
   Atmospheric text interjections that appear as styled
   toasts based on market conditions and player state.
   No mechanical effect.

   Leaf module. No DOM access.
   =================================================== */

const _cooldowns = {};
const MIN_COOLDOWN = 50;
let _lastInterjectionDay = -999;

const INTERJECTIONS = [
    {
        id: 'vol_spike',
        text: 'Your hands remember 2008. The vol surface is screaming.',
        condition: (ctx) => Math.sqrt(ctx.sim.v) > Math.sqrt(ctx.sim.theta) * 2.5,
    },
    {
        id: 'sidelines',
        text: 'You\u2019re watching from the sidelines. The desk notices.',
        condition: (ctx) => ctx.portfolio.positions.length === 0 && ctx.liveDay > 100,
    },
    {
        id: 'own_press',
        text: 'You\u2019re starting to believe your own press clippings.',
        condition: (ctx) => {
            const strong = ctx.quarterlyReviews.filter(r => r.rating === 'strong');
            return strong.length >= 3;
        },
    },
    {
        id: 'drawdown_hold',
        text: 'Every fiber says cut it. But you\u2019ve been here before.',
        condition: (ctx) => {
            const equity = ctx.equity;
            const peak = ctx.peakEquity;
            return peak > 0 && (peak - equity) / peak > 0.15;
        },
    },
    {
        id: 'quiet_tape',
        text: 'Something feels wrong about this tape. The flow is too clean.',
        condition: (ctx) => ctx.sim.lambda > 3 && Math.sqrt(ctx.sim.v) < 0.15,
    },
    {
        id: 'late_game',
        text: 'Four years. You can feel the weight of every trade.',
        condition: (ctx) => ctx.liveDay > 900 && ctx.impactHistory.length > 5,
    },
    {
        id: 'negative_cash',
        text: 'The margin line is a cliff edge. You can feel the updraft.',
        condition: (ctx) => ctx.portfolio.cash < 0,
    },
    {
        id: 'crisis_profits',
        text: 'Someone is always on the other side of a crisis trade. Today it\u2019s you.',
        condition: (ctx) => {
            return ctx.sim.lambda > 5 && ctx.equity > ctx.portfolio.initialCapital * 1.3;
        },
    },
    {
        id: 'empty_desk',
        text: 'The floor is quiet. Everyone else went home. You\u2019re still watching the screen.',
        condition: (ctx) => ctx.liveDay > 500 && ctx.portfolio.positions.length > 10,
    },
    {
        id: 'rate_negative',
        text: 'Negative rates. The textbooks didn\u2019t prepare you for this.',
        condition: (ctx) => ctx.sim.r < 0,
    },
];

export function checkInterjections(ctx, day) {
    if (day - _lastInterjectionDay < MIN_COOLDOWN) return null;

    for (const ij of INTERJECTIONS) {
        const cd = _cooldowns[ij.id] || 0;
        if (day < cd) continue;
        try {
            if (ij.condition(ctx)) {
                _cooldowns[ij.id] = day + (ij.cooldown || 150);
                _lastInterjectionDay = day;
                return ij.text;
            }
        } catch { continue; }
    }
    return null;
}

export function resetInterjections() {
    for (const k in _cooldowns) delete _cooldowns[k];
    _lastInterjectionDay = -999;
}
