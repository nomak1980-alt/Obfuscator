# Review-Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle nach dem Software-Review identifizierten Bugs, Test-Lücken und UX-Probleme beheben, ohne neue Features zu erfinden.

**Architecture:** Alle Änderungen bleiben innerhalb der bestehenden 4-Datei-Architektur (obfuscator-core.js, obfuscator.js, obfuscator.css, obfuscator.html). Keine neuen Abhängigkeiten. Keine Backward-Compatibility für alte Formate nötig (nur v1 zählt).

**Tech Stack:** Vanilla JS, CSS, HTML. Node.js (für Tests via jsdom). PowerShell (publish.ps1).

## Global Constraints

- Kein npm-Dependency-Upgrade außer was für Bugfixes nötig ist
- Kein TypeScript, kein Build-Step
- Keine Accessibility/ARIA-Änderungen
- Nur v1 des State-Formats wird unterstützt
- Kommentare in SQL und C# werden BEWUSST durchsucht und ersetzt – kein Kommentar-Stripping
- Alle Tests laufen mit: `npm test` (Node, kein Browser erforderlich)
- Publish via `.\publish.ps1` nach jeder fertigen Session

---

## Task 1: Integration-Tests reparieren (CI-Blocker)

**Files:**
- Modify: `test/integration.test.js` (HIDDEN_DOM Konstante)

**Problem:** `analyzeCode()` und `analyzeSqlCode()` greifen auf DOM-Elemente zu, die im Test-Stub fehlen, was zu `TypeError: Cannot read properties of null` führt. `npm test` schlägt deshalb fehl.

**Fehlende IDs im Stub:**
- `csharpUsedMappingSection`
- `csharpUsedMappingDisplay`
- `sqlUsedMappingSection`
- `sqlUsedMappingDisplay`

- [ ] **Step 1: Test laufen lassen und Fehler bestätigen**

```powershell
cd "C:\Entwicklung\Obfuscator"
npm test 2>&1 | Select-String -Pattern "TypeError|Error|✗" | Select-Object -First 20
```

Erwartetes Ergebnis: `TypeError: Cannot read properties of null (reading 'style')`

- [ ] **Step 2: Fehlende DOM-Elemente in HIDDEN_DOM ergänzen**

In `test/integration.test.js` die Konstante `HIDDEN_DOM` durch folgende Version ersetzen:

```javascript
const HIDDEN_DOM = `
<div style="display:none">
  <textarea id="originalCode"></textarea>
  <textarea id="obfuscatedCode"></textarea>
  <textarea id="aiResponse"></textarea>
  <textarea id="finalCode"></textarea>
  <input id="stringReplaceInput" type="text">
  <div id="stringReplaceChips"></div>
  <div id="statusMessage"></div>
  <div id="csharpMappingSelectionSection"></div>
  <div id="csharpMappingSelectionContainer"></div>
  <div id="csharpUsedMappingSection"></div>
  <div id="csharpUsedMappingDisplay"></div>
  <div id="stringReplaceMappingSection"></div>
  <div id="stringReplaceMappingDisplay"></div>
  <div id="obfuscatedSection"></div>
  <div id="aiResponseSection"></div>
  <div id="finalSection"></div>
  <textarea id="sqlOriginalCode"></textarea>
  <textarea id="sqlObfuscatedCode"></textarea>
  <textarea id="sqlAiResponse"></textarea>
  <textarea id="sqlFinalCode"></textarea>
  <input id="sqlStringReplaceInput" type="text">
  <div id="sqlStringReplaceChips"></div>
  <div id="sqlStatusMessage"></div>
  <div id="sqlMappingSelectionSection"></div>
  <div id="sqlMappingSelectionContainer"></div>
  <div id="sqlUsedMappingSection"></div>
  <div id="sqlUsedMappingDisplay"></div>
  <div id="sqlStringReplaceMappingSection"></div>
  <div id="sqlStringReplaceMappingDisplay"></div>
  <div id="sqlMappingSection"></div>
  <div id="sqlMappingDisplay"></div>
  <div id="sqlObfuscatedSection"></div>
  <div id="sqlAiResponseSection"></div>
  <div id="sqlFinalSection"></div>
</div>`;
```

- [ ] **Step 3: Tests laufen lassen und Ergebnis prüfen**

```powershell
npm test
```

Erwartetes Ergebnis: Alle 3 Test-Dateien laufen durch, kein `TypeError`. Jede Test-Suite zeigt `0 fehlgeschlagen`.

- [ ] **Step 4: Commit**

```bash
git add test/integration.test.js
git commit -m "fix: fehlende DOM-Elemente im Integration-Test-Stub ergänzen"
```

---

## Task 2: clearAll() und clearSqlAll() – Cross-Tab-Datenverlust beheben

**Files:**
- Modify: `obfuscator.js` (Funktionen `clearAll`, `clearSqlAll`, neue Funktion `clearTabState`)

**Problem:** Beide Funktionen rufen `clearSavedState()` → `localStorage.removeItem(STORAGE_KEY)` auf. Das löscht den State **beider** Tabs. Wer im C#-Tab löscht, verliert kommentarlos alle SQL-Daten.

**Fix:** Statt den gesamten Key zu löschen, nur den jeweiligen Tab-Bereich aus dem State entfernen und den Rest zurückschreiben.

