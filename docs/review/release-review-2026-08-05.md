# Release-Review — Code Obfuscator (C# & MS SQL) — 2026-08-05

| | |
|---|---|
| **Commit** | `3e738c6` — *fix: String-Replace trifft zusammengesetzte Bezeichner, Auto-Analyse erweitert* |
| **Branch** | `main` |
| **Umfang** | Vollständig: `obfuscator-core.js` (604 Z.), `obfuscator.js` (1047 Z.), `obfuscator.css` (546 Z.), `obfuscator.html` (278 Z.), `tests.html` (491 Z.), `test/*.js` (904 Z.), `package.json`, `publish.ps1`, `README.md`, `.gitignore` |
| **Vorgängerbericht** | keiner — Erstdurchlauf, IDs beginnen bei 1 |
| **Verifikation** | `npm test` ausgeführt; Kernlogik in Node nachgestellt; Anwendung real in Chromium 149 bedient (Desktop 1920×1080 und Mobil 390×844); `npm audit` ausgeführt |

**Harte Fakten aus diesem Durchlauf**

| Messung | Ergebnis |
|---|---|
| `npm test` | **107 Tests, 0 Fehler** (core 48 · integration 53 · smoke 6), Laufzeit 1,6 s |
| Coverage | **nicht gemessen** — kein Coverage-Werkzeug konfiguriert |
| Linter / CI | **nicht vorhanden** (kein ESLint, kein `.github/workflows`) |
| `npm audit` | **1 High** (`undici` ≤ 7.28.0 via `jsdom`, nur Dev); Produktionspfad: 0 |
| Konsolenfehler im Browser | keine |
| Performance C# (110 KB, 4800 Elemente) | Analyse 4 ms · Verschleiern 178 ms · Rückverwandeln 203 ms |
| Performance realer Browser (600 Klassen → 3000 Checkboxen) | Analyse + Rendern 175 ms · Verschleiern 577 ms |
| Performance SQL (190 KB) | 12 ms |

Die Performance ist durchweg unauffällig — ein anfänglicher Verdacht auf quadratisches Laufzeitverhalten in `analyzeSqlElements` hat sich **nicht** bestätigt (80 000 Zeichen `SELECT` ohne `FROM`: < 1 ms). Performance ist in diesem Bericht deshalb bewusst **kein** Befund.

---

# Executive Summary

Der Obfuscator ist handwerklich sauberer als der Durchschnitt eines Ein-Personen-Projekts: Die Trennung von DOM-freier Kernlogik (`obfuscator-core.js`) und UI-Schicht ist konsequent durchgehalten, die Kernlogik ist gegen die klassischen Fallen abgesichert (Platzhalter-Kollision per deterministischem Salt, `$&`-Injection über Funktions-Replacer, `_1`-vor-`_10`-Problem über Längensortierung, HTML-Escaping aller Nutzereingaben), es gibt 107 grüne Tests, eine gehärtete CSP und eine Export/Import-Funktion. Der glückliche Pfad funktioniert und liefert byte-genaue Round-Trips.

Die Probleme liegen nicht in der Mechanik, sondern im **Sicherheitsversprechen des Produkts**. Die Anwendung existiert, damit vertraulicher Code gefahrlos an eine KI gegeben werden kann — und genau an dieser Stelle fehlt jede Absicherung: Es gibt **keinerlei Prüfung des Ergebnisses**, bevor der Nutzer auf „Kopieren" klickt. Drei unabhängig voneinander verifizierte Pfade führen dazu, dass Klartext im Ausgabefeld landet, während die Oberfläche eine grüne Erfolgsmeldung mit einer plausiblen Zahl anzeigt (K1, K2, K3). Der gravierendste: Wer nach der Analyse den Code im Eingabefeld austauscht und direkt auf „Verschleiern" klickt, bekommt seinen **unveränderten Originalcode** zurück, quittiert mit „Code erfolgreich verschleiert! 1 Elemente ersetzt."

Dazu kommen ein per Tastatur nicht erreichbarer MS-SQL-Tab (K4) und eine auf Mobilgeräten faktisch unbenutzbare Oberfläche, weil die dafür geschriebene CSS-Regel durch eine später im Stylesheet stehende Regel wirkungslos ist (U1).

Für den persönlichen Gebrauch des Autors ist das Werkzeug brauchbar. Für ein Release an mehrere tausend Kunden ist es das nicht: Ein Werkzeug, dessen einziger Zweck Vertraulichkeit ist, darf nicht schweigend Klartext ausliefern. Der Aufwand für K1–K4 ist überschaubar (geschätzt ein Arbeitstag) — danach ist die Anwendung releasefähig.

---

# Kritische Probleme

