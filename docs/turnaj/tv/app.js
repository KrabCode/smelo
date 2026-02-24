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
let isAdmin = false;
if (location.search.includes('admin')) {
    if (localStorage.getItem('adminAuth') === ADMIN_PASSWORD) {
        isAdmin = true;
    } else {
        const pwd = prompt('Heslo pro admin:');
        if (pwd === ADMIN_PASSWORD) {
            isAdmin = true;
            localStorage.setItem('adminAuth', pwd);
        }
    }
}

function applyAdminMode() {
    document.getElementById('admin-panel').style.display = isAdmin ? '' : 'none';
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

if (location.search.includes('wide')) document.body.classList.add('wide');

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

// Fullscreen toggle
document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen().catch(() => {});
    }
});

// Wide toggle
document.getElementById('btn-toggle-wide').addEventListener('click', () => {
    const params = new URLSearchParams(location.search);
    if (params.has('wide')) {
        params.delete('wide');
        document.body.classList.remove('wide');
    } else {
        params.set('wide', '');
        document.body.classList.add('wide');
    }
    const qs = params.toString().replace(/=(&|$)/g, '$1');
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
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

// ─── Server Time Sync ────────────────────────────────────────
let serverTimeOffset = 0;
db.ref('.info/serverTimeOffset').on('value', (snap) => {
    serverTimeOffset = snap.val() || 0;
});
function serverNow() { return Date.now() + serverTimeOffset; }

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

    // Generate full curve of unique SB values (deduped after rounding)
    function generateCurve(N, fromSB, toSB) {
        const raw = [];
        if (N <= 1) { raw.push(fromSB); return raw; }
        let prev = -1;
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1);
            const sb = roundToChip(fromSB * Math.pow(toSB / fromSB, Math.pow(t, curve)), smallestChip);
            if (sb !== prev) { raw.push(sb); prev = sb; }
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
            let prev = lastSB;
            for (let i = 1; i <= remaining; i++) {
                const t = tStart + (1 - tStart) * (i / remaining);
                const sb = roundToChip(startSB * Math.pow(targetSB / startSB, Math.pow(t, curve)), smallestChip);
                if (sb > ceilingSmall) break;
                if (sb !== prev) {
                    levels.push({ small: sb, big: sb * 2, duration: levelDuration });
                    prev = sb;
                }
            }
        }
    } else {
        // Fresh calculation using curve
        const sbValues = generateCurve(numLevels, startSB, targetSB);
        for (const sb of sbValues) {
            if (sb > ceilingSmall) break;
            levels.push({ small: sb, big: sb * 2, duration: levelDuration });
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

function getPayoutDistribution(paidPlaces) {
    if (paidPlaces <= 0) return [];
    if (PAYOUT_STRUCTURES[paidPlaces]) return PAYOUT_STRUCTURES[paidPlaces];
    // 4+ spots: 1st=40%, 2nd=25%, 3rd=18%, rest split evenly
    const remaining = 17;
    const extraPlaces = paidPlaces - 3;
    const perExtra = Math.round(remaining / extraPlaces * 10) / 10;
    const dist = [40, 25, 18];
    for (let i = 0; i < extraPlaces; i++) dist.push(perExtra);
    return dist;
}

function renderPayout() {
    const { players, config, state } = T;
    const list = players.list || [];
    const stats = derivePlayerStats(list);
    const buyIns = stats.buyIns;
    const buyInAmount = config.buyInAmount || 400;
    const addonPrice = config.addonAmount || 0;
    const prizePool = stats.totalBuys * buyInAmount + stats.addons * addonPrice;
    const paidPlaces = Math.max(1, Math.floor(buyIns * 0.25));
    const dist = getPayoutDistribution(paidPlaces);

    document.getElementById('hd-pool').textContent = prizePool.toLocaleString('cs') + ' Kč';
    document.getElementById('hd-places').textContent = paidPlaces;
    document.getElementById('hd-places-label').textContent =
        paidPlaces === 1 ? 'vítěz' : paidPlaces <= 4 ? 'výherci' : 'výherců';


    const tbody = document.getElementById('payout-body');
    tbody.innerHTML = '';
    dist.forEach((pct, i) => {
        const tr = document.createElement('tr');
        const amount = Math.round(prizePool * pct / 100);
        tr.innerHTML =
            '<td>' + (i + 1) + '.</td>' +
            '<td>' + pct + '%</td>' +
            '<td>' + amount.toLocaleString('cs') + ' Kč</td>';
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
    document.getElementById('hd-buyin').textContent = stats.buyIns;
    document.getElementById('hd-chips').textContent = (players.totalChips || 0).toLocaleString('cs');
    const avgStack = stats.activePlayers > 0 ? Math.round((players.totalChips || 0) / stats.activePlayers) : 0;
    document.getElementById('hd-avg').textContent = avgStack.toLocaleString('cs');
    document.getElementById('hd-buyin-amount').textContent = (config.buyInAmount || 400).toLocaleString('cs') + ' Kč';

    // Start time in header
    const hdStartItem = document.getElementById('hd-start-item');
    if (state.startedAt && state.status === 'running') {
        const d = new Date(state.startedAt);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        document.getElementById('hd-start').textContent = hh + ':' + mm;
        hdStartItem.style.display = '';
    } else {
        hdStartItem.style.display = 'none';
    }

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
    const paidPlaces = Math.max(1, Math.floor(stats.buyIns * 0.25));
    const allDeclared = winnerEntries.length >= paidPlaces && paidPlaces > 0;

    // Winner banner — hide timer/blinds/structure only when all places declared
    const winnerBanner = document.getElementById('winner-banner');
    document.getElementById('display').style.display = allDeclared ? 'none' : '';
    document.querySelector('.sidebar-left').style.display = allDeclared ? 'none' : '';
    document.querySelector('.sidebar-right').style.display = allDeclared ? 'none' : '';
    if (allDeclared) {
        winnerBanner.style.display = '';
        const listEl = document.getElementById('winner-list');
        listEl.innerHTML = winnerEntries.map(k =>
            '<div class="winner-entry"><span class="place">' + k + '. místo: </span>' +
            '<span class="name">' + winners[k] + '</span></div>'
        ).join('');
        // Stop tournament when all winners declared
        if (state.status === 'running') {
            if (isAdmin) tournamentRef.child('state/status').set('finished');
        }
    } else {
        winnerBanner.style.display = 'none';
    }

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

    // Blinds / break display
    const blindsLabelEl = document.getElementById('blinds-label');
    const addonBannerEl = document.getElementById('addon-banner');
    const breakMsgEl = document.getElementById('break-message');
    if (onBreak) {
        blindsLabelEl.style.display = 'none';
        blindsCurEl.textContent = 'PŘESTÁVKA';
        blindsCurEl.classList.add('on-break');
        progressBarEl.classList.add('on-break');
        document.getElementById('blinds-sub').textContent =
            curEntry.duration + ' min';

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
            breakMsgEl.innerHTML = bMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            breakMsgEl.style.display = '';
        } else {
            breakMsgEl.style.display = 'none';
        }
    } else if (curEntry) {
        blindsLabelEl.style.display = '';
        blindsCurEl.textContent =
            curEntry.small.toLocaleString('cs') + ' / ' + curEntry.big.toLocaleString('cs');
        blindsCurEl.classList.remove('on-break');
        progressBarEl.classList.remove('on-break');
        document.getElementById('blinds-sub').textContent = '';
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
        nextEl.innerHTML = 'Další blindy: <span>' +
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
                '<td colspan="4">PŘESTÁVKA ' + timeStr + ' – ' + endHH + ':' + endMM + '</td>';
        } else {
            structBlindCount++;
            levelNum++;
            const isOverridden = !!T.blindOverrides[levelNum];
            if (isOverridden && isAdmin) classes.push('overridden-level');
            tr.className = classes.join(' ');
            if (isAdmin) {
                tr.innerHTML =
                    '<td>' + levelNum + (isOverridden ? ' <button class="blind-reset" data-level="' + levelNum + '" title="Obnovit výchozí">&times;</button>' : '') + '</td>' +
                    '<td>' + timeStr + '</td>' +
                    '<td><input type="number" class="blind-edit" data-level="' + levelNum + '" data-field="small" value="' + s.small + '"></td>' +
                    '<td><input type="number" class="blind-edit" data-level="' + levelNum + '" data-field="big" value="' + s.big + '"></td>';
            } else {
                tr.innerHTML =
                    '<td>' + levelNum + '</td>' +
                    '<td>' + timeStr + '</td>' +
                    '<td>' + s.small.toLocaleString('cs') + '</td>' +
                    '<td>' + s.big.toLocaleString('cs') + '</td>';
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
            'cfg-max-bb': config.maxBB,
            'cfg-blind-curve': config.blindCurve
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
        if (!noteHasFocus && typeof renderNoteInputs === 'function') {
            renderNoteInputs();
        }
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
    let html = '<table class="player-table"><thead><tr>' +
        '<th>Hráč</th><th>' + buyLabel + '</th><th>' + addonLabel + '</th><th>' + bonusLabel + '</th><th>Aktivní</th><th></th>' +
        '</tr></thead><tbody>';
    list.forEach((p, i) => {
        const nameClass = 'player-name' + (p.active ? '' : ' inactive');
        html += '<tr>' +
            '<td class="' + nameClass + '">' + (p.name || '?') + '</td>' +
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
            smallestChip: parseInt(document.getElementById('cfg-smallest').value) || 25,
            bonusAmount: parseInt(document.getElementById('cfg-bonus').value) || 5000,

            levelsPerBreak: parseInt(document.getElementById('cfg-levels-per-break').value) || 0,
            breakDuration: parseInt(document.getElementById('cfg-break-dur').value) || 30,
            buyInAmount: parseInt(document.getElementById('cfg-buyin-amount').value) || 400,
            addonChips: parseInt(document.getElementById('cfg-addon-chips').value) || 0,
            addonAmount: parseInt(document.getElementById('cfg-addon-amount').value) || 0,
            addonCutoff: T.config.addonCutoff || 0,
            maxBB: parseInt(document.getElementById('cfg-max-bb').value) || 10000,
            blindCurve: parseFloat(document.getElementById('cfg-blind-curve').value) || 1.0
        };

        const p = tournamentRef.child('config').set(config);
        showSaveStatus(document.getElementById('config-save-status'), p);
        p.then(() => {
            T.config = config;
            recalcAndSync();
        });
    }

    document.getElementById('section-config').addEventListener('change', saveConfig);

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
        list.push({ name: name, buys: 1, addon: false, bonus: false, active: true });
        T.players.list = list;
        input.value = '';
        savePlayerList();
        render();
    });

    document.getElementById('new-player-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-add-player').click();
    });

    // Add 12 test players
    document.getElementById('btn-add-test-players').addEventListener('click', () => {
        const names = ['Adam', 'Bára', 'Cyril', 'Dana', 'Emil', 'Fanda',
            'Gita', 'Honza', 'Iva', 'Jirka', 'Karel', 'Lucie'];
        const list = T.players.list || [];
        names.forEach(name => {
            list.push({ name, buys: 1, addon: false, bonus: false, active: true });
        });
        T.players.list = list;
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
        const paidPlaces = Math.max(1, Math.floor((T.players.list || []).length * 0.25));
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
        if (!confirm('Opravdu resetovat celý turnaj?')) return;
        tournamentRef.child('state').set(DEFAULTS.state);
        tournamentRef.child('players').set(DEFAULTS.players);
        tournamentRef.child('blindOverrides').set({});
        recalcAndSync();
    });

    // Notes (ticker)
    function renderNoteInputs() {
        const list = document.getElementById('notes-list');
        const notes = T.notes || [];
        list.innerHTML = notes.map((note, i) =>
            '<div class="note-row">' +
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

    document.getElementById('btn-add-note').addEventListener('click', () => {
        T.notes = T.notes || [];
        T.notes.push('');
        renderNoteInputs();
        const inputs = document.querySelectorAll('#notes-list input');
        if (inputs.length) inputs[inputs.length - 1].focus();
    });

    // Blind structure override editing
    document.getElementById('structure-body').addEventListener('change', (e) => {
        if (!e.target.classList.contains('blind-edit')) return;
        const level = parseInt(e.target.dataset.level);
        const field = e.target.dataset.field;
        const val = parseInt(e.target.value);
        if (!level || !field || isNaN(val) || val <= 0) return;

        // Get current override or create from current values
        const ov = T.blindOverrides[level] || {};
        ov[field] = val;

        // If editing SB only, fill BB from current structure (and vice versa)
        const struct = T.blindStructure || [];
        let blindNum = 0;
        let calcSmall, calcBig;
        for (const entry of struct) {
            if (entry.isBreak) continue;
            blindNum++;
            if (blindNum === level) {
                // Recalculate without override to get base values
                const totalChips = recalcTotalChips();
                let freezeUpTo = -1;
                if (T.state.status === 'running' && T.state.startedAt) {
                    freezeUpTo = getCurrentLevel(T.state.startedAt, T.blindStructure).levelIndex;
                }
                const baseStructure = calculateBlinds(T.config, totalChips, freezeUpTo);
                let bn = 0;
                for (const be of baseStructure) {
                    if (be.isBreak) continue;
                    bn++;
                    if (bn === level) { calcSmall = be.small; calcBig = be.big; break; }
                }
                break;
            }
        }

        if (!ov.small) ov.small = calcSmall || 0;
        if (!ov.big) ov.big = calcBig || 0;

        // If both match calculated values, remove the override
        if (ov.small === calcSmall && ov.big === calcBig) {
            delete T.blindOverrides[level];
        } else {
            T.blindOverrides[level] = ov;
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
}