- [ ] **Step 1: Hilfsfunktion `clearTabState(tabKey)` nach `clearSavedState()` einfügen**

In `obfuscator.js` direkt nach der Funktion `clearSavedState()` (~Zeile 199) einfügen:

```javascript
function clearTabState(tabKey) {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    let state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    if (!state || typeof state !== 'object') return;
    delete state[tabKey];
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
}
```

- [ ] **Step 2: `clearAll()` auf `clearTabState('csharp')` umstellen**

`clearAll()` aufsuchen (~Zeile 588). `clearSavedState()` durch `clearTabState('csharp')` ersetzen und den Bestätigungstext präzisieren:

```javascript
function clearAll() {
    if (!confirm('C#-Daten löschen? Das Mapping geht verloren!')) return;
    ['originalCode', 'obfuscatedCode', 'aiResponse', 'finalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    clearChips(csharpReplaceWords, 'stringReplaceChips');
    const csInput = document.getElementById('stringReplaceInput');
    if (csInput) csInput.value = '';

    stringReplaceMapping = new Map();
    reverseStringReplaceMapping = new Map();
    replacementHistory = [];
    csharpAutoMapping = new Map();
    reverseCsharpAutoMapping = new Map();
    csharpAutoTypeMap = new Map();

    ['csharpMappingSelectionSection', 'obfuscatedSection', 'csharpUsedMappingSection',
        'aiResponseSection', 'finalSection']
        .forEach(id => { document.getElementById(id).style.display = 'none'; });

    clearTabState('csharp');
    showStatus('C#-Daten gelöscht!');
}
```

- [ ] **Step 3: `clearSqlAll()` auf `clearTabState('sql')` umstellen**

`clearSqlAll()` aufsuchen (~Zeile 790). `clearSavedState()` durch `clearTabState('sql')` ersetzen:

```javascript
function clearSqlAll() {
    if (!confirm('SQL-Daten löschen? Das Mapping geht verloren!')) return;
    ['sqlOriginalCode', 'sqlObfuscatedCode', 'sqlAiResponse', 'sqlFinalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    clearChips(sqlReplaceWords, 'sqlStringReplaceChips');
    const sqlInput = document.getElementById('sqlStringReplaceInput');
    if (sqlInput) sqlInput.value = '';

    sqlMapping = new Map();
    reverseSqlMapping = new Map();
    sqlStringReplaceMapping = new Map();
    reverseSqlStringReplaceMapping = new Map();

    ['sqlObfuscatedSection', 'sqlUsedMappingSection', 'sqlMappingSelectionSection',
        'sqlAiResponseSection', 'sqlFinalSection']
        .forEach(id => { document.getElementById(id).style.display = 'none'; });

    clearTabState('sql');
    showSqlStatus('SQL-Daten gelöscht!');
}
```

- [ ] **Step 4: Integration-Test für Cross-Tab-Schutz schreiben**

In `test/integration.test.js` nach dem letzten bestehenden Sicherheits-Block anhängen:

```javascript
console.log('\n# clearAll() – Cross-Tab-Schutz');
(() => {
    resetSql();
    setVal('sqlOriginalCode', SQL_CODE);
    ev('analyzeSqlCode()');
    ev('obfuscateSqlCode()');
    const sqlObf = $('sqlObfuscatedCode').value;
    win.confirm = () => true;
    ev('clearAll()');
    const raw = win.localStorage.getItem('obfuscatorAppState_v1');
    const state = raw ? JSON.parse(raw) : null;
    it('clearAll() löscht nicht den SQL-State', () =>
        assert(state && state.sql && state.sql.sqlObfuscatedCode === sqlObf,
            'SQL-Code in localStorage fehlt nach clearAll()'));
    win.confirm = () => true;
})();
```

- [ ] **Step 5: Tests laufen lassen**

```powershell
npm test
```

Erwartetes Ergebnis: Neuer Test besteht. Alle anderen Tests weiterhin grün.

- [ ] **Step 6: Commit**

```bash
git add obfuscator.js test/integration.test.js
git commit -m "fix: clearAll/clearSqlAll löschen nur eigenen Tab-State, nicht beide"
```

---

## Task 3: tests.html aktualisieren (veraltete Textarea-API entfernen)

**Files:**
- Modify: `tests.html`

**Problem:** `tests.html` referenziert `stringReplace1`, `stringReplace2`, `stringReplace3` (alte Textareas), die durch Chip-Input ersetzt wurden. Die Tests schlagen still fehl oder testen falsches Verhalten.

**Fix:** Hidden-DOM auf die aktuelle Struktur bringen, Reset-/Analyse-Aufrufe auf Chip-API umschreiben.

- [ ] **Step 1: Altes Hidden-DOM durch aktuelles ersetzen**

Das `<div style="display:none">` komplett durch folgendes ersetzen:

