/*
 * Figure study: drawing the wooden figure from the pose library, the way an art class draws from a
 * model. The poses keep coming, in a random order, until the class is stopped. A class is Relaxed (no
 * time limit: tap Done when the drawing is done) or Timed (each pose has 10 s, 30 s, 1, 5 or 10
 * minutes). The Pose and light page draws the pictures (pose.html?render=1, in a hidden frame): the
 * library's buttons, and each pose's reference with where its joints land in it. The drawing is done on
 * a second copy of the Studio (painting.js), with its own paper, a fresh sheet for each pose.
 *
 * After each pose a card pops up, like the games' score: the pose's gesture laid over the drawing (a
 * stick figure from the model's own joints, the line of action through it, and the tilt of the
 * shoulders and the hips), fitted to the marks on the paper, with a part that has no marks near it
 * dashed; how well the drawing follows it, in stars; a few notes; and Next pose or Stop class. When the
 * class stops, every drawing comes back beside its pose.
 */
(function () {
  'use strict';
  const panel = document.getElementById('tab-figure');
  if (!panel) return;
  if (!window.PaintStudio || !PaintStudio.create) { if (window.StudioGuard) StudioGuard.failed('figure.js: painting.js did not finish loading', 'figure'); return; }
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
  root.appendChild($('result'));
  panel.appendChild($('say'));         // (outside the studio, which goes inert behind the card)
  const studio = PaintStudio.create({
    root, prefix: 'fs-', bodyClass: 'figure-focus', followStudy: false, autosave: false,
    mixesKey: 'portrait-value-studio.figureMixes', fileName: 'figure-drawing.png', refSize: 0.42,
    refViewHint: 'Values shows the pose in dark, middle and light. Blocks shows its big shapes of light and shadow.',
    state: { tool: 'pencil', lastBrush: 'pencil', lead: 'charcoal', hard: 'medium', pencil: 4 },
    canvas: { weave: 'paper' },
    onExit: () => endClass(),
    onLocked: () => Studio.toast(cls && cls.over ? 'Pencils down: this pose is done' : 'The next pose is coming'),
  });

  // ---- The pictures: Pose and light, in a hidden frame --------------------------------------------

  const frame = $('render');
  let poses = null, groups = [], failed = false, req = 0;
  const thumbs = new Map(), shots = new Map(), pending = new Map();
  const byId = (id) => poses && poses.find((q) => q.id === id);
  let loads = 0;
  function openFrame() {
    if (frame.getAttribute('src')) return;
    failed = false;
    if (!poses) $('libNote').textContent = 'Setting up the poses…';
    frame.setAttribute('src', frame.dataset.src);
    const n = ++loads;
    setTimeout(() => { if (!poses && n === loads) noPictures(); }, 25000);
  }
  // (the frame is let go, so coming back to the tab tries again)
  function noPictures() {
    if (failed || poses) return;
    failed = true;
    frame.removeAttribute('src');
    $('libNote').textContent = 'The poses could not be drawn here. Pose and light needs 3D drawing (WebGL), which this browser may have turned off, and its 3D library, which may not have loaded. Try another browser, or reload the page and come back to this tab.';
    showSetup();
  }
  // the frames' messages go to this page's own origin; where the page has none (opened from disk, or inside
  // another site's sandboxed frame, where the origin reads 'null') they go to any, as the receivers check the
  // sender window either way
  const FRAME_ORIGIN = self.origin && self.origin !== 'null' ? self.origin : '*';
  const tellFrame = (msg) => { if (frame.contentWindow) frame.contentWindow.postMessage(msg, FRAME_ORIGIN); };
  const isPicture = (u) => typeof u === 'string' && /^data:image\/(jpeg|png);base64,/.test(u);
  // The page CSP allows blob: images, not data:, so frame pictures are re-wrapped as Blob URLs on
  // arrival (kept for the visit; the data strings themselves are dropped).
  const asBlobUrl = (u) => { try { const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(u); if (!m) return null; const bin = atob(m[2]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([bytes], { type: m[1] })); } catch (e) { return null; } };
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'pose-and-light:ready') tellFrame({ type: 'pose-and-light:list' });
    else if (d.type === 'pose-and-light:failed') noPictures();
    else if (d.type === 'pose-and-light:list' && Array.isArray(d.poses)) {
      const ids = new Set(); // one tile per pose id, whatever the list sent
      poses = d.poses.filter((q) => q && typeof q.id === 'string' && typeof q.name === 'string' && !ids.has(q.id) && ids.add(q.id)).map((q) => ({ id: q.id, name: q.name, group: String(q.group || 'standing') }));
      groups = (Array.isArray(d.groups) ? d.groups : []).filter((g) => Array.isArray(g) && typeof g[0] === 'string' && typeof g[1] === 'string');
      failed = false;
      buildLibrary();
    } else if (d.type === 'pose-and-light:thumb' && typeof d.id === 'string' && isPicture(d.url)) {
      const thumbUrl = asBlobUrl(d.url);
      if (!thumbUrl) return;
      const old = thumbs.get(d.id);
      if (old && old !== thumbUrl) URL.revokeObjectURL(old); // the list comes again after every class: the picture before goes
      thumbs.set(d.id, thumbUrl);
      panel.querySelectorAll(`[data-pose-id="${CSS.escape(d.id)}"] img`).forEach((img) => { img.src = thumbUrl; img.closest('button').classList.add('has-img'); });
    } else if (d.type === 'pose-and-light:shot' && pending.has(d.req)) {
      const done = pending.get(d.req);
      pending.delete(d.req);
      const ok = !d.error && isPicture(d.url) && d.joints && typeof d.joints === 'object' && Number.isFinite(+d.w) && Number.isFinite(+d.h) &&
        JOINTS.every((n) => Array.isArray(d.joints[n]) && d.joints[n].length === 3 && d.joints[n].every((v) => Number.isFinite(+v)));
      const tilts = d.tilts && Number.isFinite(+d.tilts.shoulders) && Number.isFinite(+d.tilts.hips) ? { shoulders: +d.tilts.shoulders, hips: +d.tilts.hips } : null;
      const shotUrl = ok ? asBlobUrl(d.url) : null;
      done(ok && shotUrl ? { id: d.id, url: shotUrl, w: +d.w, h: +d.h, joints: d.joints, tilts } : null);
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

  // Every pose in the library is in the class (the poses saved in Pose and light too), unless it is
  // taken out here, one at a time or a group at once. What is taken out is remembered.
  const kept = load();
  let last = null;           // the class before, for the review
  const out = new Set(Array.isArray(kept.out) ? kept.out.filter((x) => typeof x === 'string').slice(0, 200) : []);
  if (kept.mode === 'timed') $('timed').checked = true;
  // (an own time only: a saved 'constructor' would pass a plain lookup and name no radio)
  if (Object.prototype.hasOwnProperty.call(TIMES, kept.secs) && $('t' + kept.secs)) $('t' + kept.secs).checked = true;
  const modeNow = () => ($('timed').checked ? 'timed' : 'relaxed');
  const secsNow = () => { const v = +((panel.querySelector('input[name="figTime"]:checked') || {}).value); return TIMES[v] ? v : 30; };
  // what the page shows after loading; the settings are written back only once they differ from it, so a
  // visit that changes nothing (or a page reloaded after Forget my work on this device) stores nothing
  let lastSaved = JSON.stringify({ mode: modeNow(), secs: secsNow(), out: [...out] });
  const GROUPS = [['standing', 'Standing'], ['moving', 'Moving and sport'], ['low', 'Low to the floor'], ['dance', 'Dance'], ['mine', 'Your poses']];
  const groupList = () => (groups.length ? groups : GROUPS).filter(([g]) => poses.some((q) => q.group === g));
  const pool = () => (poses ? poses.filter((q) => !out.has(q.id)).map((q) => q.id) : []);
  function buildLibrary() {
    const box = $('poses');
    box.textContent = '';
    groupList().forEach(([g, title]) => {
      const list = poses.filter((q) => q.group === g);
      const sec = document.createElement('div');
      sec.className = 'fig-group';
      const head = document.createElement('div');
      head.className = 'fig-group-head';
      const h = document.createElement('h4');
      h.textContent = title;
      const all = document.createElement('button');
      all.type = 'button'; all.className = 'btn btn-small fig-group-btn'; all.dataset.group = g; all.dataset.title = title;
      all.addEventListener('click', () => {
        const anyIn = list.some((q) => !out.has(q.id));
        list.forEach((q) => { if (anyIn) out.add(q.id); else out.delete(q.id); });
        showSetup();
      });
      head.append(h, all);
      const grid = document.createElement('div');
      grid.className = 'fig-grid';
      list.forEach((q) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'fig-pose';
        b.dataset.poseId = q.id;
        const img = document.createElement('img');
        img.alt = '';
        const name = document.createElement('span');
        name.className = 'fig-pose-name'; name.textContent = q.name;
        b.append(img, name);
        if (thumbs.has(q.id)) { img.src = thumbs.get(q.id); b.classList.add('has-img'); }
        b.setAttribute('aria-label', q.name);
        b.addEventListener('click', () => { if (out.has(q.id)) out.delete(q.id); else out.add(q.id); showSetup(); });
        grid.appendChild(b);
      });
      sec.append(head, grid);
      box.appendChild(sec);
    });
    $('libNote').textContent = 'A pose with a tick is in the class. Tap it to take it out, or put it back.';
    showSetup();
  }
  function showSetup() {
    const timed = modeNow() === 'timed', secs = secsNow();
    $('times').hidden = !timed;
    // (the pressed state says a pose is in the class)
    panel.querySelectorAll('.fig-pose').forEach((b) => b.setAttribute('aria-pressed', String(!out.has(b.dataset.poseId))));
    panel.querySelectorAll('.fig-group-btn').forEach((b) => {
      const ids = poses.filter((q) => q.group === b.dataset.group).map((q) => q.id), anyIn = ids.some((id) => !out.has(id));
      b.textContent = anyIn ? 'Take these out' : 'Put these back';
      b.setAttribute('aria-label', `${anyIn ? 'Take out' : 'Put back'} ${b.dataset.group === 'mine' ? 'your saved poses' : `the ${b.dataset.title.toLowerCase()} poses`}`);
    });
    const n = pool().length, all = poses ? poses.length : 0;
    if (poses) $('mix').textContent = n === all ? `All ${all} poses are in the class, in a random order. Tap a pose, or a group's button, to take it out.` : n ? n === 1 ? `1 of the ${all} poses is in the class.` : `${n} of the ${all} poses are in the class, in a random order.` : 'Every pose is out of the class. Tap one to put it back.';
    $('plan').textContent = !n ? '' : timed ? `${TIMES[secs]} a pose, until you stop the class` : 'No time limit: tap Done when you finish a pose';
    $('all').hidden = !poses;
    $('all').textContent = n ? 'Take them all out' : 'Put them all back';
    $('start').disabled = !n || failed;
    $('back').hidden = !(last && last.results.some((r) => r.analysis.marked));
    const now = JSON.stringify({ mode: timed ? 'timed' : 'relaxed', secs, out: [...out] });
    if (now !== lastSaved) { save(JSON.parse(now)); lastSaved = now; }
  }
  panel.querySelectorAll('input[name="figClass"], input[name="figTime"]').forEach((r) => r.addEventListener('change', showSetup));
  $('all').addEventListener('click', () => {
    if (!poses) return;
    if (pool().length) poses.forEach((q) => out.add(q.id)); else out.clear();
    showSetup();
  });
  $('start').addEventListener('click', () => startClass({ mode: modeNow(), secs: secsNow(), pool: pool() }));

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
  function startClass(how) {
    const ids = how.pool.filter((id) => byId(id));
    // a class whose poses have since left the pose library (deleted there) cannot start again
    if (!ids.length) { Studio.toast('None of that class\'s poses is in the pose library any more. Start a new class.', 5000); return; }
    click();
    cls = { mode: how.mode, secs: how.secs, pool: ids, deck: [], prev: null, next: null, n: 0, id: null, results: [], used: 0, from: 0, running: false, held: false, over: false, shot: null, since: 0, fails: 0 };
    hold(false);
    hideResult();
    show('draw');
    $('done').focus({ preventScroll: true });
    $('pause').hidden = cls.mode !== 'timed';
    clearInterval(ticker);
    ticker = setInterval(tick, 200);
    showPose();
  }
  // the poses in a shuffled order, shuffled again when they run out (never the same pose twice running)
  function deal(c) {
    if (!c.deck.length) {
      const d = c.pool.slice();
      for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      if (d.length > 1 && d[d.length - 1] === c.prev) [d[0], d[d.length - 1]] = [d[d.length - 1], d[0]];
      c.deck = d;
    }
    c.prev = c.deck.pop();
    return c.prev;
  }
  async function showPose() {
    const c = cls;
    const id = c.next || deal(c);
    c.next = null;
    c.n += 1; c.id = id; c.shot = null; c.used = 0; c.running = false; c.over = false;
    const n = c.n, q = byId(id) || { name: 'Pose' };
    studio.setLocked(true);
    studio.clearAll();
    $('count').textContent = `Pose ${n}`;
    $('name').textContent = q.name;
    tick();
    const shot = await shotOf(id);
    const img = shot && await loadImage(shot.url);
    if (cls !== c || c.n !== n) return;          // the class moved on, or ended, while it was drawn
    if (!img) {
      c.fails += 1;
      if (c.fails >= 3 || c.pool.length < 2) { Studio.toast('The poses could not be drawn, so the class is over'); finish(); return; }
      Studio.toast(`${q.name} could not be drawn; on to the next pose`);
      showPose();
      return;
    }
    c.fails = 0;
    shot.img = img;                                // (for the figure's shape, when the drawing is scored)
    c.shot = shot; c.since = performance.now();
    studio.setReference(img, `${q.name}, pose ${n}. Drawn from the Pose and light figure.`);
    studio.setLocked(false);
    $('say').textContent = `Pose ${n}: ${q.name}`;
    // the clock starts when the pose can be seen
    run(!c.held && Studio.tab() === 'figure' && !document.hidden);
    c.next = deal(c);
    shotOf(c.next);                               // the next one, ready in time
  }
  // the clock: time used on this pose, counting only while it runs
  const usedMs = () => (cls ? cls.used + (cls.running ? performance.now() - cls.from : 0) : 0);
  function run(on) {
    if (!cls) return;
    if (on && !cls.running && cls.shot && !cls.over) { cls.from = performance.now(); cls.running = true; }
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
      // the last stretch shows: the last fifth of a short pose (at least 3 s), the last 30 seconds of a long one
      clock.classList.toggle('is-low', !!cls.shot && left <= Math.min(30, Math.max(3, cls.secs * 0.2)));
      if (left <= 0 && cls.running) endPose(true);
    } else {
      clock.textContent = fmtTime(used);
      clock.setAttribute('aria-label', 'Time on this pose');
    }
    clock.classList.toggle('is-paused', !!cls.shot && !cls.running && !cls.over);
  }
  // Pause holds the clock (Timed); so does leaving the tab or the page
  function hold(on) {
    if (!cls) return;
    cls.held = on;
    const b = $('pause');
    b.classList.toggle('is-held', on);
    b.querySelector('.fig-btn-text').textContent = on ? 'Resume' : 'Pause';
    b.querySelector('path').setAttribute('d', on ? 'M8 5l11 7-11 7z' : 'M9 6v12M15 6v12');
    b.setAttribute('aria-label', on ? 'Resume the clock' : 'Pause the clock');
    run(!on);
  }
  $('pause').addEventListener('click', () => hold(!cls.held));
  // a hidden page holds a timed class until Resume; a relaxed one stops its clock until the page is back
  document.addEventListener('visibilitychange', () => {
    if (!cls || cls.over) return;
    if (cls.mode === 'timed') { if (document.hidden && !cls.held) hold(true); return; }
    if (document.hidden) run(false);
    else if (Studio.tab() === 'figure') run(true);
  });
  // Done, or the time running out, ends a pose: pencils down, the drawing kept, and the card
  $('done').addEventListener('click', () => {
    // (a pose just shown takes no Done for half a second, so a double tap cannot skip it)
    if (!cls || !cls.shot || cls.over || performance.now() - cls.since < 500) return;
    endPose(false);
  });
  function endPose(timedOut) {
    cls.over = true;
    run(false);
    studio.setLocked(true);
    if (timedOut && window.GameSound && GameSound.on()) GameSound.chime();
    showResult(keep(), timedOut);
  }
  // the drawing of this pose, with its gesture and score, kept for the end of the class (as a JPEG behind a
  // Blob URL, which the policy allows where a data: picture is refused: the full picture is only held until
  // the card has shown it, and an empty sheet keeps no picture at all)
  function keep() {
    const pic = studio.composite(), a = analyze(cls.shot, studio.ink());
    const r = { n: cls.n, id: cls.id, name: (byId(cls.id) || { name: 'Pose' }).name, shot: cls.shot, pic, image: a.marked ? asBlobUrl(pic.toDataURL('image/jpeg', 0.88)) : null, w: pic.width, h: pic.height, analysis: a, secs: Math.round(usedMs() / 1000) };
    cls.results.push(r);
    return r;
  }
  // ✕ stops the class (a second tap within 3 seconds); the drawings so far come back for review
  let endArmed = 0;
  function endClass() {
    if (!cls) return;
    if (performance.now() - endArmed > 3000) { endArmed = performance.now(); Studio.toast('Tap ✕ again to stop the class'); return; }
    endArmed = 0;
    run(false);
    if (!cls.over && cls.shot && hasInk(studio.ink())) keep().pic = null;
    Studio.toast('The class is over');
    finish();
  }
  $('end').addEventListener('click', endClass);
  function finish() {
    const c = cls;
    clearInterval(ticker);
    hideResult();
    studio.setLocked(false);
    cls = null;
    // the poses saved in Pose and light may have changed during the class
    if (poses) tellFrame({ type: 'pose-and-light:list' });
    // a class with nothing drawn in it goes straight back to the setup (the drawings before stay)
    if (!c.results.some((r) => r.analysis.marked)) { show('setup'); showSetup(); $('start').focus(); return; }
    if (last) last.results.forEach((r) => { if (r.image) URL.revokeObjectURL(r.image); r.image = null; r.img = null; }); // the class before goes, pictures and all
    last = c;
    showReview(c);
    show('review');
    window.scrollTo(0, 0);
    $('reviewTitle').focus({ preventScroll: true });
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

  // the marks, small: which cells of a grid about 240 across (over the paper, or over part of it, `r`)
  // have any mark in them; x0, y0 is where the grid starts on the paper
  const GRID = 240;
  function inkMap(ink, r) {
    const whole = !r;
    r = r || { x: 0, y: 0, w: ink.width, h: ink.height };
    const s = Math.min(1, GRID / Math.max(r.w, r.h));
    const w = Math.max(1, Math.round(r.w * s)), h = Math.max(1, Math.round(r.h * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    // (the whole sheet is shrunk a lot: averaged, so a thin light line is not skipped between samples)
    if (whole) x.imageSmoothingQuality = 'high';
    x.drawImage(ink, r.x, r.y, r.w, r.h, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, on = new Uint8Array(w * h);
    let n = 0;
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] >= 10) { on[i] = 1; n++; }
    return { w, h, s, x0: r.x, y0: r.y, on, n };
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
    const big = sizes.reduce((a, b) => Math.max(a, b), 0), keep = sizes.map((n) => n >= big * 0.04);
    const on = new Uint8Array(w * h);
    let n = 0;
    for (let i = 0; i < w * h; i++) if (m.on[i] && keep[label[i]]) { on[i] = 1; n++; }
    return { w, h, s: m.s, x0: m.x0, y0: m.y0, on, n, label, pieces: sizes.length };
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
  // The wooden figure's own shape in its reference picture (the wood, told from the gray studio by its
  // color), as a grid of cells and how far each is from the figure, and its cast shadow on the floor
  // (gray, darker than the floor, in the lower half, touching the figure, and a little past its soft
  // edge). Made once for a pose, when its picture has been loaded (shot.img).
  function figureMask(shot) {
    if (shot.mask !== undefined) return shot.mask;
    if (!shot.img) return null;
    const s = Math.min(1, 160 / Math.max(shot.w, shot.h)), w = Math.max(1, Math.round(shot.w * s)), h = Math.max(1, Math.round(shot.h * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(shot.img, 0, 0, w, h);
    const px = x.getImageData(0, 0, w, h).data, on = new Uint8Array(w * h), cast = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = px[i * 4], gr = px[i * 4 + 1], b = px[i * 4 + 2];
      on[i] = r - b > 20 && r > 55 ? 1 : 0;
      cast[i] = !on[i] && Math.abs(r - b) < 12 && 0.3 * r + 0.59 * gr + 0.11 * b < 110 && i >= w * Math.floor(h * 0.5) ? 1 : 0;
    }
    const dc = distances({ w, h, on: cast }), d = distances({ w, h, on });
    for (let i = 0; i < w * h; i++) cast[i] = !on[i] && dc[i] <= 3 ? 1 : 0;
    // only the patches that touch the figure, as a cast shadow does (the studio's dark edges do not)
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let i = 0; i < w * h; i++) if (on[i]) { const x = i % w, y = Math.floor(i / w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const near = 0.1 * Math.max(1, x1 - x0, y1 - y0), seen = new Uint8Array(w * h), stack = [];
    for (let start = 0; start < w * h; start++) {
      if (!cast[start] || seen[start]) continue;
      const patch = [];
      let low = Infinity;
      seen[start] = 1; stack.push(start);
      while (stack.length) {
        const c = stack.pop(), x = c % w, y = (c - x) / w;
        patch.push(c); low = Math.min(low, d[c]);
        if (x > 0 && cast[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
        if (x < w - 1 && cast[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
        if (y > 0 && cast[c - w] && !seen[c - w]) { seen[c - w] = 1; stack.push(c - w); }
        if (y < h - 1 && cast[c + w] && !seen[c + w]) { seen[c + w] = 1; stack.push(c + w); }
      }
      if (low > near) patch.forEach((c) => { cast[c] = 0; });
    }
    shot.mask = { w, h, s, d, cast };
    return shot.mask;
  }
  /*
   * Lays the gesture over a drawing (`ink`: the marks alone, the paper's size). It is fitted to the box
   * around the marks, then moved and sized to sit on them as closely as it can; with no marks it sits
   * where the reference would, as large as fits the paper. Then each part is checked for marks near it,
   * the drawing is scored, and a few notes are written about the pose and the drawing.
   */
  function analyze(shot, ink) {
    const g = gestureOf(shot), W = ink.width, H = ink.height;
    const m0 = inkMap(ink), marked = m0.n >= 25;
    let map, match = null, inkBox = null, shapeBox = null, score = 0, scoreParts = null;
    const kRef = Math.min(W / shot.w, H / shot.h);
    const refMap = { k: kRef, ox: (W - shot.w * kRef) / 2, oy: (H - shot.h * kRef) / 2 };
    if (marked) {
      // the marks are then measured over the drawing and the room around it, so a small drawing is
      // measured as finely as a large one
      const b0 = boxOf(mainMarks(m0)), bw = b0.w / m0.s, bh = b0.h / m0.s, pad = 0.45 * Math.max(bw, bh);
      const x0 = Math.max(0, b0.x / m0.s - pad), y0 = Math.max(0, b0.y / m0.s - pad);
      const m = inkMap(ink, { x: x0, y: y0, w: Math.min(W, b0.x / m0.s + bw + pad) - x0, h: Math.min(H, b0.y / m0.s + bh + pad) - y0 });
      const gx = (px) => (px - m.x0) * m.s, gy = (py) => (py - m.y0) * m.s;
      const main = mainMarks(m), b = boxOf(main);
      inkBox = { x: m.x0 + b.x / m.s, y: m.y0 + b.y / m.s, w: b.w / m.s, h: b.h / m.s };
      const d = distances(m), samples = samplesOf(g);
      const kW = inkBox.w / g.box.w, kH = inkBox.h / g.box.h, k0 = Math.min(kW, kH);
      const cap = Math.max(3, 0.09 * g.size * k0 * m.s);
      const near = (mp, p) => {
        const x = Math.round(gx(mp.ox + p.x * mp.k)), y = Math.round(gy(mp.oy + p.y * mp.k));
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
        // a light pull toward the size of the box around the marks
        return sum / Math.ceil(samples.length / 2) + cap * 0.05 * Math.abs(Math.log(k / k0)) / 0.3;
      };
      // Tried from many starts: a few sizes (to fit the box around the marks, its height alone, its width
      // alone, or larger, since a part left out of the drawing shrinks the box), each with the gesture's box
      // meeting the marks' box at a corner, the middle of a side or the middle (one side of the box may be
      // short, the others still line up), and where the reference would be. Around each a small spread of
      // sizes and places; the best few are then polished (a step each way in size and place, the steps
      // halving), since the best on the spread can be a fit that locks onto one end of the drawing.
      const tried = [];
      const steps = (n, by) => Array.from({ length: 2 * n + 1 }, (_, i) => (i - n) * by);
      const starts = [{ k: refMap.k, mx: refMap.ox + cx * refMap.k, my: refMap.oy + cy * refMap.k }];
      [k0, kH, kW, Math.max(kW, kH) * 1.3, k0 * 1.6].forEach((k) => [0, 0.5, 1].forEach((ax) => [0, 0.5, 1].forEach((ay) => {
        starts.push({ k, mx: inkBox.x + ax * inkBox.w + (0.5 - ax) * g.box.w * k, my: inkBox.y + ay * inkBox.h + (0.5 - ay) * g.box.h * k });
      })));
      starts.forEach((from) => steps(2, 0.06).forEach((f) => steps(2, 0.04).forEach((dx) => steps(2, 0.04).forEach((dy) => {
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
        const mp = mapAt(k, mx, my), S = segs.map(([a, c]) => [gx(mp.ox + a.x * k), gy(mp.oy + a.y * k), gx(mp.ox + c.x * k), gy(mp.oy + c.y * k)]);
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
        if (seeds.length >= 8) break;
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
      map = mapAt(best.k, best.mx, best.my);
      // which parts have marks near them, along half their length or more (an outline of the body sits
      // further from the spine than an outline of an arm from its bone)
      const tolOf = (key) => Math.max(1.5, (key === 'body' ? 0.09 : key === 'head' ? 0.06 : 0.045) * g.size * map.k * m.s);
      // (measured without the fit's cap, which can be smaller than a part's own allowance)
      const at = (mp, p) => { const x = Math.round(gx(mp.ox + p.x * mp.k)), y = Math.round(gy(mp.oy + p.y * mp.k)); return x < 0 || y < 0 || x >= m.w || y >= m.h ? Infinity : d[y * m.w + x]; };
      const hits = {}, counts = {};
      samples.forEach(({ key, p }) => { counts[key] = (counts[key] || 0) + 1; if (at(map, p) <= tolOf(key)) hits[key] = (hits[key] || 0) + 1; });
      match = {};
      Object.keys(counts).forEach((key) => { match[key] = (hits[key] || 0) / counts[key] >= 0.45; });
      const unitPx = g.size * map.k * m.s;      // the gesture's size, in cells
      // how near a cell of the grid is to the figure in the reference: its distance from the wood, as a
      // part of the gesture's size, turned into credit
      const fig = figureMask(shot);
      // a cell of the grid, in the reference's figure mask (-1 off it)
      const figCell = (cx2, cy2) => {
        const x = Math.round(((m.x0 + (cx2 + 0.5) / m.s) - map.ox) / map.k * fig.s), y = Math.round(((m.y0 + (cy2 + 0.5) / m.s) - map.oy) / map.k * fig.s);
        return x < 0 || y < 0 || x >= fig.w || y >= fig.h ? -1 : y * fig.w + x;
      };
      const onFigure = fig && ((cx2, cy2) => {
        const i = figCell(cx2, cy2);
        return i < 0 ? 0 : Math.max(0, Math.min(1, 1 - (fig.d[i] / fig.s / g.size - 0.02) / 0.03));
      });
      // the cast shadow, as the reference shows it: drawing it is no scribble, and no part of the figure
      const onCast = (cx2, cy2) => { if (!fig) return false; const i = figCell(cx2, cy2); return i >= 0 && fig.cast[i] === 1; };
      // how much of the room around the figure (inside the drawing's box) has marks in it: a drawing
      // leaves it nearly empty (a floor line, the cast shadow), a scribble fills it as much as the figure
      let room = 0, filled = 0;
      if (fig) {
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
          const i = figCell(x, y), off = i < 0 || fig.d[i] / fig.s / g.size > 0.06;
          if (off && !onCast(x, y)) { room++; if (m.on[y * m.w + x]) filled++; }
        }
      }
      const clean = room > 20 ? Math.max(0, Math.min(1, 1 - (filled / room - 0.04) / 0.12)) : 1;
      // The drawing's own box, for its overall shape: the pieces of marks that are mostly on the figure
      // (a name, a label or a line across the sheet is not part of it), leaving out the cast shadow.
      shapeBox = inkBox;
      if (fig) {
        const onIt = new Uint32Array(main.pieces), all = new Uint32Array(main.pieces);
        for (let i = 0; i < m.w * m.h; i++) {
          if (!main.on[i]) continue;
          const x = i % m.w, y = Math.floor(i / m.w);
          all[main.label[i]]++;
          if (onFigure(x, y) > 0) onIt[main.label[i]]++;
        }
        const kept = { w: m.w, h: m.h, on: new Uint8Array(m.w * m.h), n: 0 };
        for (let i = 0; i < m.w * m.h; i++) {
          if (!main.on[i] || onIt[main.label[i]] < 0.3 * all[main.label[i]] || onCast(i % m.w, Math.floor(i / m.w))) continue;
          kept.on[i] = 1; kept.n++;
        }
        if (kept.n >= 25) { const kb = boxOf(kept); shapeBox = { x: m.x0 + kb.x / m.s, y: m.y0 + kb.y / m.s, w: kb.w / m.s, h: kb.h / m.s }; }
      }
      const figPts = inkPts.filter(([px, py]) => !onCast(px, py));
      ({ score, ...scoreParts } = scoreOf(g, samples.map(({ key, p }) => ({ key, d: at(map, p) })), unitPx, figPts, g.parts.map((part) => part.pts.map((q) => [gx(map.ox + q.x * map.k), gy(map.oy + q.y * map.k)])), shapeBox, onFigure, clean, Object.values(match).filter((ok) => !ok).length));
    } else map = refMap;
    return { g, map, match, inkBox, marked, score, scoreParts, stars: marked ? starsFor(score) : 0, tips: notes(g, marked ? shapeBox : null, match, scoreParts) };
  }
  /*
   * How well a drawing follows its pose's gesture, from 0 to 100 (all lengths are parts of the gesture's
   * size, `unit`). Two measures, which a drawing needs both of:
   * - follow: how much of the gesture has marks along it. Each part counts for its share (the body most,
   *   then the legs, the arms and the head), with full credit for marks within its allowance (3.5% for
   *   an arm or a leg, 5% for the head, 7% for the body, which an outline of it sits further out from)
   *   and none at twice that;
   * - along: how much of the drawing lies on the figure, measured against the wooden figure's own shape
   *   in the reference (full credit inside it or within 2% of its edge, none past 5%), so an outline and
   *   shading count, a scribble over the paper does not. (Without the picture, within 4% of the gesture
   *   counts, past 10% not.)
   * They are put together as their harmonic mean, so neither can make up for the other, and taken down
   * by up to 15% when the drawing is not as wide for its height as the pose. A drawing that fills the room
   * around the figure (more than 4% of it marked, all of it by 16%) is taken down to nothing: a scribble.
   * And each part dashed on the card (no marks near it) takes off 18%, so the stars agree with it.
   */
  const SHARES = { head: 0.12, body: 0.22, armR: 0.15, armL: 0.15, legR: 0.18, legL: 0.18 };
  const ALLOW = { head: 0.05, body: 0.07 };
  function scoreOf(g, near, unit, inkPts, lines, inkBox, onFigure, clean, dashed) {
    const credit = {}, counts = {};
    near.forEach(({ key, d }) => {
      const t = (ALLOW[key] || 0.035) * unit;
      counts[key] = (counts[key] || 0) + 1;
      credit[key] = (credit[key] || 0) + Math.max(0, Math.min(1, 1 - (d - t) / t));
    });
    const follow = Object.keys(SHARES).reduce((sum, key) => sum + SHARES[key] * (counts[key] ? credit[key] / counts[key] : 0), 0);
    const r1 = 0.04 * unit, r2 = 0.1 * unit;
    let along = 0;
    inkPts.forEach(([px, py]) => {
      if (onFigure) { along += onFigure(px, py); return; }
      let low = Infinity;
      lines.forEach((pts) => { for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
        low = Math.min(low, Math.hypot(px - ax - t * vx, py - ay - t * vy));
      } });
      along += Math.max(0, Math.min(1, 1 - (low - r1) / (r2 - r1)));
    });
    const onPose = Math.min(1, (inkPts.length ? along / inkPts.length : 0) / 0.9);
    const shape = Math.max(0, Math.min(1, 1 - Math.abs(Math.log((inkBox.w / inkBox.h) / (g.box.w / g.box.h))) / Math.log(1.6)));
    const both = follow + onPose > 0 ? 2 * follow * onPose / (follow + onPose) : 0;
    return { score: Math.round(100 * both * (0.85 + 0.15 * shape) * clean * Math.max(0, 1 - 0.18 * dashed)), follow, along: onPose, shape, clean, dashed };
  }
  // stars as the games give them, and a word for each
  const STARS = [88, 78, 65, 50, 30];
  const GRADES = ['Keep drawing', 'Keep drawing', 'Getting there', 'Good gesture', 'Strong gesture!', 'Gesture master!'];
  const starsFor = (pct) => STARS.filter((min) => pct >= min).length;
  // what to look for: the line of action, the tilts, the size in heads, the drawing's shape, missed parts
  function notes(g, inkBox, match, sp) {
    const tips = [], P = g.P, head = g.head.a * 2, a = g.action;
    const lean = Math.abs(Math.atan2(a.p3.x - a.p0.x, a.p3.y - a.p0.y)) * 180 / Math.PI, slant = Math.min(lean, 180 - lean);
    tips.push(['Line of action', {
      straight: slant < 25 ? 'nearly straight: a calm, upright pose. Even so, draw it first: one line from the head to the foot.'
        : 'nearly straight, on a slant: the whole body leans along one line. Draw it first: one line from the head to the foot.',
      C: 'a C curve: the whole body bends one way. Draw this curve first, then hang the body on it.',
      S: 'an S curve: the body bends one way, then the other. Draw this curve first, then hang the body on it.',
    }[a.shape]]);
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
      const missed = g.parts.filter((p) => match[p.key] === false).map((p) => p.name);
      const list = missed.length > 1 ? `${missed.slice(0, -1).join(', ')} and ${missed[missed.length - 1]}` : missed[0];
      // (praise only when nothing else took the stars down: marks around the figure, or off it)
      if (missed.length) tips.push(['Dashed', `no marks near ${list}. Look again at where ${missed.length > 1 ? 'they go' : 'it goes'}.`]);
      else if (sp && sp.clean < 0.9) tips.push(['Extra marks', 'marks fill the space around the figure, and they count against the match. Draw the figure, and leave the room around it empty.']);
      else if (sp && sp.along < 0.8) tips.push(['Off the figure', 'much of your drawing lies off the figure. Keep your marks on the body, the head and the limbs.']);
      else tips.push(['Well matched', 'your marks follow every part of the gesture.']);
    } else tips.push(['Nothing drawn', 'the gesture is shown where the reference would sit.']);
    return tips;
  }
  function showTips(list, tips) {
    list.textContent = '';
    tips.forEach(([lead, text]) => { const li = document.createElement('li'), b = document.createElement('strong'); b.textContent = lead + ': '; li.append(b, text); list.appendChild(li); });
  }

  // ---- The card after each pose ----------------------------------------------------------------------

  // Like the games' score: the match counts up, the stars pop in one by one, then the word for them.
  // Under it the drawing with the gesture over it, beside the pose, and the notes. The rest of the
  // studio waits behind it until Next pose or Stop class.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let resultShown = false, countUp = 0, cardAt = 0;
  // a tap already on its way when the card comes, or a second Enter on Done, does not answer it
  const cardSettled = () => performance.now() - cardAt >= 600;
  function drawWithGesture(canvas, r, img) {
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const f = canvas.width / r.w, a = r.analysis;
    drawGesture(g, a.g, { k: a.map.k * f, ox: a.map.ox * f, oy: a.map.oy * f }, a.marked ? a.match : null);
  }
  function showResult(r, timedOut) {
    const a = r.analysis, pct = a.score, stars = a.stars;
    resultShown = true;
    cardAt = performance.now();
    $('kicker').textContent = timedOut ? 'Time’s up!' : `Pose ${r.n} done`;
    $('grade').textContent = a.marked ? GRADES[stars] : 'Nothing drawn';
    $('stars').setAttribute('aria-label', `${stars} out of 5 stars, ${pct}% gesture match`);
    $('stars').querySelectorAll('.game-star').forEach((st, i) => { st.classList.toggle('is-on', i < stars); st.style.setProperty('--i', i); });
    const cv = $('drawing');
    cv.width = Math.round(r.w / 2); cv.height = Math.round(r.h / 2);
    drawWithGesture(cv, r, r.pic);
    r.pic = null;
    $('pose').src = r.shot.url;
    $('pose').alt = `The pose: ${r.name}`;
    showTips($('tips'), a.tips.filter(([lead]) => lead !== 'Measure'));
    $('nextPose').disabled = false;
    $('result').hidden = false;
    [...root.children].forEach((el) => { if (el !== $('result')) el.inert = true; });
    // the entrance, as the games do it
    const pop = $('popup');
    pop.classList.remove('is-shown');
    void pop.offsetWidth;
    pop.classList.add('is-shown');
    pop.scrollTop = 0;
    cancelAnimationFrame(countUp);
    if (reduceMotion.matches) $('pct').textContent = pct;
    else {
      // timed from the first frame: a frame's timestamp can come before a performance.now() read
      // earlier in the same frame, which would start the count below zero
      let t0 = -1;
      const ms = 1100;
      const step = (t) => {
        if (t0 < 0) t0 = t;
        const k = Math.min(1, (t - t0) / ms);
        $('pct').textContent = Math.round(pct * (1 - Math.pow(1 - k, 3)));
        if (k < 1) countUp = requestAnimationFrame(step);
      };
      countUp = requestAnimationFrame(step);
    }
    $('say').textContent = `${$('kicker').textContent} ${r.name}: ${a.marked ? `${stars} out of 5 stars, ${pct}% gesture match. ${GRADES[stars]}` : 'nothing drawn'}`.replace(/([^!.])$/, '$1.');
    $('nextPose').focus({ preventScroll: true });
  }
  function hideResult() {
    resultShown = false;
    cancelAnimationFrame(countUp);
    $('result').hidden = true;
    [...root.children].forEach((el) => { el.inert = false; });
  }
  $('nextPose').addEventListener('click', () => {
    if (!cls || !resultShown || !cardSettled()) return;
    $('nextPose').disabled = true;            // (one pose for one tap)
    // a hold belonged to the pose that ended: Next pose, pressed here on the tab, starts the next one's clock
    if (cls.held) hold(false);
    hideResult();
    $('done').focus({ preventScroll: true });
    showPose();
  });
  $('stop').addEventListener('click', () => { if (cls && cardSettled()) finish(); });

  // ---- The review ------------------------------------------------------------------------------------

  let gesturesShown = true;
  function drawCard(canvas, r, img) {
    if (gesturesShown) drawWithGesture(canvas, r, img);
    else canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  const drawn = (c) => c.results.filter((r) => r.analysis.marked);
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  function showReview(c) {
    const list = drawn(c), n = list.length;
    const avg = list.reduce((sum, r) => sum + r.analysis.stars, 0) / n;
    const shown = half(avg);
    $('reviewLede').textContent = `${n} drawing${n > 1 ? 's' : ''} from ${c.mode === 'timed' ? `a timed class, ${TIMES[c.secs]} a pose` : 'a relaxed class'}, ${shown} star${shown === '1' || shown === '½' ? '' : 's'} on average. Each is beside the pose it was drawn from, with the pose's gesture laid over it.`;
    const box = $('cards');
    box.textContent = '';
    list.forEach((r, i) => {
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
      const rating = document.createElement('p');
      rating.className = 'fig-rating';
      const st = document.createElement('span');
      st.className = 'fig-rating-stars';
      st.textContent = starText(r.analysis.stars);
      st.setAttribute('aria-hidden', 'true');
      const said = document.createElement('span');
      said.className = 'visually-hidden';
      said.textContent = `${r.analysis.stars} out of 5 stars,`;
      rating.append(st, said, ` ${r.analysis.score}% · ${GRADES[r.analysis.stars]}`);
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
      card.append(pair, cap, rating, tips, saveBtn);
      box.appendChild(card);
      loadImage(r.image).then((img) => { if (img) { r.img = img; drawCard(cv, r, img); } });
    });
  }
  panel.querySelectorAll('[data-fig-gesture]').forEach((b) => b.addEventListener('click', () => {
    gesturesShown = b.dataset.figGesture === '1';
    panel.querySelectorAll('[data-fig-gesture]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (last) $('cards').querySelectorAll('canvas').forEach((cv, i) => {
      const r = drawn(last)[i];
      if (r && r.img) drawCard(cv, r, r.img);
      cv.setAttribute('aria-label', `Your drawing of ${r.name}${gesturesShown ? ', with the gesture over it' : ''}`);
    });
  }));
  $('again').addEventListener('click', () => { if (last) startClass({ mode: last.mode, secs: last.secs, pool: last.pool }); });
  $('new').addEventListener('click', () => { show('setup'); showSetup(); window.scrollTo(0, 0); });
  // the drawings of the class before stay until another class starts
  $('back').addEventListener('click', () => { show('review'); window.scrollTo(0, 0); $('reviewTitle').focus({ preventScroll: true }); });

  // ---- The tab ---------------------------------------------------------------------------------------

  function onTab(name) {
    const on = name === 'figure';
    if (!on) {
      // away from the tab the clock stops: a timed class waits on Resume
      // (held even between poses, or the next pose's clock would start while you are away)
      // (not while the card shows: that pose is over, and the next starts on Next pose)
      if (cls && !cls.over) { if (cls.mode === 'timed') hold(true); else run(false); }
      studio.activate(false);
      return;
    }
    openFrame();
    if (cls) { show('draw'); if (cls.mode !== 'timed') run(true); return; }
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
  window.FigureStudy = { gestureOf, fitCurve, analyze, drawGesture, studio, state: () => cls, poses: () => poses, shotOf, starsFor, figureMaskOf: figureMask };
})();
