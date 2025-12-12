# 🎨 Design Tokens Documentation

## Overview

เอกสารนี้รวบรวม design tokens ทั้งหมดที่ใช้ใน Jaothui Dashboard UI Theme โดยสกัดจาก `docs/dashboard-template.html` เพื่อใช้เป็น single source of truth สำหรับการออกแบบ UI

---

## 🎨 Color Tokens

### Primary Colors
```css
--primary-orange: #FF8C00;        /* สีส้มหลัก สำหรับ buttons, accents */
--primary-orange-glow: #FFA500;   /* สีส้มเรืองแสง สำหรับ glow effects */
```

**Usage in Tailwind:**
- `bg-primary-orange`
- `text-primary-orange`
- `border-primary-orange`
- `shadow-primary-orange-glow`

---

### Accent Colors
```css
--accent-purple: #9D00FF;         /* สีม่วงเน้น สำหรับ secondary actions */
--accent-purple-glow: #B847FF;    /* สีม่วงเรืองแสง สำหรับ glow effects */
```

**Usage in Tailwind:**
- `bg-accent-purple`
- `text-accent-purple`
- `border-accent-purple`
- `shadow-accent-purple-glow`

---

### Background Colors
```css
--bg-dark: #0f0f11;               /* สีพื้นหลังหลัก (เกือบดำ) */
```

**Usage in Tailwind:**
- `bg-dark`

---

### Glass/Transparency Colors
```css
--glass-bg: rgba(255, 255, 255, 0.03);       /* พื้นหลัง glass เบาบาง */
--glass-border: rgba(255, 255, 255, 0.1);    /* ขอบ glass */
--glass-highlight: rgba(255, 255, 255, 0.15); /* highlight เมื่อ hover */
```

**Usage in Tailwind:**
- `bg-glass`
- `border-glass`
- `hover:bg-glass-highlight`

---

### Text Colors
```css
--text-main: #ffffff;                    /* ข้อความหลัก (ขาว) */
--text-muted: rgba(255, 255, 255, 0.6);  /* ข้อความรอง (ขาวโปร่งแสง) */
```

**Usage in Tailwind:**
- `text-main`
- `text-muted`

---

## 📏 Spacing Tokens

### Border Radius
```css
border-radius: 24px;   /* Card, Header ทั่วไป */
border-radius: 100px;  /* Pill-shaped buttons (logout-btn) */
border-radius: 50%;    /* Circular elements (ambient orbs, ripple) */
```

**Usage in Tailwind:**
- `rounded-3xl` (24px)
- `rounded-full` (100px / 50%)

---

### Padding
```css
padding: 1.2rem 2rem;       /* Header */
padding: 10px 24px;         /* Button (logout-btn) */
padding: 40px 20px;         /* Main content */
padding-left: 30px;         /* Card (mobile) */
```

**Usage in Tailwind:**
- `px-8 py-5` (Header: 2rem horizontal, 1.2rem vertical)
- `px-6 py-2.5` (Button)
- `px-5 py-10` (Main)

---

### Gap
```css
gap: 20px;   /* Grid container */
gap: 10px;   /* Brand (header icon + text) */
gap: 8px;    /* Logout button (icon + text) */
```

**Usage in Tailwind:**
- `gap-5` (20px)
- `gap-2.5` (10px)
- `gap-2` (8px)

---

## 🌟 Shadow Tokens

### Glassmorphism Shadows
```css
/* Header Shadow */
box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);

/* Card Shadow (default) */
box-shadow: 0 4px 6px rgba(0,0,0,0.1);

/* Card Shadow (hover) */
box-shadow: 0 20px 40px rgba(0,0,0,0.4);

/* Orange Card Glow (hover) */
box-shadow: 0 20px 40px rgba(255, 140, 0, 0.15), inset 0 0 20px rgba(255, 140, 0, 0.1);

/* Purple Card Glow (hover) */
box-shadow: 0 20px 40px rgba(157, 0, 255, 0.15), inset 0 0 20px rgba(157, 0, 255, 0.1);

/* Inset Glow (Orange) */
box-shadow: inset 0 0 0 1px rgba(255, 140, 0, 0.1);

/* Inset Glow (Purple) */
box-shadow: inset 0 0 0 1px rgba(157, 0, 255, 0.1);
```

**Usage in Tailwind:**
- `shadow-glass-header`
- `shadow-glass-card`
- `shadow-glass-card-hover`
- `shadow-orange-glow`
- `shadow-purple-glow`

