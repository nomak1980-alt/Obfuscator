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
    } finally {
        await browser.close();
    }

    console.log(`\n──────────────────────────────────────────`);
    console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
    process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
