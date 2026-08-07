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
 *  - String-Replace-Suchwörter treffen ganze Bezeichner, die das Suchwort
 *    enthalten ("raum" findet auch SvcRaum/Raumnummer) – ersetzt wird immer
 *    der komplette Bezeichner, nie ein Teilstück (kein "STR_..._1nummer").
 *  - Platzhalter-Ersetzungen selbst erfolgen wortgrenzen-bewusst.
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

    // K5: C# und T-SQL erlauben Unicode-Buchstaben in Bezeichnern ("Kundenprüfung",
    // "Gebäude"). Mit ASCII-Klassen ([a-zA-Z_]/\w/\b) wurden solche Namen weder
    // erkannt (Klartext-Leak) noch als Ganzes ersetzt – "Kundenprüfung" wurde zu
    // "CS_CLASS_1üfung" zerhackt.
    // Diese vier Konstanten sind die EINZIGE Definition davon, was ein Bezeichner-
    // Zeichen ist; alle Analyse- und Ersetzungs-Regexe leiten sich davon ab, damit
    // eine künftige Korrektur nicht an drei Stellen getrennt erfolgen muss.
    const ID_CHAR = '[\\p{L}\\p{N}_]';
    const IDENT = '[\\p{L}_]' + ID_CHAR + '*';
    // Ersetzt ein führendes \b vor einem Bezeichner: \b ist auch im u-Modus
    // ASCII-basiert und würde vor "über" fälschlich eine Wortgrenze sehen.
    const NOT_ID_BEFORE = '(?<!' + ID_CHAR + ')';
    const NOT_ID_AFTER = '(?!' + ID_CHAR + ')';
    const IS_ID_CHAR = new RegExp(ID_CHAR, 'u');
    // Alles oberhalb von ASCII. Bewusst als Positiv-Bereich formuliert, damit
    // keine Steuerzeichen im Muster stehen (no-control-regex).
    const NON_ASCII = new RegExp('[\u0080-\uFFFF]');

    // Alle abgeleiteten RegExp brauchen das u-Flag, sonst sind \p{…} bloß
    // literale Zeichen.
    function withUnicode(flags) {
        return String(flags || '').includes('u') ? flags : (flags || '') + 'u';
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
     * W10: Kennung eines Code-Stands für den K1-Vergleich ("wurde der Code seit
     * der Analyse geändert?"). Früher wurde dafür der komplette Quelltext ein
     * zweites Mal im localStorage abgelegt. Länge UND Hash zusammen machen eine
     * Kollision – die K1 aushebeln würde – praktisch ausgeschlossen, kosten aber
     * nur ein paar Byte statt einer Volltext-Kopie.
     */
    function fingerprint(code) {
        const text = String(code);
        return text.length + ':' + hashCode(text);
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
     * Baut eine RegExp, die ganze Bezeichner (\w-Läufe) trifft, die das
     * Suchwort enthalten. "raum" mit 'gi' findet so SvcRaum, iRaum,
     * Raumnummer, RaumOhneAenderungsnachweis – jeweils als kompletten
     * Bezeichner, damit die Ersetzung nichts zerhackt.
     */
    function containingWordRegex(word, flags) {
        return new RegExp(ID_CHAR + '*' + escapeRegex(word) + ID_CHAR + '*', withUnicode(flags));
    }

    /**
     * Baut eine RegExp mit kontextsensitiven Wortgrenzen:
     *  - führende Grenze nur, wenn das Wort mit einem Bezeichner-Zeichen beginnt
     *  - abschließende Grenze nur, wenn das Wort mit einem solchen endet
     * So werden Bezeichner als Ganzwort ersetzt, ohne dass Wörter mit
     * Sonderzeichen an den Rändern (z.B. "@id") nie matchen.
     * K5: Lookaround statt \b – \b kennt nur ASCII und würde "Größe" mitten im
     * Wort als Grenze behandeln.
     */
    function wordRegex(word, flags, asciiFast) {
        const esc = escapeRegex(word);
        const str = String(word);
        const hasLeft = IS_ID_CHAR.test(str.charAt(0));
        const hasRight = IS_ID_CHAR.test(str.charAt(str.length - 1));
        // Solange weder Wort noch Text ein Zeichen jenseits von ASCII enthalten,
        // ist \b exakt gleichbedeutend mit der Unicode-Grenze – aber deutlich
        // billiger zu kompilieren (bei einigen tausend Bezeichnern macht das
        // mehrere hundert Millisekunden aus). Der Aufrufer entscheidet über
        // asciiFast; ohne die Zusicherung wird immer die korrekte Form gebaut.
        if (asciiFast && !NON_ASCII.test(str)) {
            return new RegExp((hasLeft ? '\\b' : '') + esc + (hasRight ? '\\b' : ''), flags);
        }
        return new RegExp((hasLeft ? NOT_ID_BEFORE : '') + esc + (hasRight ? NOT_ID_AFTER : ''), withUnicode(flags));
    }

    // Ein Text ohne Nicht-ASCII-Zeichen kann keine Unicode-Wortgrenze benötigen.
    // Ersetzungen fügen nur ASCII-Platzhalter ein, die Eigenschaft bleibt also
    // über den gesamten Durchlauf erhalten.
    function isPureAscii(text) {
        return !NON_ASCII.test(String(text));
    }

    /**
     * Wendet Ersetzungen an (Obfuskierung).
     * @param {string} code
     * @param {Array<{from:string,to:string}>} entries
     * @param {(from:string,to:string)=>void} [onMatch] wird bei jedem tatsächlichen
     *        Treffer aufgerufen (K3: erlaubt Aufrufern, echte Ersetzungen statt
     *        Mapping-Größe zu zählen, ohne die String-Rückgabe zu verändern).
     * Längste "from" zuerst → vermeidet Teilwort-Kollisionen.
     * Funktions-Replacer → "to" wird literal eingesetzt (kein $-Sonderzeichen).
     */
    function applyReplacements(code, entries, onMatch) {
        let out = code;
        const asciiFast = isPureAscii(code);
        const sorted = entries.slice().sort((a, b) => b.from.length - a.from.length);
        sorted.forEach(({ from, to }) => {
            if (!from) return;
            out = out.replace(wordRegex(from, 'g', asciiFast), () => {
                if (onMatch) onMatch(from, to);
                return to;
            });
        });
        return out;
    }

    /**
     * Macht Ersetzungen rückgängig (Deobfuskierung).
     * @param {Array<{placeholder:string,original:string}>} entries
     * @param {(placeholder:string,original:string)=>void} [onMatch] siehe applyReplacements.
     * Längste Platzhalter zuerst (kein _1 vor _10). Funktions-Replacer → keine
     * $-Injection über manipulierte/importierte Originalwerte.
     */
    function reverseReplacements(code, entries, onMatch) {
        let out = code;
        // Achtung: Hier wachsen Nicht-ASCII-Zeichen im Text (die Originale werden
        // wieder eingesetzt). Die Zusicherung muss deshalb auch die Originale
        // umfassen, nicht nur den Eingangstext.
        const asciiFast = isPureAscii(code) && entries.every(e => isPureAscii(e.original));
        const sorted = entries.slice().sort((a, b) => b.placeholder.length - a.placeholder.length);
        sorted.forEach(({ placeholder, original }) => {
            if (!placeholder) return;
            out = out.replace(wordRegex(placeholder, 'g', asciiFast), () => {
                if (onMatch) onMatch(placeholder, original);
                return original;
            });
        });
        return out;
    }

    // K2: Die Analyse erkennt nur Bezeichner anhand ihrer Deklarations-Syntax –
    // Inhalte von Strings, Kommentaren und Zahlenliteralen bleiben unangetastet.
    // Diese Heuristik prüft das VERSCHLEIERTE Ergebnis auf typische
    // Geheimnismuster, die trotzdem im Klartext stehen geblieben sein könnten,
    // und liefert die betroffenen Zeilennummern (1-basiert, dedupliziert).
    // W11: Ein blosses "=" traf auch ==, !=, >= und <=, sodass `if (secret == null)`
    // Alarm auslöste. Und ein Bezeichner, der ein Geheimnis-Wort nur enthält
    // (apiKeyName, connectionStringBuilder), ist selbst keines.
    // Zwei Bedingungen müssen daher zusammenkommen:
    //  1. Das Geheimnis-Wort steht DIREKT vor einer Zuweisung (kein Vergleich).
    //  2. In derselben Zeile steht ein String-Literal – ein Geheimnis ist immer
    //     ein Wert, nie eine Zahl (`int server = 5;` ist keiner).
    // Fehlalarme sind hier nicht kosmetisch: Sie setzen den Gesamtstatus auf
    // Fehler und würden den Nutzer daran gewöhnen, die Warnung wegzuklicken.
    const SECRET_ASSIGN_PATTERNS = [
        /password\s*=(?![=>])/i,
        /\bpwd\s*=(?![=>])/i,
        /\bserver\s*=(?![=>])/i,
        /data\s+source\s*=(?![=>])/i,
        /accountkey\s*=(?![=>])/i,
        /\bsecret\s*=(?![=>])/i,
        /api[_-]?key\s*=(?![=>])/i,
        /connectionstring\s*=(?![=>])/i
    ];
    // Unabhängig von einer Zuweisung: ein Bearer-Token ist immer verdächtig.
    const SECRET_STANDALONE_PATTERNS = [/bearer\s+\S/i];
    const HAS_STRING_LITERAL = /["']/;

    function isSecretLine(line) {
        if (SECRET_STANDALONE_PATTERNS.some(rx => rx.test(line))) return true;
        return HAS_STRING_LITERAL.test(line) && SECRET_ASSIGN_PATTERNS.some(rx => rx.test(line));
    }

    function findSecretHints(code) {
        const lines = String(code).split('\n');
        const hitLines = [];
        lines.forEach((line, idx) => {
            if (isSecretLine(line)) hitLines.push(idx + 1);
        });
        return hitLines;
    }

    // W5: analyzeCSharp und analyzeSqlStringReplace waren bis auf den Präfix
    // und den Feldnamen (original/word) identisch – gemeinsame Kernlogik hier,
    // damit ein künftiger Fix nicht (wie bei W2 geschehen) nur eine der beiden
    // Kopien erreicht.
    // @returns {Array<{[fieldName]:string, placeholder:string}>} in Fundreihenfolge
    function findWordVariants(code, words, prefix, fieldName) {
        const suffix = uniqueSuffix(code, [prefix]);
        const result = [];
        const seenVariants = new Set();
        const processedBaseWords = new Set();
        let counter = 1;

        words.forEach(word => {
            const wordLower = word.toLowerCase();
            if (processedBaseWords.has(wordLower)) return;
            processedBaseWords.add(wordLower);

            const searchRegex = containingWordRegex(word, 'gi');
            let match;
            while ((match = searchRegex.exec(code)) !== null) {
                const variant = match[0];
                if (variant.length === 0) { searchRegex.lastIndex++; continue; }
                if (!seenVariants.has(variant)) {
                    seenVariants.add(variant);
                    result.push({ [fieldName]: variant, placeholder: `${prefix}${suffix}${counter++}` });
                }
            }
        });
        return result;
    }

    // ── C# ────────────────────────────────────────────────────────────────

    const CS_PREFIX = 'STR_PLACEHOLDER_';

    /**
     * Analysiert C#-Code: findet alle Bezeichner, die eines der Suchwörter
     * enthalten (case-insensitiv, "raum" trifft auch SvcRaum/Raumnummer),
     * und vergibt kollisionssichere Platzhalter pro Bezeichner-Variante.
     * @returns {Array<{original:string, placeholder:string}>} in Fundreihenfolge
     */
    function analyzeCSharp(code, words) {
        return findWordVariants(code, words, CS_PREFIX, 'original');
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
     * SQL String-Replace: findet Bezeichner, die eines der Suchwörter enthalten
     * (case-insensitiv), vergibt kollisionssichere Platzhalter und liefert den
     * vorverarbeiteten Code.
     * @returns {{entries:Array<{word:string,placeholder:string}>, processedCode:string}}
     */
    function analyzeSqlStringReplace(words, code) {
        const entries = findWordVariants(code, words, SQL_STR_PREFIX, 'word');
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

        const ID = '\\[[^\\]]+\\]|' + IDENT;
        const REF = `(?:${ID})(?:\\.(?:${ID})){0,2}`;
        const IS_IDENT = new RegExp('^' + IDENT + '$', 'u');

        const stripBr = s => s.replace(/^\[|\]$/g, '').trim();
        const isSystemSchema = n => /^(dbo|sys|INFORMATION_SCHEMA|guest|master|model|msdb|tempdb)$/i.test(n);
        const isValidId = n => !!n
            && n.length >= 2
            && IS_IDENT.test(n)
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
                const m = p.match(new RegExp(`^(${REF})`, 'iu'));
                if (m) pushRef(m[1], 'column', true);
            });
        }

        const tablePatterns = [
            new RegExp(`\\bFROM\\s+(${REF})`, 'giu'),
            new RegExp(`\\b(?:(?:INNER|CROSS)\\s+|(?:LEFT|RIGHT|FULL)(?:\\s+OUTER)?\\s+)?JOIN\\s+(${REF})`, 'giu'),
            new RegExp(`\\bUPDATE\\s+(${REF})`, 'giu'),
            new RegExp(`\\bINSERT\\s+(?:INTO\\s+)?(${REF})`, 'giu'),
            new RegExp(`\\bDELETE\\s+(?:FROM\\s+)?(${REF})`, 'giu'),
            new RegExp(`\\bMERGE\\s+(?:INTO\\s+)?(${REF})`, 'giu'),
            new RegExp(`\\bUSING\\s+(${REF})`, 'giu'),
            new RegExp(`\\bINTO\\s+(${REF})`, 'giu'),
            new RegExp(`\\bCREATE\\s+TABLE\\s+(${REF})`, 'giu'),
            new RegExp(`\\bALTER\\s+TABLE\\s+(${REF})`, 'giu'),
            new RegExp(`\\bDROP\\s+TABLE\\s+(${REF})`, 'giu'),
            new RegExp(`\\bTRUNCATE\\s+TABLE\\s+(${REF})`, 'giu'),
            new RegExp(`\\bCREATE\\s+(?:UNIQUE\\s+)?(?:CLUSTERED\\s+|NONCLUSTERED\\s+)?INDEX\\s+(?:${ID})\\s+ON\\s+(${REF})`, 'giu'),
        ];
        tablePatterns.forEach(rx => {
            let m;
            while ((m = rx.exec(code)) !== null) pushRef(m[1], 'table');
        });

        const cteRegex = new RegExp(`\\bWITH\\s+(${ID})\\s+AS\\s*\\(`, 'giu');
        let cte;
        while ((cte = cteRegex.exec(code)) !== null) {
            const n = stripBr(cte[1]);
            if (isValidId(n)) foundElements.set(n, 'object');
        }

        const objRegex = new RegExp(`\\bCREATE\\s+(?:OR\\s+ALTER\\s+)?(?:PROCEDURE|PROC|FUNCTION|VIEW|TRIGGER)\\s+(${REF})`, 'giu');
        let obj;
        while ((obj = objRegex.exec(code)) !== null) pushRef(obj[1], 'object');

        const procRegex = new RegExp(`\\bEXEC(?:UTE)?\\s+(${REF})`, 'giu');
        let proc;
        while ((proc = procRegex.exec(code)) !== null) pushRef(proc[1], 'procedure');

        const funcRegex = new RegExp(`\\bFROM\\s+(${REF})\\s*\\(`, 'giu');
        let fn;
        while ((fn = funcRegex.exec(code)) !== null) pushRef(fn[1], 'function');

        const selectRegex = /\bSELECT\s+(?:DISTINCT\s+|TOP\s+\d+\s+(?:PERCENT\s+)?)?([\s\S]+?)\s+FROM\b/gi;
        let sel;
        while ((sel = selectRegex.exec(code)) !== null) pushColumnList(sel[1]);

        const insertColsRegex = new RegExp(`\\bINSERT\\s+(?:INTO\\s+)?${REF}\\s*\\(([^)]+)\\)`, 'giu');
        let ic;
        while ((ic = insertColsRegex.exec(code)) !== null) pushColumnList(ic[1]);

        const ixColsRegex = new RegExp(`\\bCREATE\\s+(?:UNIQUE\\s+)?(?:CLUSTERED\\s+|NONCLUSTERED\\s+)?INDEX\\s+(?:${ID})\\s+ON\\s+${REF}\\s*\\(([^)]+)\\)`, 'giu');
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

        const condOpRegex = new RegExp(`\\b(?:WHERE|HAVING|AND|OR)\\s+\\(*\\s*(${REF})\\s*(?:[=<>!]|LIKE\\b|IN\\b|BETWEEN\\b|IS\\b)`, 'giu');
        let co;
        while ((co = condOpRegex.exec(code)) !== null) pushRef(co[1], 'column', true);

        const onRegex = new RegExp(`\\bON\\s+(${REF})\\s*=\\s*(${REF})`, 'giu');
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
        param:     'CS_PARAM_',
        local:     'CS_LOCAL_'
    };

    const CS_TYPE_LABEL = {
        class:     'Klasse',
        iface:     'Interface',
        enum:      'Enum',
        namespace: 'Namespace',
        method:    'Methode',
        prop:      'Property',
        field:     'Feld',
        param:     'Parameter',
        local:     'Variable'
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
        const counters = { class: 1, iface: 1, enum: 1, namespace: 1, method: 1, prop: 1, field: 1, param: 1, local: 1 };
        const found = new Map(); // element → typeKey (first-seen wins)

        // K5: Bezeichner-Zeichenklasse zentral aus dem Modulkopf, damit C#-,
        // SQL- und String-Replace-Pfad nicht auseinanderlaufen.
        const ID = IDENT;
        const IS_IDENT_CS = new RegExp('^' + IDENT + '$', 'u');
        const SPLIT_NON_ID = new RegExp('[^\\p{L}\\p{N}_]+', 'u');

        function push(name, typeKey) {
            if (!name || found.has(name) || isCSharpKeyword(name)) return;
            if (!IS_IDENT_CS.test(name)) return;
            found.set(name, typeKey);
        }

        // Typ-Verwendung: Basis-Typ plus generische Argumente ("List<SvcRaum>"
        // → SvcRaum) als Klassen-Kandidaten aufnehmen. Framework-Typen filtert
        // isCSharpKeyword über push() heraus.
        function pushType(base, generics) {
            push(base, 'class');
            if (generics) {
                generics.split(SPLIT_NON_ID).forEach(function (g) { push(g, 'class'); });
            }
        }

        let m;

        // ── Typdeklarationen (sehr zuverlässig) ────────────────────────────
        // NOT_ID_BEFORE statt \b: \b ist auch im u-Modus ASCII-basiert.
        const classRx = new RegExp(NOT_ID_BEFORE + 'class\\s+(' + ID + ')', 'gu');
        while ((m = classRx.exec(text)) !== null) push(m[1], 'class');

        const ifaceRx = new RegExp(NOT_ID_BEFORE + 'interface\\s+(' + ID + ')', 'gu');
        while ((m = ifaceRx.exec(text)) !== null) push(m[1], 'iface');

        const enumRx = new RegExp(NOT_ID_BEFORE + 'enum\\s+(' + ID + ')', 'gu');
        while ((m = enumRx.exec(text)) !== null) push(m[1], 'enum');

        // ── Namespace (mehrteilig, auf Punkte aufteilen) ────────────────────
        const nsRx = new RegExp(NOT_ID_BEFORE + 'namespace\\s+(' + ID + '(?:\\.' + ID + ')*)', 'gu');
        while ((m = nsRx.exec(text)) !== null) {
            m[1].split('.').forEach(function (part) { push(part, 'namespace'); });
        }

        // ── Objekt-Erzeugung: new Foo(...) / new Foo{...} / new Foo[...] ────
        // Muss vor den Member-Regexen laufen, sonst würde "new" als Modifier
        // den Typnamen fälschlich als Methode klassifizieren (first-seen wins).
        const newRx = new RegExp(NOT_ID_BEFORE + 'new\\s+(' + ID + ')\\s*(?:<([^>]*)>)?\\s*[({\\[]', 'gu');
        while ((m = newRx.exec(text)) !== null) pushType(m[1], m[2]);

        // ── Member-Deklarationen (mit Modifier als Anker) ───────────────────
        // Modifier-Präfix stellt sicher, dass wir Deklarationen treffen, nicht Aufrufe.
        const MOD = '(?:public|private|protected|internal|static|async|virtual|override' +
                    '|abstract|sealed|new|extern|partial|readonly|const|volatile)';
        const MODS = NOT_ID_BEFORE + MOD + '(?:\\s+' + MOD + ')*\\s+';
        // Typtoken mit Captures (Basis + generische Argumente), Array-Suffix, Nullable-Marker
        const TYP = '(' + ID + ')(?:<([^>]*)>)?(?:\\[\\])*\\??\\s+';

        // Methoden: MODS [ReturnType] MethodenName(
        // TYP ist optional, damit Konstruktoren (ohne expliziten Rückgabetyp) ebenfalls erfasst werden.
        const methodRx = new RegExp(MODS + '(?:' + TYP + ')?(' + ID + ')\\s*(?:<[^>]*>\\s*)?\\(', 'gu');
        while ((m = methodRx.exec(text)) !== null) { push(m[3], 'method'); pushType(m[1], m[2]); }

        // Properties: MODS TYP Name {
        const propRx = new RegExp(MODS + TYP + '(' + ID + ')\\s*\\{', 'gu');
        while ((m = propRx.exec(text)) !== null) { push(m[3], 'prop'); pushType(m[1], m[2]); }

        // Felder: MODS [readonly|const] TYP Name ; oder =
        const fieldRx = new RegExp(MODS + '(?:readonly\\s+|const\\s+)?' + TYP + '(' + ID + ')\\s*(?:;|=)', 'gu');
        while ((m = fieldRx.exec(text)) !== null) { push(m[3], 'field'); pushType(m[1], m[2]); }

        // ── foreach: Typ + Laufvariable ─────────────────────────────────────
        const foreachRx = new RegExp(NOT_ID_BEFORE + 'foreach\\s*\\(\\s*' + TYP + '(' + ID + ')\\s+in' + NOT_ID_AFTER, 'gu');
        while ((m = foreachRx.exec(text)) !== null) { push(m[3], 'local'); pushType(m[1], m[2]); }

        // ── Parameter ───────────────────────────────────────────────────────
        // Alle Positionen: (Type name), (Type name, ...), ..., Type name), ..., Type name,
        const paramRx = new RegExp('[,(]\\s*(?:(?:ref|out|in|params)\\s+)?' + TYP + '(' + ID + ')\\s*(?=[,)=])', 'gu');
        while ((m = paramRx.exec(text)) !== null) { push(m[3], 'param'); pushType(m[1], m[2]); }

        // Benannte Argumente: Foo(name: wert) – Parametername an der Aufrufstelle.
        // (?!:) schließt den Scope-Operator "::" aus; der Ternär-Operator matcht
        // nicht, weil direkt nach dem Bezeichner ein ":" stehen muss.
        const namedArgRx = new RegExp('[,(]\\s*(' + ID + ')\\s*:(?!:)', 'gu');
        while ((m = namedArgRx.exec(text)) !== null) push(m[1], 'param');

        // Lambda-Parameter ohne Klammern: x => …  ("_" = Discard, nicht ersetzen).
        // Läuft nach den Deklarations-Regexen, damit expression-bodied Member
        // (first-seen) nicht als Parameter umklassifiziert werden.
        const lambdaRx = new RegExp(NOT_ID_BEFORE + '(' + ID + ')\\s*=>', 'gu');
        while ((m = lambdaRx.exec(text)) !== null) { if (m[1] !== '_') push(m[1], 'param'); }

        // ── Lokale Variablen: Typ name = … (var-Deklarationen: Typ "var"
        // fällt im Keyword-Filter weg, der Name wird trotzdem erkannt).
        // (?![=>]) schließt == und => aus.
        const localRx = new RegExp(NOT_ID_BEFORE + TYP + '(' + ID + ')\\s*=(?![=>])', 'gu');
        while ((m = localRx.exec(text)) !== null) { push(m[3], 'local'); pushType(m[1], m[2]); }

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

    // R3: nach der Rückverwandlung soll erkannt werden, wenn die KI-Antwort
    // Platzhalter verändert zurückgegeben hat (Markdown, Umbrüche, o.ä.) und
    // dadurch Reste im finalen Code stehen bleiben, statt das unbemerkt zu lassen.
    const ALL_PLACEHOLDER_PREFIXES = [
        CS_PREFIX, SQL_STR_PREFIX,
        ...Object.values(CS_PREFIXES),
        ...Object.values(SQL_PREFIXES)
    ];

    function findLeftoverPlaceholders(code) {
        const text = String(code);
        const found = new Set();
        ALL_PLACEHOLDER_PREFIXES.forEach(prefix => {
            // Führendes \b ist zwingend: STR_PLACEHOLDER_ ist ein Suffix von
            // SQL_STR_PLACEHOLDER_, sonst würde ein einzelnes
            // SQL_STR_PLACEHOLDER_1 doppelt (und mit falschem Namen) gemeldet.
            const rx = new RegExp(NOT_ID_BEFORE + escapeRegex(prefix) + '[A-Za-z0-9_]*\\d+' + NOT_ID_AFTER, 'gu');
            let m;
            while ((m = rx.exec(text)) !== null) found.add(m[0]);
        });
        return Array.from(found);
    }

    return {
        escapeRegex,
        escapeHtml,
        fingerprint,
        uniqueSuffix,
        wordRegex,
        applyReplacements,
        reverseReplacements,
        analyzeCSharp,
        findSecretHints,
        findLeftoverPlaceholders,
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
