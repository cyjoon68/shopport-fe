---
id: x.ai
name: xAI
country: US
category: ai
homepage: "https://x.ai"
primary_color: "#000000"
logo:
  type: simpleicons
  slug: x
verified: "2026-05-15"
omd: "0.1"
tokens:
  source: prose-derived
  extracted: "2026-06-09"
  colors:
    text-primary: "#ffffff"
    canvas: "#1f2228"
    ring-blue: "#3b82f6"
    surface-elevated: "#26292f"
    surface-hover: "#2a2d33"
    border-default: "#2c2f35"
    border-strong: "#3a3d42"
    inverse-near-black: "#0a0a0a"
  typography:
    family: { sans: "universalSans", mono: "GeistMono" }
    display-hero: { size: 320, weight: 300, lineHeight: 1.50, use: "GeistMono, extreme display" }
    section:      { size: 30, weight: 400, lineHeight: 1.20, use: "universalSans, section heading" }
    body:         { size: 16, weight: 400, lineHeight: 1.50, use: "universalSans, body" }
    button:       { size: 14, weight: 400, lineHeight: 1.43, tracking: 1.4, use: "GeistMono, uppercase button" }
    caption:      { size: 14, weight: 400, lineHeight: 1.50, use: "universalSans, label/caption" }
    small:        { size: 12, weight: 400, lineHeight: 1.50, use: "universalSans, meta" }
  spacing: { xs: 4, sm: 8, base: 24, lg: 48 }
  rounded: { sm: 0, md: 0, lg: 4, full: 9999 }
  shadow:
    none: "none"
  components:
    button-primary: { type: button, bg: "#ffffff", fg: "#1f2228", radius: 0, padding: "12px 24px", font: "14px/400 GeistMono", use: "Primary CTA, uppercase 1.4px tracking, hover 0.9 white" }
    button-ghost: { type: button, fg: "#ffffff", radius: 0, padding: "12px 24px", font: "14px/400 GeistMono", use: "Secondary, 1px rgba(255,255,255,0.2) border" }
    card: { type: card, radius: 0, padding: "24px", use: "Container, 1px rgba(255,255,255,0.1) border, no shadow, hover border 0.2" }
    badge-mono: { type: badge, fg: "#ffffff", radius: 0, padding: "4px 8px", font: "12px GeistMono", use: "Monospace tag, 1px rgba(255,255,255,0.2) border" }
    input-default: { type: input, fg: "#ffffff", radius: 0, padding: "8px 12px", font: "16px universalSans", use: "Form input, 1px rgba(255,255,255,0.2), focus blue ring, placeholder 0.3" }
  components_harvested: true
---

# Design System Inspiration of xAI

## 1. Visual Theme & Atmosphere

xAI's website is a masterclass in dark-first, monospace-driven brutalist minimalism -- a design system that feels like it was built by engineers who understand that restraint is the ultimate form of sophistication. The entire experience is anchored to an almost-black background (`#1f2228`) with pure white text (`#ffffff`), creating a high-contrast, terminal-inspired aesthetic that signals deep technical credibility. There are no gradients, no decorative illustrations, no color accents competing for attention. This is a site that communicates through absence.

The typographic system is split between two carefully chosen typefaces. `GeistMono` handles display-level headlines and buttons; `universalSans` handles body and secondary heading text. Spacing follows an 8px grid. Border radius is minimal, with no decorative shadows or gradients. Depth is communicated through contrast and whitespace.

## 2. Color Palette & Roles

- Pure White (`#ffffff`): primary foreground.
- Dark Background (`#1f2228`): universal canvas.
- Surface Elevated (`#26292f`) and Surface Hover (`#2a2d33`).
- Border Default (`#2c2f35`) and Border Strong (`#3a3d42`).
- Ring Blue (`#3b82f6`): accessibility focus.

## 3. Typography Rules

Use GeistMono for display and uppercase buttons with 1.4px tracking. Use universalSans at 16px/1.5 for body content. Use weights 300–400 and keep hierarchy restrained.

## 4. Component Stylings

Buttons, cards, badges, and inputs use sharp corners, monochrome foregrounds, thin low-contrast borders, and no shadows. Inputs use real text controls with white text and muted placeholders.

## 5. Layout Principles

Use the 4px, 8px, 24px, and 48px spacing scale. Mobile layouts are single-column. Whitespace and typography establish hierarchy without decorative containers.

## 6. Depth & Elevation

Depth uses surface contrast and border opacity only. Shadows and gradients are forbidden. Focus uses the blue accessibility ring.

## 7. Do's and Don'ts

Use `#1f2228`, white text, minimal radii, restrained spacing, and accessible contrast. Do not use shadows, gradients, decorative color, large rounded cards, or fake controls.

## 8. Responsive Behavior

Scale extreme web typography down to 48–64px on mobile. Maintain a minimum 44pt iOS and 48dp Android touch target. Stack content vertically and preserve safe areas.

## 9. Agent Prompt Guide

Start with `#1f2228`; use GeistMono for display/buttons and universalSans for reading; never use shadows or gradients; keep borders subtle and corners sharp; preserve monochrome contrast.

## 10. Voice & Tone

Use short, specific, conversational language. CTAs begin with verbs. Errors state the cause and a useful next action.

## 11. Brand Narrative

xAI is a research-oriented AI company. The monochrome research-lab register and Grok's more irreverent product voice remain distinct.

## 12. Principles

1. Dark canvas.
2. White-on-dark monochrome.
3. Generous but mobile-appropriate spacing.
4. Research voice for corporate content and conversational voice for product UI.
5. Native, accessible interaction chrome.

## 13. Personas

Mobile shoppers, AI power users, and curious early adopters need direct language, native navigation, and conversational product discovery.

## 14. States

Support empty chats, loading and streaming, image processing, specific errors, successful answers, product results, disabled subscription states, and persistent progress.

## 15. Motion & Easing

Use instant selection, 150ms fast feedback, and 250ms standard transitions without bounce. Reduced motion removes nonessential transitions.

---
Source: https://oh-my-design.kr/design-systems/x.ai · Raw twin of references/x.ai/DESIGN.md
Install 440 quality-graded references for your AI coding agent: npx oh-my-design-cli@latest
