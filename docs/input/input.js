const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTAYSlBiWTAJ_th0XEzDk9fthNQBrF88_FdBry3l8l9IrcGuopvFoBzIY4Byb5yfTE0U-LyqGkmZxkX/pub?gid=0&single=true&output=csv';
const SETTINGS_KEY = 'smelo_input_settings';
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

webappUrlInput.addEventListener('change', saveSettings);
secretInput.addEventListener('change', saveSettings);

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

function updateSum() {
    let sum = 0;
    let count = 0;
    entriesContainer.querySelectorAll('.entry-amount').forEach(input => {
        const v = Number(input.value);
        if (input.value !== '' && !isNaN(v)) { sum += v; count++; }
    });
    if (count === 0) {
        sumDisplay.textContent = '';
        sumDisplay.className = 'sum-display';
    } else {
        sumDisplay.textContent = 'Součet: ' + sum;
        sumDisplay.className = sum === 0 ? 'sum-display' : 'sum-display sum-nonzero';
    }
}

// --- Entry rows ---
function createEntry(name, amount) {
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML =
        '<div class="name-col">' +
            '<label>Hráč</label>' +
            '<input type="text" class="entry-name" placeholder="Jméno hráče" value="' + (name || '') + '">' +
        '</div>' +
        '<div class="amount-col">' +
            '<label>Výsledek</label>' +
            '<input type="number" class="entry-amount" step="1" placeholder="0" value="' + (amount != null ? amount : '') + '">' +
        '</div>' +
        '<div class="remove-col">' +
            '<button type="button" class="btn-remove" title="Odebrat">&times;</button>' +
        '</div>';
    div.querySelector('.btn-remove').addEventListener('click', () => {
        div.remove();
        updateChipStates();
        updateSum();
        if (entriesContainer.children.length === 0) addEntry();
    });
    div.querySelector('.entry-name').addEventListener('input', () => updateChipStates());
    div.querySelector('.entry-amount').addEventListener('input', () => updateSum());
    entriesContainer.appendChild(div);
    return div;
}

function addEntry(name, amount) {
    const entry = createEntry(name, amount);
    if (name) {
        entry.querySelector('.entry-amount').focus();
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
        const amountStr = row.querySelector('.entry-amount').value;
        if (name && amountStr !== '') {
            entries.push({ name, amount: Number(amountStr) });
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
fetchPlayers();

addEntryBtn.addEventListener('click', () => addEntry());

document.getElementById('refreshChartBtn').addEventListener('click', () => {
    try { localStorage.removeItem('smelo_graph_csv'); localStorage.removeItem('smelo_graph_csv_ts'); } catch(e) {}
    location.hash = 'vysledky';
    location.reload();
});
