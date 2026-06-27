# Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimise screen-width usage: header row with title left + buttons right, 65/35 side-by-side grid for Code and String-Replace, chip/tag input replacing three textarea sets.

**Architecture:** Pure HTML/CSS/JS single-page app, no build step. Changes span `obfuscator.html` (structure), `obfuscator.css` (styles) and `obfuscator.js` (chip state + persistence). Both C# and SQL tabs get the same layout.

**Tech Stack:** Vanilla HTML5, CSS Grid/Flexbox, Vanilla JS (ES6), localStorage

## Global Constraints

- No external dependencies — zero new libraries
- CSP: `style-src 'self' 'unsafe-inline'` only; no new inline `style=` attributes — use CSS classes
- All new element IDs must be unique across the document
- `obfuscator-core.js` is not touched

---

## Task 1: Header Row — Inline title + toolbar

**Files:**
- Modify: `obfuscator.html` lines 15–21
- Modify: `obfuscator.css`

**Interfaces:**
- Produces: `.header-row` CSS class; `h1` no longer centred; `.container` max-width 1500px

- [ ] **Step 1: Wrap h1 and data-toolbar in a flex container (HTML)**

In `obfuscator.html`, replace lines 15–21:

```html
        <h1>🔒 Code Obfuscator</h1>

        <div class="data-toolbar">
            <button class="btn-export" data-action="exportState" aria-label="Daten als Backup exportieren">💾 Exportieren</button>
            <button class="btn-import" data-action="triggerImport" aria-label="Daten aus Backup importieren">📂 Importieren</button>
            <input type="file" id="importFileInput" accept=".json" style="display: none;" aria-hidden="true">
        </div>
```

with:

```html
        <div class="header-row">
            <h1>🔒 Code Obfuscator</h1>
            <div class="data-toolbar">
                <button class="btn-export" data-action="exportState" aria-label="Daten als Backup exportieren">💾 Exportieren</button>
                <button class="btn-import" data-action="triggerImport" aria-label="Daten aus Backup importieren">📂 Importieren</button>
                <input type="file" id="importFileInput" accept=".json" style="display: none;" aria-hidden="true">
            </div>
        </div>
```

- [ ] **Step 2: Add CSS for header row and update container + h1**

In `obfuscator.css`:

Update `.container` max-width (line 15):
```css
.container {
    max-width: 1500px;
```

Update `h1` block (lines 24–29) — remove centring and bottom margin:
```css
h1 {
    color: #e0e0e0;
    font-size: 2.5em;
}
```

Update `.data-toolbar` block (lines 293–298) — remove its own bottom margin:
```css
.data-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
```

Add `.header-row` **before** `.data-toolbar`:
```css
.header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
}
```

- [ ] **Step 3: Visual check in browser**

Open `obfuscator.html` in a browser. Verify:
- Title "🔒 Code Obfuscator" sits on the left
- Export + Import buttons are vertically centred on the same line, on the right
- No extra whitespace row between header and tabs

- [ ] **Step 4: Commit**

```bash
git add obfuscator.html obfuscator.css
git commit -m "feat: move header title left and inline export/import buttons"
```

---

## Task 2: 65/35 Side-by-Side Grid for Code + Replace Sections

**Files:**
- Modify: `obfuscator.html` — C# tab (lines 39–73) and SQL tab (lines 150–184)
- Modify: `obfuscator.css`

**Interfaces:**
- Consumes: `.section` (existing class)
- Produces: `.code-row` CSS class; the two `.section` children of `.code-row` lose their individual bottom margin

- [ ] **Step 1: Wrap the two sections in the C# tab**

In `obfuscator.html`, the C# tab currently has two consecutive `.section` divs:

```html
            <div class="section">
                <h3>
                    <svg class="icon" viewBox="0 0 24 24">
                        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    Originaler C# Code
                </h3>
                <textarea id="originalCode" aria-label="Originaler C# Code" placeholder="Füge hier deinen originalen C# Code ein..."></textarea>
            </div>

            <div class="section">
                <h3>
                    ...
                    String-Replace
                </h3>
                ...
            </div>
```

Wrap both with a single `<div class="code-row">…</div>` so the result is:

```html
            <div class="code-row">
                <div class="section">
                    <h3>
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                        </svg>
                        Originaler C# Code
                    </h3>
                    <textarea id="originalCode" aria-label="Originaler C# Code" placeholder="Füge hier deinen originalen C# Code ein..."></textarea>
                </div>

                <div class="section">
                    <h3>
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
                        </svg>
                        String-Replace
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        ...existing content...
                    </div>
                    <div class="info-box">...</div>
                </div>
            </div>
```

- [ ] **Step 2: Wrap the two sections in the SQL tab**

Identify the two SQL sections in `obfuscator.html` (starting around line 150):

