# Auswahl-Komfort in den Mapping-Tabellen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Auswahltabellen für C# und SQL bekommen einen Button, der die Auswahl exklusiv auf die String-Replace-Zeilen setzt, sowie eine Shift-Bereichsauswahl über die sichtbaren Zeilen.

**Architecture:** Beide Tabellen werden von einem gemeinsamen Renderer (`renderSelectionTable`) aufgebaut und über einen Präfix (`csharp` / `sql`) unterschieden. Beide neuen Funktionen werden deshalb einmal implementiert und über denselben Präfix parametrisiert. Die Zeilen aus dem String-Replace sind bereits durch `data-type="String"` markiert; es entsteht kein neues Datenfeld. Die Klick-Logik der Shift-Auswahl liegt in einer eigenen Funktion (`handleSelectionClick`), der Event-Listener ist nur ein dünner Adapter darüber — dadurch bleibt sie in jsdom testbar, wo `DOMContentLoaded` bereits gelaufen ist und die Delegation nicht installiert wird.

**Tech Stack:** Vanilla JavaScript (ES2020, kein Build-Schritt), CSS ohne Framework, Tests in Node mit jsdom (`test/integration.test.js`, `test/smoke.test.js`) und Playwright/Chromium (`test/layout.test.js`).

**Spec:** `docs/superpowers/specs/2026-08-20-auswahl-komfort-design.md`

## Global Constraints

- **Kein Inline-JavaScript.** Buttons werden ausschließlich über `data-action` und die zentrale Delegation in `obfuscator.js` (`ACTIONS`, ca. Zeile 1249) verdrahtet — das Projekt ist CSP-konform gebaut.
- **Alle Beschriftungen, Statusmeldungen und Kommentare auf Deutsch.** Typografische Anführungszeichen `„…"` in Text.
- **Kein `„` mit geradem `"` schließen** und **kein `--` innerhalb eines XML-/HTML-Kommentars** — ein maschinenweiter Hook blockiert sonst den Schreibvorgang.
- **Zugriff aus Tests ausschließlich über `window.ObfuscatorUI`** (Befund W6). Neue Funktionen, die Tests brauchen, müssen dort exportiert werden.
- **Farbschema (ConvertMaster-Hausstandard):** dunkles Marine, Text `#e0e0e0`, gedämpft `#9090a0`. Der Bestand nutzt in `obfuscator.css` bereits konkrete Werte — neue Regeln fügen sich dort ein, statt eigene Farben zu erfinden.
- **Gate vor jedem Commit:** `npm test` (5 Suiten) und `npm run lint` (`--max-warnings 0`) müssen fehlerfrei durchlaufen.
- **Bereits verifiziertes Verhalten (nicht erneut in Frage stellen):** jsdom schaltet eine Checkbox **vor** dem `click`-Listener um und feuert `change` **danach**. Ein Shift-Klick-Handler sieht die angeklickte Box also bereits im neuen Zustand, den Anker dagegen unverändert.

---

## Dateiübersicht

