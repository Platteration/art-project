/* Portrait Value Studio - UI wiring: loading photos, settings, loupe sampler and palette. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    file: $('file'),
    source: $('source'),
    simplify: $('simplify'), simplifyOut: $('simplifyOut'),
    merge: $('merge'), mergeOut: $('mergeOut'),
    detail: $('detail'),
    t1: $('t1'), t1Out: $('t1Out'),
    t2: $('t2'), t2Out: $('t2Out'),
    autoSplit: $('autoSplit'),
    customGrays: $('customGrays'),
    g: [$('g0'), $('g1'), $('g2')],
    gOut: [$('g0Out'), $('g1Out'), $('g2Out')],
    colors: $('colors'), colorsOut: $('colorsOut'),
    outlines: $('outlines'),
    addBlocks: $('addBlocks'),
    hist: $('hist'),
    zones: $('zones'),
    panels: $('panels'),
    busy: $('busy'),
    canvases: { orig: $('cv-orig'), value: $('cv-value'), block: $('cv-block') },
    swatches: $('swatches'),
    palCount: $('palCount'),
    palEmpty: $('palEmpty'),
    palSort: $('palSort'),
    palCopy: $('palCopy'),
    palSave: $('palSave'),
    palClear: $('palClear'),
    copyFallback: $('copyFallback'),
    loupe: $('loupe'),
    loupeCanvas: $('loupeCanvas'),
    loupeChip: $('loupeChip'),
    loupeHex: $('loupeHex'),
    loupeVal: $('loupeVal'),
    dropHint: $('dropHint'),
    toast: $('toast'),
  };

  const ZONE_NAMES = ['Shadow', 'Middle', 'Light'];
  const PALETTE_KEY = 'portrait-value-studio.palette';

  const state = {
    source: null,      // HTMLImageElement or canvas
    baseName: 'sample-study',
    prep: null,        // Study.prepare() output
    result: null,      // Study.process() output
    pixels: {},        // view id -> RGBA array, used by the loupe
    palette: loadPalette(),
    hover: null,       // last sampled { r, g, b }
  };

  // ---- Helpers ------------------------------------------------------------

  const valueLabel = (L) => (L / 10).toFixed(1);
  const hex2 = (v) => v.toString(16).padStart(2, '0');
  const toHex = (c) => ('#' + hex2(c.r) + hex2(c.g) + hex2(c.b)).toUpperCase();

  let toastTimer = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---- Settings -----------------------------------------------------------

  function settings() {
    const { w, h } = state.prep;
    const long = Math.max(w, h);
    const simplify = +els.simplify.value;
    const merge = +els.merge.value;
    return {
      blurRadius: Math.round((simplify * long) / 450),
      minSize: Math.round(w * h * 0.012 * Math.pow(merge / 10, 2)),
      t1: +els.t1.value,
      t2: +els.t2.value,
      grayMode: document.querySelector('input[name="grayMode"]:checked').value,
      customL: els.g.map((el) => +el.value),
      colorsPerZone: +els.colors.value,
      outlines: els.outlines.checked,
    };
  }

  function updateOutputs() {
    els.simplifyOut.value = els.simplify.value === '0' ? 'Off' : els.simplify.value;
    els.mergeOut.value = els.merge.value === '0' ? 'Off' : els.merge.value;
    els.t1Out.value = 'V ' + valueLabel(+els.t1.value);
    els.t2Out.value = 'V ' + valueLabel(+els.t2.value);
    els.g.forEach((el, i) => { els.gOut[i].value = 'V ' + valueLabel(+el.value); });
    els.colorsOut.value = els.colors.value;
  }

  function autoSplit() {
    const blurRadius = settings().blurRadius;
    const [t1, t2] = Study.autoThresholds(state.prep, blurRadius);
    els.t1.value = Math.max(1, Math.min(t1, 97));
    els.t2.value = Math.max(+els.t1.value + 2, Math.min(t2, 99));
    updateOutputs();
  }

  // ---- Processing ---------------------------------------------------------

  let runTimer = 0;
  function runSoon(delay) {
    els.busy.hidden = false;
    clearTimeout(runTimer);
    runTimer = setTimeout(run, delay == null ? 90 : delay);
  }

  function run() {
    if (!state.prep) return;
    const r = Study.process(state.prep, settings());
    state.result = r;
    paint(els.canvases.value, r.valueImage, r.w, r.h);
    paint(els.canvases.block, r.blockImage, r.w, r.h);
    state.pixels.value = r.valueImage;
    state.pixels.block = r.blockImage;
    renderZones();
    drawHistogram();
    els.busy.hidden = true;
  }

  function paint(canvas, rgba, w, h) {
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  }

  function prepareAndRun(resetSplit) {
    state.prep = Study.prepare(state.source, +els.detail.value);
    const { w, h, rgba } = state.prep;
    paint(els.canvases.orig, new Uint8ClampedArray(rgba), w, h);
    state.pixels.orig = rgba;
    if (resetSplit) autoSplit();
    runSoon(0);
  }

  function renderZones() {
    const r = state.result;
    els.zones.innerHTML = '';
    r.zoneGray.forEach((g, i) => {
      const li = document.createElement('li');
      const tone = document.createElement('span');
      tone.className = 'tone';
      tone.style.background = `rgb(${g},${g},${g})`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = ZONE_NAMES[i];
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `V ${valueLabel(r.zoneL[i])} · ${Math.round(r.zoneShare[i] * 100)}%`;
      li.append(tone, name, meta);
      els.zones.append(li);
    });
  }

  function drawHistogram() {
    const c = els.hist;
    const dpr = window.devicePixelRatio || 1;
    const cw = c.clientWidth || 248;
    const ch = c.clientHeight || 64;
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    if (!state.prep || !state.prep.blurCache) return;

    const BINS = 100;
    const hist = Study.histogram(state.prep.blurCache.L, BINS);
    const max = Math.max(...hist) || 1;
    const rampH = 8;
    const plotH = ch - rampH - 2;
    const bw = cw / BINS;

    // value ramp along the bottom, so the x-axis reads as black to white
    for (let i = 0; i < BINS; i++) {
      const v = Study.grayForL(((i + 0.5) / BINS) * 100);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(i * bw, ch - rampH, bw + 0.5, rampH);
    }
    g.fillStyle = cssVar('--muted');
    for (let i = 0; i < BINS; i++) {
      const bh = Math.sqrt(hist[i] / max) * (plotH - 4);
      g.fillRect(i * bw, plotH - bh, Math.max(1, bw - 0.5), bh);
    }
    g.fillStyle = cssVar('--accent');
    [+els.t1.value, +els.t2.value].forEach((t) => {
      g.fillRect((t / 100) * cw - 1, 0, 2, ch);
    });
  }

  // ---- Loading photos -----------------------------------------------------

  function loadFile(file) {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      toast('That file is not an image. Choose a JPG, PNG or WebP photo.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.source = img;
      state.baseName = (file.name || 'portrait').replace(/\.[^.]+$/, '') || 'portrait';
      setSourceLabel(file.name || 'Pasted image', img.naturalWidth, img.naturalHeight, false);
      prepareAndRun(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('This image could not be opened. Try saving it as JPG or PNG first.');
    };
    img.src = url;
  }

  function setSourceLabel(name, w, h, isSample) {
    els.source.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = name;
    els.source.append(strong);
    els.source.append(
      isSample
        ? ' · a painted stand-in. Load, drop or paste a portrait to use your own.'
        : ` · ${w} × ${h} px`
    );
  }

  els.file.addEventListener('change', () => {
    loadFile(els.file.files[0]);
    els.file.value = '';
  });

  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    els.dropHint.hidden = false;
  });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropHint.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    els.dropHint.hidden = true;
    loadFile(e.dataTransfer.files[0]);
  });
  window.addEventListener('paste', (e) => {
    const item = Array.from((e.clipboardData && e.clipboardData.items) || []).find((i) => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile());
  });

  // ---- Control events -----------------------------------------------------

  els.simplify.addEventListener('input', () => { updateOutputs(); runSoon(); });
  els.merge.addEventListener('input', () => { updateOutputs(); runSoon(); });
  els.colors.addEventListener('input', () => { updateOutputs(); runSoon(); });
  els.outlines.addEventListener('change', () => runSoon(0));
  els.detail.addEventListener('change', () => { if (state.source) prepareAndRun(false); });

  els.t1.addEventListener('input', () => {
    if (+els.t1.value > +els.t2.value - 2) els.t2.value = Math.min(99, +els.t1.value + 2);
    if (+els.t1.value > +els.t2.value - 2) els.t1.value = +els.t2.value - 2;
    updateOutputs(); drawHistogram(); runSoon();
  });
  els.t2.addEventListener('input', () => {
    if (+els.t2.value < +els.t1.value + 2) els.t1.value = Math.max(1, +els.t2.value - 2);
    if (+els.t2.value < +els.t1.value + 2) els.t2.value = +els.t1.value + 2;
    updateOutputs(); drawHistogram(); runSoon();
  });
  els.autoSplit.addEventListener('click', () => { autoSplit(); runSoon(0); toast('Splits set from this photo'); });

  document.querySelectorAll('input[name="grayMode"]').forEach((el) =>
    el.addEventListener('change', () => {
      els.customGrays.hidden = !(el.value === 'custom' && el.checked);
      runSoon(0);
    })
  );
  els.g.forEach((el) => el.addEventListener('input', () => { updateOutputs(); runSoon(); }));

  document.querySelectorAll('input[name="view"]').forEach((el) =>
    el.addEventListener('change', () => { els.panels.dataset.view = el.value; })
  );

  document.querySelectorAll('[data-save]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.save;
      const suffix = { orig: 'original', value: 'three-value', block: 'color-blocks' }[id];
      els.canvases[id].toBlob((blob) => blob && downloadBlob(blob, `${state.baseName}-${suffix}.png`), 'image/png');
    })
  );

  els.addBlocks.addEventListener('click', () => {
    if (!state.result) return;
    const colors = state.result.blockColors
      .slice()
      .sort((a, b) => Study.lightnessOf(a.r, a.g, a.b) - Study.lightnessOf(b.r, b.g, b.b));
    let added = 0;
    colors.forEach((c) => { if (addColor(c, true)) added++; });
    toast(added ? `Added ${added} block color${added === 1 ? '' : 's'}` : 'Those colors are already in the palette');
  });

  // ---- Loupe --------------------------------------------------------------

  const CELLS = 15;           // odd, so one pixel sits in the middle
  const LOUPE_SIZE = 148;     // css px, matches styles.css

  function sampleAt(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const id = canvas.id.replace('cv-', '');
    const data = state.pixels[id];
    if (!data || !rect.width) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const p = (y * canvas.width + x) * 4;
    return { id, x, y, data, w: canvas.width, h: canvas.height, r: data[p], g: data[p + 1], b: data[p + 2] };
  }

  function drawLoupe(s) {
    const c = els.loupeCanvas;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(LOUPE_SIZE * dpr);
    if (c.width !== size) { c.width = size; c.height = size; }
    const g = c.getContext('2d');
    const cell = size / CELLS;
    const half = (CELLS - 1) / 2;
    g.fillStyle = cssVar('--well');
    g.fillRect(0, 0, size, size);
    for (let j = 0; j < CELLS; j++) {
      const y = s.y + j - half;
      if (y < 0 || y >= s.h) continue;
      for (let i = 0; i < CELLS; i++) {
        const x = s.x + i - half;
        if (x < 0 || x >= s.w) continue;
        const p = (y * s.w + x) * 4;
        g.fillStyle = `rgb(${s.data[p]},${s.data[p + 1]},${s.data[p + 2]})`;
        g.fillRect(Math.floor(i * cell), Math.floor(j * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
    // faint pixel grid
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 1; k < CELLS; k++) {
      const v = Math.round(k * cell) + 0.5;
      g.moveTo(v, 0); g.lineTo(v, size);
      g.moveTo(0, v); g.lineTo(size, v);
    }
    g.stroke();
    // centre pixel: dark and light ring so it shows on any color
    const x0 = Math.round(half * cell), w0 = Math.round(cell);
    g.lineWidth = 2 * dpr;
    g.strokeStyle = '#000';
    g.strokeRect(x0 - dpr, x0 - dpr, w0 + 2 * dpr, w0 + 2 * dpr);
    g.strokeStyle = '#fff';
    g.strokeRect(x0 + dpr, x0 + dpr, w0 - 2 * dpr, w0 - 2 * dpr);

    const hex = toHex(s);
    els.loupeChip.style.background = hex;
    els.loupeHex.textContent = hex;
    els.loupeVal.textContent = 'V ' + valueLabel(Study.lightnessOf(s.r, s.g, s.b));
  }

  function placeLoupe(clientX, clientY, touch) {
    const box = els.loupe.getBoundingClientRect();
    const bw = box.width || LOUPE_SIZE;
    const bh = box.height || LOUPE_SIZE + 36;
    const gap = 22;
    let left, top;
    if (touch) {
      // above the finger so it stays visible
      left = clientX - bw / 2;
      top = clientY - bh - 48;
      if (top < 8) top = clientY + 48;
    } else {
      left = clientX + gap;
      top = clientY + gap;
      if (left + bw > window.innerWidth - 8) left = clientX - gap - bw;
      if (top + bh > window.innerHeight - 8) top = clientY - gap - bh;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - bh - 8));
    els.loupe.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  let hideTimer = 0;
  function showLoupeFor(canvas, e) {
    const s = sampleAt(canvas, e.clientX, e.clientY);
    if (!s) { els.loupe.hidden = true; state.hover = null; return null; }
    clearTimeout(hideTimer);
    state.hover = s;
    els.loupe.hidden = false;
    drawLoupe(s);
    placeLoupe(e.clientX, e.clientY, e.pointerType === 'touch');
    return s;
  }

  Object.values(els.canvases).forEach((canvas) => {
    let down = null;
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && !down) return;
      showLoupeFor(canvas, e);
    });
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      els.loupe.hidden = true;
      state.hover = null;
    });
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'touch') showLoupeFor(canvas, e);
    });
    canvas.addEventListener('pointercancel', () => {
      down = null;
      els.loupe.hidden = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      const start = down;
      down = null;
      if (!start || e.button > 0) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const s = showLoupeFor(canvas, e);
      if (s && moved < 10) addColor(s);
      if (e.pointerType === 'touch') {
        hideTimer = setTimeout(() => { els.loupe.hidden = true; }, 1100);
      }
    });
  });

  window.addEventListener('scroll', () => { if (state.hover) els.loupe.hidden = true; }, { passive: true });

  // ---- Palette ------------------------------------------------------------

  function loadPalette() {
    try {
      const raw = localStorage.getItem(PALETTE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((c) => c && Number.isInteger(c.r)) : [];
    } catch (err) {
      return [];
    }
  }

  function savePalette() {
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(state.palette));
    } catch (err) {
      /* storage unavailable: the palette still works for this visit */
    }
  }

  function addColor(c, quiet) {
    const color = { r: c.r, g: c.g, b: c.b };
    const hex = toHex(color);
    if (state.palette.some((p) => toHex(p) === hex)) {
      if (!quiet) toast(`${hex} is already in the palette`);
      return false;
    }
    state.palette.push(color);
    savePalette();
    renderPalette();
    if (!quiet) toast(`Added ${hex}`);
    return true;
  }

  function renderPalette() {
    const list = state.palette;
    els.swatches.innerHTML = '';
    list.forEach((c, index) => {
      const hex = toHex(c);
      const li = document.createElement('li');
      li.className = 'swatch';

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'swatch-color';
      chip.style.background = hex;
      chip.title = `Copy ${hex}`;
      chip.setAttribute('aria-label', `Copy ${hex}`);
      chip.addEventListener('click', () => copyText(hex, `Copied ${hex}`));

      const meta = document.createElement('div');
      meta.className = 'swatch-meta';
      const h = document.createElement('span');
      h.textContent = hex;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = 'V ' + valueLabel(Study.lightnessOf(c.r, c.g, c.b));
      meta.append(h, v);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'swatch-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${hex}`);
      remove.addEventListener('click', () => {
        state.palette.splice(index, 1);
        savePalette();
        renderPalette();
      });

      li.append(chip, meta, remove);
      els.swatches.append(li);
    });
    const n = list.length;
    els.palCount.textContent = n ? `${n} color${n === 1 ? '' : 's'}` : '';
    els.palEmpty.hidden = n > 0;
    [els.palSort, els.palCopy, els.palSave, els.palClear].forEach((b) => { b.disabled = n === 0; });
    if (!n) els.copyFallback.hidden = true;
  }

  function copyText(text, done) {
    const fallback = () => {
      els.copyFallback.hidden = false;
      els.copyFallback.value = text;
      els.copyFallback.focus();
      els.copyFallback.select();
      toast('Copying is blocked here. The text is selected below; press Ctrl+C or ⌘C.');
    };
    if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
    navigator.clipboard.writeText(text).then(() => toast(done), fallback);
  }

  els.palSort.addEventListener('click', () => {
    state.palette.sort((a, b) => Study.lightnessOf(a.r, a.g, a.b) - Study.lightnessOf(b.r, b.g, b.b));
    savePalette();
    renderPalette();
  });

  els.palCopy.addEventListener('click', () => {
    const text = state.palette.map(toHex).join('\n');
    copyText(text, `Copied ${state.palette.length} hex code${state.palette.length === 1 ? '' : 's'}`);
  });

  els.palSave.addEventListener('click', () => {
    const list = state.palette;
    const cols = Math.min(6, list.length);
    const rows = Math.ceil(list.length / cols);
    const sw = 180, lab = 54, pad = 24, gap = 16;
    const c = document.createElement('canvas');
    c.width = pad * 2 + cols * sw + (cols - 1) * gap;
    c.height = pad * 2 + rows * (sw + lab) + (rows - 1) * gap;
    const g = c.getContext('2d');
    g.fillStyle = '#f3f3f1';
    g.fillRect(0, 0, c.width, c.height);
    list.forEach((col, i) => {
      const x = pad + (i % cols) * (sw + gap);
      const y = pad + Math.floor(i / cols) * (sw + lab + gap);
      g.fillStyle = toHex(col);
      g.fillRect(x, y, sw, sw);
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.strokeRect(x + 0.5, y + 0.5, sw - 1, sw - 1);
      g.fillStyle = '#1c1d20';
      g.font = '600 20px "IBM Plex Mono", monospace';
      g.fillText(toHex(col), x, y + sw + 26);
      g.fillStyle = '#5b5e64';
      g.font = '16px "IBM Plex Mono", monospace';
      g.fillText('Value ' + valueLabel(Study.lightnessOf(col.r, col.g, col.b)), x, y + sw + 47);
    });
    c.toBlob((blob) => blob && downloadBlob(blob, `${state.baseName}-palette.png`), 'image/png');
  });

  let clearArmed = 0;
  els.palClear.addEventListener('click', () => {
    if (!clearArmed) {
      els.palClear.textContent = 'Click again to clear';
      clearArmed = setTimeout(() => { clearArmed = 0; els.palClear.textContent = 'Clear'; }, 3000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = 0;
    els.palClear.textContent = 'Clear';
    state.palette = [];
    savePalette();
    renderPalette();
    toast('Palette cleared');
  });

  // ---- Sample portrait ----------------------------------------------------

  // A simple painted head so the tool shows its results before a photo is loaded.
  function paintSample() {
    const W = 600, H = 750;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    let grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#83958f');
    grad.addColorStop(1, '#2c3637');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    grad = g.createRadialGradient(470, 260, 10, 470, 260, 300);
    grad.addColorStop(0, 'rgba(196, 204, 186, 0.55)');
    grad.addColorStop(1, 'rgba(196, 204, 186, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // hair behind the head
    g.fillStyle = '#2a1a14';
    g.beginPath();
    g.ellipse(300, 330, 162, 205, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(140, 330); g.lineTo(150, 560); g.lineTo(450, 560); g.lineTo(462, 330);
    g.fill();

    // shoulders
    grad = g.createLinearGradient(40, 0, 560, 0);
    grad.addColorStop(0, '#94423a');
    grad.addColorStop(0.5, '#5a221e');
    grad.addColorStop(1, '#2a0f0e');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(30, H);
    g.bezierCurveTo(50, 640, 150, 585, 245, 572);
    g.lineTo(355, 572);
    g.bezierCurveTo(450, 585, 550, 640, 570, H);
    g.closePath();
    g.fill();

    // neck
    grad = g.createLinearGradient(240, 0, 365, 0);
    grad.addColorStop(0, '#cf9676');
    grad.addColorStop(0.55, '#8f5a44');
    grad.addColorStop(1, '#5a3326');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(245, 440); g.lineTo(355, 440);
    g.bezierCurveTo(352, 520, 360, 560, 372, 590);
    g.bezierCurveTo(330, 612, 270, 612, 228, 590);
    g.bezierCurveTo(242, 560, 248, 520, 245, 440);
    g.fill();
    g.fillStyle = 'rgba(60, 30, 20, 0.55)';
    g.beginPath();
    g.ellipse(305, 492, 72, 30, 0, 0, Math.PI * 2);
    g.fill();

    // head, lit from the upper left
    g.save();
    g.beginPath();
    g.moveTo(300, 165);
    g.bezierCurveTo(390, 165, 430, 240, 425, 330);
    g.bezierCurveTo(420, 420, 370, 490, 300, 500);
    g.bezierCurveTo(230, 490, 180, 420, 175, 330);
    g.bezierCurveTo(170, 240, 210, 165, 300, 165);
    g.closePath();
    grad = g.createRadialGradient(245, 275, 10, 265, 300, 215);
    grad.addColorStop(0, '#f4d2b4');
    grad.addColorStop(0.38, '#dda480');
    grad.addColorStop(0.72, '#ae6f4e');
    grad.addColorStop(1, '#6a3c2a');
    g.fillStyle = grad;
    g.fill();
    g.clip();
    grad = g.createLinearGradient(300, 0, 430, 0);
    grad.addColorStop(0, 'rgba(70, 35, 25, 0)');
    grad.addColorStop(1, 'rgba(70, 35, 25, 0.6)');
    g.fillStyle = grad;
    g.fillRect(300, 150, 140, 360);

    // eye sockets, eyes, brows
    g.fillStyle = 'rgba(95, 52, 36, 0.38)';
    [[252, 322], [348, 322]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 36, 21, 0, 0, Math.PI * 2); g.fill(); });
    [[252, 324, '#e6d9cc'], [348, 324, '#b9a595']].forEach(([x, y, white]) => {
      g.fillStyle = white;
      g.beginPath(); g.ellipse(x, y, 19, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a291f';
      g.beginPath(); g.arc(x + 2, y, 7, 0, Math.PI * 2); g.fill();
    });
    g.strokeStyle = '#3a2419';
    g.lineCap = 'round';
    g.lineWidth = 8;
    g.beginPath(); g.moveTo(218, 295); g.quadraticCurveTo(250, 280, 282, 292); g.stroke();
    g.beginPath(); g.moveTo(318, 292); g.quadraticCurveTo(350, 280, 384, 296); g.stroke();

    // nose
    g.fillStyle = 'rgba(92, 46, 30, 0.45)';
    g.beginPath();
    g.moveTo(308, 330); g.bezierCurveTo(320, 370, 330, 392, 322, 408); g.lineTo(300, 404); g.closePath();
    g.fill();
    g.fillStyle = 'rgba(70, 32, 22, 0.7)';
    g.beginPath(); g.ellipse(300, 410, 26, 8, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(250, 226, 204, 0.6)';
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(292, 340); g.lineTo(290, 392); g.stroke();

    // mouth
    g.fillStyle = '#93453d';
    g.beginPath();
    g.moveTo(262, 446); g.quadraticCurveTo(300, 430, 340, 446); g.quadraticCurveTo(300, 452, 262, 446);
    g.fill();
    g.fillStyle = '#b76457';
    g.beginPath();
    g.moveTo(266, 447); g.quadraticCurveTo(300, 476, 336, 447); g.quadraticCurveTo(300, 452, 266, 447);
    g.fill();
    g.restore();

    // hair on top, with a warm highlight
    grad = g.createLinearGradient(170, 150, 420, 320);
    grad.addColorStop(0, '#6e4631');
    grad.addColorStop(0.45, '#35221a');
    grad.addColorStop(1, '#1f1410');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(166, 370);
    g.bezierCurveTo(146, 190, 250, 128, 320, 140);
    g.bezierCurveTo(404, 150, 456, 230, 436, 370);
    g.bezierCurveTo(424, 300, 404, 250, 352, 236);
    g.bezierCurveTo(300, 224, 252, 250, 226, 230);
    g.bezierCurveTo(200, 268, 184, 300, 166, 370);
    g.closePath();
    g.fill();

    // grain, then a soft blur so it reads like a photo
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    let seed = 11;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = ((seed >> 8) % 13) - 6;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const o = out.getContext('2d');
    o.filter = 'blur(1.4px)';
    o.drawImage(c, 0, 0);
    return out;
  }

  // ---- Start --------------------------------------------------------------

  function start() {
    updateOutputs();
    renderPalette();
    state.source = paintSample();
    setSourceLabel('Sample study', 600, 750, true);
    prepareAndRun(true);
  }

  const redrawHist = () => drawHistogram();
  window.addEventListener('resize', redrawHist);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', redrawHist);
  }

  start();
})();
