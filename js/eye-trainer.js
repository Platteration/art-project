/*
 * Train your eye: short value and temperature drills on the reference itself.
 * Each answer is checked against the photo at once, with the likely cause of a
 * miss, and the answers add up to a personal bias per value mass.
 *
 * The photo sits on its own canvas (#cv-eye). It isn't a .view and has no entry
 * in state.pixels, so the loupe never reads it and can't give the answer away.
 *
 * Spots are only taken where the photo is even: no edge or steep gradient inside
 * the ring and little texture, so the answer is clear. A spot's value is the
 * median L* of the pixels inside its ring, on the 0-10 scale (L* / 10).
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    panel: $('tab-eye'),
    modes: document.querySelectorAll('input[name="eyeMode"]'),
    focus: $('eyeFocus'),
    focusField: $('eyeFocusField'),
    layout: $('eyeLayout'),
    head: $('eyeHead'),
    progress: $('eyeProgress'),
    count: $('eyeCount'),
    pips: $('eyePips'),
    prompt: $('eyePrompt'),
    help: $('eyeHelp'),
    note: $('eyeNote'),
    canvas: $('cv-eye'),
    rings: $('eyeRings'),
    answers: $('eyeAnswers'),
    feedback: $('eyeFeedback'),
    summary: $('eyeSummary'),
    empty: $('eyeEmpty'),
  };

  const ROUND = 10;                 // questions per round
  const SPOT_ON = 0.5, CLOSE = 1;   // value steps that still count as spot on / close
  const STATS_KEY = 'portrait-value-studio.eye-stats';
  const MAX_STATS = 300;            // answers kept between visits, newest last
  const RING_MIN = 5;               // css px: the smallest ring hole drawn on screen
  const ZONE_NAMES = ['Shadow', 'Middle', 'Light'];
  const MASSES = ['shadows', 'middles', 'lights'];
  const LETTERS = ['A', 'B'];

  const MODES = {
    value: {
      unit: 'Spot', next: 'Next spot',
      prompt: 'What value is the spot in the ring?',
      help: 'V 0 is black and V 10 is white. Keys 0 to 9 work too.',
    },
    lighter: {
      unit: 'Pair', next: 'Next pair',
      prompt: 'Which spot is lighter, A or B?',
      help: 'Squint if it helps. Tap a ring, or press A or B.',
    },
    mass: {
      unit: 'Spot', next: 'Next spot',
      prompt: 'Is the spot in the shadow, middle or light mass?',
      help: 'The masses of your three-value study, as split in Values. Keys S, M and L work too.',
    },
    warmer: {
      unit: 'Pair', next: 'Next pair',
      prompt: 'Which spot is warmer, A or B?',
      help: 'Warmer means nearer orange on the color wheel, and of two warm colors close in hue, the grayer reads cooler. Judge the color, not how light the spot is. Tap a ring, or press A or B.',
    },
  };

  let app = null;       // { state, splits } from app.js
  const t = {
    mode: 'value',
    focus: -1,          // value drill only: take every spot from this mass (0-2), or -1 for all
    prep: null,         // the reference the spots are found on
    result: null,       // the value study their masses come from
    found: null,        // findSpots(prep)
    noPairs: {},        // drills with no pair to ask about on this photo
    round: null,
    gray: false,        // photo shown in gray, after an answer
    drawn: null,        // what the canvas shows: { prep, gray }
    grayOf: null, grayImg: null,
    seeds: 0,
    lastId: 0,
  };

  // ---- Helpers ------------------------------------------------------------

  const valueLabel = (L) => (L / 10).toFixed(1);
  const V = (L) => 'V\u00a0' + valueLabel(L); // a no-break space keeps "V 3.4" on one line
  const visible = () => !els.panel.hidden;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const mean = (list) => list.reduce((s, v) => s + v, 0) / (list.length || 1);
  const WARM_DEG = (Study.WARM_HUE * 180) / Math.PI;
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Same generator as processing.js. Each round keeps its seed, so its questions can be replayed.
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Rough names for CIELAB hue angles, as a painter would say them
  function hueName(h) {
    if (h < 25 || h >= 345) return 'pink';
    if (h < 50) return 'red';
    if (h < 75) return 'orange';
    if (h < 110) return 'yellow';
    if (h < 170) return 'green';
    if (h < 240) return 'blue-green';
    if (h < 315) return 'blue';
    return 'violet';
  }

  // ---- Finding even spots ----------------------------------------------------

  // Summed-area table, (w + 1) x (h + 1), of v or of v squared
  function integral(v, w, h, squared) {
    const W = w + 1;
    const I = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const k = v[y * w + x];
        row += squared ? k * k : k;
        I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
      }
    }
    return I;
  }

  // Sum and pixel count of the box x0 <= x < x1, y0 <= y < y1, clipped to the image
  function boxSum(I, w, h, x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(w, x1); y1 = Math.min(h, y1);
    if (x1 <= x0 || y1 <= y0) return { sum: 0, n: 0 };
    const W = w + 1;
    return { sum: I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0], n: (x1 - x0) * (y1 - y0) };
  }

  /*
   * Busy photos get looser limits rather than no spots at all. `range` is how far
   * apart the means of the ring's 3 x 3 ninths may be (an edge or steep gradient
   * inside), `sd` how much its pixels may scatter (texture such as hair or cloth).
   */
  const LIMITS = [{ range: 6, sd: 6 }, { range: 9, sd: 9 }, { range: 13, sd: 13 }];
  const MIN_SPOTS = 24;

  /*
   * Even spots, with their value, color and surroundings. The ring's radius R is
   * 1% of the long side. One spot is kept per 2R cell, the evenest, so large flat
   * areas such as a dark suit don't crowd out the face.
   */
  function findSpots(prep) {
    const { w, h, L } = prep;
    const long = Math.max(w, h);
    const R = Math.max(3, Math.round(long * 0.01));
    const margin = 2 * R + 2;
    const found = { R, long, spots: [], loose: 0, colorless: true };
    if (w <= 2 * margin || h <= 2 * margin) return found;

    const S = integral(L, w, h, false);
    const S2 = integral(L, w, h, true);
    const step = Math.max(2, Math.round(R / 2));
    const side = 2 * R + 1, area = side * side, third = side / 3;
    const cell = 2 * R;
    let kept = [];
    for (let level = 0; level < LIMITS.length; level++) {
      const lim = LIMITS[level];
      const best = new Map();
      for (let y = margin; y < h - margin; y += step) {
        for (let x = margin; x < w - margin; x += step) {
          const x0 = x - R, y0 = y - R;
          const s = boxSum(S, w, h, x0, y0, x0 + side, y0 + side).sum;
          const s2 = boxSum(S2, w, h, x0, y0, x0 + side, y0 + side).sum;
          const m = s / area;
          const sd = Math.sqrt(Math.max(0, s2 / area - m * m));
          if (sd > lim.sd) continue;
          let lo = Infinity, hi = -Infinity;
          for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) {
              const b = boxSum(S, w, h, Math.round(x0 + i * third), Math.round(y0 + j * third),
                Math.round(x0 + (i + 1) * third), Math.round(y0 + (j + 1) * third));
              const v = b.sum / b.n;
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          }
          if (hi - lo > lim.range) continue;
          const key = Math.floor(y / cell) * 65536 + Math.floor(x / cell);
          const score = hi - lo + sd;
          const prev = best.get(key);
          if (!prev || score < prev.score) best.set(key, { x, y, score });
        }
      }
      kept = Array.from(best.values());
      found.loose = level;
      if (kept.length >= MIN_SPOTS) break;
    }
    found.spots = kept.map((c) => describeSpot(prep, S, c.x, c.y, R, long));
    found.colorless = found.spots.every((s) => s.C < 4);
    return found;
  }

  function describeSpot(prep, S, x, y, R, long) {
    const { w, h, L, A, B, rgba } = prep;
    const ls = [];
    let a = 0, b = 0, r = 0, g = 0, bl = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const i = (y + dy) * w + x + dx;
        ls.push(L[i]);
        a += A[i]; b += B[i];
        // the spot is even, so a plain average is its color
        r += rgba[i * 4]; g += rgba[i * 4 + 1]; bl += rgba[i * 4 + 2];
      }
    }
    const k = ls.length;
    ls.sort((p, q) => p - q);
    const med = k % 2 ? ls[(k - 1) / 2] : (ls[k / 2 - 1] + ls[k / 2]) / 2;
    a /= k; b /= k;
    const C = Math.hypot(a, b);
    const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

    // Mean value of a band around the spot, 2% to 4.5% of the long side out: what the eye compares it with
    const r1 = R + Math.round(long * 0.02), r2 = r1 + Math.round(long * 0.025);
    const outer = boxSum(S, w, h, x - r2, y - r2, x + r2 + 1, y + r2 + 1);
    const inner = boxSum(S, w, h, x - r1, y - r1, x + r1 + 1, y + r1 + 1);
    const around = outer.n > inner.n ? (outer.sum - inner.sum) / (outer.n - inner.n) : med;

    // A portrait is about the face: favour skin-colored spots, and the middle and upper part of the picture
    const nx = x / w - 0.5, ny = y / h - 0.42;
    const central = 0.2 + Math.exp(-(nx * nx) / 0.08 - (ny * ny) / 0.1);
    const skin = C >= 6 && C <= 50 && hue >= 15 && hue <= 85 && med >= 15 && med <= 92;

    return {
      x, y, r: R,
      L: med, a, b, C, hue,
      warm: a * Math.cos(Study.WARM_HUE) + b * Math.sin(Study.WARM_HUE),
      around,
      rgb: { r: Math.round(r / k), g: Math.round(g / k), b: Math.round(bl / k) },
      weight: central * (skin ? 4 : 1),
      zone: -1, zoneFor: null,
    };
  }

  // The spot's value mass, or -1 if the ring (and a little around it) crosses into another mass
  function zoneOf(s) {
    const res = t.result;
    if (s.zoneFor !== res) {
      s.zoneFor = res;
      const { zone, w, h } = res;
      const z = zone[s.y * w + s.x];
      const r = s.r + 2;
      s.zone = z;
      for (let y = Math.max(0, s.y - r); y <= Math.min(h - 1, s.y + r) && s.zone >= 0; y++) {
        for (let x = Math.max(0, s.x - r); x <= Math.min(w - 1, s.x + r); x++) {
          if (zone[y * w + x] !== z) { s.zone = -1; break; }
        }
      }
    }
    return s.zone;
  }

  // Mass drill: the spot's own value sits clearly inside its mass, half a value step or more
  // from a split (less when the middle mass is narrow, so it still has spots)
  function clearOfSplits(s) {
    const z = zoneOf(s);
    if (z < 0) return false;
    const [t1, t2] = app.splits();
    const m = Math.min(5, (t2 - t1) / 4);
    return z === 0 ? s.L <= t1 - m : z === 1 ? s.L >= t1 + m && s.L <= t2 - m : s.L >= t2 + m;
  }

  function pickWeighted(list, rng) {
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].weight;
    let r = rng() * total;
    for (let i = 0; i < list.length; i++) {
      r -= list[i].weight;
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  const apart = (a, b, d) => Math.hypot(a.x - b.x, a.y - b.y) >= d;

  // Spots away from the ones already asked about this round (all of them if none are left)
  function unused(list, round) {
    const d = 0.06 * t.found.long;
    const rest = list.filter((s) => round.used.every((u) => apart(s, u, d)));
    return rest.length ? rest : list;
  }

  // ---- Questions --------------------------------------------------------------

  // Three of each mass and one more, in a shuffled order
  function massBag(rng) {
    return shuffle([0, 1, 2, 0, 1, 2, 0, 1, 2, Math.floor(rng() * 3)], rng);
  }

  function singleQuestion(round) {
    const pool = t.found.spots.filter((s) => zoneOf(s) >= 0 && (round.mode !== 'mass' || clearOfSplits(s)));
    if (!pool.length) return null;
    const fresh = unused(pool, round);
    const want = round.focus >= 0 ? round.focus : round.bag[round.answers.length % round.bag.length];
    const inMass = fresh.filter((s) => zoneOf(s) === want);
    const note = round.focus >= 0 && !inMass.length
      ? `This photo has no more even spots in its ${MASSES[round.focus]}, so this one is from another mass.`
      : '';
    return { spots: [pickWeighted(inMass.length ? inMass : fresh, round.rng)], note, picked: null };
  }

  /*
   * Pairs come in three kinds. A trap is where the eye is fooled: the wrong spot
   * looks right. A plain pair differs in color too, but the color points the right
   * way. Rounds mix the two, so "pick the grayer one" is no shortcut. Next come
   * pairs of the same color, and last easy pairs, further apart in value.
   *
   * Which is lighter: two spots 0.3 to 1 value apart (up to 1.5 for an easy pair).
   * A trap's darker spot is the more colorful one (saturated colors look lighter)
   * or stands out more against its surroundings. A plain pair differs in
   * saturation or hue the other way.
   */
  function judgeLighter(a, b) {
    const dL = Math.abs(a.L - b.L);
    if (dL < 3 || dL > 15) return null;
    const [dark, light] = a.L < b.L ? [a, b] : [b, a];
    const lureColor = dark.C - light.C;
    const lureAround = (dark.L - dark.around) - (light.L - light.around);
    const differs = Math.abs(a.C - b.C) >= 12 || (a.C >= 8 && b.C >= 8 && hueGap(a.hue, b.hue) >= 40);
    const kind = dL > 10 ? 'easy' : lureColor >= 8 || lureAround >= 12 ? 'trap' : differs ? 'plain' : 'same';
    return { kind, score: Math.max(0, lureColor) + Math.max(0, lureAround) / 2 - dL / 2 };
  }

  /*
   * Which is warmer: two spots of about the same value, 5 or more apart along the
   * warm (orange) direction. A pair is only asked when a painter can say why, and
   * the reason goes with it:
   *   hue     both have color, and the warmer sits clearly nearer orange on the wheel
   *   grayer  both are close in a warm hue (pink to yellow), and the cooler is grayer
   *   gray    the cooler is close to gray, and the warmer leans warm
   *   cool    the warmer is close to gray, and the cooler leans blue
   * Two blues that differ only in strength are left out: the stronger is the cooler,
   * which teaches nothing about hue. A strong pink against a soft orange is left out
   * too. In a trap the cooler spot is the more colorful or the lighter one. Two
   * colors beat a color against a gray.
   */
  const WARM_SIDE = 60, COOL_SIDE = 100; // degrees from orange: hues that clearly lean warm, and cool
  function judgeWarmer(a, b) {
    const dL = Math.abs(a.L - b.L);
    if (dL >= 8 || Math.abs(a.warm - b.warm) < 5) return null;
    const [warm, cool] = a.warm > b.warm ? [a, b] : [b, a];
    const fromW = hueGap(warm.hue, WARM_DEG), fromC = hueGap(cool.hue, WARM_DEG);
    const colored = warm.C >= 8 && cool.C >= 8;
    let why = null;
    if (colored && fromC - fromW >= 15) why = 'hue';
    else if (colored && hueGap(warm.hue, cool.hue) <= 20 && fromW <= fromC + 5 && fromW <= WARM_SIDE && fromC <= WARM_SIDE &&
      warm.C - cool.C >= 5) why = 'grayer';
    else if (!colored && cool.C < 8 && warm.C >= 8 && fromW <= WARM_SIDE) why = 'gray';
    else if (!colored && warm.C < 8 && cool.C >= 8 && fromC >= COOL_SIDE) why = 'cool';
    if (!why) return null;
    const lure = Math.max(0, cool.C - warm.C) + Math.max(0, cool.L - warm.L);
    const kind = dL >= 5 ? 'easy' : cool.C - warm.C >= 4 || cool.L - warm.L >= 3 ? 'trap' : 'plain';
    // a real difference in hue makes a better question than one color against a grayer one
    return { kind, why, score: (colored ? 20 : 0) + (why === 'hue' ? 10 : 0) + lure - Math.min(15, Math.abs(a.warm - b.warm)) / 3 };
  }

  function pairQuestion(round) {
    const judge = round.mode === 'lighter' ? judgeLighter : judgeWarmer;
    // near black and near white, small differences are noise and the screen's, not the subject's.
    // Color goes first in the dark, so temperature is only asked from V 2 up.
    const floor = round.mode === 'warmer' ? 20 : 10;
    const all = t.found.spots.filter((s) => s.L >= floor && s.L <= 95);
    if (all.length < 2 || t.noPairs[round.mode]) return null;
    const spots = unused(all, round);
    const long = t.found.long, minApart = 0.1 * long;
    // six traps in ten, give or take
    const rank = round.rng() < 0.6 ? { trap: 3, plain: 2, same: 1, easy: 0 } : { plain: 3, trap: 2, same: 1, easy: 0 };
    let best = null;
    const consider = (a, b) => {
      if (a === b || !apart(a, b, minApart)) return;
      const j = judge(a, b);
      if (!j) return;
      // painters compare neighbouring areas: nearer pairs score a little higher
      const near = 8 * Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / (0.5 * long));
      const score = rank[j.kind] * 1000 + j.score + near + round.rng() * 3;
      if (!best || score > best.score) best = { a, b, j, score };
    };
    for (let k = 0; k < 800; k++) consider(pickWeighted(spots, round.rng), pickWeighted(spots, round.rng));
    // nothing by chance: look through every pair before giving up on this photo
    if (!best) {
      const list = all.length > 1200 ? all.filter((s, i) => i % Math.ceil(all.length / 1200) === 0) : all;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) consider(list[i], list[j]);
    }
    if (!best) {
      t.noPairs[round.mode] = true;
      return null;
    }
    const spotsAB = round.rng() < 0.5 ? [best.a, best.b] : [best.b, best.a];
    const [A, B] = spotsAB;
    const truth = round.mode === 'lighter' ? (B.L > A.L ? 1 : 0) : (B.warm > A.warm ? 1 : 0);
    let note = '';
    if (best.j.kind === 'easy') {
      note = round.mode === 'lighter'
        ? 'This photo has few pairs close in value, so these two are further apart.'
        : 'This photo has few pairs of the same value, so these two differ a little in value too.';
    }
    return { spots: spotsAB, truth, kind: best.j.kind, why: best.j.why, note, picked: null };
  }

  // What most likely fooled the eye when a pair was answered wrong
  function lureOf(mode, picked, right) {
    if (picked.C - right.C >= 8) return 'color';
    if (mode === 'lighter' && (picked.L - picked.around) - (right.L - right.around) >= 12) return 'around';
    if (mode === 'warmer' && picked.L - right.L >= 2) return 'light';
    return null;
  }

  // ---- Answers kept between visits ---------------------------------------------

  // Rolling list of answers { mode, signedErr, zone, ts, round, lure }. Without storage they last for this visit.
  let memoryStats = [];
  let statsSaved = true;

  function readStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((a) => a && typeof a.mode === 'string' && Number.isFinite(a.signedErr)) : [];
    } catch (err) {
      return null;
    }
  }

  // Another open copy of the page may have added answers: start from the stored list
  function stats() {
    const stored = statsSaved && readStats();
    if (stored) memoryStats = stored;
    return memoryStats;
  }

  function record(entry) {
    memoryStats = stats().concat(entry).slice(-MAX_STATS);
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(memoryStats));
      statsSaved = true;
    } catch (err) {
      statsSaved = false;
    }
  }

  // Answers of the last complete round of this drill before the current one, or null
  function lastRound(mode, currentId) {
    const rounds = new Map();
    stats().forEach((a) => {
      if (a.mode !== mode || a.round === currentId) return;
      if (!rounds.has(a.round)) rounds.set(a.round, []);
      rounds.get(a.round).push(a);
    });
    let best = null;
    rounds.forEach((list, id) => {
      if (list.length >= ROUND && (best === null || id > best.id)) best = { id, list };
    });
    return best && best.list;
  }

  // ---- Round flow ---------------------------------------------------------------

  function startRound(seed) {
    if (!t.prep) return;
    if (!t.found) t.found = findSpots(t.prep);
    if (seed == null) seed = (Date.now() ^ Math.imul(++t.seeds, 0x9e3779b9)) >>> 0;
    const rng = mulberry32(seed);
    t.lastId = Math.max(Date.now(), t.lastId + 1);
    t.round = {
      id: t.lastId,
      seed,
      mode: t.mode,
      focus: t.mode === 'value' ? t.focus : -1,
      rng,
      bag: massBag(rng),
      used: [],
      answers: [],
      q: null,
      done: false,
    };
    nextQuestion();
  }

  function nextQuestion() {
    const r = t.round;
    t.gray = false;
    if (r.answers.length >= ROUND) {
      r.done = true;
      r.q = null;
    } else {
      const single = r.mode === 'value' || r.mode === 'mass';
      r.q = t.found.spots.length ? (single ? singleQuestion(r) : pairQuestion(r)) : null;
      if (r.q) r.used.push(...r.q.spots);
    }
    renderRound();
  }

  // fromKey: answered with a shortcut key, so focus follows to Next wherever it was
  function answer(choice, fromKey) {
    const r = t.round;
    const q = r && r.q;
    if (!q || q.picked != null) return;
    const hadFocus = fromKey || els.panel.contains(document.activeElement);
    q.picked = choice;
    const s = q.spots[0];
    let entry;
    if (r.mode === 'value') {
      // graded on the value as shown, to one decimal, so "off by 1.0" is always "close"
      q.err = Math.round((choice - s.L / 10) * 10) / 10;
      const off = Math.abs(q.err);
      q.grade = off <= SPOT_ON ? 'on' : off <= CLOSE ? 'close' : 'off';
      entry = { mode: 'value', signedErr: q.err, zone: zoneOf(s) };
    } else if (r.mode === 'mass') {
      // the splits may have moved since the spot was picked: the mass is read now
      const [t1, t2] = app.splits();
      q.truth = zoneOf(s) >= 0 ? zoneOf(s) : s.L < t1 ? 0 : s.L < t2 ? 1 : 2;
      q.grade = choice === q.truth ? 'on' : 'off';
      entry = { mode: 'mass', signedErr: choice - q.truth, zone: q.truth };
    } else {
      q.grade = choice === q.truth ? 'on' : 'off';
      q.lure = q.grade === 'off' ? lureOf(r.mode, q.spots[choice], q.spots[q.truth]) : null;
      entry = { mode: r.mode, signedErr: q.grade === 'on' ? 0 : 1, zone: -1, lure: q.lure };
    }
    entry.ts = Date.now();
    entry.round = r.id;
    record(entry);
    r.answers.push(Object.assign({ grade: q.grade }, entry));
    renderRound();

    const next = els.feedback.querySelector('[data-next]');
    if (next && hadFocus) next.focus({ preventScroll: true });
    // on a phone the card can land below the fold: bring it up, but not so far that the rings
    // and their labels leave the top of the screen, since the answer is read off the photo
    const card = els.feedback.firstElementChild;
    const below = card ? card.getBoundingClientRect().bottom + 8 - window.innerHeight : 0;
    if (below > 0) {
      const room = ringsTop() - 8;
      const by = room > 0 ? Math.min(below, room) : below;
      if (by > 0) window.scrollBy({ top: by, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  // Top of the highest ring with its label (drawn above it by tag()), in viewport px
  function ringsTop() {
    const q = t.round && t.round.q;
    const c = els.canvas, rect = c.getBoundingClientRect();
    if (!q || !c.width) return rect.top;
    const k = rect.width / c.width;
    const tops = q.spots.map((s) => (s.y + 0.5) * k - (Math.max(RING_MIN, s.r * k) + 3) - 24);
    return rect.top + Math.max(0, Math.min(...tops));
  }

  function next(fromKey) {
    const r = t.round;
    if (!r || !r.q || r.q.picked == null) return;
    const hadFocus = fromKey || els.panel.contains(document.activeElement);
    nextQuestion();
    // focus goes to the answers as a group, not to the first answer, so a second Enter can't answer V 0
    if (hadFocus) {
      const target = r.done ? els.summary.querySelector('button') : els.answers;
      if (target) target.focus({ preventScroll: true });
    }
    // bring the question and the photo back into view if reading the answer scrolled them away
    if (els.head.getBoundingClientRect().top < 0) {
      els.head.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function toggleGray() {
    const q = t.round && t.round.q;
    if (!q || q.picked == null) return;
    t.gray = !t.gray;
    drawPhoto();
    const btn = els.feedback.querySelector('[data-gray]');
    if (btn) {
      btn.setAttribute('aria-pressed', t.gray);
      btn.textContent = t.gray ? 'Back to color' : 'See the photo in gray';
    }
  }

  // ---- Drawing --------------------------------------------------------------------

  function grayImage(prep) {
    if (t.grayOf !== prep) {
      const lut = new Uint8ClampedArray(1001);
      for (let i = 0; i <= 1000; i++) lut[i] = Study.grayForL(i / 10);
      const out = new Uint8ClampedArray(prep.w * prep.h * 4);
      for (let i = 0, p = 0; i < prep.L.length; i++, p += 4) {
        const g = lut[Math.max(0, Math.min(1000, Math.round(prep.L[i] * 10)))];
        out[p] = out[p + 1] = out[p + 2] = g;
        out[p + 3] = 255;
      }
      t.grayOf = prep;
      t.grayImg = out;
    }
    return t.grayImg;
  }

  function drawPhoto() {
    const prep = t.prep;
    if (!prep) return;
    const q = t.round && t.round.q;
    const gray = t.gray && !!q && q.picked != null;
    if (!t.drawn || t.drawn.prep !== prep || t.drawn.gray !== gray) {
      const c = els.canvas;
      c.width = prep.w;
      c.height = prep.h;
      c.getContext('2d').putImageData(new ImageData(gray ? grayImage(prep) : prep.rgba, prep.w, prep.h), 0, 0);
      t.drawn = { prep, gray };
    }
    drawRings();
  }

  // Ring labels: A and B on a pair; after the answer, what each spot really is
  function ringLabel(round, q, i) {
    const s = q.spots[i];
    const pair = q.spots.length > 1;
    if (q.picked == null) return pair ? LETTERS[i] : '';
    if (round.mode === 'value') return V(s.L);
    if (round.mode === 'mass') return ZONE_NAMES[q.truth];
    if (round.mode === 'lighter') return `${LETTERS[i]} · ${V(s.L)}`;
    return i === q.truth ? `${LETTERS[i]} · warmer` : LETTERS[i];
  }

  // Rings sit just outside the spot so they don't cover it: a white line edged in black shows on any color
  function drawRings() {
    const c = els.canvas, o = els.rings;
    const w = c.offsetWidth, h = c.offsetHeight;
    o.style.left = c.offsetLeft + 'px';
    o.style.top = c.offsetTop + 'px';
    o.style.width = w + 'px';
    o.style.height = h + 'px';
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (o.width !== W || o.height !== H) { o.width = W; o.height = H; }
    const g = o.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const round = t.round;
    const q = round && round.q;
    if (!q || !w || !c.width) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = w / c.width;
    q.spots.forEach((s, i) => {
      const x = (s.x + 0.5) * k, y = (s.y + 0.5) * k;
      const r = Math.max(RING_MIN, s.r * k) + 3;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = '#ffffff';
      g.stroke();
      const text = ringLabel(round, q, i);
      if (text) tag(g, text, x, y, r, w, h);
    });
  }

  // A small white label above and to the right of a ring, kept inside the picture
  function tag(g, text, x, y, r, w, h) {
    const font = 12;
    g.font = `600 ${font}px "IBM Plex Mono", ui-monospace, monospace`;
    const pw = g.measureText(text).width + 12, ph = font + 8;
    let px = x + r * 0.7 + 2, py = y - r * 0.7 - ph - 2;
    if (px + pw > w - 2) px = x - r * 0.7 - pw - 2;
    if (py < 2) py = y + r * 0.7 + 2;
    px = Math.max(2, Math.min(w - pw - 2, px));
    py = Math.max(2, Math.min(h - ph - 2, py));
    g.beginPath();
    if (g.roundRect) g.roundRect(px, py, pw, ph, ph / 2);
    else g.rect(px, py, pw, ph);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#1c1d20';
    g.stroke();
    g.fillStyle = '#1c1d20';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, px + pw / 2, py + ph / 2 + 0.5);
  }

  // ---- Panel ------------------------------------------------------------------------

  function syncModeControls() {
    els.modes.forEach((input) => { input.checked = input.value === t.mode; });
    els.focusField.hidden = t.mode !== 'value';
    els.focus.value = String(t.focus);
  }

  function renderRound() {
    const r = t.round;
    if (!r) return;
    drawPhoto();
    renderHead();
    const unavailable = !r.done && !r.q;
    els.empty.hidden = !unavailable;
    els.layout.classList.toggle('is-done', r.done);
    if (unavailable) renderEmpty();
    els.summary.hidden = !r.done;
    if (r.done) renderSummary();
    renderAnswers();
    renderFeedback();
  }

  function renderHead() {
    const r = t.round, m = MODES[r.mode];
    const n = r.answers.length;
    const only = r.focus >= 0 ? ` · ${MASSES[r.focus]} only` : '';
    els.count.textContent = r.done ? `Round of ${ROUND} done${only}` : `${m.unit} ${Math.min(n + (r.q && r.q.picked != null ? 0 : 1), ROUND)} of ${ROUND}${only}`;
    els.progress.hidden = !r.done && !r.q; // a drill this photo can't run has no progress to show
    els.pips.innerHTML = '';
    for (let i = 0; i < ROUND; i++) {
      const li = el('li');
      if (i < n) li.className = 'is-' + r.answers[i].grade;
      else if (i === n && r.q && r.q.picked == null) li.className = 'is-now';
      els.pips.append(li);
    }
    els.prompt.textContent = r.done ? 'How you did' : m.prompt;
    els.help.textContent = r.done || !r.q ? '' : m.help;
    els.help.hidden = !els.help.textContent;
    const notes = [];
    if (r.q && r.q.note) notes.push(r.q.note);
    if (r.q && t.found.loose) notes.push('This photo is busy, so some spots are less even than usual.');
    els.note.textContent = notes.join(' ');
    els.note.hidden = !notes.length;
  }

  function renderEmpty() {
    const r = t.round;
    let title = 'No pairs to compare', text;
    if (!t.found.spots.length) {
      title = 'No even spots to ask about';
      text = 'This photo is too small or too busy to find spots of one clear value. Try a larger or sharper portrait.';
    } else if (r.mode === 'mass') {
      title = 'No spots clearly inside a mass';
      text = 'Every even spot sits close to one of your splits. Try moving the splits in Values, or another drill.';
    } else if (r.mode === 'warmer' && t.found.colorless) {
      title = 'This photo has no color';
      text = 'It is black and white, so there is no temperature to compare. Load a color photo, or try another drill.';
    } else if (r.mode === 'warmer') {
      text = 'This photo has no two even spots of about the same value with a clear difference in temperature. Try another drill.';
    } else {
      text = 'No two even spots in this photo are a fair distance apart in value, 0.3 to 1.5 steps. Try What value? instead.';
    }
    els.empty.querySelector('h3').textContent = title;
    els.empty.querySelector('p').textContent = text;
  }

  function renderAnswers() {
    const r = t.round, q = r.q;
    els.answers.innerHTML = '';
    els.answers.hidden = !q;
    if (!q) return;
    const answered = q.picked != null;
    const mark = (b, i, truth) => {
      if (!answered) return;
      b.disabled = true;
      if (i === truth) b.classList.add('is-truth');
      if (i === q.picked) b.classList.add('is-picked');
    };

    if (r.mode === 'value') {
      const row = el('div', 'eye-steps');
      const truth = Math.max(0, Math.min(10, Math.round(q.spots[0].L / 10)));
      for (let v = 0; v <= 10; v++) {
        const b = el('button', 'eye-step', String(v));
        b.type = 'button';
        const g = Study.grayForL(v * 10);
        b.style.setProperty('--c', `rgb(${g},${g},${g})`);
        b.style.setProperty('--t', v < 6 ? '#ffffff' : '#111111');
        let label = 'V\u00a0' + v;
        if (answered && v === q.picked) label += ', your answer';
        if (answered && v === truth) label += ', nearest the value in this photo';
        b.setAttribute('aria-label', label);
        mark(b, v, truth);
        b.addEventListener('click', () => answer(v));
        row.append(b);
      }
      els.answers.append(row);
      return;
    }

    if (r.mode === 'mass') {
      const row = el('div', 'eye-choices eye-choices-3');
      ZONE_NAMES.forEach((name, z) => {
        const b = el('button', 'btn eye-choice');
        b.type = 'button';
        const tone = el('span', 'eye-tone');
        const g = t.result.zoneGray[z];
        tone.style.background = `rgb(${g},${g},${g})`;
        b.append(tone, document.createTextNode(name));
        mark(b, z, q.truth);
        b.addEventListener('click', () => answer(z));
        row.append(b);
      });
      els.answers.append(row);
      return;
    }

    const row = el('div', 'eye-choices');
    const word = r.mode === 'lighter' ? 'lighter' : 'warmer';
    LETTERS.forEach((letter, i) => {
      const b = el('button', 'btn eye-choice', `${letter} is ${word}`);
      b.type = 'button';
      mark(b, i, q.truth);
      b.addEventListener('click', () => answer(i));
      row.append(b);
    });
    els.answers.append(row);
  }

  // A spot's color beside the gray of the same value, on the neutral matte
  function swatch(s, caption, withGray) {
    const fig = el('figure', 'eye-swatch');
    const well = el('div', 'eye-well');
    const color = el('span', 'eye-chip');
    color.style.background = `rgb(${s.rgb.r},${s.rgb.g},${s.rgb.b})`;
    color.title = 'The spot';
    well.append(color);
    if (withGray) {
      const g = Study.grayForL(s.L);
      const gray = el('span', 'eye-chip');
      gray.style.background = `rgb(${g},${g},${g})`;
      gray.title = 'Its value in gray';
      well.append(gray);
    }
    fig.append(well, el('figcaption', null, caption));
    return fig;
  }

  // Why a guess was likely off, when the photo shows a known cause. dir: 1 guessed too light, -1 too dark.
  function causes(s, dir, zone) {
    const out = [];
    if (dir > 0 && s.C > 25) out.push(`Saturated ${hueName(s.hue)}s read lighter than they are.`);
    if (dir > 0 && s.L - s.around > 25) out.push(`It sits against darker tones (about ${V(s.around)}), which make it look lighter.`);
    if (dir < 0 && s.around - s.L > 25) out.push(`It sits among lighter tones (about ${V(s.around)}), which make it look darker.`);
    if (!out.length && dir > 0 && zone === 0) out.push('Shadows tend to look lighter than they are. Squint: they merge into one dark shape.');
    if (!out.length && dir < 0 && zone === 2) out.push('Lights tend to look darker than they are. Squint: they merge into one light shape.');
    return out;
  }

  // Why the darker spot of a pair can look the lighter one: it stands out against darker
  // surroundings, or the lighter spot sits among lighter ones
  function surroundings(dark, light, D, Lt) {
    return dark.L - dark.around >= light.around - light.L
      ? `${D} stands out against darker surroundings, which make it look lighter.`
      : `${Lt} sits among lighter tones, which make it look darker.`;
  }

  // How the warmer spot differs from the cooler one, in words, for the reason judgeWarmer found
  function whyWarmer(why, warm, cool, W, C) {
    const wn = hueName(warm.hue), cn = hueName(cool.hue);
    if (why === 'gray') return `${W} has more ${wn} in it; ${C} is close to gray.`;
    if (why === 'cool') return `${C} leans ${cn}, which reads cooler than ${W}'s near gray.`;
    if (why === 'grayer') return `They are close in hue, but ${C} is grayer, and a grayer ${wn} reads cooler.`;
    if (wn !== cn) return `${W} leans ${wn}, ${C} leans ${cn}.`;
    // the same name for both: name the hue the cooler one turns toward, away from orange
    const dir = ((cool.hue - WARM_DEG + 540) % 360) - 180 > 0 ? 1 : -1;
    for (let d = 5; hueGap(cool.hue + dir * d, WARM_DEG) > hueGap(cool.hue, WARM_DEG); d += 5) {
      const toward = hueName((cool.hue + dir * d + 360) % 360);
      if (toward !== cn) return `Both are ${wn}, but ${C} leans further toward ${toward}.`;
    }
    return `Both are ${wn}, but ${W} sits nearer orange on the color wheel.`;
  }

  function renderFeedback() {
    els.feedback.innerHTML = '';
    const r = t.round, q = r.q;
    if (!q || q.picked == null) return;
    const card = el('div', 'eye-card');
    const top = el('div', 'eye-card-top');
    const swatches = el('div', 'eye-swatches');
    const text = el('div', 'eye-verdict');
    const right = q.grade === 'on';
    let grade, line;
    let notes = [];
    const s = q.spots[0];

    if (r.mode === 'value') {
      const off = Math.abs(q.err);
      grade = q.grade === 'on' ? 'Spot on' : q.grade === 'close' ? 'Close' : `Off by ${off.toFixed(1)}`;
      line = `It's ${V(s.L)} in this photo. You said ${q.picked}` +
        (off >= 0.05 ? `, ${off.toFixed(1)} too ${q.err > 0 ? 'light' : 'dark'}.` : '.');
      if (q.grade !== 'on') notes = causes(s, q.err > 0 ? 1 : -1, zoneOf(s));
      swatches.append(swatch(s, 'The spot and its gray', true));
    } else if (r.mode === 'mass') {
      const z = q.truth;
      const [t1, t2] = app.splits();
      const where = z === 0 ? `below your shadow / middle split at ${V(t1)}`
        : z === 1 ? `between your splits at ${V(t1)} and ${V(t2)}`
          : `above your middle / light split at ${V(t2)}`;
      grade = right ? 'Right' : 'Not quite';
      line = `It's in the ${ZONE_NAMES[z].toLowerCase()} mass: ${V(s.L)} in this photo, ${where}.` +
        (right ? '' : ` You said ${ZONE_NAMES[q.picked].toLowerCase()}.`);
      if (!right) notes = causes(s, q.picked > z ? 1 : -1, z);
      swatches.append(swatch(s, 'The spot and its gray', true));
    } else {
      const win = q.truth, lose = 1 - win;
      const W = LETTERS[win], P = LETTERS[q.picked];
      const [ws, ls] = [q.spots[win], q.spots[lose]];
      grade = right ? 'Right' : 'Not this time';
      if (r.mode === 'lighter') {
        line = `${W} is lighter: ${V(ws.L)} against ${V(ls.L)} in this photo.`;
        if (!right && q.lure === 'color') notes.push(`${P} is more colorful, and colorful spots read lighter than they are.`);
        else if (!right && q.lure === 'around') notes.push(surroundings(ls, ws, P, W));
        else if (!right) notes.push(`They are ${(valueLabel(ws.L) - valueLabel(ls.L)).toFixed(1)} apart on the value scale. Squint: color fades and the difference in value shows.`);
        else if (q.kind === 'trap' && ls.C - ws.C >= 8) notes.push(`Well seen: ${LETTERS[lose]} is more colorful, which makes it look lighter than it is.`);
        else if (q.kind === 'trap') notes.push('Well seen: ' + surroundings(ls, ws, LETTERS[lose], W));
        q.spots.forEach((p, i) => swatches.append(swatch(p, `${LETTERS[i]} · ${V(p.L)}`, true)));
      } else {
        line = `${W} is warmer. ${whyWarmer(q.why, ws, ls, W, LETTERS[lose])}`;
        const cooler = q.why === 'cool' ? `${hueName(ls.hue)} is a cool color` : `${W} sits nearer orange on the color wheel`;
        if (!right && q.lure === 'color') notes.push(`${P} is more colorful, but ${cooler}.`);
        else if (!right && q.lure === 'light') notes.push(`${P} is lighter, but lighter isn't warmer.`);
        else if (right && q.kind === 'trap' && ls.C - ws.C >= 4) notes.push(`Well seen: ${LETTERS[lose]} is more colorful, but not warmer.`);
        else if (right && q.kind === 'trap') notes.push(`Well seen: ${LETTERS[lose]} is lighter, but not warmer.`);
        q.spots.forEach((p, i) => swatches.append(swatch(p, i === win ? `${LETTERS[i]} · warmer` : LETTERS[i], false)));
      }
    }

    const strong = el('strong', 'eye-grade' + (right ? ' is-good' : ''), grade);
    text.append(strong, el('p', null, line));
    notes.forEach((n) => text.append(el('p', 'eye-cause', n)));
    top.append(swatches, text);

    const actions = el('div', 'eye-card-actions');
    const grayBtn = el('button', 'btn btn-small', t.gray ? 'Back to color' : 'See the photo in gray');
    grayBtn.type = 'button';
    grayBtn.dataset.gray = '';
    grayBtn.setAttribute('aria-pressed', t.gray);
    grayBtn.addEventListener('click', toggleGray);
    const last = r.answers.length >= ROUND;
    const nextBtn = el('button', 'btn btn-primary', last ? 'See how you did' : MODES[r.mode].next);
    nextBtn.type = 'button';
    nextBtn.dataset.next = '';
    nextBtn.addEventListener('click', () => next());
    actions.append(grayBtn, nextBtn);
    card.append(top, actions);
    els.feedback.append(card);
  }

  // ---- Round summary ------------------------------------------------------------------

  function biasText(bias) {
    return Math.abs(bias) < 0.3 ? 'about right' : `${Math.abs(bias).toFixed(1)} too ${bias > 0 ? 'light' : 'dark'}`;
  }

  // Mean signed error per mass: [{ zone, n, bias }] for the masses that have answers
  function biasByMass(list) {
    return [0, 1, 2].map((z) => {
      const errs = list.filter((a) => a.zone === z).map((a) => a.signedErr);
      return { zone: z, n: errs.length, bias: mean(errs) };
    }).filter((b) => b.n);
  }

  // One mass in the summary: its gray, its name, how the answers went, and how many there were
  function biasRow(b, detail, count) {
    const li = el('li');
    const tone = el('span', 'eye-tone');
    const g = t.result.zoneGray[b.zone];
    tone.style.background = `rgb(${g},${g},${g})`;
    li.append(tone, el('strong', null, ZONE_NAMES[b.zone] + 's'), el('span', null, detail));
    if (count) li.append(el('small', null, plural(b.n, 'spot')));
    return li;
  }

  function renderSummary() {
    const r = t.round, box = els.summary;
    box.innerHTML = '';
    const ans = r.answers;
    const prev = lastRound(r.mode, r.id);
    const history = stats().filter((a) => a.mode === r.mode);
    const figure = el('div', 'eye-score');
    const lines = [];
    let list = null, advice = '', longRun = '', longRunAdvice = false, drill = -1;

    if (r.mode === 'value') {
      const miss = mean(ans.map((a) => Math.abs(a.signedErr)));
      figure.append(el('span', 'score-num', miss.toFixed(1)), el('span', 'score-of', 'average miss, in values'));
      const count = (g) => ans.filter((a) => a.grade === g).length;
      lines.push(`${count('on')} spot on · ${count('close')} close · ${count('off')} off`);
      if (prev) {
        const was = mean(prev.map((a) => Math.abs(a.signedErr)));
        const d = was - miss;
        lines.push(`Last round you missed by ${was.toFixed(1)} on average. ` +
          (Math.abs(d) < 0.05 ? 'The same this time.' : d > 0 ? `This time you were ${d.toFixed(1)} closer.` : `This time you were ${(-d).toFixed(1)} further off.`));
      }
      const masses = biasByMass(ans);
      list = el('ul', 'eye-bias');
      masses.forEach((b) => list.append(biasRow(b, biasText(b.bias), true)));
      // advice comes from the long run once there is enough of it, so one odd round doesn't decide it.
      // It then follows the long-run line and says so, since its number can differ from this round's rows.
      longRunAdvice = history.length >= 3 * ROUND;
      const basis = longRunAdvice ? biasByMass(history) : masses;
      const worst = basis.filter((b) => b.n >= 2).sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))[0];
      if (worst && Math.abs(worst.bias) >= 0.4) {
        const light = worst.bias > 0;
        const reads = `${MASSES[worst.zone]} read ${Math.abs(worst.bias).toFixed(1)} ${light ? 'lighter' : 'darker'} to you than they are`;
        advice = (longRunAdvice ? `Over those ${history.length} answers, your ${reads}.` : `Your ${reads} this round.`) +
          ` When you paint, take them ${light ? 'darker' : 'lighter'} than they look.`;
        if (r.focus !== worst.zone) drill = worst.zone;
      }
      if (history.length > ans.length) {
        longRun = `Across your last ${history.length} value answers: ` +
          biasByMass(history).map((b) => `${MASSES[b.zone]} ${biasText(b.bias)}`).join(' · ') + '.';
      }
    } else {
      const right = ans.filter((a) => a.grade === 'on').length;
      figure.append(el('span', 'score-num', `${right}`), el('span', 'score-of', `of ${ROUND} right`));
      if (prev) {
        const was = prev.filter((a) => a.signedErr === 0).length;
        const d = right - was;
        lines.push(`Last round: ${was} of ${ROUND}. ` +
          (d === 0 ? 'The same this time.' : `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} right this time.`));
      }
      const misses = ans.filter((a) => a.grade !== 'on');

      if (r.mode === 'mass') {
        list = el('ul', 'eye-bias');
        [0, 1, 2].forEach((z) => {
          const own = ans.filter((a) => a.zone === z);
          if (!own.length) return;
          const ok = own.filter((a) => a.signedErr === 0).length;
          const wrong = own.filter((a) => a.signedErr !== 0).map((a) => ZONE_NAMES[z + a.signedErr].toLowerCase());
          const called = Array.from(new Set(wrong)).map((name) => `${wrong.filter((w) => w === name).length} called ${name}`);
          list.append(biasRow({ zone: z, n: own.length }, [`${ok} of ${own.length} right`].concat(called).join(', ')));
        });
        // shadows and lights both called middle squeeze the values together, middles called both
        // shadow and light spread them apart: neither is a lean one way
        const squeeze = misses.filter((a) => a.zone !== 1 && a.zone + a.signedErr === 1);
        const spread = misses.filter((a) => a.zone === 1);
        const bothWays = (group) => group.some((a) => a.signedErr > 0) && group.some((a) => a.signedErr < 0);
        const up = misses.filter((a) => a.signedErr > 0).length, down = misses.length - up;
        if (bothWays(squeeze) && 2 * squeeze.length > misses.length) {
          advice = 'You tend to call shadows and lights middle, which squeezes the values together. Squint: the shadows merge into one dark shape and the lights into one light shape, further apart than they seem.';
        } else if (bothWays(spread) && 2 * spread.length > misses.length) {
          advice = 'You tend to push middle tones out into the shadows and the lights. Squint and compare each spot with the darkest and lightest parts of the photo.';
        } else if (misses.length >= 2 && up !== down) {
          advice = up > down
            ? 'You tend to put spots in a lighter mass than your splits do. Squint and compare each spot with the darkest and lightest parts of the photo.'
            : 'You tend to put spots in a darker mass than your splits do. Squint and compare each spot with the darkest and lightest parts of the photo.';
        }
      } else {
        const color = misses.filter((a) => a.lure === 'color').length;
        const other = misses.filter((a) => a.lure === (r.mode === 'lighter' ? 'around' : 'light')).length;
        if (misses.length) {
          const parts = [];
          if (color) parts.push(`${color} picked the more colorful spot`);
          if (other) parts.push(r.mode === 'lighter' ? `${other} ${other === 1 ? 'was' : 'were'} thrown by the surroundings` : `${other} ${color ? '' : 'picked '}the lighter one`);
          if (parts.length) lines.push(`Of your ${misses.length} ${misses.length === 1 ? 'miss' : 'misses'}, ${parts.join(' and ')}.`);
        }
        if (r.mode === 'lighter') {
          if (color && color >= other) advice = 'Color makes a spot look lighter than it is. Squint to compare values: color fades first.';
          else if (other) advice = 'Dark surroundings make a spot look lighter, light ones make it look darker. Compare the two spots with each other, not with what is around them.';
        } else if (color && color >= other) {
          advice = 'A strong color isn\'t always a warm one: ask which spot leans toward orange, and which toward pink, yellow, green, blue or gray.';
        } else if (other) {
          advice = 'Lighter isn\'t warmer: compare the color of the two spots, not their value.';
        }
        if (history.length > ans.length) {
          const ok = history.filter((a) => a.signedErr === 0).length;
          longRun = `Across your last ${history.length} pairs: ${Math.round((ok / history.length) * 100)}% right.`;
        }
      }
    }

    box.append(figure);
    lines.forEach((l, i) => box.append(el('p', i ? 'hint' : null, l)));
    if (list) box.append(list);
    // advice from the long run follows the long-run figures it is based on
    if (longRun && longRunAdvice) box.append(el('p', 'hint', longRun));
    if (advice) box.append(el('p', 'eye-advice', advice));
    if (longRun && !longRunAdvice) box.append(el('p', 'hint', longRun));

    const actions = el('div', 'eye-card-actions');
    const again = el('button', 'btn btn-primary', 'Start a new round');
    again.type = 'button';
    again.addEventListener('click', () => { startRound(); focusAnswers(); });
    actions.append(again);
    if (drill >= 0) {
      const b = el('button', 'btn', `Drill ${MASSES[drill]} only`);
      b.type = 'button';
      b.addEventListener('click', () => { start('value', drill); focusAnswers(); });
      actions.append(b);
    } else if (r.focus >= 0) {
      const b = el('button', 'btn', 'Drill all masses');
      b.type = 'button';
      b.addEventListener('click', () => { start('value', -1); focusAnswers(); });
      actions.append(b);
    }
    box.append(actions);
  }

  function focusAnswers() {
    if (!els.answers.hidden) els.answers.focus({ preventScroll: true });
    if (els.head.getBoundingClientRect().top < 0) els.head.scrollIntoView({ block: 'start' });
  }

  // ---- Events ---------------------------------------------------------------------------

  els.modes.forEach((input) =>
    input.addEventListener('change', () => {
      if (!input.checked) return;
      t.mode = input.value;
      syncModeControls();
      startRound();
    })
  );
  els.focus.addEventListener('change', () => {
    t.focus = +els.focus.value;
    startRound();
  });

  // Tapping near a ring answers a pair
  els.canvas.addEventListener('click', (e) => {
    const q = t.round && t.round.q;
    if (!q || q.picked != null || q.spots.length < 2) return;
    const rect = els.canvas.getBoundingClientRect();
    const k = rect.width / els.canvas.width;
    let best = -1, bd = Infinity;
    q.spots.forEach((s, i) => {
      const d = Math.hypot(e.clientX - rect.left - (s.x + 0.5) * k, e.clientY - rect.top - (s.y + 0.5) * k);
      if (d < bd) { bd = d; best = i; }
    });
    if (bd <= Math.max(RING_MIN, q.spots[best].r * k) + 24) answer(best);
  });

  window.addEventListener('keydown', (e) => {
    if (!visible() || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (document.querySelector('dialog[open]')) return;
    const active = document.activeElement;
    const tag = active ? active.tagName : '';
    if (/^(SELECT|TEXTAREA)$/.test(tag) || (tag === 'INPUT' && !/^(radio|range|checkbox)$/.test(active.type))) return;
    const r = t.round, q = r && r.q;
    if (!q) return;
    const key = e.key.toLowerCase();
    if (q.picked == null) {
      let choice;
      if (r.mode === 'value' && /^[0-9]$/.test(key)) choice = +key;
      else if ((r.mode === 'lighter' || r.mode === 'warmer') && (key === 'a' || key === 'b')) choice = key === 'a' ? 0 : 1;
      else if (r.mode === 'mass') choice = { s: 0, m: 1, l: 2, 1: 0, 2: 1, 3: 2 }[key];
      if (choice == null) return;
      e.preventDefault();
      answer(choice, true);
    } else if (key === 'n' || (key === 'enter' && !/^(BUTTON|A|INPUT|SUMMARY)$/.test(tag))) {
      e.preventDefault();
      next(true);
    } else if (key === 'g') {
      e.preventDefault();
      toggleGray();
    }
  });

  // the rings follow the photo when it resizes, or moves inside a matte that resizes around it
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(drawRings);
    ro.observe(els.canvas);
    ro.observe(els.canvas.parentElement);
  } else {
    window.addEventListener('resize', drawRings);
  }

  // ---- API for app.js ----------------------------------------------------------------------

  // A new reference (or working size): the spots and the round start over
  function reset() {
    t.found = null;
    t.noPairs = {};
    t.round = null;
    t.gray = false;
    t.drawn = null;
  }

  // Called after every run(): picks up a new photo, or new masses from changed settings
  function update() {
    const { prep, result } = app.state;
    if (!prep || !result) return;
    if (prep !== t.prep) {
      t.prep = prep;
      t.result = result;
      reset();
    } else if (result !== t.result) {
      t.result = result;
      // the mass drill follows the splits: a question that is no longer clear-cut is swapped
      // for another, and one that found no spot tries again
      const r = t.round, q = r && r.q;
      if (r && r.mode === 'mass' && !r.done) {
        if (!q || (q.picked == null && !clearOfSplits(q.spots[0]))) {
          if (q) r.used.pop();
          nextQuestion();
        } else {
          renderRound();
        }
      }
    }
    if (visible()) render();
  }

  // Draws the tab; starts a round the first time it is shown for a photo
  function render() {
    if (!t.prep || !visible()) return;
    syncModeControls();
    if (!t.round) startRound();
    else drawPhoto();
  }

  // Starts a round of one drill, such as value spots from the shadows only (focus 0)
  function start(mode, focus) {
    t.mode = mode;
    if (focus != null) t.focus = focus;
    syncModeControls();
    startRound();
  }

  window.EyeTrainer = {
    attach(state, splits) { app = { state, splits }; },
    update,
    render,
    reset,
    start,
  };
})();
