const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTAYSlBiWTAJ_th0XEzDk9fthNQBrF88_FdBry3l8l9IrcGuopvFoBzIY4Byb5yfTE0U-LyqGkmZxkX/pub?gid=0&single=true&output=csv';
const PLAYER_MIN_SESSIONS = 2;
const PLAYER_RECENT_SESSION_COUNT = 10;
const COLORS = [
    "#E15759","#4E79A7","#F28E2B","#76B7B2","#59A14F","#EDC948",
    "#B07AA1","#FF9DA7","#9C755F","#BAB0AC","#1F77B4","#AEC7E8",
    "#FF7F0E","#FFBB78","#2CA02C","#98DF8A","#D62728","#FF9896",
    "#9467BD","#C5B0D5","#8C564B","#C49C94","#E377C2","#F7B6D2",
    "#7F7F7F","#C7C7C7","#BCBD22","#DBDB8D","#17BECF","#9EDAE5",
    "#393b79","#5254a3","#6b6ecf","#9c9ede","#637939","#8ca252",
    "#b5cf6b","#cedb9c","#8c6d31","#bd9e39","#e7ba52","#e7cb94",
    "#843c39","#ad494a","#d6616b","#e7969c","#7b4173","#a55194",
    "#ce6dbd","#de9ed6","#1b9e77","#d95f02"
];
const TURNOVER_BAR = '#33504c';
const TURNOVER_LINE = '#6fd0c2';
const TURNOVER_TEXT = '#7fc6bd';
const PLAYERS_LINE = '#d9a441';
const PLAYERS_TEXT = '#e0b45c';
const ZTRACENO_LINE = '#f87171';
const ZTRACENO_TEXT = '#f4a0a0';
const OVERLAY_NOTES = {
    turnover: { html: '<b>Obrat</b> — součet všech výher v dané hře.', color: TURNOVER_TEXT },
    players: { html: '<b>Počet hráčů</b>', color: PLAYERS_TEXT },
    ztraceno: { html: '<b>Ztraceno</b> — neplánovaná nesrovnalost v záznamu.', color: ZTRACENO_TEXT },
    reset: { html: '<b>Reset</b> — každý začíná na nule od začátku období.', color: '#c9b3e6' }
};
let chart = null, chartData = null, playerNames = [], playerColors = {}, selectedPlayer = localStorage.getItem('smelo_player') || '';
let storedCumulative = null, storedOriginalCells = null, storedSessionLabels = null, storedAxisLabels = null, storedDates = null, storedTurnover = null, storedPlayerCount = null, storedZtraceno = null;
// Mutually-exclusive aux overlay on the right axis: '' | 'turnover' | 'players' | 'ztraceno'
let activeOverlay = localStorage.getItem('smelo_overlay') || (localStorage.getItem('smelo_turnover') === '1' ? 'turnover' : '');
// Reset is an independent mode (re-bases the main lines), not a right-axis overlay.
if (activeOverlay === 'reset') activeOverlay = '';
let resetBaseline = localStorage.getItem('smelo_reset') === '1';
let rangeMode = localStorage.getItem('smelo_range') || 'half';
const RANGE_MONTHS = { quarter: 3, half: 6, year: 12 };
let rawAllRowsWithDate = null, rawHeaders = null;
let maxPlayerDisplayName = '';
let storedHighlightTooltips = {}, storedRenderOrder = [];
let sliderIdx = -1;
const CACHE_KEY = 'smelo_graph_csv', CACHE_TS_KEY = 'smelo_graph_csv_ts', CACHE_TTL = 1800000;

function fetchCSV() {
    const cached = localStorage.getItem(CACHE_KEY), cachedTs = localStorage.getItem(CACHE_TS_KEY);
    if (cached && cachedTs && (Date.now() - Number(cachedTs)) < CACHE_TTL) return Promise.resolve(cached);
    return fetch(SHEET_URL).then(r => r.text()).then(csv => {
        try { localStorage.setItem(CACHE_KEY, csv); localStorage.setItem(CACHE_TS_KEY, String(Date.now())); } catch(e) {}
        return csv;
    });
}

google.charts.load('current', { packages: ['corechart'] });
google.charts.setOnLoadCallback(fetchAndRender);

