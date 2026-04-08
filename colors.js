/* ===================================================
   colors.js -- Shoals project-specific design tokens.
   Maps financial concepts to shared extended palette
   colors and injects themed CSS custom properties.
   =================================================== */

// --- Financial Color Aliases ---
_PALETTE.up    = _PALETTE.extended.green;
_PALETTE.down  = _PALETTE.extended.rose;
_PALETTE.call  = _PALETTE.extended.green;
_PALETTE.put   = _PALETTE.extended.rose;
_PALETTE.stock = _PALETTE.extended.orange;
_PALETTE.bond  = _PALETTE.extended.blue;
_PALETTE.delta = _PALETTE.extended.blue;
_PALETTE.gamma = _PALETTE.extended.orange;
_PALETTE.theta = _PALETTE.extended.cyan;
_PALETTE.vega  = _PALETTE.extended.purple;
_PALETTE.rho   = _PALETTE.extended.slate;
_PALETTE.vix   = _PALETTE.extended.purple;

_freezeTokens();

// --- CSS Variable Injection ---
(function() {
  const P = _PALETTE, L = P.light, D = P.dark;
  _injectProjectVars(
    `  --up: ${P.up};
  --down: ${P.down};
  --call: ${P.call};
  --put: ${P.put};
  --stock: ${P.stock};
  --bond: ${P.bond};
  --delta: ${P.delta};
  --gamma: ${P.gamma};
  --theta: ${P.theta};
  --vega: ${P.vega};
  --rho: ${P.rho};
  --vix: ${P.vix};
  --chart-grid: ${_r(L.text, 0.06)};
  --chart-crosshair: ${_r(L.text, 0.25)};
  --chart-axis: ${L.textSecondary};
  --chain-hover: ${_r(L.text, 0.04)};
  --dialog-bg: ${L.panelSolid};`,
    `  --chart-grid: ${_r(D.text, 0.06)};
  --chart-crosshair: ${_r(D.text, 0.25)};
  --chart-axis: ${D.textSecondary};
  --chain-hover: ${_r(D.text, 0.06)};
  --dialog-bg: ${D.panelSolid};`
  );
})();
