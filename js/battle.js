/*
 * Value battle: two colors mixed from the same palette sit as circles on a primer-gray board, and a
 * question asks which is darker, lighter, cooler or warmer. Three buttons answer: the left one, the
 * right one, or both the same. Ten rounds make a game; the score pops up the way Paint by numbers
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
  const QUESTIONS = [
    { key: 'darker', ask: 'Which color is darker in value?', kind: 'value', pick: (d) => -d },
    { key: 'lighter', ask: 'Which color is lighter in value?', kind: 'value', pick: (d) => d },
    { key: 'cooler', ask: 'Which color is cooler in tone?', kind: 'temp', pick: (d) => -d },
    { key: 'warmer', ask: 'Which color is warmer in tone?', kind: 'temp', pick: (d) => d },
  ];
  // how far apart the two colors are, by level: value in L*, temperature in warmth (0-2)
  const LEVELS = {
    easy: { name: 'Easy', value: [14, 40], temp: [0.6, 2], same: 0.15 },
    medium: { name: 'Medium', value: [6, 14], temp: [0.3, 0.7], same: 0.25 },
    hard: { name: 'Hard', value: [2.5, 6], temp: [0.12, 0.3], same: 0.3 },
  };
  const SAME = { value: 0.9, temp: 0.05 };      // closer than this is "the same"
  function measure(kind, c) { return kind === 'value' ? c.L : c.warmth; }
  // a pair of colors for the question at the level, or a "same" pair when the dice say so
  function makeRound(pool, level, q) {
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
    const [left, right] = Math.random() < 0.5 ? best : [best[1], best[0]];
    const d = measure(q.kind, right) - measure(q.kind, left);
    const answer = Math.abs(d) < SAME[q.kind] ? 'same' : q.pick(d) > 0 ? 'right' : 'left';
    return { q, left, right, answer };
  }

  // ---- The game ------------------------------------------------------------------------------------
  const els = {
    setup: $('setup'), play: $('play'), palette: $('palette'), start: $('start'), best: $('best'),
    bar: $('bar'), round: $('round'), score: $('score'), quit: $('quit'), question: $('question'), left: $('left'), right: $('right'),
    answer: $('answer'), choices: $('choices'), next: $('next'), board: $('board'),
    popup: $('popup'), kicker: $('kicker'), pct: $('pct'), stars: $('stars'), grade: $('grade'), newBest: $('newBest'), again: $('again'), settings: $('settings'),
  };
  let game = null, countUp = 0;
  const level = () => (root.querySelector('input[name="vbLevel"]:checked') || {}).value || 'easy';
  const paletteNow = () => palettes().find((p) => p.id === els.palette.value) || palettes()[0];
  const bestKey = () => `${paletteNow().id}:${level()}`;
  function renderSetup() {
    const list = palettes(), was = els.palette.value || load(PALETTE_KEY, 'zorn');
    els.palette.innerHTML = '';
    list.forEach((p) => els.palette.append(new Option(p.name, p.id)));
    els.palette.value = list.some((p) => p.id === was) ? was : list[0].id;
    const lv = load(LEVEL_KEY, 'easy');
    root.querySelectorAll('input[name="vbLevel"]').forEach((r) => { r.checked = r.value === lv; });
    showBest();
  }
  function showBest() {
    const best = load(BEST_KEY, {})[bestKey()];
    els.best.textContent = best == null ? 'No score yet for this palette and level.' : `Your best here: ${best} of ${ROUNDS}.`;
  }
  els.palette.addEventListener('change', () => { save(PALETTE_KEY, els.palette.value); showBest(); });
  root.querySelectorAll('input[name="vbLevel"]').forEach((r) => r.addEventListener('change', () => { save(LEVEL_KEY, level()); showBest(); }));

  function start() {
    const pal = paletteNow();
    const pool = mixPool(pal.codes, 220);
    // ten rounds, the four questions dealt evenly in a shuffled order
    const order = [];
    for (let i = 0; i < ROUNDS; i++) order.push(QUESTIONS[i % QUESTIONS.length]);
    for (let i = order.length - 1; i > 0; i--) { const j = rnd(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    game = { pool, level: level(), rounds: order.map((q) => makeRound(pool, level(), q)), i: 0, right: 0, answered: false, over: false };
    els.setup.hidden = true; els.play.hidden = false; els.popup.hidden = true;
    setFocus(true);
    showRound();
  }
  function showRound() {
    const r = game.rounds[game.i];
    game.answered = false;
    els.round.textContent = `${game.i + 1} of ${ROUNDS}`;
    els.score.textContent = `${game.right} right`;
    els.question.textContent = r.q.ask;
    els.left.style.background = css(r.left.rgb); els.right.style.background = css(r.right.rgb);
    [els.left, els.right].forEach((c) => c.classList.remove('is-right', 'is-wrong', 'is-answer'));
    els.answer.textContent = ''; els.answer.classList.remove('is-right', 'is-wrong');
    els.choices.querySelectorAll('button').forEach((b) => { b.disabled = false; b.classList.remove('is-chosen'); });
    els.next.hidden = true;
    root.classList.remove('vb-answered');
  }
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const vLabel = (c) => `V ${(c.L / 10).toFixed(1)}`;
  const tLabel = (c) => (c.warmth > 0.35 ? 'warm' : c.warmth < -0.35 ? 'cool' : 'in between');
  // why the answer is what it is, in a sentence the student can check against the circles
  function explain(r) {
    const side = { left: 'The left one', right: 'The right one', same: 'Both' };
    if (r.q.kind === 'value') {
      if (r.answer === 'same') return `Both are the same value: ${vLabel(r.left)} and ${vLabel(r.right)}. Different colors, equal in light and dark.`;
      const win = r.answer === 'left' ? r.left : r.right, lose = r.answer === 'left' ? r.right : r.left;
      return `${side[r.answer]} is ${r.q.key}: ${vLabel(win)} against ${vLabel(lose)}.`;
    }
    if (r.answer === 'same') return `Both lean the same way: ${tLabel(r.left)}. The difference is in value, not temperature.`;
    return `${side[r.answer]} is ${r.q.key}: it leans more toward ${r.q.key === 'warmer' ? 'orange and yellow' : 'blue and green'} than the other.`;
  }
  function choose(choice) {
    if (!game || game.answered || game.over) return;
    const r = game.rounds[game.i];
    game.answered = true;
    const right = choice === r.answer;
    if (right) game.right++;
    els.score.textContent = `${game.right} right`;
    els.choices.querySelectorAll('button').forEach((b) => { b.disabled = true; b.classList.toggle('is-chosen', b.dataset.choice === choice); });
    if (r.answer !== 'same') (r.answer === 'left' ? els.left : els.right).classList.add('is-answer');
    else [els.left, els.right].forEach((c) => c.classList.add('is-answer'));
    if (!right && choice !== 'same') (choice === 'left' ? els.left : els.right).classList.add('is-wrong');
    els.answer.textContent = `${right ? 'Right!' : 'Not quite.'} ${explain(r)}`;
    els.answer.classList.add(right ? 'is-right' : 'is-wrong');
    root.classList.add('vb-answered');
    if (right) ding();
    if (navigator.vibrate) navigator.vibrate(right ? [18, 40, 28] : 60);
    els.next.hidden = false;
    els.next.textContent = game.i + 1 < ROUNDS ? 'Next ▸' : 'See the score';
    els.next.focus({ preventScroll: true });
  }
  els.choices.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => choose(b.dataset.choice)));
  els.next.addEventListener('click', () => {
    if (!game || !game.answered) return;
    if (game.i + 1 < ROUNDS) { game.i++; showRound(); }
    else finish();
  });
  document.addEventListener('keydown', (e) => {
    if (!game || game.over || Studio.tab() !== 'battle') return;
    if (e.key === 'ArrowLeft') choose('left');
    else if (e.key === 'ArrowRight') choose('right');
    else if (e.key === '=' || e.key === 'ArrowDown') choose('same');
    else if (e.key === 'Enter' && game.answered) els.next.click();
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
  window.ValueBattle = { makeRound, mixPool, LEVELS, QUESTIONS, state: () => game };
})();
