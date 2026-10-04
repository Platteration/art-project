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
    { key: 'leftEye', name: 'Left eye', ask: 'Tap the middle of the eye on the left of the picture.', model: [-0.4, 0.35, 0.85], weight: 1, face: true },
    { key: 'rightEye', name: 'Right eye', ask: 'Tap the middle of the eye on the right.', model: [0.4, 0.35, 0.85], weight: 1, face: true },
    { key: 'leftBrow', name: 'Left eyebrow', ask: 'Tap its highest point.', model: [-0.4, -0.02, 0.9], weight: 0.5, optional: true },
    { key: 'rightBrow', name: 'Right eyebrow', ask: 'Tap its highest point.', model: [0.4, -0.02, 0.9], weight: 0.5, optional: true },
    { key: 'nose', name: 'Nose', ask: 'Tap the bottom of the nose, in the middle.', model: [0, 1.0, 1.0], weight: 1, face: true },
    { key: 'mouth', name: 'Mouth', ask: 'Tap the middle, where the lips meet.', model: [0, 1.33, 0.92], weight: 1, face: true },
    { key: 'chin', name: 'Chin', ask: 'Tap the bottom of the chin, in the middle.', model: [0, 2.0, 0.78], weight: 1, face: true },
    { key: 'forehead', name: 'Forehead', ask: 'Tap the top of the forehead, where the hair starts.', model: [0, -C, SR], weight: 0.6, optional: true },
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
    if (done()) Studio.toast('The head is over the face');
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
  function reset() { state.points = {}; state.step = 0; state.pending = null; state.fit = null; state.auto = null; state.moving = null; render(); }
  function refit() { state.fit = fitHead(); state.auto = state.fit && { ...state.fit }; render(); }

  // ---- Adjusting the fitted head on the canvas: arrows turn, nod and tilt it; its lines drag -----
  // What each piece of the head does when dragged: the centre line and the side plane turn the head,
  // the brow, hairline and eye lines nod it, the face lines set the face length, the ball's edge
  // sets its size, and anywhere else inside the head moves it.
  const DRAGS = { centre: 'yaw', side: 'yaw', sideLine: 'yaw', brow: 'pitch', hair: 'pitch', eyes: 'pitch', nose: 'len', mouth: 'len', chin: 'len', face: 'len', jaw: 'len' };
  const RANGE = { yaw: 0.7, pitch: 0.5, len: 0.3 };
  const LIMITS = { yaw: [-1.5, 1.5], pitch: [-0.9, 0.9], len: [0.75, 1.3] };
  const NUDGE = 3 / DEG_();
  function DEG_() { return 180 / Math.PI; }
  // the arrow buttons around the ball, in pixels for a picture W wide
  function handles(W) {
    const f = state.fit;
    if (!f) return [];
    const cx = f.tx * W, cy = f.ty * W, R = f.s * W, pad = 26 * (W / 700 + 0.6);
    return [
      { key: 'yaw', d: -1, x: cx - R - pad, y: cy, glyph: 'left' }, { key: 'yaw', d: 1, x: cx + R + pad, y: cy, glyph: 'right' },
      { key: 'pitch', d: -1, x: cx - pad * 0.9, y: cy - R - pad, glyph: 'up' }, { key: 'pitch', d: 1, x: cx + pad * 0.9, y: cy - R - pad, glyph: 'down' },
      { key: 'roll', d: -1, x: cx - R * 0.78 - pad * 0.6, y: cy - R * 0.78 - pad * 0.6, glyph: 'ccw' }, { key: 'roll', d: 1, x: cx + R * 0.78 + pad * 0.6, y: cy - R * 0.78 - pad * 0.6, glyph: 'cw' },
    ];
  }
  function nudge(key, d) {
    if (!state.fit) return;
    const lim = key === 'roll' ? [-1.2, 1.2] : LIMITS[key];
    state.fit[key] = Math.max(lim[0], Math.min(lim[1], state.fit[key] + d * NUDGE));
    Studio.redraw(); drawTab();
  }
  // the distance from a point to a polyline, in the same units
  function distToPts(pts, x, y) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    return best;
  }
  // what is under a point (overlay pixels): a handle, a mark, a piece of the head, the ball's edge, or the inside
  function hitTest(px, py, W) {
    const f = state.fit, unit = W / 400;
    if (!f || !state.shown) return null;
    for (const h of handles(W)) if (Math.hypot(h.x - px, h.y - py) < 16 * unit) return { kind: 'handle', handle: h };
    let best = null, bd = 14 * unit;
    STEPS.forEach((st) => { const p = state.points[st.key]; if (!p) return; const d = Math.hypot(p.x * W - px, p.y * W * state.aspect - py); if (d < bd) { bd = d; best = { kind: 'mark', key: st.key }; } });
    if (best) return best;
    bd = 12 * unit;
    projected(W).forEach((piece) => { const d = distToPts(piece.pts.filter((p) => p[2]), px, py); if (d < bd && DRAGS[piece.name]) { bd = d; best = { kind: 'line', param: DRAGS[piece.name], name: piece.name }; } });
    if (best) return best;
    const r = Math.hypot(px - f.tx * W, py - f.ty * W);
    if (Math.abs(r - f.s * W) < 12 * unit) return { kind: 'ball' };
    if (r < f.s * W * 1.9) return { kind: 'move' };
    return null;
  }
  // the parameter value that brings the dragged piece closest to the pointer (a golden-section search)
  function solve(name, param, px, py, W) {
    const f = state.fit, lim = LIMITS[param];
    const piece = PIECES.find((pc) => pc.name === name);
    const score = (v) => { const g = { ...f, [param]: v }; const pts = piece.pts.map((p) => { const pt = project(p, g, piece.face); return [pt[0] * W, pt[1] * W, pt[2] >= -0.05]; }).filter((p) => p[2]); return pts.length > 1 ? distToPts(pts, px, py) : 1e9; };
    let a = Math.max(lim[0], f[param] - RANGE[param]), b = Math.min(lim[1], f[param] + RANGE[param]);
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = b - gr * (b - a), d = a + gr * (b - a), fc = score(c), fd = score(d);
    for (let i = 0; i < 40; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = score(c); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = score(d); }
    }
    return (a + b) / 2;
  }

  // ---- The card and the strip -----------------------------------------------------------------
  function render() {
    const d = done();
    $('stepLabel').textContent = d ? 'Head fitted' : `${state.step + 1} of ${STEPS.length}`;
    $('ask').textContent = d ? 'Drag a dot or a line to adjust it' : current().name;
    $('sub').textContent = d ? 'The arrows turn, nod and tilt the head. Then draw it: the ball, the flat side, the centre line, the brow line, then the eye, nose, mouth and chin lines and the jaw.' : `${current().ask}${state.pending ? ' Drag to fine-tune, then lock it in.' : ''}`;
    $('lock').hidden = d; $('lock').disabled = !state.pending;
    $('skip').hidden = d || !current().optional;
    $('back').hidden = d; $('back').disabled = !state.step && !state.pending;
    $('cardStudio').hidden = !d;
    $('refit').hidden = !d;
    $('undo').disabled = !state.step && !state.pending;
    $('reset').disabled = !state.step && !state.pending;
    ['show', 'studio', 'save'].forEach((id) => { $(id).disabled = !state.fit; });
    $('show').setAttribute('aria-pressed', String(state.shown));
    root.classList.toggle('lh-done', d);
    Studio.redraw();
    drawTab();
  }
  $('lock').addEventListener('click', lock);
  $('skip').addEventListener('click', skip);
  $('back').addEventListener('click', back);
  $('undo').addEventListener('click', back);
  $('reset').addEventListener('click', reset);
  $('refit').addEventListener('click', () => { if (state.auto) { state.fit = { ...state.auto }; Studio.redraw(); drawTab(); } });
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
    drawHandles(g, overlay.width, dpr * 1.15);
  }
  function layout() { if (!active) return; PaintStudio.pin(root); fit(); }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 60));
  if (window.visualViewport) { visualViewport.addEventListener('resize', layout); visualViewport.addEventListener('scroll', layout); }
  window.addEventListener('studio:result', () => { if (active) showPhoto(); });

  const pos = (e) => { const r = overlay.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  // the loupe: the photo magnified around the finger while a mark is placed, so the tap lands exactly
  const loupe = $('loupe'), loupeCanvas = $('loupeCanvas');
  function showLoupe(x, y) {
    if (!photo.width) return;
    const dpr = window.devicePixelRatio || 1, size = 120, zoom = 3;
    loupeCanvas.width = loupeCanvas.height = size * dpr;
    const g = loupeCanvas.getContext('2d');
    const cropW = (size / zoom) * (photo.width / wrap.clientWidth), cropH = (size / zoom) * (photo.height / wrap.clientHeight);
    g.imageSmoothingEnabled = true;
    g.fillStyle = '#222'; g.fillRect(0, 0, size * dpr, size * dpr);
    g.drawImage(photo, x * photo.width - cropW / 2, y * photo.height - cropH / 2, cropW, cropH, 0, 0, size * dpr, size * dpr);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(size * dpr / 2, 0); g.lineTo(size * dpr / 2, size * dpr); g.moveTo(0, size * dpr / 2); g.lineTo(size * dpr, size * dpr / 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1 * dpr; g.beginPath(); g.arc(size * dpr / 2, size * dpr / 2, 6 * dpr, 0, Math.PI * 2); g.stroke();
    // above the finger, or below it near the top of the stage
    const st = $('stage').getBoundingClientRect(), r = overlay.getBoundingClientRect();
    const fx = r.left + x * r.width - st.left, fy = r.top + y * r.height - st.top;
    const above = fy - 90 - size > 8;
    loupe.style.left = `${Math.max(8, Math.min(st.width - size - 8, fx - size / 2))}px`;
    loupe.style.top = `${above ? fy - 90 - size : fy + 60}px`;
    loupe.hidden = false;
  }
  function hideLoupe() { loupe.hidden = true; }
  let drag_ = null, holdTimer = 0;
  overlay.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault(); overlay.setPointerCapture(e.pointerId);
    const [x, y] = pos(e), dpr = window.devicePixelRatio || 1, px = x * overlay.width, py = y * overlay.height;
    const hit = done() ? hitTest(px, py, overlay.width) : null;
    if (hit && hit.kind === 'handle') {
      // a tap nudges; holding keeps nudging
      nudge(hit.handle.key, hit.handle.d);
      clearTimeout(holdTimer);
      const repeat = () => { nudge(hit.handle.key, hit.handle.d); holdTimer = setTimeout(repeat, 90); };
      holdTimer = setTimeout(repeat, 400);
      drag_ = { kind: 'handle' };
      return;
    }
    if (hit && hit.kind === 'mark') { state.moving = hit.key; drag_ = { kind: 'mark' }; showLoupe(x, y); return; }
    if (hit && (hit.kind === 'line' || hit.kind === 'ball' || hit.kind === 'move')) { drag_ = { ...hit, lastX: px, lastY: py }; return; }
    if (done()) return;
    place(x, y); drag_ = { kind: 'place' }; showLoupe(x, y);
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag_) return;
    const [x, y] = pos(e), px = x * overlay.width, py = y * overlay.height, W = overlay.width;
    if (drag_.kind === 'place') { drag(x, y); showLoupe(x, y); return; }
    if (drag_.kind === 'mark') { if (state.moving) { state.points[state.moving] = { x, y }; refit(); } showLoupe(x, y); return; }
    if (drag_.kind === 'handle') return;
    const f = state.fit;
    if (!f) return;
    if (drag_.kind === 'move') { f.tx += (px - drag_.lastX) / W; f.ty += (py - drag_.lastY) / W; }
    else if (drag_.kind === 'ball') f.s = Math.max(0.03, Math.hypot(px - f.tx * W, py - f.ty * W) / W);
    else if (drag_.kind === 'line') f[drag_.param] = solve(drag_.name, drag_.param, px, py, W);
    drag_.lastX = px; drag_.lastY = py;
    Studio.redraw(); drawTab();
  });
  ['pointerup', 'pointercancel'].forEach((t) => overlay.addEventListener(t, () => { clearTimeout(holdTimer); drag_ = null; release(); hideLoupe(); }));
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
  // the arrow buttons: turn at the sides, nod above, tilt at the upper corners
  function drawHandles(g, W, unit) {
    if (!state.fit || !state.shown || !done()) return;
    const r = 15 * unit;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    handles(W).forEach((h) => {
      g.beginPath(); g.arc(h.x, h.y, r, 0, Math.PI * 2);
      g.fillStyle = 'rgba(250,245,234,0.92)'; g.fill();
      g.strokeStyle = 'rgba(30,43,34,0.6)'; g.lineWidth = 1.2 * unit; g.stroke();
      g.fillStyle = '#1e2b22'; g.strokeStyle = '#1e2b22'; g.lineWidth = 2 * unit;
      const a = r * 0.5;
      g.beginPath();
      if (h.glyph === 'left') { g.moveTo(h.x + a * 0.6, h.y - a); g.lineTo(h.x - a * 0.7, h.y); g.lineTo(h.x + a * 0.6, h.y + a); g.closePath(); g.fill(); }
      else if (h.glyph === 'right') { g.moveTo(h.x - a * 0.6, h.y - a); g.lineTo(h.x + a * 0.7, h.y); g.lineTo(h.x - a * 0.6, h.y + a); g.closePath(); g.fill(); }
      else if (h.glyph === 'up') { g.moveTo(h.x - a, h.y + a * 0.6); g.lineTo(h.x, h.y - a * 0.7); g.lineTo(h.x + a, h.y + a * 0.6); g.closePath(); g.fill(); }
      else if (h.glyph === 'down') { g.moveTo(h.x - a, h.y - a * 0.6); g.lineTo(h.x, h.y + a * 0.7); g.lineTo(h.x + a, h.y - a * 0.6); g.closePath(); g.fill(); }
      else {
        // a curved arrow: an arc with a head at its end
        const cw = h.glyph === 'cw', s0 = cw ? Math.PI * 1.15 : Math.PI * 1.85, s1 = cw ? Math.PI * 1.85 : Math.PI * 1.15;
        g.arc(h.x, h.y, a * 1.1, s0, s1, !cw); g.stroke();
        const ex = h.x + Math.cos(s1) * a * 1.1, ey = h.y + Math.sin(s1) * a * 1.1, dir = s1 + (cw ? Math.PI / 2 : -Math.PI / 2);
        g.beginPath(); g.moveTo(ex + Math.cos(dir) * a * 0.7, ey + Math.sin(dir) * a * 0.7);
        g.lineTo(ex + Math.cos(dir + 2.5) * a * 0.55, ey + Math.sin(dir + 2.5) * a * 0.55); g.lineTo(ex + Math.cos(dir - 2.5) * a * 0.55, ey + Math.sin(dir - 2.5) * a * 0.55); g.closePath(); g.fill();
      }
    });
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
    if (!active) { hideLoupe(); return; }
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
  window.Loomis = { place, drag, release, reset, draw, segments, state, has: () => !!state.fit, fitPoints, project, STEPS, hitTest, handles };
})();
