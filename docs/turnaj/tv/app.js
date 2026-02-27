// ─── Firebase Init ──────────────────────────────────────────
firebase.initializeApp({
    apiKey: "AIzaSyAfQqQYYn8pId99FbqIqX72LH6kOlosunQ",
    authDomain: "smelo-turnaj.firebaseapp.com",
    databaseURL: "https://smelo-turnaj-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "smelo-turnaj"
});

const db = firebase.database();
const tournamentRef = db.ref('tournament');
document.body.classList.add('wide');

// Zoom controls — only scale content, not the header
let zoomLevel = 100;
function applyZoom() {
    const z = zoomLevel + '%';
    document.querySelector('.main-content').style.zoom = z;
    document.getElementById('tracker-footer').style.zoom = z;
    document.getElementById('rules-overlay').style.zoom = z;
}
document.getElementById('zoom-in').addEventListener('click', () => {
    zoomLevel = Math.min(200, zoomLevel + 10);
    applyZoom();
});
document.getElementById('zoom-out').addEventListener('click', () => {
    zoomLevel = Math.max(50, zoomLevel - 10);
    applyZoom();
});

// Sidebar offset controls
let sidebarOffset = 0;
function applySidebarOffset() {
    const left = document.querySelector('.sidebar-left');
    const right = document.querySelector('.sidebar-right');
    if (left) left.style.marginLeft = sidebarOffset + 'px';
    if (right) right.style.marginRight = sidebarOffset + 'px';
}
document.getElementById('sidebar-in').addEventListener('click', () => {
    sidebarOffset = Math.min(192, sidebarOffset + 24);
    applySidebarOffset();
});
document.getElementById('sidebar-out').addEventListener('click', () => {
    sidebarOffset = Math.max(-96, sidebarOffset - 24);
    applySidebarOffset();
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

// Fish toggle
let fishHidden = localStorage.getItem('fishHidden') === '1';
const fishBtn = document.getElementById('btn-toggle-fish');
function updateFishBtn() {
    fishBtn.style.opacity = fishHidden ? '0.4' : '';
    updateFishVisibility();
}
function updateFishVisibility() {
    const mainFish = document.getElementById('fish-container');
    const winnerFish = document.getElementById('fish-container-winners');
    const breakMsg = document.getElementById('break-message');
    const breakVisible = breakMsg && breakMsg.style.display !== 'none';
    const winnerBanner = document.getElementById('winner-banner');
    const winnersVisible = winnerBanner && winnerBanner.style.display !== 'none';

    if (fishHidden) {
        mainFish.style.display = 'none';
        winnerFish.style.display = 'none';
    } else if (winnersVisible) {
        mainFish.style.display = 'none';
        winnerFish.style.display = '';
        // Move canvas to winner container if needed
        const canvas = mainFish.querySelector('canvas');
        if (canvas) winnerFish.appendChild(canvas);
    } else {
        winnerFish.style.display = 'none';
        mainFish.style.display = breakVisible ? 'none' : '';
        // Move canvas back to main container if needed
        const canvas = winnerFish.querySelector('canvas');
        if (canvas) mainFish.appendChild(canvas);
    }
}
updateFishBtn();
fishBtn.addEventListener('click', () => {
    fishHidden = !fishHidden;
    localStorage.setItem('fishHidden', fishHidden ? '1' : '0');
    updateFishBtn();
});

// ─── Rules Overlay ──────────────────────────────────────────
const DEFAULT_RULES = [
    { title: 'Chování u stolu', items: ['Nezdržuj.', 'Nekřič, nenadávej.', 'Sleduj hru.', 'Hraj jen když jsi na řadě.', 'Neříkej cos měl, dokud se hraje.'] },
    { title: 'Sázky', items: ['Řekni nahlas co děláš za akci.', 'Řekni číslo — žádný string betting.', 'Nesplashuj pot.', 'Měj jasně oddělené sázky v tomto kole.', 'Poprosím blindy.'] },
    { title: 'Karty a žetony', items: ['Neházej karty do vzduchu.', 'Žádný slow roll — ukaž karty.', 'Chceš pot? Ukaž obě karty.', 'Ukázals jednomu — ukaž všem.', 'Žetony na stole, viditelně, ve sloupcích.', 'Nešahej na cizí žetony.'] },
    { title: 'Turnaj', items: ['Re-buy neomezeně do konce přestávky.', 'Nelze se vykešovat částečně.', 'Nepřítomným se platí blindy a foldují karty.', 'Kouřit choďte po jednom.'] }
];

let rulesVisible = false;
const rulesBtn = document.getElementById('btn-toggle-rules');
const rulesOverlay = document.getElementById('rules-overlay');

function getRulesSections() {
    const r = T.rules;
    if (Array.isArray(r) && r.length) return r;
    return DEFAULT_RULES;
}

function renderRules() {
    const sections = getRulesSections();
    const grid = document.getElementById('rules-grid');
    grid.innerHTML = '';
    sections.forEach(sec => {
        const items = sec.items || [];
        if (!items.length) return;
        const sectionEl = document.createElement('div');
        sectionEl.className = 'rules-section';
        const titleEl = document.createElement('div');
        titleEl.className = 'rules-section-title';
        titleEl.textContent = sec.title || '';
        sectionEl.appendChild(titleEl);
        items.forEach(r => {
            const card = document.createElement('div');
            card.className = 'rule-card';
            const parts = r.split('|');
            card.textContent = parts[0].trim();
            if (parts.length > 1) {
                const pill = document.createElement('span');
                pill.className = 'rule-pill';
                pill.textContent = parts.slice(1).join('|').trim();
                card.appendChild(pill);
            }
            sectionEl.appendChild(card);
        });
        grid.appendChild(sectionEl);
    });
}

function updateRulesView() {
    rulesOverlay.style.display = rulesVisible ? '' : 'none';
    document.querySelector('.main-content').style.display = rulesVisible ? 'none' : '';
    document.getElementById('tracker-footer').style.display = rulesVisible ? 'none' : '';
    rulesBtn.style.opacity = rulesVisible ? '1' : '';
    rulesBtn.style.borderColor = rulesVisible ? 'var(--accent)' : '';
    rulesBtn.style.color = rulesVisible ? 'var(--accent)' : '';
}
rulesBtn.addEventListener('click', () => {
    rulesVisible = !rulesVisible;
    updateRulesView();
    if (rulesVisible) renderRules();
    else render();
});
document.getElementById('rules-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.rule-card');
    if (card) card.classList.toggle('active');
});

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

