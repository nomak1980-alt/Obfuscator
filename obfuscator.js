/**
 * obfuscator.js – DOM-/UI-Schicht.
 * Die eigentliche Obfuskierungslogik liegt in obfuscator-core.js (ObfuscatorCore),
 * das DOM-frei und damit isoliert testbar ist. Diese Datei kümmert sich nur um
 * DOM-Lesen/-Schreiben, Persistenz (localStorage) und Statusmeldungen.
 */

// ── State ─────────────────────────────────────────────────────────────────
// Vorwärts-Maps + History. Reverse-Maps werden NICHT persistiert, sondern bei
// Bedarf aus den Vorwärts-Maps abgeleitet (siehe buildReverse/loadState).
let stringReplaceMapping = new Map();
let reverseStringReplaceMapping = new Map();
let replacementHistory = [];
let csharpAutoMapping = new Map();
let reverseCsharpAutoMapping = new Map();
let csharpAutoTypeMap = new Map();
let sqlStringReplaceMapping = new Map();
let reverseSqlStringReplaceMapping = new Map();
let sqlMapping = new Map();
let reverseSqlMapping = new Map();
let currentTab = 'csharp';
let csharpReplaceWords = [];
let sqlReplaceWords = [];

let statusTimer = null;
let sqlStatusTimer = null;

const Core = (typeof ObfuscatorCore !== 'undefined')
    ? ObfuscatorCore
    : (typeof require !== 'undefined' ? require('./obfuscator-core.js') : null);

// ── Persistenz (localStorage, JSON) ───────────────────────────────────────
const STORAGE_KEY = 'obfuscatorAppState_v1';
const CURRENT_VERSION = 1;
// Schutzschwelle: sehr große Eingaben können die (synchrone) Regex-Analyse den
// UI-Thread blockieren lassen. Ab dieser Größe wird der Nutzer vorab gefragt.
const MAX_SAFE_INPUT = 1000000;

// Liefert false, wenn der Nutzer die Verarbeitung sehr großer Eingaben abbricht.
function confirmLargeInput(code) {
    if (code.length <= MAX_SAFE_INPUT) return true;
    const mb = (code.length / 1048576).toFixed(1);
    return confirm(`Die Eingabe ist sehr groß (${mb} MB). Die Verarbeitung kann den Browser kurz einfrieren. Fortfahren?`);
}
let saveTimer = null;
let restoring = false;

function buildReverse(map) {
    const rev = new Map();
    map.forEach((value, key) => rev.set(value, key));
    return rev;
}

function mapToForward(map) {
    return Array.from(map, ([from, to]) => ({ from, to }));
}
function mapToReverse(map) {
    return Array.from(map, ([placeholder, original]) => ({ placeholder, original }));
}

function getReplaceWords(prefix) {
    return prefix === 'stringReplace' ? [...csharpReplaceWords] : [...sqlReplaceWords];
}

function renderChip(word, arr, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.word = word;
    const label = document.createElement('span');
    label.textContent = word;
    const btn = document.createElement('button');
    btn.className = 'chip-remove';
    btn.type = 'button';
    btn.setAttribute('aria-label', word + ' entfernen');
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
        const idx = arr.indexOf(word);
        if (idx !== -1) arr.splice(idx, 1);
        chip.remove();
        scheduleSave();
    });
    chip.appendChild(label);
    chip.appendChild(btn);
    container.appendChild(chip);
}

function addChip(word, arr, containerId) {
    const trimmed = word.trim();
    if (!trimmed || arr.includes(trimmed)) return;
    if (trimmed.length < 3) {
        const inputId = containerId === 'stringReplaceChips' ? 'stringReplaceInput'
                      : containerId === 'sqlStringReplaceChips' ? 'sqlStringReplaceInput'
                      : null;
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                input.style.borderColor = '#dc2626';
                setTimeout(() => { input.style.borderColor = ''; }, 1200);
            }
        }
        return;
    }
    arr.push(trimmed);
    renderChip(trimmed, arr, containerId);
    scheduleSave();
}

function clearChips(arr, containerId) {
    arr.length = 0;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
}

function scheduleSave() {
    if (restoring) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 300);
}

function captureCsharpSelection() {
    const rows = document.querySelectorAll('.csharp-mapping-checkbox');
    if (rows.length === 0) return null;
    return Array.from(rows).map(cb => ({
        original: cb.dataset.original,
        placeholder: cb.dataset.placeholder,
        type: cb.dataset.type || '',
        checked: cb.checked
    }));
}

function captureSqlSelection() {
    const rows = document.querySelectorAll('.sql-mapping-checkbox');
    if (rows.length === 0) return null;
    // Daten aus den dataset-Attributen lesen (nicht aus gerendertem Zellen-Text),
    // damit die Persistenz nicht an der Tabellenstruktur hängt.
    return Array.from(rows).map(cb => ({
        element: cb.dataset.element,
        type: cb.dataset.type,
        obfuscated: cb.dataset.obfuscated || '',
        checked: cb.checked
    }));
}