function fetchAndRender() {
    fetchCSV().then(csv => {
        const lines = csv.trim().split('\n');
        rawHeaders = lines[0].split(',');
        const allDataRows = lines.slice(2).map(line => line.split(','));
        rawAllRowsWithDate = allDataRows
            .filter(row => row[1] && row[1].trim() !== '')
            .map(row => {
                const raw = row[1].trim();
                let ts = Date.parse(raw);
                if (isNaN(ts)) {
                    let m = raw.match(/(\d{4}-\d{2}-\d{2})/);
                    if (m) ts = Date.parse(m[1]);
                    else {
                        m = raw.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
                        if (m) { const p = m[1].split('.'); ts = Date.parse(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`); }
                        else {
                            m = raw.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                            if (m) { const p = m[1].split('/'); ts = Date.parse(`${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`); }
                            else ts = NaN;
                        }
                    }
                }
                return { row, date: isNaN(ts) ? null : new Date(ts) };
            });
        syncRangeUI();
        syncOverlayUI();
        // Reveal the chart area and drop the spinner BEFORE the first draw: the spinner's
        // fixed 400px height otherwise collapses #chartContainer, so the chart would draw
        // into a near-zero box and stay broken until the next redraw (e.g. clicking a pill).
        document.getElementById('rangeToggle').style.display = '';
        document.getElementById('sessionDetails').style.display = '';
        document.getElementById('graphSpinner').style.display = 'none';
        document.getElementById('chartDiv').style.visibility = 'visible';
        processAndRender();
    });
}

function processAndRender() {
    const allRowsWithDate = rawAllRowsWithDate;
    const headers = rawHeaders;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const validColumns = headers.map((h, i) => ({ h, i })).filter(x => x.h && x.h.trim() !== '');

    const rowsRecent = allRowsWithDate.filter(x => x.date && x.date >= sixMonthsAgo).map(x => x.row);
    const appearances = validColumns.map(x => {
        let c = 0;
        for (const row of rowsRecent) { const v = row[x.i]; if (v !== undefined && v !== '' && v !== '0' && Number(v) !== 0) c++; }
        return c;
    });
    const recentRows = allRowsWithDate.slice(-PLAYER_RECENT_SESSION_COUNT).map(x => x.row);
    const presentInLast = col => recentRows.some(row => {
        const v = row[col.i];
        return v !== undefined && v !== '' && v !== '0' && Number(v) !== 0;
    });
    const filteredColumns = validColumns.filter((col, i) => appearances[i] >= PLAYER_MIN_SESSIONS || presentInLast(col));
    playerNames = filteredColumns.map(x => x.h);
    playerNames.forEach((name, i) => { playerColors[name] = COLORS[i % COLORS.length]; });
    maxPlayerDisplayName = playerNames.reduce((max, n) => { const d = n.split('/')[0].trim(); return d.length > max.length ? d : max; }, '');

    const allWinnings = allRowsWithDate.map(x => filteredColumns.map(col => x.row[col.i] === '' ? 0 : Number(x.row[col.i])));
    const allOriginalCells = allRowsWithDate.map(x => filteredColumns.map(col => x.row[col.i]));
    const allCumulative = playerNames.map((_, ci) => { let s = 0; return allWinnings.map(row => s += (row[ci] || 0)); });

    let cutoffIndex = 0;
    const rangeMonths = RANGE_MONTHS[rangeMode];
    if (rangeMonths) {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - rangeMonths);
        for (let i = 0; i < allRowsWithDate.length; i++) {
            if (allRowsWithDate[i].date && allRowsWithDate[i].date >= cutoffDate) { cutoffIndex = i; break; }
        }
    }

    const rows = allRowsWithDate.slice(cutoffIndex);
    const cumulative = allCumulative.map(arr => arr.slice(cutoffIndex));
    const originalCells = allOriginalCells.slice(cutoffIndex);

    cumulative.forEach((arr, ci) => {
        let lastIdx = -1;
        for (let i = arr.length - 1; i >= 0; i--) {
            const cell = originalCells[i][ci];
            if (cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0) { lastIdx = i; break; }
        }
        if (lastIdx >= 0 && lastIdx < arr.length - 1) for (let i = lastIdx + 1; i < arr.length; i++) arr[i] = null;
    });
    cumulative.forEach((arr) => {
        let firstIdx = -1;
        for (let i = 0; i < arr.length; i++) { if (arr[i] != null && arr[i] !== 0) { firstIdx = i; break; } }
        if (firstIdx > 0) for (let i = 0; i < firstIdx; i++) arr[i] = null;
    });

    // "Reset" mode: re-base every line to zero at the start of the shown period, so the
    // chart shows net change within the cycle instead of carried-over all-time totals.
    if (resetBaseline) {
        cumulative.forEach(arr => {
            let base = null;
            for (let i = 0; i < arr.length; i++) { if (arr[i] != null) { base = arr[i]; break; } }
            if (base != null) for (let i = 0; i < arr.length; i++) { if (arr[i] != null) arr[i] -= base; }
        });
    }

    const sessionLabels = rows.map(x => {
        if (x.date) {
            const d = x.date;
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        return x.row[1];
    });

    // Sparse, scannable x-axis labels: a year when it first advances, a month number at each
    // new month, blank otherwise. Year tracking is monotonic so stray typo dates (e.g. a lone
    // 2024 amid 2025) don't flip-flop the year label. Full dates stay on the detail panel.
    let shownYear = null, prevMonth = null;
    const axisLabels = rows.map(x => {
        if (!x.date) return '';
        const y = x.date.getFullYear(), m = x.date.getMonth() + 1;
        let label = '';
        if (shownYear === null || y > shownYear) { label = String(y); shownYear = y; prevMonth = m; }
        else if (y === shownYear && m !== prevMonth) { label = m + '.'; prevMonth = m; }
        return label;
    });

    const turnover = rows.map(x => {
        let t = 0;
        for (const col of validColumns) { const v = Number(x.row[col.i]); if (v > 0) t += v; }
        return t;
    });
    const playerCount = rows.map(x => {
        let n = 0;
        for (const col of validColumns) { const c = x.row[col.i]; if (c !== undefined && c !== '' && c !== '0' && Number(c) !== 0) n++; }
        return n;
    });
    // Column 0 holds "Ztraceno / nezaznamenaný hráč" — the unrecorded amount per session.
    const ztraceno = rows.map(x => { const v = Number(x.row[0]); return isNaN(v) ? 0 : v; });

    storedCumulative = cumulative;
    storedOriginalCells = originalCells;
    storedSessionLabels = sessionLabels;
    storedAxisLabels = axisLabels;
    storedDates = rows.map(x => x.date);
    storedTurnover = turnover;
    storedPlayerCount = playerCount;
    storedZtraceno = ztraceno;

    if (!selectedPlayer) {
        const lastIdx = originalCells.length - 1;
        if (lastIdx >= 0) {
            let winnerName = '', winnerDelta = -Infinity;
            playerNames.forEach((name, ci) => {
                const cell = originalCells[lastIdx][ci];
                const v = (cell !== undefined && cell !== '' && cell !== '0') ? Number(cell) : 0;
                if (v <= 0) return;
                const d = name.split('/')[0].trim(), wd = winnerName.split('/')[0].trim();
                if (v > winnerDelta || (v === winnerDelta && d < wd)) { winnerDelta = v; winnerName = name; }
            });
            if (winnerName) selectedPlayer = winnerName;
        }
    }

    drawChart();
    drawStatsChart();
}

function syncRangeUI() {
    document.querySelectorAll('#rangeToggle [data-range]').forEach(b => b.classList.toggle('active', b.dataset.range === rangeMode));
}
document.querySelectorAll('#rangeToggle [data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (rangeMode === btn.dataset.range) return;
        rangeMode = btn.dataset.range;
        localStorage.setItem('smelo_range', rangeMode);
        syncRangeUI();
        processAndRender();
    });
});
function syncOverlayNote() {
    const note = document.getElementById('overlayNote');
    // Aux overlay note takes the line; otherwise show the Reset explainer when Reset is on.
    const cfg = OVERLAY_NOTES[activeOverlay] || (resetBaseline ? OVERLAY_NOTES.reset : null);
    if (cfg) { note.innerHTML = cfg.html; note.style.color = cfg.color; note.style.display = ''; }
    else { note.style.display = 'none'; }
}
function syncOverlayUI() {
    document.getElementById('btnTurnover').classList.toggle('active', activeOverlay === 'turnover');
    document.getElementById('btnPlayers').classList.toggle('active', activeOverlay === 'players');
    document.getElementById('btnZtraceno').classList.toggle('active', activeOverlay === 'ztraceno');
    document.getElementById('btnReset').classList.toggle('active', resetBaseline);
    syncOverlayNote();
}
function setOverlay(name) {
    activeOverlay = activeOverlay === name ? '' : name;
    localStorage.setItem('smelo_overlay', activeOverlay);
    syncOverlayUI();
    drawChart();
}
document.getElementById('btnTurnover').addEventListener('click', () => setOverlay('turnover'));
document.getElementById('btnPlayers').addEventListener('click', () => setOverlay('players'));
document.getElementById('btnZtraceno').addEventListener('click', () => setOverlay('ztraceno'));
document.getElementById('btnReset').addEventListener('click', () => {
    resetBaseline = !resetBaseline;
    localStorage.setItem('smelo_reset', resetBaseline ? '1' : '0');
    document.getElementById('btnReset').classList.toggle('active', resetBaseline);
    syncOverlayNote();
    processAndRender();
});
document.getElementById('btnRefreshChart').addEventListener('click', () => {
    try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(CACHE_TS_KEY); } catch(e) {}
    document.getElementById('graphSpinner').style.display = '';
    document.getElementById('chartDiv').style.visibility = 'hidden';
    fetchAndRender();
});

function buildTooltip(rowIdx, highlightLabels, hoveredPlayer) {
    const entries = playerNames.map((name, ci) => {
        const cell = storedOriginalCells[rowIdx][ci];
        const delta = (cell !== undefined && cell !== '' && cell !== '0') ? Number(cell) : 0;
        if (delta === 0) return null;
        const po = storedCumulative[ci][rowIdx];
        const pred = po != null ? po - delta : null;
        return { name: name.split('/')[0].trim(), fullName: name, pred, delta, po, color: playerColors[name] };
    }).filter(Boolean).sort((a, b) => b.delta - a.delta);

    const sign = v => v > 0 ? '+' + v : String(v);
    const deltaClass = v => v > 0 ? 'tt-delta-pos' : v < 0 ? 'tt-delta-neg' : 'tt-delta-zero';

    const sizer = `<tr aria-hidden="true" style="visibility:collapse;">` +
        `<td></td>` +
        `<td style="white-space:nowrap;">${maxPlayerDisplayName}</td>` +
        `<td>-99999</td>` +
        `<td>-99999</td>` +
        `<td>-99999</td>` +
        `</tr>`;
    let html = `<div class="tt"><table class="tt-table">`;
    html += `<thead><tr><th></th><th></th><th>Před</th><th>Změna</th><th>Po</th></tr></thead><tbody>${sizer}`;
    entries.forEach(e => {
        const isFocus = e.fullName === hoveredPlayer;
        const bld = isFocus ? 'font-weight:bold;' : '';
        const bg = isFocus ? 'background:rgba(255,255,255,0.06);' : '';
        html += `<tr data-player="${e.fullName}" style="cursor:pointer;${bg}">` +
            `<td><span class="tt-dot" style="background:${e.color}"></span></td>` +
            `<td style="text-align:left;${bld}">${e.name}</td>` +
            `<td class="tt-pred" style="${bld}">${e.pred != null ? e.pred : '—'}</td>` +
            `<td class="${deltaClass(e.delta)}" style="${bld}">${sign(e.delta)}</td>` +
            `<td class="tt-po" style="${bld}">${e.po != null ? e.po : '—'}</td>` +
            `</tr>`;
    });
    html += `</tbody></table>`;
    if (highlightLabels && highlightLabels[rowIdx]) {
        const pName = selectedPlayer ? selectedPlayer.split('/')[0].trim() : '';
        const pColor = selectedPlayer ? playerColors[selectedPlayer] : '#ffb300';
        html += `<div style="margin-top:6px;padding-top:4px;border-top:1px solid #444;font-size:11px;"><span style="color:${pColor};font-weight:bold;">${pName}</span><br><span style="color:#ffb300;">${highlightLabels[rowIdx]}</span></div>`;
    }
    return html + '</div>';
}

function drawChart() {
    if (!storedCumulative) return;
    const cumulative = storedCumulative;
    const originalCells = storedOriginalCells;
    const sessionLabels = storedSessionLabels;
    const axisLabels = storedAxisLabels || storedSessionLabels;

    // Find highlight indices for selected player
    let highlightTooltips = {}, highlightTypes = {};
    if (selectedPlayer) {
        const ci = playerNames.indexOf(selectedPlayer);
        if (ci >= 0) {
            let bestVal = -Infinity, worstVal = Infinity, bestIdx = -1, worstIdx = -1;
            for (let i = 0; i < originalCells.length; i++) {
                const cell = originalCells[i][ci];
                const played = cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0;
                if (!played) continue;
                const v = Number(cell);
                if (v > 0 && v > bestVal) { bestVal = v; bestIdx = i; }
                if (v < 0 && v < worstVal) { worstVal = v; worstIdx = i; }
            }
            if (bestIdx >= 0) {
                highlightTypes[bestIdx] = 'best';
                highlightTooltips[bestIdx] = '<span style="color:#4ade80;">&#9650; Největší výhra: +' + bestVal + '</span>';
            }
            if (worstIdx >= 0) {
                highlightTypes[worstIdx] = 'worst';
                highlightTooltips[worstIdx] = (highlightTooltips[worstIdx] ? highlightTooltips[worstIdx] + '<br>' : '') + '<span style="color:#f87171;">&#9660; Největší prohra: ' + worstVal + '</span>';
            }
        }
    }

    storedHighlightTooltips = highlightTooltips;

    // Render selected player last so it paints on top
    const selectedIdx = selectedPlayer ? playerNames.indexOf(selectedPlayer) : -1;
    const renderOrder = playerNames.map((_, i) => i);
    if (selectedIdx >= 0) { renderOrder.splice(selectedIdx, 1); renderOrder.push(selectedIdx); }
    storedRenderOrder = renderOrder;

    // Numeric x-axis (row index) with explicit sparse ticks — a string axis would merge
    // the repeated blank labels into one category and pile all points together.
    const hTicks = [];
    axisLabels.forEach((lab, i) => { if (lab) hTicks.push({ v: i, f: lab }); });

    chartData = new google.visualization.DataTable();
    chartData.addColumn('number', 'Datum');
    renderOrder.forEach(ci => {
        chartData.addColumn('number', playerNames[ci]);
        chartData.addColumn({ type: 'string', role: 'tooltip', p: { html: true } });
        chartData.addColumn({ type: 'string', role: 'style' });
    });
    chartData.addColumn('number', '_mirror');
    if (activeOverlay === 'turnover') { chartData.addColumn('number', 'Obrat'); chartData.addColumn('number', 'ObratLine'); }
    else if (activeOverlay === 'players') { chartData.addColumn('number', 'Hráči'); }
    else if (activeOverlay === 'ztraceno') { chartData.addColumn('number', 'Ztraceno'); }

    let yMin = 0, yMax = 0;
    cumulative.forEach(arr => arr.forEach(v => { if (v != null) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v); } }));
    const yRange = yMax - yMin;
    const step = yRange <= 2000 ? 500 : yRange <= 5000 ? 1000 : yRange <= 15000 ? 2500 : 5000;
    const axisTicks = [];
    for (let t = Math.floor(yMin / step) * step; t <= Math.ceil(yMax / step) * step; t += step) axisTicks.push(t);
    // Right-axis driver: a flat, invisible line pinned to the top tick. It only exists so
    // axis 1 renders; keeping it in the empty top margin stops it overlapping — and blocking
    // clicks on — the leader's line (which is what a per-row max would trace).
    const mirrorTop = axisTicks.length ? axisTicks[axisTicks.length - 1] : yMax;

    for (let i = 0; i < sessionLabels.length; i++) {
        const row = [i];
        renderOrder.forEach((ci, j) => {
            const name = playerNames[ci];
            const v = cumulative[ci][i];
            row.push(v);
            row.push(null);
            const cell = originalCells[i][ci];
            const played = cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0;
            if (selectedPlayer && name === selectedPlayer) {
                const pc = playerColors[name];
                const ht = highlightTypes[i];
                if (ht === 'best') row.push('point {size: 7; shape-type: triangle; fill-color: #4ade80; stroke-color: #4ade80; stroke-width: 0; visible: true;}');
                else if (ht === 'worst') row.push('point {size: 7; shape-type: triangle; shape-rotation: 180; fill-color: #f87171; stroke-color: #f87171; stroke-width: 0; visible: true;}');
                else if (played) row.push('point {size: 2.5; fill-color: ' + pc + '; visible: true;}');
                else row.push(null);
            } else {
                row.push(null);
            }
        });
        row.push(mirrorTop);
        if (activeOverlay === 'turnover') { row.push(storedTurnover[i]); row.push(storedTurnover[i]); }
        else if (activeOverlay === 'players') { row.push(storedPlayerCount[i]); }
        else if (activeOverlay === 'ztraceno') { row.push(storedZtraceno[i]); }
        chartData.addRow(row);
    }

    const mute = hex => {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const bg = 34;
        const mix = (c) => Math.round(bg + (c - bg) * 0.45);
        return '#' + [r,g,b].map(c => mix(c).toString(16).padStart(2,'0')).join('');
    };

    const series = {};
    renderOrder.forEach((ci, j) => {
        const name = playerNames[ci];
        const color = playerColors[name];
        if (selectedPlayer && name === selectedPlayer) series[j] = { color, lineWidth: 3, pointSize: 0, visibleInLegend: true, targetAxisIndex: 0 };
        else series[j] = { color: mute(color), lineWidth: 1, pointSize: 0, visibleInLegend: false, targetAxisIndex: 0 };
    });
    // Mirror series drives the right-hand y-axis labels; when an aux series overlay is shown
    // it yields axis 1 to that overlay, so park it on axis 0 (still invisible). Reset has no
    // aux series, so the mirror keeps the right axis.
    const auxOverlay = activeOverlay === 'turnover' || activeOverlay === 'players' || activeOverlay === 'ztraceno';
    series[playerNames.length] = { targetAxisIndex: auxOverlay ? 0 : 1, lineWidth: 0, pointSize: 0, visibleInLegend: false, enableInteractivity: false };
    if (activeOverlay === 'turnover') {
        series[playerNames.length + 1] = { type: 'bars', targetAxisIndex: 1, color: TURNOVER_BAR, visibleInLegend: false, enableInteractivity: true };
        series[playerNames.length + 2] = { type: 'line', targetAxisIndex: 1, color: TURNOVER_LINE, lineWidth: 2, pointSize: 4, visibleInLegend: false, enableInteractivity: true };
    } else if (activeOverlay === 'players') {
        series[playerNames.length + 1] = { type: 'line', targetAxisIndex: 1, color: PLAYERS_LINE, lineWidth: 2, pointSize: 4, visibleInLegend: false, enableInteractivity: true };
    } else if (activeOverlay === 'ztraceno') {
        series[playerNames.length + 1] = { type: 'line', targetAxisIndex: 1, color: ZTRACENO_LINE, lineWidth: 2, pointSize: 4, visibleInLegend: false, enableInteractivity: true };
    }
    const vAxisShared = { textStyle: { color: '#aaa' }, gridlines: { color: '#333' }, baselineColor: '#888', format: 'short', ticks: axisTicks };
    let axis1 = { ...vAxisShared, gridlines: { color: 'transparent' } };
    if (activeOverlay === 'turnover') {
        const maxT = Math.max(1, ...storedTurnover.filter(v => v != null));
        // Scale so the tallest bar reaches ~35% of the plot height, keeping bars a low backdrop.
        axis1 = { textStyle: { color: TURNOVER_TEXT, fontSize: 10 }, gridlines: { color: 'transparent' }, baselineColor: 'transparent', viewWindow: { min: 0, max: maxT / 0.35 }, format: 'short' };
    } else if (activeOverlay === 'players') {
        const maxC = Math.max(1, ...storedPlayerCount.filter(v => v != null));
        // Same low-backdrop scaling; integer counts, no decimals.
        axis1 = { textStyle: { color: PLAYERS_TEXT, fontSize: 10 }, gridlines: { color: 'transparent' }, baselineColor: 'transparent', viewWindow: { min: 0, max: Math.ceil(maxC / 0.35) }, format: '0' };
    } else if (activeOverlay === 'ztraceno') {
        const vals = storedZtraceno.filter(v => v != null);
        const minZ = Math.min(0, ...vals), maxZ = Math.max(0, ...vals);
        const span = Math.max(1, maxZ - minZ);
        // Compress the (possibly negative) range into the bottom band of the plot.
        axis1 = { textStyle: { color: ZTRACENO_TEXT, fontSize: 10 }, gridlines: { color: 'transparent' }, baselineColor: 'transparent', viewWindow: { min: minZ - span * 0.05, max: minZ + span / 0.35 }, format: 'short' };
    }
    const options = {
        // Title lives in the window title bar now, not inside the chart.
        legend: 'none', interpolateNulls: false, dataOpacity: 1.0, curveType: 'function', seriesType: 'line', series,
        bar: { groupWidth: '55%' },
        hAxis: { textStyle: { fontSize: 11, color: '#aaa' }, ticks: hTicks, viewWindow: { min: -0.5, max: sessionLabels.length - 0.5 }, gridlines: { color: 'transparent' }, minorGridlines: { count: 0 }, baselineColor: 'transparent' },
        vAxes: { 0: vAxisShared, 1: axis1 },
        chartArea: { left: 60, top: 16, right: 60, bottom: 40, width: '100%', height: '100%', backgroundColor: 'transparent' },
        tooltip: { trigger: 'none' },
        explorer: { actions: ['dragToZoom', 'rightClickToReset'], axis: 'horizontal', keepInBounds: true, maxZoomIn: 0.1 },
        backgroundColor: 'transparent'
    };
    if (!chart) {
        chart = new google.visualization.ComboChart(document.getElementById('chartDiv'));
        google.visualization.events.addListener(chart, 'select', function() {
            var sel = chart.getSelection();
            if (!sel.length) return;
            var s = sel[0];
            // Clicking a line: column identifies the player series (1 + j*3 per render slot).
            var playerChanged = false;
            if (s.column != null) {
                var j = Math.round((s.column - 1) / 3);
                if (storedRenderOrder && j >= 0 && j < storedRenderOrder.length && (s.column - 1) % 3 === 0) {
                    var player = playerNames[storedRenderOrder[j]];
                    if (player && player !== selectedPlayer) {
                        selectedPlayer = player;
                        localStorage.setItem('smelo_player', selectedPlayer);
                        playerChanged = true;
                    }
                }
            }
            if (s.row != null) {
                sliderIdx = s.row;
                const sliderEl = document.getElementById('sliderInput');
                if (sliderEl) sliderEl.value = sliderIdx;
                const details = document.getElementById('sessionDetails');
                details.open = true;
                details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            if (playerChanged) { drawChart(); renderStatsTable(); }
            if (s.row != null) { updateSliderInfo(); setChartHighlight(sliderIdx); updateFsDetail(sliderIdx); }
        });
        // Lightweight hover tooltip for the overlay nodes (native tooltips are off globally).
        const chartDiv = document.getElementById('chartDiv');
        chartDiv.addEventListener('mousemove', e => {
            const r = document.getElementById('chartContainer').getBoundingClientRect();
            overlayMouse.x = e.clientX - r.left;
            overlayMouse.y = e.clientY - r.top;
        });
        google.visualization.events.addListener(chart, 'onmouseover', e => {
            showOverlayTip(e.row, e.column);
            if (e.row != null && document.fullscreenElement) updateFsDetail(e.row);
        });
        google.visualization.events.addListener(chart, 'onmouseout', () => {
            hideOverlayTip();
            // Not hovering any node: fall back to the selected session in the fullscreen readout.
            if (document.fullscreenElement) updateFsDetail(sliderIdx >= 0 ? sliderIdx : (storedSessionLabels ? storedSessionLabels.length - 1 : 0));
        });
    }
    chart.draw(chartData, options);
    initSlider();
}

const overlayMouse = { x: 0, y: 0 };
function overlayTipEl() {
    let el = document.getElementById('overlayTip');
    if (!el) {
        el = document.createElement('div');
        el.id = 'overlayTip';
        document.getElementById('chartContainer').appendChild(el);
    }
    return el;
}
function showOverlayTip(row, column) {
    if (!activeOverlay || row == null || column == null) { hideOverlayTip(); return; }
    const base = 1 + 3 * storedRenderOrder.length; // '_mirror' column index; overlay columns follow
    let txt = null;
    if (activeOverlay === 'turnover' && (column === base + 1 || column === base + 2)) {
        txt = 'Obrat: ' + Number(storedTurnover[row]).toLocaleString('cs-CZ');
    } else if (activeOverlay === 'players' && column === base + 1) {
        txt = 'Hráčů: ' + storedPlayerCount[row];
    } else if (activeOverlay === 'ztraceno' && column === base + 1) {
        txt = 'Ztraceno: ' + Number(storedZtraceno[row]).toLocaleString('cs-CZ');
    }
    if (!txt) { hideOverlayTip(); return; }
    const el = overlayTipEl();
    el.textContent = txt;
    el.style.display = 'block';
    // Clamp inside the chart container so the tip never bleeds past the edges.
    const c = document.getElementById('chartContainer');
    const cw = c.clientWidth, ch = c.clientHeight, tw = el.offsetWidth, th = el.offsetHeight, pad = 4;
    let left = overlayMouse.x + 12, top = overlayMouse.y - 8;
    if (left + tw > cw - pad) left = overlayMouse.x - tw - 12; // flip to the cursor's left
    left = Math.max(pad, Math.min(left, cw - tw - pad));
    top = Math.max(pad, Math.min(top, ch - th - pad));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}
function hideOverlayTip() {
    const el = document.getElementById('overlayTip');
    if (el) el.style.display = 'none';
}
// Fullscreen-only readout of the per-session detail table, docked top-left.
let fsDetailDismissed = false;
function updateFsDetail(rowIdx) {
    const el = document.getElementById('fsDetail');
    if (!el || fsDetailDismissed || rowIdx == null || !storedSessionLabels || !storedSessionLabels[rowIdx]) return;
    el.innerHTML = '<button class="fs-detail-close" title="Skrýt" aria-label="Skrýt">×</button>' +
        '<div class="fs-detail-title">' + storedSessionLabels[rowIdx] + '</div>' +
        buildTooltip(rowIdx, storedHighlightTooltips, selectedPlayer || null);
}

let statsSortCol = 'total', statsSortAsc = false, statsData = null;

function computeStats() {
    if (!storedOriginalCells || !playerNames.length) return [];
    const oc = storedOriginalCells;
    return playerNames.map((name, ci) => {
        const sessions = [];
        for (let i = 0; i < oc.length; i++) {
            const cell = oc[i][ci];
            if (cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0) {
                sessions.push(Number(cell));
            }
        }
        // Net within the shown range, so the time pills (and Reset) drive this column too.
        const total = sessions.reduce((a, b) => a + b, 0);
        if (!sessions.length) return { name: name.split('/')[0].trim(), fullName: name, avg: 0, best: 0, worst: 0, total: 0, games: 0, color: playerColors[name] };
        const wins = sessions.filter(s => s > 0);
        const losses = sessions.filter(s => s < 0);
        return {
            name: name.split('/')[0].trim(),
            fullName: name,
            avg: Math.round(sessions.reduce((a, b) => a + b, 0) / sessions.length),
            best: wins.length ? Math.max(...wins) : 0,
            worst: losses.length ? Math.min(...losses) : 0,
            total,
            games: sessions.length,
            color: playerColors[name]
        };
    });
}

function drawStatsChart() {
    statsData = computeStats();
    renderStatsTable();
}

function renderStatsTable() {
    if (!statsData) return;
    const sorted = [...statsData].sort((a, b) => {
        const av = statsSortCol === 'name' ? a.name : a[statsSortCol];
        const bv = statsSortCol === 'name' ? b.name : b[statsSortCol];
        if (statsSortCol === 'name') return statsSortAsc ? av.localeCompare(bv, 'cs') : bv.localeCompare(av, 'cs');
        return statsSortAsc ? av - bv : bv - av;
    });

    const arrow = col => statsSortCol === col ? (statsSortAsc ? ' ▲' : ' ▼') : '';
    const c = v => v > 0 ? 'val-pos' : v < 0 ? 'val-neg' : '';
    const f = v => `${v}`;
    let html = `<table><tr><th data-col="name">Hráč${arrow('name')}</th><th data-col="total">Kumulativní šmelo${arrow('total')}</th><th data-col="games">Počet her${arrow('games')}</th><th data-col="avg">Průměr za hru${arrow('avg')}</th><th data-col="best">Největší výhra${arrow('best')}</th><th data-col="worst">Největší prohra${arrow('worst')}</th></tr>`;
    sorted.forEach(s => {
        const sel = selectedPlayer === s.fullName ? ' class="selected"' : '';
        html += `<tr data-player="${s.fullName}"${sel}>` +
            `<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px;vertical-align:middle;"></span>${s.name}</td>` +
            `<td class="${c(s.total)}">${f(s.total)}</td>` +
            `<td>${s.games}</td>` +
            `<td class="${c(s.avg)}">${f(s.avg)}</td>` +
            `<td class="${c(s.best)}">${f(s.best)}</td>` +
            `<td class="${c(s.worst)}">${f(s.worst)}</td>` +
            `</tr>`;
    });
    html += '</table>';
    const div = document.getElementById('statsTableDiv');
    div.innerHTML = html;
    div.querySelectorAll('th').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (statsSortCol === col) statsSortAsc = !statsSortAsc;
            else { statsSortCol = col; statsSortAsc = col === 'worst'; }
            renderStatsTable();
        });
    });
    div.querySelectorAll('tr[data-player]').forEach(tr => {
        tr.addEventListener('click', () => {
            const player = tr.dataset.player;
            selectedPlayer = selectedPlayer === player ? '' : player;
            localStorage.setItem('smelo_player', selectedPlayer);
            drawChart();
            renderStatsTable();
        });
    });
}

window.addEventListener('resize', () => { if (storedCumulative) drawChart(); });

// Resizable chart frame: redraw the chart to fit whenever the window is resized,
// and remember the chosen width/height across visits.
(function initChartResize() {
    const win = document.getElementById('chartWindow');
    if (!win) return;
    const savedW = localStorage.getItem('smelo_chart_w');
    const savedH = localStorage.getItem('smelo_chart_h');
    if (savedW) win.style.width = savedW + 'px';
    if (savedH) win.style.height = savedH + 'px';
    if (!window.ResizeObserver) return;
    let t = null;
    const ro = new ResizeObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => {
            if (storedCumulative) drawChart();
            // Don't remember the stretched size while in fullscreen.
            if (!document.fullscreenElement) {
                try {
                    localStorage.setItem('smelo_chart_w', String(Math.round(win.clientWidth)));
                    localStorage.setItem('smelo_chart_h', String(Math.round(win.clientHeight)));
                } catch (e) {}
            }
        }, 60);
    });
    ro.observe(win);
})();

