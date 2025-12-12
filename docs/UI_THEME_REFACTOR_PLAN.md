# UI Theme Refactor Plan — TDD Approach (Revised)

**Issue**: #44  
**Branch**: `feature/ui-theme`  
**Base**: `staging`  
**Status**: Planning → Implementation Ready

---

## 📋 Overview

Refactor Jaothui Dashboard UI by:
1. **Setting up design tokens** with comprehensive testing
2. **Building reusable components** with unit tests before integration
3. **Analyzing & comparing** current dashboard design with new template
4. **Implementing dashboard** with full token/component integration and visual verification

**Approach**: Test-Driven Development (TDD) — write tests → implement → refactor → verify

---

## 🎯 Phase 1: Design Tokens Setup & Validation (TDD)

### Objective
Extract and validate all design tokens from `docs/dashboard-template.html` into centralized configuration (`tailwind.config.ts` and `src/styles/globals.css`).

### Tasks

#### 1.1 Extract and document tokens
- [ ] Parse `docs/dashboard-template.html` `:root` CSS variables
- [ ] Create `docs/DESIGN_TOKENS.md` documenting:
  - Colors (primary, accent, backgrounds, text)
  - Spacing (padding, gap, margin)
  - Border radius (lg: 24px, sm: 12px)
  - Shadows (header, card, hover, inset)
  - Typography (font families, sizes, weights)
  - Animations (duration, easing, keyframes)
  - Orb configuration (sizes, positions, blur)

#### 1.2 Implement tokens in Tailwind & globals
- [ ] Update `tailwind.config.ts`:
  - Extend `theme.colors` with primary-orange, primary-orange-glow, accent-purple, accent-purple-glow, bg-dark
  - Extend `theme.spacing` with custom values if needed
  - Extend `theme.borderRadius` with custom radius values
  - Add custom `keyframes` for animations (float, ripple, shake)
- [ ] Update `src/styles/globals.css`:
  - Add `:root` CSS variables for all tokens
  - Document token purpose with comments
  - Add utility classes: `.glass-card`, `.glass-header`, `.glass-input`

#### 1.3 Test tokens implementation
- [ ] Unit tests: `src/styles/__tests__/tokens.test.ts`
  - Test: All colors are valid hex/rgba
  - Test: Tailwind config loads without errors
  - Test: CSS variables render correctly in DOM
  - Test: Utility classes apply correct styles (snapshot tests)
- [ ] Visual regression test:
  - Create a token showcase page (`src/pages/dev/tokens-showcase.tsx`) displaying all colors, spacing, shadows
  - Screenshot & compare against expected (manual or Storybook)
  - Verify glass effect, glow, and animations work

### Success Criteria ✅
- [ ] `docs/DESIGN_TOKENS.md` created with complete token inventory
- [ ] `tailwind.config.ts` extended with all custom tokens (0 hardcoded values in components)
- [ ] `src/styles/globals.css` has `:root` variables + utility classes
- [ ] Unit tests pass: token validation, CSS variable rendering
- [ ] Token showcase page renders correctly (desktop & mobile)
- [ ] No console errors or warnings related to tokens
- [ ] Build succeeds: `npm run build` ✅

---

## 🧩 Phase 2: Build Reusable UI Components (TDD)

### Objective
Create and test isolated, reusable components before integrating into dashboard.

### Components to Build

#### 2.1 Header Component
**File**: `src/components/ui/Header.tsx`

- **Props**:
  - `title?: string` (default: "Dashboard")
  - `onLogout?: () => void`
  - `brandTitle?: string` (default: "Dashboard")
  - `brandIcon?: ReactNode`
- **Behavior**:
  - Sticky glass header with glassmorphism effect
  - Logo/brand area on left, logout button on right
  - Accessible: `aria-label` on logout button, `role="banner"` on header
  - Responsive: adapt layout on mobile

- **Tests** (`src/components/ui/__tests__/Header.test.tsx`):
  - Test: Renders with default props
  - Test: Logout button calls `onLogout` on click
  - Test: Logout button is keyboard accessible (Enter/Space)
  - Test: Header is sticky and maintains position
  - Test: Mobile responsive layout applies correctly
  - Test: Snapshots (desktop & mobile)

