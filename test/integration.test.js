'use strict';
/**
 * Integrationstests der DOM-Schicht (obfuscator.js + obfuscator-core.js) –
 * laufen headless via jsdom.  node test/integration.test.js
 *
 * Hinweis: Die State-Variablen (stringReplaceMapping …) sind per `let` deklariert
 * und damit keine window-Properties – Zugriff erfolgt daher über win.eval().
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const coreSrc = fs.readFileSync(path.join(__dirname, '..', 'obfuscator-core.js'), 'utf8');
const glueSrc = fs.readFileSync(path.join(__dirname, '..', 'obfuscator.js'), 'utf8');

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

const dom = new JSDOM(`<!DOCTYPE html><html><body>${HIDDEN_DOM}</body></html>`,
    { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const win = dom.window;
win.navigator.clipboard = { writeText: () => Promise.resolve() };
win.confirm = () => true;

const ev = code => win.eval(code);
ev(coreSrc);
// Test-Accessor im selben Scope wie die State-Variablen anhängen, damit der
// Harness die per `let` deklarierten Maps lesen/zurücksetzen kann.
const ACCESSOR = `
;window.__t = {
  size: n => ({ stringReplaceMapping, sqlStringReplaceMapping, sqlMapping, csharpAutoMapping }[n]).size,
  has: (n, k) => ({ stringReplaceMapping, sqlStringReplaceMapping, sqlMapping, csharpAutoMapping }[n]).has(k),
  resetCs: () => {
    stringReplaceMapping = new Map(); reverseStringReplaceMapping = new Map(); replacementHistory = [];
    csharpAutoMapping = new Map(); reverseCsharpAutoMapping = new Map(); csharpAutoTypeMap = new Map();
    csharpReplaceWords.length = 0;
  },
  resetSql: () => {
    sqlMapping = new Map(); reverseSqlMapping = new Map(); sqlStringReplaceMapping = new Map();
    reverseSqlStringReplaceMapping = new Map(); sqlReplaceWords.length = 0;
  }
};
;window.__csharpWords = csharpReplaceWords;
;window.__sqlWords = sqlReplaceWords;`;
ev(glueSrc + '\n' + ACCESSOR);
ev('saveState = () => {}; clearSavedState = () => {};');
win.localStorage.clear();

const doc = win.document;
const $ = id => doc.getElementById(id);
const setVal = (id, v) => { $(id).value = v; };
const size = name => win.__t.size(name);
const has = (name, key) => win.__t.has(name, key);

let pass = 0, fail = 0;
function it(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (e) { fail++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}
function eq(a, b, label) { if (a !== b) throw new Error(`${label || ''} erwartet ${JSON.stringify(b)}, erhalten ${JSON.stringify(a)}`); }
function assert(c, msg) { if (!c) throw new Error(msg || 'Assertion fehlgeschlagen'); }

function resetCsharp() {
    ['originalCode', 'obfuscatedCode', 'aiResponse', 'finalCode']
        .forEach(id => setVal(id, ''));
    win.__t.resetCs();
    ['csharpMappingSelectionSection', 'obfuscatedSection', 'stringReplaceMappingSection', 'aiResponseSection', 'finalSection']
        .forEach(id => { $(id).style.display = 'none'; });
    $('csharpMappingSelectionContainer').innerHTML = '';
    const chips = $('stringReplaceChips');
    if (chips) chips.innerHTML = '';
}
function resetCsharpAuto() {
    resetCsharp();
    win.__t.resetCs();
}
function resetSql() {
    ['sqlOriginalCode', 'sqlObfuscatedCode', 'sqlAiResponse', 'sqlFinalCode']
        .forEach(id => setVal(id, ''));
    win.__t.resetSql();
    ['sqlStringReplaceMappingSection', 'sqlMappingSelectionSection', 'sqlMappingSection', 'sqlObfuscatedSection', 'sqlAiResponseSection', 'sqlFinalSection']
        .forEach(id => { $(id).style.display = 'none'; });
    $('sqlMappingSelectionContainer').innerHTML = '';
    const chips = $('sqlStringReplaceChips');
    if (chips) chips.innerHTML = '';
}

const CSHARP_CODE = `public class CustomerService {
    private readonly CustomerRepository repository;

    public CustomerService(CustomerRepository repo) {
        this.repository = repo;
    }

    public Customer GetCustomer(int userId) {
        return repository.FindById(userId);
    }

    public List<Customer> GetAllCustomers() {
        return repository.GetAll();
    }
}`;

const SQL_CODE = `SELECT u.UserId, u.UserName, u.Email
FROM Users u
INNER JOIN Orders o ON u.UserId = o.UserId
WHERE u.IsActive = 1
ORDER BY u.UserName`;

console.log('\n# C# – Analyse + voller Durchlauf');
(() => {
    resetCsharp();
    setVal('originalCode', CSHARP_CODE);
    ev("addChip('CustomerService', window.__csharpWords, 'stringReplaceChips')");
    ev("addChip('GetCustomer', window.__csharpWords, 'stringReplaceChips')");
    ev("addChip('userId', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()');

    it('erkennt mindestens 3 Elemente', () => assert(size('stringReplaceMapping') >= 3, `Gefunden: ${size('stringReplaceMapping')}`));
    it('CustomerService gefunden', () => assert(has('stringReplaceMapping', 'CustomerService')));
    it('Auswahl-Sektion sichtbar', () => eq($('csharpMappingSelectionSection').style.display, 'block'));
    it('Checkbox-Anzahl == String-Replace + Auto-Mapping', () => {
        const total = size('stringReplaceMapping') + size('csharpAutoMapping');
        eq(doc.querySelectorAll('.csharp-mapping-checkbox').length, total,
            `Checkboxen: ${doc.querySelectorAll('.csharp-mapping-checkbox').length}, Maps: ${total}`);
    });
    it('alle Checkboxen angehakt', () => assert(Array.from(doc.querySelectorAll('.csharp-mapping-checkbox')).every(cb => cb.checked)));

    ev('obfuscateCode()');
    const obf = $('obfuscatedCode').value;
    it('keine Original-Bezeichner mehr im verschleierten Code', () => {
        assert(!obf.includes('CustomerService') && !obf.includes('GetCustomer') && !/\buserId\b/.test(obf), obf);
    });
    it('STR_PLACEHOLDER-Tokens vorhanden', () => assert(obf.includes('STR_PLACEHOLDER_')));

    setVal('aiResponse', obf);
    ev('deobfuscateCode()');
    it('Round-Trip byte-genau identisch', () => eq($('finalCode').value, CSHARP_CODE));
    it('finalSection sichtbar', () => eq($('finalSection').style.display, 'block'));
})();

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
    ev("addChip('GetOrder', window.__csharpWords, 'stringReplaceChips')");
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

console.log('\n# C# – Teilauswahl + Abbruchfälle');
(() => {
    resetCsharp();
    setVal('originalCode', CSHARP_CODE);
    ev("addChip('CustomerService', window.__csharpWords, 'stringReplaceChips')");
    ev("addChip('GetCustomer', window.__csharpWords, 'stringReplaceChips')");
    ev("addChip('userId', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()');
    doc.querySelectorAll('.csharp-mapping-checkbox').forEach(cb => cb.checked = false);
    doc.querySelector('.csharp-mapping-checkbox').checked = true;
    ev('obfuscateCode()');
    it('Mapping enthält genau 1 Eintrag', () => eq(size('stringReplaceMapping'), 1));
    setVal('aiResponse', $('obfuscatedCode').value);
    ev('deobfuscateCode()');
    it('Teilauswahl Round-Trip identisch', () => eq($('finalCode').value, CSHARP_CODE));
})();

(() => {
    resetCsharp();
    setVal('originalCode', CSHARP_CODE);
    ev('analyzeCode()');
    it('ohne Wörter: keine String-Replace-Mappings', () => eq(size('stringReplaceMapping'), 0));
    it('ohne Wörter: Auto-Analyse zeigt Sektion (C#-Elemente erkannt)', () => eq($('csharpMappingSelectionSection').style.display, 'block'));
})();

(() => {
    resetCsharp();
    setVal('originalCode', CSHARP_CODE);
    ev("addChip('CustomerService', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()');
    doc.querySelectorAll('.csharp-mapping-checkbox').forEach(cb => cb.checked = false);
    ev('obfuscateCode()');
    it('keine Auswahl: obfuscatedCode bleibt leer', () => eq($('obfuscatedCode').value, ''));
    it('keine Auswahl: obfuscatedSection versteckt', () => assert($('obfuscatedSection').style.display !== 'block'));
})();

console.log('\n# SQL – Analyse + voller Durchlauf');
(() => {
    resetSql();
    setVal('sqlOriginalCode', SQL_CODE);
    ev('analyzeSqlCode()');
    const els = Array.from(doc.querySelectorAll('.sql-mapping-checkbox')).map(cb => ({ el: cb.dataset.element, type: cb.dataset.type }));
    it('erkennt Tabelle Users', () => assert(els.some(e => e.el === 'Users'), els.map(e => e.el).join(',')));
    it('erkennt Tabelle Orders', () => assert(els.some(e => e.el === 'Orders')));
    it('erkennt Feld UserId', () => assert(els.some(e => e.el === 'UserId')));
    it('Users ist Typ Tabelle', () => eq((els.find(e => e.el === 'Users') || {}).type, 'Tabelle'));
    it('Auswahl-Sektion sichtbar', () => eq($('sqlMappingSelectionSection').style.display, 'block'));

    ev('obfuscateSqlCode()');
    const obf = $('sqlObfuscatedCode').value;
    it('SQL-Platzhalter im Code', () => assert(obf.includes('SQL_TABLE_') || obf.includes('SQL_COL_')));
    it('Users nicht mehr im Code', () => assert(!/\bUsers\b/.test(obf)));
    it('Orders nicht mehr im Code', () => assert(!/\bOrders\b/.test(obf)));

    setVal('sqlAiResponse', obf);
    ev('deobfuscateSqlCode()');
    it('SQL Round-Trip byte-genau', () => eq($('sqlFinalCode').value, SQL_CODE));
})();

console.log('\n# SQL – String-Replace-Sets');
(() => {
    resetSql();
    setVal('sqlOriginalCode', SQL_CODE);
    ev("addChip('Users', window.__sqlWords, 'sqlStringReplaceChips')");
    ev("addChip('Orders', window.__sqlWords, 'sqlStringReplaceChips')");
    ev("addChip('UserId', window.__sqlWords, 'sqlStringReplaceChips')");
    ev('analyzeSqlCode()');
    it('mind. 3 String-Replace-Mappings', () => assert(size('sqlStringReplaceMapping') >= 3, `${size('sqlStringReplaceMapping')}`));
    it('Users im SR-Mapping', () => assert(has('sqlStringReplaceMapping', 'Users')));

    ev('obfuscateSqlCode()');
    setVal('sqlAiResponse', $('sqlObfuscatedCode').value);
    ev('deobfuscateSqlCode()');
    it('SQL+SR Round-Trip byte-genau', () => eq($('sqlFinalCode').value, SQL_CODE));
})();

console.log('\n# Sicherheit & Edge-Cases (DOM)');
(() => {
    resetCsharp();
    setVal('originalCode', `var x = "<img src=x onerror=alert(1)>";`);
    ev("addChip('<img src=x onerror=alert(1)>', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()');
    it('XSS: kein <img>-Element in der Auswahltabelle', () =>
        assert($('csharpMappingSelectionContainer').querySelector('img') === null, 'img-Element injiziert!'));
})();

(() => {
    resetCsharp();
    const code = `int PRICE = 5;`;
    setVal('originalCode', code);
    ev("addChip('PRICE', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()'); ev('obfuscateCode()');
    setVal('aiResponse', $('obfuscatedCode').value);
    ev('deobfuscateCode()');
    it('$-sicher: Round-Trip exakt', () => eq($('finalCode').value, code));
})();

(() => {
    resetCsharp();
    const code = `note = "STR_PLACEHOLDER_1"; secret = Token;`;
    setVal('originalCode', code);
    ev("addChip('Token', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()'); ev('obfuscateCode()');
    const obf = $('obfuscatedCode').value;
    it('Kollision: echter STR_PLACEHOLDER_1-String bleibt erhalten', () => assert(obf.includes('STR_PLACEHOLDER_1')));
    setVal('aiResponse', obf);
    ev('deobfuscateCode()');
    it('Kollision: Round-Trip identisch', () => eq($('finalCode').value, code));
})();

(() => {
    resetCsharp();
    const code = `Username = User.Id;`;
    setVal('originalCode', code);
    ev("addChip('User', window.__csharpWords, 'stringReplaceChips')");
    ev('analyzeCode()'); ev('obfuscateCode()');
    const obf = $('obfuscatedCode').value;
    it('Teilwort: Username bleibt unzerstört', () => assert(/Username/.test(obf), obf));
    setVal('aiResponse', obf);
    ev('deobfuscateCode()');
    it('Teilwort: Round-Trip identisch', () => eq($('finalCode').value, code));
})();

console.log(`\n──────────────────────────────────────────`);
console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