// Window chrome: native fullscreen toggle (browser handles Esc + the top layer).
(function initChartWindow() {
    const win = document.getElementById('chartWindow');
    const btn = document.getElementById('btnFullscreen');
    if (!win || !btn) return;
    function toggle() {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (win.requestFullscreen) win.requestFullscreen();
    }
    btn.addEventListener('click', toggle);
    document.getElementById('chartTitleBar').addEventListener('dblclick', e => {
        if (!e.target.closest('.win-btn')) toggle();
    });
    // X on the fullscreen readout hides it until fullscreen is toggled off and on again.
    document.getElementById('fsDetail').addEventListener('click', e => {
        if (!e.target.closest('.fs-detail-close')) return;
        fsDetailDismissed = true;
        document.getElementById('fsDetail').style.display = 'none';
    });
    document.addEventListener('fullscreenchange', () => {
        const on = document.fullscreenElement === win;
        btn.classList.toggle('active', on);
        btn.title = on ? 'Ukončit celou obrazovku (Esc)' : 'Celá obrazovka';
        if (storedCumulative) drawChart();
        if (on) {
            // Fresh entry: bring the readout back even if it was dismissed last time.
            fsDetailDismissed = false;
            document.getElementById('fsDetail').style.display = '';
            updateFsDetail(sliderIdx >= 0 ? sliderIdx : (storedSessionLabels ? storedSessionLabels.length - 1 : 0));
        }
    });
})();

