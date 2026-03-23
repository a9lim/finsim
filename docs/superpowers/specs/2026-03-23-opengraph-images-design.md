# OpenGraph Image Generation — Design Spec

## Summary

Generate branded OpenGraph/Twitter card images (1200×630 PNG) for all 5 projects in the a9l.im portfolio. Each card has a canvas-drawn illustration on the left third and the project name + brand on the right two-thirds. Static HTML pages are screenshotted to PNG via Puppeteer.

## Card Layout (shared across all 5)

- **Dimensions**: 1200×630px
- **Background**: light canvas `#EBEFF4`
- **Left ~33% (400px)**: `<canvas>` element rendering project-specific flair illustration, full bleed with fade-out on right edge, top, and bottom (gradient to background color)
- **Right ~67% (800px)**: centered vertically:
  - Project name in Noto Serif 700, ~156px, `#0B1016`
  - 88×3px accent underline `#E11107`, 28px below name
  - Copyleft "a9l.im" in Noto Sans Mono, 22px, `#777C83`, 16px below line
- **No divider** between flair and text
- **No top accent bar**

## Flair Illustrations (moderate detail, canvas-drawn)

| Project | Title | Flair |
|---------|-------|-------|
| **Root site** | Hayashinet | `logo.svg` rendered onto canvas, centered |
| **finsim** | Shoals | OHLC candlestick chart — ~24 candles with wicks and rounded bodies, green (`#2CA470`) up / rose (`#C5547C`) down, subtle per-candle radial glow, faint horizontal grid lines |
| **physsim** | (TBD from physsim og:title) | Two particles (gradient-filled circles) with trajectory arcs and 3-4 photon squiggles radiating from interaction point |
| **biosim** | (TBD from biosim og:title) | Double-layer lipid bilayer membrane cross-section with 2-3 embedded channel proteins, small molecules passing through |
| **gerry** | (TBD from gerry og:title) | Colored hexagonal grid (5-6 wide) with district boundary lines, 3 party colors from gerry's palette |

All flair uses colors from `shared-tokens.js` `_PALETTE` and each project's `colors.js`.

## File Structure

```
og/
  generate.js          # Puppeteer script — opens each HTML, screenshots to PNG
  hayashinet.html      # Root site card
  shoals.html          # finsim card
  physsim.html         # physsim card
  biosim.html          # biosim card
  gerry.html           # gerry card
```

Output PNGs go to each project directory:
- `og-image.png` (root)
- `finsim/og-image.png`
- `physsim/og-image.png`
- `biosim/og-image.png`
- `gerry/og-image.png`

## Generation Script (`og/generate.js`)

- Uses Puppeteer (single dev dependency)
- Opens each HTML file at 1200×630 viewport
- Screenshots to PNG with no transparency
- Fonts loaded from Google Fonts via `<link>` in each HTML (Noto Serif 700, Noto Sans Mono 400)
- Run via `node og/generate.js`

## HTML Page Template (per card)

Each HTML page is self-contained:
- `<!DOCTYPE html>` full document
- Inline `<style>` with the shared layout CSS
- Google Fonts `<link>` for Noto Serif + Noto Sans Mono
- Body set to exactly 1200×630, `overflow: hidden`
- Left `.flair` div (400×630) with absolutely-positioned `<canvas>` and right-edge fade `::after` pseudo-element
- Right `.text-side` flex container with name, accent line, brand
- `<script>` draws the flair illustration onto the canvas

Colors are hardcoded hex values taken from `shared-tokens.js` and project `colors.js` — the HTML pages don't import the shared modules (they're standalone for Puppeteer).

## Meta Tag Updates

Add to each project's `index.html` `<head>`:

```html
<meta property="og:image" content="https://a9l.im/{project}/og-image.png">
<meta name="twitter:image" content="https://a9l.im/{project}/og-image.png">
```

Update existing `twitter:card` from `summary` to `summary_large_image`.

Root site uses `https://a9l.im/og-image.png`.

## Reference Mockup

The validated Shoals card mockup is at `.superpowers/brainstorm/18132-1774251104/shoals-v3.html`. All other cards follow the same layout with different flair and title text.
