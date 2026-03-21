/* =====================================================
   reference.js -- Reference overlay content for Shoals.

   Each key matches a data-info attribute in the HTML.
   Bodies use HTML with KaTeX math: $$...$$ for display,
   $...$ for inline. KaTeX loaded via CDN in index.html.
   ===================================================== */

export const REFERENCE = {

    // -----------------------------------------------------------------------
    // Pricing Models
    // -----------------------------------------------------------------------

    gbm: {
        title: 'Geometric Brownian Motion',
        body: `
<p>The stock price follows GBM with Merton jump-diffusion and continuous dividend yield $q$.
Euler-Maruyama discretisation with full truncation for the variance process.</p>

<h3>Drift &amp; Diffusion</h3>
$$\\tfrac{dS}{S} = (\\mu - q - \\lambda k - \\tfrac{1}{2} v)\\,dt + \\sqrt{v}\\,dW_1$$
<p>The drift term includes the expected return $\\mu$, dividend drain $q$, and a
jump compensator $\\lambda k$ that keeps the drift consistent after adding jumps.</p>

<h3>Jump Component</h3>
<p>Jumps arrive as a Poisson process $N(\\lambda)$ with rate $\\lambda$ per year.
Each jump size $J$ is log-normal: $\\ln(1+J) \\sim \\mathcal{N}(\\mu_J,\\, \\sigma_J^2)$.
Negative $\\mu_J$ produces a downward skew in the jump distribution.</p>

<h3>Simulation Parameters</h3>
<p>16 sub-steps per trading day ($dt = 1/4032$). Correlated Brownian motions
via Cholesky decomposition. Box-Muller for normal variates,
inverse-transform for Poisson counts.</p>
`,
    },

    heston: {
        title: 'Heston Stochastic Volatility',
        body: `
<p>Volatility is not constant -- it follows its own mean-reverting stochastic process
correlated with the stock price.</p>

<h3>Variance Dynamics</h3>
$$dv = \\kappa(\\theta - v)\\,dt + \\xi\\sqrt{v}\\,dW_2$$
<p>$\\theta$ is the long-run variance level. $\\kappa$ controls the speed of mean reversion.
$\\xi$ (vol of vol) determines how erratically volatility itself moves.</p>

<h3>Leverage Effect</h3>
<p>The correlation $\\rho$ between $dW_1$ and $dW_2$ is typically negative ($-0.5$ to $-0.85$),
meaning price drops tend to coincide with volatility spikes. This produces the
volatility smile/skew observed in real option markets.</p>

<h3>Feller Condition</h3>
<p>When $2\\kappa\\theta > \\xi^2$, the variance process stays strictly positive.
The simulation uses full truncation (floor $v$ at 0) as a safeguard
when parameters violate this condition.</p>
`,
    },

    vasicek: {
        title: 'Vasicek Interest Rate Model',
        body: `
<p>The risk-free rate follows an Ornstein-Uhlenbeck process, allowing rates
to fluctuate stochastically around a long-run mean.</p>

<h3>Rate Dynamics</h3>
$$dr = a(b - r)\\,dt + \\sigma_R\\,dW_3$$
<p>The parameter $a$ controls mean-reversion speed, $b$ is the long-run equilibrium rate,
and $\\sigma_R$ is the rate volatility. $dW_3$ is independent of the stock and variance processes.</p>

<h3>Negative Rates</h3>
<p>Unlike CIR, the Vasicek model permits negative interest rates.
Option pricing uses $r_{\\text{eff}} = \\max(r,\\, 10^{-7})$ to prevent degenerate boundary behavior
in the Bjerksund-Stensland approximation.</p>

<h3>Bond Pricing</h3>
<p>Zero-coupon bonds are priced as $100 \\times \\exp(-r \\times T)$, so bond prices
move inversely with rates. Rate hikes decrease bond values; rate cuts increase them.</p>
`,
    },

    bjerksund: {
        title: 'Bjerksund-Stensland 2002',
        body: `
<p>Analytical approximation for American option pricing with continuous dividend yield.
More accurate than the 1993 version, splitting the time domain at the golden ratio.</p>

<h3>Exercise Boundary</h3>
<p>Computes a perpetual exercise boundary and interpolates between two time regions.
Uses $\\varphi$ and $\\psi$ helper functions with bivariate normal CDF
(Drezner-Wesolowsky 1990, 20-point Gauss-Legendre quadrature).</p>

<h3>Cost of Carry</h3>
<p>$b = r - q$, where $q$ is the continuous dividend yield. When $b \\geq r$ (i.e., $q \\leq 0$),
early exercise of calls is never optimal, so the model falls back to European Black-Scholes.</p>

<h3>Put-Call Symmetry</h3>
<p>American puts are priced via symmetry: $P(S, K, T, r, q, \\sigma) = C(K, S, T, q, r, \\sigma)$.
This avoids a separate put boundary computation.</p>
`,
    },

    // -----------------------------------------------------------------------
    // Greeks
    // -----------------------------------------------------------------------

    delta: {
        title: 'Delta ($\\Delta$)',
        body: `
<p>Rate of change of option price with respect to the underlying stock price.
Measures directional exposure.</p>

<h3>Interpretation</h3>
<p>A delta of 0.60 means the option gains ~$0.60 for each $1 increase in the stock.
Calls have positive delta (0 to 1); puts have negative delta ($-1$ to $0$).
Deep ITM options approach $\\pm 1$; deep OTM options approach 0.</p>

<h3>Computation</h3>
<p>Central finite difference in $S$ with step $h = S \\times 0.01$.</p>
$$\\Delta = \\frac{V(S+h) - V(S-h)}{2h}$$

<h3>Portfolio Delta</h3>
<p>Aggregate delta across all option positions. A delta-neutral portfolio
has near-zero directional exposure to small price moves.</p>
`,
    },

    gamma: {
        title: 'Gamma ($\\Gamma$)',
        body: `
<p>Rate of change of delta with respect to the stock price.
Measures convexity of the option's payoff.</p>

<h3>Interpretation</h3>
<p>High gamma means delta changes rapidly -- the option's sensitivity to
price moves is itself sensitive. ATM options near expiry have the highest gamma.
Long options have positive gamma (beneficial convexity); short options have negative gamma.</p>

<h3>Computation</h3>
<p>Second central finite difference in $S$.</p>
$$\\Gamma = \\frac{V(S+h) - 2V(S) + V(S-h)}{h^2}$$

<h3>Gamma Risk</h3>
<p>Short gamma positions face amplifying losses from large moves in either direction.
This is why selling options near expiry is particularly risky.</p>
`,
    },

    theta_greek: {
        title: 'Theta ($\\Theta$)',
        body: `
<p>Rate of change of option price with respect to time.
Measures time decay -- the erosion of option value as expiry approaches.</p>

<h3>Interpretation</h3>
<p>Theta is typically negative for long options: each passing day reduces the option's
time value. Short option positions benefit from time decay (positive theta).
ATM options have the most theta; deep ITM/OTM have less.</p>

<h3>Computation</h3>
<p>Central finite difference in $T$ with step $h = 1/252$ (one trading day).</p>
$$\\Theta = \\frac{V(T-h) - V(T+h)}{2h}$$
<p>Near expiry, the denominator adjusts to prevent instability.</p>

<h3>Weekend Decay</h3>
<p>This simulation uses trading days (252/year), so theta applies uniformly.
In real markets, weekend/holiday decay is a separate consideration.</p>
`,
    },

    vega: {
        title: 'Vega ($\\nu$)',
        body: `
<p>Sensitivity of option price to changes in implied volatility.
Not a Greek letter, but universally called "Vega" in practice.</p>

<h3>Interpretation</h3>
<p>Vega is always positive for long options: higher volatility increases
the probability of large moves, making the option more valuable.
ATM options have the highest vega; longer-dated options have more vega than shorter.</p>

<h3>Computation</h3>
<p>Central finite difference in $\\sigma$ with step $h = 0.001$.</p>
$$\\nu = \\frac{V(\\sigma+h) - V(\\sigma-h)}{2h}$$

<h3>Vega &amp; Heston</h3>
<p>In this simulation, volatility is stochastic (Heston model), so the $\\sigma$ used for
Greeks is the instantaneous $\\sqrt{v}$, which changes each sub-step. Real vega exposure
depends on the full vol surface, not just spot vol.</p>
`,
    },

    rho_greek: {
        title: 'Rho ($\\rho$)',
        body: `
<p>Sensitivity of option price to changes in the risk-free interest rate.</p>

<h3>Interpretation</h3>
<p>Calls generally have positive rho (higher rates increase call value via
higher forward price). Puts have negative rho. The effect is typically small
compared to delta, gamma, and vega for short-dated options.</p>

<h3>Computation</h3>
<p>Central finite difference in $r$ with step $h = 0.0001$.</p>
$$\\rho = \\frac{V(r+h) - V(r-h)}{2h}$$

<h3>Vasicek Interaction</h3>
<p>Since the risk-free rate follows a Vasicek process in this simulation,
rho exposure is more meaningful than in fixed-rate models.
Rate hikes/cuts directly affect both option and bond valuations.</p>
`,
    },

    // -----------------------------------------------------------------------
    // Market Mechanics
    // -----------------------------------------------------------------------

    bidask: {
        title: 'Bid-Ask Spreads',
        body: `
<p>All instruments trade with a volatility-aware bid-ask spread.
You buy at the ask (higher) and sell at the bid (lower).</p>

<h3>Spread Model</h3>
$$\\text{halfSpread} = \\max\\!\\big(\\text{minHalf},\\; \\text{mid} \\times \\text{pct} \\times (1 + \\sigma) + w \\cdot |\\ln(S/K)|\\big)$$
<p>Higher volatility widens spreads. For options, deep OTM/ITM strikes have
wider spreads due to the moneyness term. Stock and bond spreads omit the moneyness component.</p>

<h3>Fill Prices</h3>
<p>Long (buy) orders fill at the ask. Short (sell) orders fill at the bid.
The spread is the implicit transaction cost of each trade.</p>

<h3>Tooltip Display</h3>
<p>Hover over any price cell to see the bid/ask prices.
The displayed mid-price is the theoretical fair value before spread.</p>
`,
    },

    margin: {
        title: 'Margin System',
        body: `
<p>The margin system enforces collateral requirements for leveraged positions.</p>

<h3>Initial Margin</h3>
<p>Short stock/bond: 50% of notional. Buying on margin (negative cash):
equity must be $\\geq 50\\%$ of debit balance (Reg-T). Trades that would immediately
trigger a margin call are rejected.</p>

<h3>Maintenance Margin</h3>
<p>Short stock/bond: 25% of notional. Short options: $\\max(20\\% \\times S \\times |\\text{qty}|,\\; \\text{premium} \\times |\\text{qty}|)$,
marked to market daily. Margin debit: 25% of negative cash balance.</p>

<h3>Margin Call</h3>
<p>Triggered when total equity falls below the maintenance requirement.
You can liquidate positions or dismiss the warning (simulation pauses).
Status indicator: OK (green) $\\to$ LOW (yellow) $\\to$ MARGIN CALL (red).</p>

<h3>Borrow Cost</h3>
<p>Short positions and margin debit incur daily interest:</p>
$$\\text{cost} = \\text{notional} \\times \\frac{\\max(r,\\,0) + k \\cdot \\sigma}{252}$$
<p>where $k$ is the borrow spread parameter.</p>
`,
    },

    exercise: {
        title: 'Option Expiry &amp; Exercise',
        body: `
<p>American options can be exercised at any time before expiry.
The simulation handles expiry processing at end of day.</p>

<h3>Automatic Exercise</h3>
<p>At expiry, ITM long options are automatically exercised.
Calls exercise if $S > K$; puts exercise if $S < K$.
Settlement is cash-based (no actual share delivery).</p>

<h3>OTM Expiry</h3>
<p>OTM long options expire worthless -- the full premium is lost.
Short options that expire OTM are removed and margin is released.</p>

<h3>Early Exercise</h3>
<p>You can manually exercise American options before expiry via the
"Ex" button on position rows. Early exercise forfeits remaining time value
but may be optimal for deep ITM options or before dividend dates.</p>

<h3>Bond Maturity</h3>
<p>Zero-coupon bonds settle at face value (\\$100) on their maturity date.
Long bonds receive \\$100 per unit; short bonds pay \\$100 per unit.</p>
`,
    },

    dividends: {
        title: 'Dividend System',
        body: `
<p>The stock pays continuous and discrete dividends controlled by the yield parameter $q$.</p>

<h3>Continuous Yield</h3>
<p>The drift is reduced by $q$: $dS/S$ includes $(\\mu - q)$ instead of $\\mu$.
This continuously drains the stock price to reflect the dividend stream.
Option pricing uses cost of carry $b = r - q$.</p>

<h3>Quarterly Cash Payments</h3>
<p>Every 63 trading days (quarterly cycle, aligned with expiry dates):
dividend per share $= S \\times q / 4$. Long stock receives cash;
short stock pays cash. Net dividends tracked in portfolio.</p>

<h3>Impact on Options</h3>
<p>Higher $q$ reduces call values and increases put values (lower forward price).
When $q > 0$, early exercise of calls may be optimal before dividend dates,
which is captured by the Bjerksund-Stensland American pricing model.</p>
`,
    },

    // -----------------------------------------------------------------------
    // Strategy Topics
    // -----------------------------------------------------------------------

    strategies: {
        title: 'Strategy Builder',
        body: `
<p>Construct multi-leg option strategies by combining calls, puts, stock, and bonds.</p>

<h3>Building a Strategy</h3>
<p>In the Strategy tab, left-click any chain cell to add a long leg;
right-click for a short leg. Adjust quantity per leg with inline editing.
Stock and bond legs are added via the top price cells.</p>

<h3>Execution</h3>
<p>Click "Execute" to fill all legs as a single strategy group.
If any leg fails (e.g., insufficient margin), all previously filled legs
are rolled back to prevent partial fills.</p>

<h3>Saved Strategies</h3>
<p>Click "Save" to name and store the strategy. Saved strategies appear
as grouped positions in the Portfolio tab. Individual legs can be
closed independently.</p>

<h3>Common Structures</h3>
<p>Vertical spreads, straddles, strangles, iron condors, butterflies --
build any combination. The payoff diagram updates in real time.</p>
`,
    },

    payoff: {
        title: 'Payoff Diagrams',
        body: `
<p>Visual P&amp;L profile of the current strategy across a range of underlying prices.</p>

<h3>Reading the Diagram</h3>
<p>X-axis = stock price at evaluation. Y-axis = strategy P&amp;L.
Green region = profit; rose region = loss. The zero line is the breakeven.</p>

<h3>Time Slider</h3>
<p>The time-to-expiry slider shows how the payoff profile evolves as time passes.
At 100% = entry, at 0% = first leg expires. Options exhibit theta decay;
bonds show interest accrual.</p>

<h3>Greek Overlays</h3>
<p>Toggle individual Greeks on the legend to overlay $\\Delta$, $\\Gamma$, $\\Theta$, $\\nu$, $\\rho$ curves.
Each Greek uses an independent Y-axis scale. Click legend entries to show/hide.</p>

<h3>Breakeven Points</h3>
<p>Dots mark prices where the strategy crosses from profit to loss (or vice versa).
The summary panel shows exact breakeven values.</p>
`,
    },

    // -----------------------------------------------------------------------
    // Simulation Parameters
    // -----------------------------------------------------------------------

    mu: {
        title: 'Drift ($\\mu$)',
        body: `
<p>Expected annualised return of the underlying asset.</p>

<h3>Effect on Price</h3>
<p>Positive $\\mu$ produces an upward drift in the stock price over time.
Negative $\\mu$ (as in the Crisis preset) models a bearish environment.
The actual drift in the SDE is $\\mu - q - \\lambda k - \\tfrac{1}{2} v$, accounting for
dividends, jump compensation, and the Ito correction.</p>

<h3>Typical Values</h3>
<p>Historical equity risk premium: ~5-8% annually. Range: $-0.50$ to $+0.50$.</p>
`,
    },

    theta: {
        title: 'Vol Mean ($\\theta$)',
        body: `
<p>Long-run variance level in the Heston model. Volatility reverts toward $\\sqrt{\\theta}$ over time.</p>

<h3>Effect on Volatility</h3>
<p>Higher $\\theta$ means a higher baseline volatility environment.
$\\theta = 0.04$ corresponds to ~20% annualised vol; $\\theta = 0.25$ corresponds to ~50% vol.
Combined with $\\kappa$, determines the persistence of volatility regimes.</p>

<h3>Typical Values</h3>
<p>Calm markets: 0.02--0.06. Volatile/crisis: 0.12--0.25. Range: 0.005 to 1.00.</p>
`,
    },

    kappa: {
        title: 'Mean Reversion ($\\kappa$)',
        body: `
<p>Speed at which variance reverts to its long-run mean $\\theta$.</p>

<h3>Effect on Dynamics</h3>
<p>High $\\kappa$ pulls volatility back to $\\theta$ quickly -- transient vol spikes are short-lived.
Low $\\kappa$ allows volatility to wander far from $\\theta$ for extended periods, creating
persistent high-vol or low-vol regimes.</p>

<h3>Feller Condition</h3>
<p>When $2\\kappa\\theta > \\xi^2$, variance stays strictly positive. The simulation handles
violations via full truncation.</p>

<h3>Typical Values</h3>
<p>Moderate: 2--3. Low persistence: 0.5--1. Range: 0.05 to 10.</p>
`,
    },

    xi: {
        title: 'Vol of Vol ($\\xi$)',
        body: `
<p>Volatility of the variance process in the Heston model.</p>

<h3>Effect on Dynamics</h3>
<p>Higher $\\xi$ creates more erratic volatility swings -- the "vol of vol" effect.
This generates fatter tails in the return distribution and a steeper
volatility smile in option prices.</p>

<h3>Interaction with $\\kappa$</h3>
<p>Low $\\kappa$ + high $\\xi$ = persistent wild vol swings (crisis-like).
High $\\kappa$ + low $\\xi$ = tightly controlled vol near $\\theta$ (calm market).</p>

<h3>Typical Values</h3>
<p>Moderate: 0.2--0.5. High: 0.6--1.0. Range: 0.05 to 1.50.</p>
`,
    },

    rho: {
        title: 'Correlation ($\\rho$)',
        body: `
<p>Correlation between the stock price and variance Brownian motions.</p>

<h3>Leverage Effect</h3>
<p>Negative $\\rho$ means price drops coincide with vol spikes (and vice versa).
This is the "leverage effect" observed in equity markets: falling prices
increase financial leverage, which increases perceived risk and volatility.</p>

<h3>Impact on Skew</h3>
<p>More negative $\\rho$ produces a steeper volatility skew -- OTM puts become
relatively more expensive. $\\rho$ near zero makes the smile more symmetric.</p>

<h3>Typical Values</h3>
<p>Equities: $-0.5$ to $-0.85$. Range: $-0.99$ to $+0.50$.</p>
`,
    },

    lambda: {
        title: 'Jump Rate ($\\lambda$)',
        body: `
<p>Expected number of price jumps per year (Poisson intensity).</p>

<h3>Effect on Returns</h3>
<p>Higher $\\lambda$ means more frequent sudden price moves. With $\\lambda = 0.5$, expect
roughly one jump every two years. With $\\lambda = 8$ (crisis), expect about
8 jumps per year -- a highly discontinuous price path.</p>

<h3>Jump Compensation</h3>
<p>The drift is adjusted by $-\\lambda k$ (where $k = E[e^J - 1]$) to ensure jumps
don't introduce a systematic bias in expected returns.</p>

<h3>Typical Values</h3>
<p>Calm: 0.5--1. Volatile: 3--5. Crisis: 8+. Range: 0 to 15.</p>
`,
    },

    muJ: {
        title: 'Jump Mean ($\\mu_J$)',
        body: `
<p>Average size of log-price jumps. Controls whether jumps tend to be
upward or downward.</p>

<h3>Asymmetric Jumps</h3>
<p>Negative $\\mu_J$ (the default) means jumps tend to be downward -- modelling
crash risk. Positive $\\mu_J$ would model upward jump events (rare in practice
for equities).</p>

<h3>Typical Values</h3>
<p>Mild: $-0.01$ to $-0.03$. Severe crash: $-0.08$ to $-0.15$. Range: $-0.25$ to $+0.15$.</p>
`,
    },

    sigmaJ: {
        title: 'Jump Vol ($\\sigma_J$)',
        body: `
<p>Standard deviation of jump sizes. Controls the variability of individual jump magnitudes.</p>

<h3>Effect on Tails</h3>
<p>Higher $\\sigma_J$ means jump sizes are more unpredictable -- some jumps might be
small while others are catastrophic. This fattens both tails of the
return distribution beyond what the diffusion component alone produces.</p>

<h3>Typical Values</h3>
<p>Moderate: 0.03--0.06. High: 0.08--0.15. Range: 0.005 to 0.25.</p>
`,
    },

    a: {
        title: 'Rate Reversion ($a$)',
        body: `
<p>Speed of mean reversion in the Vasicek interest rate model.</p>

<h3>Effect on Rates</h3>
<p>Higher $a$ pulls the rate back toward $b$ more aggressively.
Low $a$ allows rates to drift far from equilibrium for extended periods,
creating sustained rate environments (low or high).</p>

<h3>Bond Impact</h3>
<p>Fast reversion means rate shocks are transient -- bond prices recover quickly.
Slow reversion means rate moves persist, creating larger bond P&amp;L swings.</p>

<h3>Typical Values</h3>
<p>Moderate: 0.3--0.8. Slow: 0.1--0.2. Range: 0.01 to 2.0.</p>
`,
    },

    b: {
        title: 'Rate Mean ($b$)',
        body: `
<p>Long-run equilibrium level for the risk-free interest rate in the Vasicek model.</p>

<h3>Effect on Markets</h3>
<p>Higher $b$ means rates revert toward a higher level -- good for bond shorts,
bad for bond longs. Affects option pricing through the cost of carry
and the discount factor.</p>

<h3>Typical Values</h3>
<p>Normal: 3--5%. Crisis: 1--2%. Rate hike: 6--8%. Range: $-5\\%$ to $+20\\%$.</p>
`,
    },

    sigmaR: {
        title: 'Rate Vol ($\\sigma_R$)',
        body: `
<p>Volatility of the interest rate process. Controls the magnitude of
random rate fluctuations around the mean-reversion path.</p>

<h3>Effect on Bonds</h3>
<p>Higher $\\sigma_R$ creates wider rate swings, making bonds more volatile.
Combined with longer maturities, rate vol can significantly impact
zero-coupon bond prices.</p>

<h3>Typical Values</h3>
<p>Normal: 0.005--0.010. Volatile: 0.012--0.020. Range: 0.001 to 0.050.</p>
`,
    },

    borrowSpread: {
        title: 'Borrow Spread ($k$)',
        body: `
<p>Volatility scaling factor for short borrow cost and margin debit interest.</p>

<h3>Cost Formula</h3>
$$\\text{daily charge} = \\text{notional} \\times \\frac{\\max(r,\\, 0) + k \\times \\sigma}{252}$$
<p>The borrow cost has two components: the risk-free rate floor and a
volatility-scaled spread. Higher vol = more expensive to borrow.</p>

<h3>Affected Positions</h3>
<p>Short stock, short bonds, and negative cash (margin debit) all incur this cost.
Short options do not (writing doesn't require borrowing the underlying).</p>

<h3>Event Shocks</h3>
<p>Dynamic regime events (like short squeezes) can spike the borrow spread,
dramatically increasing the cost of maintaining short positions.</p>

<h3>Typical Values</h3>
<p>Normal: 0.5. Elevated: 1--2. Squeeze: 3--5. Range: 0 to 5.</p>
`,
    },

    q: {
        title: 'Dividend Yield ($q$)',
        body: `
<p>Continuous dividend yield applied to the stock price.</p>

<h3>Effect on Pricing</h3>
<p>Reduces the cost of carry: $b = r - q$. Higher $q$ lowers call values
and raises put values. Also reduces the stock's expected growth rate
in the simulation drift.</p>

<h3>Cash Payments</h3>
<p>Quarterly discrete dividends: $S \\times q / 4$ per share.
Long stock receives cash; short stock pays. Paid every 63 trading days
aligned with the expiry cycle.</p>

<h3>Typical Values</h3>
<p>Growth stocks: 0--1%. Blue chips: 2--3%. High yield: 4--5%. Range: 0% to 10%.</p>
`,
    },

    // -----------------------------------------------------------------------
    // Dynamic Regime Topics
    // -----------------------------------------------------------------------

    events: {
        title: 'Event Engine',
        body: `
<p>The dynamic regime modes generate narrative market events that shift
simulation parameters in real time.</p>

<h3>Scheduling</h3>
<p>Fed meetings fire every ~32 trading days (~8x/year, like real FOMC).
Non-Fed events arrive via Poisson process (~1 per 60 trading days).
Each event applies additive parameter deltas, clamped to safe ranges.</p>

<h3>Event Categories</h3>
<p>Fed/monetary, macro/geopolitical, sector/tech, company-specific (PNTH),
market structure, and neutral/flavor events. Weighted random selection
ensures high-likelihood neutral events dilute directional bias.</p>

<h3>Followup Chains</h3>
<p>Events can schedule followup events (Paradox-style MTTH). Each followup
has a mean delay and probability of firing. Chains can recurse up to
5 levels deep, creating multi-step narrative arcs.</p>

<h3>Balance</h3>
<p>The weighted average of parameter deltas across the full event pool is
approximately zero, preventing systematic drift toward extreme states.</p>
`,
    },

    llm: {
        title: 'LLM Integration',
        body: `
<p>The Dynamic (LLM) mode uses Claude to generate contextual market events
based on the simulation's current state and narrative history.</p>

<h3>How It Works</h3>
<p>Calls the Anthropic API directly from the browser using structured tool use.
The system prompt contains full universe lore (political landscape, PNTH characters,
Fed policy). Events are pre-fetched in batches of 3--5 to minimize API calls.</p>

<h3>Configuration</h3>
<p>Set your API key in the Settings tab (stored in localStorage, never sent to any server
except the Anthropic API). Choose between Haiku 4.5 (faster, cheaper) and Sonnet 4
(more creative narratives).</p>

<h3>Fallback</h3>
<p>If the API call fails (network error, invalid key, rate limit), the engine
automatically falls back to the offline event pool for that batch.</p>

<h3>Context Window</h3>
<p>Each API call includes current sim state, the last 10 events, and any
pending followups, giving the LLM narrative continuity.</p>
`,
    },
};
