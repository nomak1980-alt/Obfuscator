# Design: C# Auto-Analyse

**Datum:** 2026-06-24
**Status:** Approved

## Zusammenfassung

Der C#-Tab erhält eine automatische Bezeichner-Erkennung analog zum SQL-Tab. Nach einem einzigen Klick auf "Code Analysieren" laufen String-Replace und Auto-Analyse gemeinsam. Das Ergebnis erscheint in einer einzigen Auswahltabelle mit Typ-Spalte — der User entscheidet per Checkbox, was verschleiert wird.

## Constraints

- Reiner Browser, kein Backend
- Single-Publish-Folder (alle Dateien lokal, keine CDN-Abhängigkeiten)
- Einzel-Entwickler-Tool
- Anwendung bleibt kompakt
- Bestehender manueller String-Replace-Workflow bleibt erhalten

## Architektur

Drei Dateien werden verändert, eine Schicht pro Datei:

```
obfuscator-core.js   ← neue Funktion analyzeCSharpElements()
obfuscator.js        ← analyzeCode() erweitert, neuer State, neue Render-Funktion
obfuscator.html      ← Typ-Spalte in der Auswahltabelle
```

## Core-Logik (`obfuscator-core.js`)

### Neue Funktion: `analyzeCSharpElements(code)`

Analog zu `analyzeSqlElements`. Erkennt Bezeichner anhand ihrer Deklarations-Syntax. Gibt zurück:
`Array<{ element: string, type: string, placeholder: string }>`

`type` ist das deutschsprachige Anzeige-Label (wie SQL: "Tabelle", "Feld" — hier: "Klasse", "Methode" usw.)

### Erkannte Bezeichner-Typen

| Deklarations-Pattern | Typ | Platzhalter-Präfix |
|---|---|---|
| `class Foo` | Klasse | `CS_CLASS_` |
| `interface IFoo` | Interface | `CS_IFACE_` |
| `enum Foo` | Enum | `CS_ENUM_` |
| `namespace Foo.Bar` (jeder Teil) | Namespace | `CS_NS_` |
| `[Sichtbarkeit] [Modifier] Type Foo(` | Methode | `CS_METHOD_` |
| `[Sichtbarkeit] [Modifier] Type Foo {` | Property | `CS_PROP_` |
| `[Sichtbarkeit] [readonly] Type _foo;` | Feld | `CS_FIELD_` |
| alle Positionen: `(Type foo)`, `(Type foo,`, `, Type foo,`, `, Type foo)` | Parameter | `CS_PARAM_` |

### Filter

C#-Schlüsselwörter werden ignoriert: `public`, `private`, `protected`, `internal`, `static`, `abstract`, `virtual`, `override`, `sealed`, `readonly`, `const`, `async`, `await`, `void`, `string`, `int`, `bool`, `double`, `float`, `decimal`, `char`, `object`, `var`, `new`, `return`, `class`, `interface`, `enum`, `struct`, `namespace`, `using`, `if`, `else`, `for`, `foreach`, `while`, `do`, `switch`, `case`, `break`, `continue`, `try`, `catch`, `finally`, `throw`, `this`, `base`, `is`, `as`, `in`, `out`, `ref`, `params`, `get`, `set`, `yield`, `value`, `true`, `false`, `null`, `delegate`, `event`, `partial`, `extern`, `unsafe`, `volatile`, `checked`, `unchecked`, `fixed`, `lock`, `typeof`, `nameof`, `sizeof`, `default`, `operator`, `implicit`, `explicit`.

Framework-Typen (`List`, `Task`, `IEnumerable` usw.) erscheinen nicht, weil nur **deklarierte** Bezeichner erfasst werden — Typen, die als Annotation vorkommen, werden nicht gematcht.

### Neue Exporte

```js
CS_PREFIXES = {
  class: 'CS_CLASS_',
  iface: 'CS_IFACE_',
  enum: 'CS_ENUM_',
  namespace: 'CS_NS_',
  method: 'CS_METHOD_',
  prop: 'CS_PROP_',
  field: 'CS_FIELD_',
  param: 'CS_PARAM_'
}
analyzeCSharpElements   // neue Funktion
```

Bestehende Exporte (`analyzeCSharp`, `CS_PREFIX` für String-Replace) bleiben unverändert.

### Sicherheitsgarantien (identisch zu SQL)