| Datei | Verantwortung | Änderung |
|---|---|---|
| `obfuscator.js` | Gesamte DOM-Schicht: Auswahltabellen, Filter, Zähler, Persistenz, Event-Delegation | Neue Auswahl-Helfer bei den übrigen Auswahl-Helfern (nach `initMappingFilter`, ca. Zeile 604); Eintrag in `ACTIONS`; Exporte in `window.ObfuscatorUI`; zwei Listener im `DOMContentLoaded`-Block |
| `obfuscator.html` | Statische Struktur beider Tabs | Je ein Button in den beiden `mapping-filter-row`-Blöcken (C# ca. Zeile 111, SQL ca. Zeile 249) |
| `obfuscator.css` | Gesamtes Styling | Kompakte Buttons in der Filterzeile; Darstellung deaktivierter Buttons (existiert noch nicht) |
| `test/integration.test.js` | jsdom-Tests der DOM-Schicht gegen ein reduziertes `HIDDEN_DOM` | Zwei Buttons ins `HIDDEN_DOM`; zwei neue Testblöcke |
| `test/smoke.test.js` | End-to-End gegen die echte `obfuscator.html` inklusive Event-Delegation | Ein neuer Abschnitt „2c" |
| `README.md` | Funktionsbeschreibung | Neuer Unterabschnitt „Auswahl-Tabelle" |

---

## Task 1: Button „Nur String-Replace"

**Files:**
- Modify: `obfuscator.js` (Helfer nach `initMappingFilter`, ca. Zeile 604; `ACTIONS` ca. Zeile 1249; Export-Objekt ca. Zeile 1214)
- Modify: `obfuscator.html:111` (C#-Filterzeile) und `obfuscator.html:249` (SQL-Filterzeile)
- Modify: `obfuscator.css` (nach dem `.mapping-filter-row select`-Block, ca. Zeile 553)
- Test: `test/integration.test.js` (`HIDDEN_DOM` ca. Zeile 27 und 45; neuer Testblock)
- Test: `test/smoke.test.js:61` (neuer Abschnitt „2c")

**Interfaces:**
- Consumes: vorhandene Modulfunktionen `allCheckboxes(selector)`, `syncSelectAll(selectAllId, selector)`, `updateSelectionCounter(counterId, selector)`, `scheduleSave()`, `showStatus(msg, type)`, `showSqlStatus(msg, type)`, `initMappingFilter(prefix)` — alle bereits in `obfuscator.js` vorhanden.
- Produces:
  - `selectStringReplaceOnly(prefix: 'csharp'|'sql'): void` — setzt die Auswahl exklusiv; No-op ohne String-Replace-Zeilen. Exportiert als `UI.selectStringReplaceOnly`.
  - `updateStringReplaceButton(prefix: 'csharp'|'sql'): void` — setzt `disabled` am Button `${prefix}SelectStringOnly`.
  - `STRING_REPLACE_TYPE = 'String'` — Modulkonstante, wird in Task 2 nicht gebraucht.
  - DOM-IDs `csharpSelectStringOnly` und `sqlSelectStringOnly`.

- [ ] **Step 1: Buttons ins Test-DOM aufnehmen**

In `test/integration.test.js` im Block `HIDDEN_DOM` jeweils direkt **nach** der Zeile mit dem Filter-Select einfügen.

Nach `<select id="csharpFilterType"><option value=""></option></select>`:

```html
  <button id="csharpSelectStringOnly" data-action="selectStringReplaceOnly" data-prefix="csharp"></button>
```

Nach `<select id="sqlFilterType"><option value=""></option></select>`:

```html
  <button id="sqlSelectStringOnly" data-action="selectStringReplaceOnly" data-prefix="sql"></button>
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

In `test/integration.test.js` **vor** die Zeile `importTestDone.then(() => {` am Dateiende (ca. Zeile 783) einfügen — dort steht die Ergebnisausgabe mit `process.exit`:

```js
console.log('\n# Auswahl-Komfort – Button „Nur String-Replace"');
(() => {
    const CODE = 'public class CustomerService { public void GetOrder(int orderId) { } }';
    const boxOf = name => Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'))
        .find(cb => cb.dataset.original === name);
    const analyzeWithChip = () => {
        resetCsharp();
        setVal('csharpFilterInput', '');
        setVal('originalCode', CODE);
        UI.addChip('CustomerService', UI._state.csharpReplaceWords, 'stringReplaceChips');
        UI.analyzeCode();
    };

    analyzeWithChip();
    it('Button ist aktiv, solange String-Replace-Zeilen existieren', () =>
        assert(!$('csharpSelectStringOnly').disabled));

    UI.selectStringReplaceOnly('csharp');
    it('String-Replace-Zeile ist angehakt', () => assert(boxOf('CustomerService').checked));
    it('automatisch erkannte Zeilen sind abgewählt', () =>
        assert(!boxOf('GetOrder').checked && !boxOf('orderId').checked));
    it('Zähler zeigt die neue Auswahl', () =>
        eq($('csharpSelectionCounter').textContent, '1 von 3 ausgewählt'));
    it('Kopf-Checkbox steht auf teilweise ausgewählt', () =>
        assert(!$('csharpSelectAll').checked && $('csharpSelectAll').indeterminate));

    // Bei aktivem Filter wirkt der Button trotzdem auf die ganze Tabelle.
    analyzeWithChip();
    setVal('csharpFilterInput', 'Order');
    UI.applyMappingFilter('csharpFilterInput', 'csharpFilterType', '.csharp-mapping-checkbox');
    UI.selectStringReplaceOnly('csharp');
    it('ausgefilterte String-Replace-Zeile wird trotzdem angehakt', () =>
        assert(boxOf('CustomerService').checked, 'CustomerService blieb abgewählt'));
    it('sichtbare Auto-Zeilen werden abgewählt', () =>
        assert(!boxOf('GetOrder').checked && !boxOf('orderId').checked));
    setVal('csharpFilterInput', '');
    UI.applyMappingFilter('csharpFilterInput', 'csharpFilterType', '.csharp-mapping-checkbox');

    // Ohne String-Replace-Zeilen würde der Button die Auswahl leeren – deshalb gesperrt.
    resetCsharp();
    setVal('csharpFilterInput', '');
    setVal('originalCode', CODE);
    UI.analyzeCode();
    it('Button ist ohne String-Replace-Zeilen deaktiviert', () =>
        assert($('csharpSelectStringOnly').disabled));
    UI.selectStringReplaceOnly('csharp');
    it('Aufruf ohne String-Replace-Zeilen ändert die Auswahl nicht', () =>
        assert(Array.from(doc.querySelectorAll('.csharp-mapping-checkbox')).every(cb => cb.checked)));

    // Derselbe Code trägt die SQL-Tabelle.
    resetSql();
    setVal('sqlFilterInput', '');
    setVal('sqlOriginalCode', 'SELECT UserName FROM Users');
    UI.addChip('Users', UI._state.sqlReplaceWords, 'sqlStringReplaceChips');
    UI.analyzeSqlCode();
    UI.selectStringReplaceOnly('sql');
    it('SQL: String-Replace-Zeilen an, SQL-Elemente ab', () => {
        const all = Array.from(doc.querySelectorAll('.sql-mapping-checkbox'));
        const str = all.filter(cb => cb.dataset.type === 'String');
        const other = all.filter(cb => cb.dataset.type !== 'String');
        assert(str.length > 0 && other.length > 0 &&
            str.every(cb => cb.checked) && other.every(cb => !cb.checked),
            all.map(cb => `${cb.dataset.type}=${cb.checked}`).join(', '));
    });
})();
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `node test/integration.test.js`
Expected: FAIL — mehrere `✗`, darunter `UI.selectStringReplaceOnly is not a function`.

- [ ] **Step 4: Die Auswahl-Logik implementieren**

In `obfuscator.js` direkt **nach** der Funktion `initMappingFilter` (ca. Zeile 604) einfügen:

```js
// Zeilen aus dem String-Replace tragen als einzige den Typ „String": die
// automatische Erkennung vergibt ausschließlich deutsche Labels aus
// CS_TYPE_LABEL (Klasse, Methode, …) bzw. SQL_TYPE_LABEL (Tabelle, Feld, …).
const STRING_REPLACE_TYPE = 'String';

function stringReplaceCheckboxes(checkboxSelector) {
    return allCheckboxes(checkboxSelector).filter(cb => cb.dataset.type === STRING_REPLACE_TYPE);
}

// Setzt die Auswahl exklusiv auf die String-Replace-Zeilen. Bewusst über die
// gesamte Tabelle statt nur über die sichtbaren Zeilen: „nur String-Replace"
// wäre bei aktivem Filter sonst unvollständig. Die Statusmeldung ist deshalb
// nötig – der Großteil der Wirkung liegt dann außerhalb des Sichtfelds.
function selectStringReplaceOnly(prefix) {
    const checkboxSelector = `.${prefix}-mapping-checkbox`;
    const all = allCheckboxes(checkboxSelector);
    const selected = stringReplaceCheckboxes(checkboxSelector).length;
    // Ohne String-Replace-Zeilen würde der Klick die komplette Auswahl leeren.
    if (selected === 0) return;
    all.forEach(cb => { cb.checked = cb.dataset.type === STRING_REPLACE_TYPE; });
    syncSelectAll(`${prefix}SelectAll`, checkboxSelector);
    updateSelectionCounter(`${prefix}SelectionCounter`, checkboxSelector);
    scheduleSave();
    const statusFn = prefix === 'sql' ? showSqlStatus : showStatus;
    statusFn(`${selected} String-Replace-Elemente ausgewählt, ${all.length - selected} abgewählt.`);
}

function updateStringReplaceButton(prefix) {
    const btn = document.getElementById(`${prefix}SelectStringOnly`);
    if (!btn) return;
    btn.disabled = stringReplaceCheckboxes(`.${prefix}-mapping-checkbox`).length === 0;
}
```

- [ ] **Step 5: Button-Zustand beim Tabellenaufbau setzen**

In `obfuscator.js` in `initMappingFilter` (ca. Zeile 599) die letzte Zeile ergänzen. Vorher:

```js
function initMappingFilter(prefix) {
    const checkboxSelector = `.${prefix}-mapping-checkbox`;
    populateFilterTypes(`${prefix}FilterType`, checkboxSelector);
    applyMappingFilter(`${prefix}FilterInput`, `${prefix}FilterType`, checkboxSelector);
    updateSelectionCounter(`${prefix}SelectionCounter`, checkboxSelector);
}
```

Nachher:

```js
function initMappingFilter(prefix) {
    const checkboxSelector = `.${prefix}-mapping-checkbox`;
    populateFilterTypes(`${prefix}FilterType`, checkboxSelector);
    applyMappingFilter(`${prefix}FilterInput`, `${prefix}FilterType`, checkboxSelector);
    updateSelectionCounter(`${prefix}SelectionCounter`, checkboxSelector);
    updateStringReplaceButton(prefix);
}
```

- [ ] **Step 6: Export für die Tests ergänzen**

In `obfuscator.js` im Objekt `window.ObfuscatorUI` (ca. Zeile 1214) die Zeile der Auswahltabellen-Helfer erweitern. Vorher:

```js
    addChip, applyMappingFilter, updateSelectionCounter,
```

Nachher:

```js
    addChip, applyMappingFilter, updateSelectionCounter, selectStringReplaceOnly,
```

- [ ] **Step 7: Test laufen lassen, Erfolg bestätigen**

Run: `node test/integration.test.js`
Expected: PASS — der neue Block zeigt ausschließlich `✓`, die Gesamtzahl der Fehlschläge ist 0.

- [ ] **Step 8: Buttons in die echte Seite einbauen**

In `obfuscator.html` in der C#-Filterzeile (ca. Zeile 111) **nach** dem `</select>` von `csharpFilterType` einfügen:

```html
                    <button type="button" class="btn-secondary" id="csharpSelectStringOnly" data-action="selectStringReplaceOnly" data-prefix="csharp" title="Wählt genau die Elemente aus, die über String-Replace in die Liste gekommen sind">Nur String-Replace</button>
```

In der SQL-Filterzeile (ca. Zeile 251) **nach** dem `</select>` von `sqlFilterType` einfügen:

```html
                    <button type="button" class="btn-secondary" id="sqlSelectStringOnly" data-action="selectStringReplaceOnly" data-prefix="sql" title="Wählt genau die Elemente aus, die über String-Replace in die Liste gekommen sind">Nur String-Replace</button>
```

- [ ] **Step 9: Aktion verdrahten**

In `obfuscator.js` im Objekt `ACTIONS` (ca. Zeile 1249) nach der Zeile mit `analyzeSqlCode, clearSqlAll, …` ergänzen:

```js
    selectStringReplaceOnly: el => selectStringReplaceOnly(el.dataset.prefix),
```

- [ ] **Step 10: Styling ergänzen**

In `obfuscator.css` direkt **nach** dem Block `.mapping-filter-row select { … }` (endet ca. Zeile 553) einfügen:

```css
/* Die Filterzeile ist eine Werkzeugleiste, keine Aktionsleiste – der Button
   ordnet sich der Höhe von Eingabefeld und Auswahlliste unter. */
.mapping-filter-row button {
    padding: 8px 14px;
    font-size: 13px;
    letter-spacing: 0.5px;
    white-space: nowrap;
}

button:disabled,
button:disabled:hover {
    border-color: #3a3a4a;
    box-shadow: 0 0 40px 40px #3a3a4a inset, 0 0 0 0 #3a3a4a;
    color: #9090a0;
    cursor: not-allowed;
}
```

- [ ] **Step 11: End-to-End-Test gegen die echte Seite schreiben**

In `test/smoke.test.js` **nach** Zeile 61 (dem Kommentar `// Auswahl für den nächsten Schritt wiederherstellen`) und **vor** dem Abschnitt `// 3) Verschleiern via data-action` einfügen:

```js
        // 2c) Button „Nur String-Replace" über die echte data-action-Delegation
        const stringOnlyBtn = doc.getElementById('csharpSelectStringOnly');
        it('Button „Nur String-Replace" ist im Dokument', !!stringOnlyBtn);
        click(stringOnlyBtn);
        const afterBtn = Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'));
        it('Klick wählt genau die String-Replace-Zeilen aus',
            afterBtn.some(cb => cb.dataset.type === 'String') &&
            afterBtn.every(cb => cb.checked === (cb.dataset.type === 'String')),
            afterBtn.map(cb => `${cb.dataset.type}=${cb.checked}`).join(', '));

        // Auswahl für den nächsten Schritt wiederherstellen
        afterBtn.forEach(cb => { cb.checked = true; cb.dispatchEvent(new win.Event('change', { bubbles: true })); });
```

- [ ] **Step 12: Volles Gate laufen lassen**

Run: `npm test && npm run lint`
Expected: PASS — alle 5 Suiten melden `0 fehlgeschlagen`, ESLint gibt keine Ausgabe. Insbesondere `test/layout.test.js` muss weiterhin „kein horizontales Scrollen bei 390px Breite" bestätigen; die Filterzeile hat `flex-wrap: wrap` und bricht den Button um.

- [ ] **Step 13: Commit**

```bash
git add obfuscator.js obfuscator.html obfuscator.css test/integration.test.js test/smoke.test.js
git commit -F - <<'EOF'
feat: Button „Nur String-Replace" in beiden Auswahltabellen

Setzt die Auswahl exklusiv auf die Zeilen, die über das String-Replace in
die Liste gekommen sind (data-type="String") – über die ganze Tabelle, auch
über ausgefilterte Zeilen, damit die Menge bei aktivem Filter vollständig
bleibt. Ohne String-Replace-Zeilen ist der Button gesperrt, sonst würde er
die komplette Auswahl leeren.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: Shift-Bereichsauswahl

**Files:**
- Modify: `obfuscator.js` (Helfer nach `updateStringReplaceButton` aus Task 1; Export-Objekt; `DOMContentLoaded`-Block ca. Zeile 1363)
- Test: `test/integration.test.js` (neuer Testblock)
- Test: `test/smoke.test.js` (Erweiterung des Abschnitts „2c" aus Task 1)

**Interfaces:**
- Consumes: `visibleCheckboxes(selector)`, `syncSelectAll(selectAllId, selector)`, `updateSelectionCounter(counterId, selector)`, `scheduleSave()` — vorhanden in `obfuscator.js`.
- Produces:
  - `handleSelectionClick(prefix: 'csharp'|'sql', checkbox: HTMLInputElement, shiftKey: boolean): void` — Kern der Klick-Logik, exportiert als `UI.handleSelectionClick`. Der Event-Listener ist nur ein Adapter darüber.
  - `applyRangeSelection(prefix, target): boolean` — modulintern, `true` wenn eine Spanne übertragen wurde.
  - `rangeAnchors` — modulinternes Objekt `{ csharp: null, sql: null }`.

**Warum eine eigene Funktion statt reiner Listener-Tests:** In `test/integration.test.js` ist `DOMContentLoaded` bereits gelaufen, bevor `obfuscator.js` per `eval` geladen wird — der `DOMContentLoaded`-Block und damit die gesamte Delegation läuft dort **nie**. Die Breitentests rufen deshalb `UI.handleSelectionClick` direkt auf und schalten die angeklickte Box vorher selbst um (genau das tut der Browser vor dem `click`-Listener). Dass Listener, `shiftKey` und `preventDefault` real zusammenspielen, deckt `test/smoke.test.js` gegen die echte Seite ab.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `test/integration.test.js` **nach** dem Block aus Task 1 einfügen:

```js
console.log('\n# Auswahl-Komfort – Shift-Bereichsauswahl');
(() => {
    const CODE = 'public class Alpha { public void Beta(int gamma, int delta, int epsilon) { } }';
    const prepare = () => {
        resetCsharp();
        setVal('csharpFilterInput', '');
        setVal('originalCode', CODE);
        UI.analyzeCode();
        return Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'));
    };
    // Der Browser schaltet die angeklickte Box um, bevor der click-Listener
    // läuft (in jsdom nachgemessen). Genau diese Reihenfolge wird hier
    // nachgestellt, damit der Test dieselbe Ausgangslage hat wie die Seite.
    const clickBox = (cb, shift) => {
        cb.checked = !cb.checked;
        UI.handleSelectionClick('csharp', cb, !!shift);
    };

    let boxes = prepare();
    it('Testcode liefert mindestens 5 Zeilen', () => assert(boxes.length >= 5, `${boxes.length} Zeilen`));

    // Vorwärts abwählen: Anker oben, Shift-Klick unten.
    boxes.forEach(cb => { cb.checked = true; });
    clickBox(boxes[1]);                       // hakt ab, setzt den Anker
    clickBox(boxes[3], true);
    it('Spanne vorwärts wird abgehakt', () =>
        assert(!boxes[1].checked && !boxes[2].checked && !boxes[3].checked,
            boxes.map(cb => cb.checked).join(', ')));
    it('Zeilen außerhalb der Spanne bleiben unberührt', () =>
        assert(boxes[0].checked && boxes[4].checked));

    // Rückwärts anhaken: Anker unten, Shift-Klick oben.
    boxes = prepare();
    boxes.forEach(cb => { cb.checked = false; });
    clickBox(boxes[4]);                       // hakt an, setzt den Anker
    clickBox(boxes[2], true);
    it('Spanne rückwärts wird angehakt', () =>
        assert(boxes[2].checked && boxes[3].checked && boxes[4].checked,
            boxes.map(cb => cb.checked).join(', ')));
    it('Zeilen oberhalb der Spanne bleiben abgewählt', () =>
        assert(!boxes[0].checked && !boxes[1].checked));

    // Der Zustand des Ankers gewinnt, nicht der der zweiten Box.
    boxes = prepare();
    boxes.forEach(cb => { cb.checked = true; });
    clickBox(boxes[0]);                       // Anker steht damit auf „aus"
    clickBox(boxes[2], true);                 // zweite Box war angehakt
    it('zweite Box übernimmt den Zustand des Ankers', () =>
        assert(!boxes[2].checked, 'zweite Box behielt ihren eigenen Zustand'));

    // Ausgefilterte Zeilen liegen nicht in der Spanne. Die Klasse wird direkt
    // gesetzt: ein Textfilter kann nicht genau eine Zeile mitten aus der
    // Spanne ausblenden, und `filtered-out` ist genau das, was
    // applyMappingFilter setzt.
    boxes = prepare();
    boxes.forEach(cb => { cb.checked = true; });
    boxes[2].closest('tr').classList.add('filtered-out');
    clickBox(boxes[1]);
    clickBox(boxes[3], true);
    it('ausgefilterte Zeile mitten in der Spanne bleibt unverändert', () =>
        assert(boxes[2].checked, 'ausgefilterte Zeile wurde mitgezogen'));
    it('sichtbare Zeilen der Spanne wurden abgehakt', () =>
        assert(!boxes[1].checked && !boxes[3].checked));
    boxes[2].closest('tr').classList.remove('filtered-out');

    // Ohne gültigen Anker verhält sich Shift wie ein gewöhnlicher Klick.
    boxes = prepare();
    boxes.forEach(cb => { cb.checked = true; });
    clickBox(boxes[3], true);                 // frisch gerenderte Tabelle: kein Anker
    it('Shift ohne Anker wirkt wie ein gewöhnlicher Klick', () =>
        assert(!boxes[3].checked && boxes[0].checked && boxes[4].checked,
            boxes.map(cb => cb.checked).join(', ')));
    clickBox(boxes[1], true);                 // nun ist boxes[3] der Anker
    it('der Shift-Klick ohne Anker setzt den neuen Anker', () =>
        assert(!boxes[1].checked && !boxes[2].checked,
            boxes.map(cb => cb.checked).join(', ')));

    // Zähler und Kopf-Checkbox werden nachgezogen.
    boxes = prepare();
    boxes.forEach(cb => { cb.checked = true; });
    clickBox(boxes[0]);
    clickBox(boxes[boxes.length - 1], true);
    it('Zähler zeigt nach der Bereichsauswahl 0 ausgewählt', () =>
        eq($('csharpSelectionCounter').textContent, `0 von ${boxes.length} ausgewählt`));
    it('Kopf-Checkbox ist danach abgehakt', () =>
        assert(!$('csharpSelectAll').checked && !$('csharpSelectAll').indeterminate));
})();
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node test/integration.test.js`
Expected: FAIL — der neue Block schlägt fehl mit `UI.handleSelectionClick is not a function`.

- [ ] **Step 3: Die Bereichslogik implementieren**

In `obfuscator.js` direkt **nach** der in Task 1 ergänzten Funktion `updateStringReplaceButton` einfügen:

```js
// Anker der Shift-Bereichsauswahl, je Tabelle getrennt. Gespeichert wird die
// Checkbox selbst, nicht ihr Index: eine zwischenzeitliche Filteränderung
// würde sonst alle Indizes verschieben und den Anker still verfälschen.
const rangeAnchors = { csharp: null, sql: null };

// Überträgt den Zustand des Ankers auf die Spanne zwischen Anker und
// angeklickter Zeile, die angeklickte eingeschlossen. Der erste Klick legt
// damit die Richtung fest (an oder aus). Ausgefilterte Zeilen stehen nicht in
// `visible` und bleiben unverändert – dieselbe Regel wie bei der
// Kopf-Checkbox (U13). Rückgabe: true, wenn eine Spanne übertragen wurde.
function applyRangeSelection(prefix, target) {
    const checkboxSelector = `.${prefix}-mapping-checkbox`;
    const visible = visibleCheckboxes(checkboxSelector);
    const from = visible.indexOf(rangeAnchors[prefix]);
    const to = visible.indexOf(target);
    // Kein Anker, Anker aus einer neu gebauten Tabelle, Anker oder Ziel gerade
    // ausgefiltert, oder beides dieselbe Zeile: keine Spanne.
    if (from === -1 || to === -1 || from === to) return false;
    const state = visible[from].checked;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) visible[i].checked = state;
    syncSelectAll(`${prefix}SelectAll`, checkboxSelector);
    updateSelectionCounter(`${prefix}SelectionCounter`, checkboxSelector);
    scheduleSave();
    return true;
}

// Kern der Klick-Logik, bewusst getrennt vom Event-Listener: der Listener wird
// erst bei DOMContentLoaded installiert, in jsdom-Tests läuft er deshalb nie.
function handleSelectionClick(prefix, checkbox, shiftKey) {
    // Bei erfolgreicher Spanne bleibt der Anker stehen – ein weiterer
    // Shift-Klick spannt dadurch erneut von derselben Zeile aus.
    if (shiftKey && applyRangeSelection(prefix, checkbox)) return;
    rangeAnchors[prefix] = checkbox;
}
```

- [ ] **Step 4: Export ergänzen**

In `obfuscator.js` im Objekt `window.ObfuscatorUI` die in Task 1 geänderte Zeile erneut erweitern. Vorher:

```js
    addChip, applyMappingFilter, updateSelectionCounter, selectStringReplaceOnly,
```

Nachher:

```js
    addChip, applyMappingFilter, updateSelectionCounter, selectStringReplaceOnly,
    handleSelectionClick,
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `node test/integration.test.js`
Expected: PASS — der Block „Shift-Bereichsauswahl" zeigt ausschließlich `✓`, Gesamtzahl der Fehlschläge 0.

- [ ] **Step 6: Listener in der echten Seite verdrahten**

In `obfuscator.js` im `DOMContentLoaded`-Block direkt **nach** dem bestehenden `document.addEventListener('change', …)` (endet ca. Zeile 1363, direkt vor dem schließenden `});` des Blocks) einfügen:

```js
    // Shift-Bereichsauswahl. Der Browser hat die angeklickte Box hier bereits
    // umgeschaltet; handleSelectionClick schreibt den Zustand des Ankers
    // anschließend über die gesamte Spanne.
    document.addEventListener('click', (ev) => {
        const cb = ev.target;
        if (!cb || !cb.matches) return;
        const prefix = cb.matches('.csharp-mapping-checkbox') ? 'csharp'
            : cb.matches('.sql-mapping-checkbox') ? 'sql' : null;
        if (!prefix) return;
        handleSelectionClick(prefix, cb, ev.shiftKey);
    });

    // Ohne das markiert der Shift-Klick den Text zwischen beiden Zeilen. Das
    // Umschalten der Checkbox hängt am click-Event und bleibt unberührt.
    document.addEventListener('mousedown', (ev) => {
        if (!ev.shiftKey || !ev.target || !ev.target.matches) return;
        if (ev.target.matches('.csharp-mapping-checkbox, .sql-mapping-checkbox')) ev.preventDefault();
    });
```

- [ ] **Step 7: End-to-End-Test gegen die echte Seite ergänzen**

In `test/smoke.test.js` im Abschnitt „2c" **nach** der in Task 1 eingefügten Zeile `afterBtn.forEach(cb => { cb.checked = true; …});` einfügen:

```js
        // Shift-Bereichsauswahl über die echte Klick-Delegation
        const boxes = Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'));
        it('Auswahltabelle hat mindestens 3 Zeilen', boxes.length >= 3, `${boxes.length} Zeilen`);
        boxes.forEach(cb => { cb.checked = false; cb.dispatchEvent(new win.Event('change', { bubbles: true })); });
        click(boxes[0]);                                   // hakt an und setzt den Anker
        boxes[boxes.length - 1].dispatchEvent(new win.MouseEvent('click', { bubbles: true, shiftKey: true }));
        it('Shift-Klick hakt die gesamte Spanne an', boxes.every(cb => cb.checked),
            boxes.map(cb => cb.checked).join(', '));

        // Auswahl für den nächsten Schritt wiederherstellen
        boxes.forEach(cb => { cb.checked = true; cb.dispatchEvent(new win.Event('change', { bubbles: true })); });
```

- [ ] **Step 8: Volles Gate laufen lassen**

Run: `npm test && npm run lint`
Expected: PASS — alle 5 Suiten melden `0 fehlgeschlagen`, ESLint gibt keine Ausgabe.

- [ ] **Step 9: Commit**

```bash
git add obfuscator.js test/integration.test.js test/smoke.test.js
git commit -F - <<'EOF'
feat: Shift-Bereichsauswahl in den Auswahltabellen

Ein Klick setzt den Anker, ein Shift-Klick überträgt dessen Zustand auf die
gesamte Spanne bis zur angeklickten Zeile. Die Spanne läuft über die
sichtbaren Zeilen; ausgefilterte bleiben unverändert (wie bei der
Kopf-Checkbox, U13). Der Anker ist die Checkbox selbst, nicht ihr Index –
ein geänderter Filter würde Indizes still verschieben.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: Dokumentation und Abschluss

**Files:**
- Modify: `README.md:25` (neuer Unterabschnitt zwischen „C# – automatische Elementerkennung" und „MS SQL – automatische Elementerkennung")

**Interfaces:**
- Consumes: die in Task 1 und 2 gebauten Funktionen — hier wird nur beschrieben, was existiert.
- Produces: nichts, worauf Code zugreift.

- [ ] **Step 1: README ergänzen**

In `README.md` **nach** Zeile 24 (dem letzten Punkt der C#-Elementerkennung, `Umlaute und andere Unicode-Buchstaben …`) und **vor** `### **MS SQL – automatische Elementerkennung**` einfügen:

```markdown
### **Auswahl-Tabelle**
- Textfilter und Typ-Filter grenzen große Listen ein; die Kopf-Checkbox wirkt nur auf die sichtbaren Zeilen, der Zähler weist sichtbare und gesamte Auswahl getrennt aus.
- **Nur String-Replace** setzt die Auswahl in einem Schritt exklusiv auf die Elemente, die über das String-Replace in die Liste gekommen sind – über die ganze Tabelle, auch über gerade ausgefilterte Zeilen. Ohne solche Elemente ist der Button gesperrt.
- **Shift-Klick** überträgt eine Spanne: erst eine Zeile anklicken (an oder ab), dann eine zweite mit gedrückter Shift-Taste – alle sichtbaren Zeilen dazwischen übernehmen den Zustand der ersten. Ausgefilterte Zeilen bleiben unverändert.
```

- [ ] **Step 2: Beide Funktionen im Browser prüfen**

Run: `npx serve .` und im Browser `http://localhost:3000/obfuscator.html` öffnen (alternativ die Datei direkt öffnen).

Prüfen und bestätigen:
1. C#-Code einfügen, ein String-Replace-Wort eintragen, „Code Analysieren" klicken.
2. Der Button „Nur String-Replace" steht in der Filterzeile, ist aktiv und passt in der Höhe zu Filterfeld und Typ-Auswahl.
3. Klick darauf: nur die `String`-Zeilen bleiben angehakt, die Statusmeldung nennt beide Zahlen.
4. Eine Zeile anklicken, eine weiter unten mit Shift anklicken: alle dazwischen übernehmen den Zustand — und es wird dabei **kein** Text in der Tabelle markiert.
5. Filter setzen, Shift-Spanne über eine ausgeblendete Zeile hinweg ziehen: die ausgeblendete Zeile behält ihren Zustand (nach Filter-Reset sichtbar).
6. Ohne String-Replace-Wort analysieren: Der Button ist ausgegraut und reagiert nicht.
7. Dasselbe im MS-SQL-Tab.

- [ ] **Step 3: Volles Gate ein letztes Mal**

Run: `npm test && npm run lint`
Expected: PASS — alle 5 Suiten `0 fehlgeschlagen`, ESLint ohne Ausgabe.

- [ ] **Step 4: Publish-Ordner aktualisieren**

Run: `powershell -File ./publish.ps1`
Expected: Der Ordner `publish/` enthält den aktuellen Stand (Nutzerkonvention: nach jeder Session ausführen).

- [ ] **Step 5: Commit**

```bash
git add README.md publish
git commit -F - <<'EOF'
docs: Auswahl-Tabelle im README beschreiben

Nur-String-Replace-Button und Shift-Bereichsauswahl als eigener Abschnitt,
zusammen mit den bereits vorhandenen Filtern.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```
