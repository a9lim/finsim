/* index.js -- Event pool registry. Merges all domain event arrays,
   provides by-id lookup, and validates followup chain integrity. */

export { PARAM_RANGES } from './param-ranges.js';

import { FED_EVENTS } from './fed.js';
import { MACRO_EVENTS } from './macro.js';
import { PNTH_EVENTS } from './pnth.js';
import { CONGRESS_EVENTS } from './congress.js';
import { INVESTIGATION_EVENTS } from './investigation.js';
import { MEDIA_EVENTS } from './media.js';
import { MARKET_EVENTS } from './market.js';
import { FIRM_EVENTS } from './firm.js';
import { TIP_EVENTS } from './tips.js';
import { INTERJECTION_EVENTS } from './interjections.js';
import { TRAIT_EVENTS } from './traits.js';

export const ALL_EVENTS = [
    ...FED_EVENTS,
    ...MACRO_EVENTS,
    ...PNTH_EVENTS,
    ...CONGRESS_EVENTS,
    ...INVESTIGATION_EVENTS,
    ...MEDIA_EVENTS,
    ...MARKET_EVENTS,
    ...FIRM_EVENTS,
    ...TIP_EVENTS,
    ...INTERJECTION_EVENTS,
    ...TRAIT_EVENTS,
];

// -- Event-by-id lookup --
let _eventById = null;

export function getEventById(id) {
    if (!_eventById) {
        _eventById = new Map();
        for (const ev of ALL_EVENTS) _eventById.set(ev.id, ev);
    }
    return _eventById.get(id) || null;
}

// -- Startup validation: followup chain integrity --
const _referencedFollowupIds = new Set();
for (const ev of ALL_EVENTS) {
    if (ev.followups) {
        for (const fu of ev.followups) _referencedFollowupIds.add(fu.id);
    }
}
for (const id of _referencedFollowupIds) {
    const ev = getEventById(id);
    if (!ev) console.warn(`[events] followup references unknown event: '${id}'`);
    else if (!ev.followupOnly && ev.likelihood === 0) console.warn(`[events] followup target '${id}' missing followupOnly flag`);
}
for (const ev of ALL_EVENTS) {
    if (ev.followupOnly && !_referencedFollowupIds.has(ev.id)) {
        console.warn(`[events] '${ev.id}' has followupOnly but is never referenced as a followup`);
    }
}
