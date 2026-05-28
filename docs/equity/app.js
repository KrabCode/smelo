// Card encoding: integer 0-51.  rank = card % 13 (0=2..12=A), suit = card / 13 | 0.
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['s','h','d','c']; // 0..3
const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };

function cardLabel(c) {
  const r = c % 13;
  const s = (c / 13) | 0;
  return { rank: RANKS[r], suit: SUITS[s], glyph: SUIT_GLYPH[SUITS[s]] };
}
function cardStr(c) {
  const l = cardLabel(c);
  return l.rank + l.glyph;
}

// === State ===
const state = {
  stage: 0,                     // 0=preflop, 3=flop, 4=turn, 5=river
  board: [null, null, null, null, null], // up to 5 board card ints (or null)
  players: [
    { name: 'A', cards: [null, null] },
    { name: 'B', cards: [null, null] },
    { name: 'C', cards: [null, null] },
  ],
};

// === Worker ===
let worker = null;
let currentJob = 0;
function ensureWorker() {
  if (!worker) {
    worker = new Worker('worker.js');
    worker.onmessage = (e) => onWorkerMessage(e.data);
  }
}
function cancelWorker() {
  if (worker) { worker.terminate(); worker = null; }
}

// === DOM refs ===
const playersList = document.getElementById('playersList');
const boardRow = document.getElementById('boardRow');
const boardHint = document.getElementById('boardHint');
const playerCountEl = document.getElementById('playerCount');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('statusBadge');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const picker = document.getElementById('cardPicker');
const pickerGrid = document.getElementById('pickerGrid');
const pickerTitle = document.getElementById('pickerTitle');

// === Used cards (excluding the slot currently being edited) ===
function usedCards(excludeSlot) {
  const set = new Set();
  for (let i = 0; i < state.players.length; i++) {
    for (let j = 0; j < 2; j++) {
      const c = state.players[i].cards[j];
      if (c !== null && !(excludeSlot && excludeSlot.kind === 'player' && excludeSlot.i === i && excludeSlot.j === j)) {
        set.add(c);
      }
    }
  }
  for (let i = 0; i < state.stage; i++) {
    const c = state.board[i];
    if (c !== null && !(excludeSlot && excludeSlot.kind === 'board' && excludeSlot.i === i)) {
      set.add(c);
    }
  }
  return set;
}

// === Render ===
function renderBoard() {
  boardRow.innerHTML = '';
  if (state.stage === 0) {
    boardRow.innerHTML = '<span style="color:#666;font-style:italic;">žádné karty na stole</span>';
    boardHint.textContent = '';
    return;
  }
  const labels = ['F1','F2','F3','Turn','River'];
  boardHint.textContent = '(' + state.stage + ' karet)';
  for (let i = 0; i < state.stage; i++) {
    const slot = makeSlot(state.board[i], { kind: 'board', i });
    boardRow.appendChild(slot);
  }
}

function renderPlayers() {
  playersList.innerHTML = '';
  playerCountEl.textContent = state.players.length;
  document.getElementById('removePlayer').disabled = state.players.length <= 2;
  document.getElementById('addPlayer').disabled = state.players.length >= 9;

  state.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    const label = document.createElement('div');
    label.className = 'player-label';
    label.textContent = p.name;
    row.appendChild(label);

    const cards = document.createElement('div');
    cards.className = 'player-cards';
    for (let j = 0; j < 2; j++) {
      cards.appendChild(makeSlot(p.cards[j], { kind: 'player', i, j }));
    }
    row.appendChild(cards);

    const eq = document.createElement('div');
    eq.className = 'player-equity';
    eq.id = 'eq-' + i;
    eq.textContent = '—';
    row.appendChild(eq);

    playersList.appendChild(row);
  });
}

function makeSlot(card, ref) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card-slot';
  if (card !== null) {
    const l = cardLabel(card);
    el.classList.add('filled', 'suit-' + l.suit);
    el.textContent = l.rank + l.glyph;
  } else {
    el.textContent = '?';
  }
  el.addEventListener('click', () => openPicker(ref));
  return el;
}

