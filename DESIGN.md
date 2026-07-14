---
version: alpha
name: Automotive Business OS Landing Page Template
description: A clean, high-density professional landing page for an automotive business operating system featuring technical data visualization, glassmorphism navigation, and depth-oriented UI mockups.
colors:
  primary: "#B42318"
  primary-hover: "#991B12"
  background: "#FAFAFA"
  surface: "#FFFFFF"
  text-main: "#171717"
  text-muted: "#737373"
  text-inverse: "#FFFFFF"
  border: "#E5E5E5"
  accent-emerald: "#059669"
  dark-surface: "#171717"
typography:
  fontFamily: "Inter, system-ui, sans-serif"
  h1:
    size: "4.5rem"
    weight: "500"
    lineHeight: "1.05"
    letterSpacing: "-0.02em"
  h2:
    size: "2.25rem"
    weight: "500"
  body-md:
    size: "1rem"
    lineHeight: "1.625"
  body-sm:
    size: "0.875rem"
  caps-detail:
    size: "0.75rem"
    weight: "600"
    letterSpacing: "0.1em"
spacing:
  base: "4px"
  container-max: "1280px"
  section-padding: "6rem"
rounded:
  default: "6px"
  panel: "12px"
  mockup: "20px"
  mobile: "40px"
components:
  button-primary: "bg-{colors.primary} text-white px-6 py-3 rounded-md shadow-sm"
  button-secondary: "bg-white text-neutral-900 border border-neutral-200 px-6 py-3 rounded-md"
  nav-glass: "bg-white/85 backdrop-blur-md border-b border-black/5"
  card-panel: "bg-white border border-neutral-200/80 rounded-xl shadow-sm"
---

## Overview
RedlineD1 is an automotive-focused SaaS landing page characterized by a "Business OS" aesthetic. It prioritizes information density, professional trust, and technical clarity. The visual language uses a neutral base with a single high-contrast brand color (Redline Red). The layout is structured with significant vertical rhythm and utilizes layered application mockups to demonstrate platform complexity and utility.

## Colors
- **Primary Brand**: `#B42318` used for critical actions, status indicators, and branding.
- **Neutral Palette**: Ranges from `#FAFAFA` (backgrounds) to `#171717` (primary text and dark sections). Mid-tones include `#737373` for secondary copy and `#E5E5E5` for borders.
- **Semantic Colors**: Emerald (`#059669`) for verified statuses and positive growth; Amber (`#F59E0B`) for flagged items or items requiring attention.
- **Gradients**: Subtle radial glow (`rgba(180, 35, 24, 0.03)`) used in the hero to create depth without overwhelming the minimalist palette.

## Typography
- **Typeface**: Inter is the sole font, utilized in weights 400 (Regular), 500 (Medium), and 600 (Semi-bold).
- **Headings**: Medium weights with tight tracking (`tracking-tight`). Large h1 headers use specific line-heights (1.05) to maintain density in a large-text format.
- **Metadata**: Small, uppercase, tracked-out labels for section categorization (e.g., "OWNER INTELLIGENCE").

## Layout
- **Grid**: Standard 12-column logic implemented via Tailwind's `max-w-7xl` container. Sections frequently use a 1:1 split (50/50) for copy vs. mockups.
- **Density**: High content density with tight internal component spacing, reflecting the complex nature of diagnostic and business software.
- **Navigation**: Fixed-position sticky header with a height of `4rem` (h-16) and glassmorphic transparency.

## Elevation & Depth
- **Mockup Shadows**: Custom shadow `0 12px 48px -12px rgba(0, 0, 0, 0.08)` to simulate layers of software windows.
- **Panel Shadows**: Subtle elevation for interior UI cards to distinguish them from the main background surface.
- **Layering**: Overlapping UI elements (Floating Mobile Mockup vs. Desktop App Mockup) are used to create 3D space in a flat design system.

## Shapes
- **Corner Radii**:
  - 6px (rounded-md) for buttons.
  - 12px (rounded-xl) for interior cards and panels.
  - 40px (rounded-[2.5rem]) for mobile phone frames.
- **Borders**: 1px solid borders are ubiquitous, reinforcing the "structured data" and "operating system" feel.

## Components
- **Navigation Bar**: Glassmorphic, containing a text-based logo and small-text (sm) medium-weight links.
- **Primary CTA**: Solid Redline Red button with a subtle hover transition to a darker red shade.
- **Feature Nodes**: Rounded-full pill indicators connected by lines to represent a process flow.
- **Command Center Cards**: Information-dense containers with multi-level data (label, value, sparkline/status).
- **App Mockups**: Faithfully recreated UI frames containing simulated sidebar, headers, and data tables using gray placeholders.

## Page Sections
### Navigation
Fixed header with `nav-glass` effect. Features the brand logo (REDLINE D1) where "D1" is colored in `{colors.primary}`. Includes a hidden-on-mobile menu and a clear "Start Free Trial" CTA.

### Hero Section
Large typography centered on a light neutral background with a subtle red radial glow. Features an "Engine v2.0" pill badge. Includes a dual-CTA block and a complex 3D-layered mockup of the desktop and mobile software.

### Trust & Philosophy
A 50/50 split section. Left side focuses on the "Built inside a real repair shop" narrative with a list of checkmark-bulleted items. Right side features a large neutral icon container.

### Process Flow
Horizontal scrolling workflow indicator named "One platform for the entire repair lifecycle." It uses interconnected pills from "Customer Intake" to "Repair Intelligence."

### Feature Verticals (Intelligent Modules)
Alternating 50/50 sections (Command Center, Vehicle Memory, Service Advisor). These sections pair descriptive copy with realistic UI modules showing specific data points like "Stale Estimates" or "Estimate Quality Review."

### Feature Principles
A vertical list of 5 key principles (Actionable, Evidence-based, etc.) paired with a triple-phone mockup composition showing different app states (Customers, VIN Scanning, Invoicing).

### Future Roadmap
A three-column layout showing "Available Now," "Rolling Out," and "Future Platform" feature lists with distinct border treatments (Solid vs. Dashed).

## Motion & Interaction
- **Smooth Scroll**: Enabled on the HTML element for anchor navigation.
- **Transitions**: 300ms duration transitions on navigation links and buttons for color shifts.
- **Interactive States**: Hover effects on cards (`hover:bg-neutral-50`) and specific link underscores.

## Do's and Don'ts
- **Do**: Use high-contrast for primary actions (Red on White/Dark).
- **Do**: Maintain high information density in card components.
- **Don't**: Use heavy shadows or vibrant multi-color gradients.
- **Don't**: Increase typography tracking for body text; keep it tight and technical.

## Accessibility
- **Contrast**: High contrast ratios for primary text (`#171717` on `#FAFAFA`).
- **Interactivity**: Focus states are implied through standard Tailwind transitions; `scroll-smooth` enhances user orientation during navigation.
- **Structure**: Semantic use of `header`, `section`, `h1-h4`, and `ul` elements.

## Assets
1. iconify: `https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js` (Used for all system icons like `solar:wrench-linear`, `solar:magnifer-linear`, etc.)
2. fonts: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap` (Primary Typography)
3. scripts: `https://cdn.tailwindcss.com` (Framework/Styling engine)

### Exported Codebase Asset Inventory
1. embed: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;display=swap
   Context: index.html: markup attribute; index.html: absolute url literal
