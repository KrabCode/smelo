const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTAYSlBiWTAJ_th0XEzDk9fthNQBrF88_FdBry3l8l9IrcGuopvFoBzIY4Byb5yfTE0U-LyqGkmZxkX/pub?gid=0&single=true&output=csv';
const PLAYER_MIN_SESSIONS = 2;
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
let storedCumulative = null, storedOriginalCells = null, storedSessionLabels = null;
let rangeMode = localStorage.getItem('smelo_range') || 'half';
let rawAllRowsWithDate = null, rawHeaders = null;
const CACHE_KEY = 'smelo_graph_csv', CACHE_TS_KEY = 'smelo_graph_csv_ts', CACHE_TTL = 3600000;

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
    const filteredColumns = validColumns.filter((_, i) => appearances[i] >= PLAYER_MIN_SESSIONS);
    playerNames = filteredColumns.map(x => x.h);
    playerNames.forEach((name, i) => { playerColors[name] = COLORS[i % COLORS.length]; });

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

    const sessionLabels = rows.map(x => x.row[1]
        .replace(/Mon/g,'Po').replace(/Tue/g,'Út').replace(/Wed/g,'St')
        .replace(/Thu/g,'Čt').replace(/Fri/g,'Pá').replace(/Sat/g,'So').replace(/Sun/g,'Ne'));

    storedCumulative = cumulative;
    storedOriginalCells = originalCells;
    storedSessionLabels = sessionLabels;

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

function buildTooltip(rowIdx, highlightLabels) {
    const date = storedSessionLabels[rowIdx];
    const entries = playerNames.map((name, ci) => {
        const cell = storedOriginalCells[rowIdx][ci];
        const delta = (cell !== undefined && cell !== '' && cell !== '0') ? Number(cell) : 0;
        if (delta === 0) return null;
        return { name: name.split('/')[0].trim(), fullName: name, val: storedCumulative[ci][rowIdx], delta, color: playerColors[name] };
    }).filter(Boolean).sort((a, b) => b.delta - a.delta);
    let html = `<div class="tt"><div class="tt-header">${date}</div>`;
    entries.forEach(e => {
        const sign = e.delta > 0 ? '+' : '';
        const cls = e.delta > 0 ? 'pos' : e.delta < 0 ? 'neg' : '';
        html += `<div class="tt-row"><span class="tt-dot" style="background:${e.color}"></span><span class="tt-name">${e.name}</span><span class="tt-val">${e.val}</span><span class="tt-delta ${cls}">(${sign}${e.delta})</span></div>`;
    });
    if (highlightLabels && highlightLabels[rowIdx]) {
        html += `<div style="margin-top:6px;padding-top:4px;border-top:1px solid #444;color:#ffb300;font-size:11px;">${highlightLabels[rowIdx]}</div>`;
    }
    return html + '</div>';
}