// Drag the whole chart window by its title bar, like a desktop window. Uses a CSS
// transform so the document flow (and the slot the window occupies) stays put, and
// persists the offset. Transform is dropped in fullscreen — it would shift the
// viewport-sized fullscreen element off-screen.
(function initChartDrag() {
    const win = document.getElementById('chartWindow');
    const bar = document.getElementById('chartTitleBar');
    if (!win || !bar) return;
    let offX = Number(localStorage.getItem('smelo_chart_x')) || 0;
    let offY = Number(localStorage.getItem('smelo_chart_y')) || 0;
    const apply = () => { win.style.transform = document.fullscreenElement ? '' : `translate(${offX}px, ${offY}px)`; };
    apply();
    let startX = 0, startY = 0, baseX = 0, baseY = 0, dragging = false;
    bar.addEventListener('pointerdown', e => {
        // Left button only; ignore the window buttons and never drag in fullscreen.
        if (e.button !== 0 || e.target.closest('.win-btn') || document.fullscreenElement) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY; baseX = offX; baseY = offY;
        bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', e => {
        if (!dragging) return;
        offX = baseX + (e.clientX - startX);
        offY = baseY + (e.clientY - startY);
        apply();
    });
    const end = () => {
        if (!dragging) return;
        dragging = false;
        try {
            localStorage.setItem('smelo_chart_x', String(Math.round(offX)));
            localStorage.setItem('smelo_chart_y', String(Math.round(offY)));
        } catch (e) {}
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    document.addEventListener('fullscreenchange', apply);
})();

function initSlider() {
    const slider = document.getElementById('sliderInput');
    const n = storedSessionLabels ? storedSessionLabels.length : 0;
    if (!n) return;
    slider.max = n - 1;
    if (sliderIdx < 0 || sliderIdx >= n) sliderIdx = n - 1;
    slider.value = sliderIdx;
    updateSliderInfo();
    setChartHighlight(sliderIdx);
}

function updateSliderInfo() {
    const slider = document.getElementById('sliderInput');
    sliderIdx = parseInt(slider.value);
    if (!storedSessionLabels || sliderIdx < 0) return;
    document.getElementById('sessionSummary').textContent = 'Detail';
    document.getElementById('sessionCardTitle').textContent = storedSessionLabels[sliderIdx];
    const n = storedSessionLabels.length;
    document.getElementById('sliderPrev').style.visibility = sliderIdx <= 0 ? 'hidden' : '';
    document.getElementById('sliderNext').style.visibility = sliderIdx >= n - 1 ? 'hidden' : '';
    const infoEl = document.getElementById('sessionSliderInfo');
    infoEl.innerHTML = buildTooltip(sliderIdx, storedHighlightTooltips, selectedPlayer || null);
    infoEl.querySelectorAll('tr[data-player]').forEach(tr => {
        tr.addEventListener('click', () => {
            selectedPlayer = selectedPlayer === tr.dataset.player ? '' : tr.dataset.player;
            localStorage.setItem('smelo_player', selectedPlayer);
            drawChart();
            renderStatsTable();
        });
    });
}

function setChartHighlight(rowIdx) {
    if (!chart || !storedOriginalCells || !storedRenderOrder.length) return;
    const selections = [];
    storedRenderOrder.forEach((ci, j) => {
        const cell = storedOriginalCells[rowIdx][ci];
        if (cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0) {
            selections.push({ row: rowIdx, column: 1 + j * 3 });
        }
    });
    chart.setSelection(selections);
}

document.getElementById('sliderInput').addEventListener('input', () => { updateSliderInfo(); setChartHighlight(sliderIdx); });
document.getElementById('sliderPrev').addEventListener('click', () => {
    if (sliderIdx > 0) { sliderIdx--; document.getElementById('sliderInput').value = sliderIdx; updateSliderInfo(); setChartHighlight(sliderIdx); }
});
document.getElementById('sliderNext').addEventListener('click', () => {
    const n = storedSessionLabels ? storedSessionLabels.length : 0;
    if (sliderIdx < n - 1) { sliderIdx++; document.getElementById('sliderInput').value = sliderIdx; updateSliderInfo(); setChartHighlight(sliderIdx); }
});
