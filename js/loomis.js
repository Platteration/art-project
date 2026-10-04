/*
 * The Loomis head tab: the photo fills the screen, and a card asks for one feature at a time: the
 * eyes, the brows, the nose, the mouth, the chin and the forehead. Each is tapped and locked in,
 * and then a Loomis head construction is fitted over the face: the ball of the cranium, the
 * flattened side plane, the brow line through the ball's centre, the hairline, the centre line
 * down the face, the eye, nose, mouth and chin lines and the jaw. Sliders then dial the head in.
 *
 * The head is a small 3-D model in units of the ball's radius, after Andrew Loomis's "Drawing the
 * Head and Hands": the brow line is the ball's equator, the side plane is the ball cut flat about
 * two-thirds of the way out, the nose sits at the bottom of the ball and the chin one more radius
 * below, so hairline to brow, brow to nose and nose to chin are about equal. The model is turned,
 * nodded and tilted, scaled and placed, and its face stretched a little for long or short faces,
 * to land its landmarks on the marks (a least-squares fit, tried from several turns), then drawn
 * in orthographic projection: lines on the far side of the head are faint and dashed. The same
 * head is drawn over the Study tab's pictures, goes into saved PNGs and into the lines the Studio
 * copies onto its underdrawing.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById('lh-' + id);
  const root = $('root');
  if (!root) return;
  const q = (sel) => root.querySelectorAll(sel);

  // ---- The marks, in picture fractions (0-1), and where the model has each feature -------------
  const C = 0.72, SR = Math.sqrt(1 - C * C);        // where the side plane cuts the ball, and its radius
  const STEPS = [
    { key: 'leftEye', ask: 'Tap the middle of the eye on the LEFT of the picture.', model: [-0.4, 0.35, 0.85], weight: 1, face: true },
    { key: 'rightEye', ask: 'Now the middle of the eye on the RIGHT.', model: [0.4, 0.35, 0.85], weight: 1, face: true },
    { key: 'leftBrow', ask: 'The highest point of the left eyebrow.', model: [-0.4, -0.02, 0.9], weight: 0.5, optional: true },
    { key: 'rightBrow', ask: 'The highest point of the right eyebrow.', model: [0.4, -0.02, 0.9], weight: 0.5, optional: true },
    { key: 'nose', ask: 'The bottom of the nose, in the middle.', model: [0, 1.0, 1.0], weight: 1, face: true },
    { key: 'mouth', ask: 'The middle of the mouth, where the lips meet.', model: [0, 1.33, 0.92], weight: 1, face: true },
    { key: 'chin', ask: 'The bottom of the chin, in the middle.', model: [0, 2.0, 0.78], weight: 1, face: true },
    { key: 'forehead', ask: 'The top of the forehead, where the hair starts. Skip it if you cannot see it.', model: [0, -C, SR], weight: 0.6, optional: true },
  ];
  const NEEDED = ['leftEye', 'rightEye', 'nose', 'mouth', 'chin'];
  const state = { points: {}, step: 0, pending: null, fit: null, auto: null, shown: true, aspect: 1, moving: null };

  // ---- The model: pieces as 3-D polylines in ball radii. y runs down, z toward the viewer. --------
  const ring = (n, f) => Array.from({ length: n + 1 }, (_, i) => f((i / n) * Math.PI * 2));
  const PIECES = [
    { name: 'side', pts: ring(48, (t) => [-C, SR * Math.cos(t), SR * Math.sin(t)]) },
    { name: 'side', pts: ring(48, (t) => [C, SR * Math.cos(t), SR * Math.sin(t)]) },
    { name: 'sideLine', pts: [[-C, -SR, 0], [-C, SR, 0]] },
    { name: 'sideLine', pts: [[C, -SR, 0], [C, SR, 0]] },
    { name: 'brow', pts: ring(64, (t) => [Math.sin(t), 0, Math.cos(t)]) },
    { name: 'hair', pts: ring(64, (t) => [SR * Math.sin(t), -C, SR * Math.cos(t)]) },
    { name: 'centre', pts: ring(64, (t) => [0, -Math.cos(t), Math.sin(t)]) },
    { name: 'face', face: true, pts: [[0, 1, 1.0], [0, 1.2, 0.98], [0, 1.33, 0.92], [0, 1.7, 0.84], [0, 2.0, 0.78]] },
    { name: 'eyes', face: true, pts: Array.from({ length: 25 }, (_, i) => { const x = -0.72 + (1.44 * i) / 24; return [x, 0.35, Math.sqrt(Math.max(0, 1 - x * x - 0.35 * 0.35))]; }) },
    { name: 'nose', face: true, pts: Array.from({ length: 25 }, (_, i) => { const x = -0.72 + (1.44 * i) / 24; return [x, 1.0, Math.sqrt(Math.max(0, 1 - x * x))]; }) },
    { name: 'mouth', face: true, pts: Array.from({ length: 17 }, (_, i) => { const x = -0.5 + i / 16; return [x, 1.33, 0.92 - 0.4 * x * x]; }) },
    { name: 'chin', face: true, pts: Array.from({ length: 9 }, (_, i) => { const x = -0.3 + (0.6 * i) / 8; return [x, 2.0, 0.78 - 0.4 * x * x]; }) },
    { name: 'jaw', face: true, pts: [[-C, 0.1, 0], [-C, 0.75, 0.04], [-0.62, 1.4, 0.42], [-0.32, 1.92, 0.7], [0, 2.0, 0.78]] },
    { name: 'jaw', face: true, pts: [[C, 0.1, 0], [C, 0.75, 0.04], [0.62, 1.4, 0.42], [0.32, 1.92, 0.7], [0, 2.0, 0.78]] },
  ];
  // yaw turns the head left and right, pitch nods it, roll tilts it
  function rotate([x, y, z], [yaw, pitch, roll]) {
    let cx = Math.cos(yaw), sx = Math.sin(yaw);
    const X = x * cx + z * sx, Z = -x * sx + z * cx, Y = y;
    cx = Math.cos(pitch); sx = Math.sin(pitch);
    const Y2 = Y * cx - Z * sx, Z2 = Y * sx + Z * cx;
    cx = Math.cos(roll); sx = Math.sin(roll);
    return [X * cx - Y2 * sx, X * sx + Y2 * cx, Z2];
  }
  // a model point on the picture: x and y in fractions of the picture's width. Faces come long
  // and short: the face below the brow stretches by f.len, while the ball stays a ball.
  function project(p, f, face) { const pt = face ? [p[0], p[1] * f.len, p[2]] : p; const r = rotate(pt, [f.yaw, f.pitch, f.roll]); return [f.s * r[0] + f.tx, f.s * r[1] + f.ty, r[2]]; }

  // ---- The fit: scale, place and turn the model so its landmarks land on the marks ---------------
  function fitHead() {
    if (!NEEDED.every((k) => state.points[k])) return null;
    const marks = STEPS.filter((st) => state.points[st.key]).map((st) => ({ ...st, at: [state.points[st.key].x, state.points[st.key].y * state.aspect] }));
    const L = state.points.leftEye, R = state.points.rightEye, N = state.points.nose;
    const ex = R.x - L.x, ey = (R.y - L.y) * state.aspect;
    const roll = Math.atan2(ey, ex), eyeDist = Math.hypot(ex, ey);
    const mid = [(L.x + R.x) / 2, ((L.y + R.y) / 2) * state.aspect];
    const nx = (N.x - mid[0]) * Math.cos(-roll) - (N.y * state.aspect - mid[1]) * Math.sin(-roll);
    const s0 = eyeDist / 0.8;
    const yaw0 = Math.max(-1.2, Math.min(1.2, Math.asin(Math.max(-0.95, Math.min(0.95, nx / (s0 * 0.95))))));
    const cost = (v) => {
      const f = { s: v[0], tx: v[1], ty: v[2], yaw: v[3], pitch: v[4], roll: v[5], len: v[6] };
      let e = 0;
      marks.forEach((m) => { const p = project(m.model, f, m.face); e += m.weight * ((p[0] - m.at[0]) ** 2 + (p[1] - m.at[1]) ** 2); });
      // a pull toward a level head and an ordinary face length; turning is free, since profiles are real
      e += 2e-3 * f.pitch * f.pitch + 2e-4 * f.yaw * f.yaw + 2e-3 * (f.len - 1) * (f.len - 1);
      return e + (f.s <= 0 || f.len < 0.75 || f.len > 1.3 ? 1e9 : 0);
    };
    // a turned head is easy to mistake for a narrow one, so several turns are tried and the best kept
    let best = null, bestCost = Infinity;
    [yaw0, -1.1, -0.7, -0.35, 0, 0.35, 0.7, 1.1].forEach((yaw) => {
      const from = [s0 / Math.max(0.45, Math.cos(yaw)), mid[0], mid[1] - 0.35 * s0, yaw, 0, roll, 1];
      const v = nelderMead(cost, from, [s0 * 0.2, s0 * 0.2, s0 * 0.2, 0.25, 0.25, 0.2, 0.1], 300);
      const c = cost(v);
      if (c < bestCost) { bestCost = c; best = v; }
    });
    const v = nelderMead(cost, best, [s0 * 0.05, s0 * 0.05, s0 * 0.05, 0.08, 0.08, 0.05, 0.03], 300);
    return { s: v[0], tx: v[1], ty: v[2], yaw: v[3], pitch: v[4], roll: v[5], len: v[6] };
  }
  function nelderMead(f, x0, steps, iters) {
    const n = x0.length;
    let simplex = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; simplex.push(x); }
    let vals = simplex.map(f);
    const order = () => { const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]); simplex = idx.map((i) => simplex[i]); vals = idx.map((i) => vals[i]); };
    for (let k = 0; k < iters; k++) {
      order();
      const c = Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      const worst = simplex[n];
      const xr = c.map((cj, j) => cj + (cj - worst[j])), fr = f(xr);
      if (fr < vals[0]) {
        const xe = c.map((cj, j) => cj + 2 * (cj - worst[j])), fe = f(xe);
        if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; }
      } else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr; }
      else {
        const xc = c.map((cj, j) => cj + 0.5 * (worst[j] - cj)), fc = f(xc);
        if (fc < vals[n]) { simplex[n] = xc; vals[n] = fc; }
        else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j])); vals[i] = f(simplex[i]); }
      }
    }
    order();
    return simplex[0];
  }

  // ---- Marking: one feature at a time, placed with a tap (or drag), then locked in ---------------
  const done = () => state.step >= STEPS.length;
  const current = () => STEPS[state.step];
  function place(x, y) {
    if (done()) {
      // all placed: a tap near a dot picks it up to move
      let best = null, bd = 0.035;
      STEPS.forEach((st) => { const p = state.points[st.key]; if (!p) return; const d = Math.hypot(p.x - x, (p.y - y) * state.aspect); if (d < bd) { bd = d; best = st.key; } });
      state.moving = best;
      if (best) { state.points[best] = { x, y }; refit(); }
      return;
    }
    state.pending = { x, y };
    render();
  }
  function drag(x, y) {
    if (done()) { if (state.moving) { state.points[state.moving] = { x, y }; refit(); } return; }
    if (state.pending) { state.pending = { x, y }; render(); }
  }
  function release() { state.moving = null; }
  function lock() {
    if (!state.pending || done()) return;
    state.points[current().key] = state.pending;
    state.pending = null;
    state.step++;
    refit();
    if (done()) Studio.toast('The Loomis head is over the face. Dial it in with Adjust.');
  }
  function skip() {
    if (done() || !current().optional) return;
    delete state.points[current().key];
    state.pending = null;
    state.step++;
    refit();
  }
  function back() {
    if (state.pending) { state.pending = null; render(); return; }
    if (!state.step) return;
    state.step--;
    state.pending = state.points[current().key] || null;
    delete state.points[current().key];
    refit();
  }
  function reset() { state.points = {}; state.step = 0; state.pending = null; state.fit = null; state.auto = null; state.moving = null; closeSheet(); render(); }
  function refit() { state.fit = fitHead(); state.auto = state.fit && { ...state.fit }; render(); }

  // ---- The adjust sheet: sliders over the fitted pose ---------------------------------------------
  const DEG = 180 / Math.PI;
  const SLIDERS = [
    ['turn', 'yaw', (v) => v / DEG, (f) => f.yaw * DEG, (v) => `${Math.round(v)}°`],
    ['nod', 'pitch', (v) => v / DEG, (f) => f.pitch * DEG, (v) => `${Math.round(v)}°`],
    ['tilt', 'roll', (v) => v / DEG, (f) => f.roll * DEG, (v) => `${Math.round(v)}°`],
    ['size', 's', (v) => (state.auto ? state.auto.s : 0.2) * (v / 100), (f) => (state.auto ? (f.s / state.auto.s) * 100 : 100), (v) => `${Math.round(v)}%`],
    ['across', 'tx', (v) => (state.auto ? state.auto.tx : 0.5) + v / 100, (f) => (state.auto ? (f.tx - state.auto.tx) * 100 : 0), (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`],
    ['updown', 'ty', (v) => (state.auto ? state.auto.ty : 0.5) + v / 100, (f) => (state.auto ? (f.ty - state.auto.ty) * 100 : 0), (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`],
    ['length', 'len', (v) => v / 100, (f) => f.len * 100, (v) => `${Math.round(v)}%`],
  ];
  SLIDERS.forEach(([id, key, toFit, fromFit, label]) => {
    $(id).addEventListener('input', () => {
      if (!state.fit) return;
      state.fit[key] = toFit(+$(id).value);
      $(id + 'Out').textContent = label(+$(id).value);
      Studio.redraw(); drawTab();
    });
  });
  function showSliders() {
    if (!state.fit) return;
    SLIDERS.forEach(([id, key, toFit, fromFit, label]) => { const v = fromFit(state.fit); $(id).value = v; $(id + 'Out').textContent = label(v); });
  }
  $('refit').addEventListener('click', () => { if (state.auto) { state.fit = { ...state.auto }; showSliders(); Studio.redraw(); drawTab(); } });
  function openSheet() { if (!state.fit) return; showSliders(); $('adjustSheet').hidden = false; $('adjust').setAttribute('aria-expanded', 'true'); }
  function closeSheet() { $('adjustSheet').hidden = true; $('adjust').setAttribute('aria-expanded', 'false'); }
  $('adjust').addEventListener('click', () => ($('adjustSheet').hidden ? openSheet() : closeSheet()));
  q('[data-lh-close]').forEach((b) => b.addEventListener('click', closeSheet));

  // ---- The card and the strip -----------------------------------------------------------------
  function render() {
    const d = done();
    $('stepLabel').textContent = d ? 'All marked' : `${state.step + 1} of ${STEPS.length}${current().optional ? ' · optional' : ''}`;
    $('ask').textContent = d ? 'The head is over the face. Drag a dot to move a mark, or use Adjust to dial the head in. Then draw it: the ball, the flat side, the centre line, the brow line, then the eye, nose, mouth and chin lines and the jaw.' : `${current().ask}${state.pending ? ' Then press Lock in.' : ''}`;
    $('lock').hidden = d; $('lock').disabled = !state.pending;
    $('skip').hidden = d || !current().optional;
    $('back').disabled = !state.step && !state.pending;
    $('cardStudio').hidden = !d;
    $('undo').disabled = !state.step && !state.pending;
    $('reset').disabled = !state.step && !state.pending;
    ['show', 'adjust', 'studio', 'save'].forEach((id) => { $(id).disabled = !state.fit; });
    $('show').setAttribute('aria-pressed', String(state.shown));
    Studio.redraw();
    drawTab();
  }
  $('lock').addEventListener('click', lock);
  $('skip').addEventListener('click', skip);
  $('back').addEventListener('click', back);
  $('undo').addEventListener('click', back);
  $('reset').addEventListener('click', reset);
  $('show').addEventListener('click', () => { state.shown = !state.shown; render(); });
  const toStudio = () => { document.getElementById('tabPaintBtn').click(); setTimeout(() => document.getElementById('ps-sketchFromStudy').click(), 150); };
  $('studio').addEventListener('click', toStudio);
  $('cardStudio').addEventListener('click', toStudio);
  $('save').addEventListener('click', () => {
    const prep = Studio.prep();
    if (!prep) return;
    const c = document.createElement('canvas'); c.width = prep.w; c.height = prep.h;
    const g = c.getContext('2d');
    g.drawImage($('photo'), 0, 0);
    draw(g, prep.w, prep.h, Math.max(1, Math.max(prep.w, prep.h) / 500));
    Studio.savePng(c, 'loomis-head.png');
  });
  $('exit').addEventListener('click', () => document.getElementById('tabStudyBtn').click());

  // ---- The photo on the stage, and the marks made on it ----------------------------------------
  const photo = $('photo'), overlay = $('overlay'), wrap = $('wrap');
  let active = false;
  function showPhoto() {
    const prep = Studio.prep();
    if (!prep) return;
    if (photo.width !== prep.w || photo.height !== prep.h) { photo.width = prep.w; photo.height = prep.h; }
    photo.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(prep.rgba), prep.w, prep.h), 0, 0);
    state.aspect = prep.h / prep.w;
    fit();
  }
  // the photo fits the stage, whichever way it is turned
  function fit() {
    const st = $('stage'), cs = getComputedStyle(st);
    const W = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), H = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!photo.width || W <= 0 || H <= 0) return;
    const k = Math.min(W / photo.width, H / photo.height);
    wrap.style.width = `${Math.floor(photo.width * k)}px`;
    wrap.style.height = `${Math.floor(photo.height * k)}px`;
    drawTab();
  }
  function drawTab() {
    if (!active) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr);
    const g = overlay.getContext('2d');
    g.clearRect(0, 0, overlay.width, overlay.height);
    draw(g, overlay.width, overlay.height, dpr * 1.15);
  }
  function layout() { if (!active) return; PaintStudio.pin(root); fit(); }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 60));
  if (window.visualViewport) { visualViewport.addEventListener('resize', layout); visualViewport.addEventListener('scroll', layout); }
  window.addEventListener('studio:result', () => { if (active) showPhoto(); });

  const pos = (e) => { const r = overlay.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  let down = false;
  overlay.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault(); overlay.setPointerCapture(e.pointerId); closeSheet();
    down = true;
    const [x, y] = pos(e); place(x, y);
  });
  overlay.addEventListener('pointermove', (e) => { if (!down) return; const [x, y] = pos(e); drag(x, y); });
  ['pointerup', 'pointercancel'].forEach((t) => overlay.addEventListener(t, () => { down = false; release(); }));
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- Drawing the head: on this tab's overlay, on the Study pictures and into saved PNGs ---------
  const COLORS = { side: '#e5322d', sideLine: '#e5322d', brow: '#1ec8ec', hair: '#e5322d', centre: '#1ec8ec', face: '#1ec8ec', eyes: '#ffd21f', nose: '#ffd21f', mouth: '#ffd21f', chin: '#ffd21f', jaw: '#e5322d' };
  // each piece's points in pixels for a picture W wide, with whether each is on the near side
  function projected(W) {
    const f = state.fit;
    if (!f) return [];
    return PIECES.map((piece) => ({ name: piece.name, pts: piece.pts.map((p) => { const pt = project(p, f, piece.face); return [pt[0] * W, pt[1] * W, pt[2] >= -0.05]; }) }));
  }
  function draw(g, W, H, unit) {
    if (!state.fit && !state.pending && !state.step) return;
    const f = state.fit;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (f && state.shown) {
      g.beginPath(); g.arc(f.tx * W, f.ty * W, f.s * W, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3.5 * unit; g.stroke();
      g.strokeStyle = '#e5322d'; g.lineWidth = 1.8 * unit; g.stroke();
      projected(W).forEach((piece) => {
        // runs of near-side points are solid; far-side runs dashed and faint
        for (let pass = 0; pass < 2; pass++) {
          const near = pass === 1;
          g.setLineDash(near ? [] : [4 * unit, 5 * unit]);
          g.globalAlpha = near ? 1 : 0.4;
          g.beginPath();
          let pen = false;
          piece.pts.forEach((p, i) => {
            const on = p[2] === near;
            if (on && !pen) { if (i > 0) g.moveTo(piece.pts[i - 1][0], piece.pts[i - 1][1]); else g.moveTo(p[0], p[1]); pen = true; }
            if (pen) g.lineTo(p[0], p[1]);
            if (!on) pen = false;
          });
          g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = (near ? 3.5 : 2.5) * unit; g.stroke();
          g.strokeStyle = COLORS[piece.name]; g.lineWidth = (near ? 1.8 : 1.2) * unit; g.stroke();
        }
      });
      g.setLineDash([]); g.globalAlpha = 1;
    }
    // the marks: locked ones as dots, the pending one as a ring
    const dot = (p, ring) => {
      g.beginPath(); g.arc(p.x * W, p.y * H, (ring ? 7 : 4.5) * unit, 0, Math.PI * 2);
      g.fillStyle = ring ? 'rgba(255,255,255,0.25)' : '#ffffff'; g.fill();
      g.strokeStyle = ring ? '#ffd21f' : 'rgba(0,0,0,0.7)'; g.lineWidth = (ring ? 2.5 : 1.5) * unit; g.stroke();
    };
    STEPS.forEach((st) => { if (state.points[st.key]) dot(state.points[st.key], false); });
    if (state.pending) dot(state.pending, true);
    g.restore();
  }
  // the near-side lines as straight segments in picture fractions, for the Studio's underdrawing
  function segments() {
    if (!state.fit || !state.shown) return [];
    const W = 1000, H = Math.round(W * state.aspect), f = state.fit, out = [], n = 48;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; out.push([f.tx + f.s * Math.cos(a), (f.ty + f.s * Math.sin(a)) / state.aspect, f.tx + f.s * Math.cos(b), (f.ty + f.s * Math.sin(b)) / state.aspect]); }
    projected(W).forEach((piece) => { for (let i = 1; i < piece.pts.length; i++) { const a = piece.pts[i - 1], b = piece.pts[i]; if (a[2] && b[2]) out.push([a[0] / W, a[1] / H, b[0] / W, b[1] / H]); } });
    return out;
  }

  // ---- The tab ------------------------------------------------------------------------------------
  window.addEventListener('studio:tab', (e) => {
    active = e.detail === 'loomis';
    document.body.classList.toggle('tab-loomis', active);
    if (!active) { closeSheet(); return; }
    window.scrollTo(0, 0);
    PaintStudio.pin(root);
    showPhoto();
    render();
    setTimeout(layout, 120);
  });
  if (Studio.tab() === 'loomis') window.dispatchEvent(new CustomEvent('studio:tab', { detail: 'loomis' }));
  render();

  // for tests: fit a set of marks (picture fractions) at a given picture aspect
  function fitPoints(points, aspect) { state.points = { ...points }; state.aspect = aspect; state.step = STEPS.length; state.fit = fitHead(); state.auto = state.fit && { ...state.fit }; return state.fit; }
  window.Loomis = { place, drag, release, reset, draw, segments, state, has: () => !!state.fit, fitPoints, project, STEPS };
})();
