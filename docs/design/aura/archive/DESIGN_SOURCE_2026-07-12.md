---
version: alpha
name: RedlineD1 Automotive OS
description: A high-density, professional SaaS platform for automotive repair shop management and business intelligence, characterized by a clean neutral palette with high-contrast red accents.
colors:
  primary: "#B42318"
  primary-hover: "#991B12"
  surface-bg: "#FAFAFA"
  surface-white: "#FFFFFF"
  surface-dark: "#171717"
  text-main: "#171717"
  text-muted: "#737373"
  text-light: "#A3A3A3"
  border-light: "#E5E5E5"
  success: "#059669"
  warning: "#F59E0B"
typography:
  fontFamily: "'Inter', system-ui, sans-serif"
  h1: { size: "72px", weight: "500", lineHeight: "1.05", tracking: "-0.025em" }
  h2: { size: "36px", weight: "500", tracking: "-0.025em" }
  body-lg: { size: "20px", weight: "400", lineHeight: "1.6" }
  body-md: { size: "14px", weight: "400", lineHeight: "1.5" }
  caption: { size: "12px", weight: "500", tracking: "0.05em" }
spacing:
  section-py: "128px"
  container-max: "1280px"
  gap-md: "24px"
rounded:
  default: "6px"
  panel: "16px"
  full: "9999px"
components:
  button-primary: { bg: "{colors.primary}", text: "{colors.surface-white}", radius: "{rounded.default}" }
  button-secondary: { bg: "{colors.surface-white}", border: "{colors.border-light}", text: "{colors.text-main}" }
  nav-glass: { bg: "rgba(250, 250, 250, 0.85)", blur: "12px", borderBottom: "1px solid rgba(0, 0, 0, 0.04)" }
  status-badge: { size: "10px", weight: "600", padding: "2px 6px" }
---

## Overview
RedlineD1 is an Automotive Business Operating System designed with a focus on high-density information display, professional reliability, and data-driven decision making. The visual personality is clinical and organized, utilizing a strict Inter-based typographic hierarchy and a neutral gray-scale palette. The brand's signature "Redline Red" (#B42318) is used sparingly for primary actions, critical alerts, and branding highlights. The layout emphasizes depth through layered mockups, subtle shadows, and glassmorphism in the navigation. It presents a "command center" tone that balances traditional shop ruggedness with modern SaaS intelligence.

