// ─── Firebase Init ──────────────────────────────────────────
firebase.initializeApp({
    apiKey: "AIzaSyAfQqQYYn8pId99FbqIqX72LH6kOlosunQ",
    authDomain: "smelo-turnaj.firebaseapp.com",
    databaseURL: "https://smelo-turnaj-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "smelo-turnaj"
});

const db = firebase.database();
const tournamentRef = db.ref('tournament');
const ADMIN_PASSWORD = 'nezdrzuj';
let isAdmin = location.search.includes('admin');
// TODO: re-enable admin password check
// let isAdmin = false;
// if (location.search.includes('admin')) {
//     if (localStorage.getItem('adminAuth') === ADMIN_PASSWORD) {
//         isAdmin = true;
//     } else {
//         const pwd = prompt('Heslo pro admin:');
//         if (pwd === ADMIN_PASSWORD) {
//             isAdmin = true;
//             localStorage.setItem('adminAuth', pwd);
//         }
//     }
// }

function applyAdminMode() {
    document.getElementById('admin-panel').style.display = isAdmin ? '' : 'none';
    document.getElementById('btn-toggle-admin').style.display = isAdmin ? '' : 'none';
}
applyAdminMode();
const adminDetails = document.querySelector('#admin-panel details');
if (localStorage.getItem('adminOpen') === '1') {
    adminDetails.open = true;
    document.getElementById('tracker-footer').style.display = 'none';
}
adminDetails.addEventListener('toggle', (e) => {
    document.getElementById('tracker-footer').style.display = e.target.open ? 'none' : '';
    localStorage.setItem('adminOpen', e.target.open ? '1' : '0');
});

document.body.classList.add('wide');

// Zoom controls
let zoomLevel = 100;
document.getElementById('zoom-in').addEventListener('click', () => {
    zoomLevel = Math.min(200, zoomLevel + 10);
    document.body.style.zoom = zoomLevel + '%';
});
document.getElementById('zoom-out').addEventListener('click', () => {
    zoomLevel = Math.max(50, zoomLevel - 10);
    document.body.style.zoom = zoomLevel + '%';
});

// Ticker toggle
let tickerHidden = localStorage.getItem('tickerHidden') === '1';
const tickerBtn = document.getElementById('btn-toggle-ticker');
function updateTickerBtn() {
    tickerBtn.style.opacity = tickerHidden ? '0.4' : '';
}
updateTickerBtn();
tickerBtn.addEventListener('click', () => {
    tickerHidden = !tickerHidden;
    localStorage.setItem('tickerHidden', tickerHidden ? '1' : '0');
    updateTickerBtn();
    render();
});

// Seating visual toggle
let seatingHidden = localStorage.getItem('seatingHidden') === '1';
const seatingBtn = document.getElementById('btn-toggle-seating');
function updateSeatingBtn() {
    seatingBtn.style.opacity = seatingHidden ? '0.4' : '';
    document.querySelector('.seating-section').style.display = seatingHidden ? 'none' : '';
}
updateSeatingBtn();
seatingBtn.addEventListener('click', () => {
    seatingHidden = !seatingHidden;
    localStorage.setItem('seatingHidden', seatingHidden ? '1' : '0');
    updateSeatingBtn();
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

// Table tab selector for sidebar seating visual
let selectedTable = parseInt(localStorage.getItem('tvTable')) || 1;

function selectTable(tableId) {
    selectedTable = tableId;
    localStorage.setItem('tvTable', tableId);
    renderTableTabs();
    renderSeatingView(tableId);
}

function renderTableTabs() {
    const container = document.getElementById('table-tabs');
    if (!container) return;
    container.innerHTML = TABLES.map(t =>
        '<div class="table-tab' + (t.id === selectedTable ? ' active' : '') +
        '" data-table="' + t.id + '" style="background:' + t.color + '" title="' + t.name + '"></div>'
    ).join('');
}

document.getElementById('table-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.table-tab');
    if (tab) selectTable(parseInt(tab.dataset.table));
});

renderTableTabs();

// Fullscreen toggle
document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen().catch(() => {});
    }
});


// Header tap to toggle controls
document.getElementById('header-controls').addEventListener('click', (e) => {
    e.stopPropagation();
});
document.querySelector('.tracker-header').addEventListener('click', () => {
    document.querySelector('.tracker-header').classList.toggle('collapsed');
});

// Admin toggle
document.getElementById('btn-toggle-admin').addEventListener('click', () => {
    const params = new URLSearchParams(location.search);
    if (params.has('admin')) {
        params.delete('admin');
        isAdmin = false;
    } else {
        params.set('admin', '');
        isAdmin = true;
    }
    applyAdminMode();
    const qs = params.toString().replace(/=(&|$)/g, '$1');
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
});

// ─── Wake Lock (keep screen on) ─────────────────────────────
let wakeLock = null;
async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) {}
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
});
requestWakeLock();

// ─── Server Time Sync ────────────────────────────────────────
let serverTimeOffset = 0;
db.ref('.info/serverTimeOffset').on('value', (snap) => {
    serverTimeOffset = snap.val() || 0;
});
function serverNow() { return Date.now() + serverTimeOffset; }

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
    // Pick the table with fewest players (random tiebreak)
    const minCount = Math.min(...tableIds.map(id => tableCount[id] || 0));
    const candidates = tableIds.filter(id => (tableCount[id] || 0) === minCount);
    const tableId = candidates[Math.floor(Math.random() * candidates.length)];
    const seats = freeByTable[tableId];
    const seat = seats[Math.floor(Math.random() * seats.length)];
    player.table = tableId;
    player.seat = seat;
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
        status: 'waiting',   // waiting | running | finished
        startedAt: 0,
        winners: {}       // { "1": "Franta", "2": "Humr", ... }
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

