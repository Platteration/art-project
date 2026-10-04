/*
 * The Loomis head: mark the eyes, brows, nose and mouth on the photo, and a Loomis construction
 * is fitted over the face: the ball of the cranium, the flattened side plane, the brow line through
 * the ball's centre, the centre line down the face, the hairline, the eye, nose, mouth and chin
 * lines, and the jaw. The head is a small 3-D model in units of the ball's radius, after Andrew
 * Loomis's "Drawing the Head and Hands": the brow line is the ball's equator, the side plane is the
 * ball cut flat about two-thirds of the way out, the nose sits at the bottom of the ball and the
 * chin one more radius below, so hairline to brow, brow to nose and nose to chin are about equal.
 * The model is turned, tilted and tipped, scaled and placed to land its eyes, brows, nose and mouth
 * on the marks (a least-squares fit), then drawn in orthographic projection: lines on the far side
 * of the head are faint and dashed.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const els = { prompt: $('loomisPrompt'), lock: $('loomisLock'), back: $('loomisBack'), reset: $('loomisReset'), show: $('loomisShow'), toStudio: $('loomisToStudio') };
  if (!els.prompt) return;

  // ---- The marks the user makes, in picture fractions (0-1), and where the model has them --------
  const STEPS = [
    { key: 'leftEye', ask: 'Tap the middle of the eye on the LEFT of the picture.', model: [-0.4, 0.35, 0.85], weight: 1, face: true },
    { key: 'rightEye', ask: 'Now the middle of the eye on the RIGHT.', model: [0.4, 0.35, 0.85], weight: 1, face: true },
    { key: 'leftBrow', ask: 'The highest point of the left eyebrow.', model: [-0.4, -0.02, 0.9], weight: 0.5 },
    { key: 'rightBrow', ask: 'The highest point of the right eyebrow.', model: [0.4, -0.02, 0.9], weight: 0.5 },
    { key: 'nose', ask: 'The bottom of the nose, in the middle.', model: [0, 1.0, 1.0], weight: 1, face: true },
    { key: 'mouth', ask: 'The middle of the mouth, where the lips meet.', model: [0, 1.33, 0.92], weight: 1, face: true },
  ];
  const DONE = 'Done. The Loomis head is over the face. Draw it on your paper in this order: the ball, the flat side, the centre line, the brow line, then the eye, nose and mouth lines and the jaw. Drag a dot to move it.';
  const state = { points: {}, step: 0, pending: null, fit: null, shown: true, aspect: 1 };
  const active = () => Studio.tool() === 'loomis';

  // ---- The model: pieces as 3-D polylines in ball radii. y runs down, z toward the viewer. --------
  const C = 0.72, SR = Math.sqrt(1 - C * C);        // where the side plane cuts the ball, and its radius
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
    { name: 'nose', face: true, pts: Array.from({ length: 25 }, (_, i) => { const x = -0.72 + (1.44 * i) / 24; return [x, 1.0, Math.sqrt(Math.max(0, 1 - x * x)) * 1.0]; }) },
    { name: 'mouth', face: true, pts: Array.from({ length: 17 }, (_, i) => { const x = -0.5 + i / 16; return [x, 1.33, 0.92 - 0.4 * x * x]; }) },
    { name: 'chin', face: true, pts: Array.from({ length: 9 }, (_, i) => { const x = -0.3 + (0.6 * i) / 8; return [x, 2.0, 0.78 - 0.4 * x * x]; }) },
    { name: 'jaw', face: true, pts: [[-C, 0.1, 0], [-C, 0.75, 0.04], [-0.62, 1.4, 0.42], [-0.32, 1.92, 0.7], [0, 2.0, 0.78]] },
    { name: 'jaw', face: true, pts: [[C, 0.1, 0], [C, 0.75, 0.04], [0.62, 1.4, 0.42], [0.32, 1.92, 0.7], [0, 2.0, 0.78]] },
  ];

  // yaw turns the head left and right, pitch nods it, roll tilts it
  function rotate([x, y, z], [yaw, pitch, roll]) {
    let cx = Math.cos(yaw), sx = Math.sin(yaw);
    let X = x * cx + z * sx, Z = -x * sx + z * cx, Y = y;
    cx = Math.cos(pitch); sx = Math.sin(pitch);
    const Y2 = Y * cx - Z * sx, Z2 = Y * sx + Z * cx;
    cx = Math.cos(roll); sx = Math.sin(roll);
    return [X * cx - Y2 * sx, X * sx + Y2 * cx, Z2];
  }
  // a model point on the picture: x and y in fractions of the picture's width. Faces come long
  // and short: the face below the brow stretches by f.len, while the ball stays a ball.
  function project(p, f, face) { const q = face ? [p[0], p[1] * f.len, p[2]] : p; const r = rotate(q, [f.yaw, f.pitch, f.roll]); return [f.s * r[0] + f.tx, f.s * r[1] + f.ty, r[2]]; }

  // ---- The fit: scale, place and turn the model so its landmarks land on the marks ---------------
  function fitHead() {
    const marks = STEPS.filter((st) => state.points[st.key]).map((st) => ({ ...st, at: [state.points[st.key].x, state.points[st.key].y * state.aspect] }));
    const need = ['leftEye', 'rightEye', 'nose', 'mouth'].every((k) => state.points[k]);
    if (!need) return null;
    const L = state.points.leftEye, R = state.points.rightEye, N = state.points.nose, M = state.points.mouth;
    const ex = (R.x - L.x), ey = (R.y - L.y) * state.aspect;
    const roll = Math.atan2(ey, ex), eyeDist = Math.hypot(ex, ey);
    const mid = [(L.x + R.x) / 2, ((L.y + R.y) / 2) * state.aspect];
    // the nose sits off the eyes' midpoint when the head turns
    const nx = (N.x - mid[0]) * Math.cos(-roll) - (N.y * state.aspect - mid[1]) * Math.sin(-roll);
    const s0 = eyeDist / 0.8;
    const yaw0 = Math.max(-1.2, Math.min(1.2, Math.asin(Math.max(-0.95, Math.min(0.95, nx / (s0 * 0.95))))));
    const start = [s0 / Math.max(0.5, Math.cos(yaw0)), mid[0], mid[1] - 0.35 * s0, yaw0, 0, roll];
    const cost = (v) => {
      const f = { s: v[0], tx: v[1], ty: v[2], yaw: v[3], pitch: v[4], roll: v[5], len: v[6] };
      let e = 0;
      marks.forEach((m) => { const p = project(m.model, f, m.face); e += m.weight * ((p[0] - m.at[0]) ** 2 + (p[1] - m.at[1]) ** 2); });
      // a pull toward a level head: faces are rarely tipped far, and a tipped fit would otherwise
      // explain a short or long face; turning is free, since profiles are real
      e += 2e-3 * f.pitch * f.pitch + 2e-4 * f.yaw * f.yaw + 2e-3 * (f.len - 1) * (f.len - 1);
      return e + (f.s <= 0 || f.len < 0.75 || f.len > 1.3 ? 1e9 : 0);
    };
    start.push(1);
    // a turned head is easy to mistake for a narrow one, so several turns are tried and the best kept
    let best = null, bestCost = Infinity;
    [yaw0, -1.1, -0.7, -0.35, 0, 0.35, 0.7, 1.1].forEach((yaw) => {
      const from = start.slice(); from[3] = yaw; from[0] = s0 / Math.max(0.45, Math.cos(yaw));
      const v = nelderMead(cost, from, [s0 * 0.2, s0 * 0.2, s0 * 0.2, 0.25, 0.25, 0.2, 0.1], 300);
      const c = cost(v);
      if (c < bestCost) { bestCost = c; best = v; }
    });
    const v = nelderMead(cost, best, [s0 * 0.05, s0 * 0.05, s0 * 0.05, 0.08, 0.08, 0.05, 0.03], 300);
    return { s: v[0], tx: v[1], ty: v[2], yaw: v[3], pitch: v[4], roll: v[5], len: v[6] };
  }
  function nelderMead(f, x0, steps, iters = 600) {
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
  function current() { return STEPS[state.step]; }
  function place(x, y) {
    if (!active()) return;
    if (state.step >= STEPS.length) {
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
    if (state.step >= STEPS.length) { if (state.moving) { state.points[state.moving] = { x, y }; refit(); } return; }
    if (state.pending) { state.pending = { x, y }; render(); }
  }
  function lock() {
    if (!state.pending || state.step >= STEPS.length) return;
    state.points[current().key] = state.pending;
    state.pending = null;
    state.step++;
    refit();
    if (state.step >= STEPS.length) Studio.toast('The Loomis head is laid over the face');
  }
  function back() {
    if (state.pending) { state.pending = null; render(); return; }
    if (!state.step) return;
    state.step--;
    state.pending = state.points[current().key] || null;
    delete state.points[current().key];
    refit();
  }
  function reset() { state.points = {}; state.step = 0; state.pending = null; state.fit = null; state.moving = null; render(); }
  function refit() { state.fit = fitHead(); render(); }
  function render() {
    const done = state.step >= STEPS.length;
    els.prompt.textContent = done ? DONE : `${state.step + 1} of ${STEPS.length}: ${current().ask}${state.pending ? ' Then press Lock in.' : ''}`;
    els.lock.disabled = !state.pending || done;
    els.back.disabled = !state.step && !state.pending;
    els.reset.disabled = !state.step && !state.pending;
    els.show.hidden = !state.fit;
    els.toStudio.hidden = !state.fit;
    els.show.textContent = state.shown ? 'Hide the head' : 'Show the head';
    Studio.redraw();
  }
  els.lock.addEventListener('click', lock);
  els.back.addEventListener('click', back);
  els.reset.addEventListener('click', reset);
  els.show.addEventListener('click', () => { state.shown = !state.shown; render(); });
  els.toStudio.addEventListener('click', () => { document.getElementById('tabPaintBtn').click(); setTimeout(() => document.getElementById('ps-sketchFromStudy').click(), 150); });

  // ---- Drawing the head over the pictures ------------------------------------------------------
  const COLORS = { side: '#e5322d', sideLine: '#e5322d', brow: '#1ec8ec', hair: '#e5322d', centre: '#1ec8ec', face: '#1ec8ec', eyes: '#ffd21f', nose: '#ffd21f', mouth: '#ffd21f', chin: '#ffd21f', jaw: '#e5322d' };
  // each piece's points on the picture (pixels), with whether each is on the near side of the head
  function projected(W, H) {
    const f = state.fit;
    if (!f) return [];
    // the fit works in fractions of the picture's width, for x and y alike
    return PIECES.map((piece) => ({ name: piece.name, pts: piece.pts.map((p) => { const q = project(p, f, piece.face); return [q[0] * W, q[1] * W, q[2] >= -0.05]; }) }));
  }
  function draw(g, W, H, unit) {
    if (!state.fit && !state.pending && !state.step) return;
    state.aspect = H / W;
    const f = state.fit;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (f && state.shown) {
      // the ball: a sphere is a circle from anywhere
      g.beginPath(); g.arc(f.tx * W, f.ty * W, f.s * W, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3.5 * unit; g.stroke();
      g.strokeStyle = '#e5322d'; g.lineWidth = 1.8 * unit; g.stroke();
      projected(W, H).forEach((piece) => {
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
    const W = 1000, H = Math.round(W * state.aspect), out = [];
    const f = state.fit;
    const n = 48;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; out.push([(f.tx + f.s * Math.cos(a)), (f.ty + f.s * Math.sin(a)) / state.aspect, (f.tx + f.s * Math.cos(b)), (f.ty + f.s * Math.sin(b)) / state.aspect]); }
    projected(W, H).forEach((piece) => { for (let i = 1; i < piece.pts.length; i++) { const a = piece.pts[i - 1], b = piece.pts[i]; if (a[2] && b[2]) out.push([a[0] / W, a[1] / H, b[0] / W, b[1] / H]); } });
    return out;
  }

  window.addEventListener('studio:tool', (e) => { if (e.detail === 'loomis') render(); });
  // for tests: fit a set of marks (picture fractions) at a given picture aspect, and project a model point
  function fitPoints(points, aspect) { state.points = { ...points }; state.aspect = aspect; state.step = STEPS.length; state.fit = fitHead(); return state.fit; }
  window.Loomis = { place, drag, release: () => { state.moving = null; }, reset, draw, segments, state, has: () => !!state.fit, fitPoints, project, STEPS };
})();
