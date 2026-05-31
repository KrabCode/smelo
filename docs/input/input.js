const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTAYSlBiWTAJ_th0XEzDk9fthNQBrF88_FdBry3l8l9IrcGuopvFoBzIY4Byb5yfTE0U-LyqGkmZxkX/pub?gid=0&single=true&output=csv';
const SETTINGS_KEY = 'smelo_input_settings';
const DRAFT_KEY = 'smelo_input_draft';
const DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxU2-HMmck8ljuCMSYXqtG4o7UC4tRApexvwWvvNoaVKlgUoae1FrAShNGO4ZGf5Ruv/exec';

const form = document.getElementById('inputForm');
const entriesContainer = document.getElementById('entriesContainer');
const addEntryBtn = document.getElementById('addEntryBtn');
const sessionDate = document.getElementById('sessionDate');
const statusEl = document.getElementById('status');
const webappUrlInput = document.getElementById('webappUrl');
const secretInput = document.getElementById('secret');
const playerSearch = document.getElementById('playerSearch');
const searchGhost = document.getElementById('searchGhost');
const searchDropdown = document.getElementById('searchDropdown');
const sumDisplay = document.getElementById('sumDisplay');
const playerListEl = document.getElementById('playerList');
const playerListCount = document.getElementById('playerListCount');

let knownPlayers = [];
let playerTotals = {};
let ghostMatch = null;
let matchList = [];
let matchIndex = 0;

// --- Settings persistence ---
function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (s) {
            if (s.url) webappUrlInput.value = s.url;
            if (s.secret) secretInput.value = s.secret;
        }
        if (!webappUrlInput.value) webappUrlInput.value = DEFAULT_WEBAPP_URL;
    } catch(e) {}
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            url: webappUrlInput.value.trim(),
            secret: secretInput.value
        }));
    } catch(e) {}
}

function updateSettingsWarning() {
    const warn = document.getElementById('settingsWarning');
    if (warn) warn.style.display = (!webappUrlInput.value.trim() || !secretInput.value.trim()) ? '' : 'none';
}

webappUrlInput.addEventListener('change', () => { saveSettings(); updateSettingsWarning(); });
webappUrlInput.addEventListener('input', updateSettingsWarning);
secretInput.addEventListener('change', () => { saveSettings(); updateSettingsWarning(); });
secretInput.addEventListener('input', updateSettingsWarning);

// --- Draft persistence ---
function saveDraft() {
    try {
        const entries = Array.from(entriesContainer.querySelectorAll('.entry')).map(row => ({
            name: row.querySelector('.entry-name').value,
            invest: row.querySelector('.entry-invest').value,
            withdraw: row.querySelector('.entry-withdraw').value
        }));
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: sessionDate.value, entries }));
    } catch(e) {}
}

function loadDraft() {
    try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
        if (!d) return false;
        if (d.date) sessionDate.value = d.date;
        if (d.entries && d.entries.length > 0) {
            entriesContainer.innerHTML = '';
            d.entries.forEach(({ name, invest, withdraw }) => createEntry(name, invest || '', withdraw || ''));
            return true;
        }
    } catch(e) {}
    return false;
}

function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch(e) {}
}

// --- Fetch player names and lifetime totals from the published CSV ---
function fetchPlayers() {
    return fetch(SHEET_CSV_URL)
        .then(r => r.text())
        .then(csv => {
            const lines = csv.split('\n');
            const headers = lines[0].split(',');
            // Build name→column map from raw headers (skip col 0 index, col 1 date)
            const colIndex = {};
            headers.slice(2).forEach((h, i) => {
                const name = h.trim();
                if (name) colIndex[name] = i + 2;
            });

            knownPlayers = Object.keys(colIndex).sort((a, b) => a.localeCompare(b, 'cs'));

            // Line 1 is the precomputed totals row
            const totalsRow = lines[1].split(',');
            playerTotals = {};
            knownPlayers.forEach(name => {
                const val = parseFloat(totalsRow[colIndex[name]]);
                playerTotals[name] = isNaN(val) ? 0 : val;
            });

            populatePlayerList();
        })
        .catch(() => {});
}


