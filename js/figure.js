/*
 * Figure study: drawing the wooden figure from the pose library, the way an art class draws from a
 * model. A class is Relaxed (no clock: tap Next pose when you are ready) or Timed (a new pose every
 * 10 s, 30 s, 1, 5 or 10 minutes, each on a fresh sheet). The Pose and light page draws the pictures
 * (pose.html?render=1, in a hidden frame): the library's buttons, and each pose's reference with
 * where its joints land in it. The drawing is done on a second copy of the Studio (painting.js),
 * with its own paper.
 *
 * Analyze lays the pose's gesture over the drawing: a stick figure from the model's own joints, the
 * line of action through it, and the tilt of the shoulders and the hips. It is fitted to the marks on
 * the paper, and a part with no marks near it is dashed. At the end of a class every drawing comes
 * back beside its pose, with its gesture.
 */
(function () {
  'use strict';
  const panel = document.getElementById('tab-figure');
  if (!panel || !window.PaintStudio || !PaintStudio.create) return;
  const $ = (id) => document.getElementById('fig-' + id);
  const KEY = 'portrait-value-studio.figureStudy';
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const TIMES = { 10: '10 s', 30: '30 s', 60: '1 min', 300: '5 min', 600: '10 min' };
  const half = (v) => { const r = Math.round(v * 2) / 2, w = Math.floor(r); return r - w ? `${w || ''}½` : String(w); };
  // a length of time in words: 50 s, 2½ min, 1½ hours
  function span(s) {
    if (s < 60) return `${s} s`;
    if (s < 120 * 60) return `${half(s / 60)} min`;
    return `${half(s / 3600)} hours`;
  }

  // ---- The paper: a copy of the Studio ------------------------------------------------------------

  const root = PaintStudio.copyMarkup('fs-');
  root.classList.add('fig-studio');
  root.hidden = true;
  panel.appendChild(root);
  root.insertBefore($('bar'), root.firstChild);
  document.getElementById('fs-stage').append($('notes'), $('banner'));
  const studio = PaintStudio.create({
    root, prefix: 'fs-', bodyClass: 'figure-focus', followStudy: false, autosave: false, overlay: true,
    mixesKey: 'portrait-value-studio.figureMixes', fileName: 'figure-drawing.png', refSize: 0.42,
    refViewHint: 'Values shows the pose in dark, middle and light. Blocks shows its big shapes of light and shadow.',
    state: { tool: 'pencil', lastBrush: 'pencil', lead: 'charcoal', hard: 'medium', pencil: 4 },
    canvas: { weave: 'paper' },
    onExit: () => endClass(),
    onLocked: () => Studio.toast('Pencils down: the next pose is coming'),
    onPaper: () => { if (shownAnalysis) analyzeNow(); },
  });

  // ---- The pictures: Pose and light, in a hidden frame --------------------------------------------

  const frame = $('render');
  let poses = null, groups = [], failed = false, req = 0;
  const thumbs = new Map(), shots = new Map(), pending = new Map();
  const byId = (id) => poses && poses.find((q) => q.id === id);
  function openFrame() {
    if (frame.getAttribute('src')) return;
    frame.setAttribute('src', frame.dataset.src);
    setTimeout(() => { if (!poses) noPictures(); }, 25000);
  }
  function noPictures() {
    if (failed) return;
    failed = true;
    $('libNote').textContent = 'The poses could not be drawn here: Pose and light needs WebGL (3D drawing), which this browser has turned off or does not have.';
    showSetup();
  }
  const tellFrame = (msg) => { if (frame.contentWindow) frame.contentWindow.postMessage(msg, '*'); };
  const isPicture = (u) => typeof u === 'string' && /^data:image\/(jpeg|png);base64,/.test(u);
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'pose-and-light:ready') tellFrame({ type: 'pose-and-light:list' });
    else if (d.type === 'pose-and-light:failed') noPictures();
    else if (d.type === 'pose-and-light:list' && Array.isArray(d.poses)) {
      poses = d.poses.filter((q) => q && typeof q.id === 'string' && typeof q.name === 'string').map((q) => ({ id: q.id, name: q.name, group: String(q.group || 'standing') }));
      groups = (Array.isArray(d.groups) ? d.groups : []).filter((g) => Array.isArray(g) && typeof g[0] === 'string' && typeof g[1] === 'string');
      failed = false;
      buildLibrary();
    } else if (d.type === 'pose-and-light:thumb' && typeof d.id === 'string' && isPicture(d.url)) {
      thumbs.set(d.id, d.url);
      panel.querySelectorAll(`[data-pose-id="${CSS.escape(d.id)}"] img`).forEach((img) => { img.src = d.url; img.closest('button').classList.add('has-img'); });
    } else if (d.type === 'pose-and-light:shot' && pending.has(d.req)) {
      const done = pending.get(d.req);
      pending.delete(d.req);
      const ok = !d.error && isPicture(d.url) && d.joints && typeof d.joints === 'object' && Number.isFinite(+d.w) && Number.isFinite(+d.h) &&
        JOINTS.every((n) => Array.isArray(d.joints[n]) && d.joints[n].length === 3 && d.joints[n].every((v) => Number.isFinite(+v)));
      const tilts = d.tilts && Number.isFinite(+d.tilts.shoulders) && Number.isFinite(+d.tilts.hips) ? { shoulders: +d.tilts.shoulders, hips: +d.tilts.hips } : null;
      done(ok ? { id: d.id, url: d.url, w: +d.w, h: +d.h, joints: d.joints, tilts } : null);
    }
  });
  // a pose's reference picture and joints, drawn once and kept
  function shotOf(id) {
    if (shots.has(id)) return shots.get(id);
    const p = new Promise((resolve) => {
      const r = ++req;
      pending.set(r, resolve);
      tellFrame({ type: 'pose-and-light:render', req: r, id, w: 600, h: 750 });
      setTimeout(() => { if (pending.has(r)) { pending.delete(r); resolve(null); } }, 20000);
    });
    shots.set(id, p);
    p.then((s) => { if (!s) shots.delete(id); });
    return p;
  }
  const loadImage = (url) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url; });

  // ---- Setting up a class --------------------------------------------------------------------------

  const kept = load();
  let chosen = Array.isArray(kept.ids) ? kept.ids.filter((x) => typeof x === 'string').slice(0, 60) : [];
  if (kept.mode === 'timed') $('timed').checked = true;
  if (TIMES[kept.secs]) $('t' + kept.secs).checked = true;
  const modeNow = () => ($('timed').checked ? 'timed' : 'relaxed');
  const secsNow = () => { const v = +((panel.querySelector('input[name="figTime"]:checked') || {}).value); return TIMES[v] ? v : 30; };
  function poseButton(q, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls;
    b.dataset.poseId = q.id;
    const img = document.createElement('img');
    img.alt = '';
    const name = document.createElement('span');
    name.className = 'fig-pose-name'; name.textContent = q.name;
    b.append(img, name);
    if (thumbs.has(q.id)) { img.src = thumbs.get(q.id); b.classList.add('has-img'); }
    return b;
  }
  function buildLibrary() {
    const box = $('poses');
    box.textContent = '';
    (groups.length ? groups : [['standing', 'Standing'], ['moving', 'Moving and sport'], ['low', 'Low to the floor'], ['dance', 'Dance'], ['mine', 'Your poses']]).forEach(([g, title]) => {
      const list = poses.filter((q) => q.group === g);
      if (!list.length) return;
      const sec = document.createElement('div');
      sec.className = 'fig-group';
      const h = document.createElement('h4');
      h.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'fig-grid';
      list.forEach((q) => {
        const b = poseButton(q, 'fig-pose');
        b.setAttribute('aria-label', q.name);
        b.setAttribute('aria-pressed', 'false');
        const badge = document.createElement('span');
        badge.className = 'fig-badge'; badge.hidden = true;
        b.appendChild(badge);
        b.addEventListener('click', () => {
          chosen = chosen.includes(q.id) ? chosen.filter((x) => x !== q.id) : chosen.concat(q.id);
          showSetup();
        });
        grid.appendChild(b);
      });
      sec.append(h, grid);
      box.appendChild(sec);
    });
    $('libNote').textContent = 'Tap a pose to add it to the class; tap it again to take it out.';
    showSetup();
  }
  function showSetup() {
    const timed = modeNow() === 'timed', secs = secsNow();
    $('times').hidden = !timed;
    const ready = poses ? chosen.filter((id) => byId(id)) : [];
    panel.querySelectorAll('.fig-pose').forEach((b) => {
      const n = ready.indexOf(b.dataset.poseId);
      b.setAttribute('aria-pressed', String(n >= 0));
      const badge = b.querySelector('.fig-badge');
      badge.hidden = n < 0; badge.textContent = n >= 0 ? n + 1 : '';
    });
    // the class in order: tap a picture to take it out
    const row = $('order');
    row.textContent = '';
    ready.forEach((id, i) => {
      const q = byId(id), b = poseButton(q, 'fig-mini');
      b.setAttribute('aria-label', `${i + 1}. ${q.name}: take it out`);
      b.title = `Take ${q.name} out`;
      const num = document.createElement('span');
      num.className = 'fig-badge'; num.textContent = i + 1;
      b.appendChild(num);
      b.addEventListener('click', () => { chosen = chosen.filter((x) => x !== id); showSetup(); });
      row.appendChild(b);
    });
    const n = ready.length;
    $('chosen').textContent = n ? `${n} pose${n > 1 ? 's' : ''}, drawn in this order. Tap one here to take it out.` : 'Tap poses in the library to draw them, in the order you tap them.';
    $('plan').textContent = !n ? '' : timed ? `${n} pose${n > 1 ? 's' : ''} · ${TIMES[secs]} each · ${span(n * secs)} in all` : `${n} pose${n > 1 ? 's' : ''} · no clock: tap Next pose when you are ready`;
    $('none').hidden = !n;
    $('start').disabled = !n || failed;
    save({ mode: timed ? 'timed' : 'relaxed', secs, ids: chosen });
  }
  panel.querySelectorAll('input[name="figClass"], input[name="figTime"]').forEach((r) => r.addEventListener('change', showSetup));
  $('random').addEventListener('click', () => {
    if (!poses) return;
    const pool = poses.map((q) => q.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    chosen = pool.slice(0, 5);
    showSetup();
  });
  $('none').addEventListener('click', () => { chosen = []; showSetup(); });
  $('start').addEventListener('click', () => startClass(chosen.filter((id) => byId(id))));

  // ---- The class -----------------------------------------------------------------------------------

  let cls = null;            // the class going on
  let ticker = 0;
  function click() { if (window.GameSound) { GameSound.keyDown(0); setTimeout(() => GameSound.keyUp(), 70); } }
  function show(view) {
    $('setup').hidden = view !== 'setup';
    $('review').hidden = view !== 'review';
    root.hidden = view !== 'draw';
    studio.activate(view === 'draw' && Studio.tab() === 'figure');
  }
  function startClass(ids) {
    if (!ids.length) return;
    click();
    cls = { mode: modeNow(), secs: secsNow(), ids: ids.slice(), i: -1, results: [], used: 0, from: 0, running: false, held: false, shot: null, kept: -1 };
    show('draw');
    $('pause').hidden = cls.mode !== 'timed';
    clearInterval(ticker);
    ticker = setInterval(tick, 200);
    showPose(0);
  }
  async function showPose(i) {
    const c = cls;
    c.i = i; c.shot = null; c.used = 0; c.running = false; c.kept = -1;
    const id = c.ids[i], q = byId(id) || { name: 'Pose' };
    studio.setLocked(true);
    studio.clearAll();
    hideAnalysis();
    $('count').textContent = `Pose ${i + 1} of ${c.ids.length}`;
    $('name').textContent = q.name;
    $('nextText').textContent = i === c.ids.length - 1 ? 'Finish' : 'Next pose';
    $('next').setAttribute('aria-label', i === c.ids.length - 1 ? 'Finish the class' : 'Next pose');
    tick();
    const shot = await shotOf(id);
    const img = shot && await loadImage(shot.url);
    if (cls !== c || c.i !== i) return;          // the class moved on, or ended, while it was drawn
    if (!img) {
      Studio.toast(`${q.name} could not be drawn; on to the next pose`);
      if (i < c.ids.length - 1) showPose(i + 1); else finish();
      return;
    }
    c.shot = shot;
    studio.setReference(img, `${q.name}: pose ${i + 1} of ${c.ids.length}. Drawn from the Pose and light figure.`);
    studio.setLocked(false);
    run(!c.held);
    if (c.ids[i + 1]) shotOf(c.ids[i + 1]);       // the next one, ready in time
  }
  // the clock: time used on this pose, counting only while it runs
  const usedMs = () => (cls ? cls.used + (cls.running ? performance.now() - cls.from : 0) : 0);
  function run(on) {
    if (!cls) return;
    if (on && !cls.running && cls.shot) { cls.from = performance.now(); cls.running = true; }
    else if (!on && cls.running) { cls.used += performance.now() - cls.from; cls.running = false; }
    tick();
  }
  function tick() {
    if (!cls) return;
    const used = usedMs() / 1000, clock = $('clock');
    if (cls.mode === 'timed') {
      const left = Math.max(0, cls.secs - used);
      clock.textContent = fmtTime(Math.ceil(left));
      clock.setAttribute('aria-label', 'Time left');
      // the last stretch shows: the last fifth of a short pose, the last 30 seconds of a long one
      clock.classList.toggle('is-low', !!cls.shot && left <= Math.min(30, Math.max(3, cls.secs * 0.2)));
      if (left <= 0 && cls.running) timeUp();
    } else {
      clock.textContent = fmtTime(used);
      clock.setAttribute('aria-label', 'Time on this pose');
    }
    clock.classList.toggle('is-paused', !!cls.shot && !cls.running);
  }
  // Pause holds the clock (Timed); so does leaving the tab or the page, and Analyze while it shows
  function hold(on) {
    if (!cls) return;
    cls.held = on;
    $('pause').setAttribute('aria-pressed', String(on));
    $('pause').querySelector('.fig-btn-text').textContent = on ? 'Resume' : 'Pause';
    $('pause').setAttribute('aria-label', on ? 'Start the clock again' : 'Pause the clock');
    run(!on && !shownAnalysis);
  }
  $('pause').addEventListener('click', () => hold(!cls.held));
  document.addEventListener('visibilitychange', () => { if (document.hidden && cls && cls.mode === 'timed' && cls.running) hold(true); });
  function banner(text) { $('banner').hidden = !text; $('banner').textContent = text || ''; }
  function timeUp() {
    run(false);
    studio.setLocked(true);
    if (window.GameSound && GameSound.on()) GameSound.chime();
    const c = cls, at = c.i, end = at >= c.ids.length - 1;
    banner(end ? 'Time! That was the last pose.' : 'Time! Next pose…');
    $('next').disabled = true;
    keep();
    setTimeout(() => {
      banner(null);
      $('next').disabled = false;
      if (cls !== c || c.i !== at) return;
      if (end) finish(); else showPose(at + 1);
    }, 1600);
  }
  // the drawing of this pose, kept for the end of the class with its gesture
  function keep() {
    if (!cls || !cls.shot || cls.kept === cls.i) return;
    cls.kept = cls.i;
    const pic = studio.composite(), a = analyze(cls.shot, studio.ink(), false);
    cls.results.push({ id: cls.ids[cls.i], name: (byId(cls.ids[cls.i]) || { name: 'Pose' }).name, shot: cls.shot, image: pic.toDataURL('image/jpeg', 0.88), w: pic.width, h: pic.height, analysis: a, secs: Math.round(usedMs() / 1000) });
  }
  $('next').addEventListener('click', () => {
    if (!cls || !cls.shot) return;
    run(false);
    keep();
    if (cls.i >= cls.ids.length - 1) finish(); else showPose(cls.i + 1);
  });
  // ✕ ends the class (a second tap within 3 seconds); the drawings so far come back for review
  let endArmed = 0;
  function endClass() {
    if (!cls) return;
    if (performance.now() - endArmed > 3000) { endArmed = performance.now(); Studio.toast('Tap ✕ again to end the class'); return; }
    endArmed = 0;
    run(false);
    if (studio.ink && hasInk(studio.ink())) keep();
    finish();
  }
  $('end').addEventListener('click', endClass);
  function finish() {
    const c = cls;
    clearInterval(ticker);
    banner(null);
    $('next').disabled = false;
    hideAnalysis();
    studio.setLocked(false);
    cls = null;
    last = c;
    if (!c.results.length) { show('setup'); showSetup(); return; }
    showReview(c);
    show('review');
    window.scrollTo(0, 0);
  }

  // ---- The gesture: a stick figure from the model's joints -------------------------------------------

  const JOINTS = ['pelvis', 'waist', 'chest', 'neck', 'head', 'crown', 'chin', 'face'].concat(...['R', 'L'].map((s) => ['shoulder', 'elbow', 'wrist', 'hand', 'hip', 'knee', 'ankle', 'toe', 'heel'].map((n) => n + s)));
  const COLORS = { action: '#e8590c', bones: '#1c6dd0', tilt: '#2b8a3e', miss: '#c2255c' };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  // The pose's gesture, in its reference picture's pixels: the head as an oval, the body down the spine,
  // the shoulder and hip lines, the arms and legs, and the line of action (one curve from the top of
  // the head down to the foot the body stands on).
  function gestureOf(shot) {
    const P = {};
    JOINTS.forEach((n) => { const v = shot.joints[n]; P[n] = { x: v[0] * shot.w, y: v[1] * shot.h, near: +v[2] }; });
    const ang = Math.atan2(P.chin.y - P.crown.y, P.chin.x - P.crown.x);
    const head = { c: lerp(P.crown, P.chin, 0.5), a: Math.max(4, dist(P.crown, P.chin) / 2 * 1.06), ang };
    head.b = head.a * 0.8;
    const oval = [];
    for (let k = 0; k <= 24; k++) {
      const t = (k / 24) * Math.PI * 2, x = Math.cos(t) * head.a, y = Math.sin(t) * head.b;
      oval.push({ x: head.c.x + x * Math.cos(ang) - y * Math.sin(ang), y: head.c.y + x * Math.sin(ang) + y * Math.cos(ang) });
    }
    const chinEnd = { x: head.c.x + head.a * Math.cos(ang), y: head.c.y + head.a * Math.sin(ang) };
    // a pair of limbs is named by where they are in the picture, or near and far when one hides the other
    const sides = (a, b, what) => {
      if (Math.abs(a.x - b.x) > head.a * 0.9) return a.x < b.x ? [`the ${what} on the left`, `the ${what} on the right`] : [`the ${what} on the right`, `the ${what} on the left`];
      return a.near >= b.near ? [`the near ${what}`, `the far ${what}`] : [`the far ${what}`, `the near ${what}`];
    };
    const arms = sides(P.shoulderR, P.shoulderL, 'arm'), legs = sides(P.hipR, P.hipL, 'leg');
    const limb = (s, key, names, list) => ({ key: key + s, name: names[s === 'R' ? 0 : 1], pts: list.map((n) => P[n + s]), far: P[list[0] + s].near < P[list[0] + (s === 'R' ? 'L' : 'R')].near - 0.02 });
    const parts = [
      { key: 'head', name: 'the head', pts: oval, closed: true },
      { key: 'body', name: 'the body', pts: [chinEnd, P.neck, P.chest, P.waist, P.pelvis], smooth: true },
      limb('R', 'arm', arms, ['shoulder', 'elbow', 'wrist', 'hand']), limb('L', 'arm', arms, ['shoulder', 'elbow', 'wrist', 'hand']),
      limb('R', 'leg', legs, ['hip', 'knee', 'ankle', 'toe']), limb('L', 'leg', legs, ['hip', 'knee', 'ankle', 'toe']),
    ];
    const tilts = [[P.shoulderR, P.shoulderL], [P.hipR, P.hipL]];
    const dots = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].flatMap((n) => [P[n + 'R'], P[n + 'L']]);
    // the line of action ends at the foot the body stands on: the lower one, or when the feet are level
    // (or both off the floor together), the one that carries on the line of the spine most smoothly
    const down = (s) => Math.max(P['ankle' + s].y, P['toe' + s].y, P['heel' + s].y);
    const spine = Math.atan2(P.pelvis.y - P.neck.y, P.pelvis.x - P.neck.x);
    const turn = (s) => { let d = Math.abs(Math.atan2(P['ankle' + s].y - P.pelvis.y, P['ankle' + s].x - P.pelvis.x) - spine); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
    const tall = Math.max(...JOINTS.map((n) => P[n].y)) - Math.min(...JOINTS.map((n) => P[n].y), head.c.y - head.a);
    const s = Math.abs(down('R') - down('L')) > tall * 0.04 ? (down('R') > down('L') ? 'R' : 'L') : (turn('R') <= turn('L') ? 'R' : 'L');
    const action = fitCurve([P.crown, P.neck, P.chest, P.waist, P.pelvis, P['knee' + s], P['ankle' + s]]);
    // the box around it all, and its height
    const all = oval.concat(...parts.map((p) => p.pts), action.samples);
    const x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x)), y0 = Math.min(...all.map((p) => p.y)), y1 = Math.max(...all.map((p) => p.y));
    return { P, head, parts, tilts, dots, action, tilt3d: shot.tilts || null, box: { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }, size: Math.max(x1 - x0, y1 - y0) };
  }
  // One smooth curve (a cubic Bézier) from the first point to the last, as close to the ones between as
  // it can pass: a line of action is one C or S, never a zigzag. Its shape: straight, a C or an S.
  function fitCurve(pts) {
    const p0 = pts[0], p3 = pts[pts.length - 1];
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + dist(pts[i - 1], pts[i]));
    const total = lens[lens.length - 1] || 1;
    let a11 = 0, a12 = 0, a22 = 0, bx1 = 0, by1 = 0, bx2 = 0, by2 = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const t = lens[i] / total, u = 1 - t;
      const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      const rx = pts[i].x - b0 * p0.x - b3 * p3.x, ry = pts[i].y - b0 * p0.y - b3 * p3.y;
      a11 += b1 * b1; a12 += b1 * b2; a22 += b2 * b2;
      bx1 += b1 * rx; by1 += b1 * ry; bx2 += b2 * rx; by2 += b2 * ry;
    }
    const det = a11 * a22 - a12 * a12;
    let p1 = lerp(p0, p3, 1 / 3), p2 = lerp(p0, p3, 2 / 3);
    if (Math.abs(det) > 1e-9) {
      p1 = { x: (a22 * bx1 - a12 * bx2) / det, y: (a22 * by1 - a12 * by2) / det };
      p2 = { x: (a11 * bx2 - a12 * bx1) / det, y: (a11 * by2 - a12 * by1) / det };
    }
    const at = (t) => { const u = 1 - t; return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }; };
    const samples = [];
    for (let k = 0; k <= 32; k++) samples.push(at(k / 32));
    // how far it bows from the straight line between its ends, each way
    const len = dist(p0, p3) || 1, nx = -(p3.y - p0.y) / len, ny = (p3.x - p0.x) / len;
    let plus = 0, minus = 0;
    samples.forEach((q) => { const d = ((q.x - p0.x) * nx + (q.y - p0.y) * ny) / len; plus = Math.max(plus, d); minus = Math.min(minus, d); });
    const shape = Math.max(plus, -minus) < 0.04 ? 'straight' : plus > 0.025 && minus < -0.025 ? 'S' : 'C';
    return { p0, p1, p2, p3, samples, shape };
  }
  // Draws the gesture on `ctx`; `map` takes a picture point to the canvas (scale k, then ox, oy).
  // `match` says which parts have marks near them; the others are dashed.
  function drawGesture(ctx, g, map, match) {
    const T = (p) => ({ x: map.ox + p.x * map.k, y: map.oy + p.y * map.k });
    const lw = Math.max(2, g.size * map.k * 0.008);
    const path = (pts, smooth, closed) => {
      const q = pts.map(T);
      ctx.beginPath();
      ctx.moveTo(q[0].x, q[0].y);
      if (smooth && q.length > 2) {
        for (let i = 1; i < q.length - 1; i++) { const m = lerp(q[i], q[i + 1], 0.5); ctx.quadraticCurveTo(q[i].x, q[i].y, m.x, m.y); }
        ctx.lineTo(q[q.length - 1].x, q[q.length - 1].y);
      } else q.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      if (closed) ctx.closePath();
    };
    // each line is laid over a pale edge, so it reads on dark marks and on the paper alike
    const stroke = (color, width, alpha, dash) => {
      ctx.setLineDash(dash ? [width * 1.6, width * 1.4] : []);
      ctx.globalAlpha = alpha * 0.7; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = width + Math.max(2, width * 0.6); ctx.stroke();
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the line of action first, wide and under the rest
    const a = g.action, a0 = T(a.p0), a1 = T(a.p1), a2 = T(a.p2), a3 = T(a.p3);
    ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.bezierCurveTo(a1.x, a1.y, a2.x, a2.y, a3.x, a3.y);
    stroke(COLORS.action, lw * 2.2, 0.75);
    // the tilt of the shoulders and the hips, drawn on past the joints
    g.tilts.forEach(([p, q]) => { path([lerp(p, q, -0.3), lerp(p, q, 1.3)]); stroke(COLORS.tilt, lw * 0.85, 0.95); });
    g.parts.forEach((part) => {
      const miss = match && match[part.key] === false;
      path(part.pts, part.smooth, part.closed);
      stroke(miss ? COLORS.miss : COLORS.bones, lw, part.far ? 0.6 : 0.95, miss);
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.95;
    g.dots.forEach((p) => { const q = T(p); ctx.beginPath(); ctx.arc(q.x, q.y, lw * 1.05, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.beginPath(); ctx.arc(q.x, q.y, lw * 0.7, 0, Math.PI * 2); ctx.fillStyle = COLORS.bones; ctx.fill(); });
    ctx.restore();
  }

  // ---- Reading the drawing -----------------------------------------------------------------------

  // the marks, small: which cells of a grid about 240 across have any mark in them
  const GRID = 240;
  function inkMap(ink) {
    const s = Math.min(1, GRID / Math.max(ink.width, ink.height));
    const w = Math.max(1, Math.round(ink.width * s)), h = Math.max(1, Math.round(ink.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ink, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, on = new Uint8Array(w * h);
    let n = 0;
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] >= 10) { on[i] = 1; n++; }
    return { w, h, s, on, n };
  }
  const hasInk = (ink) => inkMap(ink).n >= 25;
  // the box around the marks, leaving out the odd speck at its edges
  function boxOf(m) {
    const cols = new Uint32Array(m.w), rows = new Uint32Array(m.h);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.on[y * m.w + x]) { cols[x]++; rows[y]++; }
    const cut = (a) => { const trim = m.n * 0.004; let s = 0, lo = 0, hi = a.length - 1; while (lo < hi && (s += a[lo]) <= trim) lo++; s = 0; while (hi > lo && (s += a[hi]) <= trim) hi--; return [lo, hi]; };
    const [x0, x1] = cut(cols), [y0, y1] = cut(rows);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // the marks that hang together: a speck or a stray mark well away from the drawing is left out
  function mainMarks(m) {
    const { w, h } = m, R = 2, reach = new Uint8Array(w * h);
    // marks a couple of cells apart count as touching
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.on[y * w + x]) continue;
      for (let j = Math.max(0, y - R); j <= Math.min(h - 1, y + R); j++) for (let i = Math.max(0, x - R); i <= Math.min(w - 1, x + R); i++) reach[j * w + i] = 1;
    }
    const label = new Int32Array(w * h).fill(-1), sizes = [], stack = [];
    for (let start = 0; start < w * h; start++) {
      if (!reach[start] || label[start] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      label[start] = id; stack.push(start);
      while (stack.length) {
        const c = stack.pop(), x = c % w, y = (c - x) / w;
        if (m.on[c]) n++;
        if (x > 0 && reach[c - 1] && label[c - 1] < 0) { label[c - 1] = id; stack.push(c - 1); }
        if (x < w - 1 && reach[c + 1] && label[c + 1] < 0) { label[c + 1] = id; stack.push(c + 1); }
        if (y > 0 && reach[c - w] && label[c - w] < 0) { label[c - w] = id; stack.push(c - w); }
        if (y < h - 1 && reach[c + w] && label[c + w] < 0) { label[c + w] = id; stack.push(c + w); }
      }
      sizes.push(n);
    }
    const big = sizes.reduce((a, b) => Math.max(a, b), 0), keep = sizes.map((n) => n >= Math.max(3, big * 0.04));
    const on = new Uint8Array(w * h);
    let n = 0;
    for (let i = 0; i < w * h; i++) if (m.on[i] && keep[label[i]]) { on[i] = 1; n++; }
    return { w, h, s: m.s, on, n };
  }
  // how far each cell is from the nearest mark, in cells (two sweeps, steps of 3 straight and 4 across)
  function distances(m) {
    const { w, h } = m, d = new Float32Array(w * h), BIG = 1e9;
    for (let i = 0; i < w * h; i++) d[i] = m.on[i] ? 0 : BIG;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) { v = Math.min(v, d[i - w] + 3); if (x > 0) v = Math.min(v, d[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4); }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) { v = Math.min(v, d[i + w] + 3); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4); if (x > 0) v = Math.min(v, d[i + w - 1] + 4); }
      d[i] = v;
    }
    for (let i = 0; i < w * h; i++) d[i] /= 3;
    return d;
  }
  // points along each part, a little apart, for measuring how near the marks come
  function samplesOf(g) {
    const step = g.size / 70, out = [];
    g.parts.forEach((part) => {
      const pts = part.pts;
      for (let i = 1; i < pts.length; i++) {
        const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / step));
        for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push({ key: part.key, p: lerp(pts[i - 1], pts[i], k / n) });
      }
    });
    return out;
  }
  /*
   * Lays the gesture over a drawing (`ink`: the marks alone, the paper's size). It is fitted to the box
   * around the marks, then moved and sized to sit on them as closely as it can; with no marks
   * (or with `asReference`) it sits where the reference would, as large as fits the paper. Then each
   * part is checked for marks near it, and a few notes are written about the pose and the drawing
   * (`live`: for the paper being drawn on, rather than the review).
   */
  function analyze(shot, ink, asReference, live) {
    const g = gestureOf(shot), W = ink.width, H = ink.height;
    const m = inkMap(ink), marked = m.n >= 25;
    let map, match = null, inkBox = null;
    const kRef = Math.min(W / shot.w, H / shot.h);
    const refMap = { k: kRef, ox: (W - shot.w * kRef) / 2, oy: (H - shot.h * kRef) / 2 };
    if (marked) {
      const main = mainMarks(m), b = boxOf(main);
      inkBox = { x: b.x / m.s, y: b.y / m.s, w: b.w / m.s, h: b.h / m.s };
      const d = distances(m), samples = samplesOf(g);
      const kW = inkBox.w / g.box.w, kH = inkBox.h / g.box.h, k0 = Math.min(kW, kH);
      const cap = Math.max(3, 0.09 * g.size * k0 * m.s);
      const near = (mp, p) => {
        const x = Math.round((mp.ox + p.x * mp.k) * m.s), y = Math.round((mp.oy + p.y * mp.k) * m.s);
        return x < 0 || y < 0 || x >= m.w || y >= m.h ? cap : Math.min(cap, d[y * m.w + x]);
      };
      // a fit is a size, and a place for the middle of the gesture
      const cx = g.box.x + g.box.w / 2, cy = g.box.y + g.box.h / 2, mid = { x: inkBox.x + inkBox.w / 2, y: inkBox.y + inkBox.h / 2 };
      const mapAt = (k, mx, my) => ({ k, ox: mx - cx * k, oy: my - cy * k });
      const unit = g.size * k0;
      const cost = (k, mx, my) => {
        const mp = mapAt(k, mx, my);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 2) sum += near(mp, samples[i].p);
        // a light pull toward the box around the marks, so a few marks cannot drag it far
        return sum / Math.ceil(samples.length / 2) + cap * 0.05 * (Math.abs(Math.log(k / k0)) / 0.3 + Math.abs(mx - mid.x) / (0.15 * unit) + Math.abs(my - mid.y) / (0.15 * unit)) / 3;
      };
      // Tried from a few starts (the box, its height alone, its width alone, where the reference would
      // be), each over a spread of sizes and places. The best few are then each polished (a step each
      // way in size and place, the steps halving), since the very best on the coarse spread can be a
      // fit that locks onto one end of the drawing and misses the other.
      const tried = [];
      const steps = (n, by) => Array.from({ length: 2 * n + 1 }, (_, i) => (i - n) * by);
      [{ k: k0, mx: mid.x, my: mid.y }, { k: kH, mx: mid.x, my: mid.y }, { k: kW, mx: mid.x, my: mid.y }, { k: refMap.k, mx: refMap.ox + cx * refMap.k, my: refMap.oy + cy * refMap.k }]
        .forEach((from) => steps(5, 0.05).forEach((f) => steps(5, 0.03).forEach((dx) => steps(5, 0.03).forEach((dy) => {
          const k = from.k * (1 + f), mx = from.mx + dx * g.size * from.k, my = from.my + dy * g.size * from.k;
          tried.push({ k, mx, my, c: cost(k, mx, my) });
        }))));
      tried.sort((p, q) => p.c - q.c);
      // The polish also measures the other way, from the marks to the gesture, so it cannot shrink the
      // gesture inside an outline drawing (where every bone runs a little in from the drawn edges).
      const inkPts = [];
      {
        const list = [];
        for (let i = 0; i < main.w * main.h; i++) if (main.on[i]) list.push(i);
        const stride = Math.max(1, Math.floor(list.length / 180));
        for (let j = 0; j < list.length; j += stride) inkPts.push([list[j] % m.w, Math.floor(list[j] / m.w)]);
      }
      const segs = [];
      g.parts.forEach((part) => { const pts = part.closed ? part.pts.filter((q, i) => i % 3 === 0) : part.pts; for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); });
      const back = (k, mx, my) => {
        const mp = mapAt(k, mx, my), S = segs.map(([a, c]) => [(mp.ox + a.x * k) * m.s, (mp.oy + a.y * k) * m.s, (mp.ox + c.x * k) * m.s, (mp.oy + c.y * k) * m.s]);
        let sum = 0;
        for (const [px, py] of inkPts) {
          let low = cap * cap;
          for (const [ax, ay, bx, by] of S) {
            const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
            const ex = px - ax - t * vx, ey = py - ay - t * vy, d2 = ex * ex + ey * ey;
            if (d2 < low) low = d2;
          }
          sum += Math.sqrt(low);
        }
        return sum / inkPts.length;
      };
      const both = (k, mx, my) => cost(k, mx, my) + back(k, mx, my);
      const seeds = [{ k: k0, mx: mid.x, my: mid.y }];
      for (const t of tried) {
        if (seeds.length >= 7) break;
        if (seeds.every((q) => Math.abs(Math.log(q.k / t.k)) > 0.04 || Math.hypot(q.mx - t.mx, q.my - t.my) > 0.04 * unit)) seeds.push(t);
      }
      let best = null;
      seeds.forEach((seed) => {
        let at = { k: seed.k, mx: seed.mx, my: seed.my, c: both(seed.k, seed.mx, seed.my) }, sf = 0.04, sd = 0.02 * unit;
        while (sf > 0.003) {
          let moved = false;
          for (const [f, dx, dy] of [[sf, 0, 0], [-sf, 0, 0], [0, sd, 0], [0, -sd, 0], [0, 0, sd], [0, 0, -sd]]) {
            const k = at.k * (1 + f), mx = at.mx + dx, my = at.my + dy, c = both(k, mx, my);
            if (c < at.c - 1e-9) { at = { k, mx, my, c }; moved = true; }
          }
          if (!moved) { sf /= 2; sd /= 2; }
        }
        if (!best || at.c < best.c) best = at;
      });
      map = asReference ? refMap : mapAt(best.k, best.mx, best.my);
      // which parts have marks near them, along half their length or more (an outline of the body sits
      // further from the spine than an outline of an arm from its bone)
      const tolOf = (key) => Math.max(1.5, (key === 'body' ? 0.09 : key === 'head' ? 0.06 : 0.045) * g.size * map.k * m.s);
      const hits = {}, counts = {};
      samples.forEach(({ key, p }) => { counts[key] = (counts[key] || 0) + 1; if (near(map, p) <= tolOf(key)) hits[key] = (hits[key] || 0) + 1; });
      match = {};
      Object.keys(counts).forEach((key) => { match[key] = (hits[key] || 0) / counts[key] >= 0.45; });
    } else map = refMap;
    return { g, map, match, inkBox, marked, asReference: !!asReference, tips: notes(g, marked ? inkBox : null, match, live) };
  }
  // what to look for: the line of action, the tilts, the size in heads, the drawing's shape, missed parts
  function notes(g, inkBox, match, live) {
    const tips = [], P = g.P, head = g.head.a * 2;
    tips.push(['Line of action', {
      straight: 'nearly straight: a calm, upright pose. Even so, draw it first: one line from the head to the foot.',
      C: 'a C curve: the whole body bends one way. Draw this curve first, then hang the body on it.',
      S: 'an S curve: the body bends one way, then the other. Draw this curve first, then hang the body on it.',
    }[g.action.shape]]);
    // the tilts are the body's own (from the model), not as perspective shows them; seen end on, the
    // shoulders or the hips show no tilt to compare, so then nothing is said
    const wide = ([a, b]) => Math.abs(a.x - b.x);
    const sh = { deg: g.tilt3d ? g.tilt3d.shoulders : 0 }, hp = { deg: g.tilt3d ? g.tilt3d.hips : 0 };
    if (g.tilt3d && wide(g.tilts[0]) > head * 0.6 && wide(g.tilts[1]) > head * 0.4) {
      const lv = (t) => Math.abs(t.deg) < 3;
      tips.push(['Tilt', lv(sh) && lv(hp) ? 'the shoulders and the hips are both nearly level.'
        : !lv(sh) && !lv(hp) && Math.sign(sh.deg) !== Math.sign(hp.deg) ? 'the shoulders and the hips tilt toward each other on one side, as a body does with its weight on one leg. Artists call it contrapposto.'
          : !lv(sh) && !lv(hp) ? 'the shoulders and the hips tilt the same way, as the whole body leans.'
            : lv(sh) ? 'the hips tilt while the shoulders stay nearly level.' : 'the shoulders tilt while the hips stay nearly level.']);
    }
    const tall = g.box.h >= g.box.w;
    const feet = Math.max(...['ankleR', 'ankleL', 'toeR', 'toeL', 'heelR', 'heelL'].map((n) => P[n].y));
    const heads = tall ? (feet - (g.head.c.y - g.head.a)) / head : g.box.w / head;
    if (heads > 1.5) tips.push(['Measure', tall ? `from the top of the head to the lowest foot, the pose is about ${half(heads)} heads tall. Measure the head in your drawing and count.` : `from one end to the other, the pose is about ${half(heads)} heads wide. Measure the head in your drawing and count.`]);
    if (inkBox) {
      const ratio = (inkBox.w / inkBox.h) / (g.box.w / g.box.h);
      tips.push(['Your drawing', ratio > 1.15 ? 'is wider for its height than the pose. Check the height, from the head down to the feet.'
        : ratio < 0.87 ? 'is taller and thinner than the pose. Check how far the arms and legs reach out to the sides.'
          : 'has the pose\'s overall shape: about as wide for its height.']);
      const missed = g.parts.filter((p) => match && match[p.key] === false).map((p) => p.name);
      const list = missed.length > 1 ? `${missed.slice(0, -1).join(', ')} and ${missed[missed.length - 1]}` : missed[0];
      tips.push(missed.length ? ['Dashed', `no marks near ${list}. Look again at where ${missed.length > 1 ? 'they go' : 'it goes'}.`] : ['Well matched', 'your marks follow every part of the gesture.']);
    } else if (live) tips.push(['Nothing drawn yet', 'the gesture sits where the reference would. Draw the pose, then check again.']);
    else tips.push(['Nothing drawn', 'the gesture is shown where the reference would sit.']);
    return tips;
  }
  function showTips(list, tips) {
    list.textContent = '';
    tips.forEach(([lead, text]) => { const li = document.createElement('li'), b = document.createElement('strong'); b.textContent = lead + ': '; li.append(b, text); list.appendChild(li); });
  }

  // ---- Analyze, on the paper ------------------------------------------------------------------------

  let shownAnalysis = null, placeAsRef = false;
  function analyzeNow() {
    if (!cls || !cls.shot) return;
    const over = studio.overlay(), ctx = over.getContext('2d');
    shownAnalysis = analyze(cls.shot, studio.ink(), placeAsRef, true);
    ctx.clearRect(0, 0, over.width, over.height);
    drawGesture(ctx, shownAnalysis.g, shownAnalysis.map, shownAnalysis.asReference ? null : shownAnalysis.match);
    showTips($('tips'), shownAnalysis.tips);
  }
  function showAnalysis() {
    if (!cls || !cls.shot) return;
    analyzeNow();
    $('notes').hidden = false;
    $('analyze').setAttribute('aria-pressed', 'true');
    run(false);
  }
  function hideAnalysis() {
    const was = !!shownAnalysis;
    shownAnalysis = null;
    const over = studio.overlay();
    over.getContext('2d').clearRect(0, 0, over.width, over.height);
    $('notes').hidden = true;
    $('analyze').setAttribute('aria-pressed', 'false');
    if (was && cls && !cls.held) run(true);
  }
  $('analyze').addEventListener('click', () => { if (shownAnalysis) hideAnalysis(); else showAnalysis(); });
  // the notes can go while the gesture stays on the paper; Analyze takes both away
  $('notesClose').addEventListener('click', () => { $('notes').hidden = true; $('analyze').focus(); });
  $('recheck').addEventListener('click', analyzeNow);
  $('place').addEventListener('click', () => {
    placeAsRef = !placeAsRef;
    $('place').setAttribute('aria-pressed', String(placeAsRef));
    analyzeNow();
  });

  // ---- The review ------------------------------------------------------------------------------------

  let last = null, gesturesShown = true;
  function drawCard(canvas, r, img) {
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (gesturesShown && r.analysis) {
      const f = canvas.width / r.w, a = r.analysis;
      drawGesture(g, a.g, { k: a.map.k * f, ox: a.map.ox * f, oy: a.map.oy * f }, a.marked ? a.match : null);
    }
  }
  function showReview(c) {
    const n = c.results.length;
    $('reviewLede').textContent = `${n} drawing${n > 1 ? 's' : ''} from ${c.mode === 'timed' ? `a timed class, ${TIMES[c.secs]} a pose` : 'a relaxed class'}. Each is beside the pose it was drawn from, with the pose's gesture laid over it.`;
    const box = $('cards');
    box.textContent = '';
    c.results.forEach((r, i) => {
      const card = document.createElement('figure');
      card.className = 'fig-card';
      const pair = document.createElement('div');
      pair.className = 'fig-pair';
      const cv = document.createElement('canvas');
      cv.width = Math.round(r.w / 2); cv.height = Math.round(r.h / 2);
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', `Your drawing of ${r.name}${gesturesShown ? ', with the gesture over it' : ''}`);
      const ref = document.createElement('img');
      ref.src = r.shot.url; ref.alt = `The pose: ${r.name}`;
      pair.append(cv, ref);
      const cap = document.createElement('figcaption');
      const title = document.createElement('strong');
      title.textContent = `${i + 1}. ${r.name}`;
      const time = document.createElement('span');
      time.textContent = fmtTime(r.secs);
      cap.append(title, time);
      const tips = document.createElement('ul');
      tips.className = 'fig-tips';
      showTips(tips, r.analysis.tips.filter(([lead]) => lead !== 'Measure'));
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button'; saveBtn.className = 'btn btn-small'; saveBtn.textContent = 'Save as PNG';
      saveBtn.addEventListener('click', async () => {
        const img = await loadImage(r.image);
        if (!img) return;
        const full = document.createElement('canvas');
        full.width = r.w; full.height = r.h;
        drawCard(full, r, img);
        Studio.savePng(full, `figure-${i + 1}-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`);
      });
      card.append(pair, cap, tips, saveBtn);
      box.appendChild(card);
      loadImage(r.image).then((img) => { if (img) { r.img = img; drawCard(cv, r, img); } });
    });
  }
  panel.querySelectorAll('[data-fig-gesture]').forEach((b) => b.addEventListener('click', () => {
    gesturesShown = b.dataset.figGesture === '1';
    panel.querySelectorAll('[data-fig-gesture]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (last) $('cards').querySelectorAll('canvas').forEach((cv, i) => {
      const r = last.results[i];
      if (r && r.img) drawCard(cv, r, r.img);
      cv.setAttribute('aria-label', `Your drawing of ${r.name}${gesturesShown ? ', with the gesture over it' : ''}`);
    });
  }));
  $('again').addEventListener('click', () => { if (last) startClass(last.ids.filter((id) => byId(id))); });
  $('new').addEventListener('click', () => { show('setup'); showSetup(); window.scrollTo(0, 0); });

  // ---- The tab ---------------------------------------------------------------------------------------

  function onTab(name) {
    const on = name === 'figure';
    if (!on) {
      // away from the tab the clock stops: a timed class waits on Resume
      if (cls && cls.mode === 'timed' && cls.running) hold(true); else run(false);
      studio.activate(false);
      return;
    }
    openFrame();
    if (cls) { show('draw'); if (cls.mode !== 'timed' && !shownAnalysis) run(true); return; }
    // your saved poses may have changed in Pose and light since the list came
    if (poses) tellFrame({ type: 'pose-and-light:list' });
    show(last && !$('review').hidden ? 'review' : 'setup');
    showSetup();
  }
  window.addEventListener('studio:tab', (e) => onTab(e.detail));
  // the page may open straight on this tab (index.html#figure), before this script was listening
  if (Studio.tab() === 'figure') onTab('figure');
  showSetup();

  // for tests
  window.FigureStudy = { gestureOf, fitCurve, analyze, drawGesture, studio, state: () => cls, poses: () => poses, shotOf };
})();
