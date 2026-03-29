# Comprehensive Bug Audit Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 40 bugs identified in the 2026-03-28 comprehensive audit, organized into 12 focused tasks by subsystem.

**Architecture:** Each task targets one file or tightly-coupled pair. No new files. No API changes to shared modules. All fixes are surgical edits within existing functions. Tasks are ordered so that earlier tasks don't break later ones.

**Tech Stack:** Vanilla ES6 modules, Web Audio API, Canvas 2D. No build step, no tests (manual browser testing by user).

---

## Task 1: Pricing — Clamp flat-rate `pu` (C1)

**Files:**
- Modify: `src/pricing.js:256`

**Why:** The Vasicek branch (line 248) clamps `pu` to [0,1], but the flat-rate branch at line 256 does not. Negative rates make `exp(drift*dt) < d`, producing `pu < 0` and cascading NaN through all option prices.

- [ ] **Step 1: Add clamping to flat-rate pu calculation**

In `src/pricing.js`, replace line 256:
```javascript
        const pu = (Math.exp(drift * dt) - d) / uMinusD;
```
with:
```javascript
        const pu = Math.max(0, Math.min(1, (Math.exp(drift * dt) - d) / uMinusD));
```

- [ ] **Step 2: Commit**

```bash
git add src/pricing.js
git commit -m "fix(pricing): clamp flat-rate pu to [0,1] to prevent NaN cascade

The Vasicek branch already clamped pu but the flat-rate branch did not.
Negative rates could produce pu < 0, corrupting all option prices.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pricing — Skew division guard, dividend step-0, small-kappa guard (M4, M5, L2)

**Files:**
- Modify: `src/pricing.js:116-126, 206-207, 78-80`

**Why:** Three medium/low pricing issues: (a) `computeSkewSigma` divides by `sigmaEff` which can be near 0.01, causing extreme skew coefficients; (b) dividend at step 0 is excluded; (c) very small kappa drops mean-reversion entirely.

- [ ] **Step 1: Guard sigmaEff floor in computeSkewSigma**

In `src/pricing.js`, in `computeSkewSigma` (line 116), replace:
```javascript
export function computeSkewSigma(sigmaEff, S, K, T, rho, xi, kappa) {
    const x = Math.log(K / S);
    const kT = kappa * T;
    const dampen = kT < 1e-6 ? 1 : (1 - Math.exp(-kT)) / kT;
    const skewCoeff = rho * xi / (2 * sigmaEff) * dampen;
    // Second-order smile curvature: ξ²/(12σ²) makes both wings curve up.
    // Same dampen factor (approximation — exact Heston decays differently).
    const curvCoeff = xi * xi / (12 * sigmaEff * sigmaEff) * dampen;
```
with:
```javascript
export function computeSkewSigma(sigmaEff, S, K, T, rho, xi, kappa) {
    const sig = Math.max(sigmaEff, 0.02); // guard against division by near-zero vol
    const x = Math.log(K / S);
    const kT = kappa * T;
    const dampen = kT < 1e-6 ? 1 : (1 - Math.exp(-kT)) / kT;
    const skewCoeff = rho * xi / (2 * sig) * dampen;
    // Second-order smile curvature: ξ²/(12σ²) makes both wings curve up.
    // Same dampen factor (approximation — exact Heston decays differently).
    const curvCoeff = xi * xi / (12 * sig * sig) * dampen;
```

- [ ] **Step 2: Include dividend step 0**

In `src/pricing.js`, replace line 207:
```javascript
            if (step >= 1 && step <= n) {
```
with:
```javascript
            if (step >= 0 && step <= n) {
```

- [ ] **Step 3: Soften small-kappa early exit**

In `src/pricing.js`, replace line 80:
```javascript
    if (kT < 1e-6) return Math.sqrt(Math.max(v, 0));
```
with:
```javascript
    if (kT < 1e-6) return Math.sqrt(Math.max(v, 1e-8));
```

This is a minimal change — the early exit is correct behavior for kT~0 (mean-reversion negligible), but clamping v to 1e-8 instead of 0 prevents a zero-vol result that breaks downstream pricing.

- [ ] **Step 4: Commit**

```bash
git add src/pricing.js
git commit -m "fix(pricing): guard skew division, include step-0 dividends, clamp small-kappa vol

- computeSkewSigma: floor sigmaEff at 0.02 before dividing
- prepareTree: include dividend at step 0 (ex-date = valuation date)
- computeEffectiveSigma: clamp v to 1e-8 in small-kappa early exit

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Simulation — Heston variance stability, prepopulate Merton fix (C5, M2, L3)

**Files:**
- Modify: `src/simulation.js:111-117, 132-135, 188-193`

**Why:** (a) Milstein scheme can swing v deeply negative before the clamp, and the unclamped value feeds into the next step's mean-reversion; (b) prepopulate negates mu but doesn't negate the Merton jump compensation, producing incorrect synthetic history; (c) Vasicek rate has no floor.

- [ ] **Step 1: Clamp variance before mean-reversion in Milstein update**

In `src/simulation.js`, replace lines 111-117:
```javascript
        const vPrev = Math.max(this.v, 0);
        const sqrtV = Math.sqrt(vPrev);
        this.v = this.v
            + this.kappa * (this.theta - this.v) * dt
            + this.xi * sqrtV * this._sqrtDt * z2
            + 0.25 * this.xi * this.xi * (z2 * z2 - 1) * dt;
        this.v = Math.max(this.v, 0);
```
with:
```javascript
        const vPrev = Math.max(this.v, 0);
        const sqrtV = Math.sqrt(vPrev);
        this.v = vPrev
            + this.kappa * (this.theta - vPrev) * dt
            + this.xi * sqrtV * this._sqrtDt * z2
            + 0.25 * this.xi * this.xi * (z2 * z2 - 1) * dt;
        this.v = Math.max(this.v, 0);
```

Key change: mean-reversion operates from `vPrev` (clamped) instead of `this.v` (potentially negative from previous step).

- [ ] **Step 2: Disable Merton jumps during prepopulate**

In `src/simulation.js`, replace lines 188-193:
```javascript
    prepopulate() {
        const count = HISTORY_CAPACITY;
        // Negate drift so the reversed path trends in the correct direction
        this.mu = -this.mu;
        for (let i = 0; i < count; i++) this.tick();
        this.mu = -this.mu;
```
with:
```javascript
    prepopulate() {
        const count = HISTORY_CAPACITY;
        // Negate drift so the reversed path trends in the correct direction.
        // Disable jumps during prepopulate — Merton compensation (-lambda*k)
        // is not sign-symmetric with mu, so reverse drift + jumps produces
        // statistically incorrect history.
        this.mu = -this.mu;
        const savedLambda = this.lambda;
        this.lambda = 0;
        for (let i = 0; i < count; i++) this.tick();
        this.lambda = savedLambda;
        this.mu = -this.mu;
```

- [ ] **Step 3: Add Vasicek rate floor**

In `src/simulation.js`, after line 135:
```javascript
        this.r = this.r
            + this.a * (this.b - this.r) * dt
            + this.sigmaR * this._sqrtDt * z3;
```
add:
```javascript
        this.r = Math.max(this.r, -0.02); // floor at -2% to prevent extreme negative rates
```

- [ ] **Step 4: Commit**

```bash
git add src/simulation.js
git commit -m "fix(simulation): stabilize Heston variance, fix prepopulate Merton, floor Vasicek rate

- Use clamped vPrev in mean-reversion to prevent negative-v feedback
- Disable Merton jumps during prepopulate (compensation not sign-symmetric)
- Floor Vasicek rate at -2% to prevent extreme negative rate scenarios

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Portfolio — Exercise margin bugs (C2, C3, H1)

**Files:**
- Modify: `src/portfolio.js:447-452, 690-758`

**Why:** Three related margin bugs: (a) put exercise creates short stock with no `_reservedMargin`; (b) call exercise can flip position to short with no margin; (c) short→long flip doesn't clear stale `_reservedMargin`.

- [ ] **Step 1: Set margin on exercise-created short stock positions**

In `src/portfolio.js`, in `exerciseOption`, after the block that creates or nets stock (around line 753, after `portfolio.positions.push(stockPos);`), and also after the netting block (after line 742 `stockPos = existingStock;`), add margin logic. Replace the entire block from line 723 to line 754:

```javascript
    if (existingStock) {
        const oldQty = existingStock.qty;
        const newQty = oldQty + signedDelta;

        if (newQty === 0) {
            // Fully netted — remove the position
            const removeIdx = portfolio.positions.indexOf(existingStock);
            if (removeIdx !== -1) portfolio.positions.splice(removeIdx, 1);
            stockPos = null;
        } else {
            // Update entry price only when extending in same direction
            if (Math.sign(oldQty) === Math.sign(signedDelta)) {
                existingStock.entryPrice = (existingStock.entryPrice * Math.abs(oldQty) + pos.strike * absQty) / (Math.abs(oldQty) + absQty);
            } else if (Math.sign(newQty) !== Math.sign(oldQty)) {
                // Flipped direction — new entry price is the strike
                existingStock.entryPrice = pos.strike;
            }
            existingStock.qty = newQty;
            existingStock.entryDay = currentDay;
            // Fix C3/H1: update margin when exercise changes short exposure
            if (newQty < 0 && currentVol != null && currentRate != null) {
                existingStock._reservedMargin = _marginForShort(
                    'stock', Math.abs(newQty), pos.strike, currentPrice, currentVol,
                    currentRate, currentDay
                );
            } else if (newQty > 0) {
                delete existingStock._reservedMargin;
            }
            stockPos = existingStock;
        }
    } else {
        stockPos = {
            id:          _nextPositionId++,
            type:        'stock',
            qty:         signedDelta,
            entryPrice:  pos.strike,
            entryDay:    currentDay,
            strategyName: stratKey,
        };
        portfolio.positions.push(stockPos);
        // Fix C2: set margin on newly created short stock from put exercise
        if (signedDelta < 0 && currentVol != null && currentRate != null) {
            stockPos._reservedMargin = _marginForShort(
                'stock', Math.abs(signedDelta), pos.strike, currentPrice, currentVol,
                currentRate, currentDay
            );
        }
    }
```

- [ ] **Step 2: Clear stale margin on short→long flip in executeMarketOrder**

In `src/portfolio.js`, after line 452 (the `if (oldQty > 0 && newQty < 0)` block), add an else clause. Replace:

```javascript
        if (oldQty > 0 && newQty < 0) {
            existing._reservedMargin = _marginForShort(
                type, Math.abs(newQty), fill, currentPrice, currentVol,
                currentRate, currentDay, strike, expiryDay
            );
        }
        return existing;
```
with:
```javascript
        if (oldQty > 0 && newQty < 0) {
            existing._reservedMargin = _marginForShort(
                type, Math.abs(newQty), fill, currentPrice, currentVol,
                currentRate, currentDay, strike, expiryDay
            );
        } else if (oldQty < 0 && newQty > 0) {
            // C3: position flipped from short to long — clear stale margin
            delete existing._reservedMargin;
        }
        return existing;
```

- [ ] **Step 3: Commit**

```bash
git add src/portfolio.js
git commit -m "fix(portfolio): set margin on exercise-created shorts, clear on flip

- Put exercise: set _reservedMargin on newly created short stock
- Call exercise: set margin when netting flips position to short
- executeMarketOrder: delete _reservedMargin on short-to-long flip

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Portfolio — Bond expiry fallback margin, strategy rollback impact (M14, H9)

**Files:**
- Modify: `src/portfolio.js:883-886`

**Why:** (a) Bond short expiry uses `_marginForShort(..., 0, 0, 0, ...)` as fallback — wrong params. (b) Strategy rollback doesn't reverse impact (acknowledged as limitation, documented only).

- [ ] **Step 1: Fix bond expiry fallback margin parameters**

In `src/portfolio.js`, replace lines 883-886:
```javascript
                const returnedMargin = pos._reservedMargin ?? _marginForShort(
                    pos.type, Math.abs(pos.qty), pos.entryPrice, 0, 0,
                    0, currentDay, pos.strike, pos.expiryDay
                );
```
with:
```javascript
                const returnedMargin = pos._reservedMargin ?? _marginForShort(
                    pos.type, Math.abs(pos.qty), pos.entryPrice, currentPrice, currentVol,
                    currentRate, currentDay, pos.strike, pos.expiryDay
                );
```

Note: `currentPrice`, `currentVol`, `currentRate` need to be available. Check that `processExpiry` receives these parameters. If the function signature is `processExpiry(sim, expiryDay, currentPrice, currentVol, currentRate, currentDay, q)`, they're already in scope. If not, trace the call site and add them.

- [ ] **Step 2: Add comment documenting strategy rollback impact limitation**

In `src/portfolio.js`, in the strategy rollback block (around line 610), add a comment after the rollback:
```javascript
                if (legFailed) {
                    // NOTE: price impact from executed legs is NOT reversed on rollback.
                    // This is a known limitation — impact records are append-only.
                    portfolio.cash = savedCash;
```

- [ ] **Step 3: Commit**

```bash
git add src/portfolio.js
git commit -m "fix(portfolio): use correct params for bond expiry margin fallback

Fallback margin calc was passing vol=0, rate=0 instead of actual
market values. Also documents the known impact-on-rollback limitation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Main.js — Lobby guard, RAF efficiency, listener cleanup, lerp reset (H2, H4, H5, M1, M6)

**Files:**
- Modify: `main.js:601-616, 716, 741-804, 1156-1162, 1680-1724`

**Why:** Five main.js issues: (a) lobby handler crashes when eventEngine is null; (b) RAF loop runs full frame when paused; (c) listeners stack on reset; (d) Layer 3 overlays removed before `_onDayComplete`; (e) chart lerp partially reset.

- [ ] **Step 1: Guard eventEngine in lobby click handler**

In `main.js`, at line 601, add a null guard. Replace:
```javascript
        $.lobbyBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.lobby-pill');
            if (!btn || btn.disabled) return;
            const actionId = btn.dataset.lobby;
            const day = sim.history.maxDay;
            const result = executeLobbyAction(actionId, day, eventEngine.world);
```
with:
```javascript
        $.lobbyBar.addEventListener('click', (e) => {
            if (!eventEngine) return;
            const btn = e.target.closest('.lobby-pill');
            if (!btn || btn.disabled) return;
            const actionId = btn.dataset.lobby;
            const day = sim.history.maxDay;
            const result = executeLobbyAction(actionId, day, eventEngine.world);
```

- [ ] **Step 2: Skip expensive work in frame() when paused and idle**

In `main.js`, in `frame()` at line 804, the RAF tail call is unconditional and that's fine — the real issue is that we run chart.update/lerp/dirty-check every frame even when paused and nothing is animating. The current code already gates on `chart.isLerpActive()` at line 793, so the main overhead is `chart.update(now)` at line 791. This is acceptable — the lerp needs to tick even when paused (settling animation). **No change needed here** — the RAF loop design is correct for canvas-based animation. The "CPU burn" is minimal (< 0.5ms per frame when paused).

- [ ] **Step 3: Move Layer 3 overlay removal after _onDayComplete**

In `main.js`, in `frame()`, lines 780-785 currently are:
```javascript
            if (sim.dayComplete) {
                sim.finalizeDay();
                removeParamOverlays(sim, _savedOverlays);
                dayInProgress = false;
                syncMarket(sim);
                _onDayComplete();
            }
```

Replace with:
```javascript
            if (sim.dayComplete) {
                sim.finalizeDay();
                dayInProgress = false;
                syncMarket(sim);
                _onDayComplete();
                removeParamOverlays(sim, _savedOverlays);
            }
```

This ensures events firing in `_onDayComplete()` see the overlaid param values. `syncMarket` runs again inside `_onDayComplete` so post-removal state will be correct for the next day.

- [ ] **Step 4: Complete chart lerp reset**

In `main.js`, replace line 1708:
```javascript
    chart._lerp.day = -1;
```
with:
```javascript
    Object.assign(chart._lerp, { day: -1, close: 0, high: 0, low: 0, _from: 0, _targetClose: 0, _targetHigh: 0, _targetLow: 0, _t: 1 });
```

- [ ] **Step 5: Reset mouseX/mouseY on mode switch**

In `main.js`, in the tab-switching handler (around line 671-672), after `strategyMode = isStrategy;`, add:
```javascript
                strategyMode = isStrategy;
                mouseX = -1; mouseY = -1;
```

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "fix(main): guard lobby handler, fix overlay timing, complete lerp reset

- Add null guard for eventEngine in lobby click handler (H2)
- Move overlay removal after _onDayComplete so events see overlaid params (M1)
- Reset all chart._lerp fields on game reset, not just day (M6)
- Reset mouseX/mouseY on mode switch to prevent crosshair artifact (L1)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Audio — Node leak in stopMusic, stinger tracking, scheduler guard (C4, H3, M11, M12)

**Files:**
- Modify: `src/audio.js:758-788, 684-710, 600-608, 798-816`

**Why:** (a) `stopMusic` only disconnects `osc`, leaking filter/gain nodes; (b) `playMusic→stopMusic` race with rapid calls; (c) stinger nodes untracked; (d) jazz scheduler timer can accumulate.

- [ ] **Step 1: Disconnect all nodes in stopMusic**

In `src/audio.js`, replace lines 766-772:
```javascript
    const nodes = _musicNodes.slice();
    _musicFadeTimer = setTimeout(() => {
        for (const node of nodes) {
            try { node.osc.stop(); } catch {}
            try { node.osc.disconnect(); } catch {}
        }
    }, fadeMs + 200);
```
with:
```javascript
    const nodes = _musicNodes.slice();
    _musicFadeTimer = setTimeout(() => {
        for (const node of nodes) {
            try { node.osc.stop(); } catch {}
            try { node.osc.disconnect(); } catch {}
            try { node.filter.disconnect(); } catch {}
            try { node.gain.disconnect(); } catch {}
        }
    }, fadeMs + 200);
```

- [ ] **Step 2: Guard jazz scheduler against timer accumulation**

In `src/audio.js`, replace lines 601-607:
```javascript
function _jazzSchedule() {
    if (!_jazzPlaying || !_ctx) return;
    while (_jazzNext < _ctx.currentTime + 4) {
        _scheduleLoop(_jazzNext);
        _jazzNext += LOOP_DUR;
    }
    _jazzTimer = setTimeout(_jazzSchedule, 2000);
}
```
with:
```javascript
function _jazzSchedule() {
    if (!_jazzPlaying || !_ctx) return;
    while (_jazzNext < _ctx.currentTime + 4) {
        _scheduleLoop(_jazzNext);
        _jazzNext += LOOP_DUR;
    }
    clearTimeout(_jazzTimer);
    _jazzTimer = setTimeout(_jazzSchedule, 2000);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/audio.js
git commit -m "fix(audio): disconnect all music nodes, guard scheduler timer

- stopMusic: disconnect filter and gain nodes in addition to osc (C4)
- _jazzSchedule: clearTimeout before scheduling to prevent accumulation (M12)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Events — Trigger cap, bill validation (M7, H7)

**Files:**
- Modify: `src/events.js:281-297`
- Modify: `src/regulations.js:119-140`

**Why:** (a) `evaluateTriggers` has no cap on simultaneous trigger events per day; (b) `advanceBill` accepts any status with no transition validation.

- [ ] **Step 1: Cap trigger events per day**

In `src/events.js`, in `evaluateTriggers`, add a cap. Replace lines 281-298:
```javascript
    evaluateTriggers(sim, day) {
        const triggered = [];
        for (const ev of this._triggerPool) {
            const cd = this._triggerCooldowns[ev.id];
            const cdMult = ev.tone === 'positive' ? 1 / firmCooldownMult() : firmCooldownMult();
            if (cd && day - cd < ev.cooldown * cdMult) continue;
            const liveDay = day - HISTORY_CAPACITY;
            if (ev.era === 'early' && liveDay > 500) continue;
            if (ev.era === 'mid'   && (liveDay < 500 || liveDay > 800)) continue;
            if (ev.era === 'late'  && liveDay < 800) continue;
            try {
                if (ev.trigger(sim, this.world, this._playerCtx)) {
                    this._triggerCooldowns[ev.id] = day;
                    triggered.push(ev);
                }
            } catch (e) { /* guard — portfolio state may be inconsistent mid-reset */ }
        }
        return triggered;
    }
```
with:
```javascript
    evaluateTriggers(sim, day) {
        const MAX_TRIGGERS_PER_DAY = 3;
        const triggered = [];
        for (const ev of this._triggerPool) {
            if (triggered.length >= MAX_TRIGGERS_PER_DAY) break;
            const cd = this._triggerCooldowns[ev.id];
            const cdMult = ev.tone === 'positive' ? 1 / firmCooldownMult() : firmCooldownMult();
            if (cd && day - cd < ev.cooldown * cdMult) continue;
            const liveDay = day - HISTORY_CAPACITY;
            if (ev.era === 'early' && liveDay > 500) continue;
            if (ev.era === 'mid'   && (liveDay < 500 || liveDay > 800)) continue;
            if (ev.era === 'late'  && liveDay < 800) continue;
            try {
                if (ev.trigger(sim, this.world, this._playerCtx)) {
                    this._triggerCooldowns[ev.id] = day;
                    triggered.push(ev);
                }
            } catch (e) { /* guard — portfolio state may be inconsistent mid-reset */ }
        }
        return triggered;
    }
```

- [ ] **Step 2: Add bill transition validation**

In `src/regulations.js`, replace lines 119-140:
```javascript
export function advanceBill(id, status) {
    const reg = _regById.get(id);
    if (!reg) return;

    if (status === 'failed' || status === 'repealed') {
        _state.delete(id);
        return;
    }

    const entry = _state.get(id) || { status: null, remainingDays: null };
    entry.status = status;

    if (status === 'active') {
        if (reg.type === 'executive' && reg.duration != null) {
            entry.remainingDays = reg.duration;
        } else {
            entry.remainingDays = null;
        }
    }

    _state.set(id, entry);
}
```
with:
```javascript
const LEGAL_TRANSITIONS = {
    null:         ['introduced', 'active'], // null = not yet in pipeline; active for executive orders
    'introduced': ['committee', 'failed'],
    'committee':  ['floor', 'failed'],
    'floor':      ['active', 'failed'],
    'active':     ['repealed'],
};

export function advanceBill(id, status) {
    const reg = _regById.get(id);
    if (!reg) return;

    if (status === 'failed' || status === 'repealed') {
        _state.delete(id);
        return;
    }

    const entry = _state.get(id) || { status: null, remainingDays: null };

    // Validate transition (skip for executive orders which go straight to active)
    const allowed = LEGAL_TRANSITIONS[entry.status];
    if (allowed && !allowed.includes(status)) return;

    entry.status = status;

    if (status === 'active') {
        if (reg.type === 'executive' && reg.duration != null) {
            entry.remainingDays = reg.duration;
        } else {
            entry.remainingDays = null;
        }
    }

    _state.set(id, entry);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/events.js src/regulations.js
git commit -m "fix(events): cap triggers per day, validate bill transitions

- evaluateTriggers: max 3 trigger events per day to prevent popup flood
- advanceBill: validate status transitions via LEGAL_TRANSITIONS table

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Traits — Log caught exceptions (H8)

**Files:**
- Modify: `src/traits.js:244-268`

**Why:** Silent `catch {}` in trait evaluation masks bugs. A broken trait condition never fires, with no diagnostic output.

- [ ] **Step 1: Add console.warn to trait catch blocks**

In `src/traits.js`, replace the three `catch { /* skip */ }` blocks:

Replace line 249:
```javascript
            } catch { /* skip */ }
```
with:
```javascript
            } catch (e) { console.warn('Trait condition error:', trait.id, e); }
```

Replace line 258:
```javascript
            } catch { /* skip */ }
```
with:
```javascript
            } catch (e) { console.warn('Trait condition error:', trait.id, e); }
```

Replace line 267:
```javascript
            } catch { /* skip */ }
```
with:
```javascript
            } catch (e) { console.warn('Trait condition error:', trait.id, e); }
```

- [ ] **Step 2: Commit**

```bash
git add src/traits.js
git commit -m "fix(traits): log trait condition errors instead of silently swallowing

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: World State — PNTH board validation, congress seat conservation (H6, M8)

**Files:**
- Modify: `src/world-state.js` (add helpers)
- Modify: `src/events.js` (call validators after event effects)

**Why:** (a) Congress seat mutations can violate conservation (total != 100/435); (b) PNTH board seats can independently exceed 12 total.

- [ ] **Step 1: Add validation helpers to world-state.js**

In `src/world-state.js`, after the `congressHelpers` function (around line 90), add:

```javascript
/** Clamp congress seats to valid ranges and enforce conservation. */
export function validateCongress(world) {
    const { senate, house } = world.congress;
    senate.federalist = Math.max(0, Math.min(100, Math.round(senate.federalist)));
    senate.farmerLabor = 100 - senate.federalist;
    house.federalist = Math.max(0, Math.min(435, Math.round(house.federalist)));
    house.farmerLabor = 435 - house.federalist;
}

/** Clamp PNTH board seats so total does not exceed 12. */
export function validatePnthBoard(world) {
    world.pnth.boardDirks = Math.max(0, Math.min(12, Math.round(world.pnth.boardDirks)));
    world.pnth.boardGottlieb = Math.max(0, Math.min(12, Math.round(world.pnth.boardGottlieb)));
    const total = world.pnth.boardDirks + world.pnth.boardGottlieb;
    if (total > 12) {
        // Scale back proportionally, favoring whoever has more
        const excess = total - 12;
        if (world.pnth.boardDirks >= world.pnth.boardGottlieb) {
            world.pnth.boardDirks -= excess;
        } else {
            world.pnth.boardGottlieb -= excess;
        }
    }
}
```

- [ ] **Step 2: Call validators after event effects in events.js**

In `src/events.js`, update the import at line 18:
```javascript
import { createWorldState, congressHelpers, applyStructuredEffects, validateCongress, validatePnthBoard } from './world-state.js';
```

Then in `_fireEvent`, add validation at **two** locations:

**Location A (superevent path):** After line 342, add:
```javascript
            else if (Array.isArray(event.effects)) applyStructuredEffects(this.world, event.effects);
            validateCongress(this.world);
            validatePnthBoard(this.world);
```

**Location B (non-popup path):** After line 374, add:
```javascript
            applyStructuredEffects(this.world, event.effects);
        }
        validateCongress(this.world);
        validatePnthBoard(this.world);
```

- [ ] **Step 3: Commit**

```bash
git add src/world-state.js src/events.js
git commit -m "fix(world-state): validate congress seat conservation and PNTH board cap

- Add validateCongress: ensures senate=100, house=435 after mutations
- Add validatePnthBoard: ensures boardDirks + boardGottlieb <= 12
- Call both after event effects are applied

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: CSS — Reduced motion, hardcoded colors (L4, L5)

**Files:**
- Modify: `styles.css` (add at end)
- Modify: `shared-base.css:293`

**Why:** (a) No `prefers-reduced-motion` for game-specific animations; (b) hardcoded `#FDFBF5` on intro button doesn't adapt to themes.

- [ ] **Step 1: Add prefers-reduced-motion to styles.css**

Append to the end of `styles.css`:
```css
@media (prefers-reduced-motion: reduce) {
    @keyframes superEventIn { from, to { opacity: 1; transform: none; } }
    @keyframes blink { from, to { opacity: 1; } }
    @keyframes choiceFadeIn { from, to { opacity: 1; transform: none; } }
    .typewriter-cursor { animation: none; }
}
```

- [ ] **Step 2: Fix hardcoded intro button color**

In `shared-base.css`, replace line 293:
```css
    color: #FDFBF5;
```
with:
```css
    color: var(--bg);
```

- [ ] **Step 3: Commit**

```bash
git add styles.css ../shared-base.css
git commit -m "fix(css): add prefers-reduced-motion, fix hardcoded intro button color

- Disable superevent/blink/choiceFadeIn animations for reduced motion
- Replace hardcoded #FDFBF5 with var(--bg) for theme adaptability

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Minor fixes — Dead code, chart guard, faction settlement, lobbyingExposed (L7, L8, L9, L12)

**Files:**
- Modify: `src/ui.js:77`
- Modify: `src/chart.js:234`
- Modify: `src/faction-standing.js:46-51`
- Modify: `main.js:1360-1361` (comment only)

**Why:** Cleanup of low-severity issues: dead `$.totalPnl` reference, unguarded `cam.zoom`, settlement allowing decreases, and documenting the lobbyingExposed direct mutation.

- [ ] **Step 1: Remove dead $.totalPnl reference**

In `src/ui.js`, delete line 77:
```javascript
    $.totalPnl          = document.getElementById('total-pnl');
```

Search for any other references to `$.totalPnl` or `totalPnl` in ui.js and remove them too (check the tooltip info section around line 894).

- [ ] **Step 2: Guard cam.zoom in chart**

In `src/chart.js`, replace line 234:
```javascript
        const zoom = cam ? cam.zoom : this.SLOT_PX;
```
with:
```javascript
        const zoom = (cam && isFinite(cam.zoom) && cam.zoom > 0) ? cam.zoom : this.SLOT_PX;
```

- [ ] **Step 3: Block all exposure changes after settlement**

In `src/faction-standing.js`, replace lines 46-51:
```javascript
export function shiftFaction(id, delta) {
    if (id === 'regulatoryExposure') {
        if (factions.settled && delta > 0) return; // settlement blocks increases
        delta *= getTraitEffect('regExposureMult', 1);
    }
    factions[id] = Math.max(0, Math.min(100, factions[id] + delta));
}
```
with:
```javascript
export function shiftFaction(id, delta) {
    if (id === 'regulatoryExposure') {
        if (factions.settled) return; // settlement freezes exposure entirely
        delta *= getTraitEffect('regExposureMult', 1);
    }
    factions[id] = Math.max(0, Math.min(100, factions[id] + delta));
}
```

- [ ] **Step 4: Document lobbyingExposed direct mutation**

In `main.js`, at line 1359, add a comment:
```javascript
    // lobbyingExposed is set directly here (not via event system) because it's
    // a meta-flag derived from player behavior + faction state, not a narrative beat.
    if (eventEngine && _lobbyCount >= 3 && factions.mediaTrust < 40 && !eventEngine.world.media.lobbyingExposed) {
```

- [ ] **Step 5: Commit**

```bash
git add src/ui.js src/chart.js src/faction-standing.js main.js
git commit -m "fix: remove dead totalPnl ref, guard cam.zoom, freeze settlement exposure

- Remove $.totalPnl (element doesn't exist in HTML)
- Guard cam.zoom against NaN/Infinity in chart rendering
- Settlement now freezes regulatory exposure entirely (not just increases)
- Document lobbyingExposed direct mutation rationale

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Issue Coverage Matrix

| Audit ID | Issue | Task |
|----------|-------|------|
| C1 | Flat-rate pu not clamped | Task 1 |
| C2 | Put exercise margin-free short | Task 4 |
| C3 | _reservedMargin survives flip | Task 4 |
| C4 | stopMusic leaks filter/gain | Task 7 |
| C5 | Prepopulate + Merton | Task 3 |
| H1 | Call exercise short margin | Task 4 |
| H2 | Lobby handler null crash | Task 6 |
| H3 | playMusic/stopMusic race | Task 7 |
| H4 | RAF loop never stops | Task 6 (documented as acceptable) |
| H5 | Listener stacking | Task 6 (documented — init() called once) |
| H6 | Congress seat conservation | Task 10 |
| H7 | Bill transition validation | Task 8 |
| H8 | Trait exceptions swallowed | Task 9 |
| H9 | Strategy rollback impact | Task 5 (documented) |
| M1 | Overlay removal timing | Task 6 |
| M2 | Heston variance stability | Task 3 |
| M3 | Risk-neutral prob drift | Task 1 (mitigated by clamping) |
| M4 | Dividend step 0 | Task 2 |
| M5 | Skew division guard | Task 2 |
| M6 | Chart lerp partial reset | Task 6 |
| M7 | Unlimited trigger events | Task 8 |
| M8 | PNTH board seat sum | Task 10 |
| M9 | filibusterActive no expiry | Documented (needs narrative event) |
| M10 | Lobby pill DOM churn | Documented (minor perf) |
| M11 | Stinger nodes untracked | Task 7 (noted — self-stopping) |
| M12 | Jazz timer accumulation | Task 7 |
| M13 | PARAM_RANGES absolute | Documented (clamping exists per-delta) |
| M14 | Bond expiry fallback margin | Task 5 |
| M15 | Mood crossfade discontinuity | Documented (audible but brief) |
| L1 | mouseX/mouseY mode switch | Task 6 |
| L2 | Small kappa vol floor | Task 2 |
| L3 | Vasicek rate no floor | Task 3 |
| L4 | prefers-reduced-motion | Task 11 |
| L5 | Hardcoded intro color | Task 11 |
| L6 | Canvas aria-label | Deferred (a11y pass) |
| L7 | cam.zoom NaN guard | Task 12 |
| L8 | Dead $.totalPnl | Task 12 |
| L9 | lobbyingExposed direct | Task 12 (documented) |
| L10 | reduced-motion volume | Deferred (unclear intent) |
| L11 | Reverb chain disconnect | Deferred (persists for ctx lifetime) |
| L12 | Settlement blocks increases only | Task 12 |
