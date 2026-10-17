# WDS 3.0 Documentation Site: Plan

**Goal:** A static HTML/CSS documentation site for WDS 3.0 (Tekion Website Design System), modelled on the Weave benchmark. It covers foundations, components and section layouts, plus responsive behaviour, light/dark themes and content guidelines with character limits. Code lives in GitHub and deploys to Vercel.

**Sources**
- Figma: `WDS-3.0` (file key `lf5SOxUpWBtO8AIzXf6snw`)
- Benchmark: https://weave-design-system-bice.vercel.app/
- Structure brief: "WDS 3.0 documentation pages" (7 child pages, team ownership, child-page templates, governance note)

---

## 1. What's in the Figma file (audited 17 Oct 2026)

### Variables (5 collections, 581 variables)
| Collection | Modes | Contents | Feeds |
|---|---|---|---|
| `primitives` | value | gray (13), teal (10), static (4), status (12); font family/size/weight/stretch/line-height/letter-spacing; `core/size-0…200` on a 4px scale, plus `size-9999` | Colour + spacing scale pages |
| `typography` | desktop / tablet / mobile | 27 roles × 6 properties (162 vars): headline-1…6 (+ `-reg`), statistics, body-1…5 (reg/medium/bold), overline, button | Responsive type ramp |
| `theme` | **light / dark** | 175 semantic tokens: background (9), text (9), icon (9), border (7), status success/warning/error/destructive, component tokens (button ×5 types, input 20, checkbox 18), 12 gradients | Theme page + every component's token table |
| `breakpoint` | desktop / tablet / mobile | Section padding (top/bottom/side: none, default, 2x), gaps (title→description, content→CTA, content→image), widths | Grid, layout and section pages |
| `dimensions` | value | padding (22), gap (22), border-width (7), border-radius (16) | Spacing, borders and radii |

**Key layout values (desktop / tablet / mobile)**
- Device width: 1920 / 768 / 390
- Container max: 1420 / 640 / 342. Offset: 1180. Offset 2x: 960.
- H1 centred width: 940 / 640 / 342. H2 centred: 720. H2 left: 580. Paragraph centred: 720.
- Card columns: 5-col 170–222, 4-col 288–355, 3-col 300–474, 2-col 400–710 (each with padding tokens)

### Text styles (27)
Tekion Sans: Headline 1 = 56 SemiBold, H2 = 40, H3 = 32, H4 = 24, H5 = 20, H6 = 18, Statistics = 48 Light, Body 1–5 = 20/18/16/14/12 (Reg/Medium/SemiBold), Button = 14 Medium, Overline = 12 SemiBold. No effect styles exist, so there's no elevation system yet.

### Pages
- **Foundations:** Primitives, Typography, Theme, Logos, Icons, Typography Distribution (font usage/installation/web delivery guide)
- **Components:** Buttons, Inputs, Checkbox, Radio Button, Header, Banner
- **Sections (16):** Hero, Card Grid, Feature, Accordion, Carousel, Tabbed, Comparison, Video, Bento, Testimonial, Stats, FAQ, Footer, Pop Up, Legal content, Form
- **Other:** Design Systems Checklist, Responsive (WIP), Grids (WIP), Gradients (WIP), Inspiration, Archive

Every section is a component set with `Breakpoint=Desktop | Tablet | Mobile` variants. Hero alone has 7 sets: default, image 21:9, image 4:1.5, variant 1, content group, image 1:1, 3-column. That makes the responsive views straightforward to document.

**Button example** (`105:3`): types Primary, Secondary, Tertiary, Link, Icon L(56)/M(40)/S(32). States: Default, Hover, Pressed, Disabled. Tokens: pill radius (9999), 2px border, padding 24×8, icon gap 6.

