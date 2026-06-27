# Layout Redesign: Header, 2-Spalten & Chip-Input

**Datum:** 2026-06-27  
**Scope:** `obfuscator.html`, `obfuscator.css`, `obfuscator.js`

---

## Ziel

Bessere Bildschirmbreitennutzung durch:
1. Header-Zeile: Titel und Export/Import auf gleicher Höhe
2. Nebeneinander-Layout: Original Code (links 65%) + String-Replace (rechts 35%)
3. String-Replace von 3× Textarea-Sets zu einem Tag/Chip-Input vereinfachen

Gilt identisch für beide Tabs (C# und SQL).

---

## 1. Header-Zeile

**Vorher:** `h1` zentriert, `data-toolbar` (Export/Import) in eigener Zeile darunter.

**Nachher:** Beide in einen Flex-Container (`.header-row`):
- `h1` links, linksbündig
- `.data-toolbar` rechts, vertikal zentriert
- Container `max-width`: 1200px → 1500px

```
┌─────────────────────────────────────────────────────────────────┐
│  🔒 Code Obfuscator              [💾 Exportieren] [📂 Importieren] │
└─────────────────────────────────────────────────────────────────┘
```

CSS-Änderungen:
- Neues `.header-row`: `display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;`
- `h1`: `margin-bottom: 0; text-align: left;`
- `.data-toolbar`: `margin-bottom: 0;`

---

## 2. Nebeneinander-Layout

**Vorher:** `.section` "Originaler Code" und `.section` "String-Replace" vertikal gestapelt.

**Nachher:** Beide in einen `.code-row`-Wrapper mit CSS Grid:

```
.code-row {
  display: grid;
  grid-template-columns: 65fr 35fr;
  gap: 20px;
  align-items: start;
}
```

```
┌────────────────────────────────────┬─────────────────────┐
│  📄 Originaler Code (65%)          │  🔵 String-Replace   │
│  [textarea — min-height: 300px]    │  [chip-input]        │
│                                    │  [chip-sammlung]     │
└────────────────────────────────────┴─────────────────────┘
```

- Die beiden `.section`-Elemente (Code + String-Replace) werden direkt als Grid-Kinder in `.code-row` platziert
- `align-items: start` damit beide Boxen oben beginnen statt gestreckt zu werden
- Gilt für C#-Tab und SQL-Tab gleichermaßen

---

## 3. Chip/Tag-Input für String-Replace

**Vorher:** 3 separate Textareas (`stringReplace1/2/3`, `sqlStringReplace1/2/3`) mit "Wörter zeilenweise trennen"-Hinweis.

**Nachher:** Pro Tab ein einziges Chip-Input-Widget.

### HTML-Struktur (je Tab)

```html
<div class="chip-input-wrapper">
  <input type="text" id="stringReplaceInput" placeholder="Wort eingeben und Enter drücken..." class="chip-input-field">
  <div id="stringReplaceChips" class="chip-container"></div>
</div>
```

### Chip-Logik (JS)

- State: `stringReplaceWords = []` (C#), `sqlStringReplaceWords = []` (SQL)
- `keydown Enter` auf dem Input:
  - Trim, Leerstring und Duplikat ignorieren
  - Wort in Array pushen
  - Chip-DOM-Element erstellen mit `<span class="chip">Wort <button class="chip-remove">✕</button></span>`
  - Input leeren
- ❌-Klick: Wort aus Array entfernen, Chip-Element entfernen
- Alle Stellen, die bisher `stringReplace1/2/3.value.split('\n')` nutzen, verwenden stattdessen direkt das Array

### CSS (neue Klassen)

```css
.chip-input-field { width: 100%; padding: 8px 12px; ... }
.chip-container { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; min-height: 40px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
        background: rgba(13,123,194,0.2); border: 1px solid rgba(13,123,194,0.4);
        border-radius: 20px; color: #e0e0e0; font-size: 13px; }
.chip-remove { background: none; border: none; color: #a0a0a0; cursor: pointer;
               padding: 0; font-size: 14px; line-height: 1; }
.chip-remove:hover { color: #f87171; }
```

---

## 4. Export/Import — Formatänderung

**Vorher:** `stringReplace1`, `stringReplace2`, `stringReplace3` als mehrzeilige Strings im JSON.

**Nachher:** `stringReplaceWords: ["Wort1", "Wort2", ...]` als Array.

**Rückwärtskompatibilität beim Import:** Falls altes Format erkannt (Keys `stringReplace1` vorhanden), werden alle drei Sets zusammengeführt, zeilenweise gesplittet, dedupliziert und als Chips geladen.

Gleiches gilt für `sqlStringReplaceWords` (SQL-Tab).

---

## Nicht geändert

- Alle anderen Sections (Analyse-Buttons, Mapping-Auswahl, Verschleierter Code, KI-Antwort, Finaler Code) bleiben vertikal gestapelt wie bisher
- Tab-Navigation bleibt unverändert
- Gesamte Obfuscator-Logik in `obfuscator-core.js` bleibt unberührt
