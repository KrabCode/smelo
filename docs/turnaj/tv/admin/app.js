// ─── Password Gate ──────────────────────────────────────────
const ADMIN_HASH = '04114e775c39003d71c9825add2ee4cfd472c2980936def742daa2072353ecd3';

async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkGate() {
    if (sessionStorage.getItem('adminAuth') === '1') return;
    const input = prompt('Heslo:');
    if (input && await sha256(input) === ADMIN_HASH) {
        sessionStorage.setItem('adminAuth', '1');
    } else {
        document.body.innerHTML = '';
    }
}
await checkGate();

// ─── Firebase Init ──────────────────────────────────────────
firebase.initializeApp({
    apiKey: "AIzaSyAfQqQYYn8pId99FbqIqX72LH6kOlosunQ",
    authDomain: "smelo-turnaj.firebaseapp.com",
    databaseURL: "https://smelo-turnaj-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "smelo-turnaj"
});

const db = firebase.database();
const tournamentRef = db.ref('tournament');

// ─── Server Time Sync ────────────────────────────────────────
let serverTimeOffset = 0;
db.ref('.info/serverTimeOffset').on('value', (snap) => {
    serverTimeOffset = snap.val() || 0;
});
function serverNow() { return Date.now() + serverTimeOffset; }

// Connection status
db.ref('.info/connected').on('value', () => {});

// ─── Table Definitions ──────────────────────────────────────
const DEFAULT_TABLES = [
    { id: 1, name: 'Červený', color: '#c0392b', seats: 10 },
    { id: 2, name: 'Černý', color: '#2c3e50', seats: 6 },
    { id: 3, name: 'Zelený', color: '#27ae60', seats: 6 }
];
let TABLES = DEFAULT_TABLES.slice();

function getSeats(table) {
    return table.seats;
}
function getShape(table) {
    return table.seats === 10 ? 'oval' : 'rect';
}

// ─── Default data ───────────────────────────────────────────
const DEFAULTS = {
    config: {
        startingStack: 5000,
        levelDuration: 20,
        maxLevels: 12,
        bonusAmount: 5000,
        levelsPerBreak: 0,
        breakDuration: 30,
        maxBreaks: 0,
        startTime: '19:00',
        buyInAmount: 400,
        addonChips: 0,
        addonAmount: 0,
        anteMult: 0,
        date: ''
    },
    state: {
        status: 'waiting',
        startedAt: 0,
        pausedAt: 0,
        winners: {}
    },
    players: {
        list: [],
        totalChips: 0
    },
    blindStructure: [],
    blindOverrides: {},
    tableLocks: {},
    payoutConfig: null,
    breakMessages: {},
    breakLabels: {},
    rules: null,
    notes: [
        'Buy-in a re-buy neomezeně, ale jen do konce přestávky',
        'Nepřítomným hráčům se automaticky platí blindy a foldují karty',
        'Kouřit choďte po jednom, ať zbytek stolu může hrát'
    ]
};

const DEFAULT_RULES = [
    { title: 'Chování u stolu', items: ['Nezdržuj.', 'Nekřič, nenadávej.', 'Sleduj hru.', 'Hraj jen když jsi na řadě.', 'Neříkej cos měl, dokud se hraje.'] },
    { title: 'Sázky', items: ['Řekni nahlas co děláš za akci.', 'Řekni číslo — žádný string betting.', 'Nesplashuj pot.', 'Měj jasně oddělené sázky v tomto kole.', 'Poprosím blindy.'] },
    { title: 'Karty a žetony', items: ['Neházej karty do vzduchu.', 'Žádný slow roll — ukaž karty.', 'Chceš pot? Ukaž obě karty.', 'Ukázals jednomu — ukaž všem.', 'Žetony na stole, viditelně, ve sloupcích.', 'Nešahej na cizí žetony.'] },
    { title: 'Turnaj', items: ['Re-buy neomezeně do konce přestávky.', 'Nelze se vykešovat částečně.', 'Nepřítomným se platí blindy a foldují karty.', 'Kouřit choďte po jednom.'] }
];

let T = JSON.parse(JSON.stringify(DEFAULTS));
T.notes = DEFAULTS.notes.slice();

// ─── Blind Calculation ──────────────────────────────────────
function calculateBlinds(config, totalChips, freezeUpTo) {
    const { levelDuration } = config;
    const numLevels = Math.max(2, config.maxLevels || 12);
    const lpb = config.levelsPerBreak || 0;
    const breakDur = config.breakDuration || 30;
    const maxBreaks = config.maxBreaks || 0;

    const levels = [];

    if (freezeUpTo >= 0 && T.blindStructure && T.blindStructure.length > 0) {
        const frozen = Math.min(freezeUpTo + 1, T.blindStructure.length);
        for (let i = 0; i < frozen; i++) {
            levels.push({ ...T.blindStructure[i] });
        }
        const frozenBlindCount = levels.filter(l => !l.isBreak).length;
        const remaining = numLevels - frozenBlindCount;

        if (remaining > 0) {
            const lastBlind = [...levels].reverse().find(l => !l.isBreak);
            let sb = lastBlind ? lastBlind.big : 5;
            for (let i = 0; i < remaining; i++) {
                levels.push({ small: sb, big: sb * 2, duration: levelDuration });
                sb = sb * 2;
            }
        }
    } else {
        let sb = 5;
        for (let i = 0; i < numLevels; i++) {
            levels.push({ small: sb, big: sb * 2, duration: levelDuration });
            sb = sb * 2;
        }
    }

    if (lpb > 0) {
        let blindCount = 0;
        let breakCount = 0;
        for (let i = 0; i < levels.length; i++) {
            if (levels[i].isBreak) { breakCount++; continue; }
            blindCount++;
            if (blindCount % lpb === 0) {
                if (maxBreaks > 0 && breakCount >= maxBreaks) break;
                const remainingBlinds = levels.slice(i + 1).some(l => !l.isBreak);
                if (!remainingBlinds) break;
                if (i + 1 < levels.length && levels[i + 1].isBreak) continue;
                levels.splice(i + 1, 0, {
                    small: 0, big: 0,
                    duration: breakDur,
                    isBreak: true
                });
                breakCount++;
                i++;
            }
        }
    }

    return levels;
}

function applyOverrides(structure, overrides) {
    let blindNum = 0;
    structure.forEach(entry => {
        if (entry.isBreak) return;
        blindNum++;
        const ov = overrides[blindNum];
        if (ov) { entry.small = ov.small; entry.big = ov.big; }
    });
}

function derivePlayerStats(list) {
    const buyIns = list.length;
    const rebuys = list.reduce((s, p) => s + Math.max(0, p.buys - 1), 0);
    const addons = list.filter(p => p.addon).length;
    const bonuses = list.filter(p => p.bonus).length;
    const activePlayers = list.filter(p => p.active).length;
    const totalBuys = list.reduce((s, p) => s + p.buys, 0);
    return { buyIns, rebuys, addons, bonuses, activePlayers, totalBuys };
}

function recalcTotalChips() {
    const list = T.players.list || [];
    const c = T.config;
    const stats = derivePlayerStats(list);
    return stats.totalBuys * c.startingStack + stats.bonuses * c.bonusAmount + stats.addons * (c.addonChips || 0);
}

function getCurrentLevel(startedAt, blindStructure, now) {
    const struct = blindStructure || [];
    if (!struct.length) return { levelIndex: 0, remaining: 0 };
    const elapsed = (now || serverNow()) - startedAt;
    let cumulative = 0;
    for (let i = 0; i < struct.length; i++) {
        const levelMs = struct[i].duration * 60000;
        if (elapsed < cumulative + levelMs) {
            return { levelIndex: i, remaining: cumulative + levelMs - elapsed };
        }
        cumulative += levelMs;
    }
    return { levelIndex: struct.length - 1, remaining: 0 };
}

function assignSeat(player, list) {
    const occupied = new Set();
    const tableCount = {};
    list.forEach(p => {
        if (p.table && p.seat) {
            occupied.add(p.table + '-' + p.seat);
            tableCount[p.table] = (tableCount[p.table] || 0) + 1;
        }
    });
    const locks = T.tableLocks || {};
    const freeByTable = {};
    TABLES.forEach(t => {
        const tl = locks[t.id] || {};
        if (tl.locked) return;
        const lockedSeats = tl.lockedSeats || [];
        freeByTable[t.id] = [];
        for (let s = 1; s <= getSeats(t); s++) {
            if (lockedSeats.includes(s)) continue;
            if (!occupied.has(t.id + '-' + s)) freeByTable[t.id].push(s);
        }
        if (freeByTable[t.id].length === 0) delete freeByTable[t.id];
    });
    const tableIds = Object.keys(freeByTable).map(Number);
    if (tableIds.length === 0) return;
    const minCount = Math.min(...tableIds.map(id => tableCount[id] || 0));
    const candidates = tableIds.filter(id => (tableCount[id] || 0) === minCount);
    const tableId = candidates[Math.floor(Math.random() * candidates.length)];
    const seats = freeByTable[tableId];
    const seat = seats[Math.floor(Math.random() * seats.length)];
    player.table = tableId;
    player.seat = seat;
}

// ─── Payout Calculation ──────────────────────────────────────
const PAYOUT_STRUCTURES = { 1: [100], 2: [65, 35], 3: [50, 30, 20] };

