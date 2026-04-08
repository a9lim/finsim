/* ===================================================
   endings.js -- Terminal condition evaluation and 5-page
   adaptive epilogue generation. Replaces epilogue.js.

   Pure function. No side effects, no DOM access.
   =================================================== */

import { computePositionValue } from './position-value.js';
import { INITIAL_CAPITAL, HISTORY_CAPACITY, TERM_END_DAY } from './config.js';
import { getFactionState, getFaction } from './faction-standing.js';
import { getActiveTraitIds, getTrait } from './traits.js';

// -- HTML helpers -------------------------------------------------------------

function _p(text) { return `<p>${text}</p>`; }
function _h3(text) { return `<h3>${text}</h3>`; }

function _statSection(title, rows) {
    let html = `<div class="stat-group"><div class="group-label">${title}</div>`;
    for (const [label, value] of rows) {
        html += `<div class="stat-row"><span>${label}</span><span class="stat-value">${value}</span></div>`;
    }
    html += '</div>';
    return html;
}

// -- Formatting helpers -------------------------------------------------------

function _dollar(n) {
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _pct(n) {
    const sign = n > 0 ? '+' : '';
    return sign + (n * 100).toFixed(1) + '%';
}

function _pctAbs(n) {
    return (n * 100).toFixed(1) + '%';
}

// -- Equity helper ------------------------------------------------------------

function _computeEquity(portfolio, sim) {
    let equity = portfolio.cash;
    for (const pos of portfolio.positions) {
        equity += computePositionValue(pos, sim.S, Math.sqrt(sim.v), sim.r, sim.day, sim.q);
    }
    return equity;
}

// =============================================================================
// Terminal condition evaluation
// =============================================================================

/**
 * Check if any ending condition is met. Priority-ordered: first match fires.
 * @param {Object} sim - simulation state
 * @param {Object} portfolio - portfolio singleton
 * @param {Object} world - world state (may be null)
 * @param {Object} playerChoices - player choices object
 * @returns {string|null} ending ID or null
 */
export function checkEndings(sim, portfolio, world, playerChoices = {}) {
    const f = getFactionState();
    const equity = _computeEquity(portfolio, sim);

    // 1. Criminal Indictment
    if (f.regulatoryExposure >= 95 && playerChoices.liedInTestimony) {
        return 'criminal_indictment';
    }

    // 2. Margin Call Liquidation
    if (equity <= 0) {
        return 'margin_call_liquidation';
    }

    // 3. Firm Collapse
    const firmCollapseConditions = f.firmStanding < 15 &&
        f.regulatoryExposure > 60 &&
        (world?.investigations?.okaforProbeStage >= 1 ||
         world?.media?.leakCount >= 2);
    if (firmCollapseConditions) {
        return 'firm_collapse';
    }

    // 4. Forced Resignation
    if (f.firmStanding <= 0) {
        return 'forced_resignation';
    }

    // 5. Whistleblower
    if (f.regulatoryExposure > 75 && playerChoices.cooperating) {
        return 'whistleblower';
    }

    // 6. Term Ends
    if (sim.day >= TERM_END_DAY) {
        return 'term_ends';
    }

    return null;
}

// =============================================================================
// Epilogue generation
// =============================================================================

const _ENDING_NAMES = {
    criminal_indictment: 'Criminal Indictment',
    margin_call_liquidation: 'Margin Call Liquidation',
    firm_collapse: 'Firm Collapse',
    forced_resignation: 'Forced Resignation',
    whistleblower: 'Whistleblower',
    term_ends: 'Term Ends',
};

/**
 * Generate a 5-page adaptive epilogue.
 * @returns {Array<{title: string, body: string}>}
 */
export function generateEnding(endingId, world, sim, portfolio, eventLog, playerChoices = {}, impactHistory = [], quarterlyReviews = []) {
    const factionState = getFactionState();
    const traitIds = getActiveTraitIds();
    const premature = endingId !== 'term_ends';

    return [
        _pageElection(world, playerChoices, premature, endingId),
        _pagePNTH(world, playerChoices, premature),
        _pageWorld(world, sim, impactHistory, premature),
        _pageMeridian(endingId, sim, portfolio, factionState, quarterlyReviews, playerChoices),
        _pageLegacy(endingId, sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews, traitIds, factionState),
    ];
}

// -- Page 1: The Election & Columbia's Direction ------------------------------

function _pageElection(world, playerChoices, premature, endingId) {
    let body = '';

    if (premature) {
        // Compressed version for early endings
        body += _p('Your story at Meridian ended before the presidential term did. The nation continued without you.');

        if (endingId === 'criminal_indictment') {
            body += _p('By the time the election arrived, your name had become a footnote in a larger story about Columbian finance. Prosecutors cited your case in stump speeches. Reform candidates used your mugshot in campaign ads. You watched the returns from a place where the channels were chosen for you.');
        } else if (endingId === 'whistleblower') {
            body += _p('Your testimony reshaped the campaign. Both parties claimed your revelations as evidence for their platform. The Federalists pointed to your cooperation as proof the system worked. The Farmer-Labor caucus pointed to the crimes you described as proof it didn\'t.');
        }

        // Brief election summary if world state available
        const result = world?.election?.presidentialResult;
        if (result === 'barron_wins_comfortably' || result === 'barron_wins_narrowly') {
            body += _p('Barron won re-election. Whether he deserved to was a question the country would spend four more years debating.');
        } else if (result === 'okafor_wins' || result === 'okafor_wins_decisively') {
            body += _p('Okafor swept into office on a mandate for accountability. The trading floors grew quieter the day she was inaugurated.');
        } else if (result === 'barron_removed') {
            body += _p('Barron did not survive his term. The Senate voted for removal. The country exhaled.');
        } else if (result === 'fl_wins' || result === 'fl_wins_decisively') {
            body += _p('The Farmer-Labor Party recaptured the presidency. The era of Barron was over.');
        }

        // Big Bill
        if (world?.congress?.bigBillStatus === 3) {
            body += _p('The Big Beautiful Bill became law. Lassiter called it generational. Markets called it priced in.');
        } else if (world?.congress?.bigBillStatus === 4) {
            body += _p('The Big Beautiful Bill died on the Senate floor. Whitfield\'s filibuster held.');
        }

        return { title: 'The Election', body };
    }

    // Full version -- adapted from epilogue.js
    const result = world?.election?.presidentialResult;
    const mid = world?.election?.midtermResult;
    const okafor = world?.election?.okaforRunning;
    const imp = world?.investigations?.impeachmentStage || 0;
    const geo = world?.geopolitical || {};
    const fed = world?.fed || {};

    // Midterm recap
    if (mid === 'fed_gain') {
        body += _p('The midterm elections two years prior had been a triumph for the Federalist Party. Barron\'s coalition held firm, expanding their margins in both chambers and silencing early talk of a lame-duck presidency. Pundits declared the era of Barron politics firmly entrenched.');
    } else if (mid === 'fed_loss_both') {
        body += _p('The midterm elections had been devastating for Barron. The Farmer-Labor wave swept through suburban districts that had once been Federalist strongholds, flipping the House and narrowing the Senate margin to a knife\'s edge. For the first time, the word "impeachment" was spoken aloud in the Capitol corridors.');
    } else if (mid === 'fed_loss_house') {
        body += _p('The midterms had produced a Congress as divided as the country itself. The Federalists clung to the Senate while Farmer-Labor claimed a narrow House majority. Gridlock became the governing philosophy, and every piece of legislation required horse-trading that left both sides exhausted.');
    } else if (mid === 'fed_hold') {
        body += _p('The midterms had changed little, preserving the status quo in Washington. Neither party could claim a mandate, and governing lurched forward on inertia and executive orders.');
    }

    // Big Beautiful Bill
    if (world?.congress?.bigBillStatus === 3) {
        body += _p('The Big Beautiful Bill \u2014 Barron\'s signature legislation \u2014 became law after Tao broke the filibuster. Lassiter called it "the most consequential economic reform in a generation." Haines voted yes in the end, but her hesitation cost Barron three months of momentum.');
    } else if (world?.congress?.bigBillStatus === 4) {
        body += _p('The Big Beautiful Bill died on the Senate floor. Whitfield\'s filibuster held. Haines crossed the aisle. Barron never forgave her, and the Federalist base never forgave Congress.');
    }

    // Media framing
    if (world?.media?.sentinelRating >= 7 && world?.media?.tanCredibility <= 4) {
        body += _p('Cole\'s Sentinel framed the election as a referendum on Columbian strength. Without The Continental\'s investigative counterweight, the narrative held.');
    } else if (world?.media?.tanCredibility >= 7) {
        body += _p('Tan\'s Continental investigations defined the campaign\'s final weeks. Cole fought back on The Sentinel, but the documents spoke for themselves.');
    }

    // Election result
    switch (result) {
        case 'barron_removed':
            body += _p('In the end, John Barron did not make it to Election Day. The Senate vote came at 9:47 PM on a Thursday, with three Federalist senators crossing the aisle to deliver the two-thirds majority needed for removal.');
            body += _p('The trial had consumed Washington for eleven weeks. Senator Okafor\'s investigation had laid the groundwork, but it was Rachel Tan\'s final series in The Continental\u2014the one that connected the defense contracts directly to Vice President Bowman\'s offshore accounts\u2014that broke the dam.');
            if (okafor) {
                body += _p('Senator Okafor, the woman whose investigations had brought down the presidency, ran on a platform of institutional restoration. Voters who were exhausted by chaos found her steady demeanor irresistible.');
            } else {
                body += _p('The Farmer-Labor Party nominated their own fresh face, and the general election became a referendum on normalcy.');
            }
            break;

        case 'barron_wins_comfortably':
            body += _p('John Barron won re-election on the first Tuesday of November, and he won decisively. The networks called it before midnight Eastern.');
            body += _p('The victory was built on a foundation that his critics never understood. The economy, for all its turbulence, had delivered gains that working families could feel.');
            if (geo.tradeWarStage === 4) {
                body += _p('The trade deal with Serica, announced three months before the election, gave Barron the closing argument he needed.');
            }
            if (okafor) {
                body += _p('Senator Okafor ran a disciplined campaign, but she could never escape the perception that her candidacy was built on investigation rather than vision.');
            }
            body += _p('Barron\'s second inaugural address was characteristically defiant, promising an accelerated agenda that made even his allies nervous.');
            break;

        case 'barron_wins_narrowly':
            body += _p('The election was not decided on election night. It took eleven days of counting, recounting, and legal challenges in three states before John Barron was declared the winner.');
            if (okafor) {
                body += _p('Senator Patricia Okafor had come closer than anyone thought possible. Her campaign, launched on the back of the Palanthropic investigations, had turned the election into a referendum on accountability.');
            }
            if (imp >= 2) {
                body += _p('The shadow of the impeachment proceedings hung over everything. Barron\'s legal team had successfully delayed the Senate trial past the election.');
            }
            body += _p('The narrow victory left Barron with something he had never possessed and never wanted: a mandate for caution.');
            break;

        case 'okafor_wins':
            body += _p('Senator Patricia Okafor made history on election night, becoming the first woman and first Black woman elected President of the United States.');
            body += _p('The turning point was not a single moment but an accumulation of them. The Palanthropic hearings had given Okafor a national profile. The midterms had given her a platform.');
            if (geo.recessionDeclared) {
                body += _p('The recession, declared six months before the election, sealed Barron\'s fate.');
            }
            if (fed.hartleyFired) {
                body += _p('Barron\'s firing of Fed Chair Hartley came back to haunt him. Okafor\'s campaign ad\u2014just Hartley\'s face, the date she was fired, and the unemployment rate six months later\u2014ran in heavy rotation through October.');
            }
            body += _p('In her victory speech, Okafor promised accountability for Palanthropic, restoration of Fed independence, and "a foreign policy that doesn\'t start wars to win news cycles."');
            break;

        case 'okafor_wins_decisively':
            body += _p('It wasn\'t even close by midnight. Senator Patricia Okafor carried every swing state, several by double digits.');
            body += _p('The landslide had been building for months. Barron\'s approval, battered by scandal, war, and economic anxiety, had settled into the low thirties.');
            if (geo.recessionDeclared) {
                body += _p('The recession provided the economic backdrop that made the result inevitable.');
            }
            body += _p('Barron blamed "rigged systems" and "corrupt media" in a pre-recorded video posted at midnight. America had moved on before the video finished buffering.');
            break;

        case 'fl_wins':
            body += _p('The Farmer-Labor Party recaptured the presidency on a platform of exhaustion. Their candidate ran the kind of campaign that pundits call "disciplined" and voters call "fine." After four years of John Barron, "fine" was exactly what the electorate was looking for.');
            body += _p('Barron\'s defeat was not a landslide but a firm rebuke. The swing states fell one by one through the evening.');
            break;

        case 'fl_wins_decisively':
            body += _p('The Farmer-Labor wave was even larger than the exit polls predicted. Their candidate carried thirty-one states, claimed a mandate that transcended ideology.');
            if (imp >= 2) {
                body += _p('The impeachment proceedings, even though they had not resulted in removal, had shattered the myth of Barron\'s invincibility.');
            }
            body += _p('Barron\'s election night speech, delivered to a half-empty ballroom, would become one of the defining images of his presidency.');
            break;

        default:
            body += _p('The presidential term drew to a close. The nation looked ahead to what came next, carrying the scars and lessons of the past four years.');
            break;
    }

    // Player fingerprints
    if (playerChoices.cooperated_sec) {
        body += _p('When the SEC came calling, the trader at Meridian cooperated \u2014 Bowman\u2019s lawyers would later call them \u201cthe one who opened the door.\u201d');
    } else if (playerChoices.silent_sec) {
        body += _p('The Meridian desk said nothing when the SEC knocked. In the end, it didn\u2019t matter \u2014 they had enough without them.');
    }
    if (playerChoices.donated_barron) {
        body += _p('Campaign finance records would later show a donation from a Meridian Capital executive to the Federalist Party.');
    } else if (playerChoices.donated_fl) {
        body += _p('A quiet donation to the Farmer-Labor campaign would surface in post-election filings.');
    }

    return { title: 'The Election', body };
}

// -- Page 2: PNTH & Corporate America ----------------------------------------

function _pagePNTH(world, playerChoices, premature) {
    const p = world?.pnth || {};
    const inv = world?.investigations || {};
    let body = '';

    if (premature) {
        // Compressed summary
        if (p.acquired) {
            body += _p('Palanthropic was acquired before you could see how the story ended. The name survived. The mission didn\'t.');
        } else if (p.dojSuitFiled && p.whistleblowerFiled) {
            body += _p('Palanthropic was engulfed in scandal. The DOJ suit, the whistleblower, and Okafor\'s investigation converged into a perfect storm.');
        } else if (p.gottliebStartedRival) {
            body += _p('Gottlieb left to found Covenant AI. The schism split the industry along ethical lines.');
        } else if (p.ceoIsGottlieb) {
            body += _p('Gottlieb\'s commercial pivot was underway. Whether it would succeed was a question you wouldn\'t be around to answer.');
        } else if (!p.ceoIsGottlieb && (p.boardDirks || 0) >= 7) {
            body += _p('Dirks\'s defense-first Palanthropic was printing money. The engineers who cared about alignment had already left.');
        } else {
            body += _p('The Gottlieb-Dirks detente held, but insiders said it was only a matter of time.');
        }

        // Products
        if (p.aegisDeployed && (p.aegisControversy || 0) >= 3) {
            body += _p('Atlas Aegis was grounded after the Operation Dustwalker casualty reports.');
        }
        if (p.companionLaunched && (p.companionScandal || 0) >= 3) {
            body += _p('Atlas Companion\'s privacy catastrophe was the biggest class-action in tech history.');
        }

        return { title: 'PNTH & Corporate America', body };
    }

    // Full version -- adapted from epilogue.js
    if (p.acquired) {
        body += _h3('Under New Management');
        body += _p('In the end, Palanthropic did not die or triumph. It was absorbed. The acquisition, announced on a Sunday evening to minimize market reaction, was the largest in tech history.');
        body += _p('The name Palanthropic still appeared on the building, but the lobby had been redecorated and the mission statement quietly updated. The Atlas AI platform now served clients on six continents with no particular regard for their form of government.');
        if (p.gottliebStartedRival) {
            body += _p('Eugene Gottlieb watched from across the bay. His new company, Covenant AI, had become a refuge for engineers who couldn\'t stomach the new Palanthropic.');
        } else if (p.ceoIsGottlieb) {
            body += _p('Gottlieb received his payout and retreated from public life. Friends said he was writing a book.');
        } else {
            body += _p('Gottlieb released a statement calling the deal "the final betrayal of everything Palanthropic was meant to be." It trended for six hours.');
        }

    } else if (p.dojSuitFiled && p.whistleblowerFiled && p.senateProbeLaunched) {
        body += _h3('The Reckoning');
        body += _p('What was once the most promising AI company in America was now a cautionary tale. The DOJ antitrust suit, the whistleblower complaint, and Senator Okafor\'s investigation had converged into a perfect storm. Palanthropic\'s stock had lost eighty percent of its value from peak to trough.');
        body += _p('The consent decree was brutal. An independent monitor was installed. The military contracts were suspended pending review. Andrea Dirks was photographed leaving a federal courthouse in a navy suit and an expression that betrayed nothing.');
        if (p.ceoIsGottlieb) {
            body += _p('Gottlieb, remarkably, had survived. His early opposition to the military contracts now looked like prescience.');
        } else {
            body += _p('The board brought in an outside CEO. Gottlieb was offered an advisory role and declined.');
        }

    } else if (p.gottliebStartedRival) {
        body += _h3('The Schism');
        body += _p('The AI industry had split along ethical lines. On one side: Palanthropic under Dirks, its Atlas platform powering military operations. On the other: Covenant AI, Gottlieb\'s defiant response.');
        body += _p('The rivalry had become personal. Dirks called Covenant "a vanity project." Gottlieb called Palanthropic "a weapons manufacturer that happened to use neural networks."');
        body += _p('Covenant AI attracted a disproportionate share of top researchers. Their commercial product was gaining traction. Revenue was still a fraction of Palanthropic\'s. But the trajectory lines were converging.');

    } else if (p.ceoIsGottlieb && (p.boardGottlieb || 0) >= 6) {
        body += _h3('The Pivot');
        body += _p('Gottlieb proved the skeptics wrong. It took two years of boardroom battles, but when the dust settled, Palanthropic was his.');
        body += _p('The pivot to enterprise AI was not glamorous. Instead of drone strikes, there were hospital systems running Atlas for diagnostic support. Financial institutions using it for risk modeling. The revenue grew slowly at first, then with compound acceleration.');
        body += _p('Dirks departed with a severance package and a non-compete. She was last seen consulting for defense contractors.');

    } else if (!p.ceoIsGottlieb && (p.boardDirks || 0) >= 7) {
        body += _h3('The Contractor');
        body += _p('Dirks had won, but the company Gottlieb built was unrecognizable. The visitor badges now required security clearance. The cafeteria conversations were conducted in careful whispers.');
        body += _p('The defense contracts had made Palanthropic enormously profitable. Atlas powered surveillance networks, predictive policing systems, and autonomous weapons platforms. Wall Street loved it.');
        body += _p('Gottlieb\'s farewell email, leaked within hours, ended with: "Build something you can explain to your children."');

    } else {
        body += _h3('The Detente');
        body += _p('The Gottlieb-Dirks detente held, but insiders said it was only a matter of time. The board remained split, neither faction commanding the votes for a decisive move.');
        body += _p('The company ran in two directions at once: commercial division building enterprise tools, defense division fulfilling government contracts. Industry analysts called it "the most dysfunctional company in tech that still makes money."');
    }

    // Atlas products
    if (p.aegisDeployed) {
        if ((p.aegisControversy || 0) >= 3) {
            body += _p('Atlas Aegis was grounded by executive order after the Operation Dustwalker casualty reports. Kassis\'s leaked decision logs made continued deployment politically impossible.');
        } else if ((p.aegisControversy || 0) >= 1) {
            body += _p('Atlas Aegis remained operational in the Farsistan theater, a quiet engine of Pentagon funding and boardroom power for Dirks\'s faction.');
        }
    }
    if (p.companionLaunched) {
        if ((p.companionScandal || 0) >= 3) {
            body += _p('Atlas Companion\'s 200 million users learned their conversations had been accessible to Farsistani intelligence. The class-action lawsuit was the largest in tech history.');
        } else if ((p.companionScandal || 0) >= 1) {
            body += _p('Atlas Companion reshaped daily life for hundreds of millions. The "AI boyfriend" headlines faded. The revenue didn\'t.');
        }
    }

    // Board fight
    if ((p.boardDirks || 0) > (p.boardGottlieb || 0)) {
        body += _p('Zhen cast the deciding vote for Dirks. Malhotra switched sides after seeing the quarterly numbers.');
    } else if ((p.boardGottlieb || 0) > (p.boardDirks || 0)) {
        body += _p('Zhen sided with Gottlieb in the end. "The company needs a conscience," he told the board.');
    }

    // Player involvement
    if (playerChoices.okafor_cooperated || playerChoices.met_okafor_aide || playerChoices.gave_interview) {
        body += _p('The Okafor hearings produced one memorable witness \u2014 a Meridian derivatives trader whose testimony helped unravel the Bowman connection.');
    } else if (playerChoices.okafor_distanced) {
        body += _p('When subpoenas flew, one trader at Meridian kept their head down and their records clean.');
    }

    return { title: 'PNTH & Corporate America', body };
}

// -- Page 3: The World --------------------------------------------------------

function _pageWorld(world, sim, impactHistory, premature) {
    const geo = world?.geopolitical || {};
    const fed = world?.fed || {};
    let body = '';

    if (premature) {
        // Compressed geopolitical summary
        if (geo.recessionDeclared) {
            body += _p('The recession arrived with the inevitability of gravity. The human cost \u2014 layoffs, foreclosures, the particular despair of watching savings evaporate \u2014 was felt long after the technical definition was met.');
        }
        if (geo.straitClosed) {
            body += _p('The Strait of Hormuz remained closed. Al-Farhan reshaped Middle Eastern power dynamics for a generation.');
        }
        if ((geo.tradeWarStage || 0) >= 3) {
            body += _p('The tech decoupling with Serica was complete and permanent.');
        }
        if (fed.hartleyFired) {
            body += _p('Hartley\'s firing was the constitutional crisis that wasn\'t. The Fed\'s independence was the real casualty.');
        } else {
            body += _p('Hartley served her full term, her independence intact. It cost her.');
        }
        return { title: 'The World', body };
    }

    // Full version -- adapted from epilogue.js

    // Trade / Serica
    if ((geo.tradeWarStage || 0) > 0) {
        body += _h3('Trade &amp; Serica');
        if (geo.tradeWarStage >= 4) {
            body += _p('The framework deal was, depending on who you asked, either Barron\'s crowning achievement or the most expensive photo opportunity in American economic history. The tariffs came down. The retaliatory measures were unwound. The cost of the detour was a number both sides preferred not to calculate.');
            if ((geo.sericaRelations || 0) > 0) {
                body += _p('Relations between Washington and Serica settled into something approaching warmth, or at least the absence of active hostility.');
            }
        } else if (geo.tradeWarStage >= 3) {
            body += _p('The tech decoupling was complete and permanent. American and Serican technology ecosystems now operated in parallel universes. Liang Wei\'s Zhaowei Technologies thrived in the bifurcated landscape.');
        } else if (geo.tradeWarStage >= 2) {
            body += _p('The trade war had settled into a grinding stalemate. Tariffs remained in place on both sides. Neither could claim victory. Both could claim enormous costs.');
        } else {
            body += _p('The initial tariffs caused a brief panic, but the anticipated escalation never fully materialized. The tariffs remained, a low-grade economic fever.');
        }
    }

    // Middle East
    if ((geo.mideastEscalation || 0) > 0) {
        body += _h3('The Middle East');
        if (geo.mideastEscalation >= 3) {
            body += _p('What began as "targeted strikes" escalated into something that looked like an occupation. Casualties mounted. The oil markets went haywire.');
        } else if (geo.mideastEscalation >= 2) {
            body += _p('The military engagement expanded beyond its original mandate, as such engagements invariably do. The "limited strikes" gave way to a sustained air campaign, then advisors on the ground.');
        } else {
            body += _p('The strikes were brief and, by the Pentagon\'s accounting, successful. Whether the intervention achieved anything lasting was a question that would take years to answer.');
        }
    }

    // Khasuria
    const khasuria = geo.khasurianCrisis || 0;
    if (khasuria >= 3) {
        body += _h3('Khasuria');
        body += _p('Volkov\'s forces never withdrew from the border territories. The Khasurian Border Accord was dead. The new status quo \u2014 armed occupation dressed in diplomatic language \u2014 would outlast the Barron presidency.');
    } else if (khasuria >= 2) {
        body += _h3('Khasuria');
        body += _p('The Khasurian border crisis subsided without resolution. Volkov withdrew his armored divisions but left intelligence assets in place.');
    } else if (khasuria >= 1) {
        body += _h3('Khasuria');
        body += _p('Volkov tested the border and found Barron\'s red line credible \u2014 or at least unpredictable enough to respect.');
    }

    // Strait
    if (geo.straitClosed) {
        body += _p('The Strait of Hormuz remained closed. Al-Farhan extracted concessions that reshaped Middle Eastern power dynamics for a generation.');
    } else if ((geo.farsistanEscalation || 0) >= 2) {
        body += _p('Al-Farhan\'s Strait of Hormuz brinkmanship ended in a back-channel deal. Bowman\'s one genuine diplomatic achievement.');
    }

    // Serica relations
    if ((geo.sericaRelations || 0) >= 1) {
        body += _p('The Transpacific Commerce Framework held. Liang Wei and Barron traded insults publicly and concessions privately.');
    } else if ((geo.sericaRelations || 0) <= -2) {
        body += _p('Decoupling from Serica became permanent. Zhaowei chips vanished from Columbian supply chains. The semiconductor cold war had begun.');
    }

    // The Fed
    body += _h3('The Federal Reserve');
    if (fed.hartleyFired) {
        if (fed.vaneAppointed) {
            body += _p('Hayden Hartley\'s firing was the constitutional crisis that wasn\'t. Marcus Vane, her replacement, delivered the rate cuts Barron wanted within his first three meetings.');
            if ((fed.credibilityScore || 5) <= 3) {
                body += _p('The Vane Fed did as it was told, and the consequences were exactly what Hartley had warned about. The dollar weakened. Foreign central banks diversified their reserves.');
            } else {
                body += _p('The Vane Fed maintained more independence than the doomsayers predicted. The dollar held. Inflation remained manageable. It was merely diminishment.');
            }
        } else {
            body += _p('Hartley was fired, but her replacement was never confirmed. The Fed operated under acting leadership \u2014 technically functional, institutionally wounded.');
        }
    } else {
        body += _p('Hayden Hartley served her full term, her independence intact. It cost her \u2014 the public attacks, the private pressure, the isolation. But the Fed maintained its credibility.');
        if ((fed.credibilityScore || 5) >= 7) {
            body += _p('History would judge Hartley kindly. She emerged as one of the few officials who navigated the Barron years without compromising her institutional mandate.');
        } else {
            body += _p('But surviving was not the same as thriving. The constant political pressure left its mark on the institution.');
        }
    }

    // The Economy
    body += _h3('The Economy');
    const rate = sim.r;
    const vol = Math.sqrt(sim.v);

    if (geo.recessionDeclared) {
        body += _p('The recession, when it finally arrived, surprised no one and devastated everyone.');
        if (geo.oilCrisis) {
            body += _p('The oil crisis made everything worse. Energy prices spiked to levels that functioned as a tax on every economic activity.');
        }
    } else if (vol > 0.3) {
        body += _p('The economy avoided a formal recession, but the word "avoided" did heavy lifting. Volatility remained elevated, the kind of persistent uncertainty that prevents an economy from thriving.');
    } else if (rate > 0.06) {
        body += _p('The high-rate environment reshaped the economic landscape. Mortgages were expensive. Startups contracted. But savers earned returns they hadn\'t seen in a generation.');
    } else if (rate < 0.01) {
        body += _p('Rates had fallen to levels that made central bankers nervous. The near-zero environment had become the new normal. The Fed\'s toolkit was empty.');
    } else {
        body += _p('Four years of whiplash had left the economy in a place that defied easy characterization. The headline numbers were respectable. But the averages concealed enormous divergence.');
    }

    // Trading footprint
    if (impactHistory.length > 0) {
        const netDirection = impactHistory.reduce((sum, h) => sum + h.direction, 0);
        if (netDirection < -2) {
            body += _p('Analysts would later point to sustained institutional selling pressure that accelerated the inevitable.');
        } else if (netDirection > 2) {
            body += _p('Some believers held through the storm, their conviction rewarded \u2014 or punished.');
        }
    }

    return { title: 'The World', body };
}

// -- Page 4: Meridian Capital (NEW) -------------------------------------------

function _pageMeridian(endingId, sim, portfolio, factionState, quarterlyReviews, playerChoices) {
    let body = '';
    const firmStanding = factionState.firmStanding;

    // Ending-specific opening
    switch (endingId) {
        case 'criminal_indictment':
            body += _h3('The Arrest');
            body += _p('The SEC agents arrived at 6:47 AM on a Tuesday, before the desk was staffed. Webb watched from the glass conference room as they walked you past the trading floor. Riggs pretended to be on the phone. Vasquez wasn\'t there \u2014 she had been warned, or she had chosen not to watch.');
            body += _p('The indictment named you specifically. The firm was listed as a cooperating entity, which was legalese for "we gave you up to save ourselves." Meridian\'s compliance department produced documentation with a speed that suggested they had been preparing for months.');
            break;

        case 'margin_call_liquidation':
            body += _h3('The Liquidation');
            body += _p('At 2:47 PM, the prime broker began unwinding what sources described as a highly concentrated derivatives portfolio. The cascade was visible on every terminal on the floor \u2014 block after block hitting the tape, each one pushing prices further against the remaining positions.');
            body += _p('Webb pulled the plug before the close. The desk\'s risk system, which had been flashing warnings for days, finally delivered the message that could not be ignored: maintenance margin breached, forced liquidation initiated. The compliance log would later show that the position had been underwater for seventy-two hours before anyone with authority acted.');
            body += _p('Priya Sharma\'s MarketWire reconstruction, published the next morning, would become the definitive account: "Meridian\'s Derivatives Desk: Anatomy of a Blowup."');
            break;

        case 'firm_collapse':
            body += _h3('What Killed Meridian Capital');
            body += _p('The Priya Sharma feature ran on a Sunday. "What Killed Meridian Capital" was 8,000 words and named names. The answer, she argued, was not a single trade or a single trader but a culture that had mistaken recklessness for conviction and proximity to power for competitive advantage.');
            body += _p('The client redemptions started Monday morning. By Wednesday, the prime broker had pulled the credit facility. By Friday, Webb was on the phone with the FDIC. Meridian Capital, founded in the optimism of the previous decade, died in the pragmatism of this one.');
            break;

        case 'forced_resignation':
            body += _h3('The Conversation');
            body += _p('Webb and Vasquez sat you down in the corner office at 4:15 PM, after the close. The conversation lasted eleven minutes. Webb did the talking. Vasquez stared at the table. The terms were not negotiable: immediate separation, accelerated vesting of nothing, a non-disparagement clause that meant you couldn\'t tell your side of the story even if anyone wanted to hear it.');
            body += _p('You cleaned out your desk while the night shift was coming on. The security guard who walked you to the elevator had been there longer than you had. He didn\'t make small talk.');
            break;

        case 'whistleblower':
            body += _h3('The Empty Desk');
            body += _p('Your desk was cleared by security on a Wednesday. The official memo said "personal leave." Everyone on the floor knew what that meant. By Thursday, Riggs had moved his screens to your spot. By Friday, the compliance department had your hard drives.');
            body += _p('The firm\'s statement, released after your cooperation became public, was a masterwork of distancing: "Meridian Capital fully supports the regulatory process and has cooperated with all inquiries." Translation: we don\'t know this person.');
            break;

        case 'term_ends':
            body += _h3('Meridian Capital');
            if (firmStanding >= 80) {
                body += _p('Four years. The desk not only survived the Barron era \u2014 it thrived. Webb\'s quarterly reports to the partners read like a victory lap, and for once, nobody complained about the tone. The derivatives desk became the model other desks measured themselves against.');
                body += _p('Vasquez made partner on the strength of your numbers. She\'d never say it out loud, but the corner office she moved into had your fingerprints all over it. Webb retired to the Hamptons. His farewell email contained exactly one sentence of praise, directed at the risk management system he had built. Nobody mentioned the trader who had made it sing.');
            } else if (firmStanding >= 50) {
                body += _p('Four years. The desk survived, which in the Barron era counted as a win. The P&L was respectable. The compliance record was clean enough. Webb\'s reports to the partners were cautiously optimistic, which was the most enthusiasm anyone had seen from him since the financial crisis.');
                body += _p('Vasquez was promoted to co-head of trading. Riggs was transferred to the Hong Kong office, which was either an opportunity or an exile depending on who you asked. The desk continued. That was enough.');
            } else if (firmStanding >= 25) {
                body += _p('Four years. The desk survived, but barely. Webb\'s quarterly reports grew shorter and more defensive as the term wore on. The partners asked pointed questions about risk allocation, and the answers were never quite satisfying.');
                body += _p('Vasquez\'s career was collateral damage. She\'d gone out on a limb for the derivatives desk, and the limb had cracked. She stayed at Meridian, but the corner office went to someone from fixed income.');
            } else {
                body += _p('Four years. The desk survived, which surprised everyone including the desk. The partners had discussed shutting it down twice \u2014 once after the margin incident, once after the regulatory letter. Both times, someone argued that the sunk cost of rebuilding was worse than the cost of continuing.');
                body += _p('Vasquez submitted her resignation three months before the election. She took a position at a smaller fund where nobody knew her name. Webb\'s warnings, ignored for years, were vindicated in the most painful way possible: he was right, and being right had cost him nothing except the respect of the person he\'d tried to protect.');
            }
            break;
    }

    // Career arc
    if (quarterlyReviews.length > 0) {
        const strongCount = quarterlyReviews.filter(r => r.rating === 'strong').length;
        const poorCount = quarterlyReviews.filter(r => r.rating === 'poor').length;
        if (strongCount > poorCount * 2) {
            body += _p('Quarter after quarter of exceptional returns. The risk committee stopped asking questions and started asking for allocation advice.');
        } else if (poorCount > strongCount) {
            body += _p('A slow descent the risk committee watched with growing unease. Each quarterly review brought tighter limits, pointed questions, the particular humiliation of explaining losses to people who had never placed a trade.');
        } else {
            body += _p('Uneven \u2014 flashes of brilliance interrupted by mediocrity. Some quarters the P&L sang. Others it whispered apologies.');
        }
    }

    // Riggs
    if (firmStanding >= 60) {
        body += _p('Riggs never got the corner office. He told people he didn\'t want it. People are kind enough to pretend they believed him.');
    } else if (firmStanding < 30) {
        body += _p('Riggs got your allocation, your office, and eventually your reputation \u2014 or at least the one the desk remembered. In Meridian\'s retelling, you were the cautionary tale and he was the steady hand. The truth, as always, was more complicated.');
    }

    return { title: 'Meridian Capital', body };
}

// -- Page 5: Your Legacy ------------------------------------------------------

function _pageLegacy(endingId, sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews, traitIds, factionState) {
    const equity = _computeEquity(portfolio, sim);
    const totalPnl = equity - INITIAL_CAPITAL;
    const pnlPct = totalPnl / INITIAL_CAPITAL;

    const peakValue = portfolio.peakValue || equity;
    const maxDrawdown = portfolio.maxDrawdown || 0;
    const totalTrades = portfolio.totalTrades || 0;
    const totalExercises = portfolio.totalExercises || 0;
    const marginCallCount = portfolio.marginCallCount || 0;

    // Rating
    let rating;
    if (pnlPct > 2.0) rating = 'Master of the Universe';
    else if (pnlPct > 1.0) rating = 'Wolf of Wall Street';
    else if (pnlPct > 0.5) rating = 'Seasoned Trader';
    else if (pnlPct > 0) rating = 'Survived';
    else if (pnlPct > -0.5) rating = 'Learning Experience';
    else if (pnlPct > -0.9) rating = 'Blown Up';
    else rating = "Lehman'd";

    let body = '';

    // Whistleblower ending: deposition transcript format
    if (endingId === 'whistleblower') {
        body += _h3('Deposition Transcript (Excerpt)');
        body += _p('<em>Q: State your name and former position for the record.</em>');
        body += _p('<em>A: Senior derivatives trader, Meridian Capital. I was there for the full term.</em>');
        body += _p('<em>Q: And you are cooperating voluntarily?</em>');
        body += _p('<em>A: Define "voluntarily." My lawyer says I am. My career says I had no choice.</em>');

        if (playerChoices.accepted_insider_tip || playerChoices.desk_accepted_tip) {
            body += _p('<em>Q: Let\'s start with the information flow. You received tips?</em>');
            body += _p('<em>A: Everyone on the Street gets tips. The question is what you do with them. I can tell you exactly what I did with mine.</em>');
        }
        if (factionState.regulatoryExposure >= 80) {
            body += _p('<em>Q: Your trading records show a pattern of activity preceding major announcements.</em>');
            body += _p('<em>A: I\'m aware of what my records show. That\'s why I\'m here.</em>');
        }
        body += _p('<em>Q: One last question. Was it worth it?</em>');
        body += _p('<em>A: [Long pause.] Ask me in ten years.</em>');

        body += `<div class="epilogue-rating">${rating}</div>`;
    } else {
        // Standard legacy page
        // Reputation synthesis
        const reputation = _synthesizeReputation(playerChoices, impactHistory, quarterlyReviews, portfolio);
        const reputationLines = {
            insider:    'In the end, they called you <em>The Insider</em> \u2014 someone who always seemed to know just a little too much.',
            principled: 'In the end, they called you <em>The Principled</em> \u2014 proof that you could win without selling your soul.',
            speculator: 'In the end, they called you <em>The Speculator</em> \u2014 a force of nature that moved markets and didn\'t look back.',
            survivor:   'In the end, they called you <em>The Survivor</em> \u2014 steady hands in a storm that broke everyone else.',
            kingmaker:  'In the end, they called you <em>The Kingmaker</em> \u2014 a trader whose choices echoed far beyond the trading floor.',
            ghost:      'In the end, no one called you anything at all. One trader at Meridian made a fortune and left no fingerprints.',
        };
        body += `<div class="epilogue-rating">${reputationLines[reputation] || reputationLines.ghost}</div>`;

        // Signature moment
        if (impactHistory.length > 0) {
            const biggest = impactHistory.reduce((a, b) => Math.abs(a.magnitude) > Math.abs(b.magnitude) ? a : b);
            const dayLabel = biggest.day - HISTORY_CAPACITY;
            const direction = biggest.direction > 0 ? 'buying' : 'selling';
            body += _p(`On day ${dayLabel}, a burst of institutional ${direction} pressure preceded what came next. The compliance logs would show a single desk, a single trader, and a position size that made the back office call upstairs.`);
        }

        // -- Player choice echoes -------------------------------------------------

        // Compliance stance
        if (playerChoices.cooperated_with_compliance || playerChoices.filed_fomc_docs) {
            body += _p('Your compliance record was immaculate \u2014 every filing on time, every flag addressed. It was the kind of paper trail that made lawyers smile and regulators nod.');
        } else if (playerChoices.lawyered_up || playerChoices.lawyered_up_unusual || playerChoices.stonewalled_sec) {
            body += _p('You lawyered up every time compliance knocked. The firm\u2019s general counsel had your outside attorney on speed dial. Whether this was prudence or paranoia depended on who you asked.');
        }

        // Trading style
        if (playerChoices.doubled_down_short || playerChoices.comeback_aggressive || playerChoices.owned_tape_presence) {
            body += _p('You traded with the kind of conviction that made other desks nervous. When the market moved against you, you didn\u2019t flinch \u2014 you added.');
        } else if (playerChoices.comeback_disciplined || playerChoices.covered_losing_short || playerChoices.comeback_cautious) {
            body += _p('You learned when to hold and when to fold. The market tested you and you adapted. Not glamorous. Effective.');
        }

        // Political engagement
        if (playerChoices.attended_political_dinner || playerChoices.attended_fundraiser) {
            body += _p('Your name appeared on donor lists and fundraiser RSVPs. The line between trading and politicking had blurred \u2014 whether intentionally or not was a question only you could answer.');
        }

        // Information edge
        if (playerChoices.pursued_insider_tip || playerChoices.pursued_pnth_tip) {
            body += _p('There were conversations that, in retrospect, you probably shouldn\u2019t have had. Tips received, tips acted upon. The compliance logs told one story; the P&L told another.');
        } else if (playerChoices.declined_analyst_color) {
            body += _p('When the sellside called with color, you hung up. When the tips came, you deleted them. Your edge was in the math, not the whisper network.');
        }

        body += `<div class="epilogue-rating">${rating}</div>`;
    }

    // Trait summary
    const traitNames = {
        information_edge: 'Information Is Everything',
        market_always_right: 'The Market Is Always Right',
        contrarian_instinct: 'Contrarian Instinct',
        desk_protects: 'The Desk Protects Its Own',
        master_of_leverage: 'Master of Leverage',
        political_operator: 'Political Operator',
        ghost_protocol: 'Ghost Protocol',
        volatility_addict: 'Volatility Addict',
        media_darling: 'Media Darling',
        washington_insider: 'Washington Insider',
        risk_manager: 'Risk Manager',
        crisis_profiteer: 'Crisis Profiteer',
        market_mover: 'Market Mover',
        political_player: 'Political Player',
        media_figure: 'Media Figure',
        under_scrutiny: 'Under Scrutiny',
        meridian_star: 'Meridian Star',
        quiet_money: 'Quiet Money',
    };

    const permanentTraits = traitIds.filter(id => {
        const t = getTrait(id);
        return t && t.permanent;
    });
    const dynamicTraits = traitIds.filter(id => {
        const t = getTrait(id);
        return t && !t.permanent;
    });

    if (permanentTraits.length > 0) {
        const names = permanentTraits.map(id => traitNames[id] || id).join(', ');
        body += _h3('Trading Philosophy');
        body += _p('Over four years, certain convictions crystallized into permanent fixtures of your trading mind: ' + names + '.');

        if (traitIds.includes('washington_insider')) {
            body += _p('After Meridian, you joined the revolving door. K Street welcomed you. Lassiter\'s former chief of staff made the introduction.');
        }
        if (traitIds.includes('crisis_profiteer')) {
            body += _p('The SEC investigation followed you into retirement. The trades were legal, if unsavory. Tan wrote about them. Cole defended you on The Sentinel.');
        }
        if (traitIds.includes('media_darling')) {
            body += _p('Sharma profiled you in MarketWire\'s "Traders Who Shaped the Barron Era" series. Cole invited you on The Sentinel.');
        }
        if (traitIds.includes('risk_manager')) {
            body += _p('Meridian\'s compliance department gave you the highest exit rating in desk history. The SEC examiner called your book "the cleanest I\'ve seen in twenty years."');
        }
    }

    if (dynamicTraits.length > 0) {
        const names = dynamicTraits.map(id => traitNames[id] || id).join(', ');
        body += _h3('Your Reputation');
        body += _p('By the end, the Street knew you as: ' + names + '.');
    }

    // Faction summary
    body += _h3('Final Standing');
    const factionLabels = {
        firmStanding: 'Meridian Capital',
        regulatoryExposure: 'Regulatory Exposure',
        federalistSupport: 'Federalist Party',
        farmerLaborSupport: 'Farmer-Labor',
        mediaTrust: 'The Press',
        fedRelations: 'The Fed',
    };
    let factionHtml = '<div class="stat-group"><div class="group-label">Faction Scores</div>';
    for (const [key, label] of Object.entries(factionLabels)) {
        const val = factionState[key] || 0;
        factionHtml += `<div class="stat-row"><span>${label}</span><span class="stat-value">${val}/100</span></div>`;
    }
    factionHtml += '</div>';
    body += factionHtml;

    // Regulatory aftermath
    if (factionState.regulatoryExposure >= 50) {
        if (factionState.settled) {
            body += _p('The SEC enforcement action cast a long shadow. The settlement closed the investigation but not the whispers.');
        } else if (factionState.cooperating) {
            body += _p('Your decision to cooperate with federal investigators earned you something rarer than money: a second chance.');
        } else if (factionState.regulatoryExposure >= 90) {
            body += _p('The unresolved SEC investigation hung over your career like a storm cloud that never quite broke.');
        } else {
            body += _p('The SEC\u2019s interest in your trading patterns faded as quietly as it had arrived. No charges, no settlement, no public statement.');
        }
    }

    // Financial scorecard
    body += _statSection('Portfolio Performance', [
        ['Final Value', _dollar(equity)],
        ['Total P&L', `${_dollar(totalPnl)} (${_pct(pnlPct)})`],
        ['Peak Value', _dollar(peakValue)],
        ['Max Drawdown', _pctAbs(maxDrawdown)],
    ]);

    body += _statSection('Trading Activity', [
        ['Trades Executed', totalTrades.toLocaleString()],
        ['Options Exercised', totalExercises.toLocaleString()],
        ['Margin Calls', marginCallCount.toLocaleString()],
    ]);

    body += _statSection('Market Summary', [
        ['Final Stock Price', _dollar(sim.S)],
        ['Final Rate', _pctAbs(sim.r)],
    ]);

    // Timeline highlights
    const highlights = _selectHighlights(eventLog);
    if (highlights.length > 0) {
        body += _h3('Timeline Highlights');
        for (const evt of highlights) {
            const dayLabel = `Day ${evt.day}`;
            body += `<div class="epilogue-timeline-row"><span class="epilogue-timeline-day">${dayLabel}</span><span class="epilogue-timeline-text">${evt.headline}</span></div>`;
        }
    }

    // Closing line varies by ending
    switch (endingId) {
        case 'criminal_indictment':
            body += _p('The Meridian Brief the morning after your arrest was three words: "Desk under review."');
            break;
        case 'margin_call_liquidation':
            body += _p('The Meridian Brief the morning after the liquidation ran the numbers without commentary. The numbers were commentary enough.');
            break;
        case 'firm_collapse':
            body += _p('There was no Meridian Brief the morning after. There was no Meridian.');
            break;
        case 'forced_resignation':
            body += _p('The Meridian Brief the morning after your departure was two words: "Desk quiet."');
            break;
        case 'whistleblower':
            body += _p('The Meridian Brief never mentioned your name again. In the official history, you were a blank space where a trader used to be.');
            break;
        case 'term_ends':
        default:
            body += _p('The Meridian Brief the morning after the election was two words: "Markets open."');
            break;
    }

    return { title: 'Your Legacy', body };
}

// -- Reputation synthesis -----------------------------------------------------

function _synthesizeReputation(playerChoices, impactHistory, quarterlyReviews, portfolio) {
    const flags = Object.keys(playerChoices);
    const scores = { insider: 0, principled: 0, speculator: 0, survivor: 0, kingmaker: 0, ghost: 0 };

    // Insider
    if (flags.includes('accepted_insider_tip')) scores.insider += 3;
    if (flags.includes('used_analyst_hint'))    scores.insider += 2;
    if (flags.includes('tipped_bowman'))        scores.insider += 2;
    if (flags.includes('desk_accepted_tip'))    scores.insider += 3;
    if (flags.includes('desk_used_channel'))    scores.insider += 2;
    if (flags.includes('stonewalled_sec')) scores.insider += 2;
    if (flags.includes('invoked_fifth')) scores.insider += 1;
    if (flags.includes('pursued_insider_tip'))  scores.insider += 2;
    if (flags.includes('pursued_pnth_tip'))     scores.insider += 2;
    if (flags.includes('lawyered_up'))          scores.insider += 1;
    if (flags.includes('lawyered_up_unusual'))  scores.insider += 1;

    // Principled
    if (flags.includes('reported_insider_tip'))  scores.principled += 3;
    if (flags.includes('cooperated_sec'))        scores.principled += 2;
    if (flags.includes('donated_relief'))        scores.principled += 2;
    if (flags.includes('desk_reported_tip'))     scores.principled += 3;
    if (flags.includes('declined_fundraiser'))   scores.principled += 1;
    if (flags.includes('cooperated_sec_letter')) scores.principled += 1;
    if (flags.includes('testified_fully')) scores.principled += 2;
    if (flags.includes('informed_sec')) scores.principled += 3;
    if (flags.includes('cooperated_with_compliance')) scores.principled += 2;
    if (flags.includes('filed_fomc_docs'))       scores.principled += 1;
    if (flags.includes('declined_analyst_color')) scores.principled += 2;
    if (flags.includes('declined_insider_tip'))  scores.principled += 1;
    if (flags.includes('reported_lobbyist'))     scores.principled += 2;

    // Speculator
    if (impactHistory.length >= 10) scores.speculator += 3;
    else if (impactHistory.length >= 5) scores.speculator += 2;
    if (flags.includes('doubled_down_short'))    scores.speculator += 2;
    if (flags.includes('comeback_aggressive'))   scores.speculator += 2;
    if (flags.includes('owned_tape_presence'))   scores.speculator += 1;
    if (flags.includes('defied_unlimited_risk')) scores.speculator += 1;
    if (flags.includes('showed_conviction_early')) scores.speculator += 1;

    // Survivor
    if (quarterlyReviews.length > 0) {
        const allSmall = quarterlyReviews.every(r =>
            Math.abs(r.vsBenchmark) < portfolio.initialCapital * 0.1
        );
        if (allSmall && quarterlyReviews.every(r => r.pnl >= 0)) scores.survivor += 3;
    }
    if (flags.includes('comeback_disciplined'))  scores.survivor += 2;
    if (flags.includes('comeback_cautious'))     scores.survivor += 2;
    if (flags.includes('covered_losing_short'))  scores.survivor += 1;
    if (flags.includes('deleveraged_fully'))     scores.survivor += 1;
    if (flags.includes('closed_bond_book'))      scores.survivor += 1;
    if (flags.includes('wound_down_gracefully')) scores.survivor += 1;

    // Kingmaker
    if (flags.includes('donated_barron') || flags.includes('donated_fl')) scores.kingmaker += 2;
    if (flags.includes('met_okafor_aide'))   scores.kingmaker += 2;
    if (flags.includes('gave_interview'))    scores.kingmaker += 1;
    if (flags.includes('desk_attended_fundraiser')) scores.kingmaker += 2;
    if (flags.includes('lobbied_federalist') || flags.includes('lobbied_farmerlabor')) scores.kingmaker += 2;
    if (flags.includes('attended_political_dinner')) scores.kingmaker += 2;
    if (flags.includes('attended_fundraiser'))    scores.kingmaker += 2;
    if (flags.includes('sent_check_no_dinner'))  scores.kingmaker += 1;

    // Ghost
    if (flags.length <= 2) scores.ghost += 4;
    else if (flags.length <= 4) scores.ghost += 2;

    let best = 'ghost', bestScore = 0;
    for (const [k, v] of Object.entries(scores)) {
        if (v > bestScore) { bestScore = v; best = k; }
    }
    return best;
}

// -- Highlight selection ------------------------------------------------------

function _selectHighlights(eventLog) {
    if (!eventLog || eventLog.length === 0) return [];

    let candidates = eventLog.filter(e => e.magnitude === 'major');

    if (candidates.length < 3) {
        const moderate = eventLog
            .filter(e => e.magnitude === 'moderate')
            .map(e => ({
                ...e,
                _totalDelta: _absDeltaSum(e),
            }))
            .sort((a, b) => b._totalDelta - a._totalDelta);

        candidates = candidates.concat(moderate);
    }

    return candidates
        .slice(0, 5)
        .sort((a, b) => a.day - b.day);
}

function _absDeltaSum(evt) {
    if (!evt.params) return 0;
    let sum = 0;
    for (const key in evt.params) {
        const val = evt.params[key];
        if (typeof val === 'number') sum += Math.abs(val);
    }
    return sum;
}
