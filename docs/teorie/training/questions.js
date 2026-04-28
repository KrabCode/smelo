// Training quiz data — math templates + curated rules questions

const PCT_POOL = [5, 10, 15, 20, 25, 30, 33, 35, 40, 45, 50, 55, 60, 65, 67, 70, 75, 80];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nearestPool(v) {
  return PCT_POOL.reduce((best, x) => Math.abs(x - v) < Math.abs(best - v) ? x : best, PCT_POOL[0]);
}

// Returns null if correctRaw is too far from any pool entry (ambiguous snap).
function buildPctChoices(correctRaw) {
  const correct = nearestPool(correctRaw);
  if (Math.abs(correctRaw - correct) > 1.5) return null;
  const candidates = PCT_POOL.filter(v => v !== correct && Math.abs(v - correct) >= 5);
  candidates.sort((a, b) => Math.abs(a - correct) - Math.abs(b - correct));
  const distractors = candidates.slice(0, 3);
  const all = shuffle([correct, ...distractors]);
  return { choices: all.map(v => v + '%'), correctIndex: all.indexOf(correct) };
}

// For exact integer % answers (rule of 2 & 4) — no snapping.
function buildIntPctChoices(correct) {
  const nearby = [-4, -2, 2, 4].map(d => correct + d).filter(v => v > 0 && v <= 80);
  const all = shuffle([correct, ...shuffle(nearby).slice(0, 3)]);
  return { choices: all.map(v => v + '%'), correctIndex: all.indexOf(correct) };
}

function uid() { return Math.random().toString(36).slice(2, 9); }

