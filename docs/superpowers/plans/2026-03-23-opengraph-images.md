# OpenGraph Image Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 5 branded OG images (1200×630 PNG) for all a9l.im projects and wire up the meta tags.

**Architecture:** 5 standalone HTML pages in `og/` (root repo), each with canvas-drawn flair + text. A Puppeteer script screenshots them to PNG. Meta tags added to each project's `index.html`.

**Tech Stack:** Vanilla HTML/CSS/JS, Canvas 2D API, Puppeteer (dev dependency)

**Spec:** `docs/superpowers/specs/2026-03-23-opengraph-images-design.md`
**Reference mockup:** `finsim/.superpowers/brainstorm/18132-1774251104/shoals-v3.html`

---

### File Map

```
og/                          # Root repo: a9lim.github.io/og/
  generate.js                # Puppeteer screenshot script
  shoals.html                # finsim OG card
  hayashinet.html            # root site OG card
  geon.html                  # physsim OG card
  metabolism.html            # biosim OG card
  redistricting.html         # gerry OG card

og-image.png                 # Output: root site
finsim/og-image.png          # Output: finsim
physsim/og-image.png         # Output: physsim
biosim/og-image.png          # Output: biosim
gerry/og-image.png           # Output: gerry
```

---

### Task 1: Shoals OG card (finsim)

**Files:**
- Create: `og/shoals.html`

This is the reference card — validated mockup exists. Port it to `og/` with one fix: replace `Math.random()` wick sizing with deterministic values (seeded or hardcoded) so re-running `generate.js` always produces identical output.

- [ ] **Step 1: Create `og/shoals.html`**

Copy the validated mockup from `finsim/.superpowers/brainstorm/18132-1774251104/shoals-v3.html` to `og/shoals.html`. Replace the random wick generation with a simple seeded PRNG:

```javascript
// Replace Math.random() with deterministic seeded PRNG
let _seed = 42;
function _rand() { _seed = (_seed * 16807 + 0) % 2147483647; return (_seed - 1) / 2147483646; }

// Then use _rand() instead of Math.random() in wick generation:
const wickUp = 0.5 + _rand() * 2.5;
const wickDown = 0.5 + _rand() * 2.5;
```

Everything else (CSS layout, canvas drawing, fades) is identical to the mockup.

- [ ] **Step 2: Verify in browser**

Open `og/shoals.html` directly in Chrome. Confirm it matches the approved mockup: 24 candles, green/rose, fades, 156px title, accent line, copyleft brand.

- [ ] **Step 3: Commit**

```bash
git add og/shoals.html
git commit -m "feat(og): add Shoals OG card HTML"
```

---

### Task 2: Hayashinet OG card (root site)

**Files:**
- Create: `og/hayashinet.html`

Same layout as Shoals but with the logo.svg rendered onto canvas instead of candlesticks. The logo SVG path is `#E11107` on the light `#EBEFF4` background. Since Puppeteer loads via `file://`, the SVG src must use a relative path (`../logo.svg`). Set `window._ready = true` after `img.onload` so the generate script knows when to screenshot.

- [ ] **Step 1: Create `og/hayashinet.html`**

Use the same CSS layout (body 1200×630, `.flair` 400×630, `.text-side` with centered text). Title: "Hayashinet".

Canvas script:
```javascript
const canvas = document.getElementById('flair');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const img = new Image();
img.onload = () => {
  // Scale to ~280px CSS width = 560px canvas width, maintain aspect ratio
  const scale = 560 / img.naturalWidth;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  ctx.drawImage(img, x, y, w, h);

  // Top fade
  const fadeTop = ctx.createLinearGradient(0, 0, 0, 60);
  fadeTop.addColorStop(0, 'rgba(235, 239, 244, 1)');
  fadeTop.addColorStop(1, 'rgba(235, 239, 244, 0)');
  ctx.fillStyle = fadeTop;
  ctx.fillRect(0, 0, W, 60);

  // Bottom fade
  const fadeBot = ctx.createLinearGradient(0, H - 100, 0, H);
  fadeBot.addColorStop(0, 'rgba(235, 239, 244, 0)');
  fadeBot.addColorStop(1, 'rgba(235, 239, 244, 1)');
  ctx.fillStyle = fadeBot;
  ctx.fillRect(0, H - 100, W, 100);

  window._ready = true;
};
img.src = '../logo.svg';
```

- [ ] **Step 2: Verify in browser**

Serve from repo root (`python -m http.server`) and open `http://localhost:8000/og/hayashinet.html`. Confirm logo renders centered, fades look right, title reads "Hayashinet".