function getAutoPayoutDistribution(paidPlaces) {
    if (paidPlaces <= 0) return [];
    if (PAYOUT_STRUCTURES[paidPlaces]) return PAYOUT_STRUCTURES[paidPlaces].slice();
    const remaining = 17;
    const extraPlaces = paidPlaces - 3;
    const perExtra = Math.round(remaining / extraPlaces * 10) / 10;
    const dist = [40, 25, 18];
    for (let i = 0; i < extraPlaces; i++) dist.push(perExtra);
    return dist;
}

function getPayoutDistribution(paidPlaces) {
    if (T.payoutConfig && T.payoutConfig.length > 0) return T.payoutConfig;
    return getAutoPayoutDistribution(paidPlaces);
}

function getPaidPlaces() {
    if (T.payoutConfig && T.payoutConfig.length > 0) return T.payoutConfig.length;
    const list = T.players.list || [];
    return Math.max(1, Math.floor(list.length * 0.25));
}

function roundPayouts(dist, prizePool) {
    if (!dist.length || prizePool <= 0) return dist.map(() => 0);
    const unit = prizePool >= 1000 ? 100 : 50;
    const amounts = dist.map(pct => Math.round(prizePool * pct / 100 / unit) * unit);
    const diff = prizePool - amounts.reduce((s, v) => s + v, 0);
    amounts[0] += diff;
    return amounts;
}

function recalcAndSync() {
    const totalChips = recalcTotalChips();
    let freezeUpTo = -1;
    if (T.state.status === 'running' && T.state.startedAt) {
        freezeUpTo = getCurrentLevel(T.state.startedAt, T.blindStructure).levelIndex;
    }
    const structure = calculateBlinds(T.config, totalChips, freezeUpTo);
    applyOverrides(structure, T.blindOverrides);
    tournamentRef.update({
        'players/totalChips': totalChips,
        'blindStructure': structure
    });
}

function savePlayerList() {
    const list = T.players.list || [];
    const totalChips = recalcTotalChips();
    let freezeUpTo = -1;
    if (T.state.status === 'running' && T.state.startedAt) {
        freezeUpTo = getCurrentLevel(T.state.startedAt, T.blindStructure).levelIndex;
    }
    const structure = calculateBlinds(T.config, totalChips, freezeUpTo);
    applyOverrides(structure, T.blindOverrides);
    tournamentRef.update({
        'players/list': list,
        'players/totalChips': totalChips,
        'blindStructure': structure
    });
}

// ─── Helpers ────────────────────────────────────────────────
function formatTime(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function showSaveStatus(el, promise) {
    if (!el) return;
    el.textContent = 'Ukládám...';
    el.className = 'save-status saving';
    promise.then(() => {
        el.textContent = 'Uloženo ✓';
        el.className = 'save-status saved';
        setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 2000);
    }).catch(() => {
        el.textContent = 'Chyba ✗';
        el.className = 'save-status error';
    });
}

// ─── Event Log ──────────────────────────────────────────────
function logEvent(type, name, detail) {
    const entry = { type: type, name: name, time: serverNow() };
    if (detail) entry.detail = detail;
    const log = T.eventLog || [];
    log.push(entry);
    T.eventLog = log;
    tournamentRef.child('eventLog').set(log);
    renderEventLog();
}

function renderEventLog() {
    const container = document.getElementById('event-log-list');
    if (!container) return;
    const log = T.eventLog || [];
    if (!log.length) {
        container.innerHTML = '<div style="opacity:0.4;text-align:center">Žádné události</div>';
        return;
    }
    const labels = {
        buyin: 'Buy-in',
        rebuy: 'Re-buy',
        addon: 'Add-on',
        knockout: 'Vyřazen',
        reentry: 'Návrat'
    };
    const colors = {
        buyin: 'var(--green)',
        rebuy: 'var(--accent)',
        addon: 'var(--accent)',
        knockout: 'var(--red)',
        reentry: 'var(--green)'
    };
    // Newest first
    let html = '';
    for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        const d = new Date(e.time);
        const ts = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        const label = labels[e.type] || e.type;
        const color = colors[e.type] || 'var(--text-muted)';
        html += '<div class="event-log-entry">' +
            '<span class="event-log-time">' + ts + '</span>' +
            '<span class="event-log-type" style="color:' + color + '">' + label + '</span>' +
            '<span class="event-log-name">' + (e.name || '') + '</span>' +
            (e.detail ? '<span class="event-log-detail">' + e.detail + '</span>' : '') +
            '</div>';
    }
    container.innerHTML = html;
}

// ─── Rendering ──────────────────────────────────────────────
function render() {
    const { config, state, players, blindStructure } = T;
    const list = players.list || [];
    const stats = derivePlayerStats(list);
    const struct = blindStructure || [];
    const paidPlaces = getPaidPlaces();

    const unseated = list.filter(p => p.active && !p.table).length;
    document.getElementById('player-count').textContent = stats.activePlayers + '/' + stats.buyIns +
        (unseated > 0 ? ' \u00B7 ' + unseated + ' bez m\u00EDsta' : '');

    // Timer section
    const isPaused = state.status === 'running' && state.pausedAt > 0;
    const timerNow = isPaused ? state.pausedAt : undefined;
    const derived = (state.status === 'running' && state.startedAt)
        ? getCurrentLevel(state.startedAt, struct, timerNow)
        : { levelIndex: 0, remaining: 0 };
    const lvl = derived.levelIndex;
    const curEntry = struct[lvl];
    const onBreak = curEntry && curEntry.isBreak;

    const timerLevelEl = document.getElementById('timer-level');
    if (isPaused) {
        const pauseDur = serverNow() - state.pausedAt;
        const pauseMin = Math.floor(pauseDur / 60000);
        const pauseSec = Math.floor((pauseDur % 60000) / 1000);
        timerLevelEl.textContent = 'PAUZA — ' + pauseMin + ':' + String(pauseSec).padStart(2, '0');
        timerLevelEl.style.color = 'var(--accent)';
    } else if (state.status === 'running' && curEntry) {
        if (onBreak) {
            timerLevelEl.textContent = 'PŘESTÁVKA';
            timerLevelEl.style.color = 'var(--green)';
        } else {
            let blindNum = 0;
            for (let i = 0; i <= lvl; i++) { if (!struct[i].isBreak) blindNum++; }
            timerLevelEl.textContent = 'Level ' + blindNum + ' — ' +
                curEntry.small.toLocaleString('cs') + ' / ' + curEntry.big.toLocaleString('cs');
            timerLevelEl.style.color = '';
        }
    } else if (state.status === 'finished') {
        timerLevelEl.textContent = 'Turnaj ukončen';
        timerLevelEl.style.color = 'var(--green)';
    } else {
        const statusLabel = { waiting: 'Čeká se', running: 'Běží', finished: 'Ukončen' };
        timerLevelEl.textContent = statusLabel[state.status] || '';
        timerLevelEl.style.color = '';
    }

    // Start time row
    const startTimeRow = document.getElementById('start-time-row');
    const startTimeInput = document.getElementById('cfg-start-time');
    if (state.status === 'running' && state.startedAt) {
        startTimeRow.style.display = '';
        if (document.activeElement !== startTimeInput) {
            const d = new Date(state.startedAt);
            startTimeInput.value =
                String(d.getHours()).padStart(2, '0') + ':' +
                String(d.getMinutes()).padStart(2, '0');
        }
    } else {
        startTimeRow.style.display = 'none';
    }

    // Start/Pause/Reset button labels
    document.getElementById('btn-start').textContent =
        state.status === 'running' ? 'Běží...' : 'Start';
    document.getElementById('btn-start').disabled = state.status === 'running';
    const btnPause = document.getElementById('btn-pause');
    if (state.status === 'running') {
        btnPause.style.display = '';
        btnPause.textContent = isPaused ? 'Pokračovat' : 'Pauza';
        btnPause.className = isPaused ? 'btn accent big' : 'btn big';
    } else {
        btnPause.style.display = 'none';
    }

    // Populate config inputs
    const ids = {
        'cfg-stack': config.startingStack,
        'cfg-level-dur': config.levelDuration,
        'cfg-max-levels': config.maxLevels,
        'cfg-bonus': config.bonusAmount,
        'cfg-levels-per-break': config.levelsPerBreak,
        'cfg-break-dur': config.breakDuration,
        'cfg-max-breaks': config.maxBreaks,
        'cfg-buyin-amount': config.buyInAmount,
        'cfg-addon-chips': config.addonChips,
        'cfg-addon-amount': config.addonAmount,
        'cfg-start-time-est': config.startTime,
        'cfg-ante-mult': config.anteMult
    };
    for (const [id, val] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = val;
    }
    // Player list
    renderPlayerList();
    const sumEl = document.getElementById('player-summary');
    if (sumEl) sumEl.textContent = '';

    // Payout
    const buyInAmount = config.buyInAmount || 400;
    const addonPrice = config.addonAmount || 0;
    const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
    document.getElementById('pool-display').textContent =
        'Prize pool: ' + prizePool.toLocaleString('cs') + ' Kč (' + paidPlaces + ' míst)';

    const payoutActive = document.activeElement &&
        (document.activeElement.classList.contains('payout-config-slider') ||
         document.activeElement.classList.contains('payout-config-pct'));
    if (!payoutActive) renderPayoutConfig();

    // Winners
    renderWinners();

    // Notes
    const noteInputs = document.querySelectorAll('#notes-list input[type="text"]');
    const noteHasFocus = Array.from(noteInputs).some(el => el === document.activeElement);
    if (!noteHasFocus) renderNoteInputs();

    // Break messages
    renderBreakMessages();

    // Rules
    const rulesInputs = document.querySelectorAll('#rules-sections-list textarea');
    const rulesHasFocus = Array.from(rulesInputs).some(el => el === document.activeElement);
    if (!rulesHasFocus) renderRulesInputs();

    // Table locks
    renderTableLocks();

    // Blind structure table
    renderBlindStructure();

    // Event log
    renderEventLog();
}

