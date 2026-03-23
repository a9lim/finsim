/* ===================================================
   epilogue.js -- Generates a 4-page narrative epilogue
   from accumulated world state, simulation parameters,
   portfolio performance, and event log.

   Pure function. No side effects, no DOM access.
   =================================================== */

import { computePositionValue } from './position-value.js';
import { INITIAL_CAPITAL, HISTORY_CAPACITY } from './config.js';

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

    // Principled
    if (flags.includes('reported_insider_tip'))  scores.principled += 3;
    if (flags.includes('cooperated_sec'))        scores.principled += 2;
    if (flags.includes('donated_relief'))        scores.principled += 2;
    if (flags.includes('desk_reported_tip'))     scores.principled += 3;
    if (flags.includes('declined_fundraiser'))   scores.principled += 1;

    // Speculator
    if (impactHistory.length >= 10) scores.speculator += 3;
    else if (impactHistory.length >= 5) scores.speculator += 2;

    // Survivor
    if (quarterlyReviews.length > 0) {
        const allSmall = quarterlyReviews.every(r =>
            Math.abs(r.vsBenchmark) < portfolio.initialCapital * 0.1
        );
        if (allSmall && quarterlyReviews.every(r => r.pnl >= 0)) scores.survivor += 3;
    }

    // Kingmaker
    if (flags.includes('donated_barron') || flags.includes('donated_fl')) scores.kingmaker += 2;
    if (flags.includes('met_okafor_aide'))   scores.kingmaker += 2;
    if (flags.includes('gave_interview'))    scores.kingmaker += 1;
    if (flags.includes('desk_attended_fundraiser')) scores.kingmaker += 2;

    // Ghost
    if (flags.length <= 2) scores.ghost += 4;
    else if (flags.length <= 4) scores.ghost += 2;

    let best = 'ghost', bestScore = 0;
    for (const [k, v] of Object.entries(scores)) {
        if (v > bestScore) { bestScore = v; best = k; }
    }
    return best;
}

// -- Page 1: The Election -----------------------------------------------------