function captureSections(ids) {
    const out = {};
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) out[id] = el.style.display || '';
    });
    return out;
}

function saveState() {
    if (restoring) return;
    const state = {
        version: CURRENT_VERSION,
        savedAt: new Date().toISOString(),
        currentTab,
        csharp: {
            originalCode: document.getElementById('originalCode').value,
            obfuscatedCode: document.getElementById('obfuscatedCode').value,
            aiResponse: document.getElementById('aiResponse').value,
            finalCode: document.getElementById('finalCode').value,
            stringReplaceWords: [...csharpReplaceWords],
            stringReplaceMapping: Array.from(stringReplaceMapping.entries()),
            replacementHistory: replacementHistory,
            csharpAutoMapping: Array.from(csharpAutoMapping.entries()),
            csharpAutoTypeMap: Array.from(csharpAutoTypeMap.entries()),
            selection: captureCsharpSelection(),
            sections: captureSections([
                'csharpMappingSelectionSection',
                'obfuscatedSection',
                'csharpUsedMappingSection',
                'aiResponseSection',
                'finalSection'
            ])
        },
        sql: {
            sqlOriginalCode: document.getElementById('sqlOriginalCode').value,
            sqlObfuscatedCode: document.getElementById('sqlObfuscatedCode').value,
            sqlAiResponse: document.getElementById('sqlAiResponse').value,
            sqlFinalCode: document.getElementById('sqlFinalCode').value,
            sqlStringReplaceWords: [...sqlReplaceWords],
            sqlMapping: Array.from(sqlMapping.entries()),
            sqlStringReplaceMapping: Array.from(sqlStringReplaceMapping.entries()),
            selection: captureSqlSelection(),
            sections: captureSections([
                'sqlUsedMappingSection',
                'sqlMappingSelectionSection',
                'sqlObfuscatedSection',
                'sqlAiResponseSection',
                'sqlFinalSection'
            ])
        }
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        // QuotaExceededError o.ä. – dem Nutzer aktiv melden statt still zu schlucken.
        console.warn('Konnte Zustand nicht speichern:', e);
        const tooBig = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
        notify(tooBig
            ? 'Automatisches Speichern fehlgeschlagen: Datenmenge zu groß für den Browser-Speicher.'
            : 'Automatisches Speichern fehlgeschlagen.', 'error');
    }
}

function clearSavedState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

function clearTabState(tabKey) {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    let state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    if (!state || typeof state !== 'object') return;
    delete state[tabKey];
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
}

function restoreCsharpSelection(selection) {
    const strMap = new Map();
    const autoMap = new Map();
    const typeMap = new Map();

    selection.forEach(s => {
        if (s.type === 'String') {
            strMap.set(s.original, s.placeholder);
        } else {
            autoMap.set(s.original, s.placeholder);
            typeMap.set(s.original, s.type || '');
        }
    });

    // Modul-State synchronisieren (für eventuelle Folge-Aktionen ohne erneute Analyse)
    csharpAutoTypeMap = new Map(typeMap);

    renderCsharpSelectionTable(strMap, autoMap, typeMap);
    document.querySelectorAll('.csharp-mapping-checkbox').forEach(cb => {
        const item = selection.find(s => s.original === cb.dataset.original);
        if (item) cb.checked = item.checked;
    });
    syncSelectAll('csharpSelectAll', '.csharp-mapping-checkbox');
}

function restoreSqlSelection(selection) {
    const potentialMappings = new Map();
    selection.forEach(s => potentialMappings.set(s.element, { obfuscated: s.obfuscated, type: s.type }));
    displaySqlMappingSelection(potentialMappings);
    document.querySelectorAll('.sql-mapping-checkbox').forEach(cb => {
        const item = selection.find(s => s.element === cb.dataset.element);
        if (item) cb.checked = item.checked;
    });
    syncSelectAll('sqlSelectAll', '.sql-mapping-checkbox');
}

function applySections(sections) {
    if (!sections) return;
    Object.keys(sections).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = sections[id] || 'none';
    });
}

