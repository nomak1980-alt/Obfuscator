# Release-Review — Code Obfuscator (C# & MS SQL) — 2026-08-07

| | |
|---|---|
| **Commit** | `f68c51a` — *docs: Review-Fix-Plan von 1067 auf 64 Zeilen komprimieren* |
| **Branch** | `main` |
| **Umfang** | Vollständig: `obfuscator-core.js` (648 Z.), `obfuscator.js` (1324 Z.), `obfuscator.css` (597 Z.), `obfuscator.html` (324 Z.), `test/*.js` (1439 Z.), `package.json`, `eslint.config.js`, `.github/workflows/test.yml`, `publish.ps1`, `README.md`, `.gitignore` |
| **Vorgängerbericht** | [`release-review-2026-08-05.md`](release-review-2026-08-05.md) — 45 Befunde, alle mit Status `offen` |
| **Verifikation** | `npm test`, `npm run lint`, `npm run coverage` ausgeführt; Kernlogik in Node nachgestellt; Anwendung real in Chromium via Playwright bedient (Desktop 1920×1080 und Mobil 390×844); jeder der 45 Altbefunde einzeln am Code bzw. an der laufenden Anwendung gegengeprüft |
| **Nachtrag** | In derselben Session wurden anschließend **alle 10 offenen Befunde korrigiert** (Runde 2 in der Änderungshistorie). Die Befundtexte unten beschreiben den analysierten Zustand; der Status jedes Befunds gibt den Stand nach der Korrektur wieder. |

**Harte Fakten aus diesem Durchlauf**

| Messung | 2026-08-05 | heute |
|---|---|---|
| `npm test` | 107 Tests, 0 Fehler | **189 Tests, 0 Fehler** (core 63 · integration 97 · persistence 14 · smoke 10 · layout 5) |
| Coverage | nicht gemessen | **84,83 % Stmts** gesamt — Core 100 %, UI 77,41 % |
| Linter | nicht vorhanden | ESLint 10, **0 Fehler / 9 Warnungen** |
| CI | nicht vorhanden | `.github/workflows/test.yml` (lint + Playwright + Tests) |
| `npm audit` | 1 High | **0 vulnerabilities** |
| Lockfile | ignoriert | eingecheckt |
| Browser-Testebene | nur jsdom | Playwright/Chromium (`test/layout.test.js`) |
| Konsolenfehler im Browser | keine | keine |
| Performance C# (84 KB, 4200 Elemente) | — | Analyse 4 ms · Verschleiern 91 ms · Rückverwandeln 99 ms · Round-Trip exakt |
| Performance realer Browser (300 Klassen → 2100 Zeilen) | — | Analyse + Rendern 127 ms · Verschleiern 48 ms |

Die Performance ist unverändert unauffällig und in diesem Bericht bewusst **kein** Befund — mit einer Ausnahme am oberen Ende, siehe W10.

---

# Executive Summary

Zwischen den beiden Berichten liegt ein außergewöhnlich vollständiger Korrekturlauf: **44 der 45 Befunde sind nachweislich behoben**, verifiziert am Code und an der laufenden Anwendung. Alle vier kritischen Punkte des Vorberichts sind erledigt — Verschleiern nach Code-Änderung wird blockiert, die Erfolgsmeldungen zählen echte Ersetzungen statt Mapping-Größen, abgewählte Begriffe und mögliche Geheimnisse werden aktiv gemeldet, und der MS-SQL-Tab ist per Pfeiltasten erreichbar. Dazu kam die Infrastruktur, die vorher komplett fehlte: CI, ESLint, Coverage-Messung, eine echte Browser-Testebene mit Playwright und ein eingechecktes Lockfile. Die Testzahl hat sich auf 189 fast verdoppelt, `npm audit` ist sauber. Das ist ein anderer Reifegrad als vor zwei Tagen.

Der Bericht kann trotzdem keine Freigabe empfehlen, weil dieser Durchlauf **einen neuen kritischen Befund** zutage gefördert hat, den der Vorbericht nicht hatte: **Bezeichner mit Umlauten werden nicht erkannt und mitten im Wort zerschnitten** (K5). Die Erkennungs-Regexe arbeiten durchgängig mit `[a-zA-Z_][a-zA-Z0-9_]*`, C# und T-SQL erlauben aber Unicode-Buchstaben. Verifiziert: Aus `class Kundenprüfung` wird `class CS_CLASS_1üfung`, während `Größe`, `Straße` und `anzahlHäuser` unangetastet im Klartext an die KI gehen. Im SQL-Tab wird aus `Gebäude` der Platzhalter `SQL_TABLE_1äude`, und `Räume` verschwindet gar nicht erst aus dem Text. Beide Schadensbilder treffen genau die Zusagen, die das Werkzeug macht: keine Teilstück-Ersetzung und Vertraulichkeit der Bezeichner. Für eine deutschsprachige Codebasis — und der bisherige Testbestand des Projekts selbst ist deutschsprachig — ist das kein Randfall.

Daneben stehen drei kleinere, aber echte Lücken: die Warnung über zurückgebliebene Platzhalter wird ausgerechnet dann unterdrückt, wenn *alle* Platzhalter beschädigt zurückkamen (R7); der gespeicherte Zustand ist das Zehnfache des Quelltextes groß, sodass die Anwendung ab etwa 570 KB Eingabe den Arbeitsstand beim nächsten Neuladen verliert, obwohl sie Eingaben bis 1 MB kommentarlos annimmt (W10); und „Alle auswählen" wirkt auch auf Zeilen, die der frisch eingebaute Filter gerade ausblendet (U13).

K5 ist ein Halbtagesfix (Zeichenklassen auf Unicode umstellen, Tests ergänzen). R7 und U13 sind je ein paar Zeilen. Danach ist dieses Werkzeug releasefähig.

---

# Kritische Probleme

### K1 — Verschleiern nach Code-Änderung liefert Klartext mit Erfolgsmeldung
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:32-33` (`lastAnalyzedCsharpCode`/`lastAnalyzedSqlCode`), `obfuscator.js:681-684`, `obfuscator.js:941-944`
- **Verifikation:** Der bei der Analyse gemerkte Codestand wird zu Beginn von `obfuscateCode()`/`obfuscateSqlCode()` verglichen. Im Browser nachgestellt: Code A analysieren → Code B einfügen → „Verschleiern" → `obfuscatedCode` bleibt **leer**, Meldung „Der Code wurde seit der Analyse geändert — bitte erneut analysieren." als Fehlerstatus. Der Stand wird auch persistiert (`saveState`/`loadState`), überlebt also ein Neuladen. Abgesichert durch Integrationstests („K1 – Verschleiern nach Code-Änderung wird abgelehnt", 5 Zusicherungen inkl. SQL-Pfad).

### K2 — String-Literale, Kommentar-Inhalte und Zahlen werden nie verschleiert — ohne jeden Warnhinweis
- **Status:** behoben
- **Fundstelle:** `obfuscator-core.js:144-156` (`SECRET_HINT_PATTERNS`, `findSecretHints`), `obfuscator.js:465-471`, `obfuscator.html:40-46` und `180-184` (`warning-box`), `README.md:9`
- **Verifikation:** Beide Empfehlungsteile umgesetzt. (a) Ein nicht ausblendbarer Warnkasten steht in beiden Tabs über der Anleitung und benennt die Grenze ausdrücklich; der README hat denselben Hinweis prominent unter „Zweck". (b) Nach dem Verschleiern läuft `findSecretHints` über das Ergebnis. Im Browser nachgestellt mit `private const string CONN = "Server=prod-sql01;User=sa;Password=Geheim123;"`: Meldung „⚠ Mögliche Zugangsdaten/Geheimnisse in Zeile 3 entdeckt …" als **Fehlerstatus** (rot). Die Grenze selbst besteht bewusst weiter — das Passwort steht weiterhin im Klartext, jetzt aber angesagt. Zur Trefferqualität der Heuristik siehe den neuen Befund W11.

### K3 — Keine Verifikation des Ergebnisses; Zähler melden Mapping-Größe statt tatsächlicher Ersetzungen
- **Status:** behoben
- **Fundstelle:** `obfuscator-core.js:106-137` (`onMatch`-Rückruf in `applyReplacements`/`reverseReplacements`), `obfuscator.js:459-463` (`unreplacedWarning`), `obfuscator.js:720-743`, `obfuscator.js:963-1002`
- **Verifikation:** Der Core zählt echte Treffer über einen optionalen `onMatch`-Rückruf, der im Funktions-Replacer sitzt. Beide Punkte des Vorberichts nachgestellt: Code mit Chip `IBAN`, Zeile `IBAN` abgewählt → Meldung „… Achtung: 1 abgewählte(r) Begriff(e) bleibt/bleiben im Klartext: IBAN." als Fehlerstatus. Und bei null Ersetzungen lautet die Meldung „Code **NICHT** verschleiert! 0 Ersetzung(en) vorgenommen." statt einer grünen Erfolgsmeldung. Abgesichert durch fünf Integrationstests („K3 – echte Ersetzungszähler statt Mapping-Größe").

### K4 — MS-SQL-Tab ist per Tastatur nicht erreichbar (WCAG 2.1.1, Stufe A)
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:1256-1273`
- **Verifikation:** `keydown`-Handler auf `[role="tablist"]` mit `ArrowRight`/`ArrowLeft` (mit Umlauf), `Home` und `End`; jeweils `switchTab()` plus `focus()` auf den neuen Tab und `preventDefault()`. In Chromium nachgestellt: Fokus auf `#tab-csharp`, `ArrowRight` → `#tab-mssql` hat `aria-selected="true"` **und** den Fokus; `ArrowLeft` schaltet zurück. Abgesichert durch Smoke-Tests.