### Gaps the documentation will expose
| Gap | Proposed handling |
|---|---|
| No character or word limits in Figma | Derive from width tokens and type sizes (see §5), mark as **Proposed**, get Marketing sign-off |
| No elevation/shadow or motion tokens | Document as "Not yet defined" with a placeholder page; raise with Design |
| Responsive, Grids, Gradients are WIP | Document what the variables define; flag WIP with a status badge |
| Components are web-marketing only (6) | Fine. Don't copy Weave's 27 app components. Document what WDS ships. |
| Dark-mode coverage per section unverified | Check each section's dark rendering during Phase 3 |

---

## 2. What to take from the benchmark (Weave)
- **Tech:** plain static `.html` pages, three stylesheets (`tokens.css`, `components.css`, `docs.css`), one `main.js`, Lucide icons from CDN, hosted on Vercel. **Use the same approach.**
- **Shell:** top bar (logo, Get started, Components), left sidebar grouped by Foundations / Components / Form inputs, overview page with card grid of components and one-line descriptions.
- **Component page anatomy:** Variants → States → Anatomy → Sizes → Spacing → Do/Don't → Microcopy (verb first, short, sentence case, no punctuation, allow for translation) → Accessibility (each rule tagged with its WCAG criterion: 2.5.8, 1.4.3, 1.4.11, 2.4.7, 2.1.1, 4.1.2, 2.5.3, 1.4.1).
- **Improve on Weave:** it has no theme toggle, no responsive previews, no section layouts and no content limits. WDS adds all four.

---

## 3. Information architecture
This follows the 7 child pages from the brief. The parent page holds only the overview, ownership and links.

```
/index.html                         WDS 3.0 home: purpose, ownership model (Design/Dev/Marketing), links
/overview/                          01 Design System Overview
  principles · accessibility · contribution · governance · versioning · changelog
/foundations/                       02 Foundations
  colour (primitives + theme) · typography · type-in-use (font distribution guide)
  spacing · grid-and-breakpoints · borders-and-radii · elevation (TBD) · gradients
  logos · icons · illustration (TBD) · motion (TBD)
/components/                        03 Components (one page each)
  button · input · checkbox · radio-button · header · banner
/sections/                          04 Section Layouts (one page each)
  hero · card-grid · feature · accordion · carousel · tabbed · comparison · video
  bento · testimonial · stats · faq · footer · pop-up · legal-content · form
/content/                           05 Content Guidelines
  voice-and-tone · headings · ctas · character-limits · alt-text
  accessibility-copy · localisation · seo-and-metadata
/developers/                        06 Developer Resources
  getting-started · tokens (CSS vars + JSON download) · theming · responsive
  component-api · accessibility · browser-support
/templates/                         07 Page Templates
  foundation · component · section · content-pattern (blank, copyable)
```