// Table selector — single button that cycles through tables by index
let selectedTableIndex = parseInt(localStorage.getItem('tvTableIdx')) || 0;

function selectTable() {
    if (selectedTableIndex >= TABLES.length) selectedTableIndex = 0;
    const table = TABLES[selectedTableIndex];
    renderTableTabs();
    renderSeatingView(table.id);
}

function renderTableTabs() {
    const container = document.getElementById('table-tabs');
    if (!container) return;
    if (selectedTableIndex >= TABLES.length) selectedTableIndex = 0;
    const t = TABLES[selectedTableIndex];
    container.innerHTML = '<div class="table-tab active" style="background:' + t.color + '" title="' + t.name + '"></div>';
}

document.getElementById('table-tabs').addEventListener('click', () => {
    selectedTableIndex = (selectedTableIndex + 1) % TABLES.length;
    localStorage.setItem('tvTableIdx', selectedTableIndex);
    selectTable();
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

// Connection status
db.ref('.info/connected').on('value', (snap) => {
    const dot = document.getElementById('conn-dot');
    if (dot) dot.classList.toggle('connected', snap.val() === true);
});

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
        status: 'waiting',   // waiting | running | finished
        startedAt: 0,
        pausedAt: 0,
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
    breakMessages: {},
    breakLabels: {},
    rules: null,
    notes: [
        'Buy-in a re-buy neomezeně, ale jen do konce přestávky',
        'Nepřítomným hráčům se automaticky platí blindy a foldují karty',
        'Kouřit choďte po jednom, ať zbytek stolu může hrát'
    ]
};

// Local mirror
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
            let sb = lastBlind ? lastBlind.big : 5;
            for (let i = 0; i < remaining; i++) {
                levels.push({ small: sb, big: sb * 2, duration: levelDuration });
                sb = sb * 2;
            }
        }
    } else {
        // Simple doubling: 5/10, 10/20, 20/40, 40/80, ...
        let sb = 5;
        for (let i = 0; i < numLevels; i++) {
            levels.push({ small: sb, big: sb * 2, duration: levelDuration });
            sb = sb * 2;
        }
    }

    // Insert breaks every N blind levels
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

