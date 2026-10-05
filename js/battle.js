/*
 * Value battle: two, three or four colors mixed from the same palette sit as squares on a primer-
 * gray board. With two, a question asks which is darker, lighter, cooler or warmer, and three
 * buttons answer: the left one, the right one, or both the same. With more, the question is
 * answered on the swatches: tap the darkest or the lightest, tap them in order from darkest to
 * lightest. Ten rounds make a game; the score pops up the way Paint by numbers
 * scores a portrait, and the best for each palette and difficulty is kept in the browser.
 *
 * Value is lightness (L*), read on the 0-10 value scale the Study tab uses. Temperature is the hue:
 * a color leaning toward orange and yellow is warm, toward blue is cool, measured as how far the
 * hue angle sits from the warmest hue. Colors too gray to have a temperature never get a
 * temperature question, and "both the same" rounds pair colors that really are the same in what
 * is asked, so the student learns to trust the eye rather than guess.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById('vb-' + id);
  const root = document.getElementById('tab-battle');
  if (!root) return;
  const PALETTE_KEY = 'portrait-value-studio.battlePalette';
  const LEVEL_KEY = 'portrait-value-studio.battleLevel';
  const COUNT_KEY = 'portrait-value-studio.battleCount';
  const BEST_KEY = 'portrait-value-studio.battleBest';
  const MINE_KEY = 'portrait-value-studio.myPaints';
  const ROUNDS = 10;
  function load(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  // ---- Colors from the palette ------------------------------------------------------------------
  const made = new Map();
  function paintFor(code) {
    if (!made.has(code)) made.set(code, Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(code))));
    return made.get(code);
  }
  function palettes() {
    const list = Paints.PRESETS.map((p) => ({ id: p.id, name: p.name, codes: p.paints }));
    const mine = load(MINE_KEY, []).filter((c) => Paints.byCode(c));
    if (mine.length >= 2) list.push({ id: 'mine', name: `My paints (${mine.length})`, codes: mine });
    return list;
  }
  const rnd = (n) => Math.floor(Math.random() * n);
  // the warmest hue is orange; warmth runs from 1 there to -1 at blue
  const WARM_HUE = 55 * Math.PI / 180;
  function describe(rgb, lab) {
    const chroma = Math.hypot(lab[1], lab[2]);
    const hue = Math.atan2(lab[2], lab[1]);
    return { rgb, lab, L: lab[0], chroma, hue, warmth: Math.cos(hue - WARM_HUE) };
  }
  // a pool of mixes: two or three of the palette's colors with some white, in random parts
  function mixPool(codes, n) {
    const paints = codes.map(paintFor);
    const whites = paints.map((p, i) => (p.white ? i : -1)).filter((i) => i >= 0);
    const colors = paints.map((p, i) => (p.white ? -1 : i)).filter((i) => i >= 0);
    const pool = [];
    for (let k = 0; k < n && colors.length; k++) {
      const parts = paints.map(() => 0);
      const a = colors[rnd(colors.length)];
      parts[a] = 1 + rnd(4);
      if (colors.length > 1 && Math.random() < 0.8) { let b = colors[rnd(colors.length)]; if (b === a) b = colors[(colors.indexOf(a) + 1) % colors.length]; parts[b] = 1 + rnd(3); }
      if (colors.length > 2 && Math.random() < 0.3) parts[colors[rnd(colors.length)]] += 1;
      if (whites.length && Math.random() < 0.85) parts[whites[0]] = rnd(9);
      const m = Mixing.mix(paints, parts);
      if (!m) continue;
      const rgb = [m.rgb.r, m.rgb.g, m.rgb.b];
      pool.push({ ...describe(rgb, Study.rgbToLab(rgb[0], rgb[1], rgb[2])), recipe: paints.map((p, i) => (parts[i] ? `${p.code} ${parts[i]}` : '')).filter(Boolean).join(' · ') });
    }
    return pool;
  }

  // ---- Rounds --------------------------------------------------------------------------------------
  // Two colors get a left-right-same question. Three or four get one answered on the swatches
  // themselves: tap the darkest or the lightest, or tap them in order from darkest to lightest.
  // Swatches are lettered A to D so the answer can name them.
  const QUESTIONS = [
    { key: 'darker', ask: 'Which color is darker in value?', kind: 'value', mode: 'pair', pick: (d) => -d },
    { key: 'lighter', ask: 'Which color is lighter in value?', kind: 'value', mode: 'pair', pick: (d) => d },
    { key: 'cooler', ask: 'Which color is cooler in tone?', kind: 'temp', mode: 'pair', pick: (d) => -d },
    { key: 'warmer', ask: 'Which color is warmer in tone?', kind: 'temp', mode: 'pair', pick: (d) => d },
    { key: 'darkest', ask: 'Tap the color with the darkest value.', kind: 'value', mode: 'pick', dir: -1 },
    { key: 'lightest', ask: 'Tap the color with the lightest value.', kind: 'value', mode: 'pick', dir: 1 },
    { key: 'order', ask: 'Tap the colors in order, from darkest to lightest.', kind: 'value', mode: 'order' },
  ];
  const PAIR_Q = QUESTIONS.filter((q) => q.mode === 'pair'), MANY_Q = QUESTIONS.filter((q) => q.mode !== 'pair');
  // how far apart the colors are, by level: value in L*, temperature in warmth (0-2)
  const LEVELS = {
    easy: { name: 'Easy', value: [14, 40], temp: [0.6, 2], same: 0.15, gap: 12 },
    medium: { name: 'Medium', value: [6, 14], temp: [0.3, 0.7], same: 0.25, gap: 7 },
    hard: { name: 'Hard', value: [2.5, 6], temp: [0.12, 0.3], same: 0.3, gap: 3.5 },
  };
  const SAME = { value: 0.9, temp: 0.05 };      // closer than this is "the same"
  const LETTERS = ['A', 'B', 'C', 'D'];
  function measure(kind, c) { return kind === 'value' ? c.L : c.warmth; }
  // a pair of colors for the question at the level, or a "same" pair when the dice say so
  function makePair(pool, level, q) {
    const lv = LEVELS[level];
    const usable = q.kind === 'temp' ? pool.filter((c) => c.chroma >= 10) : pool;
    const wantSame = Math.random() < lv.same;
    const [lo, hi] = lv[q.kind];
    let best = null;
    for (let tries = 0; tries < 400 && !best; tries++) {
      const a = usable[rnd(usable.length)], b = usable[rnd(usable.length)];
      if (!a || !b || a === b) continue;
      const d = Math.abs(measure(q.kind, a) - measure(q.kind, b));
      // a "same" pair must still look different, so it is a real question
      const differs = q.kind === 'value' ? Math.abs(a.warmth - b.warmth) > 0.4 || Math.abs(a.chroma - b.chroma) > 12 : Math.abs(a.L - b.L) > 8;
      if (wantSame ? d < SAME[q.kind] && differs : d >= lo && d <= hi) best = [a, b];
    }
    if (!best) {
      // the palette can't make the pair asked for at this level: take the nearest it can
      const a = usable[rnd(usable.length)];
      const sorted = usable.filter((c) => c !== a).sort((x, y) => Math.abs(Math.abs(measure(q.kind, x) - measure(q.kind, a)) - (lo + hi) / 2) - Math.abs(Math.abs(measure(q.kind, y) - measure(q.kind, a)) - (lo + hi) / 2));
      best = [a, sorted[0] || a];
    }
    const colors = Math.random() < 0.5 ? best : [best[1], best[0]];
    const d = measure(q.kind, colors[1]) - measure(q.kind, colors[0]);
    const answer = Math.abs(d) < SAME[q.kind] ? 'same' : q.pick(d) > 0 ? 'right' : 'left';
    return { q, n: 2, colors, answer };
  }
  // three or four colors for a swatch question: values at least a level's gap apart where the
  // question needs them told apart
  function makeMany(pool, level, q, n) {
    const lv = LEVELS[level];
    const byL = (list) => list.slice().sort((x, y) => x.L - y.L);
    let colors = null;
    for (let tries = 0; tries < 300 && !colors; tries++) {
      const set = [];
      if (pool.length < n) break;
      while (set.length < n) { const c = pool[rnd(pool.length)]; if (!set.includes(c)) set.push(c); }
      if (q.mode === 'order') { const s = byL(set); if (s.every((c, i) => !i || c.L - s[i - 1].L >= lv.gap)) colors = set; }
      else { const s = byL(set); const edge = q.dir < 0 ? s[1].L - s[0].L : s[n - 1].L - s[n - 2].L; if (edge >= lv.gap) colors = set; }
    }
    if (!colors) {
      // the palette can't make such a set: take the n most spread colors it has
      const from = pool.slice().sort(() => Math.random() - 0.5).slice(0, 40);
      colors = byL(from).filter((c, i, arr) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);
      while (colors.length < n && pool.length) colors.push(pool[rnd(pool.length)]);
    }
    let answer;
    if (q.mode === 'pick') { const s = byL(colors); answer = colors.indexOf(q.dir < 0 ? s[0] : s[n - 1]); }
    else answer = byL(colors).map((c) => colors.indexOf(c));
    return { q, n, colors, answer };
  }
  function makeRound(pool, level, q, n) { return n === 2 ? makePair(pool, level, q) : makeMany(pool, level, q, n); }

  // ---- The game ------------------------------------------------------------------------------------
  const els = {
    setup: $('setup'), play: $('play'), palette: $('palette'), start: $('start'), best: $('best'),
    bar: $('bar'), round: $('round'), score: $('score'), quit: $('quit'), question: $('question'), swatches: $('swatches'),
    answer: $('answer'), choices: $('choices'), undo: $('undo'), next: $('next'), board: $('board'),
    popup: $('popup'), kicker: $('kicker'), pct: $('pct'), stars: $('stars'), grade: $('grade'), newBest: $('newBest'), again: $('again'), settings: $('settings'),
  };
  let game = null, countUp = 0;
  const level = () => (root.querySelector('input[name="vbLevel"]:checked') || {}).value || 'easy';
  const count = () => (root.querySelector('input[name="vbCount"]:checked') || {}).value || 'mix';
  const paletteNow = () => palettes().find((p) => p.id === els.palette.value) || palettes()[0];
  const bestKey = () => `${paletteNow().id}:${level()}:${count()}`;
  function renderSetup() {
    const list = palettes(), was = els.palette.value || load(PALETTE_KEY, 'zorn');
    els.palette.innerHTML = '';
    list.forEach((p) => els.palette.append(new Option(p.name, p.id)));
    els.palette.value = list.some((p) => p.id === was) ? was : list[0].id;
    const lv = load(LEVEL_KEY, 'easy'), ct = load(COUNT_KEY, 'mix');
    root.querySelectorAll('input[name="vbLevel"]').forEach((r) => { r.checked = r.value === lv; });
    root.querySelectorAll('input[name="vbCount"]').forEach((r) => { r.checked = r.value === ct; });
    showBest();
  }
  function showBest() {
    const best = load(BEST_KEY, {})[bestKey()];
    els.best.textContent = best == null ? 'No score yet for these settings.' : `Your best here: ${best} of ${ROUNDS}.`;
  }
  els.palette.addEventListener('change', () => { save(PALETTE_KEY, els.palette.value); showBest(); });
  root.querySelectorAll('input[name="vbLevel"]').forEach((r) => r.addEventListener('change', () => { save(LEVEL_KEY, level()); showBest(); }));
  root.querySelectorAll('input[name="vbCount"]').forEach((r) => r.addEventListener('change', () => { save(COUNT_KEY, count()); showBest(); }));

  function start() {
    const pal = paletteNow();
    const pool = mixPool(pal.codes, 220);
    // ten rounds: the colors per round as set (or a mix), the questions dealt evenly and shuffled
    const ct = count();
    const rounds = [], dealt = { pair: 0, many: 0 };
    for (let i = 0; i < ROUNDS; i++) {
      const n = ct === 'mix' ? [2, 3, 4][i % 3] : +ct;
      const qs = n === 2 ? PAIR_Q : MANY_Q, key = n === 2 ? 'pair' : 'many';
      rounds.push({ n, q: qs[dealt[key]++ % qs.length] });
    }
    for (let i = rounds.length - 1; i > 0; i--) { const j = rnd(i + 1); [rounds[i], rounds[j]] = [rounds[j], rounds[i]]; }
    game = { pool, level: level(), rounds: rounds.map((r) => makeRound(pool, level(), r.q, r.n)), i: 0, right: 0, answered: false, over: false, picked: [] };
    els.setup.hidden = true; els.play.hidden = false; els.popup.hidden = true;
    setFocus(true);
    showRound();
  }
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const vLabel = (c) => `V ${(c.L / 10).toFixed(1)}`;
  const tLabel = (c) => (c.warmth > 0.35 ? 'warm' : c.warmth < -0.35 ? 'cool' : 'in between');
  function showRound() {
    const r = game.rounds[game.i];
    game.answered = false; game.picked = [];
    els.round.textContent = `${game.i + 1} of ${ROUNDS}`;
    els.score.textContent = `${game.right} right`;
    els.question.textContent = r.q.ask;
    els.swatches.innerHTML = '';
    els.swatches.dataset.count = r.n;
    r.colors.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'vb-swatch'; b.dataset.index = i;
      b.style.background = css(c.rgb);
      b.setAttribute('aria-label', `Color ${LETTERS[i]}`);
      b.innerHTML = `<span class="vb-letter">${LETTERS[i]}</span><span class="vb-badge" hidden></span>`;
      b.addEventListener('click', () => tapSwatch(i));
      els.swatches.append(b);
    });
    els.answer.textContent = ''; els.answer.classList.remove('is-right', 'is-wrong');
    root.dataset.mode = r.q.mode;
    els.choices.querySelectorAll('.vb-choice').forEach((b) => { b.disabled = false; b.classList.remove('is-chosen'); });
    els.undo.disabled = true;
    els.next.hidden = true;
    root.classList.remove('vb-answered');
  }
  const swatch = (i) => els.swatches.querySelector(`.vb-swatch[data-index="${i}"]`);
  // a tap on a swatch: the answer itself for a pair or a pick, the next in line for an order
  function tapSwatch(i) {
    if (!game || game.answered) return;
    const r = game.rounds[game.i];
    if (r.q.mode === 'pair') { choose(i === 0 ? 'left' : 'right'); return; }
    if (r.q.mode === 'pick') { choose(i); return; }
    // order: the next in line
    if (game.picked.includes(i)) return;
    game.picked.push(i);
    const badge = swatch(i).querySelector('.vb-badge'); badge.textContent = game.picked.length; badge.hidden = false;
    els.undo.disabled = false;
    if (game.picked.length === r.n) choose(game.picked.slice());
  }
  els.undo.addEventListener('click', () => {
    if (!game || game.answered) return;
    game.picked = [];
    els.swatches.querySelectorAll('.vb-swatch').forEach((b) => { b.classList.remove('is-picked'); b.querySelector('.vb-badge').hidden = true; });
    els.undo.disabled = true;
  });
  const same = (a, b) => Array.isArray(a) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b;
  // why the answer is what it is, in a sentence the student can check against the swatches
  function explain(r) {
    const side = { left: 'The left one', right: 'The right one', same: 'Both' };
    if (r.q.mode === 'pair') {
      const [L, R] = r.colors;
      if (r.q.kind === 'value') {
        if (r.answer === 'same') return `Both are the same value: ${vLabel(L)} and ${vLabel(R)}. Different colors, equal in light and dark.`;
        const win = r.answer === 'left' ? L : R, lose = r.answer === 'left' ? R : L;
        return `${side[r.answer]} is ${r.q.key}: ${vLabel(win)} against ${vLabel(lose)}.`;
      }
      if (r.answer === 'same') return `Both lean the same way: ${tLabel(L)}. The difference is in value, not temperature.`;
      return `${side[r.answer]} is ${r.q.key}: it leans more toward ${r.q.key === 'warmer' ? 'orange and yellow' : 'blue and green'} than the other.`;
    }
    const vals = r.colors.map((c, i) => `${LETTERS[i]} ${vLabel(c)}`).join(', ');
    if (r.q.mode === 'pick') return `${LETTERS[r.answer]} is the ${r.q.key}. The values: ${vals}.`;
    return `Darkest to lightest: ${r.answer.map((i) => LETTERS[i]).join(', ')}. The values: ${vals}.`;
  }
  function choose(choice) {
    if (!game || game.answered || game.over) return;
    const r = game.rounds[game.i];
    game.answered = true;
    const right = same(choice, r.answer);
    if (right) game.right++;
    els.score.textContent = `${game.right} right`;
    els.choices.querySelectorAll('.vb-choice').forEach((b) => { b.disabled = true; b.classList.toggle('is-chosen', b.dataset.choice === choice); });
    els.undo.disabled = true;
    // the right swatches ringed in gold, a wrong pick in red
    const correct = r.q.mode === 'pair' ? (r.answer === 'same' ? [0, 1] : [r.answer === 'left' ? 0 : 1]) : r.q.mode === 'pick' ? [r.answer] : r.answer;
    correct.forEach((i) => swatch(i).classList.add('is-answer'));
    if (!right) {
      const chosen = r.q.mode === 'pair' ? (choice === 'same' ? [] : [choice === 'left' ? 0 : 1]) : r.q.mode === 'pick' ? [choice] : choice;
      chosen.forEach((i) => { if (!correct.includes(i)) swatch(i).classList.add('is-wrong'); });
      if (r.q.mode === 'order') r.answer.forEach((i, k) => { const b = swatch(i).querySelector('.vb-badge'); b.textContent = k + 1; b.hidden = false; });
    }
    els.answer.textContent = `${right ? 'Right!' : 'Not quite.'} ${explain(r)}`;
    els.answer.classList.add(right ? 'is-right' : 'is-wrong');
    root.classList.add('vb-answered');
    if (right) ding();
    if (navigator.vibrate) navigator.vibrate(right ? [18, 40, 28] : 60);
    els.next.hidden = false;
    els.next.textContent = game.i + 1 < ROUNDS ? 'Next ▸' : 'See the score';
    els.next.focus({ preventScroll: true });
  }
  els.choices.querySelectorAll('.vb-choice').forEach((b) => b.addEventListener('click', () => choose(b.dataset.choice)));
  els.next.addEventListener('click', () => {
    if (!game || !game.answered) return;
    if (game.i + 1 < ROUNDS) { game.i++; showRound(); }
    else finish();
  });
  document.addEventListener('keydown', (e) => {
    if (!game || game.over || Studio.tab() !== 'battle') return;
    const r = game.rounds[game.i];
    if (r.q.mode === 'pair') {
      if (e.key === 'ArrowLeft') choose('left');
      else if (e.key === 'ArrowRight') choose('right');
      else if (e.key === '=' || e.key === 'ArrowDown') choose('same');
    } else if (/^[1-4]$/.test(e.key) && +e.key <= r.n) tapSwatch(+e.key - 1);
    if (e.key === 'Enter' && game.answered) els.next.click();
  });

  // ---- The score, the way Paint by numbers shows one ----------------------------------------------
  const STARS = [100, 90, 70, 50, 30];
  const GRADES = ['Keep looking', 'Keep looking', 'Getting there', 'Good eye', 'Sharp eye!', 'Perfect eye!'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function finish() {
    game.over = true;
    const pct = Math.round((game.right / ROUNDS) * 100);
    const stars = STARS.filter((min) => pct >= min).length;
    const bests = load(BEST_KEY, {}), key = bestKey();
    const isBest = game.right > 0 && (bests[key] == null || game.right > bests[key]);
    if (isBest) { bests[key] = game.right; save(BEST_KEY, bests); }
    els.kicker.textContent = `${game.right} of ${ROUNDS} right`;
    els.grade.textContent = GRADES[stars];
    els.newBest.hidden = !isBest;
    els.stars.setAttribute('aria-label', `${stars} out of 5 stars, ${pct}% right`);
    els.stars.querySelectorAll('.game-star').forEach((st, i) => { st.classList.toggle('is-on', i < stars); st.style.setProperty('--i', i); });
    els.popup.hidden = false;
    els.popup.classList.remove('is-shown'); void els.popup.offsetWidth; els.popup.classList.add('is-shown');
    cancelAnimationFrame(countUp);
    if (reduceMotion.matches) els.pct.textContent = pct;
    else {
      const t0 = performance.now(), ms = 1100;
      const step = (t) => { const k = Math.min(1, (t - t0) / ms); els.pct.textContent = Math.round(pct * (1 - Math.pow(1 - k, 3))); if (k < 1) countUp = requestAnimationFrame(step); };
      countUp = requestAnimationFrame(step);
    }
    els.again.focus({ preventScroll: true });
  }
  els.again.addEventListener('click', start);
  els.settings.addEventListener('click', () => { game = null; els.popup.hidden = true; els.play.hidden = true; els.setup.hidden = false; setFocus(false); showBest(); });
  // the tabs are hidden while playing on a phone, so the bar has a way out: tap ✕ twice
  let quitArmed = 0;
  els.quit.addEventListener('click', () => {
    if (!game || game.over) { els.settings.click(); return; }
    if (performance.now() - quitArmed > 3000) { quitArmed = performance.now(); Studio.toast('Tap ✕ again to quit this battle'); return; }
    quitArmed = 0;
    els.settings.click();
  });
  function setFocus(on) { document.body.classList.toggle('battle-focus', on); if (on) window.scrollTo(0, 0); }

  // a small bell for a right answer
  let audio = null;
  function ding() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      [[1318.5, 0], [1975.5, 0.09]].forEach(([f, dt]) => {
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t + dt); gain.gain.exponentialRampToValueAtTime(0.12, t + dt + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5);
        osc.connect(gain).connect(audio.destination); osc.start(t + dt); osc.stop(t + dt + 0.55);
      });
    } catch (e) { audio = null; }
  }

  els.start.addEventListener('click', start);
  window.addEventListener('studio:tab', (e) => {
    const on = e.detail === 'battle';
    setFocus(on && !!game && !game.over);
    if (on && !game) renderSetup();
  });
  if (Studio.tab() === 'battle') renderSetup();
  window.ValueBattle = { makeRound, mixPool, LEVELS, QUESTIONS, LETTERS, state: () => game };
})();
