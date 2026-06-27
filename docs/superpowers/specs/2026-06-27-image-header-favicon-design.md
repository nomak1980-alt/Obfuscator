# Image Header & Favicon Design

**Datum:** 2026-06-27  
**Scope:** `obfuscator.html`, `obfuscator.css`, `COHeader.jpg`, `COIcon.jpg`

---

## Ziel

- `COHeader.jpg` ersetzt den `<h1>`-Text als Überschrift
- `COIcon.jpg` dient als Browser-Favicon

---

## 1. Header-Bild

**Vorher:** `<h1>🔒 Code Obfuscator</h1>` in `.header-row`

**Nachher:**
```html
<img src="COHeader.jpg" alt="Code Obfuscator" class="header-logo">
```

CSS:
```css
.header-logo {
    height: 52px;
    width: auto;
    display: block;
}
```

- `height: 52px` passt zur Höhe der Export/Import-Buttons in `.header-row`
- `width: auto` erhält das Seitenverhältnis
- `alt="Code Obfuscator"` für Barrierefreiheit
- `h1`-CSS-Regel (`.h1 { color, font-size }`) kann entfernt werden

---

## 2. Favicon

Im `<head>` nach dem vorhandenen `<link rel="stylesheet">`:
```html
<link rel="icon" href="COIcon.jpg" type="image/jpeg">
```

---

## 3. Assets

`COHeader.jpg` und `COIcon.jpg` werden in das Projektverzeichnis kopiert und committed.

---

## Nicht geändert

- `.header-row` CSS bleibt unverändert
- Alle anderen Sections, JS, Core-Logik unberührt