// ─── Derived State ─────────────────────────────────────────
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
        { left: 36, top: 88 },  // 1  bottom-left
        { left: 64, top: 88 },  // 2  bottom-right
        { left: 90, top: 76 },  // 3  right-lower
        { left: 96, top: 50 },  // 4  right-middle
        { left: 90, top: 24 },  // 5  right-upper
        { left: 64, top: 12 },  // 6  top-right
        { left: 36, top: 12 },  // 7  top-left
        { left: 10, top: 24 },  // 8  left-upper
        { left: 4,  top: 50 },  // 9  left-middle
        { left: 10, top: 76 }   // 10 left-lower
    ],
    rect: [
        { left: 35, top: 95 },  // 1  bottom-left
        { left: 65, top: 95 },  // 2  bottom-right
        { left: 95, top: 50 },  // 3  right
        { left: 65, top: 5 },   // 4  top-right
        { left: 35, top: 5 },   // 5  top-left
        { left: 5,  top: 50 },  // 6  left
        { left: 5,  top: 30 },  // 7  left-upper (extra)
        { left: 5,  top: 70 }   // 8  left-lower (extra)
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
    const positions = SEAT_POSITIONS[getShape(table)];
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

    const normRot = ((rot % 360) + 360) % 360;
    const nameTransform = (normRot > 90 && normRot < 270) ? 'translate(-50%,-50%) rotate(180deg)' : 'translate(-50%,-50%)';
    let html = '<div class="seating-table-surface ' + getShape(table) + '" style="border-color:' + table.color + ';background:' + table.color + '22">' +
        '<span class="seating-table-name" style="color:' + table.color + ';transform:' + nameTransform + '">' + table.name + '</span></div>';

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
        const normRot = ((rot % 360) + 360) % 360;
        const nameTransform = (normRot > 90 && normRot < 270) ? 'translate(-50%,-50%) rotate(180deg)' : 'translate(-50%,-50%)';
        visual.innerHTML = '<div class="seating-table-surface ' + getShape(table) + '" style="border-color:' + table.color + ';background:' + table.color + '22;opacity:0.4">' +
            '<span class="seating-table-name" style="color:' + table.color + ';transform:' + nameTransform + '">' + table.name + '</span></div>';
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

window.addEventListener('resize', fitBlindsText);

const BLINDS_BASE_CHARS = 5; // "00:00" timer length — baseline for full size
function fitBlindsText() {
    const el = document.getElementById('blinds-current');
    const maxPx = parseFloat(getComputedStyle(document.getElementById('timer')).fontSize);
    const len = el.textContent.length;
    const scale = len > BLINDS_BASE_CHARS ? BLINDS_BASE_CHARS / len : 1;
    el.style.fontSize = (maxPx * scale) + 'px';
}

function render() {
    const { config, state, players, blindStructure } = T;

    // Header stats (derived from player list)
    const list = players.list || [];
    const stats = derivePlayerStats(list);
    document.getElementById('remaining-count').textContent = stats.activePlayers;
    document.getElementById('remaining-verb').textContent = stats.activePlayers >= 5 ? 'zbývá' : 'zbývají';
    document.getElementById('remaining-noun').textContent = stats.activePlayers >= 5 ? 'hráčů' : 'hráči';
    document.getElementById('hd-chips').textContent = (players.totalChips || 0).toLocaleString('cs');
    const avgStack = stats.activePlayers > 0 ? Math.round((players.totalChips || 0) / stats.activePlayers) : 0;
    document.getElementById('hd-avg').textContent = avgStack.toLocaleString('cs');
    document.getElementById('hd-buyin-amount').textContent = (config.buyInAmount || 400).toLocaleString('cs');
    document.getElementById('hd-buyin-chips').textContent = (config.startingStack || 0).toLocaleString('cs');
    const addonItem = document.getElementById('hd-addon-item');
    if (addonItem) {
        if (config.addonAmount > 0) {
            addonItem.style.display = '';
            document.getElementById('hd-addon-amount').textContent = (config.addonAmount || 0).toLocaleString('cs');
            document.getElementById('hd-addon-chips').textContent = (config.addonChips || 0).toLocaleString('cs');
        } else {
            addonItem.style.display = 'none';
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
    document.getElementById('tracker-footer').style.display = (tickerHidden || rulesVisible) ? 'none' : '';
    if (allDeclared) {
        const wasShowing = winnerBanner.style.display === 'flex';
        winnerBanner.style.display = 'flex';
        const buyInAmount = config.buyInAmount || 400;
        const addonPrice = config.addonAmount || 0;
        const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
        const dist = getPayoutDistribution(paidPlaces);
        const winAmounts = roundPayouts(dist, prizePool);
        const listEl = document.getElementById('winner-list');
        listEl.innerHTML = winnerEntries.map(k => {
            const idx = parseInt(k) - 1;
            const amount = winAmounts[idx] || 0;
            const medals = {1: '\u{1F947}', 2: '\u{1F948}', 3: '\u{1F949}'};
            const placeLabel = medals[k] || (k + '.');
            return '<div class="winner-entry"><span class="place">' + placeLabel + ' </span>' +
                '<span class="name">' + winners[k] + '</span>' +
                '<span class="payout"> — ' + amount.toLocaleString('cs') + ' Kč</span></div>';
        }).join('');
        if (!wasShowing) playEndSound();
        // Stop tournament when all winners declared
        if (state.status === 'running') {
            tournamentRef.child('state/status').set('finished');
        }
    } else {
        winnerBanner.style.display = 'none';
    }

    // Update seating in sidebar
    if (selectedTableIndex >= TABLES.length) selectedTableIndex = 0;
    renderSeatingView(TABLES[selectedTableIndex].id);

    // Current blinds (derived from startedAt)
    const struct = blindStructure || [];
    const isPaused = state.status === 'running' && state.pausedAt > 0;
    const timerNow = isPaused ? state.pausedAt : undefined;
    const derived = (state.status === 'running' && state.startedAt)
        ? getCurrentLevel(state.startedAt, struct, timerNow)
        : { levelIndex: 0, remaining: 0 };
    const lvl = derived.levelIndex;

    const curEntry = struct[lvl];
    const onBreak = curEntry && curEntry.isBreak;
    const blindsCurEl = document.getElementById('blinds-current');
    const progressBarEl = document.getElementById('progress-bar');

    // Ante
    const anteMult = config.anteMult || 0;
    const anteOn = anteMult > 0;

    // Blinds / break / pause display

    const breakMsgEl = document.getElementById('break-message');
    if (isPaused) {
        blindsCurEl.textContent = 'PAUZA';
        blindsCurEl.classList.remove('on-break');
        blindsCurEl.classList.add('on-pause');
        progressBarEl.classList.remove('on-break');
        document.getElementById('blinds-sub').textContent = '';
        breakMsgEl.style.display = 'none';
    } else if (onBreak) {
        blindsCurEl.textContent = 'PŘESTÁVKA';
        blindsCurEl.classList.add('on-break');
        blindsCurEl.classList.remove('on-pause');
        progressBarEl.classList.add('on-break');
        document.getElementById('blinds-sub').textContent = '';

        // Break message — use per-break message keyed by structure index
        const bMsg = (T.breakMessages[lvl] || '').trim();
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
        blindsCurEl.textContent =
            curEntry.small.toLocaleString('cs') + ' / ' + curEntry.big.toLocaleString('cs');
        blindsCurEl.classList.remove('on-break');
        blindsCurEl.classList.remove('on-pause');
        progressBarEl.classList.remove('on-break');
        document.getElementById('blinds-sub').textContent =
            anteOn ? 'Ante ' + Math.round(curEntry.big * anteMult).toLocaleString('cs') : '';
        breakMsgEl.style.display = 'none';
    } else {
        blindsCurEl.textContent = '– / –';
        blindsCurEl.classList.remove('on-break');
        blindsCurEl.classList.remove('on-pause');
        progressBarEl.classList.remove('on-break');
        document.getElementById('blinds-sub').textContent = '';
        breakMsgEl.style.display = 'none';
    }

    updateFishVisibility();
    fitBlindsText();

    // Next level preview — hidden from main display, kept in DOM for potential sidebar use
    document.getElementById('next-level').textContent = '';

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
            tr.innerHTML =
                '<td colspan="' + (anteOn ? 5 : 4) + '">PŘESTÁVKA ' + timeStr + ' – ' + endHH + ':' + endMM +
                (breakLabel ? '<div class="break-label">' + breakLabel.replace(/</g, '&lt;') + '</div>' : '') + '</td>';
        } else {
            levelNum++;
            tr.className = classes.join(' ');
            const anteCell = anteOn ? '<td>' + Math.round(s.big * anteMult).toLocaleString('cs') + '</td>' : '';
            tr.innerHTML =
                '<td>' + levelNum + '</td>' +
                '<td>' + timeStr + '</td>' +
                '<td>' + s.small.toLocaleString('cs') + '</td>' +
                '<td>' + s.big.toLocaleString('cs') + '</td>' + anteCell;
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
}

// ─── Timer Loop ─────────────────────────────────────────────
let prevLevel = -1;
let prevStatus = 'waiting';
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
        const isPaused = state.pausedAt > 0;
        const timerNow = isPaused ? state.pausedAt : undefined;
        const derived = getCurrentLevel(state.startedAt, struct, timerNow);

        if (isPaused) {
            // Show pause duration counting up
            const pauseDur = serverNow() - state.pausedAt;
            const pauseMin = Math.floor(pauseDur / 60000);
            const pauseSec = Math.floor((pauseDur % 60000) / 1000);
            timerEl.textContent = pauseMin + ':' + String(pauseSec).padStart(2, '0');
            timerEl.classList.remove('warning');
            timerEl.classList.add('paused');

            // Progress bar frozen
            const duration = (struct[derived.levelIndex]?.duration || 20) * 60000;
            const elapsed = duration - derived.remaining;
            const pct = Math.min(100, Math.max(0, (elapsed / duration) * 100));
            progressEl.style.width = pct + '%';

            document.getElementById('level-countdown').style.display = 'none';
            lastCountdownSec = -1;
        } else {
            timerEl.textContent = formatTime(derived.remaining);
            timerEl.classList.toggle('warning', derived.remaining <= 30000 && derived.remaining > 0);
            timerEl.classList.remove('paused');

            // Progress bar
            const duration = (struct[derived.levelIndex]?.duration || 20) * 60000;
            const elapsed = duration - derived.remaining;
            const pct = Math.min(100, Math.max(0, (elapsed / duration) * 100));
            progressEl.style.width = pct + '%';

            // Level countdown overlay
            const countdownEl = document.getElementById('level-countdown');
            const countdownNum = document.getElementById('countdown-number');
            const curEntry = struct[derived.levelIndex];
            const isBreak = curEntry && curEntry.isBreak;
            if (derived.remaining <= 10000 && derived.remaining > 0 && !isBreak &&
                T.state.status === 'running' && prevLevel >= 0) {
                const sec = Math.ceil(derived.remaining / 1000);
                countdownEl.style.display = '';
                if (sec !== lastCountdownSec) {
                    countdownNum.textContent = sec;
                    countdownNum.classList.remove('pop');
                    void countdownNum.offsetWidth;
                    countdownNum.classList.add('pop');
                    lastCountdownSec = sec;
                }
            } else {
                countdownEl.style.display = 'none';
                lastCountdownSec = -1;
            }
        }

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
        document.getElementById('level-countdown').style.display = 'none';
        lastCountdownSec = -1;
    }
}

startTimerLoop();

// ─── Preload all sounds ─────────────────────────────────────
const ALL_SOUND_FILES = [
    'castleportcullis.wav', 'choir.wav', 'coins falling 1.wav', 'coins falling 2.wav',
    'holy!.wav', 'key pickup guantlet 4.wav', 'power up1.wav', 'superholy.wav',
    'thumbs down.wav', 'thumbs up.wav', 'unholy!.wav', 'whistle.wav'
];
const ALL_SFX = ALL_SOUND_FILES.map(f => '../assets/sfx/' + f);
// Preload all sounds into a reusable cache
const sfxCache = {};
ALL_SFX.forEach(src => { const a = new Audio(); a.preload = 'auto'; a.src = src; sfxCache[src] = a; });

// Unlock audio on first user interaction (needed for browser autoplay policy)
let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    // Play a silent buffer on each cached audio to unlock it
    Object.values(sfxCache).forEach(a => {
        a.volume = 0;
        a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; }).catch(() => { a.volume = 1; });
    });
    [levelSound, knockoutSound, knockoutWinSound, buySound, endSound].forEach(a => {
        a.volume = 0;
        a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; }).catch(() => { a.volume = 1; });
    });
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// ─── Level Change Sound ─────────────────────────────────────
const levelSound = new Audio();
levelSound.preload = 'auto';
let levelSoundFile = '';
function loadLevelSound(filename) {
    levelSoundFile = filename || '';
    if (levelSoundFile) {
        levelSound.src = '../assets/sfx/' + levelSoundFile;
        levelSound.load();
    }
}
let isMuted = false;
function playLevelSound() {
    if (isMuted || !levelSoundFile) return;
    levelSound.currentTime = 0;
    levelSound.play().catch(() => {});
}