function loadState() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    let state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    if (!state || typeof state !== 'object') return;
    if (typeof state.version === 'number' && state.version > CURRENT_VERSION) {
        notify('Gespeicherter Stand stammt aus einer neueren Version – wird ggf. unvollständig geladen.', 'error');
    }

    restoring = true;
    try {
        if (state.csharp) {
            const cs = state.csharp;
            document.getElementById('originalCode').value = cs.originalCode || '';
            document.getElementById('obfuscatedCode').value = cs.obfuscatedCode || '';
            document.getElementById('aiResponse').value = cs.aiResponse || '';
            document.getElementById('finalCode').value = cs.finalCode || '';
            clearChips(csharpReplaceWords, 'stringReplaceChips');
            if (Array.isArray(cs.stringReplaceWords)) {
                cs.stringReplaceWords.forEach(w => addChip(w, csharpReplaceWords, 'stringReplaceChips'));
            } else {
                // backward compat: old format had stringReplace1/2/3 as multiline strings
                const seen = new Set();
                ['stringReplace1', 'stringReplace2', 'stringReplace3'].forEach(key => {
                    if (cs[key]) {
                        cs[key].split('\n').map(w => w.trim()).filter(Boolean).forEach(w => {
                            if (!seen.has(w)) { seen.add(w); addChip(w, csharpReplaceWords, 'stringReplaceChips'); }
                        });
                    }
                });
            }

            stringReplaceMapping = new Map(cs.stringReplaceMapping || []);
            reverseStringReplaceMapping = buildReverse(stringReplaceMapping);
            csharpAutoMapping = new Map(cs.csharpAutoMapping || []);
            reverseCsharpAutoMapping = buildReverse(csharpAutoMapping);
            csharpAutoTypeMap = new Map(cs.csharpAutoTypeMap || []);
            replacementHistory = cs.replacementHistory || [];
            if (stringReplaceMapping.size > 0 && replacementHistory.length === 0) {
                stringReplaceMapping.forEach((ph, orig) => replacementHistory.push({ placeholder: ph, original: orig }));
            }

            if (cs.selection && cs.selection.length > 0) restoreCsharpSelection(cs.selection);
            if (stringReplaceMapping.size > 0 || csharpAutoMapping.size > 0) updateCsharpUsedMappingDisplay();
            applySections(cs.sections);
        }

        if (state.sql) {
            const sq = state.sql;
            document.getElementById('sqlOriginalCode').value = sq.sqlOriginalCode || '';
            document.getElementById('sqlObfuscatedCode').value = sq.sqlObfuscatedCode || '';
            document.getElementById('sqlAiResponse').value = sq.sqlAiResponse || '';
            document.getElementById('sqlFinalCode').value = sq.sqlFinalCode || '';
            clearChips(sqlReplaceWords, 'sqlStringReplaceChips');
            if (Array.isArray(sq.sqlStringReplaceWords)) {
                sq.sqlStringReplaceWords.forEach(w => addChip(w, sqlReplaceWords, 'sqlStringReplaceChips'));
            } else {
                const seen = new Set();
                ['sqlStringReplace1', 'sqlStringReplace2', 'sqlStringReplace3'].forEach(key => {
                    if (sq[key]) {
                        sq[key].split('\n').map(w => w.trim()).filter(Boolean).forEach(w => {
                            if (!seen.has(w)) { seen.add(w); addChip(w, sqlReplaceWords, 'sqlStringReplaceChips'); }
                        });
                    }
                });
            }

            sqlMapping = new Map(sq.sqlMapping || []);
            reverseSqlMapping = buildReverse(sqlMapping);
            sqlStringReplaceMapping = new Map(sq.sqlStringReplaceMapping || []);
            reverseSqlStringReplaceMapping = buildReverse(sqlStringReplaceMapping);

            if (sq.selection && sq.selection.length > 0) restoreSqlSelection(sq.selection);
            if (sqlMapping.size > 0 || sqlStringReplaceMapping.size > 0) updateSqlUsedMappingDisplay();
            applySections(sq.sections);
        }

        if (state.currentTab) switchTab(state.currentTab);
    } finally {
        restoring = false;
    }
}

// ── Hilfsfunktionen (DOM/Anzeige) ──────────────────────────────────────────

function escapeHtml(str) { return Core.escapeHtml(str); }

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => {
        const active = t.dataset.tab === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        const active = c.id === tab + '-tab';
        c.classList.toggle('active', active);
        if (active) c.removeAttribute('hidden'); else c.setAttribute('hidden', '');
    });
    currentTab = tab;
    scheduleSave();
}

// Gemeinsame Status-Anzeige (ersetzt die früher duplizierten showStatus-Varianten).
function renderStatus(divId, slot, message, type) {
    const div = document.getElementById(divId);
    if (!div) return;
    clearTimeout(slot.timer);
    div.className = `status ${type}`;
    div.textContent = message;
    // Fehlermeldungen bleiben länger stehen (Barrierefreiheit / langsames Lesen).
    const ttl = type === 'error' ? 8000 : 3000;
    slot.timer = setTimeout(() => { div.textContent = ''; div.className = ''; }, ttl);
}

const _csharpSlot = { get timer() { return statusTimer; }, set timer(v) { statusTimer = v; } };
const _sqlSlot = { get timer() { return sqlStatusTimer; }, set timer(v) { sqlStatusTimer = v; } };

function showStatus(message, type = 'success') { renderStatus('statusMessage', _csharpSlot, message, type); }
function showSqlStatus(message, type = 'success') { renderStatus('sqlStatusMessage', _sqlSlot, message, type); }

// Meldung auf dem aktuell sichtbaren Tab ausgeben.
function notify(message, type = 'success') {
    (currentTab === 'mssql' ? showSqlStatus : showStatus)(message, type);
}

