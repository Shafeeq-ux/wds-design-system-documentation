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

## Prototype lab

`/lab/index.html` is a page builder that runs on WDS 3.0 itself. Pick sections from the library (or drag them onto the canvas), reorder them, set each one's theme, edit the copy in place, check Desktop, Tablet and Mobile widths, and export a standalone HTML page. The Foundations tab lists every colour token (light and dark), text style and spacing token; click one to copy it.

Feature icons go in an example as `<wds-icon name="guided-fix-actions"></wds-icon>`. The build inlines the SVG and recolours it to follow the theme.

The canvas loads only `tokens.css`, `wds.css` and `wds.js`, so a prototype looks exactly like production. Work is saved in the browser, and ⌘Z undoes.

| Path | What it is |
|---|---|
| `src/lab/blocks.json` | The block library and presets. Each block points at a top-level element of an example file, so the lab always matches the docs. |
| `src/lab/blocks/*.html` | Lab-only blocks, such as the content form, built from WDS components |
| `scripts/lab.mjs` | Builds `dist/lab/blocks.json` and composes each preset into `dist/lab/pages/<id>.html` |
| `js/lab.js`, `css/lab.css` | The lab app |
| `js/lab-import.js` | The Word brief importer |
| `src/pages/examples/card-grid-4.html`, `video-single.html`, `stats-security.html` | The 4-column card grid, single video and security sections the importer uses |

The **Automotive Retail Cloud** preset is a full landing page built only from WDS sections: banner, header, hero, feature statement, stats, card grid, form, FAQ and footer. It's also published as a plain page at `/lab/pages/arc-landing.html`.

To add a section to the lab, add its example to `src/pages/examples/` and an entry to `src/lab/blocks.json`.

### Importing a page brief (.docx)

**Import .docx** (or drop a Word file on the canvas) builds a page from a copy brief. The file is read in the browser and never uploaded. A report then lists the sections it made, what still needs assets, anything it couldn't place, notes in the brief and the document's review comments. Undo puts the previous page back.

The importer understands the conventions our briefs already use:

| In the brief | On the page |
|---|---|
| First plain line | Hero headline |
| `SUBHEADING:`, `CTA BUTTON:`, `STATS:` then `25% Reduction in …` lines | Hero copy, button and up to 3 stats |
| `Dropdown = F&I AI` | Adds the page to the header's AI agents menu |
| `[Any Name SECTION]` | Starts a section. `SECTION HEADLINE:` and `SECTION DESCRIPTION:` fill its title and copy |
| `[Feature Card]` with the title and copy on separate lines | Card grid · 4 column, with the feature icon whose name matches the card title |
| `VIDEO SECTION HEADER:`, `VIDEO SECTION DESCRIPTION:`, `[video]` | Video · AI single |
| `For Sales Managers: …` | A persona card. Six make a 3-column grid |
| `Security Section and Footer – same as <url>` | The standard security section and footer |
| A short line ending in `?`, then its answer | FAQ. Select the FAQ section and use **Add question** to add more |
| `NOTE:` | Listed in the report, not put on the page |
| A section with no cards | Feature · statement |

Copy is imported as written, with tracked changes shown as if accepted. `js/lab-import.js` holds the reader and the rules, and `dist/lab/icons.json` (built by `scripts/lab.mjs`) holds the theme-coloured feature icons it matches against.

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
