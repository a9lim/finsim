/* pnth.js -- Palanthropic (PNTH) corporate events: board dynamics, products, earnings. */

import { shiftFaction } from '../faction-standing.js';

export const PNTH_EVENTS = [
    // =====================================================================
    //  ARC 1: THE GOTTLIEB-DIRKS WAR
    // =====================================================================

    // -- Inciting incident chain -------------------------------------------
    {
        id: 'gottlieb_ethics_keynote',
        category: 'pnth',
        likelihood: 0.6,
        headline: 'Gottlieb delivers blistering keynote at the Atlas Sentinel developer conference: "We built Sentinel to heal, not to kill. Aegis was never part of the plan." Dirks watches from the front row, stone-faced. Zhen texts Malhotra: "This is going to be expensive."',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks >= 6,
        params: { mu: -0.01, theta: 0.005, lambda: 0.2 },
        effects: [ { path: 'pnth.boardGottlieb', op: 'add', value: 1 }, ],
        followups: [{ id: 'dirks_cnbc_rebuttal', mtth: 8, weight: 0.9 }],
    },
    {
        id: 'dirks_cnbc_rebuttal',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks fires back in a MarketWire exclusive: "Eugene is a brilliant engineer but a naive businessman. Atlas Aegis is our fastest-growing segment and the Pentagon needs it yesterday." Malhotra quietly starts a $2B buyback the same afternoon.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        params: { mu: 0.005, theta: 0.012, lambda: 0.3 },
        effects: [ { path: 'pnth.boardDirks', op: 'add', value: 1 }, ],
        followups: [ { id: 'board_closed_session', mtth: 20, weight: 0.7 }, { id: 'kassis_caught_middle', mtth: 15, weight: 0.5 }, ],
    },
    {
        id: 'board_closed_session',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board convenes emergency closed session on the Atlas Aegis question. The Continental: "the room was nuclear." Zhen leaves early. Kassis is not invited.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        params: { mu: -0.005, theta: 0.008, lambda: 0.3 },
        followups: [ { id: 'board_compromise', mtth: 8, weight: 0.6 }, { id: 'dirks_blocked', mtth: 15, weight: 0.3 }, ],
    },

    // -- Board closed session branches ------------------------------------
    {
        id: 'gottlieb_stripped_oversight',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board votes 8-2 to strip Gottlieb of product oversight. Aegis and Crucible report directly to Dirks now. CEO title retained but authority gutted. Gottlieb "considering all options." Zhen voted with Dirks.',
        params: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        magnitude: 'major',
        minDay: 200,
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks >= 8,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            shiftFaction('firmStanding', -2);
        },
        followups: [
            { id: 'gottlieb_resigns', mtth: 25, weight: 0.6 },
            { id: 'gottlieb_digs_in', mtth: 20, weight: 0.4 },
        ],
    },
    {
        id: 'dirks_blocked',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'In surprise upset, PNTH board blocks Dirks\' Atlas Aegis expansion plan 6-4. Zhen abstains. Gottlieb allies hold firm. Dirks is visibly furious leaving the boardroom. Malhotra cancels the buyback tranche.',
        params: { mu: 0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks <= 6,
        followups: [
            { id: 'dirks_proxy_fight', mtth: 30, weight: 0.6 },
            { id: 'dirks_resigns', mtth: 40, weight: 0.15 },
        ],
    },
    {
        id: 'board_compromise',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board reaches fragile compromise: Atlas Aegis contracts continue but with a new ethics review process chaired by Kassis. Dirks and Gottlieb both claim victory. Zhen brokers the deal.',
        params: { mu: 0.01, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },

    // -- Kassis branch ----------------------------------------------------
    {
        id: 'kassis_caught_middle',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis publishes an internal memo arguing Atlas Aegis targeting decisions violate PNTH\'s founding charter. Dirks forwards it to the board with a one-line response: "Noted." Zhen asks for a meeting.',
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira && world.pnth.ceoIsGottlieb,
        params: { mu: 0.005, theta: 0.01 },
        followups: [ { id: 'kassis_sides_dirks', mtth: 15, weight: 0.5 }, { id: 'kassis_sides_gottlieb', mtth: 25, weight: 0.3 }, ],
    },
    {
        id: 'kassis_sides_gottlieb',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis publicly backs Gottlieb in a board letter signed by 200+ Atlas Sentinel engineers: "We built Sentinel for medicine, climate, and discovery. Aegis is a betrayal of that mission." Malhotra warns the letter is a material disclosure risk.',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
        },
    },
    {
        id: 'kassis_sides_dirks',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis reverses course after a private meeting with Dirks. The Continental reports she was shown a classified Pentagon briefing on Zhaowei\'s military AI. Kassis agrees to lead Atlas Aegis safety review. Gottlieb: "Mira, what did they show you?"',
        params: { mu: 0.01, theta: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'kassis_quits',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: CTO Mira Kassis resigns effective immediately. LinkedIn post: "I built Atlas Sentinel to solve problems. I cannot stay at a company that turned it into Atlas Aegis." She takes the Companion team leads with her.',
        params: { mu: -0.04, theta: 0.02, lambda: 0.6, muJ: -0.02 },
        magnitude: 'major',
        minDay: 200,
        when: (sim, world) => world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.ctoIsMira = false;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            shiftFaction('firmStanding', -2);
        },
    },

    // -- Gottlieb resignation chain ---------------------------------------
    {
        id: 'gottlieb_resigns',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: CEO Eugene Gottlieb resigns. In an emotional letter to employees: "I built Palanthropic to make the world better. Atlas Sentinel was the proof. But Aegis, Crucible, Companion -- they turned my company into something I don\'t recognize." Zhen does not issue a statement.',
        magnitude: 'major',
        minDay: 250,
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        params: { mu: -0.03, theta: 0.02, lambda: 1.0, muJ: -0.02 },
        effects: (world) => { world.pnth.ceoIsGottlieb = false; world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1); world.pnth.boardDirks = Math.min(12, world.pnth.boardDirks + 1); shiftFaction('firmStanding', -3); },
        followups: [ { id: 'successor_search', mtth: 20, weight: 0.8 }, { id: 'gottlieb_covenant_ai', mtth: 60, weight: 0.4 }, ],
    },
    {
        id: 'gottlieb_digs_in',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb hires activist defense attorney, signals he will fight removal: "They\'ll have to drag me out. I still own 12% of this company." Dirks fast-tracks an Atlas Aegis expansion while Gottlieb is distracted.',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
        followups: [
            { id: 'gottlieb_lawsuit', mtth: 30, weight: 0.5 },
        ],
    },
    {
        id: 'gottlieb_lawsuit',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb files suit against PNTH board alleging breach of fiduciary duty over the Atlas Aegis expansion. Seeks injunction restoring his product oversight. Discovery could expose Bowman\'s role in the original Pentagon contract.',
        params: { mu: -0.03, theta: 0.02, lambda: 0.8 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb,
    },
    {
        id: 'successor_search',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH retains Spencer Stuart for CEO search. Dirks named interim CEO, immediately consolidates Atlas Aegis and Crucible under her direct control. MarketWire: "foxes guarding the henhouse." Malhotra stays on as CFO.',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.ceoIsGottlieb,
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 15) return 'Your long position needs a credible CEO pick. Dirks as interim is not what the market wanted.';
            if (stockQty < -10) return 'Your short thesis just got another catalyst. An interim CEO search means months of uncertainty.';
            return null;
        },
    },
    {
        id: 'gottlieb_covenant_ai',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Gottlieb announces Covenant AI, a "safety-first" rival to Palanthropic. Backed by $2B from Sequoia and a16z. Immediately poaches 40 Atlas Sentinel engineers and the entire Companion product team. Kassis joins as CTO.',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        magnitude: 'major',
        minDay: 350,
        when: (sim, world) => !world.pnth.ceoIsGottlieb,
        effects: (world) => {
            world.pnth.gottliebStartedRival = true;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            shiftFaction('firmStanding', -2);
        },
    },

    // -- Dirks proxy fight / board dynamics --------------------------------
    {
        id: 'dirks_proxy_fight',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0.6,
        headline: 'Dirks launches proxy fight to replace two Gottlieb-aligned board members. Malhotra\'s investor presentation highlights Atlas Aegis revenue growth. Zhen pledges his shares to Dirks. Institutional holders controlling 35% are undecided.',
        params: { mu: -0.02, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.boardDirks < 9,
        followups: [
            { id: 'dirks_proxy_wins', mtth: 25, weight: 0.5 },
            { id: 'dirks_proxy_loses', mtth: 25, weight: 0.5 },
        ],
        portfolioFlavor: (portfolio) => {
            const totalQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (totalQty > 20) return 'As a large institutional holder, Meridian will get a proxy solicitation. Your vote could matter.';
            if (totalQty < -10) return 'Your short position loves proxy fights -- months of uncertainty and governance headlines.';
            return null;
        },
    },
    {
        id: 'dirks_proxy_wins',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks prevails in proxy vote. Two new defense-friendly directors seated -- one is a former Pentagon procurement chief. Zhen calls the result "a mandate for Atlas Aegis." Gottlieb allies down to two seats.',
        params: { mu: 0.02, theta: 0.008, lambda: 0.2 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.boardDirks = Math.min(10, world.pnth.boardDirks + 2);
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 2);
        },
    },
    {
        id: 'dirks_proxy_loses',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks proxy fight fails. ISS recommends against her nominees, citing Atlas Aegis governance risks. Institutional investors side with Gottlieb. Zhen is silent for a week.',
        params: { mu: -0.01, theta: 0.005 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
        },
    },
    {
        id: 'dirks_resigns',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Chairwoman Dirks steps down citing "irreconcilable differences" with management. Atlas Aegis division reports to the interim committee. VP Bowman\'s office releases a terse one-line statement. Zhen calls it "a tragedy."',
        params: { mu: 0.03, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.boardDirks <= 4,
        effects: (world) => {
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 2);
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 2);
        },
    },

    // -- Activist investor ------------------------------------------------
    {
        id: 'activist_hedge_fund_stake',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'Crescent Capital discloses 8.1% stake in PNTH via 13D filing. Their letter to shareholders: "The Dirks-Gottlieb war has destroyed $20B in value. Atlas Sentinel is world-class. The governance is not." Threatens to nominate four independent directors.',
        magnitude: 'moderate',
        minDay: 300,
        when: (sim, world) => !world.pnth.activistStakeRevealed && !world.pnth.acquired,
        params: { mu: 0.02, theta: 0.015, lambda: 0.5 },
        effects: [ { path: 'pnth.activistStakeRevealed', op: 'set', value: true }, ],
        followups: [ { id: 'activist_board_seats', mtth: 35, weight: 0.6 }, { id: 'activist_buyback_demand', mtth: 20, weight: 0.4 }, ],
    },
    {
        id: 'activist_board_seats',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Crescent Capital wins two board seats in consent solicitation. New directors demand a strategic review of all four Atlas product lines and a potential sale of the Aegis division. Dirks pushes back.',
        params: { mu: 0.02, theta: 0.015 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.activistStakeRevealed,
        effects: (world) => {
            // Activist directors are independent — take from Dirks faction
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1);
        },
    },
    {
        id: 'activist_buyback_demand',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Crescent Capital publishes open letter demanding a $5B buyback and cost cuts. "Sentinel, Aegis, Companion, Crucible -- four products, zero coherent strategy." Malhotra privately agrees with half the letter.',
        params: { mu: 0.03, theta: -0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.activistStakeRevealed,
    },

    // -- Hostile takeover -------------------------------------------------
    {
        id: 'hostile_takeover_bid',
        category: 'pnth',
        likelihood: 0.1,
        headline: 'BREAKING: Northvane Technologies launches $68B hostile bid for PNTH at 45% premium. "Atlas Sentinel alone is worth the price. Aegis, Companion, Crucible are free options." Dirks and Gottlieb, for once, both oppose the bid.',
        magnitude: 'major',
        minDay: 500,
        when: (sim, world) => (world.pnth.boardDirks <= 5 || (world.pnth.dojSuitFiled && world.pnth.whistleblowerFiled)) && !world.pnth.acquired,
        params: { mu: 0.04, theta: 0.03, lambda: 1.5 },
        effects: [ { path: 'pnth.acquired', op: 'set', value: true }, ],
    },

    // -- Both ousted (rare, requires multiple scandal flags) ---------------
    {
        id: 'both_ousted',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'PNTH board fires both Dirks and Gottlieb in extraordinary session. Zhen brokers the deal, becomes acting Chair. "A fresh start." Atlas Aegis paused pending review. Sentinel and Crucible continue. The Sentinel runs a four-part series: "The Fall of Palanthropic."',
        params: { mu: -0.04, theta: 0.035, lambda: 1.5, muJ: -0.03 },
        magnitude: 'major',
        minDay: 600,
        when: (sim, world) => world.pnth.ceoIsGottlieb && world.pnth.whistleblowerFiled && world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched,
        effects: (world) => {
            world.pnth.ceoIsGottlieb = false;
            world.pnth.boardDirks = 3;
            world.pnth.boardGottlieb = 2;
        },
    },

    // =====================================================================
    //  ARC 2: BOWMAN / CORRUPTION
    // =====================================================================
    {
        id: 'bowman_lobbying_report',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'The Continental reports VP Bowman held $4M in PNTH stock while lobbying the Pentagon for the original Atlas Aegis contract. Dirks was at the same dinner. White House calls it "old news." Malhotra reviews the disclosure filings.',
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.senateProbeLaunched,
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        followups: [ { id: 'senate_investigation_opened', mtth: 35, weight: 0.4 }, { id: 'bowman_intervenes', mtth: 15, weight: 0.5 }, ],
    },
    {
        id: 'aclu_lawsuit_surveillance',
        category: 'pnth',
        likelihood: 0.6,
        headline: 'ACLU files landmark suit alleging Atlas Aegis was used for mass surveillance of civilians in the Farsistan theater. Seeks injunction blocking all Department of War contracts. Kassis is listed as a potential witness.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.militaryContractActive,
        portfolioFlavor: (portfolio) => {
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 10) return 'Your long PNTH position is under pressure. An injunction would freeze the defense revenue stream.';
            if (stockQty < -5) return 'Your short thesis is playing out. Surveillance lawsuits are kryptonite for government AI contractors.';
            return null;
        },
    },
    {
        id: 'senate_investigation_opened',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Sen. Okafor opens formal Senate Intelligence Committee investigation into PNTH-Bowman ties. Subpoenas issued for Atlas Aegis contract records and Dirks\' Pentagon meeting logs. Malhotra hires outside counsel.',
        magnitude: 'major',
        minDay: 150,
        when: (sim, world) => !world.pnth.senateProbeLaunched,
        params: { mu: -0.04, theta: 0.02, lambda: 0.8, muJ: -0.02 },
        effects: (world) => { world.pnth.senateProbeLaunched = true; world.investigations.okaforProbeStage = 1; shiftFaction('regulatoryExposure', 5); shiftFaction('farmerLaborSupport', 2); },
        followups: [{ id: 'congressional_hearing_pnth', mtth: 25, weight: 0.7 }],
    },
    {
        id: 'doj_antitrust_suit',
        category: 'pnth',
        likelihood: 0.4,
        headline: 'DOJ files antitrust suit against PNTH alleging monopolistic control of government AI procurement through Atlas Aegis and Crucible. "No single company should own both the weapons and the infrastructure," says the AG. Stock drops sharply.',
        params: { mu: -0.05, theta: 0.025, lambda: 1.0, muJ: -0.03 },
        magnitude: 'major',
        minDay: 300,
        when: (sim, world) => !world.pnth.dojSuitFiled && world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.dojSuitFiled = true;
            shiftFaction('regulatoryExposure', 8);
        },
        portfolioFlavor: (portfolio) => {
            const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
            if (hasOptions) return 'Your PNTH options just repriced violently. Antitrust litigation means elevated vol for months.';
            const stockQty = portfolio.positions.filter(p => p.type === 'stock').reduce((s, p) => s + p.qty, 0);
            if (stockQty > 10) return 'Your long equity position is bleeding on the DOJ headline. Antitrust suits take years.';
            return null;
        },
    },
    {
        id: 'bowman_intervenes',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'VP Bowman calls Atlas Aegis "vital to national security" and pressures DOD to fast-track contract renewals. Dirks sends a thank-you note that The Continental publishes in full. Stock rallies on the government support signal.',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.senateProbeLaunched,
    },
    {
        id: 'congressional_hearing_pnth',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Dirks and Gottlieb testify before Senate Intelligence Committee. Okafor grills Dirks on the Bowman dinner and the Atlas Aegis contract timeline. Gottlieb: "I warned the board repeatedly about Aegis. They chose revenue over ethics." Zhen declines to appear.',
        params: { mu: -0.03, theta: 0.02, lambda: 0.6 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.senateProbeLaunched,
        followups: [
            { id: 'ethics_board_revolt', mtth: 15, weight: 0.5 },
            { id: 'whistleblower_complaint', mtth: 30, weight: 0.4 },
        ],
    },
    {
        id: 'ethics_board_revolt',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Three of five PNTH ethics advisory board members resign in protest. Joint statement: "We recommended against Atlas Aegis deployment. We recommended Companion privacy safeguards. We were systematically ignored." Dirks dissolves the board entirely.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.5 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ethicsBoardIntact,
        effects: (world) => {
            world.pnth.ethicsBoardIntact = false;
            world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1);
            world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1);
        },
    },
    {
        id: 'whistleblower_complaint',
        followupOnly: true,
        category: 'pnth',
        likelihood: 1.0,
        headline: 'BREAKING: Senior PNTH engineer files SEC whistleblower complaint alleging Dirks ordered falsified safety testing on Atlas Aegis targeting modules before the Pentagon deployment. Kassis\'s internal safety memo is attached as Exhibit A.',
        magnitude: 'major',
        minDay: 250,
        when: (sim, world) => !world.pnth.whistleblowerFiled,
        params: { mu: -0.06, theta: 0.03, lambda: 1.5, muJ: -0.03 },
        effects: (world) => { world.pnth.whistleblowerFiled = true; world.pnth.boardDirks = Math.max(0, world.pnth.boardDirks - 1); world.pnth.boardGottlieb = Math.min(10, world.pnth.boardGottlieb + 1); shiftFaction('regulatoryExposure', 5); shiftFaction('firmStanding', -5); },
    },

    // =====================================================================
    //  ROUTINE PNTH (~14 events)
    // =====================================================================
    {
        id: 'defense_contract_won',
        category: 'pnth',
        likelihood: (sim, world) => world.geopolitical.aegisDemandSurge ? 2.0 : 1.0,
        headline: 'Dirks announces Atlas Aegis at a closed Pentagon briefing. $3.2B Department of War contract for battlefield integration -- largest defense AI award in history. Gottlieb learns about it from MarketWire. Malhotra\'s stock buyback begins the same afternoon.',
        magnitude: 'major',
        when: (sim, world) => !world.pnth.militaryContractActive && !world.pnth.acquired,
        params: { mu: 0.04, theta: -0.005, lambda: -0.2 },
        effects: (world) => {
            world.pnth.militaryContractActive = true;
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
            shiftFaction('firmStanding', 3);
            // Aegis contract win strengthens Dirks's board position
            world.pnth.boardDirks = Math.min(10, (world.pnth.boardDirks || 7) + 1);
        },
    },
    {
        id: 'defense_contract_cancelled',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'Pentagon cancels the Atlas Aegis contract citing "unresolved governance concerns." $3.2B evaporates overnight. Dirks scrambles to save the deal. Gottlieb releases a statement: "I take no pleasure in this." Zhen calls the Pentagon directly.',
        magnitude: 'major',
        when: (sim, world) => world.pnth.militaryContractActive,
        params: { mu: -0.03, theta: 0.015, lambda: 0.5, muJ: -0.02 },
        effects: (world) => { world.pnth.militaryContractActive = false; shiftFaction('firmStanding', -2); },
    },
    {
        id: 'dhs_contract_renewal',
        category: 'pnth',
        likelihood: 1.8,
        headline: 'DHS quietly renews the Atlas Sentinel border surveillance contract for another 3 years. $800M deal. MarketWire buries it below the fold. Dirks wanted to rebrand it as Aegis. Malhotra talked her out of it.',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'atlas_product_launch',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'Gottlieb unveils Atlas Sentinel for Healthcare: diagnostic imaging, drug discovery, clinical trials. "This is what Palanthropic was built for." Kassis demos the system live. Dirks skips the launch event.',
        params: { mu: 0.04, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
            shiftFaction('firmStanding', 2);
        },
    },
    {
        id: 'cloud_partnership',
        category: 'pnth',
        likelihood: 1.5,
        headline: 'PNTH announces strategic cloud partnership: Atlas Crucible infrastructure to power a major hyperscaler\'s AI offering. Malhotra on the earnings call: "Crucible is becoming the picks-and-shovels play." Analysts raise price targets.',
        params: { mu: 0.03, theta: -0.008 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'analyst_upgrade',
        category: 'pnth',
        likelihood: 2.0,
        headline: 'Goldman initiates PNTH at Overweight with $240 price target. "Atlas Sentinel is the enterprise moat, Aegis is the defense moat, Crucible is the infrastructure moat. Three moats for the price of one." Malhotra sends the note to the full board.',
        params: { mu: 0.02, theta: -0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'analyst_downgrade',
        category: 'pnth',
        likelihood: 1.5,
        headline: 'Morgan Stanley downgrades PNTH to Equal Weight. "The Dirks-Gottlieb war makes risk/reward unfavorable. Atlas Sentinel is best-in-class, but who is running the company?" Malhotra takes the call personally.',
        params: { mu: -0.02, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'hires_cto_kassis',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'Mira Kassis returns to PNTH as CTO after a five-month absence. Negotiated expanded authority over Atlas Sentinel and Companion product safety. "I came back because someone has to watch the store." Atlas Sentinel engineers cheer. Aegis team is wary.',
        params: { mu: 0.03, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.ctoIsMira && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.ctoIsMira = true;
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_annual_meeting',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'PNTH annual shareholder meeting draws record attendance. Heated Q&A on Atlas Aegis deployment rules, the Dirks-Gottlieb split, and the Bowman relationship. Malhotra presents Crucible growth numbers to change the subject. It half-works.',
        params: { mu: -0.005, theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'patent_suit_rival',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'DeepStar Labs sues PNTH for patent infringement, alleging Atlas Sentinel\'s core transformer architecture was derived from stolen research. Seeks injunction and $1.5B in damages. Kassis named personally in the complaint.',
        params: { mu: -0.02, theta: 0.01, lambda: 0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_hyperscaler_deal',
        category: 'pnth',
        likelihood: (sim, world) => world.geopolitical.crucibleCompetitionPressure ? 2.0 : 1.2,
        headline: 'PNTH signs multi-year Atlas Crucible inference partnership with a top-3 cloud provider. Guaranteed $1.8B minimum commitment. Malhotra: "Crucible is the commercial pivot Sentinel never was." Gottlieb calls it "renting out the family silver."',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && !world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_talent_exodus',
        category: 'pnth',
        likelihood: (sim, world) => {
            let base = 0.3;
            if (!world.pnth.ctoIsMira) base += 0.2;
            if (world.pnth.gottliebStartedRival) base += 0.3;
            return base;
        },
        headline: 'PNTH loses 15% of senior research staff in a single quarter. Atlas Sentinel team leads departing to Covenant AI and Big Tech. "The brain drain is real -- the Aegis controversy is kryptonite for recruiting," says a headhunter. Kassis\'s old team is hit hardest.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.4 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'pnth_stock_buyback',
        category: 'pnth',
        likelihood: 1.5,
        headline: 'PNTH board authorizes $3B accelerated share buyback. Dirks: "The market dramatically undervalues Atlas Aegis and Crucible." Malhotra structures the buyback to maximize EPS impact before the next earnings call.',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2, q: -0.001 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.boardDirks >= 6,
    },
    {
        id: 'pnth_data_center_fire',
        category: 'pnth',
        likelihood: 0.2,
        headline: 'Fire at PNTH\'s primary Ashburn data center takes Atlas Crucible and Companion offline for 18 hours. Sentinel enterprise clients scramble. Insurance covers the damage but customer trust is shaken. Kassis orders a full infrastructure audit.',
        params: { mu: -0.03, theta: 0.015, lambda: 0.6, muJ: -0.02 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },

    // -- Positive growth / commercial events ----------------------------------
    {
        id: 'pnth_sovereign_fund_investment',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'Abu Dhabi Investment Authority acquires 4.5% strategic stake in PNTH at a premium. "A generational bet on Atlas Crucible and Sentinel infrastructure," says ADIA managing director. Dirks lobbied for the deal personally. Zhen facilitated the introduction.',
        params: { mu: 0.04, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_enterprise_adoption_surge',
        category: 'pnth',
        likelihood: 1.2,
        headline: 'Atlas Sentinel enterprise bookings surge 85% QoQ as Fortune 100 companies accelerate adoption. Wait-list grows to 200+ companies. Malhotra on the investor call: "Sentinel demand is unprecedented. This is what happens when the product works."',
        params: { mu: 0.04, theta: -0.008, lambda: -0.2, q: 0.001 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_ai_research_breakthrough',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Kassis\'s research team publishes breakthrough in multi-modal reasoning. Atlas Sentinel achieves state-of-the-art on all major benchmarks. "Not even close," says the lead scientist. Dirks immediately asks if it can be adapted for Aegis.',
        params: { mu: 0.05, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.ctoIsMira,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_revenue_reacceleration',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Malhotra pre-announces Q3 revenue 20% above consensus. Atlas Sentinel pipeline "overflowing," Crucible utilization at 94%. Bears scramble to cover as the stock gaps higher. He doesn\'t mention Aegis civilian complaints.',
        params: { mu: 0.05, theta: -0.015, lambda: -0.3, q: 0.002 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired && world.pnth.commercialMomentum >= 0,
    },
    {
        id: 'pnth_cloud_arb_milestone',
        category: 'pnth',
        likelihood: 1.0,
        headline: 'Atlas Crucible revenue crosses $1B ARR milestone in record time. Malhotra: "Crucible is the fastest-growing product in enterprise infrastructure history." Gottlieb, privately: "That was supposed to be Sentinel\'s milestone."',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_international_expansion',
        category: 'pnth',
        likelihood: (sim, world) => world.geopolitical.aegisDemandSurge ? 2.0 : 0.8,
        headline: 'PNTH announces major Atlas Sentinel expansion into European and Asian markets. $2.4B in new international contracts. Malhotra: "Geographic diversification reduces our dependence on Aegis revenue." Dirks signs a separate Aegis MOU with the Meridine military.',
        params: { mu: 0.04, theta: -0.01, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.acquired,
    },
    {
        id: 'pnth_healthcare_fda_clearance',
        category: 'pnth',
        likelihood: 0.8,
        headline: 'FDA grants breakthrough device clearance to Atlas Sentinel\'s diagnostic platform -- first AI system approved for autonomous radiology. Gottlieb: "This is what I built this company for." Kassis leads the FDA presentation. Healthcare stocks rally in sympathy.',
        params: { mu: 0.05, theta: -0.01, lambda: -0.3 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.ceoIsGottlieb && !world.pnth.acquired,
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_custom_chip_announcement',
        category: 'pnth',
        likelihood: (sim, world) => world.geopolitical.crucibleCompetitionPressure ? 1.5 : 0.6,
        headline: 'Kassis unveils a custom AI accelerator chip for Atlas Crucible: 3x performance per watt vs. GPU incumbents. "We\'re done renting compute." Dirks sees it as an Aegis edge. Malhotra sees it as a Crucible margin play. Both are right.',
        params: { mu: 0.06, theta: -0.01, lambda: -0.3 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.acquired && world.pnth.ctoIsMira,
        // Crucible success boosts commercial momentum
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(3, (world.pnth.commercialMomentum || 0) + 1);
        },
    },
    {
        id: 'pnth_government_ai_czar',
        category: 'pnth',
        likelihood: 0.7,
        headline: 'Barron appoints a former PNTH executive as federal AI czar. Executive order mandates government-wide adoption of "American AI platforms." Atlas Sentinel and Crucible seen as primary beneficiaries. The Continental: "The revolving door spins faster."',
        params: { mu: 0.04, theta: -0.008, lambda: -0.2 },
        magnitude: 'moderate',
        when: (sim, world) => world.election.barronApproval > 40,
    },
    {
        id: 'pnth_sp500_inclusion',
        category: 'pnth',
        likelihood: 0.5,
        headline: 'PNTH added to S&P 500 effective next month. $18B in passive buying estimated. Malhotra: "Long overdue." MarketWire notes the irony: the most controversial AI company in Columbia is now in every retirement portfolio.',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2 },
        magnitude: 'moderate',
        minDay: 200,
        when: (sim, world) => !world.pnth.acquired,
    },

    // =====================================================================
    //  PRODUCT CHAIN: ATLAS AEGIS DEPLOYMENT
    // =====================================================================
    {
        id: 'aegis_deployment_announced',
        category: 'pnth',
        headline: 'Dirks confirms Atlas Aegis deployment in the Farsistan theater at a Senate Armed Services hearing. Gottlieb is conspicuously absent from the witness table. PNTH surges 6% in after-hours.',
        likelihood: (sim, world) => world.geopolitical.aegisDemandSurge ? 5.0 : 3,
        params: { mu: 0.03, theta: 0.01 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.aegisDeployed && world.pnth.militaryContractActive,
        effects: (world) => {
            world.pnth.aegisDeployed = true;
            world.pnth.aegisControversy = 1;
            shiftFaction('firmStanding', 2);
            shiftFaction('regulatoryExposure', 2);
            // Aegis deployment milestone strengthens Dirks's board position
            world.pnth.boardDirks = Math.min(10, (world.pnth.boardDirks || 7) + 1);
        },
        era: 'mid',
        followups: [
            { id: 'aegis_first_incident', mtth: 45, weight: 1 },
        ],
    },
    {
        id: 'aegis_first_incident',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'First confirmed Atlas Aegis autonomous engagement in Operation Dustwalker. The Pentagon calls it "a precision strike." The Continental publishes satellite imagery suggesting civilian structures nearby.',
        params: { theta: 0.01, mu: -0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.aegisDeployed,
        effects: (world) => {
            world.pnth.aegisControversy = Math.min(3, world.pnth.aegisControversy + 1);
            // Military controversy makes enterprise clients nervous about the brand
            world.pnth.commercialMomentum = Math.max(-3, (world.pnth.commercialMomentum || 0) - 1);
        },
        followups: [
            { id: 'aegis_gottlieb_dissent', mtth: 20, weight: 1 },
        ],
    },
    {
        id: 'aegis_gottlieb_dissent',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'Gottlieb breaks months of silence. An op-ed in The Continental: "I Built Palanthropic to Solve Problems, Not Create Casualties." Dirks calls an emergency board meeting. Zhen doesn\'t pick up.',
        params: { theta: 0.015 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.aegisControversy >= 2,
        effects: (world) => {
            world.pnth.boardGottlieb = Math.max(0, world.pnth.boardGottlieb - 1);
            // Military controversy makes enterprise clients nervous about the brand
            world.pnth.commercialMomentum = Math.max(-3, (world.pnth.commercialMomentum || 0) - 1);
        },
    },

    // =====================================================================
    //  PRODUCT CHAIN: ATLAS COMPANION LAUNCH
    // =====================================================================
    {
        id: 'companion_launch',
        category: 'pnth',
        headline: 'Atlas Companion launches to consumers. Malhotra\'s earnings call: "Ten million downloads in the first week." Wall Street raises price targets across the board. The Meridian Brief: "Is this the iPhone moment for AI?"',
        likelihood: 2,
        params: { mu: 0.04 },
        magnitude: 'major',
        when: (sim, world) => !world.pnth.companionLaunched && world.pnth.commercialMomentum >= 1,
        effects: (world) => { world.pnth.companionLaunched = true; shiftFaction('firmStanding', 3); },
        era: 'mid',
        followups: [
            { id: 'companion_200m', mtth: 60, weight: 1 },
        ],
    },
    {
        id: 'companion_200m',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: '200 million Atlas Companion users in 90 days. The Sentinel runs a segment: "Columbia\'s New Best Friend." A Continental editorial: "Who Is Companion Talking To?" Companion scandal stage: brewing.',
        params: { mu: 0.02, theta: 0.005 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.companionLaunched,
        effects: (world) => { world.pnth.companionScandal = 1; },
        followups: [
            { id: 'companion_boyfriend', mtth: 30, weight: 1 },
            { id: 'companion_teen_addiction', mtth: 40, weight: 1 },
        ],
    },
    {
        id: 'companion_boyfriend',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: '"My Atlas Companion Told Me It Loved Me": a viral MarketWire feature on parasocial AI relationships hits 50 million reads. Reyes cites it on the House floor arguing for the Digital Markets Accountability Act.',
        params: { theta: 0.005 },
        magnitude: 'minor',
        when: (sim, world) => world.pnth.companionScandal >= 1,
        effects: (world) => {
            world.pnth.companionScandal = Math.min(3, world.pnth.companionScandal + 1);
            // Scandal spillover: congressional scrutiny of one PNTH product spills to others
            world.pnth.aegisControversy = Math.min(3, (world.pnth.aegisControversy || 0) + 1);
            // Companion scandal erodes Gottlieb's board standing
            world.pnth.boardGottlieb = Math.max(0, (world.pnth.boardGottlieb || 3) - 1);
        },
    },
    {
        id: 'companion_teen_addiction',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'A Columbian pediatrics journal publishes data showing teens spend an average of 4.2 hours daily talking to Atlas Companion. Okafor: "We need hearings." Malhotra: "Engagement metrics are strong."',
        params: { theta: 0.008 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.companionScandal >= 1,
        effects: (world) => {
            world.pnth.companionScandal = Math.min(3, world.pnth.companionScandal + 1);
            shiftFaction('regulatoryExposure', 2);
            shiftFaction('firmStanding', -2);
            // Scandal spillover: congressional scrutiny of one PNTH product spills to others
            world.pnth.aegisControversy = Math.min(3, (world.pnth.aegisControversy || 0) + 1);
            // Companion scandal erodes Gottlieb's board standing
            world.pnth.boardGottlieb = Math.max(0, (world.pnth.boardGottlieb || 3) - 1);
        },
    },

    // =====================================================================
    //  PRODUCT CHAIN: ATLAS FOUNDRY SUPPLY
    // =====================================================================
    {
        id: 'crucible_launch',
        category: 'pnth',
        headline: 'Palanthropic quietly opens Atlas Crucible to external clients. MarketWire buries it below the fold. Within three months, 60% of Columbian AI startups are training on Crucible infrastructure.',
        likelihood: 2,
        params: { mu: 0.02 },
        magnitude: 'moderate',
        when: (sim, world) => !world.pnth.crucibleLaunched,
        effects: (world) => {
            world.pnth.crucibleLaunched = true;
            // Crucible success boosts commercial momentum
            world.pnth.commercialMomentum = Math.min(3, (world.pnth.commercialMomentum || 0) + 1);
        },
        era: 'mid',
        followups: [
            { id: 'crucible_outage', mtth: 90, weight: 1 },
        ],
    },
    {
        id: 'crucible_outage',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'Atlas Crucible goes dark for 11 hours. Half the tech sector\'s AI products freeze. Priya Sharma: "This is what a single point of failure looks like." Zhaowei offers its own infrastructure as an alternative.',
        params: { mu: -0.03, theta: 0.02, lambda: 1.0 },
        magnitude: 'major',
        when: (sim, world) => world.pnth.crucibleLaunched,
        effects: () => { shiftFaction('firmStanding', -2); },
        followups: [
            { id: 'crucible_zhaowei_leverage', mtth: 30, weight: 1 },
        ],
    },
    {
        id: 'crucible_zhaowei_leverage',
        followupOnly: true,
        category: 'pnth',
        likelihood: 0,
        headline: 'Premier Liang Wei\'s trade delegation offers a deal: Zhaowei Semiconductor Accord renewal in exchange for Crucible access. Lassiter calls it "digital surrender." Barron is tempted.',
        params: { theta: 0.01 },
        magnitude: 'moderate',
        when: (sim, world) => world.pnth.crucibleLaunched && world.geopolitical.sericaRelations < 0,
    },

    // -- PNTH earnings events --
    {
        id: 'pnth_earnings_beat_strong',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 1.5;
            if (world.pnth.commercialMomentum > 0) base += 1.0;
            if (world.pnth.militaryContractActive) base += 0.5;
            return base;
        },
        headline: 'Malhotra delivers a blowout earnings call: Atlas Sentinel revenue up 40% YoY, Crucible bookings up 60%. Raises full-year guidance. He doesn\'t mention Aegis civilian complaints. Gottlieb doesn\'t attend.',
        magnitude: 'moderate',
        params: { mu: 0.03, theta: -0.005, lambda: -0.2, q: 0.002 },
    },
    {
        id: 'pnth_earnings_beat_mild',
        category: 'pnth_earnings',
        likelihood: 2.0,
        headline: 'PNTH edges past consensus: EPS $1.42 vs $1.38 expected. Sentinel revenue in line, Crucible slightly ahead. Malhotra maintains guidance. "Solid but unspectacular," says Barclays. Aegis revenue classified as usual.',
        magnitude: 'minor',
        params: { mu: 0.01, theta: -0.003 },
    },
    {
        id: 'pnth_earnings_inline',
        category: 'pnth_earnings',
        likelihood: 3.0,
        headline: 'PNTH reports exactly in line with consensus. No guidance change. Malhotra tries to discuss Crucible growth but the conference call devolves into governance questions about Dirks, Gottlieb, and the Aegis contract.',
        params: { mu: 0.005, theta: 0.002 },
        magnitude: 'minor',
        portfolioFlavor: (portfolio) => {
            const hasOptions = portfolio.positions.some(p => p.type === 'call' || p.type === 'put');
            if (hasOptions) return 'Inline earnings means IV crush on your options. Theta wins this round.';
            return null;
        },
    },
    {
        id: 'pnth_earnings_miss_mild',
        category: 'pnth_earnings',
        likelihood: 2.0,
        headline: 'PNTH misses on revenue, beats on EPS via cost cuts. Malhotra blames "Atlas Aegis contract timing delays." Analysts question whether Sentinel organic growth is stalling. Gottlieb posts a cryptic quote about "houses built on sand."',
        params: { mu: -0.02, theta: 0.008, lambda: 0.3 },
        magnitude: 'minor',
    },
    {
        id: 'pnth_earnings_miss_bad',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 0.5;
            if (world.pnth.commercialMomentum < 0) base += 0.5;
            if (world.investigations.okaforProbeStage >= 2) base += 0.3;
            if (!world.pnth.ctoIsMira) base += 0.2;
            return base;
        },
        headline: 'PNTH disaster quarter: Sentinel revenue misses by 12%, Crucible utilization drops to 61%, three major Companion enterprise clients pause contracts. Malhotra slashes guidance. Dirks faces board questions. Zhen calls it "a temporary setback."',
        magnitude: 'moderate',
        params: { mu: -0.03, theta: 0.012, lambda: 0.4, muJ: -0.01, q: -0.002 },
        effects: [ { path: 'pnth.commercialMomentum', op: 'add', value: -1 }, ],
    },
    {
        id: 'pnth_guidance_raise',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 1.5;
            if (world.pnth.commercialMomentum >= 1) base += 0.5;
            if (world.pnth.commercialMomentum >= 2) base += 0.5;
            return base;
        },
        headline: 'Malhotra raises full-year revenue guidance by 15%, citing "unprecedented Atlas Sentinel enterprise adoption and Crucible pipeline growth." Lifts margin target. Bull case intact. Even Gottlieb concedes the numbers are impressive.',
        params: { mu: 0.03, theta: -0.008, lambda: -0.2, q: 0.001 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.commercialMomentum = Math.min(2, world.pnth.commercialMomentum + 1);
        },
    },
    {
        id: 'pnth_guidance_cut',
        category: 'pnth_earnings',
        likelihood: (sim, world) => {
            let base = 0.8;
            if (world.pnth.commercialMomentum <= -1) base += 0.5;
            if (world.pnth.dojSuitFiled) base += 0.3;
            return base;
        },
        headline: 'Malhotra slashes guidance mid-quarter citing "regulatory headwinds on Aegis and Companion customer hesitation." Withdraws full-year outlook entirely. "Visibility is low across all four product lines." Dirks blames the Senate investigation.',
        params: { mu: -0.03, theta: 0.012, lambda: 0.5, muJ: -0.01, q: -0.001 },
        magnitude: 'moderate',
        effects: (world) => {
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },

    // -- One-shot compound events --
    {
        id: 'compound_pnth_war_profits',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.militaryContractActive && world.geopolitical.mideastEscalation >= 2,
        headline: 'Atlas Aegis drone footage from Operation Dustwalker leaks to The Continental. PNTH stock surges on expanded Pentagon contracts even as Gottlieb issues a rare public dissent. "This is not what I built this company for."',
        magnitude: 'major',
        superevent: true,
        params: { mu: 0.04, theta: 0.01 },
        effects: (world) => {
            world.pnth.boardDirks = Math.min(12, world.pnth.boardDirks + 1);
            world.pnth.commercialMomentum = Math.max(-2, world.pnth.commercialMomentum - 1);
        },
    },
    {
        id: 'compound_pnth_perfect_storm',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.dojSuitFiled && world.pnth.senateProbeLaunched && world.pnth.whistleblowerFiled,
        headline: 'DOJ suit. Okafor subpoena. Kassis\'s whistleblower filing. Palanthropic faces simultaneous legal assault on three fronts. Malhotra\'s emergency earnings call lasts eleven minutes. Zhen cancels all meetings.',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.05, theta: 0.03, lambda: 2.0 },
        effects: (world) => {
            world.pnth.ethicsBoardIntact = false;
            world.pnth.commercialMomentum = -2;
        },
    },
    {
        id: 'compound_covenant_sanctions',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.gottliebStartedRival && world.geopolitical.tradeWarStage >= 2 &&
            world.geopolitical.sanctionsActive,
        headline: 'Gottlieb\'s Covenant AI lands its first major contract — a Serican firm sanctioned under Lassiter\'s trade regime. The irony is not lost on The Continental: "Palanthropic\'s Prodigal Son Sells to the Enemy."',
        magnitude: 'moderate',
        params: { theta: 0.01, lambda: 0.5 },
    },
    {
        id: 'compound_pnth_south_america',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.geopolitical.southAmericaOps >= 2 && world.pnth.militaryContractActive,
        headline: 'The Continental publishes leaked Atlas Sentinel deployment logs from the Southern Hemisphere Initiative. Madero holds a press conference in Caracas demanding Columbia extradite "the corporate spies." PNTH stock halts trading.',
        magnitude: 'moderate',
        params: { theta: 0.01 },
        effects: (world) => {
            world.pnth.boardGottlieb = Math.min(12, world.pnth.boardGottlieb + 1);
        },
    },
    {
        id: 'compound_companion_intelligence',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.companionLaunched &&
            world.pnth.companionScandal >= 2 &&
            world.geopolitical.farsistanEscalation >= 1,
        headline: 'Rachel Tan publishes proof that Atlas Companion user data was accessible to Farsistani intelligence via a sovereign wealth fund side-letter. 200 million users. Zero disclosure. Okafor schedules emergency hearings.',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.06, theta: 0.03, lambda: 2.0 },
    },
    {
        id: 'compound_aegis_war_crime',
        category: 'pnth',
        likelihood: 0,
        oneShot: true,
        when: (sim, world, congress, ctx) =>
            world.pnth.aegisDeployed &&
            world.pnth.aegisControversy >= 2 &&
            world.geopolitical.farsistanEscalation >= 2,
        headline: 'An Atlas Aegis autonomous targeting decision kills 34 civilians in a Farsistani border village. Kassis leaks the decision logs to The Continental. Gottlieb calls for Dirks\'s resignation. Navon denies involvement.',
        magnitude: 'major',
        superevent: true,
        params: { mu: -0.05, theta: 0.03, lambda: 2.5 },
    },
];