```html
            <div class="section">
                ...Originaler MS SQL Code...
            </div>

            <div class="section">
                ...SQL String-Replace...
            </div>
```

Wrap them identically:
```html
            <div class="code-row">
                <div class="section">
                    <h3>
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z" />
                        </svg>
                        Originaler MS SQL Code
                    </h3>
                    <textarea id="sqlOriginalCode" aria-label="Originaler MS SQL Code" placeholder="Füge hier deine originalen SQL Queries ein..."></textarea>
                </div>

                <div class="section">
                    <h3>
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
                        </svg>
                        SQL String-Replace (vor Analyse)
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        ...existing content...
                    </div>
                    <div class="info-box">...</div>
                </div>
            </div>
```

- [ ] **Step 3: Add .code-row CSS**

Append to `obfuscator.css`:
```css
.code-row {
    display: grid;
    grid-template-columns: 65fr 35fr;
    gap: 20px;
    align-items: start;
    margin-bottom: 30px;
}

.code-row > .section {
    margin-bottom: 0;
}
```

- [ ] **Step 4: Visual check in browser**

Open both tabs. Verify:
- Original Code section occupies roughly 65% of the width on the left
- String-Replace section occupies roughly 35% on the right
- Both tabs look identical
- Everything below the grid (button-group, analysis sections) still runs full width

- [ ] **Step 5: Commit**

```bash
git add obfuscator.html obfuscator.css
git commit -m "feat: 65/35 side-by-side grid for code and replace sections"
```

---

## Task 3: Chip Input HTML + CSS (replace 3-textarea sets)

**Files:**
- Modify: `obfuscator.html` — C# String-Replace section and SQL String-Replace section
- Modify: `obfuscator.css`

**Interfaces:**
- Produces:
  - `#stringReplaceInput` — `<input>` for C# chip entry
  - `#stringReplaceChips` — `<div>` chip container for C#
  - `#sqlStringReplaceInput` — `<input>` for SQL chip entry
  - `#sqlStringReplaceChips` — `<div>` chip container for SQL
  - CSS classes: `.chip-input-wrapper`, `.chip-input-field`, `.chip-container`, `.chip`, `.chip-remove`

- [ ] **Step 1: Replace C# String-Replace section content**

Inside the `.code-row` for C#, find the second `.section` (String-Replace). Replace its entire inner body (everything after the closing `</h3>`) with the chip widget:

The section should now look like this in full:
```html
                <div class="section">
                    <h3>
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
                        </svg>
                        String-Replace
                    </h3>
                    <div class="chip-input-wrapper">
                        <input type="text" id="stringReplaceInput" placeholder="Wort eingeben und Enter drücken…" class="chip-input-field" aria-label="String-Replace Wort hinzufügen">
                        <div id="stringReplaceChips" class="chip-container" aria-label="String-Replace Wörter" aria-live="polite"></div>
                    </div>
                </div>
```

- [ ] **Step 2: Replace SQL String-Replace section content**

Inside the `.code-row` for SQL, find the second `.section` (SQL String-Replace). Same replacement:

```html
                <div class="section">
                    <h3>
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
                        </svg>
                        SQL String-Replace (vor Analyse)
                    </h3>
                    <div class="chip-input-wrapper">
                        <input type="text" id="sqlStringReplaceInput" placeholder="Wort eingeben und Enter drücken…" class="chip-input-field" aria-label="SQL String-Replace Wort hinzufügen">
                        <div id="sqlStringReplaceChips" class="chip-container" aria-label="SQL String-Replace Wörter" aria-live="polite"></div>
                    </div>
                </div>
```

- [ ] **Step 3: Add chip CSS**

Append to `obfuscator.css`:
```css
.chip-input-wrapper {
    display: flex;
    flex-direction: column;
}

.chip-input-field {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #2d2d2d;
    border-radius: 8px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    background: #0f0f0f;
    color: #e0e0e0;
    transition: border-color 0.3s ease;
}

.chip-input-field:focus {
    outline: none;
    border-color: #0d7bc2;
}

.chip-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
    min-height: 40px;
}

.chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(13, 123, 194, 0.2);
    border: 1px solid rgba(13, 123, 194, 0.4);
    border-radius: 20px;
    color: #e0e0e0;
    font-size: 13px;
    font-family: 'Consolas', 'Monaco', monospace;
}

.chip-remove {
    background: none;
    border: none;
    color: #a0a0a0;
    cursor: pointer;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    text-transform: none;
    letter-spacing: 0;
    font-weight: normal;
}

.chip-remove:hover {
    color: #f87171;
    box-shadow: none;
}
```

- [ ] **Step 4: Visual check in browser**

