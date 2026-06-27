# C# Auto-Analyse Implementation Plan

> **Status: ABGESCHLOSSEN** — alle 3 Tasks implementiert (Commits 5189516 → 5e18d68)

**Goal:** Automatische C#-Bezeichner-Erkennung im C#-Tab mit typspezifischen Platzhaltern (`CS_CLASS_1`, `CS_METHOD_1` etc.) in einer einheitlichen Auswahltabelle neben den manuellen String-Replace-Einträgen.

**Architecture:** Neue DOM-freie `analyzeCSharpElements()` in `obfuscator-core.js` erkennt C#-Bezeichner per Regex (Declaration-Syntax als Anker). `obfuscator.js` erweitert `analyzeCode()` um beide Analysen und mergt die Ergebnisse in eine Auswahltabelle mit Typ-Spalte. Verschleiern: String-Replace zuerst, dann Auto-Mapping. Rückverwandeln: umgekehrte Reihenfolge.

**Tech Stack:** Vanilla JS (ES5/UMD), kein Build-Schritt, Node.js + jsdom für Tests (`npm test`), eigener Test-Runner (`it`/`eq`/`assert` — nicht Jest).

## Global Constraints

- Pure Browser, kein Backend — Code bleibt in den vier Root-Dateien
- Publish-Folder: `obfuscator-core.js`, `obfuscator.js`, `obfuscator.html`, `obfuscator.css`
- Bestehender manueller String-Replace-Workflow bleibt unverändert
- Neue Core-Logik muss DOM-frei sein (für Node.js-Tests)
- UMD-Pattern in `obfuscator-core.js`: neue Exports im `return {}`-Block

## Architektur-Entscheidungen

### Typ-spezifische Platzhalter
```
CS_CLASS_    → Klasse
CS_IFACE_    → Interface
CS_ENUM_     → Enum
CS_NS_       → Namespace
CS_METHOD_   → Methode
CS_PROP_     → Property
CS_FIELD_    → Feld
CS_PARAM_    → Parameter
```

### Keyword-Filter
`CS_KEYWORD_SET` filtert C#-Schlüsselwörter + häufige .NET-Typen (`Task`, `List`, `Dictionary`, `DateTime` etc.) aus der Erkennung.

### Deklarations-Regex-Strategie
- Typen (`class`, `interface`, `enum`): einfache Keyword-Anchoring
- Namespace: mehrteilig, auf `.` aufteilen
- Member: Modifier-Präfix als Anker (`public|private|protected|...`) + Rückgabetyp-Token
- Parameter: `[,(] Type Name [,)=]`-Pattern
- First-seen gewinnt bei Duplikaten (Map-Eintrag)

### State-Persistenz (localStorage)
Zwei neue Felder im `csharp`-Block: `csharpAutoMapping` (Array), `csharpAutoTypeMap` (Array). Reverse-Maps werden bei `loadState()` aus Vorwärts-Maps abgeleitet.

### Unified Selection Table
`renderCsharpSelectionTable(strMap, autoMap, typeMap)` — 3 Argumente. String-Replace-Einträge bekommen `data-type="String"`, Auto-Einträge bekommen den Typ-Label aus `typeMap`.

## Implementierte Tasks

| Task | Dateien | Commit |
|------|---------|--------|
| 1: Core — `analyzeCSharpElements` + Unit-Tests | `obfuscator-core.js`, `test/core.test.js` | 61aeab9 |
| 2: UI — State, analyzeCode, render, obfuscate, deobfuscate, persist | `obfuscator.js`, `test/integration.test.js` | 5e18d68 |
| 3: HTML — info-box Text | `obfuscator.html` | 5e18d68 |

## Relevante Befehle

```bash
npm test                     # Alle Tests (core + integration + smoke)
.\publish.ps1                # Publish-Folder aktualisieren
git log --oneline 5189516..  # Commits dieser Feature-Branch
```