// ─── Knockout Sound ─────────────────────────────────────────
const knockoutSound = new Audio();
knockoutSound.preload = 'auto';
let knockoutSoundFile = '';
function loadKnockoutSound(filename) {
    knockoutSoundFile = filename || '';
    if (knockoutSoundFile) {
        knockoutSound.src = '../assets/sfx/' + knockoutSoundFile;
        knockoutSound.load();
    }
}
function playKnockoutSound(inMoney) {
    const file = inMoney ? knockoutWinSoundFile : knockoutSoundFile;
    if (isMuted || !file) return;
    const snd = inMoney ? knockoutWinSound : knockoutSound;
    snd.currentTime = 0;
    snd.play().catch(() => {});
}

// ─── Knockout Win Sound ─────────────────────────────────────
const knockoutWinSound = new Audio();
knockoutWinSound.preload = 'auto';
let knockoutWinSoundFile = '';
function loadKnockoutWinSound(filename) {
    knockoutWinSoundFile = filename || '';
    if (knockoutWinSoundFile) {
        knockoutWinSound.src = '../assets/sfx/' + knockoutWinSoundFile;
        knockoutWinSound.load();
    }
}

// ─── Buy Sound ──────────────────────────────────────────────
const buySound = new Audio();
buySound.preload = 'auto';
let buySoundFile = '';
function loadBuySound(filename) {
    buySoundFile = filename || '';
    if (buySoundFile) {
        buySound.src = '../assets/sfx/' + buySoundFile;
        buySound.load();
    }
}
function playBuySound() {
    if (isMuted || !buySoundFile) return;
    buySound.currentTime = 0;
    buySound.play().catch(() => {});
}

