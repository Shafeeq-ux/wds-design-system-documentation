# WDS 3.0 documentation

Documentation site for **WDS 3.0, the Tekion Website Design System**: foundations, components, section layouts, content guidelines and developer resources. It's plain HTML, CSS and vanilla JS, with a small Node build step and no dependencies.

- Design source: [Figma · WDS-3.0](https://www.figma.com/design/lf5SOxUpWBtO8AIzXf6snw/WDS-3.0)
- Plan: [PLAN.md](PLAN.md)

## Run it locally

Needs Node 20 or later.

```bash
npm run dev
```

This opens http://localhost:4321 and rebuilds whenever you change a file. `npm run build` writes the site to `dist/`, and `npm run check` builds it and then checks every internal link.

## How it's organised

| Path | What it is |
|---|---|
| `tokens/wds-tokens.json` | Every Figma variable, resolved per mode. This is the source of truth for tokens. |
| `css/tokens.css` | Generated from the JSON by `scripts/build-tokens.mjs`. Don't edit it. |
| `css/wds.css` | WDS component and layout styles: the design system itself |
| `css/docs.css` | Styles for the documentation site (shell, sidebar, previews, tables) |
| `js/wds.js` | Component behaviour: primary button hover, header menus |
| `js/docs.js` | Docs only: theme switch, mobile nav, search, contents, previews, counters, calculator |
| `scripts/shortcodes.mjs` | Build-time tables generated from the token and section data |
| `src/data/sections.json` | Every section variant (Figma node, theme) and content slot (style, width, lines) |
| `src/data/icons.json` | Feature icon names and keywords |
| `tokens/wds-css-variables.json` | Generated: every CSS variable with its value per theme or breakpoint |
| `src/nav.json` | Sidebar structure: every page, its owner, status, phase and Figma node |
| `src/partials/layout.html` | The shared page shell |
| `src/pages/**.html` | Page content. Any page in `nav.json` without a file gets a "Planned" stub. |
| `src/pages/examples/*.html` | Standalone demos that live previews load in an iframe. `"layout": "example"` adds the WDS head for you; `"bare"` is copied as-is. |
| `assets/sections/` | Figma renders of every section variant (desktop, tablet, mobile) |

### Adding a page

1. Add an entry to `src/nav.json` if it isn't there.
2. Create `src/pages/<group>/<name>.html`. Start it with an optional meta comment that overrides the nav entry:
   ```html
   <!--meta {"status": "WIP", "updated": "2026-10-17"} -->
   <h2>Overview</h2>
   ```
3. Every `h2` appears in the "On this page" contents and in search.

### Shortcodes

Write these in a page and the build replaces them with generated HTML:

| Shortcode | Output |
|---|---|
| `<!--wds:ramp color/gray-->` | Primitive colour ramp |
| `<!--wds:theme text/-->` | Theme tokens under a path, light and dark, with contrast |
| `<!--wds:pairs-->` | Foreground/background pairs checked in both themes |
| `<!--wds:type-scale-->` | All 27 text styles at desktop, tablet and mobile |
| `<!--wds:scale spacing/padding/p--->` | Size tokens as bars |
| `<!--wds:responsive spacing/width/-->` | Breakpoint tokens per mode |
| `<!--wds:radii-->`, `<!--wds:borders-->`, `<!--wds:gradients-->` | Previews |
| `<!--wds:icons-->`, `<!--wds:icon-keywords-->` | Utility icons, feature icon table |
| `<!--wds:section-sets hero-->` | Figma renders for a section |
| `<!--wds:section-limits hero-->` | Character-limit table with live counters |
| `<!--wds:all-limits-->`, `<!--wds:limit-calculator-->` | Every slot, and the calculator |

### Adding a live preview

```html
<div class="doc-preview" data-src="/examples/hero-default.html" data-title="Hero · default"></div>
```

The preview has Desktop (1440), Tablet (768) and Mobile (390) widths and its own Light/Dark switch. The iframe renders at the real width, so real media queries fire. Add `data-start-theme="dark"` to open it in dark.

## Tokens

CSS names come from the Figma path. A leading category group (`background`, `components`, `gradient`, `spacing`, `core`) is dropped, and so is a segment that the next one repeats:

| Figma | CSS |
|---|---|
| `background/bg-page` | `--wds-bg-page` |
| `text/text-primary` | `--wds-text-primary` |
| `color/gray/gray-800` | `--wds-color-gray-800` |
| `components/button-primary/btn-primary-bg-default` | `--wds-btn-primary-bg-default` |
| `spacing/width/container-max-width` | `--wds-width-container-max-width` |
| `headline-1` text style | `.wds-headline-1` and `--wds-headline-1-font-size` etc. |

The theme defaults to light. `[data-theme="dark"]` forces dark mode, and `prefers-color-scheme: dark` applies dark unless `data-theme="light"` is set. Typography and layout tokens use desktop values by default, tablet values at 1279px and below, and mobile values at 767px and below.

To refresh tokens after a Figma change, run `scripts/figma-export.js` in the Figma file once per collection, update `tokens/wds-tokens.json` and rebuild.

## Quality checks

- `npm run check` builds the site and fails on any broken internal link or `#anchor`. Stop `npm run dev` first, or wait for it to finish rebuilding, so the two builds don't overwrite `dist/` at the same time.
- Accessibility: run axe DevTools on new pages in both themes. The 3.0.0 release passed axe WCAG 2.2 AA rules on every page and example, in light and dark.
- Responsive: check every new page at 390px and 320px for horizontal scrolling.

## Deploy

Vercel builds with `npm run build` and serves `dist/` (see `vercel.json`). Every pull request gets a preview URL, and `main` deploys to production.

GitHub Pages also publishes `main` at https://shafeeq-ux.github.io/wds-design-system-documentation/ (see `.github/workflows/pages.yml`). Pages serves the site from a subfolder, so the workflow builds with `BASE_PATH=/wds-design-system-documentation`, which prefixes every root-relative URL. Code samples in `<pre>` keep their real paths. To test a subfolder build locally:

```bash
BASE_PATH=/wds-design-system-documentation npm run build
```