- Kollisionsschutz via `uniqueSuffix()`: falls CS_CLASS_ etc. schon im Code vorkommt, greift deterministischer Salt
- Wortgrenzen-Regex `\b` auf beiden Seiten
- Funktions-Replacer → kein `$`-Injection-Risiko
- Deobfuskierung längen-sortiert → kein `_1` vor `_10`

## UI-Schicht (`obfuscator.js`)

### State-Erweiterung

```js
// NEU:
let csharpAutoMapping = new Map();         // element → placeholder
let reverseCsharpAutoMapping = new Map();  // placeholder → element
```

Bestehende Maps (`stringReplaceMapping`, `replacementHistory`) bleiben unverändert.

### `analyzeCode()` — Ablauf

1. String-Replace-Wörter aus den 3 Textareas lesen → `Core.analyzeCSharp()` → befüllt `stringReplaceMapping`
2. `Core.analyzeCSharpElements(originalCode)` → befüllt `csharpAutoMapping`
3. Beide Ergebnisse zusammenführen → eine gemeinsame Auswahltabelle rendern (mit Typ-Spalte)
4. Fehler, wenn beides leer: "Keine Elemente erkannt. Bitte Code einfügen oder Wörter eintragen."

### `obfuscateCode()` — Reihenfolge

1. String-Replace zuerst (wie bisher, aus `stringReplaceMapping`)
2. Auto-Mapping zweiter Schritt (aus `csharpAutoMapping`)

### `deobfuscateCode()` — Reihenfolge (umgekehrt)

1. Auto-Mapping rückgängig (`reverseCsharpAutoMapping`)
2. String-Replace rückgängig (`reverseStringReplaceMapping`)

### `renderCsharpSelectionTable()` — Erweiterung

- Header: `☑ | Typ | Original | Platzhalter`
- String-Replace-Einträge: Typ = "String"
- Auto-Erkannte: Typ = "Klasse" / "Methode" / "Property" etc.
- Checkboxen für alle Einträge — jede Checkbox trägt `data-original`, `data-placeholder` **und `data-type`** (für Restore aus localStorage)
- Bestehende Behavior beibehalten

### Persistenz (`saveState` / `loadState`)

`csharpAutoMapping` wird im `csharp`-Block des localStorage-Objekts mitgespeichert:
```js
csharpAutoMapping: Array.from(csharpAutoMapping.entries())
```
Beim Restore: `reverseCsharpAutoMapping` via `buildReverse()` abgeleitet (kein Speichern der Reverse-Map nötig — selbes Muster wie alle anderen Maps).

## HTML (`obfuscator.html`)

Einzige Änderung: `csharpMappingSelectionContainer` — die Tabellen-Header-Zeile bekommt eine Typ-Spalte (`<th>Typ</th>`) zwischen Checkbox und Original. Da die Tabelle per JS gerendert wird, ist das die einzige strukturelle HTML-Änderung.

Die Info-Box-Anleitung wird aktualisiert:
> "Füge deinen originalen C# Code ein → Trage optionale Replace-Wörter ein → Klicke 'Analysieren' → Wähle Elemente aus → Klicke 'Verschleiern'"

## Fehlerbehandlung

| Situation | Verhalten |
|---|---|
| Nur Auto-Analyse findet etwas | Funktioniert, Tabelle zeigt nur Auto-Erkannte |
| Nur manuelle Wörter eingetragen | Funktioniert wie bisher |
| Beides leer | Fehlermeldung: "Keine Elemente erkannt." |
| Sehr großer Input | Bestehender `confirmLargeInput`-Check greift |

## Tests

**`test/core.test.js`:**
- `analyzeCSharpElements` erkennt Klassen, Methoden, Properties, Parameter, Felder, Interfaces, Enums, Namespaces korrekt
- Negativtest: C#-Keywords tauchen nicht als erkannte Bezeichner auf
- Kollisionstest: wenn `CS_CLASS_` bereits im Code vorkommt, greift der Salt

**`test/integration.test.js`:**
- End-to-End via jsdom: Code mit manuellen Wörtern + Auto-Erkannten verschleiern und zurückverwandeln → byte-genau identisch
- Gemischter Input: Auto-Analyse ohne manuelle Wörter, manuelle Wörter ohne Auto-Erkannte

## Nicht im Scope

- Unterstützung für weitere Sprachen (Python, Java, etc.)
- Backend-Parsing (Roslyn o.ä.)
- Batch-Verarbeitung