function populatePlayerList() {
    playerListEl.innerHTML = '';
    const sorted = [...knownPlayers];
    playerListCount.textContent = '(' + sorted.length + ')';
    sorted.forEach(name => {
        const total = playerTotals[name] || 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'player-list-item';
        btn.dataset.name = name;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        const totalSpan = document.createElement('span');
        totalSpan.className = 'player-list-total ' + (total > 0 ? 'pos' : total < 0 ? 'neg' : 'zero');
        totalSpan.textContent = total > 0 ? '+' + total : String(total);
        btn.appendChild(nameSpan);
        btn.appendChild(totalSpan);
        btn.addEventListener('click', () => { addEntry(name); updateChipStates(); });
        playerListEl.appendChild(btn);
    });
}

function getUsedNames() {
    const used = new Set();
    entriesContainer.querySelectorAll('.entry-name').forEach(input => {
        const val = input.value.trim();
        if (val) used.add(val);
    });
    return used;
}

function filterChips() {
    const ql = playerSearch.value.trim().toLowerCase();
    if (ql) {
        matchList = knownPlayers.filter(n => n.toLowerCase().includes(ql));
        // Names starting with the query come first (stable sort keeps alpha order within groups)
        matchList.sort((a, b) =>
            (b.toLowerCase().startsWith(ql) ? 1 : 0) - (a.toLowerCase().startsWith(ql) ? 1 : 0));
    } else {
        matchList = [];
    }
    matchIndex = 0;
    renderSuggestions();
}

function renderSuggestions() {
    renderGhost();
    renderDropdown();
}

function renderGhost() {
    const q = playerSearch.value;
    const ql = q.trim().toLowerCase();
    ghostMatch = matchList[matchIndex] || null;
    searchGhost.innerHTML = '';
    // Inline ghost only completes prefix matches
    if (!ghostMatch || !ghostMatch.toLowerCase().startsWith(ql)) return;
    searchGhost.appendChild(document.createTextNode(ghostMatch.slice(0, q.length)));
    const suffix = document.createElement('span');
    suffix.className = 'search-ghost-suffix';
    suffix.textContent = ghostMatch.slice(q.length);
    searchGhost.appendChild(suffix);
}