const MATH_TEMPLATES = [
  {
    id: 'pot-odds',
    label: 'Pot odds',
    tooltip: 'Equity needed to call a bet profitably',
    categoryId: 'pot-odds',
    generate() {
      let pot, bet, equity, c;
      do {
        pot = pick([50, 100, 150, 200, 300, 500]);
        bet = Math.round(pot * pick([0.33, 0.5, 0.67, 0.75, 1.0, 1.5]));
        equity = bet / (pot + 2 * bet) * 100;
        c = buildPctChoices(equity);
      } while (!c);
      return {
        id: 'pot-odds-' + uid(), templateId: 'pot-odds', categoryId: 'pot-odds', type: 'math',
        question: `Pot is $${pot}. Villain bets $${bet}. What equity do you need to call profitably?`,
        choices: c.choices, correctIndex: c.correctIndex,
        explanation: `Call $${bet} to win $${pot + bet}. Total pot if you call = $${pot + 2 * bet}. Equity needed = bet / (pot + 2 × bet) = ${bet} / ${pot + 2 * bet} ≈ ${equity.toFixed(1)}%.`,
        formula: {
          inputs: [{ id: 'pot', label: 'Pot', value: pot }, { id: 'bet', label: 'Bet', value: bet }],
          compute: v => v.bet / (v.pot + 2 * v.bet) * 100,
          outputLabel: 'Equity needed', outputUnit: '%', decimals: 1,
          formulaText: 'bet / (pot + 2 × bet)'
        },
        source: 'Sklansky — Theory of Poker'
      };
    }
  },
  {
    id: 'bluff-fold-equity',
    label: 'Bluff fold equity',
    tooltip: 'How often villain must fold for a pure bluff to break even',
    categoryId: 'bluff-fold-equity',
    generate() {
      let pot, bet, breakeven, c;
      do {
        pot = pick([50, 100, 200, 300, 500]);
        bet = Math.round(pot * pick([0.33, 0.5, 0.67, 1.0, 1.5, 2.0]));
        breakeven = bet / (pot + bet) * 100;
        c = buildPctChoices(breakeven);
      } while (!c);
      return {
        id: 'bluff-fe-' + uid(), templateId: 'bluff-fold-equity', categoryId: 'bluff-fold-equity', type: 'math',
        question: `Pot is $${pot}. You bet $${bet} as a pure bluff (no equity). How often does villain need to fold to make it break even?`,
        choices: c.choices, correctIndex: c.correctIndex,
        explanation: `You risk $${bet} to win $${pot}. Breakeven fold % = bet / (pot + bet) = ${bet} / ${pot + bet} ≈ ${breakeven.toFixed(1)}%.`,
        formula: {
          inputs: [{ id: 'pot', label: 'Pot', value: pot }, { id: 'bet', label: 'Bet', value: bet }],
          compute: v => v.bet / (v.pot + v.bet) * 100,
          outputLabel: 'Fold % needed', outputUnit: '%', decimals: 1,
          formulaText: 'bet / (pot + bet)'
        },
        source: 'Janda — Applications of NLHE'
      };
    }
  },
  {
    id: 'rule-2-4',
    label: 'Rule of 2 & 4',
    tooltip: 'Approximate draw equity from outs (×4 flop→river, ×2 turn→river)',
    categoryId: 'rule-2-4',
    generate() {
      const street = pick(['flop', 'turn']);
      const outs = pick([4, 5, 6, 8, 9, 10, 12, 15]);
      const mult = street === 'flop' ? 4 : 2;
      const equity = outs * mult;
      const c = buildIntPctChoices(equity);
      return {
        id: 'rule24-' + uid(), templateId: 'rule-2-4', categoryId: 'rule-2-4', type: 'math',
        question: `On the ${street} you have ${outs} outs to improve. Approximately what is your equity to ${street === 'flop' ? 'the river' : 'hit on the river'} (rule of 2 & 4)?`,
        choices: c.choices, correctIndex: c.correctIndex,
        explanation: `Rule of 2 & 4: multiply outs × 4 on the flop (equity to river) or × 2 on the turn (equity on next card). ${outs} × ${mult} = ${equity}%. This is an approximation; accuracy drops above ~12 outs.`,
        formula: {
          inputs: [
            { id: 'outs', label: 'Outs', value: outs, min: 1, max: 20, step: 1, integer: true },
            { id: 'mult', label: 'Street', value: mult, type: 'toggle',
              options: [{ label: 'Flop → River  (×4)', value: 4 }, { label: 'Turn → River  (×2)', value: 2 }] }
          ],
          compute: v => v.outs * v.mult,
          outputLabel: 'Approx. equity', outputUnit: '%', decimals: 0,
          formulaText: 'outs × multiplier (4 = flop→river, 2 = turn→river)'
        },
        source: 'Harrington on Hold\'em Vol I'
      };
    }
  },
  {
    id: 'mdf',
    label: 'MDF (min. defense freq.)',
    tooltip: 'Minimum % of your range to defend so villain can\'t bluff any two cards profitably',
    categoryId: 'mdf',
    generate() {
      let pot, bet, mdf, c;
      do {
        pot = pick([50, 100, 150, 200, 300]);
        bet = Math.round(pot * pick([0.33, 0.5, 0.67, 0.75, 1.0, 1.5]));
        mdf = pot / (pot + bet) * 100;
        c = buildPctChoices(mdf);
      } while (!c);
      return {
        id: 'mdf-' + uid(), templateId: 'mdf', categoryId: 'mdf', type: 'math',
        question: `Pot is $${pot}. Villain bets $${bet}. What percentage of your range must you defend (MDF) to prevent villain from profitably bluffing any two cards?`,
        choices: c.choices, correctIndex: c.correctIndex,
        explanation: `MDF = pot / (pot + bet) = ${pot} / ${pot + bet} ≈ ${mdf.toFixed(1)}%. Folding more than this makes you exploitable — villain profits by bluffing with any hand.`,
        formula: {
          inputs: [{ id: 'pot', label: 'Pot', value: pot }, { id: 'bet', label: 'Bet', value: bet }],
          compute: v => v.pot / (v.pot + v.bet) * 100,
          outputLabel: 'MDF', outputUnit: '%', decimals: 1,
          formulaText: 'pot / (pot + bet)'
        },
        source: 'Janda — Applications of NLHE'
      };
    }
  },
  {
    id: 'set-mining',
    label: 'Set mining (20:1)',
    tooltip: 'Stack depth needed to profitably call preflop with a small pair hoping to flop a set',
    categoryId: 'set-mining',
    generate() {
      const stack = pick([20, 25, 30, 40, 50, 60, 80, 100, 150, 200]);
      const open = pick([2, 2.5, 3, 3.5, 4]);
      const ratio = stack / open;
      const profitable = ratio >= 20;
      const choices = [
        'Yes — implied odds are there',
        'No — stack is too shallow for set-mining',
        'Yes, but only if in position',
        'Depends on villain\'s tendencies only'
      ];
      return {
        id: 'set-mine-' + uid(), templateId: 'set-mining', categoryId: 'set-mining', type: 'math',
        question: `Villain opens to ${open}bb. You have a small pocket pair and the effective stack is ${stack}bb. By the 20:1 rule, is calling to set-mine profitable?`,
        choices, correctIndex: profitable ? 0 : 1,
        explanation: `Stack / call = ${stack} / ${open} = ${ratio.toFixed(1)}:1. The 20:1 rule says you need ≥20× the call in effective stack to have the implied odds to profitably set-mine (you flop a set ~1 in 8.5 times). ${profitable ? `${ratio.toFixed(1)} ≥ 20 — qualifies.` : `${ratio.toFixed(1)} < 20 — not enough stack behind.`}`,
        formula: {
          inputs: [
            { id: 'stack', label: 'Effective stack (bb)', value: stack },
            { id: 'call', label: 'Amount to call (bb)', value: open }
          ],
          compute: v => v.stack / v.call,
          outputLabel: 'Stack-to-call ratio', outputUnit: ':1', decimals: 1,
          formulaText: 'effective_stack / call  (need ≥ 20)'
        },
        source: 'Sklansky / Harrington — set-mining implied odds'
      };
    }
  },
  {
    id: 'm-ratio',
    label: 'M-ratio (Harrington zones)',
    tooltip: 'Stack / one full orbit cost — measures tournament survival pressure (Green/Yellow/Orange/Red)',
    categoryId: 'm-ratio',
    generate() {
      const sb = pick([100, 200, 500, 1000, 2000]);
      const bb = sb * 2;
      const ante = Math.round(bb * 0.1);
      const players = 9;
      const orbit = sb + bb + ante * players;
      const zones = [
        { name: 'Green', min: 20, mVal: pick([22, 25, 30, 40]) },
        { name: 'Yellow', min: 10, mVal: pick([12, 14, 17]) },
        { name: 'Orange', min: 6, mVal: pick([7, 8, 9]) },
        { name: 'Red', min: 1, mVal: pick([2, 3, 4, 5]) }
      ];
      const zone = pick(zones);
      const stack = Math.round(zone.mVal * orbit);
      const m = stack / orbit;
      let correctZone;
      if (m >= 20) correctZone = 'Green';
      else if (m >= 10) correctZone = 'Yellow';
      else if (m >= 6) correctZone = 'Orange';
      else correctZone = 'Red';
      const allZones = ['Green (M ≥ 20)', 'Yellow (M 10–20)', 'Orange (M 6–10)', 'Red (M 1–6)'];
      const zoneMap = { Green: 0, Yellow: 1, Orange: 2, Red: 3 };
      return {
        id: 'mratio-' + uid(), templateId: 'm-ratio', categoryId: 'm-ratio', type: 'math',
        question: `Blinds ${sb.toLocaleString()}/${bb.toLocaleString()}, ante ${ante.toLocaleString()} (9-handed). Your stack is ${stack.toLocaleString()}. Which Harrington zone are you in?`,
        choices: allZones, correctIndex: zoneMap[correctZone],
        explanation: `One orbit costs SB + BB + ante × players = ${sb} + ${bb} + ${ante} × 9 = ${orbit.toLocaleString()}. M = ${stack.toLocaleString()} / ${orbit.toLocaleString()} ≈ ${m.toFixed(1)}. Zones: Green ≥20 (full flexibility), Yellow 10–20 (some pressure), Orange 6–10 (push/fold most spots), Red 1–6 (push/fold always).`,
        formula: {
          inputs: [
            { id: 'stack', label: 'Stack', value: stack },
            { id: 'sb', label: 'Small blind', value: sb },
            { id: 'bb', label: 'Big blind', value: bb },
            { id: 'ante', label: 'Ante (per player)', value: ante },
            { id: 'players', label: 'Players at table', value: players }
          ],
          compute: v => v.stack / (v.sb + v.bb + v.ante * v.players),
          outputLabel: 'M', outputUnit: '', decimals: 2,
          formulaText: 'stack / (SB + BB + ante × players)'
        },
        source: 'Harrington on Hold\'em Vol II'
      };
    }
  },
  {
    id: 'effective-stack',
    label: 'Effective stack',
    tooltip: 'The smaller of the two stacks — caps the maximum that can be won or lost in a hand',
    categoryId: 'effective-stack',
    generate() {
      const hero = pick([20, 35, 50, 75, 100, 150, 200, 300]);
      const villain = pick([15, 25, 40, 60, 80, 120, 175, 250]);
      const eff = Math.min(hero, villain);
      const wrong = shuffle([Math.max(hero, villain), Math.round((hero + villain) / 2), Math.abs(hero - villain)]);
      const opts = shuffle([eff, wrong[0], wrong[1], wrong[2]]);
      return {
        id: 'eff-' + uid(), templateId: 'effective-stack', categoryId: 'effective-stack', type: 'math',
        question: `You have ${hero}bb. Your only opponent in this hand has ${villain}bb. What is the effective stack?`,
        choices: opts.map(v => v + 'bb'), correctIndex: opts.indexOf(eff),
        explanation: `Effective stack = min(your stack, villain's stack) = min(${hero}, ${villain}) = ${eff}bb. You can only win or lose the smaller stack, so thinking about stacks beyond ${eff}bb is irrelevant for this hand.`,
        formula: {
          inputs: [
            { id: 'hero', label: 'Your stack (bb)', value: hero },
            { id: 'villain', label: 'Villain stack (bb)', value: villain }
          ],
          compute: v => Math.min(v.hero, v.villain),
          outputLabel: 'Effective stack', outputUnit: 'bb', decimals: 0,
          formulaText: 'min(hero_stack, villain_stack)'
        },
        source: 'Miller / Harrington — standard stack concept'
      };
    }
  }
];

