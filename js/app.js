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
    hatchFar: $('hatchFar'),
    hatchHint: $('hatchHint'),
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
    scoreValue: $('scoreValue'),
    scoreShapes: $('scoreShapes'),
    meterValue: $('meterValue'),
    meterShapes: $('meterShapes'),
    fixList: $('fixList'),
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
    showRecipes: $('showRecipes'),
    myPaints: $('myPaints'),
    paintDots: $('paintDots'),
    paintsState: $('paintsState'),
    paintPreset: $('paintPreset'),
    paintReset: $('paintReset'),
    paintList: $('paintList'),
    paintWarn: $('paintWarn'),
    paintAdd: $('paintAdd'),
    paintAddBtn: $('paintAddBtn'),
    paintName: $('paintName'),
    paintCode: $('paintCode'),
    paintHex: $('paintHex'),
    paintTintOn: $('paintTintOn'),
    paintTint: $('paintTint'),
    paintStrength: $('paintStrength'),
    mixCard: $('mixCard'),
    sheet: $('mixSheet'),
    sheetOpen: $('sheetOpen'),
    sheetTitle: $('sheetTitle'),
    sheetCount: $('sheetCount'),
    sheetIntro: $('sheetIntro'),
    sheetGroups: $('sheetGroups'),
    sheetCopy: $('sheetCopy'),
    sheetClose: $('sheetClose'),
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
    paintBlocks(true);
    state.pixels.value = r.valueImage;
    state.pixels.block = r.blockImage;
    renderZones();
    drawHistogram();
    renderSheet();
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
      savePng(withOverlay(els.canvases[id]), `${state.baseName}-${suffix}.png`);
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
      const mask = state.art.prep && state.art.prep.mask;
      if (!region.ref || (mask && !mask[i])) {
        els.loupeChip.style.background = 'transparent';
        els.loupeHex.textContent = 'Not covered';
        els.loupeVal.textContent = 'left out';
      } else {
        els.loupeChip.style.background = `linear-gradient(90deg, ${toHex(region.ref)} 50%, ${toHex(region.art)} 50%)`;
        els.loupeHex.textContent = region.pct + '% match';
        els.loupeVal.textContent = 'ΔE ' + region.dE.toFixed(1);
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
      if (state.mixing.show) li.append(recipeButton(c));
      els.swatches.append(li);
    });
    const n = list.length;
    els.palCount.textContent = n ? `${n} color${n === 1 ? '' : 's'}` : '';
    els.palEmpty.hidden = n > 0;
    if (!n) emptyHint();
    els.swatches.classList.toggle('has-recipes', state.mixing.show);
    els.palCopy.textContent = state.mixing.show ? 'Copy hex codes and recipes' : 'Copy hex codes';
    // the How-to-mix card follows its swatch's new recipe line, or closes when the line is gone
    if (state.mixing.card && !els.sheetGroups.contains(els.mixCard)) {
      const again = els.swatches.querySelector(`[data-recipe="${state.mixing.card}"]`);
      if (again) { state.mixing.cardFrom = again; syncExpanded(); } else closeMixCard();
    }
    [els.palSort, els.palCopy, els.palSave, els.palClear].forEach((b) => { b.disabled = n === 0; });
    if (!n) els.copyFallback.hidden = true;
  }

  // The empty palette points at recipes, or, once they are on, at how to get colors to mix
  function emptyHint() {
    const strong = document.createElement('strong');
    els.palEmpty.textContent = 'Hover any image to sample a color, then click to add it here. ';
    if (state.mixing.show) {
      strong.textContent = 'Add block colors to palette';
      els.palEmpty.append('Each color gets a recipe from your paints; ', strong, ' adds every block color at once.');
    } else {
      strong.textContent = 'Show recipes';
      els.palEmpty.append('Turn on ', strong, ' to see how to mix each one from your own paints.');
    }
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
    const n = state.palette.length;
    if (state.mixing.show && state.mixing.paints.length) {
      const lines = state.palette.map((c) => recipeLine(c, recipeNow(c)));
      copyText([paintsLegend(), ''].concat(lines).join('\n'), `Copied ${n} color${n === 1 ? '' : 's'} with recipes`);
      return;
    }
    copyText(state.palette.map(toHex).join('\n'), `Copied ${n} hex code${n === 1 ? '' : 's'}`);
  });

  els.palSave.addEventListener('click', () => {
    const list = state.palette;
    const withRecipes = state.mixing.show && state.mixing.paints.length > 0;
    const cols = Math.min(6, list.length);
    const rows = Math.ceil(list.length / cols);
    const sw = 180, lab = withRecipes ? 142 : 54, pad = 24, gap = 16;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const width = pad * 2 + cols * sw + (cols - 1) * gap;
    g.font = '15px "IBM Plex Mono", monospace';
    const legend = withRecipes ? wrapText(g, paintsLegend() + ' The band along the bottom of each swatch is the predicted mix.', width - pad * 2) : [];
    c.width = width;
    c.height = pad * 2 + rows * (sw + lab) + (rows - 1) * gap + (legend.length ? 12 + legend.length * 21 : 0);
    g.fillStyle = '#f3f3f1';
    g.fillRect(0, 0, c.width, c.height);
    list.forEach((col, i) => {
      const x = pad + (i % cols) * (sw + gap);
      const y = pad + Math.floor(i / cols) * (sw + lab + gap);
      const res = withRecipes ? recipeNow(col) : null;
      g.fillStyle = toHex(col);
      g.fillRect(x, y, sw, sw);
      if (res) {
        g.fillStyle = toHex(res.mix);
        g.fillRect(x, y + sw * 0.75, sw, sw * 0.25);
      }
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.strokeRect(x + 0.5, y + 0.5, sw - 1, sw - 1);
      g.fillStyle = '#1c1d20';
      g.font = '600 20px "IBM Plex Mono", monospace';
      g.fillText(toHex(col), x, y + sw + 26);
      g.fillStyle = '#5b5e64';
      g.font = '16px "IBM Plex Mono", monospace';
      g.fillText('Value ' + valueLabel(Study.lightnessOf(col.r, col.g, col.b)), x, y + sw + 47);
      if (!res) return;
      g.fillStyle = res.status === 'far' && !res.limit ? '#a3322a' : '#5b5e64';
      g.font = '600 14px "IBM Plex Mono", monospace';
      g.fillText(`${statusText(res)} · ΔE ${res.dE.toFixed(1)}`, x, y + sw + 70);
      g.fillStyle = '#1c1d20';
      g.font = '15px "IBM Plex Mono", monospace';
      wrapText(g, partsText(res), sw, ' · ').slice(0, 3).forEach((line, k) => g.fillText(line, x, y + sw + 92 + k * 19));
    });
    g.fillStyle = '#5b5e64';
    g.font = '15px "IBM Plex Mono", monospace';
    legend.forEach((line, k) => g.fillText(line, pad, c.height - pad - (legend.length - 1 - k) * 21));
    savePng(c, `${state.baseName}-palette.png`);
  });

  // Splits text into lines that fit `width` on a canvas, breaking at spaces (or at sep)
  function wrapText(g, text, width, sep = ' ') {
    const lines = [];
    let line = '';
    text.split(sep).forEach((word) => {
      const next = line ? line + sep + word : word;
      if (line && g.measureText(next).width > width) { lines.push(line); line = word; }
      else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

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

  // ---- Mixing recipes -------------------------------------------------------

  /*
   * Recipes from the artist's own paints (js/mixing.js does the color science). The paints
   * are one of the preset palettes, each of which can be edited, or "My own paints". Recipes
   * are worked out a few milliseconds at a time, so the page never stalls, and kept per color
   * and paint set.
   */
  const PAINTS_KEY = 'portrait-value-studio.paints';
  const MAX_PAINTS = 12; // the search slows down past this
  const OWN = 'own';
  const PALETTES = Mixing.PRESETS.concat({ id: OWN, name: 'My own paints', paints: Mixing.PRESETS[0].paints.slice(0, 1) });
  const STATUS_LABEL = { close: 'close', near: 'near', far: 'out of reach' };
  const LIMIT_LABEL = { dark: 'darkest mix', light: 'lightest mix' };
  const statusText = (res) => (res.limit ? LIMIT_LABEL[res.limit] : STATUS_LABEL[res.status]);
  const STRENGTH_LABEL = { weak: 'Weak', normal: 'Normal', strong: 'Strong' };

  const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
  const copyDefs = (defs) => defs.map((d) => ({ name: d.name, code: d.code, hex: d.hex, tint: d.tint || '', strength: d.strength || 'normal' }));
  const defsKey = (defs) => JSON.stringify(copyDefs(defs));
  const presetDefs = (id) => copyDefs(paletteById(id).paints);
  const paintDefs = () => copyDefs(state.mixing.lists[state.mixing.active] || paletteById(state.mixing.active).paints);
  const isChanged = (id) => !!state.mixing.lists[id] && defsKey(state.mixing.lists[id]) !== defsKey(presetDefs(id));

  // A saved paint, cleaned up; null if it can't be used
  function cleanPaint(d) {
    if (!d || typeof d.name !== 'string' || !Mixing.hexToRgb(d.hex)) return null;
    const name = d.name.trim().slice(0, 40) || 'Paint';
    return {
      name,
      code: (typeof d.code === 'string' && d.code.trim().slice(0, 3)) || initials(name),
      hex: Mixing.rgbToHex(Mixing.hexToRgb(d.hex)),
      tint: Mixing.hexToRgb(d.tint) ? Mixing.rgbToHex(Mixing.hexToRgb(d.tint)) : '',
      strength: Mixing.STRENGTHS[d.strength] ? d.strength : 'normal',
    };
  }

  // The saved paint settings, or null if storage can't be read
  function readMixing() {
    try {
      const saved = JSON.parse(localStorage.getItem(PAINTS_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch (err) {
      return null;
    }
  }

  function loadMixing(saved) {
    const lists = {};
    Object.entries((saved && saved.lists) || {}).forEach(([id, defs]) => {
      if (PALETTES.some((p) => p.id === id) && Array.isArray(defs)) lists[id] = defs.map(cleanPaint).filter(Boolean).slice(0, MAX_PAINTS);
    });
    return {
      active: saved && PALETTES.some((p) => p.id === saved.active) ? saved.active : PALETTES[0].id,
      lists,                                // edited palettes; the rest are as shipped
      show: !!(saved && saved.show === true), // recipe lines under the swatches
      paints: [],                           // Mixing.makePaint() for each paint in use
      key: '',                              // changes with anything that changes a recipe
      hatch: false,                         // hatch blocks the paints can't reach
      card: null,                           // hex of the color in the How-to-mix card
      cardFrom: null,                       // the button that opened it
      sheet: false,                         // mixing sheet open
    };
  }

  function saveMixing() {
    const m = state.mixing;
    try {
      localStorage.setItem(PAINTS_KEY, JSON.stringify({ active: m.active, lists: m.lists, show: m.show }));
    } catch (err) {
      /* storage unavailable: the paints still work for this visit */
    }
  }

  state.mixing = loadMixing(readMixing());

  window.addEventListener('storage', (e) => {
    if (e.key !== PAINTS_KEY && e.key !== null) return;
    const saved = readMixing();
    if (!saved) return;
    const m = state.mixing;
    state.mixing = Object.assign(loadMixing(saved), { card: m.card, cardFrom: m.cardFrom, sheet: m.sheet, hatch: m.hatch });
    els.showRecipes.checked = state.mixing.show;
    paintsChanged(false);
  });

  // "Burnt Umber" -> "BU", "Viridian" -> "VI": letters and digits only
  function initials(name) {
    const words = name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
    const code = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] || 'P').slice(0, 2);
    return code.slice(0, 3).toUpperCase();
  }

  function uniqueCode(code, defs) {
    const taken = (c) => defs.some((d) => d.code.toUpperCase() === c.toUpperCase());
    if (!taken(code)) return code;
    for (let k = 2; k < 100; k++) {
      const c = code.slice(0, k < 10 ? 2 : 1) + k;
      if (!taken(c)) return c;
    }
    return code;
  }

  // ---- Working out recipes, a little at a time ----

  const recipes = { cache: new Map(), queue: [], job: null, timer: 0 };
  const recipeKey = (hex) => hex + '|' + state.mixing.key;

  function usePaints() {
    const m = state.mixing;
    m.paints = paintDefs().map(Mixing.makePaint);
    m.key = Mixing.paintsKey(m.paints);
    recipes.queue = [];
    recipes.job = null;
  }

  // The recipe for a color if it is ready; otherwise it is queued and recipeReady() follows
  function recipeOf(c) {
    if (!state.mixing.paints.length) return null;
    const hex = toHex(c);
    const key = recipeKey(hex);
    if (recipes.cache.has(key)) return recipes.cache.get(key);
    if (!recipes.queue.some((q) => q.key === key) && !(recipes.job && recipes.job.key === key)) {
      recipes.queue.push({ key, hex, rgb: { r: c.r, g: c.g, b: c.b } });
    }
    if (!recipes.timer) recipes.timer = setTimeout(pumpRecipes, 0);
    return null;
  }

  // The recipe right away, for copying and saving
  function recipeNow(c) {
    const key = recipeKey(toHex(c));
    if (!recipes.cache.has(key)) recipes.cache.set(key, Mixing.recipe(c, state.mixing.paints));
    return recipes.cache.get(key);
  }

  // Works on the queue for about 12 ms, then lets the page breathe
  function pumpRecipes() {
    recipes.timer = 0;
    const end = performance.now() + 12;
    while (performance.now() < end) {
      if (!recipes.job) {
        const next = recipes.queue.shift();
        if (!next) break;
        if (recipes.cache.has(next.key)) continue;
        recipes.job = Object.assign(next, { task: Mixing.recipeTask(next.rgb, state.mixing.paints) });
      }
      const job = recipes.job;
      if (!job.task.step(Math.max(1, end - performance.now()))) break;
      recipes.job = null;
      recipes.cache.set(job.key, job.task.result);
      recipeReady(job.hex);
    }
    if (recipes.job || recipes.queue.length) recipes.timer = setTimeout(pumpRecipes, 0);
  }

  function recipeReady(hex) {
    document.querySelectorAll(`[data-recipe="${hex}"]`).forEach((btn) => fillRecipe(btn, recipeOf(Mixing.hexToRgb(hex))));
    document.querySelectorAll(`[data-string="${hex}"]`).forEach(fillValueString);
    if (state.mixing.card === hex) renderMixCard();
    if (state.mixing.hatch) paintBlocks(false);
  }

  // ---- Recipe text ----

  const paintOf = (it) => state.mixing.paints[it.paint];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // "W 9 · YO 3 · CR 2 · IB touch". With one main paint, its number says nothing, so it has none.
  function itemText(res, it) {
    const main = res.items.filter((x) => !x.touch).length;
    return it.touch ? `${paintOf(it).code} touch` : main > 1 ? `${paintOf(it).code} ${it.parts}` : paintOf(it).code;
  }
  const partsText = (res) => res.items.map((it) => itemText(res, it)).join(' · ');

  // ['grayer', 'cooler', 'lighter'] -> "grayer, cooler and lighter"
  function andList(words) {
    return words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : words.join('');
  }
  const noteText = (res) => (res.diff.length ? `nearest mix is ${andList(res.diff)}` : '');

  // Lab hue in degrees (0-360) and chroma
  function hueOf(lab) {
    const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
    return [h < 0 ? h + 360 : h, Math.hypot(lab[1], lab[2])];
  }
  // Blues, cyans and greens that a gray next to warm skin can stand in for
  const isCool = (lab) => { const [h, c] = hueOf(lab); return c >= 8 && h >= 150 && h <= 330; };
  const BLUE_LESSON = 'Use a nearby gray. Next to warm skin, black and white read as blue.';

  // What to do about a color the paints can't reach: suggest it by its neighbours
  function lesson(res) {
    if (res.limit === 'dark') return 'A photo’s darkest darks go further than paint can. Use this mix, and keep the values next to it a step lighter than the photo so the dark still reads.';
    if (res.limit === 'light') return 'A photo’s lightest lights go further than white paint. Use this mix, and keep what is around it a step darker so it still reads as the light.';
    if (isCool(res.targetLab) && res.diff.includes('grayer')) return BLUE_LESSON;
    if (res.diff.includes('darker')) return 'It is lighter than these paints go. Use the nearest mix, and keep what is around it a little darker.';
    if (res.diff.includes('lighter')) return 'It is darker than these paints go. Use the nearest mix, and keep what is around it a little lighter.';
    if (res.diff.includes('grayer')) return 'Use the nearest mix and keep the colors around it duller: a color looks stronger next to grays.';
    return 'Use the nearest mix and judge it next to its neighbours, not on its own.';
  }

  // One line for copying: "#DDA480  V 7.2  W 13 · YO 4 · CR 3 · IB touch  (close, ΔE 0.3)"
  function recipeLine(c, res) {
    const head = `${toHex(c)}  V ${valueLabel(Study.lightnessOf(c.r, c.g, c.b))}`;
    if (!res) return head;
    const note = res.status !== 'close' && res.diff.length ? `, ${noteText(res)}` : '';
    return `${head}  ${partsText(res)}  (${statusText(res)}, ΔE ${res.dE.toFixed(1)}${note})`;
  }

  function paintsLegend() {
    const m = state.mixing;
    return `Starting mixes from ${paletteById(m.active).name}${isChanged(m.active) ? ' (changed)' : ''}: ` +
      m.paints.map((p) => `${p.code} ${p.name}`).join(', ') + '. Adjust by eye.';
  }

  function dot(hex) {
    const d = document.createElement('span');
    d.className = 'paint-dot';
    d.style.setProperty('--c', hex);
    return d;
  }

  function badge(res) {
    const b = document.createElement('span');
    b.className = 'mix-badge';
    b.dataset.status = res.limit ? 'limit' : res.status;
    b.textContent = `${statusText(res)} · ΔE ${res.dE.toFixed(1)}`;
    return b;
  }

  // target | predicted mix
  function mixChips(res) {
    const chips = document.createElement('span');
    chips.className = 'mix-chips';
    chips.setAttribute('aria-hidden', 'true');
    [res.target, res.mix].forEach((c, i) => {
      const s = document.createElement('span');
      s.style.background = toHex(c);
      s.title = (i ? 'Predicted mix ' : 'Target ') + toHex(c);
      chips.append(s);
    });
    return chips;
  }

  function partsLine(res) {
    const line = document.createElement('span');
    line.className = 'recipe-line';
    res.items.forEach((it, i) => {
      const span = document.createElement('span');
      span.append(dot(paintOf(it).hex), itemText(res, it));
      if (i < res.items.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'visually-hidden';
        sep.textContent = ' · ';
        span.append(sep);
      }
      line.append(span);
    });
    return line;
  }

  // ---- Recipe lines (under swatches and on the mixing sheet) ----

  function recipeButton(c, sheet) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch-recipe';
    btn.dataset.recipe = toHex(c);
    if (sheet) btn.dataset.sheet = JSON.stringify(sheet);
    btn.setAttribute('aria-controls', 'mixCard');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => toggleMixCard(btn));
    fillRecipe(btn, recipeOf(c));
    return btn;
  }

  function fillRecipe(btn, res) {
    const hex = btn.dataset.recipe;
    const sheet = btn.dataset.sheet ? JSON.parse(btn.dataset.sheet) : null;
    btn.textContent = '';
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = `How to mix ${hex}: `;
    btn.append(label);
    if (sheet) {
      const chip = document.createElement('span');
      chip.className = 'sheet-chip';
      chip.style.background = hex;
      const meta = document.createElement('span');
      meta.className = 'sheet-meta';
      meta.textContent = `${hex} · V ${sheet.v} · ${sheet.share}% of picture`;
      btn.append(chip, meta);
    }
    if (!state.mixing.paints.length) {
      const none = document.createElement('span');
      none.className = 'recipe-note';
      none.textContent = 'Add paints under My paints to get a recipe';
      btn.append(none);
      return;
    }
    if (!res) {
      const wait = document.createElement('span');
      wait.className = 'recipe-wait';
      wait.textContent = 'Working out a mix…';
      btn.append(wait);
      return;
    }
    const top = document.createElement('span');
    top.className = 'recipe-top';
    top.append(mixChips(res), badge(res));
    btn.append(top, partsLine(res));
    if (res.status !== 'close' && res.diff.length) {
      const note = document.createElement('span');
      note.className = 'recipe-note';
      note.textContent = noteText(res);
      btn.append(note);
    }
  }

  els.showRecipes.checked = state.mixing.show;
  els.showRecipes.addEventListener('change', () => {
    state.mixing.show = els.showRecipes.checked;
    saveMixing();
    renderPalette();
  });

  // ---- How-to-mix card ----

  function syncExpanded() {
    document.querySelectorAll('[data-recipe]').forEach((b) =>
      b.setAttribute('aria-expanded', String(b === state.mixing.cardFrom && !els.mixCard.hidden)));
  }

  // Opens the card under the list the button is in (the swatches or a group of the mixing sheet)
  function toggleMixCard(btn) {
    const m = state.mixing;
    if (m.cardFrom === btn && !els.mixCard.hidden) { closeMixCard(); return; }
    m.card = btn.dataset.recipe;
    m.cardFrom = btn;
    btn.closest('ul, ol').after(els.mixCard);
    renderMixCard();
    els.mixCard.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function closeMixCard() {
    const from = state.mixing.cardFrom;
    const hadFocus = els.mixCard.contains(document.activeElement);
    state.mixing.card = null;
    state.mixing.cardFrom = null;
    renderMixCard();
    els.swatches.after(els.mixCard); // home again, so the sheet can be rebuilt without it
    if (hadFocus && from && from.isConnected) from.focus();
  }

  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1/N of the pile, rounded to a fraction a painter can picture
  function niceFraction(n) {
    const steps = [15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200];
    return steps.reduce((a, b) => (Math.abs(Math.log(b / n)) < Math.abs(Math.log(a / n)) ? b : a));
  }

  // Ordered steps: biggest pile first, then the rest; the addition that moves the pile most goes
  // in a little at a time, and touches go last
  function mixSteps(res) {
    const paints = state.mixing.paints;
    const main = res.items.filter((it) => !it.touch);
    const steps = [];
    const pile = paints.map(() => 0);
    let slow = -1, most = 3;
    main.forEach((it, j) => {
      if (j) {
        const before = Mixing.mix(paints, pile);
        const after = Mixing.mix(paints, pile.map((v, i) => v + (i === it.paint ? 1 : 0)));
        const dE = Study.deltaE2000(...before.lab, ...after.lab);
        if (dE > most) { most = dE; slow = j; }
      }
      pile[it.paint] += it.parts;
    });
    main.forEach((it, j) => {
      const p = paintOf(it);
      if (res.items.length === 1) steps.push([p.hex, `Use ${p.name} straight from the tube.`]);
      else if (!j) steps.push([p.hex, main.length === 1 ? `Start with a pile of ${p.name}.` : `Start with ${plural(it.parts, 'part')} ${p.name}.`]);
      else steps.push([p.hex, `Add ${plural(it.parts, 'part')} ${p.name}${j === slow ? ', a little at a time' : ''}.`]);
    });
    res.items.filter((it) => it.touch).forEach((it) => {
      const n = niceFraction(res.total / it.parts);
      steps.push([paintOf(it).hex, `Add a touch of ${paintOf(it).name}: about 1/${n} of the pile${n >= 80 ? ', a speck on the tip of the knife' : ''}.`]);
    });
    steps.push([null, `Check the value: it should read V ${valueLabel(res.targetLab[0])} in the loupe.`]);
    return steps;
  }

  function renderMixCard() {
    const m = state.mixing;
    const card = els.mixCard;
    card.textContent = '';
    card.hidden = !m.card;
    syncExpanded();
    if (!m.card) return;
    const c = Mixing.hexToRgb(m.card);
    const res = recipeOf(c);

    const head = document.createElement('div');
    head.className = 'mix-card-head';
    const h = document.createElement('h3');
    h.textContent = `How to mix ${m.card}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-small';
    close.textContent = 'Close';
    close.addEventListener('click', closeMixCard);
    head.append(h, close);
    card.append(head);

    const say = (text, cls) => {
      const p = document.createElement('p');
      p.className = cls || 'hint';
      p.textContent = text;
      card.append(p);
      return p;
    };
    if (!m.paints.length) { say('Add paints under My paints to get a recipe.'); return; }
    if (!res) { say('Working out a mix…', 'recipe-wait'); return; }

    const compare = document.createElement('div');
    compare.className = 'mix-compare';
    const pair = document.createElement('div');
    pair.className = 'mix-pair';
    [['Target', res.target, res.targetLab], ['Predicted mix', res.mix, res.mixLab]].forEach(([name, col, lab]) => {
      const fig = document.createElement('figure');
      const chip = document.createElement('div');
      chip.className = 'chip-big';
      chip.style.background = toHex(col);
      const cap = document.createElement('figcaption');
      cap.textContent = `${name}\n${toHex(col)} · V ${valueLabel(lab[0])}`;
      cap.style.whiteSpace = 'pre-line';
      fig.append(chip, cap);
      pair.append(fig);
    });
    const verdict = document.createElement('div');
    verdict.className = 'mix-verdict';
    const line = document.createElement('p');
    line.append(badge(res));
    const words = res.limit ? (res.limit === 'dark' ? ' As dark as these paints go.' : ' As light as these paints go.') : {
      close: ' The difference should be hard to see.',
      near: ' A small difference you can correct by eye.',
      far: ' These paints can’t make this color.',
    }[res.status];
    line.append(words);
    verdict.append(line);
    if (res.status !== 'close' && res.diff.length) {
      const note = document.createElement('p');
      note.textContent = `The ${noteText(res)}.`;
      verdict.append(note);
    }
    if (res.status === 'far' || res.limit) {
      const tip = document.createElement('p');
      tip.textContent = lesson(res);
      verdict.append(tip);
    }
    compare.append(pair, verdict);
    card.append(compare);

    const bar = document.createElement('div');
    bar.className = 'mix-bar';
    bar.setAttribute('aria-hidden', 'true');
    res.items.forEach((it) => {
      const seg = document.createElement('span');
      seg.style.setProperty('--c', paintOf(it).hex);
      seg.style.flex = `${it.parts} 1 0`;
      seg.title = `${paintOf(it).name}: ${it.touch ? 'a touch' : plural(it.parts, 'part')}`;
      bar.append(seg);
    });
    card.append(bar);

    const ol = document.createElement('ol');
    ol.className = 'mix-steps';
    mixSteps(res).forEach(([hex, text]) => {
      const li = document.createElement('li');
      if (hex) li.append(dot(hex));
      li.append(text);
      ol.append(li);
    });
    card.append(ol);
    say('Starting mix, adjust by eye. It is predicted from typical paints’ colors with a pigment-mixing model; your tubes, medium and light will differ, so mix it, then compare it with the reference.');
  }

  // ---- My paints ----

  function renderPaints() {
    const m = state.mixing;
    const pal = paletteById(m.active);
    const n = m.paints.length;
    if (!els.paintPreset.options.length) {
      PALETTES.forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.id === OWN ? p.name : `${p.name} (${plural(p.paints.length, 'paint')})`;
        els.paintPreset.append(o);
      });
    }
    els.paintPreset.value = m.active;
    const changed = isChanged(m.active);
    els.paintReset.hidden = !changed;
    els.paintReset.textContent = m.active === OWN ? 'Start over with white only' : `Restore the ${pal.name} paints`;

    els.paintDots.textContent = '';
    m.paints.forEach((p) => els.paintDots.append(dot(p.hex)));
    els.paintsState.textContent = `${pal.name}${changed && m.active !== OWN ? ', changed' : ''} · ${plural(n, 'paint')}`;

    els.paintList.textContent = '';
    m.paints.forEach((p, index) => {
      const li = document.createElement('li');
      li.className = 'paint-row';
      const chip = document.createElement('span');
      chip.className = 'paint-chip';
      chip.style.setProperty('--c', p.hex);
      if (p.tint) chip.style.setProperty('--t', p.tint);
      chip.title = p.tint ? `Tube ${p.hex}, 1 : 4 tint ${p.tint}` : `Tube ${p.hex}`;
      const name = document.createElement('span');
      name.className = 'paint-name';
      const strong = document.createElement('strong');
      strong.textContent = p.name;
      const small = document.createElement('small');
      small.textContent = p.white ? `${p.code} · white` : `${p.code} · ${p.tint ? 'tint fitted' : 'no tint swatch'}`;
      name.append(strong, small);

      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `Tinting strength of ${p.name}`);
      sel.title = 'Tinting strength: how far a little of this paint goes in white';
      Object.keys(Mixing.STRENGTHS).forEach((k) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = STRENGTH_LABEL[k];
        sel.append(o);
      });
      sel.value = p.strength;
      sel.addEventListener('change', () => {
        editPaints((defs) => { defs[index].strength = sel.value; });
        const again = els.paintList.querySelectorAll('select')[index];
        if (again) again.focus();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-small btn-ghost';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${p.name}`);
      remove.addEventListener('click', () => {
        editPaints((defs) => { defs.splice(index, 1); });
        const rest = els.paintList.querySelectorAll('.btn-ghost');
        (rest[Math.min(index, rest.length - 1)] || els.paintPreset).focus();
        toast(`Removed ${p.name}`);
      });
      li.append(chip, name, sel, remove);
      els.paintList.append(li);
    });

    const warn = !n ? 'No paints yet. Add the paints you own below.'
      : !m.paints.some((p) => p.white) ? 'There is no white, so recipes can’t be lightened. Add a white with a tube color close to #F3F1EA.'
        : n >= MAX_PAINTS ? `That is ${MAX_PAINTS} paints, the most a palette can hold here. Remove one to add another.` : '';
    els.paintWarn.textContent = warn;
    els.paintWarn.hidden = !warn;
    els.paintAddBtn.disabled = n >= MAX_PAINTS;
  }

  // Applies a change to the paints in use, saving them as that palette's own version
  function editPaints(change) {
    const defs = paintDefs();
    change(defs);
    state.mixing.lists[state.mixing.active] = defs;
    paintsChanged(true);
  }

  function paintsChanged(save) {
    if (save) saveMixing();
    usePaints();
    renderPaints();
    renderPalette();
    renderMixCard();
    renderSheet();
    paintBlocks(false);
  }

  els.paintPreset.addEventListener('change', () => {
    state.mixing.active = els.paintPreset.value;
    paintsChanged(true);
    toast(`Recipes now use ${paletteById(state.mixing.active).name}`);
  });
  els.paintReset.addEventListener('click', () => {
    delete state.mixing.lists[state.mixing.active];
    paintsChanged(true);
    els.paintPreset.focus();
  });
  els.paintTintOn.addEventListener('change', () => { els.paintTint.disabled = !els.paintTintOn.checked; });
  els.paintAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const defs = paintDefs();
    if (defs.length >= MAX_PAINTS) return;
    const name = els.paintName.value.trim().slice(0, 40) || `Paint ${defs.length + 1}`;
    const code = uniqueCode((els.paintCode.value.trim() || initials(name)).slice(0, 3).toUpperCase(), defs);
    editPaints((list) => {
      list.push({ name, code, hex: els.paintHex.value, tint: els.paintTintOn.checked ? els.paintTint.value : '', strength: els.paintStrength.value });
    });
    els.paintName.value = '';
    els.paintCode.value = '';
    toast(`Added ${name} as ${code}`);
  });

  // ---- Mixing sheet ----

  // A value mass's block colors, darkest first
  const zoneColors = (r, z) => r.blockColors.filter((c) => c.zone === z)
    .sort((a, b) => Study.lightnessOf(a.r, a.g, a.b) - Study.lightnessOf(b.r, b.g, b.b));

  // A value mass's main skin color: its biggest block with a skin-like hue (orange-red to yellow,
  // neither gray nor garish), or just its biggest block when nothing looks like skin
  function mainColor(r, z) {
    const colors = r.blockColors.filter((c) => c.zone === z);
    const skin = colors.filter((c) => {
      const lab = Study.rgbToLab(c.r, c.g, c.b);
      const [h, chroma] = hueOf(lab);
      return lab[0] >= 15 && chroma >= 8 && chroma <= 60 && h >= 20 && h <= 85;
    });
    const biggest = (list) => list.reduce((a, c) => (!a || c.share > a.share ? c : a), null);
    const color = biggest(skin) || biggest(colors);
    return color && { color, skin: skin.includes(color) };
  }

  // ---- Value strings ----

  const strings = new Map(); // by recipe key
  function valueStringOf(c) {
    const res = recipeOf(c);
    if (!res) return null;
    const key = recipeKey(toHex(c));
    if (!strings.has(key)) strings.set(key, Mixing.valueString(res, state.mixing.paints));
    return strings.get(key);
  }

  const darkText = (vs) => vs.dark.map(([i, n]) => (vs.dark.length > 1 ? `${state.mixing.paints[i].code} ${n}` : state.mixing.paints[i].code)).join(' · ');

  // What goes into one step: "the pile", "pile 3 · W 1", "pile 4 · dark 1"
  function stepText(s) {
    if (!s.add) return 'the pile';
    if (!s.ratio) return s.dv > 0 ? 'too light to mix' : 'too dark to mix';
    return `pile ${s.ratio[0]} · ${s.add === 'white' ? 'W' : 'dark'} ${s.ratio[1]}`;
  }

  function valueStringBlock(main) {
    const box = document.createElement('div');
    box.className = 'value-string';
    box.dataset.string = toHex(main.color);
    box.dataset.skin = main.skin ? '1' : '';
    fillValueString(box);
    return box;
  }

  function fillValueString(box) {
    const hex = box.dataset.string;
    const c = Mixing.hexToRgb(hex);
    box.textContent = '';
    const h = document.createElement('h4');
    h.textContent = `Value string around ${hex}`;
    box.append(h);
    if (!state.mixing.paints.length) return;
    const vs = valueStringOf(c);
    if (!vs) {
      const wait = document.createElement('p');
      wait.className = 'recipe-wait hint';
      wait.textContent = 'Working out a mix…';
      box.append(wait);
      return;
    }
    const ol = document.createElement('ol');
    ol.className = 'value-steps';
    vs.steps.forEach((s) => {
      const li = document.createElement('li');
      const tone = document.createElement('span');
      tone.className = 'tone' + (s.dv ? '' : ' is-base') + (s.rgb ? '' : ' is-none');
      if (s.rgb) tone.style.background = toHex(s.rgb);
      const v = document.createElement('strong');
      v.textContent = 'V ' + valueLabel(Math.max(0, Math.min(100, s.L)));
      const t = document.createElement('span');
      t.textContent = stepText(s);
      li.append(tone, v, t);
      ol.append(li);
    });
    const res = recipeOf(c);
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = `${box.dataset.skin ? 'The biggest skin-toned block' : 'The biggest block'} in this mass. ` +
      `Pile: ${partsText(res)}.` + (vs.dark ? ` Dark: ${darkText(vs)}.` : '');
    box.append(ol, note);
  }

  const valueStringText = (vs) => vs.steps.map((s) => `V ${valueLabel(Math.max(0, Math.min(100, s.L)))} ${stepText(s)}`).join('; ') +
    (vs.dark ? `; dark = ${darkText(vs)}` : '');

  function renderSheet() {
    const m = state.mixing;
    els.sheet.hidden = !m.sheet;
    const cardHere = els.sheetGroups.contains(els.mixCard);
    if (cardHere) els.swatches.after(els.mixCard);
    if (!m.sheet || !state.result) { if (cardHere) closeMixCard(); return; }
    const r = state.result;
    els.sheetCount.textContent = `${paletteById(m.active).name} · ${plural(r.blockColors.length, 'color')}`;
    els.sheetIntro.textContent = 'Every color in the color-block study, by value mass and darkest first, as a starting mix from your paints. Premix them before you paint, then adjust by eye. Tap a recipe for the steps. ' +
      'Each mass ends with a value string: mix a pile of its main color, then split it into five premixes a value apart, lightened with white and darkened with a dark of your darkest paint and a little red, so the string stays warm instead of going green. White cools and chalks a mix too, so the lightest steps look paler.';
    els.sheetGroups.textContent = '';
    let reopen = null;
    ZONE_NAMES.forEach((zoneName, z) => {
      const colors = zoneColors(r, z);
      if (!colors.length) return;
      const group = document.createElement('section');
      group.className = 'sheet-group';
      const h = document.createElement('h3');
      h.textContent = `${zoneName} · ${Math.round(r.zoneShare[z] * 100)}% of picture`;
      const ol = document.createElement('ol');
      ol.className = 'sheet-list';
      colors.forEach((c) => {
        const li = document.createElement('li');
        li.className = 'sheet-row';
        const btn = recipeButton(c, { v: valueLabel(Study.lightnessOf(c.r, c.g, c.b)), share: (c.share * 100).toFixed(c.share < 0.01 ? 1 : 0) });
        if (cardHere && btn.dataset.recipe === m.card && !reopen) reopen = btn;
        li.append(btn);
        ol.append(li);
      });
      group.append(h, ol);
      if (m.paints.length) group.append(valueStringBlock(mainColor(r, z)));
      els.sheetGroups.append(group);
    });
    if (reopen) {
      m.cardFrom = reopen;
      reopen.closest('ol').after(els.mixCard);
      renderMixCard();
    } else if (cardHere) closeMixCard();
  }

  els.sheetOpen.addEventListener('click', () => {
    state.mixing.sheet = true;
    renderSheet();
    els.sheet.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    els.sheetTitle.focus({ preventScroll: true });
  });
  els.sheetClose.addEventListener('click', () => {
    state.mixing.sheet = false;
    renderSheet();
    els.sheetOpen.focus();
  });
  els.sheetCopy.addEventListener('click', () => {
    const r = state.result;
    if (!r || !state.mixing.paints.length) return;
    const lines = ['Mixing sheet', paintsLegend()];
    ZONE_NAMES.forEach((zoneName, z) => {
      const colors = zoneColors(r, z);
      if (!colors.length) return;
      lines.push('', `${zoneName} (${Math.round(r.zoneShare[z] * 100)}% of picture)`);
      colors.forEach((c) => lines.push(recipeLine(c, recipeNow(c))));
      const main = mainColor(r, z).color;
      recipeNow(main);
      lines.push(`Value string around ${toHex(main)}: ${valueStringText(valueStringOf(main))}`);
    });
    copyText(lines.join('\n'), 'Copied the mixing sheet');
  });

  // ---- Hatching blocks the paints can't reach ----

  // Labels of the block colors out of reach, or null while their recipes are being worked out
  function farBlocks(r) {
    const far = new Set();
    let pending = false;
    if (!state.mixing.paints.length) return far;
    r.blockColors.forEach((c) => {
      const res = recipeOf(c);
      if (!res) pending = true;
      else if (res.status === 'far' && !res.limit) far.add(c.label);
    });
    return pending ? null : far;
  }

  // Light and dark diagonal stripes over those blocks, so they show on any color
  function hatched(r, far) {
    const { w, h, block } = r;
    const img = new Uint8ClampedArray(r.blockImage);
    const period = Math.max(8, Math.round(Math.max(w, h) / 70));
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      if (!far.has(block[i])) continue;
      const t = ((i % w) + ((i / w) | 0)) % period;
      if (t < period / 4) {
        img[p] += (255 - img[p]) * 0.6; img[p + 1] += (255 - img[p + 1]) * 0.6; img[p + 2] += (255 - img[p + 2]) * 0.6;
      } else if (t >= period / 2 && t < (3 * period) / 4) {
        img[p] *= 0.45; img[p + 1] *= 0.45; img[p + 2] *= 0.45;
      }
    }
    return img;
  }

  // The color-block study, hatched where that is on. The loupe keeps reading the plain blocks.
  let blocksDrawn = null; // which blocks the canvas shows hatched
  function paintBlocks(force) {
    const r = state.result;
    if (!r) return;
    const far = state.mixing.hatch ? farBlocks(r) : null;
    const drawn = far ? Array.from(far).join(',') : '';
    if (force || drawn !== blocksDrawn) {
      blocksDrawn = drawn;
      paint(els.canvases.block, drawn ? hatched(r, far) : r.blockImage, r.w, r.h);
    }
    const m = state.mixing;
    els.hatchHint.hidden = !m.hatch;
    if (!m.hatch) return;
    const name = paletteById(m.active).name;
    const n = r.blockColors.length;
    const text = !m.paints.length ? 'Add paints under My paints to see which colors they can reach.'
      : !far ? 'Working out the recipes…'
        : !far.size ? `Every block color is within reach of ${name}.`
          : `${far.size} of ${n} block colors ${far.size === 1 ? 'is' : 'are'} out of reach of ${name}. ` +
            (r.blockColors.some((c) => far.has(c.label) && isCool(Study.rgbToLab(c.r, c.g, c.b))) ? BLUE_LESSON
              : 'Use the nearest mix: next to its neighbours it reads closer than it looks alone.');
    if (els.hatchHint.textContent !== text) els.hatchHint.textContent = text; // it is read aloud on change
  }

  els.hatchFar.checked = state.mixing.hatch; // a browser may restore the box on reload
  els.hatchFar.addEventListener('change', () => {
    state.mixing.hatch = els.hatchFar.checked;
    paintBlocks(false);
  });

  usePaints();
  renderPaints();

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
      ? ' · a made-up attempt at the sample: lifted shadows, warmer skin, and photographed slightly tilted. Line it up below to see the score change. Load your own to replace it.'
      : ` · ${img.naturalWidth || img.width} × ${img.naturalHeight || img.height} px`);
  }

  const align = () => ({
    x: +els.alignX.value, y: +els.alignY.value, scale: +els.alignScale.value, rot: +els.alignRot.value,
  });
  const isIdentity = (a) => !a.x && !a.y && a.scale === 100 && !a.rot;

  // Fits the painting to the reference's exact size (crop or stretch), then applies the
  // user's move / size / rotate and color fix. Pixels it no longer covers go in a mask.
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
    prep.mask = mask;
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
    const key = [state.prep.w, state.prep.h, els.artFit.value, a.x, a.y, a.scale, a.rot, state.art.gains.join(',')].join(':');
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
    paint(els.canvases.diff, cmp.diffImage, w, h);
    drawLabels(els.canvases.diff, cmp);
    state.pixels.refblock = state.result.blockImage;
    state.pixels.art = state.art.prep.rgba;
    state.pixels.artblock = artRes.blockImage;
    state.pixels.diff = cmp.diffImage;
    renderScore(cmp);
  }

  // Match percentage on each shape of the accuracy map. The biggest differences get a
  // white label with their number from the list; shapes too small for a label stay bare.
  function drawLabels(canvas, cmp) {
    const g = canvas.getContext('2d');
    const long = Math.max(canvas.width, canvas.height);
    const minFont = Math.round(long / 60);
    const maxFont = Math.round(long / 26);
    const rank = new Set(cmp.top.map((r) => r.id));

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
      if (font >= minFont) pill(reg, reg.pct + '%', font, false);
    });
    cmp.top.forEach((reg, i) => {
      const font = Math.max(minFont, Math.min(maxFont, Math.floor(reg.room / 1.9)));
      pill(reg, `${i + 1} · ${reg.pct}%`, font, true);
    });
  }

  function describe(reg) {
    const parts = [];
    if (Math.abs(reg.dL) >= 3) parts.push(`${reg.dL > 0 ? 'too light' : 'too dark'} by ${Math.abs(reg.dL / 10).toFixed(1)} value`);
    if (Math.abs(reg.dWarm) >= 4) parts.push(reg.dWarm > 0 ? 'too warm' : 'too cool');
    if (Math.abs(reg.dC) >= 5) parts.push(reg.dC > 0 ? 'too saturated' : 'too gray');
    if (!parts.length) parts.push('hue is off');
    const text = parts.join(', ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function renderScore(cmp) {
    els.scoreColor.textContent = cmp.colorScore;
    els.scoreGrade.textContent =
      cmp.colorScore >= 90 ? 'Very close to the reference'
        : cmp.colorScore >= 75 ? 'Close, with a few shapes off'
          : cmp.colorScore >= 60 ? 'Several shapes are off'
            : 'Far from the reference';
    els.scoreValue.textContent = cmp.valueScore;
    els.meterValue.style.width = cmp.valueScore + '%';
    els.scoreShapes.textContent = cmp.shapeMatch + '%';
    const left = Math.round((1 - cmp.coverage) * 100);
    const moved = !isIdentity(align());
    const fixed = state.art.gains.some((v) => v !== 1);
    els.alignState.textContent = [
      moved ? `moved${left ? `, ${left}% of picture left out` : ''}` : '',
      fixed ? 'color cast fixed' : '',
    ].filter(Boolean).join(' · ');
    els.meterShapes.style.width = cmp.shapeMatch + '%';

    els.fixList.innerHTML = '';
    if (!cmp.top.length) {
      const li = document.createElement('li');
      li.className = 'fix-none';
      li.textContent = 'Every large shape is within ΔE 5 of the reference.';
      els.fixList.append(li);
      return;
    }
    cmp.top.forEach((reg, i) => {
      const li = document.createElement('li');
      li.className = 'fix';
      const num = document.createElement('span');
      num.className = 'fix-num';
      num.textContent = i + 1;
      const sw = document.createElement('span');
      sw.className = 'fix-swatches';
      const a = document.createElement('span');
      a.style.background = toHex(reg.ref);
      a.title = `Reference ${toHex(reg.ref)}`;
      const b = document.createElement('span');
      b.style.background = toHex(reg.art);
      b.title = `Yours ${toHex(reg.art)}`;
      sw.append(a, b);
      const text = document.createElement('span');
      text.className = 'fix-text';
      const strong = document.createElement('strong');
      strong.textContent = describe(reg);
      const small = document.createElement('small');
      small.textContent = `${reg.pct}% match · ${ZONE_NAMES[reg.zone]} shape · ${(reg.share * 100).toFixed(1)}% of picture · ΔE ${reg.dE.toFixed(1)} · ${toHex(reg.ref)} → ${toHex(reg.art)}`;
      text.append(strong, small);
      li.append(num, sw, text);
      els.fixList.append(li);
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

  // A plausible student attempt at the sample: shadows lifted, colors warmer, edges softened
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
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i] * 0.9 + 30;
      d[i + 1] = d[i + 1] * 0.88 + 18;
      d[i + 2] = d[i + 2] * 0.84 + 12;
    }
    g.putImageData(img, 0, 0);
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
    if (location.hash === '#check') switchTab('check');
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
