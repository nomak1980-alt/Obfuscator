'use strict';
/**
 * End-to-End-Smoke-Test: lädt die echte obfuscator.html samt externer Scripts
 * in jsdom, feuert DOMContentLoaded und prüft, dass die data-action-Delegation
 * (CSP-konformes Ersetzen der Inline-onclick-Handler) tatsächlich funktioniert.
 *   node test/smoke.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function it(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.error('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}

JSDOM.fromFile(path.join(__dirname, '..', 'obfuscator.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
}).then(dom => {
    const win = dom.window;
    win.navigator.clipboard = { writeText: () => Promise.resolve() };
    // Warten bis externe Scripts geladen sind und DOMContentLoaded lief.
    win.addEventListener('load', () => {
        const doc = win.document;
        const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

        // 1) Tab-Umschaltung via data-action
        click(doc.getElementById('tab-mssql'));
        it('Tab-Wechsel via data-action aktiviert MS SQL', doc.getElementById('mssql-tab').classList.contains('active'));
        it('MS-SQL-Panel ist nicht mehr hidden', !doc.getElementById('mssql-tab').hasAttribute('hidden'));
        it('aria-selected korrekt gesetzt', doc.getElementById('tab-mssql').getAttribute('aria-selected') === 'true');

        click(doc.getElementById('tab-csharp'));

        // 2) Analyse via data-action-Button
        doc.getElementById('originalCode').value = 'class Foo { Bar Baz; }';
        doc.getElementById('stringReplace1').value = 'Bar';
        const analyzeBtn = doc.querySelector('[data-action="analyzeCode"]');
        click(analyzeBtn);
        it('Analyse-Button erzeugt Auswahl-Checkbox', doc.querySelectorAll('.csharp-mapping-checkbox').length > 0);
        it('Auswahl-Sektion sichtbar', doc.getElementById('csharpMappingSelectionSection').style.display === 'block');

        // 3) Verschleiern via data-action
        click(doc.querySelector('[data-action="obfuscateCode"]'));
        it('Verschleiern ersetzt Bezeichner', !/\bBar\b/.test(doc.getElementById('obfuscatedCode').value));

        console.log(`\n──────────────────────────────────────────`);
        console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
        process.exit(fail ? 1 : 0);
    });
}).catch(err => { console.error(err); process.exit(1); });
