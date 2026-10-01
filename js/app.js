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
    canvases: {
      orig: $('cv-orig'), value: $('cv-value'), block: $('cv-block'),
      refblock: $('cv-refblock'), art: $('cv-art'), artblock: $('cv-artblock'), diff: $('cv-diff'),
    },
    tabs: { study: $('tabStudyBtn'), check: $('tabCheckBtn') },
    tabPanels: { study: $('tab-study'), check: $('tab-check') },
    toolHint: $('toolHint'),
    lineUndo: $('lineUndo'),
    lineClear: $('lineClear'),
    artFile: $('artFile'),
    artFit: $('artFit'),
    artSource: $('artSource'),
    checkEmpty: $('checkEmpty'),
    checkBody: $('checkBody'),
    checkPanels: $('checkPanels'),
    scoreColor: $('scoreColor'),
    scoreGrade: $('scoreGrade'),
    scoreRel: $('scoreRel'),
    scoreRelNote: $('scoreRelNote'),
    scoreValue: $('scoreValue'),
    scoreShapes: $('scoreShapes'),
    meterValue: $('meterValue'),
    meterShapes: $('meterShapes'),
    fixList: $('fixList'),
    fixHint: $('fixHint'),
    modeRaw: $('modeRaw'),
    modeRel: $('modeRel'),
    diffNote: $('diffNote'),
    diffHint: $('diffHint'),
    overall: $('overall'),
    ovScales: $('ovScales'),
    ovMasses: $('ovMasses'),
    ovNudge: $('ovNudge'),
    ovLineUp: $('ovLineUp'),
    ovFindings: $('ovFindings'),
    glare: $('glare'),
    glareStatus: $('glareStatus'),
    alignPanel: $('alignPanel'),
    alignState: $('alignState'),
    onion: $('onion'), onionOut: $('onionOut'),
    alignX: $('alignX'), alignXOut: $('alignXOut'),
    alignY: $('alignY'), alignYOut: $('alignYOut'),
    alignScale: $('alignScale'), alignScaleOut: $('alignScaleOut'),
    alignRot: $('alignRot'), alignRotOut: $('alignRotOut'),
    alignReset: $('alignReset'),
    wbPick: $('wbPick'),
    wbUndo: $('wbUndo'),
    wbStatus: $('wbStatus'),
    swatches: $('swatches'),
    palTitle: $('palTitle'),
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
    saveDialog: $('saveDialog'),
    saveImg: $('saveImg'),
    saveName: $('saveName'),
    saveClose: $('saveClose'),
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
    tab: 'study',
    grid: 0,           // 0, 3 or 4 divisions
    tool: 'sample',    // 'sample' or 'line'
    lineColor: '#e5322d',
    lines: [],         // reference lines in 0-1 image coordinates
    drawing: null,     // line being dragged out
    art: {             // the painting being checked
      source: null,
      name: '',
      isExample: false,
      key: '',
      prep: null,
      result: null,
      cmp: null,
      dirty: true,
      gains: [1, 1, 1],  // white-balance correction, linear light
    },
    picking: false,      // waiting for a click on a neutral spot of the painting
    shiftMode: 'raw',    // 'raw' (as photographed) or 'rel' (after the overall shift)
    toOverall: false,    // scroll to the Overall card once the check has run (#overall)
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

  // Inside a frame (such as an artifact viewer) a sandbox can block downloads without a word, and
  // the page can't tell whether it did. So there the download is still tried, and the PNG also
  // opens in a dialog to save by hand. Only when every frame up to the top is on this site can the
  // page read their sandboxes, and skip the dialog if none of them blocks downloads.
  const downloadsMayBeBlocked = (() => {
    try {
      for (let w = window; w !== w.top; w = w.parent) {
        const f = w.frameElement; // null when the page around it is another site's
        if (!f || (f.hasAttribute('sandbox') && !f.sandbox.contains('allow-downloads'))) return true;
      }
      return false;
    } catch (err) { return true; }
  })();

  function savePng(canvas, name) {
    canvas.toBlob((blob) => blob && downloadBlob(blob, name), 'image/png');
    if (!downloadsMayBeBlocked) return;
    els.saveImg.src = canvas.toDataURL('image/png');
    els.saveImg.alt = name;
    els.saveName.textContent = name;
    els.saveDialog.showModal();
  }

  els.saveClose.addEventListener('click', () => els.saveDialog.close());
  els.saveDialog.addEventListener('close', () => els.saveImg.removeAttribute('src'));

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
    state.art.dirty = true;
    if (state.tab === 'check') runCheck();
    els.busy.hidden = true;
  }

  function paint(canvas, rgba, w, h) {
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    syncOverlay(canvas);
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

  function readImage(file, done) {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      toast('That file is not an image. Choose a JPG, PNG or WebP photo.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      done(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('This image could not be opened. Try saving it as JPG or PNG first.');
    };
    img.src = url;
  }

  function loadFile(file) {
    readImage(file, (img) => {
      state.source = img;
      state.baseName = (file.name || 'portrait').replace(/\.[^.]+$/, '') || 'portrait';
      setSourceLabel(file.name || 'Pasted image', img.naturalWidth, img.naturalHeight, false);
      if (state.lines.length) {
        state.lines = [];
        updateLineButtons();
        toast('Reference lines cleared for the new photo');
      }
      if (state.art.isExample) setArt(null);
      prepareAndRun(true);
    });
  }

  function loadArtFile(file) {
    readImage(file, (img) => {
      setArt(img, file.name || 'Pasted painting', false);
      runSoon(0);
    });
  }

  // Loads whichever image the open tab is about
  const loadForTab = (file) => (state.tab === 'check' ? loadArtFile(file) : loadFile(file));

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
    els.dropHint.firstElementChild.textContent =
      state.tab === 'check' ? 'Drop your painting to check it' : 'Drop the portrait to load it';
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
    loadForTab(e.dataTransfer.files[0]);
  });
  window.addEventListener('paste', (e) => {
    const item = Array.from((e.clipboardData && e.clipboardData.items) || []).find((i) => i.type.startsWith('image/'));
    if (item) loadForTab(item.getAsFile());
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
      const suffix = {
        orig: 'original', value: 'three-value', block: 'color-blocks',
        artblock: 'my-painting-blocks', diff: 'accuracy-map',
      }[id];
      const after = id === 'diff' && relMode(state.art.cmp) ? '-after-shift' : '';
      savePng(withOverlay(els.canvases[id]), `${state.baseName}-${suffix}${after}.png`);
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
    const cmp = state.art.cmp;
    if (s.id === 'diff' && cmp) {
      // on the accuracy map, show the reference color against yours for the shape
      const i = s.y * s.w + s.x;
      const region = cmp.regions[cmp.comp[i]];
      const prep = state.art.prep;
      const mask = prep && prep.mask;
      const rel = relMode(cmp);
      if (!region.ref || (mask && !mask[i])) {
        const glare = prep && prep.glare && prep.glare[i];
        els.loupeChip.style.background = 'transparent';
        els.loupeHex.textContent = glare ? 'Glare' : 'Not covered';
        els.loupeVal.textContent = 'left out';
      } else {
        // after the overall shift, the reference color is the one the shift moved
        els.loupeChip.style.background = `linear-gradient(90deg, ${toHex(rel ? region.exp : region.ref)} 50%, ${toHex(region.art)} 50%)`;
        els.loupeHex.textContent = (rel ? region.pctRel : region.pct) + '% match';
        els.loupeVal.textContent = rel ? `ΔE ${region.dErel.toFixed(1)} after shift` : 'ΔE ' + region.dE.toFixed(1);
      }
    } else {
      els.loupeChip.style.background = hex;
      els.loupeHex.textContent = hex;
      els.loupeVal.textContent = 'V ' + valueLabel(Study.lightnessOf(s.r, s.g, s.b));
    }
    if (state.drawing) els.loupeVal.textContent = 'Tilt ' + lineAngle(state.drawing, s.w, s.h) + '°';
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

  // Image position under the pointer in 0-1 coordinates, kept inside the image
  function pointOn(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  // Shift snaps the line to 15° steps. Near the edge the line is shortened, not bent, to stay inside.
  function snapLine(line, w, h) {
    const dx = (line.x2 - line.x1) * w, dy = (line.y2 - line.y1) * h;
    let len = Math.hypot(dx, dy);
    const step = Math.PI / 12;
    const ang = Math.round(Math.atan2(dy, dx) / step) * step;
    const ux = Math.cos(ang) / w, uy = Math.sin(ang) / h; // image fraction per pixel of length
    if (ux > 1e-9) len = Math.min(len, (1 - line.x1) / ux);
    if (ux < -1e-9) len = Math.min(len, -line.x1 / ux);
    if (uy > 1e-9) len = Math.min(len, (1 - line.y1) / uy);
    if (uy < -1e-9) len = Math.min(len, -line.y1 / uy);
    line.x2 = Math.max(0, Math.min(1, line.x1 + ux * len));
    line.y2 = Math.max(0, Math.min(1, line.y1 + uy * len));
  }

  // Tilt from horizontal in degrees (-89 to 90, positive rises to the right), measured on the image
  function lineAngle(line, w, h) {
    let deg = (Math.atan2(-(line.y2 - line.y1) * h, (line.x2 - line.x1) * w) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg <= -90) deg += 180;
    return Math.round(deg);
  }

  document.querySelectorAll('canvas.view').forEach((canvas) => {
    let down = null;
    canvas.addEventListener('pointermove', (e) => {
      const d = state.drawing;
      if (d && d.canvas === canvas) {
        const pt = pointOn(canvas, e);
        d.x2 = pt.x;
        d.y2 = pt.y;
        if (e.shiftKey) snapLine(d, canvas.width, canvas.height);
        drawAllOverlays();
        // the loupe follows the line's end; at the right or bottom edge that is the last pixel, not one past it
        const rect = canvas.getBoundingClientRect();
        const fx = Math.min(d.x2, 1 - 0.5 / canvas.width), fy = Math.min(d.y2, 1 - 0.5 / canvas.height);
        showLoupeFor(canvas, { clientX: rect.left + fx * rect.width, clientY: rect.top + fy * rect.height, pointerType: e.pointerType });
        return;
      }
      if (e.pointerType === 'touch' && !down) return;
      showLoupeFor(canvas, e);
    });
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch' || state.drawing) return;
      els.loupe.hidden = true;
      state.hover = null;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      down = { x: e.clientX, y: e.clientY };
      if (state.picking) return;
      if (state.tool === 'line') {
        if (!canvas.width) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const pt = pointOn(canvas, e);
        state.drawing = { canvas, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, color: state.lineColor };
        showLoupeFor(canvas, e);
        return;
      }
      if (e.pointerType === 'touch') showLoupeFor(canvas, e);
    });
    canvas.addEventListener('pointercancel', () => {
      down = null;
      if (state.drawing) { state.drawing = null; drawAllOverlays(); }
      els.loupe.hidden = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      const start = down;
      down = null;
      const d = state.drawing;
      if (d && d.canvas === canvas) {
        state.drawing = null;
        const len = Math.hypot((d.x2 - d.x1) * canvas.width, (d.y2 - d.y1) * canvas.height);
        if (len >= 4) {
          state.lines.push({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, color: d.color });
          updateLineButtons();
        }
        drawAllOverlays();
        if (e.pointerType === 'touch') els.loupe.hidden = true;
        return;
      }
      if (!start || e.button > 0) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const s = showLoupeFor(canvas, e);
      if (e.pointerType === 'touch') {
        hideTimer = setTimeout(() => { els.loupe.hidden = true; }, 1100);
      }
      if (state.picking) {
        if (canvas === els.canvases.art && s && moved < 10) pickNeutral(s);
        else if (moved < 10) toast('Click a white or gray spot on Your painting');
        return;
      }
      // the accuracy map's tints are not colors worth keeping; a line drag cancelled with Esc ends here too
      if (s && moved < 10 && s.id !== 'diff' && state.tool === 'sample') addColor(s);
    });
  });

  window.addEventListener('scroll', () => { if (state.hover) els.loupe.hidden = true; }, { passive: true });

  // ---- Palette ------------------------------------------------------------

  // The saved palette, or null if storage can't be read
  function readPalette() {
    try {
      const raw = localStorage.getItem(PALETTE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((c) => c && Number.isInteger(c.r)) : [];
    } catch (err) {
      return null;
    }
  }

  function loadPalette() {
    return readPalette() || [];
  }

  let paletteSaved = true;
  function savePalette() {
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(state.palette));
      paletteSaved = true;
    } catch (err) {
      /* storage unavailable: the palette still works for this visit */
      paletteSaved = false;
    }
  }

  // Another open copy of the page may have changed the saved palette: start each change from it
  function syncPalette() {
    const stored = paletteSaved && readPalette();
    if (stored) state.palette = stored;
  }

  window.addEventListener('storage', (e) => {
    if (e.key !== PALETTE_KEY && e.key !== null) return;
    syncPalette();
    renderPalette();
  });

  function addColor(c, quiet) {
    syncPalette();
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
        const focused = document.activeElement === remove;
        syncPalette();
        state.palette = state.palette.filter((p) => toHex(p) !== hex);
        savePalette();
        renderPalette();
        // keep keyboard focus in the palette: the next remove button, the one before, or the heading
        if (focused) {
          const rest = els.swatches.querySelectorAll('.swatch-remove');
          (rest[Math.min(index, rest.length - 1)] || els.palTitle).focus();
        }
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
    syncPalette();
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
    savePng(c, `${state.baseName}-palette.png`);
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
    // the blur fades the outermost pixels out; keep their color but make them opaque, or
    // prepare() would mix that fringe with the gray it puts behind transparent areas
    const soft = o.getImageData(0, 0, W, H);
    for (let i = 3; i < soft.data.length; i += 4) soft.data[i] = 255;
    o.putImageData(soft, 0, 0);
    return out;
  }

  // ---- Grid and reference lines --------------------------------------------

  const overlayOf = (canvas) => canvas.nextElementSibling;

  // Draws the grid and lines into a context of size W x H. `unit` is one line-width step in pixels.
  function drawOverlayContent(g, W, H, unit) {
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    if (state.grid) {
      const n = state.grid;
      g.beginPath();
      for (let k = 1; k < n; k++) {
        const x = Math.round((k * W) / n) + 0.5, y = Math.round((k * H) / n) + 0.5;
        g.moveTo(x, 0); g.lineTo(x, H);
        g.moveTo(0, y); g.lineTo(W, y);
      }
      g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      g.lineWidth = 3 * unit;
      g.stroke();
      g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      g.lineWidth = 1.25 * unit;
      g.stroke();
    }
    const lines = state.drawing ? state.lines.concat(state.drawing) : state.lines;
    lines.forEach((l) => {
      const x1 = l.x1 * W, y1 = l.y1 * H, x2 = l.x2 * W, y2 = l.y2 * H;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      g.lineWidth = 4.5 * unit;
      g.stroke();
      g.strokeStyle = l.color;
      g.lineWidth = 2.5 * unit;
      g.stroke();
      g.fillStyle = l.color;
      [[x1, y1], [x2, y2]].forEach(([x, y]) => {
        g.beginPath();
        g.arc(x, y, 3.2 * unit, 0, Math.PI * 2);
        g.fill();
      });
    });
  }

  // Keeps the overlay canvas exactly on top of its image and redraws it
  function syncOverlay(canvas) {
    const o = overlayOf(canvas);
    if (!o) return;
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    o.style.left = canvas.offsetLeft + 'px';
    o.style.top = canvas.offsetTop + 'px';
    o.style.width = w + 'px';
    o.style.height = h + 'px';
    if (!w || !h || !canvas.width) {
      o.width = o.height = 0;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (o.width !== W || o.height !== H) { o.width = W; o.height = H; }
    drawOverlayContent(o.getContext('2d'), W, H, dpr);
  }

  function drawAllOverlays() {
    Object.values(els.canvases).forEach(syncOverlay);
  }

  // A copy of an image with the grid and lines burned in, for saving
  function withOverlay(canvas) {
    if (!state.grid && !state.lines.length) return canvas;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const g = out.getContext('2d');
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    drawOverlayContent(layer.getContext('2d'), layer.width, layer.height, Math.max(1, Math.max(canvas.width, canvas.height) / 500));
    g.drawImage(canvas, 0, 0);
    g.drawImage(layer, 0, 0);
    return out;
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((en) => {
        const canvas = en.target.classList.contains('view') ? en.target : en.target.querySelector('canvas.view');
        if (canvas) syncOverlay(canvas);
      });
    });
    document.querySelectorAll('canvas.view, .matte').forEach((el) => ro.observe(el));
  } else {
    window.addEventListener('resize', drawAllOverlays);
  }

  function updateLineButtons() {
    els.lineUndo.disabled = els.lineClear.disabled = state.lines.length === 0;
  }

  document.querySelectorAll('input[name="grid"]').forEach((el) =>
    el.addEventListener('change', () => { state.grid = +el.value; drawAllOverlays(); })
  );
  document.querySelectorAll('input[name="tool"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.tool = el.value;
      document.body.classList.toggle('tool-line', state.tool === 'line');
      els.toolHint.textContent = state.tool === 'line'
        ? 'Drag on any image to draw a line. It appears on every image. Hold Shift to snap to 15°. The loupe shows the angle.'
        : 'Hover to sample a color. Click to add it to the palette.';
    })
  );
  document.querySelectorAll('input[name="lineColor"]').forEach((el) =>
    el.addEventListener('change', () => { state.lineColor = el.value; })
  );
  els.lineUndo.addEventListener('click', () => {
    state.lines.pop();
    updateLineButtons();
    drawAllOverlays();
  });
  els.lineClear.addEventListener('click', () => {
    state.lines = [];
    updateLineButtons();
    drawAllOverlays();
  });
  window.addEventListener('keydown', (e) => {
    // the save dialog is modal: Esc only closes it, and nothing behind it should change
    if (els.saveDialog.open) return;
    if (e.key === 'Escape' && state.picking) setPicking(false);
    if (e.key === 'Escape' && state.drawing) {
      state.drawing = null;
      els.loupe.hidden = true;
      drawAllOverlays();
    }
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName) &&
      document.activeElement.type !== 'radio' && document.activeElement.type !== 'range';
    // Ctrl/⌘+Z only: with Shift (or Alt) it is redo, which has nothing to redo here
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && state.lines.length && !typing) {
      e.preventDefault();
      els.lineUndo.click();
    }
  });

  // ---- Tabs ---------------------------------------------------------------

  function switchTab(name, focus) {
    state.tab = name;
    if (name !== 'check') setPicking(false); // picking a neutral spot only works on Your painting
    Object.entries(els.tabs).forEach(([key, btn]) => {
      const on = key === name;
      btn.setAttribute('aria-selected', on);
      btn.tabIndex = on ? 0 : -1;
      els.tabPanels[key].hidden = !on;
      if (on && focus) btn.focus();
    });
    if (name === 'check' && state.art.dirty) runCheck();
    drawAllOverlays();
  }

  Object.entries(els.tabs).forEach(([key, btn]) => {
    btn.addEventListener('click', () => switchTab(key));
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      switchTab(key === 'study' ? 'check' : 'study', true);
    });
  });

  // ---- Check my painting --------------------------------------------------

  function setArt(img, name, isExample) {
    Object.assign(state.art, { source: img, name: name || '', isExample: !!isExample, key: '', prep: null, cmp: null, dirty: true, gains: [1, 1, 1] });
    resetAlign();
    setPicking(false);
    updateColorFix();
    els.artSource.textContent = '';
    if (!img) {
      els.artSource.textContent = 'Load a photo of your finished painting to score it against the reference.';
      return;
    }
    const strong = document.createElement('strong');
    strong.textContent = isExample ? 'Example painting' : name;
    els.artSource.append(strong, isExample
      ? ' · a made-up attempt at the sample: lifted shadows, warmer skin, a muddy lit cheek, a little glare on the wet hair, and photographed slightly tilted. See Overall for the shift, line it up below to see the score change, or load your own to replace it.'
      : ` · ${img.naturalWidth || img.width} × ${img.naturalHeight || img.height} px`);
  }

  const align = () => ({
    x: +els.alignX.value, y: +els.alignY.value, scale: +els.alignScale.value, rot: +els.alignRot.value,
  });
  const isIdentity = (a) => !a.x && !a.y && a.scale === 100 && !a.rot;

  // Fits the painting to the reference's exact size (crop or stretch), then applies the
  // user's move / size / rotate and color fix. Pixels it no longer covers go in a mask, and
  // so do spots of glare unless the student wants them scored.
  function alignArt() {
    const { w, h } = state.prep;
    const src = state.art.source;
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const a = align();
    const place = (g) => {
      g.translate(w / 2 + (a.x / 100) * w, h / 2 + (a.y / 100) * h);
      g.rotate((a.rot * Math.PI) / 180);
      g.scale(a.scale / 100, a.scale / 100);
    };

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#7f7f7f';
    g.fillRect(0, 0, w, h);
    g.save();
    place(g);
    g.imageSmoothingQuality = 'high';
    if (els.artFit.value === 'stretch') {
      g.drawImage(src, -w / 2, -h / 2, w, h);
    } else {
      const scale = Math.max(w / sw, h / sh);
      const cw = w / scale, ch = h / scale;
      g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, -w / 2, -h / 2, w, h);
    }
    g.restore();

    const gains = state.art.gains;
    let photo = null;
    if (gains.some((v) => v !== 1)) {
      const img = g.getImageData(0, 0, w, h);
      photo = img.data.slice();
      Study.applyGains(img.data, gains);
      g.putImageData(img, 0, 0);
    }

    let mask = null;
    if (!isIdentity(a)) {
      const m = document.createElement('canvas');
      m.width = w;
      m.height = h;
      const mg = m.getContext('2d', { willReadFrequently: true });
      mg.save();
      place(mg);
      mg.fillStyle = '#fff';
      mg.fillRect(-w / 2, -h / 2, w, h);
      mg.restore();
      const md = mg.getImageData(0, 0, w, h).data;
      mask = new Uint8Array(w * h);
      for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4 + 3] > 250 ? 1 : 0;
    }

    const prep = Study.prepare(c, Math.max(w, h));
    const glare = els.glare.checked ? Study.glareMask(prep, state.prep, mask) : null;
    if (glare && glare.mask) {
      if (!mask) mask = new Uint8Array(w * h).fill(1);
      for (let i = 0; i < mask.length; i++) if (glare.mask[i]) mask[i] = 0;
    }
    prep.mask = mask;
    prep.glare = glare && glare.mask;
    prep.glareShare = glare ? glare.count / (w * h) : 0;
    prep.glareCrowded = !!(glare && glare.crowded);
    // the photo before the color fix, where a neutral spot is picked (a channel the fix pushed
    // past white can't be undone from the fixed pixels)
    prep.photo = photo || prep.rgba;
    return prep;
  }

  // Shows the painting, with the reference faded on top while lining up
  function repaintArt() {
    const canvas = els.canvases.art;
    const prep = state.art.prep;
    if (!prep || canvas.width !== prep.w) return;
    const g = canvas.getContext('2d');
    g.putImageData(new ImageData(prep.rgba, prep.w, prep.h), 0, 0);
    const alpha = +els.onion.value / 100;
    if (alpha > 0) {
      g.globalAlpha = alpha;
      g.drawImage(els.canvases.orig, 0, 0);
      g.globalAlpha = 1;
    }
  }

  let checkTimer = 0;
  function checkSoon() {
    els.busy.hidden = false;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => { runCheck(); els.busy.hidden = true; }, 120);
  }

  function runCheck() {
    state.art.dirty = false;
    const ready = !!(state.art.source && state.result);
    els.checkEmpty.hidden = ready;
    els.checkBody.hidden = !ready;
    els.checkPanels.hidden = !ready;
    els.alignPanel.hidden = !ready;
    if (!ready) return;

    const a = align();
    const key = [state.prep.w, state.prep.h, els.artFit.value, a.x, a.y, a.scale, a.rot, state.art.gains.join(','), els.glare.checked].join(':');
    if (state.art.key !== key || state.art.prepFor !== state.prep) {
      state.art.prep = alignArt();
      state.art.key = key;
      state.art.prepFor = state.prep;
    }
    const artRes = Study.process(state.art.prep, settings());
    const cmp = Study.compare(state.prep, state.result, state.art.prep, artRes);
    state.art.result = artRes;
    state.art.cmp = cmp;

    const { w, h } = state.prep;
    paint(els.canvases.refblock, state.result.blockImage, w, h);
    paint(els.canvases.art, state.art.prep.rgba, w, h);
    repaintArt();
    paint(els.canvases.artblock, artRes.blockImage, w, h);
    state.pixels.refblock = state.result.blockImage;
    state.pixels.art = state.art.prep.rgba;
    state.pixels.artblock = artRes.blockImage;
    state.pixels.diff = cmp.diffImage;
    renderScore(cmp);
    renderOverall(cmp);
    showShiftMode();
    if (state.toOverall) {
      state.toOverall = false;
      els.overall.scrollIntoView({ block: 'start' });
    }
  }

  // After the overall shift, when there is a shift to set aside
  const relMode = (cmp) => !!(cmp && cmp.global) && state.shiftMode === 'rel';

  // The accuracy map and the list of differences, as photographed or after the overall shift
  function showShiftMode() {
    const cmp = state.art.cmp;
    if (!cmp) return;
    // with no overall shift to set aside, show the shapes as photographed, but keep the choice
    // for when there is one again
    const rel = relMode(cmp);
    els.modeRel.disabled = !cmp.global;
    els.modeRel.checked = rel;
    els.modeRaw.checked = !rel;
    const { w, h } = state.prep;
    paint(els.canvases.diff, cmp.diffImage, w, h);
    drawLabels(els.canvases.diff, cmp, rel);
    renderFixes(cmp, rel);
    els.diffNote.textContent = rel ? '· after overall shift' : '';
    els.diffHint.textContent = rel
      ? 'Each color zone shows how closely your painting matches it once your overall shift is set aside, so a low number is a local mistake. White labels are the biggest of them, numbered as in the list. Hover a zone to compare the color the shift predicts with yours.'
      : 'Each color zone shows how closely your painting matches it: 100% is an exact match, and each point of ΔE costs 2.5%. White labels are the biggest differences, numbered as in the list. Hover a zone to compare the two colors.';
  }

  // Match percentage on each shape of the accuracy map. The biggest differences get a
  // white label with their number from the list; shapes too small for a label stay bare.
  function drawLabels(canvas, cmp, rel) {
    const g = canvas.getContext('2d');
    const long = Math.max(canvas.width, canvas.height);
    const minFont = Math.round(long / 60);
    const maxFont = Math.round(long / 26);
    const top = rel ? cmp.topRel : cmp.top;
    const pct = (reg) => (rel ? reg.pctRel : reg.pct);
    const rank = new Set(top.map((r) => r.id));

    const pill = (reg, text, font, strong) => {
      g.font = `600 ${font}px "IBM Plex Mono", ui-monospace, monospace`;
      const pw = g.measureText(text).width + font * 0.9;
      const ph = font * 1.45;
      // keep the whole label inside the picture
      const pad = 3;
      const x = Math.max(pad, Math.min(canvas.width - pw - pad, reg.lx + 0.5 - pw / 2));
      const y = Math.max(pad, Math.min(canvas.height - ph - pad, reg.ly + 0.5 - ph / 2));
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, pw, ph, ph / 2);
      else g.rect(x, y, pw, ph);
      g.fillStyle = strong ? '#ffffff' : 'rgba(20, 21, 24, 0.78)';
      g.fill();
      if (strong) {
        g.lineWidth = Math.max(1.5, font / 7);
        g.strokeStyle = '#1c1d20';
        g.stroke();
      }
      g.fillStyle = strong ? '#1c1d20' : '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, x + pw / 2, y + ph / 2 + font * 0.05);
    };

    cmp.regions.forEach((reg) => {
      if (!reg.ref || rank.has(reg.id)) return;
      const font = Math.min(maxFont, Math.floor(reg.room / 1.5));
      if (font >= minFont) pill(reg, pct(reg) + '%', font, false);
    });
    top.forEach((reg, i) => {
      const font = Math.max(minFont, Math.min(maxFont, Math.floor(reg.room / 1.9)));
      pill(reg, `${i + 1} · ${pct(reg)}%`, font, true);
    });
  }

  // In words. `residual` describes what is left after the overall shift: the shape against
  // the rest of the painting rather than against the reference as photographed.
  function describe(reg, residual) {
    const dL = residual ? reg.dLrel : reg.dL;
    const dWarm = residual ? reg.dWarmRel : reg.dWarm;
    const dC = residual ? reg.dCrel : reg.dC;
    const dTint = residual ? reg.dTintRel : reg.dTint;
    const parts = [];
    if (Math.abs(dL) >= 3) parts.push(`${dL > 0 ? 'too light' : 'too dark'} by ${Math.abs(dL / 10).toFixed(1)} value`);
    if (Math.abs(dWarm) >= 4) parts.push(dWarm > 0 ? 'too warm' : 'too cool');
    if (Math.abs(dC) >= 5) parts.push(dC > 0 ? 'too saturated' : 'too gray');
    // neither warmer nor cooler, but off toward green or magenta
    if (!parts.length) parts.push(Math.abs(dTint) >= 4 ? (dTint > 0 ? 'too magenta' : 'too green') : 'hue is off');
    const text = parts.join(', ') + (residual ? ' for the rest of your painting' : '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Glare share as a short percentage
  const sharePct = (v) => (v < 0.001 ? 'under 0.1%' : (v * 100).toFixed(1) + '%');

  function renderScore(cmp) {
    els.scoreColor.textContent = cmp.colorScore;
    els.scoreGrade.textContent =
      cmp.colorScore >= 90 ? 'Very close to the reference'
        : cmp.colorScore >= 75 ? 'Close, with a few shapes off'
          : cmp.colorScore >= 60 ? 'Several shapes are off'
            : 'Far from the reference';
    const g = cmp.global;
    els.scoreRel.textContent = g ? g.relScore : '–';
    const cost = g ? g.relScore - cmp.colorScore : 0;
    els.scoreRelNote.textContent = !g
      ? (cmp.fitProblem === 'unrelated' ? 'Your values don’t follow the reference’s pattern yet' : 'Needs 8 or more shapes to measure')
      : cost >= SHIFT_WORTH ? `The overall shift costs ${cost} points`
        : 'Hardly any overall shift to set aside';
    els.scoreValue.textContent = cmp.valueScore;
    els.meterValue.style.width = cmp.valueScore + '%';
    els.scoreShapes.textContent = cmp.shapeMatch + '%';
    const glare = state.art.prep.glareShare || 0;
    const left = Math.round((1 - cmp.coverage - glare) * 100);
    const moved = !isIdentity(align());
    const fixed = state.art.gains.some((v) => v !== 1);
    els.alignState.textContent = [
      moved ? `moved${left ? `, ${left}% of picture left out` : ''}` : '',
      fixed ? 'color cast fixed' : '',
      glare ? `${sharePct(glare)} glare ignored` : '',
    ].filter(Boolean).join(' · ');
    els.meterShapes.style.width = cmp.shapeMatch + '%';
    els.glareStatus.textContent = !els.glare.checked ? 'Glare is scored like paint.'
      : glare ? `${sharePct(glare)} of the picture ignored as glare, hatched on the accuracy map. Small spots seldom change a score, as each shape is judged by its most prominent color.`
        : state.art.prep.glareCrowded ? 'The white spots cover too much of the picture to be glare, so they are scored like paint.'
          : 'No glare found.';
  }

  // The biggest differences, as photographed or after the overall shift. After the shift the
  // left swatch is the reference color moved by the shift: what the shape would be if it
  // followed the rest of the painting.
  function renderFixes(cmp, rel) {
    els.fixHint.textContent = rel
      ? 'Each shape against the color your overall shift predicts for it (left swatch), so what is left are local mistakes.'
      : cmp.global ? 'Each shape against the reference as it is. A note repeated on many shapes is usually one overall shift: see Overall, or switch to After overall shift.'
        : cmp.fitProblem === 'unrelated' ? 'Each shape against the reference as it is. There is no one overall shift to set aside yet.'
          : 'Each shape against the reference as it is. After overall shift needs 8 or more shapes of a useful size: raise Colors per value.';
    const list = rel ? cmp.topRel : cmp.top;
    els.fixList.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'fix-none';
      li.textContent = rel ? 'Once the overall shift is set aside, every large shape is within ΔE 5.' : 'Every large shape is within ΔE 5 of the reference.';
      els.fixList.append(li);
      return;
    }
    list.forEach((reg, i) => {
      const from = rel ? reg.exp : reg.ref;
      const li = document.createElement('li');
      li.className = 'fix';
      const num = document.createElement('span');
      num.className = 'fix-num';
      num.textContent = i + 1;
      const sw = document.createElement('span');
      sw.className = 'fix-swatches';
      const a = document.createElement('span');
      a.style.background = toHex(from);
      a.title = rel ? `Expected after your overall shift ${toHex(from)}` : `Reference ${toHex(from)}`;
      const b = document.createElement('span');
      b.style.background = toHex(reg.art);
      b.title = `Yours ${toHex(reg.art)}`;
      sw.append(a, b);
      const text = document.createElement('span');
      text.className = 'fix-text';
      const strong = document.createElement('strong');
      strong.textContent = describe(reg, rel);
      const small = document.createElement('small');
      const pct = rel ? `${reg.pctRel}% match after shift` : `${reg.pct}% match`;
      const dE = rel ? reg.dErel : reg.dE;
      small.textContent = `${pct} · ${ZONE_NAMES[reg.zone]} shape · ${(reg.share * 100).toFixed(1)}% of picture · ΔE ${dE.toFixed(1)} · ${toHex(from)} → ${toHex(reg.art)}`;
      text.append(strong, small);
      li.append(num, sw, text);
      els.fixList.append(li);
    });
  }

  // ---- Overall: value range, key and temperature ----------------------------

  // One tip per finding
  const TIPS = {
    anchorDark: 'Put your darkest dark down early as an anchor, and judge every other dark against it.',
    anchorLight: 'Mix your lightest light early, and judge every other light against it. If the painting looks right in person, the photo is too dark: shoot it again in even light.',
    lightsHigh: 'Save your lightest light for the few places that need it. If the painting looks right in person, the photo is too bright: shoot it again in even light.',
    darksLow: 'Keep your darkest dark for the few accents that need it: most shadows in the reference are lighter than that.',
    anchorBoth: 'Find the darkest dark and the lightest light first, and fit every other value between them.',
    expanded: 'Squint at the reference to find its darkest dark and lightest light, and keep your values between them.',
    lighter: 'Judge each value against its neighbours, not against the paint on your palette. If the painting looks right in person, the photo is too bright: shoot it again in even light.',
    darker: 'Judge each value against its neighbours, not against the paint on your palette. If the painting looks right in person, the photo is too dark: shoot it again in even light.',
    warmer: 'Hold each mix up next to the reference to compare temperature. If the painting looks right in person, the light in your photo is warm: try Fix color cast above.',
    cooler: 'Hold each mix up next to the reference to compare temperature. If the painting looks right in person, the light in your photo is cool: try Fix color cast above.',
    green: 'Hold each mix up next to the reference: a touch of red or orange takes the green out of it. If the painting looks right in person, the light in your photo is green, as under fluorescent tubes: try Fix color cast above.',
    magenta: 'Hold each mix up next to the reference: a touch of yellow or green takes the pink out of it. If the painting looks right in person, your photo has a magenta tint: try Fix color cast above.',
    cast: 'Check the painting in daylight first. If it looks right there, click Fix color cast above and then a white or gray spot on the painting.',
    saturated: 'Skin is grayer than it looks. Knock strong mixes down with a gray of the same value, or a touch of the complement.',
    grayer: 'White and black dull a color as they lighten or darken it. Reach for a lighter or darker pigment of the same hue instead.',
    hue: 'Compare each mix with the reference side by side, and nudge its hue back before you judge its value.',
    separation: 'Squint until only light and shadow are left. Keep every shadow note darker than every light note, and model the form inside each family.',
    harsh: 'Look for the halftones where the form turns away from the light: in the reference they bridge light and shadow.',
    temperature: 'Keep the temperature change at the shadow line: under warm light the shadows turn cooler, under cool light warmer. Compare a light note and a shadow note side by side.',
  };
  const MIN_POINTS = 1.5;   // findings worth fewer points are noise
  const SHIFT_WORTH = 2;    // an overall shift costing fewer points is hardly worth setting aside
  const LINEUP_GAIN = 0.02; // a nudge that fits this much better means the photo isn't lined up

  const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const joinAnd = (parts) => (parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]);
  // Values as the rulers' labels round them, and differences of those, so that every number in
  // the words is one a student can read off the rulers
  const vDiff = (a, b) => Math.round((valueLabel(a) - valueLabel(b)) * 10) / 10;
  const spanOf = (s) => vDiff(s.p98, s.p2);
  const by = (d) => Math.abs(d).toFixed(1);

  /*
   * The value part of the overall shift in words: the range, read off the ends of the bars,
   * when it grew or shrank; otherwise the key, read off the ticks of the three masses. ref and
   * art are Study.valueStats() of the two pictures. Null when the rulers show no change.
   */
  function valueFinding(g, ref, art) {
    const spanRef = spanOf(ref), spanArt = spanOf(art);
    const dark = vDiff(art.p2, ref.p2), light = vDiff(art.p98, ref.p98);
    // each mass's move, and the whole picture's as their average over the reference's masses
    const masses = [[0, 'darks'], [1, 'middle values'], [2, 'lights']]
      .filter(([z]) => ref.median[z] != null && art.median[z] != null)
      .map(([z, name]) => ({ name, d: vDiff(art.median[z], ref.median[z]), share: ref.share[z] }));
    const key = Math.round(masses.reduce((sum, m) => sum + m.d * m.share, 0) * 10) / 10;
    // darkest dark and lightest light moved the same way: the key (or the photo's exposure)
    const together = Math.min(Math.abs(dark), Math.abs(light)) >= 0.3 && Math.sign(dark) === Math.sign(light) && Math.sign(dark) === Math.sign(key);
    const rangeOff = Math.abs(spanArt - spanRef);
    // The slope of the fitted value line says whether the range changed (a local mistake can
    // move the ends of a bar on its own), and the bars say by how much
    const kind = together ? 'key'
      : Math.abs(g.range - 1) >= 0.1 && rangeOff >= 0.3 ? 'range'
        : key ? 'key'
          : rangeOff ? 'range' : '';
    if (kind === 'range') {
      const end = (d, name) => (!d ? `your ${name} matches`
        : Math.abs(d) < 0.3 ? `your ${name} is within ${by(d)}`
          : `your ${name} is ${by(d)} too ${d > 0 ? 'light' : 'dark'}`);
      const darkOff = dark >= 0.3, lightOff = light <= -0.3;
      return {
        title: `Your values span ${spanArt.toFixed(1)} steps; the reference spans ${spanRef.toFixed(1)}.`,
        detail: capital(end(dark, 'darkest dark')) + ', and ' + end(light, 'lightest light') + '.',
        tip: spanArt > spanRef
          ? (light >= 0.3 && dark > -0.3 ? TIPS.lightsHigh : dark <= -0.3 && light < 0.3 ? TIPS.darksLow : TIPS.expanded)
          : darkOff && !lightOff ? TIPS.anchorDark : lightOff && !darkOff ? TIPS.anchorLight : TIPS.anchorBoth,
        points: g.points.value,
      };
    }
    if (kind === 'key') {
      const move = (m) => (m.d ? `your ${m.name} are ${by(m.d)} too ${m.d > 0 ? 'light' : 'dark'}` : `your ${m.name} match`);
      return {
        title: `Your whole picture is ${by(key)} value ${key > 0 ? 'lighter' : 'darker'} than the reference.`,
        detail: capital(joinAnd(masses.map(move))) + '.',
        tip: key > 0 ? TIPS.lighter : TIPS.darker,
        points: g.points.value,
      };
    }
    return null;
  }

  // A move of every color, named by the way it points: warm and cool along the orange-blue
  // axis, green and magenta at right angles to it, and the four between. Sectors of 45° by the
  // angle from warm, from -180° round through magenta, warm and green to 180° (cool at both
  // ends), each with the key of its tip.
  const MOVES = [
    ['cooler', 'cooler'], ['cooler and more violet', 'cooler'], ['more magenta', 'magenta'], ['warmer and redder', 'warmer'],
    ['warmer', 'warmer'], ['warmer and yellower', 'warmer'], ['greener', 'green'], ['cooler and greener', 'green'], ['cooler', 'cooler'],
  ];
  const moveName = (warm, tint) => MOVES[Math.round(Math.atan2(-tint, warm) / (Math.PI / 4)) + 4];

  /*
   * The color part of the overall shift in words: warmer, cooler, greener, more magenta or
   * a mix of two (see MOVES), more saturated or grayer, and hues turned, as far as most shapes
   * share them. When no part is big enough to mention, the biggest is still named as
   * "slightly", so a shift that costs points always has words. A monochrome study gets a note
   * instead: its color is set aside.
   */
  function colorFinding(g) {
    if (g.mono) {
      return {
        title: 'Your study is monochrome, so its color is set aside.',
        detail: 'Color accuracy counts the color it doesn’t have. Relationships and After overall shift take the color out of the reference too, so they compare your values only.',
        tip: '',
        points: g.points.color,
        always: true,
      };
    }
    // each part, sized against the change worth a mention
    const [moveWords, moveTip] = moveName(g.warmShift, g.tint);
    const parts = [
      { key: moveTip, size: Math.hypot(g.warmShift, g.tint) / 3, move: true },
      { key: g.sat > 1 ? 'saturated' : 'grayer', size: Math.abs(g.sat - 1) / 0.12 },
      { key: 'hue', size: Math.abs(g.hueRot) / 8 },
    ];
    let named = parts.filter((q) => q.size >= 1);
    // under a color cast, the turn and scale that come with it are part of the cast, not news
    if (g.cast && named.some((q) => q.move)) named = named.filter((q) => q.move);
    const slight = !named.length;
    if (slight) named = [parts.reduce((a, b) => (b.size > a.size ? b : a))];
    if (!named[0].size) return null;
    const lead = named.reduce((a, b) => (b.size > a.size ? b : a));

    const soft = slight ? 'slightly ' : '';
    const words = named.map((q) => {
      if (q.move) return soft + moveWords;
      if (q.key === 'hue') return `hues turned ${soft}toward ${g.hueRot > 0 ? 'yellow' : 'red'}`;
      const amount = slight ? 'slightly' : g.sat <= Study.SAT_RANGE[0] || g.sat >= Study.SAT_RANGE[1] ? 'much' : `about ${Math.round(Math.abs(g.sat - 1) * 20) * 5}%`;
      return `${amount} ${g.sat > 1 ? 'more saturated' : 'grayer'}`;
    });
    words[0] += ' overall';
    return {
      title: capital(joinAnd(words)) + '.',
      detail: g.cast
        ? 'Light colors moved more than dark ones, the way they do in a photo taken under colored light. It runs through most of your shapes, so the list below repeats it.'
        : 'It runs through most of your shapes, so the list below repeats it shape after shape until you switch to After overall shift.',
      tip: g.cast && lead.move ? TIPS.cast : TIPS[lead.key],
      points: g.points.color,
    };
  }

  /*
   * Up to three findings about the picture as a whole, ranked by the points of color accuracy
   * each one costs (from compare()). ref and art are Study.valueStats() of the two pictures:
   * they supply the numbers in the words, so the words match the rulers. cost is what the
   * whole overall shift costs (Relationships less Color accuracy).
   */
  function overallFindings(g, ref, art, misaligned, cost) {
    if (!g) return [];
    const p = g.points;
    const out = [];
    const known = (...v) => v.every((x) => x != null);

    // The shift itself, in value and in color. Each is named when it costs enough. When the note
    // under Relationships names a cost but neither part does on its own, the bigger is named
    // anyway, so the card always says what the shift is.
    const shift = [known(ref.p2, art.p2) ? valueFinding(g, ref, art) : null, colorFinding(g)].filter(Boolean);
    shift.forEach((f) => { if (f.points >= MIN_POINTS || f.always) out.push(f); });
    if (!out.length && cost >= SHIFT_WORTH && shift.length) out.push(shift.reduce((a, b) => (b.points > a.points ? b : a)));

    // Light and shadow: the gap between the two families, beyond what the overall value line explains
    // (a photo that isn't lined up mixes the families at every edge, so this waits until it is)
    if (!misaligned && p.separation >= MIN_POINTS && Math.abs(g.sepCreep) >= 2 && known(ref.shadowP90, ref.lightP10, art.shadowP90, art.lightP10)) {
      const gapRef = (ref.lightP10 - ref.shadowP90) / 10, gapArt = (art.lightP10 - art.shadowP90) / 10;
      const gap = (v) => (v >= 0.05 ? `a ${v.toFixed(1)}-value gap` : v <= -0.05 ? `an overlap of ${(-v).toFixed(1)} value` : 'no gap');
      const detail = `Between the lightest shadow and the darkest light, the reference has ${gap(gapRef)}; yours has ${gap(gapArt)}.`;
      if (g.sepCreep > 0) {
        out.push({ title: 'Your shadows creep into the light.', detail, tip: TIPS.separation, points: p.separation });
      } else {
        out.push({ title: 'Your turn from light into shadow is harsher than the reference’s.', detail, tip: TIPS.harsh, points: p.separation });
      }
    }

    // Temperature of the shadows against the lights
    if (p.temperature >= MIN_POINTS && g.tempContrast) {
      const [rc, ac] = g.tempContrast;
      const word = (c) => (c <= -3 ? 'cooler' : c >= 3 ? 'warmer' : 'same');
      const r = word(rc), a = word(ac);
      if (Math.abs(ac - rc) >= 3 && !(r === 'same' && a === 'same')) {
        const title = a !== r
          ? `Your shadows are ${a === 'same' ? 'as warm as' : a + ' than'} your lights; in the reference they are ${r === 'same' ? 'about the same' : r}.`
          : Math.abs(ac) > Math.abs(rc)
            ? `Your shadows are much ${a} than your lights, more than in the reference.`
            : `Your shadows are only a little ${a} than your lights; in the reference the change is stronger.`;
        out.push({
          title,
          detail: 'A change of temperature at the shadow line helps the light read as light, apart from value.',
          tip: TIPS.temperature,
          points: p.temperature,
        });
      }
    }
    return out.sort((x, y) => y.points - x.points).slice(0, 3);
  }

  // Position on an 11-chip value ruler (chip k is centred on V k), as a percentage of its width
  const rulerPos = (L) => ((Math.max(0, Math.min(100, L)) / 10 + 0.5) / 11) * 100;

  // One Munsell-style ruler: gray chips V 0-10, a bar from the darkest dark to the lightest light,
  // and a tick on the middle value of each mass. The painting's ruler is mirrored below the
  // reference's, so the two bars face each other across the connectors.
  function valueRuler(name, s, below) {
    const row = document.createElement('div');
    row.className = 'ov-row';
    const label = document.createElement('div');
    label.className = 'ov-label';
    const title = document.createElement('span');
    title.textContent = name;
    const span = document.createElement('span');
    span.className = 'ov-span';
    span.textContent = `V ${valueLabel(s.p2)} to ${valueLabel(s.p98)} · ${spanOf(s).toFixed(1)} steps`;
    label.append(title, span);

    const ruler = document.createElement('div');
    ruler.className = 'ov-ruler';
    const chips = document.createElement('div');
    chips.className = 'ov-chips';
    for (let v = 0; v <= 10; v++) {
      const chip = document.createElement('span');
      const g = Study.grayForL(v * 10);
      chip.style.background = `rgb(${g},${g},${g})`;
      chip.style.color = v < 5 ? '#ffffff' : '#1c1d20';
      chip.textContent = v;
      chips.append(chip);
    }
    const track = document.createElement('div');
    track.className = 'ov-track';
    const bar = document.createElement('span');
    bar.className = 'ov-bar';
    bar.style.left = rulerPos(s.p2) + '%';
    bar.style.width = rulerPos(s.p98) - rulerPos(s.p2) + '%';
    track.append(bar);
    ruler.append(...(below ? [track, chips] : [chips, track]));
    s.median.forEach((m) => {
      if (m == null) return;
      const tick = document.createElement('span');
      tick.className = 'ov-tick';
      tick.style.left = rulerPos(m) + '%';
      ruler.append(tick);
    });
    row.append(...(below ? [ruler, label] : [label, ruler]));
    return row;
  }

  // Thin lines from each mark on the reference's ruler to the same mark on yours
  function rulerLinks(ref, art) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ov-links');
    svg.setAttribute('viewBox', '0 0 100 10');
    svg.setAttribute('preserveAspectRatio', 'none');
    const join = (a, b, cls) => {
      if (a == null || b == null) return;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', rulerPos(a));
      line.setAttribute('x2', rulerPos(b));
      line.setAttribute('y1', 0);
      line.setAttribute('y2', 10);
      line.setAttribute('class', cls);
      svg.append(line);
    };
    join(ref.p2, art.p2, 'ov-link-end');
    join(ref.p98, art.p98, 'ov-link-end');
    ref.median.forEach((m, z) => join(m, art.median[z], 'ov-link'));
    return svg;
  }

  function renderOverall(cmp) {
    const { ref, art } = cmp.values;
    els.ovScales.innerHTML = '';
    els.ovMasses.innerHTML = '';
    if (ref.p2 == null || art.p2 == null) {
      els.ovScales.removeAttribute('aria-label');
      els.ovNudge.hidden = true;
      els.ovFindings.innerHTML = '';
      return;
    }
    els.ovScales.append(valueRuler('Reference', ref, false), rulerLinks(ref, art), valueRuler('Yours', art, true));
    els.ovScales.setAttribute('aria-label',
      `Value scales from V 0 to V 10. The reference runs from V ${valueLabel(ref.p2)} to V ${valueLabel(ref.p98)}, yours from V ${valueLabel(art.p2)} to V ${valueLabel(art.p98)}.`);
    ZONE_NAMES.forEach((name, z) => {
      if (ref.median[z] == null || art.median[z] == null) return;
      const item = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = name;
      const dd = document.createElement('dd');
      dd.textContent = `V ${valueLabel(ref.median[z])} → ${valueLabel(art.median[z])}`;
      item.append(dt, dd);
      els.ovMasses.append(item);
    });

    const misaligned = cmp.lineup.gain >= LINEUP_GAIN;
    els.ovNudge.hidden = !misaligned;

    els.ovFindings.innerHTML = '';
    const shiftCost = cmp.global ? cmp.global.relScore - cmp.colorScore : 0;
    const list = overallFindings(cmp.global, ref, art, misaligned, shiftCost);
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'ov-none';
      li.textContent = cmp.global
        ? (shiftCost >= SHIFT_WORTH
          ? `The overall shift costs ${shiftCost} points, spread too thinly over value and color to name one change.`
          : 'No overall shift worth fixing: your range, key and temperature follow the reference, so the differences below are local.')
        : cmp.fitProblem === 'unrelated'
          ? 'Your lights and darks don’t follow the reference’s pattern yet, so there is no one overall shift to measure. Block in the big shadow shapes first, or check that you loaded the right photo.'
          : 'Too few shapes to measure an overall shift: it needs 8 or more of a useful size. Raise Colors per value or lower Merge small shapes.';
      els.ovFindings.append(li);
      return;
    }
    list.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'ov-finding';
      const head = document.createElement('div');
      head.className = 'ov-finding-head';
      const strong = document.createElement('strong');
      strong.textContent = f.title;
      const cost = document.createElement('span');
      cost.className = 'ov-cost';
      const pts = Math.max(1, Math.round(f.points));
      cost.textContent = `costs ${pts} point${pts === 1 ? '' : 's'}`;
      head.append(strong, cost);
      const detail = document.createElement('p');
      detail.textContent = f.detail;
      li.append(head, detail);
      if (f.tip) {
        const tip = document.createElement('p');
        tip.className = 'ov-tip';
        const tryIt = document.createElement('b');
        tryIt.textContent = 'Try: ';
        tip.append(tryIt, f.tip);
        li.append(tip);
      }
      els.ovFindings.append(li);
    });
  }

  function updateAlignOutputs() {
    els.onionOut.value = els.onion.value + '%';
    const sign = (v) => (v > 0 ? '+' : '') + v;
    els.alignXOut.value = sign(+els.alignX.value) + '%';
    els.alignYOut.value = sign(+els.alignY.value) + '%';
    els.alignScaleOut.value = els.alignScale.value + '%';
    els.alignRotOut.value = sign(+els.alignRot.value) + '°';
  }

  function resetAlign() {
    els.alignX.value = 0;
    els.alignY.value = 0;
    els.alignScale.value = 100;
    els.alignRot.value = 0;
    updateAlignOutputs();
  }

  [els.alignX, els.alignY, els.alignScale, els.alignRot].forEach((el) =>
    el.addEventListener('input', () => { updateAlignOutputs(); checkSoon(); })
  );
  els.onion.addEventListener('input', () => { updateAlignOutputs(); repaintArt(); });
  els.glare.addEventListener('change', checkSoon);

  // click rather than change: picking As photographed while it is only showing as a fallback
  // (already checked) still counts as a choice
  document.querySelectorAll('input[name="shiftMode"]').forEach((el) =>
    el.addEventListener('click', () => { state.shiftMode = el.value; showShiftMode(); })
  );
  els.ovLineUp.addEventListener('click', () => {
    els.alignPanel.open = true;
    els.alignPanel.scrollIntoView({ block: 'start' });
    els.alignPanel.querySelector('summary').focus({ preventScroll: true });
  });
  els.alignReset.addEventListener('click', () => { resetAlign(); checkSoon(); });

  function setPicking(on) {
    state.picking = on;
    document.body.classList.toggle('picking-neutral', on);
    els.wbPick.classList.toggle('is-active', on);
    els.wbPick.textContent = on ? 'Click a white or gray spot… (Esc to cancel)' : 'Fix color cast';
  }

  function updateColorFix() {
    const fixed = state.art.gains.some((v) => v !== 1);
    els.wbUndo.hidden = !fixed;
  }

  // Colored light tints a white or gray from warm to cool and moves green in step with red and
  // blue: under daylight or an ordinary lamp, the fix needs a green gain of about red^0.6 x blue^0.4.
  // Most skin tones and browns are redder than that. So a spot counts as a tinted white or gray if
  // it is nearly gray already, whatever its tint, or if its fix keeps green within 10% of that, and
  // then only as far as ordinary light goes: up to 3x blue (a warm bulb the camera only partly
  // corrected), no channel halved, red or green at most doubled. Paper under a bare bulb with no
  // correction at all is as orange as orange paint, so the two can't be told apart; both are refused.
  const GAIN_LIMITS = [[1 / 2, 2], [1 / 2, 2], [1 / 2, 3]]; // red, green, blue
  const NEAR_GRAY = 12; // C*
  const tintedByLight = ([r, g, b]) =>
    Math.abs(Math.log(g) - 0.6 * Math.log(r) - 0.4 * Math.log(b)) <= Math.log(1.1);

  // Averages a 5 x 5 patch of the painting and makes that color neutral. The patch is read from the
  // photo as taken, so a new pick replaces any earlier fix and follows the same rules as a first one.
  function pickNeutral(s) {
    const data = state.art.prep && state.art.prep.photo;
    if (!data) return;
    let r = 0, g = 0, b = 0, k = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
        const p = (y * s.w + x) * 4;
        r += data[p]; g += data[p + 1]; b += data[p + 2]; k++;
      }
    }
    const patch = { r: Math.round(r / k), g: Math.round(g / k), b: Math.round(b / k) };
    const gains = Study.neutralGains(patch.r, patch.g, patch.b);
    if (!gains) {
      toast('That spot is too dark to judge. Pick a white or light gray area.');
      return;
    }
    const neutral = gains.every((v, i) => v >= GAIN_LIMITS[i][0] && v <= GAIN_LIMITS[i][1])
      && (Study.chromaOf(patch.r, patch.g, patch.b) <= NEAR_GRAY || tintedByLight(gains));
    if (!neutral) {
      toast(`${toHex(patch)} is too colorful to be white or gray. Pick paper or a neutral gray area.`);
      return;
    }
    setPicking(false);
    state.art.gains = gains;
    updateColorFix();
    toast(`Color cast removed: ${toHex(patch)} is now neutral`);
    checkSoon();
  }

  els.wbPick.addEventListener('click', () => setPicking(!state.picking));
  els.alignPanel.addEventListener('toggle', () => { if (!els.alignPanel.open) setPicking(false); });
  els.wbUndo.addEventListener('click', () => {
    state.art.gains = [1, 1, 1];
    updateColorFix();
    checkSoon();
  });

  els.artFile.addEventListener('change', () => {
    loadArtFile(els.artFile.files[0]);
    els.artFile.value = '';
  });
  els.artFit.addEventListener('change', () => { state.art.key = ''; if (state.tab === 'check') runSoon(0); });

  // A plausible student attempt at the sample: shadows lifted, colors warmer, edges softened,
  // one local mistake hiding under that overall shift, and a little glare
  function makeExamplePainting(src) {
    const W = src.width, H = src.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const small = document.createElement('canvas');
    small.width = Math.round(W / 5); small.height = Math.round(H / 5);
    small.getContext('2d').drawImage(src, 0, 0, small.width, small.height);
    g.imageSmoothingQuality = 'high';
    g.save();
    g.translate(W / 2 + 8, H / 2 - 5);
    g.rotate((2 * Math.PI) / 180);
    g.scale(1.03, 1.03);
    g.drawImage(small, -W / 2, -H / 2, W, H);
    g.restore();
    // the local mistake: the lit side of the face mixed too dark and muddy
    g.save();
    g.filter = 'blur(6px)';
    g.fillStyle = 'rgba(160, 120, 106, 0.7)';
    g.beginPath();
    g.ellipse(262, 318, 66, 80, 0.15, 0, Math.PI * 2);
    g.fill();
    g.restore();
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i] * 0.9 + 30;
      d[i + 1] = d[i + 1] * 0.88 + 18;
      d[i + 2] = d[i + 2] * 0.84 + 12;
    }
    g.putImageData(img, 0, 0);
    // glare: a few streaks where the wet paint of the hair caught the lamp
    g.save();
    g.filter = 'blur(0.7px)';
    g.fillStyle = 'rgba(253, 251, 247, 0.96)';
    [[392, 190, 15, 3, -0.45], [414, 222, 10, 2.5, -0.85], [276, 166, 9, 2.2, 0.15],
      [182, 430, 2.5, 12, 0.08], [190, 468, 2, 7, 0.05], [442, 458, 2.5, 11, -0.1]].forEach(([x, y, rx, ry, a]) => {
      g.beginPath();
      g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
      g.fill();
    });
    g.restore();
    return c;
  }

  // ---- Start --------------------------------------------------------------

  function start() {
    updateOutputs();
    renderPalette();
    updateLineButtons();
    state.source = paintSample();
    setSourceLabel('Sample study', 600, 750, true);
    setArt(makeExamplePainting(state.source), '', true);
    prepareAndRun(true);
    // #check opens the check tab, #overall also scrolls to the Overall card
    if (location.hash === '#check' || location.hash === '#overall') {
      state.toOverall = location.hash === '#overall';
      switchTab('check');
    }
  }

  const redrawHist = () => drawHistogram();
  window.addEventListener('resize', redrawHist);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', redrawHist);
  }
  // a host page can also switch theme with data-theme (or a class) on <html>
  if (window.MutationObserver) {
    new MutationObserver(redrawHist).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }

  start();
})();