## Colors
- **Brand Core**: Red (#B42318) used for branding and critical "attention-needed" UI elements.
- **Neutral Palette**: Extensive use of Neutral 50 (#FAFAFA) for page backgrounds, Neutral 900 (#171717) for dark sections/text, and various border grays for structure.
- **Semantic Highlighting**: Emerald (#059669) for verified/positive outcomes, Amber (#F59E0B) for flags, and Blue for standard focus.
- **Gradients**: A subtle radial glow (`glow-subtle`) uses 3% opacity Red to create a vertical heat-map effect in the hero section.

## Typography
- **Primary Type**: Inter (weights 400, 500, 600).
- **Headings**: Tight tracking and moderate font weights (Medium 500) provide an authoritative but non-aggressive feel.
- **Metadata**: Heavy use of 10px-12px uppercase tracking for category labels and "Intelligence" tags.
- **Readability**: High line-heights (1.6+) for body paragraphs ensure long-form descriptive content remains digestible.

## Layout
- **Grid System**: Standard 12-column logic often split into 50/50 or 60/40 configurations for side-by-side text/mockup displays.
- **Container**: Max width of 1280px (`max-w-7xl`) for core content.
- **Header**: Fixed height (64px/h-16) glassmorphic top navigation with a 12-column sub-grid.
- **Vertical Rhythm**: Massive white space between major sections (96px to 128px) to reduce cognitive load.

## Elevation & Depth
- **Nav Glass**: High blur (12px) and low-opacity borders.
- **Mockup Shadow**: Deep, multi-layered shadows (`0 12px 48px -12px rgba(0,0,0,0.08)`) to simulate physical layers of a dashboard.
- **Panel Shadow**: Softer, inset shadows for dashboard cards to make them feel integrated into the surface.

## Shapes
- **Corner Radius**: Standardized 6px (rounded-md) for buttons and inputs. Large 16px (rounded-2xl) for containers/cards. Full radius for status pills.
- **Iconography**: Solar-linear and Solar-bold icons provide a soft, rounded aesthetic that offsets the sharp text.

## Components
- **Buttons**: Square-edged (minimal radius) primary buttons with subtle box shadows. Hover states involve dark shifts (Red to Dark Red).
- **Dashboard Cards**: White or off-white containers with 1px borders. Often include a bottom-aligned metadata row and a status indicator.
- **Navigation**: Desktop uses simple text-links with color shifts; mobile is hinted via high-contrast buttons.
- **Process Nodes**: Rounded-pill shape connectors used to visualize the "Repair Lifecycle" workflow.

## Page Sections
### Global Navigation
- **Composition**: Sticky glassmorphic bar. Left-aligned logo and main nav; right-aligned utility (Sign In, Trial CTA).
- **Visuals**: Low-contrast text (Neutral 500) until hover (Neutral 900).

### Hero Section
- **Composition**: Centered text stack followed by a complex layered mockup composition.
- **Highlights**: A "RedlineD1 Engine v2.0" pill notification at the top. Two primary CTAs (Red Fill / White Border).
- **Visual Assets**: Overlapping Desktop mockup (1000px wide), Floating Mobile mockup (260px wide), and a small "Morning Brief" card.

### Business Context / Trust Section
- **Composition**: Split 2-column layout. Left side features a benefit list with bold checkmark icons. Right side features a placeholder for shop imagery.
- **Atmosphere**: Uses background Neutral 100 to differentiate from the hero.

### OS Workflow
- **Composition**: Horizontal scroll-enabled row of process pills (Intake to Intelligence) connected by thin gray horizontal lines.
- **Style**: Interactive-looking pills with icons; the final node is high-contrast dark with a dashed connector to signify "AI Intelligence."

### Intelligence Feature Blocks
- **Structure**: Alternating 2-column blocks.
- **"Owner Intelligence"**: White cards with red-tinted alert boxes ($12,450 Stale Estimates).
- **"Intelligent Service Advisor"**: Dark mode section (#171717) with semi-transparent gray cards and amber warning flags.
- **"Repair Case"**: Detailed white card showing a diagnostic tree (Symptoms -> Tests -> Resolution).

### Pricing / Future Roadmap
- **Composition**: 3-column grid showing current, rollout, and future features.
- **Card Variation**: Dashed borders and 70% opacity indicate future/planned functionality.

## Motion & Interaction
- **Scrolling**: Smooth-scroll behavior enabled globally. Navigation bar has a `duration-300` transition for alpha/blur changes.
- **Hover Effects**: Standard background color transitions on buttons. Text color transitions on links.
- **Aura Controls**: The codebase includes specific performance controllers to pause animations and transitions when the tab is inactive.

## Do's and Don'ts
- **Do**: Use high-contrast for numbers and metrics (e.g., $ amounts in Neutral 900).
- **Do**: Keep borders subtle and low-opacity (0.05-0.1 range).
- **Don't**: Use the brand red for large background areas; it is strictly an accent color.
- **Don't**: Overcomplicate the typography; stick to Inter for all functional text.

## Accessibility
- **Contrast**: High contrast (171717 on FAFAFA) for body text.
- **Visual Cues**: All alerts and status changes use both color (Red/Green) and icons (Check/Warning) for colorblind friendliness.
- **Hierarchy**: Logical heading progression from H1 down to H4 within dashboard cards.

## Assets
- **Stylesheets**: [Tailwind CSS](https://cdn.tailwindcss.com)
- **Scripts**: [Iconify Framework](https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js)
- **Fonts**: [Inter via Google Fonts](https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap)

### Exported Codebase Asset Inventory
1. embed: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;display=swap
   Context: index.html: markup attribute; index.html: absolute url literal
