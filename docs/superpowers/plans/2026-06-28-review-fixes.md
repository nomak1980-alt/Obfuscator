# Review-Fixes Implementation Plan

> **Status: ABGESCHLOSSEN** — alle 13 Tasks implementiert (Commits 6537f1a → ff047e9, Nacharbeiten a4863d6/a274a8c)

**Goal:** Alle nach dem Software-Review identifizierten Bugs, Test-Lücken und UX-Probleme beheben, ohne neue Features zu erfinden.

**Architecture:** Alle Änderungen bleiben innerhalb der bestehenden 4-Datei-Architektur (`obfuscator-core.js`, `obfuscator.js`, `obfuscator.css`, `obfuscator.html`). Keine neuen Abhängigkeiten, kein Build-Step.

**Tech Stack:** Vanilla JS, CSS, HTML. Node.js + jsdom für Tests (`npm test`). PowerShell (`publish.ps1`).

## Global Constraints

- Kein npm-Dependency-Upgrade außer was für Bugfixes nötig ist
- Kein TypeScript, kein Build-Step
- Keine Accessibility/ARIA-Änderungen
- Nur v1 des State-Formats wird unterstützt
- Kommentare in SQL und C# werden BEWUSST durchsucht und ersetzt – kein Kommentar-Stripping
- Publish via `.\publish.ps1` nach jeder fertigen Session

## Architektur-Entscheidungen

### Tab-lokales Löschen statt `clearSavedState()`
`clearAll()`/`clearSqlAll()` löschten den kompletten `localStorage`-Key und damit den State **beider** Tabs. Ersetzt durch `clearTabState(tabKey)`: State lesen, nur `state[tabKey]` entfernen, Rest zurückschreiben. Alle `localStorage`-Zugriffe in `try/catch` (Private Mode, Quota).

### Chip-Mindestlänge 3 Zeichen
`addChip()` lehnt Eingaben < 3 Zeichen ab (roter Rahmen am Input für 1,2 s, Feld behält seinen Inhalt). Grund: die Wortgrenzen-Regex erkennt einbuchstabige Tokens ohnehin nicht als vollständige Bezeichner. Nachträglich (W4) kam `skipValidation` dazu, damit bereits gespeicherte kurze Chips Laden/Importieren überleben.

### SQL-Alias-Filter
`isValidId` in `analyzeSqlElements` verlangt `n.length >= 2`, sonst wurden Aliases wie `FROM Users u` als Tabelle `u` erkannt.

### Import-Härtung
`importState()` bricht bei `file.size > 10 MB` mit Fehlermeldung ab, bevor `FileReader` läuft.

### Re-Analyse-Schutz
`analyzeCode()`/`analyzeSqlCode()` fragen per `confirm()` nach, wenn bereits Mappings existieren – sonst wird verschleierter Code unrückverwandelbar.

### Farbsemantik
`.btn-danger` von `#d97706` (identisch mit `.btn-secondary`) auf `#dc2626` umgestellt, damit „Alles Löschen" nicht wie „Code Kopieren" aussieht.

## Implementierte Tasks

| Task | Dateien | Commit |
|------|---------|--------|
| 1: Integration-Tests reparieren (fehlende DOM-IDs im Stub) | `test/integration.test.js` | 6537f1a, 13c2e79 |
| 2: `clearAll`/`clearSqlAll` – Cross-Tab-Datenverlust | `obfuscator.js`, `test/integration.test.js` | 29df5ed |
| 3: `tests.html` auf Chip-API aktualisieren | `tests.html` | 86572a0 |
| 4: `btn-danger` visuell von `btn-secondary` trennen | `obfuscator.css` | 88c7198 |
| 5: SQL-Alias-False-Positives filtern | `obfuscator-core.js`, `test/core.test.js` | be25621 |
| 6: Dateigrößen-Limit (10 MB) beim JSON-Import | `obfuscator.js` | 2412d65 |
| 7: Warnung bei Re-Analyse mit vorhandenen Mappings | `obfuscator.js`, `test/integration.test.js` | 112b3a2 |
| 8: Chip-Input – Mindestlänge 3 Zeichen | `obfuscator.js`, `test/integration.test.js` | b6c0398, e697ca1 |
| 9: Status-Meldung nach Analyse aufschlüsseln | `obfuscator.js` | adcaecb |
| 10: Chip-Input – Plus-Button | `obfuscator.html`, `obfuscator.js`, `obfuscator.css` | 33116fb |
| 11: Mobile Responsiveness `.code-row` (< 768px) | `obfuscator.css` | 39eb95c |
| 12: README aktualisieren (Chip-API, Projektstruktur) | `README.md` | ff047e9 |
| 13: Publish + Nacharbeiten (Toast-Position, Layout-Breiten) | diverse | a4863d6, a274a8c |

## Relevante Befehle

```bash
npm test                       # Alle Test-Suiten (core, integration, persistence, smoke, layout)
.\publish.ps1                  # Tests + Publish-Folder aktualisieren
git log --oneline 6537f1a~1..  # Commits dieser Fix-Serie
```