#### 2.2 DashboardCard Component
**File**: `src/components/ui/DashboardCard.tsx`

- **Props**:
  - `title: string` (Thai text)
  - `icon?: ReactNode` (Phosphor icon)
  - `variant?: 'orange' | 'purple' | 'default'`
  - `onClick?: () => void`
  - `ariaLabel?: string`
  - `disabled?: boolean`
  - `enableRipple?: boolean` (default: true)
  - `enableTilt?: boolean` (default: true)
  - `size?: 'sm' | 'md' | 'lg'` (height: 100px | 140px | 180px)

- **Behavior**:
  - `<button>` element (keyboard accessible)
  - Glass card effect with color variant glow
  - Ripple effect on click (optional)
  - 3D tilt on hover (optional)
  - Smooth transitions & hover states
  - Mobile: no tilt, adjust height

- **Tests** (`src/components/ui/__tests__/DashboardCard.test.tsx`):
  - Test: Renders as button with correct title
  - Test: Icon renders correctly
  - Test: Variant colors apply (orange, purple)
  - Test: onClick handler called on click
  - Test: Keyboard activation (Enter/Space)
  - Test: Ripple effect creates & removes span element
  - Test: Tilt effect applies/removes on mousemove/leave
  - Test: Focus ring visible & accessible
  - Test: Disabled state prevents interaction
  - Test: Size variants apply correct heights
  - Test: Snapshots (all variants & sizes)

#### 2.3 CardGrid Component
**File**: `src/components/ui/CardGrid.tsx`

- **Props**:
  - `children: ReactNode` (DashboardCard instances)
  - `cols?: number` (default: 2)
  - `maxWidth?: string` (default: "800px")
  - `gap?: number` (default: 20)

- **Behavior**:
  - CSS Grid layout
  - Responsive: 2 cols on desktop, 1 col on mobile
  - Centered with max-width constraint

- **Tests** (`src/components/ui/__tests__/CardGrid.test.tsx`):
  - Test: Renders children correctly
  - Test: Grid columns apply based on props
  - Test: Max-width constraint works
  - Test: Gap spacing applies
  - Test: Mobile responsive (1 col at max-width: 768px)
  - Test: Snapshots (desktop & mobile)

#### 2.4 AmbientOrbs Component
**File**: `src/components/ui/AmbientOrbs.tsx`

- **Props**:
  - `orbs?: OrbSpec[]` (array of {size, color, position, blur, animationDelay})
  - `ariaHidden?: boolean` (default: true — decorative)

- **Behavior**:
  - Renders fixed positioned orbs (background effect)
  - Float animation with custom delays
  - Non-interactive (`aria-hidden`)

- **OrbSpec interface**:
  ```typescript
  interface OrbSpec {
    id: string;
    size: number; // width/height in px
    color: 'primary-orange' | 'accent-purple' | 'custom'; // token reference
    position: { top?: string; left?: string; bottom?: string; right?: string };
    blur?: number; // filter: blur(Xpx)
    animationDelay?: string; // CSS animation-delay
    opacity?: number;
  }
  ```

- **Tests** (`src/components/ui/__tests__/AmbientOrbs.test.tsx`):
  - Test: Renders correct number of orbs
  - Test: Orbs have correct sizes & positions
  - Test: aria-hidden applied
  - Test: Animation classes applied
  - Test: Colors apply from token
  - Test: Snapshots

#### 2.5 Ripple Utility Component
**File**: `src/components/ui/Ripple.tsx` (or hook `useRipple.ts`)

- **Purpose**: Isolated ripple effect logic (can be attached to any button)
- **Approach**: React hook + ref-based (avoid direct DOM manipulation)
  ```typescript
  const useRipple = (ref: RefObject<HTMLElement>) => {
    const createRipple = (event: React.MouseEvent) => { ... }
    return { createRipple }
  }
  ```

