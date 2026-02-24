// ─── Password Gate ──────────────────────────────────────────
const ADMIN_PASS = 'nezdrzuj';

function checkGate() {
    if (sessionStorage.getItem('adminAuth') === '1') return;
    const input = prompt('Heslo:');
    if (input === ADMIN_PASS) {
        sessionStorage.setItem('adminAuth', '1');
    } else {
        document.body.innerHTML = '';
    }
}
checkGate();

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
db.ref('.info/connected').on('value', (snap) => {
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (snap.val() === true) {
        dot.classList.add('connected');
        txt.textContent = 'Online';
    } else {
        dot.classList.remove('connected');
        txt.textContent = 'Offline';
    }
});

// ─── Table Definitions ──────────────────────────────────────
const TABLES = [
    { id: 1, name: 'Červený', color: '#c0392b', shape: 'oval', seats: 8 },
    { id: 2, name: 'Černý', color: '#2c3e50', shape: 'rect', seats: 6 },
    { id: 3, name: 'Zelený', color: '#27ae60', shape: 'rect', seats: 6 }
];

function getSeats(table) {
    const tl = (T.tableLocks || {})[table.id] || {};
    return tl.seatCount || table.seats;
}

// ─── Default data ───────────────────────────────────────────
const DEFAULTS = {
    config: {
        startingStack: 5000,
        levelDuration: 20,
        maxLevels: 12,
        smallestChip: 25,
        bonusAmount: 5000,
        levelsPerBreak: 0,
        breakDuration: 30,
        startTime: '19:00',
        buyInAmount: 400,
        addonChips: 0,
        addonAmount: 0,
        addonCutoff: 0,
        maxBB: 10000,
        blindCurve: 1.0,
        anteMult: 0,
        date: ''
    },
    state: {
        status: 'waiting',
        startedAt: 0,
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
    breakMessage: '',
    notes: [
        'Buy-in a re-buy neomezeně, ale jen do konce přestávky',
        'Nepřítomným hráčům se automaticky platí blindy a foldují karty',
        'Kouřit choďte po jednom, ať zbytek stolu může hrát'
    ]
};

let T = JSON.parse(JSON.stringify(DEFAULTS));
T.notes = DEFAULTS.notes.slice();

// ─── Blind Calculation ──────────────────────────────────────
function roundToChip(val, chip) {
    let unit;
    if (val >= 1000) unit = 100;
    else if (val >= 100) unit = 25;
    else if (val >= 10) unit = 5;
    else unit = 1;
    return Math.max(chip, Math.round(val / unit) * unit);
}

function calculateBlinds(config, totalChips, freezeUpTo) {
    const { levelDuration, smallestChip } = config;
    const numLevels = Math.max(2, config.maxLevels || 12);
    const lpb = config.levelsPerBreak || 0;
    const breakDur = config.breakDuration || 30;
    const curve = config.blindCurve || 1.0;
    const maxBB = config.maxBB || 10000;

    const ceilingSmall = totalChips > 0
        ? roundToChip(totalChips / 3, smallestChip) / 2
        : Infinity;

    const startSB = smallestChip;
    const targetSB = Math.min(maxBB / 2, ceilingSmall);

    function generateCurve(N, fromSB, toSB) {
        const raw = [];
        if (N <= 1) { raw.push(fromSB); return raw; }
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1);
            raw.push(roundToChip(fromSB * Math.pow(toSB / fromSB, Math.pow(t, curve)), smallestChip));
        }
        return raw;
    }

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
            const lastSB = lastBlind ? lastBlind.small : startSB;
            const ratio = targetSB > startSB ? Math.log(lastSB / startSB) / Math.log(targetSB / startSB) : 1;
            const tStart = Math.pow(Math.min(1, Math.max(0, ratio)), 1 / curve);

            for (let i = 1; i <= remaining; i++) {
                const t = tStart + (1 - tStart) * (i / remaining);
                const sb = Math.min(roundToChip(startSB * Math.pow(targetSB / startSB, Math.pow(t, curve)), smallestChip), ceilingSmall);
                levels.push({ small: sb, big: sb * 2, duration: levelDuration });
            }
        }
    } else {
        const sbValues = generateCurve(numLevels, startSB, targetSB);
        for (const sb of sbValues) {
            const capped = Math.min(sb, ceilingSmall);
            levels.push({ small: capped, big: capped * 2, duration: levelDuration });
        }
    }

    if (lpb > 0) {
        let blindCount = 0;
        for (let i = 0; i < levels.length; i++) {
            if (levels[i].isBreak) continue;
            blindCount++;
            if (blindCount % lpb === 0) {
                const remainingBlinds = levels.slice(i + 1).some(l => !l.isBreak);
                if (!remainingBlinds) break;
                if (i + 1 < levels.length && levels[i + 1].isBreak) continue;
                levels.splice(i + 1, 0, {
                    small: 0, big: 0,
                    duration: breakDur,
                    isBreak: true
                });
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

function getCurrentLevel(startedAt, blindStructure) {
    const struct = blindStructure || [];
    if (!struct.length) return { levelIndex: 0, remaining: 0 };
    const elapsed = serverNow() - startedAt;
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
    });
}

// ─── Rendering ──────────────────────────────────────────────
function render() {
    const { config, state, players, blindStructure } = T;
    const list = players.list || [];
    const stats = derivePlayerStats(list);
    const struct = blindStructure || [];
    const paidPlaces = getPaidPlaces();

    // Status bar
    const statusLabel = { waiting: 'Čeká se', running: 'Běží', finished: 'Ukončen' };
    document.getElementById('status-players').textContent =
        stats.activePlayers + '/' + stats.buyIns + ' hráčů';
    document.getElementById('player-count').textContent = stats.buyIns;

    // Timer section
    const derived = (state.status === 'running' && state.startedAt)
        ? getCurrentLevel(state.startedAt, struct)
        : { levelIndex: 0, remaining: 0 };
    const lvl = derived.levelIndex;
    const curEntry = struct[lvl];
    const onBreak = curEntry && curEntry.isBreak;

    const timerLevelEl = document.getElementById('timer-level');
    if (state.status === 'running' && curEntry) {
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

    // Start/Reset button labels
    document.getElementById('btn-start').textContent =
        state.status === 'running' ? 'Běží...' : 'Start';
    document.getElementById('btn-start').disabled = state.status === 'running';

    // Auto-lock config when tournament starts (guard-based, still unlockable)
    if (state.status !== 'waiting' && !configAutoLocked) {
        configAutoLocked = true;
        setGuardLocked('section-config', true);
    } else if (state.status === 'waiting') {
        configAutoLocked = false;
    }

    // Populate config inputs
    const ids = {
        'cfg-stack': config.startingStack,
        'cfg-level-dur': config.levelDuration,
        'cfg-max-levels': config.maxLevels,
        'cfg-smallest': config.smallestChip,
        'cfg-bonus': config.bonusAmount,
        'cfg-levels-per-break': config.levelsPerBreak,
        'cfg-break-dur': config.breakDuration,
        'cfg-buyin-amount': config.buyInAmount,
        'cfg-addon-chips': config.addonChips,
        'cfg-addon-amount': config.addonAmount,
        'cfg-start-time-est': config.startTime,
        'cfg-max-bb': config.maxBB,
        'cfg-blind-curve': config.blindCurve,
        'cfg-ante-mult': config.anteMult
    };
    for (const [id, val] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = val;
    }
    const curveLabel = document.getElementById('blind-curve-val');
    if (curveLabel) curveLabel.textContent = parseFloat(config.blindCurve || 1.0).toFixed(1);

    // Chip totals in config
    const chipTotalsEl = document.getElementById('chip-totals');
    if (chipTotalsEl) {
        const totalChips = recalcTotalChips();
        const avg = stats.activePlayers > 0 ? Math.round(totalChips / stats.activePlayers) : 0;
        chipTotalsEl.textContent = totalChips.toLocaleString('cs') + ' celkem | ' + avg.toLocaleString('cs') + ' průměr';
    }

    // Player list
    renderPlayerList();
    const sumEl = document.getElementById('player-summary');
    if (sumEl) {
        sumEl.textContent = 'Buy-in\u016F: ' + stats.totalBuys + ' | Re-buy: ' + stats.rebuys +
            ' | Add-on: ' + stats.addons + ' | Bonus: ' + stats.bonuses +
            ' | Aktivních: ' + stats.activePlayers;
    }

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
    const noteInputs = document.querySelectorAll('#notes-list input');
    const noteHasFocus = Array.from(noteInputs).some(el => el === document.activeElement);
    if (!noteHasFocus) renderNoteInputs();

    // Break message
    const breakMsgInput = document.getElementById('cfg-break-message');
    if (breakMsgInput && document.activeElement !== breakMsgInput) {
        breakMsgInput.value = T.breakMessage || '';
    }

    // Table locks
    renderTableLocks();

    // Blind structure table
    renderBlindStructure();
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
    container.innerHTML = html;
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
    if (!hasFocus || currentFields.length !== paidPlaces) {
        let html = '';
        for (let i = 1; i <= paidPlaces; i++) {
            html += '<div class="winner-field">' +
                '<label>' + i + '. místo</label>' +
                '<input type="text" id="cfg-winner-' + i + '" placeholder="Jméno hráče..." value="' +
                ((winners[i] || '').replace(/"/g, '&quot;')) + '">' +
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
        '<input type="text" value="' + note.replace(/"/g, '&quot;') + '" data-note-idx="' + i + '">' +
        '<button class="note-remove" data-note-idx="' + i + '">&times;</button>' +
        '</div>'
    ).join('');
}

function saveNotes() {
    const inputs = document.querySelectorAll('#notes-list input');
    const notes = Array.from(inputs).map(el => el.value.trim()).filter(Boolean);
    const p = tournamentRef.child('notes').set(notes);
    showSaveStatus(document.getElementById('notes-save-status'), p);
}

// ─── Table Locks ────────────────────────────────────────────
function renderTableLocks() {
    const container = document.getElementById('table-locks-ui');
    if (!container) return;
    const locks = T.tableLocks || {};
    const list = T.players.list || [];
    const occupied = new Set();
    list.forEach(p => { if (p.table && p.seat) occupied.add(p.table + '-' + p.seat); });

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
            '</div>';

        if (!isLocked) {
            html += '<div class="seat-count-row">' +
                '<label>Míst: ' + getSeats(t) + '</label>' +
                '<input type="range" class="table-seat-count" data-table="' + t.id +
                '" min="2" max="' + (t.shape === 'oval' ? 10 : 8) + '" value="' + getSeats(t) + '">' +
                '</div>';
            html += '<div class="seat-grid">';
            for (let s = 1; s <= getSeats(t); s++) {
                const seatLocked = lockedSeats.includes(s);
                html += '<button class="seat-btn seat-lock-toggle' + (seatLocked ? ' locked' : '') +
                    '" data-table="' + t.id + '" data-seat="' + s + '">' +
                    s + (seatLocked ? ' \u2717' : '') + '</button>';
            }
            html += '</div>';
        }
        html += '</div>';
    });
    container.innerHTML = html;
}

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
            classes.push('break-row');
            tr.className = classes.join(' ');
            tr.innerHTML = '<td colspan="' + (anteOn ? 5 : 4) + '">PŘESTÁVKA ' + timeStr + ' \u2013 ' + endHH + ':' + endMM + '</td>';
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
                '<td>' + s.big.toLocaleString('cs') + '</td>' + anteCell;
        }
        runningMinutes += s.duration;
        tbody.appendChild(tr);
    });
}

