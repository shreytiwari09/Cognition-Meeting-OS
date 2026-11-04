---
name: Warm Bento B2B
colors:
  surface: '#faf9f4'
  surface-dim: '#dbdad5'
  surface-bright: '#faf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f4ef'
  surface-container: '#efeee9'
  surface-container-high: '#e9e8e3'
  surface-container-highest: '#e3e3de'
  on-surface: '#1b1c19'
  on-surface-variant: '#5b4039'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f1ec'
  outline: '#907067'
  outline-variant: '#e4beb4'
  surface-tint: '#b02f00'
  primary: '#b02f00'
  on-primary: '#ffffff'
  primary-container: '#ff5722'
  on-primary-container: '#541200'
  inverse-primary: '#ffb5a0'
  secondary: '#006d30'
  on-secondary: '#ffffff'
  secondary-container: '#92f5a4'
  on-secondary-container: '#007233'
  tertiary: '#5f5e61'
  on-tertiary: '#ffffff'
  tertiary-container: '#929094'
  on-tertiary-container: '#2a292d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd1'
  primary-fixed-dim: '#ffb5a0'
  on-primary-fixed: '#3b0900'
  on-primary-fixed-variant: '#862200'
  secondary-fixed: '#95f8a7'
  secondary-fixed-dim: '#79db8d'
  on-secondary-fixed: '#00210a'
  on-secondary-fixed-variant: '#005323'
  tertiary-fixed: '#e4e1e6'
  tertiary-fixed-dim: '#c8c5ca'
  on-tertiary-fixed: '#1b1b1e'
  on-tertiary-fixed-variant: '#47464a'
  background: '#faf9f4'
  on-background: '#1b1c19'
  surface-variant: '#e3e3de'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 2.5rem
---

## Brand & Style

This design system targets modern B2B SaaS platforms—workforce management, executive dashboards, talent operations, and enterprise resource planning—that reject sterile, cold corporate blues in favor of human warmth, craftsmanship, and quiet confidence. 

The aesthetic is characterized as **Warm Bento Minimal with Tactile Neo-Modernism**:
- **Warmth over Sterility:** Grounded in rich ecru, sand, and cream canvas tones that dramatically reduce visual fatigue during 8-hour desktop workflows.
- **Architectural Bento Compartmentalization:** Functional modules live within standalone floating cards characterized by generous radii, crisp hairline separations, and generous inner breathing room.
- **Vibrant Focal Accents:** Electric coral-orange acts as an intentional visual catalyst for live action items, notifications, and key performance drivers, paired against deep forest emerald greens for health indicators and educational discovery modules.
- **Premium Tactility:** Soft, sculpted pill controls, subtle inner highlights, and ultra-smooth ambient blurs that feel like polished industrial hardware.

## Colors

The color palette establishes an approachable yet rigorous corporate hierarchy centered on warm mineral tones and decisive functional accents:

- **Canvas & Surface Palette:**
  - `canvas-default`: `#F4F3EE` (Warm sand foundation)
  - `surface-elevated`: `#FFFFFF` (Pure white primary card surfaces)
  - `surface-subtle`: `#EBE9E1` (Muted nested trays, slot tracks, and empty states)
  - `surface-inset`: `#DFDCD2` (Pressed states and calendar grid guides)
- **Text & Hierarchy:**
  - `text-primary`: `#18181B` (Zinc 900 for high-contrast legible headings and core stats)
  - `text-secondary`: `#52525B` (Zinc 600 for metadata, descriptions, and axis markers)
  - `text-muted`: `#A1A1AA` (Zinc 400 for structural labels and inactive toggles)
- **Accent Systems:**
  - `primary` (`#FF5722`): Vibrant coral-orange used for high-impact metric cards, active calendar appointments, primary CTAs, and active navigation indicators.
  - `secondary` (`#15803D`): Deep forest emerald utilized for positive growth vectors, learning cards, and verified statuses.
  - `dark-panel` (`#121316` / `#18181B`): Reserved for specialized high-density lateral bars or focused modal views.

## Typography

The type system relies completely on **Plus Jakarta Sans**, harnessing its rounded geometry, large x-height, and open counters to project an executive yet friendly personality. 

- **Display Metrics & Numerics:** Statistical readouts use `headline-xl` with `-0.03em` tracking and `700` weight, ensuring massive values like percentages and employee counts register instantly without clutter.
- **Hierarchy of Context:** Section titles use `headline-md` paired with `label-sm` or `label-md` for categorical pill markers and secondary timeframe labels (e.g., "April, 2025" or "Turnover Rate").
- **Tabular Alignment:** When showing tabular numbers or percentages within schedules and graphs, activate font feature settings `"tnum"` (tabular numbers) to keep column data perfectly stabilized.

## Layout & Spacing

Layouts follow a structured **Bento-box modular grid** that balances information density with generous whitespace:

- **Grid Architecture:** Desktop displays utilize a 12-column dynamic fluid layout with `1.25rem` (20px) gutters and a `2rem` (32px) outer canvas margin.
- **Bento Hierarchy:** Modules combine into multi-column spans (e.g., 8-column primary scheduling board paired with a 4-column analytics stack).
- **Internal Card Padding:** All top-level cards maintain an internal padding of `1.5rem` (`space-lg`) to `2rem` (`space-xl`), ensuring content remains isolated and legible against the outer sand canvas.
- **Responsive Fluidity:** 
  - **Desktop (≥1200px):** Multi-pane bento layout with fixed or floating side navigation and multi-column widgets.
  - **Tablet (768px - 1199px):** Collapse into a 6-column grid with 2-up module grouping.
  - **Mobile (<768px):** Linear 1-column stack, outer margin reduces to `1rem`, card corners adjust to `1.25rem`, and horizontal swiping is enabled for calendar columns.

## Elevation & Depth

This system avoids harsh, dark drop shadows, creating visual separation through **tonal canvas contrast and ultra-diffused ambient light**:

- **Tier 0 (Canvas):** Flat base layer in `#F4F3EE`. No elevation.
- **Tier 1 (Bento Floating Cards):** Pure white `#FFFFFF` cards resting on the canvas. They use an ultra-diffused, warm ambient shadow:
  - `box-shadow: 0 8px 30px -4px rgba(24, 24, 27, 0.03), 0 2px 8px -2px rgba(24, 24, 27, 0.02);`
  - Paired with an optional whisper-light border: `1px solid rgba(0, 0, 0, 0.04)`.
- **Tier 2 (Interactive Floating Items & Badges):** Active agenda blocks, popovers, and interactive tooltips:
  - `box-shadow: 0 12px 24px -6px rgba(255, 87, 34, 0.22);` (when saturated in primary coral)
  - `box-shadow: 0 8px 16px -4px rgba(24, 24, 27, 0.08);` (for neutral floating elements).
- **Tier 3 (Inset Surfaces):** Calendar background tracks, segmented controls, and progress rails leverage subtle sunken properties:
  - Background: `#EBE9E1` with zero shadow.

## Shapes

The design language uses oversized, organic curvatures to communicate modern approachability:

- **Bento Modules:** Primary structural cards use large continuous corner smoothing of `24px` to `32px` (`rounded-xl` or `2rem`).
- **Internal Sub-cards & Schedule Blocks:** Calendar items, sub-groupings, and chart bars apply `16px` to `20px` border radius (`rounded-lg`).
- **Pill System:** Interactive buttons, segmented filters (e.g., "Weekdays", "Week", "Month"), tags, and status chips use full pill rounding (`9999px`).
- **Avatar Stacks:** Perfectly circular (`border-radius: 50%`) with `2px` surface-colored separators.

## Components

### Buttons & Interactive Controls
- **Primary Buttons:** Full pill shape, filled with `#FF5722`, text in white `label-lg`, with smooth hover state lifting `transform: translateY(-1px)` and subtle color enrichment (`#F4511E`).
- **Secondary / Ghost Buttons:** Pure white pill on `#EBE9E1` backgrounds, or bordered in `1px solid #DFDCD2` with zinc text (`#18181B`).
- **Pill Segmented Controls:** Encased in a soft sand capsule (`#EBE9E1`). Active segment switches to pure white `#FFFFFF` with a compact `0 2px 6px rgba(0,0,0,0.06)` shadow; inactive segments remain transparent with zinc muted text.

### Bento Cards & Metric Displays
- **Standard White Card:** White surface, `28px` rounded corners, `space-lg` padding. Houses clear headers with right-aligned contextual dropdowns (e.g., "Programming team ▾").
- **Hero Accent Card (Coral):** Solid `#FF5722` background with crisp white typography. Reserved for key outlier metrics (e.g., "Turnover Rate 12%").
- **Dark Editorial Module (Optional Forest/Charcoal):** Deep forest green `#15803D` or Zinc `#18181B` card with white text and translucent overlay buttons (`rgba(255, 255, 255, 0.15)`), used for knowledge hubs or video learning prompts.

### Scheduling & Agenda Blocks
- **Slots:** Grid columns set on `#F4F3EE` / `#FFFFFF` alternating vertical rails.
- **Slot Items:** Pill-like rounded rectangles (`16px` radius). Light neutral default (`#F4F3EE`) with micro-avatars and team tags. Active or critical meeting blocks pop in solid `#FF5722` with white text and contrasting avatar badges.

### Lists & Candidates Review
- Row items spaced with `space-sm` gaps, incorporating:
  - User avatar (`36px` round).
  - Bold name (`label-lg`) with secondary role subtitle.
  - Seniority tags (e.g., "Junior", "Middle") in dark zinc pill badges.
  - Performance delta markers (`+15%` with micro up-chevrons).
  - Clean inline iOS-style toggles (`#FF5722` active, `#DFDCD2` inactive).

### Charts & Data Visualizations
- Rounded vertical bar graphs where columns have `12px` to `16px` pill heads, utilizing background track pills in `#EBE9E1` and fill indicators in primary coral `#FF5722`.
- Micro donut rings and progress lines adopting continuous strokes and rounded terminals.