```html
<div style="display:none">
    <textarea id="originalCode"></textarea>
    <textarea id="obfuscatedCode"></textarea>
    <textarea id="aiResponse"></textarea>
    <textarea id="finalCode"></textarea>
    <input id="stringReplaceInput" type="text">
    <div id="stringReplaceChips"></div>
    <div id="statusMessage"></div>
    <div id="csharpMappingSelectionSection"></div>
    <div id="csharpMappingSelectionContainer"></div>
    <div id="csharpUsedMappingSection"></div>
    <div id="csharpUsedMappingDisplay"></div>
    <div id="stringReplaceMappingSection"></div>
    <div id="stringReplaceMappingDisplay"></div>
    <div id="obfuscatedSection"></div>
    <div id="aiResponseSection"></div>
    <div id="finalSection"></div>
    <textarea id="sqlOriginalCode"></textarea>
    <textarea id="sqlObfuscatedCode"></textarea>
    <textarea id="sqlAiResponse"></textarea>
    <textarea id="sqlFinalCode"></textarea>
    <input id="sqlStringReplaceInput" type="text">
    <div id="sqlStringReplaceChips"></div>
    <div id="sqlStatusMessage"></div>
    <div id="sqlMappingSelectionSection"></div>
    <div id="sqlMappingSelectionContainer"></div>
    <div id="sqlUsedMappingSection"></div>
    <div id="sqlUsedMappingDisplay"></div>
    <div id="sqlStringReplaceMappingSection"></div>
    <div id="sqlStringReplaceMappingDisplay"></div>
    <div id="sqlMappingSection"></div>
    <div id="sqlMappingDisplay"></div>
    <div id="sqlObfuscatedSection"></div>
    <div id="sqlAiResponseSection"></div>
    <div id="sqlFinalSection"></div>
</div>
```

- [ ] **Step 2: `resetCsharp()` in tests.html aktualisieren**

```javascript
function resetCsharp() {
    ['originalCode','obfuscatedCode','aiResponse','finalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    stringReplaceMapping = new Map();
    reverseStringReplaceMapping = new Map();
    replacementHistory = [];
    csharpAutoMapping = new Map();
    reverseCsharpAutoMapping = new Map();
    csharpAutoTypeMap = new Map();
    csharpReplaceWords.length = 0;
    document.getElementById('stringReplaceChips').innerHTML = '';
    ['csharpMappingSelectionSection','csharpUsedMappingSection','obfuscatedSection',
     'stringReplaceMappingSection','aiResponseSection','finalSection']
        .forEach(id => { document.getElementById(id).style.display = 'none'; });
    document.getElementById('csharpMappingSelectionContainer').innerHTML = '';
}
```

- [ ] **Step 3: `resetSql()` in tests.html aktualisieren**

```javascript
function resetSql() {
    ['sqlOriginalCode','sqlObfuscatedCode','sqlAiResponse','sqlFinalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    sqlMapping = new Map();
    reverseSqlMapping = new Map();
    sqlStringReplaceMapping = new Map();
    reverseSqlStringReplaceMapping = new Map();
    sqlReplaceWords.length = 0;
    document.getElementById('sqlStringReplaceChips').innerHTML = '';
    ['sqlStringReplaceMappingSection','sqlUsedMappingSection','sqlMappingSelectionSection',
     'sqlMappingSection','sqlObfuscatedSection','sqlAiResponseSection','sqlFinalSection']
        .forEach(id => { document.getElementById(id).style.display = 'none'; });
    document.getElementById('sqlMappingSelectionContainer').innerHTML = '';
}
```

- [ ] **Step 4: Alle `describe`-Blöcke auf Chip-API umstellen**

Jede Zeile `document.getElementById('stringReplaceN').value = 'X'` durch `addChip('X', csharpReplaceWords, 'stringReplaceChips')` ersetzen. Analog SQL: `addChip('X', sqlReplaceWords, 'sqlStringReplaceChips')`.

