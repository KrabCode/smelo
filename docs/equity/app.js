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
const STORAGE_KEY = 'equity.state.v1';
const DEFAULT_STATE = {
  board: [null, null, null, null, null], // 5 board card ints (or null) — flop:0-2, turn:3, river:4
  players: [
    { name: 'A', cards: [null, null] },
    { name: 'B', cards: [null, null] },
    { name: 'C', cards: [null, null] },
  ],
};
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const s = JSON.parse(raw);
    if (!Array.isArray(s.board) || s.board.length !== 5) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    if (!Array.isArray(s.players) || s.players.length < 2 || s.players.length > 9) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    return s;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
const state = loadState();

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
const playerCountEl = document.getElementById('playerCount');
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
  for (let i = 0; i < 5; i++) {
    const c = state.board[i];
    if (c !== null && !(excludeSlot && excludeSlot.kind === 'board' && excludeSlot.i === i)) {
      set.add(c);
    }
  }
  return set;
}

// === Render ===
function renderBoard() {
  const groups = boardRow.querySelectorAll('.board-group');
  groups.forEach(g => g.innerHTML = '');
  const layout = [[0, 1, 2], [3], [4]]; // flop, turn, river
  layout.forEach((idxs, gi) => {
    idxs.forEach((i) => {
      const slot = makeSlot(state.board[i], { kind: 'board', i });
      groups[gi].appendChild(slot);
    });
  });
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
  saveState();
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
  saveState();
  recompute();
}

document.getElementById('pickerClose').addEventListener('click', closePicker);
document.getElementById('pickerClear').addEventListener('click', clearPickerSlot);
picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });

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
  saveState();
  recompute();
});

// === Compute ===
function recompute() {
  // Need every player to have both cards
  const allHandsReady = state.players.every(p => p.cards[0] !== null && p.cards[1] !== null);
  const board = state.board.filter(c => c !== null);
  // Clear progress UI
  progressBar.classList.remove('visible');
  progressFill.style.width = '0';
  state.players.forEach((_, i) => {
    const eq = document.getElementById('eq-' + i);
    if (eq) eq.textContent = '—';
  });

  if (!allHandsReady) {
    statusEl.textContent = '';
    statusEl.className = 'status-badge';
    return;
  }

  // Spawn worker (terminate previous)
  cancelWorker();
  ensureWorker();
  currentJob++;
  const jobId = currentJob;
  const hands = state.players.map(p => [p.cards[0], p.cards[1]]);

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
    statusEl.innerHTML = '<span class="check">✓</span>';
    statusEl.className = 'status-badge';
    msg.results.forEach((r, i) => {
      const eq = document.getElementById('eq-' + i);
      if (eq) eq.textContent = (r.equity * 100).toFixed(1) + '%';
    });
  }
}

// === Init ===
function renderAll() {
  renderBoard();
  renderPlayers();
}
renderAll();
recompute();
