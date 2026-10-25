---
design_md_version: 3
body: canonical
project: jaothui-dashboard
token_source: "tailwind.config.ts; src/styles/globals.css"
verify_tokens:
  - name: --bg-dark
    expect: "#0f0f11"
    probe: "background-color on body"
  - name: --primary-orange
    expect: "#FF8C00"
    probe: "background-color on .bg-primary-orange"
  - name: --primary-orange-glow
    expect: "#FFA500"
    probe: "background-color on .bg-primary-orange-glow"
  - name: --accent-purple
    expect: "#9D00FF"
    probe: "background-color on .bg-accent-purple"
  - name: --accent-purple-glow
    expect: "#B847FF"
    probe: "background-color on .bg-accent-purple-glow"
  - name: --glass-border
    expect: "rgba(255, 255, 255, 0.1)"
    probe: "border-top-color on .glass-card"
  - name: --text-muted
    expect: "rgba(255, 255, 255, 0.6)"
    probe: "color on .text-text-muted"
  - name: rounded-3xl
    expect: "24px"
    probe: "border-top-left-radius on .glass-header.rounded-3xl"
verify_eyes:
  - kind: web-eye
    gate: required
    sees:
      - "Rendered web DOM, computed styles, responsive layout, focus, interactions and browser downloads"
      - "Competition workspace at 390, 768 and 1440 CSS pixels using a designated synthetic test event"
      - "Draft, cover, catalog, publish, public visibility, manual registration close and locked-rule UI"
    does_not_see:
      - "Source-only inspection and this document do not close rendered browser claims"
      - "Transaction atomicity, server authorization, timezone boundaries and concurrency require deterministic tests"
      - "Physical LINE delivery and operator acceptance require separate approved recipient and operator evidence"
      - "No native or React Native rendering claims"
    artifact_sink: "/Users/non/dev/opilot/.playwright-mcp/jaothui-dashboard/competition-admin/phase-5/"
    commands:
      - "Run npm run dev from the isolated dashboard worktree on an available local port; record the actual URL"
      - "Use the plan canonical Codex cua_repl owned browser session/tab; obtain operator login readiness when needed"
      - "Open /dev/tokens-showcase for the existing color, glass and radius probes; inspect computed styles"
      - "Open the actual competition routes and verify create/edit/list/filter/closure flows at 390/768/1440px"
      - "Record viewport, URLs, commit IDs, synthetic entity IDs, sanitized console/network results and screenshots in artifact_sink"
      - "Require documentElement.scrollWidth <= documentElement.clientWidth; inspect local table scroll separately"
    claim_label: EVENT_WORKSPACE_WEB_EYE_CLOSED
  - kind: web-eye
    gate: required
    sees:
      - "Existing production buffalo create/edit DOM, receipt progress, upload, reload and re-auth recovery at390/768/1440px"
    does_not_see:
      - "Source-only validation does not establish runtime recovery or actual mainnet acceptance"
      - "No native rendering claims"
    artifact_sink: "/Users/non/dev/opilot/.playwright-mcp/jaothui-dashboard/buffalo-integrity/"
    commands:
      - "Use the source-selected isolated buffalo runtime only for genuine create/edit recovery tests; never use mainnet as an incidental regression fixture"
      - "For competition-only changes, verify existing buffalo route/read/disabled-write guards and retain earlier qualified runtime evidence with its exact scope"
    claim_label: BUFFALO_REGISTRY_WEB_EYE_CLOSED
primitives:
  - name: Header
    file: src/components/ui/Header.tsx
    variants: [default]
  - name: AmbientOrbs
    file: src/components/ui/AmbientOrbs.tsx
    variants: [default]
  - name: DashboardCard
    file: src/components/ui/DashboardCard.tsx
    variants: [orange, purple]
  - name: CardGrid
    file: src/components/ui/CardGrid.tsx
    variants: [default]
  - name: Icon
    file: src/components/ui/Icon.tsx
    variants: [sm, md, lg, xl, orange-glow, purple-glow]
  - name: BaseLayout
    file: src/components/layout/BaseLayout.tsx
    variants: [dashboard, inner-page]
  - name: DurableCreate
    file: src/components/new-buffalo-info/DurableCreate.tsx
    variants: [form, upload, review, pending, completed]
  - name: DurableEdit
    file: src/components/update-buffalo-info/DurableEdit.tsx
    variants: [details, field-dialog, pending, recovery, scoped-completed, read-only-conflict]
quality_gates:
  accessibility:
    contrast: "WCAG AA; zero critical or serious axe violations on changed surfaces"
    labels_roles: "Every control has an accessible name; form labels, keyboard navigation and visible focus"
  spacing:
    scale: "4px Tailwind spacing scale; document intentional existing exceptions"
  typography:
    body_min: "16px"
    label_min: "14px"
    family: "Kanit, Inter, sans-serif"
    numeric: "tabular numerals for aligned operational counts and comparable numeric columns"
  touch:
    target_min: "44px"