// ─── Timer Loop ─────────────────────────────────────────────
let prevLevel = -1;
setInterval(() => {
    const { state, blindStructure } = T;
    const struct = blindStructure || [];
    const timerEl = document.getElementById('timer-display');

    if (state.status === 'running' && state.startedAt) {
        const derived = getCurrentLevel(state.startedAt, struct);
        timerEl.textContent = formatTime(derived.remaining);
        timerEl.classList.toggle('warning', derived.remaining <= 30000 && derived.remaining > 0);
        document.getElementById('status-timer').textContent = formatTime(derived.remaining);

        if (prevLevel >= 0 && derived.levelIndex !== prevLevel) {
            render();
        }
        prevLevel = derived.levelIndex;
    } else {
        const duration = (struct[0]?.duration || 20) * 60000;
        timerEl.textContent = formatTime(duration);
        timerEl.classList.remove('warning');
        document.getElementById('status-timer').textContent = '';
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
    T.tableLocks = data.tableLocks || {};
    T.payoutConfig = data.payoutConfig || null;
    T.breakMessage = data.breakMessage || '';
    T.notes = data.notes || DEFAULTS.notes;

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
        smallestChip: parseInt(document.getElementById('cfg-smallest').value) || 25,
        bonusAmount: parseInt(document.getElementById('cfg-bonus').value) || 5000,
        levelsPerBreak: parseInt(document.getElementById('cfg-levels-per-break').value) || 0,
        breakDuration: parseInt(document.getElementById('cfg-break-dur').value) || 30,
        buyInAmount: parseInt(document.getElementById('cfg-buyin-amount').value) || 400,
        addonChips: parseInt(document.getElementById('cfg-addon-chips').value) || 0,
        addonAmount: parseInt(document.getElementById('cfg-addon-amount').value) || 0,
        addonCutoff: T.config.addonCutoff || 0,
        maxBB: parseInt(document.getElementById('cfg-max-bb').value) || 10000,
        blindCurve: parseFloat(document.getElementById('cfg-blind-curve').value) || 1.0,
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

document.getElementById('cfg-blind-curve').addEventListener('input', (e) => {
    document.getElementById('blind-curve-val').textContent = parseFloat(e.target.value).toFixed(1);
    saveConfig();
});

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
        if (btn.dataset.dir === '-') {
            if (list[idx].buys > 1) list[idx].buys--;
        } else {
            list[idx].buys++;
            list[idx].active = true;
        }
        savePlayerList();
        render();
        return;
    }

    if (btn.classList.contains('player-toggle')) {
        const idx = parseInt(btn.dataset.idx);
        const field = btn.dataset.field;
        if (list[idx] && field) {
            list[idx][field] = !list[idx][field];
            savePlayerList();
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
    tournamentRef.child('blindOverrides').set({});
    tournamentRef.child('payoutConfig').set(null);
    recalcAndSync();
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
        btn.textContent = 'Turnaj ukončen \u2713';
        setTimeout(() => { btn.textContent = 'Ukončit turnaj'; }, 2000);
    });
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
    const inputs = document.querySelectorAll('#notes-list input');
    if (inputs.length) inputs[inputs.length - 1].focus();
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
    const inputs = notesList.querySelectorAll('input');
    inputs.forEach(el => { T.notes[parseInt(el.dataset.noteIdx)] = el.value; });
    const moved = T.notes.splice(dragIdx, 1)[0];
    T.notes.splice(dropIdx, 0, moved);
    renderNoteInputs();
    saveNotes();
});