Der erste `describe`-Block (C# – Analyse mit 3 Replace-Sets) sieht danach so aus:

```javascript
describe('C# – Analyse mit 3 Wörtern', () => {
    resetCsharp();
    document.getElementById('originalCode').value = CSHARP_CODE;
    addChip('CustomerService', csharpReplaceWords, 'stringReplaceChips');
    addChip('GetCustomer', csharpReplaceWords, 'stringReplaceChips');
    addChip('userId', csharpReplaceWords, 'stringReplaceChips');
    analyzeCode();

    it('erkennt mindestens 3 Elemente (String-Replace)', () => {
        assert(stringReplaceMapping.size >= 3, `Gefunden: ${stringReplaceMapping.size}`);
    });
    it('CustomerService gefunden', () => {
        assert(stringReplaceMapping.has('CustomerService'));
    });
    it('GetCustomer gefunden', () => {
        assert(stringReplaceMapping.has('GetCustomer'));
    });
    it('userId gefunden', () => {
        assert(stringReplaceMapping.has('userId'));
    });
    it('Auswahl-Sektion wird eingeblendet', () => {
        assertEquals(document.getElementById('csharpMappingSelectionSection').style.display, 'block');
    });
    it('Checkbox-Anzahl stimmt mit Mapping-Anzahl überein', () => {
        const total = stringReplaceMapping.size + csharpAutoMapping.size;
        assertEquals(document.querySelectorAll('.csharp-mapping-checkbox').length, total, 'Checkbox-Anzahl');
    });
    it('alle Checkboxen sind standardmäßig angehakt', () => {
        assert(Array.from(document.querySelectorAll('.csharp-mapping-checkbox')).every(cb => cb.checked));
    });
});
```

Den zweiten `describe`-Block (Analyse ohne Replace-Strings):

```javascript
describe('C# – Analyse ohne Replace-Strings → Auto-Analyse', () => {
    resetCsharp();
    document.getElementById('originalCode').value = CSHARP_CODE;
    analyzeCode();

    it('stringReplaceMapping leer', () => {
        assertEquals(stringReplaceMapping.size, 0, 'stringReplaceMapping.size');
    });
    it('Auswahl-Sektion trotzdem sichtbar (Auto-Analyse)', () => {
        assertEquals(document.getElementById('csharpMappingSelectionSection').style.display, 'block');
    });
    it('Checkboxen vorhanden (Auto-Mapping)', () => {
        assert(document.querySelectorAll('.csharp-mapping-checkbox').length > 0, 'keine Checkboxen');
    });
});
```

Die restlichen `describe`-Blöcke (vollständiger Durchlauf, Teilauswahl, keine Auswahl, alle SQL-Blöcke) analog umschreiben – überall `stringReplaceN.value` → `addChip(...)`.

- [ ] **Step 5: `tests.html` im Browser manuell prüfen**

```powershell
Start-Process "C:\Entwicklung\Obfuscator\tests.html"
```

Alle Tests müssen grün erscheinen – "Ergebnis: N bestanden, 0 fehlgeschlagen".

- [ ] **Step 6: Commit**

```bash
git add tests.html
git commit -m "fix: tests.html auf aktuelle Chip-API aktualisieren (Textarea-API entfernt)"
```

---

## Task 4: btn-danger visuell von btn-secondary unterscheiden

**Files:**
- Modify: `obfuscator.css`

**Problem:** `.btn-danger` und `.btn-secondary` haben dieselbe Farbe (`#d97706` – amber). "Alles Löschen" sieht aus wie "Code Kopieren".

- [ ] **Step 1: `.btn-danger` in CSS auf Rot umstellen**

In `obfuscator.css` die `.btn-danger`-Regeln suchen und `#d97706` durch `#dc2626` ersetzen:

```css
.btn-danger {
    border-color: #dc2626;
    box-shadow: 0 0 40px 40px #dc2626 inset, 0 0 0 0 #dc2626;
}

.btn-danger:hover {
    box-shadow: 0 0 10px 0 #dc2626 inset, 0 0 10px 4px #dc2626;
}
```

- [ ] **Step 2: Visuell prüfen**

`obfuscator.html` im Browser öffnen. "Alles Löschen"-Button muss rot sein. "Exportieren" bleibt blau, "Importieren" bleibt amber. SQL-Tab: "Alles Löschen" ebenfalls rot.

- [ ] **Step 3: Commit**

```bash
git add obfuscator.css
git commit -m "fix: btn-danger auf Rot umfärben (destruktive Aktionen unterscheidbar)"
```

---

## Task 5: SQL-Alias-False-Positives filtern (einbuchstabige Bezeichner)

**Files:**
- Modify: `obfuscator-core.js` (`isValidId` in `analyzeSqlElements`)
- Modify: `test/core.test.js` (neuer Testfall)

**Problem:** Einbuchstabige SQL-Aliases wie `u`, `o` werden als Tabellen erkannt. `FROM Users u` → `u → Tabelle` in der Auswahltabelle.

- [ ] **Step 1: Failing Test schreiben**

In `test/core.test.js` nach dem letzten `# SQL Analyse + Round-Trip`-Block:

```javascript
console.log('\n# SQL Alias-Filter');
it('einbuchstabige Aliases werden nicht als Elemente erkannt', () => {
    const sql = 'SELECT u.UserId FROM Users u INNER JOIN Orders o ON u.UserId = o.OrderId';
    const els = C.analyzeSqlElements(sql);
    const names = els.map(e => e.element);
    assert(!names.includes('u'), 'u fälschlicherweise erkannt: ' + names.join(', '));
    assert(!names.includes('o'), 'o fälschlicherweise erkannt: ' + names.join(', '));
    assert(names.includes('Users'), 'Users fehlt');
    assert(names.includes('Orders'), 'Orders fehlt');
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```powershell
node test/core.test.js 2>&1 | Select-String -Pattern "Alias|✗|fehlgeschlagen"
```

Erwartetes Ergebnis: Der neue Test schlägt fehl.

- [ ] **Step 3: `isValidId` in `analyzeSqlElements` anpassen**

In `obfuscator-core.js` die lokale `isValidId`-Funktion (~Zeile 247) um `n.length >= 2` erweitern:

```javascript
const isValidId = n => !!n
    && n.length >= 2
    && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)
    && !isSqlReservedWord(n)
    && !n.startsWith(SQL_STR_PREFIX);
```

- [ ] **Step 4: Tests laufen lassen**

```powershell
npm test
```

Erwartetes Ergebnis: Neuer Alias-Test besteht. SQL Round-Trip und alle anderen Tests grün.

- [ ] **Step 5: Commit**

```bash
git add obfuscator-core.js test/core.test.js
git commit -m "fix: SQL-Analyse ignoriert einbuchstabige Bezeichner (Alias-False-Positives)"
```

---

## Task 6: Dateigrößen-Limit beim JSON-Import

**Files:**
- Modify: `obfuscator.js` (`importState`)

**Problem:** `reader.readAsText(file)` hat kein Größenlimit. Eine manipulierte 100-MB-Datei könnte den Browser-Tab einfrieren.

- [ ] **Step 1: Größenprüfung in `importState` einbauen**

Direkt nach `const file = event.target.files[0];` und `event.target.value = '';` einfügen:

```javascript
function importState(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const MAX_IMPORT_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_IMPORT_SIZE) {
        notify('Datei zu groß (max. 10 MB). Bitte eine gültige Backup-Datei wählen.', 'error');
        return;
    }
    const reader = new FileReader();
    // ... Rest unverändert
