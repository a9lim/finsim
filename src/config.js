/* ===================================================
   config.js -- Named constants and preset definitions
   for the Shoals trading simulator.
   =================================================== */

// -- Simulation timing --
export const TRADING_DAYS_PER_YEAR = 252;
export const INTRADAY_STEPS = 16;
export const QUARTERLY_CYCLE = 63; // trading days per quarter (approximate)
export const HISTORY_CAPACITY = 252;
export const BINOMIAL_STEPS = 128;
export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

// -- Instruments --
export const INITIAL_PRICE = 100;
export const BOND_FACE_VALUE = 100;
export const STRIKE_INTERVAL = 5;
export const STRIKE_RANGE = 12;     // strikes each side of ATM
export const EXPIRY_COUNT = 8;      // number of active expiry dates

// -- Portfolio & margin --
export const INITIAL_CAPITAL = 10000;
export const MAINTENANCE_MARGIN = 0.25;
export const REG_T_MARGIN = 0.50;
export const SHORT_OPTION_MARGIN_PCT = 0.20;

// -- Bid/ask spread model --
export const SPREAD_PCT = 0.01;            // 1% of mid price
export const MONEYNESS_SPREAD_WEIGHT = 0.05; // weight on |log(S/K)| for options

// -- Event engine --
export const MAX_EVENT_LOG = 20;           // max event log entries displayed
export const MAX_FOLLOWUP_DEPTH = 5;       // max recursion depth for MTTH chains
export const FED_MEETING_INTERVAL = 32;    // ~252/8 trading days between FOMC meetings
export const MIDTERM_DAY = HISTORY_CAPACITY + 504;            // ~2 years into live trading
export const CAMPAIGN_START_DAY = HISTORY_CAPACITY + 440;     // campaign season starts ~2 months before midterms
export const NON_FED_POISSON_RATE = 1 / 30; // base rate, effective ~1/41.5 with cooldown
export const NON_FED_COOLDOWN_MIN = 8;
export const NON_FED_COOLDOWN_MAX = 15;
export const FED_MEETING_JITTER = 4;       // +/-4 day jitter on FOMC schedule
export const BOREDOM_THRESHOLD = 3;        // consecutive minor events before boost
export const TERM_END_DAY = HISTORY_CAPACITY + 1008;          // 4 years into live trading
export const PNTH_EARNINGS_INTERVAL = 63;  // quarterly earnings, aligned with QUARTERLY_CYCLE
export const PNTH_EARNINGS_JITTER = 5;     // +/-5 day jitter on earnings schedule

// -- Chart rendering --
export const CHART_Y_AXIS_W = 64;          // right-side Y-axis label area (CSS px)
export const CHART_Y_LABEL_W = 18;         // left-side rotated label (CSS px)
export const CHART_X_AXIS_H = 32;          // bottom X-axis label area (CSS px)
export const CHART_PADDING_T = 24;         // top padding (CSS px)
export const CHART_SLOT_PX = 12;           // px per day at zoom=1
export const CHART_BODY_RATIO = 0.6;       // fraction of slot that is candle body
export const CHART_LEFT_MARGIN = 80;       // left margin for camera positioning (CSS px)
export const CHART_AUTOSCROLL_PCT = 0.85;  // keep latest candle at this screen fraction

// -- Strategy rendering --
export const STRATEGY_SAMPLES = 200;       // sample points across X range
export const STRATEGY_Y_PAD = 0.15;        // 15% vertical padding
export const STRATEGY_MARGIN = { top: 24, right: 16, bottom: 48, left: 68 };

// -- Presets --
const _CALM_BULL = { name: 'Calm Bull', mu: 0.48, theta: 0.06, kappa: 2.5, xi: 0.4, rho: -0.6, lambda: 0.6, muJ: -0.02, sigmaJ: 0.04, a: 0.5, b: 0.04, sigmaR: 0.005, borrowSpread: 0.5, q: 0.005 };

export const PRESETS = [
    _CALM_BULL,
    { name: 'Sideways', mu: 0.12, theta: 0.08, kappa: 2.0, xi: 0.45, rho: -0.6, lambda: 1.0, muJ: -0.01, sigmaJ: 0.04, a: 0.5, b: 0.04, sigmaR: 0.008, borrowSpread: 0.5, q: 0.003 },
    { name: 'Volatile', mu: 0.35, theta: 0.15, kappa: 1.5, xi: 0.7, rho: -0.75, lambda: 3.0, muJ: -0.03, sigmaJ: 0.07, a: 0.3, b: 0.05, sigmaR: 0.012, borrowSpread: 0.5, q: 0.0 },
    { name: 'Crisis', mu: -0.20, theta: 0.30, kappa: 0.4, xi: 0.9, rho: -0.85, lambda: 10.0, muJ: -0.10, sigmaJ: 0.12, a: 0.2, b: 0.01, sigmaR: 0.025, borrowSpread: 1.0, q: 0.0 },
    { name: 'Rate Hike', mu: 0.20, theta: 0.10, kappa: 2.0, xi: 0.5, rho: -0.65, lambda: 1.5, muJ: -0.02, sigmaJ: 0.05, a: 1.0, b: 0.08, sigmaR: 0.015, borrowSpread: 0.8, q: 0.003 },
    { ..._CALM_BULL, name: 'Dynamic (Offline)' },
    { ..._CALM_BULL, name: 'Dynamic (LLM)' },
];
export const DEFAULT_PRESET = 5;
