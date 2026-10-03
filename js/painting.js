/*
 * The Painting studio: a paper to paint on, with the studio's paints and mixing model.
 *
 * One strip of small icons holds everything: it sits at the bottom on phones (under the thumb) and
 * down the left on wider screens. A tool's options, the paints, the reference, the canvas and the
 * zoom open as small sheets over the paper and close when you paint. The paper has four layers:
 * the ground (raw canvas, a wash from the palette or a gray), the underdrawing (its own layer,
 * never mixed with the paint), the paint, and a weave or paper texture multiplied over everything.
 *
 * Every element of this tab has an id starting "ps-", and its classes start "ps-", so nothing here
 * meets the rest of the page.
 */
(function () {
  'use strict';
  const root = document.getElementById('ps-root');
  if (!root) return;
  const $ = (id) => document.getElementById('ps-' + id);
  const q = (sel) => root.querySelectorAll(sel);
  const MIXES_KEY = 'portrait-value-studio.paintMixes';
  const MINE_KEY = 'portrait-value-studio.myPaints';
  const AMOUNTS = [0.25, 0.5, 1, 2, 4];
  const fmt = (v) => { const qv = Math.round(v * 4) / 4, w = Math.floor(qv), f = ['', '¼', '½', '¾'][Math.round((qv - w) * 4)]; return w ? `${w}${f}` : f || '0'; };
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const hexOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lab = (c) => Study.rgbToLab(c[0], c[1], c[2]);
  function load(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  // ---- Paints and the mixing model (the same as the Study tab and the game use) ----------------
  const made = new Map();
  function paintFor(code) {
    if (!made.has(code)) made.set(code, Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(code))));
    return made.get(code);
  }
  const paintName = (code) => (Paints.byCode(code) || { name: code }).name;
  const paintHex = (code) => (Paints.byCode(code) || { hex: '#888888' }).hex;
  // the predicted color of parts [{ code, amount }] mixed together
  function mixColor(parts) {
    const by = new Map();
    parts.forEach((p) => { if (Paints.byCode(p.code)) by.set(p.code, (by.get(p.code) || 0) + p.amount); });
    if (!by.size) return null;
    const codes = [...by.keys()];
    const m = Mixing.mix(codes.map(paintFor), codes.map((c) => by.get(c)));
    return m ? [m.rgb.r, m.rgb.g, m.rgb.b] : null;
  }
  const recipeOf = (parts) => { const by = new Map(); parts.forEach((p) => by.set(p.code, (by.get(p.code) || 0) + p.amount)); return [...by].map(([c, n]) => `${c} ${fmt(n)}`).join(' · '); };

  // the palettes to choose from: the presets, My paints from the Study tab, and the Study tab's
  // current palette when it is neither
  function palettes() {
    const list = Paints.PRESETS.map((p) => ({ id: p.id, name: p.name, codes: p.paints }));
    const mine = load(MINE_KEY, []).filter((c) => Paints.byCode(c));
    if (mine.length >= 2) list.push({ id: 'mine', name: `My paints (${mine.length})`, codes: mine });
    const cur = window.StudioPalette && StudioPalette.current();
    if (cur && cur.codes.length >= 2 && !list.some((p) => sameCodes(p.codes, cur.codes))) list.push({ id: 'study', name: `Study tab: ${cur.name}`, codes: cur.codes.slice() });
    return list;
  }
  const sameCodes = (a, b) => a.length === b.length && a.every((c) => b.includes(c));
  let paletteList = palettes();
  const paletteNow = () => paletteList.find((p) => p.id === $('palette').value) || paletteList[0];
  const codesNow = () => paletteNow().codes;

  const state = { tool: 'chisel', chisel: 'm', round: 18, hard: 'medium', pencil: 3, lead: 'graphite', sketch: 3, slead: 'graphite', shard: 'medium', lastLayer: 'paint', lastBrush: 'chisel', blend: 60, blendStr: 0.4, eraser: 24, color: hexOf('#7A3B24'), name: 'Burnt Sienna', well: [], mixes: [] };
  const CHISEL = { s: 20, m: 40, l: 72 };
  const HARD = { hard: { alpha: 0.16, dots: 3, grow: 0.85, grey: 0.45, label: '2H' }, medium: { alpha: 0.3, dots: 7, grow: 1, grey: 0.2, label: 'HB' }, soft: { alpha: 0.5, dots: 14, grow: 1.35, grey: 0, label: '4B' } };
  // Graphite: fine grains, pale when hard. Charcoal: coarser, darker, with a soft dusty edge; a
  // hard stick keeps a crisper line, a soft one spreads and blackens.
  const CHAR = { hard: { alpha: 0.28, dots: 10, grow: 1.0, grey: 0.12, spread: 0.55, label: 'Hard' }, medium: { alpha: 0.42, dots: 18, grow: 1.25, grey: 0.05, spread: 0.75, label: 'Medium' }, soft: { alpha: 0.6, dots: 30, grow: 1.6, grey: 0, spread: 1, label: 'Soft' } };
  const BRUSHES = ['chisel', 'round', 'pencil', 'sketch', 'blend'];

  // ---- The paper -----------------------------------------------------------------------------
  const paper = $('paper'), sketch = $('sketch'), wrap = $('paperWrap'), ground = $('ground'), weave = $('weave');
  // strokes go to the paint layer, or to the underdrawing layer beneath it
  let layer = paper, g = paper.getContext('2d');
  function useLayer(c) { layer = c; g = c.getContext('2d'); }
  const undoStack = [];
  function snapshot() { undoStack.push({ layer, img: g.getImageData(0, 0, layer.width, layer.height) }); if (undoStack.length > 20) undoStack.shift(); $('undo').disabled = false; }
  function blank() { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, layer.width, layer.height); }

  // the paper fits the stage with its margins, whichever way it is turned
  function fit() {
    const st = $('stage'), cs = getComputedStyle(st);
    const W = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), H = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const k = Math.max(0.01, Math.min(W / paper.width, H / paper.height));
    wrap.style.width = `${Math.floor(paper.width * k)}px`;
    wrap.style.height = `${Math.floor(paper.height * k)}px`;
    applyView();
  }
  /*
   * The studio is pinned to the screen. On a phone it fills the visual viewport: Safari's toolbars
   * come and go, and inside some viewers the page is laid out wider than the screen and clipped,
   * so the visual viewport is used, capped at the device's own width and height. On a wide screen
   * it fills the window below the tabs, which stay in view to leave by.
   */
  let active = false;
  function layout() {
    if (!active) return;
    const vv = window.visualViewport;
    let W = window.innerWidth, H = window.innerHeight, left = 0, top = 0;
    if (vv && Math.abs(vv.scale - 1) < 0.02) { W = vv.width; H = vv.height; left = vv.offsetLeft; top = vv.offsetTop; }
    const portrait = matchMedia('(orientation: portrait)').matches;
    const sw = Math.min(screen.width, screen.height), sh = Math.max(screen.width, screen.height);
    const devW = portrait ? sw : sh, devH = portrait ? sh : sw;
    if (W > devW + 2) W = devW;
    if (H > devH + 2) H = devH;
    if (matchMedia('(min-width: 760px)').matches) {
      const tabs = document.querySelector('.tabs').getBoundingClientRect();
      const inset = Math.max(0, Math.round(tabs.bottom + 14 - top));
      root.style.left = `${Math.round(tabs.left)}px`; root.style.top = `${Math.round(top + inset)}px`;
      root.style.width = `${Math.round(tabs.width)}px`; root.style.height = `${Math.max(240, Math.round(H - inset - 16))}px`;
    } else {
      root.style.left = `${left}px`; root.style.top = `${top}px`;
      root.style.width = `${W}px`; root.style.height = `${Math.max(240, H)}px`;
    }
    fit();
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 60));
  if (window.visualViewport) { visualViewport.addEventListener('resize', layout); visualViewport.addEventListener('scroll', layout); }

  // ---- The canvas: its ground (raw, a wash from the palette, or gray) and a texture over all ----
  const canvasState = { ground: 'raw', washCode: null, washStr: 0.3, weave: 'off' };
  const RAW = [243, 238, 226], GRAY = [140, 138, 134];
  function groundColor() {
    if (canvasState.ground === 'gray') return GRAY;
    if (canvasState.ground === 'wash' && canvasState.washCode) {
      // a thin wash: the paint thinned with white, laid over the raw canvas
      const k = canvasState.washStr;
      const white = codesNow().find((c) => paintFor(c).white) || 'TW';
      const tint = mixColor([{ code: canvasState.washCode, amount: 1 }, { code: white, amount: 2.2 }]) || RAW;
      return RAW.map((v, i) => Math.round(v * (1 - k) + tint[i] * k));
    }
    return RAW;
  }
  function paintGround() {
    const gc = ground.getContext('2d');
    ground.width = paper.width; ground.height = paper.height;
    gc.fillStyle = css(groundColor()); gc.fillRect(0, 0, ground.width, ground.height);
    // a wash is never quite even: a little drift across the canvas
    if (canvasState.ground === 'wash') {
      const grad = gc.createLinearGradient(0, 0, ground.width, ground.height);
      grad.addColorStop(0, 'rgba(255,255,255,0.08)'); grad.addColorStop(0.5, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.07)');
      gc.fillStyle = grad; gc.fillRect(0, 0, ground.width, ground.height);
    }
  }
  // the textures, tiled over the canvas: linen (warp and weft threads with a little unevenness)
  // and paper (the fine tooth of a cold-pressed sheet)
  const tiles = {};
  const seeded = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
  function tile(kind) {
    if (tiles[kind]) return tiles[kind];
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const t = c.getContext('2d'), rnd = seeded(kind === 'linen' ? 12345 : 777);
    t.fillStyle = '#fff'; t.fillRect(0, 0, 96, 96);
    if (kind === 'linen') {
      for (let i = 0; i < 96; i += 4) {
        for (let j = 0; j < 96; j += 4) {
          const over = ((i + j) / 4) % 2 === 0;         // threads cross over and under
          const shade = 215 + Math.round(rnd() * 30) - (over ? 0 : 14);
          t.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
          t.fillRect(i, j, 4, 4);
          t.fillStyle = 'rgba(120,100,80,0.18)';
          if (over) t.fillRect(i, j + 3, 4, 1); else t.fillRect(i + 3, j, 1, 4);
        }
      }
    } else {
      const img = t.getImageData(0, 0, 96, 96), d = img.data;
      for (let i = 0; i < 96 * 96; i++) { const v = 236 + Math.round(rnd() * 19); d[i * 4] = v; d[i * 4 + 1] = v - 1; d[i * 4 + 2] = v - 4; d[i * 4 + 3] = 255; }
      t.putImageData(img, 0, 0);
      for (let k = 0; k < 60; k++) {
        const x = rnd() * 96, y = rnd() * 96, r = 1.5 + rnd() * 2.5;
        t.fillStyle = `rgba(90,80,70,${0.05 + rnd() * 0.07})`; t.beginPath(); t.arc(x, y, r, 0, Math.PI * 2); t.fill();
        t.fillStyle = 'rgba(255,255,255,0.35)'; t.beginPath(); t.arc(x - 1, y - 1, r * 0.6, 0, Math.PI * 2); t.fill();
      }
    }
    tiles[kind] = c;
    return c;
  }
  function paintWeave() {
    const wc = weave.getContext('2d');
    weave.width = paper.width; weave.height = paper.height;
    if (canvasState.weave === 'off') { wc.clearRect(0, 0, weave.width, weave.height); return; }
    wc.fillStyle = wc.createPattern(tile(canvasState.weave), 'repeat');
    wc.fillRect(0, 0, weave.width, weave.height);
  }
  const WEAVE_ALPHA = { off: 0, linen: 0.55, paper: 0.7 };
  function applyCanvas() {
    paintGround();
    paintWeave();
    wrap.classList.toggle('ps-textured', canvasState.weave === 'linen');
    wrap.classList.toggle('ps-textured-paper', canvasState.weave === 'paper');
    q('[data-ground]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ground === canvasState.ground)));
    q('[data-weave]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.weave === canvasState.weave)));
    $('washOpts').hidden = canvasState.ground !== 'wash';
    $('groundHint').textContent = { raw: 'Raw canvas: pale and warm. The painting stays as it is when the ground changes.', wash: 'A thin wash of one of your paints over the canvas, as painters tone a ground before starting.', gray: 'A neutral mid-value gray, so both lights and darks read against it.' }[canvasState.ground];
    $('washOut').textContent = `${Math.round(canvasState.washStr * 100)}%`;
    $('washName').textContent = canvasState.washCode ? paintName(canvasState.washCode) : '';
  }
  // the wash can be any paint in the palette; an earth is the usual choice, so one starts chosen
  function renderWash() {
    const codes = codesNow();
    if (!codes.includes(canvasState.washCode)) canvasState.washCode = codes.find((c) => ['YO', 'RS', 'BS', 'RU', 'BU', 'LR', 'NY', 'CO', 'TR', 'YOP', 'TOR'].includes(c)) || codes[1] || codes[0];
    $('washRow').innerHTML = '';
    codes.forEach((code) => {
      const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', paintHex(code)); b.title = paintName(code); b.setAttribute('aria-label', `Wash of ${paintName(code)}`);
      b.setAttribute('aria-pressed', String(code === canvasState.washCode));
      b.addEventListener('click', () => { canvasState.washCode = code; renderWash(); applyCanvas(); });
      $('washRow').append(b);
    });
  }
  q('[data-ground]').forEach((b) => b.addEventListener('click', () => { canvasState.ground = b.dataset.ground; applyCanvas(); }));
  q('[data-weave]').forEach((b) => b.addEventListener('click', () => { canvasState.weave = b.dataset.weave; applyCanvas(); }));
  $('washStr').addEventListener('input', () => { canvasState.washStr = +$('washStr').value / 100; applyCanvas(); });

  // the finished picture, all its layers in one, for saving
  function composite() {
    const c = document.createElement('canvas'); c.width = paper.width; c.height = paper.height;
    const x = c.getContext('2d');
    x.drawImage(ground, 0, 0);
    if (!wrap.classList.contains('ps-no-sketch')) x.drawImage(sketch, 0, 0);
    x.drawImage(paper, 0, 0);
    if (canvasState.weave !== 'off') { x.globalCompositeOperation = 'multiply'; x.globalAlpha = WEAVE_ALPHA[canvasState.weave]; x.drawImage(weave, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
    return c;
  }
  $('save').addEventListener('click', () => { Studio.savePng(composite(), 'painting.png'); closeSheets(); });

  // ---- Stamps: each brush lays one mark, and a stroke is a run of them ----------------------------
  const ANGLE = -0.7;
  function stampChisel(x, y, w, color) { g.save(); g.translate(x, y); g.rotate(ANGLE); g.fillStyle = css(color); g.globalAlpha = 0.92; g.fillRect(-w / 2, -w * 0.11, w, w * 0.22); g.restore(); }
  function stampRound(x, y, r, color) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, css(color)); grad.addColorStop(0.8, css(color)); grad.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  function stampPencil(x, y, size, pressure, color, lead, hard) {
    const h = (lead === 'charcoal' ? CHAR : HARD)[hard];
    const r = size * h.grow * (0.6 + pressure * 0.8);
    const c = color.map((v) => Math.round(v + (150 - v) * h.grey));
    g.fillStyle = css(c);
    const grain = lead === 'charcoal' ? 1.6 + r * 0.08 : 1.2;
    for (let i = 0; i < h.dots; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * (lead === 'charcoal' ? (Math.random() < 0.25 ? 1 + h.spread * 0.6 : 1) : 1);
      g.globalAlpha = h.alpha * (0.5 + Math.random() * 0.5) * (0.5 + pressure) * (d > r ? 0.35 : 1);
      g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, grain, grain);
    }
  }
  // The fan brush drags what is already on the paper: a patch from a step back along the stroke,
  // shaped like the fan's wide soft tip, is laid down at each step with some transparency
  const patch = document.createElement('canvas'), pg = patch.getContext('2d');
  let dragFrom = null;
  function stampBlend(x, y, dir) {
    const s = state.blend, h = Math.max(1, Math.round(s / 2));
    if (!dragFrom) { dragFrom = { x, y }; return; }
    patch.width = s; patch.height = s;
    pg.clearRect(0, 0, s, s);
    pg.drawImage(layer, dragFrom.x - h, dragFrom.y - h, s, s, 0, 0, s, s);
    pg.globalCompositeOperation = 'destination-in';
    pg.save(); pg.translate(h, h); pg.rotate(dir + Math.PI / 2);
    const grad = pg.createRadialGradient(0, 0, 0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.9)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    pg.fillStyle = grad; pg.scale(1, 0.38); pg.beginPath(); pg.arc(0, 0, h, 0, Math.PI * 2); pg.fill();
    pg.restore(); pg.globalCompositeOperation = 'source-over';
    g.globalAlpha = state.blendStr;
    g.drawImage(patch, x - h, y - h);
    g.globalAlpha = 1;
    // the patch trails the brush by a short distance, so paint is pulled a little, not copied along
    const lag = Math.min(1, (s * 0.35) / (Math.hypot(x - dragFrom.x, y - dragFrom.y) || 1));
    dragFrom = { x: x + (dragFrom.x - x) * lag, y: y + (dragFrom.y - y) * lag };
  }
  function stampEraser(x, y, r) {
    g.globalCompositeOperation = 'destination-out';
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.85, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  function stamp(x, y, pressure, dir) {
    const c = state.color;
    if (state.tool === 'chisel') stampChisel(x, y, CHISEL[state.chisel], c);
    else if (state.tool === 'round') stampRound(x, y, state.round / 2, c);
    else if (state.tool === 'pencil') stampPencil(x, y, state.pencil, pressure, c, state.lead, state.hard);
    else if (state.tool === 'sketch') stampPencil(x, y, state.sketch, pressure, c, state.slead, state.shard);
    else if (state.tool === 'blend') stampBlend(x, y, dir);
    else stampEraser(x, y, state.eraser / 2);
  }
  const spacing = () => state.tool === 'chisel' ? 1.5 : state.tool === 'round' ? Math.max(1, state.round * 0.12) : state.tool === 'blend' ? Math.max(2, state.blend * 0.12) : state.tool === 'eraser' ? Math.max(1, state.eraser * 0.12) : 1;
  function segment(a, b, pressure) {
    g.globalCompositeOperation = state.tool === 'pencil' || state.tool === 'sketch' ? 'multiply' : 'source-over';
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / spacing()));
    const dir = Math.atan2(b.y - a.y, b.x - a.x);
    for (let i = 1; i <= n; i++) stamp(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, pressure, dir);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  let last = null;
  const pos = (e) => { const r = paper.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * paper.width, y: (e.clientY - r.top) / r.height * paper.height }; };
  const press = (e) => (e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5);
  paper.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault(); closeSheets(); paper.setPointerCapture(e.pointerId);
    // the underdrawing brush draws on its layer; the eraser rubs out whichever layer was drawn on last
    if (state.tool === 'sketch') { useLayer(sketch); state.lastLayer = 'sketch'; showSketch(true); }
    else if (state.tool === 'eraser') useLayer(state.lastLayer === 'sketch' ? sketch : paper);
    else { useLayer(paper); state.lastLayer = 'paint'; }
    snapshot(); last = pos(e); dragFrom = null; segment(last, last, press(e));
  });
  paper.addEventListener('pointermove', (e) => { if (!last) return; const p = pos(e); segment(last, p, press(e)); last = p; });
  ['pointerup', 'pointercancel'].forEach((t) => paper.addEventListener(t, () => { last = null; dragFrom = null; }));
  paper.addEventListener('contextmenu', (e) => e.preventDefault());
  $('undo').addEventListener('click', () => { const u = undoStack.pop(); if (u) u.layer.getContext('2d').putImageData(u.img, 0, 0); $('undo').disabled = !undoStack.length; });
  $('clear').addEventListener('click', () => { useLayer(paper); snapshot(); blank(); closeSheets(); });
  $('sketchClear').addEventListener('click', () => { useLayer(sketch); snapshot(); blank(); });
  function showSketch(on) {
    wrap.classList.toggle('ps-no-sketch', !on);
    q('[data-sketch-show]').forEach((x) => x.setAttribute('aria-pressed', String(!!+x.dataset.sketchShow === on)));
  }
  q('[data-sketch-show]').forEach((b) => b.addEventListener('click', () => showSketch(!!+b.dataset.sketchShow)));
  // turning the paper keeps what is on it
  $('orient').addEventListener('click', () => {
    const land = paper.width < paper.height;
    [paper, sketch].forEach((c) => {
      const keep = document.createElement('canvas'); keep.width = c.width; keep.height = c.height; keep.getContext('2d').drawImage(c, 0, 0);
      c.width = keep.height; c.height = keep.width;
      const cx = c.getContext('2d');
      cx.save(); cx.translate(c.width / 2, c.height / 2); cx.rotate(land ? -Math.PI / 2 : Math.PI / 2); cx.drawImage(keep, -keep.width / 2, -keep.height / 2); cx.restore();
    });
    paintGround(); paintWeave();
    undoStack.length = 0; $('undo').disabled = true;
    layout();
    showStatus();
  });

  // ---- Sheets ----------------------------------------------------------------------------------
  const SHEETS = { brushSheet: 'brushBtn', eraserSheet: null, refSheet: 'refBtn', canvasSheet: 'canvasBtn', viewSheet: 'viewBtn', paintSheet: 'colorBtn' };
  function closeSheets() { Object.entries(SHEETS).forEach(([id, btn]) => { $(id).hidden = true; if (btn) $(btn).setAttribute('aria-expanded', 'false'); }); }
  function openSheet(id) { const was = !$(id).hidden; closeSheets(); if (!was) { $(id).hidden = false; if (SHEETS[id]) $(SHEETS[id]).setAttribute('aria-expanded', 'true'); } }
  q('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
  $('colorBtn').addEventListener('click', () => openSheet('paintSheet'));
  $('viewBtn').addEventListener('click', () => openSheet('viewSheet'));
  $('canvasBtn').addEventListener('click', () => openSheet('canvasSheet'));
  $('refBtn').addEventListener('click', () => openSheet('refSheet'));
  document.addEventListener('keydown', (e) => { if (active && e.key === 'Escape') closeSheets(); });
  // on a phone the tabs are out of view while painting, so the strip has a way back
  $('exit').addEventListener('click', () => document.getElementById('tabStudyBtn').click());

  // ---- The reference: the Study tab's photo, or a generated portrait, shown as itself, its ---------
  // three-value study or its color-block study
  const ref = { kind: 'studio', id: null, prep: null, res: null, view: 'original', shown: true, size: 0.36, x: 0, y: 0 };
  function studyPortrait(id) {
    const prep = Study.prepare(Subjects.picture(id, 1), 700);
    const opts = Studio.settings(prep), { w, h } = prep;
    opts.colorsPerZone = 3; opts.outlines = false;
    opts.lighter = 0; opts.blurRadius = 0;      // flat planes: nothing to lean toward, nothing to smooth
    opts.minSize = Math.round(w * h * 0.004 * 0.25);
    [opts.t1, opts.t2] = Study.autoThresholds(prep, opts.blurRadius, opts.smoothing);
    return { prep, res: Study.process(prep, opts) };
  }
  function refreshReference() {
    if (ref.kind === 'painting' && ref.id) {
      if (!ref.prep) Object.assign(ref, studyPortrait(ref.id));
      const e = Subjects.entry(ref.id);
      $('refName').textContent = `${e.title}, after ${Subjects.painterOf(ref.id)}: a generated portrait, as the game deals them.`;
    } else {
      ref.prep = Studio.prep(); ref.res = Studio.result();
      $('refName').textContent = 'The reference from the Study tab, with its studies as that tab makes them.';
    }
    drawReference();
  }
  function drawReference() {
    const c = $('refCanvas');
    if (ref.prep) {
      const { w, h } = ref.prep;
      c.width = w; c.height = h;
      const img = ref.res && ref.view === 'values' ? ref.res.valueImage : ref.res && ref.view === 'blocks' ? ref.res.blockImage : ref.prep.rgba;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img), w, h), 0, 0);
    }
    q('[data-ref-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.refView === ref.view)));
    q('[data-ref-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.refKind === ref.kind)));
    $('refAnother').hidden = ref.kind !== 'painting';
    $('refFig').hidden = !ref.shown || !ref.prep;
    $('refFig').style.width = `${ref.size * 100}%`;
    $('refSizeOut').textContent = `${Math.round(ref.size * 100)}%`;
    q('[data-ref-show]').forEach((b) => b.setAttribute('aria-pressed', String(!!+b.dataset.refShow === ref.shown)));
  }
  function dealReference() { ref.kind = 'painting'; ref.id = Subjects.random(ref.id); ref.prep = ref.res = null; ref.shown = true; refreshReference(); }
  $('refAnother').addEventListener('click', dealReference);
  q('[data-ref-kind]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.refKind === 'painting') { if (ref.kind !== 'painting') dealReference(); }
    else { ref.kind = 'studio'; ref.shown = true; refreshReference(); }
  }));
  // a photo loaded here goes to the Study tab, and the reference follows it
  document.getElementById('file').addEventListener('change', () => { if (active) { ref.kind = 'studio'; ref.shown = true; } });
  window.addEventListener('studio:result', () => { if (ref.kind === 'studio') refreshReference(); });
  q('[data-ref-view]').forEach((b) => b.addEventListener('click', () => { ref.view = b.dataset.refView; drawReference(); }));
  q('[data-ref-show]').forEach((b) => b.addEventListener('click', () => { ref.shown = !!+b.dataset.refShow; drawReference(); }));
  $('refSize').addEventListener('input', () => { ref.size = +$('refSize').value / 100; drawReference(); });
  // drag it anywhere over the paper
  (function () {
    const fig = $('refFig'), frame = fig.querySelector('.ps-frame');
    frame.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      frame.setPointerCapture(e.pointerId);
      fig.classList.add('is-moving');
      const start = { x: e.clientX, y: e.clientY, px: ref.x, py: ref.y };
      const move = (ev) => {
        const st = $('stage').getBoundingClientRect(), r = fig.getBoundingClientRect();
        const bx = r.left - ref.x, by = r.top - ref.y;
        ref.x = Math.min(st.right - r.width - bx, Math.max(st.left - bx, start.px + ev.clientX - start.x));
        ref.y = Math.min(st.bottom - r.height - by, Math.max(st.top - by, start.py + ev.clientY - start.y));
        fig.style.transform = `translate(${ref.x}px, ${ref.y}px)`;
      };
      const end = () => { fig.classList.remove('is-moving'); frame.removeEventListener('pointermove', move); frame.removeEventListener('pointerup', end); frame.removeEventListener('pointercancel', end); };
      frame.addEventListener('pointermove', move); frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
    });
  })();

  // ---- Zoom and pan: the fitted paper is scaled about its centre and slid by the sliders. The pan
  // sliders cover just the part of the paper that is off the screen at this zoom.
  const view = { zoom: 1, px: 0, py: 0 };
  function applyView() {
    const st = $('stage'), z = view.zoom;
    const w = wrap.clientWidth * z, h = wrap.clientHeight * z;
    const ox = Math.max(0, (w - st.clientWidth) / 2 + 24), oy = Math.max(0, (h - st.clientHeight) / 2 + 24);
    wrap.style.transform = `translate(${-view.px * ox}px, ${-view.py * oy}px) scale(${z})`;
    $('zoomOut').textContent = `${Math.round(z * 100)}%`;
    $('zoomSub').textContent = z === 1 ? '1×' : `${(Math.round(z * 2) / 2).toString().replace('.5', '½')}×`;
    $('panX').disabled = $('panY').disabled = z === 1;
    $('panXOut').textContent = view.px === 0 ? 'centre' : `${Math.abs(Math.round(view.px * 100))}% ${view.px < 0 ? 'left' : 'right'}`;
    $('panYOut').textContent = view.py === 0 ? 'centre' : `${Math.abs(Math.round(view.py * 100))}% ${view.py < 0 ? 'up' : 'down'}`;
  }
  $('zoom').addEventListener('input', () => { view.zoom = +$('zoom').value / 100; applyView(); });
  $('panX').addEventListener('input', () => { view.px = +$('panX').value / 100; applyView(); });
  $('panY').addEventListener('input', () => { view.py = +$('panY').value / 100; applyView(); });
  $('fitBtn').addEventListener('click', () => { view.zoom = 1; view.px = view.py = 0; $('zoom').value = 100; $('panX').value = 0; $('panY').value = 0; applyView(); });

  // ---- Tools -----------------------------------------------------------------------------------
  function showStatus() {
    const leadLabel = (lead, hard) => (lead === 'charcoal' ? `Charcoal · ${CHAR[hard].label}` : HARD[hard].label);
    const t = { chisel: `Chisel · ${state.chisel.toUpperCase()}`, round: `Round · ${state.round} px`, pencil: `Pencil · ${leadLabel(state.lead, state.hard)} · ${state.pencil} px`, sketch: `Underdrawing · ${leadLabel(state.slead, state.shard)} · ${state.sketch} px`, blend: `Blend · ${state.blend} px · ${Math.round(state.blendStr * 100)}%`, eraser: `Eraser · ${state.eraser} px · ${state.lastLayer === 'sketch' ? 'underdrawing' : 'paint'}` }[state.tool];
    $('status').textContent = `${t} · ${paper.width} × ${paper.height}`;
    const subs = { chisel: state.chisel.toUpperCase(), round: state.round, pencil: state.lead === 'charcoal' ? 'Ch' : HARD[state.hard].label, sketch: state.slead === 'charcoal' ? 'Ch' : HARD[state.shard].label, blend: state.blend };
    $('chiselSub').textContent = subs.chisel; $('roundSub').textContent = subs.round; $('pencilSub').textContent = subs.pencil; $('sketchSub').textContent = subs.sketch; $('blendSub').textContent = subs.blend;
    q('[data-hard]').forEach((b) => { b.textContent = state.lead === 'charcoal' ? CHAR[b.dataset.hard].label : HARD[b.dataset.hard].label; });
    $('pencilHint').textContent = state.lead === 'charcoal' ? 'A hard stick keeps a crisper line; a soft one spreads and goes black. Pen pressure counts.' : '2H is pale and fine; 4B is dark and builds up. Pen pressure counts.';
    $('eraserSub').textContent = state.eraser;
    // the Brushes icon shows the brush in hand (or the last one used)
    const b = BRUSHES.includes(state.tool) ? state.tool : state.lastBrush;
    $('brushIcon').innerHTML = root.querySelector(`[data-brush="${b}"] svg`).innerHTML;
    $('brushSub').textContent = subs[b];
    $('brushBtn').setAttribute('aria-pressed', String(BRUSHES.includes(state.tool)));
    q('[data-ps-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.psTool === state.tool)));
    q('[data-brush]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.brush === b)));
    BRUSHES.forEach((t) => { $(t + 'Opts').hidden = t !== b; });
  }
  // The brushes share one icon. Tapping it after another tool brings back the last brush, as it
  // was set; tapping it while a brush is in hand opens the row of brushes and their options.
  $('brushBtn').addEventListener('click', () => {
    if (BRUSHES.includes(state.tool)) openSheet('brushSheet');
    else { state.tool = state.lastBrush; closeSheets(); }
    showStatus();
  });
  q('[data-brush]').forEach((b) => b.addEventListener('click', () => { state.tool = state.lastBrush = b.dataset.brush; showStatus(); }));
  // the eraser: tap to use it, tap again for its size
  q('[data-ps-tool]').forEach((b) => b.addEventListener('click', () => {
    const again = state.tool === b.dataset.psTool;
    state.tool = b.dataset.psTool;
    if (again) openSheet(state.tool + 'Sheet'); else closeSheets();
    showStatus();
  }));
  const pick = (attr, key) => q(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
    state[key] = b.dataset[attr.replace(/-(\w)/g, (m, c) => c.toUpperCase())];
    q(`[data-${attr}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    showStatus();
  }));
  pick('chisel', 'chisel'); pick('hard', 'hard'); pick('lead', 'lead'); pick('slead', 'slead'); pick('shard', 'shard');
  const slide = (id, key, out, suffix = ' px', scale = 1) => $(id).addEventListener('input', () => { state[key] = +$(id).value * scale; $(out).textContent = $(id).value + suffix; showStatus(); });
  slide('roundSize', 'round', 'roundOut'); slide('pencilSize', 'pencil', 'pencilOut'); slide('sketchSize', 'sketch', 'sketchOut');
  slide('blendSize', 'blend', 'blendOut'); slide('blendStr', 'blendStr', 'blendStrOut', '%', 0.01); slide('eraserSize', 'eraser', 'eraserOut');

  // ---- Paints and the well -----------------------------------------------------------------------
  function setColor(c, name) { state.color = c; state.name = name; $('colorDot').style.setProperty('--c', css(c)); $('colorBtn').title = `Paints and mixing · ${name}`; }
  function renderPaints() {
    $('paints').innerHTML = '';
    codesNow().forEach((code) => {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ps-paint'; b.title = paintName(code); b.dataset.code = code;
      b.innerHTML = `<span class="ps-dot" style="--c:${paintHex(code)}"></span><span class="ps-code">${code}</span><span class="ps-n"></span>`;
      b.addEventListener('click', () => { state.well.push({ code, amount: AMOUNTS[+$('amount').value] }); showWell(); });
      li.append(b); $('paints').append(li);
    });
    showWell();
  }
  let picked = -1;
  function showWell() {
    const parts = state.well;
    const by = new Map(); parts.forEach((p) => by.set(p.code, (by.get(p.code) || 0) + p.amount));
    const mixed = parts.length ? mixColor(parts) : null;
    $('wellChip').style.background = mixed ? css(mixed) : ''; $('wellChip').classList.toggle('ps-empty', !mixed);
    $('wellParts').textContent = parts.length ? [...by].map(([c, n]) => `${c} ${fmt(n)}`).join(' · ') : 'Empty. Tap a paint to start a mix.';
    ['lock', 'wellUndo', 'wellClear'].forEach((id) => { $(id).disabled = !parts.length; });
    q('.ps-paint').forEach((b) => { const n = by.get(b.dataset.code); b.querySelector('.ps-n').textContent = n ? fmt(n) : ''; });
    if (mixed) { setColor(mixed, 'Current mix'); q('.ps-mix').forEach((m) => m.setAttribute('aria-pressed', 'false')); picked = -1; $('picked').hidden = true; }
  }
  $('wellUndo').addEventListener('click', () => { state.well.pop(); showWell(); });
  $('wellClear').addEventListener('click', () => { state.well = []; showWell(); });
  // a locked mix keeps its parts, so it can be copied back into the well and taken further
  $('lock').addEventListener('click', () => {
    const parts = state.well.map((p) => ({ ...p }));
    state.mixes.push({ c: mixColor(parts), parts });
    state.well = []; showWell();
    renderMixes(); saveMixes();
    pickMix(state.mixes.length - 1, false);
    $('pickedRecipe').textContent = `Locked in as mix ${state.mixes.length}. Tap it any time to build on it.`;
    // back to the paper, painting with the new mix
    closeSheets();
    const painters = ['chisel', 'round', 'pencil', 'sketch'];
    if (!painters.includes(state.tool)) { state.tool = painters.includes(state.lastBrush) ? state.lastBrush : 'chisel'; state.lastBrush = state.tool; showStatus(); }
  });
  // tapping a locked mix paints with it and puts its parts in the well, ready to take further
  function pickMix(i, loadWell = true) {
    const m = state.mixes[i];
    if (loadWell) { state.well = m.parts.map((p) => ({ ...p })); showWell(); }
    picked = i;
    const name = m.name || `Mix ${i + 1}`;
    setColor(m.c, name);
    q('.ps-mix').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
    $('picked').hidden = false;
    $('pickedRecipe').textContent = `${name} (${recipeOf(m.parts)}) is in the well: add paint to build on it, then lock in a new mix.`;
  }
  $('dropMix').addEventListener('click', () => { if (picked < 0) return; state.mixes.splice(picked, 1); picked = -1; $('picked').hidden = true; renderMixes(); saveMixes(); });
  function renderMixes() {
    $('mixes').innerHTML = '';
    if (!state.mixes.length) { const s = document.createElement('span'); s.className = 'ps-none'; s.textContent = 'Lock in a mix to keep it here.'; $('mixes').append(s); return; }
    state.mixes.forEach((m, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ps-mix'; b.style.setProperty('--c', css(m.c)); b.title = `${m.name || 'Mix ' + (i + 1)}: ${recipeOf(m.parts)}`; b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => pickMix(i));
      $('mixes').append(b);
    });
  }
  // the mixes you lock in are kept between visits; the starters are made afresh for the palette
  const saveMixes = () => save(MIXES_KEY, state.mixes.filter((m) => !m.starter).map((m) => ({ parts: m.parts })));
  $('amount').addEventListener('input', () => { const a = AMOUNTS[+$('amount').value]; $('amountOut').textContent = `${fmt(a)} part${a > 1 ? 's' : ''}`; });

  /*
   * Starting mixes: the skin tones portrait painters reach for most, each mixed from the chosen
   * palette. The targets are a light complexion in the light, half tone and shadow, a medium and
   * a deep complexion in the light and shadow, and the warm of a cheek or lip. For each, every
   * pair of the palette's paints (and each paint alone) is tried in a few proportions with a
   * little to a lot of white, and the closest mix is kept. They are replaced when the palette
   * changes; mixes you lock in yourself stay.
   */
  const SKIN = [
    ['Light · lit', '#EBBE9A'], ['Light · half tone', '#D29A74'], ['Light · shadow', '#9A6243'],
    ['Medium · lit', '#C78B5E'], ['Medium · shadow', '#7E4E33'],
    ['Deep · lit', '#8A5436'], ['Deep · shadow', '#4A2E1F'],
    ['Cheek and lip', '#C06A54'],
  ];
  function skinMixes(codes) {
    const whites = codes.filter((c) => paintFor(c).white), white = whites[0];
    const colors = codes.filter((c) => !whites.includes(c));
    const sets = [];
    colors.forEach((a) => sets.push([[a, 1]]));
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3], [6, 1], [1, 6]].forEach(([p, r]) => sets.push([[colors[i], p], [colors[j], r]]));
    const candidates = [];
    sets.forEach((set) => (white ? [0, 0.5, 1, 2, 4, 8, 14] : [0]).forEach((w) => {
      const parts = set.map(([code, amount]) => ({ code, amount }));
      if (w) parts.push({ code: white, amount: w });
      const c = mixColor(parts);
      if (c) candidates.push({ parts, c, lab: lab(c) });
    }));
    if (!candidates.length) return [];
    const used = new Set();   // no two starting mixes the same
    return SKIN.map(([name, target]) => {
      const t = lab(hexOf(target));
      let best = null, bd = Infinity;
      candidates.forEach((k) => { if (used.has(k)) return; const d = Math.hypot(k.lab[0] - t[0], k.lab[1] - t[1], k.lab[2] - t[2]); if (d < bd) { bd = d; best = k; } });
      used.add(best);
      return { name, c: best.c, parts: best.parts.map((p) => ({ ...p })), starter: true };
    });
  }
  function seedMixes() {
    state.mixes = state.mixes.filter((m) => !m.starter);
    state.mixes.unshift(...skinMixes(codesNow()));
    renderMixes();
    if (state.mixes.length) setColor(state.mixes[0].c, state.mixes[0].name || 'Mix 1');
  }

  // ---- Palettes ----------------------------------------------------------------------------------
  let paletteTouched = false;
  function renderPalettes() {
    paletteList = palettes();
    const sel = $('palette'), was = sel.value;
    sel.innerHTML = '';
    paletteList.forEach((p) => sel.append(new Option(p.name, p.id)));
    // until you choose one here, the palette follows the Study tab's
    const cur = window.StudioPalette && StudioPalette.current();
    const follow = cur && (paletteList.find((p) => sameCodes(p.codes, cur.codes)) || {}).id;
    sel.value = (paletteTouched && paletteList.some((p) => p.id === was) ? was : follow) || (paletteList.some((p) => p.id === was) ? was : paletteList[0].id);
  }
  function applyPalette() { state.well = []; renderPaints(); renderWash(); applyCanvas(); seedMixes(); }
  $('palette').addEventListener('change', () => { paletteTouched = true; applyPalette(); });
  window.addEventListener('studio:palette', () => { if (paletteTouched) return; const was = $('palette').value; renderPalettes(); if ($('palette').value !== was) applyPalette(); });

  // ---- Start ---------------------------------------------------------------------------------------
  renderPalettes();
  state.mixes = load(MIXES_KEY, []).map((m) => m && Array.isArray(m.parts) ? { parts: m.parts.filter((p) => p && Paints.byCode(p.code) && p.amount > 0), c: null } : null).filter((m) => m && m.parts.length).map((m) => ({ ...m, c: mixColor(m.parts) }));
  blank();
  applyPalette();
  showStatus();
  applyView();

  window.addEventListener('studio:tab', (e) => {
    active = e.detail === 'paint';
    document.body.classList.toggle('tab-paint', active);
    if (!active) { closeSheets(); return; }
    window.scrollTo(0, 0);
    if (!paletteTouched) { const was = $('palette').value; renderPalettes(); if ($('palette').value !== was) applyPalette(); }
    refreshReference();
    layout();
    setTimeout(layout, 120);
  });
  // the page may open straight on this tab (index.html#paint), before this script was listening
  if (Studio.tab() === 'paint') window.dispatchEvent(new CustomEvent('studio:tab', { detail: 'paint' }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  window.PaintStudio = { composite, state };
})();
