/**
 * obfuscator-core.js
 * ──────────────────────────────────────────────────────────────────────────
 * Reine Obfuskierungs-/Deobfuskierungs-Logik – KEIN DOM, KEIN localStorage.
 * Lauffähig im Browser (window.ObfuscatorCore) und in Node (module.exports),
 * dadurch unabhängig vom UI testbar.
 *
 * Korrektheits-/Sicherheitsgarantien dieses Moduls:
 *  - Platzhalter kollidieren nie mit bereits im Code vorhandenen Strings
 *    (deterministischer Salt, siehe uniqueSuffix).
 *  - Ersetzungen erfolgen wortgrenzen-bewusst (kein Teilstring-Treffer wie
 *    "User" innerhalb von "Username").
 *  - Rück-Ersetzung nutzt Funktions-Replacer → keine $-Sonderzeichen-Injection
 *    ($&, $1, $$ werden literal eingesetzt).
 *  - Deobfuskierung sortiert Platzhalter nach Länge absteigend (kein _1 vor _10).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ObfuscatorCore = api;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function escapeRegex(string) {
        return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Kleiner deterministischer Hash (für reproduzierbaren Kollisions-Salt).
    function hashCode(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(36);
    }

    /**
     * Liefert einen Infix, der zwischen Präfix-Basis und Nummer eingefügt wird,
     * damit kein Platzhalter mit einem bereits im Code vorhandenen String kollidiert.
     * Im Normalfall (keine Kollision) wird '' zurückgegeben → saubere, lesbare
     * Platzhalter wie STR_PLACEHOLDER_1. Nur falls der Code bereits einen der
     * Präfixe enthält, wird ein deterministischer Salt eingefügt
     * (STR_PLACEHOLDER_<salt>_1) – deterministisch, damit Analyse und
     * Obfuskierung dasselbe Ergebnis liefern.
     */
    function uniqueSuffix(code, prefixes) {
        const text = String(code);
        if (!prefixes.some(p => text.includes(p))) return '';
        const base = hashCode(text);
        let n = 0, salt;
        do {
            salt = base + (n ? String(n) : '');
            n++;
        } while (prefixes.some(p => text.includes(p + salt + '_')));
        return salt + '_';
    }

    /**
     * Baut eine RegExp mit kontextsensitiven Wortgrenzen:
     *  - führendes \b nur, wenn das Wort mit einem Wortzeichen beginnt
     *  - abschließendes \b nur, wenn das Wort mit einem Wortzeichen endet
     * So werden Bezeichner als Ganzwort ersetzt, ohne dass Wörter mit
     * Sonderzeichen an den Rändern (z.B. "@id") nie matchen.
     */
    function wordRegex(word, flags) {
        const esc = escapeRegex(word);
        const left = /^\w/.test(word) ? '\\b' : '';
        const right = /\w$/.test(word) ? '\\b' : '';
        return new RegExp(left + esc + right, flags);
    }

    /**
     * Wendet Ersetzungen an (Obfuskierung).
     * @param {string} code
     * @param {Array<{from:string,to:string}>} entries
     * Längste "from" zuerst → vermeidet Teilwort-Kollisionen.
     * Funktions-Replacer → "to" wird literal eingesetzt (kein $-Sonderzeichen).
     */
    function applyReplacements(code, entries) {
        let out = code;
        const sorted = entries.slice().sort((a, b) => b.from.length - a.from.length);
        sorted.forEach(({ from, to }) => {
            if (!from) return;
            out = out.replace(wordRegex(from, 'g'), () => to);
        });
        return out;
    }

    /**
     * Macht Ersetzungen rückgängig (Deobfuskierung).
     * @param {Array<{placeholder:string,original:string}>} entries
     * Längste Platzhalter zuerst (kein _1 vor _10). Funktions-Replacer → keine
     * $-Injection über manipulierte/importierte Originalwerte.
     */
    function reverseReplacements(code, entries) {
        let out = code;
        const sorted = entries.slice().sort((a, b) => b.placeholder.length - a.placeholder.length);
        sorted.forEach(({ placeholder, original }) => {
            if (!placeholder) return;
            out = out.replace(wordRegex(placeholder, 'g'), () => original);
        });
        return out;
    }

    // ── C# ────────────────────────────────────────────────────────────────

    const CS_PREFIX = 'STR_PLACEHOLDER_';

    /**
     * Analysiert C#-Code: findet alle (Case-)Varianten der Suchwörter, die als
     * Ganzwort im Code vorkommen, und vergibt kollisionssichere Platzhalter.
     * @returns {Array<{original:string, placeholder:string}>} in Fundreihenfolge
     */
    function analyzeCSharp(code, words) {
        const suffix = uniqueSuffix(code, [CS_PREFIX]);
        const result = [];
        const seenVariants = new Set();
        const processedBaseWords = new Set();
        let counter = 1;

        words.forEach(word => {
            const wordLower = word.toLowerCase();
            if (processedBaseWords.has(wordLower)) return;
            processedBaseWords.add(wordLower);

            const searchRegex = wordRegex(word, 'gi');
            let match;
            while ((match = searchRegex.exec(code)) !== null) {
                const variant = match[0];
                if (variant.length === 0) { searchRegex.lastIndex++; continue; }
                if (!seenVariants.has(variant)) {
                    seenVariants.add(variant);
                    result.push({ original: variant, placeholder: `${CS_PREFIX}${suffix}${counter++}` });
                }
            }
        });
        return result;
    }

    // ── SQL ───────────────────────────────────────────────────────────────

    const SQL_PREFIXES = {
        table: 'SQL_TABLE_',
        column: 'SQL_COL_',
        procedure: 'SQL_PROC_',
        function: 'SQL_FUNC_',
        object: 'SQL_OBJ_',
        element: 'SQL_ELEM_'
    };
    const SQL_STR_PREFIX = 'SQL_STR_PLACEHOLDER_';
    const SQL_TYPE_LABEL = {
        table: 'Tabelle', column: 'Feld', procedure: 'Prozedur',
        function: 'Funktion', object: 'Objekt', element: 'Element'
    };

    function isSqlReservedWord(word) {
        const sqlReserved = [
            'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS', 'FULL', 'ON',
            'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'DISTINCT', 'TOP', 'PERCENT',
            'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXCEPT', 'INTERSECT',
            'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'INTO', 'VALUES', 'SET',
            'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'TABLE', 'INDEX', 'VIEW', 'SCHEMA', 'DATABASE',
            'PROCEDURE', 'FUNCTION', 'TRIGGER', 'SEQUENCE', 'TYPE', 'CONSTRAINT', 'PRIMARY', 'KEY',
            'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT', 'IDENTITY', 'COLLATE',
            'GRANT', 'REVOKE', 'DENY', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'BEGIN', 'SAVE',
            'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CAST', 'CONVERT', 'TRY_CAST', 'TRY_CONVERT',
            'ISNULL', 'COALESCE', 'NULLIF', 'GETDATE', 'DATEADD', 'DATEDIFF', 'DATEPART',
            'LEN', 'SUBSTRING', 'CHARINDEX', 'PATINDEX', 'REPLACE', 'STUFF', 'UPPER', 'LOWER',
            'LTRIM', 'RTRIM', 'TRIM', 'ABS', 'CEILING', 'FLOOR', 'ROUND', 'POWER', 'SQRT',
            'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'NUMERIC', 'FLOAT',
            'REAL', 'MONEY', 'SMALLMONEY', 'BIT', 'CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR',
            'TEXT', 'NTEXT', 'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'DATETIMEOFFSET',
            'SMALLDATETIME', 'TIMESTAMP', 'ROWVERSION', 'UNIQUEIDENTIFIER', 'VARBINARY', 'BINARY',
            'IMAGE', 'XML', 'JSON', 'GEOMETRY', 'GEOGRAPHY', 'HIERARCHYID',
            'AS', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'ELSEIF', 'WHILE',
            'BREAK', 'CONTINUE', 'DECLARE', 'EXEC', 'EXECUTE', 'RETURN', 'PRINT', 'RAISERROR',
            'THROW', 'TRY', 'CATCH', 'GO', 'BATCH', 'WITH', 'NOLOCK', 'READPAST', 'UPDLOCK',
            'ROWLOCK', 'TABLOCK', 'PAGLOCK', 'READCOMMITTED', 'SERIALIZABLE', 'SNAPSHOT',
            'READUNCOMMITTED', 'REPEATABLEREAD', 'XLOCK', 'FOR', 'UPDATE', 'OF', 'EXISTS',
            'ANY', 'SOME', 'EVERY', 'OVER', 'PARTITION', 'RANGE', 'ROWS', 'UNBOUNDED', 'PRECEDING',
            'FOLLOWING', 'CURRENT', 'ROW', 'FIRST', 'LAST', 'CUBE', 'ROLLUP', 'GROUPING'
        ];
        return sqlReserved.includes(String(word).toUpperCase());
    }

    /**
     * SQL String-Replace: vergibt Platzhalter für die Suchwörter (kollisionssicher)
     * und liefert den vorverarbeiteten Code.
     * @returns {{entries:Array<{word:string,placeholder:string}>, processedCode:string}}
     */
    function analyzeSqlStringReplace(words, code) {
        const suffix = uniqueSuffix(code, [SQL_STR_PREFIX]);
        const entries = [];
        const seenVariants = new Set();
        const processedBaseWords = new Set();
        let counter = 1;
        words.forEach(word => {
            const wordLower = word.toLowerCase();
            if (processedBaseWords.has(wordLower)) return;
            processedBaseWords.add(wordLower);
            const searchRegex = wordRegex(word, 'gi');
            let match;
            while ((match = searchRegex.exec(code)) !== null) {
                const variant = match[0];
                if (variant.length === 0) { searchRegex.lastIndex++; continue; }
                if (!seenVariants.has(variant)) {
                    seenVariants.add(variant);
                    entries.push({ word: variant, placeholder: `${SQL_STR_PREFIX}${suffix}${counter++}` });
                }
            }
        });
        const processedCode = applyReplacements(
            code,
            entries.map(e => ({ from: e.word, to: e.placeholder }))
        );
        return { entries, processedCode };
    }

    /**
     * Analysiert SQL-Elemente (Tabellen, Felder, Prozeduren …) im (idealerweise
     * vorverarbeiteten) Code. Reine Logik – ohne DOM.
     * @returns {Array<{element:string, type:string, placeholder:string}>}
     *          type ist das Anzeige-Label (Tabelle/Feld/…).
     */
    function analyzeSqlElements(code) {
        const counters = { table: 1, column: 1, procedure: 1, function: 1, object: 1, element: 1 };
        const suffix = uniqueSuffix(code, Object.values(SQL_PREFIXES));

        const ID = '\\[[^\\]]+\\]|[a-zA-Z_][a-zA-Z0-9_]*';
        const REF = `(?:${ID})(?:\\.(?:${ID})){0,2}`;

        const stripBr = s => s.replace(/^\[|\]$/g, '').trim();
        const isSystemSchema = n => /^(dbo|sys|INFORMATION_SCHEMA|guest|master|model|msdb|tempdb)$/i.test(n);
        const isValidId = n => !!n
            && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)
            && !isSqlReservedWord(n)
            && !n.startsWith(SQL_STR_PREFIX);

        function splitTopLevelCommas(s) {
            const parts = [];
            let depth = 0, current = '';
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
                if (ch === ',' && depth === 0) { parts.push(current); current = ''; }
                else current += ch;
            }
            if (current.length) parts.push(current);
            return parts;
        }

        const foundElements = new Map();

        function pushRef(ref, defaultType, lastIsColumn = false) {
            if (!ref) return;
            const parts = ref.split('.').map(stripBr);
            const last = parts.length - 1;
            parts.forEach((p, i) => {
                if (!isValidId(p)) return;
                if (i < last && isSystemSchema(p)) return;
                let type;
                if (lastIsColumn) type = (i === last) ? 'column' : 'table';
                else type = (i < last) ? 'table' : defaultType;
                foundElements.set(p, type);
            });
        }

        function pushColumnList(body) {
            splitTopLevelCommas(body).forEach(part => {
                let p = part.trim();
                p = p.replace(/\s+AS\s+[\s\S]+$/i, '').trim();
                p = p.replace(/\s+(?:ASC|DESC)\b.*$/i, '').trim();
                const eq = p.indexOf('=');
                if (eq >= 0) p = p.substring(0, eq).trim();
                const m = p.match(new RegExp(`^(${REF})`, 'i'));
                if (m) pushRef(m[1], 'column', true);
            });
        }

        const tablePatterns = [
            new RegExp(`\\bFROM\\s+(${REF})`, 'gi'),
            new RegExp(`\\b(?:(?:INNER|CROSS)\\s+|(?:LEFT|RIGHT|FULL)(?:\\s+OUTER)?\\s+)?JOIN\\s+(${REF})`, 'gi'),
            new RegExp(`\\bUPDATE\\s+(${REF})`, 'gi'),
            new RegExp(`\\bINSERT\\s+(?:INTO\\s+)?(${REF})`, 'gi'),
            new RegExp(`\\bDELETE\\s+(?:FROM\\s+)?(${REF})`, 'gi'),
            new RegExp(`\\bMERGE\\s+(?:INTO\\s+)?(${REF})`, 'gi'),
            new RegExp(`\\bUSING\\s+(${REF})`, 'gi'),
            new RegExp(`\\bINTO\\s+(${REF})`, 'gi'),
            new RegExp(`\\bCREATE\\s+TABLE\\s+(${REF})`, 'gi'),
            new RegExp(`\\bALTER\\s+TABLE\\s+(${REF})`, 'gi'),
            new RegExp(`\\bDROP\\s+TABLE\\s+(${REF})`, 'gi'),
            new RegExp(`\\bTRUNCATE\\s+TABLE\\s+(${REF})`, 'gi'),
            new RegExp(`\\bCREATE\\s+(?:UNIQUE\\s+)?(?:CLUSTERED\\s+|NONCLUSTERED\\s+)?INDEX\\s+(?:${ID})\\s+ON\\s+(${REF})`, 'gi'),
        ];
        tablePatterns.forEach(rx => {
            let m;
            while ((m = rx.exec(code)) !== null) pushRef(m[1], 'table');
        });

        const cteRegex = new RegExp(`\\bWITH\\s+(${ID})\\s+AS\\s*\\(`, 'gi');
        let cte;
        while ((cte = cteRegex.exec(code)) !== null) {
            const n = stripBr(cte[1]);
            if (isValidId(n)) foundElements.set(n, 'object');
        }

        const objRegex = new RegExp(`\\bCREATE\\s+(?:OR\\s+ALTER\\s+)?(?:PROCEDURE|PROC|FUNCTION|VIEW|TRIGGER)\\s+(${REF})`, 'gi');
        let obj;
        while ((obj = objRegex.exec(code)) !== null) pushRef(obj[1], 'object');

        const procRegex = new RegExp(`\\bEXEC(?:UTE)?\\s+(${REF})`, 'gi');
        let proc;
        while ((proc = procRegex.exec(code)) !== null) pushRef(proc[1], 'procedure');

        const funcRegex = new RegExp(`\\bFROM\\s+(${REF})\\s*\\(`, 'gi');
        let fn;
        while ((fn = funcRegex.exec(code)) !== null) pushRef(fn[1], 'function');

        const selectRegex = /\bSELECT\s+(?:DISTINCT\s+|TOP\s+\d+\s+(?:PERCENT\s+)?)?([\s\S]+?)\s+FROM\b/gi;
        let sel;
        while ((sel = selectRegex.exec(code)) !== null) pushColumnList(sel[1]);

        const insertColsRegex = new RegExp(`\\bINSERT\\s+(?:INTO\\s+)?${REF}\\s*\\(([^)]+)\\)`, 'gi');
        let ic;
        while ((ic = insertColsRegex.exec(code)) !== null) pushColumnList(ic[1]);

        const ixColsRegex = new RegExp(`\\bCREATE\\s+(?:UNIQUE\\s+)?(?:CLUSTERED\\s+|NONCLUSTERED\\s+)?INDEX\\s+(?:${ID})\\s+ON\\s+${REF}\\s*\\(([^)]+)\\)`, 'gi');
        let ix;
        while ((ix = ixColsRegex.exec(code)) !== null) pushColumnList(ix[1]);

        const setRegex = /\bSET\s+([\s\S]+?)(?=\bWHERE\b|\bFROM\b|\bOUTPUT\b|\bORDER\s+BY\b|;|$)/gi;
        let st;
        while ((st = setRegex.exec(code)) !== null) pushColumnList(st[1]);

        const orderRegex = /\bORDER\s+BY\s+([\s\S]+?)(?=\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bUNION\b|\bOFFSET\b|;|$)/gi;
        let ob;
        while ((ob = orderRegex.exec(code)) !== null) pushColumnList(ob[1]);

        const groupRegex = /\bGROUP\s+BY\s+([\s\S]+?)(?=\bHAVING\b|\bORDER\s+BY\b|\bUNION\b|;|$)/gi;
        let gb;
        while ((gb = groupRegex.exec(code)) !== null) pushColumnList(gb[1]);

        const condOpRegex = new RegExp(`\\b(?:WHERE|HAVING|AND|OR)\\s+\\(*\\s*(${REF})\\s*(?:[=<>!]|LIKE\\b|IN\\b|BETWEEN\\b|IS\\b)`, 'gi');
        let co;
        while ((co = condOpRegex.exec(code)) !== null) pushRef(co[1], 'column', true);

        const onRegex = new RegExp(`\\bON\\s+(${REF})\\s*=\\s*(${REF})`, 'gi');
        let on;
        while ((on = onRegex.exec(code)) !== null) {
            pushRef(on[1], 'column', true);
            pushRef(on[2], 'column', true);
        }

        const result = [];
        foundElements.forEach((type, element) => {
            const prefix = SQL_PREFIXES[type] || SQL_PREFIXES.element;
            const key = SQL_PREFIXES[type] ? type : 'element';
            const placeholder = `${prefix}${suffix}${counters[key]++}`;
            result.push({ element, type: SQL_TYPE_LABEL[type] || SQL_TYPE_LABEL.element, placeholder });
        });
        return result;
    }

    /**
     * Vergibt für eine Auswahl (element + Anzeige-Typ) frische, kollisionssichere
     * Platzhalter. Wird bei der eigentlichen Obfuskierung genutzt.
     * @param {Array<{element:string,type:string}>} selection
     * @param {string} code  Code für Kollisionsprüfung
     * @returns {Array<{element:string,placeholder:string}>}
     */
    function assignSqlPlaceholders(selection, code) {
        const suffix = uniqueSuffix(code, Object.values(SQL_PREFIXES));
        const counters = { table: 1, column: 1, procedure: 1, function: 1, object: 1, element: 1 };
        const labelToKey = {
            'Tabelle': 'table', 'Feld': 'column', 'Prozedur': 'procedure',
            'Funktion': 'function', 'Objekt': 'object', 'Element': 'element'
        };
        return selection.map(({ element, type }) => {
            const key = labelToKey[type] || 'element';
            const placeholder = `${SQL_PREFIXES[key]}${suffix}${counters[key]++}`;
            return { element, placeholder };
        });
    }

    // ── C# Auto-Analyse ──────────────────────────────────────────────────────

    const CS_PREFIXES = {
        class:     'CS_CLASS_',
        iface:     'CS_IFACE_',
        enum:      'CS_ENUM_',
        namespace: 'CS_NS_',
        method:    'CS_METHOD_',
        prop:      'CS_PROP_',
        field:     'CS_FIELD_',
        param:     'CS_PARAM_'
    };

    const CS_TYPE_LABEL = {
        class:     'Klasse',
        iface:     'Interface',
        enum:      'Enum',
        namespace: 'Namespace',
        method:    'Methode',
        prop:      'Property',
        field:     'Feld',
        param:     'Parameter'
    };

    const CS_KEYWORD_SET = new Set([
        'abstract','as','base','bool','break','byte','case','catch','char','checked',
        'class','const','continue','decimal','default','delegate','do','double','else',
        'enum','event','explicit','extern','false','finally','fixed','float','for',
        'foreach','goto','if','implicit','in','int','interface','internal','is','lock',
        'long','namespace','new','null','object','operator','out','override','params',
        'private','protected','public','readonly','ref','return','sbyte','sealed',
        'short','sizeof','stackalloc','static','string','struct','switch','this',
        'throw','true','try','typeof','uint','ulong','unchecked','unsafe','ushort',
        'using','virtual','void','volatile','while','async','await','var','get','set',
        'add','remove','value','yield','partial','nameof','when','dynamic','nint','nuint',
        'record','init','required','file','scoped',
        // Häufige .NET-Typen, die typischerweise kein Domain-Namen sind
        'Task','List','Dictionary','HashSet','Queue','Stack','Array','Span','Memory',
        'IEnumerable','ICollection','IList','IReadOnlyList','IReadOnlyCollection',
        'IDisposable','IAsyncDisposable','Func','Action','Predicate','EventHandler',
        'Type','Object','String','Boolean','Int32','Int64','Int16','UInt32','UInt64',
        'Byte','SByte','Double','Single','Decimal','Char',
        'DateTime','DateTimeOffset','TimeSpan','Guid','Uri',
        'Exception','Console','Math','Environment','Convert','GC',
        'StringBuilder','Regex','Thread','CancellationToken','CancellationTokenSource',
        'HttpClient','ILogger','IServiceProvider','IServiceCollection',
        'Stream','MemoryStream','KeyValuePair','Tuple','ValueTuple'
    ]);

    function isCSharpKeyword(word) {
        return CS_KEYWORD_SET.has(word);
    }

    /**
     * Analysiert C#-Code und erkennt Bezeichner anhand ihrer Deklarations-Syntax.
     * Reine Logik – ohne DOM.
     * @param {string} code
     * @returns {Array<{element:string, type:string, placeholder:string}>}
     */
    function analyzeCSharpElements(code) {
        const text = String(code);
        if (!text.trim()) return [];

        const suffix = uniqueSuffix(text, Object.values(CS_PREFIXES));
        const counters = { class: 1, iface: 1, enum: 1, namespace: 1, method: 1, prop: 1, field: 1, param: 1 };
        const found = new Map(); // element → typeKey (first-seen wins)

        const ID = '[a-zA-Z_][a-zA-Z0-9_]*';

        function push(name, typeKey) {
            if (!name || found.has(name) || isCSharpKeyword(name)) return;
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return;
            found.set(name, typeKey);
        }

        let m;

        // ── Typdeklarationen (sehr zuverlässig) ────────────────────────────
        const classRx = new RegExp('\\bclass\\s+(' + ID + ')', 'g');
        while ((m = classRx.exec(text)) !== null) push(m[1], 'class');

        const ifaceRx = new RegExp('\\binterface\\s+(' + ID + ')', 'g');
        while ((m = ifaceRx.exec(text)) !== null) push(m[1], 'iface');

        const enumRx = new RegExp('\\benum\\s+(' + ID + ')', 'g');
        while ((m = enumRx.exec(text)) !== null) push(m[1], 'enum');

        // ── Namespace (mehrteilig, auf Punkte aufteilen) ────────────────────
        const nsRx = new RegExp('\\bnamespace\\s+(' + ID + '(?:\\.' + ID + ')*)', 'g');
        while ((m = nsRx.exec(text)) !== null) {
            m[1].split('.').forEach(function (part) { push(part, 'namespace'); });
        }

        // ── Member-Deklarationen (mit Modifier als Anker) ───────────────────
        // Modifier-Präfix stellt sicher, dass wir Deklarationen treffen, nicht Aufrufe.
        const MOD = '(?:public|private|protected|internal|static|async|virtual|override' +
                    '|abstract|sealed|new|extern|partial|readonly|const|volatile)';
        const MODS = '\\b' + MOD + '(?:\\s+' + MOD + ')*\\s+';
        // Typtoken: Bezeichner mit optionalen Generics, Array-Suffix, Nullable-Marker
        const TYP = ID + '(?:<[^>]*>)?(?:\\[\\])*\\??\\s+';

        // Methoden: MODS [ReturnType] MethodenName(
        // TYP ist optional, damit Konstruktoren (ohne expliziten Rückgabetyp) ebenfalls erfasst werden.
        const methodRx = new RegExp(MODS + '(?:' + TYP + ')?(' + ID + ')\\s*(?:<[^>]*>\\s*)?\\(', 'g');
        while ((m = methodRx.exec(text)) !== null) push(m[1], 'method');

        // Properties: MODS TYP Name {
        const propRx = new RegExp(MODS + TYP + '(' + ID + ')\\s*\\{', 'g');
        while ((m = propRx.exec(text)) !== null) push(m[1], 'prop');

        // Felder: MODS [readonly|const] TYP Name ; oder =
        const fieldRx = new RegExp(MODS + '(?:readonly\\s+|const\\s+)?' + TYP + '(' + ID + ')\\s*(?:;|=)', 'g');
        while ((m = fieldRx.exec(text)) !== null) push(m[1], 'field');

        // ── Parameter ───────────────────────────────────────────────────────
        // Alle Positionen: (Type name), (Type name, ...), ..., Type name), ..., Type name,
        const paramRx = new RegExp('[,(]\\s*(?:(?:ref|out|in|params)\\s+)?' + TYP + '(' + ID + ')\\s*(?=[,)=])', 'g');
        while ((m = paramRx.exec(text)) !== null) push(m[1], 'param');

        // ── Ergebnis aufbauen ───────────────────────────────────────────────
        const result = [];
        found.forEach(function (typeKey, element) {
            result.push({
                element: element,
                type: CS_TYPE_LABEL[typeKey],
                placeholder: CS_PREFIXES[typeKey] + suffix + counters[typeKey]++
            });
        });
        return result;
    }

    return {
        escapeRegex,
        escapeHtml,
        uniqueSuffix,
        wordRegex,
        applyReplacements,
        reverseReplacements,
        analyzeCSharp,
        isSqlReservedWord,
        analyzeSqlStringReplace,
        analyzeSqlElements,
        assignSqlPlaceholders,
        CS_PREFIX,
        SQL_PREFIXES,
        SQL_STR_PREFIX,
        // C# Auto-Analyse:
        analyzeCSharpElements,
        isCSharpKeyword,
        CS_PREFIXES
    };
}));