// Local mirror
let T = JSON.parse(JSON.stringify(DEFAULTS));
T.notes = DEFAULTS.notes.slice();
let renderNoteInputs = null;
let renderTableLocksAdmin = null;

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
        // Freeze existing entries up to and including freezeUpTo
        const frozen = Math.min(freezeUpTo + 1, T.blindStructure.length);
        for (let i = 0; i < frozen; i++) {
            levels.push({ ...T.blindStructure[i] });
        }

        // Count only real blind levels among frozen entries
        const frozenBlindCount = levels.filter(l => !l.isBreak).length;
        const remaining = numLevels - frozenBlindCount;

        if (remaining > 0) {
            const lastBlind = [...levels].reverse().find(l => !l.isBreak);
            const lastSB = lastBlind ? lastBlind.small : startSB;

            // Find the t value corresponding to lastSB on the curve
            // sb = startSB * (targetSB/startSB)^(t^curve)  →  t = (log(sb/startSB) / log(targetSB/startSB))^(1/curve)
            const ratio = targetSB > startSB ? Math.log(lastSB / startSB) / Math.log(targetSB / startSB) : 1;
            const tStart = Math.pow(Math.min(1, Math.max(0, ratio)), 1 / curve);

            // Generate remaining levels from tStart to 1
            for (let i = 1; i <= remaining; i++) {
                const t = tStart + (1 - tStart) * (i / remaining);
                const sb = Math.min(roundToChip(startSB * Math.pow(targetSB / startSB, Math.pow(t, curve)), smallestChip), ceilingSmall);
                levels.push({ small: sb, big: sb * 2, duration: levelDuration });
            }
        }
    } else {
        // Fresh calculation using curve
        const sbValues = generateCurve(numLevels, startSB, targetSB);
        for (const sb of sbValues) {
            const capped = Math.min(sb, ceilingSmall);
            levels.push({ small: capped, big: capped * 2, duration: levelDuration });
        }
    }

    // Insert breaks every N blind levels
    if (lpb > 0) {
        // Count breaks already present in frozen section
        const frozenBreakPositions = new Set();
        if (freezeUpTo >= 0) {
            let blindCount = 0;
            for (let i = 0; i < levels.length && i <= freezeUpTo; i++) {
                if (levels[i].isBreak) {
                    frozenBreakPositions.add(i);
                } else {
                    blindCount++;
                }
            }
        }

        // Walk through levels, count blind levels, insert breaks at every N-th
        let blindCount = 0;
        for (let i = 0; i < levels.length; i++) {
            if (levels[i].isBreak) continue;
            blindCount++;
            if (blindCount % lpb === 0) {
                // Don't insert after the very last blind level
                const remainingBlinds = levels.slice(i + 1).some(l => !l.isBreak);
                if (!remainingBlinds) break;
                // Check if there's already a break right after this position
                if (i + 1 < levels.length && levels[i + 1].isBreak) continue;
                levels.splice(i + 1, 0, {
                    small: 0, big: 0,
                    duration: breakDur,
                    isBreak: true
                });
                i++; // skip the just-inserted break
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

// ─── Derived State ─────────────────────────────────────────
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
    // Past all levels — stay on last level at 00:00
    return { levelIndex: struct.length - 1, remaining: 0 };
}

// ─── Payout Calculation ──────────────────────────────────────
const PAYOUT_STRUCTURES = {
    1: [100],
    2: [65, 35],
    3: [50, 30, 20]
};

function getAutoPayoutDistribution(paidPlaces) {
    if (paidPlaces <= 0) return [];
    if (PAYOUT_STRUCTURES[paidPlaces]) return PAYOUT_STRUCTURES[paidPlaces].slice();
    // 4+ spots: 1st=40%, 2nd=25%, 3rd=18%, rest split evenly
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
    // Adjust 1st place so total matches prize pool exactly
    const diff = prizePool - amounts.reduce((s, v) => s + v, 0);
    amounts[0] += diff;
    return amounts;
}

function renderPayout() {
    const { players, config, state } = T;
    const list = players.list || [];
    const stats = derivePlayerStats(list);
    const buyIns = stats.buyIns;
    const buyInAmount = config.buyInAmount || 400;
    const addonPrice = config.addonAmount || 0;
    const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
    const paidPlaces = getPaidPlaces();
    const dist = getPayoutDistribution(paidPlaces);

    document.getElementById('hd-pool').textContent = prizePool.toLocaleString('cs') + ' Kč';
    document.getElementById('hd-places').textContent = paidPlaces;
    document.getElementById('hd-places-label').textContent =
        paidPlaces === 1 ? 'vítěz' : paidPlaces <= 4 ? 'výherci' : 'výherců';


    const tbody = document.getElementById('payout-body');
    tbody.innerHTML = '';
    const amounts = roundPayouts(dist, prizePool);
    dist.forEach((pct, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + (i + 1) + '.</td>' +
            '<td>' + pct + '%</td>' +
            '<td>' + amounts[i].toLocaleString('cs') + ' Kč</td>';
        tbody.appendChild(tr);
    });

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

// ─── Seating View Rendering ─────────────────────────────────
// Seat positions as % of container (left, top) for each shape
const SEAT_POSITIONS = {
    oval: [
        // 8 seats clockwise: bottom-left, bottom-right, right-bottom, right-top, top-right, top-left, left-top, left-bottom
        { left: 35, top: 95 },  // 1
        { left: 65, top: 95 },  // 2
        { left: 92, top: 72 },  // 3
        { left: 92, top: 28 },  // 4
        { left: 65, top: 5 },   // 5
        { left: 35, top: 5 },   // 6
        { left: 8,  top: 28 },  // 7
        { left: 8,  top: 72 }   // 8
    ],
    rect: [
        // 8 seats clockwise, 2 per side
        { left: 35, top: 95 },  // 1  bottom-left
        { left: 65, top: 95 },  // 2  bottom-right
        { left: 95, top: 70 },  // 3  right-bottom
        { left: 95, top: 30 },  // 4  right-top
        { left: 65, top: 5 },   // 5  top-right
        { left: 35, top: 5 },   // 6  top-left
        { left: 5,  top: 30 },  // 7  left-top
        { left: 5,  top: 70 }   // 8  left-bottom
    ]
};

let lastPlacedSeat = null; // { table, seat }
let lastPlacedTimer = null;

function setLastPlaced(tableId, seat) {
    lastPlacedSeat = { table: tableId, seat: seat };
    if (lastPlacedTimer) clearTimeout(lastPlacedTimer);
    lastPlacedTimer = setTimeout(() => { lastPlacedSeat = null; }, 4000);
}

function buildTableVisualHTML(table, opts) {
    opts = opts || {};
    const list = T.players.list || [];
    const positions = SEAT_POSITIONS[table.shape];
    const seatMap = {};
    list.forEach(p => {
        if (p.table === table.id && p.seat) seatMap[p.seat] = p.name;
    });
    const locks = T.tableLocks || {};
    const tl = locks[table.id] || {};
    const lockedSeats = tl.lockedSeats || [];
    const walls = tl.walls || [];
    const rot = tl.rotation || 0;
    const counterRot = rot ? 'rotate(' + (-rot) + 'deg)' : '';

    let html = '<div class="seating-table-surface ' + table.shape + '" style="border-color:' + table.color + ';background:' + table.color + '22"></div>';

    // Wall indicators (clickable in admin)
    ['top', 'bottom', 'left', 'right'].forEach(side => {
        const active = walls.includes(side);
        if (opts.wallToggles) {
            html += '<div class="seating-wall seating-wall-' + side + ' wall-clickable' + (active ? ' active' : '') + '" data-table="' + table.id + '" data-wall="' + side + '"></div>';
        } else if (active) {
            html += '<div class="seating-wall seating-wall-' + side + '"></div>';
        }
    });

    for (let s = 1; s <= getSeats(table); s++) {
        const pos = positions[s - 1];
        const player = seatMap[s];
        const seatLocked = lockedSeats.includes(s);
        const isLastPlaced = lastPlacedSeat && lastPlacedSeat.table === table.id && lastPlacedSeat.seat === s;
        const cls = (seatLocked ? 'locked' : (player ? 'occupied' : 'empty')) + (isLastPlaced ? ' last-placed' : '');
        const seatStyle = 'left:' + pos.left + '%;top:' + pos.top + '%' + (counterRot ? ';transform:translate(-50%,-50%) ' + counterRot : '');
        html += '<div class="seating-seat ' + cls + '" style="' + seatStyle + '">' +
            '<div class="seating-seat-num">' + s + '</div>' +
            '<div class="seating-seat-name">' + (seatLocked ? '✗' : (player || '—')) + '</div>' +
            '</div>';
    }
    return html;
}

function renderSeatingView(tableId) {
    const table = TABLES.find(t => t.id === tableId);
    if (!table) return;
    const visual = document.getElementById('seating-table-visual');
    const locks = T.tableLocks || {};
    const tl = locks[table.id] || {};
    const rot = tl.rotation || 0;
    visual.style.transform = rot ? 'rotate(' + rot + 'deg)' : '';
    if (tl.locked) {
        visual.innerHTML = '<div class="seating-table-surface ' + table.shape + '" style="border-color:' + table.color + ';background:' + table.color + '22;opacity:0.4"></div>' +
            '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--text-muted);font-size:0.8em;z-index:1">Zamčený</div>';
        return;
    }
    visual.innerHTML = buildTableVisualHTML(table);
}

// ─── Rendering ──────────────────────────────────────────────
function formatTime(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function render() {
    const { config, state, players, blindStructure } = T;

    // Header stats (derived from player list)
    const list = players.list || [];
    const stats = derivePlayerStats(list);
    document.getElementById('hd-active').textContent = stats.activePlayers;
    document.getElementById('remaining-count').textContent = stats.activePlayers;
    document.getElementById('remaining-verb').textContent = stats.activePlayers >= 5 ? 'zbývá' : 'zbývají';
    document.getElementById('remaining-noun').textContent = stats.activePlayers >= 5 ? 'hráčů' : 'hráči';
    document.getElementById('hd-buyin').textContent = stats.buyIns;
    document.getElementById('hd-chips').textContent = (players.totalChips || 0).toLocaleString('cs');
    const avgStack = stats.activePlayers > 0 ? Math.round((players.totalChips || 0) / stats.activePlayers) : 0;
    document.getElementById('hd-avg').textContent = avgStack.toLocaleString('cs');
    document.getElementById('hd-buyin-amount').textContent = (config.buyInAmount || 400).toLocaleString('cs') + ' Kč';


    // Admin start time input (show when running, keep in sync)
    if (isAdmin) {
        const startTimeRow = document.getElementById('start-time-row');
        const startTimeInput = document.getElementById('cfg-start-time');
        if (state.status === 'running' && state.startedAt) {
            startTimeRow.style.display = '';
            if (document.activeElement !== startTimeInput) {
                const d = new Date(state.startedAt);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                startTimeInput.value = hh + ':' + mm;
            }
        } else {
            startTimeRow.style.display = 'none';
        }
    }

    // Winners logic
    const winners = state.winners || {};
    const winnerEntries = Object.keys(winners).filter(k => winners[k]).sort((a, b) => a - b);
    const paidPlaces = getPaidPlaces();
    const allDeclared = winnerEntries.length >= paidPlaces && paidPlaces > 0;

    // Winner banner — hide timer/blinds/structure only when all places declared
    const winnerBanner = document.getElementById('winner-banner');
    document.getElementById('display').style.display = allDeclared ? 'none' : '';
    document.querySelector('.sidebar-left').style.display = allDeclared ? 'none' : '';
    document.querySelector('.sidebar-right').style.display = allDeclared ? 'none' : '';
    document.getElementById('tracker-footer').style.display = (allDeclared || tickerHidden) ? 'none' : '';
    if (allDeclared) {
        winnerBanner.style.display = '';
        const buyInAmount = config.buyInAmount || 400;
        const addonPrice = config.addonAmount || 0;
        const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
        const dist = getPayoutDistribution(paidPlaces);
        const winAmounts = roundPayouts(dist, prizePool);
        const listEl = document.getElementById('winner-list');
        listEl.innerHTML = winnerEntries.map(k => {
            const idx = parseInt(k) - 1;
            const amount = winAmounts[idx] || 0;
            return '<div class="winner-entry"><span class="place">' + k + '. místo: </span>' +
                '<span class="name">' + winners[k] + '</span>' +
                '<span class="payout"> — ' + amount.toLocaleString('cs') + ' Kč</span></div>';
        }).join('');
        // Stop tournament when all winners declared
        if (state.status === 'running') {
            if (isAdmin) tournamentRef.child('state/status').set('finished');
        }
    } else {
        winnerBanner.style.display = 'none';
    }

    // Update seating in sidebar
    renderSeatingView(selectedTable);

    // Current blinds (derived from startedAt)
    const struct = blindStructure || [];
    const derived = (state.status === 'running' && state.startedAt)
        ? getCurrentLevel(state.startedAt, struct)
        : { levelIndex: 0, remaining: 0 };
    const lvl = derived.levelIndex;

    const curEntry = struct[lvl];
    const onBreak = curEntry && curEntry.isBreak;
    const blindsCurEl = document.getElementById('blinds-current');
    const progressBarEl = document.getElementById('progress-bar');

    // Ante
    const anteMult = config.anteMult || 0;
    const anteOn = anteMult > 0;

    // Blinds / break display
    const blindsLabelEl = document.getElementById('blinds-label');
    const addonBannerEl = document.getElementById('addon-banner');
    const breakMsgEl = document.getElementById('break-message');
    if (onBreak) {
        blindsLabelEl.style.display = 'none';
        blindsCurEl.textContent = 'PŘESTÁVKA';
        blindsCurEl.classList.add('on-break');
        progressBarEl.classList.add('on-break');
        document.getElementById('blinds-sub').textContent = '';

        // Add-on banner during break
        const addonChips = config.addonChips || 0;
        const addonCutoff = config.addonCutoff || 0;
        let blindsBefore = 0;
        for (let i = 0; i < lvl; i++) {
            if (!struct[i].isBreak) blindsBefore++;
        }
        const addonApplies = addonChips > 0 &&
            (addonCutoff === 0 || blindsBefore < addonCutoff);
        if (addonApplies) {
            addonBannerEl.textContent = 'ADD-ON: ' +
                addonChips.toLocaleString('cs') + ' žetonů za ' +
                (config.addonAmount || 0).toLocaleString('cs') + ' Kč';
            addonBannerEl.style.display = '';
        } else {
            addonBannerEl.style.display = 'none';
        }
        // Break message
        const bMsg = (T.breakMessage || '').trim();
        if (bMsg) {
            const escaped = bMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const lines = escaped.split('\n');
            breakMsgEl.innerHTML = '<div>' + lines[0] + '</div>' +
                (lines.length > 1 ? '<div class="break-message-rest">' + lines.slice(1).join('<br>') + '</div>' : '');
            breakMsgEl.style.display = 'inline-block';
        } else {
            breakMsgEl.style.display = 'none';
        }
    } else if (curEntry) {
        blindsLabelEl.style.display = '';
        blindsCurEl.textContent =
            curEntry.small.toLocaleString('cs') + ' / ' + curEntry.big.toLocaleString('cs');
        blindsCurEl.classList.remove('on-break');
        progressBarEl.classList.remove('on-break');
        document.getElementById('blinds-sub').textContent =
            anteOn ? 'Ante ' + Math.round(curEntry.big * anteMult).toLocaleString('cs') : '';
        addonBannerEl.style.display = 'none';
        breakMsgEl.style.display = 'none';
    } else {
        blindsLabelEl.style.display = '';
        blindsCurEl.textContent = '– / –';
        blindsCurEl.classList.remove('on-break');
        progressBarEl.classList.remove('on-break');
        document.getElementById('blinds-sub').textContent = '';
        addonBannerEl.style.display = 'none';
        breakMsgEl.style.display = 'none';
    }

    // Next level preview (skip break entries to show next real level)
    const nextEl = document.getElementById('next-level');
    const nextReal = struct.slice(lvl + 1).find(s => !s.isBreak);
    if (nextReal) {
        nextEl.innerHTML = 'Příští blindy budou: <span>' +
            nextReal.small.toLocaleString('cs') + ' / ' + nextReal.big.toLocaleString('cs') +
            '</span>';
    } else {
        nextEl.textContent = '';
    }

    // Structure table
    const tbody = document.getElementById('structure-body');
    tbody.innerHTML = '';
    // Use actual startedAt timestamp when tournament has started, otherwise config startTime
    let runningMinutes;
    if (state.startedAt) {
        const d = new Date(state.startedAt);
        runningMinutes = d.getHours() * 60 + d.getMinutes();
    } else {
        const startTimeParts = (config.startTime || '19:00').split(':');
        runningMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
    }

    const thAnte = document.getElementById('th-ante');
    if (thAnte) thAnte.style.display = anteOn ? '' : 'none';

    let levelNum = 0;
    let structBlindCount = 0;
    const addonChipsCfg = config.addonChips || 0;
    const addonCutoffCfg = config.addonCutoff || 0;
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
            tr.innerHTML =
                '<td colspan="' + (anteOn ? 5 : 4) + '">PŘESTÁVKA ' + timeStr + ' – ' + endHH + ':' + endMM + '</td>';
        } else {
            structBlindCount++;
            levelNum++;
            const isOverridden = !!T.blindOverrides[levelNum];
            if (isOverridden && isAdmin) classes.push('overridden-level');
            tr.className = classes.join(' ');
            const anteCell = anteOn ? '<td>' + Math.round(s.big * anteMult).toLocaleString('cs') + '</td>' : '';
            if (isAdmin) {
                tr.innerHTML =
                    '<td>' + levelNum + (isOverridden ? ' <button class="blind-reset" data-level="' + levelNum + '" title="Obnovit výchozí">&times;</button>' : '') + '</td>' +
                    '<td>' + timeStr + '</td>' +
                    '<td><input type="number" class="blind-edit" data-level="' + levelNum + '" data-field="small" value="' + s.small + '"></td>' +
                    '<td>' + s.big.toLocaleString('cs') + '</td>' + anteCell;
            } else {
                tr.innerHTML =
                    '<td>' + levelNum + '</td>' +
                    '<td>' + timeStr + '</td>' +
                    '<td>' + s.small.toLocaleString('cs') + '</td>' +
                    '<td>' + s.big.toLocaleString('cs') + '</td>' + anteCell;
            }
        }
        runningMinutes += s.duration;
        tbody.appendChild(tr);
    });

    // Ticker (duplicate content for seamless loop)
    const notes = T.notes || [];
    const sep = '\u00A0\u00A0\u00A0\u00A0\u00A0·\u00A0\u00A0\u00A0\u00A0\u00A0';
    const tickerText = notes.length ? notes.join(sep) + sep : '';
    const tickerA = document.getElementById('ticker-a');
    const tickerB = document.getElementById('ticker-b');
    if (tickerA) tickerA.textContent = tickerText;
    if (tickerB) tickerB.textContent = tickerText;

    // Payout (always visible)
    renderPayout();

    // Freeze tournament config when not in waiting state
    if (isAdmin) {
        const frozen = state.status !== 'waiting';
        document.getElementById('section-config').classList.toggle('frozen', frozen);
    }

    // Populate config inputs from current data
    if (isAdmin) {
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
        // Update curve label
        const curveLabel = document.getElementById('blind-curve-val');
        if (curveLabel) curveLabel.textContent = parseFloat(config.blindCurve || 1.0).toFixed(1);

        // Generate winner input fields for each paid place
        const wf = document.getElementById('winners-fields');
        const currentFields = wf.querySelectorAll('input');
        const hasFocus = Array.from(currentFields).some(el => el === document.activeElement);
        if (!hasFocus || currentFields.length !== paidPlaces) {
            const html = [];
            for (let i = 1; i <= paidPlaces; i++) {
                html.push(
                    '<div class="config-field" style="margin-bottom:6px">' +
                    '<label>' + i + '. místo</label>' +
                    '<input type="text" id="cfg-winner-' + i + '" placeholder="Jméno hráče..." value="' +
                    ((winners[i] || '').replace(/"/g, '&quot;')) + '">' +
                    '</div>'
                );
            }
            wf.innerHTML = html.join('');
        }

        // Player list + summary
        renderPlayerList();
        const sumEl = document.getElementById('player-summary');
        if (sumEl) {
            sumEl.textContent = 'Celkem: ' + stats.buyIns + ' buy-in\u016F, ' +
                stats.rebuys + ' re-buy\u016F, ' + stats.addons + ' add-on\u016F, ' +
                stats.bonuses + ' bonus\u016F | Aktivn\u00ED: ' + stats.activePlayers;
        }

        // Sync break message input
        const breakMsgInput = document.getElementById('cfg-break-message');
        if (breakMsgInput && document.activeElement !== breakMsgInput) {
            breakMsgInput.value = T.breakMessage || '';
        }

        // Sync note inputs (only if not editing)
        const noteInputs = document.querySelectorAll('#notes-list input');
        const noteHasFocus = Array.from(noteInputs).some(el => el === document.activeElement);
        if (!noteHasFocus && renderNoteInputs) {
            renderNoteInputs();
        }

        // Sync payout config (skip if slider is being dragged)
        const payoutInputActive = document.activeElement && (document.activeElement.classList.contains('payout-config-slider') || document.activeElement.classList.contains('payout-config-pct'));
        if (typeof renderPayoutConfig === 'function' && !payoutInputActive) renderPayoutConfig();

        // Sync table locks UI
        if (renderTableLocksAdmin) renderTableLocksAdmin();
    }
}

// ─── Player List Rendering ───────────────────────────────────
function renderPlayerList() {
    const container = document.getElementById('players-list');
    if (!container) return;
    const list = T.players.list || [];
    if (!list.length) {
        container.innerHTML = '';
        return;
    }
    const c = T.config;
    const buyLabel = 'Buys <span class="th-hint">(' + (c.buyInAmount || 400).toLocaleString('cs') + ' Kč \u2192 ' + (c.startingStack || 5000).toLocaleString('cs') + ')</span>';
    const addonLabel = 'Add-on' + (c.addonChips ? ' <span class="th-hint">(' + (c.addonAmount || 0).toLocaleString('cs') + ' Kč \u2192 ' + c.addonChips.toLocaleString('cs') + ')</span>' : '');
    const bonusLabel = 'Bonus' + (c.bonusAmount ? ' <span class="th-hint">(' + c.bonusAmount.toLocaleString('cs') + ')</span>' : '');
    const tableColor = {};
    TABLES.forEach(t => { tableColor[t.id] = t.color; });
    // Build occupied set (exclude current player when building their options)
    const occupied = new Set();
    list.forEach(p => { if (p.table && p.seat) occupied.add(p.table + '-' + p.seat); });
    const locks = T.tableLocks || {};
    // Sort indices by table then seat (unassigned last)
    const sorted = list.map((p, i) => i).sort((a, b) => {
        const pa = list[a], pb = list[b];
        const ta = pa.table || 999, tb = pb.table || 999;
        if (ta !== tb) return ta - tb;
        const sa = pa.seat || 999, sb = pb.seat || 999;
        return sa - sb;
    });
    let html = '<table class="player-table"><thead><tr>' +
        '<th>Hráč</th><th>Stůl</th><th>' + buyLabel + '</th><th>' + addonLabel + '</th><th>' + bonusLabel + '</th><th>Aktivní</th><th></th>' +
        '</tr></thead><tbody>';
    sorted.forEach(i => {
        const p = list[i];
        const nameClass = 'player-name' + (p.active ? '' : ' inactive');
        const curVal = p.table && p.seat ? p.table + '-' + p.seat : '';
        let seatSelect = '<select class="player-seat-select" data-idx="' + i + '">';
        seatSelect += '<option value=""' + (!curVal ? ' selected' : '') + '>—</option>';
        seatSelect += '<option value="random">Náhodné</option>';
        TABLES.forEach(t => {
            const tl = locks[t.id] || {};
            if (tl.locked) return;
            const lockedSeats = tl.lockedSeats || [];
            for (let s = 1; s <= getSeats(t); s++) {
                if (lockedSeats.includes(s)) continue;
                const val = t.id + '-' + s;
                const isTaken = occupied.has(val) && val !== curVal;
                if (isTaken) continue;
                const sel = val === curVal ? ' selected' : '';
                seatSelect += '<option value="' + val + '"' + sel + ' style="color:' + t.color + '">' + t.name + ' ' + s + '</option>';
            }
        });
        seatSelect += '</select>';
        html += '<tr>' +
            '<td class="' + nameClass + '">' + (p.name || '?') + '</td>' +
            '<td style="font-size:0.85em">' + seatSelect + '</td>' +
            '<td><button class="player-buys-btn" data-idx="' + i + '" data-dir="-">&minus;</button> ' + p.buys + ' <button class="player-buys-btn" data-idx="' + i + '" data-dir="+">+</button></td>' +
            '<td><button class="player-toggle' + (p.addon ? ' on' : '') + '" data-idx="' + i + '" data-field="addon">' + (p.addon ? '✓' : '✗') + '</button></td>' +
            '<td><button class="player-toggle' + (p.bonus ? ' on' : '') + '" data-idx="' + i + '" data-field="bonus">' + (p.bonus ? '✓' : '✗') + '</button></td>' +
            '<td><button class="player-toggle' + (p.active ? ' on' : '') + '" data-idx="' + i + '" data-field="active">' + (p.active ? '✓' : '✗') + '</button></td>' +
            '<td><button class="player-remove" data-idx="' + i + '" title="Odebrat">&times;</button></td>' +
            '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
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

// ─── Timer Loop ─────────────────────────────────────────────
let prevLevel = -1;
let timerInterval = null;

function startTimerLoop() {
    if (timerInterval) return;
    timerInterval = setInterval(tickTimer, 100);
}

function tickTimer() {
    const { state, blindStructure } = T;
    const struct = blindStructure || [];
    const timerEl = document.getElementById('timer');
    const progressEl = document.getElementById('progress-bar');

    if (state.status === 'running' && state.startedAt) {
        const derived = getCurrentLevel(state.startedAt, struct);

        timerEl.textContent = formatTime(derived.remaining);
        timerEl.classList.toggle('warning', derived.remaining <= 30000 && derived.remaining > 0);

        // Progress bar
        const duration = (struct[derived.levelIndex]?.duration || 20) * 60000;
        const elapsed = duration - derived.remaining;
        const pct = Math.min(100, Math.max(0, (elapsed / duration) * 100));
        progressEl.style.width = pct + '%';

        // Level-change sound + re-render blinds display
        if (prevLevel >= 0 && derived.levelIndex !== prevLevel) {
            playLevelSound();
            render();
        }
        prevLevel = derived.levelIndex;
    } else {
        // Waiting or finished — show first level's duration as idle timer
        const duration = (struct[0]?.duration || 20) * 60000;
        timerEl.textContent = formatTime(duration);
        timerEl.classList.remove('warning');
        progressEl.style.width = '0%';
    }
}

startTimerLoop();

// ─── Level Change Sound ─────────────────────────────────────
const levelSound = new Audio('../assets/whistle.wav');
levelSound.preload = 'auto';
levelSound.load();
function playLevelSound() {
    levelSound.currentTime = 0;
    levelSound.play().catch(() => {});
}

document.getElementById('btn-test-sound').addEventListener('click', playLevelSound);

// ─── Firebase Listener ──────────────────────────────────────
tournamentRef.on('value', (snap) => {
    const data = snap.val();
    if (!data) {
        // Initialize with defaults
        if (isAdmin) {
            tournamentRef.set(DEFAULTS);
        }
        return;
    }

    T.config = { ...DEFAULTS.config, ...data.config };
    T.state = { ...DEFAULTS.state, ...data.state };

    // Migrate old aggregate format to per-player list
    const rawPlayers = data.players || {};
    if (rawPlayers.list !== undefined) {
        // New format — use as-is
        T.players = { list: rawPlayers.list || [], totalChips: rawPlayers.totalChips || 0 };
    } else {
        // Old format migration: create unnamed players from aggregate counts
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
        // Distribute rebuys across players
        for (let r = 0; r < oldRebuys && migrated.length > 0; r++) {
            migrated[r % migrated.length].buys++;
        }
        T.players = { list: migrated, totalChips: rawPlayers.totalChips || 0 };
        // Save migrated data if admin
        if (isAdmin && oldBuyIns > 0) {
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

// ─── Admin Actions ──────────────────────────────────────────
if (isAdmin) {
    // Save status indicator helper
    function showSaveStatus(el, promise) {
        el.textContent = 'Ukládám...';
        el.className = 'save-status saving';
        promise.then(() => {
            el.textContent = 'Uloženo ✓';
            el.className = 'save-status saved';
            setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 2000);
        });
    }

    // Auto-save tournament config on change
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

    // Guard toggles
    document.querySelectorAll('.guard-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const locked = btn.textContent.trim() === '\u{1F512}';
            btn.textContent = locked ? '\u{1F513}' : '\u{1F512}';
            if (btn.id === 'guard-blind-curve') {
                const slider = document.getElementById('cfg-blind-curve');
                slider.disabled = !locked;
            } else if (btn.id === 'guard-payout') {
                const rows = document.getElementById('payout-config-rows');
                rows.classList.toggle('guarded', !locked);
            }
        });
    });

    // Live update for blind curve slider (also saves)
    document.getElementById('cfg-blind-curve').addEventListener('input', (e) => {
        const label = document.getElementById('blind-curve-val');
        if (label) label.textContent = parseFloat(e.target.value).toFixed(1);
        saveConfig();
    });

    // Add player
    document.getElementById('btn-add-player').addEventListener('click', () => {
        const input = document.getElementById('new-player-name');
        const name = (input.value || '').trim();
        if (!name) { input.focus(); return; }
        const list = T.players.list || [];
        const player = { name: name, buys: 1, addon: false, bonus: false, active: true };
        assignSeat(player, list);
        if (player.table && player.seat) setLastPlaced(player.table, player.seat);
        list.push(player);
        T.players.list = list;
        input.value = '';
        savePlayerList();
        render();
    });

    document.getElementById('new-player-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-add-player').click();
    });

    // Add 8 test players
    document.getElementById('btn-add-test-players').addEventListener('click', () => {
        if (!confirm('Přidat 8 testovacích hráčů?')) return;
        const names = ['Adam', 'Bára', 'Cyril', 'Dana', 'Emil', 'Fanda',
            'Gita', 'Honza'];
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

    // Remove all players
    document.getElementById('btn-remove-all-players').addEventListener('click', () => {
        if (!confirm('Opravdu smazat všechny hráče?')) return;
        T.players.list = [];
        savePlayerList();
        render();
    });

    // Manual seat assignment
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
        if (list[idx].table && list[idx].seat) setLastPlaced(list[idx].table, list[idx].seat);
        savePlayerList();
        render();
    });

    // Delegate clicks on player list (buys+, toggles, remove)
    document.getElementById('players-list').addEventListener('click', (e) => {
        const list = T.players.list || [];
        const btn = e.target;

        // Buys +/-
        if (btn.classList.contains('player-buys-btn')) {
            const idx = parseInt(btn.dataset.idx);
            if (list[idx]) {
                if (btn.dataset.dir === '-') {
                    if (list[idx].buys > 1) list[idx].buys--;
                } else {
                    list[idx].buys++;
                    list[idx].active = true;
                }
                savePlayerList();
                render();
            }
            return;
        }

        // Toggle (addon, bonus, active)
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

        // Remove player
        if (btn.classList.contains('player-remove')) {
            const idx = parseInt(btn.dataset.idx);
            if (list[idx] && confirm('Odebrat hráče ' + list[idx].name + '?')) {
                list.splice(idx, 1);
                T.players.list = list;
                savePlayerList();
                render();
            }
            return;
        }
    });

    // Save winners
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
            btn.textContent = 'Turnaj ukončen ✓';
            setTimeout(() => { btn.textContent = 'Ukončit turnaj'; }, 2000);
        });
    });

    // Timer controls
    document.getElementById('btn-start').addEventListener('click', () => {
        if (T.state.status === 'running') return;
        if (!confirm('Spustit timer?')) return;
        tournamentRef.child('state').update({
            status: 'running',
            startedAt: serverNow()
        });
        playLevelSound();
    });

    document.getElementById('btn-set-start-time').addEventListener('click', () => {
        const val = document.getElementById('cfg-start-time').value;
        if (!val) return;
        const [hh, mm] = val.split(':').map(Number);
        const d = new Date(T.state.startedAt);
        d.setHours(hh, mm, 0, 0);
        tournamentRef.child('state/startedAt').set(d.getTime());
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        if (!confirm('Opravdu resetovat timer?')) return;
        tournamentRef.child('state').set(DEFAULTS.state);
        tournamentRef.child('blindOverrides').set({});
        tournamentRef.child('payoutConfig').set(null);
        recalcAndSync();
    });

    // Notes (ticker)
    renderNoteInputs = function() {
        const list = document.getElementById('notes-list');
        const notes = T.notes || [];
        list.innerHTML = notes.map((note, i) =>
            '<div class="note-row" data-note-idx="' + i + '">' +
            '<span class="note-drag-handle">☰</span>' +
            '<input type="text" value="' + note.replace(/"/g, '&quot;') + '" data-note-idx="' + i + '">' +
            '<button class="btn-remove-note" data-note-idx="' + i + '">&times;</button>' +
            '</div>'
        ).join('');
    }

    renderNoteInputs();

    function saveNotes() {
        const inputs = document.querySelectorAll('#notes-list input');
        const notes = Array.from(inputs).map(el => el.value.trim()).filter(Boolean);
        const p = tournamentRef.child('notes').set(notes);
        showSaveStatus(document.getElementById('notes-save-status'), p);
    }

    document.getElementById('notes-list').addEventListener('click', (e) => {
        if (!e.target.classList.contains('btn-remove-note')) return;
        const idx = parseInt(e.target.dataset.noteIdx);
        T.notes.splice(idx, 1);
        renderNoteInputs();
        saveNotes();
    });

    document.getElementById('notes-list').addEventListener('change', saveNotes);

    // Drag & drop reordering
    let dragIdx = null;
    const notesList = document.getElementById('notes-list');
    notesList.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('note-drag-handle')) {
            e.target.closest('.note-row').draggable = true;
        }
    });
    notesList.addEventListener('mouseup', (e) => {
        const row = e.target.closest('.note-row');
        if (row) row.draggable = false;
    });
    notesList.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.note-row');
        if (!row) return;
        dragIdx = parseInt(row.dataset.noteIdx);
        row.classList.add('note-dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    notesList.addEventListener('dragend', (e) => {
        const row = e.target.closest('.note-row');
        if (row) { row.classList.remove('note-dragging'); row.draggable = false; }
        notesList.querySelectorAll('.note-row').forEach(r => r.classList.remove('note-drag-over'));
        dragIdx = null;
    });
    notesList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const row = e.target.closest('.note-row');
        if (!row) return;
        e.dataTransfer.dropEffect = 'move';
        notesList.querySelectorAll('.note-row').forEach(r => r.classList.remove('note-drag-over'));
        row.classList.add('note-drag-over');
    });
    notesList.addEventListener('dragleave', (e) => {
        const row = e.target.closest('.note-row');
        if (row) row.classList.remove('note-drag-over');
    });
    notesList.addEventListener('drop', (e) => {
        e.preventDefault();
        const row = e.target.closest('.note-row');
        if (!row || dragIdx === null) return;
        const dropIdx = parseInt(row.dataset.noteIdx);
        if (dragIdx === dropIdx) return;
        // Commit current input values before reordering
        const inputs = notesList.querySelectorAll('input');
        inputs.forEach(el => { T.notes[parseInt(el.dataset.noteIdx)] = el.value; });
        const moved = T.notes.splice(dragIdx, 1)[0];
        T.notes.splice(dropIdx, 0, moved);
        renderNoteInputs();
        saveNotes();
    });

    document.getElementById('btn-add-note').addEventListener('click', () => {
        T.notes = T.notes || [];
        T.notes.push('');
        renderNoteInputs();
        const inputs = document.querySelectorAll('#notes-list input');
        if (inputs.length) inputs[inputs.length - 1].focus();
    });

    // Blind structure override editing (SB only, BB = SB * 2)
    document.getElementById('structure-body').addEventListener('change', (e) => {
        if (!e.target.classList.contains('blind-edit')) return;
        const level = parseInt(e.target.dataset.level);
        const val = parseInt(e.target.value);
        if (!level || isNaN(val) || val <= 0) return;

        // Find the base (auto-calculated) SB for this level
        const totalChips = recalcTotalChips();
        let freezeUpTo = -1;
        if (T.state.status === 'running' && T.state.startedAt) {
            freezeUpTo = getCurrentLevel(T.state.startedAt, T.blindStructure).levelIndex;
        }
        const baseStructure = calculateBlinds(T.config, totalChips, freezeUpTo);
        let calcSmall = 0;
        let bn = 0;
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

    // Remove blind override
    document.getElementById('structure-body').addEventListener('click', (e) => {
        if (!e.target.classList.contains('blind-reset')) return;
        const level = parseInt(e.target.dataset.level);
        if (!level) return;
        delete T.blindOverrides[level];
        tournamentRef.child('blindOverrides').set(T.blindOverrides);
        recalcAndSync();
    });

    document.getElementById('cfg-break-message').addEventListener('change', () => {
        const val = (document.getElementById('cfg-break-message').value || '').trim();
        const p = tournamentRef.child('breakMessage').set(val);
        showSaveStatus(document.getElementById('break-save-status'), p);
    });

    // Table locks UI
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
            const freeLabel = isLocked ? '' : ' <span style="color:var(--text-muted);font-weight:normal;font-size:0.85em">(' + freeCount + ' volných míst)</span>';
            html += '<div class="table-lock-row" style="display:flex;align-items:center;gap:16px">' +
                '<div style="flex:1">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
                '<span style="color:' + t.color + ';font-weight:bold">' + t.name + freeLabel + '</span>' +
                '<button class="btn table-lock-toggle' + (isLocked ? ' danger' : '') + '" data-table="' + t.id + '" style="flex:0 0 auto;min-width:auto;padding:4px 10px;font-size:0.8em">' +
                (isLocked ? 'Zamčený' : 'Otevřený') + '</button>' +
                '<button class="btn table-rotate" data-table="' + t.id + '" style="flex:0 0 auto;min-width:auto;padding:4px 10px;font-size:0.8em" title="Otočit o 90°">↻</button>' +
                '</div>';
            const seatCount = getSeats(t);
            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
                '<label style="font-size:0.8em;color:var(--text-muted);white-space:nowrap">Míst: ' + seatCount + '</label>' +
                '<input type="range" class="table-seat-count" data-table="' + t.id + '" min="2" max="' + (t.shape === 'oval' ? 10 : 8) + '" value="' + seatCount + '" style="flex:1;max-width:120px">' +
                '</div>';
            if (!isLocked) {
                html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
                for (let s = 1; s <= getSeats(t); s++) {
                    const seatLocked = lockedSeats.includes(s);
                    html += '<button class="btn seat-lock-toggle' + (seatLocked ? ' danger' : '') + '" data-table="' + t.id + '" data-seat="' + s + '" style="min-width:auto;padding:4px 8px;font-size:0.8em;flex:0 0 auto">' +
                        s + (seatLocked ? ' ✗' : '') + '</button>';
                }
                html += '</div>';
            }
            html += '</div>';
            if (!isLocked) {
                const rot = tl.rotation || 0;
                html += '<div style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;transform:translateX(-50%)">' +
                    '<div class="seating-table-visual" style="width:200px;transform:rotate(' + rot + 'deg)">' + buildTableVisualHTML(t, { wallToggles: true }) + '</div>' +
                    '</div>';
            }
            html += '</div>';
        });
        container.innerHTML = html;
    }

    // Initial render + expose for render()
    renderTableLocksAdmin = renderTableLocks;
    renderTableLocks();

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
            renderTableLocks();
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
            renderTableLocks();
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
            renderTableLocks();
            render();
            return;
        }
        if (btn.classList.contains('wall-clickable')) {
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
            renderTableLocks();
            return;
        }
    });

    document.getElementById('table-locks-ui').addEventListener('input', (e) => {
        if (e.target.classList.contains('table-seat-count')) {
            const tableId = parseInt(e.target.dataset.table);
            const val = parseInt(e.target.value);
            const locks = T.tableLocks || {};
            const tl = locks[tableId] || {};
            tl.seatCount = val;
            // Remove locked seats beyond new count
            if (tl.lockedSeats) {
                tl.lockedSeats = tl.lockedSeats.filter(s => s <= val);
            }
            locks[tableId] = tl;
            T.tableLocks = locks;

            // Reassign players on this table to fit within new seat count
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
            // Place displaced players into free seats on the same table
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
            renderTableLocks();
            render();
        }
    });

    // ─── Payout Config UI ─────────────────────────────────────
    let payoutConfigRendered = false;

    function getPayoutConfigValues() {
        // Return current manual config or auto-calculated values
        if (T.payoutConfig && T.payoutConfig.length > 0) return T.payoutConfig.slice();
        const list = T.players.list || [];
        const paidPlaces = Math.max(1, Math.floor(list.length * 0.25));
        return getAutoPayoutDistribution(paidPlaces);
    }

    function renderPayoutConfig() {
        const container = document.getElementById('payout-config-rows');
        if (!container) return;
        const values = getPayoutConfigValues();
        const isManual = T.payoutConfig && T.payoutConfig.length > 0;
        const buyInAmount = T.config.buyInAmount || 400;
        const addonPrice = T.config.addonAmount || 0;
        const stats = derivePlayerStats(T.players.list || []);
        const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;

        const cfgAmounts = roundPayouts(values, prizePool);
        container.innerHTML = values.map((pct, i) => {
            return '<div class="payout-config-row">' +
                '<span class="payout-config-place">' + (i + 1) + '.</span>' +
                '<input type="range" class="payout-config-slider" data-place="' + i + '" min="0" max="100" step="1" value="' + pct + '">' +
                '<input type="number" class="payout-config-pct" data-place="' + i + '" min="0" max="100" value="' + pct + '">' +
                '<span class="payout-config-amount">' + cfgAmounts[i].toLocaleString('cs') + ' Kč</span>' +
                '</div>';
        }).join('');

        const total = values.reduce((s, v) => s + v, 0);
        const totalEl = document.getElementById('payout-config-total');
        totalEl.textContent = 'Celkem: ' + Math.round(total) + '%';
        totalEl.style.color = Math.abs(total - 100) < 0.5 ? 'var(--green)' : 'var(--red)';

        payoutConfigRendered = true;
    }

    function savePayoutConfig(values) {
        T.payoutConfig = values;
        tournamentRef.child('payoutConfig').set(values);
        render();
    }

    function applyPayoutChange(place, newVal) {
        const values = getPayoutConfigValues();
        values[place] = Math.max(0, Math.min(100, newVal));

        // Overflow logic: only when total > 100
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

        // Update sliders and labels in-place without rebuilding DOM
        const buyInAmount = T.config.buyInAmount || 400;
        const addonPrice = T.config.addonAmount || 0;
        const stats = derivePlayerStats(T.players.list || []);
        const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
        document.querySelectorAll('.payout-config-slider').forEach(sl => {
            const i = parseInt(sl.dataset.place);
            sl.value = values[i];
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
        renderPayout();
    }

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
        savePayoutConfig(values);
        renderPayoutConfig();
    });

    document.getElementById('btn-payout-remove').addEventListener('click', () => {
        const values = getPayoutConfigValues();
        if (values.length <= 1) return;
        const removed = values.pop();
        if (removed > 0 && values.length > 0) {
            values[values.length - 1] += removed;
        }
        savePayoutConfig(values);
        renderPayoutConfig();
    });

    document.getElementById('btn-payout-auto').addEventListener('click', () => {
        const places = getPayoutConfigValues().length;
        const auto = getAutoPayoutDistribution(places);
        savePayoutConfig(auto);
        renderPayoutConfig();
    });

    renderPayoutConfig();

    // Reshuffle all seats
    document.getElementById('btn-reshuffle-seats').addEventListener('click', () => {
        if (!confirm('Přepočítat zasedací pořádek pro všechny hráče?')) return;
        const list = T.players.list || [];
        list.forEach(p => { delete p.table; delete p.seat; });
        list.forEach(p => {
            if (p.active) assignSeat(p, list);
        });
        T.players.list = list;
        savePlayerList();
        render();
    });
}
