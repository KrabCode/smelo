import * as i18n from './i18n.js';

// ─── Firebase Init ──────────────────────────────────────────
firebase.initializeApp({
    apiKey: "AIzaSyAfQqQYYn8pId99FbqIqX72LH6kOlosunQ",
    authDomain: "smelo-turnaj.firebaseapp.com",
    databaseURL: "https://smelo-turnaj-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "smelo-turnaj"
});

// ─── Password Gate ──────────────────────────────────────────
const ADMIN_HASH = '04114e775c39003d71c9825add2ee4cfd472c2980936def742daa2072353ecd3';

async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkGate() {
    if (localStorage.getItem('adminAuth') === '1') return;
    const input = document.getElementById('admin-gate-pwd');
    const btn = document.getElementById('admin-gate-btn');
    await new Promise((resolve) => {
        const tryUnlock = async () => {
            if (input.value && await sha256(input.value) === ADMIN_HASH) {
                localStorage.setItem('adminAuth', '1');
                resolve();
            } else {
                input.value = '';
                input.placeholder = i18n.t('gate.wrong');
            }
        };
        btn.addEventListener('click', tryUnlock);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
    });
}
i18n.applyI18n();
await checkGate();
document.getElementById('admin-gate').remove();
document.querySelector('.admin-wrap').style.display = '';

// Surface silent write failures (e.g. permission denied) instead of failing invisibly
window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    alert(i18n.t('error.saveFailed') + msg);
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
        startTime: '19:00',
        buyInAmount: 400,
        bountyAmount: 0,
        addonChips: 0,
        addonAmount: 0,
        anteMult: 0,
        date: '',
        organizerFee: 0,
        waitingMessage: 'Orientační začátek'
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
    profiles: {},
    tableLocks: {},
    payoutConfig: null,
    breaks: [],
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

// ─── Breaks ─────────────────────────────────────────────────
// Sorted, one break per level at most
function getBreaks() {
    const seen = new Set();
    return (T.breaks || [])
        .filter(b => b && b.afterLevel > 0 && b.duration > 0)
        .slice()
        .sort((a, b) => a.afterLevel - b.afterLevel)
        .filter(b => { if (seen.has(b.afterLevel)) return false; seen.add(b.afterLevel); return true; });
}

// Rebuild the break list from a structure generated by the old levelsPerBreak config,
// picking up the messages/labels that were keyed by structure index
function legacyBreaks(data) {
    const struct = data.blindStructure || [];
    const messages = data.breakMessages || {};
    const labels = data.breakLabels || {};
    const breaks = [];
    let levelNum = 0;
    struct.forEach((s, i) => {
        if (!s.isBreak) { levelNum++; return; }
        if (levelNum === 0) return;
        const b = { afterLevel: levelNum, duration: s.duration };
        if (labels[i]) b.label = labels[i];
        if (messages[i]) b.message = messages[i];
        breaks.push(b);
    });
    return breaks;
}

// Break texts travel with the structure entry so they survive recalculation
function makeBreakEntry(b) {
    const entry = { small: 0, big: 0, duration: b.duration, isBreak: true };
    if (b.label) entry.label = b.label;
    if (b.message) entry.message = b.message;
    return entry;
}