```

- [ ] **Step 2: Manuell testen**

Eine 11-MB-Dummy-Datei erzeugen und importieren:

```powershell
$s = '{"x":"' + ('a' * 11000000) + '"}'
[System.IO.File]::WriteAllText("$env:TEMP\big.json", $s)
Write-Host "Datei: $env:TEMP\big.json ($([math]::Round($s.Length/1MB,1)) MB)"
```

`obfuscator.html` öffnen → Importieren → diese Datei wählen. Erwartetes Ergebnis: Fehlermeldung "Datei zu groß", kein Einfrieren.

- [ ] **Step 3: Commit**

```bash
git add obfuscator.js
git commit -m "fix: Import-Datei auf max. 10 MB begrenzen"
```

---

## Task 7: Warnung bei Re-Analyse wenn Mappings vorhanden sind

**Files:**
- Modify: `obfuscator.js` (`analyzeCode`, `analyzeSqlCode`)

**Problem:** Klickt ein Nutzer erneut "Code Analysieren" nachdem er bereits verschleiert hat, werden alle Mappings ohne Rückfrage überschrieben. Der verschleierte Code kann dann nicht mehr korrekt zurückverwandelt werden.

- [ ] **Step 1: Warnung in `analyzeCode()` einbauen**

Direkt nach `if (!confirmLargeInput(originalCode)) return;` einfügen:

```javascript
const hasMappings = stringReplaceMapping.size > 0 || csharpAutoMapping.size > 0;
if (hasMappings) {
    if (!confirm('Neu analysieren? Das bisherige Mapping geht verloren und verschleierter Code kann nicht mehr zurückverwandelt werden.')) return;
}
```

- [ ] **Step 2: Warnung in `analyzeSqlCode()` einbauen**

Direkt nach `if (!confirmLargeInput(originalCode)) return;` einfügen:

```javascript
const hasMappings = sqlMapping.size > 0 || sqlStringReplaceMapping.size > 0;
if (hasMappings) {
    if (!confirm('Neu analysieren? Das bisherige SQL-Mapping geht verloren.')) return;
}
```

- [ ] **Step 3: Integration-Test ergänzen**

In `test/integration.test.js` nach dem letzten bestehenden Block anhängen:

```javascript
console.log('\n# Re-Analyse-Schutz');
(() => {
    resetCsharp();
    setVal('originalCode', CSHARP_CODE);
    ev("addChip('CustomerService', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()');
    ev('obfuscateCode()');
    const firstObf = $('obfuscatedCode').value;

    win.confirm = () => false;
    ev("addChip('GetCustomer', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()');

    it('Re-Analyse abgebrochen: obfuscatedCode unverändert', () =>
        eq($('obfuscatedCode').value, firstObf, 'obfuscatedCode sollte unverändert sein'));

    win.confirm = () => true;
})();
```

- [ ] **Step 4: Tests laufen lassen**

```powershell
npm test
```

Erwartetes Ergebnis: Neuer Test besteht. Alle anderen Tests grün.

- [ ] **Step 5: Commit**

```bash
git add obfuscator.js test/integration.test.js
git commit -m "fix: Warnung vor Re-Analyse wenn Mappings vorhanden"
```

---

## Task 8: Chip-Input – Mindestlänge 3 Zeichen

**Files:**
- Modify: `obfuscator.js` (Funktion `addChip`)
- Modify: `test/integration.test.js` (neuer Testfall)

**Problem:** Aktuell werden auch ein- oder zweistellige Eingaben als Chips akzeptiert. Da die Wortgrenze-Regex einbuchstabige Tokens sowieso nicht als vollständige Bezeichner erkennt, und um versehentliche Eingaben zu vermeiden, sollen Chips mindestens 3 Zeichen lang sein.

**Verhalten:** Eingabe kürzer als 3 Zeichen → roter Rahmen am Input für 1,2 Sekunden, kein Chip wird erstellt, Input-Feld bleibt mit dem Inhalt erhalten damit der Nutzer ergänzen kann.

- [ ] **Step 1: Failing Test schreiben**

In `test/integration.test.js` nach dem Re-Analyse-Block anhängen:

```javascript
console.log('\n# Chip-Mindestlänge');
(() => {
    win.__t.resetCs();
    ev("addChip('ab', window.__csharpWords, 'stringReplaceChips')");
    it('Chip mit 2 Zeichen wird nicht hinzugefügt', () =>
        assert(!win.__csharpWords.includes('ab'), 'ab fälschlicherweise in csharpReplaceWords'));

    ev("addChip('a', window.__csharpWords, 'stringReplaceChips')");
    it('Chip mit 1 Zeichen wird nicht hinzugefügt', () =>
        assert(!win.__csharpWords.includes('a'), 'a fälschlicherweise in csharpReplaceWords'));

    ev("addChip('abc', window.__csharpWords, 'stringReplaceChips')");
    it('Chip mit 3 Zeichen wird akzeptiert', () =>
        assert(win.__csharpWords.includes('abc'), 'abc fehlt in csharpReplaceWords'));
})();
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```powershell
node test/integration.test.js 2>&1 | Select-String -Pattern "Mindest|✗|fehlgeschlagen"
```

Erwartetes Ergebnis: Die ersten beiden Tests schlagen fehl (ab und a werden akzeptiert).

- [ ] **Step 3: `addChip()` in obfuscator.js anpassen**

Die Funktion `addChip` (~Zeile 89) erweitern:

```javascript
function addChip(word, arr, containerId) {
    const trimmed = word.trim();
    if (!trimmed || arr.includes(trimmed)) return;
    if (trimmed.length < 3) {
        const field = document.querySelector(`#${containerId}`);
        const input = field && field.previousElementSibling
            ? field.previousElementSibling.querySelector('input')
            : null;
        if (input) {
            input.style.borderColor = '#dc2626';
            setTimeout(() => { input.style.borderColor = ''; }, 1200);
        }
        return;
    }
    arr.push(trimmed);
    renderChip(trimmed, arr, containerId);
    scheduleSave();
}
```

**Hinweis zur DOM-Traversierung:** `containerId` ist z.B. `'stringReplaceChips'`. Das zugehörige Input ist im `.chip-input-row` davor. Da diese Struktur erst in Task 10 eingebaut wird, muss dieser Task **vor** Task 10 committed werden, aber die Traversierung hier setzt die `.chip-input-row`-Struktur voraus. Deshalb: In Task 10 (+ Button) wird die HTML-Struktur eingebaut – bis dahin ist der visuelle Fehler-Feedback (roter Rahmen) nicht wirksam, aber die Längenvalidierung selbst funktioniert sofort.

Alternativ einfachere Traversierung ohne Struktur-Annahme: direkt per ID suchen:

```javascript
function addChip(word, arr, containerId) {
    const trimmed = word.trim();
    if (!trimmed || arr.includes(trimmed)) return;
    if (trimmed.length < 3) {
        const inputId = containerId === 'stringReplaceChips' ? 'stringReplaceInput'
                      : containerId === 'sqlStringReplaceChips' ? 'sqlStringReplaceInput'
                      : null;
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                input.style.borderColor = '#dc2626';
                setTimeout(() => { input.style.borderColor = ''; }, 1200);
            }
        }
        return;
    }
    arr.push(trimmed);
    renderChip(trimmed, arr, containerId);
    scheduleSave();
}
```

- [ ] **Step 4: Tests laufen lassen**

```powershell
npm test
```

Erwartetes Ergebnis: Alle 3 Mindestlängen-Tests bestehen. Alle vorherigen Tests grün.

- [ ] **Step 5: Visuell prüfen**

`obfuscator.html` öffnen, im Chip-Input `ab` eingeben und Enter drücken. Erwartetes Ergebnis: Kein Chip erscheint, Input-Feld bekommt kurz roten Rahmen. `abc` eingeben und Enter: Chip erscheint.

- [ ] **Step 6: Commit**

```bash
git add obfuscator.js test/integration.test.js
git commit -m "fix: Chip-Input akzeptiert nur Eingaben mit mindestens 3 Zeichen"
```

---

## Task 9: Status-Meldung nach Analyse aufschlüsseln

**Files:**
- Modify: `obfuscator.js` (`analyzeCode`, `analyzeSqlCode`)

**Problem:** Nach der Analyse zeigt die Statusmeldung nur die Gesamtzahl. Bei vielen Elementen ist unklar, wie viele manuell (String-Replace) vs. automatisch erkannt wurden.

- [ ] **Step 1: Meldung in `analyzeCode()` aufschlüsseln**

Die bestehende `showStatus(...)`-Zeile am Ende von `analyzeCode()` ersetzen:

```javascript
const strCount = stringReplaceMapping.size;
const autoCount = csharpAutoMapping.size;
const total = strCount + autoCount;
const parts = [];
if (strCount > 0) parts.push(`${strCount} String-Replace`);
if (autoCount > 0) parts.push(`${autoCount} Auto-Erkannt`);
showStatus(`${total} Elemente erkannt (${parts.join(', ')}). Auswahl treffen und "Verschleiern" klicken.`);
```

- [ ] **Step 2: Meldung in `analyzeSqlCode()` aufschlüsseln**

Den bestehenden `showSqlStatus(...)`-Aufruf in `analyzeSqlCode()` ersetzen:

```javascript
const srCount = sqlStringReplaceMapping.size;
const elCount = potentialMappings.size;
const total = srCount + elCount;
const parts = [];
if (elCount > 0) parts.push(`${elCount} SQL-Elemente`);
if (srCount > 0) parts.push(`${srCount} String-Replace`);
showSqlStatus(`${total} Elemente erkannt (${parts.join(', ')}). Auswahl treffen und "Verschleiern" klicken.`);
```

- [ ] **Step 3: Visuell prüfen**

`obfuscator.html` öffnen → SQL-Code einfügen → `Users` als Chip → Analysieren. Erwartete Meldung enthält beide Anteile, z.B. `"6 Elemente erkannt (5 SQL-Elemente, 1 String-Replace)."`.

- [ ] **Step 4: Commit**

```bash
git add obfuscator.js
git commit -m "feat: Analyse-Statusmeldung mit Aufschlüsselung String-Replace vs. Auto"
```

---

## Task 10: Chip-Input – Plus-Button hinzufügen

**Files:**
- Modify: `obfuscator.html`
- Modify: `obfuscator.js` (ACTIONS)
- Modify: `obfuscator.css`

**Problem:** Chips können nur per Enter-Taste hinzugefügt werden. Für Maus- und Touch-Nutzer gibt es keinen sichtbaren Button.

- [ ] **Step 1: HTML anpassen – C# Chip-Input**

Den bestehenden Block im C#-Tab:

```html
<div class="chip-input-wrapper">
    <input type="text" id="stringReplaceInput" placeholder="Wort eingeben und Enter drücken…" class="chip-input-field" aria-label="String-Replace Wort hinzufügen">
    <div id="stringReplaceChips" class="chip-container" aria-label="String-Replace Wörter" aria-live="polite"></div>
