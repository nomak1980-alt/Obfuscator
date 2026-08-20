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

        // 1b) K4: Tabliste per Pfeiltaste erreichbar
        doc.getElementById('tab-csharp').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        it('ArrowRight auf Tabliste aktiviert MS SQL', doc.getElementById('tab-mssql').classList.contains('active'));
        doc.getElementById('tab-mssql').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        it('ArrowLeft auf Tabliste aktiviert wieder C#', doc.getElementById('tab-csharp').classList.contains('active'));

        // 2) Analyse via data-action-Button
        const UI = win.ObfuscatorUI;
        // Feld-Deklarationen wie „Bar Baz;" erkennt die Analyse außerhalb einer
        // Methode nicht (geprüft: nur Bar/String und Foo/Klasse entstehen daraus) –
        // die Methode Qux(quux) liefert die dritte Zeile für die Shift-Bereichsauswahl weiter unten.
        doc.getElementById('originalCode').value = 'class Foo { Bar Baz; public void Qux(int quux) { } }';
        UI.addChip('Bar', UI._state.csharpReplaceWords, 'stringReplaceChips');
        const analyzeBtn = doc.querySelector('[data-action="analyzeCode"]');
        click(analyzeBtn);
        it('Analyse-Button erzeugt Auswahl-Checkbox', doc.querySelectorAll('.csharp-mapping-checkbox').length > 0);
        it('Auswahl-Sektion sichtbar', doc.getElementById('csharpMappingSelectionSection').style.display === 'block');

        // 2b) U8: Zähler reagiert live auf Checkbox-Änderungen (echte Event-Delegation)
        const counterBefore = doc.getElementById('csharpSelectionCounter').textContent;
        it('Zähler zeigt initial "x von x ausgewählt"', /^\d+ von \d+ ausgewählt$/.test(counterBefore));
        const [checkedBefore, total] = counterBefore.match(/(\d+) von (\d+)/).slice(1).map(Number);
        const firstCb = doc.querySelector('.csharp-mapping-checkbox');
        firstCb.checked = false;
        firstCb.dispatchEvent(new win.Event('change', { bubbles: true }));
        it('Zähler aktualisiert sich nach Checkbox-Änderung', doc.getElementById('csharpSelectionCounter').textContent === `${checkedBefore - 1} von ${total} ausgewählt`);
        firstCb.checked = true;
        firstCb.dispatchEvent(new win.Event('change', { bubbles: true })); // Auswahl für den nächsten Schritt wiederherstellen

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

        // 3) Verschleiern via data-action
        click(doc.querySelector('[data-action="obfuscateCode"]'));
        it('Verschleiern ersetzt Bezeichner', !/\bBar\b/.test(doc.getElementById('obfuscatedCode').value));

        console.log(`\n──────────────────────────────────────────`);
        console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
        process.exit(fail ? 1 : 0);
    });
}).catch(err => { console.error(err); process.exit(1); });