patterns:
  - atmospheric-canvas-background
  - tinted-shadow-glow
  - status-chip-badge
---

# Jaothui Dashboard — DESIGN.md

Extracted for competition-admin issue #56 from the existing dashboard. This is a
read contract, not a redesign or a claim that browser verification has passed.
Sources: `tailwind.config.ts`, `src/styles/globals.css`, `src/pages/_app.tsx`,
`src/components/ui/*`, and `src/pages/dashboard/news-events/index.tsx`.
`docs/DESIGN_TOKENS.md` and `docs/dashboard-template.html` are supporting history.

## 1. Visual Theme & Atmosphere

Near-black glass surfaces, warm orange primary actions and purple secondary
accents create the dashboard identity. Kanit supports Thai operational content.
The existing hub uses floating ambient light, rounded cards, duotone icons,
hover tilt and click ripples. Preserve this shell while keeping dense competition
forms and application review quiet, legible and predictable.

Reuse the existing system before creating components. Do not import the separate
gold/cream/Prompt theme from jaothui-event into this dashboard.

## 2. Color Palette & Roles

| CSS variable / Tailwind name | Actual value | Existing role |
| --- | --- | --- |
| `--bg-dark` / `dark` | `#0f0f11` | Main background |
| `--primary-orange` / `primary-orange` | `#FF8C00` | Primary actions and accents |
| `--primary-orange-glow` / `primary-orange-glow` | `#FFA500` | Orange hover/light |
| `--accent-purple` / `accent-purple` | `#9D00FF` | Secondary accents |
| `--accent-purple-glow` / `accent-purple-glow` | `#B847FF` | Purple hover/light |
| `--glass-bg` / `glass` | `rgba(255,255,255,0.03)` | Transparent fill token |
| `--glass-border` / `glass-border` | `rgba(255,255,255,0.1)` | Surface outline |
| `--glass-highlight` / `glass-highlight` | `rgba(255,255,255,0.15)` | Hover highlight |
| `--text-main` / `text-main` | `#ffffff` | Primary text |
| `--text-muted` / `text-muted` | `rgba(255,255,255,0.6)` | Supporting text |

DaisyUI 4 extends `halloween` with `base-100`, `primary`, and `secondary`
overridden to the dark/orange/purple values above. Other DaisyUI semantic roles
remain inherited; do not assume they equal custom tokens. The news screen uses
emerald published, red archived and white draft badges with tinted fills and
borders. Competition statuses must include explicit Thai text and closure reasons,
with separate event and registration status; color alone cannot convey state.

## 3. Typography

`src/pages/_app.tsx` loads Kanit weights 300/400/500/600 for Thai and Latin and
Inter 400/600 for Latin through `next/font/google`. Their variables are
`--font-kanit` and `--font-inter`. The app wrapper applies `font-kanit`;
`font-sans` is Kanit, Inter, then Tailwind defaults. Global body CSS also declares
literal Kanit/Inter; see Known Drift before changing font ownership.

Existing scales use Tailwind defaults: headings `text-2xl md:text-3xl`, section
headings `text-lg`/`text-xl`, ordinary form labels and controls `text-sm`, and some
metadata `text-xs`. This extraction does not claim those legacy sizes satisfy the
quality floor. New operational body content uses at least 16px and labels/support
at least 14px; keep long Thai names wrapping and operational numerals aligned.

## 4. Component Stylings

- `.glass-card`: 135-degree white gradient from 8% to 2%, 1px glass border,
  backdrop blur 10px and soft black shadow. It is a CSS surface, not a React export.
- `.glass-header`: dark `rgba(20,20,20,0.6)`, glass border, blur 20px and header
  shadow. `Header` is sticky, rounded and includes the existing logout control.
- The news screen uses `rounded-3xl` panels, `rounded-xl` inputs/buttons,
  `bg-black/30` fields, orange focus borders, 44px actions, and 48px search fields.
- Primary buttons are orange with black text; secondary actions use tinted glass
  and a border. Show disabled, pending, success and failure feedback explicitly.
- Pills use `rounded-full`, semantic text, tinted fills and subtle borders.
- Navigation cards support orange/purple glow and tilt/ripple. Those interactions
  belong to navigation, not applicant rows, save actions or approval decisions.
- The existing cover preview is 16:9. Preserve image aspect ratio and meaningful
  accessible text where an image carries applicant/review information.

No general Button/Input/Dialog React library exists here. DaisyUI classes and
page-local markup supply controls. New shared competition components may compose
these styles; do not add a UI library or claim page-local code is a shared primitive.

## 5. Layout Principles