function renderDropdown() {
    if (!searchDropdown) return;
    if (!matchList.length) {
        searchDropdown.classList.remove('open');
        searchDropdown.innerHTML = '';
        return;
    }
    const used = getUsedNames();
    searchDropdown.innerHTML = matchList.map((name, i) => {
        const total = playerTotals[name] || 0;
        const cls = total > 0 ? 'pos' : total < 0 ? 'neg' : 'zero';
        const totalStr = total > 0 ? '+' + total : String(total);
        return '<li class="search-dropdown-item' + (i === matchIndex ? ' active' : '') +
            (used.has(name) ? ' used' : '') + '" data-index="' + i + '">' +
            '<span>' + name.replace(/</g, '&lt;') + '</span>' +
            '<span class="player-list-total ' + cls + '">' + totalStr + '</span></li>';
    }).join('');
    searchDropdown.classList.add('open');
    const active = searchDropdown.querySelector('.search-dropdown-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

function selectMatch(name) {
    if (!name) return;
    const entry = createEntry(name);
    updateChipStates();
    playerSearch.value = '';
    filterChips();
    entry.querySelector('.entry-invest').focus();
}

playerSearch.addEventListener('input', filterChips);
playerSearch.addEventListener('focus', () => { if (matchList.length) searchDropdown.classList.add('open'); });
playerSearch.addEventListener('blur', () => { setTimeout(() => searchDropdown.classList.remove('open'), 120); });
playerSearch.addEventListener('keydown', (e) => {
    // Leaf through matching suggestions with the arrow keys
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && matchList.length) {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        matchIndex = (matchIndex + dir + matchList.length) % matchList.length;
        renderSuggestions();
        return;
    }
    if (e.key === 'Escape') { searchDropdown.classList.remove('open'); return; }
    if (e.key !== 'Enter' && !(e.key === 'Tab' && ghostMatch)) return;
    e.preventDefault();
    const ql = playerSearch.value.trim().toLowerCase();
    const name = matchList[matchIndex] || (ql ? knownPlayers.find(n => n.toLowerCase().includes(ql)) : null);
    selectMatch(name);
});

searchDropdown.addEventListener('mousedown', (e) => {
    const li = e.target.closest('.search-dropdown-item');
    if (!li) return;
    e.preventDefault(); // keep input focused; prevent blur from closing before the click
    selectMatch(matchList[parseInt(li.dataset.index, 10)]);
});

function updateChipStates() {
    const usedNames = getUsedNames();
    playerListEl.querySelectorAll('.player-list-item').forEach(item => {
        item.classList.toggle('used', usedNames.has(item.dataset.name));
    });
}

// Sums a "x+y+z" expression; non-numeric parts are treated as 0.
function evalExpr(str) {
    if (!str || !str.trim()) return 0;
    return str.split('+').reduce((sum, part) => {
        const n = parseFloat(part.trim());
        return sum + (isNaN(n) ? 0 : n);
    }, 0);
}

function updateRowResult(div) {
    const investStr = div.querySelector('.entry-invest').value.trim();
    const withdrawStr = div.querySelector('.entry-withdraw').value.trim();
    const span = div.querySelector('.entry-result');
    span.textContent = investStr ? evalExpr(withdrawStr) - evalExpr(investStr) : '';
}

function updateSum() {
    let sum = 0;
    let count = 0;
    entriesContainer.querySelectorAll('.entry').forEach(div => {
        updateRowResult(div);
        const investStr = div.querySelector('.entry-invest').value.trim();
        const withdrawStr = div.querySelector('.entry-withdraw').value.trim();
        if (investStr || withdrawStr) {
            sum += evalExpr(withdrawStr) - evalExpr(investStr);
            count++;
        }
    });
    if (count === 0) {
        sumDisplay.textContent = '';
        sumDisplay.className = 'sum-display';
    } else {
        sumDisplay.textContent = 'Součet: ' + sum;
        sumDisplay.className = sum === 0 ? 'sum-display' : 'sum-display sum-nonzero';
    }
    document.getElementById('submitBtn').disabled = entriesContainer.children.length === 0;
}

// --- Drag-to-reorder rows ---
let dragRow = null;

function startRowDrag(e, row) {
    if (e.button) return; // ignore non-primary buttons
    dragRow = row;
    row.classList.add('dragging');
    e.preventDefault();
    // Listen on window: reordering re-inserts the row in the DOM, which would
    // drop pointer capture on the handle and kill handle-bound listeners.
    window.addEventListener('pointermove', onRowDragMove);
    window.addEventListener('pointerup', endRowDrag);
    window.addEventListener('pointercancel', endRowDrag);
}

function onRowDragMove(e) {
    if (!dragRow) return;
    e.preventDefault();
    const y = e.clientY;
    const others = Array.from(entriesContainer.querySelectorAll('.entry:not(.dragging)'));
    const next = others.find(row => {
        const rect = row.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
    });
    if (next) entriesContainer.insertBefore(dragRow, next);
    else entriesContainer.appendChild(dragRow);
}

function endRowDrag() {
    if (!dragRow) return;
    dragRow.classList.remove('dragging');
    dragRow = null;
    window.removeEventListener('pointermove', onRowDragMove);
    window.removeEventListener('pointerup', endRowDrag);
    window.removeEventListener('pointercancel', endRowDrag);
    updateSum();
    saveDraft();
}

// --- Entry rows ---
function createEntry(name, invest, withdraw) {
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML =
        '<div class="drag-handle" title="Přetáhnout pro změnu pořadí" aria-label="Přetáhnout">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
            '<circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/>' +
            '<circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>' +
            '<circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>' +
        '</div>' +
        '<div class="name-col">' +
            '<label>Hráč</label>' +
            '<input type="text" class="entry-name" placeholder="Jméno hráče" value="' + (name || '') + '">' +
        '</div>' +
        '<div class="invest-col">' +
            '<label>Vklad</label>' +
            '<input type="text" class="entry-invest" placeholder="0" value="' + (invest != null ? invest : '') + '">' +
        '</div>' +
        '<div class="withdraw-col">' +
            '<label>Výběr</label>' +
            '<input type="text" class="entry-withdraw" placeholder="0" value="' + (withdraw != null ? withdraw : '') + '">' +
        '</div>' +
        '<div class="result-col">' +
            '<label>Výsledek</label>' +
            '<span class="entry-result"></span>' +
        '</div>' +
        '<div class="remove-col">' +
            '<button type="button" class="btn-remove" title="Odebrat" tabindex="-1">&times;</button>' +
        '</div>';

    div.querySelector('.btn-remove').addEventListener('click', () => {
        div.remove();
        updateChipStates();
        updateSum();
        saveDraft();
        if (entriesContainer.children.length === 0) addEntry();
    });
    div.querySelector('.drag-handle').addEventListener('pointerdown', (e) => startRowDrag(e, div));
    div.querySelector('.entry-name').addEventListener('input', () => { updateChipStates(); saveDraft(); });

    const investInput = div.querySelector('.entry-invest');
    const withdrawInput = div.querySelector('.entry-withdraw');

    investInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            withdrawInput.focus();
        }
    });
    investInput.addEventListener('input', () => { updateRowResult(div); updateSum(); saveDraft(); });

    withdrawInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            playerSearch.focus();
        }
    });
    withdrawInput.addEventListener('input', () => { updateRowResult(div); updateSum(); saveDraft(); });

    updateRowResult(div);
    entriesContainer.appendChild(div);
    return div;
}

