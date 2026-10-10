/* Portrait Value Studio - UI wiring: loading photos, tool drawers, settings, loupe sampler and picked colors. */
(function () {
  'use strict';

  // guard.js drops the no-js class first; this is the fallback for a page where only that script failed to load
  document.documentElement.classList.remove('no-js');

  // the modules this one needs; without them the page shows the standing note instead of half an app
  if (!window.Study || !window.Mixing || !window.Paints) {
    if (window.StudioGuard) StudioGuard.failed('app.js: processing.js, mixing.js or paints.js did not load', 'all');
    return;
  }

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
    lean: $('lean'), leanOut: $('leanOut'),
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
    tabPanels: { study: $('tab-study'), loomis: $('tab-loomis'), paint: $('tab-paint'), game: $('tab-game'), battle: $('tab-battle'), help: $('tab-help') },
    toolHint: $('toolHint'),
    lineUndo: $('lineUndo'),
    lineClear: $('lineClear'),
    measureUnit: $('measureUnit'),
    measureUndo: $('measureUndo'),
    measureClear: $('measureClear'),
    canvasSize: $('canvasSize'),
    canvasSys: $('canvasSys'),
    plumbUndo: $('plumbUndo'),
    plumbClear: $('plumbClear'),
    artFile: $('artFile'),
    artFit: $('artFit'),
    artSource: $('artSource'),
    checkEmpty: $('checkEmpty'),
    checkBody: $('checkBody'),
    checkPanels: $('checkPanels'),
    checkSection: $('checkSection'),
    artFromStudio: $('artFromStudio'),
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
    toolBtns: [...document.querySelectorAll('.tool-btn[data-tool]')],
    gridBtn: $('gridBtn'),
    gridBadge: $('gridBadge'),
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
    drawers: {
      values: $('drawer-values'),
      colors: $('drawer-colors'), swatches: $('drawer-swatches'), check: $('drawer-check'),
    },
    drawerState: {
      values: $('valuesState'),
      colors: $('colorsState'), swatches: $('swatchesState'), check: $('checkState'),
    },
  };

  const ZONE_NAMES = ['Shadow', 'Middle', 'Light'];
  const PALETTE_KEY = 'portrait-value-studio.palette';
  const CANVAS_KEY = 'portrait-value-studio.canvasUnit';
  const SMOOTHING_KEY = 'portrait-value-studio.smoothing';
  const BLOCK_VIEW_KEY = 'portrait-value-studio.blockView';
  const LEAN_KEY = 'portrait-value-studio.lean';
  const DRAWERS_KEY = 'portrait-value-studio.drawers';
  const MODE_KEY = 'portrait-value-studio.mode';
  // Check my painting is a drawer of the Study tab: its results show below the studies while it is open
  const checking = () => state.tab === 'study' && els.drawers.check.open;

  const state = {
    source: null,      // HTMLImageElement or canvas
    baseName: 'sample-study',
    isSample: true,    // the built-in sample is showing
    prep: null,        // Study.prepare() output
    result: null,      // Study.process() output
    pixels: {},        // view id -> RGBA array, used by the loupe
    palette: loadPalette(),
    hover: null,       // last sampled { r, g, b }
    tab: 'study',
    grid: 0,           // 0, 3 or 4 divisions
    tool: 'sample',    // 'sample' (the magnifier), 'line', 'measure', 'plumb', or 'none'
    lineColor: '#e5322d',
    lines: [],         // reference lines in 0-1 image coordinates
    measures: [],      // measured lengths, same coordinates
    unitIndex: 0,      // which measure is the unit (1 U)
    plumbs: [],        // plumb line and level crossing points, same coordinates
    history: [],       // undo steps for lines, measures and plumbs, oldest first
    drawing: null,     // line or measure being dragged out
    dragging: null,    // plumb point being dropped or moved
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
  // ms: how long it stays; a problem the visitor has to read gets longer than a passing confirmation
  function toast(msg, ms = 1800) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
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

  let saveImgUrl = '';
  function savePng(canvas, name) {
    canvas.toBlob((blob) => {
      if (!blob) { toast('The PNG could not be made. Try a smaller Working size.', 5000); return; }
      downloadBlob(blob, name);
      if (!downloadsMayBeBlocked) return;
      // the same blob is the preview to save by hand, so the page needs no data: URLs
      if (saveImgUrl) URL.revokeObjectURL(saveImgUrl);
      saveImgUrl = URL.createObjectURL(blob);
      els.saveImg.src = saveImgUrl;
      els.saveImg.alt = name;
      els.saveName.textContent = name;
      openDialog(els.saveDialog);
    }, 'image/png');
  }

  // showModal() where the browser has it; otherwise the dialog opens in place
  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  els.saveClose.addEventListener('click', () => els.saveDialog.close());
  els.saveDialog.addEventListener('close', () => { els.saveImg.removeAttribute('src'); if (saveImgUrl) { URL.revokeObjectURL(saveImgUrl); saveImgUrl = ''; } });

  // ---- Settings -----------------------------------------------------------

  function settings(prep = state.prep) {
    const { w, h } = prep;
    const long = Math.max(w, h);
    const simplify = +els.simplify.value;
    const merge = +els.merge.value;
    return {
      blurRadius: Math.round((simplify * long) / 450),
      smoothing: document.querySelector('input[name="smoothing"]:checked').value,
      minSize: Math.round(w * h * 0.012 * Math.pow(merge / 10, 2)),
      t1: +els.t1.value,
      t2: +els.t2.value,
      grayMode: document.querySelector('input[name="grayMode"]:checked').value,
      customL: els.g.map((el) => +el.value),
      colorsPerZone: +els.colors.value,
      lighter: +els.lean.value / 100,
      outlines: els.outlines.checked,
    };
  }

  // The smoothing chosen on an earlier visit, if storage can be read
  function restoreSmoothing() {
    let saved = null;
    try { saved = localStorage.getItem(SMOOTHING_KEY); } catch (err) { /* storage unavailable: keep the default */ }
    if (saved === 'soft' || saved === 'edge') document.querySelector(`input[name="smoothing"][value="${saved}"]`).checked = true;
  }

  function updateOutputs() {
    els.simplifyOut.value = els.simplify.value === '0' ? 'Off' : els.simplify.value;
    els.mergeOut.value = els.merge.value === '0' ? 'Off' : els.merge.value;
    els.t1Out.value = 'V ' + valueLabel(+els.t1.value);
    els.t2Out.value = 'V ' + valueLabel(+els.t2.value);
    els.g.forEach((el, i) => { els.gOut[i].value = 'V ' + valueLabel(+el.value); });
    els.colorsOut.value = els.colors.value;
    els.leanOut.value = els.lean.value === '0' ? 'Off' : els.lean.value + '%';
  }

  function autoSplit() {
    const { blurRadius, smoothing } = settings();
    const [t1, t2] = Study.autoThresholds(state.prep, blurRadius, smoothing);
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
    state.pixels.value = r.valueImage;
    showBlocks();
    renderZones();
    drawHistogram();
    const detail = document.querySelector('input[name="detailPreset"]:checked');
    els.drawerState.values.textContent = document.body.classList.contains('mode-simple') && detail
      ? `${detail.value[0].toUpperCase()}${detail.value.slice(1)} detail`
      : `Splits at V ${valueLabel(+els.t1.value)} and ${valueLabel(+els.t2.value)} · Simplify ${els.simplify.value}`;
    state.art.dirty = true;
    if (checking()) runCheck();
    els.busy.hidden = true;
    window.dispatchEvent(new CustomEvent('studio:result'));
  }

  // ---- Color blocks: the photo's colors, or as the chosen palette mixes them ----

  let blockView = 'photo';
  try { if (localStorage.getItem(BLOCK_VIEW_KEY) === 'palette') blockView = 'palette'; } catch (err) { /* photo */ }
  const blockViewButtons = document.querySelectorAll('[data-block-view]');
  const blockViewPalette = $('blockViewPalette');
  const paletteMade = new Map();
  const paletteBlocks = { key: null, image: null, job: 0 };
  const shortName = (name) => name.replace(/\s*\(.*\)$/, '').replace(/ palette$/i, '');

  /*
   * The color-block study with each block's color replaced by the mix the palette makes of it
   * (the closest recipe the pigment model finds, as the Colors and paints list shows). Outlines
   * stay as they are. Worked out a color at a time; null until it is ready.
   */
  function blocksInPalette(r, pal) {
    const key = pal.codes.join(',');
    if (paletteBlocks.result === r && paletteBlocks.key === key) return paletteBlocks.image;
    paletteBlocks.result = r;
    paletteBlocks.key = key;
    paletteBlocks.image = null;
    const job = ++paletteBlocks.job;
    const paints = pal.codes.map((c) => {
      if (!paletteMade.has(c)) paletteMade.set(c, Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(c))));
      return paletteMade.get(c);
    });
    const colors = r.blockColors.filter((c) => c.share > 0);
    const mixed = new Map();
    let i = 0, task = null;
    function next() {
      if (job !== paletteBlocks.job) return;
      const end = performance.now() + 20;
      while (i < colors.length && performance.now() < end) {
        const c = colors[i];
        if (!task) task = Mixing.recipeTask({ r: c.r, g: c.g, b: c.b }, paints);
        if (!task.step(Math.max(1, end - performance.now()))) break;
        mixed.set(c.label, task.result ? task.result.mix : { r: c.r, g: c.g, b: c.b });
        task = null;
        i++;
      }
      if (i < colors.length) { setTimeout(next, 0); return; }
      // recolor every block pixel; outline pixels (not their block's color) are left alone
      const img = new Uint8ClampedArray(r.blockImage);
      const own = new Map(r.blockColors.map((c) => [c.label, c]));
      for (let k = 0, p = 0; k < r.block.length; k++, p += 4) {
        const c = own.get(r.block[k]), m = mixed.get(r.block[k]);
        if (!m || img[p] !== c.r || img[p + 1] !== c.g || img[p + 2] !== c.b) continue;
        img[p] = m.r; img[p + 1] = m.g; img[p + 2] = m.b;
      }
      paletteBlocks.image = img;
      showBlocks();
    }
    setTimeout(next, 0);
    return null;
  }

  function showBlocks() {
    const r = state.result;
    const pal = window.StudioPalette && window.StudioPalette.current();
    blockViewPalette.textContent = pal ? shortName(pal.name) : 'Palette';
    blockViewPalette.title = pal ? `As ${pal.name} mixes them${pal.chosen ? '' : ' (the best match: choose another under Colors and paints)'}` : 'Choose a palette under Colors and paints';
    blockViewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.blockView === blockView)));
    if (!r) return;
    let img = r.blockImage;
    const inPalette = blockView === 'palette' && pal;
    if (inPalette) img = blocksInPalette(r, pal) || img;
    blockViewPalette.classList.toggle('is-busy', !!inPalette && img === r.blockImage);
    els.canvases.block.setAttribute('aria-label', inPalette ? `Color-block study as ${pal.name} mixes it` : 'Color-block study');
    if (state.pixels.block === img && els.canvases.block.width === r.w) return;
    paint(els.canvases.block, img, r.w, r.h);
    state.pixels.block = img;
  }
  blockViewButtons.forEach((b) => b.addEventListener('click', () => {
    blockView = b.dataset.blockView;
    try { localStorage.setItem(BLOCK_VIEW_KEY, blockView); } catch (err) { /* kept for this visit only */ }
    showBlocks();
  }));
  window.addEventListener('studio:palette', showBlocks);

  function paint(canvas, rgba, w, h) {
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    syncOverlay(canvas);
  }

  // Preparing a photo (decode, Lab conversion, auto split) blocks for up to a second or more on a
  // phone, so for a photo the visitor just loaded the "Updating…" indicator is painted first and the
  // work runs two frames later; a newer photo arriving in between wins. Start-up prepares at once,
  // so the sample study and the hash routes find the data ready.
  let prepareJob = 0;
  function prepareAndRun(resetSplit, immediate) {
    const job = ++prepareJob;
    const work = () => {
      if (job !== prepareJob) return;
      state.prep = Study.prepare(state.source, +els.detail.value);
      const { w, h, rgba } = state.prep;
      paint(els.canvases.orig, new Uint8ClampedArray(rgba), w, h);
      state.pixels.orig = rgba;
      if (resetSplit) autoSplit();
      runSoon(0);
    };
    if (immediate) { work(); return; }
    els.busy.hidden = false;
    clearTimeout(runTimer);
    requestAnimationFrame(() => requestAnimationFrame(work));
  }

  function renderZones() {
    const r = state.result;
    els.zones.replaceChildren();
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
      toast('That file is not an image. Choose a JPG, PNG or WebP photo.', 5000);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;
    const loaded = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      // an image with no size (an SVG without width and height) would become a blank 1 x 1 study
      if (w < 16 || h < 16) {
        toast('That image has no usable size. Use a JPG, PNG or WebP photo.', 5000);
        return;
      }
      const r = shrinkIfHuge(img, w, h);
      done(r.source, r.note);
    };
    const failed = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      toast('This image could not be opened. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first.', 6000);
    };
    img.onload = loaded;
    img.onerror = failed;
    img.src = url;
    // decode() keeps the decoding of a big photo off the click handler, so the page stays responsive
    if (typeof img.decode === 'function') img.decode().then(loaded, () => { /* some browsers refuse decode() for a huge image that still loads: onload or onerror decides */ });
  }

  // A huge photo (a 50-megapixel camera file) costs hundreds of megabytes once decoded and can
  // close the tab on a phone. Above this many pixels the photo is drawn once onto a canvas no larger
  // than twice the biggest working size, which is more than the studies ever use, and the big
  // decoded image is let go.
  const HUGE_PIXELS = 24e6;
  const SHRINK_SIDE = 2800;
  // Returns { source, note }: the image or its reduced copy, and the sentence to tell the visitor (or '').
  function shrinkIfHuge(img, w, h) {
    if (w * h <= HUGE_PIXELS) return { source: img, note: '' };
    const scale = SHRINK_SIDE / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    // a browser out of canvas memory gives no context (null) or refuses the draw: keep the photo as it is
    const g = c.getContext('2d');
    if (!g) return { source: img, note: '' };
    try {
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
    } catch (err) {
      return { source: img, note: '' };
    }
    return { source: c, note: `A very large photo (${w} × ${h}) was reduced to ${c.width} × ${c.height} for speed.` };
  }

  function loadFile(file) {
    readImage(file, (img, note) => useSource(img, file.name || 'Pasted image', (file.name || 'portrait').replace(/\.[^.]+$/, '') || 'portrait', note));
  }

  // Takes an image (or canvas) as the reference, keeping an example painting out of the way
  // note: a sentence about the photo itself (it was reduced), said together with the marks line below
  function useSource(img, name, baseName, note) {
    state.source = img;
    state.baseName = baseName || 'portrait';
    setSourceLabel(name, img.naturalWidth || img.width, img.naturalHeight || img.height, false);
    const marks = [
      state.lines.length && 'reference lines', state.measures.length && 'measures', state.plumbs.length && 'plumb lines',
    ].filter(Boolean);
    clearMarks();
    const said = [];
    if (note) said.push(note);
    if (marks.length) {
      const list = marks.length > 1 ? marks.slice(0, -1).join(', ') + ' and ' + marks[marks.length - 1] : marks[0];
      said.push(`${list.charAt(0).toUpperCase() + list.slice(1)} cleared for the new photo.`);
    }
    if (said.length) toast(said.join(' '), note ? 6000 : 1800);
    if (state.art.isExample) setArt(null);
    prepareAndRun(true);
  }

  function loadArtFile(file) {
    readImage(file, (img, note) => {
      setArt(img, file.name || 'Pasted painting', false);
      runSoon(0);
      if (note) toast(note, 5000);
    });
  }

  // Loads whichever image the open tab is about
  const loadForTab = (file) => (checking() ? loadArtFile(file) : loadFile(file));

  function setSourceLabel(name, w, h, isSample) {
    state.isSample = isSample;
    updateToolHint();
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
      checking() ? 'Drop your painting to check it' : 'Drop the portrait to load it';
    els.dropHint.hidden = false;
  });
  // Every drag over the page is claimed, so dropping text, a link or a picture from another tab can
  // never navigate the browser away from the app and lose the work in it.
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropHint.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    els.dropHint.hidden = true;
    if (!hasFiles(e)) {
      const types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
      if (types.includes('text/uri-list') || types.includes('text/html')) toast('Save the picture to your device first, then drop the file here.', 5000);
      return;
    }
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
  // the lean toward lighter tones is a preference, so it is kept between visits
  try { const saved = localStorage.getItem(LEAN_KEY); if (saved !== null && /^\d+$/.test(saved) && +saved <= 100) els.lean.value = saved; } catch (err) { /* the default stays */ }
  updateOutputs();
  els.lean.addEventListener('input', () => {
    updateOutputs();
    try { localStorage.setItem(LEAN_KEY, els.lean.value); } catch (err) { /* kept for this visit only */ }
    runSoon();
  });
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

  document.querySelectorAll('input[name="smoothing"]').forEach((el) =>
    el.addEventListener('change', () => {
      try { localStorage.setItem(SMOOTHING_KEY, el.value); } catch (err) { /* kept for this visit only */ }
      runSoon(0);
    })
  );

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
    toast(added ? `Added ${added} block color${added === 1 ? '' : 's'}` : 'Those colors are already in Picked colors');
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
    const d = state.drawing;
    if (d) els.loupeVal.textContent = 'Tilt ' + lineAngle(d, s.w, s.h) + '°';
    if (d && d.kind === 'measure') els.loupeHex.textContent = measureText(d, d === unitMeasure());
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

  // The loupe on a point given in 0-1 image coordinates, such as a line's end. At the right or
  // bottom edge that is the last pixel, not one past it.
  function loupeAt(canvas, x, y, pointerType) {
    const rect = canvas.getBoundingClientRect();
    const fx = Math.min(x, 1 - 0.5 / canvas.width), fy = Math.min(y, 1 - 0.5 / canvas.height);
    showLoupeFor(canvas, { clientX: rect.left + fx * rect.width, clientY: rect.top + fy * rect.height, pointerType });
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

  // How far (css px) a press can wander and still count as a tap: fingers wobble more than a mouse
  const tapSlop = (e) => (e.pointerType === 'touch' ? 10 : 4);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // Drawing on an image cancels the press's default, which would also have taken focus off a
  // field such as the canvas length. Do that here, or Ctrl/⌘+Z would undo the typing, not the drawing.
  function releaseFocus() {
    const el = document.activeElement;
    if (el && el !== document.body && el.blur) el.blur();
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
        loupeAt(canvas, d.x2, d.y2, e.pointerType); // the loupe follows the line's end
        return;
      }
      const p = state.dragging;
      if (p && p.canvas === canvas) {
        const pt = pointOn(canvas, e);
        p.far = p.far || Math.hypot(e.clientX - p.downX, e.clientY - p.downY) >= tapSlop(e);
        // a new point follows the pointer at once; a placed one stays put until it is clearly dragged
        if (p.index < 0 || p.far) {
          p.x = clamp01(pt.x + p.dx);
          p.y = clamp01(pt.y + p.dy);
          if (p.index >= 0) state.plumbs[p.index] = { x: p.x, y: p.y };
          drawAllOverlays();
        }
        loupeAt(canvas, p.x, p.y, e.pointerType);
        return;
      }
      if (state.tool === 'plumb') canvas.classList.toggle('on-ring', plumbAt(canvas, e) >= 0);
      if (!magnifying() || (e.pointerType === 'touch' && !down)) return;
      showLoupeFor(canvas, e);
    });
    canvas.addEventListener('pointerleave', (e) => {
      canvas.classList.remove('on-ring');
      if (e.pointerType === 'touch' || state.drawing || state.dragging) return;
      els.loupe.hidden = true;
      state.hover = null;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      down = { x: e.clientX, y: e.clientY };
      if (state.picking) return;
      if (state.tool === 'line' || state.tool === 'measure') {
        if (!canvas.width) return;
        e.preventDefault();
        releaseFocus();
        canvas.setPointerCapture(e.pointerId);
        const pt = pointOn(canvas, e);
        state.drawing = { canvas, kind: state.tool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, color: state.lineColor };
        showLoupeFor(canvas, e);
        return;
      }
      if (state.tool === 'plumb') {
        if (!canvas.width) return;
        e.preventDefault();
        releaseFocus();
        canvas.setPointerCapture(e.pointerId);
        // press on a ring to move or remove that point; anywhere else drops a new one
        const pt = pointOn(canvas, e);
        const index = plumbAt(canvas, e);
        const at = index >= 0 ? state.plumbs[index] : pt;
        state.dragging = {
          canvas, index, from: { x: at.x, y: at.y }, x: at.x, y: at.y,
          dx: at.x - pt.x, dy: at.y - pt.y, downX: e.clientX, downY: e.clientY, far: false,
        };
        if (index >= 0) canvas.classList.add('is-dragging');
        drawAllOverlays();
        loupeAt(canvas, at.x, at.y, e.pointerType);
        return;
      }
      if (e.pointerType === 'touch' && magnifying()) showLoupeFor(canvas, e);
    });
    canvas.addEventListener('pointercancel', () => {
      down = null;
      if (state.drawing) { state.drawing = null; drawAllOverlays(); }
      cancelDrag();
      els.loupe.hidden = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      const start = down;
      down = null;
      const d = state.drawing;
      if (d && d.canvas === canvas) {
        state.drawing = null;
        const len = Math.hypot((d.x2 - d.x1) * canvas.width, (d.y2 - d.y1) * canvas.height);
        const rect = canvas.getBoundingClientRect();
        const cssLen = Math.hypot((d.x2 - d.x1) * rect.width, (d.y2 - d.y1) * rect.height);
        if (d.kind === 'measure') {
          // a tap or a slip would make a near-zero unit and blow every other length up
          if (len >= 4 && cssLen >= 10) {
            state.measures.push({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 });
            record({ kind: 'measure', op: 'add' });
          } else {
            toast('Drag from one point to another to measure the length between them');
          }
        } else if (len >= 4) {
          state.lines.push({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, color: d.color });
          record({ kind: 'line', op: 'add' });
        }
        drawAllOverlays();
        // the drag is over, and with it the loupe's length and tilt
        els.loupe.hidden = true;
        return;
      }
      const p = state.dragging;
      if (p && p.canvas === canvas) {
        state.dragging = null;
        canvas.classList.remove('is-dragging');
        if (p.index < 0) {
          // a tap drops the point where the finger came down, not where it wobbled to
          state.plumbs.push(p.far ? { x: p.x, y: p.y } : p.from);
          record({ kind: 'plumb', op: 'add' });
        } else if (p.far) {
          record({ kind: 'plumb', op: 'move', index: p.index, from: p.from });
        } else {
          state.plumbs.splice(p.index, 1);
          record({ kind: 'plumb', op: 'remove', index: p.index, plumb: p.from });
        }
        if (e.pointerType === 'touch') els.loupe.hidden = true;
        return;
      }
      if (!start || e.button > 0 || !magnifying()) return;
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
      // the accuracy map's tints are not colors worth keeping; a drag cancelled with Esc ends here too
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
      const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 255;
      return Array.isArray(list) ? list.filter((c) => c && typeof c === 'object' && ok(c.r) && ok(c.g) && ok(c.b)) : [];
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
      if (!quiet) toast(`${hex} is already in Picked colors`);
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
    els.swatches.replaceChildren();
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
        // keep keyboard focus in the list: the next remove button, the one before, or the drawer's header
        if (focused) {
          const rest = els.swatches.querySelectorAll('.swatch-remove');
          (rest[Math.min(index, rest.length - 1)] || els.drawers.swatches.querySelector('summary')).focus();
        }
      });

      li.append(chip, meta, remove);
      els.swatches.append(li);
    });
    const n = list.length;
    els.palCount.textContent = n ? `${n} color${n === 1 ? '' : 's'}` : '';
    els.drawerState.swatches.textContent = n ? `${n} color${n === 1 ? '' : 's'}` : 'None yet';
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
    g.fillStyle = '#faf5ea';
    g.fillRect(0, 0, c.width, c.height);
    list.forEach((col, i) => {
      const x = pad + (i % cols) * (sw + gap);
      const y = pad + Math.floor(i / cols) * (sw + lab + gap);
      g.fillStyle = toHex(col);
      g.fillRect(x, y, sw, sw);
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.strokeRect(x + 0.5, y + 0.5, sw - 1, sw - 1);
      g.fillStyle = '#1e2b22';
      g.font = '600 20px "IBM Plex Mono", monospace';
      g.fillText(toHex(col), x, y + sw + 26);
      g.fillStyle = '#5c6157';
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

  // Draws the grid, plumb lines, reference lines and measures into a context of size W x H.
  // `unit` is one line-width step in pixels; `avoid` lists labels already on the image (0-1 boxes).
  function drawOverlayContent(g, W, H, unit, avoid) {
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
    drawPlumbs(g, W, H, unit);
    const d = state.drawing;
    const lines = d && d.kind === 'line' ? state.lines.concat(d) : state.lines;
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
    drawMeasures(g, W, H, unit, avoid);
    if (window.Loomis) Loomis.draw(g, W, H, unit);
  }

  // The accuracy map has its percentages burned in: measure labels keep off them
  const labelsOn = (canvas) => (canvas === els.canvases.diff && state.art.cmp && state.art.cmp.labelBoxes) || null;

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
    drawOverlayContent(o.getContext('2d'), W, H, dpr, labelsOn(canvas));
  }

  function drawAllOverlays() {
    Object.values(els.canvases).forEach(syncOverlay);
    updateToolbar();
  }

  // The tool bar: which tool is on, how many lines, measures and plumb points each has drawn, and the grid
  function updateToolbar() {
    const counts = { line: state.lines.length, measure: state.measures.length, plumb: state.plumbs.length };
    els.toolBtns.forEach((b) => {
      const t = b.dataset.tool;
      b.setAttribute('aria-pressed', String(state.tool === t));
      if (counts[t]) b.dataset.count = counts[t]; else delete b.dataset.count;
    });
    els.gridBtn.setAttribute('aria-pressed', String(!!state.grid));
    els.gridBtn.setAttribute('aria-label', state.grid ? `Grid: ${state.grid} × ${state.grid}` : 'Grid: off');
    els.gridBadge.hidden = !state.grid;
    els.gridBadge.textContent = state.grid ? `${state.grid}×${state.grid}` : '';
  }

  // Shows the magnified color under the pointer only with the magnifier on, or while picking a neutral spot
  const magnifying = () => state.tool === 'sample' || state.picking;

  function setTool(tool) {
    state.tool = tool;
    ['line', 'measure', 'plumb', 'none'].forEach((t) => document.body.classList.toggle('tool-' + t, state.tool === t));
    if (!magnifying()) els.loupe.hidden = true;
    updateToolHint();
    updateToolbar();
    window.dispatchEvent(new CustomEvent('studio:tool', { detail: tool }));
  }

  // A copy of an image with the grid, lines, measures and plumb lines burned in, for saving
  function withOverlay(canvas) {
    if (!state.grid && !state.lines.length && !state.measures.length && !state.plumbs.length && !(window.Loomis && Loomis.has())) return canvas;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const g = out.getContext('2d');
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    drawOverlayContent(layer.getContext('2d'), layer.width, layer.height, Math.max(1, Math.max(canvas.width, canvas.height) / 500), labelsOn(canvas));
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

  // ---- Measures and plumb lines --------------------------------------------

  const UNIT_COLOR = '#ffd21f';
  const MEASURE_COLOR = '#ffffff';
  const RING = 7;       // css px: radius of the ring on a plumb point
  const RING_HIT = 12;  // css px: how near a press must land to grab a ring (a finger gets 18)

  // A measure's length on the reference's pixel grid, so every image and working size agrees
  function lengthOf(m) {
    return Math.hypot((m.x2 - m.x1) * state.prep.w, (m.y2 - m.y1) * state.prep.h);
  }

  // The unit (1 U): the first measure, or the one made the unit since. While the first measure
  // is still being dragged out, that one.
  function unitMeasure() {
    if (state.measures.length) return state.measures[state.unitIndex];
    const d = state.drawing;
    return d && d.kind === 'measure' ? d : null;
  }

  // The nearest whole number, half, third or quarter, written the way an artist would say it, or ''
  // if the length as shown (to two places) is not within 0.03 of one, nor within 4% of one that
  // small: 0.48 and 0.52 U are both ½, 0.24 and 0.26 U both ¼, and 0.36 U is not ⅓
  const FRACTIONS = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾' };
  function nearestFraction(r) {
    const shown = Math.round(r * 100) / 100;
    for (let d = 1; d <= 4; d++) {
      const n = Math.round(shown * d);
      // (the 1e-9 absorbs floating-point error, so 1.97 counts as within 0.03 of 2, as 2.03 does)
      if (!n || Math.abs(n / d - shown) > Math.min(0.03, 0.04 * n / d) + 1e-9) continue;
      const whole = Math.floor(n / d), rest = n % d;
      return (whole || !rest ? String(whole) : '') + (rest ? FRACTIONS[rest + '/' + d] : '');
    }
    return '';
  }

  // Centimeters to a tenth; inches to the nearest eighth, as on a ruler
  const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
  function formatSize(v, sys) {
    if (sys === 'in') {
      const e = Math.round(v * 8);
      const whole = Math.floor(e / 8), rest = e % 8;
      return (whole || !rest ? whole : '') + EIGHTHS[rest] + ' in';
    }
    return Math.round(v * 10) / 10 + ' cm';
  }

  // The unit's length on the student's canvas, or null while it isn't set
  function canvasSize() {
    const v = parseFloat(els.canvasSize.value);
    return v > 0 && v < 10000 ? { value: v, sys: els.canvasSys.value } : null;
  }

  function loadCanvasSize() {
    try {
      const saved = JSON.parse(localStorage.getItem(CANVAS_KEY) || 'null');
      if (saved && +saved.value > 0) els.canvasSize.value = +saved.value;
      if (saved && (saved.sys === 'cm' || saved.sys === 'in')) els.canvasSys.value = saved.sys;
    } catch (err) {
      /* nothing saved, or storage unavailable: start empty */
    }
  }

  function saveCanvasSize() {
    try {
      localStorage.setItem(CANVAS_KEY, JSON.stringify({ value: els.canvasSize.value, sys: els.canvasSys.value }));
    } catch (err) {
      /* storage unavailable: the size still works for this visit */
    }
  }

  // "1.48 U ≈ 1½ · 13.3 cm": the length in units, the nearest simple fraction, and how long to
  // make it on the canvas once the unit's length there is set. Brief, just "1.48 U".
  function measureText(m, isUnit, brief) {
    const r = isUnit ? 1 : lengthOf(m) / lengthOf(unitMeasure());
    if (brief) return isUnit ? '1 U' : r.toFixed(2) + ' U';
    const f = isUnit ? '' : nearestFraction(r);
    let text = isUnit ? '1 U' : r.toFixed(2) + ' U' + (f ? ' ≈ ' + f : '');
    const size = canvasSize();
    if (size) text += ' · ' + formatSize(r * size.value, size.sys);
    return text;
  }

  // Label pills, shared by the measures and the accuracy map's percentages
  const PILLS = {
    dark: { fill: 'rgba(20, 21, 24, 0.78)', ink: '#ffffff' },
    light: { fill: '#ffffff', ink: '#1c1d20', ring: '#1c1d20' },
    unit: { fill: UNIT_COLOR, ink: '#1c1d20', ring: '#1c1d20' },
  };

  function pillSize(g, text, font) {
    g.font = `600 ${font}px "IBM Plex Mono", ui-monospace, monospace`;
    return { w: g.measureText(text).width + font * 0.9, h: font * 1.45 };
  }

  // Where a pill of that size goes when centred on (cx, cy): the whole label stays inside the picture
  const PILL_PAD = 3; // px between a label and the picture's edge
  function pillBox(size, cx, cy, W, H) {
    return {
      x: Math.max(PILL_PAD, Math.min(W - size.w - PILL_PAD, cx - size.w / 2)),
      y: Math.max(PILL_PAD, Math.min(H - size.h - PILL_PAD, cy - size.h / 2)),
      w: size.w,
      h: size.h,
    };
  }

  // Draws a label centred on (cx, cy) in a W x H picture and returns the box it took
  function drawPill(g, text, cx, cy, font, look, W, H) {
    const b = pillBox(pillSize(g, text, font), cx, cy, W, H);
    const style = PILLS[look];
    g.beginPath();
    if (g.roundRect) g.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
    else g.rect(b.x, b.y, b.w, b.h);
    g.fillStyle = style.fill;
    g.fill();
    if (style.ring) {
      g.lineWidth = Math.max(1.5, font / 7);
      g.strokeStyle = style.ring;
      g.stroke();
    }
    g.fillStyle = style.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + font * 0.05);
    return b;
  }

  // Measures read like dimension lines: a tick across each end, the unit thicker and yellow
  function drawMeasures(g, W, H, unit, avoid) {
    const d = state.drawing;
    const list = d && d.kind === 'measure' ? state.measures.concat(d) : state.measures;
    if (!list.length) return;
    const unitLine = unitMeasure();
    const marks = list.map((m) => {
      const isUnit = m === unitLine;
      const x1 = m.x1 * W, y1 = m.y1 * H, x2 = m.x2 * W, y2 = m.y2 * H;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
      const tick = (isUnit ? 6 : 5) * unit;
      return {
        m, isUnit, x1, y1, x2, y2, len, ux, uy, tick,
        halo: (isUnit ? 6 : 4.5) * unit,
        // the line, then the tick across each end
        segs: [
          [x1, y1, x2, y2],
          [x1 + uy * tick, y1 - ux * tick, x1 - uy * tick, y1 + ux * tick],
          [x2 + uy * tick, y2 - ux * tick, x2 - uy * tick, y2 + ux * tick],
        ],
      };
    });
    const font = Math.round(Math.min(13, Math.max(11, Math.min(W, H) / unit / 30)) * unit);
    const placed = labelsFor(g, marks, W, H, unit, avoid, font);
    const strokeMark = (k) => {
      g.beginPath();
      k.segs.forEach(([ax, ay, bx, by]) => { g.moveTo(ax, ay); g.lineTo(bx, by); });
      g.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      g.lineWidth = k.halo;
      g.stroke();
      g.strokeStyle = k.isUnit ? UNIT_COLOR : MEASURE_COLOR;
      g.lineWidth = (k.isUnit ? 3.5 : 2) * unit;
      g.stroke();
    };
    // The leaders go over the other lines but under the unit, which goes on last: neither a later
    // measure along its path nor a leader ending there can hide its yellow. The labels go on top.
    marks.filter((k) => !k.isUnit).forEach(strokeMark);
    placed.forEach(({ i, leader }) => {
      if (!leader) return;
      const color = marks[i].isUnit ? UNIT_COLOR : MEASURE_COLOR;
      g.beginPath();
      g.moveTo(leader.px, leader.py);
      g.lineTo(leader.qx, leader.qy);
      g.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      g.lineWidth = 3 * unit;
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = 1.25 * unit;
      g.stroke();
      g.beginPath();
      g.arc(leader.px, leader.py, 2.5 * unit, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
    });
    marks.filter((k) => k.isUnit).forEach(strokeMark);
    placed.forEach(({ i, text, b }) => {
      drawPill(g, text, b.x + b.w / 2, b.y + b.h / 2, font, marks[i].isUnit ? 'unit' : 'dark', W, H);
    });
  }

  // Where the labels go, the unit's first, then the rest in the order the measures were made.
  // Each tries spots beside its line, sliding along it from the middle, on either side, and
  // stepping away from it, then just past either end. A spot must keep clear of the labels and
  // leaders already placed, of the accuracy map's percentages, and of its own line and ticks. Of
  // those, the spot nearest the middle of the line wins, plus a penalty for each length of another
  // line it would hide. A label set out from its line, or with another measure as near to it as its
  // own, gets a thin leader back to its line and costs more, more again when the other measure is
  // nearer. A leader never passes behind a label, and where it can it neither runs along another
  // line nor crosses a percentage. When no spot near the line is good, spots across the whole
  // picture are tried too. Covering another measure's end tick, where a length is read, or crossing
  // another leader is a foul, made only when there is no other way, not even with the length in
  // units alone in place of the whole reading. While a label is left out or fouls, it gets an
  // earlier turn and the layout is tried again, up to twice. Lines too short to show between their
  // ticks go without, as do labels that still find no room or are too big for the picture; the
  // loupe still reads them while drawing.
  // While a measure is dragged out, the other labels stay put and only its own is placed, near its
  // line, so a drag stays quick however many measures there are. All are placed afresh when it lands.
  const labelLayouts = new Map(); // recent layouts by what they depend on: the images in a view share one
  function labelsFor(g, marks, W, H, unit, avoid, font) {
    // the reference lines count too, with their end dots (one being drawn once it is let go)
    const lines = state.lines.map((l) => {
      const x1 = l.x1 * W, y1 = l.y1 * H, x2 = l.x2 * W, y2 = l.y2 * H;
      return { x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1), halo: 6.4 * unit, segs: [[x1, y1, x2, y2]] };
    });
    const texts = marks.map((k) => [measureText(k.m, k.isUnit), measureText(k.m, k.isUnit, true)]);
    // the label widths count too, as the label font may load between two draws
    const widths = texts.map((t) => t.map((text) => pillSize(g, text, font).w));
    const keyOf = (n, dragging) => JSON.stringify([W, H, unit, avoid, texts.slice(0, n), widths.slice(0, n),
      marks.slice(0, n).map((k) => k.segs[0]), lines.map((l) => l.segs[0]), dragging]);
    const d = state.drawing;
    const settled = marks.length - (d && d.kind === 'measure' ? 1 : 0);
    let placed = layoutFor(keyOf(settled, false), () => layOutLabels(g, marks.slice(0, settled), texts, lines, W, H, unit, avoid, font));
    if (settled < marks.length) {
      const base = placed;
      placed = layoutFor(keyOf(marks.length, true), () => layOutLabels(g, marks, texts, lines, W, H, unit, avoid, font, base));
    }
    return placed;
  }

  // A layout made before for the same key, or a new one; the dozen used last are kept
  function layoutFor(key, make) {
    let placed = labelLayouts.get(key);
    if (placed) labelLayouts.delete(key);
    else placed = make();
    labelLayouts.set(key, placed);
    if (labelLayouts.size > 12) labelLayouts.delete(labelLayouts.keys().next().value);
    return placed;
  }

  // Where each measure's label goes, as above: [{ i (its measure), text, b (its box), leader, fouls }].
  // Given `base`, the layout of all but the last measure, it keeps that and places the last label.
  function layOutLabels(g, marks, texts, lines, W, H, unit, avoid, font, base) {
    const gap = 2 * unit;
    const reach = 2.5 * unit; // how far a leader, with the dot at its end, reaches either side
    // the cost of a foul, an end tick covered or a leader crossed, so one is made only when there is
    // no other way: a spot's cost is its fouls times this, plus the rest
    const FOUL = 1e6;
    const grow = (b, r) => ({ x: b.x - r, y: b.y - r, w: b.w + 2 * r, h: b.h + 2 * r });
    let labels = [], leaders = []; // those placed so far
    // the accuracy map's percentages are part of the picture: lines and leaders go over them
    const percents = (avoid || []).map((b) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H }));
    // Does a leader pass under a box, or close enough to seem to run into it? Most are ruled out at a glance.
    const under = (l, b) => {
      const r = gap + reach;
      if (Math.max(l.qx, l.px) < b.x - r || Math.min(l.qx, l.px) > b.x + b.w + r ||
        Math.max(l.qy, l.py) < b.y - r || Math.min(l.qy, l.py) > b.y + b.h + r) return false;
      return !!clipToBox(l.qx, l.qy, l.px, l.py, grow(b, r));
    };
    const touch = (b, t) => b.x < t.x + t.w + gap && t.x < b.x + b.w + gap && b.y < t.y + t.h + gap && t.y < b.y + b.h + gap;
    const crowded = (b) => labels.some((t) => touch(b, t)) || percents.some((t) => touch(b, t));
    // every line with the reach of its dark edge and ticks, so most can be ruled out at a glance
    const strokes = marks.concat(lines).map((o) => {
      const r = o.halo / 2 + (o.tick || 0);
      return Object.assign({}, o, {
        left: Math.min(o.x1, o.x2) - r, right: Math.max(o.x1, o.x2) + r,
        top: Math.min(o.y1, o.y2) - r, bottom: Math.max(o.y1, o.y2) + r,
      });
    });
    const apart = (o, b) => Math.hypot(Math.max(o.left - b.x - b.w, 0, b.x - o.right), Math.max(o.top - b.y - b.h, 0, b.y - o.bottom));
    // What a label in box b hides of another line: a little for each length of line under it, and a
    // foul for each end tick
    const hidden = (o, b) => {
      if (apart(o, b) > 0) return 0;
      const big = grow(b, o.halo / 2);
      let sum = 0;
      for (let n = 0; n < o.segs.length; n++) {
        const [ax, ay, bx, by] = o.segs[n];
        const part = clipToBox(ax, ay, bx, by, big);
        if (part) sum += n ? FOUL : (part[1] - part[0]) * o.len / 2;
      }
      return sum;
    };

    // The best clear spot for a label of that size on measure i, as { cost, b (its box), leader }, or
    // null. Quick, it only looks near the line.
    const findSpot = (i, size, quick) => {
      const k = marks[i], own = strokes[i];
      const { x1, y1, x2, y2, len, ux, uy } = k;
      const others = strokes.filter((o) => o !== own);
      // first choice: above a level line, right of an upright one
      let nx = uy, ny = -ux;
      if (Math.abs(ny) >= Math.abs(nx) ? ny > 0 : nx < 0) { nx = -nx; ny = -ny; }
      const clear = k.tick + k.halo / 2 + gap; // from the line to the near edge of its label
      const across = (Math.abs(nx) * size.w + Math.abs(ny) * size.h) / 2;
      const along = (Math.abs(ux) * size.w + Math.abs(uy) * size.h) / 2;
      const step = size.h / 2;

      // Is a point on another line, or close enough to pass for part of it?
      const onOther = (x, y) => others.some((o) =>
        x > o.left - gap && x < o.right + gap && y > o.top - gap && y < o.bottom + gap &&
        pointToLine(x, y, o.x1, o.y1, o.x2, o.y2) < o.halo / 2 + gap);
      // The leader from a label to the middle half of its line by the best way that passes behind
      // no label, and its cost: its length, plus a penalty for any part (its dot included) that
      // would pass for part of another line and for each percentage it crosses, and a foul for each
      // leader it crosses. Null if there is no way, or none that costs less than `limit`.
      const leaderTo = (b, limit) => {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const s0 = Math.max(len / 4, Math.min(len * 3 / 4, (cx - x1) * ux + (cy - y1) * uy));
        let best = null;
        [s0].concat([0.5, 0.375, 0.625, 0.25, 0.75].map((t) => t * len)).forEach((s) => {
          const px = x1 + ux * s, py = y1 + uy * s, dx = px - cx, dy = py - cy;
          const f = Math.min(1, b.w / 2 / (Math.abs(dx) || 1e-6), b.h / 2 / (Math.abs(dy) || 1e-6));
          const l = { px, py, qx: cx + dx * f, qy: cy + dy * f };
          const length = Math.hypot(px - l.qx, py - l.qy);
          if (length >= (best ? best.cost : limit) || labels.some((t) => under(l, t))) return;
          let lost = 0;
          for (let n = 1; n <= 6; n++) if (onOther(l.qx + (px - l.qx) * n / 6, l.qy + (py - l.qy) * n / 6)) lost++;
          const crossed = leaders.filter((o) => linesCross(l.qx, l.qy, px, py, o.qx, o.qy, o.px, o.py)).length;
          const over = percents.filter((t) => under(l, t)).length;
          const cost = length + (lost / 6 * 4 + over) * size.h + crossed * FOUL;
          if (cost < (best ? best.cost : limit)) best = Object.assign(l, { cost });
        });
        return best;
      };

      let best = null;
      const beats = (cost) => cost < (best ? best.cost : Infinity);
      const consider = (cx, cy, bias) => {
        const b = pillBox(size, cx, cy, W, H);
        if (crowded(b)) return;
        const away = gapToBox(x1, y1, x2, y2, b);
        if (away < clear - 0.5) return;
        const drift = Math.abs((b.x + b.w / 2 - x1) * ux + (b.y + b.h / 2 - y1) * uy - len / 2);
        let cost = away + drift / 4 + bias;
        const out = away > clear + step + 0.5; // set out from its line, so a leader adds at least size.h
        if (!beats(out ? cost + size.h : cost) || leaders.some((l) => under(l, b))) return;
        for (let n = 0; n < others.length && beats(cost); n++) cost += hidden(others[n], b);
        if (!beats(cost)) return;
        // It needs a leader when set out from its line, or when another measure is as near. Nearer
        // another measure than its own, it costs more again: at a glance it reads as that one's.
        let near = Infinity; // the nearest other measure, looked for only as far as its own line
        others.some((o) => {
          if (o.m && apart(o, b) <= Math.min(away, near)) near = Math.min(near, gapToBox(o.x1, o.y1, o.x2, o.y2, b));
          return near < away;
        });
        let leader = null;
        if (out || near <= away) {
          const extra = near < away ? 2 * size.h : size.h;
          if (!beats(cost + extra)) return;
          leader = leaderTo(b, best ? best.cost - cost - extra + away : Infinity);
          if (!leader) return;
          cost += extra + leader.cost - away;
        }
        if (beats(cost)) best = { cost, b, leader };
      };
      const slideTo = len / 2 + along / 2; // a label may slide until a quarter of it is past the end
      const slide = Math.max(size.h, slideTo / 4);
      // further along or further out only costs more, once a spot has been found
      for (let a = 0; a <= slideTo && beats(clear + a / 4); a += slide) {
        (a ? [a, -a] : [0]).forEach((da) => [1, -1].forEach((side) => {
          for (let j = 0; j <= 12 && beats(clear + j * step + a / 4); j++) {
            const off = (clear + across + j * step) * side;
            const cx = x1 + ux * (len / 2 + da) + nx * off, cy = y1 + uy * (len / 2 + da) + ny * off;
            if (cx < 0 || cx > W || cy < 0 || cy > H) break;
            consider(cx, cy, side < 0 ? unit : 0);
          }
        }));
      }
      consider(x1 - ux * (clear + along), y1 - uy * (clear + along), 0);
      consider(x2 + ux * (clear + along), y2 + uy * (clear + along), 0);
      if (!quick && !(best && best.cost <= 2 * (clear + size.h))) {
        // across the whole picture, nearest the line first, until no spot left can do better: none
        // costs less than its distance from the line, plus size.h once that calls for a leader, so
        // those further than the best so far are skipped
        const far = (best ? best.cost : Infinity) + Math.hypot(size.w, size.h) / 2;
        const spots = [];
        for (let cy = size.h / 2; cy < H; cy += size.h) {
          for (let cx = size.w / 2; cx < W; cx += size.h) {
            const b = pillBox(size, cx, cy, W, H), mx = b.x + b.w / 2, my = b.y + b.h / 2;
            if (mx < Math.min(x1, x2) - far || mx > Math.max(x1, x2) + far || my < Math.min(y1, y2) - far || my > Math.max(y1, y2) + far) continue;
            const low = pointToLine(mx, my, x1, y1, x2, y2) - Math.hypot(b.w, b.h) / 2;
            spots.push({ cx, cy, low: low > clear + step + 0.5 ? low + size.h : low });
          }
        }
        spots.sort((p, q) => p.low - q.low);
        for (let n = 0; n < spots.length && beats(spots[n].low); n++) consider(spots[n].cx, spots[n].cy, 0);
      }
      return best;
    };

    // Places the labels in that order after those in `base`, each in the best spot left to it
    const run = (order) => {
      const placed = base ? base.slice() : [];
      labels = placed.map((p) => p.b);
      leaders = placed.filter((p) => p.leader).map((p) => p.leader);
      order.forEach((i) => {
        const tries = texts[i][0] === texts[i][1] ? [texts[i][0]] : texts[i];
        // the whole reading, or else the length alone, where it fouls nothing; failing both, the one
        // with the fewest fouls
        let pick = null;
        tries.some((text) => {
          const size = pillSize(g, text, font);
          if (size.w + 2 * PILL_PAD > W || size.h + 2 * PILL_PAD > H) return false;
          const spot = findSpot(i, size, !!base);
          if (spot && (!pick || spot.cost < Math.floor(pick.cost / FOUL) * FOUL)) pick = Object.assign(spot, { text });
          return pick && pick.cost < FOUL;
        });
        if (!pick) return;
        labels.push(pick.b);
        if (pick.leader) leaders.push(pick.leader);
        placed.push({ i, text: pick.text, b: pick.b, leader: pick.leader, fouls: Math.floor(pick.cost / FOUL) });
      });
      return placed;
    };
    const unitFirst = (a, b) => marks[b].isUnit - marks[a].isUnit;
    const order = marks.map((k, i) => i).filter((i) => marks[i].len >= 12 * unit).sort(unitFirst);
    if (base) return run(order.filter((i) => i === marks.length - 1));
    // How badly a label fared: left out, over an end tick or across a leader, or cut to the length alone
    const trouble = (placed, i) => {
      const p = placed.find((q) => q.i === i);
      return !p ? 100 : 10 * p.fouls + (p.text !== texts[i][0] ? 1 : 0);
    };
    const total = (placed) => order.reduce((sum, i) => sum + trouble(placed, i), 0);
    // While a label is left out or fouls, those that fared badly get an earlier turn, the worst
    // first, as those placed before them may have crowded them out. The layout that fares best stays.
    let turn = order, placed = run(turn), best = placed;
    for (let n = 0; n < 2 && turn.some((i) => trouble(placed, i) >= 10); n++) {
      const last = placed;
      turn = turn.slice().sort((a, b) => trouble(last, b) - trouble(last, a)).sort(unitFirst);
      placed = run(turn);
      if (total(placed) < total(best)) best = placed;
    }
    return best;
  }

  // The part of a line from (x1, y1) to (x2, y2) inside a box, as fractions [t0, t1] of the way
  // along it, or null if it misses (Liang-Barsky clipping)
  function clipToBox(x1, y1, x2, y2, b) {
    const p = [x1 - x2, x2 - x1, y1 - y2, y2 - y1];
    const q = [x1 - b.x, b.x + b.w - x1, y1 - b.y, b.y + b.h - y1];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (!p[i]) {
        if (q[i] < 0) return null;
        continue;
      }
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
    return [t0, t1];
  }

  // Distance from a point to the line from (x1, y1) to (x2, y2)
  function pointToLine(x, y, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x1 + dx * t - x, y1 + dy * t - y);
  }

  // Whether the line from (ax, ay) to (bx, by) crosses the one from (cx, cy) to (dx, dy)
  function linesCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const side = (px, py, qx, qy, x, y) => Math.sign((qx - px) * (y - py) - (qy - py) * (x - px));
    return side(ax, ay, bx, by, cx, cy) * side(ax, ay, bx, by, dx, dy) < 0 &&
      side(cx, cy, dx, dy, ax, ay) * side(cx, cy, dx, dy, bx, by) < 0;
  }

  // Shortest distance between a line from (x1, y1) to (x2, y2) and a box: 0 where they touch,
  // otherwise from an end of the line to the box or from a corner of the box to the line
  function gapToBox(x1, y1, x2, y2, b) {
    if (clipToBox(x1, y1, x2, y2, b)) return 0;
    const toBox = (x, y) => Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));
    const toLine = (x, y) => pointToLine(x, y, x1, y1, x2, y2);
    return Math.min(toBox(x1, y1), toBox(x2, y2),
      toLine(b.x, b.y), toLine(b.x + b.w, b.y), toLine(b.x, b.y + b.h), toLine(b.x + b.w, b.y + b.h));
  }

  // Each plumb point drops a dashed plumb line and level across the whole picture, ringed where they cross
  function drawPlumbs(g, W, H, unit) {
    const p = state.dragging;
    const list = (p && p.index < 0 ? state.plumbs.concat(p) : state.plumbs).map((pt) => ({
      x: Math.min(Math.round(pt.x * W), W - 1) + 0.5,
      y: Math.min(Math.round(pt.y * H), H - 1) + 0.5,
    }));
    if (!list.length) return;
    g.save();
    g.lineCap = 'butt';
    g.setLineDash([6 * unit, 5 * unit]);
    g.beginPath();
    list.forEach(({ x, y }) => {
      g.moveTo(x, 0); g.lineTo(x, H);
      g.moveTo(0, y); g.lineTo(W, y);
    });
    g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    g.lineWidth = 3 * unit;
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.25 * unit;
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    list.forEach(({ x, y }) => {
      g.moveTo(x + RING * unit, y);
      g.arc(x, y, RING * unit, 0, Math.PI * 2);
    });
    g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    g.lineWidth = 3.5 * unit;
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5 * unit;
    g.stroke();
    g.restore();
  }

  // Index of the plumb point whose ring is under the pointer (the nearest one in reach), or -1
  function plumbAt(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    let found = -1, nearest = e.pointerType === 'touch' ? 18 : RING_HIT;
    state.plumbs.forEach((p, i) => {
      const dist = Math.hypot(rect.left + p.x * rect.width - e.clientX, rect.top + p.y * rect.height - e.clientY);
      if (dist <= nearest) { found = i; nearest = dist; }
    });
    return found;
  }

  // Esc or a cancelled touch puts a dragged point back where it was
  function cancelDrag() {
    const p = state.dragging;
    if (!p) return;
    if (p.index >= 0) state.plumbs[p.index] = p.from;
    p.canvas.classList.remove('is-dragging');
    state.dragging = null;
    drawAllOverlays();
  }

  // How big a grid cell is in units (and on the canvas), for the hint
  function gridNote() {
    const u = state.measures.length && state.prep ? lengthOf(unitMeasure()) : 0;
    if (!u || !state.grid) return '';
    const cw = state.prep.w / state.grid / u, ch = state.prep.h / state.grid / u;
    const size = canvasSize();
    const on = size ? ` (${formatSize(cw * size.value, size.sys)} × ${formatSize(ch * size.value, size.sys)} on your canvas)` : '';
    return `A grid cell is ${cw.toFixed(2)} U wide and ${ch.toFixed(2)} U tall${on}.`;
  }

  const TOOL_HINTS = {
    sample: 'Hover any image to see the color under the pointer, magnified, with its value. Click to keep it in Picked colors.',
    none: 'No tool is on, so touching an image scrolls the page. Choose a tool to use it.',
    line: 'Drag on any image to draw a line. It appears on every image. Hold Shift to snap to 15°. The loupe shows the angle.',
    measure: 'Choose a unit you can see on the sitter, such as eye line to chin, and drag across it first: it becomes 1 U. Then drag across any other length to compare it with the unit. Hold Shift to snap to 15°.',
    plumb: 'Click an image to drop a plumb line and a level through that point, on every image, and see what lines up with it. Drag a ring to move it; click a ring to remove it.',
  };

  function updateToolHint() {
    const parts = [TOOL_HINTS[state.tool]];
    if (state.tool === 'measure') {
      parts.push(gridNote(), state.isSample
        ? 'On the sample, try eye line to chin, then the width of the face at the cheekbones.'
        : 'Lengths are true to the photo, not the sitter: a phone held close enlarges the nose, so measure photos taken from 1.5 m or more, zoomed in.');
    }
    els.toolHint.textContent = parts.filter(Boolean).join(' ');
  }

  // ---- Undo ---------------------------------------------------------------

  // Lines, measures and plumb points share one undo list, oldest step first. Ctrl/⌘+Z undoes the
  // newest step of any kind, and each tool's Undo button the newest step of its own kind. A step
  // only changes its own kind's list, so undoing one kind out of turn leaves the others intact.
  const UNDONE = {
    'line:add': 'Line removed',
    'measure:add': 'Measure removed',
    'measure:unit': 'Unit set back',
    'plumb:add': 'Plumb line removed',
    'plumb:move': 'Plumb line moved back',
    'plumb:remove': 'Plumb line put back',
  };

  function record(step) {
    state.history.push(step);
    updateToolButtons();
    drawAllOverlays();
  }

  // Undoes the newest step (of one kind, if given) and says what changed, or '' if nothing did
  function undo(kind) {
    const h = state.history;
    let i = h.length - 1;
    while (i >= 0 && kind && h[i].kind !== kind) i--;
    if (i < 0) return '';
    const step = h.splice(i, 1)[0];
    const what = step.kind + ':' + step.op;
    if (what === 'line:add') state.lines.pop();
    else if (what === 'measure:add') state.measures.pop();
    else if (what === 'measure:unit') state.unitIndex = step.prev;
    else if (what === 'plumb:add') state.plumbs.pop();
    else if (what === 'plumb:move') state.plumbs[step.index] = step.from;
    else if (what === 'plumb:remove') state.plumbs.splice(step.index, 0, step.plumb);
    if (state.unitIndex >= state.measures.length) state.unitIndex = 0;
    updateToolButtons();
    drawAllOverlays();
    return UNDONE[what];
  }

  function clearKind(kind) {
    state.history = state.history.filter((step) => step.kind !== kind);
    if (kind === 'line') state.lines = [];
    if (kind === 'measure') { state.measures = []; state.unitIndex = 0; }
    if (kind === 'plumb') state.plumbs = [];
    updateToolButtons();
    drawAllOverlays();
  }

  // A new photo starts clean: the old lines, measures and plumb points were placed on another face
  function clearMarks() {
    Object.assign(state, { lines: [], measures: [], unitIndex: 0, plumbs: [], history: [] });
    if (window.Loomis) Loomis.reset();
    updateToolButtons();
    drawAllOverlays();
  }

  function updateToolButtons() {
    const has = (kind) => state.history.some((step) => step.kind === kind);
    const last = state.measures.length - 1;
    els.lineUndo.disabled = !has('line');
    els.lineClear.disabled = !state.lines.length;
    els.measureUnit.disabled = last < 1 || state.unitIndex === last;
    els.measureUndo.disabled = !has('measure');
    els.measureClear.disabled = !state.measures.length;
    els.plumbUndo.disabled = !has('plumb');
    els.plumbClear.disabled = !state.plumbs.length;
    updateToolHint();
  }

  // the grid button steps through off, 3 × 3 and 4 × 4
  els.gridBtn.addEventListener('click', () => {
    state.grid = { 0: 3, 3: 4, 4: 0 }[state.grid];
    drawAllOverlays();
    updateToolHint();
  });
  // a tool's button turns it on; pressing the one that is on turns it off, so touch just scrolls
  els.toolBtns.forEach((b) =>
    b.addEventListener('click', () => setTool(state.tool === b.dataset.tool ? 'none' : b.dataset.tool))
  );
  document.querySelectorAll('input[name="lineColor"]').forEach((el) =>
    el.addEventListener('change', () => { state.lineColor = el.value; })
  );
  els.lineUndo.addEventListener('click', () => undo('line'));
  els.lineClear.addEventListener('click', () => clearKind('line'));
  els.measureUndo.addEventListener('click', () => undo('measure'));
  els.measureClear.addEventListener('click', () => clearKind('measure'));
  els.plumbUndo.addEventListener('click', () => undo('plumb'));
  els.plumbClear.addEventListener('click', () => clearKind('plumb'));
  els.measureUnit.addEventListener('click', () => {
    const last = state.measures.length - 1;
    if (last < 1 || state.unitIndex === last) return;
    const prev = state.unitIndex;
    state.unitIndex = last;
    record({ kind: 'measure', op: 'unit', prev });
  });
  const canvasSizeChanged = () => { saveCanvasSize(); updateToolHint(); drawAllOverlays(); };
  els.canvasSize.addEventListener('input', canvasSizeChanged);
  els.canvasSys.addEventListener('change', canvasSizeChanged);

  window.addEventListener('keydown', (e) => {
    // the save dialog is modal: Esc only closes it, and nothing behind it should change
    if (els.saveDialog.open) return;
    if (e.key === 'Escape' && state.picking) setPicking(false);
    if (e.key === 'Escape' && (state.drawing || state.dragging)) {
      state.drawing = null;
      cancelDrag();
      els.loupe.hidden = true;
      drawAllOverlays();
    }
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName) &&
      document.activeElement.type !== 'radio' && document.activeElement.type !== 'range';
    // Ctrl/⌘+Z only: with Shift (or Alt) it is redo, which has nothing to redo here. Not while a
    // plumb point is held, since undoing could renumber the points under it.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' &&
      state.history.length && !typing && !state.dragging) {
      e.preventDefault();
      toast(undo());
    }
  });

  // ---- Tabs ---------------------------------------------------------------

  // Three sections at the top: Learning tools (a menu: Study the photo, Loomis head, How to use),
  // Studio, and Games (a menu: Paint by numbers, with more to come). The group button shows which
  // of its pages is open.
  const GROUP_OF = { study: 'learn', loomis: 'learn', help: 'learn', paint: 'paint', game: 'games', battle: 'games' };
  const TAB_NAMES = { study: 'Study the photo', loomis: 'Loomis head', help: 'How to use', paint: 'Studio', game: 'Paint by numbers', battle: 'Value battle' };
  const groupBtns = { learn: $('tabLearnBtn'), paint: $('tabPaintBtn'), games: $('tabGamesBtn') };
  const groupSubs = { learn: $('tabLearnSub'), games: $('tabGamesSub') };
  function closeMenus() {
    document.querySelectorAll('.tab-menu').forEach((m) => { m.hidden = true; });
    document.querySelectorAll('.tab[aria-haspopup]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function switchTab(name, focus) {
    if (!els.tabPanels[name]) return;
    state.tab = name;
    if (name !== 'study') setPicking(false); // picking a neutral spot only works on Your painting
    Object.entries(els.tabPanels).forEach(([key, panel]) => { panel.hidden = key !== name; });
    const group = GROUP_OF[name];
    Object.entries(groupBtns).forEach(([key, btn]) => btn.setAttribute('aria-selected', String(key === group)));
    if (groupSubs[group]) groupSubs[group].textContent = TAB_NAMES[name];
    document.querySelectorAll('.tab-item').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tab === name)));
    closeMenus();
    if (focus) groupBtns[group].focus();
    if (checking() && state.art.dirty) runCheck();
    // the game, the Studio, the Loomis head and the guide have their own layouts: the drawers and tool bar step aside
    document.body.classList.toggle('tab-game', name === 'game');
    document.body.classList.toggle('tab-help', name === 'help');
    document.body.classList.toggle('tab-battle', name === 'battle');
    if (name !== 'study') els.loupe.hidden = true;
    drawAllOverlays();
    window.dispatchEvent(new CustomEvent('studio:tab', { detail: name }));
  }
  document.querySelectorAll('.tab-item').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab, true)));
  $('tabPaintBtn').addEventListener('click', () => switchTab('paint'));
  document.querySelectorAll('.tab[aria-haspopup]').forEach((btn) => {
    const menu = $(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', () => {
      const open = menu.hidden;
      closeMenus();
      if (open) { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); const on = menu.querySelector('.tab-item[aria-checked="true"]') || menu.querySelector('.tab-item'); if (on) on.focus(); }
    });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); btn.click(); } });
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('.tab-item')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
      if (e.key === 'Escape') { closeMenus(); btn.focus(); }
    });
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.tab-group')) closeMenus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

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
    if (!ready) { els.drawerState.check.textContent = state.art.source ? '' : 'No painting yet'; return; }

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
    syncOverlay(els.canvases.diff); // again, now its measure labels can keep off the percentages
    state.pixels.refblock = state.result.blockImage;
    state.pixels.art = state.art.prep.rgba;
    state.pixels.artblock = artRes.blockImage;
    state.pixels.diff = cmp.diffImage;
    renderScore(cmp);
  }

  // Match percentage on each shape of the accuracy map. The biggest differences get a
  // white label with their number from the list; shapes too small for a label stay bare.
  // Where the labels went is kept in 0-1 coordinates, so measure labels can keep off them.
  function drawLabels(canvas, cmp) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const long = Math.max(W, H);
    const minFont = Math.round(long / 60);
    const maxFont = Math.round(long / 26);
    const rank = new Set(cmp.top.map((r) => r.id));
    cmp.labelBoxes = [];
    const pill = (reg, text, font, look) => {
      const b = drawPill(g, text, reg.lx + 0.5, reg.ly + 0.5, font, look, W, H);
      cmp.labelBoxes.push({ x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });
    };

    cmp.regions.forEach((reg) => {
      if (!reg.ref || rank.has(reg.id)) return;
      const font = Math.min(maxFont, Math.floor(reg.room / 1.5));
      if (font >= minFont) pill(reg, reg.pct + '%', font, 'dark');
    });
    cmp.top.forEach((reg, i) => {
      const font = Math.max(minFont, Math.min(maxFont, Math.floor(reg.room / 1.9)));
      pill(reg, `${i + 1} · ${reg.pct}%`, font, 'light');
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
    els.drawerState.check.textContent = `Color ${cmp.colorScore} · Value ${cmp.valueScore}`;
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

    els.fixList.replaceChildren();
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
  // The painting on the Studio tab, scored against what it was painted from: the Study reference,
  // or the portrait the Studio dealt, which then becomes the reference here
  els.artFromStudio.addEventListener('click', () => {
    const ps = window.PaintStudio;
    if (!ps) return;
    const r = ps.reference();
    if (r.kind === 'painting' && r.id && Studio.sourceKey() !== `${r.id}:${r.width}x${r.height}`) useSource(r.picture, r.title, r.id);
    setArt(ps.composite(), 'Studio painting', false);
    els.drawers.check.open = true;
    runSoon(0);
  });
  els.artFit.addEventListener('change', () => { state.art.key = ''; if (checking()) runSoon(0); });

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

  // the guide's Try it buttons lead to the part they describe
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const go = b.dataset.go;
    switchTab(go === 'check' ? 'study' : go);
    if (go === 'check') { els.drawers.check.open = true; els.drawers.check.scrollIntoView({ block: 'start' }); }
    else window.scrollTo(0, 0);
  }));

  // ---- Simple and advanced ------------------------------------------------

  // Simple shows the few controls a beginner needs and presets for the rest; Advanced shows every
  // setting. Simple is the default, and the choice is remembered.
  function setMode(mode, remember = true) {
    document.body.classList.toggle('mode-simple', mode === 'simple');
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    if (remember) { try { localStorage.setItem(MODE_KEY, mode); } catch (err) { /* not remembered */ } }
    window.dispatchEvent(new CustomEvent('studio:mode', { detail: mode }));
    if (state.result) runSoon(0);
  }
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  // Simple mode's Detail presets set Simplify and Merge together
  const DETAIL = { soft: [6, 6], normal: [3, 4], sharp: [1, 2] };
  document.querySelectorAll('input[name="detailPreset"]').forEach((r) => r.addEventListener('change', () => {
    const [simplify, merge] = DETAIL[r.value];
    els.simplify.value = simplify; els.merge.value = merge;
    updateOutputs(); runSoon();
  }));

  // ---- Drawers ------------------------------------------------------------

  function restoreDrawers() {
    let open = [];
    try { open = JSON.parse(localStorage.getItem(DRAWERS_KEY) || '[]'); } catch (err) { /* storage unavailable: all closed */ }
    Object.entries(els.drawers).forEach(([key, d]) => {
      if (Array.isArray(open) && open.includes(key)) d.open = true;
      d.addEventListener('toggle', () => {
        const now = Object.keys(els.drawers).filter((k) => els.drawers[k].open);
        try { localStorage.setItem(DRAWERS_KEY, JSON.stringify(now)); } catch (err) { /* not remembered */ }
        if (key === 'values' && d.open) drawHistogram();
        if (key === 'check') { els.checkSection.hidden = !d.open; if (d.open && state.art.dirty) runCheck(); if (!d.open) setPicking(false); }
      });
    });
  }

  // What palette.js needs from the page
  // The grid, lines, measures and plumb lines drawn over the reference, as straight segments in
  // image fractions (0-1), for the Studio to draw in pencil on its underdrawing. Grid lines and plumb
  // lines run edge to edge; a plumb point's horizontal is its level.
  function marks() {
    const segs = [];
    if (state.grid) for (let k = 1; k < state.grid; k++) { const t = k / state.grid; segs.push([t, 0, t, 1], [0, t, 1, t]); }
    state.plumbs.forEach((p) => segs.push([p.x, 0, p.x, 1], [0, p.y, 1, p.y]));
    state.lines.concat(state.measures).forEach((l) => segs.push([l.x1, l.y1, l.x2, l.y2]));
    if (window.Loomis) segs.push(...Loomis.segments());
    return segs;
  }

  window.Studio = {
    marks,
    tool: () => state.tool,
    redraw: drawAllOverlays,
    go: switchTab,
    result: () => state.result,
    source: () => state.source,
    prep: () => state.prep,
    savePng,
    openDialog,
    sourceKey: () => state.source && `${state.baseName}:${state.source.width}x${state.source.height}`,
    settings,
    tab: () => state.tab,
    addColor,
    toast,
    toHex,
    valueLabel,
  };

  // Each step that reads saved settings runs on its own: a bad saved value (an older version, a
  // stray write) must not stop the rest of the app from starting. The failure is still reported.
  function safely(step) {
    try { step(); } catch (err) { if (window.StudioGuard) StudioGuard.report(err, { saved: true }); else console.error(err); }
  }

  function start() {
    safely(restoreDrawers);
    let mode = 'simple';
    try { mode = localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple'; } catch (err) { /* simple */ }
    setMode(mode, false);
    els.checkSection.hidden = !els.drawers.check.open;
    updateToolbar();
    safely(restoreSmoothing);
    updateOutputs();
    safely(renderPalette);
    safely(loadCanvasSize);
    updateToolButtons();
    state.source = paintSample();
    setSourceLabel('Sample study', 600, 750, true);
    setArt(makeExamplePainting(state.source), '', true);
    prepareAndRun(true, true);
    if (location.hash === '#check') { switchTab('study'); els.drawers.check.open = true; }
    if (location.hash === '#game') switchTab('game');
    if (location.hash === '#paint') switchTab('paint');
    if (location.hash === '#help') switchTab('help');
    if (location.hash === '#loomis') switchTab('loomis');
    if (location.hash === '#battle') switchTab('battle');
  }

  // Help tab: forget everything this site keeps in the browser. Two taps, so a stray tap does nothing.
  const forgetBtn = $('forgetBtn');
  if (forgetBtn) {
    const idle = forgetBtn.textContent;
    let armed = 0;
    forgetBtn.addEventListener('click', () => {
      if (!armed) {
        forgetBtn.textContent = 'Tap again to clear everything and reload';
        armed = setTimeout(() => { armed = 0; forgetBtn.textContent = idle; }, 5000);
        return;
      }
      clearTimeout(armed);
      forgetBtn.disabled = true;
      forgetBtn.textContent = 'Clearing…';
      if (window.StudioGuard) StudioGuard.forget(true); else location.reload();
    });
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