The authenticated news screen is the current operational reference: `max-w-7xl`,
full-width content, mobile padding 16px and wider padding 24px, section gap 24px.
Its search/filter controls compose in a responsive grid; lists have loading,
error and empty states. The hub uses `CardGrid` with `max-w-3xl`, 20px gap and one
mobile/two desktop columns. Use that grid for navigation only.

Use Tailwind's 4px spacing scale. Long names require `min-w-0` and wrapping;
flex/grid tracks should use `minmax(0,1fr)` when content can grow. Competition
creation and applications require their own route context rather than squeezing
all operations into the news editor's fixed 420px side panel. Preserve event
context through tabs, detail actions and export. Search and filters must compose
and have a clear reset; display why an event or registration is closed.

## 6. Depth & Elevation

Existing tokens: `shadow-glass-card` is `0 4px 6px rgba(0,0,0,0.1)`;
`shadow-glass-header` is `0 8px 32px rgba(0,0,0,0.3)`;
`shadow-glass-card-hover` is `0 20px 40px rgba(0,0,0,0.4)`.
Orange/purple glow combines a 20px/40px outer shadow at 15% opacity with a 20px
inset at 10%; matching inset outline tokens also exist. Keep their current mixed
black/tinted model; linked Design Brain patterns do not authorize replacing it.

Surfaces use 24px `rounded-3xl`, 16px `rounded-2xl`, 12px `rounded-xl`, or pills.
Decorative orbs are non-interactive in a fixed clipped background at z-0; content
uses relative z-10 and Header z-50. Ensure dialogs and focus are not clipped by
scroll containers or placed behind the sticky header.

## 7. Do's & Don'ts

- Reuse Header/AmbientOrbs for the existing shell and DashboardCard/CardGrid/Icon
  for navigation. Read their props before composing them.
- Keep Thai day-only inputs and label signup dates, event dates and age cutoff
  independently. Explain inclusive Bangkok closing day beside signup fields.
- Display event lifecycle and registration availability separately, including
  manual/date closure reason. Show locked rules and impact-review requirements.
- Keep draft/save/publish actions distinct; preserve entered values after errors
  and warn about unsaved edits. Prevent accidental duplicate writes.
- Use visible textual pending/approved/rejected states and rejection reasons.
- Do not change branding, add whole-dashboard chrome, or copy event's gold theme.
- Do not communicate status with color alone, animate destructive decisions, hide
  invalid legacy data, or infer a named operator from the shared login.
- Respect reduced-motion preference on changed surfaces; existing motion support
  is a recorded gap, not already-proven compliance.

## 8. Responsive Behavior

Tailwind default breakpoints apply: sm 640px, md 768px, lg 1024px, xl 1280px.
News filters become columns at md; list/editor becomes two columns only at lg.
Header currently has fixed margins/padding and brand plus logout on one line;
its narrow-screen fit must be checked before claiming reuse is responsive.

For competition issue #56, verify 390/768/1440px with long Thai names and catalogs.
No horizontal page overflow: `documentElement.scrollWidth <= clientWidth`.
Wide tables may scroll only inside a labeled local container, or become readable
mobile rows. Controls must remain reachable without hover. Sticky header and any
sticky actions must not obscure fields or keyboard focus. Existing shell has no
explicit safe-area handling; do not claim device safe-area evidence from source.

## 9. Agent Prompt Guide

> Continue the existing near-black, orange/purple glass dashboard using Kanit and
> the real Header, AmbientOrbs and navigation primitives. Treat the news screen
> as the current operational style reference. Keep dense competition content
> quiet and readable, separate event/registration status, clearly label date-only
> Bangkok semantics and age cutoff, preserve event context and support narrow
> field-use screens. Reuse existing styles; do not import the legacy gold theme,
> add a component library or redesign unrelated pages. Validate tokens and collect
> actual browser evidence before claiming the workspace is visually complete.

## Measurable Quality Gates

Quality gates above are requirements for changed surfaces, not assertions that
legacy pages pass: WCAG AA contrast, zero critical/serious axe findings, labeled
controls and visible keyboard focus, 4px spacing scale with documented intentional
exceptions, body at least 16px, labels/support at least 14px, and interactive targets
at least 44 by 44 CSS pixels. Record violations and fix those affecting the changed
flows; do not quietly lower the floor to match old compact controls.

`verify_tokens` can be probed on the existing `/dev/tokens-showcase` surface;
header radius can also be probed on authenticated dashboard screens. Normalize
browser hex/RGB serialization before comparing. A missing selector is an evidence
gap, not a pass. This older showcase is not a complete competition state showcase.
The required web-eye lane above closes only `EVENT_WORKSPACE_WEB_EYE_CLOSED` when
its recorded flows pass. Applications/onsite/export and final operator acceptance
remain separate plan phase claims; never promote static validation into web proof.

