/* popup-events.js -- TEMPORARY: evaluator stub during migration.
   Will be deleted in Task 5 when evaluateTriggers moves to EventEngine. */

import { ALL_EVENTS } from './events/index.js';
import { firmCooldownMult } from './faction-standing.js';
import { HISTORY_CAPACITY } from './config.js';

const _cooldowns = {};

export function resetPopupCooldowns() {
    for (const k in _cooldowns) delete _cooldowns[k];
}

function _liveDay(day) {
    return day - HISTORY_CAPACITY;
}

const _triggerPool = ALL_EVENTS.filter(e => typeof e.trigger === 'function');

export function evaluatePortfolioPopups(sim, world, portfolio, day) {
    const triggered = [];
    for (const pp of _triggerPool) {
        if (_cooldowns[pp.id] && day - _cooldowns[pp.id] < pp.cooldown * firmCooldownMult()) continue;
        if (pp.era === 'early' && _liveDay(day) > 500) continue;
        if (pp.era === 'mid'   && (_liveDay(day) < 500 || _liveDay(day) > 800)) continue;
        if (pp.era === 'late'  && _liveDay(day) < 800) continue;
        try {
            if (pp.trigger(sim, world, portfolio)) {
                _cooldowns[pp.id] = day;
                triggered.push(pp);
            }
        } catch (e) { /* guard */ }
    }
    return triggered;
}
