# C# Auto-Analyse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic C# identifier detection to the C# tab, producing type-specific placeholders (`CS_CLASS_1`, `CS_METHOD_1`, etc.) in a unified selection table alongside the existing manual string-replace entries.

**Architecture:** New DOM-free `analyzeCSharpElements()` in `obfuscator-core.js` detects C# identifiers via regex patterns anchored to declaration syntax. `obfuscator.js` extends `analyzeCode()` to call both string-replace analysis and auto-analysis, merging results into one selection table with a Typ column. Obfuscation applies string-replace first, then auto-mapping; deobfuscation reverses this order.

**Tech Stack:** Vanilla JS (ES5/UMD), no build step, Node.js + jsdom for tests (`npm test`), custom `it()`/`eq()`/`assert()` test runner (NOT Jest — see existing test files).

## Global Constraints

- Pure browser, no backend, no CDN — all code stays in the four root files
- Single publish folder: `obfuscator-core.js`, `obfuscator.js`, `obfuscator.html`, `obfuscator.css`
- Existing manual string-replace workflow must remain intact and unchanged for users who enter no code
- All new core logic must be DOM-free (callable from Node.js for tests)
- UMD pattern in `obfuscator-core.js`: add new exports to the `return {}` block at the bottom
- Tests use custom runner: `it(name, fn)`, `eq(a, b, label)`, `assert(cond, msg)` — see `test/core.test.js` line 9-16
- Integration tests call UI functions via `ev('functionName()')` — see `test/integration.test.js` line 58

---

### Task 1: Core — `CS_PREFIXES`, `CS_TYPE_LABEL`, `isCSharpKeyword()`, `analyzeCSharpElements()`

**Files:**
- Modify: `obfuscator-core.js` — add new C# auto-analysis section after the SQL section, before `return {}`
- Modify: `test/core.test.js` — add new test section after existing tests, before the final pass/fail summary

**Interfaces:**
- Consumes: `uniqueSuffix(code, prefixes)` — already in core, line ~58
- Produces:
  - `CS_PREFIXES: { class, iface, enum, namespace, method, prop, field, param }` → e.g. `{ class: 'CS_CLASS_', method: 'CS_METHOD_', ... }`
  - `analyzeCSharpElements(code: string): Array<{ element: string, type: string, placeholder: string }>` — `type` is German display label ("Klasse", "Methode", etc.)
  - `isCSharpKeyword(word: string): boolean`

- [ ] **Step 1: Write failing tests in `test/core.test.js`**

In `test/core.test.js`, locate the final `console.log` that prints pass/fail totals and insert the following block BEFORE it:

```javascript
console.log('\n# analyzeCSharpElements – Typdeklarationen');
it('erkennt Klassenname', () => {
    const r = C.analyzeCSharpElements('public class CustomerService { }');
    assert(r.some(e => e.element === 'CustomerService' && e.type === 'Klasse'),
        'CustomerService/Klasse nicht gefunden: ' + JSON.stringify(r));
});
it('erkennt Interface-Name', () => {
    const r = C.analyzeCSharpElements('public interface ICustomerRepository { }');
    assert(r.some(e => e.element === 'ICustomerRepository' && e.type === 'Interface'),
        JSON.stringify(r));
});
it('erkennt Enum-Name', () => {
    const r = C.analyzeCSharpElements('public enum OrderStatus { Active }');
    assert(r.some(e => e.element === 'OrderStatus' && e.type === 'Enum'), JSON.stringify(r));
});
it('erkennt mehrteiligen Namespace einzeln', () => {
    const r = C.analyzeCSharpElements('namespace MyApp.Services { }');
    const names = r.map(e => e.element);
    assert(names.includes('MyApp') && names.includes('Services'),
        'MyApp/Services nicht gefunden: ' + names.join(', '));
});

console.log('\n# analyzeCSharpElements – Member-Deklarationen');
it('erkennt Methodenname (mit Modifier)', () => {
    const r = C.analyzeCSharpElements('public async Task<Customer> GetCustomer(int id) { }');
    assert(r.some(e => e.element === 'GetCustomer' && e.type === 'Methode'), JSON.stringify(r));
});
it('erkennt Property-Name', () => {
    const r = C.analyzeCSharpElements('public string CustomerName { get; set; }');
    assert(r.some(e => e.element === 'CustomerName' && e.type === 'Property'), JSON.stringify(r));
});
it('erkennt Feld-Name', () => {
    const r = C.analyzeCSharpElements('private readonly IRepository _repository;');
    assert(r.some(e => e.element === '_repository' && e.type === 'Feld'), JSON.stringify(r));
});
it('erkennt Parameter-Namen', () => {
    const r = C.analyzeCSharpElements('public void Process(int orderId, string customerName) { }');
    const names = r.map(e => e.element);
    assert(names.includes('orderId'), 'orderId fehlt: ' + names.join(', '));
    assert(names.includes('customerName'), 'customerName fehlt: ' + names.join(', '));
});

console.log('\n# analyzeCSharpElements – Filter & Sicherheit');
it('enthält keine C#-Keywords', () => {
    const r = C.analyzeCSharpElements('public class Foo { public async void Bar(int x) { } }');
    const names = r.map(e => e.element);
    ['public', 'class', 'void', 'async', 'int', 'string', 'static', 'new', 'return'].forEach(kw => {
        assert(!names.includes(kw), 'Keyword fälschlicherweise erkannt: ' + kw);
    });
});
it('jedes Element nur einmal in Ergebnisliste', () => {
    const r = C.analyzeCSharpElements('public class Customer { }\npublic class Customer { }');
    eq(r.filter(e => e.element === 'Customer').length, 1, 'Customer doppelt');
});
it('gibt leeres Array für leeren Input', () => {
    eq(C.analyzeCSharpElements('').length, 0, 'leer erwartet');
});
it('Platzhalter für Klasse beginnt mit CS_CLASS_', () => {
    const r = C.analyzeCSharpElements('public class CustomerService { }');
    const item = r.find(e => e.element === 'CustomerService');
    assert(item && item.placeholder.startsWith('CS_CLASS_'), item ? item.placeholder : 'nicht gefunden');
});
it('Platzhalter für Methode beginnt mit CS_METHOD_', () => {
    const r = C.analyzeCSharpElements('public void GetOrder() { }');
    const item = r.find(e => e.element === 'GetOrder');
    assert(item && item.placeholder.startsWith('CS_METHOD_'), item ? item.placeholder : 'nicht gefunden');
});
it('Kollisionsschutz: Salt wenn CS_CLASS_ bereits im Code', () => {
    const code = 'string x = "CS_CLASS_1"; public class CustomerService { }';
    const r = C.analyzeCSharpElements(code);
    const item = r.find(e => e.element === 'CustomerService');
    assert(item && item.placeholder !== 'CS_CLASS_1', item ? item.placeholder : 'nicht gefunden');
    assert(item && item.placeholder.startsWith('CS_CLASS_'), item.placeholder);
});
it('CS_PREFIXES exportiert alle 8 Schlüssel', () => {
    const keys = ['class','iface','enum','namespace','method','prop','field','param'];
    keys.forEach(k => assert(C.CS_PREFIXES[k] !== undefined, 'CS_PREFIXES.' + k + ' fehlt'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test
```
Expected: all new `analyzeCSharpElements` tests fail with `C.analyzeCSharpElements is not a function`.

- [ ] **Step 3: Implement the new core section in `obfuscator-core.js`**

In `obfuscator-core.js`, locate the comment `// ── SQL` section end (around line 385, before the `return {`). Insert the following block between the SQL section and the `return {`:

```javascript
    // ── C# Auto-Analyse ──────────────────────────────────────────────────────

    const CS_PREFIXES = {
        class:     'CS_CLASS_',
        iface:     'CS_IFACE_',
        enum:      'CS_ENUM_',
        namespace: 'CS_NS_',
        method:    'CS_METHOD_',
        prop:      'CS_PROP_',
        field:     'CS_FIELD_',
        param:     'CS_PARAM_'
    };

    const CS_TYPE_LABEL = {
        class:     'Klasse',
        iface:     'Interface',
        enum:      'Enum',
        namespace: 'Namespace',
        method:    'Methode',
        prop:      'Property',
        field:     'Feld',
        param:     'Parameter'
    };

    const CS_KEYWORD_SET = new Set([
        'abstract','as','base','bool','break','byte','case','catch','char','checked',
        'class','const','continue','decimal','default','delegate','do','double','else',
        'enum','event','explicit','extern','false','finally','fixed','float','for',
        'foreach','goto','if','implicit','in','int','interface','internal','is','lock',
        'long','namespace','new','null','object','operator','out','override','params',
        'private','protected','public','readonly','ref','return','sbyte','sealed',
        'short','sizeof','stackalloc','static','string','struct','switch','this',
        'throw','true','try','typeof','uint','ulong','unchecked','unsafe','ushort',
        'using','virtual','void','volatile','while','async','await','var','get','set',
        'add','remove','value','yield','partial','nameof','when','dynamic','nint','nuint',
        'record','init','required','file','scoped',
        // Häufige .NET-Typen, die typischerweise kein Domain-Namen sind
        'Task','List','Dictionary','HashSet','Queue','Stack','Array','Span','Memory',
        'IEnumerable','ICollection','IList','IReadOnlyList','IReadOnlyCollection',
        'IDisposable','IAsyncDisposable','Func','Action','Predicate','EventHandler',
        'Type','Object','String','Boolean','Int32','Int64','Int16','UInt32','UInt64',
        'Byte','SByte','Double','Single','Decimal','Char',
        'DateTime','DateTimeOffset','TimeSpan','Guid','Uri',
        'Exception','Console','Math','Environment','Convert','GC',
        'StringBuilder','Regex','Thread','CancellationToken','CancellationTokenSource',
        'HttpClient','ILogger','IServiceProvider','IServiceCollection',
        'Stream','MemoryStream','KeyValuePair','Tuple','ValueTuple'
    ]);

    function isCSharpKeyword(word) {
        return CS_KEYWORD_SET.has(word);
    }

    /**
     * Analysiert C#-Code und erkennt Bezeichner anhand ihrer Deklarations-Syntax.
     * Reine Logik – ohne DOM.
     * @param {string} code
     * @returns {Array<{element:string, type:string, placeholder:string}>}
     */
    function analyzeCSharpElements(code) {
        const text = String(code);
        if (!text.trim()) return [];

        const suffix = uniqueSuffix(text, Object.values(CS_PREFIXES));
        const counters = { class: 1, iface: 1, enum: 1, namespace: 1, method: 1, prop: 1, field: 1, param: 1 };
        const found = new Map(); // element → typeKey (first-seen wins)

        const ID = '[a-zA-Z_][a-zA-Z0-9_]*';

        function push(name, typeKey) {
            if (!name || found.has(name) || isCSharpKeyword(name)) return;
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return;
            found.set(name, typeKey);
        }

        let m;

        // ── Typdeklarationen (sehr zuverlässig) ────────────────────────────
        const classRx = new RegExp('\\bclass\\s+(' + ID + ')', 'g');
        while ((m = classRx.exec(text)) !== null) push(m[1], 'class');

        const ifaceRx = new RegExp('\\binterface\\s+(' + ID + ')', 'g');
        while ((m = ifaceRx.exec(text)) !== null) push(m[1], 'iface');

        const enumRx = new RegExp('\\benum\\s+(' + ID + ')', 'g');
        while ((m = enumRx.exec(text)) !== null) push(m[1], 'enum');

        // ── Namespace (mehrteilig, auf Punkte aufteilen) ────────────────────
        const nsRx = new RegExp('\\bnamespace\\s+(' + ID + '(?:\\.' + ID + ')*)', 'g');
        while ((m = nsRx.exec(text)) !== null) {
            m[1].split('.').forEach(function (part) { push(part, 'namespace'); });
        }

        // ── Member-Deklarationen (mit Modifier als Anker) ───────────────────
        // Modifier-Präfix stellt sicher, dass wir Deklarationen treffen, nicht Aufrufe.
        const MOD = '(?:public|private|protected|internal|static|async|virtual|override' +
                    '|abstract|sealed|new|extern|partial|readonly|const|volatile)';
        const MODS = '\\b' + MOD + '(?:\\s+' + MOD + ')*\\s+';
        // Typtoken: Bezeichner mit optionalen Generics, Array-Suffix, Nullable-Marker
        const TYP = ID + '(?:<[^>]*>)?(?:\\[\\])*\\??\\s+';

        // Methoden: MODS [ReturnType] MethodenName(
        // TYP ist optional, damit Konstruktoren (ohne expliziten Rückgabetyp) ebenfalls erfasst werden.
        const methodRx = new RegExp(MODS + '(?:' + TYP + ')?(' + ID + ')\\s*(?:<[^>]*>\\s*)?\\(', 'g');
        while ((m = methodRx.exec(text)) !== null) push(m[1], 'method');

        // Properties: MODS TYP Name {
        const propRx = new RegExp(MODS + TYP + '(' + ID + ')\\s*\\{', 'g');
        while ((m = propRx.exec(text)) !== null) push(m[1], 'prop');

        // Felder: MODS [readonly|const] TYP Name ; oder =
        const fieldRx = new RegExp(MODS + '(?:readonly\\s+|const\\s+)?' + TYP + '(' + ID + ')\\s*(?:;|=)', 'g');
        while ((m = fieldRx.exec(text)) !== null) push(m[1], 'field');

        // ── Parameter ───────────────────────────────────────────────────────
        // Alle Positionen: (Type name), (Type name, ...), ..., Type name), ..., Type name,
        const paramRx = new RegExp('[,(]\\s*(?:(?:ref|out|in|params)\\s+)?' + TYP + '(' + ID + ')\\s*(?:[,)=])', 'g');
        while ((m = paramRx.exec(text)) !== null) push(m[1], 'param');

        // ── Ergebnis aufbauen ───────────────────────────────────────────────
        const result = [];
        found.forEach(function (typeKey, element) {
            result.push({
                element: element,
                type: CS_TYPE_LABEL[typeKey],
                placeholder: CS_PREFIXES[typeKey] + suffix + counters[typeKey]++
            });
        });
        return result;
    }
```