Open both tabs. Verify:
- The three textarea sets are gone
- A single text input and an (empty) chip area appear in the String-Replace panel
- Input field styling matches the dark theme
- No JS errors in the browser console (the input does nothing yet — that's expected)

- [ ] **Step 5: Commit**

```bash
git add obfuscator.html obfuscator.css
git commit -m "feat: replace 3-textarea string-replace sets with chip input widget"
```

---

## Task 4: Chip Input JS + State Migration

**Files:**
- Modify: `obfuscator.js`

**Interfaces:**
- Consumes: `#stringReplaceInput`, `#stringReplaceChips`, `#sqlStringReplaceInput`, `#sqlStringReplaceChips` (from Task 3)
- Produces:
  - `csharpReplaceWords: string[]` — module-level state array
  - `sqlReplaceWords: string[]` — module-level state array
  - `addChip(word, arr, containerId)` — adds word to array + renders chip
  - `clearChips(arr, containerId)` — empties array + clears container DOM
  - `getReplaceWords(prefix)` returns `string[]` from the right array

- [ ] **Step 1: Replace the module-level `getReplaceWords` function and add chip state arrays**

At the top of `obfuscator.js`, after line 21 (`let currentTab = 'csharp';`), add the two new state arrays:

```js
let csharpReplaceWords = [];
let sqlReplaceWords = [];
```

Replace the existing `getReplaceWords` function (lines 59–68):

```js
function getReplaceWords(prefix) {
    return prefix === 'stringReplace' ? [...csharpReplaceWords] : [...sqlReplaceWords];
}
```

- [ ] **Step 2: Add chip helper functions**

Insert these three functions right after `getReplaceWords`:

```js
function renderChip(word, arr, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.word = word;
    const label = document.createElement('span');
    label.textContent = word;
    const btn = document.createElement('button');
    btn.className = 'chip-remove';
    btn.type = 'button';
    btn.setAttribute('aria-label', word + ' entfernen');
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
        const idx = arr.indexOf(word);
        if (idx !== -1) arr.splice(idx, 1);
        chip.remove();
        scheduleSave();
    });
    chip.appendChild(label);
    chip.appendChild(btn);
    container.appendChild(chip);
}

function addChip(word, arr, containerId) {
    const trimmed = word.trim();
    if (!trimmed || arr.includes(trimmed)) return;
    arr.push(trimmed);
    renderChip(trimmed, arr, containerId);
    scheduleSave();
}

function clearChips(arr, containerId) {
    arr.length = 0;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
}
```

- [ ] **Step 3: Update `saveState` — replace textarea values with arrays**

In `saveState()`, inside the `csharp` block, replace:
```js
            stringReplace1: document.getElementById('stringReplace1').value,
            stringReplace2: document.getElementById('stringReplace2').value,
            stringReplace3: document.getElementById('stringReplace3').value,
```
with:
```js
            stringReplaceWords: [...csharpReplaceWords],
```

Inside the `sql` block, replace:
```js
            sqlStringReplace1: document.getElementById('sqlStringReplace1').value,
            sqlStringReplace2: document.getElementById('sqlStringReplace2').value,
            sqlStringReplace3: document.getElementById('sqlStringReplace3').value,
```
with:
```js
            sqlStringReplaceWords: [...sqlReplaceWords],
```

- [ ] **Step 4: Update `loadState` — restore chips from new + old formats**

In `loadState()`, inside the `if (state.csharp)` block, replace:
```js
            document.getElementById('stringReplace1').value = cs.stringReplace1 || '';
            document.getElementById('stringReplace2').value = cs.stringReplace2 || '';
            document.getElementById('stringReplace3').value = cs.stringReplace3 || '';
```
with:
```js
            clearChips(csharpReplaceWords, 'stringReplaceChips');
            if (Array.isArray(cs.stringReplaceWords)) {
                cs.stringReplaceWords.forEach(w => addChip(w, csharpReplaceWords, 'stringReplaceChips'));
            } else {
                // backward compat: old format had stringReplace1/2/3 as multiline strings
                const seen = new Set();
                ['stringReplace1', 'stringReplace2', 'stringReplace3'].forEach(key => {
                    if (cs[key]) {
                        cs[key].split('\n').map(w => w.trim()).filter(Boolean).forEach(w => {
                            if (!seen.has(w)) { seen.add(w); addChip(w, csharpReplaceWords, 'stringReplaceChips'); }
                        });
                    }
                });
            }
```

Inside the `if (state.sql)` block, replace:
```js
            document.getElementById('sqlStringReplace1').value = sq.sqlStringReplace1 || '';
            document.getElementById('sqlStringReplace2').value = sq.sqlStringReplace2 || '';
            document.getElementById('sqlStringReplace3').value = sq.sqlStringReplace3 || '';
```
with:
```js
            clearChips(sqlReplaceWords, 'sqlStringReplaceChips');
            if (Array.isArray(sq.sqlStringReplaceWords)) {
                sq.sqlStringReplaceWords.forEach(w => addChip(w, sqlReplaceWords, 'sqlStringReplaceChips'));
            } else {
                const seen = new Set();
                ['sqlStringReplace1', 'sqlStringReplace2', 'sqlStringReplace3'].forEach(key => {
                    if (sq[key]) {
                        sq[key].split('\n').map(w => w.trim()).filter(Boolean).forEach(w => {
                            if (!seen.has(w)) { seen.add(w); addChip(w, sqlReplaceWords, 'sqlStringReplaceChips'); }
                        });
                    }
                });
            }
```

- [ ] **Step 5: Update `clearAll` and `clearSqlAll`**

In `clearAll()`, replace the ID list that includes stringReplace IDs:
```js
    ['originalCode', 'obfuscatedCode', 'aiResponse', 'finalCode',
        'stringReplace1', 'stringReplace2', 'stringReplace3']
        .forEach(id => { document.getElementById(id).value = ''; });
```
with:
```js
    ['originalCode', 'obfuscatedCode', 'aiResponse', 'finalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    clearChips(csharpReplaceWords, 'stringReplaceChips');
    const csInput = document.getElementById('stringReplaceInput');
    if (csInput) csInput.value = '';
```

In `clearSqlAll()`, replace:
```js
    ['sqlOriginalCode', 'sqlObfuscatedCode', 'sqlAiResponse', 'sqlFinalCode',
        'sqlStringReplace1', 'sqlStringReplace2', 'sqlStringReplace3']
        .forEach(id => { document.getElementById(id).value = ''; });
```
with:
```js
    ['sqlOriginalCode', 'sqlObfuscatedCode', 'sqlAiResponse', 'sqlFinalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    clearChips(sqlReplaceWords, 'sqlStringReplaceChips');
    const sqlInput = document.getElementById('sqlStringReplaceInput');
    if (sqlInput) sqlInput.value = '';
```

- [ ] **Step 6: Wire up chip inputs in DOMContentLoaded**

In the `DOMContentLoaded` handler:

Remove `stringReplace1`, `stringReplace2`, `stringReplace3`, `sqlStringReplace1`, `sqlStringReplace2`, `sqlStringReplace3` from the `watchedInputs` array. The array should become:
```js
    const watchedInputs = [
        'originalCode', 'obfuscatedCode', 'aiResponse', 'finalCode',
        'sqlOriginalCode', 'sqlObfuscatedCode', 'sqlAiResponse', 'sqlFinalCode'
    ];
```

After the `watchedInputs.forEach(...)` block, add the chip input keydown listeners:
```js
    const csharpChipInput = document.getElementById('stringReplaceInput');
    if (csharpChipInput) {
        csharpChipInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                addChip(csharpChipInput.value, csharpReplaceWords, 'stringReplaceChips');
                csharpChipInput.value = '';
            }
        });
    }

    const sqlChipInput = document.getElementById('sqlStringReplaceInput');
    if (sqlChipInput) {
        sqlChipInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                addChip(sqlChipInput.value, sqlReplaceWords, 'sqlStringReplaceChips');
                sqlChipInput.value = '';
            }
        });
    }
```

- [ ] **Step 7: Full functional test in browser**

Open `obfuscator.html`. Test this sequence:

1. C# tab → type "Datenbank" in the chip input → press Enter → chip "Datenbank" appears
2. Type "UserName" → Enter → second chip appears
3. Type "Datenbank" → Enter → **no duplicate** added
4. Click ✕ on "Datenbank" → chip disappears
5. Paste C# code in the code box → click "Code Analysieren" → "UserName" should appear in the mapping table as a String entry
6. SQL tab → repeat steps 1–5 with SQL-specific words
7. Reload the page → chips are still present (restored from localStorage)
8. Click "Alles Löschen" → chips cleared, input empty
9. Export → open the downloaded JSON → `csharp.stringReplaceWords` is an array, no `stringReplace1/2/3` keys

- [ ] **Step 8: Commit**

```bash
git add obfuscator.js
git commit -m "feat: chip/tag input for string-replace words with localStorage migration"
```

---

## Self-Review Notes

- **Spec coverage:** All four spec sections covered — header row (Task 1), 65/35 grid (Task 2), chip HTML (Task 3), chip JS + export/import format (Task 4).
- **Backward compat import:** Handled in Task 4 Step 4 for both tabs.
- **No placeholder steps:** Every step has exact code or exact browser-check instructions.
- **Type consistency:** `addChip(word, arr, containerId)` signature is consistent across Task 4 Steps 2, 4, 5, 6. `clearChips(arr, containerId)` consistent across Steps 2, 5, 6.
- **`chip-remove` button overrides:** `.chip-remove` explicitly resets `text-transform`, `letter-spacing`, `font-weight` to cancel the global `button` rule — included in Task 3 Step 3.