function drawChart() {
    if (!storedCumulative) return;
    const cumulative = storedCumulative;
    const originalCells = storedOriginalCells;
    const sessionLabels = storedSessionLabels;

    // Find highlight indices for selected player
    let highlights = {}, highlightTooltips = {};
    if (selectedPlayer) {
        const ci = playerNames.indexOf(selectedPlayer);
        if (ci >= 0) {
            let bestVal = -Infinity, worstVal = Infinity, bestIdx = -1, worstIdx = -1;
            let streak = 0, maxStreak = 0, streakEnd = -1;
            for (let i = 0; i < originalCells.length; i++) {
                const cell = originalCells[i][ci];
                const played = cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0;
                if (!played) continue;
                const v = Number(cell);
                if (v > bestVal) { bestVal = v; bestIdx = i; }
                if (v < worstVal) { worstVal = v; worstIdx = i; }
                if (v > 0) { streak++; if (streak > maxStreak) { maxStreak = streak; streakEnd = i; } }
                else streak = 0;
            }
            if (bestIdx >= 0) highlights[bestIdx] = (highlights[bestIdx] || '') + '▲ +' + bestVal;
            if (worstIdx >= 0) highlights[worstIdx] = (highlights[worstIdx] || '') + '▼ ' + worstVal;
            if (maxStreak >= 2 && streakEnd >= 0) {
                var streakLabel = maxStreak + '× win streak';
                highlights[streakEnd] = highlights[streakEnd] ? highlights[streakEnd] + ' | ' + streakLabel : streakLabel;
            }
            // Descriptive labels for tooltips
            if (bestIdx >= 0) highlightTooltips[bestIdx] = '🏆 Největší výhra: +' + bestVal;
            if (worstIdx >= 0) highlightTooltips[worstIdx] = (highlightTooltips[worstIdx] ? highlightTooltips[worstIdx] + '<br>' : '') + '💀 Největší prohra: ' + worstVal;
            if (maxStreak >= 2 && streakEnd >= 0) highlightTooltips[streakEnd] = (highlightTooltips[streakEnd] ? highlightTooltips[streakEnd] + '<br>' : '') + '🔥 Nejdelší win streak: ' + maxStreak + ' her v řadě';
        }
    }

    chartData = new google.visualization.DataTable();
    chartData.addColumn('string', 'Datum');
    playerNames.forEach(name => {
        chartData.addColumn('number', name);
        chartData.addColumn({ type: 'string', role: 'tooltip', p: { html: true } });
        chartData.addColumn({ type: 'string', role: 'style' });
        chartData.addColumn({ type: 'string', role: 'annotation' });
    });
    for (let i = 0; i < sessionLabels.length; i++) {
        const tt = buildTooltip(i, highlightTooltips);
        const row = [sessionLabels[i]];
        playerNames.forEach((name, ci) => {
            row.push(cumulative[ci][i]);
            row.push(tt);
            const cell = originalCells[i][ci];
            const played = cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0;
            if (selectedPlayer && name === selectedPlayer) {
                const isHighlight = highlights[i];
                if (isHighlight) row.push('point {size: 6; stroke-width: 2; fill-color: #181818; visible: true;}');
                else row.push(played ? 'point {size: 4; stroke-width: 2; fill-color: #181818; visible: true;}' : 'point {size: 0; visible: false;}');
                row.push(name === selectedPlayer ? (isHighlight || null) : null);
            } else {
                row.push(null);
                row.push(null);
            }
        });
        chartData.addRow(row);
    }

    const mute = hex => {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const bg = 34;
        const mix = (c) => Math.round(bg + (c - bg) * 0.25);
        return '#' + [r,g,b].map(c => mix(c).toString(16).padStart(2,'0')).join('');
    };
    const series = {};
    playerNames.forEach((name, i) => {
        const color = playerColors[name];
        if (selectedPlayer && name === selectedPlayer) series[i] = { color, lineWidth: 2, pointSize: 0, visibleInLegend: true };
        else if (selectedPlayer) series[i] = { color: mute(color), lineWidth: 1, pointSize: 0, visibleInLegend: false };
        else series[i] = { color: mute(color), lineWidth: 2, pointSize: 0, visibleInLegend: true };
    });
    const options = {
        title: 'Kumulativní šmelo', titleTextStyle: { fontSize: 14, color: '#eee' },
        legend: 'none', interpolateNulls: false, dataOpacity: 1.0, series,
        hAxis: { textStyle: { fontSize: 10, color: '#aaa' }, slantedText: true, slantedTextAngle: 45, gridlines: { color: '#333' }, baselineColor: '#444' },
        vAxis: { title: 'pošmel / výšmel', titleTextStyle: { color: '#aaa', italic: false }, textStyle: { color: '#aaa' }, gridlines: { color: '#333' }, baselineColor: '#888', format: 'short' },
        chartArea: { left: 60, top: 40, right: 20, bottom: 80, width: '100%', height: '100%', backgroundColor: 'transparent' },
        tooltip: { isHtml: true, trigger: 'both' },
        annotations: { textStyle: { fontSize: 11, color: '#eee', auraColor: '#181818', opacity: 0.9 }, stem: { color: '#555', length: 8 } },
        explorer: { actions: ['dragToZoom', 'rightClickToReset'], axis: 'horizontal', keepInBounds: true, maxZoomIn: 0.1 },
        backgroundColor: 'transparent'
    };
    if (!chart) chart = new google.visualization.LineChart(document.getElementById('chartDiv'));
    chart.draw(chartData, options);
}

let statsSortCol = 'total', statsSortAsc = false, statsData = null;

function computeStats() {
    if (!storedOriginalCells || !playerNames.length) return [];
    const oc = storedOriginalCells;
    return playerNames.map((name, ci) => {
        const sessions = [];
        for (let i = 0; i < oc.length; i++) {
            const cell = oc[i][ci];
            if (cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0) sessions.push(Number(cell));
        }
        const cum = storedCumulative[ci];
        let total = 0;
        for (let j = cum.length - 1; j >= 0; j--) { if (cum[j] != null) { total = cum[j]; break; } }
        let streak = 0, maxStreak = 0;
        sessions.forEach(v => { if (v > 0) { streak++; if (streak > maxStreak) maxStreak = streak; } else streak = 0; });
        if (!sessions.length) return { name: name.split('/')[0].trim(), fullName: name, avg: 0, best: 0, worst: 0, total, games: 0, streak: 0, color: playerColors[name] };
        return {
            name: name.split('/')[0].trim(),
            fullName: name,
            avg: Math.round(sessions.reduce((a, b) => a + b, 0) / sessions.length),
            best: Math.max(...sessions),
            worst: Math.min(...sessions),
            total,
            games: sessions.length,
            streak: maxStreak,
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
    const f = v => v > 0 ? `+${v}` : `${v}`;
    let html = `<table><tr><th data-col="name">Hráč${arrow('name')}</th><th data-col="total">Kumulativní šmelo${arrow('total')}</th><th data-col="games">Počet her${arrow('games')}</th><th data-col="avg">Průměr za hru${arrow('avg')}</th><th data-col="best">Největší výhra${arrow('best')}</th><th data-col="worst">Největší prohra${arrow('worst')}</th><th data-col="streak">Win streak${arrow('streak')}</th></tr>`;
    sorted.forEach(s => {
        const sel = selectedPlayer === s.fullName ? ' class="selected"' : '';
        html += `<tr data-player="${s.fullName}"${sel}>` +
            `<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px;vertical-align:middle;"></span>${s.name}</td>` +
            `<td class="${c(s.total)}">${f(s.total)}</td>` +
            `<td>${s.games}</td>` +
            `<td class="${c(s.avg)}">${f(s.avg)}</td>` +
            `<td class="${c(s.best)}">${f(s.best)}</td>` +
            `<td class="${c(s.worst)}">${f(s.worst)}</td>` +
            `<td>${s.streak}</td>` +
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
