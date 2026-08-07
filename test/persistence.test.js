'use strict';
/**
 * T1: Testet die Persistenzschicht (saveState/loadState) OHNE Mock —
 * in test/integration.test.js ist saveState global durch ein No-op ersetzt,
 * wodurch dieser komplette Pfad (localStorage-Schreiben/-Lesen, Wieder-
 * herstellung von Textfeldern, Chips, Mappings, Auswahl, Sektionen) bisher
 * ungetestet blieb. Lädt die echte obfuscator.html end-to-end.
 *   node test/persistence.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const Core = require('../obfuscator-core.js');

let pass = 0, fail = 0;
function it(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.error('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}

// jsdom verweigert localStorage für file://-Seiten (opaque origin) - für den
// echten End-to-End-Ladepfad wird hier ein minimaler In-Memory-Ersatz mit
// derselben Schnittstelle eingesetzt (funktional identisch für saveState/loadState).
function makeLocalStorageStub() {
    const store = new Map();
    return {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); },
        clear: () => store.clear()
    };
}

JSDOM.fromFile(path.join(__dirname, '..', 'obfuscator.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
}).then(dom => {
    const win = dom.window;
    Object.defineProperty(win, 'localStorage', { value: makeLocalStorageStub(), configurable: true });
    win.navigator.clipboard = { writeText: () => Promise.resolve() };
    win.addEventListener('load', () => {
        const doc = win.document;
        const UI = win.ObfuscatorUI;
        const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

        // ── Zustand aufbauen: C# ────────────────────────────────────────
        doc.getElementById('originalCode').value = 'public class CustomerService { public void GetOrder(int orderId) { } }';
        UI.addChip('GetOrder', UI._state.csharpReplaceWords, 'stringReplaceChips');
        click(doc.querySelector('[data-action="analyzeCode"]'));
        click(doc.querySelector('[data-action="obfuscateCode"]'));
        const obfBefore = doc.getElementById('obfuscatedCode').value;
        it('Vorbereitung C#: obfuscatedCode nicht leer', obfBefore.length > 0);

        // ── Zustand aufbauen: SQL ───────────────────────────────────────
        click(doc.getElementById('tab-mssql'));
        doc.getElementById('sqlOriginalCode').value = 'SELECT Name FROM Kunden';
        click(doc.querySelector('[data-action="analyzeSqlCode"]'));
        click(doc.querySelector('[data-action="obfuscateSqlCode"]'));
        const sqlObfBefore = doc.getElementById('sqlObfuscatedCode').value;
        it('Vorbereitung SQL: sqlObfuscatedCode nicht leer', sqlObfBefore.length > 0);

        // ── Echtes saveState() (kein Mock!) ─────────────────────────────
        UI.saveState();
        const raw = win.localStorage.getItem('obfuscatorAppState_v1');
        it('saveState() schreibt einen Zustand in localStorage', !!raw);

        // ── In-Memory-Zustand zurücksetzen (simuliert frischen Seitenaufbau) ──
        UI.resetCsharpFields();
        UI.resetSqlFields();
        it('nach Reset: obfuscatedCode leer', doc.getElementById('obfuscatedCode').value === '');
        it('nach Reset: sqlObfuscatedCode leer', doc.getElementById('sqlObfuscatedCode').value === '');

        // ── loadState() gegen den echten localStorage-Inhalt ────────────
        UI.loadState();
        it('loadState() stellt originalCode wieder her',
            doc.getElementById('originalCode').value.includes('CustomerService'));
        it('loadState() stellt obfuscatedCode byte-genau wieder her',
            doc.getElementById('obfuscatedCode').value === obfBefore);
        it('loadState() stellt sqlObfuscatedCode byte-genau wieder her',
            doc.getElementById('sqlObfuscatedCode').value === sqlObfBefore);
        it('loadState() stellt String-Replace-Chip wieder her',
            Array.from(doc.querySelectorAll('#stringReplaceChips .chip')).some(c => c.dataset.word === 'GetOrder'));
        it('loadState() stellt Auswahltabelle (Checkboxen) wieder her',
            doc.querySelectorAll('.csharp-mapping-checkbox').length > 0);
        it('loadState() stellt SQL-Auswahltabelle wieder her',
            doc.querySelectorAll('.sql-mapping-checkbox').length > 0);
        it('loadState() macht obfuscatedSection wieder sichtbar',
            doc.getElementById('obfuscatedSection').style.display === 'block');
        it('loadState() macht sqlObfuscatedSection wieder sichtbar',
            doc.getElementById('sqlObfuscatedSection').style.display === 'block');

        // ── Rückverwandeln funktioniert mit dem wiederhergestellten Mapping ──
        doc.getElementById('aiResponse').value = obfBefore;
        click(doc.querySelector('[data-action="deobfuscateCode"]'));
        it('nach Wiederherstellung: Zurückverwandeln liefert Original',
            doc.getElementById('finalCode').value.includes('CustomerService'));

        // ── W10: Mengengerüst des gespeicherten Zustands ────────────────
        const state = JSON.parse(win.localStorage.getItem('obfuscatorAppState_v1'));
        it('W10: Volltext-Kopie lastAnalyzedCode wird nicht mehr gespeichert',
            state.csharp.lastAnalyzedCode === undefined && typeof state.csharp.lastAnalyzedFp === 'string',
            JSON.stringify(Object.keys(state.csharp)));
        it('W10: csharpAutoTypeMap wird nicht mehr gespeichert',
            state.csharp.csharpAutoTypeMap === undefined);
        it('W10: Auswahl liegt im kompakten Tupel-Format vor',
            Array.isArray(state.csharp.selection) && Array.isArray(state.csharp.selection[0]),
            JSON.stringify(state.csharp.selection && state.csharp.selection[0]));
        it('W10: csharpAutoTypeMap wird trotzdem aus der Auswahl abgeleitet',
            UI._state.csharpAutoTypeMap.size > 0, 'typeMap leer nach loadState()');

        // ── W10: Altformat (Objekt-Auswahl + Volltext) muss weiter laden ──
        const altFormat = {
            version: 1,
            currentTab: 'csharp',
            csharp: {
                originalCode: 'public class AltKlasse { }',
                obfuscatedCode: 'public class CS_CLASS_1 { }',
                aiResponse: '', finalCode: '',
                stringReplaceWords: [],
                stringReplaceMapping: [],
                replacementHistory: [],
                csharpAutoMapping: [['AltKlasse', 'CS_CLASS_1']],
                csharpAutoTypeMap: [['AltKlasse', 'Klasse']],
                lastAnalyzedCode: 'public class AltKlasse { }',
                hasObfuscated: true,
                selection: [{ original: 'AltKlasse', placeholder: 'CS_CLASS_1', type: 'Klasse', checked: true }],
                sections: { obfuscatedSection: { display: 'block', collapsed: false } }
            }
        };
        win.localStorage.setItem('obfuscatorAppState_v1', JSON.stringify(altFormat));
        UI.resetCsharpFields();
        UI.loadState();
        it('W10: Altformat – Auswahl im Objektformat wird geladen',
            Array.from(doc.querySelectorAll('.csharp-mapping-checkbox'))
                .some(cb => cb.dataset.original === 'AltKlasse' && cb.checked),
            'Checkboxen: ' + doc.querySelectorAll('.csharp-mapping-checkbox').length);
        it('W10: Altformat – Volltext wird in einen Fingerabdruck überführt',
            UI._state.lastAnalyzedCsharpFp === Core.fingerprint('public class AltKlasse { }'),
            String(UI._state.lastAnalyzedCsharpFp));
        it('W10: Altformat – K1-Schutz greift danach unverändert', (() => {
            doc.getElementById('originalCode').value = 'public class AltKlasse { } // geändert';
            click(doc.querySelector('[data-action="obfuscateCode"]'));
            return doc.getElementById('statusMessage').textContent.includes('erneut analysieren');
        })(), doc.getElementById('statusMessage').textContent);

        console.log(`\n──────────────────────────────────────────`);
        console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
        process.exit(fail ? 1 : 0);
    });
}).catch(err => { console.error(err); process.exit(1); });
