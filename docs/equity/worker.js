// Exact 7-card evaluator and full enumeration.
// Card encoding: integer 0-51.  rank = card % 13 (0=2..12=A), suit = card/13|0.

const STRAIGHTS = [
  [0x1F00, 12], [0x0F80, 11], [0x07C0, 10], [0x03E0, 9],
  [0x01F0, 8],  [0x00F8, 7],  [0x007C, 6],  [0x003E, 5],
  [0x001F, 4],  [0x100F, 3], // wheel A-2-3-4-5
];

function straightHigh(mask) {
  for (let i = 0; i < STRAIGHTS.length; i++) {
    if ((mask & STRAIGHTS[i][0]) === STRAIGHTS[i][0]) return STRAIGHTS[i][1];
  }
  return -1;
}

function popCount(m) {
  m = m - ((m >> 1) & 0x55555555);
  m = (m & 0x33333333) + ((m >> 2) & 0x33333333);
  return (((m + (m >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function topNRanks(mask, n) {
  let s = 0, c = 0;
  for (let r = 12; r >= 0 && c < n; r--) {
    if (mask & (1 << r)) { s = s * 16 + r + 1; c++; }
  }
  return s;
}

// Returns numeric rank score; higher = stronger hand.
function evaluate7(cards) {
  const suitMask = [0, 0, 0, 0];
  const rankCount = [0,0,0,0,0,0,0,0,0,0,0,0,0];
  for (let i = 0; i < 7; i++) {
    const c = cards[i];
    suitMask[(c / 13) | 0] |= 1 << (c % 13);
    rankCount[c % 13]++;
  }
  const allRanks = suitMask[0] | suitMask[1] | suitMask[2] | suitMask[3];

  let flushMask = 0;
  for (let s = 0; s < 4; s++) {
    if (popCount(suitMask[s]) >= 5) { flushMask = suitMask[s]; break; }
  }

  if (flushMask) {
    const sfHigh = straightHigh(flushMask);
    if (sfHigh >= 0) return 8e12 + sfHigh;
    return 5e12 + topNRanks(flushMask, 5);
  }

  let quad = -1, trip = -1;
  const pairs = [];
  for (let r = 12; r >= 0; r--) {
    const n = rankCount[r];
    if (n === 4) quad = r;
    else if (n === 3) {
      if (trip === -1) trip = r;
      else pairs.push(r);
    } else if (n === 2) pairs.push(r);
  }

  if (quad >= 0) {
    let kicker = -1;
    for (let r = 12; r >= 0; r--) {
      if (r !== quad && rankCount[r] > 0) { kicker = r; break; }
    }
    return 7e12 + quad * 100 + kicker + 1;
  }

  if (trip >= 0 && pairs.length >= 1) {
    return 6e12 + trip * 100 + pairs[0] + 1;
  }

  const stHigh = straightHigh(allRanks);
  if (stHigh >= 0) return 4e12 + stHigh;

  if (trip >= 0) {
    const kickers = [];
    for (let r = 12; r >= 0 && kickers.length < 2; r--) {
      if (r !== trip && rankCount[r] > 0) kickers.push(r);
    }
    return 3e12 + trip * 10000 + (kickers[0] + 1) * 100 + (kickers[1] + 1);
  }

  if (pairs.length >= 2) {
    const p1 = pairs[0], p2 = pairs[1];
    let kicker = -1;
    for (let r = 12; r >= 0; r--) {
      if (r !== p1 && r !== p2 && rankCount[r] > 0) { kicker = r; break; }
    }
    return 2e12 + p1 * 10000 + p2 * 100 + kicker + 1;
  }

  if (pairs.length === 1) {
    const p = pairs[0];
    const kickers = [];
    for (let r = 12; r >= 0 && kickers.length < 3; r--) {
      if (r !== p && rankCount[r] > 0) kickers.push(r);
    }
    return 1e12 + p * 1000000 + (kickers[0] + 1) * 10000 + (kickers[1] + 1) * 100 + (kickers[2] + 1);
  }

  return topNRanks(allRanks, 5);
}

let cancelled = false;

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'compute') return;

  cancelled = false;
  const { jobId, hands, board } = msg;
  const used = new Set([...hands.flat(), ...board]);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const needed = 5 - board.length;
  const N = hands.length;

  // Special case: needed = 0 (river fully specified)
  // General case: enumerate combinations of `needed` from deck
  const wins = new Float64Array(N);
  const categories = [];
  for (let p = 0; p < N; p++) categories.push(new Float64Array(9));
  let totalBoards = 0;
  // Compute total board count for progress
  const totalCount = binom(deck.length, needed);

  const sevenCards = new Array(7);
  // Precopy hands and fixed board cards into a workspace per player
  // We'll splice extras at positions [2 + board.length .. 6]

  function evaluateAll(extras) {
    let bestScore = -1;
    let bestMask = 0;
    for (let p = 0; p < N; p++) {
      sevenCards[0] = hands[p][0];
      sevenCards[1] = hands[p][1];
      for (let i = 0; i < board.length; i++) sevenCards[2 + i] = board[i];
      for (let i = 0; i < extras.length; i++) sevenCards[2 + board.length + i] = extras[i];
      const score = evaluate7(sevenCards);
      categories[p][(score / 1e12) | 0]++;
      if (score > bestScore) {
        bestScore = score;
        bestMask = 1 << p;
      } else if (score === bestScore) {
        bestMask |= 1 << p;
      }
    }
    // Distribute pot share among winners
    let winnerCount = popCount(bestMask);
    const share = 1 / winnerCount;
    for (let p = 0; p < N; p++) {
      if (bestMask & (1 << p)) wins[p] += share;
    }
  }

  const indices = new Array(needed);
  for (let i = 0; i < needed; i++) indices[i] = i;
  const extras = new Array(needed);

  function iterate() {
    const deckLen = deck.length;
    const batchSize = 5000;
    const start = performance.now();
    let batchCount = 0;

    while (true) {
      if (cancelled) {
        self.postMessage({ type: 'cancelled', jobId });
        return;
      }

      // current combination
      for (let i = 0; i < needed; i++) extras[i] = deck[indices[i]];
      evaluateAll(extras);
      totalBoards++;
      batchCount++;

      // advance combination
      let i = needed - 1;
      while (i >= 0 && indices[i] === deckLen - needed + i) i--;
      if (i < 0) {
        // done
        const results = [];
        for (let p = 0; p < N; p++) {
          const cats = new Array(9);
          for (let k = 0; k < 9; k++) cats[k] = categories[p][k] / totalBoards;
          results.push({ equity: wins[p] / totalBoards, categories: cats });
        }
        self.postMessage({ type: 'done', jobId, results, totalBoards });
        return;
      }
      indices[i]++;
      for (let j = i + 1; j < needed; j++) indices[j] = indices[j - 1] + 1;

      // yield periodically
      if (batchCount >= batchSize) {
        self.postMessage({ type: 'progress', jobId, done: totalBoards, total: totalCount });
        setTimeout(iterate, 0);
        return;
      }
    }
  }

  // Handle needed === 0 (river complete) — just evaluate once
  if (needed === 0) {
    evaluateAll([]);
    totalBoards = 1;
    const results = [];
    for (let p = 0; p < N; p++) {
      const cats = new Array(9);
      for (let k = 0; k < 9; k++) cats[k] = categories[p][k];
      results.push({ equity: wins[p], categories: cats });
    }
    self.postMessage({ type: 'done', jobId, results, totalBoards });
    return;
  }

  iterate();
};

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let res = 1;
  for (let i = 0; i < k; i++) res = res * (n - i) / (i + 1);
  return res;
}