// ─── Player List ────────────────────────────────────────────
function renderPlayerList() {
    const container = document.getElementById('players-list');
    if (!container) return;
    const list = T.players.list || [];
    if (!list.length) { container.innerHTML = ''; return; }

    const c = T.config;
    const locks = T.tableLocks || {};
    const occupied = new Set();
    list.forEach(p => { if (p.table && p.seat) occupied.add(p.table + '-' + p.seat); });

    // Sort by table, then seat
    const sorted = list.map((_, i) => i).sort((a, b) => {
        const pa = list[a], pb = list[b];
        const ta = pa.table || 999, tb = pb.table || 999;
        if (ta !== tb) return ta - tb;
        return (pa.seat || 999) - (pb.seat || 999);
    });

    const buyLabel = 'Buys <span class="th-hint">(' + (c.buyInAmount || 400).toLocaleString('cs') + ' Kč \u2192 ' + (c.startingStack || 5000).toLocaleString('cs') + ')</span>';
    const addonLabel = 'Add-on' + (c.addonChips ? ' <span class="th-hint">(' + (c.addonAmount || 0).toLocaleString('cs') + ' Kč \u2192 ' + c.addonChips.toLocaleString('cs') + ')</span>' : '');
    const bonusLabel = 'Bonus' + (c.bonusAmount ? ' <span class="th-hint">(' + c.bonusAmount.toLocaleString('cs') + ')</span>' : '');

    let html = '<div class="player-table-wrap"><table class="player-table"><thead><tr>' +
        '<th>Hráč</th><th>Stůl</th><th>' + buyLabel + '</th><th>' + addonLabel + '</th><th>' + bonusLabel + '</th><th>Aktivní</th><th></th>' +
        '</tr></thead><tbody>';

    sorted.forEach(i => {
        const p = list[i];
        const nameClass = 'player-name' + (p.active ? '' : ' inactive');
        const curVal = p.table && p.seat ? p.table + '-' + p.seat : '';

        let seatSelect = '<select class="player-seat-select" data-idx="' + i + '">';
        seatSelect += '<option value=""' + (!curVal ? ' selected' : '') + '>\u2014</option>';
        seatSelect += '<option value="random">Náhodné</option>';
        TABLES.forEach(t => {
            const tl = locks[t.id] || {};
            if (tl.locked) return;
            const lockedSeats = tl.lockedSeats || [];
            for (let s = 1; s <= getSeats(t); s++) {
                if (lockedSeats.includes(s)) continue;
                const val = t.id + '-' + s;
                if (occupied.has(val) && val !== curVal) continue;
                seatSelect += '<option value="' + val + '"' + (val === curVal ? ' selected' : '') +
                    ' style="color:' + t.color + '">' + t.name + ' ' + s + '</option>';
            }
        });
        seatSelect += '</select>';

        html += '<tr>' +
            '<td class="' + nameClass + '">' + (p.name || '?') + '</td>' +
            '<td>' + seatSelect + '</td>' +
            '<td><button class="player-buys-btn" data-idx="' + i + '" data-dir="-">&minus;</button>' +
            '<span class="player-buys-count">' + p.buys + '</span>' +
            '<button class="player-buys-btn" data-idx="' + i + '" data-dir="+">+</button></td>' +
            '<td><button class="player-toggle' + (p.addon ? ' on' : '') + '" data-idx="' + i + '" data-field="addon"></button></td>' +
            '<td><button class="player-toggle' + (p.bonus ? ' on' : '') + '" data-idx="' + i + '" data-field="bonus"></button></td>' +
            '<td><button class="player-toggle active-toggle' + (p.active ? ' on' : '') + '" data-idx="' + i + '" data-field="active"></button></td>' +
            '<td><button class="player-remove" data-idx="' + i + '" title="Odebrat">&times;</button></td>' +
            '</tr>';
    });
    html += '</tbody></table></div>';
    const wrap = container.querySelector('.player-table-wrap');
    const scrollLeft = wrap ? wrap.scrollLeft : 0;
    container.innerHTML = html;
    const newWrap = container.querySelector('.player-table-wrap');
    if (newWrap) newWrap.scrollLeft = scrollLeft;
}

// ─── Payout Config ──────────────────────────────────────────
function getPayoutConfigValues() {
    if (T.payoutConfig && T.payoutConfig.length > 0) return T.payoutConfig.slice();
    const list = T.players.list || [];
    const paidPlaces = Math.max(1, Math.floor(list.length * 0.25));
    return getAutoPayoutDistribution(paidPlaces);
}

function renderPayoutConfig() {
    const container = document.getElementById('payout-config-rows');
    if (!container) return;
    const values = getPayoutConfigValues();
    const buyInAmount = T.config.buyInAmount || 400;
    const addonPrice = T.config.addonAmount || 0;
    const stats = derivePlayerStats(T.players.list || []);
    const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
    const cfgAmounts = roundPayouts(values, prizePool);

    container.innerHTML = values.map((pct, i) =>
        '<div class="payout-config-row">' +
        '<span class="payout-config-place">' + (i + 1) + '.</span>' +
        '<input type="range" class="payout-config-slider" data-place="' + i + '" min="0" max="100" step="1" value="' + pct + '">' +
        '<input type="number" class="payout-config-pct" data-place="' + i + '" min="0" max="100" value="' + pct + '" inputmode="numeric">' +
        '<span class="payout-config-amount">' + cfgAmounts[i].toLocaleString('cs') + ' Kč</span>' +
        '</div>'
    ).join('');

    const total = values.reduce((s, v) => s + v, 0);
    const totalEl = document.getElementById('payout-config-total');
    totalEl.textContent = 'Celkem: ' + Math.round(total) + '%';
    totalEl.style.color = Math.abs(total - 100) < 0.5 ? 'var(--green)' : 'var(--red)';
}

function applyPayoutChange(place, newVal) {
    const values = getPayoutConfigValues();
    values[place] = Math.max(0, Math.min(100, newVal));
    const total = values.reduce((s, v) => s + v, 0);
    if (total > 100) {
        let overflow = total - 100;
        for (let i = values.length - 1; i > place && overflow > 0; i--) {
            const take = Math.min(values[i], overflow);
            values[i] -= take;
            overflow -= take;
        }
        for (let i = place - 1; i >= 0 && overflow > 0; i--) {
            const take = Math.min(values[i], overflow);
            values[i] -= take;
            overflow -= take;
        }
    }

    // Update in-place
    const buyInAmount = T.config.buyInAmount || 400;
    const addonPrice = T.config.addonAmount || 0;
    const stats = derivePlayerStats(T.players.list || []);
    const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
    document.querySelectorAll('.payout-config-slider').forEach(sl => {
        sl.value = values[parseInt(sl.dataset.place)];
    });
    document.querySelectorAll('.payout-config-pct').forEach(el => {
        const i = parseInt(el.dataset.place);
        if (document.activeElement !== el) el.value = values[i];
    });
    const dragAmounts = roundPayouts(values, prizePool);
    document.querySelectorAll('.payout-config-amount').forEach((el, i) => {
        el.textContent = dragAmounts[i].toLocaleString('cs') + ' Kč';
    });
    const newTotal = values.reduce((s, v) => s + v, 0);
    const totalEl = document.getElementById('payout-config-total');
    totalEl.textContent = 'Celkem: ' + Math.round(newTotal) + '%';
    totalEl.style.color = Math.abs(newTotal - 100) < 0.5 ? 'var(--green)' : 'var(--red)';

    T.payoutConfig = values;
    tournamentRef.child('payoutConfig').set(values);
}