// ─── End Sound ──────────────────────────────────────────────
const endSound = new Audio();
endSound.preload = 'auto';
let endSoundFile = '';
function loadEndSound(filename) {
    endSoundFile = filename || '';
    if (endSoundFile) {
        endSound.src = '../assets/sfx/' + endSoundFile;
        endSound.load();
    }
}
function playEndSound() {
    if (isMuted || !endSoundFile) return;
    endSound.currentTime = 0;
    endSound.play().catch(() => {});
}

document.getElementById('btn-test-sound').addEventListener('click', () => {
    if (!levelSoundFile) return;
    levelSound.currentTime = 0;
    levelSound.play().catch(() => {});
});
document.getElementById('btn-mute').addEventListener('click', () => {
    isMuted = !isMuted;
    const btn = document.getElementById('btn-mute');
    btn.style.opacity = isMuted ? '0.4' : '';
    btn.title = isMuted ? 'Zapnout zvuk' : 'Ztlumit';
});

// ─── Event Feed ─────────────────────────────────────────────
let prevPlayerList = null;

function showFeedToast(html, type) {
    const feed = document.getElementById('knockout-feed');
    const toast = document.createElement('div');
    toast.className = 'knockout-toast' + (type ? ' ' + type : '');
    toast.innerHTML = html;
    feed.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 400);
    }, 10000);
}

