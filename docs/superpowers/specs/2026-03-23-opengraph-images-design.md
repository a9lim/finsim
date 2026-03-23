# OpenGraph Image Generation — Design Spec

## Summary

Generate branded OpenGraph/Twitter card images (1200×630 PNG) for all 5 projects in the a9l.im portfolio. Each card has a canvas-drawn illustration on the left third and the project name + brand on the right two-thirds. Static HTML pages are screenshotted to PNG via Puppeteer.

## Card Layout (shared across all 5)

- **Dimensions**: 1200×630px
- **Background**: light canvas `#EBEFF4`
- **Left ~33% (400px CSS / 800×1260 canvas)**: `<canvas>` element at 2x resolution for crisp rendering, rendering project-specific flair illustration
  - **Right-edge fade**: CSS `::after` pseudo-element, 100px wide linear gradient to `#EBEFF4`
  - **Top fade**: canvas-drawn gradient (60px), `#EBEFF4` → transparent
  - **Bottom fade**: canvas-drawn gradient (100px), transparent → `#EBEFF4`
- **Right ~67% (800px)**: centered vertically, `padding: 0 60px`:
  - Project name in Noto Serif 700, ~156px, `#0B1016`, `letter-spacing: -3px`
  - 88×3px accent underline `#E11107` with `border-radius: 2px`, 28px below name
  - Copyleft "a9l.im" in Noto Sans Mono 400, 22px, `#777C83`, `letter-spacing: 0.5px`, 16px below line. Copyleft symbol is a flipped `©` via `transform: scaleX(-1)` at 17px
- **No divider** between flair and text
- **No top accent bar**

## Flair Illustrations (moderate detail, canvas-drawn)

All flair uses hardcoded hex values from `shared-tokens.js` `_PALETTE` and each project's `colors.js`.

### Hayashinet (root site)

- **Title**: Hayashinet
- **Flair**: `logo.svg` rendered onto canvas via `Image()` + `drawImage()`. Centered in the 400×630 area, scaled to ~280px wide. Must wait for `img.onload` before drawing.
- **Colors**: accent `#E11107`

### Shoals (finsim)

- **Title**: Shoals
- **Flair**: OHLC candlestick chart — ~24 candles with wicks (`lineWidth: 3`, `lineCap: round`) and `roundRect` bodies (60% of candle width, `borderRadius: 3`). Green `#2CA470` up / rose `#C5547C` down. Subtle per-candle radial glow (8% opacity). Faint horizontal grid lines (`rgba(11,16,22,0.05)`). Hardcoded price move array for deterministic output.
- **Reference**: `.superpowers/brainstorm/18132-1774251104/shoals-v3.html`

### Geon (physsim)

- **Title**: Geon
- **Flair**: Two particles interacting with photon emission.
  - Particles: ~50px radius gradient-filled circles. Positive charge red `#C84341`, negative charge blue `#3590BF`. Radial gradient from lighter center to full color edge.
  - Trajectory arcs: 2px solid curved paths behind each particle, same color as particle at 40% opacity
  - Photon squiggles: 3-4 sinusoidal wavy lines (`~8px amplitude, ~20px wavelength`) radiating outward from the interaction midpoint. Accent `#E11107` at 60% opacity. Drawn via `quadraticCurveTo` zigzag.
  - Particles positioned to suggest an approach trajectory, interaction point roughly centered

### Metabolism (biosim)

- **Title**: Metabolism
- **Flair**: Lipid bilayer membrane cross-section, oriented horizontally across the canvas.
  - Two parallel rows of phospholipid shapes — each lipid is a small filled circle (head, ~8px) with two short tail lines (~20px). Heads face outward, tails face inward.
  - Head colors alternate: blue `#3590BF` and green `#2CA470`
  - Tail color: `#767C85` (slate) at 40% opacity
  - 2-3 embedded channel proteins: larger rounded rectangles (`#8160B5` purple, 30% opacity) spanning both layers with a gap in the center
  - Small molecules (3-4 circles, ~4px, `#C48225` orange) positioned near/inside channels to suggest transport
  - Membrane slightly curved (convex upward) for visual interest

### Redistricting (gerry)

- **Title**: Redistricting
- **Flair**: Colored hexagonal grid, ~6 columns × 8 rows of flat-top hexagons (~28px radius).
  - Three party fill colors from gerry's palette: orange `#C48225`, lime `#5FAB4D`, purple `#8160B5`
  - Hex fills at 50% opacity, hex outlines at `#767C85` (slate) 20% opacity
  - 3-4 district boundary lines: thicker (3px) `#0B1016` at 30% opacity, drawn as connected paths grouping clusters of same-color hexes
  - Grid centered in the 400×630 area

## File Structure

All files live in `og/` at the **root repo** (`a9lim.github.io/og/`), not inside any submodule.

```
og/
  generate.js          # Puppeteer script — opens each HTML, screenshots to PNG
  hayashinet.html      # Root site card
  shoals.html          # finsim card
  geon.html            # physsim card
  metabolism.html      # biosim card
  redistricting.html   # gerry card
```

Output PNGs go to each project directory:
- `og-image.png` (root)
- `finsim/og-image.png`
- `physsim/og-image.png`
- `biosim/og-image.png`
- `gerry/og-image.png`

## Generation Script (`og/generate.js`)

- Uses Puppeteer (single dev dependency)
- Opens each HTML file via `file://` URL (resolved relative to script location)
- Viewport: `{ width: 1200, height: 630, deviceScaleFactor: 1 }` — the canvas handles its own 2x internally
- **Font loading**: `page.waitForFunction(() => document.fonts.ready)` before screenshot
- **SVG loading** (Hayashinet card): `page.waitForFunction(() => window._ready === true)` — the HTML sets `_ready` after `img.onload`
- Screenshots: `page.screenshot({ type: 'png', omitBackground: false })`
- Run via `node og/generate.js` from repo root

## HTML Page Template (per card)

Each HTML page is self-contained:
- `<!DOCTYPE html>` full document
- Google Fonts `<link>` for Noto Serif 700 + Noto Sans Mono 400
- Inline `<style>` with the shared layout CSS
- Body set to exactly 1200×630, `overflow: hidden`
- Left `.flair` div (400×630) with absolutely-positioned `<canvas>` (800×1260 for 2x) and right-edge fade `::after` pseudo-element
- Right `.text-side` flex container with name, accent line, brand
- `<script>` draws the flair illustration onto the canvas, including top/bottom fades

Colors are hardcoded hex values — the HTML pages don't import shared modules (standalone for Puppeteer).

## Meta Tag Updates

Each project's `index.html` already has `og:title`, `og:description`, `og:type`, `og:url`, and `og:site_name`. Add:

```html
<meta property="og:image" content="https://a9l.im/{project}/og-image.png">
<meta name="twitter:image" content="https://a9l.im/{project}/og-image.png">
```

Update existing `twitter:card` from `summary` to `summary_large_image`.

Root site uses `https://a9l.im/og-image.png`.