// === Picker ===
let pickerTarget = null;
function openPicker(ref) {
  pickerTarget = ref;
  pickerTitle.textContent = ref.kind === 'player'
    ? `Hráč ${state.players[ref.i].name} — karta ${ref.j + 1}`
    : `Board — pozice ${ref.i + 1}`;
  const used = usedCards(ref);
  const current = ref.kind === 'player'
    ? state.players[ref.i].cards[ref.j]
    : state.board[ref.i];

  pickerGrid.innerHTML = '';
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) {
      const card = s * 13 + r;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pcard suit-' + SUITS[s];
      btn.textContent = RANKS[r] + SUIT_GLYPH[SUITS[s]];
      if (used.has(card)) btn.classList.add('disabled');
      if (current === card) btn.classList.add('current');
      btn.addEventListener('click', () => setCard(card));
      pickerGrid.appendChild(btn);
    }
  }
  picker.hidden = false;
}
function closePicker() {
  picker.hidden = true;
  pickerTarget = null;
}
function setCard(card) {
  if (!pickerTarget) return;
  if (pickerTarget.kind === 'player') {
    state.players[pickerTarget.i].cards[pickerTarget.j] = card;
  } else {
    state.board[pickerTarget.i] = card;
  }
  closePicker();
  renderAll();
  recompute();
}
function clearPickerSlot() {
  if (!pickerTarget) return;
  if (pickerTarget.kind === 'player') {
    state.players[pickerTarget.i].cards[pickerTarget.j] = null;
  } else {
    state.board[pickerTarget.i] = null;
  }
  closePicker();
  renderAll();
  recompute();
}

document.getElementById('pickerClose').addEventListener('click', closePicker);
document.getElementById('pickerClear').addEventListener('click', clearPickerSlot);
picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });

// === Stage buttons ===
document.querySelectorAll('.stage-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.stage-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.stage = parseInt(b.dataset.stage, 10);
    // Trim board cards beyond new stage
    for (let i = state.stage; i < 5; i++) state.board[i] = null;
    renderAll();
    recompute();
  });
});

// === Add / Remove player ===
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
document.getElementById('addPlayer').addEventListener('click', () => {
  if (state.players.length >= 9) return;
  state.players.push({ name: LETTERS[state.players.length], cards: [null, null] });
  renderPlayers();
  recompute();
});
document.getElementById('removePlayer').addEventListener('click', () => {
  if (state.players.length <= 2) return;
  state.players.pop();
  renderPlayers();
  recompute();
});

// === Reset ===
document.getElementById('resetBtn').addEventListener('click', () => {
  state.players.forEach(p => { p.cards = [null, null]; });
  state.board = [null, null, null, null, null];
  renderAll();
  recompute();
});

// === Compute ===
function recompute() {
  // Need every player to have both cards
  const allHandsReady = state.players.every(p => p.cards[0] !== null && p.cards[1] !== null);
  const boardReady = state.board.slice(0, state.stage).every(c => c !== null);
  // Clear progress UI
  progressBar.classList.remove('visible');
  progressFill.style.width = '0';
  state.players.forEach((_, i) => {
    const eq = document.getElementById('eq-' + i);
    if (eq) eq.textContent = '—';
  });

  if (!allHandsReady) {
    statusEl.textContent = 'Doplň karty hráčů';
    statusEl.className = 'status-badge';
    resultsEl.innerHTML = '';
    return;
  }
  if (!boardReady) {
    statusEl.textContent = 'Doplň board';
    statusEl.className = 'status-badge';
    resultsEl.innerHTML = '';
    return;
  }

  // Spawn worker (terminate previous)
  cancelWorker();
  ensureWorker();
  currentJob++;
  const jobId = currentJob;
  const hands = state.players.map(p => [p.cards[0], p.cards[1]]);
  const board = state.board.slice(0, state.stage);

  statusEl.textContent = 'počítám…';
  statusEl.className = 'status-badge busy';
  progressBar.classList.add('visible');

  worker.postMessage({ type: 'compute', jobId, hands, board });
}

function onWorkerMessage(msg) {
  if (msg.jobId !== currentJob) return;
  if (msg.type === 'progress') {
    if (msg.total > 0) {
      progressFill.style.width = (100 * msg.done / msg.total) + '%';
    }
    return;
  }
  if (msg.type === 'done') {
    progressBar.classList.remove('visible');
    statusEl.textContent = msg.totalBoards.toLocaleString('cs-CZ') + ' boardů';
    statusEl.className = 'status-badge';
    renderResults(msg.results);
    return;
  }
}

function renderResults(results) {
  resultsEl.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'result-row header';
  header.innerHTML = '<div></div><div>Hráč</div><div class="equity">Equity</div><div></div><div></div>';
  resultsEl.appendChild(header);
  results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const p = state.players[i];
    const handStr = p.cards.map(cardStr).join(' ');
    row.innerHTML = `
      <div class="player-label">${p.name}</div>
      <div>${handStr}</div>
      <div class="equity">${(r.equity * 100).toFixed(2)}%</div>
      <div></div>
      <div></div>
    `;
    resultsEl.appendChild(row);
    const eq = document.getElementById('eq-' + i);
    if (eq) eq.textContent = (r.equity * 100).toFixed(1) + '%';
  });
}

// === Init ===
function renderAll() {
  renderBoard();
  renderPlayers();
}
renderAll();
recompute();
