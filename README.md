# 🔒 C# & MS SQL Code Obfuscator

Eine einfache Web-Anwendung zur Verschleierung von C# und MS SQL Code für die sichere Weitergabe an KI-Modelle.

## 🎯 Zweck

Dieser Obfuscator hilft dabei, vertrauliche Bezeichner im Code zu verschleiern, bevor du ihn an KI-Modelle wie ChatGPT, Claude, etc. weitergibst. Nach Erhalt der KI-Antwort kannst du den Code wieder zurückverwandeln.

> ⚠️ **Grenze der Verschleierung:** Erkannt werden ausschließlich **Bezeichner** (Klassen, Methoden, Variablen, Tabellen, Spalten, …) anhand ihrer Deklaration bzw. Verwendung. Inhalte von **Zeichenketten, Kommentaren und Zahlenliteralen** – z. B. Connection-Strings, Passwörter, Kundennamen, Vertragsnummern – werden **nicht** erkannt und bleiben im Klartext. Ebenfalls nicht automatisch erkannt werden **Member-Zugriffe auf fremde Typen** (z. B. `kunde.Vertragsnummer` in einem Codeausschnitt, der `kunde` nicht deklariert) – solche Bezeichner bei Bedarf über String-Replace ergänzen. Vor dem Kopieren an die KI immer den verschleierten Code selbst prüfen.

## 🚀 Funktionen

### **C# – String-Replace**
- Trage Wörter über das Eingabefeld ein und drücke Enter oder klicke `+` (mindestens 3 Zeichen).
- Gefunden werden alle **ganzen Bezeichner, die das Wort enthalten** – unabhängig von Groß-/Kleinschreibung (`raum` findet `Raum`, `SvcRaum`, `iRaum`, `Raumnummer`). Jede Variante bekommt einen eigenen Platzhalter.
- Wörter in Kommentaren werden ebenfalls durchsucht und ersetzt.
- Du wählst per Auswahl-Tabelle aus, welche Varianten tatsächlich verschleiert werden.

### **C# – automatische Elementerkennung**
- Erkennt Klassen, Interfaces, Enums, Namespaces, Methoden, Properties, Felder, Parameter und lokale Variablen anhand der Deklarations-Syntax.
- Auch Typ-Verwendungen werden erfasst: `new Foo()`, Parameter-/foreach-/Rückgabe-Typen sowie generische Argumente (`List<SvcRaum>` → `SvcRaum`) gelten als Klassen.
- Parameter werden zusätzlich an Aufrufstellen erkannt: benannte Argumente (`Foo(iIX: …)`) und Lambda-Parameter (`x => …`).
- Bekannte C#-Keywords und Framework-Typen (`List`, `Task`, `Exception`, …) werden nicht verschleiert.

### **MS SQL – automatische Elementerkennung**
- Erkennt Tabellen, Felder, Prozeduren, Funktionen und Objekte über SQL-Syntax (FROM, JOIN, SELECT, ON, …).
- Intelligente Filterung reservierter Wörter und System-Schemata (`dbo`, `sys`, …).
- Zusätzlich optionaler String-Replace (vor der Analyse).

### **Verschleierung**
- Eindeutige, **kollisionssichere** Platzhalter (`STR_PLACEHOLDER_1`, `SQL_TABLE_1`, `SQL_COL_1`, …).
- String-Replace-Wörter treffen ganze Bezeichner, die das Wort enthalten (`raum` findet auch `SvcRaum`, `Raumnummer`) – ersetzt wird immer der komplette Bezeichner, nie ein Teilstück (`User` zerstört `Username` nicht, `Username` bekommt einen eigenen Platzhalter).
- Kopierbare Ergebnisse für die KI-Eingabe.

### **Rückverwandlung**
- **Byte-genaue** Wiederherstellung des Original-Codes.
- Längen-sortierte, `$`-sichere Rück-Ersetzung (kein `_1` vor `_10`, keine `$&`-Injection).

### **Persistenz & Backup**
- Automatisches Speichern im Browser (localStorage), versioniert.
- Export/Import des kompletten Zustands als JSON-Datei (mit Format-Validierung beim Import).
- ⚠️ **Eingaben bleiben dauerhaft im Browser gespeichert** – Originalcode, verschleierter Code, KI-Antwort und Mapping, ohne Ablaufdatum. Bei Bedarf über „Alles Löschen“ manuell entfernen.

## 🌐 Nutzung

**Empfohlen:** über einen lokalen HTTP-Server öffnen statt per Doppelklick:

```bash
npx serve publish
# oder aus dem Projektverzeichnis: npx serve .
```

Grund: `file://`-Seiten teilen sich in manchen Browsern den localStorage mit *jeder anderen* lokal geöffneten HTML-Datei – eine beliebige andere `.html`-Datei im selben Browser könnte den gespeicherten Code sonst auslesen. Ein lokaler HTTP-Ursprung (auch `localhost`) stellt echte Origin-Isolierung her.