---

## 🎬 Animation Tokens

### Keyframes

#### 1. Float Animation (Ambient Orbs)
```css
@keyframes float {
    0% { transform: translate(0, 0); }
    100% { transform: translate(30px, 50px); }
}

/* Usage */
animation: float 10s ease-in-out infinite alternate;
animation-delay: -5s; /* For orb-2 */
```

**Tailwind Class:**
- `animate-float`
- `animate-float-delayed` (with animation-delay)

---

#### 2. Ripple Effect
```css
@keyframes ripple {
    to {
        transform: scale(4);
        opacity: 0;
    }
}

/* Usage */
animation: ripple 0.6s linear;
```

**Tailwind Class:**
- `animate-ripple`

---

### Transitions
```css
/* Card hover */
transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);

/* Icon scale on hover */
transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

/* Button hover */
transition: all 0.3s ease;

/* Card glow */
transition: opacity 0.4s ease, transform 0.4s ease;
```

**Tailwind Extension:**
- `transition-card` (all 0.4s cubic-bezier)
- `transition-icon` (transform 0.3s cubic-bezier bounce)
- `transition-button` (all 0.3s ease)

---

## 🖋️ Typography Tokens

### Font Family
```css
font-family: 'Kanit', 'Inter', sans-serif;
```

**Import:**
```html
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
```

**Tailwind Config:**
```ts
fontFamily: {
  sans: ['Kanit', 'Inter', 'sans-serif'],
  kanit: ['Kanit', 'sans-serif'],
  inter: ['Inter', 'sans-serif'],
}
```

---

### Font Sizes
```css
/* Brand (Header) */
font-size: 1.5rem;    /* 24px */

/* Card Title */
font-size: 1.2rem;    /* 19.2px */

/* Card Icon */
font-size: 2.5rem;    /* 40px desktop */
font-size: 2rem;      /* 32px mobile */

/* Button */
font-size: 0.9rem;    /* 14.4px */
```

**Tailwind Classes:**
- `text-2xl` (1.5rem - Brand)
- `text-xl` (1.25rem - Card Title)
- `text-4xl` (2.5rem - Card Icon desktop)
- `text-3xl` (2rem - Card Icon mobile)
- `text-sm` (0.875rem - Button, close to 0.9rem)

---

### Font Weights
```css
font-weight: 300;   /* Light (Kanit) */
font-weight: 400;   /* Normal (Kanit, Inter) */
font-weight: 500;   /* Medium (Kanit, Card Title, Button) */
font-weight: 600;   /* SemiBold (Kanit, Inter, Brand) */
```

**Tailwind Classes:**
- `font-light` (300)
- `font-normal` (400)
- `font-medium` (500)
- `font-semibold` (600)

---

### Letter Spacing
```css
letter-spacing: 0.5px;  /* Brand, Card Title */
```

**Tailwind Extension:**
- `tracking-wide` (0.025em ≈ 0.5px at 20px font size)
- Custom: `tracking-tight-05` (0.5px exact)

---

## 🌫️ Backdrop Filter Tokens

### Glassmorphism Blur
```css
backdrop-filter: blur(20px);           /* Header */
-webkit-backdrop-filter: blur(20px);

backdrop-filter: blur(10px);           /* Card */
-webkit-backdrop-filter: blur(10px);

filter: blur(100px);                   /* Ambient orbs */
```

**Tailwind Classes:**
- `backdrop-blur-2xl` (20px - Header)
- `backdrop-blur-lg` (10px - Card)
- `blur-3xl` (100px - Orbs) - ต้อง extend ใน config

---

## 🎭 Special Effects

### 3D Tilt Effect (Mousemove)
```css
/* Applied via JavaScript */
transform: perspective(1000px) rotateX(${xTilt}deg) rotateY(${yTilt}deg) scale(1.02);

/* Default state */
transform: perspective(1000px) rotateX(0) rotateY(0) scale(1);
```

**Implementation:**
- React hook: `useTilt()` ใน `src/hooks/useTilt.ts`
- Component: `<TiltWrapper>` ใน `src/components/ui/TiltWrapper.tsx`

---

### Ripple Effect (Click)
```css
/* Span element */
position: absolute;
border-radius: 50%;
background: rgba(255, 255, 255, 0.3);
transform: scale(0);
animation: ripple 0.6s linear;
pointer-events: none;
```