- **Tests** (`src/components/ui/__tests__/Ripple.test.tsx`):
  - Test: Hook initializes without errors
  - Test: Ripple creates span element at correct position
  - Test: Ripple animation completes & element removes
  - Test: Multiple ripples queue correctly

#### 2.6 TiltWrapper HOC (Optional)
**File**: `src/components/ui/TiltWrapper.tsx`

- **Purpose**: Wrap components to add 3D tilt on mousemove
- **Props**:
  - `children: ReactNode`
  - `enableTilt?: boolean`
  - `intensity?: number` (1-10, default: 5)
  - `disableOnMobile?: boolean` (default: true)

- **Tests** (`src/components/ui/__tests__/TiltWrapper.test.tsx`):
  - Test: Tilt transforms apply on mousemove
  - Test: Tilt resets on mouseleave
  - Test: Disabled on mobile (matchMedia)
  - Test: No performance issues (requestAnimationFrame used)

#### 2.7 Icon Wrapper (Optional)
**File**: `src/components/ui/Icon.tsx` or enhance existing icon usage

- **Purpose**: Standardized icon rendering with size/color props
- **Props**:
  - `name: string` (Phosphor icon name, e.g., "cow", "pencilSimpleLine")
  - `size?: number` (default: 24)
  - `weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'` (default: "duotone")
  - `color?: string` (CSS color, default: current text color)

- **Tests**: Render with various props, verify icon renders correctly

### Component Integration Tests
- [ ] Create `src/components/ui/__tests__/integration.test.tsx`:
  - Test: Header + CardGrid + DashboardCard work together
  - Test: All components render without console errors
  - Test: No accessibility violations (axe-core)

### Success Criteria ✅
- [ ] All 7 components implemented in `src/components/ui/`
- [ ] Each component has TypeScript interfaces documented
- [ ] Unit tests written BEFORE implementation (TDD) and all pass
- [ ] Integration tests pass (components work together)
- [ ] Storybook stories created for visual review (optional but recommended)
- [ ] No console errors or warnings
- [ ] Accessibility audit passes (a11y)
- [ ] Build succeeds: `npm run build` ✅
- [ ] Tests pass: `npm test` ✅
- [ ] Types pass: `npx tsc --noEmit` ✅

---

## 🔍 Phase 3: Analyze & Compare Current Dashboard vs New Template

### Objective
Understand current dashboard structure and identify differences with the new template for proper refactoring strategy.

### Tasks

#### 3.1 Document current dashboard structure
- [ ] Review `src/pages/dashboard/index..tsx` (note: confirm filename)
- [ ] Document:
  - Current layout structure (header, main, grid, cards)
  - Current styling (DaisyUI classes, inline styles, responsive)
  - Current navigation/routing (how cards link to sub-pages)
  - Current state management (Context, tRPC, hooks)
  - Current accessibility features
  - Mobile responsive behavior

#### 3.2 Document new template structure
- [ ] Parse `docs/dashboard-template.html`:
  - Layout structure (header, main, grid, cards)
  - Styling approach (glassmorphism, animations, tokens)
  - Interaction model (ripple, tilt, hover effects)
  - Responsive breakpoints & behavior
  - Accessibility model

#### 3.3 Create comparison matrix
- [ ] Build `docs/CURRENT_vs_NEW_COMPARISON.md`:
  - Layout: similarities & differences
  - Styling: how to achieve new style within Tailwind + DaisyUI
  - Interactions: which are essential (ripple, tilt, glow) vs. optional
  - Navigation: how new design affects routing
  - Accessibility: what's missing in template, how to add
  - Performance: any concerns with new effects?

#### 3.4 Identify potential conflicts
- [ ] Check: Does new glassmorphism conflict with DaisyUI `halloween` theme?
- [ ] Check: Are icon libraries compatible? (Phosphor vs. react-icons)
- [ ] Check: Font loading (Kanit vs. existing fonts)
- [ ] Check: Color palette: primary-orange vs. DaisyUI primary colors