// Break message
document.getElementById('cfg-break-message').addEventListener('change', () => {
    const val = (document.getElementById('cfg-break-message').value || '').trim();
    const p = tournamentRef.child('breakMessage').set(val);
    showSaveStatus(document.getElementById('break-save-status'), p);
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
});

document.getElementById('table-locks-ui').addEventListener('input', (e) => {
    if (!e.target.classList.contains('table-seat-count')) return;
    const tableId = parseInt(e.target.dataset.table);
    const val = parseInt(e.target.value);
    const locks = T.tableLocks || {};
    const tl = locks[tableId] || {};
    tl.seatCount = val;
    if (tl.lockedSeats) tl.lockedSeats = tl.lockedSeats.filter(s => s <= val);
    locks[tableId] = tl;
    T.tableLocks = locks;

    const list = T.players.list || [];
    const lockedSeats = tl.lockedSeats || [];
    const displaced = [];
    const occupied = new Set();
    list.forEach(p => {
        if (p.table === tableId && p.seat) {
            if (p.seat > val || lockedSeats.includes(p.seat)) {
                displaced.push(p);
                delete p.table;
                delete p.seat;
            } else {
                occupied.add(p.seat);
            }
        }
    });
    displaced.forEach(p => {
        for (let s = 1; s <= val; s++) {
            if (!occupied.has(s) && !lockedSeats.includes(s)) {
                p.table = tableId;
                p.seat = s;
                occupied.add(s);
                break;
            }
        }
    });

    tournamentRef.child('tableLocks').set(locks);
    savePlayerList();
    render();
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
    const val = parseInt(e.target.value);
    if (!level || isNaN(val) || val <= 0) return;

    const totalChips = recalcTotalChips();
    let freezeUpTo = -1;
    if (T.state.status === 'running' && T.state.startedAt) {
        freezeUpTo = getCurrentLevel(T.state.startedAt, T.blindStructure).levelIndex;
    }
    const baseStructure = calculateBlinds(T.config, totalChips, freezeUpTo);
    let calcSmall = 0, bn = 0;
    for (const be of baseStructure) {
        if (be.isBreak) continue;
        bn++;
        if (bn === level) { calcSmall = be.small; break; }
    }

    if (val === calcSmall) {
        delete T.blindOverrides[level];
    } else {
        T.blindOverrides[level] = { small: val, big: val * 2 };
    }

    tournamentRef.child('blindOverrides').set(T.blindOverrides);
    recalcAndSync();
});

document.getElementById('structure-body').addEventListener('click', (e) => {
    if (!e.target.classList.contains('blind-reset')) return;
    const level = parseInt(e.target.dataset.level);
    if (!level) return;
    delete T.blindOverrides[level];
    tournamentRef.child('blindOverrides').set(T.blindOverrides);
    recalcAndSync();
});

// ─── Guard Toggles ──────────────────────────────────────────
const guardState = JSON.parse(localStorage.getItem('adminGuards') || '{}');
let configAutoLocked = false;

function setGuardLocked(id, locked) {
    const section = document.getElementById(id);
    const btn = document.querySelector('.guard-toggle[data-target="' + id + '"]');
    if (!section || !btn) return;
    section.classList.toggle('guarded', locked);
    btn.textContent = locked ? '\u{1F512}' : '\u{1F513}';
    guardState[id] = !locked;
    localStorage.setItem('adminGuards', JSON.stringify(guardState));
}

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