// ─── Winners ────────────────────────────────────────────────
function renderWinners() {
    const wf = document.getElementById('winners-fields');
    const winners = T.state.winners || {};
    const paidPlaces = getPaidPlaces();
    const currentFields = wf.querySelectorAll('input');
    const hasFocus = Array.from(currentFields).some(el => el === document.activeElement);

    // Build knockout lookup: place → knockout entry
    // Most recent knockout = 1st place (winner gets knocked out last to trigger their notification/sound)
    const log = T.eventLog || [];
    const knockouts = log.filter(e => e.type === 'knockout').reverse();
    const koByPlace = {};
    knockouts.slice(0, paidPlaces).forEach((e, i) => { koByPlace[i + 1] = e; });

    if (!hasFocus || currentFields.length !== paidPlaces) {
        let html = '';
        for (let i = 1; i <= paidPlaces; i++) {
            const val = winners[i] || '';
            const ko = koByPlace[i];
            let koHtml = '';
            if (ko) {
                const d = new Date(ko.time);
                const ts = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
                const name = ko.name || '';
                koHtml = '<button class="knockout-mini-fill" data-place="' + i + '" data-name="' + name.replace(/"/g, '&quot;') + '">' +
                    name + ' <span class="knockout-mini-time">' + ts + '</span></button>';
            }
            html += '<div class="winner-field">' +
                '<label>' + i + '. místo</label>' +
                '<div class="winner-row">' +
                '<input type="text" id="cfg-winner-' + i + '" placeholder="Jméno hráče..." value="' +
                val.replace(/"/g, '&quot;') + '">' +
                koHtml +
                '</div>' +
                '</div>';
        }
        wf.innerHTML = html;
    }
}

// ─── Notes ──────────────────────────────────────────────────
function renderNoteInputs() {
    const list = document.getElementById('notes-list');
    const notes = T.notes || [];
    list.innerHTML = notes.map((note, i) =>
        '<div class="note-row" data-note-idx="' + i + '">' +
        '<span class="note-drag-handle">\u2630</span>' +
        '<input type="text" data-note-idx="' + i + '" value="' + note.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '">' +
        '<button class="note-remove" data-note-idx="' + i + '">&times;</button>' +
        '</div>'
    ).join('');
}

function saveNotes() {
    const inputs = document.querySelectorAll('#notes-list input[type="text"]');
    const notes = Array.from(inputs).map(el => el.value.trim()).filter(Boolean);
    const p = tournamentRef.child('notes').set(notes);
    showSaveStatus(document.getElementById('notes-save-status'), p);
}

// ─── Rules ──────────────────────────────────────────────────
function getRules() {
    const r = T.rules;
    if (Array.isArray(r) && r.length) return JSON.parse(JSON.stringify(r));
    return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

function renderRulesInputs() {
    const container = document.getElementById('rules-sections-list');
    if (!container) return;
    const sections = getRules();
    container.innerHTML = '<div class="hint" style="margin-bottom:10px;text-align:left">Text za <b>|</b> se zobraz\u00ed jako \u0161t\u00edtek</div>' +
    sections.map((sec, si) => {
        const items = sec.items || [];
        return '<div class="rules-admin-section" data-section-idx="' + si + '">' +
            '<div class="rules-admin-header">' +
            '<input type="text" class="rules-title-input" data-section-idx="' + si + '" value="' + (sec.title || '').replace(/"/g, '&quot;') + '" placeholder="Název sekce...">' +
            '<button class="note-remove section-remove" data-section-idx="' + si + '" title="Smazat sekci">&times;</button>' +
            '</div>' +
            '<div class="rules-admin-items" data-section-idx="' + si + '">' +
            items.map((r, i) => {
                return '<div class="note-row" data-rule-idx="' + i + '">' +
                '<span class="note-drag-handle">\u2630</span>' +
                '<textarea data-rule-idx="' + i + '">' + r.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>' +
                '<button class="note-remove rule-remove" data-rule-idx="' + i + '">&times;</button>' +
                '</div>';
            }
            ).join('') +
            '</div>' +
            '<button class="btn rule-add" data-section-idx="' + si + '" style="margin-top:4px">+ Pravidlo</button>' +
            '</div>';
    }).join('') +
    '<button class="btn" id="btn-add-rule-section" style="margin-top:8px">+ Sekce</button>';
    // Autofit all rule textareas
    container.querySelectorAll('textarea').forEach(autofitTextarea);
}

function autofitTextarea(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}

document.getElementById('rules-sections-list').addEventListener('input', (e) => {
    if (e.target.tagName === 'TEXTAREA') autofitTextarea(e.target);
});

function collectRules() {
    const sections = [];
    document.querySelectorAll('.rules-admin-section').forEach(el => {
        const titleInput = el.querySelector('.rules-title-input');
        const title = titleInput ? titleInput.value.trim() : '';
        const items = Array.from(el.querySelectorAll('.rules-admin-items textarea'))
            .map(ta => ta.value.trim()).filter(Boolean);
        sections.push({ title: title, items: items });
    });
    return sections;
}

function saveRules() {
    const rules = collectRules();
    T.rules = rules;
    const p = tournamentRef.child('rules').set(rules);
    showSaveStatus(document.getElementById('rules-save-status'), p);
}

// ─── Table Locks ────────────────────────────────────────────
function renderTableLocks() {
    const container = document.getElementById('table-locks-ui');
    if (!container) return;
    const locks = T.tableLocks || {};
    const list = T.players.list || [];
    const occupied = new Set();
    list.forEach(p => { if (p.table && p.seat) occupied.add(p.table + '-' + p.seat); });

    // Seating status bar
    const statusEl = document.getElementById('seating-status');
    if (statusEl) {
        let statusHtml = '<div class="seating-status-bar">';
        const playerCounts = [];
        TABLES.forEach(t => {
            const tl = locks[t.id] || {};
            if (tl.locked) {
                statusHtml += '<span class="seating-status-item closed"><span class="seating-dot" style="background:' + t.color + '"></span></span>';
            } else {
                const lockedS = tl.lockedSeats || [];
                let seated = 0, total = 0;
                for (let s = 1; s <= getSeats(t); s++) {
                    if (lockedS.includes(s)) continue;
                    total++;
                    if (occupied.has(t.id + '-' + s)) seated++;
                }
                playerCounts.push(seated);
                const cls = seated === total ? ' full' : '';
                statusHtml += '<span class="seating-status-item' + cls + '"><span class="seating-dot" style="background:' + t.color + '"></span> ' + seated + '/' + total + '</span>';
            }
        });
        if (playerCounts.length >= 2) {
            const maxP = Math.max(...playerCounts);
            const minP = Math.min(...playerCounts);
            if (maxP - minP >= 2) {
                statusHtml += '<span class="seating-rebalance-warn">Rebalance?</span>';
            }
        }
        statusHtml += '</div>';
        statusEl.innerHTML = statusHtml;
    }

    let html = '';
    TABLES.forEach(t => {
        const tl = locks[t.id] || {};
        const isLocked = !!tl.locked;
        const lockedSeats = tl.lockedSeats || [];
        let freeCount = 0;
        if (!isLocked) {
            for (let s = 1; s <= getSeats(t); s++) {
                if (!lockedSeats.includes(s) && !occupied.has(t.id + '-' + s)) freeCount++;
            }
        }

        html += '<div class="table-lock-card">' +
            '<div class="table-lock-header">' +
            '<span class="table-lock-name" style="color:' + t.color + '">' + t.name + '</span>' +
            (!isLocked ? '<span class="table-lock-free">(' + freeCount + ' volných)</span>' : '') +
            '<button class="btn table-lock-toggle' + (isLocked ? ' danger' : '') +
            '" data-table="' + t.id + '" style="margin-left:auto;min-width:auto;padding:8px 16px">' +
            (isLocked ? 'Zamčený' : 'Otevřený') + '</button>' +
            '<button class="btn table-rotate" data-table="' + t.id + '" style="min-width:auto;padding:8px 16px" title="Otočit o 90°">\u21BB</button>' +
            '</div>';

        if (!isLocked) {
            html += '<div class="seat-grid">';
            for (let s = 1; s <= getSeats(t); s++) {
                const seatLocked = lockedSeats.includes(s);
                const seatOccupied = occupied.has(t.id + '-' + s);
                const cls = seatLocked ? ' locked' : (seatOccupied ? ' occupied' : '');
                html += '<button class="seat-btn seat-lock-toggle' + cls +
                    '" data-table="' + t.id + '" data-seat="' + s + '">' +
                    s + (seatLocked ? ' \u2717' : '') + '</button>';
            }
            html += '</div>';
            const walls = tl.walls || [];
            html += '<div class="wall-toggle-row">' +
                '<span class="wall-toggle-label">Zdi:</span>';
            [{side:'top',icon:'\u25B2'},{side:'bottom',icon:'\u25BC'},{side:'left',icon:'\u25C4'},{side:'right',icon:'\u25BA'}].forEach(w => {
                html += '<button class="wall-toggle-btn' + (walls.includes(w.side) ? ' active' : '') +
                    '" data-table="' + t.id + '" data-wall="' + w.side + '">' + w.icon + '</button>';
            });
            html += '</div>';
        }
        html += '</div>';
    });
    container.innerHTML = html;
}

// ─── Tables Config ──────────────────────────────────────────
function renderTablesConfig() {
    const container = document.getElementById('tables-config-list');
    if (!container) return;
    let html = '';
    TABLES.forEach((t, i) => {
        html += '<div class="table-config-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
            '<input type="text" class="table-cfg-name" data-idx="' + i + '" value="' + (t.name || '') + '" style="flex:1;min-width:0">' +
            '<input type="color" class="table-cfg-color" data-idx="' + i + '" value="' + t.color + '" style="width:40px;height:36px;padding:2px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);cursor:pointer">' +
            '<select class="table-cfg-seats" data-idx="' + i + '" style="width:60px">' +
            '<option value="6"' + (t.seats === 6 ? ' selected' : '') + '>6</option>' +
            '<option value="10"' + (t.seats === 10 ? ' selected' : '') + '>10</option>' +
            '</select>' +
            '<button class="btn danger table-cfg-remove" data-idx="' + i + '" style="min-width:auto;padding:8px 12px">&times;</button>' +
            '</div>';
    });
    container.innerHTML = html;
}

function saveTables() {
    const clean = TABLES.map(t => ({ id: t.id, name: t.name, color: t.color, seats: t.seats }));
    const statusEl = document.getElementById('tables-save-status');
    statusEl.textContent = '';
    statusEl.className = 'save-status';
    tournamentRef.child('tables').set(clean).then(() => {
        statusEl.textContent = 'Uloženo';
        statusEl.className = 'save-status saved';
        setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'save-status'; }, 2000);
    });
}

document.getElementById('tables-config-list').addEventListener('input', (e) => {
    const idx = parseInt(e.target.dataset.idx);
    if (isNaN(idx)) return;
    if (e.target.classList.contains('table-cfg-name')) {
        TABLES[idx].name = e.target.value;
    } else if (e.target.classList.contains('table-cfg-color')) {
        TABLES[idx].color = e.target.value;
    }
});
document.getElementById('tables-config-list').addEventListener('change', (e) => {
    const idx = parseInt(e.target.dataset.idx);
    if (isNaN(idx)) return;
    if (e.target.classList.contains('table-cfg-seats')) {
        TABLES[idx].seats = parseInt(e.target.value);
    }
});

document.getElementById('tables-config-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.table-cfg-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (TABLES.length <= 1) return;
    if (!confirm('Smazat stůl "' + TABLES[idx].name + '"?')) return;
    const removedId = TABLES[idx].id;
    TABLES.splice(idx, 1);
    const list = T.players.list || [];
    let unseated = false;
    list.forEach(p => {
        if (p.table === removedId) {
            delete p.table;
            delete p.seat;
            unseated = true;
        }
    });
    if (unseated) tournamentRef.child('players/list').set(list);
    renderTablesConfig();
    render();
});

document.getElementById('btn-add-table').addEventListener('click', () => {
    const maxId = TABLES.reduce((m, t) => Math.max(m, t.id), 0);
    TABLES.push({ id: maxId + 1, name: 'Stůl ' + (maxId + 1), color: '#7f8c8d', seats: 6 });
    renderTablesConfig();
    render();
});

document.getElementById('btn-save-tables').addEventListener('click', saveTables);

// ─── Blind Structure Table ──────────────────────────────────
function renderBlindStructure() {
    const { config, state, blindStructure } = T;
    const struct = blindStructure || [];
    const anteOn = (config.anteMult || 0) > 0;
    const thAnte = document.getElementById('th-ante');
    if (thAnte) thAnte.style.display = anteOn ? '' : 'none';

    const derived = (state.status === 'running' && state.startedAt)
        ? getCurrentLevel(state.startedAt, struct)
        : { levelIndex: -1, remaining: 0 };
    const lvl = derived.levelIndex;

    let runningMinutes;
    if (state.startedAt) {
        const d = new Date(state.startedAt);
        runningMinutes = d.getHours() * 60 + d.getMinutes();
    } else {
        const parts = (config.startTime || '19:00').split(':');
        runningMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    const tbody = document.getElementById('structure-body');
    tbody.innerHTML = '';
    let levelNum = 0;

    struct.forEach((s, i) => {
        const tr = document.createElement('tr');
        const classes = [];
        if (i === lvl) classes.push('current-level');
        else if (i < lvl) classes.push('past-level');

        const hh = String(Math.floor(runningMinutes / 60) % 24).padStart(2, '0');
        const mm = String(runningMinutes % 60).padStart(2, '0');
        const timeStr = hh + ':' + mm;

        if (s.isBreak) {
            const endMin = runningMinutes + s.duration;
            const endHH = String(Math.floor(endMin / 60) % 24).padStart(2, '0');
            const endMM = String(endMin % 60).padStart(2, '0');
            const breakLabel = T.breakLabels[i] || '';
            classes.push('break-row');
            tr.className = classes.join(' ');
            tr.innerHTML = '<td colspan="' + (anteOn ? 5 : 4) + '">PŘESTÁVKA ' + timeStr + ' \u2013 ' + endHH + ':' + endMM +
                (breakLabel ? '<div class="break-label">' + breakLabel.replace(/</g, '&lt;') + '</div>' : '') + '</td>';
        } else {
            levelNum++;
            const isOverridden = !!T.blindOverrides[levelNum];
            if (isOverridden) classes.push('overridden-level');
            tr.className = classes.join(' ');
            const anteCell = anteOn ? '<td>' + Math.round(s.big * config.anteMult).toLocaleString('cs') + '</td>' : '';
            tr.innerHTML =
                '<td>' + levelNum + (isOverridden ? ' <button class="blind-reset" data-level="' + levelNum + '">&times;</button>' : '') + '</td>' +
                '<td>' + timeStr + '</td>' +
                '<td><input type="number" class="blind-edit" data-level="' + levelNum + '" data-field="small" value="' + s.small + '" inputmode="numeric"></td>' +
                '<td><input type="number" class="blind-edit" data-level="' + levelNum + '" data-field="big" value="' + s.big + '" inputmode="numeric"></td>' +
                anteCell;
        }
        runningMinutes += s.duration;
        tbody.appendChild(tr);
    });
}

function renderBreakMessages() {
    const container = document.getElementById('break-messages-list');
    if (!container) return;
    const struct = T.blindStructure || [];
    const config = T.config;

    // Calculate start times for each entry
    let runningMinutes;
    if (T.state.startedAt) {
        const d = new Date(T.state.startedAt);
        runningMinutes = d.getHours() * 60 + d.getMinutes();
    } else {
        const parts = (config.startTime || '19:00').split(':');
        runningMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    // Collect breaks with their info
    const breaks = [];
    let levelNum = 0;
    for (let i = 0; i < struct.length; i++) {
        const s = struct[i];
        if (s.isBreak) {
            const startMin = runningMinutes;
            const endMin = runningMinutes + s.duration;
            const startStr = String(Math.floor(startMin / 60) % 24).padStart(2, '0') + ':' + String(startMin % 60).padStart(2, '0');
            const endStr = String(Math.floor(endMin / 60) % 24).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
            // Find next blind level after break
            let nextLevel = null;
            for (let j = i + 1; j < struct.length; j++) {
                if (!struct[j].isBreak) { nextLevel = struct[j]; break; }
            }
            breaks.push({ index: i, startStr, endStr, nextLevel, levelNum });
        } else {
            levelNum++;
        }
        runningMinutes += s.duration;
    }

    if (breaks.length === 0) {
        container.innerHTML = '<div style="opacity:0.4">Žádné přestávky ve struktuře</div>';
        return;
    }

    // Only re-render if break count changed or no textareas focused
    const hasFocus = Array.from(container.querySelectorAll('textarea, input')).some(el => el === document.activeElement);
    if (hasFocus) return;

    container.innerHTML = breaks.map((b, idx) => {
        const nextInfo = b.nextLevel
            ? 'Level ' + (b.levelNum + 1) + ': ' + b.nextLevel.small.toLocaleString('cs') + '/' + b.nextLevel.big.toLocaleString('cs')
            : '';
        const val = T.breakMessages[b.index] || '';
        const labelVal = T.breakLabels[b.index] || '';
        return '<div class="break-msg-field" style="margin-bottom:10px">' +
            '<label style="font-size:0.85em;opacity:0.6">' + b.startStr + ' \u2013 ' + b.endStr +
            (nextInfo ? ' \u2192 ' + nextInfo : '') + '</label>' +
            '<input type="text" class="break-label-input" data-break-index="' + b.index + '" value="' + labelVal.replace(/"/g, '&quot;') + '" placeholder="Popisek ve struktu\u0159e (nap\u0159. Konec re-buy\u016F)">' +
            '<label style="font-size:0.85em;opacity:0.6;margin-top:6px;display:block">Banner <small class="hint" style="display:inline">\u2014 prvn\u00ed \u0159\u00e1dek se zobraz\u00ed v\u011bt\u0161\u00edm p\u00edsmem</small></label>' +
            '<textarea class="break-msg-input" data-break-index="' + b.index + '" rows="2" placeholder="Banner pro tuto p\u0159est\u00e1vku...">' + val.replace(/</g, '&lt;') + '</textarea>' +
            '</div>';
    }).join('');
    container.querySelectorAll('textarea').forEach(autofitTextarea);
}

document.getElementById('break-messages-list').addEventListener('input', (e) => {
    if (e.target.tagName === 'TEXTAREA') autofitTextarea(e.target);
});

// ─── Timer Loop ─────────────────────────────────────────────
let prevLevel = -1;
setInterval(() => {
    const { state, blindStructure } = T;
    const struct = blindStructure || [];
    const timerEl = document.getElementById('timer-display');

    if (state.status === 'running' && state.startedAt) {
        const isPaused = state.pausedAt > 0;
        const timerNow = isPaused ? state.pausedAt : undefined;
        const derived = getCurrentLevel(state.startedAt, struct, timerNow);
        timerEl.textContent = formatTime(derived.remaining);
        timerEl.classList.toggle('warning', !isPaused && derived.remaining <= 30000 && derived.remaining > 0);

        if (prevLevel >= 0 && derived.levelIndex !== prevLevel) {
            render();
        }
        prevLevel = derived.levelIndex;

        // Update pause duration in timer-level text
        if (isPaused) {
            const pauseDur = serverNow() - state.pausedAt;
            const pauseMin = Math.floor(pauseDur / 60000);
            const pauseSec = Math.floor((pauseDur % 60000) / 1000);
            const timerLevelEl = document.getElementById('timer-level');
            timerLevelEl.textContent = 'PAUZA — ' + pauseMin + ':' + String(pauseSec).padStart(2, '0');
            timerLevelEl.style.color = 'var(--accent)';
        }
    } else {
        const duration = (struct[0]?.duration || 20) * 60000;
        timerEl.textContent = formatTime(duration);
        timerEl.classList.remove('warning');
    }
}, 100);

// ─── Firebase Listener ──────────────────────────────────────
tournamentRef.on('value', (snap) => {
    const data = snap.val();
    if (!data) {
        tournamentRef.set(DEFAULTS);
        return;
    }

    T.config = { ...DEFAULTS.config, ...data.config };
    T.state = { ...DEFAULTS.state, ...data.state };

    const rawPlayers = data.players || {};
    if (rawPlayers.list !== undefined) {
        T.players = { list: rawPlayers.list || [], totalChips: rawPlayers.totalChips || 0 };
    } else {
        const oldBuyIns = rawPlayers.buyIns || rawPlayers.count || 0;
        const oldRebuys = rawPlayers.rebuys || 0;
        const oldBonuses = rawPlayers.bonuses || 0;
        const oldAddons = rawPlayers.addons || 0;
        const oldActive = rawPlayers.activePlayers || rawPlayers.count || oldBuyIns;
        const migrated = [];
        for (let i = 0; i < oldBuyIns; i++) {
            migrated.push({
                name: 'Hráč ' + (i + 1),
                buys: 1,
                addon: i < oldAddons,
                bonus: i < oldBonuses,
                active: i < oldActive
            });
        }
        for (let r = 0; r < oldRebuys && migrated.length > 0; r++) {
            migrated[r % migrated.length].buys++;
        }
        T.players = { list: migrated, totalChips: rawPlayers.totalChips || 0 };
        if (oldBuyIns > 0) {
            tournamentRef.child('players').set(T.players);
        }
    }
    T.blindStructure = data.blindStructure || [];
    T.blindOverrides = data.blindOverrides || {};
    TABLES = data.tables || DEFAULT_TABLES.slice();
    T.tableLocks = data.tableLocks || {};
    T.payoutConfig = data.payoutConfig || null;
    T.breakMessages = data.breakMessages || {};
    // Migrate old single breakMessage to first break
    if (!data.breakMessages && data.breakMessage) {
        T.breakMessages = { 0: data.breakMessage };
    }
    T.breakLabels = data.breakLabels || {};
    T.rules = data.rules || null;
    T.notes = data.notes || DEFAULTS.notes;
    T.eventLog = data.eventLog || [];

    // Ticker speed
    const savedSpeed = data.tickerSpeed || 40;
    document.getElementById('cfg-ticker-speed').value = savedSpeed;
    document.getElementById('ticker-speed-label').textContent = savedSpeed + 's';

    // Sound selection
    const soundSelect = document.getElementById('cfg-level-sound');
    if (soundSelect) soundSelect.value = data.levelSound || '';
    const knockoutSoundSelect = document.getElementById('cfg-knockout-sound');
    if (knockoutSoundSelect) knockoutSoundSelect.value = data.knockoutSound || '';
    const knockoutWinSoundSelect = document.getElementById('cfg-knockout-win-sound');
    if (knockoutWinSoundSelect) knockoutWinSoundSelect.value = data.knockoutWinSound || '';
    const buySoundSelect = document.getElementById('cfg-buy-sound');
    if (buySoundSelect) buySoundSelect.value = data.buySound || '';
    const endSoundSelect = document.getElementById('cfg-end-sound');
    if (endSoundSelect) endSoundSelect.value = data.endSound || '';

    renderTablesConfig();
    render();
});

// ─── Event Handlers ─────────────────────────────────────────

// Config auto-save
function saveConfig() {
    if (T.state.status !== 'waiting') return;
    const config = {
        startingStack: parseInt(document.getElementById('cfg-stack').value) || 5000,
        levelDuration: parseInt(document.getElementById('cfg-level-dur').value) || 20,
        maxLevels: parseInt(document.getElementById('cfg-max-levels').value) || 12,
        startTime: document.getElementById('cfg-start-time-est').value || '19:00',
        bonusAmount: parseInt(document.getElementById('cfg-bonus').value) || 5000,
        levelsPerBreak: parseInt(document.getElementById('cfg-levels-per-break').value) || 0,
        breakDuration: parseInt(document.getElementById('cfg-break-dur').value) || 30,
        maxBreaks: parseInt(document.getElementById('cfg-max-breaks').value) || 0,
        buyInAmount: parseInt(document.getElementById('cfg-buyin-amount').value) || 400,
        addonChips: parseInt(document.getElementById('cfg-addon-chips').value) || 0,
        addonAmount: parseInt(document.getElementById('cfg-addon-amount').value) || 0,
        anteMult: parseFloat(document.getElementById('cfg-ante-mult').value) || 0
    };
    const p = tournamentRef.child('config').set(config);
    showSaveStatus(document.getElementById('config-save-status'), p);
    p.then(() => {
        T.config = config;
        recalcAndSync();
    });
}

document.getElementById('section-config').addEventListener('change', saveConfig);

// Add player
document.getElementById('btn-add-player').addEventListener('click', () => {
    const input = document.getElementById('new-player-name');
    const name = (input.value || '').trim();
    if (!name) { input.focus(); return; }
    const list = T.players.list || [];
    const player = { name, buys: 1, addon: false, bonus: false, active: true };
    assignSeat(player, list);
    list.push(player);
    T.players.list = list;
    input.value = '';
    savePlayerList();
    logEvent('buyin', name);
    render();
});

document.getElementById('new-player-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-add-player').click();
});

// Test players
document.getElementById('btn-add-test-players').addEventListener('click', () => {
    if (!confirm('Přidat 8 testovacích hráčů?')) return;
    const names = ['Adam', 'Bára', 'Cyril', 'Dana', 'Emil', 'Fanda', 'Gita', 'Honza'];
    const list = T.players.list || [];
    names.forEach(name => {
        const player = { name, buys: 1, addon: false, bonus: false, active: true };
        assignSeat(player, list);
        list.push(player);
        logEvent('buyin', name);
    });
    T.players.list = list;
    savePlayerList();
    render();
});

// Remove all
document.getElementById('btn-remove-all-players').addEventListener('click', () => {
    if (!confirm('Opravdu smazat všechny hráče?')) return;
    T.players.list = [];
    savePlayerList();
    render();
});

// Player list delegated events
document.getElementById('players-list').addEventListener('change', (e) => {
    if (!e.target.classList.contains('player-seat-select')) return;
    const idx = parseInt(e.target.dataset.idx);
    const list = T.players.list || [];
    if (!list[idx]) return;
    const val = e.target.value;
    if (val === 'random') {
        delete list[idx].table;
        delete list[idx].seat;
        assignSeat(list[idx], list);
    } else if (val) {
        const parts = val.split('-');
        list[idx].table = parseInt(parts[0]);
        list[idx].seat = parseInt(parts[1]);
    } else {
        delete list[idx].table;
        delete list[idx].seat;
    }
    savePlayerList();
    render();
});

document.getElementById('players-list').addEventListener('click', (e) => {
    const list = T.players.list || [];
    const btn = e.target;

    if (btn.classList.contains('player-buys-btn')) {
        const idx = parseInt(btn.dataset.idx);
        if (!list[idx]) return;
        let eventType = null;
        if (btn.dataset.dir === '-') {
            if (list[idx].buys > 0) list[idx].buys--;
        } else {
            eventType = list[idx].buys === 0 ? 'buyin' : 'rebuy';
            list[idx].buys++;
            list[idx].active = true;
        }
        savePlayerList();
        if (eventType) logEvent(eventType, list[idx].name);
        render();
        return;
    }

    if (btn.classList.contains('player-toggle')) {
        const idx = parseInt(btn.dataset.idx);
        const field = btn.dataset.field;
        if (list[idx] && field) {
            list[idx][field] = !list[idx][field];
            let eventType = null;
            if (field === 'active') {
                if (!list[idx].active) {
                    list[idx].eliminatedAt = serverNow();
                    delete list[idx].table;
                    delete list[idx].seat;
                    eventType = 'knockout';
                } else {
                    delete list[idx].eliminatedAt;
                    assignSeat(list[idx], list);
                    eventType = 'reentry';
                }
            }
            if (field === 'addon' && list[idx].addon) {
                eventType = 'addon';
            }
            savePlayerList();
            if (eventType) logEvent(eventType, list[idx].name);
            render();
        }
        return;
    }

    if (btn.classList.contains('player-remove')) {
        const idx = parseInt(btn.dataset.idx);
        if (list[idx] && confirm('Odebrat ' + list[idx].name + '?')) {
            list.splice(idx, 1);
            T.players.list = list;
            savePlayerList();
            render();
        }
        return;
    }
});

// Timer
document.getElementById('btn-start').addEventListener('click', () => {
    if (T.state.status === 'running') return;
    if (!confirm('Spustit timer?')) return;
    tournamentRef.child('state').update({
        status: 'running',
        startedAt: serverNow()
    });
});

document.getElementById('btn-pause').addEventListener('click', () => {
    if (T.state.status !== 'running') return;
    if (T.state.pausedAt > 0) {
        // Resume: shift startedAt forward by pause duration
        const pauseDuration = serverNow() - T.state.pausedAt;
        tournamentRef.child('state').update({
            startedAt: T.state.startedAt + pauseDuration,
            pausedAt: 0
        });
    } else {
        // Pause
        tournamentRef.child('state/pausedAt').set(serverNow());
    }
});

document.getElementById('btn-set-start-time').addEventListener('click', () => {
    const val = document.getElementById('cfg-start-time').value;
    if (!val) return;
    const [hh, mm] = val.split(':').map(Number);
    const d = new Date(T.state.startedAt);
    d.setHours(hh, mm, 0, 0);
    tournamentRef.child('state/startedAt').set(d.getTime());
});

function shiftLevel(direction) {
    if (!T.state.startedAt || !T.blindStructure) return;
    const struct = T.blindStructure;
    const { levelIndex } = getCurrentLevel(T.state.startedAt, struct);
    const idx = direction > 0 ? levelIndex : Math.max(0, levelIndex - 1);
    const dur = (struct[idx] ? struct[idx].duration : 0) * 60000;
    if (!dur) return;
    tournamentRef.child('state/startedAt').set(T.state.startedAt - direction * dur);
}
document.getElementById('btn-level-back').addEventListener('click', () => shiftLevel(-1));
document.getElementById('btn-level-fwd').addEventListener('click', () => shiftLevel(1));

document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Opravdu resetovat timer?')) return;
    tournamentRef.child('state').set(DEFAULTS.state);
    tournamentRef.child('payoutConfig').set(null);
    tournamentRef.child('eventLog').set(null);
    T.eventLog = [];
    recalcAndSync();
    render();
});