// ─── Blind Calculation ──────────────────────────────────────
function calculateBlinds(config, totalChips, freezeUpTo) {
    const { levelDuration } = config;
    const numLevels = Math.max(2, config.maxLevels || 12);
    const breaks = getBreaks();
    const levels = [];

    let blindCount = 0;
    let lastWasBreak = false;
    let sb = 5;

    // Already-played entries stay exactly as they were
    if (freezeUpTo >= 0 && T.blindStructure && T.blindStructure.length > 0) {
        const frozen = Math.min(freezeUpTo + 1, T.blindStructure.length);
        for (let i = 0; i < frozen; i++) {
            const entry = { ...T.blindStructure[i] };
            levels.push(entry);
            if (entry.isBreak) {
                lastWasBreak = true;
            } else {
                blindCount++;
                lastWasBreak = false;
                sb = entry.big;
            }
        }
    }

    // Remaining levels double from the last one, breaks inserted from the list
    while (blindCount < numLevels) {
        if (blindCount > 0 && !lastWasBreak) {
            const b = breaks.find(x => x.afterLevel === blindCount);
            if (b) levels.push(makeBreakEntry(b));
        }
        levels.push({ small: sb, big: sb * 2, duration: levelDuration });
        blindCount++;
        lastWasBreak = false;
        sb = sb * 2;
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

function calculatePrizePool(stats, config) {
    const buyInAmount = config.buyInAmount || 400;
    const addonPrice = config.addonAmount || 0;
    const organizerFee = config.organizerFee || 0;
    return Math.max(0, stats.totalBuys * buyInAmount + stats.addons * addonPrice - organizerFee);
}

function getRunningMinutes(state, config) {
    if (state.startedAt) {
        const d = new Date(state.startedAt);
        return d.getHours() * 60 + d.getMinutes();
    }
    const parts = (config.startTime || '19:00').split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
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
    el.textContent = i18n.t('save.saving');
    el.className = 'save-status saving';
    promise.then(() => {
        el.textContent = i18n.t('save.saved');
        el.className = 'save-status saved';
        setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 2000);
    }).catch(() => {
        el.textContent = i18n.t('save.error');
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
        container.innerHTML = '<div style="opacity:0.4;text-align:center">' + i18n.t('log.empty') + '</div>';
        return;
    }
    const labels = {
        buyin: i18n.t('log.buyin'),
        rebuy: i18n.t('log.rebuy'),
        addon: i18n.t('log.addon'),
        knockout: i18n.t('log.knockout'),
        reentry: i18n.t('log.reentry')
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
        (unseated > 0 ? ' \u00B7 ' + unseated + ' ' + i18n.t('players.noSeat') : '');

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
        timerLevelEl.textContent = i18n.t('label.pause') + ' — ' + pauseMin + ':' + String(pauseSec).padStart(2, '0');
        timerLevelEl.style.color = 'var(--accent)';
    } else if (state.status === 'running' && curEntry) {
        if (onBreak) {
            timerLevelEl.textContent = i18n.t('label.break');
            timerLevelEl.style.color = 'var(--green)';
        } else {
            let blindNum = 0;
            for (let i = 0; i <= lvl; i++) { if (!struct[i].isBreak) blindNum++; }
            timerLevelEl.textContent = i18n.t('label.level') + ' ' + blindNum + ' — ' +
                curEntry.small.toLocaleString('cs') + ' / ' + curEntry.big.toLocaleString('cs');
            timerLevelEl.style.color = '';
        }
    } else if (state.status === 'finished') {
        timerLevelEl.textContent = i18n.t('status.ended');
        timerLevelEl.style.color = 'var(--green)';
    } else {
        const statusLabel = { waiting: i18n.t('status.waiting'), running: i18n.t('status.running'), finished: i18n.t('status.finished') };
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
        state.status === 'running' ? i18n.t('timer.running') : i18n.t('timer.start');
    document.getElementById('btn-start').disabled = state.status === 'running';
    const btnPause = document.getElementById('btn-pause');
    if (state.status === 'running') {
        btnPause.style.display = '';
        btnPause.textContent = isPaused ? i18n.t('timer.resume') : i18n.t('timer.pause');
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
        'cfg-buyin-amount': config.buyInAmount,
        'cfg-bounty-amount': config.bountyAmount,
        'cfg-addon-chips': config.addonChips,
        'cfg-addon-amount': config.addonAmount,
        'cfg-start-time-est': config.startTime,
        'cfg-ante-mult': config.anteMult,
        'cfg-organizer-fee': config.organizerFee,
        'cfg-waiting-msg': config.waitingMessage || 'Orientační začátek'
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
    const prizePool = calculatePrizePool(stats, config);
    const organizerFee = config.organizerFee || 0;
    document.getElementById('pool-display').textContent =
        i18n.t('payout.pool') + ': ' + prizePool.toLocaleString('cs') + ' Kč (' + paidPlaces + ' ' + i18n.t('payout.places') + ')' +
        (organizerFee ? ' · ' + i18n.t('payout.fee') + ': ' + organizerFee.toLocaleString('cs') + ' Kč' : '');

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

    // Breaks
    renderBreaksList();

    // Rules
    const rulesInputs = document.querySelectorAll('#rules-sections-list textarea');
    const rulesHasFocus = Array.from(rulesInputs).some(el => el === document.activeElement);
    if (!rulesHasFocus) renderRulesInputs();

    // Table locks
    renderTableLocks();

    // Blind structure table
    renderProfiles();
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

    const buyLabel = i18n.t('th.buys') + ' <span class="th-hint">(' + (c.buyInAmount || 400).toLocaleString('cs') + ' Kč \u2192 ' + (c.startingStack || 5000).toLocaleString('cs') + ')</span>';
    const addonLabel = i18n.t('th.addon') + (c.addonChips ? ' <span class="th-hint">(' + (c.addonAmount || 0).toLocaleString('cs') + ' Kč \u2192 ' + c.addonChips.toLocaleString('cs') + ')</span>' : '');
    const bonusLabel = i18n.t('th.bonus') + (c.bonusAmount ? ' <span class="th-hint">(' + c.bonusAmount.toLocaleString('cs') + ')</span>' : '');

    let html = '<div class="player-table-wrap"><table class="player-table"><thead><tr>' +
        '<th>' + i18n.t('th.player') + '</th><th>' + i18n.t('th.table') + '</th><th>' + buyLabel + '</th><th>' + addonLabel + '</th><th>' + bonusLabel + '</th><th>' + i18n.t('th.active') + '</th><th></th>' +
        '</tr></thead><tbody>';

    sorted.forEach(i => {
        const p = list[i];
        const nameClass = 'player-name' + (p.active ? '' : ' inactive');
        const curVal = p.table && p.seat ? p.table + '-' + p.seat : '';

        let seatSelect = '<select class="player-seat-select" data-idx="' + i + '">';
        seatSelect += '<option value=""' + (!curVal ? ' selected' : '') + '>\u2014</option>';
        seatSelect += '<option value="random">' + i18n.t('players.random') + '</option>';
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
            '<td><button class="player-remove" data-idx="' + i + '" title="' + i18n.t('players.remove') + '">&times;</button></td>' +
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
    const stats = derivePlayerStats(T.players.list || []);
    const prizePool = calculatePrizePool(stats, T.config);
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
    totalEl.textContent = i18n.t('payout.total') + ': ' + Math.round(total) + '%';
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
    const stats = derivePlayerStats(T.players.list || []);
    const prizePool = calculatePrizePool(stats, T.config);
    const dragAmounts = roundPayouts(values, prizePool);
    const rows = document.querySelectorAll('#payout-config-rows .payout-config-row');
    rows.forEach((row, i) => {
        const slider = row.querySelector('.payout-config-slider');
        const pct = row.querySelector('.payout-config-pct');
        const amount = row.querySelector('.payout-config-amount');
        if (slider) slider.value = values[i];
        if (pct && document.activeElement !== pct) pct.value = values[i];
        if (amount) amount.textContent = dragAmounts[i].toLocaleString('cs') + ' Kč';
    });
    const newTotal = values.reduce((s, v) => s + v, 0);
    const totalEl = document.getElementById('payout-config-total');
    totalEl.textContent = i18n.t('payout.total') + ': ' + Math.round(newTotal) + '%';
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
                '<label>' + i + '. ' + i18n.t('winners.place') + '</label>' +
                '<div class="winner-row">' +
                '<input type="text" id="cfg-winner-' + i + '" placeholder="' + i18n.t('winners.namePlaceholder') + '" value="' +
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
    container.innerHTML = '<div class="hint" style="margin-bottom:10px;text-align:left">' + i18n.t('rules.hint') + '</div>' +
    sections.map((sec, si) => {
        const items = sec.items || [];
        return '<div class="rules-admin-section" data-section-idx="' + si + '">' +
            '<div class="rules-admin-header">' +
            '<input type="text" class="rules-title-input" data-section-idx="' + si + '" value="' + (sec.title || '').replace(/"/g, '&quot;') + '" placeholder="' + i18n.t('rules.sectionName') + '">' +
            '<button class="note-remove section-remove" data-section-idx="' + si + '" title="' + i18n.t('rules.removeSection') + '">&times;</button>' +
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
            '<button class="btn rule-add" data-section-idx="' + si + '" style="margin-top:4px">' + i18n.t('rules.addRule') + '</button>' +
            '</div>';
    }).join('') +
    '<button class="btn" id="btn-add-rule-section" style="margin-top:8px">' + i18n.t('rules.addSection') + '</button>';
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
                statusHtml += '<span class="seating-rebalance-warn">' + i18n.t('seating.rebalance') + '</span>';
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
            (!isLocked ? '<span class="table-lock-free">(' + freeCount + ' ' + i18n.t('seating.free') + ')</span>' : '') +
            '<button class="btn table-lock-toggle' + (isLocked ? ' danger' : '') +
            '" data-table="' + t.id + '" style="margin-left:auto;min-width:auto;padding:8px 16px">' +
            (isLocked ? i18n.t('seating.locked') : i18n.t('seating.open')) + '</button>' +
            '<button class="btn table-rotate" data-table="' + t.id + '" style="min-width:auto;padding:8px 16px" title="' + i18n.t('seating.rotate') + '">\u21BB</button>' +
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
                '<span class="wall-toggle-label">' + i18n.t('seating.walls') + '</span>';
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
        statusEl.textContent = i18n.t('tables.saved');
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
    if (!confirm(i18n.t('tables.confirmRemove', { name: TABLES[idx].name }))) return;
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

    let runningMinutes = getRunningMinutes(state, config);

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
            const breakLabel = s.label || '';
            classes.push('break-row');
            tr.className = classes.join(' ');
            tr.innerHTML = '<td colspan="' + (anteOn ? 5 : 4) + '">' + i18n.t('label.break') + ' ' + timeStr + ' \u2013 ' + endHH + ':' + endMM +
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

function formatClock(minutes) {
    return String(Math.floor(minutes / 60) % 24).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

function renderBreaksList() {
    const container = document.getElementById('breaks-list');
    if (!container) return;
    const hasFocus = Array.from(container.querySelectorAll('input, textarea')).some(el => el === document.activeElement);
    if (hasFocus) return;

    const breaks = T.breaks || [];
    if (!breaks.length) {
        container.innerHTML = '<div style="opacity:0.4">' + i18n.t('breaks.none') + '</div>';
        return;
    }

    // Clock times of the breaks that actually landed in the structure, keyed by the level they follow
    const times = {};
    let runningMinutes = getRunningMinutes(T.state, T.config);
    let levelNum = 0;
    (T.blindStructure || []).forEach(s => {
        if (s.isBreak) times[levelNum] = formatClock(runningMinutes) + ' – ' + formatClock(runningMinutes + s.duration);
        else levelNum++;
        runningMinutes += s.duration;
    });

    container.innerHTML = breaks.map((b, i) =>
        '<div class="break-row" data-idx="' + i + '">' +
        '<div class="break-row-head">' +
        '<label>' + i18n.t('breaks.afterLevel') + '</label>' +
        '<input type="number" class="break-after" min="1" value="' + b.afterLevel + '" inputmode="numeric">' +
        '<label>' + i18n.t('breaks.duration') + '</label>' +
        '<input type="number" class="break-dur" min="1" value="' + b.duration + '" inputmode="numeric">' +
        '<span class="break-row-time">' + (times[b.afterLevel] || i18n.t('breaks.outside')) + '</span>' +
        '<button class="note-remove break-remove" title="' + i18n.t('breaks.remove') + '">&times;</button>' +
        '</div>' +
        '<input type="text" class="break-label-input" value="' + (b.label || '').replace(/"/g, '&quot;') + '" placeholder="' + i18n.t('breaks.labelPlaceholder') + '">' +
        '<textarea class="break-msg-input" rows="2" placeholder="' + i18n.t('breaks.messagePlaceholder') + '">' + (b.message || '').replace(/</g, '&lt;') + '</textarea>' +
        '</div>'
    ).join('');
    container.querySelectorAll('textarea').forEach(autofitTextarea);
}

function collectBreaks() {
    return Array.from(document.querySelectorAll('#breaks-list .break-row')).map(row => {
        const b = {
            afterLevel: parseInt(row.querySelector('.break-after').value) || 1,
            duration: parseInt(row.querySelector('.break-dur').value) || 1
        };
        const label = row.querySelector('.break-label-input').value.trim();
        const message = row.querySelector('.break-msg-input').value.trim();
        if (label) b.label = label;
        if (message) b.message = message;
        return b;
    });
}

function writeBreaks(breaks) {
    breaks.sort((a, b) => a.afterLevel - b.afterLevel);
    T.breaks = breaks;
    const p = tournamentRef.child('breaks').set(breaks);
    showSaveStatus(document.getElementById('breaks-save-status'), p);
    recalcAndSync();
}

document.getElementById('breaks-list').addEventListener('input', (e) => {
    if (e.target.tagName === 'TEXTAREA') autofitTextarea(e.target);
});

document.getElementById('breaks-list').addEventListener('change', () => writeBreaks(collectBreaks()));

document.getElementById('breaks-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.break-remove');
    if (!btn) return;
    btn.closest('.break-row').remove();
    writeBreaks(collectBreaks());
});

document.getElementById('btn-add-break').addEventListener('click', () => {
    const breaks = collectBreaks();
    const last = breaks[breaks.length - 1];
    breaks.push({
        afterLevel: last ? last.afterLevel + 4 : 4,
        duration: last ? last.duration : 15
    });
    writeBreaks(breaks);
    renderBreaksList();
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
            timerLevelEl.textContent = i18n.t('label.pause') + ' — ' + pauseMin + ':' + String(pauseSec).padStart(2, '0');
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
    T.profiles = data.profiles || {};
    TABLES = data.tables || DEFAULT_TABLES.slice();
    T.tableLocks = data.tableLocks || {};
    T.payoutConfig = data.payoutConfig || null;
    T.breaks = data.breaks || [];
    T.rules = data.rules || null;
    T.notes = data.notes || DEFAULTS.notes;
    T.eventLog = data.eventLog || [];

    // One-time migration from the old "break every N levels" config
    if (data.breaks === undefined) {
        const legacy = legacyBreaks(data);
        if (legacy.length) {
            T.breaks = legacy;
            tournamentRef.child('breaks').set(legacy);
            recalcAndSync();
        }
    }

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
    const config = {
        startingStack: parseInt(document.getElementById('cfg-stack').value) || 5000,
        levelDuration: parseInt(document.getElementById('cfg-level-dur').value) || 20,
        maxLevels: parseInt(document.getElementById('cfg-max-levels').value) || 12,
        startTime: document.getElementById('cfg-start-time-est').value || '19:00',
        bonusAmount: parseInt(document.getElementById('cfg-bonus').value) || 5000,
        buyInAmount: parseInt(document.getElementById('cfg-buyin-amount').value) || 400,
        bountyAmount: parseInt(document.getElementById('cfg-bounty-amount').value) || 0,
        addonChips: parseInt(document.getElementById('cfg-addon-chips').value) || 0,
        addonAmount: parseInt(document.getElementById('cfg-addon-amount').value) || 0,
        anteMult: parseFloat(document.getElementById('cfg-ante-mult').value) || 0,
        organizerFee: parseInt(document.getElementById('cfg-organizer-fee').value) || 0,
        waitingMessage: (document.getElementById('cfg-waiting-msg').value || '').trim() || 'Orientační začátek'
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
    if (!confirm(i18n.t('players.confirmTest'))) return;
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
    if (!confirm(i18n.t('players.confirmRemoveAll'))) return;
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
        if (list[idx] && confirm(i18n.t('players.confirmRemove', { name: list[idx].name }))) {
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
    if (!confirm(i18n.t('timer.confirmStart'))) return;
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
    if (!confirm(i18n.t('timer.confirmReset'))) return;
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
    const declared = Object.keys(winners).length;
    const allDeclared = declared >= paidPlaces && paidPlaces > 0;
    const updates = { 'state/winners': winners };
    if (allDeclared && T.state.status === 'running') {
        updates['state/status'] = 'finished';
    }
    tournamentRef.update(updates).then(() => {
        const btn = document.getElementById('btn-save-winners');
        btn.textContent = i18n.t('winners.declared');
        setTimeout(() => { btn.textContent = i18n.t('winners.declare'); }, 2000);
    });
});

document.getElementById('btn-clear-winners').addEventListener('click', () => {
    if (!confirm(i18n.t('winners.confirmClear'))) return;
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

// Rules
document.getElementById('rules-sections-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('rule-remove')) {
        if (!confirm(i18n.t('rules.confirmRemoveRule'))) return;
        const si = parseInt(e.target.closest('.rules-admin-items').dataset.sectionIdx);
        const idx = parseInt(e.target.dataset.ruleIdx);
        const rules = collectRules();
        rules[si].items.splice(idx, 1);
        T.rules = rules;
        renderRulesInputs();
        saveRules();
    }
    if (e.target.classList.contains('section-remove')) {
        if (!confirm(i18n.t('rules.confirmRemoveSection'))) return;
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
    if (!confirm(i18n.t('seating.confirmReshuffle'))) return;
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

// ─── Blind Structure Profiles ───────────────────────────────
function sanitizeProfileKey(name) {
    return name.trim().replace(/[.#$/[\]]/g, '_').slice(0, 60) || 'profil';
}

function renderProfiles() {
    const sel = document.getElementById('profile-select');
    if (!sel) return;
    const prev = sel.value;
    const keys = Object.keys(T.profiles || {});
    keys.sort((a, b) => (T.profiles[a].name || a).localeCompare(T.profiles[b].name || b, 'cs'));
    sel.innerHTML = '<option value="">' + i18n.t('profiles.none') + '</option>' +
        keys.map(k => '<option value="' + k.replace(/"/g, '&quot;') + '">' +
            (T.profiles[k].name || k).replace(/</g, '&lt;') + '</option>').join('');
    if (T.profiles[prev]) sel.value = prev;
}

document.getElementById('btn-profile-save').addEventListener('click', () => {
    const nameEl = document.getElementById('profile-name');
    const name = (nameEl.value || '').trim();
    if (!name) { nameEl.focus(); return; }
    const key = sanitizeProfileKey(name);
    if (T.profiles[key] && !confirm(i18n.t('profiles.confirmOverwrite', { name: name }))) return;
    const profile = {
        name: name,
        savedAt: serverNow(),
        config: { ...T.config },
        blindOverrides: T.blindOverrides || {},
        breaks: T.breaks || []
    };
    tournamentRef.child('profiles/' + key).set(profile).then(() => {
        nameEl.value = '';
        const sel = document.getElementById('profile-select');
        if (sel) sel.value = key;
        const btn = document.getElementById('btn-profile-save');
        btn.textContent = i18n.t('profiles.saved');
        setTimeout(() => { btn.textContent = i18n.t('profiles.save'); }, 1500);
    });
});

document.getElementById('btn-profile-load').addEventListener('click', () => {
    const sel = document.getElementById('profile-select');
    const key = sel.value;
    if (!key || !T.profiles[key]) return;
    const profile = T.profiles[key];
    if (!confirm(i18n.t('profiles.confirmLoad', { name: profile.name || key }))) return;
    const config = { ...DEFAULTS.config, ...(profile.config || {}) };
    const blindOverrides = profile.blindOverrides || {};
    const breaks = profile.breaks || [];
    T.config = config;
    T.blindOverrides = blindOverrides;
    T.breaks = breaks;
    const totalChips = recalcTotalChips();
    const structure = calculateBlinds(config, totalChips, -1);
    applyOverrides(structure, blindOverrides);
    tournamentRef.update({
        'config': config,
        'blindOverrides': blindOverrides,
        'breaks': breaks,
        'blindStructure': structure,
        'players/totalChips': totalChips
    });
    render();
});

document.getElementById('btn-profile-delete').addEventListener('click', () => {
    const sel = document.getElementById('profile-select');
    const key = sel.value;
    if (!key || !T.profiles[key]) return;
    if (!confirm(i18n.t('profiles.confirmDelete', { name: T.profiles[key].name || key }))) return;
    tournamentRef.child('profiles/' + key).remove();
    sel.value = '';
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

// ─── Contents Nav ───────────────────────────────────────────
function buildSectionNav() {
    const nav = document.getElementById('section-nav');
    if (!nav) return;
    nav.innerHTML = '';
    document.querySelectorAll('.admin-wrap > .section[id]').forEach(sec => {
        const h2 = sec.querySelector('h2');
        if (!h2) return;
        const clone = h2.cloneNode(true);
        clone.querySelectorAll('.guard-toggle, .badge').forEach(el => el.remove());
        const a = document.createElement('a');
        a.href = '#' + sec.id;
        a.textContent = clone.textContent.trim();
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const y = sec.getBoundingClientRect().top + window.pageYOffset - nav.offsetHeight - 8;
            window.scrollTo({ top: y, behavior: 'smooth' });
        });
        nav.appendChild(a);
    });
}
buildSectionNav();

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
        const prev = sel.value;
        sel.innerHTML = '';
        sel.appendChild(new Option(i18n.t('sounds.none'), ''));
        for (const f of ALL_SOUND_FILES) sel.appendChild(new Option(f, f));
        sel.value = prev;
    }
}
populateSoundSelects();

function testSound(selectId) {
    const file = document.getElementById(selectId).value;
    if (!file) return;
    new Audio('../../assets/sfx/' + file).play().catch(() => {});
}

const SOUND_BINDINGS = [
    { selectId: 'cfg-level-sound',        testBtnId: 'btn-test-sound',              ref: 'levelSound' },
    { selectId: 'cfg-knockout-sound',     testBtnId: 'btn-test-knockout-sound',     ref: 'knockoutSound' },
    { selectId: 'cfg-knockout-win-sound', testBtnId: 'btn-test-knockout-win-sound', ref: 'knockoutWinSound' },
    { selectId: 'cfg-buy-sound',          testBtnId: 'btn-test-buy-sound',          ref: 'buySound' },
    { selectId: 'cfg-end-sound',          testBtnId: 'btn-test-end-sound',          ref: 'endSound' }
];
SOUND_BINDINGS.forEach(({ selectId, testBtnId, ref }) => {
    document.getElementById(selectId).addEventListener('change', (e) => {
        tournamentRef.child(ref).set(e.target.value);
    });
    document.getElementById(testBtnId).addEventListener('click', () => testSound(selectId));
});

// Clear event log
document.getElementById('btn-clear-event-log').addEventListener('click', () => {
    if (!confirm(i18n.t('log.confirmClear'))) return;
    tournamentRef.child('eventLog').set(null);
    T.eventLog = [];
    renderEventLog();
});

// ─── Language ───────────────────────────────────────────────
function updateLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('accent', btn.dataset.lang === i18n.getLang());
    });
}
updateLangButtons();

document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        i18n.setLang(btn.dataset.lang);
        i18n.applyI18n();
        updateLangButtons();
        populateSoundSelects();
        buildSectionNav();
        render();
    });
});