## Primitives (reuse-first)

| Export | File | Actual props/variants |
| --- | --- | --- |
| Header | `src/components/ui/Header.tsx` | Default brand/logout shell |
| AmbientOrbs | `src/components/ui/AmbientOrbs.tsx` | Default orange/purple/red decoration |
| DashboardCard | `src/components/ui/DashboardCard.tsx` | `variant: orange/purple`; href or onClick |
| CardGrid | `src/components/ui/CardGrid.tsx` | Children and className; responsive navigation grid |
| Icon | `src/components/ui/Icon.tsx` | size sm/md/lg/xl; glow orange/purple; color/className |

`BaseLayout` in `src/components/layout/BaseLayout.tsx` is the older orange navbar
shell; it coexists with Header rather than being the new operational default.
`EventSelector` in `src/components/event-export/EventSelector.tsx` sends an event
name and has limited custom-dropdown semantics; it is not the competition ID
selector contract. Reuse export download behavior without depending on name IDs.

## Design Brain Links

- [Atmospheric canvas](/Users/non/dev/opilot/ψ/memory/learnings/patterns/ui/atmospheric-canvas-background.md): analogous radial-light atmosphere; dashboard uses separate orb elements.
- [Tinted glow](/Users/non/dev/opilot/ψ/memory/learnings/patterns/ui/tinted-shadow-glow.md): orange/purple emphasis; dashboard also keeps black neutral shadows.
- [Status chips](/Users/non/dev/opilot/ψ/memory/learnings/patterns/ui/status-chip-badge.md): analogous pill/status language; dashboard uses filled tinted badges without requiring a dot.

Patterns explain similarities, not exact conformance or permission to restyle.

## Known Drift

- Colors and some keyframes are duplicated between Tailwind config and globals;
  utilities often use literal Tailwind values rather than CSS variables. Keep
  both sources aligned when an authorized future change touches them.
- `docs/DESIGN_TOKENS.md` contains stale class examples and breakpoint commentary;
  prefer the actual config and component implementation when they disagree.
- Modern glass Header and legacy BaseLayout/DaisyUI export pages coexist.
  News controls/status badges are page-local markup, not shared React primitives.
- Header brand icon uses raw `orange-400`, logout uses red; news uses raw
  white/emerald/red shades and 12px metadata. Semantic typography/status tokens
  and a complete component abstraction do not exist yet.
- `rounded-3xl` is 24px but navigation cards use `rounded-2xl`; do not report a
  universal 24px card radius. Font variables and literal body families coexist;
  `font-bold` requests weight 700 although Kanit only loads through 600.
- Navigation card/icon class strings contain duplicate sizes and a custom
  `scale-120` class with no matching scale extension; trust rendered CSS over comments.
- Global motion lacks a complete reduced-motion rule. Dense legacy tables and
  Header mobile fit remain browser risks; no runtime pass is claimed here.
- Hub source filename is `src/pages/dashboard/index..tsx` with two dots. Check
  actual routing before wiring the competition entry; do not normalize it as an
  unrelated change. Existing `/dev/tokens-showcase` is not a newly-built showcase.

## Buffalo registry scope

The production buffalo forms keep their existing BaseLayout/DaisyUI four-step
creation flow and field-dialog edit flow. Their8px form corners and ordinary
bordered surfaces are scoped to buffalo forms; the competition workspace retains
its existing24px glass panels. Preserve both instead of restyling one domain to
match the other. The full inherited production contract and selectors are kept
in [Buffalo integrity design](docs/buffalo-integrity-design.md). Competition work
must not restore legacy buffalo write routes, change receipt/recovery semantics,
or replace the durable create/edit components. Production canary acceptance is
not implied by a competition regression run.

### Competition Thai date composition

`src/components/competitions/ThaiDateInput.tsx` composes existing `control`
styles into one fieldset with a legend and a three-select row: day, abbreviated
Thai month, Buddhist-era year. Each select has a field-specific accessible name,
shared error description, 48px minimum control height and orange focus styling.
The month column is wider; each column has `min-width: 0`. Parent grids keep
existing stacking at mobile widths and two-column editor layout on desktop.
Arabic digits and an explicit พ.ศ. legend distinguish the displayed era.
Calendar errors remain visible without silently clamping a selected day. The
clear action appears only for nonempty/review fields and retains a 48px target.

The component is controlled by draft parts, without effect-based value syncing.
Consumers explicitly reset on accept/autofill/clear and guard incomplete dates.
Gregorian ISO date-only strings remain the API and persistence contract. Year
choice expansion does not create a new eligibility rule. Date-specific rendered
proof belongs in `/Users/non/dev/opilot/.playwright-mcp/jaothui-dashboard/competition-thai-date/phase-3/`;
deterministic helper/consumer tests alone do not close that web-eye lane.