// Gemeinsames Rendern einer "Original → Platzhalter"-Liste.
function renderMappingList(divId, map, emptyText) {
    const div = document.getElementById(divId);
    if (!div) return;
    div.innerHTML = '';
    if (map.size === 0) {
        div.innerHTML = `<div class="mapping-empty">${escapeHtml(emptyText)}</div>`;
        return;
    }
    map.forEach((placeholder, original) => {
        const item = document.createElement('div');
        item.className = 'mapping-item';
        item.innerHTML = `
            <span class="original">${escapeHtml(original)}</span>
            <span>→</span>
            <span class="obfuscated">${escapeHtml(placeholder)}</span>
        `;
        div.appendChild(item);
    });
}

function syncSelectAll(selectAllId, checkboxSelector) {
    const selectAll = document.getElementById(selectAllId);
    if (!selectAll) return;
    const all = Array.from(document.querySelectorAll(checkboxSelector));
    selectAll.checked = all.length > 0 && all.every(cb => cb.checked);
}

async function copyToClipboard(sourceId, statusFn, label) {
    try {
        const text = document.getElementById(sourceId).value;
        await navigator.clipboard.writeText(text);
        statusFn(`${label} kopiert!`);
    } catch (e) {
        statusFn('Kopieren in die Zwischenablage fehlgeschlagen.', 'error');
    }
}

// ── C# Obfuskierung ─────────────────────────────────────────────────────────

function analyzeCode() {
    const originalCode = document.getElementById('originalCode').value.trim();
    if (!originalCode) {
        showStatus('Bitte füge zuerst deinen C# Code ein!', 'error');
        return;
    }
    if (!confirmLargeInput(originalCode)) return;

    const hasMappings = stringReplaceMapping.size > 0 || csharpAutoMapping.size > 0;
    if (hasMappings) {
        if (!confirm('Neu analysieren? Das bisherige Mapping geht verloren und verschleierter Code kann nicht mehr zurückverwandelt werden.')) return;
    }

    // Schritt 1: String-Replace-Analyse (bestehend)
    const strAnalyzed = Core.analyzeCSharp(originalCode, getReplaceWords('stringReplace'));
    stringReplaceMapping = new Map(strAnalyzed.map(e => [e.original, e.placeholder]));
    reverseStringReplaceMapping = buildReverse(stringReplaceMapping);

    // Schritt 2: Auto-Analyse (Duplikate aus String-Replace herausfiltern)
    const autoAnalyzed = Core.analyzeCSharpElements(originalCode)
        .filter(e => !stringReplaceMapping.has(e.element));
    csharpAutoMapping = new Map(autoAnalyzed.map(e => [e.element, e.placeholder]));
    reverseCsharpAutoMapping = buildReverse(csharpAutoMapping);
    csharpAutoTypeMap = new Map(autoAnalyzed.map(e => [e.element, e.type]));

    if (stringReplaceMapping.size === 0 && csharpAutoMapping.size === 0) {
        showStatus('Keine Elemente erkannt. Bitte Code einfügen oder Wörter eintragen.', 'error');
        return;
    }

    renderCsharpSelectionTable(stringReplaceMapping, csharpAutoMapping, csharpAutoTypeMap);
    const csharpSelSec = document.getElementById('csharpMappingSelectionSection');
    csharpSelSec.style.display = 'block';
    csharpSelSec.classList.remove('collapsed');
    document.getElementById('obfuscatedSection').style.display = 'none';
    document.getElementById('csharpUsedMappingSection').style.display = 'none';
    document.getElementById('aiResponseSection').style.display = 'none';
    document.getElementById('finalSection').style.display = 'none';
    document.getElementById('obfuscatedCode').value = '';
    document.getElementById('aiResponse').value = '';
    document.getElementById('finalCode').value = '';

    const strCount = stringReplaceMapping.size;
    const autoCount = csharpAutoMapping.size;
    const total = strCount + autoCount;
    const parts = [];
    if (strCount > 0) parts.push(`${strCount} String-Replace`);
    if (autoCount > 0) parts.push(`${autoCount} Auto-Erkannt`);
    showStatus(`${total} Elemente erkannt (${parts.join(', ')}). Auswahl treffen und "Verschleiern" klicken.`);
    saveState();
}

