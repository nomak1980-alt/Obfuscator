'use strict';
/**
 * Reine Logik-Tests für obfuscator-core.js – laufen in Node ohne DOM.
 *   node test/core.test.js
 */
const C = require('../obfuscator-core.js');

let pass = 0, fail = 0;
function it(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (e) { fail++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}
function eq(a, b, label) {
    if (a !== b) throw new Error(`${label || ''} erwartet ${JSON.stringify(b)}, erhalten ${JSON.stringify(a)}`);
}
function assert(c, msg) { if (!c) throw new Error(msg || 'Assertion fehlgeschlagen'); }

// Hilfen, die das DOM-freie Round-Trip nachbilden -------------------------
function csharpRoundTrip(code, words) {
    const analyzed = C.analyzeCSharp(code, words);
    const obf = C.applyReplacements(code, analyzed.map(e => ({ from: e.original, to: e.placeholder })));
    const deobf = C.reverseReplacements(obf, analyzed.map(e => ({ placeholder: e.placeholder, original: e.original })));
    return { analyzed, obf, deobf };
}

console.log('\n# escapeRegex / escapeHtml');
it('escapeRegex maskiert Sonderzeichen', () => {
    eq(C.escapeRegex('a.b*c'), 'a\\.b\\*c');
});
it('escapeHtml maskiert <>&"\' ', () => {
    eq(C.escapeHtml(`<img src="x" onerror='y'>&`), '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;');
});

console.log('\n# Bezeichner-Treffer (Suchwort in zusammengesetzten Bezeichnern)');
it('User erwischt auch Username – als ganzen Bezeichner, nicht zerhackt', () => {
    const { obf, deobf } = csharpRoundTrip('var Username = User.Name;', ['User']);
    assert(!/User/i.test(obf), 'kein "User" mehr sichtbar (auch nicht in Username): ' + obf);
    assert(!/STR_PLACEHOLDER_\d+name/.test(obf), 'Username darf nicht teil-ersetzt werden: ' + obf);
    eq(deobf, 'var Username = User.Name;', 'Round-Trip');
});
it('raum findet SvcRaum, iRaum, Raumnummer und RaumOhneAenderungsnachweis', () => {
    const code = 'void Fuelle(List<SvcRaum> iRaum) { var n = item.Raumnummer; var t = IfmObjectTyp.RaumOhneAenderungsnachweis; }';
    const { analyzed, obf, deobf } = csharpRoundTrip(code, ['raum']);
    const originals = analyzed.map(e => e.original);
    ['SvcRaum', 'iRaum', 'Raumnummer', 'RaumOhneAenderungsnachweis'].forEach(id => {
        assert(originals.includes(id), id + ' nicht erkannt: ' + originals.join(', '));
    });
    assert(!/raum/i.test(obf), '"raum" darf nirgends mehr vorkommen: ' + obf);
    eq(deobf, code, 'Round-Trip');
});
it('jede Bezeichner-Variante bekommt einen eigenen Platzhalter', () => {
    const res = C.analyzeCSharp('SvcRaum a; iRaum b;', ['raum']);
    const placeholders = res.map(e => e.placeholder);
    eq(new Set(placeholders).size, placeholders.length, 'Platzhalter eindeutig');
    eq(res.length, 2, 'zwei Bezeichner erkannt');
});
it('User UND UserId werden beide korrekt round-tripped', () => {
    const code = 'int UserId = User.Id;';
    const { deobf, obf } = csharpRoundTrip(code, ['User', 'UserId']);
    assert(!/\bUser\b/.test(obf) && !/\bUserId\b/.test(obf), 'beide ersetzt: ' + obf);
    eq(deobf, code, 'Round-Trip');
});

console.log('\n# $-Sonderzeichen-Injection');
it('Originalwert mit $& wird literal wiederhergestellt', () => {
    const code = 'set PRICE = 10;';
    // Wort enthält $-Muster
    const entries = [{ from: 'PRICE', to: 'TOKEN_1' }];
    const obf = C.applyReplacements(code, entries);
    const deobf = C.reverseReplacements(obf, [{ placeholder: 'TOKEN_1', original: 'a$&b$1c$$d' }]);
    eq(deobf, 'set a$&b$1c$$d = 10;', 'literal $ Einsetzung');
});

console.log('\n# Platzhalter-Kollision');
it('uniqueSuffix ist leer ohne Kollision', () => {
    eq(C.uniqueSuffix('hello world', ['STR_PLACEHOLDER_']), '');
});
it('uniqueSuffix vermeidet vorhandenen Platzhalter im Code', () => {
    const code = 'STR_PLACEHOLDER_1 = real value';
    const suffix = C.uniqueSuffix(code, ['STR_PLACEHOLDER_']);
    assert(suffix !== '', 'Salt muss gesetzt sein');
    assert(!code.includes('STR_PLACEHOLDER_' + suffix), 'gesalzener Präfix darf nicht im Code sein');
});
it('Round-Trip korrekt, wenn Code bereits einen Platzhalter-String enthält', () => {
    const code = 'note = "STR_PLACEHOLDER_1"; secret = Token;';
    const analyzed = C.analyzeCSharp(code, ['Token']);
    const obf = C.applyReplacements(code, analyzed.map(e => ({ from: e.original, to: e.placeholder })));
    const deobf = C.reverseReplacements(obf, analyzed.map(e => ({ placeholder: e.placeholder, original: e.original })));
    eq(deobf, code, 'Round-Trip trotz Kollision');
    assert(obf.includes('STR_PLACEHOLDER_1'), 'der echte Original-String bleibt unangetastet');
});

console.log('\n# Deobfuskierung _1 vs _10');
it('_1 ersetzt nicht den Anfang von _10', () => {
    const code = 'A_10 and A_1';
    const out = C.reverseReplacements(code, [
        { placeholder: 'A_1', original: 'one' },
        { placeholder: 'A_10', original: 'ten' }
    ]);
    eq(out, 'ten and one', 'korrekte längen-sortierte Rückersetzung');
});

console.log('\n# C# Analyse');
it('findet Case-Varianten der Suchwörter', () => {
    const res = C.analyzeCSharp('userId and UserId', ['userId']);
    const originals = res.map(r => r.original).sort();
    eq(originals.join(','), 'UserId,userId', 'beide Varianten');
});
it('Platzhalter beginnen mit STR_PLACEHOLDER_', () => {
    const res = C.analyzeCSharp('foo bar', ['foo']);
    assert(res[0].placeholder.startsWith('STR_PLACEHOLDER_'), res[0].placeholder);
});

console.log('\n# SQL Analyse + Round-Trip');
const SQL = `SELECT u.UserId, u.UserName, u.Email
FROM Users u
INNER JOIN Orders o ON u.UserId = o.UserId
WHERE u.IsActive = 1
ORDER BY u.UserName`;
it('erkennt Users/Orders als Tabelle, UserId/UserName als Feld', () => {
    const els = C.analyzeSqlElements(SQL);
    const byName = {};
    els.forEach(e => { byName[e.element] = e.type; });
    eq(byName['Users'], 'Tabelle', 'Users');
    eq(byName['Orders'], 'Tabelle', 'Orders');
    eq(byName['UserId'], 'Feld', 'UserId');
    eq(byName['UserName'], 'Feld', 'UserName');
});
it('SQL voll round-trip-bar', () => {
    const els = C.analyzeSqlElements(SQL);
    const assigned = C.assignSqlPlaceholders(els.map(e => ({ element: e.element, type: e.type })), SQL);
    const obf = C.applyReplacements(SQL, assigned.map(a => ({ from: a.element, to: a.placeholder })));
    assert(!/\bUsers\b/.test(obf), 'Users ersetzt');
    assert(!/\bOrders\b/.test(obf), 'Orders ersetzt');
    const deobf = C.reverseReplacements(obf, assigned.map(a => ({ placeholder: a.placeholder, original: a.element })));
    eq(deobf, SQL, 'SQL Round-Trip');
});
it('SQL String-Replace schneidet ORDER BY nicht (Wortgrenze)', () => {
    const code = 'SELECT id FROM t ORDER BY id';
    const { processedCode, entries } = C.analyzeSqlStringReplace(['id'], code);
    assert(/ORDER BY/.test(processedCode), 'ORDER nicht zerschnitten: ' + processedCode);
    // beide eigenständigen "id" ersetzt
    assert(!/\bid\b/.test(processedCode), 'id ersetzt: ' + processedCode);
    const back = C.reverseReplacements(processedCode, entries.map(e => ({ placeholder: e.placeholder, original: e.word })));
    eq(back, code, 'Round-Trip');
});
it('SQL String-Replace erwischt Suchwort auch in zusammengesetzten Bezeichnern', () => {
    const code = 'SELECT RaumId, Raumnummer FROM SvcRaum';
    const { processedCode, entries } = C.analyzeSqlStringReplace(['raum'], code);
    assert(!/raum/i.test(processedCode), '"raum" darf nirgends mehr vorkommen: ' + processedCode);
    const back = C.reverseReplacements(processedCode, entries.map(e => ({ placeholder: e.placeholder, original: e.word })));
    eq(back, code, 'Round-Trip');
});
it('reserviertes Wort wird nicht als Element erkannt', () => {
    const els = C.analyzeSqlElements('SELECT COUNT FROM Users');
    assert(!els.some(e => e.element === 'COUNT'), 'COUNT darf kein Element sein');
});

console.log('\n# analyzeCSharpElements – Typdeklarationen');
it('erkennt Klassenname', () => {
    const r = C.analyzeCSharpElements('public class CustomerService { }');
    assert(r.some(e => e.element === 'CustomerService' && e.type === 'Klasse'),
        'CustomerService/Klasse nicht gefunden: ' + JSON.stringify(r));
});
it('erkennt Interface-Name', () => {
    const r = C.analyzeCSharpElements('public interface ICustomerRepository { }');
    assert(r.some(e => e.element === 'ICustomerRepository' && e.type === 'Interface'),
        JSON.stringify(r));
});
it('erkennt Enum-Name', () => {
    const r = C.analyzeCSharpElements('public enum OrderStatus { Active }');
    assert(r.some(e => e.element === 'OrderStatus' && e.type === 'Enum'), JSON.stringify(r));
});
it('erkennt mehrteiligen Namespace einzeln', () => {
    const r = C.analyzeCSharpElements('namespace MyApp.Services { }');
    const names = r.map(e => e.element);
    assert(names.includes('MyApp') && names.includes('Services'),
        'MyApp/Services nicht gefunden: ' + names.join(', '));
});

console.log('\n# analyzeCSharpElements – Member-Deklarationen');
it('erkennt Methodenname (mit Modifier)', () => {
    const r = C.analyzeCSharpElements('public async Task<Customer> GetCustomer(int id) { }');
    assert(r.some(e => e.element === 'GetCustomer' && e.type === 'Methode'), JSON.stringify(r));
});
it('erkennt Property-Name', () => {
    const r = C.analyzeCSharpElements('public string CustomerName { get; set; }');
    assert(r.some(e => e.element === 'CustomerName' && e.type === 'Property'), JSON.stringify(r));
});
it('erkennt Feld-Name', () => {
    const r = C.analyzeCSharpElements('private readonly IRepository _repository;');
    assert(r.some(e => e.element === '_repository' && e.type === 'Feld'), JSON.stringify(r));
});
it('erkennt Parameter-Namen', () => {
    const r = C.analyzeCSharpElements('public void Process(int orderId, string customerName) { }');
    const names = r.map(e => e.element);
    assert(names.includes('orderId'), 'orderId fehlt: ' + names.join(', '));
    assert(names.includes('customerName'), 'customerName fehlt: ' + names.join(', '));
});

console.log('\n# analyzeCSharpElements – Typ-Verwendungen & weitere Bezeichner');
function typeOf(r, name) {
    const item = r.find(e => e.element === name);
    return item ? item.type : undefined;
}
it('new Foo() wird als Klasse erkannt, nicht als Methode', () => {
    const r = C.analyzeCSharpElements('var a = new EPTreeViewItem();');
    eq(typeOf(r, 'EPTreeViewItem'), 'Klasse', 'EPTreeViewItem');
});
it('generisches Argument in new List<Foo>() wird als Klasse erkannt', () => {
    const r = C.analyzeCSharpElements('var a = new List<EPTreeViewItem>();');
    eq(typeOf(r, 'EPTreeViewItem'), 'Klasse', 'EPTreeViewItem');
    assert(!r.some(e => e.element === 'List'), 'List ist Framework-Typ');
});
it('Parameter-Typ wird als Klasse erkannt', () => {
    const r = C.analyzeCSharpElements('void Fuelle(ref EPTreeViewItem knoten, List<SvcRaum> raeume) { }');
    eq(typeOf(r, 'EPTreeViewItem'), 'Klasse', 'EPTreeViewItem');
    eq(typeOf(r, 'SvcRaum'), 'Klasse', 'SvcRaum (generisches Argument)');
    eq(typeOf(r, 'knoten'), 'Parameter', 'knoten');
    eq(typeOf(r, 'raeume'), 'Parameter', 'raeume');
});
it('benannte Argumente (iIX:) werden als Parameter erkannt', () => {
    const r = C.analyzeCSharpElements('var q = new QueryStringParameter(iIX: id, iIX1: typ);');
    eq(typeOf(r, 'iIX'), 'Parameter', 'iIX');
    eq(typeOf(r, 'iIX1'), 'Parameter', 'iIX1');
});
it('ternärer Operator erzeugt keinen falschen benannten Parameter', () => {
    const r = C.analyzeCSharpElements('var y = Foo(flag ? a : b);');
    assert(!r.some(e => e.element === 'flag'), 'flag fälschlich als Parameter erkannt');
});
it('Lambda-Parameter (x =>) wird als Parameter erkannt', () => {
    const r = C.analyzeCSharpElements('var f = list.FirstOrDefault(x => x.Id == 1);');
    eq(typeOf(r, 'x'), 'Parameter', 'x');
});
it('Discard-Lambda (_ =>) wird nicht erkannt', () => {
    const r = C.analyzeCSharpElements('var f = list.FirstOrDefault(_ => true);');
    assert(!r.some(e => e.element === '_'), '_ darf nicht erkannt werden');
});
it('foreach: Typ als Klasse, Laufvariable als Variable', () => {
    const r = C.analyzeCSharpElements('foreach (SvcRaum item in raeume) { }');
    eq(typeOf(r, 'SvcRaum'), 'Klasse', 'SvcRaum');
    eq(typeOf(r, 'item'), 'Variable', 'item');
});
it('lokale Variable mit Typ wird als Variable erkannt', () => {
    const r = C.analyzeCSharpElements('EPTreeViewItem childStockwerk = parent.Children.FirstOrDefault();');
    eq(typeOf(r, 'childStockwerk'), 'Variable', 'childStockwerk');
    eq(typeOf(r, 'EPTreeViewItem'), 'Klasse', 'EPTreeViewItem');
});
it('Vergleich (==) erzeugt keine falsche Variable', () => {
    const r = C.analyzeCSharpElements('if (childStockwerk == null) { }');
    assert(!r.some(e => e.element === 'childStockwerk'), 'Vergleich fälschlich als Deklaration erkannt');
});
it('Feld-/Property-/Rückgabe-Typ wird als Klasse erkannt', () => {
    const r = C.analyzeCSharpElements(
        'private readonly IRepository _repo; public CustomerDto Data { get; set; } public async Task<Customer> GetCustomer(int id) { }');
    eq(typeOf(r, 'IRepository'), 'Klasse', 'IRepository');
    eq(typeOf(r, 'CustomerDto'), 'Klasse', 'CustomerDto');
    eq(typeOf(r, 'Customer'), 'Klasse', 'Customer (generisches Argument im Rückgabetyp)');
});
it('Deklaration gewinnt vor Verwendung (first-seen)', () => {
    const r = C.analyzeCSharpElements('public class Foo { } void Bar(Foo f) { var x = new Foo(); }');
    eq(typeOf(r, 'Foo'), 'Klasse', 'Foo bleibt Klasse');
    eq(r.filter(e => e.element === 'Foo').length, 1, 'Foo nur einmal');
});

console.log('\n# Regression: BefuelleInfrastrukturTreeView (Nutzer-Beispiel)');
const USER_SAMPLE = `private static void BefuelleInfrastrukturTreeView(ref EPTreeViewItem iUebergeordneterKnoten, List<SvcRaum> iRaum)
{
    try
    {
        if (iRaum.Count > 0)
        {
            iUebergeordneterKnoten.Children = new List<EPTreeViewItem>();

            foreach (SvcRaum item in iRaum)
            {
                EPTreeViewItem childStockwerk = iUebergeordneterKnoten.Children.FirstOrDefault(x => x.Id == item.Stockwerk);

                if (childStockwerk == null)
                {
                    childStockwerk = new EPTreeViewItem()
                    {
                        Name = item.Stockwerk,
                        Id = item.Stockwerk,
                        Children = new List<EPTreeViewItem>(),
                        URL = VirtualPathUtility.ToAbsolute(@"~/stammdaten/detailansicht") + "?" + QueryStringParameter.SetParameter(new QueryStringParameter(iIX1: IfmObjectTyp.Leer))
                    };
                    iUebergeordneterKnoten.Children.Add(childStockwerk);
                }

                EPTreeViewItem child = new EPTreeViewItem()
                {
                    Name = item.Bezeichnung + " (" + item.Raumnummer + ")",
                    Id = item.ID.ToString(),
                    URL = VirtualPathUtility.ToAbsolute(@"~/stammdaten/detailansicht") + "?" + QueryStringParameter.SetParameter(new QueryStringParameter(iIX: item.ID.ToString(), iIX1: IfmObjectTyp.RaumOhneAenderungsnachweis))
                };

                childStockwerk.Children.Add(child);
            }
        }
    }
    catch (Exception ex)
    {
        throw ExceptionHelper.GetNewException(ex);
    }
}`;
it('String-Replace "raum" + Auto-Analyse: kein "raum" mehr im Ergebnis, Round-Trip exakt', () => {
    // Nachbildung des UI-Flows: String-Replace zuerst, Auto-Analyse gefiltert danach.
    const strAnalyzed = C.analyzeCSharp(USER_SAMPLE, ['raum']);
    const strSet = new Set(strAnalyzed.map(e => e.original));
    const autoAnalyzed = C.analyzeCSharpElements(USER_SAMPLE).filter(e => !strSet.has(e.element));

    let obf = C.applyReplacements(USER_SAMPLE, strAnalyzed.map(e => ({ from: e.original, to: e.placeholder })));
    obf = C.applyReplacements(obf, autoAnalyzed.map(e => ({ from: e.element, to: e.placeholder })));

    assert(!/raum/i.test(obf), '"raum" noch im verschleierten Code:\n' + obf);

    let deobf = C.reverseReplacements(obf, autoAnalyzed.map(e => ({ placeholder: e.placeholder, original: e.element })));
    deobf = C.reverseReplacements(deobf, strAnalyzed.map(e => ({ placeholder: e.placeholder, original: e.original })));
    eq(deobf, USER_SAMPLE, 'Round-Trip');
});
it('Nutzer-Beispiel: Klassifikation der wichtigsten Bezeichner', () => {
    const r = C.analyzeCSharpElements(USER_SAMPLE);
    eq(typeOf(r, 'BefuelleInfrastrukturTreeView'), 'Methode', 'BefuelleInfrastrukturTreeView');
    eq(typeOf(r, 'EPTreeViewItem'), 'Klasse', 'EPTreeViewItem');
    eq(typeOf(r, 'QueryStringParameter'), 'Klasse', 'QueryStringParameter');
    eq(typeOf(r, 'SvcRaum'), 'Klasse', 'SvcRaum');
    eq(typeOf(r, 'iUebergeordneterKnoten'), 'Parameter', 'iUebergeordneterKnoten');
    eq(typeOf(r, 'iRaum'), 'Parameter', 'iRaum');
    eq(typeOf(r, 'iIX'), 'Parameter', 'iIX');
    eq(typeOf(r, 'iIX1'), 'Parameter', 'iIX1');
    eq(typeOf(r, 'x'), 'Parameter', 'x (Lambda)');
    eq(typeOf(r, 'ex'), 'Parameter', 'ex (catch)');
    eq(typeOf(r, 'item'), 'Variable', 'item (foreach)');
    eq(typeOf(r, 'childStockwerk'), 'Variable', 'childStockwerk');
    eq(typeOf(r, 'child'), 'Variable', 'child');
});

console.log('\n# analyzeCSharpElements – Filter & Sicherheit');
it('enthält keine C#-Keywords', () => {
    const r = C.analyzeCSharpElements('public class Foo { public async void Bar(int x) { } }');
    const names = r.map(e => e.element);
    ['public', 'class', 'void', 'async', 'int', 'string', 'static', 'new', 'return'].forEach(kw => {
        assert(!names.includes(kw), 'Keyword fälschlicherweise erkannt: ' + kw);
    });
});
it('jedes Element nur einmal in Ergebnisliste', () => {
    const r = C.analyzeCSharpElements('public class Customer { }\npublic class Customer { }');
    eq(r.filter(e => e.element === 'Customer').length, 1, 'Customer doppelt');
});
it('gibt leeres Array für leeren Input', () => {
    eq(C.analyzeCSharpElements('').length, 0, 'leer erwartet');
});
it('Platzhalter für Klasse beginnt mit CS_CLASS_', () => {
    const r = C.analyzeCSharpElements('public class CustomerService { }');
    const item = r.find(e => e.element === 'CustomerService');
    assert(item && item.placeholder.startsWith('CS_CLASS_'), item ? item.placeholder : 'nicht gefunden');
});
it('Platzhalter für Methode beginnt mit CS_METHOD_', () => {
    const r = C.analyzeCSharpElements('public void GetOrder() { }');
    const item = r.find(e => e.element === 'GetOrder');
    assert(item && item.placeholder.startsWith('CS_METHOD_'), item ? item.placeholder : 'nicht gefunden');
});
it('Kollisionsschutz: Salt wenn CS_CLASS_ bereits im Code', () => {
    const code = 'string x = "CS_CLASS_1"; public class CustomerService { }';
    const r = C.analyzeCSharpElements(code);
    const item = r.find(e => e.element === 'CustomerService');
    assert(item && item.placeholder !== 'CS_CLASS_1', item ? item.placeholder : 'nicht gefunden');
    assert(item && item.placeholder.startsWith('CS_CLASS_'), item.placeholder);
});
it('CS_PREFIXES exportiert alle 8 Schlüssel', () => {
    const keys = ['class','iface','enum','namespace','method','prop','field','param'];
    keys.forEach(k => assert(C.CS_PREFIXES[k] !== undefined, 'CS_PREFIXES.' + k + ' fehlt'));
});

console.log('\n# T8 – SQL-Analyse-Bandbreite (CTE, MERGE, CREATE PROCEDURE, Subquery, INSERT, UPDATE, INDEX)');
it('CTE (WITH ... AS) erkennt den CTE-Namen als Objekt', () => {
    const sql = 'WITH KundenUmsatz AS (SELECT KundeId, SUM(Betrag) AS Summe FROM Bestellungen GROUP BY KundeId) SELECT * FROM KundenUmsatz';
    const els = C.analyzeSqlElements(sql);
    const names = els.map(e => e.element);
    assert(names.includes('KundenUmsatz'), 'KundenUmsatz nicht erkannt: ' + names.join(', '));
    assert(names.includes('Bestellungen'), 'Bestellungen nicht erkannt: ' + names.join(', '));
});
it('MERGE erkennt Ziel- und Quelltabelle', () => {
    const sql = 'MERGE INTO ZielKunden AS t USING QuellKunden AS s ON t.Id = s.Id WHEN MATCHED THEN UPDATE SET t.Name = s.Name;';
    const names = C.analyzeSqlElements(sql).map(e => e.element);
    assert(names.includes('ZielKunden'), 'ZielKunden nicht erkannt: ' + names.join(', '));
    assert(names.includes('QuellKunden'), 'QuellKunden nicht erkannt: ' + names.join(', '));
});
it('CREATE PROCEDURE erkennt den Prozedurnamen als Objekt', () => {
    const sql = 'CREATE PROCEDURE BerechneKundenRabatt AS BEGIN SELECT 1 END';
    const els = C.analyzeSqlElements(sql);
    const item = els.find(e => e.element === 'BerechneKundenRabatt');
    assert(item, 'BerechneKundenRabatt nicht erkannt: ' + els.map(e => e.element).join(', '));
    eq(item.type, 'Objekt', 'Typ von BerechneKundenRabatt');
});
it('Unterabfrage: nicht-gierige SELECT...FROM greift auch innerhalb geschachtelter Klammern', () => {
    const sql = 'SELECT * FROM Kunden WHERE KundeId IN (SELECT KundeId FROM AktiveBestellungen)';
    const names = C.analyzeSqlElements(sql).map(e => e.element);
    assert(names.includes('Kunden'), 'Kunden nicht erkannt: ' + names.join(', '));
    assert(names.includes('AktiveBestellungen'), 'AktiveBestellungen (Unterabfrage) nicht erkannt: ' + names.join(', '));
});
it('INSERT mit Spaltenliste erkennt Tabelle und Spalten', () => {
    const sql = 'INSERT INTO Kundenkontakte (VorName, NachName, TelefonNummer) VALUES (@v, @n, @t)';
    const names = C.analyzeSqlElements(sql).map(e => e.element);
    assert(names.includes('Kundenkontakte'), 'Kundenkontakte nicht erkannt: ' + names.join(', '));
    ['VorName', 'NachName', 'TelefonNummer'].forEach(col =>
        assert(names.includes(col), col + ' nicht erkannt: ' + names.join(', ')));
});
it('UPDATE ... SET erkennt Tabelle und gesetzte Spalten', () => {
    const sql = "UPDATE Mitarbeiter SET Gehalt = 5000, Abteilung = 'Vertrieb' WHERE MitarbeiterId = 1";
    const names = C.analyzeSqlElements(sql).map(e => e.element);
    assert(names.includes('Mitarbeiter'), 'Mitarbeiter nicht erkannt: ' + names.join(', '));
    assert(names.includes('Gehalt'), 'Gehalt nicht erkannt: ' + names.join(', '));
    assert(names.includes('Abteilung'), 'Abteilung nicht erkannt: ' + names.join(', '));
});
it('CREATE INDEX erkennt Tabelle und indizierte Spalten', () => {
    const sql = 'CREATE NONCLUSTERED INDEX IX_Kunden_Nachname ON Kunden (NachName, VorName)';
    const names = C.analyzeSqlElements(sql).map(e => e.element);
    assert(names.includes('Kunden'), 'Kunden nicht erkannt: ' + names.join(', '));
    assert(names.includes('NachName'), 'NachName nicht erkannt: ' + names.join(', '));
    assert(names.includes('VorName'), 'VorName nicht erkannt: ' + names.join(', '));
});

console.log('\n# SQL Alias-Filter');
it('einbuchstabige Aliases werden nicht als Elemente erkannt', () => {
    const sql = 'SELECT u.UserId FROM Users u INNER JOIN Orders o ON u.UserId = o.OrderId';
    const els = C.analyzeSqlElements(sql);
    const names = els.map(e => e.element);
    assert(!names.includes('u'), 'u fälschlicherweise erkannt: ' + names.join(', '));
    assert(!names.includes('o'), 'o fälschlicherweise erkannt: ' + names.join(', '));
    assert(names.includes('Users'), 'Users fehlt');
    assert(names.includes('Orders'), 'Orders fehlt');
});

console.log('\n# K2 – Geheimnis-Heuristik (findSecretHints)');
it('erkennt Password= in einem String-Literal', () => {
    const code = 'private const string CS_FIELD_1 = "Server=prod-sql01;User=sa;Password=Geheim123;";';
    const hits = C.findSecretHints(code);
    assert(hits.length === 1 && hits[0] === 1, 'erwartet Treffer in Zeile 1: ' + JSON.stringify(hits));
});
it('erkennt mehrere betroffene Zeilen', () => {
    const code = 'var a = 1;\nvar apiKey = "abc";\nvar b = 2;\nvar bearer = "Bearer xyz";';
    const hits = C.findSecretHints(code);
    assert(hits.includes(2) && hits.includes(4), 'erwartet Zeilen 2 und 4: ' + JSON.stringify(hits));
});
it('W11: Vergleichsoperatoren loesen keinen Fehlalarm aus', () => {
    [
        'if (secret == null) return;',
        'if (server != other) { }',
        'while (password >= min) { }',
        'return apiKey === null;'
    ].forEach(line => {
        eq(C.findSecretHints(line).length, 0, 'Fehlalarm bei: ' + line);
    });
});
it('W11: Bezeichner, die ein Geheimnis-Wort nur enthalten, loesen keinen Fehlalarm aus', () => {
    [
        'string apiKeyName = "x";',
        'var connectionStringBuilder = new Builder();',
        'var passwordPolicy = LadePolicy();'
    ].forEach(line => {
        eq(C.findSecretHints(line).length, 0, 'Fehlalarm bei: ' + line);
    });
});
it('W11: Zuweisung ohne String-Literal ist kein Geheimnis', () => {
    ['int server = 5;', 'var secret = null;'].forEach(line => {
        eq(C.findSecretHints(line).length, 0, 'Fehlalarm bei: ' + line);
    });
});
it('W11: echtes Geheimnis in einer Variablen wird weiterhin erkannt', () => {
    eq(C.findSecretHints('var password = "hunter2";').length, 1);
    eq(C.findSecretHints('var apiKey = "abc";').length, 1);
});
it('W11: echte Zuweisungen werden weiterhin erkannt', () => {
    [
        'var s = "Server=prod01;User=sa;Password=Geheim123;";',
        'const c = "Data Source=x;Initial Catalog=y";',
        'var h = "Authorization: Bearer abc123";',
        'var k = "ApiKey=abcdef";',
        'var a = "AccountKey=xyz==";'
    ].forEach(line => {
        eq(C.findSecretHints(line).length, 1, 'nicht erkannt: ' + line);
    });
});
it('liefert leeres Array ohne Geheimnismuster', () => {
    const code = 'public class CS_CLASS_1 { public void CS_METHOD_1() { } }';
    eq(C.findSecretHints(code).length, 0);
});

console.log('\n# R3 – Geleakte/veraenderte Platzhalter erkennen (findLeftoverPlaceholders)');
it('erkennt zurueckgebliebenen CS_CLASS_-Platzhalter', () => {
    const hits = C.findLeftoverPlaceholders('Hier steht noch CS_CLASS_1 im Text.');
    assert(hits.includes('CS_CLASS_1'), JSON.stringify(hits));
});
it('erkennt SQL_TABLE_ und STR_PLACEHOLDER_ gemeinsam', () => {
    const hits = C.findLeftoverPlaceholders('SELECT * FROM SQL_TABLE_2 WHERE x = STR_PLACEHOLDER_5');
    assert(hits.includes('SQL_TABLE_2') && hits.includes('STR_PLACEHOLDER_5'), JSON.stringify(hits));
});
it('liefert leeres Array bei vollstaendig zurueckverwandeltem Code', () => {
    eq(C.findLeftoverPlaceholders('public class CustomerService { }').length, 0);
});
it('SQL_STR_PLACEHOLDER_ wird nicht doppelt als STR_PLACEHOLDER_ mitgezaehlt', () => {
    // STR_PLACEHOLDER_ ist ein Suffix von SQL_STR_PLACEHOLDER_ – ohne Wortgrenze
    // meldete ein einzelner Platzhalter faelschlich zwei Treffer.
    const hits = C.findLeftoverPlaceholders('SELECT SQL_STR_PLACEHOLDER_1 FROM x');
    eq(hits.length, 1, 'Trefferanzahl');
    eq(hits[0], 'SQL_STR_PLACEHOLDER_1', 'Treffername');
});
it('erkennt Platzhalter mit Kollisions-Salt', () => {
    const hits = C.findLeftoverPlaceholders('var x = STR_PLACEHOLDER_ab12_4;');
    assert(hits.includes('STR_PLACEHOLDER_ab12_4'), JSON.stringify(hits));
});

console.log('\n# K5/T9 – Bezeichner mit Umlauten (Unicode)');
// C# und T-SQL erlauben Unicode-Buchstaben in Bezeichnern. Mit ASCII-Zeichen-
// klassen wurden solche Namen weder erkannt (Klartext-Leak) noch als Ganzes
// ersetzt ("Kundenprüfung" -> "CS_CLASS_1üfung").
const UMLAUT_REST = /(?:CS_[A-Z]+_|SQL_[A-Z]+_|STR_PLACEHOLDER_)\d+[\p{L}\p{N}_]/u;

it('Auto-Analyse erkennt Klassenname mit Umlaut vollstaendig', () => {
    const els = C.analyzeCSharpElements('public class Kundenprüfung { }');
    const names = els.map(e => e.element);
    assert(names.includes('Kundenprüfung'), 'erkannt: ' + JSON.stringify(names));
    assert(!names.includes('Kundenpr'), 'abgeschnittener Torso erkannt: ' + JSON.stringify(names));
});

it('Auto-Analyse laesst kein Umlaut-Feld im Klartext liegen', () => {
    const code = 'public class Haus {\n    private string Größe;\n    public void BerechneStraße(int anzahlHäuser) { var zwischenGröße = 1; }\n}';
    const els = C.analyzeCSharpElements(code);
    const names = els.map(e => e.element);
    ['Größe', 'BerechneStraße', 'anzahlHäuser', 'zwischenGröße'].forEach(n => {
        assert(names.includes(n), n + ' nicht erkannt – bleibt im Klartext. Erkannt: ' + JSON.stringify(names));
    });
});

it('Verschleiern zerhackt Umlaut-Bezeichner nicht', () => {
    const code = 'public class Kundenprüfung {\n    private string Größe;\n    public void BerechneStraße(int anzahlHäuser) { var zwischenGröße = 1; }\n}';
    const els = C.analyzeCSharpElements(code);
    const obf = C.applyReplacements(code, els.map(e => ({ from: e.element, to: e.placeholder })));
    assert(!UMLAUT_REST.test(obf), 'Platzhalter mit angehaengtem Bezeichner-Rest: ' + obf);
    ['Größe', 'Straße', 'Häuser', 'prüfung'].forEach(frag => {
        assert(!obf.includes(frag), '"' + frag + '" steht noch im Klartext: ' + obf);
    });
    const back = C.reverseReplacements(obf, els.map(e => ({ placeholder: e.placeholder, original: e.element })));
    eq(back, code, 'Round-Trip');
});

it('String-Replace trifft den ganzen Umlaut-Bezeichner', () => {
    const code = 'var RaumGröße = 1; var RaumNummer = 2;';
    const analyzed = C.analyzeCSharp(code, ['Raum']);
    const names = analyzed.map(e => e.original);
    assert(names.includes('RaumGröße'), 'erkannt: ' + JSON.stringify(names));
    assert(!names.includes('RaumGr'), 'abgeschnittener Torso erkannt: ' + JSON.stringify(names));
    const obf = C.applyReplacements(code, analyzed.map(e => ({ from: e.original, to: e.placeholder })));
    assert(!UMLAUT_REST.test(obf), 'zerhackt: ' + obf);
    const back = C.reverseReplacements(obf, analyzed.map(e => ({ placeholder: e.placeholder, original: e.original })));
    eq(back, code, 'Round-Trip');
});

it('SQL-Analyse erkennt Tabellen und Spalten mit Umlaut vollstaendig', () => {
    const sql = 'SELECT Größe, Anzahl FROM Gebäude INNER JOIN Räume ON Gebäude.ID = Räume.GebäudeID';
    const els = C.analyzeSqlElements(sql);
    const names = els.map(e => e.element);
    ['Gebäude', 'Räume', 'Größe'].forEach(n => {
        assert(names.includes(n), n + ' nicht erkannt. Erkannt: ' + JSON.stringify(names));
    });
    assert(!names.includes('Geb') && !names.includes('Gr'), 'Torso erkannt: ' + JSON.stringify(names));
    const obf = C.applyReplacements(sql, els.map(e => ({ from: e.element, to: e.placeholder })));
    assert(!UMLAUT_REST.test(obf), 'zerhackt: ' + obf);
    assert(!obf.includes('Räume') && !obf.includes('Gebäude'), 'Klartext-Leak: ' + obf);
});

it('K5: ASCII-Schnellpfad kippt nicht, wenn Originale Umlaute enthalten', () => {
    // Die Rückverwandlung fügt Umlaute in einen bis dahin reinen ASCII-Text ein.
    // Mit \b-Grenzen würde ein Platzhalter direkt hinter einem eingesetzten "ö"
    // fälschlich als eigenständiges Wort gelten.
    const ai = 'var CS_LOCAL_1CS_LOCAL_2 = 1;';
    const out = C.reverseReplacements(ai, [
        { placeholder: 'CS_LOCAL_1', original: 'Größ' },
        { placeholder: 'CS_LOCAL_2', original: 'eMax' }
    ]);
    // Beide Platzhalter kleben aneinander – keiner darf ersetzt werden.
    eq(out, ai, 'Teilstück-Ersetzung trotz fehlender Wortgrenze');
});
it('K5: wordRegex ohne asciiFast bleibt Unicode-korrekt', () => {
    eq('Kundenprüfung'.replace(C.wordRegex('Kundenpr', 'g'), 'X'), 'Kundenprüfung');
    eq('Kundenpr.Feld'.replace(C.wordRegex('Kundenpr', 'g'), 'X'), 'X.Feld');
});
it('reine ASCII-Bezeichner verhalten sich unveraendert', () => {
    const els = C.analyzeCSharpElements('public class CustomerService { private int userId; }');
    const names = els.map(e => e.element);
    assert(names.includes('CustomerService') && names.includes('userId'), JSON.stringify(names));
});

console.log(`\n──────────────────────────────────────────`);
console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
