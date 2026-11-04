---
name: Executive Dark Minimal
colors:
  surface: '#13131b'
  surface-dim: '#13131b'
  surface-bright: '#393842'
  surface-container-lowest: '#0d0d16'
  surface-container-low: '#1b1b24'
  surface-container: '#1f1f28'
  surface-container-high: '#292932'
  surface-container-highest: '#34343e'
  on-surface: '#e4e1ee'
  on-surface-variant: '#ccc3d8'
  inverse-surface: '#e4e1ee'
  inverse-on-surface: '#302f39'
  outline: '#958da1'
  outline-variant: '#4a4455'
  surface-tint: '#d2bbff'
  primary: '#d2bbff'
  on-primary: '#3f008e'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#732ee4'
  secondary: '#cebdff'
  on-secondary: '#381385'
  secondary-container: '#4f319c'
  on-secondary-container: '#bea8ff'
  tertiary: '#ddb8ff'
  on-tertiary: '#490081'
  tertiary-container: '#844abe'
  on-tertiary-container: '#f2e0ff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#e8ddff'
  secondary-fixed-dim: '#cebdff'
  on-secondary-fixed: '#21005e'
  on-secondary-fixed-variant: '#4f319c'
  tertiary-fixed: '#f0dbff'
  tertiary-fixed-dim: '#ddb8ff'
  on-tertiary-fixed: '#2c0051'
  on-tertiary-fixed-variant: '#62259b'
  background: '#13131b'
  on-background: '#e4e1ee'
  surface-variant: '#34343e'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '500'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

This design system establishes an ultra-refined, intelligence-first interface designed for C-suite operators, VP-level orchestrators, and high-velocity engineering leaders. The aesthetic merges the disciplined spatial density and precision typography of Linear and Notion with the ambient polish, subtle luminescent accents, and dimensional micro-surfaces characteristic of contemporary executive dashboards.

The emotional goal is quiet authority and effortless clarity. Interactions should feel instantaneous, non-distracting, and decisively calibrated. Rather than relying on heavy skeuomorphic textures or loud decorative elements, visual distinction is achieved through razor-thin borders, layered neutral-opacity surfaces, controlled ultraviolet glows, and razor-sharp typographic pacing.

## Colors

The palette is engineered specifically for deep-dark enterprise software contexts:

- **Canvas & Structural Surfaces:**
  - Base canvas: `#07070f`
  - Subsurface / Sidebar: `#0b0c16`
  - Card & Container backgrounds: `rgba(255, 255, 255, 0.03)`
  - Elevated Popovers & Dropdowns: `#121324` with `rgba(255, 255, 255, 0.06)` fill
  - Structural strokes & hairline borders: `rgba(255, 255, 255, 0.08)` resting, upgrading to `rgba(255, 255, 255, 0.16)` on hover

- **Brand & Interaction Violet:**
  - Accent Primary: `#7c3aed` (Core interactive triggers, key milestones, active toggles)
  - Accent Secondary: `#a78bfa` (Accent labels, focused states, interactive hovers)
  - Accent Tertiary: `#c084fc` (Glows, telemetry gradients, AI synthesis highlights)

- **Semantic Status Architecture:**
  - Completed / On-Track: `#22c55e` (Emerald) with background `rgba(34, 197, 94, 0.12)` and border `rgba(34, 197, 94, 0.24)`
  - Pending / In-Progress: `#fbbf24` (Amber) with background `rgba(251, 191, 36, 0.12)` and border `rgba(251, 191, 36, 0.24)`
  - Critical / Overdue: `#ef4444` (Coral Red) with background `rgba(239, 68, 68, 0.12)` and border `rgba(239, 68, 68, 0.24)`
  - Escalated: `#fb923c` (Orange) with background `rgba(251, 146, 60, 0.12)` and border `rgba(251, 146, 60, 0.24)`
  - Personnel / Attendees: `#60a5fa` (Cobalt/Blue) with background `rgba(96, 165, 250, 0.12)` and border `rgba(96, 165, 250, 0.24)`

- **Typography & Monochrome Scales:**
  - Primary text: `rgba(255, 255, 255, 0.95)`
  - Secondary text: `rgba(255, 255, 255, 0.65)`
  - Muted / Placeholder text: `rgba(255, 255, 255, 0.40)`

## Typography

Typography prioritizes rapid scanning, numerical readability, and structural hierarchy across dense enterprise data views. 

- Use negative tracking (`letterSpacing: -0.01em` to `-0.025em`) across all display and headline sizes to give titles a cohesive, editorial punch.
- Apply tabular figures (`font-variant-numeric: tabular-nums`) globally for time stamps, analytics metrics, action item tallies, and executive summaries.
- Reserve uppercase formatting strictly for micro labels (`label-sm`), system metadata tags, and enterprise pipeline flags, accompanied by expanded tracking (`0.04em`).

## Layout & Spacing

The layout is built upon an adaptive 12-column nested fluid system optimized for desktop-first enterprise usage with seamless responsiveness down to tablet and mobile viewports.

