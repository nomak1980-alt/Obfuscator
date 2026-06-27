# GUI Dark Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform obfuscator.css from a bright, colorful theme (purple gradients, glassmorphism) to a minimal, technical dark theme (Claude-inspired) with ruhiges Blau and orange accents.

**Architecture:** Systematic CSS replacement — preserve all selectors and structure, update only color values, remove gradients and animations. No HTML changes. Single file edit to `obfuscator.css`.

**Tech Stack:** CSS3, no dependencies

## Global Constraints
- No HTML structure changes
- Preserve all existing selectors and class names
- No new fonts or assets
- No JavaScript changes
- Monospace font for code/tables unchanged

---

## Task 1: Replace Color Scheme (Body & Container)

**Files:**
- Modify: `obfuscator.css:1-50` (body, container, general resets)

**Interfaces:**
- Consumes: existing CSS rules
- Produces: dark background (#0f0f0f), dark container (#1a1a1a), light text (#e0e0e0)

- [ ] **Step 1: Open obfuscator.css and locate body + .container rules**

Lines 1-22. Current state:
- `body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }`
- `.container { background: rgba(255, 255, 255, 0.95); }`

- [ ] **Step 2: Replace body background**

Replace lines 6-9:
```css
body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: #0f0f0f;
    min-height: 100vh;
    padding: 20px;
}
```

- [ ] **Step 3: Replace container styling**

Replace lines 14-22:
```css
.container {
    max-width: 1200px;
    margin: 0 auto;
    background: #1a1a1a;
    border-radius: 20px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    padding: 30px;
    border: 1px solid #2d2d2d;
}
```

- [ ] **Step 4: Commit**

```bash
git add obfuscator.css
git commit -m "refactor(css): switch body and container to dark theme colors"
```

---

## Task 2: Replace h1 Gradient & Section Styles

**Files:**
- Modify: `obfuscator.css:24-41` (h1, section, section h3)

**Interfaces:**
- Consumes: h1, .section, .section h3 selectors
- Produces: solid h1 color (#0d7bc2), dark sections with subtle borders

- [ ] **Step 1: Replace h1 styling**

Replace lines 24-33:
```css
h1 {
    text-align: center;
    color: #e0e0e0;
    margin-bottom: 30px;
    font-size: 2.5em;
}
```

- [ ] **Step 2: Replace section styling**

Replace lines 35-41:
```css
.section {
    margin-bottom: 30px;
    padding: 20px;
    background: #1a1a1a;
    border-radius: 15px;
    border: 1px solid #2d2d2d;
}

.section h3 {
    color: #e0e0e0;
    margin-bottom: 15px;
    font-size: 1.3em;
    display: flex;
    align-items: center;
    gap: 10px;
}
```

- [ ] **Step 3: Replace icon color**

Replace line 55 (`.icon { fill: ... }`):
```css
.icon {
    width: 24px;
    height: 24px;
    fill: #0d7bc2;
}
```

- [ ] **Step 4: Commit**

```bash
git add obfuscator.css
git commit -m "refactor(css): update h1, sections, and icons to dark theme"
```

---

## Task 3: Replace Textarea & Input Styles

**Files:**
- Modify: `obfuscator.css:58-76` (textarea focus states)

**Interfaces:**
- Consumes: textarea selector
- Produces: dark textarea (#1a1a1a bg, #e0e0e0 text, #0d7bc2 focus border)

- [ ] **Step 1: Replace textarea styling**

Replace lines 58-76:
```css
textarea {
    width: 100%;
    min-height: 300px;
    padding: 15px;
    border: 1px solid #2d2d2d;
    border-radius: 10px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    transition: border-color 0.3s ease;
    background: #0f0f0f;
    color: #e0e0e0;
}

textarea:focus {
    outline: none;
    border-color: #0d7bc2;
    box-shadow: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add obfuscator.css
git commit -m "refactor(css): update textarea styles to dark theme"
```

---

## Task 4: Replace Button Styles (Remove Gradients & Animations)

**Files:**
- Modify: `obfuscator.css:78-131` (button styles, all button variants)

**Interfaces:**
- Consumes: .btn-primary, .btn-secondary, .btn-danger, button:hover, button:active
- Produces: solid color buttons with color-change hover, no transform

- [ ] **Step 1: Replace general button styling**

Replace lines 78-98:
```css
.button-group {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin: 20px 0;
    flex-wrap: wrap;
}

button {
    padding: 12px 25px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 1px;
    position: relative;
    overflow: hidden;
}

button:focus-visible,
.tab:focus-visible,
input[type="checkbox"]:focus-visible {
    outline: 2px solid #0d7bc2;
    outline-offset: 2px;
}
```

- [ ] **Step 2: Replace button color variants**

Replace lines 108-130:
```css
.btn-primary {
    background: #0d7bc2;
    color: white;
}

.btn-primary:hover {
    background: #0e8dd5;
}

.btn-secondary {
    background: #d97706;
    color: white;
}

.btn-secondary:hover {
    background: #ea8c1a;
}

.btn-danger {
    background: #d97706;
    color: white;
}

.btn-danger:hover {
    background: #ea8c1a;
}

button:active {
    opacity: 0.9;
}
```

- [ ] **Step 3: Update export/import buttons**

Replace lines 292-304:
```css
.btn-export {
    background: #0d7bc2;
    color: white;
    padding: 8px 18px;
    font-size: 14px;
}

.btn-export:hover {
    background: #0e8dd5;
}

.btn-import {
    background: #d97706;
    color: white;
    padding: 8px 18px;
    font-size: 14px;
}

.btn-import:hover {
    background: #ea8c1a;
}
```

- [ ] **Step 4: Commit**

```bash
git add obfuscator.css
git commit -m "refactor(css): update button colors and remove transform animations"
```

---

## Task 5: Replace Text & Status Message Colors

**Files:**
- Modify: `obfuscator.css:132-205` (mapping display, status messages, info-box)

**Interfaces:**
- Consumes: .mapping-display, .original, .obfuscated, .status, .info-box, .warning-box
- Produces: light text on dark bg, status colors with dark opacity

- [ ] **Step 1: Replace mapping-display styling**

Replace lines 132-149:
```css
.mapping-display {
    background: #0f0f0f;
    border-radius: 10px;
    padding: 15px;
    max-height: 200px;
    overflow-y: auto;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    line-height: 1.4;
    border: 1px solid #2d2d2d;
    color: #e0e0e0;
}

.mapping-item {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px solid #2d2d2d;
}

.mapping-item:last-child {
    border-bottom: none;
}

.original {
    color: #f87171;
    font-weight: bold;
}

.obfuscated {
    color: #4ade80;
    font-weight: bold;
}
```

- [ ] **Step 2: Replace status message styling**

Replace lines 164-182:
```css
.status {
    text-align: center;
    padding: 10px;
    border-radius: 10px;
    margin: 10px 0;
    font-weight: 600;
}

.status.success {
    background: rgba(13, 123, 194, 0.15);
    color: #0d7bc2;
    border: 1px solid rgba(13, 123, 194, 0.3);
}

.status.error {
    background: rgba(217, 119, 6, 0.15);
    color: #d97706;
    border: 1px solid rgba(217, 119, 6, 0.3);
}
```

- [ ] **Step 3: Replace info-box & warning-box**

Replace lines 184-204:
```css
.info-box {
    background: rgba(13, 123, 194, 0.1);
    border: 1px solid rgba(13, 123, 194, 0.3);
    border-radius: 10px;
    padding: 15px;
    margin: 20px 0;
    color: #0d7bc2;
}

.warning-box {
    background: rgba(217, 119, 6, 0.1);
    border: 1px solid rgba(217, 119, 6, 0.4);
    border-radius: 10px;
    padding: 12px 15px;
    margin: 10px 0;
    color: #d97706;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
}
```

- [ ] **Step 4: Commit**

```bash
git add obfuscator.css
git commit -m "refactor(css): update text colors and status messages for dark theme"
```

---

## Task 6: Replace Stats, Table, & Tab Styles

**Files:**
- Modify: `obfuscator.css:206-341` (stats, tables, tabs)

**Interfaces:**
- Consumes: .stat-item, .mapping-selection-table, .tab, .tab-content
- Produces: dark-themed stats, tables, tabs with blue accents

- [ ] **Step 1: Replace stat-item styling**

Replace lines 206-230:
```css
.stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin: 20px 0;
}

.stat-item {
    background: #1a1a1a;
    padding: 15px;
    border-radius: 10px;
    text-align: center;
    border: 1px solid #2d2d2d;
}

.stat-number {
    font-size: 24px;
    font-weight: bold;
    color: #0d7bc2;
}

.stat-label {
    color: #a0a0a0;
    margin-top: 5px;
}
```

- [ ] **Step 2: Replace mapping-selection-table styling**

Replace lines 251-283:
```css
.mapping-selection-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 15px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 14px;
    color: #e0e0e0;
}

.mapping-selection-table th,
.mapping-selection-table td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid #2d2d2d;
}

.mapping-selection-table th {
    background-color: #252525;
    font-weight: bold;
    color: #e0e0e0;
}

.mapping-selection-table tr:hover {
    background-color: #252525;
}

.mapping-selection-table .original {
    color: #f87171;
}

.mapping-selection-table .obfuscated {
    color: #4ade80;
    font-weight: bold;
}
```

- [ ] **Step 3: Replace tab styling**

Replace lines 306-340:
```css
.tabs {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 1px solid #2d2d2d;
}

.tab {
    padding: 12px 24px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    color: #a0a0a0;
    transition: color 0.2s ease;
    border-bottom: 2px solid transparent;
    margin-bottom: 0;
}

.tab:hover {
    color: #0d7bc2;
}

.tab.active {
    color: #0d7bc2;
    border-bottom-color: #0d7bc2;
}

.tab-content {
    display: none;
}

.tab-content.active {
    display: block;
}
```

- [ ] **Step 4: Commit**

```bash
git add obfuscator.css
git commit -m "refactor(css): update stats, tables, and tabs to dark theme"
```

---

## Task 7: Update Data Toolbar & Mobile Responsive

**Files:**
- Modify: `obfuscator.css:232-249, 285-290` (responsive, toolbar)

**Interfaces:**
- Consumes: .data-toolbar, @media queries
- Produces: dark-themed toolbar, responsive mobile styles

- [ ] **Step 1: Replace data-toolbar**

Replace lines 285-290:
```css
.data-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-bottom: 15px;
}
```

(No color changes needed, already neutral)

- [ ] **Step 2: Verify mobile responsive is unchanged**

Lines 232-249 are fine as-is (only layout, no colors)

- [ ] **Step 3: Add missing color to h4 (if present)**

Check if h4 exists in CSS — if not, add at end:
```css
h4 {
    color: #a0a0a0;
    text-align: center;
    margin-top: 40px;
}
```

- [ ] **Step 4: Commit**

```bash
git add obfuscator.css
git commit -m "refactor(css): finalize dark theme and ensure all text colors are set"
```

---

## Task 8: Manual Visual Test in Browser

**Files:**
- Test: `obfuscator.html` (open in browser)

**Interfaces:**
- Consumes: updated obfuscator.css
- Produces: visual verification of dark theme

- [ ] **Step 1: Start the app in browser**

```bash
# Option A: Open file directly
start obfuscator.html

# Option B: Use /run skill (recommended)
# Use /run in Claude Code to launch dev server or open in browser
```

- [ ] **Step 2: Verify visual checklist**

- [ ] Background is dark (#0f0f0f)
- [ ] Containers are dark gray (#1a1a1a)
- [ ] Text is light gray (#e0e0e0)
- [ ] Buttons are blue (#0d7bc2) and change to brighter blue (#0e8dd5) on hover
- [ ] Danger/Orange buttons work (#d97706)
- [ ] No gradients visible anywhere
- [ ] No blur/glassmorphism effects
- [ ] No floating/transform animations on button hover
- [ ] Focus states have blue outline
- [ ] Textareas are readable with light text on dark bg
- [ ] Tables have alternating row colors (subtle)
- [ ] Active tabs show blue underline
- [ ] Status messages (success/error) display correctly

- [ ] **Step 3: Test interactivity**

- [ ] Click "Code Analysieren" button — CSS should load, no visual errors
- [ ] Switch between C# and SQL tabs — tab underline should move smoothly
- [ ] Hover over buttons — only color should change, no movement
- [ ] Focus on textarea with Tab key — blue outline should appear

- [ ] **Step 4: Commit**

```bash
git add obfuscator.css
git commit -m "test(visual): confirm dark theme renders correctly in browser"
```

---

## Summary

**Total Commits:** 8 (one per task)
**Files Modified:** obfuscator.css (only)
**HTML Changes:** None
**JS Changes:** None

All changes are CSS-only. Visual theme transformation from colorful/bright to minimal/dark (Claude-inspired).