### Success Criteria ✅
- [ ] `docs/CURRENT_vs_NEW_COMPARISON.md` created with detailed matrix
- [ ] Conflicts identified and mitigation strategies documented
- [ ] Decision on DaisyUI integration (extend, override, or replace in dashboard-only)
- [ ] Navigation/routing strategy clear (cards → pages mapping)

---

## 🚀 Phase 4: Dashboard Refactoring with Design Tokens & Components (TDD Integration)

### Objective
Replace current dashboard with new design using all tokens and components, ensuring visual parity and functionality.

### Tasks

#### 4.1 Create integration tests (RED phase)
- [ ] Test file: `src/pages/dashboard/__tests__/index.test.tsx`
  - Test: Dashboard page renders with Header, AmbientOrbs, CardGrid, DashboardCard components
  - Test: All 7 menu cards render with correct titles & icons
  - Test: Card colors match variants (orange/purple)
  - Test: Logout button works
  - Test: Cards are clickable and navigate correctly
  - Test: Mobile responsive layout matches design
  - Test: All animations/transitions apply correctly
  - Test: Accessibility: keyboard navigation works, ARIA labels present
  - Test: Token values applied (colors, spacing, shadows)

#### 4.2 Migrate dashboard page (GREEN phase)
- [ ] Update `src/pages/dashboard/index..tsx` (confirm filename):
  - Remove old styling/components
  - Import & use: Header, AmbientOrbs, CardGrid, DashboardCard
  - Pass correct props to each component:
    ```tsx
    <Header title="Dashboard" onLogout={logout} />
    <AmbientOrbs orbs={defaultOrbs} />
    <CardGrid cols={2} maxWidth="800px" gap={20}>
      <DashboardCard title="เพิ่มข้อมูลควาย" icon={...} variant="orange" onClick={...} />
      {/* ... other cards ... */}
    </CardGrid>
    ```
  - Wire up navigation (Router.push or Link)

#### 4.3 Update styling (Tailwind + DaisyUI)
- [ ] Ensure dashboard uses Tailwind classes + token CSS variables
- [ ] Apply glassmorphism utilities
- [ ] Verify DaisyUI theme doesn't conflict (test buttons, inputs if present)
- [ ] Mobile responsive: test breakpoints match design

#### 4.4 Visual regression testing (REFACTOR phase)
- [ ] Compare visuals:
  - Screenshot current → Screenshot new (desktop 1440px, tablet 768px, mobile 375px)
  - Check: header position, card layout, colors, shadows, glow effects
  - Check: hover states, transitions, animations
  - Check: icon rendering & sizing
- [ ] Performance audit:
  - Measure: Largest Contentful Paint (LCP), First Input Delay (FID), Cumulative Layout Shift (CLS)
  - Ensure new animations don't degrade performance

#### 4.5 Accessibility & QA
- [ ] Run axe-core audit: 0 violations
- [ ] Keyboard navigation: Tab through all interactive elements
- [ ] Screen reader test: All content readable
- [ ] Focus ring: visible on all buttons
- [ ] Mobile testing: pinch-zoom, touch interactions
- [ ] Localization: Thai text renders correctly, no encoding issues

#### 4.6 Verify all dashboard sub-pages still work
- [ ] Test routing from cards to:
  - `/dashboard/new-buffalo-info`
  - `/dashboard/update-buffalo-info`
  - `/dashboard/update-buffalo-dna`
  - `/dashboard/new-reward`
  - `/dashboard/certificate-approvment`
  - `/dashboard/event-export`
  - `/dashboard/update-wallet`
- [ ] Ensure BaseLayout still works with new Header component (or integrate)

### Success Criteria ✅
- [ ] Dashboard page fully refactored with new components
- [ ] Visual parity with `docs/dashboard-template.html` (design matches)
- [ ] All interactions work: click, keyboard, ripple, tilt, glow
- [ ] Mobile responsive: 2 cols → 1 col at 768px breakpoint
- [ ] All tests pass: unit + integration
- [ ] Accessibility audit: 0 violations (axe-core)
- [ ] Build succeeds: `npm run build` ✅
- [ ] Lint passes: `npm run lint` ✅
- [ ] Types pass: `npx tsc --noEmit` ✅
- [ ] All tests pass: `npm test` ✅
- [ ] No console errors or warnings
- [ ] Performance: LCP ≤ 2.5s, CLS < 0.1, FID ≤ 100ms
- [ ] Routing: all cards navigate correctly
- [ ] Sub-pages: no regressions (still functional)

