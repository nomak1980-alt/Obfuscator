# Auswahl-Komfort in den Mapping-Tabellen

Datum: 2026-08-20

## Ausgangslage

Die Auswahltabellen („Auswahl der zu verschleiernden Elemente" für C# und SQL)
kennen heute drei Wege, eine Auswahl zu treffen: die Kopf-Checkbox
(alle sichtbaren an/ab), den Textfilter und den Typ-Filter. Bei mehreren hundert
Zeilen fehlen zwei Handgriffe:

1. Die Menge, die über das String-Replace in die Liste gekommen ist, lässt sich
   nicht in einem Schritt isolieren.
2. Zusammenhängende Blöcke lassen sich nur Zeile für Zeile an- oder abhaken.

Beide Tabellen werden von einem gemeinsamen Renderer aufgebaut
(`renderSelectionTable`, `obfuscator.js`), beide Funktionen entstehen deshalb
einmal und wirken in C# und SQL gleichermaßen.

## Funktion 1 — Button „Nur String-Replace"

### Kriterium

Zeilen aus dem String-Replace tragen bereits `data-type="String"`
(gesetzt in `renderCsharpSelectionTable` und `displaySqlMappingSelection`).
Automatisch erkannte Zeilen tragen deutsche Labels aus `CS_TYPE_LABEL`
(`Klasse`, `Interface`, `Enum`, `Namespace`, `Methode`, `Property`, `Feld`,
`Parameter`, `Variable`) bzw. `SQL_TYPE_LABEL` (`Tabelle`, `Feld`, `Prozedur`,
`Funktion`, `Objekt`, `Element`). `String` kollidiert mit keinem davon; die
Unterscheidung ist ohne neues Datenfeld und ohne Änderung an der Analyse
eindeutig.

### Verhalten

Ein Klick setzt die Auswahl **exklusiv**: jede Zeile mit `data-type="String"`
wird angehakt, jede andere abgehakt. Der Button wirkt auf die **ganze Tabelle**,
also auch auf Zeilen, die der Filter gerade ausblendet — nur so ist danach
garantiert genau die String-Replace-Menge ausgewählt.

Nach der Änderung werden nachgezogen:

- `syncSelectAll` für die Kopf-Checkbox,
- `updateSelectionCounter` für den Zähler,
- `scheduleSave` für den gespeicherten Zustand,
- eine Statusmeldung der Form
  `„12 String-Replace-Elemente ausgewählt, 340 abgewählt."`
  (`showStatus` bzw. `showSqlStatus`). Die Meldung ist nötig, weil bei aktivem
  Filter der Großteil der Wirkung außerhalb des Sichtfelds liegt.

### Leere Menge

Enthält die Tabelle keine Zeile mit `data-type="String"`, ist der Button
`disabled` — sonst würde er die komplette Auswahl leeren. Der Zustand wird beim
Aufbau der Tabelle gesetzt (im Renderer bzw. `initMappingFilter`).

### Ort und Auslösung

Zwei statische Buttons in `obfuscator.html`, je einer in der
`mapping-filter-row` von C# und SQL, zwischen Typ-Auswahl und Zähler — dort
stehen die übrigen Werkzeuge zum Eingrenzen der Liste. Beschriftung:
`Nur String-Replace`. Attribute: `data-action="selectStringReplaceOnly"` und
`data-prefix="csharp"` bzw. `"sql"`; ausgelöst über die vorhandene
`ACTIONS`-Delegation, die dem Handler das Element übergibt. Die Logik liegt
einmal in `obfuscator.js` und liest den Präfix aus dem Datensatz.

## Funktion 2 — Shift-Bereichsauswahl

### Anker

Jeder gewöhnliche Klick auf eine Zeilen-Checkbox merkt sich diese als Anker,
getrennt je Tabelle (`csharp` / `sql`). Gespeichert wird die Checkbox selbst,
nicht ihr Index — so überlebt der Anker eine zwischenzeitliche Filteränderung,
die alle Indizes verschieben würde.

### Shift-Klick

Der Zustand des **Ankers** wird auf alle Zeilen zwischen Anker und angeklickter
Zeile übertragen, die angeklickte eingeschlossen. Der erste Klick legt damit die
Richtung fest (an oder aus), der Shift-Klick zieht sie durch. Die angeklickte
Checkbox behält nicht ihren eigenen Umschaltzustand, sondern übernimmt den des
Ankers.

Maßgeblich ist der Zustand, den der Anker in dem Moment hat, in dem der
Shift-Klick eintrifft. Der Browser hat die angeklickte Checkbox zu diesem
Zeitpunkt bereits umgeschaltet — der Anker ist davon nicht betroffen, solange er
eine andere Zeile ist, und wird anschließend über die angeklickte Zeile
geschrieben.

Die Spanne läuft über die **sichtbaren** Zeilen: ausgefilterte Zeilen werden
übersprungen und bleiben unverändert — dieselbe Regel wie bei der Kopf-Checkbox
(Befund U13). Der Anker bleibt nach dem Shift-Klick stehen; ein weiterer
Shift-Klick spannt erneut vom selben Anker aus.

### Randfälle

- Kein Anker gesetzt, Anker stammt aus einer inzwischen neu aufgebauten Tabelle
  (nicht mehr im Dokument) oder Anker ist gerade ausgefiltert: Der Shift-Klick
  verhält sich wie ein gewöhnlicher Klick und setzt den neuen Anker.
- Anker und angeklickte Zeile sind identisch: Es ändert sich nichts außer dem
  Zustand dieser einen Zeile.
- Textmarkierung: Ein `mousedown`-Handler ruft bei gedrückter Shift-Taste
  `preventDefault()` auf. Das unterdrückt die Markierung, verhindert aber nicht
  das Umschalten der Checkbox — das ist die Standardaktion des `click`-Events,
  nicht des `mousedown`-Events.

### Nachziehen

Da die Zustände per Skript gesetzt werden, feuert für die mitgezogenen Zeilen
kein `change`-Event. Kopf-Checkbox, Zähler und `scheduleSave` werden im Handler
deshalb explizit aufgerufen.

### Bewusste Grenze

Per Tastatur (Leertaste) gibt es keine Bereichsauswahl. Das nachzubauen hieße,
Fokus- und Shift-Zustand für die Tastatur getrennt zu verfolgen; der Nutzen wäre
bei einer Maus-Tabelle gering. Filter plus Kopf-Checkbox bleiben der
Tastaturweg zur Massenauswahl.

## Tests

Beide Funktionen werden über das `UI`-Objekt exportiert und in
`test/integration.test.js` im Stil der bestehenden U8-/U13-Blöcke geprüft:

Button:

- ohne Filter: nur String-Zeilen angehakt, alle übrigen abgehakt
- mit aktivem Filter: ausgefilterte String-Zeile ist danach ebenfalls angehakt,
  ausgefilterte Auto-Zeile abgehakt
- Tabelle ohne String-Replace-Zeilen: Button ist `disabled`, Auswahl unverändert
- Zähler und Kopf-Checkbox stimmen danach

Shift-Bereich:

- vorwärts (Anker oben, Klick unten) und rückwärts (Anker unten, Klick oben)
- Richtung „ab": Anker wird abgehakt, Shift-Klick hakt die Spanne ab
- ausgefilterte Zeile mitten in der Spanne bleibt unverändert
- Shift-Klick ohne gültigen Anker wirkt wie ein gewöhnlicher Klick
- Zähler und Kopf-Checkbox stimmen danach

Die Shift-Klicks werden über ein `MouseEvent` mit `shiftKey: true` in jsdom
ausgelöst, damit die Delegation mitgeprüft wird.