function renderCsharpSelectionTable(strMap, autoMap, typeMap) {
    const container = document.getElementById('csharpMappingSelectionContainer');
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'mapping-selection-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th style="width: 50px;"><input type="checkbox" id="csharpSelectAll" aria-label="Alle auswählen" checked></th>
        <th>Typ</th>
        <th>Original</th>
        <th>Platzhalter</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    strMap.forEach((placeholder, original) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="csharp-mapping-checkbox" data-original="${escapeHtml(original)}" data-placeholder="${escapeHtml(placeholder)}" data-type="String" aria-label="${escapeHtml(original)} verschleiern" checked></td>
            <td>String</td>
            <td class="original">${escapeHtml(original)}</td>
            <td class="obfuscated">${escapeHtml(placeholder)}</td>
        `;
        tbody.appendChild(row);
    });

    autoMap.forEach((placeholder, original) => {
        const typLabel = typeMap ? (typeMap.get(original) || '') : '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="csharp-mapping-checkbox" data-original="${escapeHtml(original)}" data-placeholder="${escapeHtml(placeholder)}" data-type="${escapeHtml(typLabel)}" aria-label="${escapeHtml(original)} verschleiern" checked></td>
            <td>${escapeHtml(typLabel)}</td>
            <td class="original">${escapeHtml(original)}</td>
            <td class="obfuscated">${escapeHtml(placeholder)}</td>
        `;
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    document.getElementById('csharpSelectAll').addEventListener('change', function () {
        document.querySelectorAll('.csharp-mapping-checkbox').forEach(cb => cb.checked = this.checked);
    });
}

function obfuscateCode() {
    const originalCode = document.getElementById('originalCode').value.trim();
    if (!originalCode) {
        showStatus('Bitte füge zuerst deinen C# Code ein!', 'error');
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('.csharp-mapping-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showStatus('Bitte wähle mindestens ein Element aus!', 'error');
        return;
    }

    // Checkboxen nach Typ trennen
    stringReplaceMapping = new Map();
    replacementHistory = [];
    csharpAutoMapping = new Map();

    selectedCheckboxes.forEach(cb => {
        const original = cb.dataset.original;
        const placeholder = cb.dataset.placeholder;
        if (cb.dataset.type === 'String') {
            stringReplaceMapping.set(original, placeholder);
            replacementHistory.push({ placeholder, original });
        } else {
            csharpAutoMapping.set(original, placeholder);
        }
    });
    reverseStringReplaceMapping = buildReverse(stringReplaceMapping);
    reverseCsharpAutoMapping = buildReverse(csharpAutoMapping);

    // Schritt 1: String-Replace zuerst
    let obfuscatedCode = Core.applyReplacements(originalCode, mapToForward(stringReplaceMapping));

    // Schritt 2: Auto-Mapping danach
    obfuscatedCode = Core.applyReplacements(obfuscatedCode, mapToForward(csharpAutoMapping));

    document.getElementById('obfuscatedCode').value = obfuscatedCode;
    document.getElementById('obfuscatedSection').style.display = 'block';
    document.getElementById('aiResponseSection').style.display = 'block';
    document.getElementById('csharpMappingSelectionSection').classList.add('collapsed');

    updateCsharpUsedMappingDisplay();
    const total = stringReplaceMapping.size + csharpAutoMapping.size;
    document.getElementById('csharpUsedMappingSection').style.display = total > 0 ? 'block' : 'none';

    showStatus(`Code erfolgreich verschleiert! ${total} Elemente ersetzt.`);
    saveState();
}

function updateCsharpUsedMappingDisplay() {
    const combined = new Map([...stringReplaceMapping, ...csharpAutoMapping]);
    renderMappingList('csharpUsedMappingDisplay', combined, 'Keine Mappings vorhanden');
}

function deobfuscateCode() {
    const aiResponse = document.getElementById('aiResponse').value.trim();
    if (!aiResponse) {
        showStatus('Bitte füge zuerst die KI-Antwort ein!', 'error');
        return;
    }
    if (replacementHistory.length === 0 && reverseCsharpAutoMapping.size === 0) {
        showStatus('Kein Mapping verfügbar! Bitte verschleiere zuerst deinen Code.', 'error');
        return;
    }

    // Schritt 1: Auto-Mapping zuerst rückgängig
    let finalCode = Core.reverseReplacements(aiResponse, mapToReverse(reverseCsharpAutoMapping));

    // Schritt 2: String-Replace rückgängig
    finalCode = Core.reverseReplacements(finalCode, replacementHistory);

    document.getElementById('finalCode').value = finalCode;
    document.getElementById('finalSection').style.display = 'block';
    const total = replacementHistory.length + reverseCsharpAutoMapping.size;
    showStatus(`Code erfolgreich zurückverwandelt! ${total} Elemente wiederhergestellt.`);
    saveState();
}

async function copyObfuscated() { await copyToClipboard('obfuscatedCode', showStatus, 'Verschleierter Code'); }
async function copyFinal() { await copyToClipboard('finalCode', showStatus, 'Finaler Code'); }

function clearAll() {
    if (!confirm('C#-Daten löschen? Das Mapping geht verloren!')) return;
    ['originalCode', 'obfuscatedCode', 'aiResponse', 'finalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    clearChips(csharpReplaceWords, 'stringReplaceChips');
    const csInput = document.getElementById('stringReplaceInput');
    if (csInput) csInput.value = '';

    stringReplaceMapping = new Map();
    reverseStringReplaceMapping = new Map();
    replacementHistory = [];
    csharpAutoMapping = new Map();
    reverseCsharpAutoMapping = new Map();
    csharpAutoTypeMap = new Map();

    ['csharpMappingSelectionSection', 'obfuscatedSection', 'csharpUsedMappingSection',
        'aiResponseSection', 'finalSection']
        .forEach(id => { document.getElementById(id).style.display = 'none'; });

    clearTabState('csharp');
    showStatus('C#-Daten gelöscht!');
}

// ── SQL Obfuskierung ────────────────────────────────────────────────────────

function analyzeSqlCode() {
    const originalCode = document.getElementById('sqlOriginalCode').value.trim();
    if (!originalCode) {
        showSqlStatus('Bitte füge zuerst deine SQL Queries ein!', 'error');
        return;
    }
    if (!confirmLargeInput(originalCode)) return;

    const hasMappings = sqlMapping.size > 0 || sqlStringReplaceMapping.size > 0;
    if (hasMappings) {
        if (!confirm('Neu analysieren? Das bisherige SQL-Mapping geht verloren.')) return;
    }

    const sr = Core.analyzeSqlStringReplace(getReplaceWords('sqlStringReplace'), originalCode);
    sqlStringReplaceMapping = new Map(sr.entries.map(e => [e.word, e.placeholder]));
    reverseSqlStringReplaceMapping = buildReverse(sqlStringReplaceMapping);

    const els = Core.analyzeSqlElements(sr.processedCode);
    const potentialMappings = new Map();
    els.forEach(e => potentialMappings.set(e.element, { obfuscated: e.placeholder, type: e.type }));

    if (potentialMappings.size > 0 || sqlStringReplaceMapping.size > 0) {
        const srCount = sqlStringReplaceMapping.size;
        const elCount = potentialMappings.size;
        const total = srCount + elCount;
        const parts = [];
        if (elCount > 0) parts.push(`${elCount} SQL-Elemente`);
        if (srCount > 0) parts.push(`${srCount} String-Replace`);
        showSqlStatus(`${total} Elemente erkannt (${parts.join(', ')}). Auswahl treffen und "Verschleiern" klicken.`);
        displaySqlMappingSelection(potentialMappings);
        document.querySelectorAll('.sql-mapping-checkbox').forEach(cb => cb.checked = true);
        const selectAll = document.getElementById('sqlSelectAll');
        if (selectAll) selectAll.checked = true;
    } else {
        showSqlStatus('Keine SQL-Elemente oder String-Replace-Wörter gefunden.', 'error');
    }
    document.getElementById('sqlObfuscatedSection').style.display = 'none';
    document.getElementById('sqlAiResponseSection').style.display = 'none';
    document.getElementById('sqlUsedMappingSection').style.display = 'none';
    document.getElementById('sqlFinalSection').style.display = 'none';
    document.getElementById('sqlObfuscatedCode').value = '';
    document.getElementById('sqlAiResponse').value = '';
    document.getElementById('sqlFinalCode').value = '';
    saveState();
}

function displaySqlMappingSelection(potentialMappings) {
    const selectionDiv = document.getElementById('sqlMappingSelectionContainer');
    selectionDiv.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'mapping-selection-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th style="width: 50px;"><input type="checkbox" id="sqlSelectAll" aria-label="Alle auswählen" checked></th>
        <th>Typ</th>
        <th>Original</th>
        <th>Verschleiert</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // String-Replace-Wörter zuerst (aus sqlStringReplaceMapping)
    sqlStringReplaceMapping.forEach((placeholder, word) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="sql-mapping-checkbox" data-element="${escapeHtml(word)}" data-type="String" data-obfuscated="${escapeHtml(placeholder)}" aria-label="${escapeHtml(word)} verschleiern" checked></td>
            <td>String</td>
            <td class="original">${escapeHtml(word)}</td>
            <td class="obfuscated">${escapeHtml(placeholder)}</td>
        `;
        tbody.appendChild(row);
    });

    // SQL-Elemente alphabetisch sortiert
    const sortedElements = Array.from(potentialMappings.keys()).sort((a, b) => a.localeCompare(b));
    sortedElements.forEach(element => {
        const mapping = potentialMappings.get(element);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="sql-mapping-checkbox" data-element="${escapeHtml(element)}" data-type="${escapeHtml(mapping.type)}" data-obfuscated="${escapeHtml(mapping.obfuscated)}" aria-label="${escapeHtml(element)} verschleiern" checked></td>
            <td>${escapeHtml(mapping.type)}</td>
            <td class="original">${escapeHtml(element)}</td>
            <td class="obfuscated">${escapeHtml(mapping.obfuscated)}</td>
        `;
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    selectionDiv.appendChild(table);

    document.getElementById('sqlSelectAll').addEventListener('change', function () {
        document.querySelectorAll('.sql-mapping-checkbox').forEach(cb => cb.checked = this.checked);
    });

    const sqlSelSec = document.getElementById('sqlMappingSelectionSection');
    sqlSelSec.style.display = 'block';
    sqlSelSec.classList.remove('collapsed');
}

function obfuscateSqlCode() {
    const originalCode = document.getElementById('sqlOriginalCode').value.trim();
    if (!originalCode) {
        showSqlStatus('Bitte füge zuerst deine SQL Queries ein!', 'error');
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('.sql-mapping-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showSqlStatus('Bitte wähle mindestens ein Element aus!', 'error');
        return;
    }

    // Checkboxen nach Typ trennen
    const strCheckboxes = Array.from(selectedCheckboxes).filter(cb => cb.dataset.type === 'String');
    const sqlCheckboxes = Array.from(selectedCheckboxes).filter(cb => cb.dataset.type !== 'String');

    // Schritt 1: Ausgewählte String-Replace-Einträge direkt aus den Checkboxen übernehmen
    const strEntries = strCheckboxes.map(cb => ({ from: cb.dataset.element, to: cb.dataset.obfuscated }));
    sqlStringReplaceMapping = new Map(strEntries.map(e => [e.from, e.to]));
    reverseSqlStringReplaceMapping = buildReverse(sqlStringReplaceMapping);
    let obfuscatedCode = Core.applyReplacements(originalCode, strEntries);

    // Schritt 2: Ausgewählte SQL-Elemente verschleiern
    const selection = sqlCheckboxes.map(cb => ({
        element: cb.dataset.element, type: cb.dataset.type
    }));
    const assigned = Core.assignSqlPlaceholders(selection, obfuscatedCode);
    sqlMapping = new Map(assigned.map(a => [a.element, a.placeholder]));
    reverseSqlMapping = buildReverse(sqlMapping);

    obfuscatedCode = Core.applyReplacements(
        obfuscatedCode,
        assigned.map(a => ({ from: a.element, to: a.placeholder }))
    );

    document.getElementById('sqlObfuscatedCode').value = obfuscatedCode;
    document.getElementById('sqlObfuscatedSection').style.display = 'block';
    document.getElementById('sqlAiResponseSection').style.display = 'block';
    document.getElementById('sqlMappingSelectionSection').classList.add('collapsed');
    document.getElementById('sqlFinalSection').style.display = 'none';
    document.getElementById('sqlFinalCode').value = '';

    updateSqlUsedMappingDisplay();
    const totalReplaced = sqlMapping.size + sqlStringReplaceMapping.size;
    document.getElementById('sqlUsedMappingSection').style.display = totalReplaced > 0 ? 'block' : 'none';
    showSqlStatus(`SQL Code erfolgreich verschleiert! ${totalReplaced} Elemente ersetzt (${sqlStringReplaceMapping.size} Strings, ${sqlMapping.size} SQL-Elemente).`);
    saveState();
}

function updateSqlUsedMappingDisplay() {
    const combined = new Map([...sqlStringReplaceMapping, ...sqlMapping]);
    renderMappingList('sqlUsedMappingDisplay', combined, 'Keine Mappings vorhanden');
}

function deobfuscateSqlCode() {
    const aiResponse = document.getElementById('sqlAiResponse').value.trim();
    if (!aiResponse) {
        showSqlStatus('Bitte füge zuerst die KI-Antwort ein!', 'error');
        return;
    }
    if (reverseSqlMapping.size === 0 && reverseSqlStringReplaceMapping.size === 0) {
        showSqlStatus('Kein Mapping verfügbar! Bitte verschleiere zuerst deinen SQL Code.', 'error');
        return;
    }

    // Schritt 1: SQL-Elemente zurück, Schritt 2: String-Replace zurück.
    let finalCode = Core.reverseReplacements(aiResponse, mapToReverse(reverseSqlMapping));
    finalCode = Core.reverseReplacements(finalCode, mapToReverse(reverseSqlStringReplaceMapping));

    document.getElementById('sqlFinalCode').value = finalCode;
    document.getElementById('sqlFinalSection').style.display = 'block';
    const totalRestored = reverseSqlMapping.size + reverseSqlStringReplaceMapping.size;
    showSqlStatus(`SQL Code erfolgreich zurückverwandelt! ${totalRestored} Elemente wiederhergestellt.`);
    saveState();
}


async function copySqlObfuscated() { await copyToClipboard('sqlObfuscatedCode', showSqlStatus, 'Verschleierter SQL Code'); }
async function copySqlFinal() { await copyToClipboard('sqlFinalCode', showSqlStatus, 'Finaler SQL Code'); }

function clearSqlAll() {
    if (!confirm('SQL-Daten löschen? Das Mapping geht verloren!')) return;
    ['sqlOriginalCode', 'sqlObfuscatedCode', 'sqlAiResponse', 'sqlFinalCode']
        .forEach(id => { document.getElementById(id).value = ''; });
    clearChips(sqlReplaceWords, 'sqlStringReplaceChips');
    const sqlInput = document.getElementById('sqlStringReplaceInput');
    if (sqlInput) sqlInput.value = '';

    sqlMapping = new Map();
    reverseSqlMapping = new Map();
    sqlStringReplaceMapping = new Map();
    reverseSqlStringReplaceMapping = new Map();

    ['sqlObfuscatedSection', 'sqlUsedMappingSection', 'sqlMappingSelectionSection',
        'sqlAiResponseSection', 'sqlFinalSection']
        .forEach(id => { document.getElementById(id).style.display = 'none'; });

    clearTabState('sql');
    showSqlStatus('SQL-Daten gelöscht!');
}

// ── Export / Import ─────────────────────────────────────────────────────────

function exportState() {
    saveState();
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) {
        notify('Keine Daten zum Exportieren vorhanden.', 'error');
        return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `obfuscator-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Prüft, ob ein Wert ein Array aus [string,string]-Paaren ist (Map-Einträge).
function isStringPairArray(value) {
    return Array.isArray(value) && value.every(pair =>
        Array.isArray(pair) && pair.length === 2 &&
        typeof pair[0] === 'string' && typeof pair[1] === 'string');
}

function isValidImportState(state) {
    if (!state || typeof state !== 'object') return false;
    if (typeof state.version !== 'number' || state.version > CURRENT_VERSION) return false;
    // Map-Felder müssen, falls vorhanden, das erwartete [string,string]-Format haben.
    const mapFields = [
        state.csharp && state.csharp.stringReplaceMapping,
        state.sql && state.sql.sqlMapping,
        state.sql && state.sql.sqlStringReplaceMapping
    ];
    return mapFields.every(f => f === undefined || isStringPairArray(f));
}

function importState(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const MAX_IMPORT_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_IMPORT_SIZE) {
        notify('Datei zu groß (max. 10 MB). Bitte eine gültige Backup-Datei wählen.', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        let state;
        try {
            state = JSON.parse(e.target.result);
        } catch (err) {
            notify('Fehler beim Lesen der Datei: ' + err.message, 'error');
            return;
        }
        if (!isValidImportState(state)) {
            notify('Ungültige oder inkompatible Backup-Datei.', 'error');
            return;
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
            notify('Import fehlgeschlagen: Datenmenge zu groß für den Browser-Speicher.', 'error');
            return;
        }
        loadState();
        notify('Daten erfolgreich importiert!');
    };
    reader.readAsText(file);
}

// ── Init: Zustand laden und Auto-Save Listener installieren ──────────────────
// Aktionen, die per data-action-Attribut (statt Inline-onclick → CSP-konform) ausgelöst werden.
const ACTIONS = {
    exportState, triggerImport: () => document.getElementById('importFileInput').click(),
    switchTab: el => switchTab(el.dataset.tab),
    analyzeCode, clearAll, obfuscateCode, copyObfuscated, deobfuscateCode, copyFinal,
    analyzeSqlCode, clearSqlAll, obfuscateSqlCode, copySqlObfuscated, deobfuscateSqlCode, copySqlFinal,
    addCsharpChip: () => {
        const input = document.getElementById('stringReplaceInput');
        const before = csharpReplaceWords.length;
        addChip(input.value, csharpReplaceWords, 'stringReplaceChips');
        if (csharpReplaceWords.length > before) input.value = '';
        input.focus();
    },
    addSqlChip: () => {
        const input = document.getElementById('sqlStringReplaceInput');
        const before = sqlReplaceWords.length;
        addChip(input.value, sqlReplaceWords, 'sqlStringReplaceChips');
        if (sqlReplaceWords.length > before) input.value = '';
        input.focus();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    loadState();

    // Zentrale Klick-Delegation für alle [data-action]-Elemente und collapsible Header.
    document.addEventListener('click', (ev) => {
        const h3 = ev.target.closest && ev.target.closest('h3.collapsible');
        if (h3 && !ev.target.closest('[data-action]')) {
            h3.closest('.section').classList.toggle('collapsed');
            return;
        }
        const el = ev.target.closest && ev.target.closest('[data-action]');
        if (!el) return;
        const fn = ACTIONS[el.dataset.action];
        if (fn) fn(el);
    });

    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', importState);

    const watchedInputs = [
        'originalCode', 'obfuscatedCode', 'aiResponse', 'finalCode',
        'sqlOriginalCode', 'sqlObfuscatedCode', 'sqlAiResponse', 'sqlFinalCode'
    ];
    watchedInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', scheduleSave);
    });

    const csharpChipInput = document.getElementById('stringReplaceInput');
    if (csharpChipInput) {
        csharpChipInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                const lenBefore = csharpReplaceWords.length;
                addChip(csharpChipInput.value, csharpReplaceWords, 'stringReplaceChips');
                if (csharpReplaceWords.length > lenBefore) csharpChipInput.value = '';
            }
        });
    }

    const sqlChipInput = document.getElementById('sqlStringReplaceInput');
    if (sqlChipInput) {
        sqlChipInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                const lenBefore = sqlReplaceWords.length;
                addChip(sqlChipInput.value, sqlReplaceWords, 'sqlStringReplaceChips');
                if (sqlReplaceWords.length > lenBefore) sqlChipInput.value = '';
            }
        });
    }

    document.addEventListener('change', (ev) => {
        if (ev.target && ev.target.matches &&
            (ev.target.matches('.csharp-mapping-checkbox') ||
                ev.target.matches('.sql-mapping-checkbox') ||
                ev.target.id === 'csharpSelectAll' ||
                ev.target.id === 'sqlSelectAll')) {
            scheduleSave();
        }
    });
});