---

## 🧪 Testing Strategy (TDD Throughout)

### Test Pyramid
```
  🔺 E2E (Playwright) — full dashboard user flow
  🔶 Integration (Jest + RTL) — components working together
  🔹 Unit (Jest + RTL) — individual components & hooks
```

### Test Coverage
- Components: ≥ 80% coverage
- Utilities: 100% coverage
- Pages: ≥ 70% coverage (critical paths)

### Test Approach by Phase
1. **Phase 1 (Tokens)**: Unit tests for CSS validation, snapshot tests for utility classes
2. **Phase 2 (Components)**: Unit tests first, then integration tests
3. **Phase 3 (Analysis)**: No tests (documentation phase)
4. **Phase 4 (Refactoring)**: Integration + E2E tests for full dashboard flow

### CI/CD Checks
Before PR merge to `staging`:
- [ ] `npm run build` — no errors
- [ ] `npm run lint` — no warnings
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npm test` — all tests pass, coverage ≥ thresholds
- [ ] Accessibility audit: axe-core, 0 violations
- [ ] Visual regression: manual screenshot comparison

---

## 📅 Timeline Estimate

| Phase | Duration | Subtasks |
|-------|----------|----------|
| 1 (Tokens) | 2-3 days | Extract, document, implement, test |
| 2 (Components) | 4-5 days | Build 7 components, unit tests, integration |
| 3 (Analysis) | 1-2 days | Compare, document conflicts, plan strategy |
| 4 (Refactor) | 3-4 days | Migrate, test, QA, visual regression |
| **Total** | **10-14 days** | Full implementation + reviews |

---

## 🔄 Workflow (Git & PR)

1. Create branch: `git checkout staging && git pull && git checkout -b feature/ui-theme`
2. Phase 1: Commit `tokens: add design tokens to tailwind & globals`
3. Phase 2: Commit `components: add UI primitives (header, card, grid, orbs)`
4. Phase 3: Commit `docs: add design analysis & comparison`
5. Phase 4: Commit `refactor: migrate dashboard with new tokens & components`
6. Open PR to `staging` with full checklist
7. Post-merge: create follow-up PR for remaining pages (new-buffalo-info, etc.)

---

## ✅ PR Checklist

- [ ] All phases complete
- [ ] Tests pass: `npm test` (coverage ≥ 80%)
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] Types pass: `npx tsc --noEmit`
- [ ] Accessibility: axe-core audit, 0 violations
- [ ] Visual regression: screenshots compared (desktop, tablet, mobile)
- [ ] Performance: LCP ≤ 2.5s, CLS < 0.1
- [ ] Documentation: DESIGN_TOKENS.md, CURRENT_vs_NEW_COMPARISON.md
- [ ] No hardcoded values in components (all use tokens)
- [ ] Keyboard navigation: all interactive elements accessible
- [ ] Mobile responsive: layout adapts correctly
- [ ] Routing: all cards navigate correctly
- [ ] Sub-pages: no regressions

---

## 📚 Deliverables

- `docs/DESIGN_TOKENS.md` — token inventory
- `docs/CURRENT_vs_NEW_COMPARISON.md` — analysis & comparison
- `src/components/ui/` — 7 reusable components + tests
- `src/styles/globals.css` — CSS variables + utility classes
- `tailwind.config.ts` — extended tokens
- Updated `src/pages/dashboard/index..tsx` — new dashboard
- Test files: `src/components/ui/__tests__/`, `src/pages/dashboard/__tests__/`
- PR to `staging` with full checklist

---

## 🚀 Next Steps
1. Approve plan
2. Create feature branch: `feature/ui-theme`
3. Begin Phase 1: Design tokens setup
4. Execute phases in order with TDD approach
5. Update progress in issue #44

