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
let storedCumulative = null, storedOriginalCells = null, storedSessionLabels = null, storedDates = null;
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
    storedDates = rows.map(x => x.date);

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

function buildTooltip(rowIdx, highlightLabels, hoveredPlayer) {
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
        const bold = e.fullName === hoveredPlayer ? 'font-weight:bold;' : '';
        const bg = e.fullName === hoveredPlayer ? 'background:rgba(255,255,255,0.06);border-radius:3px;' : '';
        html += `<div class="tt-row" style="${bg}"><span class="tt-dot" style="background:${e.color}"></span><span class="tt-name" style="${bold}">${e.name}</span><span class="tt-val" style="${bold}">${e.val}</span><span class="tt-delta ${cls}" style="${bold}">(${sign}${e.delta})</span></div>`;
    });
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
    let highlights = {}, highlightTooltips = {}, highlightTypes = {};
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
            if (bestIdx >= 0) { highlights[bestIdx] = '▲ +' + bestVal; highlightTypes[bestIdx] = 'best'; }
            if (worstIdx >= 0) { highlights[worstIdx] = '▼ ' + worstVal; highlightTypes[worstIdx] = 'worst'; }
            if (maxStreak >= 2 && streakEnd >= 0) {
                var streakLabel = maxStreak + '× streak';
                highlights[streakEnd] = highlights[streakEnd] ? highlights[streakEnd] + ' | ' + streakLabel : streakLabel;
                if (!highlightTypes[streakEnd]) highlightTypes[streakEnd] = 'streak';
            }
            // Worst week (tilt week)
            var MS_WEEK = 7 * 24 * 60 * 60 * 1000;
            var dated = [];
            for (var di = 0; di < originalCells.length; di++) {
                var dc = originalCells[di][ci];
                if (dc !== undefined && dc !== '' && dc !== '0' && Number(dc) !== 0 && storedDates[di])
                    dated.push({ idx: di, val: Number(dc), date: storedDates[di] });
            }
            var tiltSum = 0, tiltEndIdx = -1;
            for (var di = 0; di < dated.length; di++) {
                var sum = 0;
                for (var dj = di; dj < dated.length; dj++) {
                    if (dated[dj].date - dated[di].date > MS_WEEK) break;
                    sum += dated[dj].val;
                }
                if (sum < tiltSum) { tiltSum = sum; tiltEndIdx = dated[di].idx; }
            }
            if (tiltEndIdx >= 0 && tiltSum < 0) {
                var tiltLabel = '😤 ' + tiltSum;
                highlights[tiltEndIdx] = highlights[tiltEndIdx] ? highlights[tiltEndIdx] + ' | ' + tiltLabel : tiltLabel;
                if (!highlightTypes[tiltEndIdx]) highlightTypes[tiltEndIdx] = 'tilt';
            }

            // Descriptive labels for tooltips
            if (bestIdx >= 0) highlightTooltips[bestIdx] = '🏆 Největší výhra: +' + bestVal;
            if (worstIdx >= 0) highlightTooltips[worstIdx] = (highlightTooltips[worstIdx] ? highlightTooltips[worstIdx] + '<br>' : '') + '💀 Největší prohra: ' + worstVal;
            if (maxStreak >= 2 && streakEnd >= 0) highlightTooltips[streakEnd] = (highlightTooltips[streakEnd] ? highlightTooltips[streakEnd] + '<br>' : '') + '🔥 Nejdelší win streak: ' + maxStreak + ' her v řadě';
            if (tiltEndIdx >= 0 && tiltSum < 0) highlightTooltips[tiltEndIdx] = (highlightTooltips[tiltEndIdx] ? highlightTooltips[tiltEndIdx] + '<br>' : '') + '😤 Týden největšího tiltu: ' + tiltSum;
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
        const row = [sessionLabels[i]];
        playerNames.forEach((name, ci) => {
            row.push(cumulative[ci][i]);
            row.push(buildTooltip(i, highlightTooltips, name));
            const cell = originalCells[i][ci];
            const played = cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0;
            if (selectedPlayer && name === selectedPlayer) {
                const pc = playerColors[name];
                const ht = highlightTypes[i];
                if (ht === 'best') row.push('point {size: 8; shape-type: triangle; fill-color: #4ade80; stroke-color: #4ade80; stroke-width: 0; visible: true;}');
                else if (ht === 'worst') row.push('point {size: 8; shape-type: triangle; shape-rotation: 180; fill-color: #f87171; stroke-color: #f87171; stroke-width: 0; visible: true;}');
                else if (ht === 'streak') row.push('point {size: 8; shape-type: diamond; fill-color: #ffb300; stroke-color: #ffb300; stroke-width: 0; visible: true;}');
                else if (ht === 'tilt') row.push('point {size: 8; shape-type: square; fill-color: #f87171; stroke-color: #f87171; stroke-width: 0; visible: true;}');
                else if (played) row.push('point {size: 4; stroke-width: 2; stroke-color: ' + pc + '; fill-color: #181818; visible: true;}');
                else row.push(null);
                row.push(highlights[i] || null);
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
        const mix = (c) => Math.round(bg + (c - bg) * 0.45);
        return '#' + [r,g,b].map(c => mix(c).toString(16).padStart(2,'0')).join('');
    };
    const series = {};
    playerNames.forEach((name, i) => {
        const color = playerColors[name];
        if (selectedPlayer && name === selectedPlayer) series[i] = { color, lineWidth: 2, pointSize: 0, visibleInLegend: true };
        else if (selectedPlayer) series[i] = { color: mute(color), lineWidth: 1, pointSize: 0, visibleInLegend: false };
        else series[i] = { color, lineWidth: 2, pointSize: 0, visibleInLegend: true };
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
    const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
    return playerNames.map((name, ci) => {
        const sessions = [], sessionDated = [];
        for (let i = 0; i < oc.length; i++) {
            const cell = oc[i][ci];
            if (cell !== undefined && cell !== '' && cell !== '0' && Number(cell) !== 0) {
                sessions.push(Number(cell));
                sessionDated.push({ idx: i, val: Number(cell), date: storedDates[i] });
            }
        }
        const cum = storedCumulative[ci];
        let total = 0;
        for (let j = cum.length - 1; j >= 0; j--) { if (cum[j] != null) { total = cum[j]; break; } }
        let streak = 0, maxStreak = 0;
        sessions.forEach(v => { if (v > 0) { streak++; if (streak > maxStreak) maxStreak = streak; } else streak = 0; });
        // Worst week: sliding window of 7 days
        let tiltWeek = 0;
        for (let i = 0; i < sessionDated.length; i++) {
            if (!sessionDated[i].date) continue;
            let sum = 0;
            for (let j = i; j < sessionDated.length; j++) {
                if (!sessionDated[j].date) continue;
                if (sessionDated[j].date - sessionDated[i].date > MS_WEEK) break;
                sum += sessionDated[j].val;
            }
            if (sum < tiltWeek) tiltWeek = sum;
        }
        if (!sessions.length) return { name: name.split('/')[0].trim(), fullName: name, avg: 0, best: 0, worst: 0, total, games: 0, streak: 0, tiltWeek: 0, color: playerColors[name] };
        return {
            name: name.split('/')[0].trim(),
            fullName: name,
            avg: Math.round(sessions.reduce((a, b) => a + b, 0) / sessions.length),
            best: Math.max(...sessions),
            worst: Math.min(...sessions),
            total,
            games: sessions.length,
            streak: maxStreak,
            tiltWeek,
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
    let html = `<table><tr><th data-col="name">Hráč${arrow('name')}</th><th data-col="total">Kumulativní šmelo${arrow('total')}</th><th data-col="games">Počet her${arrow('games')}</th><th data-col="avg">Průměr za hru${arrow('avg')}</th><th data-col="best">Největší výhra${arrow('best')}</th><th data-col="worst">Největší prohra${arrow('worst')}</th><th data-col="streak">Win streak${arrow('streak')}</th><th data-col="tiltWeek">Týden tiltu${arrow('tiltWeek')}</th></tr>`;
    sorted.forEach(s => {
        const sel = selectedPlayer === s.fullName ? ' class="selected"' : '';
        html += `<tr data-player="${s.fullName}"${sel}>` +
            `<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px;vertical-align:middle;"></span>${s.name}</td>` +
            `<td class="${c(s.total)}">${f(s.total)}</td>` +
            `<td>${s.games}</td>` +
            `<td class="${c(s.avg)}">${f(s.avg)}</td>` +
            `<td class="${c(s.best)}">${f(s.best)}</td>` +
            `<td class="${c(s.worst)}">${f(s.worst)}</td>` +
            `<td>${s.streak >= 2 ? s.streak : ''}</td>` +
            `<td class="${c(s.tiltWeek)}">${s.tiltWeek ? f(s.tiltWeek) : '0'}</td>` +
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
