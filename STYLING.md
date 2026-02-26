# Chrisputer.tech Styling Requirements

## Design principles

- Professional but approachable. This is a solo IT consultant, not a corporate MSP.
- Visual weight comes from layout, color, and SVG graphics. No stock photos.
- Every page section should have clear visual separation (dividers, backgrounds, spacing).
- Dark mode is first-class. Every element must look good in both themes.

## Color system

- Primary accent: blue (#2563eb light / #60a5fa dark)
- Secondary accents for variety: green, amber, purple (used on service card icons)
- Backgrounds use subtle radial gradients with accent color at low opacity
- Text gradient effect (blue to purple) used sparingly for emphasis

## Typography

- Font: Inter (self-hosted, weights 400/500/600/700)
- Code: JetBrains Mono (self-hosted)
- Headlines: weight 700-800, tight letter-spacing (-0.03em to -0.04em)
- Body: weight 400, line-height 1.7-1.75
- Section headers: centered with subtitle text below in secondary color

## Components

### Section dividers
- 60px wide, 3px tall accent-colored bar centered above each major section
- Provides visual rhythm without heavy borders

### Cards (service cards, post cards)
- Rounded corners (14px)
- 1px border in tertiary color
- On hover: accent border, translateY(-3px to -4px), box-shadow
- Animated top-border reveal (scaleX from 0 to 1) on hover
- Icon containers use distinct background colors per card type

### Buttons
- Inline-flex with SVG icon + text
- Primary: accent background, white text, accent shadow
- Secondary: transparent with tertiary border, accent on hover
- Hover: translateY(-2px) with deeper shadow

### Badges/tags
- Pill-shaped (border-radius: 100px)
- Accent-light background with accent text
- Used for location badges, vendor tags, post tags

### Number callouts
- Circled numbers with accent background, white text
- Box-shadow with accent color at 30% opacity
- Used in process/step sections

### CTA banners
- Subtle gradient background using accent at very low opacity (6-10%)
- Accent border at 15-20% opacity
- Rounded corners (16px)
- Flexbox layout: text on left, button on right (stacks on mobile)

## Animations

- Fade-up entrance: elements start 16px below and opacity 0, animate to position
- Staggered delays on card grids (0.05s increments)
- Network SVG: pulsing connection lines and node dots
- Reading progress bar: gradient from blue to purple
- Hover transitions: 0.2-0.25s ease

## Page-specific requirements

### Homepage
- Hero with radial gradient glow, location badge, gradient headline, network SVG
- Trust bar with key stats (numbers + labels)
- Service cards in 2x2 grid with color-coded icons
- "How it works" three-step process with numbered circles and dashed connectors
- CTA banner
- Recent posts with "All posts" link

### Services page
- Each service gets a visual card-like treatment with icon
- Pricing callouts styled as badges, not just bold text
- "How it works" steps visually distinct from body text
- Email CTA at bottom styled as banner, not plain text

### About page
- Intro section with visual emphasis (larger text or highlight)
- Section cards for "Why I do this" / "What I'm not" / "Where I work"
- Service area with location badge
- Email CTA as styled banner

### Blog post list (/posts/)
- Post cards with hover effects (already done)
- Category/tag badges visible on cards

### Single blog post
- Reading progress bar (gradient)
- Sticky sidebar TOC on wide screens
- Code blocks with rounded corners and shadow
- Inline code with pill styling

## Responsive breakpoints

- 768px: stack grids to single column, reduce hero text size
- 480px: further text reduction, hide step connectors
- 1200px+: sidebar TOC on posts

## Things to never do

- No stock photography
- No em dashes
- No vendor name listings (work with everything, don't name-drop)
- No "powered by Hugo" or theme credits visible
- No cluttered layouts. Whitespace is good.