function _pageElection(world, playerChoices) {
    const result = world.election.presidentialResult;
    const mid = world.election.midtermResult;
    const okafor = world.election.okaforRunning;
    const imp = world.investigations.impeachmentStage;
    const geo = world.geopolitical;
    const fed = world.fed;

    let body = '';

    // Midterm recap paragraph
    if (mid === 'fed_wave') {
        body += _p('The midterm elections two years prior had been a triumph for the Federalist Party. Barron\'s coalition held firm, expanding their margins in both chambers and silencing early talk of a lame-duck presidency. Pundits declared the era of Barron politics firmly entrenched.');
    } else if (mid === 'fl_wave') {
        body += _p('The midterm elections had been devastating for Barron. The Farmer-Labor wave swept through suburban districts that had once been Federalist strongholds, flipping the House and narrowing the Senate margin to a knife\'s edge. For the first time, the word "impeachment" was spoken aloud in the Capitol corridors.');
    } else if (mid === 'split') {
        body += _p('The midterms had produced a Congress as divided as the country itself. The Federalists clung to the Senate while Farmer-Labor claimed a narrow House majority. Gridlock became the governing philosophy, and every piece of legislation required horse-trading that left both sides exhausted.');
    } else if (mid === 'status_quo') {
        body += _p('The midterms had changed little, preserving the status quo in Washington. Neither party could claim a mandate, and governing lurched forward on inertia and executive orders. The real drama, as it turned out, was always going to be about what happened outside the Capitol.');
    }

    // Main election narrative
    switch (result) {
        case 'barron_removed':
            body += _p('In the end, John Barron did not make it to Election Day. The Senate vote came at 9:47 PM on a Thursday, with three Federalist senators crossing the aisle to deliver the two-thirds majority needed for removal. The chamber was silent as Chief Justice Morales read the verdict. Barron was watching from the residence, reportedly alone, his staff having dispersed like birds before a storm.');
            body += _p('The trial had consumed Washington for eleven weeks. Senator Okafor\'s investigation had laid the groundwork, but it was Rachel Tan\'s final series in The Continental\u2014the one that connected the defense contracts directly to Vice President Bowman\'s offshore accounts\u2014that broke the dam. Three cabinet members resigned in a single weekend. The Federalist leadership, calculating that a Barron martyrdom narrative would cost them more seats than removal, quietly whipped the votes.');
            body += _p('Vice President Bowman, now elevated to the presidency by the very crisis his corruption had helped create, served out the remaining months in a fog of legal uncertainty. He declined to run for a full term. The Federalist convention nominated Governor Patricia Chen of Ohio, a pragmatic moderate who spent the entire campaign trying to outrun Barron\'s shadow.');
            if (okafor) {
                body += _p('Senator Okafor, the woman whose investigations had brought down the presidency, ran on a platform of institutional restoration. Voters who were exhausted by chaos found her steady demeanor irresistible. The election was less a contest than a national exhale.');
            } else {
                body += _p('The Farmer-Labor Party nominated their own fresh face, and the general election became a referendum on normalcy. The Federalists never had a chance. The margin was comfortable, almost anticlimactic. America had already had its drama.');
            }
            break;

        case 'barron_wins_comfortably':
            body += _p('John Barron won re-election on the first Tuesday of November, and he won decisively. The networks called it before midnight Eastern, the kind of early call that leaves the losing campaign\'s hotel ballroom half-empty by the time the concession speech arrives. It was a vindication four years in the making, and Barron savored every minute of it.');
            body += _p('Looking back, the victory was built on a foundation that his critics never understood. The economy, for all its turbulence, had delivered gains that working families could feel in their paychecks. Barron\'s combative style, which the editorial boards despised, played as authenticity in the diners and factory floors of swing states. His base was energized; the opposition was fragmented.');
            if (geo.tradeWarStage === 4) {
                body += _p('The trade deal with China, announced with characteristic fanfare three months before the election, gave Barron the closing argument he needed. "I told you I\'d get it done," he repeated at every rally, and enough voters believed him to make it true.');
            }
            if (okafor) {
                body += _p('Senator Okafor ran a disciplined campaign, but she could never escape the perception that her candidacy was built on investigation rather than vision. Barron\'s team hammered the message relentlessly: "She spent four years looking backward. I spent four years moving forward." On election night, Okafor conceded graciously. In her speech, she promised that oversight would continue regardless of who sat in the Oval Office. Few doubted she meant it.');
            } else {
                body += _p('The Farmer-Labor candidate, a competent but uninspiring governor from the Midwest, never found a message that could cut through Barron\'s dominance of the news cycle. The concession speech was dignified and brief. The party would spend the next four years arguing about what went wrong.');
            }
            body += _p('Barron\'s second inaugural address was characteristically defiant, promising an accelerated agenda that made even his allies nervous. "You ain\'t seen nothing yet," he told the crowd on the Capitol steps, and for once, both supporters and opponents took him at his word.');
            break;

        case 'barron_wins_narrowly':
            body += _p('The election was not decided on election night. It was not decided the next morning. It took eleven days of counting, recounting, and legal challenges in three states before John Barron was declared the winner by margins that, in two cases, could have been reversed by a single precinct\'s worth of ballots.');
            if (okafor) {
                body += _p('Senator Patricia Okafor had come closer than anyone thought possible. Her campaign, launched on the back of the Palanthropic investigations that had made her a household name, had turned the election into a referendum on accountability. On the night of the election, her lead in the popular vote was commanding. But the Electoral College, that peculiar American institution, told a different story.');
                body += _p('Okafor conceded at 3 AM on the twelfth day, in a phone call that both camps described as "cordial." At her public statement later that morning, she looked exhausted but unbroken. "The investigations will continue," she said simply. "This isn\'t over." Her supporters, many of whom had been camped outside state capitols for days, went home slowly, carrying signs that read "COUNT EVERY VOTE" and "SEE YOU IN TWO YEARS."');
            } else {
                body += _p('The Farmer-Labor candidate had run a strong campaign, exceeding every poll and projection. But in the end, the incumbent advantage held\u2014barely. Barron\'s narrow path through the swing states was littered with recounts and court orders. He claimed victory before the counting was done, sparking three days of protests that only subsided when the margins were officially certified.');
            }
            if (imp >= 2) {
                body += _p('The shadow of the impeachment proceedings hung over everything. Barron\'s legal team had successfully delayed the Senate trial past the election, gambling that voters would ratify what the legislature could not decide. The gamble paid off, technically, but the mandate was tissue-thin. His second term would begin under the cloud of unfinished constitutional business.');
            }
            body += _p('The narrow victory left Barron with something he had never possessed and never wanted: a mandate for caution. His legislative agenda, ambitious in its conception, would spend the next four years dying in committee. The markets, uncertain which version of Barron would govern, priced in volatility that would persist for months.');
            break;

        case 'okafor_wins':
            body += _p('Senator Patricia Okafor made history on election night, becoming the first woman and first Black woman elected President of the United States. The call came just after 11 PM Eastern, when the returns from Pennsylvania crossed the threshold that made the math impossible for Barron. In cities across the country, the celebrations spilled into the streets.');
            body += _p('Looking back, the turning point was not a single moment but an accumulation of them. The Palanthropic hearings had given Okafor a national profile. The midterms had given her a platform. And Barron\'s own presidency\u2014the wars, the scandals, the erosion of institutional norms\u2014had given her an argument that was impossible to refute: enough.');
            if (geo.recessionDeclared) {
                body += _p('The recession, declared six months before the election, sealed Barron\'s fate. No incumbent has survived a recession-year election since 1948, and Barron proved no exception. His campaign\'s attempts to blame the Fed and foreign adversaries fell flat with voters whose 401(k) statements told a different story.');
            }
            if (fed.hartleyFired) {
                body += _p('Barron\'s firing of Fed Chair Hartley, which had once seemed like a masterstroke of executive power, came back to haunt him. Okafor\'s campaign ad\u2014just Hartley\'s face, the date she was fired, and the unemployment rate six months later\u2014ran in heavy rotation through October and required no further commentary.');
            }
            body += _p('Barron\'s concession, when it finally came forty-eight hours after the election, was delivered via written statement. He did not call Okafor. He did not appear on camera. The statement was three sentences long and misspelled "transition." It was, in its way, a perfect ending.');
            body += _p('In her victory speech, Okafor promised accountability for Palanthropic, restoration of Fed independence, and "a foreign policy that doesn\'t start wars to win news cycles." The Dow futures rose 400 points overnight. Markets, it seemed, were ready for boring.');
            break;

        case 'okafor_wins_decisively':
            body += _p('It wasn\'t even close by midnight. The networks, cautious after years of contested results, held their calls longer than necessary\u2014but the math was unambiguous by 10 PM. Senator Patricia Okafor carried every swing state, several by double digits, and flipped two states that hadn\'t gone Farmer-Labor in a generation. John Barron\'s presidency was over, and the country had delivered its verdict with unmistakable clarity.');
            body += _p('The landslide had been building for months. Barron\'s approval, battered by scandal, war, and economic anxiety, had settled into the low thirties by September. His rallies, once electric, grew smaller and angrier. The Federalist establishment began trickling endorsements to down-ballot candidates while conspicuously avoiding the presidential race. When Governor Mitchell publicly called for Barron to "step aside for the good of the party," the dam broke.');
            body += _p('Okafor\'s mandate was the clearest any president had claimed in decades. Her transition team, already assembled during the campaign\'s confident final weeks, moved with speed that startled Washington. Cabinet nominations arrived before Thanksgiving. The Palanthropic investigation file was on her desk before the inauguration.');
            if (geo.recessionDeclared) {
                body += _p('The recession provided the economic backdrop that made the result inevitable. Barron\'s promise that "the fundamentals are strong" became a punchline, then a meme, then the title of a bestselling book about the administration\'s economic failures. Exit polls showed the economy as the number-one issue by a twenty-point margin.');
            }
            body += _p('In a pre-recorded video posted at midnight\u2014he did not appear in person\u2014Barron blamed "rigged systems" and "corrupt media," promised legal challenges that never materialized, and wished the country well in a tone that suggested he wished it nothing of the sort. America had moved on before the video finished buffering.');
            break;

        case 'fl_wins':
            body += _p('The Farmer-Labor Party recaptured the presidency on a platform of exhaustion. Their candidate, a steady if uninspiring governor with a reputation for competence, ran the kind of campaign that pundits call "disciplined" and voters call "fine." It was enough. After four years of John Barron, "fine" was exactly what the electorate was looking for.');
            body += _p('Barron\'s defeat was not a landslide but a firm rebuke. The swing states fell one by one through the evening, each margin comfortable enough to preclude the legal challenges his team had prepared. By 1 AM, it was over. The Federalist faithful at the election night party had thinned to a few dozen loyalists and an open bar that nobody was drinking from.');
            if (geo.mideastEscalation >= 2) {
                body += _p('The Middle East quagmire had drained whatever reservoir of public patience remained for Barron\'s combative foreign policy. Gold Star families appearing in opposition ads proved devastating in military communities that had once been Barron\'s base.');
            }
            body += _p('The transition was orderly, which itself was remarkable given the preceding four years. Barron departed Washington on a Tuesday morning, his helicopter lifting off from the South Lawn with the practiced indifference of a man who had never expected the job to love him back. The incoming administration promised normalcy. Whether that was a promise anyone could keep remained to be seen.');
            break;

        case 'fl_wins_decisively':
            body += _p('The Farmer-Labor wave was even larger than the exit polls predicted. Their candidate carried thirty-one states, claimed a mandate that transcended ideology, and dragged enough down-ballot candidates to victory to give the party unified control of Congress. John Barron\'s coalition, so formidable four years ago, had evaporated.');
            body += _p('The erosion had been visible for months. Barron\'s approval numbers, beaten down by a cascade of crises\u2014each one survivable alone, catastrophic in combination\u2014never recovered from their autumn nadir. The Federalist Party\'s internal polling, leaked to The Continental two weeks before election day, showed their own candidate losing by eight to twelve points in every competitive state. The leak itself was an act of sabotage by party operatives already positioning for the post-Barron era.');
            if (imp >= 2) {
                body += _p('The impeachment proceedings, even though they had not resulted in removal, had shattered the myth of Barron\'s invincibility. The testimony, broadcast live over six weeks, introduced the public to a presidency that was simultaneously more chaotic and more calculating than even its critics had imagined.');
            }
            body += _p('Barron\'s election night speech, delivered to a half-empty ballroom in a tone that mixed defiance with self-pity, would become one of the defining images of his presidency. "They didn\'t beat me," he insisted. "They cheated." The claim, offered without evidence, found no audience beyond the faithful. The country had already changed the channel.');
            break;

        default:
            // Fallback if election result not set
            body += _p('The presidential term drew to a close. The nation looked ahead to what came next, carrying the scars and lessons of the past four years.');
            break;
    }

    // Meridian Capital references based on player choices
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

// -- Page 2: The Fate of Palanthropic ----------------------------------------

function _pagePNTH(world, playerChoices) {
    const p = world.pnth;
    const inv = world.investigations;
    let body = '';

    // Priority-ordered branches (first match wins)
    if (p.acquired) {
        // 1. Acquisition
        body += _h3('Under New Management');
        body += _p('In the end, Palanthropic did not die or triumph. It was absorbed. The acquisition, announced on a Sunday evening to minimize market reaction, was the largest in tech history. The acquiring entity\u2014a consortium led by Zhaowei Technologies and two sovereign wealth funds\u2014paid a premium that made Dirks\'s defense contracts look like pocket change.');
        body += _p('The name Palanthropic still appeared on the building in downtown San Francisco, but the lobby had been redecorated and the mission statement quietly updated. The Atlas AI platform, once pitched as a tool for democratic governance, now served clients on six continents with no particular regard for their form of government. The ethics board, such as it was, had been dissolved on the second day of the transition.');
        if (p.gottliebStartedRival) {
            body += _p('Eugene Gottlieb, who had departed months before the acquisition to found Covenant AI, watched from across the bay. His new company, still small, still idealistic, had become a refuge for the engineers who couldn\'t stomach the new Palanthropic. "We built something beautiful once," he told a podcast interviewer. "We can build it again." Whether Covenant could compete with Palanthropic\'s resources and Zhaowei\'s backing was a question the market had already answered: the odds were long.');
        } else if (p.ceoIsGottlieb) {
            body += _p('Gottlieb received his payout and retreated from public life. Friends said he was writing a book. Others said he was consulting for the government on AI safety, the very expertise that had made him irrelevant at the company he founded. The irony was not lost on anyone who knew him.');
        } else {
            body += _p('Gottlieb, who had been forced out long before the acquisition, released a statement calling the deal "the final betrayal of everything Palanthropic was meant to be." It trended for six hours, then disappeared beneath the news cycle. Silicon Valley had already moved on to the next thing.');
        }
        if (!p.ctoIsMira) {
            body += _p('Mira Kassis had seen it coming before anyone. She left Palanthropic quietly, her departure announced in a company-wide email that read like a farewell note from someone who had stopped recognizing the place. She surfaced six months later at a stealth AI safety startup, building the guardrails she wished Palanthropic had kept.');
        } else {
            body += _p('Mira Kassis stayed through the transition, the last of the original leadership team. Colleagues said she stayed out of loyalty to the engineers, not the company. Whether she would remain under the new regime was the subject of intense speculation in the Valley.');
        }

    } else if (p.dojSuitFiled && p.whistleblowerFiled && p.senateProbeLaunched) {
        // 2. Scandal-ravaged
        body += _h3('The Reckoning');
        body += _p('What was once the most promising AI company in America was now a cautionary tale studied in business schools. The DOJ antitrust suit, the whistleblower complaint, and Senator Okafor\'s Senate investigation had converged into a perfect storm that no amount of corporate lawyering could weather. Palanthropic\'s stock\u2014for those who traded in such things\u2014had lost eighty percent of its value from peak to trough.');
        body += _p('The consent decree, when it finally came, was brutal. An independent monitor was installed. The military contracts were suspended pending review. Three senior executives faced criminal referral. Andrea Dirks, who had once commanded boardrooms with a glance, was photographed leaving a federal courthouse in a navy suit and an expression that betrayed nothing. Her lawyers said she was "cooperating fully." The prosecutors said otherwise.');
        if (p.ceoIsGottlieb) {
            body += _p('Gottlieb, remarkably, had survived. His early opposition to the military contracts\u2014once dismissed as naivete\u2014now looked like prescience. The board, desperate for a credible reformer, gave him latitude he had never possessed in the Dirks era. Whether he could rebuild trust was an open question. The technology was still extraordinary. The reputation would take a generation.');
        } else {
            body += _p('The board brought in an outside CEO, a former regulator with no ties to either faction. Gottlieb was offered an advisory role and declined. "You can\'t advise a company that doesn\'t know what it wants to be," he told Rachel Tan in the interview that became the definitive account of Palanthropic\'s fall. Tan, characteristically, had the last word in print.');
        }
        if (!p.ctoIsMira) {
            body += _p('Mira Kassis\'s testimony before the Senate committee had been the turning point. Her detailed, technically precise account of how safety protocols were systematically overridden to meet defense contract deadlines gave the investigation the evidence it needed. She was called a traitor by Dirks loyalists and a hero by everyone else. She didn\'t seem to care about either label.');
        }

    } else if (p.gottliebStartedRival) {
        // 3. Covenant AI rivalry
        body += _h3('The Schism');
        body += _p('The AI industry had split along ethical lines, and the fault line ran directly through what had once been Palanthropic\'s headquarters. On one side: Palanthropic, now firmly under Andrea Dirks\'s control, its Atlas platform powering military operations and intelligence gathering for a growing list of government clients. On the other: Covenant AI, Eugene Gottlieb\'s defiant response, headquartered in a converted warehouse across the bay.');
        body += _p('The rivalry had become personal in ways that transcended business. Dirks called Covenant "a vanity project funded by guilt money." Gottlieb called Palanthropic "a weapons manufacturer that happened to use neural networks." At industry conferences, their respective engineers sat on opposite sides of the room. Recruiting was war by other means.');
        body += _p('Covenant AI had attracted a disproportionate share of the top researchers\u2014the ones who cared about alignment, interpretability, the things that didn\'t show up on a defense contract RFP. Their commercial product, an enterprise AI platform built on principles that Palanthropic had abandoned, was gaining traction with companies that wanted the capability without the reputational risk. It was still a fraction of Palanthropic\'s revenue. But the trajectory lines were converging.');
        if (!p.ctoIsMira) {
            body += _p('Mira Kassis had followed Gottlieb to Covenant, where she served as CTO. It was, she said, the job she thought she was taking when she joined Palanthropic. "Same mission. Different people." The engineering culture she built at Covenant became legendary in the Valley\u2014rigorous, principled, and ferociously productive.');
        } else {
            body += _p('Mira Kassis remained at Palanthropic, a decision that puzzled her former colleagues at Covenant. "Someone has to keep the lights on responsibly," she said in a rare interview, and those who knew her understood: she was staying not for Dirks, but for the thousands of engineers who needed someone with a conscience in the room where decisions were made.');
        }

    } else if (p.ceoIsGottlieb && p.boardGottlieb >= 6) {
        // 4. Gottlieb's commercial PNTH
        body += _h3('The Pivot');
        body += _p('Gottlieb proved the skeptics wrong. It took two years of boardroom battles, three proxy fights, and one memorable shareholders\' meeting where Andrea Dirks was escorted out by security after refusing to yield the microphone\u2014but when the dust settled, Palanthropic was his. The board, once Dirks\'s instrument, now reflected the commercial vision Gottlieb had championed since the founding.');
        body += _p('The pivot to enterprise AI was not glamorous. There were no drone strikes to point to, no classified briefings, no visits from generals. Instead, there were hospital systems running Atlas for diagnostic support. Financial institutions using it for risk modeling. Agricultural cooperatives optimizing crop yields. The revenue grew slowly at first, then with the compound acceleration that Silicon Valley lives for. By the end of the term, Palanthropic\'s commercial revenue exceeded what the military contracts had ever generated.');
        body += _p('Dirks departed with a severance package that made the business pages and a non-compete that kept her out of the industry for two years. She was last seen in Washington, consulting for defense contractors who wanted their own AI platforms. Some things, it seemed, never changed.');
        if (p.ctoIsMira) {
            body += _p('Mira Kassis, who had weathered every storm without ever raising her voice, was quietly promoted to President. The engineering teams, who had been holding their breath for two years, exhaled. Under Kassis and Gottlieb, Palanthropic rebuilt not just its product line but its culture\u2014the kind of slow, unglamorous work that never makes headlines but determines whether a company survives its second decade.');
        }

    } else if (!p.ceoIsGottlieb && p.boardDirks >= 7) {
        // 5. Dirks's defense PNTH
        body += _h3('The Contractor');
        body += _p('Dirks had won, but the company Gottlieb built was unrecognizable. Palanthropic\'s San Francisco campus, once decorated with idealistic murals about "AI for humanity," had been quietly repainted in corporate grays. The visitor badges now required security clearance. The cafeteria conversations, once freewheeling debates about alignment and ethics, were conducted in careful whispers when they happened at all.');
        body += _p('The defense contracts had made Palanthropic enormously profitable. Atlas powered surveillance networks, predictive policing systems, and\u2014though this was never confirmed publicly\u2014autonomous weapons platforms for the Department of War. Each quarterly earnings call was a parade of growing revenue and expanding margins. Wall Street loved it. The engineers who remained tried not to think about what, exactly, their code was doing in theaters they couldn\'t name.');
        body += _p('Gottlieb\'s departure had been framed as a resignation "to pursue other interests." In reality, the board had given him a choice: resign or be removed. He chose the dignity of the former, though there was precious little dignity in watching his life\'s work become the thing he feared most. His farewell email to the company, leaked within hours, was a single paragraph that ended with: "Build something you can explain to your children."');
        if (p.ctoIsMira) {
            body += _p('Kassis stayed. This surprised everyone, including Kassis. "I stay because they listen to me on safety," she told a friend. "The day they stop listening is the day I leave." Whether this was principle or rationalization was a question she asked herself more often than she would admit.');
        } else {
            body += _p('Mira Kassis left three weeks after Gottlieb, taking a dozen senior engineers with her. The talent drain was Dirks\'s only vulnerability, and she addressed it the way she addressed everything: with money. Retention bonuses doubled. Signing bonuses tripled. The engineers who stayed were well-compensated and, increasingly, strangers to one another.');
        }

    } else {
        // 6. Uneasy compromise (fallback)
        body += _h3('The Detente');
        body += _p('The Gottlieb-Dirks detente held, but insiders said it was only a matter of time. The board remained split, neither faction commanding the votes for a decisive move. Monthly board meetings lasted six hours and resolved nothing. The company\'s strategy, such as it was, consisted of pursuing both commercial and defense contracts simultaneously, pleasing neither constituency fully and infuriating both.');
        body += _p('Gottlieb remained CEO in title, but Dirks controlled enough of the board to block any initiative she opposed. The result was a company running in two directions at once: the commercial division building enterprise tools, the defense division fulfilling government contracts, and a demilitarized zone between them enforced by legal agreements and mutual suspicion. Earnings were decent. Morale was terrible.');
        body += _p('Industry analysts called it "the most dysfunctional company in tech that still makes money." Recruitment had slowed to a trickle\u2014top candidates, given a choice between Palanthropic\'s internal politics and any other offer, chose the other offer. The technology remained extraordinary. Everything else was a mess.');
        if (p.ctoIsMira) {
            body += _p('Kassis, caught between the two factions, had become the de facto mediator. She reported to Gottlieb, negotiated with Dirks, and spent her weekends wondering if any of it was worth it. "The tech is still good," she told herself. It was true. It was also, increasingly, beside the point.');
        }
    }

    // Player involvement in Okafor hearings
    if (playerChoices.okafor_cooperated || playerChoices.met_okafor_aide || playerChoices.gave_interview) {
        body += _p('The Okafor hearings produced one memorable witness \u2014 a Meridian derivatives trader whose testimony helped unravel the Bowman connection.');
    } else if (playerChoices.okafor_distanced) {
        body += _p('When subpoenas flew, one trader at Meridian kept their head down and their records clean.');
    }

    return { title: 'The Fate of Palanthropic', body };
}

// -- Page 3: The World -------------------------------------------------------

function _pageWorld(world, sim, impactHistory) {
    const geo = world.geopolitical;
    const fed = world.fed;
    let body = '';

    // Trade / China
    if (geo.tradeWarStage > 0) {
        body += _h3('Trade &amp; China');
        if (geo.tradeWarStage >= 4) {
            body += _p('The framework deal was, depending on who you asked, either Barron\'s crowning achievement or the most expensive photo opportunity in American economic history. The tariffs came down. The retaliatory measures were unwound. Zhaowei Technologies regained access to American semiconductor supply chains, and American agriculture regained access to Chinese markets. The cost of the detour\u2014measured in shuttered factories, disrupted supply chains, and consumer prices that never fully retreated\u2014was a number that both sides preferred not to calculate.');
            if (geo.chinaRelations > 0) {
                body += _p('Relations between Washington and Beijing settled into something approaching warmth, or at least the absence of active hostility. Diplomatic channels, severed during the worst of the tariff war, were quietly reopened. Liang Wei and Andrea Dirks were photographed shaking hands at Davos, an image that would have been unthinkable eighteen months earlier.');
            }
        } else if (geo.tradeWarStage >= 3) {
            body += _p('The tech decoupling was complete and, by all appearances, permanent. American and Chinese technology ecosystems now operated in parallel universes, each with its own standards, its own supply chains, its own internet. Companies that had once served both markets were forced to choose. Most chose revenue over principle, which in practice meant choosing whichever market was larger for their particular product.');
            body += _p('Liang Wei\'s Zhaowei Technologies thrived in the bifurcated landscape, dominating markets that American companies could no longer reach. The irony\u2014that Barron\'s tariffs had created the very competitor they were meant to contain\u2014was noted by economists and ignored by everyone else.');
        } else if (geo.tradeWarStage >= 2) {
            body += _p('The trade war had settled into a grinding stalemate. Tariffs remained in place on both sides, retaliatory measures had been answered with counter-retaliatory measures, and the WTO dispute queue stretched to the horizon. Neither side could claim victory. Both sides could claim enormous costs. The situation had a name in the economics literature: "mutually assured disruption."');
        } else {
            body += _p('The initial tariffs had caused a brief panic in global markets, but the anticipated escalation never fully materialized. Whether this was due to diplomatic back channels, economic reality, or simple inattention\u2014the administration had other crises to manage\u2014was a matter of debate. The tariffs remained in place, a low-grade economic fever that everyone had learned to live with.');
        }
    }

    // Middle East
    if (geo.mideastEscalation > 0) {
        body += _h3('The Middle East');
        if (geo.mideastEscalation >= 3) {
            body += _p('The Department of War\u2014as Barron insisted on calling it, and as the rest of the world now reluctantly accepted\u2014had its defining engagement. What began as "targeted strikes" escalated through the grim logic of regional warfare into something that looked, from certain angles, like an occupation. American casualties mounted. The drone campaigns, powered in part by Palanthropic\'s Atlas platform, generated footage that played on loop on international news networks.');
            body += _p('The oil markets, predictably, went haywire. Supply disruptions pushed prices to levels not seen since the previous decade\'s crises. The economic consequences rippled through every sector, from transportation to agriculture to the household budgets of voters who would remember the price at the pump on Election Day.');
        } else if (geo.mideastEscalation >= 2) {
            body += _p('The military engagement in the Middle East had expanded beyond its original mandate, as military engagements in the Middle East invariably do. The "limited strikes" authorized in the first year gave way to a sustained air campaign, then advisors on the ground, then the careful bureaucratic language that distinguishes a "deployment" from a "war" without meaningfully changing what the people involved experience.');
            body += _p('Protests erupted at home, smaller than the antiwar movements of previous generations but angrier. The administration\'s response\u2014that the operations were "protecting American interests and deploying cutting-edge AI to minimize civilian casualties"\u2014satisfied neither the doves nor the families of the casualties that the AI had failed to minimize.');
        } else {
            body += _p('The strikes were brief and, by the Pentagon\'s accounting, successful. Targets were neutralized. Allies were reassured. The cost in treasure was manageable and the cost in blood was, mercifully, limited to the other side. Whether the intervention achieved anything lasting was a question that would take years to answer. The administration, characteristically, declared victory and moved on.');
        }
    }

    // South America
    if (geo.southAmericaOps > 0) {
        body += _h3('South America');
        if (geo.southAmericaOps >= 3) {
            body += _p('The South American operations\u2014never officially acknowledged, always implicitly confirmed\u2014had metastasized into a regional crisis. What began as intelligence support to a friendly government became regime change, which became counterinsurgency, which became the kind of generational commitment that no administration wants to explain to voters. The PNTH-powered surveillance apparatus that enabled the operations became a scandal in its own right when Continental reporters documented its use against civilian opposition groups.');
        } else if (geo.southAmericaOps >= 2) {
            body += _p('American involvement in South America was an open secret\u2014the kind that everyone knew about and nobody in Washington would confirm on the record. Special operations forces conducted training missions that looked, from satellite imagery obtained by The Continental, remarkably like combat operations. The administration called them "advisory." The people on the ground called them something else.');
        } else {
            body += _p('The South American operations remained in the shadows, a footnote in a presidency defined by louder conflicts. Intelligence cooperation, some equipment transfers, a few advisors in places that the State Department preferred not to name. It was the smallest of Barron\'s military ventures, and the one most likely to be forgotten by history. Whether this was a mercy depended on which side of the operations you were on.');
        }
    }

    // The Fed (always included)
    body += _h3('The Federal Reserve');
    if (fed.hartleyFired) {
        if (fed.vaneAppointed) {
            body += _p('Hayden Hartley\'s firing was the constitutional crisis that wasn\'t. Legal scholars debated whether the president could remove a Fed chair; Barron simply did it. Hartley left the Eccles Building with her dignity intact and a book deal that would make her wealthy. Marcus Vane, her replacement, delivered the rate cuts Barron wanted within his first three meetings.');
            if (fed.credibilityScore <= 3) {
                body += _p('The Vane Fed did as it was told, and the consequences were exactly what Hartley had warned about. The dollar weakened. Foreign central banks diversified their reserves. The yield curve, that ancient oracle of economic sentiment, inverted and stayed inverted. Vane\'s press conferences, once eagerly anticipated by traders, became exercises in decoding which of the chairman\'s statements reflected economic analysis and which reflected phone calls from the White House. By the end, nobody could tell the difference, including Vane himself.');
            } else {
                body += _p('The Vane Fed, to its credit, maintained more independence than the doomsayers predicted. Vane cut rates when cutting was defensible and dragged his feet when it wasn\'t, developing a passive resistance to presidential pressure that satisfied neither Barron nor the markets. The dollar held. Inflation remained manageable. It was not the catastrophe that Hartley\'s defenders had feared. It was merely diminishment\u2014the slow erosion of institutional credibility that doesn\'t show up in any single data point but is visible in the aggregate, like water damage.');
            }
        } else {
            body += _p('Hartley was fired, but her replacement was never confirmed. The Senate, in a rare bipartisan display, refused to advance Barron\'s preferred candidates. The Fed operated under acting leadership for the remainder of the term\u2014technically functional, institutionally wounded, and politically radioactive. Rate decisions became consensus exercises, each one preceded by weeks of public lobbying from the White House. It was not the independent central bank the founders of the Federal Reserve system had envisioned.');
        }
    } else {
        body += _p('Hayden Hartley served her full term, her independence intact. It cost her\u2014the public attacks from the president, the private pressure, the isolation that comes from being the only person in Washington who refuses to play the game. But the Fed maintained its credibility, the dollar maintained its strength, and the economic data, while volatile, never spiraled into the kind of crisis that would have validated Barron\'s calls for intervention.');
        if (fed.credibilityScore >= 7) {
            body += _p('History would judge Hartley kindly. In the memoirs and retrospectives that followed, she emerged as one of the few officials who had navigated the Barron years without compromising her institutional mandate. "She was the adult in the room," wrote one columnist, "in a room where the adults had all been fired." Her farewell press conference was dignified, technical, and\u2014for those who had followed the saga\u2014quietly triumphant.');
        } else {
            body += _p('But surviving was not the same as thriving. The constant political pressure had left its mark on the institution, if not the chair. FOMC meetings were leaked more frequently. Dissents increased. The bond market, that most sensitive barometer of central bank credibility, priced in a risk premium that had not existed before the Barron presidency. Hartley held the line. The line itself had moved.');
        }
    }

    // The Economy (always included)
    body += _h3('The Economy');
    const rate = sim.r;
    const vol = Math.sqrt(sim.v);

    if (geo.recessionDeclared) {
        body += _p('The recession, when it finally arrived, surprised no one and devastated everyone. The technical definition\u2014two consecutive quarters of negative GDP growth\u2014was met with the grim satisfaction of economists who had been warning about exactly this for months. The human definition\u2014layoffs, foreclosures, the particular despair of watching your savings evaporate in real time\u2014was met with the anger of voters who had been promised that this would never happen.');
        if (geo.oilCrisis) {
            body += _p('The oil crisis made everything worse. Energy prices, already elevated by geopolitical tensions, spiked to levels that functioned as a tax on every economic activity. Commuters, truckers, manufacturers, farmers\u2014the cost increases cascaded through the economy with the inevitability of gravity. The administration\'s response\u2014releasing the Strategic Petroleum Reserve while simultaneously pursuing the foreign policy that had caused the crisis\u2014was described by one economist as "trying to bail out a boat while drilling holes in the hull."');
        }
    } else if (vol > 0.3) {
        body += _p('The economy avoided a formal recession, but the word "avoided" did a lot of heavy lifting in that sentence. Volatility remained elevated throughout the term, the kind of persistent uncertainty that doesn\'t destroy an economy but prevents it from thriving. Businesses delayed investments. Consumers saved more and spent less. The GDP numbers were positive but anemic, the economic equivalent of a patient who had been discharged from the hospital but never quite recovered their strength.');
    } else if (rate > 0.06) {
        body += _p('The high-rate environment reshaped the economic landscape in ways that would outlast the presidency. Mortgages were expensive. Corporate debt was expensive. The startup ecosystem, built on a decade of cheap money, contracted painfully. But savers\u2014retirees, pension funds, the patient and the cautious\u2014earned returns they hadn\'t seen in a generation. The economy was healthy, if you defined health as sustainability rather than growth.');
    } else if (rate < 0.01) {
        body += _p('Rates had fallen to levels that made central bankers nervous and savers despondent. The near-zero environment, once considered an emergency measure, had become the new normal. The Fed\'s toolkit was empty. If another crisis came\u2014and another crisis always comes\u2014there would be nothing left to cut. The economy functioned, but it functioned on borrowed time and borrowed money, a distinction that mattered enormously to economists and not at all to the voters who would decide what came next.');
    } else {
        body += _p('Four years of whiplash had left the economy in a place that defied easy characterization. The headline numbers were respectable: positive growth, moderate inflation, unemployment within historical norms. But the averages concealed enormous divergence. The sectors aligned with government spending\u2014defense, intelligence, infrastructure\u2014boomed. The sectors exposed to trade disruption and regulatory uncertainty languished. It was an economy shaped by political choices, for better and for worse.');
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

// -- Page 4: Your Legacy -----------------------------------------------------

function _pageLegacy(sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews) {
    // Compute equity
    let equity = portfolio.cash;
    for (const pos of portfolio.positions) {
        equity += computePositionValue(pos, sim.S, Math.sqrt(sim.v), sim.r, sim.day, sim.q);
    }

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

    // -- Reputation reveal ---------------------------------------------------
    const reputation = _synthesizeReputation(playerChoices, impactHistory, quarterlyReviews, portfolio);
    const reputationLines = {
        insider:    'In the end, they called you <em>The Insider</em> \u2014 someone who always seemed to know just a little too much.',
        principled: 'In the end, they called you <em>The Principled</em> \u2014 proof that you could win without selling your soul.',
        speculator: 'In the end, they called you <em>The Speculator</em> \u2014 a force of nature that moved markets and didn\'t look back.',
        survivor:   'In the end, they called you <em>The Survivor</em> \u2014 steady hands in a storm that broke everyone else.',
        kingmaker:  'In the end, they called you <em>The Kingmaker</em> \u2014 a trader whose choices echoed far beyond the trading floor.',
        ghost:      'In the end, no one called you anything at all. One trader at Meridian made a fortune and left no fingerprints.',
    };
    body += `<div class="epilogue-rating">${reputationLines[reputation]}</div>`;

    // -- Career arc from quarterly reviews ------------------------------------
    if (quarterlyReviews.length > 0) {
        const strongCount = quarterlyReviews.filter(r => r.rating === 'strong').length;
        const poorCount = quarterlyReviews.filter(r => r.rating === 'poor').length;
        if (strongCount > poorCount * 2) {
            body += _p('Quarter after quarter of exceptional returns. The risk committee stopped asking questions and started asking for allocation advice. Meridian\u2019s derivatives desk became the model other desks measured themselves against.');
        } else if (poorCount > strongCount) {
            body += _p('A slow descent the risk committee watched with growing unease. Each quarterly review brought tighter limits, pointed questions, the particular humiliation of explaining losses to people who had never placed a trade. The desk survived, but only because someone upstairs still believed in second chances.');
        } else {
            body += _p('Uneven \u2014 flashes of brilliance interrupted by mediocrity. The quarterly reviews told the story of a trader who could read the market but couldn\u2019t always resist it. Some quarters the P&L sang. Others it whispered apologies. Meridian kept the desk open because the ceiling was worth the floor.');
        }
    }

    // -- Signature moment from impact history ---------------------------------
    if (impactHistory.length > 0) {
        const biggest = impactHistory.reduce((a, b) => Math.abs(a.magnitude) > Math.abs(b.magnitude) ? a : b);
        const dayLabel = biggest.day - HISTORY_CAPACITY;
        const direction = biggest.direction > 0 ? 'buying' : 'selling';
        body += _p(`On day ${dayLabel}, a burst of institutional ${direction} pressure preceded what came next. The compliance logs would show a single desk, a single trader, and a position size that made the back office call upstairs. Whether it was conviction or recklessness depended on what happened after.`);
    }

    body += `<div class="epilogue-rating">${rating}</div>`;

    // -- Financial scorecard --------------------------------------------------
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
            body += `<div class="stat-row"><span class="epilogue-highlight-day">${dayLabel}</span><span>${evt.headline}</span></div>`;
        }
    }

    return { title: 'Your Legacy', body };
}

// -- Highlight selection ------------------------------------------------------

function _selectHighlights(eventLog) {
    if (!eventLog || eventLog.length === 0) return [];

    // Filter major events first
    let candidates = eventLog.filter(e => e.magnitude === 'major');

    if (candidates.length < 3) {
        // Add moderate events sorted by absolute sum of param deltas
        const moderate = eventLog
            .filter(e => e.magnitude === 'moderate')
            .map(e => ({
                ...e,
                _totalDelta: _absDeltaSum(e),
            }))
            .sort((a, b) => b._totalDelta - a._totalDelta);

        candidates = candidates.concat(moderate);
    }

    // Take top 5, sort chronologically
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

// -- Main export --------------------------------------------------------------

export function generateEpilogue(world, sim, portfolio, eventLog, playerChoices = {}, impactHistory = [], quarterlyReviews = []) {
    return [
        _pageElection(world, playerChoices),
        _pagePNTH(world, playerChoices),
        _pageWorld(world, sim, impactHistory),
        _pageLegacy(sim, portfolio, eventLog, playerChoices, impactHistory, quarterlyReviews),
    ];
}