Alternativ funktioniert weiterhin der direkte Doppelklick auf `obfuscator.html` – dann gilt obiger Hinweis zur Speicherisolierung.

```bash
# Doppelklick auf die Datei oder:
start obfuscator.html
```

### **Workflow**
1. **Code-Typ wählen** – C# oder MS SQL (Tabs)
2. **Code einfügen** – Dein Original-Code
3. **(C#) Replace-Wörter eintragen** bzw. **(SQL) nichts weiter nötig**
4. **Analysieren** – erzeugt die Auswahl-Tabelle
5. **Elemente auswählen** – welche Namen verschleiert werden sollen
6. **Verschleiern** – generiert den verschleierten Code
7. **Kopieren** – Code für die KI kopieren
8. **KI-Antwort einfügen** – die verschleierte Antwort zurückspielen
9. **Zurückverwandeln** – stellt den Original-Code wieder her

## 📝 Beispiel (C#)

### **Original Code:**
```csharp
public Customer GetCustomer(int userId) {
    return repository.FindById(userId);
}
```

### **Replace-Wörter:** `GetCustomer`, `userId`

### **Verschleierter Code (für die KI):**
```csharp
public Customer STR_PLACEHOLDER_1(int STR_PLACEHOLDER_2) {
    return repository.FindById(STR_PLACEHOLDER_2);
}
```

### **Nach Rückverwandlung:** wieder exakt das Original.

## 🏗️ Architektur

Die Logik ist bewusst vom UI getrennt:

| Datei | Verantwortung |
|---|---|
| `obfuscator-core.js` | **Reine** Obfuskierungs-/Deobfuskierungslogik – ohne DOM, in Browser *und* Node lauffähig und damit isoliert testbar |
| `obfuscator.js` | DOM-/UI-Schicht: Lesen/Schreiben der Felder, Persistenz (localStorage), Statusmeldungen, Event-Delegation |
| `obfuscator.css` | Styling |
| `obfuscator.html` | Markup (CSP-gehärtet, ARIA-Tabs, Labels) |

### **Korrektheits- und Sicherheitsgarantien (im Core)**
- Platzhalter kollidieren nie mit bereits im Code vorhandenen Strings (deterministischer Salt).
- Suchwörter treffen ganze Bezeichner (auch zusammengesetzte wie `SvcRaum` bei Suchwort `raum`); Platzhalter-Ersetzungen selbst sind wortgrenzen-bewusst – es wird nie ein Teilstück eines Bezeichners ersetzt.
- Rück-Ersetzung über Funktions-Replacer → keine `$`-Sonderzeichen-Injection.
- Deobfuskierung längen-sortiert → kein `_1` vor `_10`.
- Alle in die Oberfläche geschriebenen Nutzereingaben werden HTML-escaped (XSS-Schutz).

## 🧪 Entwicklung & Tests

Tests laufen headless in Node (jsdom als Dev-Abhängigkeit):

```bash
npm install   # einmalig: installiert jsdom
npm test      # Core-, Integrations- und Smoke-Tests
```

- `test/core.test.js` – reine Logik (DOM-frei, schnell)
- `test/integration.test.js` – DOM-Schicht via jsdom (inkl. Sicherheits-Edge-Cases, Export/Import)
- `test/persistence.test.js` – Speichern/Laden (localStorage) end-to-end, ohne Mock
- `test/smoke.test.js` – lädt die echte `obfuscator.html`, prüft data-action-Delegation
- `test/layout.test.js` – Playwright/Chromium: Mobile-Layout, horizontales Scrollen, Toast-Überlagerung, Konsolenfehler

```bash
npm run lint      # ESLint
npm run coverage  # Coverage-Bericht (c8) für obfuscator.js/obfuscator-core.js
```

## 📂 Projektstruktur

```
Obfuscator/
├── obfuscator.html          # Hauptanwendung (Markup)
├── obfuscator.css           # Styles
├── obfuscator-core.js       # Reine Obfuskierungslogik (DOM-frei, testbar)
├── obfuscator.js            # DOM-/UI-/Persistenz-Schicht
├── test/                    # Node-Tests (core, integration, smoke)
│   ├── core.test.js         # Logik-Tests (kein DOM)
│   ├── integration.test.js  # DOM-Schicht via jsdom
│   └── smoke.test.js        # End-to-End via echte HTML
├── package.json             # npm test + Dev-Abhängigkeiten
└── README.md                # Dokumentation
```

## 🔮 Zukünftige Erweiterungen

- [x] Import/Export von Mapping-Konfigurationen
- [x] Dark Mode UI
- [ ] Unterstützung für weitere Programmiersprachen
- [ ] Batch-Verarbeitung für mehrere Dateien
- [ ] Erweiterte Analytik-Statistiken

## 🤝 Beitrag

Fehlermeldungen und Verbesserungsvorschläge sind willkommen!

---

**Hinweis:** Diese Anwendung ist ausschließlich für die Verschleierung von Code gedacht, bevor er an externe KI-Dienste weitergegeben wird. Sie ersetzt nicht professionelle Sicherheitsmaßnahmen.
