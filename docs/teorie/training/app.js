(function () {
  const { MATH_TEMPLATES, RULES_QUESTIONS, CATEGORIES } = window.TRAINING_DATA;
  const STORAGE_KEY = 'training_v1';

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Deck: rules questions only, shuffled on first open
  function initDeck() {
    return shuffle(RULES_QUESTIONS.map(q => q.id)).map(id => ({ id, lastSeen: null }));
  }

  let state = loadState();
  if (!state.rulesSelected) state.rulesSelected = CATEGORIES.filter(c => c.kind === 'rules').map(c => c.id);
  if (!state.rulesCount) state.rulesCount = 10;
  if (state.showFormula === undefined) state.showFormula = true;
  if (!state.mathCounts) {
    state.mathCounts = {};
    MATH_TEMPLATES.forEach(t => { state.mathCounts[t.id] = 1; });
  }
  if (!state.deck) state.deck = initDeck();
  saveState(state);

  const elCats = document.getElementById('categories');
  const elGenerate = document.getElementById('generate');
  const elQuiz = document.getElementById('quiz');
  const elReveal = document.getElementById('reveal');
  const elRevealHint = document.getElementById('reveal-hint');
  const elSummary = document.getElementById('summary');

  let currentQuestions = [];

  // ── Setup panel ──────────────────────────────────────────────────────────
  function renderSetup() {
    elCats.innerHTML = '';

    // Math: per-template count spinners
    const mathGrp = document.createElement('div');
    mathGrp.className = 'cat-group';
    mathGrp.innerHTML = '<div class="cat-group-title">Math formulas — questions per template</div>';
    const mathList = document.createElement('div');
    mathList.className = 'math-count-list';
    MATH_TEMPLATES.forEach(t => {
      const row = document.createElement('label');
      row.className = 'math-count-row';
      const val = state.mathCounts[t.id] ?? 1;
      const tip = t.tooltip ? `<span class="tip-icon" data-tip="${t.tooltip.replace(/"/g, '&quot;')}">ⓘ</span>` : '';
      row.innerHTML = `<input type="number" class="math-count-input" data-tpl="${t.id}" min="0" max="10" value="${val}"> <span>${t.label}</span>${tip}`;
      mathList.appendChild(row);
    });
    mathGrp.appendChild(mathList);
    elCats.appendChild(mathGrp);

    const formulaToggle = document.createElement('label');
    formulaToggle.className = 'cat-item formula-toggle-opt';
    formulaToggle.innerHTML = `<input type="checkbox" id="show-formula"${state.showFormula ? ' checked' : ''}> Show tweakable formula after reveal`;
    mathGrp.appendChild(formulaToggle);
    document.getElementById('show-formula').addEventListener('change', e => {
      state.showFormula = e.target.checked;
      saveState(state);
    });

    mathList.querySelectorAll('.math-count-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const v = Math.max(0, Math.min(10, parseInt(inp.value, 10) || 0));
        inp.value = v;
        state.mathCounts[inp.dataset.tpl] = v;
        saveState(state);
      });
    });

    // Rules: checkboxes + count
    const rulesGrp = document.createElement('div');
    rulesGrp.className = 'cat-group';
    rulesGrp.innerHTML = '<div class="cat-group-title">Rules of thumb — categories</div>';
    const rulesList = document.createElement('div');
    rulesList.className = 'cat-list';
    CATEGORIES.filter(c => c.kind === 'rules').forEach(c => {
      const lbl = document.createElement('label');
      lbl.className = 'cat-item';
      const checked = state.rulesSelected.includes(c.id);
      lbl.innerHTML = `<input type="checkbox" data-cat="${c.id}"${checked ? ' checked' : ''}> ${c.label}`;
      rulesList.appendChild(lbl);
    });
    rulesGrp.appendChild(rulesList);

    const countRow = document.createElement('div');
    countRow.className = 'count-row';
    countRow.innerHTML = `<label>Rules questions: <input type="number" id="rules-count" min="0" max="50" value="${state.rulesCount}"></label>`;
    rulesGrp.appendChild(countRow);
    elCats.appendChild(rulesGrp);

    elCats.querySelectorAll('input[data-cat]').forEach(cb => {
      cb.addEventListener('change', () => {
        state.rulesSelected = [...elCats.querySelectorAll('input[data-cat]:checked')].map(x => x.dataset.cat);
        saveState(state);
      });
    });
    document.getElementById('rules-count').addEventListener('change', e => {
      state.rulesCount = Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0));
      e.target.value = state.rulesCount;
      saveState(state);
    });
  }

  // ── Generate quiz ────────────────────────────────────────────────────────
  function generateQuiz() {
    const rulesCount = state.rulesCount;
    const mathTotal = MATH_TEMPLATES.reduce((s, t) => s + (state.mathCounts[t.id] || 0), 0);

    if (mathTotal === 0 && rulesCount === 0) {
      elQuiz.innerHTML = '<div class="warn">Set at least one math template count or rules question count above zero.</div>';
      elReveal.style.display = 'none';
      elSummary.innerHTML = '';
      return;
    }

    // Math questions — generate the exact count per template
    const mathQuestions = [];
    MATH_TEMPLATES.forEach(t => {
      const n = state.mathCounts[t.id] || 0;
      for (let i = 0; i < n; i++) mathQuestions.push(t.generate());
    });

    // Rules questions — pull from deck sorted by lastSeen (null first, then oldest)
    const sel = new Set(state.rulesSelected);
    const eligible = state.deck
      .filter(e => {
        const q = RULES_QUESTIONS.find(r => r.id === e.id);
        return q && sel.has(q.categoryId);
      })
      .sort((a, b) => {
        if (a.lastSeen === null && b.lastSeen === null) return 0;
        if (a.lastSeen === null) return -1;
        if (b.lastSeen === null) return 1;
        return a.lastSeen - b.lastSeen;
      });

    const rulesQuestions = [];
    const usedIds = new Set();
    for (const entry of eligible) {
      if (rulesQuestions.length >= rulesCount) break;
      if (!usedIds.has(entry.id)) {
        const q = RULES_QUESTIONS.find(r => r.id === entry.id);
        if (q) { rulesQuestions.push(q); usedIds.add(entry.id); }
      }
    }

    currentQuestions = shuffle([...mathQuestions, ...rulesQuestions]);
    renderQuiz();
    elReveal.style.display = '';
    elReveal.disabled = false;
    elReveal.textContent = 'Show results';
    elRevealHint.style.display = '';
    elSummary.innerHTML = '';
  }

  // ── Suit coloring ────────────────────────────────────────────────────────
  function colorSuits(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/[♥♦]/g, m => `<span class="suit-r">${m}</span>`)
      .replace(/[♠♣]/g, m => `<span class="suit-b">${m}</span>`);
  }

  // ── Render questions ─────────────────────────────────────────────────────
  function catLabel(id) {
    const t = MATH_TEMPLATES.find(x => x.id === id);
    if (t) return t.label;
    const c = CATEGORIES.find(x => x.id === id);
    return c ? c.label : id;
  }

  function renderQuiz() {
    elQuiz.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E'];
    currentQuestions.forEach((q, i) => {
      const card = document.createElement('div');
      card.className = 'q-card';
      card.dataset.qi = i;
      const formulaHint = q.formula?.formulaText
        ? `<span class="q-formula-hint">${q.formula.formulaText}</span>`
        : '';
      card.innerHTML = `
        <div class="q-header">
          <span class="q-num">${i + 1}</span>
          <span class="q-cat">${catLabel(q.categoryId)}</span>${formulaHint}
        </div>
        <div class="q-text"></div>
        <div class="q-choices"></div>
        <div class="q-reveal" style="display:none"></div>
      `;
      card.querySelector('.q-text').innerHTML = colorSuits(q.question);
      const choicesEl = card.querySelector('.q-choices');
      q.choices.forEach((choice, j) => {
        const lbl = document.createElement('label');
        lbl.className = 'q-choice';
        lbl.dataset.ci = j;
        lbl.innerHTML = `<input type="radio" name="q${i}" value="${j}"> <span class="q-letter">${letters[j]}.</span> <span class="q-choice-text"></span>`;
        lbl.querySelector('.q-choice-text').innerHTML = colorSuits(choice);
        choicesEl.appendChild(lbl);
      });
      elQuiz.appendChild(card);
    });
  }

  // ── Show results ─────────────────────────────────────────────────────────
  function showResults() {
    let correct = 0;
    const perCat = {};
    const now = Date.now();

    currentQuestions.forEach((q, i) => {
      const card = elQuiz.querySelector(`.q-card[data-qi="${i}"]`);
      const checked = card.querySelector(`input[name="q${i}"]:checked`);
      const chosen = checked ? parseInt(checked.value, 10) : -1;
      const isRight = chosen === q.correctIndex;
      if (isRight) correct++;

      const cat = q.categoryId;
      if (!perCat[cat]) perCat[cat] = { right: 0, total: 0 };
      perCat[cat].total++;
      if (isRight) perCat[cat].right++;

      card.querySelectorAll('.q-choice').forEach((ch, j) => {
        ch.querySelector('input').disabled = true;
        if (j === q.correctIndex) ch.classList.add('correct');
        if (j === chosen && !isRight) ch.classList.add('wrong');
      });

      const reveal = card.querySelector('.q-reveal');
      const verdict = document.createElement('div');
      verdict.className = 'q-verdict ' + (chosen === -1 ? 'skipped' : isRight ? 'right' : 'miss');
      verdict.textContent = chosen === -1 ? 'Not answered.' : isRight ? 'Correct.' : 'Incorrect.';
      reveal.appendChild(verdict);

      const exp = document.createElement('div');
      exp.className = 'q-explanation';
      exp.innerHTML = colorSuits(q.explanation);
      reveal.appendChild(exp);

      if (q.formula && state.showFormula) renderFormula(q.formula, reveal);

      if (q.source) {
        const src = document.createElement('div');
        src.className = 'q-source';
        src.textContent = 'Source: ' + q.source;
        reveal.appendChild(src);
      }

      reveal.style.display = '';

      // Stamp rules questions only
      if (q.type === 'rules') {
        const entry = state.deck.find(e => e.id === q.id);
        if (entry) entry.lastSeen = now;
      }
    });

    saveState(state);

    elReveal.disabled = true;
    elReveal.textContent = 'Results shown ↓';
    elRevealHint.style.display = 'none';

    const total = currentQuestions.length;
    const pct = total ? Math.round(correct / total * 100) : 0;
    const breakdown = Object.keys(perCat).map(cat => {
      const r = perCat[cat];
      return `<span class="sum-cat">${catLabel(cat)}: ${r.right}/${r.total}</span>`;
    }).join('');
    elSummary.innerHTML = `
      <div class="summary">
        <div class="sum-score">${correct} / ${total} <span class="sum-pct">(${pct}%)</span></div>
        <div class="sum-breakdown">${breakdown}</div>
        <button id="again">New quiz</button>
      </div>
    `;
    document.getElementById('again').addEventListener('click', () => {
      generateQuiz();
      elQuiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Tweakable formula ────────────────────────────────────────────────────
  function renderFormula(formula, container) {
    const box = document.createElement('div');
    box.className = 'q-formula';
    box.innerHTML = '<div class="formula-title">Tweak the numbers:</div>';

    const grid = document.createElement('div');
    grid.className = 'formula-inputs';
    const numberEls = {};

    formula.inputs.forEach(inp => {
      const field = document.createElement('div');
      field.className = 'formula-field';

      const lbl = document.createElement('span');
      lbl.className = 'formula-label';
      lbl.textContent = inp.label;
      field.appendChild(lbl);

      if (inp.type === 'toggle') {
        // Segmented toggle for discrete options
        const toggle = document.createElement('div');
        toggle.className = 'formula-toggle';
        let currentVal = inp.value;
        inp.options.forEach(opt => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'formula-toggle-btn' + (opt.value === currentVal ? ' active' : '');
          btn.textContent = opt.label;
          btn.addEventListener('click', () => {
            currentVal = opt.value;
            toggle.querySelectorAll('.formula-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // expose via a hidden input so recalc can read it
            toggle._value = opt.value;
            recalc();
          });
          toggle.appendChild(btn);
        });
        toggle._value = inp.value;
        field.appendChild(toggle);
        grid.appendChild(field);
        numberEls[inp.id] = toggle;
      } else {
        const v = inp.value;
        const min = inp.min ?? 0;
        const max = inp.max ?? Math.max(v * 6, v + 200, 100);

        // Compute a step that gives ~10 snap positions across the range
        function niceStep(span, integer) {
          const raw = span / 9;
          if (integer) return Math.max(1, Math.round(raw));
          const mag = Math.pow(10, Math.floor(Math.log10(raw)));
          const candidates = [1, 2, 2.5, 5, 10].map(c => c * mag);
          return candidates.find(c => c >= raw) ?? candidates[candidates.length - 1];
        }
        const step = inp.step ?? niceStep(max - min, inp.integer);

        const row = document.createElement('div');
        row.className = 'formula-control';

        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'formula-range';
        range.min = min; range.max = max; range.step = step; range.value = v;

        const num = document.createElement('input');
        num.type = 'number';
        num.className = 'formula-number';
        num.min = min; num.step = step; num.value = v;
        if (inp.integer) num.pattern = '\\d*';

        function snapVal(raw) {
          const snapped = Math.round(raw / step) * step;
          const clamped = Math.max(min, Math.min(max, snapped));
          return inp.integer ? Math.round(clamped) : Math.round(clamped * 100) / 100;
        }
        range.addEventListener('input', () => {
          num.value = snapVal(parseFloat(range.value));
          recalc();
        });
        num.addEventListener('input', () => {
          const snapped = snapVal(parseFloat(num.value) || 0);
          num.value = snapped;
          range.value = snapped;
          recalc();
        });

        row.appendChild(range);
        row.appendChild(num);
        field.appendChild(row);
        grid.appendChild(field);
        numberEls[inp.id] = num;
      }
    });
    box.appendChild(grid);

    const exprEl = document.createElement('div');
    exprEl.className = 'formula-expr';
    exprEl.textContent = formula.formulaText;
    box.appendChild(exprEl);

    const outEl = document.createElement('div');
    outEl.className = 'formula-out';
    box.appendChild(outEl);

    function recalc() {
      const vals = {};
      Object.keys(numberEls).forEach(k => {
        const el = numberEls[k];
        vals[k] = el._value !== undefined ? el._value : (parseFloat(el.value) || 0);
      });
      const raw = formula.compute(vals);
      const formatted = (formula.decimals != null ? raw.toFixed(formula.decimals) : raw) + (formula.outputUnit || '');
      outEl.innerHTML = `<span class="out-label">${formula.outputLabel}:</span> <span class="out-value">${formatted}</span>`;
    }
    recalc();
    container.appendChild(box);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  const elSetupPanel = document.querySelector('.setup-panel');
  elSetupPanel.querySelector('h2').addEventListener('click', () => {
    elSetupPanel.classList.toggle('collapsed');
  });

  renderSetup();
  elGenerate.addEventListener('click', () => {
    generateQuiz();
    elSetupPanel.classList.add('collapsed');
  });
  elReveal.style.display = 'none';
  elReveal.addEventListener('click', showResults);
  elRevealHint.addEventListener('click', () => {
    elReveal.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  function updateHintOpacity() {
    const scrolled = window.scrollY + window.innerHeight;
    const total = document.documentElement.scrollHeight;
    const progress = scrolled / total; // 0 at top, 1 at very bottom
    // fade out from 80% scroll to 95%
    const opacity = progress < 0.80 ? 1 : Math.max(0, 1 - (progress - 0.80) / 0.15);
    elRevealHint.style.opacity = opacity;
  }
  window.addEventListener('scroll', updateHintOpacity, { passive: true });
})();
