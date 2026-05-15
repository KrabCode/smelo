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
let chart = null, chartData = null, playerNames = [], playerColors = {}, selectedPlayer = localStorage.getItem('smelo_player') || '';
let storedCumulative = null, storedOriginalCells = null, storedSessionLabels = null, storedDates = null;
let rangeMode = localStorage.getItem('smelo_range') || 'half';
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
        if (rangeMode === 'all') {
            document.getElementById('btnAll').classList.add('active');
            document.getElementById('btnHalf').classList.remove('active');
        }
        processAndRender();
        document.getElementById('rangeToggle').style.display = '';
        document.getElementById('sessionDetails').style.display = '';
        document.getElementById('graphSpinner').style.display = 'none';
        document.getElementById('chartDiv').style.visibility = 'visible';
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
    if (rangeMode === 'half') {
        for (let i = 0; i < allRowsWithDate.length; i++) {
            if (allRowsWithDate[i].date && allRowsWithDate[i].date >= sixMonthsAgo) { cutoffIndex = i; break; }
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

    const sessionLabels = rows.map(x => {
        if (x.date) {
            const d = x.date;
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        return x.row[1];
    });

    storedCumulative = cumulative;
    storedOriginalCells = originalCells;
    storedSessionLabels = sessionLabels;
    storedDates = rows.map(x => x.date);

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

document.getElementById('btnHalf').addEventListener('click', () => {
    if (rangeMode === 'half') return;
    rangeMode = 'half';
    localStorage.setItem('smelo_range', rangeMode);
    document.getElementById('btnHalf').classList.add('active');
    document.getElementById('btnAll').classList.remove('active');
    processAndRender();
});
document.getElementById('btnAll').addEventListener('click', () => {
    if (rangeMode === 'all') return;
    rangeMode = 'all';
    localStorage.setItem('smelo_range', rangeMode);
    document.getElementById('btnAll').classList.add('active');
    document.getElementById('btnHalf').classList.remove('active');
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

    chartData = new google.visualization.DataTable();
    chartData.addColumn('string', 'Datum');
    renderOrder.forEach(ci => {
        chartData.addColumn('number', playerNames[ci]);
        chartData.addColumn({ type: 'string', role: 'tooltip', p: { html: true } });
        chartData.addColumn({ type: 'string', role: 'style' });
    });
    chartData.addColumn('number', '_mirror');
    for (let i = 0; i < sessionLabels.length; i++) {
        const row = [sessionLabels[i]];
        let rowMax = null;
        renderOrder.forEach((ci, j) => {
            const name = playerNames[ci];
            const v = cumulative[ci][i];
            row.push(v);
            if (v != null && (rowMax == null || Math.abs(v) > Math.abs(rowMax))) rowMax = v;
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
        row.push(rowMax);
        chartData.addRow(row);
    }

    const mute = hex => {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const bg = 34;
        const mix = (c) => Math.round(bg + (c - bg) * 0.45);
        return '#' + [r,g,b].map(c => mix(c).toString(16).padStart(2,'0')).join('');
    };
    let yMin = 0, yMax = 0;
    cumulative.forEach(arr => arr.forEach(v => { if (v != null) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v); } }));
    const yRange = yMax - yMin;
    const step = yRange <= 2000 ? 500 : yRange <= 5000 ? 1000 : yRange <= 15000 ? 2500 : 5000;
    const axisTicks = [];
    for (let t = Math.floor(yMin / step) * step; t <= Math.ceil(yMax / step) * step; t += step) axisTicks.push(t);

    const series = {};
    renderOrder.forEach((ci, j) => {
        const name = playerNames[ci];
        const color = playerColors[name];
        if (selectedPlayer && name === selectedPlayer) series[j] = { color, lineWidth: 3, pointSize: 0, visibleInLegend: true, targetAxisIndex: 0 };
        else series[j] = { color: mute(color), lineWidth: 1, pointSize: 0, visibleInLegend: false, targetAxisIndex: 0 };
    });
    series[playerNames.length] = { targetAxisIndex: 1, lineWidth: 0, pointSize: 0, visibleInLegend: false, enableInteractivity: false };
    const vAxisShared = { textStyle: { color: '#aaa' }, gridlines: { color: '#333' }, baselineColor: '#888', format: 'short', ticks: axisTicks };
    const options = {
        title: 'Kumulativní šmelo', titleTextStyle: { fontSize: 14, color: '#eee' },
        legend: 'none', interpolateNulls: false, dataOpacity: 1.0, curveType: 'function', series,
        hAxis: { textStyle: { fontSize: 10, color: '#aaa' }, slantedText: true, slantedTextAngle: 45, gridlines: { color: '#333' }, baselineColor: '#444' },
        vAxes: { 0: vAxisShared, 1: { ...vAxisShared, gridlines: { color: 'transparent' } } },
        chartArea: { left: 60, top: 40, right: 60, bottom: 80, width: '100%', height: '100%', backgroundColor: 'transparent' },
        tooltip: { trigger: 'none' },
        explorer: { actions: ['dragToZoom', 'rightClickToReset'], axis: 'horizontal', keepInBounds: true, maxZoomIn: 0.1 },
        backgroundColor: 'transparent'
    };
    if (!chart) {
        chart = new google.visualization.LineChart(document.getElementById('chartDiv'));
        google.visualization.events.addListener(chart, 'select', function() {
            var sel = chart.getSelection();
            if (sel.length && sel[0].row != null) {
                sliderIdx = sel[0].row;
                const sliderEl = document.getElementById('sliderInput');
                if (sliderEl) sliderEl.value = sliderIdx;
                updateSliderInfo();
                setChartHighlight(sliderIdx);
                const details = document.getElementById('sessionDetails');
                details.open = true;
                details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
    chart.draw(chartData, options);
    initSlider();
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
        const cum = storedCumulative[ci];
        let total = 0;
        for (let j = cum.length - 1; j >= 0; j--) { if (cum[j] != null) { total = cum[j]; break; } }
        if (!sessions.length) return { name: name.split('/')[0].trim(), fullName: name, avg: 0, best: 0, worst: 0, total, games: 0, color: playerColors[name] };
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