function addEntry(name, invest, withdraw) {
    const entry = createEntry(name, invest, withdraw);
    if (name) {
        entry.querySelector('.entry-invest').focus();
    } else {
        entry.querySelector('.entry-name').focus();
    }
}

// --- Form submission ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = sessionDate.value;
    if (!date) { setStatus('Vyplňte datum.', true); return; }

    const entries = [];
    entriesContainer.querySelectorAll('.entry').forEach(row => {
        const name = row.querySelector('.entry-name').value.trim();
        const investStr = row.querySelector('.entry-invest').value.trim();
        const withdrawStr = row.querySelector('.entry-withdraw').value.trim();
        if (name && (investStr || withdrawStr)) {
            entries.push({ name, amount: evalExpr(withdrawStr) - evalExpr(investStr) });
        }
    });

    if (entries.length === 0) {
        setStatus('Přidejte aspoň jednoho hráče s výsledkem.', true);
        return;
    }

    const url = webappUrlInput.value.trim();
    const secret = secretInput.value;

    if (!url) {
        setStatus('Vyplňte Apps Script URL v nastavení.', true);
        return;
    }

    const summary = entries.map(e => e.name + ': ' + e.amount).join('\n');
    if (!confirm('Odeslat záznam za ' + date + '?\n\n' + summary)) return;

    setStatus('Odesílám…');
    saveSettings();

    try {
        const payload = { secret, date, entries };
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch(e) {}

        if (res.ok && json && json.ok !== false) {
            setStatus('Záznam přidán.', false);
            clearDraft();
            entriesContainer.innerHTML = '';
            addEntry();
            updateChipStates();
            updateSum();
        } else {
            setStatus('Chyba: ' + (json && json.error ? json.error : text || res.statusText), true);
        }
    } catch(err) {
        setStatus('Chyba: ' + (err.message || err), true);
    }
});

function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = isError === true ? 'status-err' : isError === false ? 'status-ok' : '';
}

// --- Init ---
sessionDate.value = new Date().toISOString().slice(0, 10);
loadSettings();
updateSettingsWarning();
if (!loadDraft()) addEntry();
updateChipStates();
updateSum();
fetchPlayers();
playerSearch.focus();

sessionDate.addEventListener('change', saveDraft);
addEntryBtn.addEventListener('click', () => addEntry());

document.getElementById('refreshChartBtn').addEventListener('click', () => {
    try { localStorage.removeItem('smelo_graph_csv'); localStorage.removeItem('smelo_graph_csv_ts'); } catch(e) {}
    location.hash = 'vysledky';
    location.reload();
});
