# Release-Review — Obfuscator — 2026-11-20

Commit `789aaee` · Branch `main`
Umfang: `obfuscator.html`, `obfuscator.js`, `obfuscator-core.js`, `obfuscator.css`,
`package.json`, `eslint.config.js`, Testsuite (`test/`)
Vorgängerbericht: [`docs/review/release-review-2026-08-07.md`](release-review-2026-08-07.md) — 54 Befunde, alle behoben

---

## Executive Summary

Seit dem letzten Review wurden zwei sichtbare Features ausgeliefert: der Button
**„Nur String-Replace"** in beiden Auswahltabellen und die **Shift-Bereichsauswahl**.
Beide sind sauber implementiert, gut kommentiert und durch Integrations- sowie
Layout-Tests abgesichert. Die SQL-Geisterzeilenkorrektur (Deduplication per `.filter`)
ist chirurgisch präzise und korrekt.

Die Codebasis bleibt in sehr gutem Zustand: 100 % Coverage auf `obfuscator-core.js`,
251 Tests grün, 0 Lint-Warnungen. Kein einziger der 54 Vorgängerbefunde wurde
regressiert.

Einzige nennenswerte Schwäche ist ein offener `npm audit`-Stand mit 9 Schwachstellen
in devDependencies — kein Produktionsrisiko für die reine HTML/JS-App, aber ein
Rückschritt gegenüber dem letzten „0 vulnerabilities"-Stand. Dazu kommen kleine
UX-Lücken und drei Housekeeping-Punkte.

**Kein kritischer Befund.**

---

## Kritische Probleme

*Keine neuen kritischen Befunde.*
*Alle fünf früheren K-Befunde (K1–K5) sind unverändert behoben.*

---

## Wichtige Verbesserungen

### W12 — Statusmeldung von „Nur String-Replace" stimmt bei aktivem Filter nicht

- **Status:** offen
- **Fundstelle:** `obfuscator.js:629`
- **Auswirkung:** `selectStringReplaceOnly` operiert bewusst über *alle* Zeilen
  (auch ausgefilterte), was der Code-Kommentar korrekt begründet. Die Statusmeldung
  lautet jedoch `${selected} String-Replace-Elemente ausgewählt, ${all.length - selected}
  abgewählt`. Bei aktivem Filter sieht der Nutzer z. B. 7 von 10 Zeilen, die Meldung
  besagt dennoch „5 abgewählt" — die 3 ausgeblendeten Auto-erkannten Zeilen sind darin
  mitgezählt. Für Gelegenheitsnutzer ist das widersprüchlich: sie sehen 2 abgehakte
  Zeilen weniger, die Meldung nennt aber eine höhere Zahl.
- **Empfehlung:** Entweder die Zählformel auf sichtbare Zeilen umstellen
  (`visibleCheckboxes(…).filter(cb => !cb.checked).length`) oder einen Klammerzusatz
  wie `(inkl. gefilterter Zeilen)` an die Meldung hängen, wenn ein Filter aktiv ist.
- **Aufwand:** S

### W13 — npm audit meldet 9 Schwachstellen in Dev-Abhängigkeiten

- **Status:** offen
- **Fundstelle:** `package.json`
- **Auswirkung:** `npm audit` meldet 9 Einträge (3 High, 6 Moderate). Alle betreffen
  `devDependencies`; die ausgelieferte HTML-App enthält keinen dieser Code-Pfade.
  Dennoch: der letzte Bericht stand auf 0 Schwachstellen — der Rückschritt ist
  dokumentationspflichtig und kann CI-Checks stören.
  - **High:** `brace-expansion` (ReDoS-Anfälligkeit), `source-map-js` (DoS),
    `undici` ×3 CVEs (CVE-2025-47279, CVE-2025-32396, CVE-2024-30261) über Playwright.
  - **Moderate:** `glob`, `minimatch`, `@eslint/config-array`, `eslint` (je 1–2 Einträge).
  - `npm audit fix` hebt `brace-expansion` und `source-map-js` ohne Breaking Changes.
    Die `undici`-Kette (Playwright-intern) erfordert `npm audit fix --force` oder ein
    Playwright-Major-Update — beides im CI erst prüfen.
- **Empfehlung:** `npm audit fix` ausführen und danach prüfen, ob ein Playwright-Update
  ohne Breaking Changes die `undici`-Kette schließt.
- **Aufwand:** S

---

## UX- und GUI-Optimierungen

### U14 — Kein visueller Anker-Indikator bei der Shift-Bereichsauswahl

- **Status:** offen
- **Fundstelle:** `obfuscator.js:643–675`, `obfuscator.css`
- **Auswirkung:** Nach einem Klick auf eine Zeile wird der Anker intern gespeichert
  (`rangeAnchors[prefix] = checkbox`), die Zeile erhält jedoch keinerlei visuelle
  Markierung. Bei langen Tabellen oder nach einem Scroll weiß der Nutzer nicht mehr,
  von wo der nächste Shift-Klick starten wird. Die Funktion ist dadurch für Erstnutzer
  kaum entdeckbar und für erfahrene Nutzer gelegentlich überraschend — besonders wenn
  sich Anker-Zeile und Ziel-Zeile außerhalb des sichtbaren Bereichs befinden.
- **Empfehlung:** Der Anker-Zeile per JS eine CSS-Klasse `is-range-anchor` geben
  (dezenter linker Farbbalken, z. B. `border-left: 3px solid #0d7bc2`).
  `handleSelectionClick` setzt die Klasse neu; `applyRangeSelection`,
  `resetCsharpFields` und `resetSqlFields` entfernen sie. Synergieeffekt: das
  Entfernen bei Reset löst gleichzeitig R8 sauber auf.