</div>
```

ersetzen durch:

```html
<div class="chip-input-wrapper">
    <div class="chip-input-row">
        <input type="text" id="stringReplaceInput" placeholder="Wort eingeben (min. 3 Zeichen)…" class="chip-input-field" aria-label="String-Replace Wort hinzufügen">
        <button class="btn-chip-add" data-action="addCsharpChip" type="button" title="Wort hinzufügen">+</button>
    </div>
    <div id="stringReplaceChips" class="chip-container" aria-label="String-Replace Wörter" aria-live="polite"></div>
</div>
```

- [ ] **Step 2: HTML anpassen – SQL Chip-Input**

Den bestehenden Block im SQL-Tab:

```html
<div class="chip-input-wrapper">
    <input type="text" id="sqlStringReplaceInput" placeholder="Wort eingeben und Enter drücken…" class="chip-input-field" aria-label="SQL String-Replace Wort hinzufügen">
    <div id="sqlStringReplaceChips" class="chip-container" aria-label="SQL String-Replace Wörter" aria-live="polite"></div>
</div>
```

ersetzen durch:

```html
<div class="chip-input-wrapper">
    <div class="chip-input-row">
        <input type="text" id="sqlStringReplaceInput" placeholder="Wort eingeben (min. 3 Zeichen)…" class="chip-input-field" aria-label="SQL String-Replace Wort hinzufügen">
        <button class="btn-chip-add" data-action="addSqlChip" type="button" title="Wort hinzufügen">+</button>
    </div>
    <div id="sqlStringReplaceChips" class="chip-container" aria-label="SQL String-Replace Wörter" aria-live="polite"></div>