// Winners
document.getElementById('btn-save-winners').addEventListener('click', () => {
    const winners = {};
    const paidPlaces = getPaidPlaces();
    for (let i = 1; i <= paidPlaces; i++) {
        const el = document.getElementById('cfg-winner-' + i);
        const name = el ? el.value.trim() : '';
        if (name) winners[i] = name;
    }
    tournamentRef.child('state/winners').set(winners).then(() => {
        const btn = document.getElementById('btn-save-winners');
        btn.textContent = 'Vítězové vyhlášeni \u2713';
        setTimeout(() => { btn.textContent = 'Vyhlásit vítěze'; }, 2000);
    });
});

document.getElementById('btn-clear-winners').addEventListener('click', () => {
    if (!confirm('Smazat výsledky?')) return;
    T.state.winners = {};
    tournamentRef.child('state/winners').set({});
    renderWinners();
});

document.getElementById('winners-fields').addEventListener('click', (e) => {
    const btn = e.target.closest('.knockout-mini-fill');
    if (!btn) return;
    const place = btn.dataset.place;
    const name = btn.dataset.name;
    const input = document.getElementById('cfg-winner-' + place);
    if (input) input.value = name;
});

// Payouts
document.getElementById('payout-config-rows').addEventListener('input', (e) => {
    if (e.target.classList.contains('payout-config-slider')) {
        applyPayoutChange(parseInt(e.target.dataset.place), parseInt(e.target.value));
    } else if (e.target.classList.contains('payout-config-pct')) {
        applyPayoutChange(parseInt(e.target.dataset.place), parseInt(e.target.value) || 0);
    }
});

