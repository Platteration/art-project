/*
 * Paint by numbers: a timed game on the color-block study.
 *
 * The study's color groups become numbers, darkest first, outlined in black. The player picks a
 * number and taps paints to mix its color, one part per tap; the mix is predicted with the same
 * pigment model as the palette planner (Mixing.mix), and every shape with that number takes it.
 * Each number's target is the study's color as the chosen palette can mix it: the closest recipe the
 * pigment model finds, in amounts the player can tap, so every color can be matched exactly. The
 * game suggests the palette that mixes the portrait's colors best. Locking in the portrait, or
 * running out of time, scores each number against its target with CIEDE2000, weighted by area,
 * plus a time bonus that grows with accuracy. Modes change how it is played: no clock, a reference
 * that hides after a look, a greyscale value stage before the color, or a palette dealt at random.
 */
(function () {
  'use strict';

  // the modules this one needs; if app.js did not finish loading, this tab stays out and the page says so
  if (!window.Study || !window.Mixing || !window.Paints || !window.Studio) {
    if (window.StudioGuard) StudioGuard.failed('game.js: app.js did not finish loading', 'game');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const els = {
    setup: $('gameSetup'), play: $('gamePlay'), result: $('gameResult'),
    palette: $('gamePalette'), paletteDots: $('gamePaletteDots'), paletteHint: $('gamePaletteHint'),
    start: $('gameStart'), best: $('gameBest'),
    preview: $('gamePreview'), previewNote: $('gamePreviewNote'),
    timer: $('gameTimer'), progress: $('gameProgress'), lock: $('gameLock'),
    canvas: $('gameCanvas'), ref: $('gameRef'), refFig: $('gameRefFig'), refToggle: $('gameRefToggle'),
    numbers: $('gameNumbers'),
    mixChip: $('gameMixChip'), mixTitle: $('gameMixTitle'), mixParts: $('gameMixParts'),
    undo: $('gameUndo'), clear: $('gameClear'), paints: $('gamePaints'),
    copy: $('gameCopy'), copyBar: $('gameCopyBar'), copyText: $('gameCopyText'), copyDone: $('gameCopyDone'),
    amount: $('gameAmount'), amountOut: $('gameAmountOut'), board: document.querySelector('.game-board'),
    sound: $('gameSound'), quit: $('gameQuit'), quickUndo: $('gameQuickUndo'),
    paintScroll: $('gamePaintScroll'),
    grade: $('gameGrade'), points: $('gamePoints'), breakdown: $('gameBreakdown'),
    final: $('gameFinal'), popup: $('gamePopup'), popupClose: $('gamePopupClose'), showScore: $('gameShowScore'),
    kicker: $('gameKicker'), pct: $('gamePct'), stars: $('gameStars'), newBest: $('gameNewBest'),
    analyze: $('gameAnalyze'), analysis: $('gameAnalysis'),
    yours: $('gameYours'), target: $('gameTarget'), photo: $('gamePhoto'), zones: $('gameZones'),
    mode: $('gameMode'), modeAbout: $('gameModeAbout'), deal: $('gameDeal'),
    value: $('gameValue'), valueRange: $('gameValueRange'), valueTitle: $('gameValueTitle'), valueText: $('gameValueText'),
    valueChip: $('gameValueChip'), valueClear: $('gameValueClear'),
    spot: $('gameSpot'),
    finalWrap: $('gameFinalWrap'), finalTarget: $('gameFinalTarget'), handle: $('gameFinalHandle'),
    showBar: $('gameShowBar'), compare: $('gameCompare'),
    photoPane: $('gameFromPhotoPane'), photoName: $('gamePhotoName'),
    paintingPane: $('gameFromPaintingPane'), paintingName: $('gamePaintingName'), reroll: $('gameReroll'),
  };

  const LEVELS = {
    easy: { colors: 2, seconds: 180, merge: 7 },
    medium: { colors: 3, seconds: 300, merge: 6 },
    hard: { colors: 4, seconds: 480, merge: 5 },
  };
  // How a game is played; the mode is chosen in the setup
  const MODES = {
    classic: { name: 'Classic', about: 'Beat the clock: mix every number to match the reference, then lock in.' },
    relaxed: { name: 'Relaxed', about: 'No clock and no time bonus. Take as long as you like; a stopwatch just counts up.' },
    memory: { name: 'Memory', about: 'The reference shows for 10 seconds, then hides. Paint from memory. A peek at it costs 10 seconds on the clock.' },
    value: { name: 'Value first', about: 'First set each number\u2019s value, light to dark, in greys. Then add the color over your underpainting. The value study scores too.' },
    mystery: { name: 'Mystery palette', about: 'Paint with white and three paints dealt at random. The colors to match are mixed from them, so every one can be reached.' },
  };
  const LOOK_SECONDS = 10;     // memory mode: how long the reference shows before it hides
  const PEEK_SECONDS = 3;      // ...how long a peek shows it
  const PEEK_COST = 10;        // ...and what a peek costs on the clock
  const MAX_PEEKS = 3;
  const SPOT = 95;             // a number this well matched (percent) earns the "Spot on!" chime
  const SIZE = 700;            // a generated painting's board's long side, in pixels
  const PAPER = [245, 240, 230];
  const EDGE = [27, 30, 26];
  const FLASH = [217, 164, 65];    // the gold a number's shapes flash when you are sent to them
  const MAX_PARTS = 60;        // per number
  const AMOUNTS = [0.25, 0.5, 1, 2, 4]; // parts added per tap, chosen with the slider
  const AMOUNT_KEY = 'portrait-value-studio.gameAmount';
  const SOUND_KEY = 'portrait-value-studio.gameSound';
  const BONUS = 200;           // most points the time can add
  const BEST_KEY = 'portrait-value-studio.gameBest';
  const MINE_KEY = 'portrait-value-studio.myPaints';
  const LEVEL_KEY = 'portrait-value-studio.gameLevel';
  const PALETTE_KEY = 'portrait-value-studio.gamePalette';
  const SUBJECT_KEY = 'portrait-value-studio.gameSubject';
  const LAST_PAINTING_KEY = 'portrait-value-studio.gamePainting';
  const REF_VIEW_KEY = 'portrait-value-studio.gameRefView';
  const MODE_KEY = 'portrait-value-studio.gameMode';

  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      if (v == null) return fallback;
      // a saved value of another shape than the default (a bad write, an older version) is ignored
      if (Array.isArray(fallback) !== Array.isArray(v) || typeof fallback !== typeof v) return fallback;
      return v;
    } catch (err) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable: kept for this visit */ }
  }
  // best scores are kept for the newest fifty boards only (keys name the photo), so the list never grows for good
  function pruneBests(bests) { const keys = Object.keys(bests); if (keys.length > 50) keys.slice(0, keys.length - 50).forEach((k) => { delete bests[k]; }); }

  const toHex = (c) => Studio.toHex({ r: c[0], g: c[1], b: c[2] });
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const deltaE = (p, q) => Study.deltaE2000(p[0], p[1], p[2], q[0], q[1], q[2]);
  const matchOf = (dE) => Math.max(0, 100 - 2.5 * dE);
  const lightness = (c) => Study.lightnessOf(c[0], c[1], c[2]);

  // ---- Palettes -------------------------------------------------------------

  function paletteChoices() {
    const mine = load(MINE_KEY, []).filter((c) => Paints.byCode(c));
    const list = Paints.PRESETS.map((p) => ({ id: p.id, name: p.name, codes: p.paints }));
    if (mine.length >= 2) list.push({ id: 'mine', name: `My paints (${mine.length})`, codes: mine });
    return list;
  }

  const made = new Map();
  function paintFor(code) {
    if (!made.has(code)) made.set(code, Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(code))));
    return made.get(code);
  }

  // ---- The board ------------------------------------------------------------

  /*
   * Builds a board from the reference: its color-block study with the level's colors per value,
   * the numbers darkest first, the outline pixels and where each shape's number goes. A photo is
   * simplified exactly as the Study tab simplifies it (same working size, splits, simplify,
   * smoothing and merge), so the board has the shapes of the color-block study. A generated
   * painting is already flat planes: it gets no blur, so their straight edges stay, only specks
   * merge away, and its value splits are worked out for it, as Auto does for a photo.
   */
  function buildBoard(levelId) {
    const level = LEVELS[levelId];
    const painting = subject.kind === 'painting';
    const prep = painting ? Study.prepare(subjectSource(), SIZE) : Studio.prep();
    const opts = Studio.settings(prep);
    const { w, h } = prep;
    opts.colorsPerZone = level.colors;
    opts.outlines = false;
    if (painting) {
      opts.lighter = 0;                 // flat planes: nothing to lean toward
      opts.blurRadius = 0;
      opts.minSize = Math.round(w * h * 0.004 * Math.pow(level.merge / 10, 2));
      [opts.t1, opts.t2] = Study.autoThresholds(prep, opts.blurRadius, opts.smoothing);
    }
    const res = Study.process(prep, opts);

    const groups = res.blockColors
      .map((c) => ({ label: c.label, rgb: [c.r, c.g, c.b], share: c.share }))
      .sort((a, b) => lightness(a.rgb) - lightness(b.rgb));
    groups.forEach((g, i) => {
      g.number = i + 1;
      g.lab = Study.rgbToLab(g.rgb[0], g.rgb[1], g.rgb[2]);
    });
    const numberOf = new Int16Array(3 * res.K).fill(-1);
    groups.forEach((g, i) => { numberOf[g.label] = i; });
    const cell = new Int16Array(w * h);
    for (let i = 0; i < w * h; i++) cell[i] = numberOf[res.block[i]];

    // outline pixels: a neighbour within one pixel belongs to another number
    const edge = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, v = cell[i];
        if ((x + 1 < w && cell[i + 1] !== v) || (y + 1 < h && cell[i + w] !== v)) {
          edge[i] = 1;
          if (x + 1 < w) edge[i + 1] = 1;
          if (y + 1 < h) edge[i + w] = 1;
        }
      }
    }

    return { level: levelId, w, h, prep, res, groups, cell, edge, labels: placeNumbers(cell, edge, w, h, groups.length) };
  }

  /*
   * Where to write each shape's number: the point deepest inside it (two-pass chamfer distance
   * from the outlines and the picture's edge). Shapes too thin for a number go without, except
   * that every number is written at least once, in its biggest shape.
   */
  function placeNumbers(cell, edge, w, h, count) {
    const n = w * h;
    const dist = new Float32Array(n);
    const BIG = 1e6;
    for (let i = 0; i < n; i++) dist[i] = edge[i] ? 0 : BIG;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { dist[i] = Math.min(dist[i], 1); continue; }
        dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - w] + 1, dist[i - w - 1] + 1.414, dist[i - w + 1] + 1.414);
      }
    }
    for (let y = h - 2; y > 0; y--) {
      for (let x = w - 2; x > 0; x--) {
        const i = y * w + x;
        dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + w] + 1, dist[i + w + 1] + 1.414, dist[i + w - 1] + 1.414);
      }
    }
    // connected shapes, each with its deepest point
    const comp = new Int32Array(n).fill(-1);
    const shapes = [];
    const stack = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const v = cell[s], id = shapes.length;
      const shape = { number: v, area: 0, best: s, depth: dist[s] };
      let sp = 0;
      stack[sp++] = s;
      comp[s] = id;
      while (sp) {
        const p = stack[--sp];
        shape.area++;
        if (dist[p] > shape.depth) { shape.depth = dist[p]; shape.best = p; }
        const x = p % w;
        if (x > 0 && comp[p - 1] < 0 && cell[p - 1] === v) { comp[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && comp[p + 1] < 0 && cell[p + 1] === v) { comp[p + 1] = id; stack[sp++] = p + 1; }
        if (p >= w && comp[p - w] < 0 && cell[p - w] === v) { comp[p - w] = id; stack[sp++] = p - w; }
        if (p < n - w && comp[p + w] < 0 && cell[p + w] === v) { comp[p + w] = id; stack[sp++] = p + w; }
      }
      shapes.push(shape);
    }
    const minDepth = Math.max(5, Math.max(w, h) / 90);
    const labels = [];
    const written = new Set();
    shapes.filter((s) => s.depth >= minDepth).forEach((s) => { labels.push(s); written.add(s.number); });
    for (let k = 0; k < count; k++) {
      if (written.has(k)) continue;
      const biggest = shapes.filter((s) => s.number === k).sort((a, b) => b.depth - a.depth || b.area - a.area)[0];
      if (biggest) labels.push(biggest);
    }
    return labels.map((s) => ({ number: s.number, x: s.best % w, y: Math.floor(s.best / w), depth: s.depth }));
  }

  /*
   * Paints the board: each number in its mix (or bare paper), black outlines, the chosen number's
   * outline in earth red over a light wash, and the numbers.
   */
  function drawBoard(canvas, board, fills, opts) {
    const { w, h, cell, edge } = board;
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    const sel = opts.selected;
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const v = cell[i];
      let c = v === opts.flash ? FLASH : fills[v] || PAPER;
      if (edge[i] && opts.edges !== false) {
        c = v === sel || (sel >= 0 && neighbourIs(cell, i, w, h, sel)) ? [164, 71, 47] : EDGE;
      } else if (v === sel && !fills[v] && v !== opts.flash) {
        c = [226, 234, 216];
      }
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (!opts.numbers) return;
    const long = Math.max(w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    board.labels.forEach((l) => {
      const size = Math.max(10, Math.min(l.depth * 1.15, long / 22));
      g.font = `600 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
      const fill = fills[l.number];
      const dark = fill ? lightness(fill) < 55 : false;
      g.lineWidth = Math.max(2, size / 5);
      g.strokeStyle = dark ? 'rgba(20, 24, 20, 0.7)' : 'rgba(250, 246, 238, 0.9)';
      g.fillStyle = dark ? '#faf5ea' : l.number === sel ? '#a4472f' : '#1e2b22';
      const t = String(l.number + 1);
      g.strokeText(t, l.x, l.y);
      g.fillText(t, l.x, l.y);
    });
  }

  function neighbourIs(cell, i, w, h, v) {
    const x = i % w;
    return (x > 0 && cell[i - 1] === v) || (x < w - 1 && cell[i + 1] === v) || (i >= w && cell[i - w] === v) || (i < w * h - w && cell[i + w] === v);
  }

  // ---- Setup ----------------------------------------------------------------

  let board = null;      // the board being set up or played
  let game = null;       // the game in progress or just scored
  let setupFor = null;   // { from, level } the setup board was built for

  const level = () => (document.querySelector('input[name="gameLevel"]:checked') || {}).value || 'medium';
  const mode = () => els.mode.value;
  // bests are kept per mode; Classic's keys stay as they were
  const bestKey = () => `${subject.kind === 'painting' ? 'painting:' + subject.id : Studio.sourceKey()}|${level()}|${mode() === 'mystery' ? 'mystery' : els.palette.value}${mode() === 'classic' ? '' : '|' + mode()}`;

  // ---- What to paint: the player's photo or a generated painting, dealt at random ----

  // a brand-new portrait, drawn from a random painter and seed (never the one just played)
  const deal = () => Subjects.random(subject && subject.id || load(LAST_PAINTING_KEY, null));
  let subject = null;
  subject = load(SUBJECT_KEY, { kind: 'photo' }).kind === 'painting' ? { kind: 'painting', id: deal() } : { kind: 'photo' };
  if (subject.id) save(LAST_PAINTING_KEY, subject.id);

  const subjectSource = () => (subject.kind === 'painting' ? Subjects.picture(subject.id) : Studio.source());
  // the board is rebuilt when this changes: the photo's study (photo or settings), or the painting
  const subjectStamp = () => (subject.kind === 'painting' ? subject.id : Studio.result());

  function showSubject() {
    const painting = subject.kind === 'painting';
    document.querySelector(`input[name="gameSubject"][value="${painting ? 'painting' : 'photo'}"]`).checked = true;
    els.photoPane.hidden = painting;
    els.paintingPane.hidden = !painting;
    const key = Studio.source() ? Studio.sourceKey() : '';
    els.photoName.textContent = !key ? 'Load a photo to paint from it.'
      : key.startsWith('sample-study:') ? 'Painting from the sample portrait. Load your own photo to paint from it.'
      : `Painting from ${key.replace(/:\d+x\d+$/, '')}.`;
    if (painting) els.paintingName.textContent = `You've been dealt a portrait after ${Subjects.painterOf(subject.id)}.`;
  }

  function setSubject(next, refresh = true) {
    subject = next;
    save(SUBJECT_KEY, { kind: subject.kind });
    if (subject.kind === 'painting') save(LAST_PAINTING_KEY, subject.id);
    showSubject();
    if (refresh) refreshSetup();
  }

  // The board's colors as the study has them, for the palette planner
  const studyColors = (b) => b.groups.map((g) => ({ rgb: { r: g.rgb[0], g: g.rgb[1], b: g.rgb[2] }, weight: g.share }));

  /*
   * The palette that mixes this board's colors best: the highest area-weighted match, and of
   * palettes within a point of it, the one with fewest paints. Worked out once per board.
   */
  function suggestedPalette(b) {
    if (!b.suggested) {
      const colors = studyColors(b);
      const rated = paletteChoices().map((p) => ({ p, cov: Mixing.coverage(p.codes.map(paintFor), colors) }));
      const top = Math.max(...rated.map((r) => r.cov.match));
      const pick = rated.filter((r) => r.cov.match >= top - 1).sort((a, c) => a.p.codes.length - c.p.codes.length || c.cov.match - a.cov.match)[0];
      b.suggested = { id: pick.p.id, cov: pick.cov };
    }
    return b.suggested;
  }

  // A new board selects its suggested palette; otherwise the palette chosen stays
  let paletteFor = null;
  function renderPalettes() {
    const keep = els.palette.value || load(PALETTE_KEY, 'zorn');
    const choices = paletteChoices();
    const sug = board ? suggestedPalette(board).id : null;
    els.palette.replaceChildren();
    choices.forEach((p) => els.palette.append(new Option(p.id === sug ? `${p.name} (suggested)` : p.name, p.id)));
    const fresh = board && paletteFor !== board;
    paletteFor = board;
    els.palette.value = fresh && sug ? sug : choices.some((p) => p.id === keep) ? keep : 'zorn';
    showPalette();
  }

  /*
   * Each number's target with this palette: the closest recipe the pigment model finds for the
   * study's color, its amounts rounded to quarter parts (what the taps can add), and the color
   * that recipe makes. Kept per board and palette. Worked out a few numbers per frame; resolves
   * to the targets, or to null if the board or palette changed first.
   */
  function targetsFor(b, p) {
    b.targets = b.targets || {};
    b.mixing = b.mixing || {};
    if (b.targets[p.id]) return Promise.resolve(b.targets[p.id]);
    if (b.mixing[p.id]) return b.mixing[p.id];
    const paints = p.codes.map(paintFor);
    const out = [];
    let k = 0, task = null;
    const done = (v) => { delete b.mixing[p.id]; return v; };
    return (b.mixing[p.id] = new Promise((resolve) => {
      next();
      function next() {
        if (board !== b || chosenPalette().id !== p.id) { resolve(null); return; }
        try { step(); } catch (err) { // a mixing error ends this palette's targets as "none", never a Start button stuck off
          delete b.mixing[p.id];
          if (window.StudioGuard) StudioGuard.report(err);
          resolve(null);
        }
      }
      function step() {
        const end = performance.now() + 24;
        while (k < b.groups.length && performance.now() < end) {
          const g = b.groups[k];
          if (!task) task = Mixing.recipeTask({ r: g.rgb[0], g: g.rgb[1], b: g.rgb[2] }, paints);
          if (!task.step(Math.max(1, end - performance.now()))) break;
          const counts = paints.map(() => 0);
          task.result.items.forEach((it) => { counts[it.paint] += Math.max(0.25, Math.round(it.parts * 4) / 4); });
          const m = Mixing.mix(paints, counts);
          out.push({ rgb: [m.rgb.r, m.rgb.g, m.rgb.b], lab: m.lab, counts, studyMiss: deltaE(m.lab, g.lab) });
          task = null;
          k++;
        }
        if (k < b.groups.length) {
          els.paletteHint.textContent = `Mixing the reference from these paints: ${k} of ${b.groups.length} colors…`;
          requestAnimationFrame(next);
          return;
        }
        b.targets[p.id] = out;
        resolve(out);
      }
    }).then(done));
  }

  // Mystery palette: white and three paints dealt at random, redealt for each new portrait. Of a
  // few random hands, the first that mixes the portrait's colors well enough is kept (else the best).
  let mystery = null;
  function dealMystery() {
    if (!board) return;
    const colors = studyColors(board);
    const pool = Paints.LIBRARY.filter((p) => p.category !== 'white');
    let best = null;
    for (let i = 0; i < 24; i++) {
      const picks = [];
      while (picks.length < 3) {
        const c = pool[Math.floor(Math.random() * pool.length)].code;
        if (!picks.includes(c)) picks.push(c);
      }
      const codes = ['TW', ...picks];
      const match = Mixing.coverage(codes.map(paintFor), colors).match;
      if (!best || match > best.match) best = { codes, match };
      if (match >= 82) break;
    }
    mystery = { id: `mystery-${best.codes.join('-')}`, name: 'Mystery palette', codes: best.codes };
  }

  function chosenPalette() {
    if (mode() === 'mystery' && mystery) return mystery;
    return paletteChoices().find((p) => p.id === els.palette.value) || paletteChoices()[0];
  }

  // What the chosen mode changes in the setup
  function showMode() {
    const m = mode();
    els.modeAbout.textContent = MODES[m].about;
    els.palette.hidden = m === 'mystery';
    els.deal.hidden = m !== 'mystery';
    document.querySelectorAll('#tab-game .game-levels label').forEach((l) => {
      const lv = LEVELS[l.getAttribute('for').replace('game', '').toLowerCase()];
      l.querySelector('small').textContent = `Up to ${lv.colors * 3} colors · ${m === 'relaxed' ? 'no clock' : lv.seconds / 60 + ' min'}`;
    });
    if (board) notePreview();
  }
  function notePreview() {
    const m = mode(), lv = LEVELS[level()];
    els.previewNote.textContent = `${board.groups.length} numbers to mix, `
      + (m === 'relaxed' ? 'no time limit.' : `${fmtTime(lv.seconds)} on the clock${m === 'memory' ? `, after a ${LOOK_SECONDS}-second look.` : '.'}`)
      + (m === 'value' ? ' Values first, then color.' : '');
  }

  function showPalette() {
    const p = chosenPalette();
    els.paletteDots.replaceChildren();
    p.codes.forEach((c) => {
      const d = document.createElement('span');
      d.className = 'paint-dot';
      d.style.setProperty('--c', Paints.byCode(c).hex);
      d.title = Paints.byCode(c).name;
      els.paletteDots.append(d);
    });
    if (board) {
      const b = board, sug = suggestedPalette(b);
      const sugName = (paletteChoices().find((x) => x.id === sug.id) || {}).name;
      const lead = mode() === 'mystery' ? 'Dealt at random: white and three paints.' : p.id === sug.id ? 'Suggested for this portrait.' : `Suggested for this portrait: ${sugName}.`;
      const say = (t) => {
        const close = t.filter((x) => x.studyMiss < Mixing.NEAR).length;
        els.paletteHint.textContent = `${lead} ${p.codes.length} paints, which mix ${close} of its ${t.length} colors closely. The reference is mixed from them, so every number can be matched exactly.`;
      };
      const ready = b.targets && b.targets[p.id];
      els.start.disabled = !ready;
      if (ready) say(ready);
      else {
        targetsFor(b, p).then((t) => {
          if (!t || board !== b || chosenPalette().id !== p.id) return;
          els.start.disabled = false;
          say(t);
        });
      }
    }
    const best = load(BEST_KEY, {})[bestKey()];
    els.best.textContent = best ? `Your best on this portrait at this level in ${MODES[mode()].name} mode: ${best} points` : '';
  }

  function refreshSetup() {
    showSubject();
    if (subject.kind === 'photo' && (!Studio.source() || !Studio.result())) return;
    // a new board whenever the reference (photo, its settings, or the painting) or the level changes
    if (board && setupFor && setupFor.from === subjectStamp() && setupFor.level === level()) { showPalette(); return; }
    setupFor = { from: subjectStamp(), level: level() };
    board = buildBoard(level());
    if (mode() === 'mystery') dealMystery();
    drawBoard(els.preview, board, [], { selected: -1, numbers: true });
    notePreview();
    renderPalettes();
  }

  // ---- Playing --------------------------------------------------------------

  let timer = 0;

  async function startGame() {
    refreshSetup();
    const p = chosenPalette();
    const targets = await targetsFor(board, p);
    if (!targets) return; // the board or palette changed while it was being mixed
    save(PALETTE_KEY, p.id);
    save(LEVEL_KEY, level());
    const m = mode();
    const now = performance.now();
    const painting = subject.kind === 'painting' && Subjects.entry(subject.id);
    game = {
      board,
      targets,                                // per number: { rgb, lab, counts } the palette can mix
      mode: m,
      timed: m !== 'relaxed',
      phase: m === 'memory' ? 'look' : m === 'value' ? 'values' : 'play',  // look (memory), values (value first), play
      began: now,
      lookEnds: now + LOOK_SECONDS * 1000,
      peeksLeft: MAX_PEEKS,
      peeking: false,
      values: board.groups.map(() => null),  // value first: each number's chosen L*
      under: [],                              // ...and its grey, shown under the color until it is mixed
      spot: [],                               // numbers whose mix is currently spot on
      pulse: -1,                              // a number whose shapes are flashing
      subjectLabel: painting ? `${painting.title}, after ${Subjects.painterOf(painting.id)}` : 'My photo',
      levelName: level(),
      palette: p,
      paints: p.codes.map(paintFor),
      parts: board.groups.map(() => []),     // { paint, amount } in the order they were added
      fills: [],                              // rgb per number, from the mix
      labs: [],
      selected: 0,
      copyFrom: null,                         // the number whose mix is being copied
      seconds: LEVELS[board.level].seconds,
      ends: m === 'memory' || m === 'relaxed' ? Infinity : now + LEVELS[board.level].seconds * 1000,
      over: false,
      bestKey: bestKey(),
    };
    els.setup.hidden = true;
    els.result.hidden = true;
    els.play.hidden = false;
    unlockAudio(); // the Start button is a tap, which lets the page make sound from now on
    setFocus(true);
    endCopy();
    drawRef(els.ref, refView);
    renderPaints();
    renderNumbers();
    els.paints.scrollLeft = 0;
    requestAnimationFrame(syncPaintScroll);
    els.refFig.classList.remove('is-collapsed');
    applyPhase();
    select(0);
    tick();
    clearInterval(timer);
    timer = setInterval(tick, 250);
    els.lock.focus();
  }

  // The reference: the photo itself, or its color-block study (the colors each number is scored against)
  function drawRef(canvas, view = 'photo') {
    if (view === 'blocks') {
      // the value stage is about the reference's own values; the color stage's targets are what the palette mixes
      const cols = game.phase === 'values' ? game.board.groups.map((g) => g.rgb) : game.targets.map((t) => t.rgb);
      drawBoard(canvas, game.board, cols, { selected: -1, numbers: false, edges: false });
      return;
    }
    const { w, h, rgba } = game.board.prep;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  }

  function timeLeft() {
    return game.timed ? Math.max(0, (game.ends - performance.now()) / 1000) : 0;
  }

  /*
   * The game's phases: Memory starts with a look at the reference (the clock waits), Value first
   * starts with the greyscale value stage, and every game ends in the color stage ("play").
   * This sets what the screen shows for the phase.
   */
  function applyPhase() {
    const ph = game.phase;
    els.play.classList.toggle('is-looking', ph === 'look');
    els.play.classList.toggle('is-valuing', ph === 'values');
    els.value.hidden = ph !== 'values';
    els.lock.textContent = ph === 'look' ? 'Ready: hide it' : ph === 'values' ? 'Done with values' : 'Lock in portrait';
    els.refFig.classList.toggle('is-gray', ph === 'values');
    els.refFig.classList.toggle('is-memory', game.mode === 'memory');
    els.timer.classList.toggle('is-look', ph === 'look');
    els.timer.setAttribute('aria-label', ph === 'look' ? 'Time left to memorize' : game.timed ? 'Time left' : 'Time taken');
    if (game.mode === 'memory') {
      els.refFig.classList.toggle('is-collapsed', ph === 'play' && !game.peeking);
      showPeekLabel();
    } else {
      els.refToggle.textContent = 'Reference';
    }
    els.refToggle.setAttribute('aria-expanded', String(!els.refFig.classList.contains('is-collapsed')));
    if (game.mode === 'value') drawRef(els.ref, refView);
  }

  function showPeekLabel() {
    els.refToggle.textContent = game.phase === 'look' ? 'Memorize this'
      : game.peeking ? 'Peeking…'
      : game.peeksLeft ? `Peek · ${game.peeksLeft} left (−${PEEK_COST} s)` : 'No peeks left';
  }

  // Memory: a peek shows the reference for a few seconds and takes some of the clock
  function peek() {
    if (game.peeking) return;
    if (!game.peeksLeft) { Studio.toast('No peeks left'); return; }
    if (timeLeft() <= PEEK_COST) { Studio.toast('Not enough time left to peek'); return; }
    const g = game;
    g.peeksLeft--;
    g.ends -= PEEK_COST * 1000;
    g.peeking = true;
    els.refFig.classList.remove('is-collapsed');
    showPeekLabel();
    tick();
    setTimeout(() => {
      g.peeking = false;
      if (game !== g || g.over || g.phase !== 'play') return;
      els.refFig.classList.add('is-collapsed');
      showPeekLabel();
    }, PEEK_SECONDS * 1000);
  }

  function endLook() {
    if (!game || game.over || game.phase !== 'look') return;
    game.phase = 'play';
    game.ends = performance.now() + game.seconds * 1000;
    applyPhase();
    updateMix();
    tick();
    Studio.toast('The reference is hidden. Paint from memory.');
  }

  function endValues() {
    if (!game || game.over || game.phase !== 'values') return;
    game.phase = 'play';
    applyPhase();
    updateMix();
    Studio.toast('Values set. Now mix the colors over them.');
  }

  function tick() {
    if (!game || game.over) return;
    if (game.phase === 'look') {
      const look = Math.max(0, (game.lookEnds - performance.now()) / 1000);
      els.timer.textContent = fmtTime(Math.ceil(look));
      els.timer.classList.remove('is-low');
      if (look <= 0) endLook();
      return;
    }
    if (!game.timed) {
      els.timer.textContent = fmtTime((performance.now() - game.began) / 1000);
      els.timer.classList.remove('is-low');
      return;
    }
    const left = timeLeft();
    els.timer.textContent = fmtTime(Math.ceil(left));
    els.timer.classList.toggle('is-low', left <= 30);
    if (left <= 0) {
      lockIn(true);
    }
  }

  function renderPaints() {
    els.paints.replaceChildren();
    game.paints.forEach((paint, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'game-paint';
      b.dataset.index = i;
      b.setAttribute('aria-label', `Add ${paint.name}`);
      b.title = paint.name;
      const dot = document.createElement('span');
      dot.className = 'game-paint-dot';
      dot.style.setProperty('--c', paint.hex);
      const code = document.createElement('span');
      code.className = 'game-paint-code';
      code.textContent = paint.code;
      const count = document.createElement('span');
      count.className = 'game-paint-count';
      b.append(dot, code, count);
      // a tap adds one part; holding keeps adding
      let hold = 0, repeat = 0;
      let pressed = false;
      const stop = () => {
        clearTimeout(hold);
        clearInterval(repeat);
        if (pressed) { pressed = false; keyUp(); }
      };
      b.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        pressed = true;
        addPart(i);
        hold = setTimeout(() => { repeat = setInterval(() => addPart(i), 130); }, 420);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, stop));
      b.addEventListener('click', (e) => { if (e.detail === 0) addPart(i); }); // keyboard
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      li.append(b);
      els.paints.append(li);
    });
  }

  // ---- The paints' scroll bar on phones ------------------------------------------

  // A palette too long for a phone's width scrolls sideways; a big bar under it shows where you
  // are and slides through the paints: drag its handle, or tap the track to jump there
  const phone = window.matchMedia('(max-width: 999px)');
  const scrollThumb = els.paintScroll.firstElementChild;
  function syncPaintScroll() {
    const ul = els.paints;
    const over = ul.scrollWidth - ul.clientWidth;
    const show = phone.matches && over > 2;
    els.play.classList.toggle('has-scroll', show);
    if (!show) return;
    const track = els.paintScroll.clientWidth;
    const tw = Math.max(48, (track * ul.clientWidth) / ul.scrollWidth);
    scrollThumb.style.width = `${tw}px`;
    scrollThumb.style.transform = `translateX(${((track - tw) * ul.scrollLeft) / over}px)`;
  }
  els.paints.addEventListener('scroll', syncPaintScroll, { passive: true });
  window.addEventListener('resize', syncPaintScroll);
  els.paintScroll.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    els.paintScroll.setPointerCapture(e.pointerId);
    els.paintScroll.classList.add('is-dragging');
    const r = els.paintScroll.getBoundingClientRect();
    const t = scrollThumb.getBoundingClientRect();
    // grabbed on the handle: keep hold where it was taken; on the track: centre the handle there
    const grab = e.clientX >= t.left && e.clientX <= t.right ? e.clientX - t.left : t.width / 2;
    const to = (x) => {
      const ul = els.paints;
      const k = Math.min(1, Math.max(0, (x - r.left - grab) / (r.width - t.width)));
      ul.scrollLeft = k * (ul.scrollWidth - ul.clientWidth);
    };
    to(e.clientX);
    const move = (ev) => to(ev.clientX);
    const end = () => {
      els.paintScroll.classList.remove('is-dragging');
      els.paintScroll.removeEventListener('pointermove', move);
      els.paintScroll.removeEventListener('pointerup', end);
      els.paintScroll.removeEventListener('pointercancel', end);
    };
    els.paintScroll.addEventListener('pointermove', move);
    els.paintScroll.addEventListener('pointerup', end);
    els.paintScroll.addEventListener('pointercancel', end);
  });

  function renderNumbers() {
    els.numbers.replaceChildren();
    game.board.groups.forEach((g, k) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'game-number';
      b.dataset.number = k;
      b.textContent = k + 1;
      b.addEventListener('click', () => select(k));
      li.append(b);
      els.numbers.append(li);
    });
    const li = document.createElement('li');
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-small game-next';
    next.textContent = 'Next ▸';
    next.title = 'Go to the next number with no paint on it';
    next.addEventListener('click', nextUnpainted);
    li.append(next);
    els.numbers.append(li);
  }

  /*
   * Sends you to the next number with nothing on it yet (a value in the value stage, a mix in the
   * color stage), and flashes its shapes on the board so you can see where they are.
   */
  let pulseTimer = 0;
  function nextUnpainted() {
    if (!game || game.over || game.phase === 'look') return;
    if (game.copyFrom !== null) { Studio.toast('Finish copying first'); return; }
    const n = game.board.groups.length;
    const has = (j) => (game.phase === 'values' ? game.values[j] != null : !!game.fills[j]);
    for (let i = 1; i <= n; i++) {
      const j = (game.selected + i) % n;
      if (!has(j)) { select(j); pulse(j); return; }
    }
    Studio.toast(game.phase === 'values' ? 'Every number has a value. Press Done with values.' : 'Every number has a mix. Lock in when you are ready.');
    els.lock.classList.remove('is-nudge');
    void els.lock.offsetWidth;
    els.lock.classList.add('is-nudge');
  }
  function pulse(j) {
    clearTimeout(pulseTimer);
    const g = game;
    let n = 0;
    const step = () => {
      if (game !== g || g.over) return;
      g.pulse = n % 2 === 0 ? j : -1;
      paintBoard();
      if (++n < 6) pulseTimer = setTimeout(step, reduceMotion.matches ? 250 : 170);
    };
    step();
  }

  function select(k) {
    if (game.copyFrom !== null) {
      if (k === game.copyFrom) endCopy(); else paste(k);
      return;
    }
    game.selected = k;
    updateMix();
  }

  // ---- Copying a mix ----------------------------------------------------------

  // Copy mix: every number or shape tapped next gets the chosen number's mix, part for part
  function startCopy() {
    const k = game.selected;
    if (!game.parts[k].length) return;
    game.copyFrom = k;
    els.play.classList.add('is-copying');
    els.copyBar.hidden = false;
    els.copyText.textContent = `Copying number ${k + 1}. Tap the numbers or shapes to paste its mix into.`;
    updateMix();
  }

  function endCopy() {
    if (!game) return;
    game.copyFrom = null;
    els.play.classList.remove('is-copying');
    els.copyBar.hidden = true;
    if (!game.over) updateMix();
  }

  function paste(k) {
    if (game.phase !== 'play') return;
    const from = game.copyFrom;
    game.parts[k] = game.parts[from].map((x) => ({ paint: x.paint, amount: x.amount }));
    remix(k);
    Studio.toast(`Number ${from + 1}’s mix pasted into number ${k + 1}`);
  }

  els.copy.addEventListener('click', () => (game.copyFrom === null ? startCopy() : endCopy()));
  els.copyDone.addEventListener('click', endCopy);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && game && !game.over && game.copyFrom !== null) endCopy();
  });

  const perTap = () => AMOUNTS[+els.amount.value];
  // how much of paint i a number's mix has, in parts
  const amountOf = (list, i) => list.reduce((s, x) => s + (x.paint === i ? x.amount : 0), 0);
  // 2.75 -> "2¾"; 0.5 -> "½"
  function fmtParts(v) {
    const q = Math.round(v * 4) / 4, whole = Math.floor(q), frac = ['', '¼', '½', '¾'][Math.round((q - whole) * 4)];
    return whole ? `${whole}${frac}` : frac || '0';
  }

  function addPart(i) {
    if (game.over || game.phase !== 'play') return;
    const list = game.parts[game.selected];
    const amount = perTap();
    if (list.reduce((s, x) => s + x.amount, 0) + amount > MAX_PARTS) { Studio.toast(`A mix holds up to ${MAX_PARTS} parts`); return; }
    list.push({ paint: i, amount });
    remix(game.selected);
    pop(i);
    keyDown(i);
  }

  // the paint swells and snaps back with each tap
  function pop(i) {
    const b = els.paints.querySelector(`.game-paint[data-index="${i}"]`);
    if (!b) return;
    b.classList.remove('is-pop');
    void b.offsetWidth;
    b.classList.add('is-pop');
  }

  function remix(k) {
    const list = game.parts[k];
    if (!list.length) {
      game.fills[k] = null;
      game.labs[k] = null;
    } else {
      const counts = game.paints.map((p, i) => amountOf(list, i));
      const m = Mixing.mix(game.paints, counts);
      game.fills[k] = [m.rgb.r, m.rgb.g, m.rgb.b];
      game.labs[k] = m.lab;
    }
    updateMix();
    // a number that has just come within reach of its color gets the chime
    const spot = !!game.labs[k] && matchOf(deltaE(game.labs[k], game.targets[k].lab)) >= SPOT;
    if (spot && !game.spot[k]) celebrate(k);
    game.spot[k] = spot;
  }

  function celebrate(k) {
    chime();
    if (soundOn && navigator.vibrate) navigator.vibrate([18, 40, 28]);
    const again = (el) => { el.classList.remove('is-spot'); void el.offsetWidth; el.classList.add('is-spot'); };
    again(els.mixChip);
    const nb = els.numbers.querySelector(`.game-number[data-number="${k}"]`);
    if (nb) again(nb);
    els.spot.textContent = `Spot on! Number ${k + 1}`;
    els.spot.classList.remove('is-on');
    void els.spot.offsetWidth;
    els.spot.classList.add('is-on');
  }

  function partsText(k) {
    const list = game.parts[k];
    if (!list.length) return 'Empty. Tap a paint to start the mix, or copy one from a painted number.';
    return game.paints
      .map((p, i) => [p.code, amountOf(list, i)])
      .filter(([, n]) => n)
      .map(([code, n]) => `${code} ${fmtParts(n)}`)
      .join(' · ');
  }

  // what each number shows on the board: its mix, or else its grey underpainting
  const shown = () => game.board.groups.map((g, k) => game.fills[k] || game.under[k] || null);
  function paintBoard() {
    drawBoard(els.canvas, game.board, shown(), { selected: game.selected, numbers: true, flash: game.pulse });
  }

  function progressText() {
    const n = game.board.groups.length;
    if (game.phase === 'look') return 'Memorize the colors. The reference hides soon.';
    if (game.phase === 'values') return `${game.values.filter((v) => v != null).length} of ${n} values set`;
    return `${game.fills.filter(Boolean).length} of ${n} numbers painted`;
  }

  function updateMix() {
    const k = game.selected;
    const fill = game.fills[k];
    if (game.phase === 'values') {
      const L = game.values[k];
      els.valueTitle.textContent = `Number ${k + 1}`;
      els.valueText.textContent = L == null ? 'Not set: slide to set its value' : `Value ${(L / 10).toFixed(1)}`;
      els.valueChip.style.background = L == null ? '' : toHex(game.under[k]);
      els.valueRange.value = L == null ? 50 : L;
      els.valueClear.disabled = L == null;
    }
    els.mixTitle.textContent = `Number ${k + 1}`;
    els.mixParts.textContent = partsText(k);
    els.mixChip.style.background = fill ? toHex(fill) : '';
    els.mixChip.classList.toggle('is-empty', !fill);
    els.undo.disabled = !game.parts[k].length;
    els.clear.disabled = !game.parts[k].length;
    const copying = game.copyFrom !== null;
    els.copy.disabled = !copying && !game.parts[k].length;
    els.copy.textContent = copying ? 'Stop copying' : 'Copy mix';
    els.copy.setAttribute('aria-pressed', String(copying));
    els.paints.querySelectorAll('.game-paint').forEach((b) => {
      const n = amountOf(game.parts[k], +b.dataset.index);
      b.querySelector('.game-paint-count').textContent = n ? fmtParts(n) : '';
    });
    const valuing = game.phase === 'values';
    els.numbers.querySelectorAll('.game-number').forEach((b) => {
      const j = +b.dataset.number;
      const f = valuing ? game.under[j] : game.fills[j];
      b.setAttribute('aria-pressed', String(j === k));
      b.style.setProperty('--fill', f ? toHex(f) : 'transparent');
      b.classList.toggle('is-filled', !!f);
      b.classList.toggle('is-dark', !!f && lightness(f) < 55);
      b.setAttribute('aria-label', `Number ${j + 1}${f ? (valuing ? ', value set' : ', painted') : valuing ? ', no value yet' : ', not painted yet'}`);
    });
    const next = els.numbers.querySelector('.game-next');
    if (next) next.disabled = game.phase === 'look';
    els.progress.textContent = progressText();
    paintBoard();
  }

  const undoLast = () => { if (game.phase !== 'play') return; game.parts[game.selected].pop(); remix(game.selected); };
  els.undo.addEventListener('click', undoLast);
  els.quickUndo.addEventListener('click', () => { if (game && !game.over && game.parts[game.selected].length) undoLast(); });

  // ---- Value stage ------------------------------------------------------------

  // The grey for a lightness L* (0 black to 100 white), as an sRGB color
  function greyOf(L) {
    const Y = L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3;
    const v = Math.round(255 * (Y <= 0.0031308 ? 12.92 * Y : 1.055 * Math.pow(Y, 1 / 2.4) - 0.055));
    return [v, v, v];
  }
  // the slider's track runs through the greys in even steps of lightness
  els.valueRange.style.setProperty('--ramp', `linear-gradient(90deg, ${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((L) => `rgb(${greyOf(L)})`).join(', ')})`);
  function setValue(k, L) {
    game.values[k] = L;
    game.under[k] = greyOf(L);
    updateMix();
  }
  els.valueRange.addEventListener('input', () => { if (game && !game.over && game.phase === 'values') setValue(game.selected, +els.valueRange.value); });
  els.valueClear.addEventListener('click', () => {
    if (!game || game.phase !== 'values') return;
    game.values[game.selected] = null;
    game.under[game.selected] = null;
    updateMix();
  });

  // ---- Sound ------------------------------------------------------------------

  // A mechanical keyboard click for each tap, made in the browser: a very short burst of
  // band-passed noise for the switch's click over a quick low thock for the keycap bottoming
  // out. Each press varies a little, as real keys do; letting go adds the switch's softer
  // release click.
  let soundOn = load(SOUND_KEY, true) !== false;
  let audio = null;
  function unlockAudio() {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (err) {
      audio = null;
    }
  }
  let noise = null;
  function noiseBuffer() {
    if (!noise) {
      noise = audio.createBuffer(1, Math.round(audio.sampleRate * 0.06), audio.sampleRate);
      const d = noise.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
    return noise;
  }
  // one burst of filtered noise, `level` loud, decaying over `ms`
  function snap(t, freq, level, ms) {
    const src = audio.createBufferSource();
    src.buffer = noiseBuffer();
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 1.4;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(band).connect(gain).connect(audio.destination);
    src.start(t);
    src.stop(t + ms / 1000 + 0.01);
  }
  const vary = (v, by) => v * (1 + (Math.random() * 2 - 1) * by);
  function keyDown(i) {
    if (!soundOn) return;
    unlockAudio();
    if (!audio) return;
    const t = audio.currentTime;
    // the click: bright and very short, a touch higher along the palette
    snap(t, vary(3400 + (i % 10) * 90, 0.08), vary(0.9, 0.12), 14);
    snap(t + 0.004, vary(1800, 0.1), 0.35, 10);
    // the thock: the keycap landing
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(vary(210, 0.05), t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.035);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vary(0.32, 0.1), t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }
  function keyUp() {
    if (!soundOn || !audio) return;
    snap(audio.currentTime, vary(4200, 0.08), 0.3, 9);
  }
  // the same clicks and chime for the other games, under this game's sound switch
  window.GameSound = { keyDown, keyUp, chime: () => chime(), on: () => soundOn };
  // "Spot on!": two bright bell notes, a fifth apart, each with a quiet octave overtone
  function bell(t, freq, level) {
    [[1, level], [2, level * 0.22]].forEach(([mult, lv]) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(lv, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }
  function chime() {
    if (!soundOn) return;
    unlockAudio();
    if (!audio) return;
    const t = audio.currentTime;
    bell(t, 1318.5, 0.14);
    bell(t + 0.09, 1975.5, 0.12);
  }
  function showSound() {
    els.sound.setAttribute('aria-pressed', String(soundOn));
    els.sound.title = soundOn ? 'Sound and vibration on' : 'Sound and vibration off';
  }
  els.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    save(SOUND_KEY, soundOn);
    showSound();
    if (soundOn) { unlockAudio(); keyDown(0); setTimeout(keyUp, 90); }
  });
  showSound();

  // ---- Full screen on phones ------------------------------------------------------

  // While playing on a phone, the page header and tabs step aside so the bar, the painting and the
  // palette fill the screen
  function setFocus(on) {
    document.body.classList.toggle('game-focus', on);
    if (on) window.scrollTo(0, 0);
  }

  // the tabs are hidden while playing, so the bar has a way out: tap ✕ twice
  let quitArmed = 0;
  els.quit.addEventListener('click', () => {
    if (!game || game.over) return;
    if (performance.now() - quitArmed > 3000) {
      quitArmed = performance.now();
      Studio.toast('Tap ✕ again to quit this game');
      return;
    }
    quitArmed = 0;
    game.over = true;
    clearInterval(timer);
    endCopy();
    game = null;
    setFocus(false);
    els.play.hidden = true;
    els.setup.hidden = false;
    refreshSetup();
  });
  els.clear.addEventListener('click', () => { if (game.phase !== 'play') return; game.parts[game.selected] = []; remix(game.selected); });

  // tapping a shape on the board chooses its number
  els.canvas.addEventListener('click', (e) => {
    if (!game || game.over) return;
    const r = els.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * game.board.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * game.board.h);
    if (x < 0 || y < 0 || x >= game.board.w || y >= game.board.h) return;
    select(game.board.cell[y * game.board.w + x]);
  });

  // Photo or Blocks: how the reference beside the board is shown, remembered between games
  let refView = load(REF_VIEW_KEY, 'photo') === 'blocks' ? 'blocks' : 'photo';
  const refViewButtons = document.querySelectorAll('[data-ref-view]');
  function showRefView() {
    refViewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.refView === refView)));
    els.ref.setAttribute('aria-label', refView === 'blocks' ? 'The reference as a color-block study' : 'The reference photo');
    if (game) drawRef(els.ref, refView);
  }
  refViewButtons.forEach((b) => b.addEventListener('click', () => {
    refView = b.dataset.refView;
    save(REF_VIEW_KEY, refView);
    showRefView();
  }));
  showRefView();

  els.refToggle.addEventListener('click', () => {
    if (game && !game.over && game.mode === 'memory') { if (game.phase === 'play') peek(); return; }
    const open = els.refFig.classList.toggle('is-collapsed') === false;
    els.refToggle.setAttribute('aria-expanded', String(open));
  });

  // ---- Amount per tap -------------------------------------------------------

  function showAmount() {
    const a = perTap();
    els.amountOut.textContent = `${fmtParts(a)} part${a > 1 ? 's' : ''} per tap`;
  }
  els.amount.value = Math.max(0, AMOUNTS.indexOf(load(AMOUNT_KEY, 1)));
  els.amount.addEventListener('input', () => { save(AMOUNT_KEY, perTap()); showAmount(); });
  showAmount();

  // ---- The reference, moved around the board on smaller screens --------------

  const narrow = window.matchMedia('(max-width: 999px)');
  const refPos = { x: 0, y: 0 };
  function placeRef(x, y) {
    if (!narrow.matches) { refPos.x = refPos.y = 0; els.refFig.style.transform = ''; return; }
    // keep it over the board: its default spot is the board's top right corner
    const b = els.board.getBoundingClientRect();
    const r = els.refFig.getBoundingClientRect();
    const baseX = r.left - refPos.x, baseY = r.top - refPos.y;
    refPos.x = Math.min(b.right - r.width - baseX, Math.max(b.left - baseX, x));
    refPos.y = Math.min(b.bottom - r.height - baseY, Math.max(b.top - baseY, y));
    els.refFig.style.transform = `translate(${refPos.x}px, ${refPos.y}px)`;
  }
  els.ref.addEventListener('pointerdown', (e) => {
    if (!narrow.matches || e.button > 0) return;
    e.preventDefault();
    els.ref.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, px: refPos.x, py: refPos.y };
    els.refFig.classList.add('is-moving');
    const move = (ev) => placeRef(start.px + ev.clientX - start.x, start.py + ev.clientY - start.y);
    const end = () => {
      els.refFig.classList.remove('is-moving');
      els.ref.removeEventListener('pointermove', move);
      els.ref.removeEventListener('pointerup', end);
      els.ref.removeEventListener('pointercancel', end);
    };
    els.ref.addEventListener('pointermove', move);
    els.ref.addEventListener('pointerup', end);
    els.ref.addEventListener('pointercancel', end);
  });
  const keepRef = () => placeRef(refPos.x, refPos.y);
  window.addEventListener('resize', keepRef);
  if (narrow.addEventListener) narrow.addEventListener('change', keepRef);

  // ---- Scoring --------------------------------------------------------------

  // Stars by color match: the closest mixes most palettes can make land around 85-96%
  const STARS = [88, 78, 65, 50, 30];
  const GRADES = ['Keep mixing', 'Keep mixing', 'Getting there', 'Good eye', 'Sharp eye!', 'Master colorist!'];
  const starsFor = (pct) => STARS.filter((min) => pct >= min).length;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function lockIn(timedOut) {
    if (!game || game.over) return;
    timedOut = timedOut === true;
    game.over = true;
    clearInterval(timer);
    clearTimeout(pulseTimer);
    game.pulse = -1;
    endCopy();
    const left = timeLeft();
    const elapsed = (performance.now() - game.began) / 1000;
    const groups = game.board.groups;
    const total = groups.reduce((s, g) => s + g.share, 0);
    const rows = groups.map((g, k) => {
      const lab = game.labs[k], t = game.targets[k];
      const dE = lab ? deltaE(lab, t.lab) : null;
      return { k, g, t, lab, fill: game.fills[k], dE, match: lab ? matchOf(dE) : 0 };
    });
    const accuracy = rows.reduce((s, r) => s + r.g.share * r.match, 0) / total;
    const allPainted = rows.every((r) => r.lab);
    const bonus = game.timed && allPainted ? Math.round(BONUS * (left / game.seconds) * (accuracy / 100)) : 0;
    // Value first: the value study is worth up to 100 points, and the colors 900 instead of 1,000
    const valueMode = game.mode === 'value';
    const valueAcc = valueMode
      ? groups.reduce((s, g, k) => s + g.share * (game.values[k] == null ? 0 : Math.max(0, 100 - 2.5 * Math.abs(game.values[k] - g.lab[0]))), 0) / total
      : 0;
    const colorPts = Math.round(accuracy * (valueMode ? 9 : 10));
    const valuePts = valueMode ? Math.round(valueAcc) : 0;
    const points = colorPts + valuePts + bonus;
    const bests = load(BEST_KEY, {});
    const isBest = !bests[game.bestKey] || points > bests[game.bestKey];
    if (isBest) { delete bests[game.bestKey]; bests[game.bestKey] = points; pruneBests(bests); save(BEST_KEY, bests); } // re-added last, so the prune drops the least recently played

    els.play.hidden = true;
    els.result.hidden = false;
    setFocus(false);
    els.analysis.hidden = true;
    els.analyze.setAttribute('aria-expanded', 'false');
    els.analyze.textContent = 'Analyze';
    drawBoard(els.final, game.board, shown(), { selected: -1, numbers: false });
    drawBoard(els.finalTarget, game.board, game.targets.map((t) => t.rgb), { selected: -1, numbers: false });
    setCompare(false);
    game.result = { pct: Math.round(accuracy), stars: starsFor(accuracy), points, grade: GRADES[starsFor(accuracy)] };
    showScore(accuracy, isBest, timedOut);
    els.points.textContent = points;
    els.breakdown.replaceChildren();
    [
      ['Mode', MODES[game.mode].name, ''],
      ...(valueMode ? [['Value study', `${valueAcc.toFixed(0)}%`, `+${valuePts}`]] : []),
      ['Color accuracy', `${accuracy.toFixed(0)}%`, `${colorPts}`],
      game.timed
        ? ['Time left', fmtTime(Math.ceil(left)), allPainted ? `+${bonus}` : '+0 (some numbers unpainted)']
        : ['Time taken', fmtTime(elapsed), '+0 (no clock)'],
      ['Palette', game.palette.name, ''],
    ].forEach(([t, v, pts]) => {
      const dt = document.createElement('dt');
      dt.textContent = t;
      const dd = document.createElement('dd');
      dd.textContent = pts ? `${v} · ${pts}` : v;
      els.breakdown.append(dt, dd);
    });

    drawBoard(els.yours, game.board, shown(), { selected: -1, numbers: false });
    drawBoard(els.target, game.board, game.targets.map((t) => t.rgb), { selected: -1, numbers: false });
    drawRef(els.photo);
    renderZones(rows);
  }

  // The arcade card over the portrait: the match counts up, then the stars pop in one by one
  let countUp = 0;
  function showScore(accuracy, isBest, timedOut) {
    const pct = Math.round(accuracy);
    const stars = starsFor(accuracy);
    els.kicker.textContent = timedOut ? 'Time’s up!' : 'Portrait locked in';
    els.grade.textContent = GRADES[stars];
    els.newBest.hidden = !isBest;
    els.stars.setAttribute('aria-label', `${stars} out of 5 stars, ${pct}% color match`);
    els.stars.querySelectorAll('.game-star').forEach((st, i) => {
      st.classList.toggle('is-on', i < stars);
      st.style.setProperty('--i', i);
    });
    els.popup.hidden = false;
    els.showBar.hidden = true;
    // restart the entrance animations
    els.popup.classList.remove('is-shown');
    void els.popup.offsetWidth;
    els.popup.classList.add('is-shown');
    cancelAnimationFrame(countUp);
    if (reduceMotion.matches) { els.pct.textContent = pct; }
    else {
      const t0 = performance.now(), ms = 1100;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        els.pct.textContent = Math.round(pct * (1 - Math.pow(1 - k, 3)));
        if (k < 1) countUp = requestAnimationFrame(step);
      };
      countUp = requestAnimationFrame(step);
    }
    els.analyze.focus({ preventScroll: true });
  }

  els.popupClose.addEventListener('click', () => {
    els.popup.hidden = true;
    els.showBar.hidden = false;
    els.showScore.focus();
  });
  els.showScore.addEventListener('click', () => {
    els.popup.hidden = false;
    els.showBar.hidden = true;
    els.analyze.focus();
  });
  els.analyze.addEventListener('click', () => {
    const open = els.analysis.hidden;
    els.analysis.hidden = !open;
    els.analyze.setAttribute('aria-expanded', String(open));
    els.analyze.textContent = open ? 'Hide analysis' : 'Analyze';
    if (open) els.analysis.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  });

  // ---- The reveal: wipe between your portrait and the colors to match ----------------

  let cut = 50, sweep = 0;
  function setCut(pct) {
    cut = Math.max(0, Math.min(100, pct));
    els.finalWrap.style.setProperty('--cut', `${cut}%`);
    els.handle.setAttribute('aria-valuenow', String(Math.round(cut)));
  }
  function setCompare(on, animate) {
    cancelAnimationFrame(sweep);
    els.finalWrap.classList.toggle('is-comparing', on);
    els.compare.setAttribute('aria-pressed', String(on));
    els.compare.textContent = on ? 'Stop comparing' : 'Compare with target';
    setCut(50);
    if (on && animate && !reduceMotion.matches) {
      // the target wipes in from the right edge
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 800);
        setCut(100 - 50 * (1 - Math.pow(1 - k, 3)));
        if (k < 1) sweep = requestAnimationFrame(step);
      };
      setCut(100);
      sweep = requestAnimationFrame(step);
    }
  }
  els.compare.addEventListener('click', () => setCompare(!els.finalWrap.classList.contains('is-comparing'), true));
  els.finalWrap.addEventListener('pointerdown', (e) => {
    if (!els.finalWrap.classList.contains('is-comparing') || e.button > 0) return;
    e.preventDefault();
    cancelAnimationFrame(sweep);
    els.finalWrap.setPointerCapture(e.pointerId);
    const r = els.finalWrap.getBoundingClientRect();
    const to = (x) => setCut(((x - r.left) / r.width) * 100);
    to(e.clientX);
    const move = (ev) => to(ev.clientX);
    const end = () => {
      els.finalWrap.removeEventListener('pointermove', move);
      els.finalWrap.removeEventListener('pointerup', end);
      els.finalWrap.removeEventListener('pointercancel', end);
    };
    els.finalWrap.addEventListener('pointermove', move);
    els.finalWrap.addEventListener('pointerup', end);
    els.finalWrap.addEventListener('pointercancel', end);
  });
  els.handle.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
    if (step) setCut(cut + step);
    else if (e.key === 'Home') setCut(0);
    else if (e.key === 'End') setCut(100);
    else return;
    e.preventDefault();
  });

  // ---- The share card: your portrait with its score, as one picture -------------------

  const STAR = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z';
  function makeCard() {
    const r = game.result;
    const W = 1080, H = 1350;
    const FONT = '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif';
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#efe7d6';
    g.fillRect(0, 0, W, H);
    // the header band
    g.fillStyle = '#2c4a36';
    g.fillRect(0, 0, W, 120);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#faf5ea';
    g.font = `700 38px ${FONT}`;
    g.fillText('Portrait Value Studio', 60, 62);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(250, 245, 234, 0.82)';
    g.font = `600 25px ${FONT}`;
    g.fillText(`Paint by numbers · ${MODES[game.mode].name}`, W - 60, 62);
    // the portrait on its gray matte
    const box = { x: 70, y: 150, w: 940, h: 760 };
    g.fillStyle = '#8b8c8e';
    g.fillRect(box.x, box.y, box.w, box.h);
    const src = els.final;
    const k = Math.min((box.w - 60) / src.width, (box.h - 60) / src.height);
    const pw = src.width * k, ph = src.height * k;
    g.shadowColor = 'rgba(0, 0, 0, 0.35)';
    g.shadowBlur = 18;
    g.shadowOffsetY = 5;
    g.drawImage(src, box.x + (box.w - pw) / 2, box.y + (box.h - ph) / 2, pw, ph);
    g.shadowColor = 'transparent';
    // the score
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#2c4a36';
    g.font = `800 190px ${FONT}`;
    g.fillText(`${r.pct}%`, 60, 1100);
    g.fillStyle = '#5c6157';
    g.font = `600 34px ${FONT}`;
    g.fillText('color match', 68, 1148);
    // the stars and the grade
    const path = new Path2D(STAR);
    for (let i = 0; i < 5; i++) {
      g.save();
      g.translate(560 + i * 90, 985);
      g.scale(3.4, 3.4);
      g.fillStyle = i < r.stars ? '#d9a441' : 'rgba(30, 43, 34, 0.14)';
      g.fill(path);
      g.restore();
    }
    g.fillStyle = '#a4472f';
    g.font = `700 44px ${FONT}`;
    g.fillText(r.grade, 560, 1100);
    g.fillStyle = '#1e2b22';
    g.font = `600 32px ${FONT}`;
    g.fillText(`${r.points.toLocaleString('en-US')} points`, 560, 1148);
    // what it was
    g.fillStyle = '#d8ccb4';
    g.fillRect(60, 1190, W - 120, 3);
    g.fillStyle = '#1e2b22';
    g.font = `700 36px ${FONT}`;
    g.fillText(game.subjectLabel, 60, 1250);
    g.fillStyle = '#5c6157';
    g.font = `500 30px ${FONT}`;
    const level = game.levelName[0].toUpperCase() + game.levelName.slice(1);
    g.fillText(`${game.palette.name} · ${level}`, 60, 1298);
    g.textAlign = 'right';
    g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), W - 60, 1298);
    return c;
  }

  // Share on phones that can; otherwise save the picture
  async function shareCard() {
    if (!game || !game.result) return;
    const c = makeCard();
    const name = `portrait-value-studio-${game.result.pct}pct.png`;
    const blob = await new Promise((done) => c.toBlob(done, 'image/png'));
    if (!blob) return;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'My Portrait Value Studio result' }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    Studio.savePng(c, name);
  }
  document.querySelectorAll('[data-game="share"]').forEach((b) => b.addEventListener('click', shareCard));

  // Plain words for how a mix is off: "too light by 0.6 value, too warm"
  function describe(lab, target) {
    const out = [];
    const dL = lab[0] - target[0];
    if (Math.abs(dL) >= 3) out.push(`too ${dL > 0 ? 'light' : 'dark'} by ${(Math.abs(dL) / 10).toFixed(1)} value`);
    const hue = 50 * Math.PI / 180;
    const warm = (lab[1] - target[1]) * Math.cos(hue) + (lab[2] - target[2]) * Math.sin(hue);
    if (Math.abs(warm) >= 4) out.push(warm > 0 ? 'too warm' : 'too cool');
    const dC = Math.hypot(lab[1], lab[2]) - Math.hypot(target[1], target[2]);
    if (Math.abs(dC) >= 5) out.push(dC > 0 ? 'too strong' : 'too gray');
    return out.join(', ');
  }

  function renderZones(rows) {
    els.zones.replaceChildren();
    const sorted = rows.slice().sort((a, b) => a.match - b.match);
    sorted.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'game-zone';
      const num = document.createElement('span');
      num.className = 'game-zone-number';
      num.textContent = r.k + 1;
      const chips = document.createElement('span');
      chips.className = 'mix-chips';
      [r.fill, r.t.rgb].forEach((c, i) => {
        const s = document.createElement('span');
        s.className = 'mix-chip' + (c ? '' : ' mix-pending');
        if (c) s.style.background = toHex(c);
        s.title = (i ? 'The color to match ' : 'Your mix ') + (c ? toHex(c) : '(not painted)');
        chips.append(s);
      });
      const text = document.createElement('span');
      text.className = 'mix-text';
      const top = document.createElement('span');
      top.className = 'mix-top';
      const pct = document.createElement('span');
      pct.className = 'game-zone-match';
      pct.textContent = r.lab ? `${Math.round(r.match)}% match` : 'Not painted';
      top.append(pct);
      const note = document.createElement('span');
      note.className = 'mix-zone';
      note.textContent = r.lab ? describe(r.lab, r.t.lab) || 'spot on' : '';
      top.append(note);
      const yours = document.createElement('span');
      yours.className = 'mix-recipe';
      yours.textContent = r.lab ? `You: ${partsText(r.k)}` : '';
      const tip = document.createElement('span');
      tip.className = 'mix-recipe game-zone-tip';
      // the recipe the target was mixed from
      tip.textContent = 'Mix: ' + game.paints.map((p, i) => [p.code, r.t.counts[i]]).filter(([, n]) => n).map(([code, n]) => `${code} ${fmtParts(n)}`).join(' · ');
      text.append(top, yours, tip);
      li.append(num, chips, text);
      els.zones.append(li);
    });
  }

  els.lock.addEventListener('click', () => {
    if (!game || game.over) return;
    if (game.phase === 'look') endLook();
    else if (game.phase === 'values') endValues();
    else lockIn();
  });
  els.start.addEventListener('click', startGame);
  function toSetup() {
    els.result.hidden = true;
    els.setup.hidden = false;
    game = null;
    refreshSetup();
    showPalette();
  }
  document.querySelectorAll('[data-game="new"]').forEach((b) => b.addEventListener('click', toSetup));

  // Play again asks first: the same portrait, or a new one (a painting dealt at random, or another photo)
  const again = { dialog: $('againDialog'), hint: $('againHint'), same: $('againSame'), next: $('againNew'), cancel: $('againCancel') };
  document.querySelectorAll('[data-game="again"]').forEach((b) => b.addEventListener('click', () => {
    const painting = subject.kind === 'painting';
    again.same.textContent = painting ? 'Same portrait' : 'Same photo';
    again.next.textContent = painting ? 'New portrait' : 'New photo';
    again.hint.textContent = painting ? 'Try the same portrait again, or take on a new one?' : 'Try the same photo again, or load a new one?';
    if (again.dialog.showModal) again.dialog.showModal(); else startGame();
    again.same.focus();
  }));
  again.same.addEventListener('click', () => { again.dialog.close(); startGame(); });
  again.next.addEventListener('click', () => {
    again.dialog.close();
    if (subject.kind === 'painting') {
      setSubject({ kind: 'painting', id: deal() }, false);
      startGame();
    } else {
      // back to the setup, which shows the new photo's board once it has loaded
      toSetup();
      document.getElementById('file').click();
    }
  });
  again.cancel.addEventListener('click', () => again.dialog.close());

  // ---- Wiring ---------------------------------------------------------------

  const savedMode = load(MODE_KEY, 'classic');
  els.mode.value = MODES[savedMode] ? savedMode : 'classic';
  showMode();
  els.mode.addEventListener('change', () => {
    save(MODE_KEY, mode());
    if (mode() === 'mystery' && board) dealMystery();
    showMode();
    if (board) renderPalettes();
  });
  els.deal.addEventListener('click', () => { dealMystery(); renderPalettes(); });
  const savedLevel = LEVELS[load(LEVEL_KEY, 'medium')] ? load(LEVEL_KEY, 'medium') : 'medium';
  document.querySelectorAll('input[name="gameLevel"]').forEach((r) => {
    r.checked = r.value === savedLevel;
    r.addEventListener('change', () => { if (Studio.tab() === 'game') refreshSetup(); });
  });
  els.palette.addEventListener('change', showPalette);
  document.querySelectorAll('input[name="gameSubject"]').forEach((r) => r.addEventListener('change', () => {
    setSubject(r.value === 'photo' ? { kind: 'photo' } : { kind: 'painting', id: deal() });
  }));
  els.reroll.addEventListener('click', () => setSubject({ kind: 'painting', id: deal() }));

  // the setup shows the current reference; a game in progress keeps the one it started with
  window.addEventListener('studio:result', () => { if (Studio.tab() === 'game' && !game) refreshSetup(); });
  // loading a photo from the game's setup means painting from it
  document.getElementById('file').addEventListener('change', () => { if (Studio.tab() === 'game' && !game && subject.kind !== 'photo') setSubject({ kind: 'photo' }, false); });
  window.addEventListener('studio:tab', (e) => {
    setFocus(e.detail === 'game' && !!game && !game.over);
    if (e.detail !== 'game') return;
    if (!game) { renderPalettes(); refreshSetup(); }
  });
  // the page may open straight on this tab (index.html#game), before this script was listening
  if (Studio.tab() === 'game') { renderPalettes(); refreshSetup(); }
})();