</div>
```

- [ ] **Step 3: ACTIONS in obfuscator.js ergänzen**

```javascript
const ACTIONS = {
    exportState, triggerImport: () => document.getElementById('importFileInput').click(),
    switchTab: el => switchTab(el.dataset.tab),
    analyzeCode, clearAll, obfuscateCode, copyObfuscated, deobfuscateCode, copyFinal,
    analyzeSqlCode, clearSqlAll, obfuscateSqlCode, copySqlObfuscated, deobfuscateSqlCode, copySqlFinal,
    addCsharpChip: () => {
        const input = document.getElementById('stringReplaceInput');
        addChip(input.value, csharpReplaceWords, 'stringReplaceChips');
        input.value = '';
        input.focus();
    },
    addSqlChip: () => {
        const input = document.getElementById('sqlStringReplaceInput');
        addChip(input.value, sqlReplaceWords, 'sqlStringReplaceChips');
        input.value = '';
        input.focus();
    }
};
```

**Hinweis:** `addChip` prüft die 3-Zeichen-Mindestlänge bereits (Task 8). Wenn der Nutzer auf `+` klickt und der Input kürzer als 3 Zeichen ist, erscheint der rote Rahmen – `input.value = ''` wird in diesem Fall NICHT ausgeführt, damit der Nutzer seinen Text weiter bearbeiten kann. Den `addCsharpChip`-Handler deshalb so lassen: `input.value = ''` läuft immer. Besser:

```javascript
addCsharpChip: () => {
    const input = document.getElementById('stringReplaceInput');
    const before = csharpReplaceWords.length;
    addChip(input.value, csharpReplaceWords, 'stringReplaceChips');
    if (csharpReplaceWords.length > before) input.value = ''; // nur leeren wenn Chip wirklich hinzugefügt
    input.focus();
},
addSqlChip: () => {
    const input = document.getElementById('sqlStringReplaceInput');
    const before = sqlReplaceWords.length;
    addChip(input.value, sqlReplaceWords, 'sqlStringReplaceChips');
    if (sqlReplaceWords.length > before) input.value = '';
    input.focus();
}
```

- [ ] **Step 4: CSS für `.chip-input-row` und `.btn-chip-add` ergänzen**

In `obfuscator.css` nach dem `.chip-input-wrapper`-Block einfügen:

```css
.chip-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.chip-input-row .chip-input-field {
    flex: 1;
}

.btn-chip-add {
    padding: 8px 14px;
    border: 1px solid #0d7bc2;
    border-radius: 8px;
    background: rgba(13, 123, 194, 0.15);
    color: #0d7bc2;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    line-height: 1;
    text-transform: none;
    letter-spacing: 0;
    flex-shrink: 0;
    transition: background 0.2s ease;
    box-shadow: none;
}