- [ ] **Step 4: Add new exports to the `return {}` block in `obfuscator-core.js`**

Find the `return {` block at the bottom of the factory function (around line 387). Add three new exports:

```javascript
    return {
        escapeRegex,
        escapeHtml,
        uniqueSuffix,
        wordRegex,
        applyReplacements,
        reverseReplacements,
        analyzeCSharp,
        isSqlReservedWord,
        analyzeSqlStringReplace,
        analyzeSqlElements,
        assignSqlPlaceholders,
        CS_PREFIX,
        SQL_PREFIXES,
        SQL_STR_PREFIX,
        // C# Auto-Analyse:
        analyzeCSharpElements,
        isCSharpKeyword,
        CS_PREFIXES
    };
```

- [ ] **Step 5: Run tests and verify they pass**

```
npm test
```
Expected: all new `analyzeCSharpElements` tests pass. All previously passing tests still pass. No regressions.

- [ ] **Step 6: Commit**

```
git add obfuscator-core.js test/core.test.js
git commit -m "feat(core): add analyzeCSharpElements with type-specific CS_ placeholders"
```

---

### Task 2: UI — state, analyzeCode, renderCsharpSelectionTable, obfuscateCode, deobfuscateCode, saveState/loadState, clearAll

**Files:**
- Modify: `obfuscator.js` — multiple targeted changes
- Modify: `test/integration.test.js` — new test section + ACCESSOR update

**Interfaces:**
- Consumes: `Core.analyzeCSharpElements(code)` → `Array<{element, type, placeholder}>` from Task 1
- Consumes: `Core.analyzeCSharp(code, words)` → existing (unchanged)
- Produces:
  - Module-level `csharpAutoMapping: Map<element, placeholder>` and `reverseCsharpAutoMapping`
  - Module-level `csharpAutoTypeMap: Map<element, typeLabel>` (for display, persisted separately)
  - `renderCsharpSelectionTable(strMap, autoMap, typeMap)` — 3 arguments (breaking change from 1)

- [ ] **Step 1: Write failing integration tests in `test/integration.test.js`**

**1a.** Update the ACCESSOR block (line ~62–68) to expose the new maps. Replace the existing `ACCESSOR` constant:

```javascript
const ACCESSOR = `
;window.__t = {
  size: n => ({ stringReplaceMapping, sqlStringReplaceMapping, sqlMapping, csharpAutoMapping }[n]).size,
  has: (n, k) => ({ stringReplaceMapping, sqlStringReplaceMapping, sqlMapping, csharpAutoMapping }[n]).has(k),
  resetCs: () => {
    stringReplaceMapping = new Map(); reverseStringReplaceMapping = new Map(); replacementHistory = [];
    csharpAutoMapping = new Map(); reverseCsharpAutoMapping = new Map(); csharpAutoTypeMap = new Map();
  },
  resetSql: () => { sqlMapping = new Map(); reverseSqlMapping = new Map(); sqlStringReplaceMapping = new Map(); reverseSqlStringReplaceMapping = new Map(); }
};`;
```

**1b.** Add a `resetCsharpAuto()` helper after the existing `resetCsharp()` function:

```javascript
function resetCsharpAuto() {
    resetCsharp();
    win.__t.resetCs();
}
```

**1c.** Add the following test section after the existing `# C# – Analyse + voller Durchlauf` block:

```javascript
console.log('\n# C# – Auto-Analyse Integration');
(() => {
    resetCsharpAuto();
    setVal('originalCode', 'public class CustomerService { public void GetOrder(int orderId) { } }');
    ev('analyzeCode()');

    it('Auto-Analyse: Auswahl-Sektion sichtbar', () => {
        eq($('csharpMappingSelectionSection').style.display, 'block', 'csharpMappingSelectionSection');
    });
    it('Auto-Analyse: CustomerService als Checkbox vorhanden', () => {
        const cbs = Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'));
        assert(cbs.some(cb => cb.dataset.original === 'CustomerService'), 'CustomerService fehlt');
    });
    it('Auto-Analyse: Tabelle zeigt Typ-Spalte (Klasse)', () => {
        const rows = Array.from(doc.querySelectorAll('#csharpMappingSelectionContainer tbody tr'));
        assert(rows.some(row => row.cells[1] && row.cells[1].textContent === 'Klasse'),
            'Keine Zeile mit Typ "Klasse" gefunden');
    });
    it('Auto-Analyse: Platzhalter beginnt mit CS_CLASS_', () => {
        const cbs = Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'));
        const item = cbs.find(cb => cb.dataset.original === 'CustomerService');
        assert(item && item.dataset.placeholder.startsWith('CS_CLASS_'),
            item ? item.dataset.placeholder : 'CustomerService nicht gefunden');
    });
})();

console.log('\n# C# – Auto-Analyse: Verschleiern + Round-Trip');
(() => {
    resetCsharpAuto();
    const original = 'public class CustomerService { public void GetOrder(int orderId) { } }';
    setVal('originalCode', original);
    ev('analyzeCode()');
    ev('obfuscateCode()');

    const obf = $('obfuscatedCode').value;
    it('verschleierter Code enthält keinen Klassenname mehr', () => {
        assert(!obf.includes('CustomerService'), 'CustomerService noch vorhanden: ' + obf);
    });
    it('verschleierter Code enthält CS_CLASS_ Token', () => {
        assert(/CS_CLASS_\d+/.test(obf), 'Kein CS_CLASS_ Token: ' + obf);
    });

    setVal('aiResponse', obf);
    ev('deobfuscateCode()');
    it('Zurückverwandlung ergibt exakt den Original-Code', () => {
        eq($('finalCode').value, original, 'Round-Trip fehlgeschlagen');
    });
})();

console.log('\n# C# – Gemischter Workflow: String-Replace + Auto-Analyse');
(() => {
    resetCsharpAuto();
    const original = 'public class CustomerService { public string GetOrder(int orderId) { return null; } }';
    setVal('originalCode', original);
    setVal('stringReplace1', 'GetOrder');
    ev('analyzeCode()');

    it('Gemischt: Tabelle enthält Typ "String" (manuell)', () => {
        const cbs = Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'));
        assert(cbs.some(cb => cb.dataset.type === 'String'), 'Kein String-Typ in Tabelle');
    });
    it('Gemischt: Tabelle enthält Typ "Klasse" (auto)', () => {
        const rows = Array.from(doc.querySelectorAll('#csharpMappingSelectionContainer tbody tr'));
        assert(rows.some(r => r.cells[1] && r.cells[1].textContent === 'Klasse'), 'Kein Klasse-Typ');
    });

    ev('obfuscateCode()');
    const obf = $('obfuscatedCode').value;
    it('Gemischt: weder CustomerService noch GetOrder im verschleierten Code', () => {
        assert(!obf.includes('CustomerService') && !obf.includes('GetOrder'),
            'Bezeichner noch vorhanden: ' + obf);
    });

    setVal('aiResponse', obf);
    ev('deobfuscateCode()');
    it('Gemischt: Round-Trip ergibt exakt den Original-Code', () => {
        eq($('finalCode').value, original, 'Round-Trip fehlgeschlagen');
    });
})();

console.log('\n# C# – Auto-Analyse ohne Wörter im String-Replace');
(() => {
    resetCsharpAuto();
    setVal('originalCode', 'public class OrderRepository { private readonly ILogger _logger; }');
    // Keine String-Replace-Wörter eingetragen
    ev('analyzeCode()');
    it('Analyse ohne manuelle Wörter: Auswahl-Sektion trotzdem sichtbar', () => {
        eq($('csharpMappingSelectionSection').style.display, 'block');
    });
    it('Analyse ohne manuelle Wörter: OrderRepository erkannt', () => {
        const cbs = Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'));
        assert(cbs.some(cb => cb.dataset.original === 'OrderRepository'), 'OrderRepository fehlt');
    });
})();

console.log('\n# C# – Deobfuskierung ohne Mapping zeigt Fehler');
(() => {
    resetCsharpAuto();
    setVal('aiResponse', 'CS_CLASS_1 result');
    ev('deobfuscateCode()');
    it('Kein Mapping → Fehlerstatus', () => {
        assert($('statusMessage').className.includes('error'), $('statusMessage').textContent);
    });
})();
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test
```
Expected: new C# auto-analysis integration tests fail (`renderCsharpSelectionTable` still takes 1 arg, `csharpAutoMapping` not defined in ACCESSOR yet).

- [ ] **Step 3: Add new state variables at the top of `obfuscator.js`**

After the existing state declarations (around line 11–18), add:

```javascript
let csharpAutoMapping = new Map();
let reverseCsharpAutoMapping = new Map();
let csharpAutoTypeMap = new Map();
```