**Implementation:**
- React hook: `useRipple()` ใน `src/hooks/useRipple.ts`
- Component: `<Ripple>` ใน `src/components/ui/Ripple.tsx`

---

## 🏗️ Layout Tokens

### Grid
```css
/* Desktop (2 columns) */
display: grid;
grid-template-columns: repeat(2, 1fr);
gap: 20px;
max-width: 800px;

/* Mobile (1 column) */
@media (max-width: 768px) {
    grid-template-columns: 1fr;
}
```

**Tailwind Classes:**
- `grid grid-cols-2 gap-5 max-w-3xl` (desktop)
- `md:grid-cols-1` (mobile)

---

### Card Sizes
```css
/* Desktop */
height: 140px;

/* Mobile */
height: 100px;
flex-direction: row;
justify-content: start;
padding-left: 30px;
gap: 20px;
```

**Tailwind Classes:**
- `h-[140px]` (desktop)
- `md:h-[100px] md:flex-row md:justify-start md:pl-7 md:gap-5` (mobile)

---

## 📱 Responsive Breakpoints

```css
@media (max-width: 768px) {
    /* Mobile styles */
}
```

**Tailwind Config:**
```ts
screens: {
  'sm': '640px',   // default
  'md': '768px',   // ใช้สำหรับ mobile breakpoint
  'lg': '1024px',  // default
  'xl': '1280px',  // default
}
```

---

## 🧰 Utility Classes to Create

### Glass Effects
```css
.glass-card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.glass-header {
    background: rgba(20, 20, 20, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--glass-border);
}
```

---

### Ambient Background
```css
.ambient-orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(100px);
    z-index: -1;
    opacity: 0.6;
    animation: float 10s ease-in-out infinite alternate;
}
```

---

## 🔍 Token Validation Checklist

### Colors
- [ ] All CSS variables defined in `:root`
- [ ] Tailwind config includes all custom colors
- [ ] No hardcoded hex values in components

### Spacing
- [ ] All spacing uses Tailwind scale (px-*, py-*, gap-*)
- [ ] No hardcoded pixel values in JSX

### Typography
- [ ] Font families loaded correctly
- [ ] All font weights available (300, 400, 500, 600)
- [ ] Thai characters render correctly

### Animations
- [ ] `@keyframes` defined in globals.css
- [ ] Tailwind animation classes work
- [ ] Performance acceptable (60fps)

### Glassmorphism
- [ ] Backdrop filters applied correctly
- [ ] Safari compatibility (`-webkit-backdrop-filter`)
- [ ] Fallback for browsers without support

---

## 📦 File Organization

```
src/
├── styles/
│   ├── globals.css              # :root variables, utility classes, animations
│   └── __tests__/
│       └── tokens.test.ts       # Token validation tests
├── components/
│   └── ui/                      # Reusable UI components
│       ├── AmbientOrbs.tsx
│       ├── Header.tsx
│       ├── DashboardCard.tsx
│       └── ...
├── hooks/
│   ├── useRipple.ts
│   └── useTilt.ts
└── pages/
    └── dev/
        └── tokens-showcase.tsx  # Visual token showcase
```

---

## 🎯 Usage Examples

### Using Tokens in Components

```tsx
// Color tokens
<div className="bg-primary-orange text-white">
  Orange Button
</div>

// Glass effect
<div className="glass-card p-6 rounded-3xl">
  Glass Card
</div>

// Shadow tokens
<div className="shadow-orange-glow hover:shadow-orange-glow-hover">
  Card with Glow
</div>

// Animation
<div className="animate-float opacity-60">
  Floating Orb
</div>
```

---

## 🚀 Next Steps

1. ✅ **Phase 1 (Current)**: Design tokens documented
2. ⏭️ **Phase 2**: Implement tokens in `tailwind.config.ts` and `globals.css`
3. ⏭️ **Phase 3**: Create unit tests for token validation
4. ⏭️ **Phase 4**: Build UI components using tokens
5. ⏭️ **Phase 5**: Refactor dashboard page

---

## 📚 References

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Glassmorphism CSS Generator](https://glassmorphism.com/)
- [Next.js Font Optimization](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts)
- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Phosphor Icons](https://phosphoricons.com/)

---

**Last Updated**: 2025-12-12
**Version**: 1.0.0
**Author**: Jaothui Dashboard Team