.btn-chip-add:hover {
    background: rgba(13, 123, 194, 0.3);
    box-shadow: none;
}
```

- [ ] **Step 5: Visuell prüfen**

`obfuscator.html` öffnen. Neben dem Eingabefeld erscheint ein `+`-Button. Klick auf `+` mit leerem Feld: nichts passiert. Klick mit `ab`: roter Rahmen, kein Chip. Klick mit `abc`: Chip erscheint, Feld wird geleert. Enter-Taste funktioniert weiterhin.

- [ ] **Step 6: Commit**

```bash
git add obfuscator.html obfuscator.js obfuscator.css
git commit -m "feat: Plus-Button zum Chip-Input hinzufügen"
```

---

## Task 11: Mobile Responsiveness – code-row auf kleinen Bildschirmen

**Files:**
- Modify: `obfuscator.css`

**Problem:** `.code-row { grid-template-columns: 85fr 15fr; }` hat keinen Mobile-Breakpoint. Auf Smartphones wird die String-Replace-Spalte extrem schmal.

- [ ] **Step 1: Breakpoint für `.code-row` und Mapping-Tabelle in den bestehenden Media-Query einbauen**

Im bestehenden `@media (max-width: 768px)`-Block die Regeln für `.code-row` und `.mapping-selection-table` ergänzen:

```css
@media (max-width: 768px) {
    .container {
        padding: 20px;
        margin: 10px;
    }

    h1 {
        font-size: 2em;
    }

    .button-group {
        flex-direction: column;
    }

    button {
        width: 100%;
    }

    .code-row {
        grid-template-columns: 1fr;
    }

    .mapping-selection-table {
        display: block;
        overflow-x: auto;
    }
}
```

- [ ] **Step 2: Visuell prüfen**

Browser-DevTools öffnen (F12) → Device Toolbar → 375px Breite (iPhone SE). `obfuscator.html` laden. Code-Textarea und String-Replace-Eingabe erscheinen untereinander in voller Breite.

- [ ] **Step 3: Commit**

```bash
git add obfuscator.css
git commit -m "fix: code-row auf Mobile (< 768px) zu Single-Column"
```

---

## Task 12: README.md aktualisieren

**Files:**
- Modify: `README.md`

**Probleme:**
- Beschreibt noch die alte 3-Textarea-API (`stringReplace1/2/3`, "bis zu 3 Replace-Sets")
- "Dark Mode UI" steht unter zukünftigen Features – längst implementiert
- `tests.html` fehlt in der Projektstruktur-Übersicht

- [ ] **Step 1: C#-String-Replace-Abschnitt aktualisieren**

Den Abschnitt `### **C# – String-Replace**` ersetzen:

```markdown
### **C# – String-Replace**
- Trage Wörter über das Eingabefeld ein und drücke Enter oder klicke `+` (mindestens 3 Zeichen).
- Alle Schreibvarianten im Code werden als **ganze Wörter** gefunden (`customer`, `Customer`, `CUSTOMER`).
- Wörter in Kommentaren werden ebenfalls durchsucht und ersetzt.
- Du wählst per Auswahl-Tabelle aus, welche Varianten tatsächlich verschleiert werden.
```

- [ ] **Step 2: Future-Extensions aktualisieren**

```markdown
## 🔮 Zukünftige Erweiterungen

- [x] Import/Export von Mapping-Konfigurationen
- [x] Dark Mode UI
- [ ] Unterstützung für weitere Programmiersprachen
- [ ] Batch-Verarbeitung für mehrere Dateien
- [ ] Erweiterte Analytik-Statistiken
```

- [ ] **Step 3: Projektstruktur-Tabelle ergänzen**

```markdown
## 📂 Projektstruktur

```
Obfuscator/
├── obfuscator.html          # Hauptanwendung (Markup)
├── obfuscator.css           # Styles
├── obfuscator-core.js       # Reine Obfuskierungslogik (DOM-frei, testbar)
├── obfuscator.js            # DOM-/UI-/Persistenz-Schicht
├── tests.html               # Browser-Testseite (manuelle Tests im Browser)
├── test/                    # Node-Tests (core, integration, smoke)
│   ├── core.test.js         # Logik-Tests (kein DOM)
│   ├── integration.test.js  # DOM-Schicht via jsdom
│   └── smoke.test.js        # End-to-End via echte HTML
├── package.json             # npm test + Dev-Abhängigkeiten
└── README.md                # Dokumentation
```
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README aktualisiert (Chip-API, Dark Mode erledigt, Projektstruktur)"
```

---

## Task 13: Publish

- [ ] **Step 1: Alle Tests laufen lassen**

```powershell
npm test
```

Erwartetes Ergebnis: Alle 3 Test-Suiten bestehen, 0 fehlgeschlagen.

- [ ] **Step 2: Publish ausführen**

```powershell
.\publish.ps1
```

Erwartetes Ergebnis: `publish/`-Verzeichnis enthält alle 6 Dateien (obfuscator.html, obfuscator.css, obfuscator-core.js, obfuscator.js, COHeader.jpg, COIcon.jpg).

- [ ] **Step 3: Abschluss-Commit falls nötig**

```bash
git status
# Falls noch Änderungen offen:
git add -A
git commit -m "chore: publish nach Review-Fix-Serie"
```