- [ ] **Step 4: Replace `renderCsharpSelectionTable(map)` with 3-argument version**

Find and replace the entire `renderCsharpSelectionTable` function:

```javascript
function renderCsharpSelectionTable(strMap, autoMap, typeMap) {
    const container = document.getElementById('csharpMappingSelectionContainer');
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'mapping-selection-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th style="width: 50px;"><input type="checkbox" id="csharpSelectAll" aria-label="Alle auswählen" checked></th>
        <th>Typ</th>
        <th>Original</th>
        <th>Platzhalter</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    strMap.forEach((placeholder, original) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="csharp-mapping-checkbox" data-original="${escapeHtml(original)}" data-placeholder="${escapeHtml(placeholder)}" data-type="String" aria-label="${escapeHtml(original)} verschleiern" checked></td>
            <td>String</td>
            <td class="original">${escapeHtml(original)}</td>
            <td class="obfuscated">${escapeHtml(placeholder)}</td>
        `;
        tbody.appendChild(row);
    });

    autoMap.forEach((placeholder, original) => {
        const typLabel = typeMap ? (typeMap.get(original) || '') : '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="csharp-mapping-checkbox" data-original="${escapeHtml(original)}" data-placeholder="${escapeHtml(placeholder)}" data-type="${escapeHtml(typLabel)}" aria-label="${escapeHtml(original)} verschleiern" checked></td>
            <td>${escapeHtml(typLabel)}</td>
            <td class="original">${escapeHtml(original)}</td>
            <td class="obfuscated">${escapeHtml(placeholder)}</td>
        `;
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    document.getElementById('csharpSelectAll').addEventListener('change', function () {
        document.querySelectorAll('.csharp-mapping-checkbox').forEach(cb => cb.checked = this.checked);
    });
}
```

- [ ] **Step 5: Replace `analyzeCode()`**

```javascript
function analyzeCode() {
    const originalCode = document.getElementById('originalCode').value.trim();
    if (!originalCode) {
        showStatus('Bitte füge zuerst deinen C# Code ein!', 'error');
        return;
    }
    if (!confirmLargeInput(originalCode)) return;

    // Schritt 1: String-Replace-Analyse (bestehend)
    const strAnalyzed = Core.analyzeCSharp(originalCode, getReplaceWords('stringReplace'));
    stringReplaceMapping = new Map(strAnalyzed.map(e => [e.original, e.placeholder]));
    reverseStringReplaceMapping = buildReverse(stringReplaceMapping);

    // Schritt 2: Auto-Analyse (Duplikate aus String-Replace herausfiltern)
    const autoAnalyzed = Core.analyzeCSharpElements(originalCode)
        .filter(e => !stringReplaceMapping.has(e.element));
    csharpAutoMapping = new Map(autoAnalyzed.map(e => [e.element, e.placeholder]));
    reverseCsharpAutoMapping = buildReverse(csharpAutoMapping);
    csharpAutoTypeMap = new Map(autoAnalyzed.map(e => [e.element, e.type]));

    if (stringReplaceMapping.size === 0 && csharpAutoMapping.size === 0) {
        showStatus('Keine Elemente erkannt. Bitte Code einfügen oder Wörter eintragen.', 'error');
        return;
    }

    renderCsharpSelectionTable(stringReplaceMapping, csharpAutoMapping, csharpAutoTypeMap);
    document.getElementById('csharpMappingSelectionSection').style.display = 'block';
    document.getElementById('obfuscatedSection').style.display = 'none';
    document.getElementById('stringReplaceMappingSection').style.display = 'none';
    document.getElementById('aiResponseSection').style.display = 'none';
    document.getElementById('finalSection').style.display = 'none';

    const total = stringReplaceMapping.size + csharpAutoMapping.size;
    showStatus(`${total} Elemente erkannt. Bitte Auswahl treffen und "Verschleiern" klicken.`);
    saveState();
}
```

- [ ] **Step 6: Replace `obfuscateCode()`**

```javascript
function obfuscateCode() {
    const originalCode = document.getElementById('originalCode').value.trim();
    if (!originalCode) {
        showStatus('Bitte füge zuerst deinen C# Code ein!', 'error');
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('.csharp-mapping-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showStatus('Bitte wähle mindestens ein Element aus!', 'error');
        return;
    }

    // Checkboxen nach Typ trennen
    stringReplaceMapping = new Map();
    replacementHistory = [];
    csharpAutoMapping = new Map();

    selectedCheckboxes.forEach(cb => {
        const original = cb.dataset.original;
        const placeholder = cb.dataset.placeholder;
        if (cb.dataset.type === 'String') {
            stringReplaceMapping.set(original, placeholder);
            replacementHistory.push({ placeholder, original });
        } else {
            csharpAutoMapping.set(original, placeholder);
        }
    });
    reverseStringReplaceMapping = buildReverse(stringReplaceMapping);
    reverseCsharpAutoMapping = buildReverse(csharpAutoMapping);

    // Schritt 1: String-Replace zuerst
    let obfuscatedCode = Core.applyReplacements(
        originalCode,
        Array.from(stringReplaceMapping.entries()).map(([from, to]) => ({ from, to }))
    );

    // Schritt 2: Auto-Mapping danach
    obfuscatedCode = Core.applyReplacements(
        obfuscatedCode,
        Array.from(csharpAutoMapping.entries()).map(([from, to]) => ({ from, to }))
    );

    document.getElementById('obfuscatedCode').value = obfuscatedCode;
    document.getElementById('obfuscatedSection').style.display = 'block';
    document.getElementById('aiResponseSection').style.display = 'block';
    document.getElementById('csharpMappingSelectionSection').style.display = 'none';

    updateStringReplaceMappingDisplay();
    document.getElementById('stringReplaceMappingSection').style.display =
        stringReplaceMapping.size > 0 ? 'block' : 'none';

    const total = stringReplaceMapping.size + csharpAutoMapping.size;
    showStatus(`Code erfolgreich verschleiert! ${total} Elemente ersetzt.`);
    saveState();
}
```

- [ ] **Step 7: Replace `deobfuscateCode()`**

```javascript
function deobfuscateCode() {
    const aiResponse = document.getElementById('aiResponse').value.trim();
    if (!aiResponse) {
        showStatus('Bitte füge zuerst die KI-Antwort ein!', 'error');
        return;
    }
    if (replacementHistory.length === 0 && reverseCsharpAutoMapping.size === 0) {
        showStatus('Kein Mapping verfügbar! Bitte verschleiere zuerst deinen Code.', 'error');
        return;
    }

    // Schritt 1: Auto-Mapping zuerst rückgängig
    let finalCode = Core.reverseReplacements(aiResponse,
        Array.from(reverseCsharpAutoMapping.entries())
            .map(([placeholder, original]) => ({ placeholder, original }))
    );

    // Schritt 2: String-Replace rückgängig
    finalCode = Core.reverseReplacements(finalCode, replacementHistory);

    document.getElementById('finalCode').value = finalCode;
    document.getElementById('finalSection').style.display = 'block';
    const total = replacementHistory.length + reverseCsharpAutoMapping.size;
    showStatus(`Code erfolgreich zurückverwandelt! ${total} Elemente wiederhergestellt.`);
    saveState();
}
```

- [ ] **Step 8: Update `captureCsharpSelection()` to capture `data-type`**

Replace the existing function:

```javascript
function captureCsharpSelection() {
    const rows = document.querySelectorAll('.csharp-mapping-checkbox');
    if (rows.length === 0) return null;
    return Array.from(rows).map(cb => ({
        original: cb.dataset.original,
        placeholder: cb.dataset.placeholder,
        type: cb.dataset.type || '',
        checked: cb.checked
    }));
}
```

- [ ] **Step 9: Update `restoreCsharpSelection()` to rebuild both maps and call 3-arg render**

Replace the existing function:

```javascript
function restoreCsharpSelection(selection) {
    const strMap = new Map();
    const autoMap = new Map();
    const typeMap = new Map();

    selection.forEach(s => {
        if (s.type === 'String') {
            strMap.set(s.original, s.placeholder);
        } else {
            autoMap.set(s.original, s.placeholder);
            typeMap.set(s.original, s.type || '');
        }
    });

    // Modul-State synchronisieren (für eventuelle Folge-Aktionen ohne erneute Analyse)
    csharpAutoTypeMap = new Map(typeMap);

    renderCsharpSelectionTable(strMap, autoMap, typeMap);
    document.querySelectorAll('.csharp-mapping-checkbox').forEach(cb => {
        const item = selection.find(s => s.original === cb.dataset.original);
        if (item) cb.checked = item.checked;
    });
    syncSelectAll('csharpSelectAll', '.csharp-mapping-checkbox');
}
```

- [ ] **Step 10: Update `saveState()` — add two new fields to the `csharp:` block**

In `saveState()`, find the `csharp:` object. After the existing `replacementHistory: replacementHistory,` line, add:

```javascript
csharpAutoMapping: Array.from(csharpAutoMapping.entries()),
csharpAutoTypeMap: Array.from(csharpAutoTypeMap.entries()),
```

- [ ] **Step 11: Update `loadState()` — restore new C# state**

In `loadState()`, inside the `if (state.csharp)` block, after the line:
```javascript
stringReplaceMapping = new Map(cs.stringReplaceMapping || []);
```
Add:
```javascript
csharpAutoMapping = new Map(cs.csharpAutoMapping || []);
reverseCsharpAutoMapping = buildReverse(csharpAutoMapping);
csharpAutoTypeMap = new Map(cs.csharpAutoTypeMap || []);
```

- [ ] **Step 12: Update `clearAll()` — reset new state**

In `clearAll()`, after `replacementHistory = [];`, add:

```javascript
csharpAutoMapping = new Map();
reverseCsharpAutoMapping = new Map();
csharpAutoTypeMap = new Map();
```

- [ ] **Step 13: Fix existing integration test that breaks after auto-analysis is added**

In `test/integration.test.js`, find the existing test at line ~138:

```javascript
it('Checkbox-Anzahl == Mapping-Anzahl', () => eq(doc.querySelectorAll('.csharp-mapping-checkbox').length, size('stringReplaceMapping')));
```

Replace with (auto-analysis adds more checkboxes than just string-replace):

```javascript
it('Checkbox-Anzahl == String-Replace + Auto-Mapping', () => {
    const total = size('stringReplaceMapping') + size('csharpAutoMapping');
    eq(doc.querySelectorAll('.csharp-mapping-checkbox').length, total,
        `Checkboxen: ${doc.querySelectorAll('.csharp-mapping-checkbox').length}, Maps: ${total}`);
});
```

- [ ] **Step 14: Run all tests**

```
npm test
```
Expected: all new C# auto-analysis integration tests pass. All previously passing tests still pass.

- [ ] **Step 14: Commit**

```
git add obfuscator.js test/integration.test.js
git commit -m "feat(ui): extend C# tab with auto-analysis, unified Typ column, state persistence"
```

---

### Task 3: HTML — info-box text update

**Files:**
- Modify: `obfuscator.html` — one text change only

**Interfaces:**
- No new interfaces — visual-only change

- [ ] **Step 1: Update the C# tab info-box**

In `obfuscator.html`, find the C# tab info-box (around line 34–37):

```html
<div class="info-box">
    <strong>Anleitung:</strong> Füge deinen originalen C# Code ein → Trage Wörter für String-Replace ein →
    Klicke "Analysieren" → Wähle Elemente aus → Klicke "Verschleiern" → Kopiere den verschleierten Code für KI →
    Füge KI-Antwort ein → Klicke "Zurückverwandeln"
</div>
```

Replace with:

```html
<div class="info-box">
    <strong>Anleitung:</strong> Füge deinen originalen C# Code ein → Trage optional Wörter für String-Replace ein →
    Klicke "Analysieren" (erkennt automatisch Klassen, Methoden, Properties u.v.m.) →
    Wähle Elemente aus → Klicke "Verschleiern" → Kopiere den verschleierten Code für KI →
    Füge KI-Antwort ein → Klicke "Zurückverwandeln"
</div>
```

- [ ] **Step 2: Run full test suite**

```
npm test
```
Expected: all tests pass (core, integration, smoke).

- [ ] **Step 3: Manual browser verification**

Open `obfuscator.html` (double-click). Paste this test code in the C# Originaler Code field:

```csharp
namespace MyCompany.Services
{
    public class CustomerService : ICustomerRepository
    {
        private readonly ILogger _logger;
        public string CustomerName { get; set; }

        public async Task<Customer> GetCustomerById(int customerId)
        {
            return await _repository.FindById(customerId);
        }
    }
}
```

Click "Code Analysieren". Verify:
- Selection table appears with a Typ column as the second column
- `CustomerService` → type "Klasse", placeholder `CS_CLASS_1`
- `GetCustomerById` → type "Methode", placeholder `CS_METHOD_1`
- `CustomerName` → type "Property", placeholder `CS_PROP_1`
- `_logger` → type "Feld", placeholder `CS_FIELD_1`
- `customerId` → type "Parameter", placeholder `CS_PARAM_1`
- `MyCompany` and `Services` → type "Namespace"
- `ICustomerRepository` → type "Interface"
- C# keywords (`public`, `async`, `readonly`, `string`) do NOT appear in the table

Click "Ausgewählte Elemente Verschleiern". Verify:
- Obfuscated code contains `CS_CLASS_`, `CS_METHOD_`, `CS_PROP_` tokens
- No original identifier names remain in the obfuscated code

Paste the obfuscated code into the "KI-Antwort" field. Click "Zurückverwandeln". Verify:
- Final code matches the original code exactly (byte-for-byte)

- [ ] **Step 4: Commit**

```
git add obfuscator.html
git commit -m "feat(html): update C# info-box to mention auto-analysis"
```