### K1 — Verschleiern nach Code-Änderung liefert Klartext mit Erfolgsmeldung
- **Status:** offen
- **Fundstelle:** `obfuscator.js:562-610` (`obfuscateCode`), `obfuscator.js:777-825` (`obfuscateSqlCode`)
- **Auswirkung:** `obfuscateCode()` liest den Code frisch aus dem Textfeld, benutzt aber die Mappings aus den Checkboxen, die zum Zeitpunkt der **Analyse** erzeugt wurden. Nichts setzt die Auswahl-Sektion zurück, wenn der Nutzer den Code danach ändert. Verifizierter Ablauf: Code A analysieren → Code B einfügen → „Verschleiern" klicken (die Sektion ist weiterhin offen, `display: block`) → Ausgabe ist **wortwörtlich Code B im Klartext**, Statusmeldung: `Code erfolgreich verschleiert! 1 Elemente ersetzt.` Der Nutzer kopiert das in die KI. Das ist der direkteste Weg, wie dieses Werkzeug genau den Schaden anrichtet, den es verhindern soll. Derselbe Pfad existiert im SQL-Tab.
- **Empfehlung:** Beim `input`-Event auf `originalCode`/`sqlOriginalCode` (die Listener existieren bereits, `obfuscator.js:1006-1009`) den Code-Hash gegen den Analyse-Zeitpunkt prüfen. Bei Abweichung die Auswahl-Sektion sichtbar als veraltet markieren und `obfuscateCode()` mit einer Fehlermeldung („Der Code wurde seit der Analyse geändert — bitte erneut analysieren.") abbrechen. Minimalvariante: in `analyzeCode()` den analysierten Text in einer Variablen merken und zu Beginn von `obfuscateCode()` vergleichen.
- **Aufwand:** S

### K2 — String-Literale, Kommentar-Inhalte und Zahlen werden nie verschleiert — ohne jeden Warnhinweis
- **Status:** offen
- **Fundstelle:** `obfuscator-core.js:474-582` (`analyzeCSharpElements`), `obfuscator.html:36-40` (Anleitung), `README.md:17-21`
- **Auswirkung:** Die Auto-Analyse erkennt ausschließlich **Bezeichner anhand ihrer Deklarations-Syntax**. Alles, was in Zeichenketten, Kommentaren oder Zahlenliteralen steht, bleibt unangetastet. Real im Browser verifiziert: Aus
  `private const string CONN = "Server=prod-sql01;User=sa;Password=Geheim123;";` und `// Kunde: Meier GmbH, Vertrag 4711`
  wird nach dem Verschleiern
  `private const string CS_FIELD_2 = "Server=prod-sql01;User=sa;Password=Geheim123;";` und `// STR_PLACEHOLDER_3: Meier GmbH, Vertrag 4711`.
  Servername, Benutzer, **Passwort**, Kundenname und Vertragsnummer gehen unverändert an die KI. Weder die Anleitung in der Oberfläche noch der README erwähnen diese Grenze; der README verspricht im Gegenteil „vertrauliche Bezeichner verschleiern" und listet unter Sicherheitsgarantien nur Aspekte der Ersetzungsmechanik. Ein Nutzer, der dem Werkzeug vertraut, hat keine Chance, das zu bemerken.
- **Empfehlung:** Zwei Schritte, beide klein: (a) Anleitung und README um einen deutlich sichtbaren Hinweis ergänzen, dass Inhalte von Strings, Kommentaren und Zahlen **nicht** verschleiert werden. (b) Nach dem Verschleiern eine Heuristik über das Ergebnis laufen lassen, die auf typische Geheimnismuster in Literalen prüft (`Password=`, `pwd=`, `Server=`, `Data Source=`, `ApiKey`, `Bearer `, `AccountKey=`) und bei Treffern eine gelbe Warnung mit Zeilennummer anzeigt. Beides ohne neue Abhängigkeiten machbar.
- **Aufwand:** M

### K3 — Keine Verifikation des Ergebnisses; Zähler melden Mapping-Größe statt tatsächlicher Ersetzungen
- **Status:** offen
- **Fundstelle:** `obfuscator.js:605-608`, `obfuscator.js:636-637`, `obfuscator.js:821-823`, `obfuscator.js:849-850`
- **Auswirkung:** Alle vier Erfolgsmeldungen zählen die Größe der Mapping-Struktur, nicht die Zahl der real durchgeführten Ersetzungen. Zwei verifizierte Konsequenzen:
  1. **Abgewählte Elemente bleiben stumm im Klartext.** Code `public class Kundendaten { private string IBAN; }` mit Chip `IBAN`, in der Tabelle die Zeile `IBAN` abgehakt → Ausgabe `public class CS_CLASS_1 { private string IBAN; }`, Meldung `Code erfolgreich verschleiert! 1 Elemente ersetzt.` Kein Hinweis, dass ein als vertraulich markierter Begriff noch enthalten ist. Verschärfend: Ein Element, das per String-Replace erfasst wurde, wird aus der Auto-Analyse herausgefiltert (`obfuscator.js:477-478`) — es existiert also **nur** diese eine Zeile, und ihr Abwählen entfernt jeden Schutz für den Begriff.
  2. **Erfolgsmeldung ohne jede Ersetzung.** KI-Antwort `Ich kann dir dabei leider nicht helfen.` einfügen → `Code erfolgreich zurückverwandelt! 1 Elemente wiederhergestellt.` in Grün, obwohl null Ersetzungen stattfanden.
- **Empfehlung:** `applyReplacements`/`reverseReplacements` in `obfuscator-core.js` einen Treffer-Zähler zurückgeben lassen (der Funktions-Replacer ist bereits vorhanden, dort einfach hochzählen) und die Meldungen darauf umstellen. Zusätzlich nach dem Verschleiern das Ergebnis gegen **alle** analysierten Originale prüfen — auch die abgewählten — und bei Treffern warnen: „Achtung: 1 nicht verschleierter Begriff im Ergebnis: IBAN". Das ist die Kontrollinstanz, die dem Werkzeug heute komplett fehlt.
- **Aufwand:** M

### K4 — MS-SQL-Tab ist per Tastatur nicht erreichbar (WCAG 2.1.1, Stufe A)
- **Status:** offen
- **Fundstelle:** `obfuscator.js:363-377` (`switchTab`), `obfuscator.html:26-32`
- **Auswirkung:** `switchTab` setzt `t.tabIndex = active ? 0 : -1` (Roving-Tabindex), im Markup hat `tab-mssql` bereits `tabindex="-1"`. Damit ist der inaktive Tab aus der Tab-Reihenfolge entfernt — korrekt nach ARIA-Muster, **aber der zugehörige Pfeiltasten-Handler fehlt vollständig**. Im Browser verifiziert: Die Tab-Reihenfolge lautet `btn-export → btn-import → tab-csharp → originalCode → …`; `tab-mssql` kommt nicht vor. `ArrowRight` auf dem aktiven Tab bewirkt nichts (Fokus und aktiver Tab bleiben `tab-csharp`). Ein Nutzer ohne Maus kommt an die Hälfte der Anwendung nicht heran. Für einen kommerziellen Vertrieb ist ein Verstoß gegen WCAG 2.1.1 auf Stufe A bei der Hauptnavigation ein Blocker.
- **Empfehlung:** `keydown`-Handler auf dem Tablist ergänzen: `ArrowRight`/`ArrowLeft` (mit Umlauf), `Home`/`End`; jeweils `switchTab(...)` aufrufen und `focus()` auf den neuen Tab setzen. Rund 15 Zeilen im bestehenden Init-Block.
- **Aufwand:** S

---

# Wichtige Verbesserungen

### W1 — Import überschreibt entgegen der Bestätigung nicht den gesamten Arbeitsstand
- **Status:** offen
- **Fundstelle:** `obfuscator.js:943` (Bestätigungstext), `obfuscator.js:274-357` (`loadState`)
- **Auswirkung:** Der Dialog sagt „Importieren? Der aktuelle Arbeitsstand wird überschrieben." `loadState()` schreibt aber nur die Zweige, die in der Datei **vorhanden** sind (`if (state.csharp) { … }`, `if (state.sql) { … }`). Verifiziert: SQL-Tab mit `SELECT GeheimeSpalte FROM GeheimeTabelle` und Chip `GeheimeTabelle` gefüllt, danach ein Backup ohne `sql`-Zweig importiert → SQL-Textfeld und Chip bleiben unverändert stehen, und der nächste Autosave schreibt sie wieder in den Speicher zurück. Ein Nutzer, der über den Import „sauber machen" will, behält unbemerkt Altdaten. Dasselbe Muster entsteht nach `clearTabState()`, weil dieses gezielt nur einen Zweig entfernt.
- **Empfehlung:** In `loadState()` fehlende Zweige aktiv leeren (Textfelder, Chips, Maps, Sektionen zurücksetzen) statt sie zu überspringen — die dafür nötigen Reset-Bausteine existieren bereits in `clearAll`/`clearSqlAll`. Alternativ den Bestätigungstext ehrlich formulieren.
- **Aufwand:** M

### W2 — SQL-Auswahltabelle zeigt andere Platzhalter als das tatsächliche Ergebnis
- **Status:** offen
- **Fundstelle:** `obfuscator.js:688-690` + `obfuscator.js:750-762` (Anzeige) gegen `obfuscator.js:801-811` (Ausführung), `obfuscator-core.js:399-411` (`assignSqlPlaceholders`)
- **Auswirkung:** Bei der Analyse vergibt `analyzeSqlElements` Platzhalter in **Fundreihenfolge**; die Tabelle zeigt die Zeilen jedoch **alphabetisch sortiert** an. Beim Verschleiern vergibt `assignSqlPlaceholders` dann **neue** Platzhalter in der DOM-Reihenfolge, also alphabetisch. Verifiziert im Browser: Die Tabelle zeigt `Users → SQL_TABLE_1` und `Orders → SQL_TABLE_2`; im Ergebnis steht `FROM SQL_TABLE_2 … JOIN SQL_TABLE_1` — die Zuordnung ist **vertauscht**. Direkt darunter zeigt „Verwendete Mappings" die korrekte, dritte Variante. Die Oberfläche präsentiert also zwei einander widersprechende Mapping-Tabellen gleichzeitig. Der Round-Trip bleibt korrekt (er nutzt die finale Map), aber jede manuelle Kontrolle anhand der Vorschau führt in die Irre. Der C#-Pfad hat das Problem nicht — er übernimmt den Platzhalter direkt aus `cb.dataset.placeholder`.
- **Empfehlung:** `obfuscateSqlCode()` analog zum C#-Pfad `cb.dataset.obfuscated` verwenden statt neu zu vergeben; `assignSqlPlaceholders` wird dann nur noch für die Erstvergabe in `analyzeSqlCode` gebraucht. Beseitigt zugleich eine ganze Fehlerklasse.
- **Aufwand:** S

### W3 — Auto-Analyse erkennt keine Member-Zugriffe auf fremde Typen
- **Status:** offen
- **Fundstelle:** `obfuscator-core.js:500-570`
- **Auswirkung:** Erkannt wird nur, was im vorliegenden Ausschnitt **deklariert** wird. Verifiziert: In `void Bar(Item item) { var s = item.Stockwerk; kunde.Vertragsnummer = 1; }` werden `Stockwerk`, `Raumnummer`, `Vertragsnummer` und `kunde` **nicht** erkannt und bleiben im Klartext. Da typischer Anwendungscode überwiegend aus Zugriffen auf Typen anderer Dateien besteht, ist die Trefferquote in der Praxis deutlich niedriger, als die Auswahltabelle suggeriert. Für den Kernanwendungsfall (einzelne Methode zur KI geben) trifft das den Normalfall, nicht den Sonderfall.
- **Empfehlung:** Keine Erweiterung der Heuristik erfinden, sondern die Lücke sichtbar machen: In der Anleitung darauf hinweisen, dass Bezeichner aus fremden Klassen über String-Replace ergänzt werden müssen. Optional als eigene Kategorie „Member-Zugriff (unsicher)" mit Regex `\.([A-Z][A-Za-z0-9_]*)\b` vorschlagen — standardmäßig **abgewählt**, damit keine Fehlersetzungen entstehen.
- **Aufwand:** M

### W4 — Wörter mit weniger als drei Zeichen gehen beim Laden und Importieren stillschweigend verloren
- **Status:** offen
- **Fundstelle:** `obfuscator.js:90-109` (`addChip`), `obfuscator.js:294-296` und `obfuscator.js:330-332` (Wiederherstellung)
- **Auswirkung:** Die Wiederherstellung von Chips läuft über `addChip()`, das seit der Mindestlängen-Regel Eingaben unter drei Zeichen verwirft. Verifiziert: Ein gespeicherter Stand mit `["id","PLZ","Kunde"]` lädt als `["PLZ","Kunde"]` — `id` verschwindet ohne jede Meldung. Betroffen sind alle Bestände und Backups, die vor Einführung der Regel entstanden sind. Der Nutzer analysiert danach mit weniger Suchwörtern als gedacht.
- **Empfehlung:** Für die Wiederherstellung an `addChip` einen Parameter `skipValidation` übergeben (oder `renderChip` + `arr.push` direkt aufrufen). Falls Kurzwörter bewusst nicht mehr unterstützt werden: beim Laden zählen und einmalig melden („2 gespeicherte Wörter waren zu kurz und wurden verworfen").
- **Aufwand:** S

### W5 — Der C#- und der SQL-Pfad sind über die gesamte UI-Schicht doppelt implementiert
- **Status:** offen
- **Fundstelle:** `obfuscator.js:511-560` vs. `718-775`; `644-667` vs. `858-879`; `408-409`; `967-980`; `1011-1033`; `obfuscator-core.js:139-163` vs. `217-243`
- **Auswirkung:** Auswahltabelle, Löschen, Statusanzeige, Chip-Eingabe (Tastatur **und** Plus-Button) und die String-Replace-Analyse im Core existieren jeweils zweimal in nahezu identischer Form. Konkrete Folge in diesem Bericht: W2 betrifft nur den SQL-Zweig, weil dort eine Variante nachgezogen wurde und die andere nicht — genau das Fehlerbild, das Duplikation erzeugt. Jede künftige Korrektur muss an zwei Stellen erfolgen und wird an einer davon vergessen werden.
- **Empfehlung:** Nicht auf einen Schlag umbauen. Kleinster sicherer Schritt: `analyzeCSharp` und `analyzeSqlStringReplace` im Core auf eine gemeinsame Funktion mit Präfix-Parameter zusammenführen (beide Funktionen sind bis auf `CS_PREFIX`/`SQL_STR_PREFIX` und den Feldnamen `original`/`word` identisch) — abgesichert durch die vorhandenen Core-Tests. Danach die beiden Tabellen-Renderer über eine Konfiguration `{containerId, checkboxClass, selectAllId, rows}` vereinen.
- **Aufwand:** L

### W6 — Globaler Modul-Zustand erzwingt `eval`-Konstrukte in den Tests
- **Status:** offen
- **Fundstelle:** `obfuscator.js:11-27`, `test/integration.test.js:60-82`
- **Auswirkung:** Sämtlicher Zustand liegt als `let` im globalen Skript-Scope. Weil `let` keine `window`-Eigenschaften erzeugt, muss der Integrationstest einen Accessor per String-Konkatenation in denselben `eval`-Aufruf einschleusen (`window.__t`, `window.__csharpWords`) und Funktionen über `ev("…")` als Text aufrufen. Der Test prüft dadurch teils seine eigene Einschleustechnik mit; Umbenennungen brechen Tests auf schwer lesbare Weise. Zudem verhindert der globale Zustand, dass die UI-Schicht jemals zweimal instanziiert oder isoliert getestet werden kann.
- **Empfehlung:** Die UI-Schicht analog zum Core in ein IIFE mit explizitem Export packen (`window.ObfuscatorUI = { analyzeCode, obfuscateCode, … , _state }`) und die Tests darauf umstellen. Kein Build-Schritt nötig, `data-action`-Delegation bleibt unverändert.
- **Aufwand:** M

### W7 — Kein Lockfile im Repository, keine CI, kein Linter
- **Status:** offen
- **Fundstelle:** `.gitignore:14` (`package-lock.json`), fehlendes `.github/workflows`, fehlende ESLint-Konfiguration
- **Auswirkung:** `package-lock.json` ist ausdrücklich ignoriert, obwohl die Datei lokal existiert — Installationen sind nicht reproduzierbar, und der `npm audit`-Befund (W8) ist für andere nicht nachvollziehbar. Ohne CI ist „107 Tests grün" eine Momentaufnahme des lokalen Rechners; die Testsuite läuft in 1,6 Sekunden und wäre in jeder Pipeline praktisch kostenlos. Ohne Linter bleiben Dinge wie die tote Funktion `clearSavedState` (Q2) und tote CSS-Regeln (Q1) unbemerkt.
- **Empfehlung:** `package-lock.json` aus `.gitignore` entfernen und einchecken; eine GitHub-Action mit `npm ci && npm test` anlegen; ESLint mit der Empfehlungs-Konfiguration plus `no-unused-vars` ergänzen.
- **Aufwand:** S

### W8 — `npm audit`: 1 High in `undici`; `playwright` als ungenutzte Abhängigkeit deklariert
- **Status:** offen
- **Fundstelle:** `package.json:25-28`
- **Auswirkung:** `npm audit` meldet **1 High** (`undici` — Cookie-Attribut-Injection, GHSA-v3r7-h72x-cjcm) über `jsdom@29.1.1 → undici@7.28.0`. Die Auslieferung selbst ist nicht betroffen (die Produktion hat null Abhängigkeiten, `npm audit --omit=dev` meldet 0), aber die Testumgebung führt fremden Code aus. Unabhängig davon ist `playwright@^1.61.1` als Dev-Abhängigkeit deklariert und **wird nirgends im Projekt verwendet** (verifiziert: kein Treffer außerhalb von `package.json`/`package-lock.json`) — mehrere hundert MB Browser-Downloads ohne Gegenwert. Nebenbefund: Playwright ist installiert und funktionsfähig (Chromium 149) und wäre die naheliegende Basis für die fehlenden E2E-Tests (T7).
- **Empfehlung:** `npm audit fix` ausführen. Über `playwright` entscheiden: entweder für E2E-Tests tatsächlich nutzen (siehe T7) oder aus `devDependencies` entfernen.
- **Aufwand:** S

### W9 — Vertraulicher Quellcode liegt unbefristet und unverschlüsselt im localStorage — und ist über `file://` für andere lokale Seiten lesbar
- **Status:** offen
- **Fundstelle:** `obfuscator.js:34` (`STORAGE_KEY`), `obfuscator.js:156-211` (`saveState`), `README.md:41-48`
- **Auswirkung:** Jede Eingabe wird 300 ms nach dem Tippen vollständig in den localStorage geschrieben — Originalcode, verschleierter Code, KI-Antwort und das komplette Mapping — und bleibt dort ohne Ablaufdatum. Der README empfiehlt ausdrücklich den Start per Doppelklick, also über `file://`. In Chromium 149 verifiziert: Eine **beliebige andere lokale HTML-Datei**, im selben Browser geöffnet, liest den Schlüssel `obfuscatorAppState_v1` vollständig aus — `file://`-Seiten teilen sich den Speicher. Die CSP der Anwendung (`connect-src 'none'`) schützt hier nicht, weil die auslesende Seite eine andere ist. Eine heruntergeladene HTML-Datei, lokal geöffnet, kann also den gesamten gespeicherten Kundencode abgreifen. *(Gemessen mit dem Playwright-Chromium in Standardkonfiguration; im installierten Chrome des Nutzers gegenzuprüfen.)*
- **Empfehlung:** Zwei Maßnahmen: (a) Die Auslieferung über einen lokalen HTTP-Ursprung empfehlen statt `file://` — bereits `npx serve publish` genügt und stellt eine echte Origin-Isolierung her; im README entsprechend ergänzen. (b) Einen sichtbaren Schalter „Beim Schließen löschen" bzw. einen Hinweis in der Anleitung ergänzen, dass Eingaben dauerhaft im Browser gespeichert werden. Verschlüsselung im Browser bringt ohne externes Geheimnis keinen echten Gewinn und sollte nicht vorgetäuscht werden.
- **Aufwand:** S

---

# UX- und GUI-Optimierungen

### U1 — Die Mobile-Regel für `.code-row` ist wirkungslos (Reihenfolge im Stylesheet)
- **Status:** offen
- **Fundstelle:** `obfuscator.css:303-305` gegen `obfuscator.css:441-447`
- **Auswirkung:** Der Media-Query-Block (`@media (max-width: 768px) { .code-row { grid-template-columns: 1fr; } }`) steht bei Zeile 303, die unbedingte Regel `.code-row { grid-template-columns: 79fr 21fr; }` bei Zeile 441. Beide haben dieselbe Spezifität, also **gewinnt die spätere** — die Mobile-Regel hat nie gewirkt. Im Browser bei 390 px verifiziert: Code-Feld und String-Replace-Feld stehen weiterhin nebeneinander, das Code-Textfeld ist rund 150 px breit, Bezeichner brechen mitten im Wort um (`IKundenReposi | tory`). Die Anwendung ist auf dem Smartphone nicht sinnvoll bedienbar.
- **Empfehlung:** Den kompletten `@media`-Block ans Dateiende verschieben (die übrigen Regeln darin wirken nur zufällig, weil sie keine Eigenschaft betreffen, die später erneut gesetzt wird). Das ist eine reine Umsortierung ohne Verhaltensrisiko.
- **Aufwand:** S

### U2 — Kopfzeile erzeugt auf Mobilgeräten horizontales Scrollen
- **Status:** offen
- **Fundstelle:** `obfuscator.css:348-359` (`.header-row`, `.data-toolbar`), `obfuscator.css:299-301` (`button { width: 100% }`)
- **Auswirkung:** Bei 390 px Breite beträgt die Seitenbreite 563 px — die gesamte Seite scrollt horizontal. Ursache: `.header-row` ist ein `flex` ohne `flex-wrap`, und die Mobile-Regel `button { width: 100% }` bläht „Exportieren" und „Importieren" auf je 148 px auf, sodass die Toolbar 306 px belegt und rechts aus dem Container herausragt. Derselbe Effekt trifft den Plus-Button der Chip-Eingabe (110 px statt ~44 px).
- **Empfehlung:** `.header-row { flex-wrap: wrap; gap: 12px; }` ergänzen und die `button { width: 100% }`-Regel auf die Aktionsleiste eingrenzen (`.button-group button { width: 100% }`), damit Toolbar- und Chip-Buttons ihre natürliche Breite behalten.
- **Aufwand:** S

### U3 — Alle drei Statusmeldungen liegen exakt übereinander
- **Status:** offen
- **Fundstelle:** `obfuscator.css:210-222`
- **Auswirkung:** `#statusMessage`, `#sqlStatusMessage` und `#globalMessage` teilen sich `position: fixed; bottom: 24px; right: 24px; z-index: 1000`. Im Browser gemessen: Bei gleichzeitiger Tab- und Globalmeldung liegen beide bei y = 1013 mit 43 px Höhe und überlappen vollständig — die zuletzt im DOM stehende verdeckt die andere. Das passiert real, etwa wenn ein Export quittiert wird, während eine Analysemeldung noch läuft (Anzeigedauer 3 s bzw. 4 s, Fehler 15 s). Auf dem Smartphone überdeckt der Toast zusätzlich den Button „Ausgewählte Elemente verschleiern".
- **Empfehlung:** Die drei Elemente in einen gemeinsamen `position: fixed`-Container mit `display: flex; flex-direction: column-reverse; gap: 8px` legen; die Einzelmeldungen werden dann statisch positioniert und stapeln sich statt sich zu überdecken.
- **Aufwand:** S

### U4 — Leere Statusfelder behalten Mindestbreite und Schlagschatten
- **Status:** offen
- **Fundstelle:** `obfuscator.css:210-222`, `obfuscator.js:386` und `obfuscator.js:399`
- **Auswirkung:** Beim Ausblenden wird nur `className` geleert; die ID-basierten Regeln (`min-width: 180px`, `box-shadow`) bleiben aktiv. Gemessen: 180 × 0 px mit `rgba(0,0,0,0.5) 0px 4px 16px`. Auf dunklem Grund ergibt das einen schwach sichtbaren Schmutzfleck unten rechts.
- **Empfehlung:** Im `dismiss`-Handler zusätzlich `div.style.display = 'none'` setzen (und beim Anzeigen zurücksetzen) oder die Positionierungsregeln an die Klasse `.status` statt an die IDs hängen.
- **Aufwand:** S

### U5 — „Alles Löschen" löscht nur den aktuellen Tab
- **Status:** offen
- **Fundstelle:** `obfuscator.html:77` und `obfuscator.html:194`, `obfuscator.js:644-667`, `obfuscator.js:858-879`
- **Auswirkung:** Der Button heißt in beiden Tabs „🗑️ Alles Löschen", der Bestätigungsdialog sagt dann aber „C#-Daten löschen?" bzw. „SQL-Daten löschen?". Das Verhalten ist seit der Cross-Tab-Korrektur richtig, die Beschriftung nicht. Nutzer, die den anderen Tab tatsächlich mit leeren wollen, glauben, es sei geschehen.
- **Empfehlung:** Beschriftungen auf „🗑️ C#-Daten löschen" und „🗑️ SQL-Daten löschen" ändern. Reine Textänderung.
- **Aufwand:** S

### U6 — Die String-Replace-Spalte ist zu vier Fünfteln leer, die Auswahltabelle unausgewogen
- **Status:** offen
- **Fundstelle:** `obfuscator.css:441-447`, `obfuscator.js:520-525` und `obfuscator.js:727-732`
- **Auswirkung:** Am Desktop steht neben dem 300 px hohen Code-Feld eine 21 %-Spalte, die nur eine Eingabezeile und wenige Chips enthält — darunter bleibt eine große leere Fläche (im Screenshot deutlich sichtbar). In der Auswahltabelle hat nur die erste Spalte eine Breite (`width: 50px`); „Typ", „Original" und „Platzhalter" verteilen sich automatisch, wodurch die schmale Typ-Spalte über ein Drittel der Breite einnimmt und Original und Platzhalter weit auseinanderdriften.
- **Empfehlung:** Der Chip-Sektion `align-self: start` geben, damit sie nicht auf Codehöhe gestreckt wird; für die Tabelle feste Spaltenbreiten setzen (z. B. `50px / 120px / auto / auto`).
- **Aufwand:** S

### U7 — Der eingeklappte Zustand der Auswahl-Sektion überlebt kein Neuladen
- **Status:** offen
- **Fundstelle:** `obfuscator.js:147-154` (`captureSections`), `obfuscator.js:602` und `obfuscator.js:816`
- **Auswirkung:** Nach dem Verschleiern wird die Auswahl-Sektion per CSS-Klasse `collapsed` eingeklappt. Gespeichert wird aber nur `style.display`, nicht die Klasse. Nach einem Neuladen steht die lange Tabelle wieder aufgeklappt zwischen Eingabe und Ergebnis — der Nutzer muss erneut scrollen und einklappen.
- **Empfehlung:** In `captureSections` zusätzlich `el.classList.contains('collapsed')` erfassen und in `applySections` wiederherstellen.
- **Aufwand:** S

### U8 — Bei großen Dateien fehlen „Alle abwählen", Filter und Kennzahlen in der Auswahltabelle
- **Status:** offen
- **Fundstelle:** `obfuscator.js:511-560`, `obfuscator.js:718-775`
- **Auswirkung:** Eine realistische 600-Klassen-Datei erzeugt **3000 Zeilen** in der Auswahltabelle (im Browser gemessen; Rendern selbst ist mit 175 ms unkritisch). Es gibt nur eine Kopf-Checkbox zum Umschalten aller Zeilen, keine Suche, keine Typ-Filterung, keine Anzeige „x von y ausgewählt". Die Kernaufgabe des Nutzers — gezielt entscheiden, was verschleiert wird — ist bei dieser Menge praktisch nicht durchführbar. Die Liste „Verwendete Mappings" zeigt dieselben 3000 Einträge in einem 200 px hohen Scrollfeld.
- **Empfehlung:** Über der Tabelle eine Zeile mit Freitextfilter (Original enthält …), Typ-Auswahl und Zähler „x von y ausgewählt" ergänzen; das Filtern kann rein über `style.display` der Zeilen laufen und ändert nichts an der Logik.
- **Aufwand:** M

### U9 — Farbsemantik: Fehler sehen aus wie der Import-Button, Erfolg ist blau, das Logo bricht mit der UI
- **Status:** offen
- **Fundstelle:** `obfuscator.css:224-235`, `obfuscator.css:372-381`, `COHeader.jpg`
- **Auswirkung:** `.status.error` nutzt Bernstein `#d97706` — exakt die Farbe des Import-Buttons und der früheren `.btn-danger`. Fehlermeldungen wirken dadurch wie Hinweise; seit der Umstellung von `.btn-danger` auf Rot `#dc2626` ist die Palette zudem in sich inkonsistent (Gefahr = Rot bei Buttons, Bernstein bei Meldungen). `.status.success` ist blau statt grün, obwohl die Anwendung mit `#4ade80` bereits eine Erfolgsfarbe für Platzhalter verwendet. Das Header-Logo ist kräftig orange, die gesamte übrige Oberfläche blau — die Marke steht optisch neben dem Produkt. *(Randnotiz: Der in den globalen Nutzer-Vorgaben genannte Hausstandard — Marine `#0f0f1a` mit Orange `#ff6b35` — ist hier nicht umgesetzt; das kann eine bewusste Einzelfall-Entscheidung sein, sollte aber eine sein.)*
- **Empfehlung:** `.status.error` auf `#dc2626` und `.status.success` auf `#4ade80` umstellen — beide Farben sind bereits im Stylesheet etabliert. Danach entscheiden, ob der Blauton oder das Orange des Logos die Leitfarbe sein soll, und die jeweils andere Stelle angleichen.
- **Aufwand:** S

### U10 — Die Anleitung ist ein Fließtextblock mit neun Pfeilschritten
- **Status:** offen
- **Fundstelle:** `obfuscator.html:36-40`, `obfuscator.html:155-158`
- **Auswirkung:** Die gesamte Bedienabfolge steht als ein einziger Absatz mit `→`-Ketten dauerhaft über der Oberfläche; auf 390 px füllt sie neun Zeilen. Sie ist weder nummeriert noch ausblendbar und wiederholt Informationen, die die Buttons selbst tragen. Gleichzeitig fehlt die Information, die wirklich gebraucht wird: was das Werkzeug **nicht** schützt (K2).
- **Empfehlung:** In eine nummerierte, einklappbare Liste umbauen (die `collapsible`-Mechanik existiert bereits) und den Grenzen-Hinweis aus K2 als festen, nicht ausblendbaren Warnhinweis darüberstellen.
- **Aufwand:** S

### U11 — „Verwendete Mappings" steht über dem verschleierten Code
- **Status:** offen
- **Fundstelle:** `obfuscator.html:99-123`, `obfuscator.html:215-240`
- **Auswirkung:** Nach dem Verschleiern erscheint zuerst die Mapping-Liste, dann erst das Ergebnisfeld mit dem Kopier-Button. Der Nutzer scrollt an der Zuordnungstabelle vorbei, um an das zu kommen, was er im nächsten Schritt braucht.
- **Empfehlung:** Die Sektion `csharpUsedMappingSection` bzw. `sqlUsedMappingSection` im Markup hinter die jeweilige Ergebnis-Sektion verschieben. Reine Umsortierung im HTML.
- **Aufwand:** S

### U12 — Versionsnummer an zwei Stellen gepflegt
- **Status:** offen
- **Fundstelle:** `obfuscator.html:270` (`v1.0`), `package.json:3` (`1.0.0`)
- **Auswirkung:** Die im Fuß angezeigte Version ist fest im Markup verdrahtet und weicht bereits im Format von `package.json` ab. Bei einem Release an Kunden ist eine falsche Versionsangabe im Supportfall teuer.
- **Empfehlung:** Eine der beiden Quellen als führend festlegen und die andere beim Publish daraus setzen (`publish.ps1` kann den Wert beim Kopieren ersetzen).
- **Aufwand:** S

---

# Versteckte Fehler und Risiken

### R1 — Export gibt die Blob-URL synchron nach dem Klick wieder frei
- **Status:** offen
- **Fundstelle:** `obfuscator.js:892-899`
- **Auswirkung:** `a.click()` wird unmittelbar von `URL.revokeObjectURL(url)` gefolgt, und der Anker wird nie in das Dokument eingehängt. In Chrome funktioniert das, in Firefox ist genau dieses Muster historisch die Ursache für abgebrochene Downloads. Da die Anwendung explizit „in einem modernen Webbrowser" laufen soll, ist das ein latenter Ausfall der Backup-Funktion auf einer ganzen Browser-Familie. *(Nicht in Firefox gegengeprüft — als Risiko eingestuft, nicht als bestätigter Fehler.)*
- **Empfehlung:** Anker vor dem Klick per `document.body.appendChild(a)` einhängen, nach dem Klick entfernen und `URL.revokeObjectURL` in ein `setTimeout(…, 1000)` legen.
- **Aufwand:** S

### R2 — Rückverwandeln funktioniert auch, wenn nie verschleiert wurde
- **Status:** offen
- **Fundstelle:** `obfuscator.js:617-639`, `obfuscator.js:832-852`
- **Auswirkung:** `analyzeCode()` befüllt `csharpAutoMapping` und `reverseCsharpAutoMapping` bereits mit **allen** gefundenen Elementen. Die Wächterbedingung in `deobfuscateCode()` prüft nur, ob diese Maps nicht leer sind. Verifiziert: Nach reiner Analyse (ohne „Verschleiern") ersetzt „Zurückverwandeln" `CS_CLASS_1` durch `Kundendienst` und meldet Erfolg — obwohl der Nutzer diese Zuordnung nie bestätigt hat. Sobald eine Teilauswahl im Spiel war, ist die verwendete Zuordnung eine andere als die, mit der der Code tatsächlich verschleiert wurde.
- **Empfehlung:** Ein explizites Flag `hasObfuscated` setzen, das erst `obfuscateCode()`/`obfuscateSqlCode()` setzt und `analyzeCode()` zurücksetzt, und die Wächterbedingung darauf umstellen.
- **Aufwand:** S

### R3 — Zurückgebliebene Platzhalter im finalen Code werden nicht erkannt
- **Status:** offen
- **Fundstelle:** `obfuscator.js:629-637`, `obfuscator.js:844-850`
- **Auswirkung:** Antwortet die KI mit veränderten Platzhaltern (`CsClass1` statt `CS_CLASS_1`, Umbrüche innerhalb des Tokens, Markdown-Formatierung), bleiben Platzhalter im Ergebnis stehen. Es gibt keine Prüfung darauf; der Nutzer kopiert `CS_CLASS_1` womöglich in seine Codebasis. Dies ist das Gegenstück zu K3 auf der Rückrichtung.
- **Empfehlung:** Nach der Rückverwandlung mit einer Regex über die bekannten Präfixe (`STR_PLACEHOLDER_`, `CS_*`, `SQL_*` — alle bereits als Konstanten exportiert) auf Reste prüfen und diese als Warnung mit Anzahl melden.
- **Aufwand:** S

### R4 — `csharpAutoTypeMap` wird beim Verschleiern nicht mitgeführt
- **Status:** offen
- **Fundstelle:** `obfuscator.js:576-589` gegen `obfuscator.js:481`, `obfuscator.js:245`
- **Auswirkung:** `obfuscateCode()` baut `stringReplaceMapping` und `csharpAutoMapping` aus den Checkboxen neu auf, lässt `csharpAutoTypeMap` aber unverändert auf dem Stand der letzten Analyse. Die Map wird zwar mitgespeichert und beim Wiederherstellen aus der Auswahl neu erzeugt, sodass sich heute kein sichtbarer Fehler zeigt — die drei Maps können aber auseinanderlaufen, und jede künftige Nutzung der Typinformation nach dem Verschleiern trifft auf veraltete Daten.
- **Empfehlung:** In `obfuscateCode()` `csharpAutoTypeMap` aus `cb.dataset.type` mit aufbauen, analog zu den beiden anderen Maps.
- **Aufwand:** S

### R5 — Toter Code: `clearSavedState()` wird von der Anwendung nicht mehr aufgerufen
- **Status:** offen
- **Fundstelle:** `obfuscator.js:213-215`
- **Auswirkung:** Seit der Umstellung auf `clearTabState()` ruft die Anwendung `clearSavedState()` nirgends mehr auf — die einzigen Vorkommen sind Mocks in `test/integration.test.js:81` und `tests.html:89`. Die Funktion löscht den **gesamten** Speicher beider Tabs; wer sie versehentlich wieder einbindet, reproduziert exakt den Cross-Tab-Datenverlust, der zuvor behoben wurde.
- **Empfehlung:** Funktion entfernen und die beiden Mock-Zeilen in den Tests mitziehen.
- **Aufwand:** S

### R6 — `getReplaceWords` steuert über einen magischen String
- **Status:** offen
- **Fundstelle:** `obfuscator.js:62-64`, aufgerufen in `obfuscator.js:472` und `obfuscator.js:684`
- **Auswirkung:** `getReplaceWords('stringReplace')` liefert die C#-Wörter, **jeder andere Wert** liefert stillschweigend die SQL-Wörter. Ein Tippfehler im Aufrufparameter führt nicht zu einem Fehler, sondern dazu, dass der C#-Tab mit den SQL-Suchwörtern analysiert wird — ein Fehler, der bei der Durchsicht kaum auffällt.
- **Empfehlung:** Die Funktion streichen und an den zwei Aufrufstellen direkt `[...csharpReplaceWords]` bzw. `[...sqlReplaceWords]` verwenden.
- **Aufwand:** S

---

# Quick Wins

### Q1 — Tote CSS-Regeln entfernen
- **Status:** offen
- **Fundstelle:** `obfuscator.css:246-283` (`.warning-box`, `.stats`, `.stat-item`, `.stat-number`, `.stat-label`), `obfuscator.css:291-293` (`h1`)
- **Auswirkung:** Verifiziert: Keine dieser Klassen kommt in `obfuscator.html` oder `obfuscator.js` vor, ein `<h1>` existiert nicht. Rund 45 Zeilen totes CSS, das bei jeder Stiländerung mitgelesen und mitgeprüft wird.
- **Empfehlung:** Ersatzlos löschen.
- **Aufwand:** S

### Q2 — Veraltete DOM-Attrappen aus den Tests entfernen
- **Status:** offen
- **Fundstelle:** `test/integration.test.js:29-30` und `45-48`, `tests.html` (gleiche IDs)
- **Auswirkung:** `stringReplaceMappingSection`, `stringReplaceMappingDisplay`, `sqlStringReplaceMappingSection`, `sqlStringReplaceMappingDisplay`, `sqlMappingSection`, `sqlMappingDisplay` existieren in der Anwendung nicht mehr (verifiziert: 0 Treffer in HTML und JS). Die Test-Attrappe suggeriert eine Struktur, die es nicht gibt, und `resetCsharp()`/`resetSql()` greifen aktiv auf diese Geister-IDs zu.
- **Empfehlung:** IDs aus beiden Test-Attrappen und aus den Reset-Hilfsfunktionen streichen.
- **Aufwand:** S

### Q3 — Veraltete Kommentar-Marker im Markup
- **Status:** offen
- **Fundstelle:** `obfuscator.html:27`, `obfuscator.html:74`, `obfuscator.html:82`
- **Auswirkung:** Kommentare wie `<!-- FIX #6: data-tab Attribute statt nth-child Selektion -->` und `<!-- FIX #10: … -->` verweisen auf die Nummerierung eines längst abgeschlossenen Review-Durchgangs, die nirgends mehr dokumentiert ist. Für einen Leser sind sie nicht auflösbar.
- **Empfehlung:** Entfernen oder in eine sachliche Beschreibung umformulieren.
- **Aufwand:** S

### Q4 — `publish.ps1` führt die Tests nicht aus
- **Status:** offen
- **Fundstelle:** `publish.ps1:1-26`
- **Auswirkung:** Das Skript löscht `publish/` und kopiert sechs Dateien — ohne vorher `npm test` laufen zu lassen. Bei einer Testlaufzeit von 1,6 Sekunden gibt es keinen Grund, ungetesteten Stand auszuliefern. Ebenfalls nicht kopiert wird der README, sodass die Auslieferung ohne Dokumentation erfolgt.
- **Empfehlung:** `npm test` als ersten Schritt mit Abbruch bei Fehlschlag ergänzen; `README.md` in die Dateiliste aufnehmen.
- **Aufwand:** S

### Q5 — Doppelte `escapeHtml`-Weiterleitung
- **Status:** offen
- **Fundstelle:** `obfuscator.js:361`
- **Auswirkung:** `function escapeHtml(str) { return Core.escapeHtml(str); }` ist eine reine Durchreichung, die eine zweite Namensquelle für dieselbe Funktion schafft.
- **Empfehlung:** Aufrufstellen auf `Core.escapeHtml` umstellen und die Hülle entfernen.
- **Aufwand:** S

### Q6 — Benennung `mapToReverse(reverseSqlMapping)` führt beim Lesen in die Irre
- **Status:** offen
- **Fundstelle:** `obfuscator.js:58-60`, aufgerufen in `629`, `844`, `845`
- **Auswirkung:** `mapToReverse` wandelt eine Map lediglich in eine Liste um; der Name suggeriert, dass die Funktion die Umkehrung erzeugt. In `mapToReverse(reverseCsharpAutoMapping)` steht „reverse" zweimal mit zwei verschiedenen Bedeutungen — beim Lesen ist nicht mehr zu erkennen, in welcher Richtung die Map vorliegt.
- **Empfehlung:** In `toEntryList` bzw. `toPlaceholderEntries` umbenennen.
- **Aufwand:** S

---

# Testlücken

### T1 — Die gesamte Persistenzschicht ist in den Tests abgeschaltet
- **Status:** offen
- **Fundstelle:** `test/integration.test.js:81` (`ev('saveState = () => {}; clearSavedState = () => {};')`)
- **Auswirkung:** `saveState` ist im Integrationstest durch eine leere Funktion ersetzt. Damit sind `saveState`, `loadState`, `captureCsharpSelection`, `captureSqlSelection`, `captureSections`, `applySections`, `restoreCsharpSelection`, `restoreSqlSelection` und `buildReverse` **komplett ungetestet** — knapp 200 Zeilen und die einzige Stelle, an der Nutzerdaten dauerhaft geschrieben werden. Der einzige Test, der den Speicher berührt (Cross-Tab-Schutz, Zeile 406-423), muss den Zustand deshalb von Hand in den localStorage legen. Zwei Befunde dieses Berichts (W1, W4) liegen genau in diesem blinden Fleck.
- **Empfehlung:** Einen eigenen Test-Block ohne den Mock ergänzen: Zustand aufbauen → `saveState()` → Zustand zurücksetzen → `loadState()` → prüfen, dass Textfelder, Chips, Maps, Auswahlzustände und Sektionen identisch sind.
- **Aufwand:** M

### T2 — Export und Import sind vollständig ungetestet
- **Status:** offen
- **Fundstelle:** `obfuscator.js:883-958`
- **Auswirkung:** Für `exportState`, `importState` und `isValidImportState` existiert kein einziger Test — obwohl es der Pfad ist, über den fremde Dateien in die Anwendung gelangen, und obwohl `isValidImportState` reine, sofort testbare Logik ist. Die Größenprüfung (10 MB) und die Formatprüfung wurden laut Änderungsplan nur manuell verifiziert.
- **Empfehlung:** `isValidImportState` direkt gegen gültige und ungültige Strukturen testen (fehlendes `version`, `version` als String, zu hohe Version, verfälschte Map-Paare — die Fälle sind bereits nachgestellt und liefern korrekte Ergebnisse). `importState` mit einem `File`-Stub und einem stubbed `FileReader` prüfen.
- **Aufwand:** M

### T3 — Kein Test für den kritischen Pfad „Code nach der Analyse geändert" (K1)
- **Status:** offen
- **Fundstelle:** —
- **Auswirkung:** Der gravierendste Befund dieses Berichts wird von keiner der 107 Prüfungen erfasst. Alle Integrationstests folgen der Reihenfolge Analysieren → Verschleiern ohne dazwischenliegende Änderung.
- **Empfehlung:** Test ergänzen, der nach der Analyse `originalCode` austauscht, `obfuscateCode()` aufruft und sicherstellt, dass entweder abgebrochen wird oder keine unverschleierten Bezeichner im Ergebnis stehen. Dieser Test muss vor der Korrektur rot sein.
- **Aufwand:** S

### T4 — Keine Zusicherung, dass Auswahltabelle und Ergebnis dieselben Platzhalter verwenden (W2)
- **Status:** offen
- **Fundstelle:** `test/integration.test.js:318-339`
- **Auswirkung:** Der SQL-Durchlauftest prüft, dass Platzhalter im Ergebnis auftauchen und der Round-Trip stimmt — nicht aber, dass die in `data-obfuscated` angezeigte Zuordnung mit der tatsächlich verwendeten übereinstimmt. Deshalb ist die Vertauschung aus W2 unbemerkt geblieben.
- **Empfehlung:** Test ergänzen, der nach `obfuscateSqlCode()` für jede Checkbox prüft, dass `data-obfuscated` genau an den Stellen im Ergebnis steht, an denen zuvor `data-element` stand.
- **Aufwand:** S

### T5 — Keine Coverage-Messung
- **Status:** offen
- **Fundstelle:** `package.json:6-8`
- **Auswirkung:** Es gibt keine Zahl dazu, welche Teile der 1651 Logikzeilen tatsächlich ausgeführt werden. Die Lücken T1 und T2 wären mit einem Coverage-Bericht sofort sichtbar gewesen.
- **Empfehlung:** Node bringt Coverage mit — `node --experimental-test-coverage` bzw. `c8` als einzige zusätzliche Dev-Abhängigkeit; ein `npm run coverage`-Skript genügt.
- **Aufwand:** S

### T6 — `tests.html` läuft nicht in `npm test` und pflegt eine eigene Optik
- **Status:** offen
- **Fundstelle:** `tests.html` (491 Zeilen), `package.json:7`
- **Auswirkung:** Die Browser-Testseite deckt inhaltlich weitgehend dasselbe ab wie `test/integration.test.js`, wird aber von `npm test` nicht angefasst. Sie ist damit ein zweiter Testbestand, dessen Zustand niemand kennt — ein Fehlschlag fällt nur auf, wenn jemand die Datei zufällig im Browser öffnet. Nebenbei verwendet sie eine völlig andere Farbpalette (`#0f0f1a`/`#667eea`) als die Anwendung.
- **Empfehlung:** Entscheiden: entweder in die Pipeline aufnehmen (Playwright ist bereits installiert und könnte die Seite laden und das Ergebnis auswerten) oder ersatzlos entfernen, da die Node-Tests dieselben Fälle abdecken.
- **Aufwand:** M

### T7 — Keine automatisierten Browser-Tests, obwohl Playwright installiert ist
- **Status:** offen
- **Fundstelle:** `package.json:26-27`
- **Auswirkung:** Alle GUI-Befunde dieses Berichts (U1 Mobile-Layout, U2 horizontales Scrollen, U3 Toast-Überlagerung, K4 Tastaturbedienung) sind mit jsdom grundsätzlich **nicht** auffindbar — jsdom rechnet kein Layout. Genau dafür liegt Playwright ungenutzt im Projekt. Der Smoke-Test läuft in jsdom und prüft nur die Ereignis-Delegation.
- **Empfehlung:** Den bestehenden Smoke-Test auf Playwright umstellen und um drei Layout-Zusicherungen ergänzen: kein horizontales Scrollen bei 390 px, `.code-row` einspaltig unter 768 px, keine zwei sichtbaren Toasts an derselben Position. Alle drei sind heute rot.
- **Aufwand:** M

### T8 — Keine Tests für die SQL-Analyse-Bandbreite
- **Status:** offen
- **Fundstelle:** `test/core.test.js:114-157`
- **Auswirkung:** `analyzeSqlElements` ist mit rund 140 Zeilen und über 20 Regex-Mustern die komplexeste Funktion des Projekts, wird aber im Wesentlichen gegen **eine** Beispielabfrage (`SELECT … FROM Users u INNER JOIN Orders o …`) geprüft. Für CTEs (`WITH … AS`), `MERGE`, `CREATE PROCEDURE`, Unterabfragen, `INSERT … (Spaltenliste)`, `UPDATE … SET` und Index-Definitionen existiert kein Test, obwohl alle eigene Muster im Code haben. Bei Unterabfragen ist zudem fraglich, ob das nicht-gierige `SELECT … FROM`-Muster korrekt greift — ungeprüft.
- **Empfehlung:** Je einen kompakten Test pro Musterfamilie ergänzen; die Funktion ist DOM-frei und direkt aufrufbar, der Aufwand liegt bei wenigen Zeilen pro Fall.
- **Aufwand:** M

---

# Finale Bewertung

| Kriterium | Note | Begründung |
|---|---|---|
| **Architektur** | **7/10** | Die Trennung von DOM-freiem Core und UI-Schicht ist konsequent, sauber dokumentiert und macht die Kernlogik isoliert testbar — das ist die richtige Grundentscheidung. Dagegen stehen eine 1047-Zeilen-UI-Datei mit ausschließlich globalem Zustand (W6) und ein vollständig doppelt ausgeführter C#-/SQL-Pfad (W5), der bereits nachweislich zu einseitig korrigierten Fehlern geführt hat (W2). |
| **Stabilität** | **6/10** | 107 Tests grün, keine Konsolenfehler, saubere Fehlerbehandlung bei Speicher- und Zwischenablage-Fehlern, keine Abstürze in allen geprüften Grenzfällen. Der Abzug kommt nicht von Abstürzen, sondern vom stillen Auseinanderlaufen von Analyse- und Verschleierungszustand (K1, R2, R4): Die Anwendung meldet Erfolg, wo sie nichts getan hat. |
| **Wartbarkeit** | **6/10** | Der Code ist ungewöhnlich gut kommentiert, die Kommentare erklären Absichten statt Syntax, die Namensgebung ist konsistent. Dem stehen die durchgängige Duplikation (W5), fehlender Linter und fehlende CI (W7), toter Code (R5, Q1, Q2) und ein zweiter, ungeprüfter Testbestand (T6) entgegen. |
| **Benutzerfreundlichkeit** | **6/10** | Am Desktop ist der Ablauf klar geführt, die Auswahltabelle mit Typspalte ist ein echter Mehrwert, Statusmeldungen sind vorhanden und verständlich. Auf Mobilgeräten ist die Anwendung durch eine wirkungslose CSS-Regel jedoch praktisch unbenutzbar (U1, U2), Meldungen verdecken einander (U3), und ohne Maus ist die Hälfte der Anwendung unerreichbar (K4). |
| **Professionalität** | **7/10** | CSP-Härtung, ARIA-Rollen, Export/Import mit Formatvalidierung, Größenlimit beim Import, gepflegter README und ein Publish-Skript zeigen echten Anspruch. Die Details verwässern das Bild: tote CSS-Regeln, Kommentar-Marker aus einem alten Review, doppelt gepflegte Version, eine deklarierte, aber nie genutzte Abhängigkeit und ein ausgeschlossenes Lockfile. |
| **Release-Reife** | **5/10** | Für den Eigengebrauch des Autors einsatzfähig. Für ein Release an mehrere tausend Kunden nicht: Ein Werkzeug, dessen einziger Zweck Vertraulichkeit ist, darf nicht ohne Warnung Klartext ausliefern — und tut das derzeit auf drei unabhängigen Wegen (K1, K2, K3). Dazu kommt ein Barrierefreiheits-Verstoß auf Stufe A in der Hauptnavigation (K4). K1, K3 und K4 sind zusammen an einem Arbeitstag zu beheben; K2 verlangt vor allem Ehrlichkeit in der Oberfläche. Danach ist eine 8/10 realistisch. |

**Empfohlene Reihenfolge:** K1 → K3 → K4 → U1/U2/U3 → W2 → K2 → W1/W4 → Rest.
Die ersten drei beseitigen die Fälle, in denen die Anwendung dem Nutzer etwas Falsches sagt; U1–U3 und W2 sind kleine Eingriffe mit sofort sichtbarer Wirkung; K2 ist überwiegend eine Frage der Kommunikation.

---

# Änderungshistorie

Erstdurchlauf — kein Vorgängerbericht. Alle 45 Befunde sind neu vergeben (K1–K4, W1–W9, U1–U12, R1–R6, Q1–Q6, T1–T8).

Zur Einordnung: Unmittelbar vor diesem Review wurde ein 13 Punkte umfassender Korrekturplan (`docs/superpowers/plans/2026-06-28-review-fixes.md`) vollständig abgearbeitet. Die dortigen Korrekturen sind im Code nachweisbar und wirksam — mit **einer** Ausnahme: Aufgabe 11 („`.code-row` auf Mobile einspaltig") wurde umgesetzt, ist aber durch die Regelreihenfolge im Stylesheet wirkungslos (U1). Die Aufgaben 2 (Cross-Tab-Schutz) und 8 (Chip-Mindestlänge) haben zudem je eine Nebenwirkung hinterlassen, die dieser Bericht neu erfasst: toter Code (R5) und Datenverlust beim Wiederherstellen kurzer Wörter (W4).

---

**Stand: 4 kritisch · 9 wichtig · 12 UX · 6 Risiken · 6 Quick Wins · 8 Test — davon 0 behoben**
