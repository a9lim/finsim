/* ===================================================
   config.js -- Named constants and preset definitions
   for the Shoals trading simulator.
   =================================================== */

export const TRADING_DAYS_PER_YEAR = 252;
export const INTRADAY_STEPS = 16;
export const INITIAL_PRICE = 100;
export const INITIAL_CAPITAL = 100000;
export const STRIKE_INTERVAL = 5;
export const STRIKE_RANGE = 12;
export const BOND_FACE_VALUE = 100;
export const MAINTENANCE_MARGIN = 0.25;
export const REG_T_MARGIN = 0.50;
export const SHORT_OPTION_MARGIN_PCT = 0.20;
export const HISTORY_CAPACITY = 256;
export const SPEED_OPTIONS = [1, 2, 4, 8, 16];

export const PRESETS = [
    { name: 'Calm Bull', mu: 0.08, theta: 0.04, kappa: 3.0, xi: 0.3, rho: -0.5, lambda: 0.5, muJ: -0.02, sigmaJ: 0.03, a: 0.5, b: 0.04, sigmaR: 0.005 },
    { name: 'Sideways', mu: 0.02, theta: 0.06, kappa: 2.0, xi: 0.4, rho: -0.6, lambda: 1.0, muJ: -0.01, sigmaJ: 0.04, a: 0.5, b: 0.03, sigmaR: 0.008 },
    { name: 'Volatile', mu: 0.05, theta: 0.12, kappa: 1.5, xi: 0.6, rho: -0.7, lambda: 3.0, muJ: -0.03, sigmaJ: 0.06, a: 0.3, b: 0.05, sigmaR: 0.012 },
    { name: 'Crisis', mu: -0.10, theta: 0.25, kappa: 0.5, xi: 0.8, rho: -0.85, lambda: 8.0, muJ: -0.08, sigmaJ: 0.10, a: 0.2, b: 0.02, sigmaR: 0.020 },
    { name: 'Rate Hike', mu: 0.04, theta: 0.08, kappa: 2.0, xi: 0.5, rho: -0.6, lambda: 1.5, muJ: -0.02, sigmaJ: 0.05, a: 0.8, b: 0.08, sigmaR: 0.015 },
];
export const DEFAULT_PRESET = 0;
