'use strict';
/**
 * T7: Layout-Zusicherungen, die jsdom grundsätzlich nicht prüfen kann (jsdom
 * rechnet kein Layout) – echtes Chromium via Playwright. Deckt U1 (Mobile
 * .code-row), U2 (horizontales Scrollen) und U3 (Toast-Überlagerung) ab.
 *   node test/layout.test.js
 */
const path = require('path');
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function it(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.error('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}

(async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const consoleErrors = [];
        page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        page.on('pageerror', err => consoleErrors.push(String(err)));

        await page.goto('file://' + path.join(__dirname, '..', 'obfuscator.html'));

        // U2: kein horizontales Scrollen bei 390px
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
        }));
        it('kein horizontales Scrollen bei 390px Breite', scrollWidth <= clientWidth,
            `scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`);

        // U1: .code-row ist unter 768px einspaltig
        const codeRowCols = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.code-row')).gridTemplateColumns.split(' ').length);
        it('.code-row ist bei 390px einspaltig', codeRowCols === 1, `${codeRowCols} Spalten`);

        // U3: gleichzeitige Toasts überlappen nicht
        await page.evaluate(() => { ObfuscatorUI.notifyGlobal('Export ok'); ObfuscatorUI.showStatus('Analyse ok'); });
        const overlap = await page.evaluate(() => {
            const g = document.getElementById('globalMessage').getBoundingClientRect();
            const s = document.getElementById('statusMessage').getBoundingClientRect();
            const noOverlap = g.bottom <= s.top || s.bottom <= g.top;
            return !noOverlap;
        });
        it('zwei gleichzeitige Toasts überlappen sich nicht', !overlap);

        it('keine Konsolenfehler beim Laden/Interagieren', consoleErrors.length === 0, consoleErrors.join('\n      '));

        // Desktop: .code-row zweispaltig (Regressionsschutz für U1-Fix)
        await page.setViewportSize({ width: 1920, height: 1080 });
        const desktopCols = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.code-row')).gridTemplateColumns.split(' ').length);
        it('.code-row ist am Desktop (1920px) zweispaltig', desktopCols === 2, `${desktopCols} Spalten`);

        // Finding 3: Tastatur-Bereichsauswahl (Tab + Shift+Leertaste). Die Spec
        // behauptete früher, es gäbe dafür keinen Tastaturweg – das stimmt nicht:
        // Der Browser löst beim Drücken der Leertaste auf einer fokussierten
        // Checkbox von sich aus ein echtes click-Event mit shiftKey aus, und die
        // delegierte Klick-Behandlung unterscheidet nicht zwischen Maus- und
        // Tastatur-Ursprung. jsdom synthetisiert diesen Browser-Automatismus
        // nicht (kein click aus Shift+Space) – deshalb hier über echtes Chromium,
        // auf einer eigenen Seite mit eigenem Viewport, unabhängig von den
        // Layout-Zusicherungen oben.
        const kbPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        try {
            await kbPage.goto('file://' + path.join(__dirname, '..', 'obfuscator.html'));
            await kbPage.fill('#originalCode',
                'class Foo { public int Alpha; public int Beta; public int Gamma; public int Delta; }');
            await kbPage.click('[data-action="analyzeCode"]');

            const kbBoxes = kbPage.locator('.csharp-mapping-checkbox');
            await kbBoxes.nth(4).waitFor();
            const kbCount = await kbBoxes.count();
            it('Tastaturtest: Analyse erzeugt mindestens 5 Auswahlzeilen', kbCount >= 5, `${kbCount} Zeilen`);

            // Zeile 0 fokussieren und mit Leertaste umschalten (checked → unchecked,
            // setzt zugleich den Anker der Bereichsauswahl).
            await kbBoxes.nth(0).focus();
            await kbPage.keyboard.press('Space');
            // Drei Tabs zu Zeile 3 – Zeilen 1 und 2 bleiben dabei unbesucht ("dazwischen").
            for (let i = 0; i < 3; i++) await kbPage.keyboard.press('Tab');
            await kbPage.keyboard.down('Shift');
            await kbPage.keyboard.press('Space');
            await kbPage.keyboard.up('Shift');

            const kbStates = await kbBoxes.evaluateAll(els => els.map(el => el.checked));
            it('Tastatur-Bereichsauswahl: Anker-Zeile (0) ist abgehakt',
                kbStates[0] === false, kbStates.join(', '));
            it('Tastatur-Bereichsauswahl: nur per Tab übersprungene Zeilen dazwischen (1, 2) übernehmen den Anker-Zustand',
                kbStates[1] === false && kbStates[2] === false, kbStates.join(', '));
            it('Tastatur-Bereichsauswahl: Ziel-Zeile (3) übernimmt ebenfalls den Anker-Zustand',
                kbStates[3] === false, kbStates.join(', '));
            it('Tastatur-Bereichsauswahl: Zeile außerhalb der Spanne (4) bleibt unverändert',
                kbStates[4] === true, kbStates.join(', '));
        } finally {
            await kbPage.close();
        }

        // Sticky-Knopfleiste der Auswahl und Rücksprung zu Schritt 2, je Tab.
        // Lange Liste (80 Elemente) erzwingt eine Tabelle über mehrere
        // Fensterhöhen.
        const cases = [
            {
                name: 'C#', tab: 'csharp', input: '#originalCode', analyze: 'analyzeCode',
                obfuscate: 'obfuscateCode', section: '#csharpMappingSelectionSection',
                code: 'class Foo { ' + Array.from({ length: 80 }, (_, i) => `public int Feld${i};`).join(' ') + ' }'
            },
            {
                name: 'SQL', tab: 'mssql', prefix: 'sql', input: '#sqlOriginalCode', analyze: 'analyzeSqlCode',
                obfuscate: 'obfuscateSqlCode', section: '#sqlMappingSelectionSection',
                code: 'SELECT ' + Array.from({ length: 80 }, (_, i) => `t.Spalte${i}`).join(', ') + ' FROM dbo.Tabelle t'
            }
        ];
        for (const c of cases) {
            const prefix = c.prefix || c.tab;
            const sp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
            try {
                await sp.goto('file://' + path.join(__dirname, '..', 'obfuscator.html'));
                await sp.click(`[data-action="switchTab"][data-tab="${c.tab}"]`);
                await sp.fill(c.input, c.code);
                await sp.click(`[data-action="${c.analyze}"]`);
                const bar = sp.locator(`${c.section} .selection-action-bar`);
                await bar.waitFor();

                // Oberkante der Tabelle ins Bild: Leiste muss am Fensterrand kleben.
                await sp.evaluate(sel => document.querySelector(sel + ' table').scrollIntoView({ block: 'start' }), c.section);
                const mid = await sp.evaluate(sel => {
                    const b = document.querySelector(sel + ' .selection-action-bar').getBoundingClientRect();
                    const t = document.querySelector(sel + ' table').getBoundingClientRect();
                    return { barBottom: b.bottom, tableBottom: t.bottom, vh: window.innerHeight };
                }, c.section);
                it(`${c.name}: Tabelle ist länger als das Fenster`, mid.tableBottom > mid.vh, JSON.stringify(mid));
                it(`${c.name}: Knopfleiste klebt am unteren Fensterrand`,
                    Math.abs(mid.barBottom - mid.vh) <= 1, JSON.stringify(mid));
                it(`${c.name}: Zähler steht in der Knopfleiste`,
                    await bar.locator(`#${prefix}SelectionCounter`).count() === 1);

                // Ende der Sektion ins Bild: Leiste sitzt unter der Tabelle.
                await sp.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'end' }), c.section);
                const end = await sp.evaluate(sel => {
                    const b = document.querySelector(sel + ' .selection-action-bar').getBoundingClientRect();
                    const t = document.querySelector(sel + ' table').getBoundingClientRect();
                    const s = document.querySelector(sel).getBoundingClientRect();
                    return { barTop: b.top, barBottom: b.bottom, tableBottom: t.bottom, secBottom: s.bottom };
                }, c.section);
                it(`${c.name}: am Tabellenende sitzt die Leiste unter der Tabelle`,
                    end.barTop >= end.tableBottom - 1 && Math.abs(end.barBottom - end.secBottom) <= 1, JSON.stringify(end));

                await sp.click(`[data-action="${c.obfuscate}"]`);
                await sp.click(`.wf-step[data-wf-prefix="${prefix}"][data-wf-step="2"]`);
                const back = await sp.evaluate(sel => {
                    const s = document.querySelector(sel);
                    return {
                        collapsed: s.classList.contains('collapsed'),
                        tableVisible: s.querySelector('table').getBoundingClientRect().height > 0,
                        chevrons: s.querySelectorAll('.chevron').length
                    };
                }, c.section);
                it(`${c.name}: nach Schritt 3 → Schritt 2 ist die Auswahl offen`,
                    !back.collapsed && back.tableVisible, JSON.stringify(back));
                it(`${c.name}: Auswahl-Überschrift hat keinen Ausklapp-Chevron mehr`, back.chevrons === 0);
            } finally {
                await sp.close();
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n──────────────────────────────────────────`);
    console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
    process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