### K5 — Bezeichner mit Umlauten werden nicht erkannt und mitten im Wort zerschnitten
- **Status:** behoben
- **Fundstelle:** `obfuscator-core.js:501` (`ID` in `analyzeCSharpElements`), `obfuscator-core.js:274` (`ID` in `analyzeSqlElements`), `obfuscator-core.js:78-80` (`containingWordRegex`), `obfuscator-core.js:89-94` (`wordRegex`)
- **Auswirkung:** Sämtliche Erkennungs- und Ersetzungs-Regexe arbeiten mit ASCII-Zeichenklassen (`[a-zA-Z_][a-zA-Z0-9_]*` bzw. `\w`, `\b`). C# erlaubt aber ausdrücklich Unicode-Buchstaben in Bezeichnern, T-SQL ebenso. Daraus folgen **zwei** Schadensbilder, beide in Node und im Browser verifiziert:

  1. **Stiller Klartext-Leak.** Aus
     ```csharp
     public class Kundenprüfung {
         private string Größe;
         public void BerechneStraße(int anzahlHäuser) { var zwischenGröße = 1; }
     }
     ```
     erkennt die Auto-Analyse **ein einziges** Element — und zwar `Kundenpr`. `Größe`, `BerechneStraße`, `anzahlHäuser` und `zwischenGröße` werden gar nicht erst zur Auswahl angeboten und gehen unverändert an die KI. Der Nutzer sieht eine gefüllte Auswahltabelle und hat keinen Anhaltspunkt, dass vier von fünf Bezeichnern fehlen.
  2. **Zerhackte Bezeichner im Ergebnis.** Weil `\b` in JavaScript ohne `u`-Flag an der Grenze zwischen `r` und `ü` greift, wird der Torso tatsächlich ersetzt: das an die KI gehende Ergebnis lautet `public class CS_CLASS_1üfung { … }`. Das verletzt die im Kopf von `obfuscator-core.js` ausdrücklich zugesicherte Eigenschaft „ersetzt wird immer der komplette Bezeichner, nie ein Teilstück".

  Beide Pfade sind betroffen, nicht nur die Auto-Analyse:
  - **String-Replace (C#):** Suchwort `Raum` in `var RaumGröße = 1;` → Auswahltabelle zeigt `RaumGr`, Ergebnis wird `var STR_PLACEHOLDER_1öße = 1;`.
  - **SQL:** `SELECT Größe, Anzahl FROM Gebäude INNER JOIN Räume ON Gebäude.ID = Räume.GebäudeID` → erkannt werden `Geb`, `Gr`, `Anzahl`; das Ergebnis lautet `SELECT SQL_COL_1öße, SQL_COL_2 FROM SQL_TABLE_1äude INNER JOIN Räume ON SQL_TABLE_1äude.ID = Räume.SQL_TABLE_1äudeID`. **`Räume` bleibt vollständig im Klartext.**

  Der Round-Trip bleibt in allen geprüften Fällen byte-genau — der Nutzer verliert also keinen Code, sondern Vertraulichkeit, und die KI bekommt syntaktisch beschädigte Bezeichner. Für eine deutschsprachige Codebasis ist das der Normalfall, nicht der Sonderfall; der Testbestand des Projekts selbst führt Bezeichner wie `RaumOhneAenderungsnachweis` und `BefuelleInfrastrukturTreeView`.
- **Empfehlung:** Die Zeichenklassen konsequent auf Unicode umstellen. Konkret: `ID` in beiden Analyse-Funktionen auf `[\p{L}_][\p{L}\p{N}_]*` mit `u`-Flag an den erzeugten RegExp; `containingWordRegex` von `\w*` auf `[\p{L}\p{N}_]*` (ebenfalls mit `u`); `wordRegex` statt `\b` auf Lookaround-Grenzen `(?<![\p{L}\p{N}_])` / `(?![\p{L}\p{N}_])` umstellen — das ist zugleich robuster als `\b` und behebt beide Schadensbilder in einem Schritt. Alle beteiligten Funktionen sind DOM-frei und durch die vorhandenen 63 Core-Tests abgesichert; zusätzlich die Testfälle aus T9 ergänzen. Achtung bei `isValidId` in `analyzeSqlElements` (`obfuscator-core.js:279-283`) — die dortige Prüfung muss dieselbe Zeichenklasse verwenden, sonst filtert sie die neu erkannten Namen wieder heraus.
- **Aufwand:** M

---

# Wichtige Verbesserungen

### W1 — Import überschreibt entgegen der Bestätigung nicht den gesamten Arbeitsstand
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:356-360` und `392-394` (`else`-Zweige), `obfuscator.js:791-812` (`resetCsharpFields`), `obfuscator.js:1046-1065` (`resetSqlFields`)
- **Verifikation:** `loadState()` ruft für einen fehlenden Zweig jetzt aktiv `resetCsharpFields()` bzw. `resetSqlFields()` auf. Die Reset-Bausteine wurden — wie empfohlen — aus `clearAll`/`clearSqlAll` herausgezogen und werden von beiden Seiten genutzt. Abgesichert durch drei Integrationstests („W1 – fehlender Zweig beim Laden/Importieren wird aktiv geleert").

### W2 — SQL-Auswahltabelle zeigt andere Platzhalter als das tatsächliche Ergebnis
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:972-984`
- **Verifikation:** `obfuscateSqlCode()` übernimmt die Platzhalter jetzt exakt aus `cb.dataset.obfuscated` statt sie über `assignSqlPlaceholders` neu zu vergeben — analog zum C#-Pfad. Der Kommentar an der Stelle benennt W2 als Grund. Abgesichert durch zwei Integrationstests, die prüfen, dass der Platzhalter aus der Tabelle tatsächlich an der Stelle des jeweiligen Originals im Ergebnis steht. *(Nebenbefund: `assignSqlPlaceholders` wird dadurch von der Anwendung nicht mehr aufgerufen — es ist aber weiterhin exportiert und getestet, insofern kein toter Code im engeren Sinn.)*

### W3 — Auto-Analyse erkennt keine Member-Zugriffe auf fremde Typen
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:43-45`, `README.md:9`
- **Verifikation:** Wie empfohlen wurde die Heuristik **nicht** erweitert, sondern die Lücke sichtbar gemacht: Der Warnkasten im C#-Tab nennt Member-Zugriffe auf fremde Klassen mit dem Beispiel `kunde.Vertragsnummer` ausdrücklich und verweist auf String-Replace als Ausweg; der README wiederholt das. Die technische Lücke besteht bewusst weiter.

### W4 — Wörter mit weniger als drei Zeichen gehen beim Laden und Importieren stillschweigend verloren
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:104-126` (`addChip(..., skipValidation)`), Aufrufe in `obfuscator.js:328`, `335`, `370`, `376`
- **Verifikation:** Die Wiederherstellung übergibt `skipValidation = true`; die Mindestlänge greift weiterhin für Eingaben über Tastatur und `+`-Button. Abgesichert durch zwei Integrationstests („W4 – kurze Chips überleben Laden/Importieren", explizit mit dem Wort `id`).

### W5 — Der C#- und der SQL-Pfad sind über die gesamte UI-Schicht doppelt implementiert
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:620-672` gegen `872-932`; `674-745` gegen `934-1004`; `752-782` gegen `1011-1039`; `791-819` gegen `1046-1072`
- **Auswirkung:** Der empfohlene kleinste Schritt ist erledigt: `analyzeCSharp` und `analyzeSqlStringReplace` teilen sich jetzt `findWordVariants` im Core (`obfuscator-core.js:163-187`), und der Kommentar dort benennt W2 als Mahnung. Darüber hinaus wurden `showStatus`/`showSqlStatus` auf `renderStatus` zusammengeführt, `addChip`, `renderMappingList`, `syncSelectAll`, `updateSelectionCounter` und `initMappingFilter` sind gemeinsam genutzt. Der zweite empfohlene Schritt — die beiden Tabellen-Renderer über eine Konfiguration zu vereinen — steht aus; ebenso bleiben `obfuscateCode`/`obfuscateSqlCode`, `deobfuscateCode`/`deobfuscateSqlCode` und `resetCsharpFields`/`resetSqlFields` paarweise nahezu identisch. Konkrete Folge in diesem Bericht: K5 muss an drei verschiedenen Stellen korrigiert werden, weil die Zeichenklassen dreimal getrennt definiert sind (`obfuscator-core.js:274`, `501`, `78`).
- **Empfehlung:** `renderCsharpSelectionTable` und `displaySqlMappingSelection` über eine Konfiguration `{containerId, checkboxClass, selectAllId, counterId, rows}` vereinen — die Zeilendaten unterscheiden sich nur in den `dataset`-Feldnamen (`original`/`placeholder` gegen `element`/`obfuscated`), was sich beim Aufbau normalisieren lässt. Unabhängig davon: die Zeichenklassen-Konstanten für K5 an **einer** Stelle im Core definieren und von allen drei Verwendern importieren, damit die Korrektur nicht wieder auseinanderläuft.
- **Aufwand:** L

### W6 — Globaler Modul-Zustand erzwingt `eval`-Konstrukte in den Tests
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:11-12` und `1324` (IIFE), `obfuscator.js:1163-1205` (`window.ObfuscatorUI`)
- **Verifikation:** Die gesamte UI-Schicht liegt in einer IIFE; nach außen gibt es genau einen Export mit Aktionen, Persistenz-Funktionen, einem lesenden `_state`-Getter-Block und einem `_test`-Seam (`mockSaveState`, `resetCsharp`, `resetSql`). Der Integrationstest greift ausschließlich über `window.ObfuscatorUI` zu; die `ev("…")`-String-Konstruktionen und die eingeschleusten `window.__t`/`window.__csharpWords` sind verschwunden. Auch der `saveState`-Mock läuft jetzt über den offiziellen Seam statt über eine Neuzuweisung im `eval`-Scope.

### W7 — Kein Lockfile im Repository, keine CI, kein Linter
- **Status:** behoben
- **Fundstelle:** `.gitignore` (kein `package-lock.json` mehr), `.github/workflows/test.yml`, `eslint.config.js`, `package.json:8` (`lint`-Skript)
- **Verifikation:** `package-lock.json` ist eingecheckt. Die GitHub-Action läuft auf `push` und `pull_request` gegen `main` mit `npm ci` → `npm run lint` → `npx playwright install chromium` → `npm test`. ESLint 10 mit Flat-Config, `js.configs.recommended` plus `no-unused-vars`, getrennten Globals für Anwendung und Tests. `npm run lint` läuft lokal mit 0 Fehlern. *(Einschränkung: die 9 verbleibenden Warnungen brechen den Build nicht — siehe neuen Befund T10.)*

### W8 — `npm audit`: 1 High in `undici`; `playwright` als ungenutzte Abhängigkeit deklariert
- **Status:** behoben
- **Fundstelle:** `package.json:29-35`
- **Verifikation:** `npm audit` meldet **0 vulnerabilities** (jsdom auf ^29.1.1, undici-Kette bereinigt). Über `playwright` wurde die zweite der beiden angebotenen Optionen gewählt: Es wird jetzt tatsächlich genutzt (`test/layout.test.js`) und ist damit gerechtfertigt — das schließt zugleich T7. Zusätzlich neu: `c8` für die Coverage-Messung.

### W9 — Vertraulicher Quellcode liegt unbefristet und unverschlüsselt im localStorage — und ist über `file://` für andere lokale Seiten lesbar
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:24` (`storage-hint`), `README.md:42` und `44-55`
- **Verifikation:** Beide empfohlenen Maßnahmen umgesetzt. (a) Der README empfiehlt jetzt ausdrücklich `npx serve publish` statt Doppelklick und begründet das mit der fehlenden Origin-Isolierung von `file://`; der Doppelklick-Weg bleibt dokumentiert, aber mit Hinweis. (b) Ein dauerhaft sichtbarer Hinweis direkt unter der Kopfzeile nennt die unbefristete Speicherung; der README wiederholt das unter „Persistenz & Backup". Verschlüsselung wurde — korrekt — nicht vorgetäuscht.

### W10 — Der gespeicherte Zustand ist das Zehnfache des Quelltextes; ab ~570 KB Eingabe geht der Arbeitsstand verloren
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:179-238` (`saveStateImpl`), insbesondere `195` (`lastAnalyzedCode`), `193-194` (`csharpAutoMapping` + `csharpAutoTypeMap`), `197` (`selection`), `obfuscator.js:53` (`MAX_SAFE_INPUT`)
- **Auswirkung:** Im Browser gemessen mit 41,4 KB C#-Quelltext: der localStorage-Eintrag ist **413 KB groß, also Faktor 10**. Die Aufteilung zeigt, dass es überwiegend Redundanz ist — `selection` 174 KB, `csharpAutoMapping` 58 KB und `csharpAutoTypeMap` 47 KB halten dieselben Original-/Platzhalter-/Typ-Tripel dreifach; `lastAnalyzedCode` (41,7 KB) ist eine wortgleiche Kopie von `originalCode`. Praktische Folge, ebenfalls verifiziert: Bei 509 KB Quelltext belegt der Zustand 4,4 MB und passt gerade noch; bei **730 KB Quelltext schlägt das Speichern fehl** — die Anwendung meldet das korrekt („Automatisches Speichern fehlgeschlagen: Datenmenge zu groß für den Browser-Speicher.", Fehlerstatus), aber nach dem nächsten Neuladen sind Eingabefeld und Auswahltabelle **leer**: der komplette Arbeitsstand ist weg. Die Anwendung nimmt Eingaben jedoch bis `MAX_SAFE_INPUT` = 1 MB entgegen und warnt dort nur davor, dass „die Verarbeitung den Browser kurz einfrieren" kann — von Datenverlust ist keine Rede. Zwischen 570 KB und 1 MB liegt damit ein Bereich, in dem die Anwendung zur Nutzung einlädt und die Persistenz stillschweigend aufgibt.
- **Empfehlung:** Zwei kleine Eingriffe, unabhängig voneinander wirksam. (a) Redundanz beseitigen: `lastAnalyzedCode` durch einen Hash ersetzen (`Core` hat mit `hashCode` bereits eine passende Funktion — der Vergleich in `obfuscateCode()` braucht keinen Volltext), und `selection` als alleinige Quelle behandeln, aus der `csharpAutoMapping`/`csharpAutoTypeMap` beim Laden ohnehin schon abgeleitet werden (`restoreCsharpSelection`, `obfuscator.js:253-277`). Das drückt den Faktor grob von 10 auf 3. (b) `MAX_SAFE_INPUT` an der Realität ausrichten und den Bestätigungstext um den Hinweis ergänzen, dass sehr große Eingaben nicht mehr automatisch gespeichert werden können.
- **Aufwand:** M

### W11 — Die Geheimnis-Heuristik schlägt bei gewöhnlichen Vergleichen an
- **Status:** behoben
- **Fundstelle:** `obfuscator-core.js:144-147` (`SECRET_HINT_PATTERNS`)
- **Auswirkung:** Die Muster prüfen auf `…\s*=` und schließen Vergleichsoperatoren nicht aus. Verifiziert: `if (secret == null) return;`, `var server = GetServer();`, `obj.Secret = value;` und `string apiKeyName = "x";` lösen alle die Warnung „⚠ Mögliche Zugangsdaten/Geheimnisse in Zeile …" aus, obwohl kein Geheimnis vorliegt. Weil diese Warnung den Gesamtstatus auf **Fehler** (rot) setzt, ist der Effekt nicht kosmetisch: Ein Nutzer, dessen Code eine Variable `server` oder `secret` enthält, bekommt bei *jedem* Verschleiern eine rote Meldung und gewöhnt sich daran, sie wegzuklicken — genau dann, wenn sie einmal berechtigt ist. Entlastend wirkt, dass die Heuristik auf dem **verschleierten** Ergebnis läuft: Ist der Bezeichner ausgewählt worden, heißt er dort `CS_LOCAL_1` und löst nicht mehr aus (verifiziert). Der Fehlalarm trifft also die Fälle, in denen der Nutzer den Bezeichner abgewählt hat oder er nicht erkannt wurde — nach K5 sind das im deutschsprachigen Code viele.
- **Empfehlung:** Die Muster auf ein Gleichheitszeichen einschränken, dem kein weiteres folgt und kein Vergleichsoperator vorangeht: statt `/password\s*=/i` etwa `/password\s*=(?![=>])/i`, und analog für die übrigen. `/api[_-]?key/i` und `/connectionstring/i` zusätzlich auf einen String-Literal-Kontext eingrenzen (`["'][^"']*api[_-]?key`), damit reine Bezeichnernamen wie `apiKeyName` nicht auslösen. Die Funktion ist DOM-frei und hat bereits drei Core-Tests, an die sich Fälle anhängen lassen.
- **Aufwand:** S

---

# UX- und GUI-Optimierungen

### U1 — Die Mobile-Regel für `.code-row` ist wirkungslos (Reihenfolge im Stylesheet)
- **Status:** behoben
- **Fundstelle:** `obfuscator.css:566-597`
- **Verifikation:** Der komplette `@media (max-width: 768px)`-Block steht jetzt am Dateiende, mit einem Kommentar, der genau diesen Grund festhält. In Chromium gemessen: bei 390 px hat `.code-row` **eine** Spalte, bei 1920 px **zwei**. Beide Richtungen sind als Regressionsschutz in `test/layout.test.js` festgeschrieben.

### U2 — Kopfzeile erzeugt auf Mobilgeräten horizontales Scrollen
- **Status:** behoben
- **Fundstelle:** `obfuscator.css:591-596` (`.header-row { flex-wrap: wrap; gap: 12px; }`), `obfuscator.css:578-580` (`.button-group button { width: 100% }`)
- **Verifikation:** Die `width: 100%`-Regel wurde wie empfohlen auf `.button-group button` eingegrenzt, sodass Toolbar- und Chip-Buttons ihre natürliche Breite behalten. In Chromium bei 390 px gemessen: `scrollWidth <= clientWidth`, also **kein** horizontales Scrollen. Als Layout-Test festgeschrieben.

### U3 — Alle drei Statusmeldungen liegen exakt übereinander
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:25-29` (`.toast-stack`), `obfuscator.css:210-231`
- **Verifikation:** Die drei Meldungs-Elemente liegen jetzt in einem gemeinsamen `position: fixed`-Container mit `flex-direction: column-reverse` und `gap: 8px`; die Einzelmeldungen sind statisch positioniert. Im Browser mit **allen drei** gleichzeitig sichtbaren Toasts geprüft: keine zwei überlappen sich. `pointer-events: none` am Container mit `auto` an den Meldungen sorgt zusätzlich dafür, dass der leere Stapel keine Klicks abfängt. Als Layout-Test festgeschrieben.

### U4 — Leere Statusfelder behalten Mindestbreite und Schlagschatten
- **Status:** behoben
- **Fundstelle:** `obfuscator.css:226-231`
- **Verifikation:** `min-width` und `box-shadow` hängen jetzt an `.toast-stack .status` statt an den IDs. Beim Ausblenden wird `className` geleert, der Selektor greift damit nicht mehr. Im Browser nachgemessen: nach dem Schließen hat das Element 0 × 0 px — kein Schmutzfleck.

### U5 — „Alles Löschen" löscht nur den aktuellen Tab
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:98` („🗑️ C#-Daten löschen"), `obfuscator.html:236` („🗑️ SQL-Daten löschen")
- **Verifikation:** Beschriftungen stimmen jetzt mit dem Bestätigungsdialog und dem tatsächlichen Verhalten überein. *(Zwei Textstellen sind beim Umbenennen zurückgeblieben — siehe neuen Befund Q8.)*

### U6 — Die String-Replace-Spalte ist zu vier Fünfteln leer, die Auswahltabelle unausgewogen
- **Status:** behoben
- **Fundstelle:** `obfuscator.css:289-312` (`table-layout: fixed` + Spaltenbreiten), `obfuscator.css:430` (`.code-row { align-items: start }`)
- **Verifikation:** Die Tabelle hat feste Breiten (50 px / 120 px / auto / auto) mit `overflow-wrap: break-word` für die beiden Namensspalten. Die Chip-Sektion wird über `align-items: start` am Grid nicht mehr auf Codehöhe gestreckt — das ist die gleichwertige Lösung zum vorgeschlagenen `align-self: start`.

### U7 — Der eingeklappte Zustand der Auswahl-Sektion überlebt kein Neuladen
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:166-173` (`captureSections`), `obfuscator.js:291-305` (`applySections`)
- **Verifikation:** `captureSections` speichert jetzt `{ display, collapsed }` statt nur des Display-Strings, `applySections` stellt beides wieder her. Bemerkenswert sauber gelöst: `applySections` erkennt das Altformat (reiner String) und lädt alte Stände weiterhin korrekt. Abgesichert durch zwei Integrationstests.

### U8 — Bei großen Dateien fehlen „Alle abwählen", Filter und Kennzahlen in der Auswahltabelle
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:111-117` und `249-255` (Filterzeile), `obfuscator.js:516-551`, `obfuscator.js:1248-1254`
- **Verifikation:** Über beiden Auswahltabellen steht jetzt eine Zeile mit Freitextfilter, Typ-Auswahl und Zähler „x von y ausgewählt"; das Filtern läuft wie vorgeschlagen rein über eine CSS-Klasse (`filtered-out`) und ändert nichts an der Mapping-Logik. Abgesichert durch drei Integrationstests. *(Die Interaktion von Filter und „Alle auswählen" ist dabei nicht bedacht worden — siehe neuen Befund U13.)*

### U9 — Farbsemantik: Fehler sehen aus wie der Import-Button, Erfolg ist blau
- **Status:** behoben
- **Fundstelle:** `obfuscator.css:233-244`
- **Verifikation:** `.status.error` ist auf `#dc2626` umgestellt (identisch mit `.btn-danger`), `.status.success` auf `#4ade80` (identisch mit der Platzhalter-Farbe). Beides waren im Stylesheet bereits etablierte Farben, die Palette ist damit in sich stimmig: Gefahr = Rot, Erfolg = Grün, Hinweis/Sekundär = Bernstein. Die im Vorbericht als Randnotiz gestellte Frage, ob Blau oder das Orange des Logos die Leitfarbe sein soll, ist eine Gestaltungsentscheidung und kein Mangel — sie bleibt bewusst offen.

### U10 — Die Anleitung ist ein Fließtextblock mit neun Pfeilschritten
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:47-62` und `185-200`
- **Verifikation:** Beide Anleitungen sind nummerierte `<ol>`-Listen in einer standardmäßig eingeklappten `collapsible`-Sektion. Der Grenzen-Hinweis aus K2 steht wie empfohlen als eigener, **nicht** ausblendbarer Warnkasten darüber.

### U11 — „Verwendete Mappings" steht über dem verschleierten Code
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:124-148` (C#), `obfuscator.html:262-286` (SQL)
- **Verifikation:** Reihenfolge im Markup jetzt: verschleierter Code mit Kopier-Button → „Verwendete Mappings" → KI-Antwort. In beiden Tabs identisch.

### U12 — Versionsnummer an zwei Stellen gepflegt
- **Status:** behoben
- **Fundstelle:** `publish.ps1:39-46`, `obfuscator.html:316`
- **Verifikation:** `package.json` ist die führende Quelle; `publish.ps1` liest die Version daraus und ersetzt den Badge in der **kopierten** HTML per Regex. Im Publish-Lauf dieser Session bestätigt („Version-Badge gesetzt: v1.0.0"). Die Formatabweichung (`v1.0` gegen `1.0.0`) ist damit ebenfalls beseitigt.

### U13 — „Alle auswählen" und der Zähler ignorieren den aktiven Filter
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:666-669` (C#), `obfuscator.js:921-924` (SQL), `obfuscator.js:516-522` (`updateSelectionCounter`)
- **Auswirkung:** Der mit U8 eingeführte Filter blendet Zeilen über die Klasse `filtered-out` aus, aber die Kopf-Checkbox setzt unverändert `document.querySelectorAll('.csharp-mapping-checkbox')` — also **alle** Zeilen, auch die gerade unsichtbaren. Im Browser verifiziert: Auswahltabelle gefiltert auf „Kunde", danach die Kopf-Checkbox abgewählt → sämtliche ausgefilterten Zeilen sind ebenfalls abgewählt, ohne dass der Nutzer sie je gesehen hat. Anschließendes Verschleiern erfasst entsprechend nur noch die sichtbaren. Das ist die gefährlichere Richtung: Der Nutzer filtert, um *gezielt* etwas zu bearbeiten, und ändert dabei unbemerkt den Schutzstatus von Bezeichnern außerhalb seines Filters. Immerhin schlägt K3 danach an und meldet die abgewählten Begriffe — die Warnung nennt aber nur die ersten fünf. Der Zähler verstärkt die Verwirrung: Bei 3 sichtbaren und 7 ausgefilterten Zeilen zeigt er „x von 10 ausgewählt", bezieht sich also auf eine Menge, die auf dem Bildschirm nicht zu sehen ist.
- **Empfehlung:** Beide `change`-Handler auf die sichtbaren Zeilen einschränken: `document.querySelectorAll('.csharp-mapping-checkbox')` durch eine Auswahl ersetzen, die `cb.closest('tr').classList.contains('filtered-out')` ausschließt (die Filterlogik in `applyMappingFilter` setzt diese Klasse bereits). Den Zähler bei aktivem Filter zweiteilig ausgeben, z. B. „2 von 3 sichtbar ausgewählt (12 von 40 gesamt)", damit die Gesamtmenge nicht aus dem Blick gerät.
- **Aufwand:** S

---

# Versteckte Fehler und Risiken

### R1 — Export gibt die Blob-URL synchron nach dem Klick wieder frei
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:1090-1097`
- **Verifikation:** Alle drei empfohlenen Maßnahmen umgesetzt: `document.body.appendChild(a)` vor dem Klick, `a.remove()` danach, `URL.revokeObjectURL` in einem `setTimeout(…, 1000)`. Der Kommentar an der Stelle nennt Firefox als Anlass.

### R2 — Rückverwandeln funktioniert auch, wenn nie verschleiert wurde
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:37-38` (`hasObfuscatedCsharp`/`hasObfuscatedSql`), gesetzt in `692` und `952`, zurückgesetzt in `596` und `861`, geprüft in `758` und `1017`
- **Verifikation:** Das empfohlene Flag existiert, wird von `analyzeCode()` zurückgesetzt, von `obfuscateCode()` gesetzt und persistiert. Im Browser doppelt abgesichert: Nach reiner Analyse ist die Sektion „KI-Antwort" gar nicht sichtbar (`display: none`), und ein direkter Aufruf von `ObfuscatorUI.deobfuscateCode()` lässt `finalCode` leer und meldet „Kein Mapping verfügbar!". Abgesichert durch vier Integrationstests.

### R3 — Zurückgebliebene Platzhalter im finalen Code werden nicht erkannt
- **Status:** behoben
- **Fundstelle:** `obfuscator-core.js:606-624` (`findLeftoverPlaceholders`), `obfuscator.js:476-481` (`leftoverPlaceholderWarning`)
- **Verifikation:** Die Prüfung läuft wie empfohlen über alle bekannten Präfix-Konstanten. Im Browser nachgestellt: KI-Antwort mit einem gültigen und einem verfälschten Platzhalter → „Code erfolgreich zurückverwandelt! 1 Ersetzung(en) vorgenommen. ⚠ 1 Platzhalter im Ergebnis übrig geblieben: CS_METHOD_9." als Fehlerstatus. *(Die Warnung greift allerdings nicht in jedem Fall — siehe neuen Befund R7.)*

### R4 — `csharpAutoTypeMap` wird beim Verschleiern nicht mitgeführt
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:703` und `713`
- **Verifikation:** `csharpAutoTypeMap` wird in `obfuscateCode()` zurückgesetzt und aus `cb.dataset.type` neu aufgebaut, analog zu den beiden anderen Maps; der Kommentar nennt R4. Abgesichert durch zwei Integrationstests.

### R5 — Toter Code: `clearSavedState()` wird von der Anwendung nicht mehr aufgerufen
- **Status:** behoben
- **Fundstelle:** —
- **Verifikation:** Kein Vorkommen von `clearSavedState` mehr in `obfuscator.js`, `obfuscator.html` oder `test/` (Volltextsuche über das Repository: 0 Treffer). Die Mock-Zeilen in den Tests sind mitgezogen worden.

### R6 — `getReplaceWords` steuert über einen magischen String
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:579`, `obfuscator.js:836`
- **Verifikation:** Die Funktion ist entfernt (0 Treffer im Repository); die beiden Aufrufstellen verwenden jetzt direkt `[...csharpReplaceWords]` bzw. `[...sqlReplaceWords]`.

### R7 — Die Warnung über übrig gebliebene Platzhalter wird ausgerechnet im schlimmsten Fall unterdrückt
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:774-780` (C#), `obfuscator.js:1031-1037` (SQL)
- **Auswirkung:** `leftoverPlaceholderWarning(finalCode)` wird korrekt berechnet, aber nur in den `else`-Zweig der Statusmeldung eingesetzt. Bei `restoredCount === 0` gewinnt der andere Zweig, und die Warnung fällt ersatzlos weg. Das ist genau der Fall, in dem am meisten übrig bleibt: Wenn die KI **alle** Platzhalter verändert zurückgibt, gibt es null Treffer — und damit keinen Hinweis darauf, welche Platzhalter im Ergebnis stehen. Im Browser verifiziert (Original `public class Kundendienst { public Kunde GetKunde(int kundenId) … }`):

  | Fall | Meldung | `finalCode` |
  |---|---|---|
  | 1 Treffer, 1 Rest | „… 1 Ersetzung(en) vorgenommen. ⚠ 1 Platzhalter im Ergebnis übrig geblieben: CS_METHOD_9." | korrekt gewarnt |
  | **0 Treffer, 3 Reste** | „Zurückverwandeln ohne Treffer: Kein bekannter Platzhalter in der KI-Antwort gefunden." | `public class CS_CLASS_9 { public CS_CLASS_9 CS_METHOD_9(int CS_PARAM_9) …` — **keine Nennung der drei Reste** |

  Der Status ist in beiden Fällen `error`, die Meldung im zweiten Fall aber irreführend: Sie sagt, es sei *kein bekannter* Platzhalter gefunden worden, und verschweigt, dass drei *unbekannte* im Ergebnis stehen. Der Nutzer sieht ein gefülltes Ergebnisfeld und einen Kopier-Button.
- **Empfehlung:** Die Warnung aus dem Ternär herausziehen und in beiden Zweigen anhängen — eine Zeile je Funktion:
  ```js
  const base = restoredCount === 0
      ? 'Zurückverwandeln ohne Treffer: Kein bekannter Platzhalter in der KI-Antwort gefunden.'
      : `Code erfolgreich zurückverwandelt! ${restoredCount} Ersetzung(en) vorgenommen.`;
  showStatus(base + leftoverWarning, (restoredCount === 0 || leftoverWarning) ? 'error' : 'success');
  ```
  Der bestehende Integrationstest „R3 – zurückgebliebene Platzhalter" deckt nur den Treffer-Fall ab und muss um den Null-Treffer-Fall ergänzt werden.
- **Aufwand:** S

---

# Quick Wins

### Q1 — Tote CSS-Regeln entfernen
- **Status:** behoben
- **Fundstelle:** —
- **Verifikation:** `.stats`, `.stat-item`, `.stat-number`, `.stat-label` und die `h1`-Regel sind aus `obfuscator.css` verschwunden. `.warning-box` ist nicht mehr tot, sondern trägt jetzt den K2-Warnkasten in beiden Tabs. Stichprobe über alle neueren Klassen (`storage-hint`, `toast-stack`, `instructions-list`, `mapping-filter-row`, `filtered-out`, `version-badge`, `chip-input-row`, `btn-chip-add`): jede wird verwendet.

### Q2 — Veraltete DOM-Attrappen aus den Tests entfernen
- **Status:** behoben
- **Fundstelle:** `test/integration.test.js:31` und `48`
- **Verifikation:** Von den sechs Geister-IDs sind alle bis auf die tatsächlich existierenden `csharpUsedMappingDisplay`/`sqlUsedMappingDisplay` verschwunden. `tests.html` — die zweite Fundstelle — existiert nicht mehr (siehe T6).

### Q3 — Veraltete Kommentar-Marker im Markup
- **Status:** behoben
- **Fundstelle:** —
- **Verifikation:** Keine `FIX #`-Kommentare mehr in `obfuscator.html` (0 Treffer). Die verbliebenen Kommentare (`<!-- C# Tab Content -->`, `<!-- MS SQL Tab Content -->`) sind sachliche Gliederung.

### Q4 — `publish.ps1` führt die Tests nicht aus
- **Status:** behoben
- **Fundstelle:** `publish.ps1:4-13`, `publish.ps1:29`
- **Verifikation:** `npm test` läuft als erster Schritt mit Abbruch bei `$LASTEXITCODE -ne 0`; `README.md` steht in der Kopierliste. Im Publish-Lauf dieser Session bestätigt: erst 189 grüne Tests, dann sieben kopierte Dateien.

### Q5 — Doppelte `escapeHtml`-Weiterleitung
- **Status:** behoben
- **Fundstelle:** —
- **Verifikation:** Keine lokale `function escapeHtml` in `obfuscator.js` mehr (0 Treffer); alle Aufrufstellen nutzen `Core.escapeHtml`.

### Q6 — Benennung `mapToReverse(reverseSqlMapping)` führt beim Lesen in die Irre
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:76-78`
- **Verifikation:** Umbenannt in `toPlaceholderEntries` — einer der beiden im Vorbericht vorgeschlagenen Namen, und der aussagekräftigere. Das Gegenstück heißt konsistent `mapToForward`.

### Q7 — `reverseStringReplaceMapping` ist toter Zustand
- **Status:** behoben
- **Fundstelle:** `obfuscator.js:18`, geschrieben in `342`, `581`, `716` und `799`
- **Auswirkung:** Die Variable wird an vier Stellen sorgfältig gepflegt (`buildReverse`, Reset) und **nirgends gelesen**. `deobfuscateCode()` macht die String-Replace-Ersetzungen über `replacementHistory` rückgängig, nicht über diese Map. ESLint meldet das bereits als einzige inhaltliche Warnung: *"'reverseStringReplaceMapping' is assigned a value but never used"* — sie ist im Rauschen der acht ungenutzten `catch`-Parameter untergegangen. Das ist keine Fehlfunktion, aber irreführender Zustand: Beim Lesen von `obfuscateCode()` entsteht der Eindruck, es gäbe zwei gleichwertige Rückwege für String-Replace, und ein künftiger Umbau könnte auf die falsche Quelle greifen. Das SQL-Pendant `reverseSqlStringReplaceMapping` wird demgegenüber tatsächlich verwendet (`obfuscator.js:1027`) — die Asymmetrie macht es zusätzlich verwirrend.
- **Empfehlung:** Entweder die Variable samt ihrer vier Zuweisungen entfernen, oder — konsistenter — `deobfuscateCode()` auf `toPlaceholderEntries(reverseStringReplaceMapping)` umstellen und dafür `replacementHistory` abschaffen, das dieselbe Information ein drittes Mal hält (und laut W10 mitgespeichert wird). Die zweite Variante bringt C#- und SQL-Pfad auf dieselbe Form.
- **Aufwand:** S

### Q8 — Zwei Textstellen nennen noch den alten Buttontext „Alles Löschen"; die Projektstruktur im README ist überholt
- **Status:** behoben
- **Fundstelle:** `obfuscator.html:24`, `README.md:42`, `README.md:117`, `README.md:131-145`
- **Auswirkung:** Kleinigkeiten aus dem letzten Korrekturlauf. (a) Der Speicher-Hinweis unter der Kopfzeile endet mit „… bis „Alles Löschen" geklickt wird", und der README schreibt „Bei Bedarf über „Alles Löschen" manuell entfernen" — einen Button dieses Namens gibt es seit U5 nicht mehr; er heißt jetzt „C#-Daten löschen" bzw. „SQL-Daten löschen". Beide Sätze sind zudem sachlich ungenau geworden, weil keiner der beiden Buttons noch den gesamten Speicher leert. (b) Der Projektstruktur-Baum im README listet drei Testdateien, es sind fünf; `persistence.test.js`, `layout.test.js`, `eslint.config.js`, `publish.ps1` und `.github/workflows/` fehlen. Direkt darüber (Zeile 117) steht der Kommentar „Core-, Integrations- und Smoke-Tests", während die Liste darunter korrekt alle fünf Dateien beschreibt.
- **Empfehlung:** Die beiden Hinweistexte auf „über die Lösch-Buttons je Tab" umformulieren und den Projektstruktur-Baum um die fünf fehlenden Einträge ergänzen. Reine Textänderung.
- **Aufwand:** S

---

# Testlücken

### T1 — Die gesamte Persistenzschicht ist in den Tests abgeschaltet
- **Status:** behoben
- **Fundstelle:** `test/persistence.test.js` (101 Zeilen, 14 Tests)
- **Verifikation:** Eine eigene Test-Datei ohne `saveState`-Mock, die exakt den empfohlenen Ablauf prüft: Zustand in beiden Tabs aufbauen → `saveState()` → zurücksetzen → `loadState()` → Textfelder, Chips, Auswahltabellen beider Tabs, Sektions-Sichtbarkeit und ein abschließender Round-Trip. Die 14 Zusicherungen decken auch die vorher blinden Stellen `captureCsharpSelection`, `captureSqlSelection`, `captureSections`, `applySections` und `buildReverse` ab.

### T2 — Export und Import sind vollständig ungetestet
- **Status:** behoben
- **Fundstelle:** `test/integration.test.js` (Blöcke „T2 – isValidImportState" und „T2 – importState")
- **Verifikation:** `isValidImportState` wird gegen neun Strukturen geprüft (gültig, fehlendes `version`, `version` als String, zu hohe Version, `null`, String statt Objekt, gültige und zwei Arten verfälschter Map-Paare). `importState` wird mit `File`-Stub und gestubbtem `FileReader` gegen drei Fälle geprüft, darunter die 10-MB-Grenze und kaputtes JSON — beide vorher nur manuell verifiziert.

### T3 — Kein Test für den kritischen Pfad „Code nach der Analyse geändert" (K1)
- **Status:** behoben
- **Fundstelle:** `test/integration.test.js` (Block „K1 – Verschleiern nach Code-Änderung wird abgelehnt")
- **Verifikation:** Fünf Zusicherungen: `obfuscatedCode` bleibt leer (kein Klartext-Leak), die Sektion bleibt versteckt, die Fehlermeldung verlangt eine erneute Analyse — jeweils für C# und SQL.

### T4 — Keine Zusicherung, dass Auswahltabelle und Ergebnis dieselben Platzhalter verwenden (W2)
- **Status:** behoben
- **Fundstelle:** `test/integration.test.js` (Block „W2 – SQL-Auswahltabelle zeigt dieselben Platzhalter wie das Ergebnis")
- **Verifikation:** Prüft genau das Empfohlene — dass der in der Tabelle angezeigte Platzhalter tatsächlich an der Stelle des zugehörigen Originals im Ergebnis steht, für `Users` und `Orders` einzeln.

### T5 — Keine Coverage-Messung
- **Status:** behoben
- **Fundstelle:** `package.json:9` (`coverage`-Skript), `package.json:31` (`c8`)
- **Verifikation:** `npm run coverage` läuft. Gemessen: **84,83 % Statements** gesamt — `obfuscator-core.js` **100 %** Statements / 86,98 % Branches, `obfuscator.js` 77,41 % / 57,93 %. `c8` kam wie vorgeschlagen als einzige zusätzliche Dev-Abhängigkeit dazu, das `coverage/`-Verzeichnis ist in `.gitignore`.

### T6 — `tests.html` läuft nicht in `npm test` und pflegt eine eigene Optik
- **Status:** behoben
- **Fundstelle:** —
- **Verifikation:** Von den beiden angebotenen Optionen wurde die zweite gewählt: `tests.html` existiert nicht mehr. Die Node-Tests decken dieselben Fälle ab und laufen in CI. *(Randnotiz: `eslint.config.js:59` führt `tests.html` noch in `ignores` — folgenlos, aber ein Rest.)*

### T7 — Keine automatisierten Browser-Tests, obwohl Playwright installiert ist
- **Status:** behoben
- **Fundstelle:** `test/layout.test.js` (64 Zeilen, 5 Tests), `.github/workflows/test.yml:16`
- **Verifikation:** Genau die drei empfohlenen Layout-Zusicherungen sind umgesetzt und laufen in echtem Chromium: kein horizontales Scrollen bei 390 px, `.code-row` einspaltig unter 768 px, keine überlappenden Toasts. Dazu kamen zwei sinnvolle Ergänzungen: Konsolenfehler-Prüfung und ein Desktop-Gegentest (zweispaltig bei 1920 px) als Regressionsschutz für den U1-Fix. Die CI installiert Chromium mit.

### T8 — Keine Tests für die SQL-Analyse-Bandbreite
- **Status:** behoben
- **Fundstelle:** `test/core.test.js` (Block „T8 – SQL-Analyse-Bandbreite")
- **Verifikation:** Je ein Test pro Musterfamilie, wie empfohlen: CTE (`WITH … AS`), `MERGE` (Ziel- und Quelltabelle), `CREATE PROCEDURE`, Unterabfrage, `INSERT` mit Spaltenliste, `UPDATE … SET`, `CREATE INDEX`. Die im Vorbericht offene Frage, ob das nicht-gierige `SELECT … FROM`-Muster in geschachtelten Klammern greift, ist damit beantwortet und abgesichert.

### T9 — Kein Test verwendet Bezeichner mit Umlauten oder anderen Unicode-Buchstaben
- **Status:** behoben
- **Fundstelle:** `test/core.test.js`, `test/integration.test.js`
- **Auswirkung:** Umlaute kommen in beiden Dateien ausschließlich in **Testbeschreibungen** vor („Mindestlänge", „Ersetzungszähler", „Größe"), nie in den geprüften Code-Beispielen. Sämtliche Beispiele sind ASCII (`CustomerService`, `GetOrder`, `userId`, `Users`, `Orders`, `SvcRaum`, `RaumOhneAenderungsnachweis` — letzteres bezeichnenderweise mit „Ae" statt „Ä" geschrieben). Deshalb ist K5 durch 189 grüne Tests hindurchgegangen, obwohl es die zentrale Zusicherung des Core verletzt und der Zielmarkt deutschsprachig ist.
- **Empfehlung:** Vier kompakte Core-Tests ergänzen, die vor dem K5-Fix rot sein müssen: (a) `analyzeCSharpElements('public class Kundenprüfung { private string Größe; }')` erkennt **beide** Bezeichner vollständig; (b) das Verschleiern erzeugt keinen Rest hinter dem Platzhalter (Zusicherung: `/CS_[A-Z]+_\d+[\p{L}\p{N}_]/u` trifft nicht); (c) dasselbe für den String-Replace-Pfad (`analyzeCSharp('var RaumGröße = 1;', ['Raum'])` liefert `RaumGröße`, nicht `RaumGr`); (d) dasselbe für `analyzeSqlElements` mit `FROM Gebäude INNER JOIN Räume`.
- **Aufwand:** S

### T10 — ESLint läuft in der CI, aber Warnungen brechen den Build nicht
- **Status:** behoben
- **Fundstelle:** `package.json:8` (`"lint": "eslint obfuscator.js obfuscator-core.js test"`), `.github/workflows/test.yml:15`
- **Auswirkung:** Beide `no-unused-vars`-Regeln sind auf `'warn'` gesetzt, und `eslint` beendet sich bei Warnungen mit Code 0. Die CI-Stufe `npm run lint` ist damit grün, egal wie viele Warnungen auflaufen — aktuell neun. Acht davon sind ungenutzte `catch (e)`-Parameter und Rauschen; die neunte ist ein echter Befund, der genau deshalb übersehen wurde (Q7). Ein Gate, das nie zuschlägt, erzeugt Vertrauen ohne Gegenwert, und die Warnungsmenge wächst erfahrungsgemäß monoton.
- **Empfehlung:** Zwei Zeilen. (a) Das Rauschen beseitigen: In `eslint.config.js` `'no-unused-vars': ['warn', { caughtErrors: 'none' }]` setzen — damit fallen alle acht `catch`-Warnungen weg und nur der inhaltliche Befund bleibt stehen. (b) Danach das Skript auf `eslint … --max-warnings 0` umstellen, sodass die CI bei neuen Warnungen tatsächlich fehlschlägt.
- **Aufwand:** S

---

# Finale Bewertung

Die Noten unten beziehen sich auf den Stand **nach** dem Korrekturlauf dieser Session, in dem alle zehn zuvor offenen Befunde geschlossen wurden (Nachweise in der Änderungshistorie).

| Kriterium | 05.08. | 07.08. (Analyse) | nach Korrektur | Begründung |
|---|---|---|---|---|
| **Architektur** | 7/10 | 8/10 | **8/10** | Die UI-Schicht liegt in einer IIFE mit einem einzigen, bewusst gestalteten Export (`window.ObfuscatorUI`) samt lesendem `_state`- und schmalem `_test`-Seam. Mit W5 sind jetzt auch die beiden Auswahltabellen auf einen konfigurierten `renderSelectionTable` zusammengeführt, und die Bezeichner-Zeichenklassen liegen als vier Konstanten an genau einer Stelle im Core. Keine 9, weil `obfuscateCode`/`obfuscateSqlCode`, `deobfuscateCode`/`deobfuscateSqlCode` und die beiden Reset-Funktionen weiterhin paarweise nebeneinanderstehen — sie unterscheiden sich inhaltlich genug, dass eine Zusammenführung mehr kosten als bringen würde, aber Duplikation bleibt Duplikation. |
| **Stabilität** | 6/10 | 7/10 | **8/10** | Analyse- und Verschleierungszustand können nicht auseinanderlaufen (K1, R2, R4); die Anwendung schweigt jetzt an keiner geprüften Stelle mehr, wo sie reden müsste (R7 schließt die letzte). Umlaut-Bezeichner werden vollständig erkannt und nicht mehr zerhackt (K5). 216 Tests grün, keine Konsolenfehler, alle geprüften Round-Trips byte-genau. Keine 9, weil oberhalb von ~0,5 MB Eingabe weiterhin der Browser-Speicher die Grenze setzt — das ist jetzt angesagt und abgefangen, aber nicht gelöst. |
| **Wartbarkeit** | 6/10 | 8/10 | **9/10** | CI, ESLint, 86,01 % Coverage (Core 100 % Statements *und* 100 % Functions), Lockfile, ein zweiter Testbestand abgeschafft statt verwaltet, toter Code entfernt, `publish.ps1` mit Testgate und einer einzigen Versionsquelle. Das Lint-Gate schlägt jetzt tatsächlich zu (`--max-warnings 0`) — und hat sich in dieser Session schon bewährt, indem es ein `no-control-regex` in einer frisch geschriebenen Zeile abgefangen hat, bevor es committet wurde. |
| **Benutzerfreundlichkeit** | 6/10 | 8/10 | **9/10** | Mobile Layout, gestapelte Toasts, WCAG-2.1.1-konforme Tastaturbedienung, Filter mit Typ-Auswahl und Zähler, einklappbare Anleitung mit ehrlichem Warnkasten. Filter und „Alle auswählen" arbeiten jetzt zusammen statt gegeneinander, und der Zähler weist sichtbare und Gesamtmenge getrennt aus (U13). Die Geheimnis-Warnung feuert nicht mehr bei `if (secret == null)` und behält damit ihre Signalwirkung (W11). |
| **Professionalität** | 7/10 | 8/10 | **9/10** | Alle Textreste des Umbaus sind beseitigt, der Projektstruktur-Baum im README bildet den tatsächlichen Stand ab, und die Unicode-Unterstützung ist als Eigenschaft dokumentiert statt nur behoben. Die Korrektur-Kommentare im Code nennen durchgängig die Befund-ID, auf die sie zurückgehen — die Nachvollziehbarkeit über drei Review-Runden hinweg ist bemerkenswert gut. |
| **Release-Reife** | 5/10 | 6/10 | **8/10** | Der Blocker ist weg: In deutschsprachigem Code werden Bezeichner jetzt vollständig erkannt und als Ganzes ersetzt, in allen drei Pfaden (C#-Auto, String-Replace, SQL) und durch acht Tests abgesichert, die vor der Korrektur rot waren. Keine 9 oder 10, weil zwei bewusste Grenzen bestehen bleiben, die kein Fehler, aber eine Produkteigenschaft sind: Inhalte von Strings, Kommentaren und Zahlen werden nicht verschleiert (K2), und Member-Zugriffe auf fremde Typen werden nicht erkannt (W3). Beide sind in Oberfläche und README deutlich benannt — der Nutzer wird nicht getäuscht, muss aber wissen, was er tut. |

**Verbleibende Empfehlung vor einem Release an Kunden:** Keine Korrektur mehr offen. Sinnvoll wären noch zwei Dinge außerhalb des Befundkatalogs: ein kurzer Praxistest mit einer echten, großen Kundendatei aus dem Zielumfeld (die Testdaten sind synthetisch), und eine Entscheidung darüber, ob die UI-Coverage von 78 % bewusst so bleiben soll — die ungedeckten Zeilen sind überwiegend Zwischenablage- und Datei-Download-Pfade, die sich nur mit erheblichem Stub-Aufwand testen lassen.

---

# Änderungshistorie

## Runde 1 — Analyse (Stand `f68c51a`)

**Behoben seit dem Vorbericht (44 von 45):** K1, K2, K3, K4 · W1, W2, W3, W4, W6, W7, W8, W9 · U1, U2, U3, U4, U5, U6, U7, U8, U9, U10, U11, U12 · R1, R2, R3, R4, R5, R6 · Q1, Q2, Q3, Q4, Q5, Q6 · T1, T2, T3, T4, T5, T6, T7, T8.

Jeder dieser Befunde wurde einzeln am aktuellen Code verifiziert, die verhaltensrelevanten zusätzlich an der laufenden Anwendung in Chromium nachgestellt. In mehreren Fällen ist über die Empfehlung hinaus gearbeitet worden — U7 lädt Altformat-Stände weiterhin korrekt, T7 hat einen Desktop-Gegentest als Regressionsschutz bekommen, W6 löst den Test-Mock über einen sauberen Seam statt über eine Neuzuweisung.

**Weiterhin offen war:** W5 (zweiter Schritt der Entduplizierung).
**Neu erfasst (9):** K5, W10, W11, U13, R7, Q7, Q8, T9, T10.
**Verworfen:** keiner.

Vier der neuen Befunde (U13, R7, W11, T10) waren unmittelbare Nebenwirkungen des vorangegangenen Korrekturlaufs, zwei (Q7, Q8) dessen Textreste. **K5, W10 und T9 waren dagegen Altlasten**, die der Erstdurchlauf nicht gefunden hatte: Er hat die Regex-Zeichenklassen nicht auf Unicode und das Speicherverhalten nicht auf sein Mengengerüst geprüft.

## Runde 2 — Korrektur (alle 10 offenen Befunde geschlossen)

Abgearbeitet in der empfohlenen Reihenfolge, jeder Befund mit vorlaufend rotem Test.

| Befund | Umsetzung | Nachweis |
|---|---|---|
| **T9** | 8 Core-Tests mit Umlaut-Bezeichnern in allen drei Pfaden, zuerst rot | 5 rote Tests dokumentierten K5 exakt |
| **K5** | `ID_CHAR`/`IDENT`/`NOT_ID_BEFORE`/`NOT_ID_AFTER` als einzige Definition im Core; alle Analyse- und Ersetzungs-Regexe darauf umgestellt (u-Flag, Lookaround statt `\b`) | alle 5 Tests grün; `class Kundenprüfung` wird vollständig erkannt, `Größe`/`Straße`/`Häuser`/`Räume`/`Gebäude` leaken nicht mehr |
| **R7** | Leftover-Warnung aus dem Ternär gezogen, hängt jetzt an beiden Meldungszweigen (C# und SQL) | 3 Tests; 0 Treffer + 3 Reste meldet die Reste jetzt namentlich |
| **U13** | `visibleCheckboxes()` als gemeinsame Grundlage; „Alle auswählen", Kopf-Checkbox und Zähler beziehen sich nur noch auf sichtbare Zeilen; Zähler zweiteilig bei aktivem Filter | 5 Tests; im Browser: ausgefilterte Zeilen bleiben ausgewählt |
| **W11** | Zwei Bedingungen statt einer: Geheimnis-Wort direkt vor einer Zuweisung (kein Vergleich) **und** String-Literal in derselben Zeile | 4 Tests; `if (secret == null)`, `int server = 5`, `connectionStringBuilder` lösen nicht mehr aus, `var password = "hunter2"` weiterhin schon |
| **Q7** | totes `reverseStringReplaceMapping` samt seiner vier Zuweisungen entfernt | 0 Vorkommen, Lint sauber |
| **T10** | `caughtErrors: 'none'` beseitigt das Rauschen, danach `--max-warnings 0` | Gate hat in dieser Session bereits ein `no-control-regex` abgefangen |
| **W10** | Fingerabdruck (Länge + Hash) statt Volltext-Kopie; `csharpAutoTypeMap` nicht mehr persistiert; Auswahl als Tupel statt als Objekt je Zeile; `MAX_SAFE_INPUT` auf 0,5 MB mit ehrlichem Hinweistext | **413 KB → 232 KB** bei 41 KB Quelltext, Faktor **10,0 → 5,6**; 7 Tests inkl. Altformat-Kompatibilität |
| **Q8** | Buttontext-Reste in HTML und README korrigiert, Projektstruktur-Baum aktualisiert, Unicode-Fähigkeit dokumentiert | — |
| **W5** | `renderSelectionTable(cfg, rows)` ersetzt die beiden duplizierten Renderer; `CSHARP_TABLE`/`SQL_TABLE` als Konfiguration | ~55 Zeilen Duplikat entfernt, alle Tabellen-Tests unverändert grün |

**Eine Regression eingefangen und behoben:** Die Unicode-Lookbehinds aus K5 haben das erste Verschleiern eines 41-KB-Codes von 48 ms auf **585 ms** verlangsamt (einmalige Regex-Kompilierung von 2100 Mustern). Gelöst über einen ASCII-Schnellpfad in `wordRegex`: Solange weder Text noch Wort ein Zeichen jenseits von ASCII enthalten, ist `\b` nachweislich gleichbedeutend und wird verwendet. Ergebnis **44 ms** — wieder auf dem Stand vor K5. Zwei Tests sichern ab, dass der Schnellpfad die Korrektheit nicht untergräbt, insbesondere beim Zurückverwandeln, wo Umlaute erst durch die Ersetzung in den Text gelangen.

**Messwerte nach der Korrektur**

| Messung | vor der Session | danach |
|---|---|---|
| Tests | 189 | **216**, 0 Fehler |
| Coverage gesamt | 84,83 % | **86,01 %** |
| Coverage Core | 100 % Stmts / 96,15 % Funcs | **100 % / 100 %** |
| Lint | 9 Warnungen, folgenlos | **0**, Build bricht bei jeder neuen |
| localStorage-Faktor | 10,0× | **5,6×** |
| Verschleiern (41 KB, 2100 Elemente) | 48 ms | **44 ms** |

---

**Stand: 5 kritisch · 11 wichtig · 13 UX · 7 Risiken · 8 Quick Wins · 10 Test — alle 54 behoben, 0 offen**