- **Desktop (1280px+):** Fixed collateral navigation (collapsible 64px to 240px sidebar), sticky glassmorphic executive command bar (56px height), and a multi-column card layout utilizing `1.5rem` gutters and `2rem` outer margins. Content panels default to split views (e.g., 8-column transcript/meeting intelligence panel flanked by a 4-column real-time tasks & executive brief panel).
- **Tablet (768px - 1279px):** Sidebar collapses to an icon rail (64px), grid converts to an 8-column layout with `1rem` gutters and `1.5rem` margins. Complex analytical tables switch to horizonal smooth-scroll zones with sticky primary columns.
- **Mobile (<768px):** Single-column stack with `1rem` margins and `0.75rem` vertical spacing gaps. Complex cards unbundle into swipeable tabbed drawers and bottom sheets.

## Elevation & Depth

Visual hierarchy does not use murky drop shadows. Instead, it relies on layered luminance, precise glassmorphism, and low-contrast luminous outlines:

- **Level 0 (Base Floor):** Raw canvas `#07070f`. Used for main viewports and full-bleed stage backgrounds.
- **Level 1 (Cards & Modules):** `rgba(255, 255, 255, 0.03)` with a structural 1px border of `rgba(255, 255, 255, 0.08)`. No drop shadow.
- **Level 2 (Hovered & Active Containers):** `rgba(255, 255, 255, 0.05)` fill, `rgba(255, 255, 255, 0.16)` border, accompanied by a soft, diffused brand backlight: `0 8px 24px -4px rgba(124, 58, 237, 0.08)`.
- **Level 3 (Sticky Headers & Navigation):** Glassmorphic treatment with `background: rgba(7, 7, 15, 0.75)`, `backdrop-filter: blur(12px)`, and bottom border `1px solid rgba(255, 255, 255, 0.08)`.
- **Level 4 (Floating Modals, Command Menus & Context Menus):** `background: #0f101f`, `border: 1px solid rgba(255, 255, 255, 0.14)`, shadow: `0 20px 40px -8px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)`.

## Shapes

The shape hierarchy combines high-density enterprise precision with modern softness:

- **Cards & Primary Dashboard Modules:** Set to `rounded-lg` (16px / `1rem`), providing a refined framing that separates content without visual harshness.
- **Input Fields, Toolbars, & Secondary Panes:** Set to default `rounded` (8px / `0.5rem`).
- **Interactive Buttons & Badges:** `rounded` (6px to 8px) for executive density; pill shapes are reserved solely for live recording indicators and active participant badges.
- **Nested Elements Rule:** Inner elements must maintain a proportional inner radius (Card radius 16px - Card padding 12px = 4px to 6px inner target radius).

## Components

### Buttons
- **Primary:** Gradient fill `linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)`, color `#ffffff`, 1px border `rgba(255, 255, 255, 0.2)` inset, subtle hover glow `0 0 16px rgba(124, 58, 237, 0.4)`. Height: 36px (compact executive default) or 40px.
- **Secondary:** Surface `rgba(255, 255, 255, 0.05)`, border `1px solid rgba(255, 255, 255, 0.1)`, text `rgba(255, 255, 255, 0.9)`. On hover: `rgba(255, 255, 255, 0.09)`.
- **Ghost:** Background transparent, text `rgba(255, 255, 255, 0.7)`, hover background `rgba(255, 255, 255, 0.04)`, hover text `#ffffff`.

### Status Badges & Chips
- Compact dimensions: Height 22px, padding `0 8px`, border-radius 6px.
- Text: `label-sm` (uppercase, tracking 0.04em, semibold).
- Structure: Includes a 6px solid circular indicator dot followed by status text.
  - *Completed:* Green tint surface, emerald text `#22c55e`.
  - *In-Progress:* Amber tint surface, amber text `#fbbf24`.
  - *Overdue / Critical:* Coral tint surface, red text `#ef4444`.
  - *Escalated:* Orange tint surface, orange text `#fb923c`.
  - *Internal Attendee:* Blue tint surface, blue text `#60a5fa`.

### Cards & Analytical Panels
- Background: `rgba(255, 255, 255, 0.03)`.
- Border: `1px solid rgba(255, 255, 255, 0.08)`.
- Radius: `16px`.
- Padding: 20px (standard) or 16px (high-density tables).
- Section Dividers within cards: `1px solid rgba(255, 255, 255, 0.05)`.

### Input Fields & Search Bars
- Background: `rgba(255, 255, 255, 0.02)`.
- Border: `1px solid rgba(255, 255, 255, 0.08)`.
- Height: 36px.
- Typography: `body-md`.
- Focus State: Border color `#a78bfa`, box-shadow `0 0 0 1px #a78bfa, 0 0 12px rgba(167, 139, 250, 0.2)`.

### Checkboxes & Action Radios
- Size: 16px × 16px square with 4px border radius.
- Inactive: Background `rgba(255, 255, 255, 0.04)`, border `1px solid rgba(255, 255, 255, 0.2)`.
- Active: Background `#7c3aed`, border `1px solid #c084fc`, icon white checkmark (stroke-width 2px).

### Intelligence & Synthesis Indicators
- AI Summary Banners: Subtle left border accent (2px solid `#a78bfa`), background `linear-gradient(90deg, rgba(124, 58, 237, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)`.
- Live Pulse Pill: Height 20px, `background: rgba(239, 68, 68, 0.15)`, text `#ef4444`, with a flashing keyframe ping on the recording dot.