**Note:** The SVG loads via relative path `../logo.svg`. This works both under HTTP server (for manual testing) and under Puppeteer's `file://` protocol (for generation). Do NOT open the HTML file directly via `file://` in a regular browser — some browsers block cross-origin SVG loading from `file://` URLs. Always use an HTTP server for manual testing.

- [ ] **Step 3: Commit**

```bash
git add og/hayashinet.html
git commit -m "feat(og): add Hayashinet OG card HTML"
```

---

### Task 3: Geon OG card (physsim)

**Files:**
- Create: `og/geon.html`

Same layout. Title: "Geon". Flair: two particles with trajectory arcs and photon squiggles.

- [ ] **Step 1: Create `og/geon.html`**

Same CSS layout. Canvas script draws:

1. **Trajectory arcs** (draw first, behind particles): two `bezierCurveTo` curves. Red particle arc from bottom-left toward center, blue from top-right toward center. 2px stroke, particle color at 40% opacity.

2. **Particles**: two gradient-filled circles (~50px radius at 2x = 100px canvas).
   - Red particle (`#C84341`): position ~(280, 750). Radial gradient from `#E8A0A0` center to `#C84341` edge.
   - Blue particle (`#3590BF`): position ~(520, 510). Radial gradient from `#A0D0E8` center to `#3590BF` edge.

3. **Photon squiggles**: 3-4 wavy lines radiating from interaction midpoint (~400, 630). Each line: loop of `quadraticCurveTo` alternating ±8px perpendicular to the line direction, ~20px wavelength, extending ~150px outward. Accent `#E11107` at 60% opacity, 2px stroke.

4. **Top/bottom fades** (same as Shoals).

- [ ] **Step 2: Verify in browser**

Open `og/geon.html`. Confirm two particles with arcs converging, photon squiggles radiating from center, fades correct.

- [ ] **Step 3: Commit**

```bash
git add og/geon.html
git commit -m "feat(og): add Geon OG card HTML"
```

---

### Task 4: Metabolism OG card (biosim)

**Files:**
- Create: `og/metabolism.html`

Same layout. Title: "Metabolism". Flair: lipid bilayer membrane cross-section.

- [ ] **Step 1: Create `og/metabolism.html`**

Same CSS layout. Canvas script draws:

1. **Membrane curvature**: define a curve function `membraneY(x)` that produces a gentle convex-upward arc across the canvas width. The membrane center sits at ~`H/2` (630 canvas = 315).

2. **Phospholipids**: two rows (upper leaflet heads face up, lower leaflet heads face down). Space ~20 lipids across the width.
   - Each lipid: filled circle head (~16px canvas radius), two short tail lines (~40px) extending inward toward membrane center.
   - Head colors alternate: blue `#3590BF` and green `#2CA470`.
   - Tail color: `#767C85` at 40% opacity, 2px stroke.
   - Gap between upper and lower head rows ~100px canvas (hydrophobic interior).

3. **Channel proteins**: 2-3 rounded rectangles (`#8160B5` at 30% opacity) spanning both leaflets, ~60px wide, with a ~20px gap in the center (the pore). Position at x ≈ 250, 550 (and optionally 700).

4. **Small molecules**: 3-4 circles (~8px canvas radius, `#C48225` orange) positioned near/inside channel pores.

5. **Top/bottom fades**.

- [ ] **Step 2: Verify in browser**

Open `og/metabolism.html`. Confirm bilayer with alternating blue/green heads, tails pointing inward, purple channel proteins with orange molecules.

- [ ] **Step 3: Commit**

```bash
git add og/metabolism.html
git commit -m "feat(og): add Metabolism OG card HTML"
```

---

### Task 5: Redistricting OG card (gerry)

**Files:**
- Create: `og/redistricting.html`

Same layout. Title: "Redistricting". Flair: colored hex grid with district boundaries.

- [ ] **Step 1: Create `og/redistricting.html`**

Same CSS layout. Canvas script draws:

1. **Hex grid**: ~6 columns × 8 rows of flat-top hexagons, ~56px canvas radius (28px CSS). Grid centered in 800×1260 canvas. Use standard hex grid math:
   - Flat-top: `width = 2*r`, `height = sqrt(3)*r`
   - Column offset: `1.5 * r`, row offset: `sqrt(3) * r`, odd columns shifted down by `sqrt(3)/2 * r`

2. **Hex fills**: hardcoded color assignment array (deterministic). Three colors at 50% opacity:
   - Orange `#C48225`, lime `#5FAB4D`, purple `#8160B5`
   - Assign colors to create 3-4 contiguous clusters (districts).

3. **Hex outlines**: `#767C85` at 20% opacity, 1px stroke.

