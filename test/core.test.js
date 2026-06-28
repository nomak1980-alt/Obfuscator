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

console.log('\n# Wortgrenzen (Teilwort-Bug)');
it('User ersetzt nicht den Teilstring in Username', () => {
    const { obf, deobf } = csharpRoundTrip('var Username = User.Name;', ['User']);
    assert(/Username/.test(obf), 'Username darf nicht zerstört werden: ' + obf);
    assert(!/\bUser\b/.test(obf), 'eigenständiges User muss ersetzt sein: ' + obf);
    eq(deobf, 'var Username = User.Name;', 'Round-Trip');
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
it('findet Case-Varianten als Ganzwort', () => {
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

console.log(`\n──────────────────────────────────────────`);
console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
