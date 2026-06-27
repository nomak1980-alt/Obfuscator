# 🔒 C# & MS SQL Code Obfuscator

Eine einfache Web-Anwendung zur Verschleierung von C# und MS SQL Code für die sichere Weitergabe an KI-Modelle.

## 🎯 Zweck

Dieser Obfuscator hilft dabei, vertrauliche Bezeichner im Code zu verschleiern, bevor du ihn an KI-Modelle wie ChatGPT, Claude, etc. weitergibst. Nach Erhalt der KI-Antwort kannst du den Code wieder zurückverwandeln.

## 🚀 Funktionen

### **C# – String-Replace**
- Du trägst in bis zu 3 Replace-Sets die Wörter ein, die ersetzt werden sollen (ein Wort pro Zeile).
- Alle Schreibvarianten im Code werden als **ganze Wörter** gefunden (`customer`, `Customer`, `CUSTOMER`).
- Du wählst per Auswahl-Tabelle aus, welche davon tatsächlich verschleiert werden.

### **MS SQL – automatische Elementerkennung**
- Erkennt Tabellen, Felder, Prozeduren, Funktionen und Objekte über SQL-Syntax (FROM, JOIN, SELECT, ON, …).
- Intelligente Filterung reservierter Wörter und System-Schemata (`dbo`, `sys`, …).
- Zusätzlich optionaler String-Replace (vor der Analyse).

### **Verschleierung**
- Eindeutige, **kollisionssichere** Platzhalter (`STR_PLACEHOLDER_1`, `SQL_TABLE_1`, `SQL_COL_1`, …).
- Ersetzung nur an Wortgrenzen – keine Teilstring-Treffer (`User` zerstört `Username` nicht).
- Kopierbare Ergebnisse für die KI-Eingabe.

### **Rückverwandlung**
- **Byte-genaue** Wiederherstellung des Original-Codes.
- Längen-sortierte, `$`-sichere Rück-Ersetzung (kein `_1` vor `_10`, keine `$&`-Injection).

### **Persistenz & Backup**
- Automatisches Speichern im Browser (localStorage), versioniert.
- Export/Import des kompletten Zustands als JSON-Datei (mit Format-Validierung beim Import).

## 🌐 Nutzung

Öffne einfach die `obfuscator.html` Datei in einem modernen Webbrowser:

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
- Ersetzungen sind wortgrenzen-bewusst (keine Teilstring-Treffer).
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
- `test/integration.test.js` – DOM-Schicht via jsdom (inkl. Sicherheits-Edge-Cases)
- `test/smoke.test.js` – lädt die echte `obfuscator.html` end-to-end

Zusätzlich kann `tests.html` direkt im Browser geöffnet werden.

## 📂 Projektstruktur

```
Obfuscator/
├── obfuscator.html          # Hauptanwendung (Markup)
├── obfuscator.css           # Styles
├── obfuscator-core.js       # Reine Obfuskierungslogik (DOM-frei, testbar)
├── obfuscator.js            # DOM-/UI-/Persistenz-Schicht
├── tests.html               # Browser-Testseite
├── test/                    # Node-Tests (core, integration, smoke)
├── package.json             # npm test + Dev-Abhängigkeiten
└── README.md                # Dokumentation
```

## 🔮 Zukünftige Erweiterungen

- [x] Import/Export von Mapping-Konfigurationen
- [ ] Unterstützung für weitere Programmiersprachen
- [ ] Batch-Verarbeitung für mehrere Dateien
- [ ] Dark Mode UI
- [ ] Erweiterte Analytik-Statistiken

## 🤝 Beitrag

Fehlermeldungen und Verbesserungsvorschläge sind willkommen!

---

**Hinweis:** Diese Anwendung ist ausschließlich für die Verschleierung von Code gedacht, bevor er an externe KI-Dienste weitergegeben wird. Sie ersetzt nicht professionelle Sicherheitsmaßnahmen.