document.getElementById('btn-payout-add').addEventListener('click', () => {
    const values = getPayoutConfigValues();
    values.push(0);
    T.payoutConfig = values;
    tournamentRef.child('payoutConfig').set(values);
    render();
});

document.getElementById('btn-payout-remove').addEventListener('click', () => {
    const values = getPayoutConfigValues();
    if (values.length <= 1) return;
    const removed = values.pop();
    if (removed > 0 && values.length > 0) values[values.length - 1] += removed;
    T.payoutConfig = values;
    tournamentRef.child('payoutConfig').set(values);
    render();
});

document.getElementById('btn-payout-auto').addEventListener('click', () => {
    const places = getPayoutConfigValues().length;
    const auto = getAutoPayoutDistribution(places);
    T.payoutConfig = auto;
    tournamentRef.child('payoutConfig').set(auto);
    render();
});

// Notes
document.getElementById('notes-list').addEventListener('click', (e) => {
    if (!e.target.classList.contains('note-remove')) return;
    const idx = parseInt(e.target.dataset.noteIdx);
    T.notes.splice(idx, 1);
    renderNoteInputs();
    saveNotes();
});

document.getElementById('notes-list').addEventListener('change', saveNotes);

document.getElementById('btn-add-note').addEventListener('click', () => {
    T.notes = T.notes || [];
    T.notes.push('');
    renderNoteInputs();
    const inputs = document.querySelectorAll('#notes-list input[type="text"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
});

// Ticker speed
const tickerSpeedSlider = document.getElementById('cfg-ticker-speed');
const tickerSpeedLabel = document.getElementById('ticker-speed-label');
tickerSpeedSlider.addEventListener('input', () => {
    tickerSpeedLabel.textContent = tickerSpeedSlider.value + 's';
});
tickerSpeedSlider.addEventListener('change', () => {
    tournamentRef.child('tickerSpeed').set(parseInt(tickerSpeedSlider.value));
});

// Note drag & drop
let dragIdx = null;
const notesList = document.getElementById('notes-list');
notesList.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('note-drag-handle')) {
        e.target.closest('.note-row').draggable = true;
    }
});
notesList.addEventListener('touchstart', (e) => {
    // Touch drag not supported natively, skip
}, { passive: true });
notesList.addEventListener('mouseup', (e) => {
    const row = e.target.closest('.note-row');
    if (row) row.draggable = false;
});
notesList.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.note-row');
    if (!row) return;
    dragIdx = parseInt(row.dataset.noteIdx);
    row.style.opacity = '0.3';
    e.dataTransfer.effectAllowed = 'move';
});
notesList.addEventListener('dragend', (e) => {
    const row = e.target.closest('.note-row');
    if (row) { row.style.opacity = ''; row.draggable = false; }
    notesList.querySelectorAll('.note-row').forEach(r => r.style.borderTop = '');
    dragIdx = null;
});
notesList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const row = e.target.closest('.note-row');
    if (!row) return;
    e.dataTransfer.dropEffect = 'move';
    notesList.querySelectorAll('.note-row').forEach(r => r.style.borderTop = '');
    row.style.borderTop = '2px solid var(--accent)';
});
notesList.addEventListener('drop', (e) => {
    e.preventDefault();
    const row = e.target.closest('.note-row');
    if (!row || dragIdx === null) return;
    const dropIdx = parseInt(row.dataset.noteIdx);
    if (dragIdx === dropIdx) return;
    const inputs = notesList.querySelectorAll('input[type="text"]');
    inputs.forEach(el => { T.notes[parseInt(el.dataset.noteIdx)] = el.value; });
    const moved = T.notes.splice(dragIdx, 1)[0];
    T.notes.splice(dropIdx, 0, moved);
    renderNoteInputs();
    saveNotes();
});

