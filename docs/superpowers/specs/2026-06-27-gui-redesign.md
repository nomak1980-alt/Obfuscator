# GUI Redesign: Claude-inspired Dark Theme

## Overview
Redesign the obfuscator.css from a bright, colorful theme (purple gradient background, glassmorphism) to a minimal, technical dark theme inspired by Claude and Visual Studio. Focus: cleaner, less distracting, more professional.

## Design Approach: Ansatz A (Claude-inspired)

### Color Palette

| Element | Hex | Usage |
|---------|-----|-------|
| Background (body) | #0f0f0f | Main container background |
| Background (containers) | #1a1a1a | Sections, cards |
| Text (primary) | #e0e0e0 | Body text, labels |
| Text (secondary) | #a0a0a0 | Disabled, hints |
| Accent (primary) | #0d7bc2 | Buttons, focus, highlights, borders |
| Accent (warning) | #d97706 | Danger buttons, warnings |
| Borders | #2d2d2d | Subtle section edges (minimal use) |

### Components

**Textareas & Inputs:**
- Background: #1a1a1a
- Border: 1px solid #2d2d2d
- Text color: #e0e0e0
- Focus state: border #0d7bc2, minimal/no box-shadow

**Buttons:**
- Primary: bg #0d7bc2, text white
- Danger/Secondary: bg #d97706, text white
- Hover: +10% lightness on bg color
- No transform/animation on hover — color change only
- Border-radius: 8-10px (clean, minimal)

**Sections & Cards:**
- Background: #1a1a1a
- Border: 1px solid #2d2d2d (optional, very subtle)
- Padding: 20px (unchanged)

**Tables:**
- Header bg: #252525
- Body rows: alternating #1a1a1a / #1f1f1f (subtle)
- Hover row: #252525
- Text: #e0e0e0

**Status Messages:**
- Success: bg #0d7bc2 @ 10% opacity, text #0d7bc2
- Error: bg #d97706 @ 10% opacity, text #d97706

**Icons:**
- Color: #0d7bc2 (blue, not purple)
- No changes to size/placement

**Remove:**
- No gradient backgrounds
- No backdrop-filter blur
- No gradient text
- No transform animations (only color changes)
- No box-shadows on focus (or very minimal)

### Layout & Structure
- Overall structure unchanged
- Spacing, grid layouts preserved
- Only visual styling changes

## Implementation
Update `obfuscator.css` — search and replace color values, remove gradients and animations. Keep HTML structure untouched.

## Success Criteria
- Dark theme matches screenshot/design
- Buttons respond to hover with color change only
- No gradient backgrounds, no glassmorphism
- Textareas/inputs are accessible and readable
- All interactive elements have clear focus states