4. **District boundaries**: for adjacent hexes of different colors, draw a thicker (6px canvas = 3px CSS) boundary segment along their shared edge. Color: `#0B1016` at 30% opacity.

5. **Top/bottom fades**.

- [ ] **Step 2: Verify in browser**

Open `og/redistricting.html`. Confirm hex grid with 3 colored districts, thick boundary lines between them, fades correct.

- [ ] **Step 3: Commit**

```bash
git add og/redistricting.html
git commit -m "feat(og): add Redistricting OG card HTML"
```

---

### Task 6: Puppeteer generation script

**Files:**
- Create: `og/generate.js`
- Create: `og/package.json`

- [ ] **Step 1: Create `og/package.json`**

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "node generate.js"
  },
  "devDependencies": {
    "puppeteer": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create `og/generate.js`**

```javascript
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CARDS = [
  { html: 'hayashinet.html', output: path.join(ROOT, 'og-image.png'),          waitReady: true },
  { html: 'shoals.html',     output: path.join(ROOT, 'finsim', 'og-image.png'),   waitReady: false },
  { html: 'geon.html',       output: path.join(ROOT, 'physsim', 'og-image.png'),  waitReady: false },
  { html: 'metabolism.html',  output: path.join(ROOT, 'biosim', 'og-image.png'),   waitReady: false },
  { html: 'redistricting.html', output: path.join(ROOT, 'gerry', 'og-image.png'), waitReady: false },
];

const browser = await puppeteer.launch({ headless: true });

for (const card of CARDS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

  const url = 'file://' + path.join(__dirname, card.html);
  await page.goto(url, { waitUntil: 'networkidle0' });

  // Wait for fonts
  await page.waitForFunction(() => document.fonts.ready);

  // Wait for SVG load (Hayashinet)
  if (card.waitReady) {
    await page.waitForFunction(() => window._ready === true, { timeout: 10000 });
  }

  await page.screenshot({ path: card.output, type: 'png', omitBackground: false });
  console.log(`✓ ${card.html} → ${path.relative(ROOT, card.output)}`);
  await page.close();
}

await browser.close();
```

- [ ] **Step 3: Install and run**

```bash
cd og && npm install && node generate.js
```

Verify all 5 PNGs are created at the expected paths.

- [ ] **Step 4: Add `og/node_modules` to `.gitignore`**

Add `og/node_modules/` to the root `.gitignore`.

- [ ] **Step 5: Commit**

```bash
git add og/generate.js og/package.json og/package-lock.json .gitignore
git commit -m "feat(og): add Puppeteer generation script"
```

---

### Task 7: Generate PNGs and add meta tags

**Files:**
- Modify: `index.html` (root)
- Modify: `finsim/index.html`
- Modify: `physsim/index.html`
- Modify: `biosim/index.html`
- Modify: `gerry/index.html`

- [ ] **Step 1: Run the generator**

```bash
cd og && node generate.js
```

Verify all 5 PNGs exist and look correct (open each in an image viewer).

- [ ] **Step 2: Add meta tags to root `index.html`**

After the existing `twitter:card` line (~line 13), add:
```html
<meta property="og:image" content="https://a9l.im/og-image.png">
<meta name="twitter:image" content="https://a9l.im/og-image.png">
```
Change `twitter:card` content from `summary` to `summary_large_image`.

- [ ] **Step 3: Add meta tags to `finsim/index.html`**

After the existing `twitter:card` line (~line 15), add:
```html
<meta property="og:image" content="https://a9l.im/finsim/og-image.png">
<meta name="twitter:image" content="https://a9l.im/finsim/og-image.png">
```
Change `twitter:card` content from `summary` to `summary_large_image`.

- [ ] **Step 4: Add meta tags to `physsim/index.html`**

Same pattern: `https://a9l.im/physsim/og-image.png`. Change `twitter:card` to `summary_large_image`.

- [ ] **Step 5: Add meta tags to `biosim/index.html`**

Same pattern: `https://a9l.im/biosim/og-image.png`. Change `twitter:card` to `summary_large_image`.

- [ ] **Step 6: Add meta tags to `gerry/index.html`**

Same pattern: `https://a9l.im/gerry/og-image.png`. Change `twitter:card` to `summary_large_image`.

- [ ] **Step 7: Commit all PNGs and meta tag changes**

```bash
git add og-image.png finsim/og-image.png physsim/og-image.png biosim/og-image.png gerry/og-image.png
git add index.html finsim/index.html physsim/index.html biosim/index.html gerry/index.html
git commit -m "feat(og): generate OG images and add meta tags"
```