// Break messages and labels
document.getElementById('break-messages-list').addEventListener('change', (e) => {
    if (e.target.classList.contains('break-msg-input')) {
        const idx = e.target.dataset.breakIndex;
        const val = (e.target.value || '').trim();
        if (val) { T.breakMessages[idx] = val; } else { delete T.breakMessages[idx]; }
        const p = tournamentRef.child('breakMessages').set(T.breakMessages);
        showSaveStatus(document.getElementById('break-save-status'), p);
    }
    if (e.target.classList.contains('break-label-input')) {
        const idx = e.target.dataset.breakIndex;
        const val = (e.target.value || '').trim();
        if (val) { T.breakLabels[idx] = val; } else { delete T.breakLabels[idx]; }
        tournamentRef.child('breakLabels').set(T.breakLabels);
        recalcAndSync();
    }
});

// Rules
document.getElementById('rules-sections-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('rule-remove')) {
        if (!confirm('Smazat pravidlo?')) return;
        const si = parseInt(e.target.closest('.rules-admin-items').dataset.sectionIdx);
        const idx = parseInt(e.target.dataset.ruleIdx);
        const rules = collectRules();
        rules[si].items.splice(idx, 1);
        T.rules = rules;
        renderRulesInputs();
        saveRules();
    }
    if (e.target.classList.contains('section-remove')) {
        if (!confirm('Smazat celou sekci pravidel?')) return;
        const si = parseInt(e.target.dataset.sectionIdx);
        const rules = collectRules();
        rules.splice(si, 1);
        T.rules = rules;
        renderRulesInputs();
        saveRules();
    }
    if (e.target.classList.contains('rule-add')) {
        const si = parseInt(e.target.dataset.sectionIdx);
        const rules = collectRules();
        rules[si].items.push('');
        T.rules = rules;
        renderRulesInputs();
        const inputs = document.querySelectorAll('.rules-admin-items[data-section-idx="' + si + '"] textarea');
        if (inputs.length) inputs[inputs.length - 1].focus();
    }
    if (e.target.id === 'btn-add-rule-section') {
        const rules = collectRules();
        rules.push({ title: '', items: [''] });
        T.rules = rules;
        renderRulesInputs();
        const titleInputs = document.querySelectorAll('.rules-title-input');
        if (titleInputs.length) titleInputs[titleInputs.length - 1].focus();
    }
});
document.getElementById('rules-sections-list').addEventListener('change', saveRules);