### Page templates (from the brief, merged with Weave's anatomy)
- **Component page:** Overview → Variants & states (live demos) → Anatomy → Design guidance (do/don't) → Responsive behaviour (D/T/M) → Light & dark → Microcopy & limits → Developer implementation (HTML, CSS classes, tokens table) → Accessibility (WCAG-tagged) → Figma / asset / code links → Acceptance checklist
- **Section page:** Overview → Recommended placement → Audience & goal → Content structure with **character-limit table per slot** → Responsive layout (D/T/M preview) → Light & dark → Variants → Figma link → Marketing handoff checklist
- **Content page:** Purpose → Voice & tone → Writing rules → Limits → Approved / not-approved examples → Accessibility & localisation notes

Every page carries a header strip with **Status** (Stable / WIP / Proposed), **Owner** (Design / Dev / Marketing), **Figma link** and **Last updated**, so the governance note can be enforced.

---

## 4. Technical design

### Stack
- HTML5 + CSS custom properties + vanilla JS. No framework.
- A **small Node build step** (no dependencies, or just one) does two jobs:
  1. `scripts/build-tokens.mjs`: turns `tokens/wds-tokens.json` (exported from Figma variables) into `css/tokens.css`
  2. `scripts/build-pages.mjs`: injects the shared header, sidebar and footer partials into each page, so nav is defined once (`src/nav.json`). Output goes to `/dist`.
- Vercel runs `npm run build` and serves `/dist`. Without the build step, every one of ~50 pages would duplicate the sidebar by hand.

### Folder layout
```
wds-docs/
  src/pages/**.html        page content (no shell)
  src/partials/            header.html, sidebar.html, footer.html
  src/nav.json             sidebar structure + status badges
  tokens/wds-tokens.json   exported from Figma
  css/tokens.css           generated
  css/wds.css              WDS component styles (the actual design system CSS)
  css/docs.css             documentation chrome (sidebar, code blocks, previews)
  js/docs.js               theme toggle, viewport switcher, copy-code, tabs, search
  assets/fonts/            Tekion Sans WOFF2 (see Decisions)
  assets/img/              exported Figma frames (D/T/M per section, light/dark)
  scripts/                 build scripts
  vercel.json
```

### Tokens to CSS
```css
:root            { --wds-bg-page: #fff; --wds-text-primary: …; }            /* theme: light */
[data-theme=dark]{ --wds-bg-page: …;    --wds-text-primary: …; }            /* theme: dark  */
@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { … } }  /* follow OS */

:root { --wds-h1-size: 56px; --wds-container: 1420px; … }                   /* desktop */
@media (max-width: 1279px) { :root { --wds-h1-size: …; --wds-container: 640px; } }  /* tablet */
@media (max-width: 767px)  { :root { --wds-h1-size: …; --wds-container: 342px; } }  /* mobile */
```
Naming mirrors Figma (`--wds-components-button-primary-bg-default`), so devs can go from Inspect to code 1:1. Aliases resolve to primitives, which keeps the layering (`primitive → theme → component`) visible on the Colour page.

### Docs-site features
1. **Theme toggle** (Light / Dark / System) in the top bar, saved in `localStorage`. Every live demo re-themes instantly.
2. **Viewport switcher** on each component/section preview (Desktop 1920 · Tablet 768 · Mobile 390). It renders the demo in a resizable `iframe` so real media queries fire, and shows the Figma frame next to it.
3. **Token tables** generated from JSON: name, light value, dark value, swatch, copy button.
4. **Character-limit tables** with a live counter. Marketers paste copy and see pass/fail against the limit.
5. Copy-code blocks, an on-page table of contents, client-side search across page titles and headings, skip link, visible focus.
6. The docs site itself meets WCAG 2.2 AA in both themes.

### Content pipeline from Figma
- Tokens: one read-only `use_figma` script exports all 5 collections with resolved values per mode into `tokens/wds-tokens.json`. Re-run whenever Figma changes.
- Visuals: export each section's Desktop/Tablet/Mobile variant (light + dark) as WebP via Figma screenshots.
- Live demos: rebuild components (Button, Input, Checkbox, Radio, Header, Banner) and **the core sections** as real HTML/CSS using `wds.css`. Use images for complex sections first and upgrade to live HTML later.

---

## 5. Content guidelines: proposed character limits
Derived from Figma width tokens and type sizes. Tekion Sans averages about 0.5em per character, so a 940px H1 at 56px fits roughly 33 characters per line. **All values are Proposed and need Marketing sign-off.**

| Slot | Style (desktop) | Max width | Proposed limit | Lines |
|---|---|---|---|---|
| Overline / eyebrow | Overline 12 SemiBold, caps | — | 30 chars | 1 |
| H1 hero (centred) | headline-1 56 | 940px | 60 chars (about 8 words) | ≤2 desktop, ≤4 mobile |
| H2 section (centred) | headline-2 40 | 720px | 70 chars | ≤2 |
| H2 section (left) | headline-2 40 | 580px | 55 chars | ≤2 |
| H3 card title | headline-4/5 | card width | 40 chars | ≤2 |
| Hero sub-copy | body-1 20 | 720px | 160 chars | ≤3 |
| Section description | body-2 18 | 720px | 200 chars | ≤3 |
| Card body | body-3/4 | card width | 120 chars | ≤4 |
| Primary/secondary CTA | button 14 | — | 20 chars (2–4 words, verb first) | 1 |
| Link CTA | button 14 | — | 25 chars | 1 |
| Stat number + label | statistics 48 / body-4 | — | 6 chars / 40 chars | 1 / 2 |
| Testimonial quote | body-1 | 720px | 280 chars | — |
| FAQ question / answer | headline-6 / body-3 | — | 90 / 500 chars | — |
| Banner message | body-4 | — | 90 chars | 1 desktop |
| Meta title / description | — | — | 60 / 155 chars | — |
| Alt text | — | — | ≤125 chars, no "image of" | — |

Plus: Title Case for headings, CTAs and field labels (matching the Figma copy) and sentence case for body text and messages, no trailing punctuation on headings or CTAs, one H1 per page, no skipped heading levels, and 30% expansion allowance for localisation (German, French).

---

## Status (17 Oct 2026)

All phases (0–7) are complete. The site has 70 pages: 57 documentation pages (including the home and 404 pages) and 13 live examples. It passes axe WCAG 2.2 AA in both themes and has no horizontal scrolling at 390px or 320px. Open design decisions are listed in the site's Changelog under "Open issues".

## 6. Delivery phases

| Phase | Deliverable | Est. |
|---|---|---|
| **0. Setup** | GitHub repo, folder structure, build scripts, Vercel project with preview deploys per PR | 0.5 day |
| **1. Tokens + shell** | Export Figma variables to JSON, `tokens.css` (light/dark + 3 breakpoints), docs shell (top bar, sidebar, theme toggle, viewport switcher, search), home page with ownership model | 1.5 days |
| **2. Foundations** | Colour (primitives + semantic + component layers, light/dark swatches, contrast ratios), Typography (27 styles × 3 breakpoints), Type in use (font distribution guide), Spacing, Grid & breakpoints, Borders & radii, Gradients, Logos, Icons, plus TBD placeholders | 2 days |
| **3. Components** | 6 component pages on the component template, with live demos, all states, D/T/M, light/dark, token tables, WCAG notes, acceptance checklist | 2 days |
| **4. Section layouts** | 16 section pages: D/T/M previews (Figma exports), variants, content-slot tables with limits, placement, handoff checklist. Hero, Feature, Card Grid, CTA/Banner and Footer get live HTML. | 3 days |
| **5. Content guidelines** | 8 content pages, live character-counter tool, approved/not-approved examples | 1 day |
| **6. Dev resources + templates + overview** | Getting started, token download, theming guide, component API, browser support, 4 blank templates, governance/versioning/changelog | 1 day |
| **7. QA + launch** | Accessibility audit (axe + keyboard), both themes, 3 breakpoints, link check, Lighthouse ≥95, cross-functional review, production deploy | 1 day |

About **12 working days** in total. Each phase ends in a Vercel preview URL for review.

**Suggested order:** Phases 0–1 first (they unblock everything). Then build the Button page and Hero page end to end as **pilot pages** and review them before rolling the templates out to the rest.

---

## 7. Decisions needed before building
1. ~~**Hosting & access.**~~ **Decided 17 Oct 2026:** public, on Vercel, like Weave.
2. **Font files.** Tekion Sans is proprietary. Can the `web-marketing` variable WOFF2s be self-hosted on the docs site? If not, the site falls back to a system font and the type pages show Figma renders.
3. **Character limits.** Who on Marketing signs off the proposed table in §5?
4. **Repo location.** Personal GitHub or a Tekion org?

## 8. Acceptance criteria for the site
- Every Figma page under Foundations, Components and Sections has a doc page with status, owner, Figma link and last-updated date.
- Every token in the 5 collections is visible on a page, with light and dark values where they exist.
- Every component and section shows Desktop, Tablet and Mobile views, and both themes.
- Every section lists its content slots with character limits.
- The docs site passes WCAG 2.2 AA in both themes, works at 390px width with no horizontal scroll, and deploys from `main` to Vercel automatically.