const RULES_QUESTIONS = [
  // === Preflop ===
  {
    id: 'pre-gap-1', categoryId: 'preflop', type: 'rules',
    question: 'You have 99 on the button. A tight UTG (opens TT+, AKo+) raises to 3bb, 100bb effective. Best play?',
    choices: [
      '3-bet to 9bb — 99 dominates his range',
      'Call — set-mine in position and realize equity',
      'Fold — against a tight UTG range, 99 is dominated by overpairs and a flip against AK',
      'Limp behind'
    ],
    correctIndex: 2,
    explanation: 'Gap concept: you need a stronger hand to call (or re-raise) than to open. Against TT+/AK, 99 is crushed by overpairs and flips against AK. The implied odds for a set don\'t compensate against such a tight range. (Calling is more reasonable against wider opens.)',
    source: 'Sklansky — Theory of Poker (Gap Concept)'
  },
  {
    id: 'pre-sc-shallow', categoryId: 'preflop', type: 'rules',
    question: 'You have 7♠6♠ in MP. CO opens 3bb. Effective stack 24bb. Best play?',
    choices: [
      'Call — suited connectors are always worth a call',
      'Fold — 24bb / 3bb = 8:1, below the ~10:1 minimum for suited connectors',
      '3-bet bluff to steal the pot',
      'Call — you only need 5:1 stack-to-call with suited cards'
    ],
    correctIndex: 1,
    explanation: 'Suited connectors need implied odds to profit — roughly 10:1 stack-to-call minimum (some use 15:1). At 24bb effective, 24 / 3 = 8:1, well below the threshold. There isn\'t enough money behind to get paid when you hit your flush or straight.',
    source: 'Miller — Professional NLHE'
  },
  {
    id: 'pre-pairs-vs-sc', categoryId: 'preflop', type: 'rules',
    question: 'You have 5♣5♦. Three players have limped. Which statement is most accurate?',
    choices: [
      'Both 55 and 87s prefer heads-up pots',
      'Both prefer large multiway pots',
      '55 prefers heads-up (showdown value), 87s prefers multiway (gets paid when it hits the nuts)',
      '87s prefers heads-up, 55 prefers multiway'
    ],
    correctIndex: 2,
    explanation: 'Small pairs win mostly by showing down one pair — they want fewer opponents to outdraw them. Suited connectors win via straights and flushes that need multiple callers to get paid (large implied odds). "Pairs go up in value heads-up, connectors go down."',
    source: 'Sklansky — Theory of Poker'
  },
  {
    id: 'pre-iso-raise', categoryId: 'preflop', type: 'rules',
    question: 'Live 2/5 NL. Three players limp in front of you. You\'re on the button with AKo. Standard play?',
    choices: [
      'Limp behind to keep the pot multiway and disguise your hand',
      'Min-raise to $10',
      'Large iso-raise (e.g., $35–$40) to thin the field and play in position with the best hand',
      'Fold — too many opponents for AKo'
    ],
    correctIndex: 2,
    explanation: 'AKo plays much better in heads-up or 3-way pots. The standard live formula is 3bb + 1bb per limper, and many experienced players go even larger live to ensure the field is thinned. Position + strong hand + fewer opponents = maximizing EV.',
    source: 'Miller — Professional NLHE'
  },
  {
    id: 'pre-3bet-sizing', categoryId: 'preflop', type: 'rules',
    question: 'You\'re 3-betting an EP open from the SB (out of position). Standard sizing vs. same spot from the BTN (in position)?',
    choices: [
      'Same sizing from both — around 3× the open',
      'Larger OOP (~4× the open), smaller IP (~3× the open)',
      'Larger IP, smaller OOP — position makes you bold',
      'Always min-raise to deny the opener information'
    ],
    correctIndex: 1,
    explanation: 'OOP 3-bets should be larger because positional disadvantage means villain realizes more equity per chip invested. In position, your positional edge partially compensates, so you can size down and get called by a wider range you can outplay.',
    source: 'Janda — Applications of NLHE'
  },
  {
    id: 'pre-squeeze', categoryId: 'preflop', type: 'rules',
    question: 'EP opens 3bb, one MP player calls. You\'re in the SB with QQ. Best play?',
    choices: [
      'Flat — keep dead money in and set-mine in case of an ace on the flop',
      'Squeeze large (~12–14bb) to charge both ranges and ideally play heads-up OOP with the best hand',
      'Min-3bet to 6bb to save chips',
      'Fold — too many players, QQ is a coin flip multiway'
    ],
    correctIndex: 1,
    explanation: 'QQ is a premium hand that suffers multiway OOP. Squeeze sizes are larger than standard 3-bets (roughly 4× open + 1× per caller) because you\'re charging two ranges simultaneously and want fold equity to isolate.',
    source: 'Modern preflop theory — Janda / GTO Wizard'
  },

  // === Bet sizing ===
  {
    id: 'size-live-open', categoryId: 'sizing', type: 'rules',
    question: 'Live 2/5 NL cash. Two players limp in front of you on the button. Textbook open size?',
    choices: ['$15 (3bb)', '$20 (4bb)', '$25 (5bb = 3bb + 1 per limper)', '$50 (10bb)'],
    correctIndex: 2,
    explanation: 'Standard live formula: 3×BB + 1×BB per limper. Here: 3×$5 + 2×$5 = $25. Many experienced live players go larger ($30–$40) to ensure the field folds, but $25 is the textbook starting point.',
    source: 'Miller — Professional NLHE'
  },
  {
    id: 'size-polarized', categoryId: 'sizing', type: 'rules',
    question: 'Your river range consists only of nut flushes and busted draws used as bluffs (no medium-strength hands). Best sizing?',
    choices: [
      'Small (~1/3 pot) — get called by worse more often',
      'Medium (~1/2 pot) — balanced default',
      'Large or overbet — polarized ranges extract max value and apply max bluff pressure with big sizings',
      'Check — never bet with a polarized range'
    ],
    correctIndex: 2,
    explanation: 'A polarized range (nuts + bluffs, no medium hands) has no hand that dislikes a big bet. Large sizings: (a) extract more from value hands, (b) give bluffs more fold equity. Overbets are the natural extension on the river.',
    source: 'Janda — Applications of NLHE'
  },
  {
    id: 'size-merged', categoryId: 'sizing', type: 'rules',
    question: 'You have a merged flop betting range — many medium-strength hands (top pair, second pair), few pure nuts or pure bluffs. Best sizing?',
    choices: [
      'Overbet to blow opponents off their equity',
      'Small (~1/3 pot) — bet a wide range cheaply, pot stays manageable with medium hands',
      'Pot-sized to balance bluffs',
      'Never bet — merged ranges should always check'
    ],
    correctIndex: 1,
    explanation: 'Merged ranges want small sizings: bet wide, keep the pot small with medium hands that don\'t want a huge pot, extract thin value from worse medium hands. An overbet with a merged range bloats the pot when you\'re often just ahead of air.',
    source: 'Janda — Applications of NLHE'
  },
  {
    id: 'size-cbet-dry', categoryId: 'sizing', type: 'rules',
    question: 'You raised preflop and are c-betting a dry board like K♥7♣2♦. Standard modern sizing?',
    choices: [
      'Pot-sized — apply maximum pressure',
      'Small (~1/3 pot) — the board heavily favors your range; bet wide and cheap',
      'Overbet — polarize with your Kx hands',
      'Always check — c-betting dry boards is a leak'
    ],
    correctIndex: 1,
    explanation: 'K72r strongly favors the PFR\'s range (lots of Kx, overpairs). A small c-bet lets you bet a very wide range (often 70%+) cheaply. Villain folds air and you get thin value. Larger bets on dry boards don\'t punish villain\'s range more — they just risk more.',
    source: 'GTO Wizard — modern solver consensus'
  },
  {
    id: 'size-bluff-be', categoryId: 'sizing', type: 'rules',
    question: 'You make a pure bluff by betting exactly the size of the pot (1× pot) with no equity. What fold % do you need to break even?',
    choices: ['25%', '33%', '50%', '67%'],
    correctIndex: 2,
    explanation: 'Breakeven fold % = bet / (pot + bet). At 1× pot: bet = pot, so fold % = pot / (pot + pot) = 1/2 = 50%. Common reference: 1/3 pot → 25%, 1/2 pot → 33%, 1× pot → 50%, 2× pot → 67%.',
    source: 'Janda — Applications of NLHE'
  },
  {
    id: 'size-overbet-when', categoryId: 'sizing', type: 'rules',
    question: 'An overbet (>1× pot) tends to be most effective when:',
    choices: [
      'Your range is merged — lots of medium-strength hands',
      'Villain\'s range is capped (no nuts) and your range is polarized — you can credibly have hands they can\'t',
      'Always — bigger bets always mean more pressure',
      'Only on wet boards multiway'
    ],
    correctIndex: 1,
    explanation: 'Overbets work when villain is capped and your range contains hands they simply can\'t have (due to board texture + preflop action). Combined with bluffs, the large sizing extracts maximum from value and puts maximum pressure on bluff-catchers.',
    source: 'Janda — Applications of NLHE; modern solver play'
  },

  // === Stack depth & SPR ===
  {
    id: 'depth-tptk', categoryId: 'stack-depth', type: 'rules',
    question: '200bb deep cash. You have AK on K♥7♣2♦. A tight reg check-raises the flop, fires the turn, and jams the river. Best play?',
    choices: [
      'Snap call — TPTK is too strong to fold this fast',
      'Fold — three-street aggression from a tight reg on a dry board almost never means worse than top pair',
      'Re-raise all-in for value',
      'Min-raise the river to "see where you\'re at"'
    ],
    correctIndex: 1,
    explanation: '"Don\'t go broke with one pair." At 200bb deep, a tight player\'s three-street aggression on K72r represents sets, two pair, or unlikely KK/AA slow-plays. TPTK is a bluff-catcher against this player type, and tight regs don\'t run huge three-street bluffs often enough to make calling profitable.',
    source: 'Harrington on Hold\'em Vol II; Miller — Professional NLHE'
  },
  {
    id: 'depth-wahb', categoryId: 'stack-depth', type: 'rules',
    question: 'You have A♠A♣ on a Q♠J♠T♥ turn. A passive villain who rarely bluffs leads into you for a large bet. His likely range: sets, two pair, straights, an occasional flush draw. Best line?',
    choices: [
      'Raise all-in — AA is the best hand preflop',
      'Pot control / call — you\'re way ahead of bluffs, way behind his value; building the pot mostly helps him',
      'Fold AA to the lead',
      'Min-raise to "see where you\'re at"'
    ],
    correctIndex: 1,
    explanation: 'Way-ahead / way-behind: vs his bluffs you have ~95%; vs his sets/straights you have ~15%. Raising folds out his bluffs (the hands you\'re crushing) and gets called or re-raised only by value (hands that crush you). Calling keeps bluffs in and avoids bloating the pot when you\'re behind.',
    source: 'Sklansky / Harrington — way-ahead/way-behind concept'
  },
  {
    id: 'depth-eff-stack', categoryId: 'stack-depth', type: 'rules',
    question: 'You have 200bb. The only other player in the hand has 30bb. How deep is this pot effectively?',
    choices: ['200bb', '115bb (the average of both stacks)', '30bb', 'Depends on position'],
    correctIndex: 2,
    explanation: 'Effective stack = min(stacks). You can only win or lose the smaller stack. Having 200bb behind when your opponent has 30bb means thinking beyond 30bb is irrelevant for this hand — you cannot win more than 30bb from this specific opponent.',
    source: 'Miller / Harrington — standard stack concept'
  },
  {
    id: 'depth-spr-low', categoryId: 'stack-depth', type: 'rules',
    question: 'You\'re heads-up to a flop with SPR ≈ 3 (e.g., $300 pot, $900 behind). Strategic implication?',
    choices: [
      'Always pot-control — low SPR means preserve your stack',
      'Top pair / overpair is typically a stack-off hand — commitment threshold is low at low SPR',
      'Same as high SPR — no special considerations',
      'Check-fold everything — the pot is too small to risk your stack'
    ],
    correctIndex: 1,
    explanation: 'SPR ≤ 4 is the "commit with top pair" zone. At low SPR, folding top pair to aggression gives up too much pot equity relative to what you\'re risking. The hand plays more like all-in poker where marginal hands become clear stack-offs.',
    source: 'Flynn, Mehta & Miller — Professional NLHE (SPR)'
  },
  {
    id: 'depth-spr-high', categoryId: 'stack-depth', type: 'rules',
    question: 'SPR is 20+ (e.g., $50 pot, $1,000+ behind). Strategic implication?',
    choices: [
      'Stack off freely with top pair — you\'ve invested, might as well',
      'Implied-odds hands (sets, big draws) gain value; avoid getting committed with just top pair',
      'Same strategy regardless of SPR',
      'Go all-in on any flop to deny equity'
    ],
    correctIndex: 1,
    explanation: 'High SPR rewards nut-potential hands: sets, two pairs, big draws — because there\'s a huge stack behind to win when you hit. TPTK loses value because it often can\'t call three streets and doesn\'t want to build a giant pot. Classic high-SPR wisdom: "Don\'t go broke with one pair."',
    source: 'Flynn, Mehta & Miller — Professional NLHE'
  },
  {
    id: 'depth-pushfold', categoryId: 'stack-depth', type: 'rules',
    question: 'In tournament play, below approximately what stack depth does most play collapse to shove-or-fold preflop?',
    choices: ['~5bb', '~15bb', '~30bb', '~50bb'],
    correctIndex: 1,
    explanation: 'Around 12–15bb, raising to 2.5bb and then facing a 3-bet commits too large a portion of your stack to fold. Most hands become push-or-fold (using Nash equilibrium charts). Below 10bb it\'s almost universally shove-or-fold.',
    source: 'Harrington on Hold\'em Vol II; Nash push-fold charts'
  },

  // === Postflop ===
  {
    id: 'post-bet-flop-check-turn', categoryId: 'postflop', type: 'rules',
    question: 'You raised BTN, BB calls. Flop K♥7♣2♦ (you c-bet 1/3, BB calls). Turn 9♠ — a brick. Standard line with a wide range?',
    choices: [
      'Barrel big on the turn to represent continued strength',
      'Check back — "bet flop, check turn" on low-action turns protects your range and avoids bloating the pot with marginal hands',
      'Always overbet the turn',
      'Give up and fold to any flop lead'
    ],
    correctIndex: 1,
    explanation: '"Bet flop, check turn" on brick turns: your wide c-bet range contains many medium hands that don\'t want a big turn pot. Checking protects that range, controls the pot, and keeps villain\'s bluff range in (so he can hang himself on the river).',
    source: 'GTO Wizard — modern solver consensus'
  },
  {
    id: 'post-range-adv', categoryId: 'postflop', type: 'rules',
    question: 'You raised UTG, BB called. Flop comes K♠7♣2♦. Who has the range advantage?',
    choices: [
      'BB — they have all the small pairs since they defended at any price',
      'PFR — UTG\'s range is full of Kx, overpairs; BB\'s range has far fewer strong K hands',
      'Neither — ranges are equal on every board',
      'Whoever acts first has the range advantage'
    ],
    correctIndex: 1,
    explanation: 'K-high boards heavily favor the EP preflop raiser. UTG opens AK, KK, AA, AQs, KQs — BB\'s defense range contains mostly connected cards and pairs below kings. This range advantage justifies the small wide c-bet strategy.',
    source: 'Range vs range fundamentals — GTO Wizard preflop charts'
  },
  {
    id: 'post-checkraise-size', categoryId: 'postflop', type: 'rules',
    question: 'Villain c-bets the flop. You want to check-raise. Standard size rule of thumb?',
    choices: [
      'Min-raise (2× the c-bet) — keep it cheap',
      'About 3× to 3.5× the c-bet',
      'Always jam — max pressure',
      'Exactly pot-sized regardless of c-bet amount'
    ],
    correctIndex: 1,
    explanation: '~3× to 3.5× the c-bet is the standard check-raise size: large enough to charge draws and deny equity, but small enough that bluffs are cost-effective. Min-raises don\'t apply enough pressure; huge sizes over-commit your bluffing range.',
    source: 'Modern solver consensus'
  },
  {
    id: 'post-pot-control', categoryId: 'postflop', type: 'rules',
    question: 'You have second pair good kicker on the turn. The pot is already moderate and villain has been passive. Standard line?',
    choices: [
      'Bet large for value and protection — second pair is a strong hand',
      'Pot control — check back to keep the pot small and reach showdown cheaply',
      'Always fold medium-strength hands on the turn',
      'Check-raise as a semi-bluff with second pair'
    ],
    correctIndex: 1,
    explanation: 'Medium-strength hands (second pair, third pair, top pair weak kicker) are ahead of villain\'s bluffs but behind his value. Betting builds a pot that mostly helps his value hands. Pot control — check back, get to showdown — is the standard line with these holdings.',
    source: 'Harrington on Hold\'em Vol II; Sklansky — pot control'
  },

  // === Preflop (5 more) ===
  {
    id: 'pre-bb-defense', categoryId: 'preflop', type: 'rules',
    question: 'You\'re in the BB facing a BTN 2.5bb open, everyone else folded. You have 1bb already posted. General principle for your defense range?',
    choices: [
      'Defend only the top 20% of hands — OOP is too difficult',
      'Defend wider than other positions — you only need 1.5bb more and are closing the action, needing ~27% equity',
      'Always 3-bet or fold, never flat from the BB',
      'Play the same range as you would from the CO'
    ],
    correctIndex: 1,
    explanation: 'The BB has the widest defense range because you\'re discounted (already 1bb invested, calling 1.5bb more into a 4bb pot → ~27% equity needed) and you close the action. Many hands meet that threshold.',
    source: 'Janda — Applications of NLHE; modern preflop theory'
  },
  {
    id: 'pre-open-limp', categoryId: 'preflop', type: 'rules',
    question: 'In a standard NL cash game, open-limping (first to enter the pot with a limp) is generally:',
    choices: [
      'Correct with small pairs and suited connectors from EP — saves money when you miss',
      'Always fine — limping is a valid play at any position',
      'Almost always incorrect — it surrenders initiative, lets the field in cheaply, and leaves you in a bad spot',
      'Recommended whenever you\'re unsure about your hand\'s strength'
    ],
    correctIndex: 2,
    explanation: 'Open-limping has no upside: you invite multiple opponents in cheaply, give up fold equity, lose initiative, and often face a raise anyway. The standard advice is raise for value/fold equity, or fold.',
    source: 'Miller — Professional NLHE'
  },
  {
    id: 'pre-4bet-size', categoryId: 'preflop', type: 'rules',
    question: 'Villain 3-bets to 9bb. You decide to 4-bet in position. Standard sizing?',
    choices: [
      'Min-raise (2× the 3-bet = 18bb)',
      'About 2.2–2.5× the 3-bet (~20–22bb)',
      'Always jam regardless of stack depth',
      'Pot-sized 4-bet'
    ],
    correctIndex: 1,
    explanation: '~2.2–2.5× the 3-bet is the standard in-position 4-bet size. It builds the pot toward a natural stack-off, applies meaningful pressure, and doesn\'t make bluffing prohibitively expensive. OOP 4-bets are typically larger (~3×).',
    source: 'Modern preflop theory — Janda / GTO Wizard'
  },
  {
    id: 'pre-kk-vs-5bet', categoryId: 'preflop', type: 'rules',
    question: 'You open UTG, villain 3-bets, you 4-bet, villain 5-bet jams for 100bb effective. You have KK. Best play?',
    choices: [
      'Fold — they always have AA at this point',
      'Call (or 5-bet jam) — KK is a clear continue; even if villain has AA half the time, the math still favors calling',
      'Fold if they\'re a tight regular, call otherwise',
      'Fold in tournaments — survival matters more'
    ],
    correctIndex: 1,
    explanation: 'Folding KK for 100bb is a significant error against any realistic 5-bet range (which includes AK, QQ, and occasional bluffs alongside AA). The math favors calling in virtually every standard situation. Only in very deep-stacked (300bb+) multiway spots does folding KK become debatable.',
    source: 'Standard tournament/cash theory; Harrington on Hold\'em'
  },
  {
    id: 'pre-cold-4bet', categoryId: 'preflop', type: 'rules',
    question: 'EP opens, MP 3-bets, it folds to you in CO. You cold 4-bet. Best hand type for this?',
    choices: [
      'Any suited connector — multiway implied odds compensate for the risk',
      'Premium hands (KK+) or polarized bluffs with strong blockers (e.g., A5s) — cold 4-bet ranges must be very tight',
      'Any two cards — pure steal spot',
      'Medium pairs (77–TT) — great implied odds cold 4-bet hands'
    ],
    correctIndex: 1,
    explanation: 'A cold 4-bet faces two strong ranges simultaneously. Only premiums have the raw equity, and bluffs need blockers (Ace blocker limits the likelihood villain has AA/AK). Medium pairs and speculative hands don\'t have enough equity when called or enough fold equity to justify the investment.',
    source: 'Modern preflop theory — Janda / GTO Wizard'
  },

  // === Bet sizing (5 more) ===
  {
    id: 'size-geometric', categoryId: 'sizing', type: 'rules',
    question: 'You want to bet flop, turn, and river to stack off naturally by the river. What sizing principle achieves this most cleanly?',
    choices: [
      'Bet small every street to keep the pot manageable',
      'Geometric sizing — each street uses a consistent fraction of the pot so the stack commitment grows evenly to the river',
      'Bet large on the flop, then check back turn and river',
      'Always pot-bet every street'
    ],
    correctIndex: 1,
    explanation: 'Geometric sizing spaces your bets so the pot grows at a constant rate, arriving at a natural all-in on the river. Calculate the fraction once (e.g., ~50% of pot each street for a 3-street stack-off from SPR ~8) and apply it consistently.',
    source: 'Janda — Applications of NLHE'
  },
  {
    id: 'size-nut-advantage', categoryId: 'sizing', type: 'rules',
    question: 'You have a significant nut advantage on the river (your range contains far more strong hands than villain\'s). Best sizing approach?',
    choices: [
      'Bet small — get called by a wider range',
      'Check back — don\'t over-exploit your advantage',
      'Use larger sizings or overbets — villain can\'t defend at high frequency, so big bets extract maximum value',
      'Always bet 1/3 pot to stay balanced'
    ],
    correctIndex: 2,
    explanation: 'Nut advantage justifies large bet sizings because villain\'s range is capped and he can\'t call/raise freely. Overbets are especially powerful when you have hands he can\'t beat and must fold — they maximize value extraction and give bluffs maximum fold equity.',
    source: 'Janda — Applications of NLHE; GTO theory'
  },
  {
    id: 'size-barrel-station', categoryId: 'sizing', type: 'rules',
    question: 'You c-bet the flop against a known calling station. The turn is a blank. You have a pure bluff with no equity. Best play?',
    choices: [
      'Fire a big second barrel — maximum pressure',
      'Give up and check — bluffing a calling station is –EV because they rarely fold',
      'Bet small to represent weakness and induce a raise',
      'Check-raise if he bets the turn'
    ],
    correctIndex: 1,
    explanation: '"Never bluff a calling station." Against a player who doesn\'t fold, bluffs have zero fold equity and are therefore –EV. The correct adjustment is to stop bluffing entirely and only bet when you have genuine value.',
    source: 'Harrington on Hold\'em Vol I'
  },
  {
    id: 'size-turn-cr', categoryId: 'sizing', type: 'rules',
    question: 'Villain c-bets the flop, you call. Turn is a blank; you check, villain bets again. You want to check-raise. How does this sizing compare to a flop check-raise?',
    choices: [
      'Smaller — turn check-raises should be cautious',
      'The same — always use 3× regardless of street',
      'Larger — the pot is bigger, stacks are shorter relative to the pot, and a small turn CR leaves too much behind',
      'Always jam the turn'
    ],
    correctIndex: 2,
    explanation: 'Turn check-raises are typically larger than flop check-raises (often 2.5–3× or more of the turn bet). The pot has grown, villain is more committed, and a small raise gives him a favorable price to continue with draws or medium-strength hands.',
    source: 'Modern solver consensus; Janda'
  },
  {
    id: 'size-cbet-wet', categoryId: 'sizing', type: 'rules',
    question: 'You raised preflop and c-bet a wet board like 8♥7♦6♥. What sizing is most appropriate?',
    choices: [
      'Small (~1/3 pot) — same as dry boards; texture doesn\'t matter',
      'Larger (~2/3–3/4 pot) — wet boards give villain many draws; you need to charge them correctly',
      'Always check — never c-bet wet boards',
      'Overbet — wet boards always warrant maximum pressure'
    ],
    correctIndex: 1,
    explanation: 'Wet boards give villain many draws with strong equity. A small c-bet on 876 two-tone gives a flush draw or open-ender excellent odds to continue. Larger bets charge draws appropriately and protect your made hands.',
    source: 'GTO Wizard / modern solver consensus; Janda'
  },

  // === Stack depth & SPR (5 more) ===
  {
    id: 'depth-spr-calc', categoryId: 'stack-depth', type: 'rules',
    question: 'You raise to 3bb, SB folds, BB calls. Pot is 6.5bb (your 3 + BB\'s 3 + SB\'s 0.5 dead). Both started with 100bb. What is the SPR going to the flop?',
    choices: ['~6.5', '~10', '~15', '~20'],
    correctIndex: 2,
    explanation: 'SPR = effective stack behind / pot. Both players have 97bb behind (100 – 3). SPR = 97 / 6.5 ≈ 14.9 (~15). At SPR ~15, top pair is not a stack-off hand — you have plenty of room to play streets.',
    source: 'Flynn, Mehta & Miller — Professional NLHE (SPR)'
  },
  {
    id: 'depth-antes', categoryId: 'stack-depth', type: 'rules',
    question: 'A tournament adds a 1bb ante per player (9-handed). What is the primary strategic effect?',
    choices: [
      'No effect — antes only change chip counts',
      'Antes make you tighter because there is more to lose per orbit',
      'Antes enlarge the starting pot, making steals more profitable and widening correct opening ranges',
      'Antes only matter for short stacks'
    ],
    correctIndex: 2,
    explanation: 'Antes add ~1.5bb to every pot before action begins, improving pot odds for stealing and widening profitable opening ranges. The M-ratio formula includes antes specifically because they dramatically accelerate stack erosion and change incentives.',
    source: 'Harrington on Hold\'em Vol II'
  },
  {
    id: 'depth-jam-13bb', categoryId: 'stack-depth', type: 'rules',
    question: 'Tournament, EP, 13bb effective, you have ATo. Best play?',
    choices: [
      'Open fold — ATo is too marginal from EP',
      'Raise to 2.5bb, then fold to a 3-bet',
      'Shove all-in — open-raising then folding to a 3-bet wastes ~20% of your stack for nothing',
      'Limp to see a cheap flop'
    ],
    correctIndex: 2,
    explanation: 'At 13bb, raising to 2.5bb and folding to a 3-bet spends ~20% of your stack with nothing to show. Nash push-fold charts support shoving ATo from EP at this depth. Shove-or-fold keeps decision trees simple and prevents chip leakage.',
    source: 'Harrington on Hold\'em Vol II; Nash push-fold charts'
  },
  {
    id: 'depth-icm-bubble', categoryId: 'stack-depth', type: 'rules',
    question: 'You have a medium stack near the money bubble in a tournament. ICM suggests you should:',
    choices: [
      'Loosen up — the bubble is the best time to accumulate chips',
      'Tighten up — chips lost near the bubble cost more ICM equity than chips gained are worth',
      'Shove every hand to pressure short stacks',
      'ICM has no effect on hand selection'
    ],
    correctIndex: 1,
    explanation: 'ICM means chips have diminishing marginal value as you approach the money. Near the bubble, busting costs all future equity. A medium stack should fold marginal spots and let short stacks eliminate each other, while big stacks can exploit this pressure.',
    source: 'Harrington on Hold\'em Vol II; standard ICM theory'
  },
  {
    id: 'depth-semi-bluff-value', categoryId: 'stack-depth', type: 'rules',
    question: 'Semi-bluffing is more valuable than pure bluffing primarily because:',
    choices: [
      'It is riskier, so the reward must be higher',
      'It has two ways to win: villain folds immediately, OR you improve to the best hand on a later street',
      'Semi-bluffs always succeed because they have equity',
      'They require more fold equity than pure bluffs'
    ],
    correctIndex: 1,
    explanation: 'A semi-bluff wins when villain folds AND when you improve and win at showdown. This dual path means a semi-bluff needs less fold equity to be profitable than a pure bluff. The stronger your draw (more outs), the less often villain needs to fold.',
    source: 'Sklansky — Theory of Poker'
  },

  // === Postflop (5 more) ===
  {
    id: 'post-semi-bluff-bet', categoryId: 'postflop', type: 'rules',
    question: 'You have K♦Q♦ on A♦J♦7♣ (flush draw + two overcards). Villain checks to you. Best line?',
    choices: [
      'Check back — too risky to bet with only a draw',
      'Bet as a semi-bluff — 12+ outs, two ways to win (immediate fold equity + equity if called)',
      'Bet only if you plan to barrel every street regardless',
      'Always slow-play big draws'
    ],
    correctIndex: 1,
    explanation: 'KQ♦ on A♦J♦7♣ has ~12 outs (9 flush + 3K + 3Q with some overlap). Betting captures fold equity now and maintains strong equity when called. Checking gives up one of the two ways to win.',
    source: 'Sklansky — Theory of Poker'
  },
  {
    id: 'post-float', categoryId: 'postflop', type: 'rules',
    question: '"Floating" the flop in position means:',
    choices: [
      'Checking behind with a strong hand to disguise it',
      'Calling a c-bet with a weak hand in position, planning to take the pot away on the turn when the bettor slows down',
      'Limping preflop to trap with a premium hand',
      'Making a small blocking bet OOP to control pot size'
    ],
    correctIndex: 1,
    explanation: 'A float is an IP call with little immediate equity, based on the read that villain will check the turn and fold to a bet. It works best against frequent c-bettors who give up on later streets (single-barrelers).',
    source: 'Harrington on Hold\'em Vol II'
  },
  {
    id: 'post-probe', categoryId: 'postflop', type: 'rules',
    question: 'Villain raised preflop and checked back the flop in position. You\'re OOP on the turn. A "probe bet" means:',
    choices: [
      'Check-raising the turn to punish the check-back',
      'Leading the turn to charge villain\'s now-capped range and pick up the pot when he has a marginal hand',
      'A min-bet to control the pot',
      'Checking again to induce a bluff'
    ],
    correctIndex: 1,
    explanation: 'When the PFR checks back the flop, his range is capped — he likely missed or has a medium hand. A probe bet from OOP exploits this: he often folds marginal hands, and when he calls or raises, you get useful information about his range.',
    source: 'Modern postflop theory — GTO Wizard'
  },
  {
    id: 'post-reverse-implied', categoryId: 'postflop', type: 'rules',
    question: 'You have 9♦8♦ on J♦T♦3♠. "Reverse implied odds" here refers to:',
    choices: [
      'You can\'t win a large pot even when you make your hand',
      'When you complete your flush, you may still lose to a higher flush, paying off a big bet on the end',
      'Implied odds only work on the river, not the flop',
      'You should always fold non-nut draws'
    ],
    correctIndex: 1,
    explanation: 'Reverse implied odds: you complete your draw but still lose to a better hand, costing you large additional chips. With 9♦8♦ here, any A♦, K♦, Q♦ holding beats your flush. This reduces your draw\'s value compared to a nut flush draw.',
    source: 'Sklansky — Theory of Poker; Miller — Professional NLHE'
  },
  {
    id: 'post-donk-size', categoryId: 'postflop', type: 'rules',
    question: 'You called a preflop raise from the BB. Flop is 7♦6♠5♣ — a board that hits your range heavily. You lead into the PFR (donk bet). Typical sizing?',
    choices: [
      'Very small (1/4 pot) to probe cheaply',
      'About 1/3–1/2 pot — enough to charge draws and define ranges without over-committing weak holdings',
      'Always pot-sized — a donk bet must be large',
      'Min-bet only'
    ],
    correctIndex: 1,
    explanation: 'A medium donk bet (~1/3–1/2 pot) balances value and bluff hands on boards that favor your range. Too small invites a free peel or raise; too large over-commits weak holdings and folds out too many bluff-catchers you want to keep in.',
    source: 'Modern GTO theory — GTO Wizard'
  }
];

const CATEGORIES = [
  { id: 'pot-odds', label: 'Pot odds', kind: 'math' },
  { id: 'bluff-fold-equity', label: 'Bluff fold equity', kind: 'math' },
  { id: 'rule-2-4', label: 'Rule of 2 & 4', kind: 'math' },
  { id: 'mdf', label: 'MDF (min. defense freq.)', kind: 'math' },
  { id: 'set-mining', label: 'Set mining (20:1)', kind: 'math' },
  { id: 'm-ratio', label: 'M-ratio (zones)', kind: 'math' },
  { id: 'effective-stack', label: 'Effective stack', kind: 'math' },
  { id: 'preflop', label: 'Preflop', kind: 'rules' },
  { id: 'sizing', label: 'Bet sizing', kind: 'rules' },
  { id: 'stack-depth', label: 'Stack depth & SPR', kind: 'rules' },
  { id: 'postflop', label: 'Postflop', kind: 'rules' }
];

window.TRAINING_DATA = { MATH_TEMPLATES, RULES_QUESTIONS, CATEGORIES };