- **Aufwand:** S

---

## Versteckte Fehler und Risiken

### R8 — `rangeAnchors` wird bei `resetCsharpFields`/`resetSqlFields` nicht geleert

- **Status:** offen
- **Fundstelle:** `obfuscator.js:643` (Deklaration), Reset-Funktionen (ca. Zeile 980 ff.)
- **Auswirkung:** Nach „C#-Daten löschen" oder „SQL-Daten löschen" hält
  `rangeAnchors.csharp`/`.sql` weiterhin die alte DOM-Referenz. Das ist derzeit
  **sicher**: `applyRangeSelection` sucht den Anker in `visibleCheckboxes(…)`, erhält
  `-1` und bricht ab — der nachfolgende Shift-Klick verhält sich wie ein normaler Klick.
  Kritisch wird die Stale-Referenz, sobald zukünftiger Code — z. B. eine CSS-Klasse
  für U14 — unkritisch auf den Anker zugreift, ohne `-1` zu prüfen.
- **Empfehlung:** Am Ende von `resetCsharpFields` `rangeAnchors.csharp = null` setzen,
  analog für `resetSqlFields`. Bei Umsetzung von U14 ist das zwingend nötig, um die
  Anker-CSS-Klasse vom nicht mehr existierenden Element zu entfernen.
- **Aufwand:** XS

---

## Quick Wins

### Q9 — Redundante Checkbox-Initialisierung in `analyzeSqlCode()`

- **Status:** offen
- **Fundstelle:** `obfuscator.js:1008–1010`
- **Auswirkung:** Nach dem Aufruf von `displaySqlMappingSelection()` (der intern
  `renderSelectionTable` aufruft, das alle Checkboxen bereits mit `checked` rendert)
  werden dieselben Checkboxen und `sqlSelectAll` nochmals explizit auf `checked = true`
  gesetzt:

  ```js
  document.querySelectorAll('.sql-mapping-checkbox').forEach(cb => cb.checked = true);
  const selectAll = document.getElementById('sqlSelectAll');
  if (selectAll) selectAll.checked = true;
  ```

  Drei Zeilen toter Code; bei einer späteren Refaktorierung könnten sie irrtümlich als
  kanonische Initialisierungsstelle behandelt werden.
- **Empfehlung:** Zeilen 1008–1010 ersatzlos entfernen.
- **Aufwand:** XS

---

## Testlücken

### T11 — Kein Test für das R8-Fallback-Verhalten nach einem Reset

- **Status:** offen
- **Fundstelle:** `test/integration.test.js`
- **Auswirkung:** Das sichere Degenierungsverhalten bei staler `rangeAnchors`-Referenz
  — `indexOf` liefert `-1`, Shift-Klick agiert wie normaler Klick — ist nicht durch
  einen eigenen Testfall abgesichert. Wer in Zukunft `applyRangeSelection` ändert
  (z. B. für U14), bekommt keinen automatischen Hinweis, falls das Fallback verloren geht.
- **Empfehlung:** Testfall hinzufügen: Analyse → Anker setzen →
  `resetCsharpFields` → neue Analyse → Shift-Klick auf eine Zeile: das Ergebnis
  darf keine Bereichsauswahl sein, sondern muss wie ein normaler Einzelklick wirken.
- **Aufwand:** S

---

## Finale Bewertung

| Kategorie | Note | Begründung |
|---|---|---|
| Architektur | 9/10 | Kern/UI-Trennung beibehalten; neue Features fügen sich organisch ein; minimale State-Unordnung (R8) |
| Stabilität | 9/10 | 251 Tests, 100 % Core-Coverage, 0 Lint-Warnungen; SQL-Geisterzeilenfix korrekt |
| Wartbarkeit | 9/10 | Gut kommentierter neuer Code; minimale Redundanz (Q9); keine technischen Schulden angehäuft |
| Benutzerfreundlichkeit | 7/10 | Shift-Auswahl ohne Ankerindikator (U14); Statusmeldung bei aktivem Filter (W12) verwirrend |
| Professionalität | 8/10 | Lint clean, korrekte Tooltips, aber npm audit rückgefallen (W13) |
| Release-Reife | 9/10 | Kein kritischer Befund; alle offenen Punkte sind lösbar ohne Architekturarbeit |

---

## Änderungshistorie

### Seit `release-review-2026-08-07.md` neu hinzugekommen

| ID | Titel | Status |
|---|---|---|
| W12 | „Nur String-Replace" Statusmeldung bei aktivem Filter | offen |
| W13 | npm audit: 9 Dev-Abhängigkeits-Schwachstellen | offen |
| U14 | Fehlender visueller Anker-Indikator (Shift-Bereichsauswahl) | offen |
| R8 | `rangeAnchors` bei Reset nicht geleert | offen |
| Q9 | Redundanter Code in `analyzeSqlCode()` | offen |
| T11 | Fehlender Test für R8-Fallback nach Reset | offen |

### Vorgängerbericht `release-review-2026-08-07.md` — alle 54 Befunde behoben

| Bereich | Befunde | Status |
|---|---|---|
| Kritisch | K1–K5 | behoben |
| Wichtig | W1–W11 | behoben |
| UX/GUI | U1–U13 | behoben |
| Risiken | R1–R7 | behoben |
| Quick Wins | Q1–Q8 | behoben |
| Test | T1–T10 | behoben |

---

**Stand: 5 kritisch · 13 wichtig · 14 UX · 8 Risiken · 9 Quick Wins · 11 Test
— 54 behoben · 6 offen · 60 gesamt**