// Rule drag & drop (within each section)
let ruleDragIdx = null;
let ruleDragSectionIdx = null;
const rulesList = document.getElementById('rules-sections-list');
rulesList.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('note-drag-handle')) {
        e.target.closest('.note-row').draggable = true;
    }
});
rulesList.addEventListener('mouseup', (e) => {
    const row = e.target.closest('.note-row');
    if (row) row.draggable = false;
});
rulesList.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.note-row');
    if (!row) return;
    const items = row.closest('.rules-admin-items');
    if (!items) return;
    ruleDragSectionIdx = items.dataset.sectionIdx;
    ruleDragIdx = parseInt(row.dataset.ruleIdx);
    row.style.opacity = '0.3';
    e.dataTransfer.effectAllowed = 'move';
});
rulesList.addEventListener('dragend', (e) => {
    const row = e.target.closest('.note-row');
    if (row) { row.style.opacity = ''; row.draggable = false; }
    rulesList.querySelectorAll('.note-row').forEach(r => r.style.borderTop = '');
    ruleDragIdx = null;
    ruleDragSectionIdx = null;
});
rulesList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const row = e.target.closest('.note-row');
    if (!row) return;
    const items = row.closest('.rules-admin-items');
    if (!items || items.dataset.sectionIdx !== ruleDragSectionIdx) return;
    e.dataTransfer.dropEffect = 'move';
    items.querySelectorAll('.note-row').forEach(r => r.style.borderTop = '');
    row.style.borderTop = '2px solid var(--accent)';
});
rulesList.addEventListener('drop', (e) => {
    e.preventDefault();
    const row = e.target.closest('.note-row');
    if (!row || ruleDragIdx === null) return;
    const items = row.closest('.rules-admin-items');
    if (!items || items.dataset.sectionIdx !== ruleDragSectionIdx) return;
    const dropIdx = parseInt(row.dataset.ruleIdx);
    if (ruleDragIdx === dropIdx) return;
    const rules = collectRules();
    const sec = rules[parseInt(ruleDragSectionIdx)].items;
    const moved = sec.splice(ruleDragIdx, 1)[0];
    sec.splice(dropIdx, 0, moved);
    T.rules = rules;
    renderRulesInputs();
    saveRules();
});

// Table locks
document.getElementById('table-locks-ui').addEventListener('click', (e) => {
    const btn = e.target;
    if (btn.classList.contains('table-lock-toggle')) {
        const tableId = parseInt(btn.dataset.table);
        const locks = T.tableLocks || {};
        const tl = locks[tableId] || {};
        tl.locked = !tl.locked;
        locks[tableId] = tl;
        T.tableLocks = locks;
        tournamentRef.child('tableLocks').set(locks);
        render();
        return;
    }
    if (btn.classList.contains('seat-lock-toggle')) {
        const tableId = parseInt(btn.dataset.table);
        const seat = parseInt(btn.dataset.seat);
        const locks = T.tableLocks || {};
        const tl = locks[tableId] || {};
        const lockedSeats = tl.lockedSeats || [];
        const idx = lockedSeats.indexOf(seat);
        if (idx >= 0) lockedSeats.splice(idx, 1);
        else lockedSeats.push(seat);
        tl.lockedSeats = lockedSeats;
        locks[tableId] = tl;
        T.tableLocks = locks;
        tournamentRef.child('tableLocks').set(locks);
        render();
        return;
    }
    if (btn.classList.contains('table-rotate')) {
        const tableId = parseInt(btn.dataset.table);
        const locks = T.tableLocks || {};
        const tl = locks[tableId] || {};
        tl.rotation = ((tl.rotation || 0) + 90) % 360;
        locks[tableId] = tl;
        T.tableLocks = locks;
        tournamentRef.child('tableLocks').set(locks);
        render();
        return;
    }
    if (btn.classList.contains('wall-toggle-btn')) {
        const tableId = parseInt(btn.dataset.table);
        const side = btn.dataset.wall;
        const locks = T.tableLocks || {};
        const tl = locks[tableId] || {};
        const walls = tl.walls || [];
        const idx = walls.indexOf(side);
        if (idx >= 0) walls.splice(idx, 1);
        else walls.push(side);
        tl.walls = walls;
        locks[tableId] = tl;
        T.tableLocks = locks;
        tournamentRef.child('tableLocks').set(locks);
        render();
        return;
    }
});


// Reshuffle
document.getElementById('btn-reshuffle-seats').addEventListener('click', () => {
    if (!confirm('Přepočítat zasedací pořádek?')) return;
    const list = T.players.list || [];
    list.forEach(p => { delete p.table; delete p.seat; });
    list.forEach(p => { if (p.active) assignSeat(p, list); });
    T.players.list = list;
    savePlayerList();
    render();
});

// Blind structure inline editing
document.getElementById('structure-body').addEventListener('change', (e) => {
    if (!e.target.classList.contains('blind-edit')) return;
    const level = parseInt(e.target.dataset.level);
    const field = e.target.dataset.field; // 'small' or 'big'
    const val = parseInt(e.target.value);
    if (!level || isNaN(val) || val <= 0) return;

    // Get current override or current values from structure
    const existing = T.blindOverrides[level] || {};
    let currentSmall = existing.small, currentBig = existing.big;
    if (!currentSmall || !currentBig) {
        let bn = 0;
        for (const be of (T.blindStructure || [])) {
            if (be.isBreak) continue;
            bn++;
            if (bn === level) { currentSmall = currentSmall || be.small; currentBig = currentBig || be.big; break; }
        }
    }

    const newSmall = field === 'small' ? val : currentSmall;
    const newBig = field === 'small' ? val * 2 : (field === 'big' ? val : currentBig);

    T.blindOverrides[level] = { small: newSmall, big: newBig };

    tournamentRef.child('blindOverrides').set(T.blindOverrides);
    recalcAndSync();
});

document.getElementById('structure-body').addEventListener('click', (e) => {
    // Reset button
    if (e.target.classList.contains('blind-reset')) {
        const level = parseInt(e.target.dataset.level);
        if (!level) return;
        delete T.blindOverrides[level];
        tournamentRef.child('blindOverrides').set(T.blindOverrides);
        recalcAndSync();
        return;
    }

});

// ─── Guard Toggles ──────────────────────────────────────────
const guardState = JSON.parse(localStorage.getItem('adminGuards') || '{}');

document.querySelectorAll('.guard-toggle').forEach(btn => {
    const id = btn.dataset.target;
    const section = document.getElementById(id);
    if (!section) return;
    // Default to locked unless explicitly saved as unlocked
    const locked = guardState[id] !== false;
    section.classList.toggle('guarded', locked);
    btn.textContent = locked ? '\u{1F512}' : '\u{1F513}';
});

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.guard-toggle');
    if (!btn) return;
    const id = btn.dataset.target;
    const section = document.getElementById(id);
    if (!section) return;
    const isLocked = section.classList.contains('guarded');
    section.classList.toggle('guarded', !isLocked);
    btn.textContent = isLocked ? '\u{1F513}' : '\u{1F512}';
    guardState[id] = !isLocked;
    localStorage.setItem('adminGuards', JSON.stringify(guardState));
});

// ─── Sound Selection ────────────────────────────────────────
const ALL_SOUND_FILES = [
    'castleportcullis.wav', 'choir.wav', 'coins falling 1.wav', 'coins falling 2.wav',
    'holy!.wav', 'key pickup guantlet 4.wav', 'power up1.wav', 'superholy.wav',
    'thumbs down.wav', 'thumbs up.wav', 'unholy!.wav', 'whistle.wav'
];

function populateSoundSelects() {
    const ids = ['cfg-level-sound', 'cfg-buy-sound', 'cfg-knockout-sound', 'cfg-knockout-win-sound', 'cfg-end-sound'];
    for (const id of ids) {
        const sel = document.getElementById(id);
        if (!sel) continue;
        sel.innerHTML = '';
        sel.appendChild(new Option('— žádný —', ''));
        for (const f of ALL_SOUND_FILES) sel.appendChild(new Option(f, f));
    }
}
populateSoundSelects();

function testSound(selectId) {
    const file = document.getElementById(selectId).value;
    if (!file) return;
    new Audio('../../assets/sfx/' + file).play().catch(() => {});
}

document.getElementById('cfg-level-sound').addEventListener('change', (e) => {
    tournamentRef.child('levelSound').set(e.target.value);
});
document.getElementById('btn-test-sound').addEventListener('click', () => testSound('cfg-level-sound'));

document.getElementById('cfg-knockout-sound').addEventListener('change', (e) => {
    tournamentRef.child('knockoutSound').set(e.target.value);
});
document.getElementById('btn-test-knockout-sound').addEventListener('click', () => testSound('cfg-knockout-sound'));

document.getElementById('cfg-knockout-win-sound').addEventListener('change', (e) => {
    tournamentRef.child('knockoutWinSound').set(e.target.value);
});
document.getElementById('btn-test-knockout-win-sound').addEventListener('click', () => testSound('cfg-knockout-win-sound'));

document.getElementById('cfg-buy-sound').addEventListener('change', (e) => {
    tournamentRef.child('buySound').set(e.target.value);
});
document.getElementById('btn-test-buy-sound').addEventListener('click', () => testSound('cfg-buy-sound'));

document.getElementById('cfg-end-sound').addEventListener('change', (e) => {
    tournamentRef.child('endSound').set(e.target.value);
});
document.getElementById('btn-test-end-sound').addEventListener('click', () => testSound('cfg-end-sound'));

// Clear event log
document.getElementById('btn-clear-event-log').addEventListener('click', () => {
    if (!confirm('Smazat log událostí?')) return;
    tournamentRef.child('eventLog').set(null);
    T.eventLog = [];
    renderEventLog();
});