// ─── Level Countdown ────────────────────────────────────────
let lastCountdownSec = -1;
let prevWinners = null;

// ─── Firebase Listener ──────────────────────────────────────
tournamentRef.on('value', (snap) => {
    const data = snap.val();
    if (!data) {
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
    }
    // Detect player events (only after first load)
    const newList = T.players.list || [];
    if (prevPlayerList !== null) {
        const paidPlaces = getPaidPlaces();
        const dist = getPayoutDistribution(paidPlaces);
        const buyInAmount = T.config.buyInAmount || 400;
        const addonPrice = T.config.addonAmount || 0;
        const stats = derivePlayerStats(newList);
        const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
        const amounts = roundPayouts(dist, prizePool);
        const activePlayers = newList.filter(p => p.active).length;
        let batchElimCount = 0;
        const prevByName = {};
        prevPlayerList.forEach(p => { prevByName[p.name] = p; });

        newList.forEach((p) => {
            const prev = prevByName[p.name];
            if (!prev) {
                if (p.buys > 0) {
                    showFeedToast('\uD83E\uDE99 ' + p.name + ' — buy-in', 'entry');
                }
                return;
            }
            // Elimination
            if (prev.active && !p.active) {
                batchElimCount++;
                const place = activePlayers + batchElimCount;
                const payout = place <= paidPlaces ? (amounts[place - 1] || 0) : 0;
                let icon = '\u274C';
                if (payout > 0) {
                    if (place === 1) icon = '\uD83E\uDD47';
                    else if (place === 2) icon = '\uD83E\uDD48';
                    else if (place === 3) icon = '\uD83E\uDD49';
                    else icon = '\uD83C\uDFC6';
                }
                let text = icon + ' ' + place + '. místo — ' + p.name;
                if (payout > 0) {
                    text += ' <span class="knockout-payout">— ' + payout.toLocaleString('cs') + ' Kč</span>';
                }
                showFeedToast(text);
                playKnockoutSound(payout > 0);
            }
            // Buy-in / re-buy
            if (p.buys > prev.buys) {
                const label = prev.buys === 0 ? 'buy-in' : 're-buy';
                showFeedToast('\uD83E\uDE99 ' + p.name + ' — ' + label, 'entry');
                playBuySound();
            }
            // Add-on
            if (p.addon && !prev.addon) {
                showFeedToast('\u2B06\uFE0F ' + p.name + ' — add-on', 'entry');
                playBuySound();
            }
        });
    }
    prevPlayerList = newList.map(p => ({ name: p.name, active: p.active, buys: p.buys, addon: p.addon }));

    // Track winners (no toasts — the winner banner is the display)
    prevWinners = { ...(T.state.winners || {}) };

    T.blindStructure = data.blindStructure || [];
    T.blindOverrides = data.blindOverrides || {};
    TABLES = data.tables || DEFAULT_TABLES.slice();
    if (selectedTableIndex >= TABLES.length) selectedTableIndex = TABLES.length - 1;
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

    // Ticker speed
    const tickerSpeed = data.tickerSpeed || 40;
    const track = document.querySelector('.tracker-footer .ticker-track');
    if (track) track.style.animationDuration = tickerSpeed + 's';

    // Sounds from Firebase
    const newSoundFile = data.levelSound || '';
    if (newSoundFile !== levelSoundFile) loadLevelSound(newSoundFile);
    const newKnockoutFile = data.knockoutSound || '';
    if (newKnockoutFile !== knockoutSoundFile) loadKnockoutSound(newKnockoutFile);
    const newKnockoutWinFile = data.knockoutWinSound || '';
    if (newKnockoutWinFile !== knockoutWinSoundFile) loadKnockoutWinSound(newKnockoutWinFile);
    const newBuyFile = data.buySound || '';
    if (newBuyFile !== buySoundFile) loadBuySound(newBuyFile);
    const newEndFile = data.endSound || '';
    if (newEndFile !== endSoundFile) loadEndSound(newEndFile);

    // Play level sound when timer starts
    if (T.state.status === 'running' && prevStatus !== 'running') {
        playLevelSound();
    }
    prevStatus = T.state.status;

    // Auto-close rules when tournament starts
    if (rulesVisible && T.state.status === 'running') {
        rulesVisible = false;
        updateRulesView();
    }

    if (rulesVisible) renderRules();
    renderTableTabs();
    render();

});
