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
        await page.evaluate(() => { notifyGlobal('Export ok'); showStatus('Analyse ok'); });
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
    } finally {
        await browser.close();
    }

    console.log(`\n──────────────────────────────────────────`);
    console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
    process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
