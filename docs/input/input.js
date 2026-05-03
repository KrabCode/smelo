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
const playerChips = document.getElementById('playerChips');
const playerSearch = document.getElementById('playerSearch');
const sumDisplay = document.getElementById('sumDisplay');

let knownPlayers = [];

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

// --- Fetch player names from the published CSV ---
function fetchPlayers() {
    return fetch(SHEET_CSV_URL)
        .then(r => r.text())
        .then(csv => {
            const headers = csv.split('\n')[0].split(',');
            // Skip col 0 (index) and col 1 (date), rest are player names
            knownPlayers = headers.slice(2).map(h => h.trim()).filter(Boolean);
            knownPlayers.sort((a, b) => a.localeCompare(b, 'cs'));
            populateChips();
        })
        .catch(() => {});
}

function populateChips() {
    playerChips.innerHTML = '';
    knownPlayers.forEach(name => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'player-chip';
        chip.textContent = name;
        chip.addEventListener('click', () => {
            addEntry(name);
            updateChipStates();
            playerSearch.value = '';
            filterChips();
        });
        playerChips.appendChild(chip);
    });
}

function filterChips() {
    const q = playerSearch.value.trim().toLowerCase();
    playerChips.querySelectorAll('.player-chip').forEach(chip => {
        chip.style.display = (!q || chip.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
}

playerSearch.addEventListener('input', filterChips);
playerSearch.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const chips = Array.from(playerChips.querySelectorAll('.player-chip'));
    const firstChip = chips.find(c => c.style.display !== 'none');
    if (!firstChip) return;
    const entry = createEntry(firstChip.textContent);
    updateChipStates();
    playerSearch.value = '';
    filterChips();
    entry.querySelector('.entry-invest').focus();
});

function updateChipStates() {
    const usedNames = new Set();
    entriesContainer.querySelectorAll('.entry-name').forEach(input => {
        const val = input.value.trim();
        if (val) usedNames.add(val);
    });
    playerChips.querySelectorAll('.player-chip').forEach(chip => {
        chip.classList.toggle('used', usedNames.has(chip.textContent));
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

// --- Entry rows ---
function createEntry(name, invest, withdraw) {
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML =
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
            '<button type="button" class="btn-remove" title="Odebrat">&times;</button>' +
        '</div>';

    div.querySelector('.btn-remove').addEventListener('click', () => {
        div.remove();
        updateChipStates();
        updateSum();
        saveDraft();
        if (entriesContainer.children.length === 0) addEntry();
    });
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
