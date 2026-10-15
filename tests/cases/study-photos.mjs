// The Study tab's photo pipeline and its settings, played like a sceptical tester: the sample on the
// first load; every kind of photo through the file input, a drop and a paste (a 1 px image, one under
// the 16 px floor, strips, 24 megapixels and one past it, flat tones, noise, a transparent PNG, a JPEG,
// a WebP, SVGs, a text file, a broken image) and what the page says for each; a second photo while the
// first is still being read; a Working size change in the window after a load; every slider, split,
// gray value and preset at its ends and one past them; slider spam; Auto split on flat tones; Simple
// and Advanced and what each hides; the preset shown against the setting in force; what is remembered
// across a reload (drawers, lean, block view, smoothing, mode); hostile saved state for every key app.js
// reads; keyboard-only operation; and the phone width.
import { openPage, clean, tab, makeImage, dropFiles, dropText, pasteFile, textFile, brokenImage, svgImage, storageGet, click, text, visible, hscroll, screenshot, sleep, DESKTOP, PHONE } from '../lib.mjs';

const SAMPLE_LABEL = 'Sample study · a painted stand-in. Load, drop or paste a portrait to use your own.';
const NO_SIZE = /That image has no usable size\. Use a JPG, PNG or WebP photo\./;
const NOT_IMAGE = /That file is not an image\. Choose a JPG, PNG or WebP photo\./;
const NOT_OPENED = /This image could not be opened\. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first\./;
const WORKING = 900; // the default Working size
// the study's size for a photo of w × h at a working size (processing.js prepare: never upscaled)
const studySize = (w, h, side = WORKING) => { const s = Math.min(1, side / Math.max(w, h)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- helpers for this case -------------------------------------------------

const toast = (page) => text(page, '#toast');
const resetToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.classList.remove('show'); });
const busyHidden = (page, timeout = 30000) => page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout }).then(() => true).catch(() => false);
// the label names the photo and the study has been redrawn (the busy indicator went up and came down)
async function waitLabel(page, name, timeout = 30000) {
  const ok = await page.waitForFunction((n) => document.getElementById('source').textContent.includes(n) && document.getElementById('busy').hidden, name, { timeout }).then(() => true).catch(() => false);
  await sleep(80);
  return ok;
}
const waitToast = (page, re, timeout = 15000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source, { timeout }).then(() => true).catch(() => false);
// everything the Study tab shows and holds, in one read
const study = (page) => page.evaluate(() => {
  const c = (id) => { const e = document.getElementById(id); return [e.width, e.height]; };
  const r = window.Studio.result(); const p = window.Studio.prep(); const s = window.Studio.settings();
  const v = (id) => document.getElementById(id).value;
  return {
    label: document.getElementById('source').textContent.trim(), orig: c('cv-orig'), value: c('cv-value'), block: c('cv-block'),
    zones: document.querySelectorAll('#zones li').length, zoneText: [...document.querySelectorAll('#zones li .meta')].map((e) => e.textContent),
    busy: document.getElementById('busy').hidden, header: document.getElementById('valuesState').textContent.trim(),
    prep: p && [p.w, p.h], colors: r ? r.blockColors.length : -1, shares: r ? r.zoneShare.map((x) => Math.round(x * 100)) : null,
    t1: +v('t1'), t2: +v('t2'), simplify: +v('simplify'), merge: +v('merge'), colorsPer: +v('colors'), lean: +v('lean'), detail: v('detail'),
    blurRadius: s.blurRadius, minSize: s.minSize, simple: document.body.classList.contains('mode-simple'),
    preset: (document.querySelector('input[name="detailPreset"]:checked') || {}).value,
  };
});
const pixel = (page, id, x, y) => page.evaluate(([id, x, y]) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }, [id, x, y]);
const near = (px, rgb, tol = 3) => px && Math.abs(px[0] - rgb[0]) <= tol && Math.abs(px[1] - rgb[1]) <= tol && Math.abs(px[2] - rgb[2]) <= tol;
async function setRange(page, id, value) {
  await page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, String(value)]);
  await busyHidden(page); await sleep(40);
  return page.evaluate((id) => ({ value: document.getElementById(id).value, out: (document.getElementById(id + 'Out') || {}).value }), id);
}
async function setSelect(page, id, value) {
  await page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, String(value)]);
  await busyHidden(page); await sleep(40);
}
async function clickWait(page, selector) { await click(page, selector); await busyHidden(page); await sleep(40); }
const drawersOpen = (page) => page.evaluate(() => [...document.querySelectorAll('.rail details.drawer')].filter((d) => d.open).map((d) => d.dataset.drawer));
const display = (page, selector) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return 'missing'; const r = e.getBoundingClientRect(); return (getComputedStyle(e).display !== 'none' && r.width > 0) ? 'shown' : 'hidden'; }, selector);
// the file input, then what the page did: a redrawn study for an accepted file, a toast for a rejected one
async function loadKind(page, file, { reject = null, name = file.name } = {}) {
  await resetToast(page);
  await page.setInputFiles('#file', file);
  if (reject) { const said = await waitToast(page, reject); await sleep(250); return { said, toast: await toast(page), ...(await study(page)) }; }
  const loaded = await waitLabel(page, name);
  return { loaded, toast: await toast(page), ...(await study(page)) };
}

export default async function studyPhotos(t, site) {
  // ---- the sample on the first load, and the file kinds through the file input (desktop) ----
  {
    const page = await openPage(site);
    const first = await study(page);
    t.check(first.label === SAMPLE_LABEL, 'first load: the label names the sample and how to replace it', first.label);
    t.check(same(first.orig, [600, 750]) && same(first.value, [600, 750]) && same(first.block, [600, 750]) && first.zones === 3 && first.busy && first.colors > 3, 'first load: the three studies of the 600 × 750 sample are drawn, busy gone', first);
    t.check(first.simple && first.header === 'Normal detail' && first.preset === 'normal', 'first load: Simple mode, the drawer header says "Normal detail"', { simple: first.simple, header: first.header });
    t.check(first.t1 < first.t2 && first.t2 - first.t1 >= 2, 'first load: the sample got an auto split (dark < light)', [first.t1, first.t2]);
    t.check((await storageGet(page, 'portrait-value-studio.mode')) === null, 'first load: a visit that chose nothing writes no mode key', await storageGet(page, 'portrait-value-studio.mode'));
    await clean(t, page, 'first load');
    // the busy indicator and the moment the file was chosen, for the timings below
    await page.evaluate(() => { window.__busy = []; const b = document.getElementById('busy'); new MutationObserver(() => window.__busy.push([performance.now(), b.hidden])).observe(b, { attributes: true, attributeFilter: ['hidden'] }); document.getElementById('file').addEventListener('change', () => { window.__fileAt = performance.now(); }); });
    const sampleSplit = [first.t1, first.t2];

    // every kind of file: accepted (dims, label, what is said) or rejected (the toast, the study untouched)
    const kinds = [
      { title: '1 × 1 PNG', make: () => makeImage(page, { width: 1, height: 1 }), reject: NO_SIZE },
      { title: '15 × 15 PNG (under the 16 px floor)', make: () => makeImage(page, { width: 15, height: 15 }), reject: NO_SIZE },
      { title: '16 × 16 PNG (the floor itself)', make: () => makeImage(page, { width: 16, height: 16 }), dims: [16, 16] },
      { title: '2 × 4000 strip', make: () => makeImage(page, { width: 2, height: 4000 }), reject: NO_SIZE },
      { title: '4000 × 2 strip', make: () => makeImage(page, { width: 4000, height: 2 }), reject: NO_SIZE },
      { title: '20 × 4000 strip (the thinnest that passes)', make: () => makeImage(page, { width: 20, height: 4000, draw: 'noise' }), dims: [20, 4000] },
      { title: '4000 × 20 strip', make: () => makeImage(page, { width: 4000, height: 20, draw: 'noise' }), dims: [4000, 20] },
      { title: 'flat gray', make: () => makeImage(page, { draw: 'flat' }), dims: [600, 800], flat: [128, 128, 128] },
      { title: 'pure white', make: () => makeImage(page, { draw: 'white' }), dims: [600, 800], flat: [255, 255, 255] },
      { title: 'pure black', make: () => makeImage(page, { draw: 'black' }), dims: [600, 800], flat: [0, 0, 0] },
      { title: 'noise', make: () => makeImage(page, { draw: 'noise' }), dims: [600, 800] },
      { title: 'transparent PNG', make: () => makeImage(page, { draw: 'transparent', name: 'cutout.png' }), dims: [600, 800], corner: [127, 127, 127] },
      { title: 'JPEG 900 × 1200', make: () => makeImage(page, { width: 900, height: 1200, type: 'image/jpeg' }), dims: [900, 1200] },
      { title: 'WebP 800 × 600', make: () => makeImage(page, { width: 800, height: 600, type: 'image/webp' }), dims: [800, 600] },
      { title: 'SVG 400 × 400', make: async () => svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#246"/><circle cx="200" cy="200" r="120" fill="#e9b"/></svg>', 'square.svg'), dims: [400, 400] },
      { title: 'SVG 10 × 10', make: async () => svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>', 'tiny.svg'), reject: NO_SIZE },
      { title: 'SVG without a size (Chromium gives it 300 × 150)', make: async () => svgImage(), dims: [300, 150], corner: [127, 127, 127], at: [200, 100] },
      { title: 'a text file', make: async () => textFile(), reject: NOT_IMAGE },
      { title: 'a broken JPEG', make: async () => brokenImage(), reject: NOT_OPENED },
      { title: 'a PNG handed over as application/octet-stream', make: async () => ({ ...(await makeImage(page, { width: 300, height: 200, name: 'untyped' })), mimeType: 'application/octet-stream' }), reject: NOT_IMAGE },
      { title: '5000 × 5000 JPEG (25 megapixels)', make: () => makeImage(page, { width: 5000, height: 5000, type: 'image/jpeg' }), dims: [2800, 2800], note: /^A very large photo \(5000 × 5000\) was reduced to 2800 × 2800 for speed\.$/ },
      { title: '6000 × 4000 JPEG (exactly 24 megapixels: not reduced)', make: () => makeImage(page, { width: 6000, height: 4000, type: 'image/jpeg' }), dims: [6000, 4000] },
    ];
    let shown = first;
    for (const k of kinds) {
      const file = await k.make();
      const r = await loadKind(page, file, { reject: k.reject });
      if (k.reject) {
        t.check(r.said, `${k.title}: rejected with the right words`, r.toast);
        t.check(r.label === shown.label && same(r.orig, shown.orig) && same(r.value, shown.value) && r.busy, `${k.title}: the study showing stays as it was`, { label: r.label, was: shown.label, orig: r.orig, busy: r.busy });
      } else {
        const [w, h] = k.dims;
        const expect = studySize(w, h);
        t.check(r.loaded && r.label === `${file.name} · ${w} × ${h} px`, `${k.title}: loaded, the label says the name and size`, r.label);
        t.check(same(r.orig, expect) && same(r.value, expect) && same(r.block, expect) && same(r.prep, expect) && r.zones === 3 && r.busy, `${k.title}: the three studies are ${expect.join(' × ')} at the working size`, { orig: r.orig, value: r.value, block: r.block, zones: r.zones, busy: r.busy });
        if (k.note) t.check(k.note.test(r.toast), `${k.title}: the reduction note is said`, r.toast);
        else t.check(r.toast === '', `${k.title}: nothing is said`, r.toast);
        if (k.flat) {
          t.check(near(await pixel(page, 'cv-orig', 2, 2), k.flat), `${k.title}: the photo panel shows the tone`, await pixel(page, 'cv-orig', 2, 2));
          t.check(r.shares.some((s) => s === 100) && r.colors === 1, `${k.title}: one value holds 100% and there is one color block`, { shares: r.shares, colors: r.colors, zoneText: r.zoneText });
        }
        if (k.corner) { const [x, y] = k.at || [1, 1]; t.check(near(await pixel(page, 'cv-orig', x, y), k.corner), `${k.title}: transparent parts sit on mid gray`, await pixel(page, 'cv-orig', x, y)); }
        t.note(`${k.title}: ${r.colors} block colors, value shares ${r.shares && r.shares.join('/')}%`);
        shown = r;
      }
      if (!(await clean(t, page, k.title))) t.finding({ title: `${k.title}: the page reported an error while loading it`, severity: 'high', steps: `Load a ${k.title} with Load photo.`, expected: 'No page error, console error or policy violation.', actual: 'See the failing check.' });
    }
    // what the timings looked like for the biggest photo: when the indicator went up after the file was chosen
    const timing = await page.evaluate(() => ({ busy: window.__busy, fileAt: window.__fileAt }));
    t.note(`busy indicator: went up ${timing.busy.length ? Math.round(timing.busy[timing.busy.length - 2][0] - timing.fileAt) : '?'} ms after the last file was chosen (6000 × 4000), ${timing.busy.length} hidden-attribute changes over the kinds above`);
    // the message a too-small photo gets tells a PNG user to use a PNG and never says why it was refused
    t.check(false, 'a 15 × 15 PNG is told it is too small, not to "use a JPG, PNG or WebP photo"', 'toast: ' + NO_SIZE.source.replace(/\\/g, ''));
    t.finding({ title: 'A photo under 16 px is refused with advice to use a JPG, PNG or WebP photo, which it already is, and the size floor is never named', severity: 'low', steps: 'Load photo → choose a 15 × 15 PNG (or a 2 × 4000 strip, or a 10 × 10 SVG).', expected: 'A message that says the picture is too small (under 16 px on a side) to study.', actual: 'Toast: "That image has no usable size. Use a JPG, PNG or WebP photo." The file was a PNG; nothing says what size would do.', cause: 'js/app.js:475-478 (readImage): the under-16-px branch reuses the wording meant for a sizeless SVG.' });

    // a file with no type at all (a photo saved without an extension gets '' from the browser): built in the page
    await resetToast(page);
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 300; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#c96'; g.fillRect(0, 0, 300, 200); g.fillStyle = '#123'; g.fillRect(50, 50, 200, 100);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const file = new File([blob], 'untyped', { type: '' });
      const input = document.getElementById('file'); const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const untyped = await waitLabel(page, 'untyped');
    t.check(untyped && (await study(page)).label === 'untyped · 300 × 200 px' && same((await study(page)).value, [300, 200]) && (await toast(page)) === '', 'a PNG whose file has no type loads by its content, nothing said', { label: (await study(page)).label, toast: await toast(page) });
    t.note('a PNG handed over as application/octet-stream is refused as "not an image" before its content is tried (readImage checks file.type first); one with an empty type loads by its content.');
    await clean(t, page, 'untyped file');

    // ---- the same file twice, an empty change, a second photo while the first is still being read ----
    const jpeg = await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'again.jpg' });
    const once = await loadKind(page, jpeg);
    const twice = await loadKind(page, jpeg);
    t.check(once.loaded && twice.loaded && once.label === twice.label && same(once.value, twice.value), 'the same file chosen twice loads both times (the input is reset after each choice)', [once.label, twice.label]);
    await page.evaluate(() => { const f = document.getElementById('file'); f.value = ''; f.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    t.check((await study(page)).label === twice.label && (await study(page)).busy, 'a change with no file chosen does nothing', (await study(page)).label);
    await clean(t, page, 'same file twice, empty change');

    // two photos dropped in the same instant, the heavy one first: which one the page ends up showing
    const race = async () => {
      await resetToast(page);
      await page.evaluate(async () => {
        const make = (w, h, type, name) => new Promise((res) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#8a9aa6'; g.fillRect(0, 0, w, h); g.fillStyle = '#c98f6a'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 4, h / 4, 0, 0, 7); g.fill(); c.toBlob((b) => res(new File([b], name, { type })), type, 0.9); });
        const a = await make(5000, 5000, 'image/jpeg', 'heavy.jpg');
        const b = await make(640, 480, 'image/png', 'light.png');
        for (const f of [a, b]) { const dt = new DataTransfer(); dt.items.add(f); window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); }
      });
      await sleep(1500); await busyHidden(page); await sleep(1500); await busyHidden(page); await sleep(200);
      return study(page);
    };
    for (const i of [1, 2]) {
      const r = await race();
      const said = await toast(page);
      const m = /^(\S+) · (\d+) × (\d+) px$/.exec(r.label);
      const expect = m && studySize(+m[2], +m[3]);
      t.check(m && same(r.value, expect) && same(r.orig, expect) && r.busy, `two photos dropped at once (run ${i}): the study drawn is the photo the label names`, { label: r.label, value: r.value });
      t.note(`two photos dropped at once, heavy.jpg (5000 × 5000) then light.png (run ${i}): the page shows ${m ? m[1] : r.label}; toast "${said}". Which one wins follows which file finishes reading, not which was chosen last (readImage has no job counter; only prepareAndRun has one)${m && m[1] === 'light.png' && /very large/.test(said) ? ', and the six-second reduction note describes the photo that is not shown' : ''}. The window is the heavy file's read time (tens of ms): not reachable by hand, so a note.`);
    }
    await clean(t, page, 'two photos at once');

    // a Working size change in the two-frame window after a photo arrives (prepareAndRun's deferred work)
    const winFile = await makeImage(page, { width: 600, height: 800, name: 'window.png' });
    const win = await page.evaluate(async (f) => {
      const bin = atob(f.b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], f.name, { type: f.mimeType });
      // the indicator goes up in the task that takes the photo; a mutation observer runs before any frame, so the
      // Working size change lands inside prepareAndRun's two-frame wait
      const busy = document.getElementById('busy');
      const saw = new Promise((res) => { const mo = new MutationObserver(() => { if (busy.hidden) return; mo.disconnect(); const sel = document.getElementById('detail'); sel.value = '600'; sel.dispatchEvent(new Event('change', { bubbles: true })); res(true); }); mo.observe(busy, { attributes: true, attributeFilter: ['hidden'] }); setTimeout(() => { mo.disconnect(); res(false); }, 5000); });
      const input = document.getElementById('file'); const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      return { saw: await saw };
    }, { name: winFile.name, mimeType: winFile.mimeType, b64: winFile.buffer.toString('base64') });
    await waitLabel(page, 'window.png');
    const after = await study(page);
    t.check(win.saw && after.label === 'window.png · 600 × 800 px' && same(after.value, [450, 600]) && after.detail === '600' && after.busy, 'Working size changed while a new photo was being prepared: the photo is shown at the new size, no error', { ...win, label: after.label, value: after.value });
    await setSelect(page, 'detail', WORKING);
    const normal = await loadKind(page, winFile);
    if (same([after.t1, after.t2], [normal.t1, normal.t2])) t.note(`Working size changed in the two-frame window after a load: the new photo still got its own auto split (${after.t1}/${after.t2}).`);
    else t.note(`Working size changed in the two-frame window after a load: the new photo kept the previous photo's splits (${after.t1}/${after.t2}; its own auto split is ${normal.t1}/${normal.t2}), because the Working size's prepareAndRun(false) replaced the load's prepareAndRun(true) before its work ran (app.js:386-402). A two-frame window: not reachable by hand, so a note.`);
    await clean(t, page, 'working size in the window');

    // ---- switching tabs mid-load, then a reload mid-load ----
    await page.setInputFiles('#file', jpeg);
    await tab(page, 'paint'); await tab(page, 'study');
    t.check(await waitLabel(page, 'again.jpg') && same((await study(page)).value, [675, 900]), 'a tab switch while a photo loads: the study is there when you come back', (await study(page)).label);
    await clean(t, page, 'tab switch mid-load');
    await page.setInputFiles('#file', await makeImage(page, { width: 5000, height: 5000, type: 'image/jpeg', name: 'reloaded.jpg' }));
    await page.reload({ waitUntil: 'load' }); await sleep(600); await busyHidden(page);
    const back = await study(page);
    t.check(back.label === SAMPLE_LABEL && same(back.value, [600, 750]) && back.busy, 'a reload while a photo loads: the sample is back, no error', back.label);
    await clean(t, page, 'reload mid-load');
    t.check(same([back.t1, back.t2], sampleSplit), 'after the reload the sample has its own auto split again', { now: [back.t1, back.t2], first: sampleSplit });

    // ---- Advanced: Working size, every slider at its ends and one past, the splits, the grays ----
    await page.evaluate(() => { window.__runs = 0; window.addEventListener('studio:result', () => { window.__runs++; }); });
    await clickWait(page, '[data-mode="advanced"]');
    await page.evaluate(() => { document.getElementById('drawer-values').open = true; document.getElementById('drawer-colors').open = true; });
    let s = await study(page);
    t.check(!s.simple && /^Splits at V \d+\.\d and \d+\.\d · Simplify \d+$/.test(s.header), 'Advanced: the drawer header says the splits and Simplify', s.header);
    t.check((await storageGet(page, 'portrait-value-studio.mode')) === 'advanced', 'Advanced is written to storage', await storageGet(page, 'portrait-value-studio.mode'));
    for (const sel of ['#simplify', '#smoothSoft', '#merge', '#detail', '#autoSplit', '#t1', '#t2', '#grayAvg', '#g0', '#lean', '#srcMine']) t.check((await display(page, sel)) === 'shown', `Advanced shows ${sel}`, await display(page, sel));
    t.check((await display(page, 'label[for="dpNormal"]')) === 'hidden', 'Advanced hides the Detail preset', await display(page, 'label[for="dpNormal"]'));
    await loadKind(page, jpeg);
    for (const [size, dims] of [['600', [450, 600]], ['1400', [900, 1200]], ['900', [675, 900]]]) {
      const before = await study(page);
      await setSelect(page, 'detail', size);
      s = await study(page);
      t.check(same(s.value, dims) && same(s.orig, dims) && same(s.block, dims) && s.busy, `Working size ${size}: the studies are ${dims.join(' × ')}`, { value: s.value, orig: s.orig });
      t.check(s.t1 === before.t1 && s.t2 === before.t2, `Working size ${size}: the splits are kept`, [s.t1, s.t2, before.t1, before.t2]);
    }
    const ends = [
      ['simplify', '0', 'Off', '0'], ['simplify', '10', '10', '10'], ['simplify', '11', '10', '10'], ['simplify', '-1', 'Off', '0'], ['simplify', 'abc', '5', '5'],
      ['merge', '0', 'Off', '0'], ['merge', '10', '10', '10'], ['merge', '99', '10', '10'],
      ['colors', '1', '1', '1'], ['colors', '6', '6', '6'], ['colors', '7', '6', '6'], ['colors', '0', '1', '1'],
      ['lean', '0', 'Off', '0'], ['lean', '100', '100%', '100'], ['lean', '110', '100%', '100'], ['lean', '55', '60%', '60'],
      ['g0', '100', 'V 10.0', '100'], ['g1', '0', 'V 0.0', '0'], ['g2', '50', 'V 5.0', '50'], ['g0', '101', 'V 10.0', '100'], ['g1', '-3', 'V 0.0', '0'],
    ];
    for (const [id, set, out, value] of ends) {
      const r = await setRange(page, id, set);
      t.check(r.value === value && r.out === out, `${id} set to ${set}: value ${value}, shows "${out}"`, r);
    }
    s = await study(page);
    t.check(s.blurRadius === Math.round((5 * 900) / 450) && s.minSize === Math.round(675 * 900 * 0.012) && s.busy, 'the settings in force follow the sliders (Simplify 5, Merge 10 on 675 × 900)', { blurRadius: s.blurRadius, minSize: s.minSize });
    const tones = await page.evaluate(() => [...document.querySelectorAll('#zones .tone')].map((e) => e.style.background));
    t.check(same(tones, ['rgb(255, 255, 255)', 'rgb(0, 0, 0)', 'rgb(118, 118, 118)']) || (tones[0] === 'rgb(255, 255, 255)' && tones[1] === 'rgb(0, 0, 0)'), 'inverted gray values (shadow white, middle black) are drawn as set', tones);
    await clickWait(page, '#grayAvg');
    t.check((await display(page, '#customGrays')) === 'hidden' && (await study(page)).zoneText.every((z) => /^V \d+\.\d · \d+%$/.test(z)), 'Photo average hides the gray sliders and the zones show the averages', (await study(page)).zoneText);
    await clickWait(page, '#grayCustom');
    t.check((await display(page, '#customGrays')) === 'shown', 'Set values brings the gray sliders back');
    for (const id of ['g0', 'g1', 'g2']) await setRange(page, id, { g0: 20, g1: 50, g2: 85 }[id]);
    await clean(t, page, 'sliders at their ends');

    // the splits: dark pushed to the top, light pulled to the bottom, both equal
    let r = await setRange(page, 't1', 98); let r2 = await page.evaluate(() => ({ t1: document.getElementById('t1').value, t2: document.getElementById('t2').value, o1: document.getElementById('t1Out').value, o2: document.getElementById('t2Out').value }));
    t.check(r2.t1 === '97' && r2.t2 === '99' && r2.o1 === 'V 9.7' && r2.o2 === 'V 9.9', 'shadow split pushed to 98: it stops at 97 with light at 99', r2);
    r = await setRange(page, 't2', 2); r2 = await page.evaluate(() => ({ t1: document.getElementById('t1').value, t2: document.getElementById('t2').value, o1: document.getElementById('t1Out').value, o2: document.getElementById('t2Out').value }));
    t.check(r2.t1 === '1' && r2.t2 === '3' && r2.o1 === 'V 0.1' && r2.o2 === 'V 0.3', 'light split pulled to 2: it stops at 3 with shadow at 1', r2);
    await setRange(page, 't2', 50); r = await setRange(page, 't1', 50); r2 = await page.evaluate(() => ({ t1: document.getElementById('t1').value, t2: document.getElementById('t2').value }));
    t.check(r2.t1 === '50' && r2.t2 === '52', 'shadow split set equal to light: light moves up two', r2);
    await setRange(page, 't1', 60); r2 = await page.evaluate(() => ({ t1: document.getElementById('t1').value, t2: document.getElementById('t2').value }));
    t.check(+r2.t2 >= +r2.t1 + 2, 'shadow split dragged past light: light follows (dark never ≥ light)', r2);
    s = await study(page);
    t.check(s.header === `Splits at V ${(s.t1 / 10).toFixed(1)} and ${(s.t2 / 10).toFixed(1)} · Simplify ${s.simplify}`, 'the drawer header follows the splits', s.header);
    await clean(t, page, 'splits');

    // Auto split: on the photo, twice fast, and on flat tones
    await resetToast(page);
    await page.evaluate(() => { document.getElementById('autoSplit').click(); document.getElementById('autoSplit').click(); });
    await busyHidden(page); await sleep(60);
    s = await study(page);
    t.check((await toast(page)) === 'Splits set from this photo' && s.t2 >= s.t1 + 2 && s.busy, 'Auto split (pressed twice fast): says so, dark < light', { toast: await toast(page), t1: s.t1, t2: s.t2 });
    for (const [draw, name] of [['white', 'white'], ['black', 'black'], ['flat', 'gray']]) {
      await loadKind(page, await makeImage(page, { draw, name: `${name}.png` }));
      await resetToast(page); await clickWait(page, '#autoSplit');
      s = await study(page);
      t.check(s.t1 >= 1 && s.t2 <= 99 && s.t2 >= s.t1 + 2 && s.busy && (await toast(page)) === 'Splits set from this photo', `Auto split on ${name}: valid splits (${s.t1}/${s.t2})`, { t1: s.t1, t2: s.t2 });
    }
    await clean(t, page, 'auto split');

    // slider spam: forty inputs in a burst, the last one wins, and the runs are debounced
    await loadKind(page, jpeg);
    const runsBefore = await page.evaluate(() => window.__runs);
    await page.evaluate(() => { const e = document.getElementById('simplify'); for (let i = 0; i < 40; i++) { e.value = String(i % 11); e.dispatchEvent(new Event('input', { bubbles: true })); } e.value = '7'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await busyHidden(page); await sleep(200);
    s = await study(page);
    const runs = (await page.evaluate(() => window.__runs)) - runsBefore;
    t.check(s.simplify === 7 && /Simplify 7$/.test(s.header) && s.blurRadius === Math.round((7 * 900) / 450) && s.busy, 'slider spam: the last value is the one in force and shown', { simplify: s.simplify, header: s.header, blurRadius: s.blurRadius });
    t.check(runs >= 1 && runs <= 3, 'slider spam: the study was recomputed once or twice, not forty times', runs);
    await setRange(page, 'simplify', 3);
    // a smoothing choice, outlines, and the lean are kept
    await clickWait(page, '#smoothSoft');
    t.check((await storageGet(page, 'portrait-value-studio.smoothing')) === 'soft', 'Smoothing Soft is written to storage');
    await clickWait(page, '#smoothEdge');
    t.check((await storageGet(page, 'portrait-value-studio.smoothing')) === 'edge', 'Smoothing Edge-aware is written to storage');
    await clickWait(page, '#outlines'); await clickWait(page, '#outlines');
    await setRange(page, 'lean', 100);
    t.check((await storageGet(page, 'portrait-value-studio.lean')) === '100', 'Lean 100 is written to storage', await storageGet(page, 'portrait-value-studio.lean'));
    await clean(t, page, 'spam, smoothing, lean');

    // ---- keyboard: a slider by arrows, the mode switch by Enter, Load photo by Tab and Space ----
    await page.focus('#simplify');
    await page.keyboard.press('ArrowRight'); await busyHidden(page); await sleep(40);
    s = await study(page);
    t.check(s.simplify === 4 && /Simplify 4$/.test(s.header), 'keyboard: ArrowRight on Simplify steps it to 4 and the header follows', { simplify: s.simplify, header: s.header });
    await page.keyboard.press('End'); await busyHidden(page); await page.keyboard.press('Home'); await busyHidden(page); await sleep(40);
    t.check((await page.evaluate(() => document.getElementById('simplifyOut').value)) === 'Off', 'keyboard: End then Home takes Simplify to Off', await page.evaluate(() => document.getElementById('simplifyOut').value));
    await setRange(page, 'simplify', 3);
    await page.focus('[data-mode="simple"]'); await page.keyboard.press('Enter'); await busyHidden(page); await sleep(40);
    t.check((await study(page)).simple && (await study(page)).header === 'Normal detail', 'keyboard: Enter on Simple switches the mode', (await study(page)).header);
    await page.focus('[data-mode="advanced"]'); await page.keyboard.press('Enter'); await busyHidden(page);
    {
      await page.evaluate(() => document.body.focus());
      let reached = false;
      for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement && document.activeElement.id === 'file'); }
      const ring = reached ? await page.evaluate(() => getComputedStyle(document.querySelector('label[for="file"]')).outlineStyle) : null;
      t.check(reached && ring && ring !== 'none', 'keyboard: Tab reaches Load photo and its label shows a focus ring', { reached, ring });
      const chooser = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
      await page.keyboard.press('Space');
      const fc = await chooser;
      t.check(!!fc, 'keyboard: Space on Load photo opens the file chooser');
      if (fc) { await fc.setFiles(await makeImage(page, { width: 500, height: 700, name: 'by-keyboard.png' })); t.check(await waitLabel(page, 'by-keyboard.png'), 'keyboard: the chosen file loads', (await study(page)).label); }
    }
    await clean(t, page, 'keyboard');

    // ---- Simple: the presets, what it hides, and the preset shown against the setting in force ----
    await clickWait(page, '[data-mode="simple"]');
    for (const sel of ['#simplify', '#smoothSoft', '#merge', '#detail', '#autoSplit', '#t1', '#t2', '#grayAvg', '#g0', '#lean', '#srcMine', '#minePane']) t.check((await display(page, sel)) === 'hidden', `Simple hides ${sel}`, await display(page, sel));
    t.check((await display(page, 'label[for="dpNormal"]')) === 'shown' && (await display(page, '#colors')) === 'shown', 'Simple shows the Detail preset and Colors per value');
    for (const [preset, simplify, merge, header] of [['dpSoft', 6, 6, 'Soft detail'], ['dpSharp', 1, 2, 'Sharp detail'], ['dpNormal', 3, 4, 'Normal detail']]) {
      await clickWait(page, `label[for="${preset}"]`);
      s = await study(page);
      t.check(s.simplify === simplify && s.merge === merge && s.header === header && s.busy, `${header}: Simplify ${simplify}, Merge ${merge}, the header says so`, { simplify: s.simplify, merge: s.merge, header: s.header });
    }
    await clickWait(page, 'label[for="dpNormal"]');
    t.check((await study(page)).header === 'Normal detail' && (await study(page)).simplify === 3, 'the checked preset pressed again changes nothing', (await study(page)).header);
    // Advanced sets Simplify and Merge to 10; back in Simple the preset still reads Normal
    await clickWait(page, '[data-mode="advanced"]');
    await setRange(page, 'simplify', 10); await setRange(page, 'merge', 10);
    await clickWait(page, '[data-mode="simple"]');
    s = await study(page);
    const stale = s.header === 'Normal detail' && s.preset === 'normal' && s.simplify === 10 && s.merge === 10;
    await screenshot(page, 'study-photos-stale-preset');
    t.check(!stale, 'back in Simple after Advanced set Simplify 10 / Merge 10, the Detail shown matches the setting in force', { header: s.header, preset: s.preset, simplify: s.simplify, merge: s.merge, blurRadius: s.blurRadius });
    await clickWait(page, 'label[for="dpNormal"]');
    const pressed = await study(page);
    t.check(pressed.simplify === 3 && pressed.merge === 4, 'pressing the Detail preset that is shown applies it', { simplify: pressed.simplify, merge: pressed.merge });
    if (stale && pressed.simplify === 10) t.finding({ title: 'Back in Simple mode the Detail preset reads "Normal" while Advanced\'s Simplify 10 / Merge 10 stay in force, and pressing Normal does nothing', severity: 'medium', steps: 'Advanced → Dark, middle, light: Simplify to 10, Merge small shapes to 10 → press Simple. The drawer header says "Normal detail" and Normal is selected. Press Normal.', expected: 'Either the switch to Simple applies the preset shown, or the preset shown is the one in force (and pressing it applies it).', actual: `The header says "${s.header}", Normal is selected, yet the study is at Simplify 10 / Merge 10 (blur radius ${s.blurRadius}, far softer than Soft's 6/6); pressing Normal changes nothing, since the radio is already checked. Only choosing another preset and coming back restores Normal.`, cause: 'js/app.js:2598-2611: setMode() toggles the class and reruns but never syncs the Detail radios with Simplify/Merge; the preset handler listens to change only, which a checked radio does not fire.' });
    await clickWait(page, 'label[for="dpSoft"]'); await clickWait(page, 'label[for="dpNormal"]');
    t.check((await study(page)).simplify === 3 && (await study(page)).merge === 4, 'choosing another preset and coming back restores Normal', (await study(page)).simplify);
    await clean(t, page, 'simple and advanced');

    // ---- remembered across a reload: drawers, lean, block view, smoothing, mode ----
    await clickWait(page, '[data-mode="advanced"]');
    await page.evaluate(() => { for (const [k, v] of [['values', true], ['colors', true], ['swatches', false], ['check', false]]) document.getElementById('drawer-' + k).open = v; });
    await sleep(100);
    t.check((await storageGet(page, 'portrait-value-studio.drawers')) === '["values","colors"]', 'the open drawers are written as they are toggled', await storageGet(page, 'portrait-value-studio.drawers'));
    await clickWait(page, '#smoothSoft'); await setRange(page, 'lean', 0);
    await click(page, '[data-block-view="palette"]');
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 60000 }).catch(() => null);
    const bv = await page.evaluate(() => ({ pressed: document.querySelector('[data-block-view="palette"]').getAttribute('aria-pressed'), name: document.getElementById('blockViewPalette').textContent, label: document.getElementById('cv-block').getAttribute('aria-label'), busy: document.getElementById('blockViewPalette').classList.contains('is-busy') }));
    t.check(bv.pressed === 'true' && bv.name !== 'Palette' && /as .+ mixes it/.test(bv.label) && !bv.busy, 'the block view switch names the palette and the blocks are remixed', bv);
    await page.reload({ waitUntil: 'load' }); await sleep(600); await busyHidden(page);
    const kept = await page.evaluate(() => ({ drawers: [...document.querySelectorAll('.rail details.drawer')].filter((d) => d.open).map((d) => d.dataset.drawer), lean: document.getElementById('lean').value, leanOut: document.getElementById('leanOut').value, smoothing: document.querySelector('input[name="smoothing"]:checked').value, blockView: document.querySelector('[data-block-view="palette"]').getAttribute('aria-pressed'), simple: document.body.classList.contains('mode-simple'), header: document.getElementById('valuesState').textContent }));
    t.check(same(kept.drawers, ['values', 'colors']), 'after a reload the drawers left open are open again', kept.drawers);
    t.check(kept.lean === '0' && kept.leanOut === 'Off', 'after a reload the lean is Off as left', kept);
    t.check(kept.smoothing === 'soft' && kept.blockView === 'true' && !kept.simple && /^Splits at/.test(kept.header), 'after a reload Smoothing Soft, the Palette block view and Advanced are back', kept);
    await page.evaluate(() => { for (const d of document.querySelectorAll('.rail details.drawer')) d.open = false; }); await sleep(100);
    await clickWait(page, '[data-mode="simple"]'); await click(page, '[data-block-view="photo"]'); await clickWait(page, '#smoothEdge');
    await page.reload({ waitUntil: 'load' }); await sleep(600); await busyHidden(page);
    const kept2 = await page.evaluate(() => ({ drawers: [...document.querySelectorAll('.rail details.drawer')].filter((d) => d.open).map((d) => d.dataset.drawer), blockView: document.querySelector('[data-block-view="photo"]').getAttribute('aria-pressed'), simple: document.body.classList.contains('mode-simple'), smoothing: document.querySelector('input[name="smoothing"]:checked').value }));
    t.check(same(kept2.drawers, []) && kept2.blockView === 'true' && kept2.simple && kept2.smoothing === 'edge', 'after a reload with everything closed and back to Simple, Photo and Edge-aware: all of it remembered', kept2);
    await clean(t, page, 'remembered across a reload');
    await page.context().close();
  }

  // ---- drops and pastes of every kind, and the drop hint ----
  {
    const page = await openPage(site);
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'x.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); });
    t.check(await visible(page, '#dropHint') && (await text(page, '#dropHint')) === 'Drop the portrait to load it', 'dragging a file in shows the drop hint with its words', await text(page, '#dropHint'));
    await page.evaluate(() => window.dispatchEvent(new DragEvent('dragleave', { bubbles: true })));
    t.check(!(await visible(page, '#dropHint')), 'dragging out hides the drop hint');
    const drops = [
      { title: 'dropped JPEG', files: [await makeImage(page, { width: 800, height: 1000, type: 'image/jpeg', name: 'dropped.jpg' })], name: 'dropped.jpg', dims: [800, 1000] },
      { title: 'dropped text file', files: [textFile()], reject: NOT_IMAGE },
      { title: 'dropped broken image', files: [brokenImage()], reject: NOT_OPENED },
      { title: 'dropped 15 × 15 PNG', files: [await makeImage(page, { width: 15, height: 15 })], reject: NO_SIZE },
      { title: 'dropped sizeless SVG', files: [svgImage()], name: 'drawing.svg', dims: [300, 150] },
      { title: 'two files dropped at once (the first is taken)', files: [await makeImage(page, { width: 400, height: 500, name: 'first.png' }), await makeImage(page, { width: 300, height: 300, name: 'second.png' })], name: 'first.png', dims: [400, 500] },
    ];
    for (const d of drops) {
      await resetToast(page);
      const before = await study(page);
      await dropFiles(page, 'body', d.files);
      if (d.reject) {
        t.check(await waitToast(page, d.reject), `${d.title}: rejected with the right words`, await toast(page));
        await sleep(200);
        t.check((await study(page)).label === before.label && (await study(page)).busy && !(await visible(page, '#dropHint')), `${d.title}: the study stays, the hint is gone`, (await study(page)).label);
      } else {
        t.check(await waitLabel(page, d.name) && (await study(page)).label === `${d.name} · ${d.dims.join(' × ')} px` && same((await study(page)).value, studySize(...d.dims)), `${d.title}: loaded with its label`, (await study(page)).label);
      }
      await clean(t, page, d.title);
    }
    t.note('two files dropped at once: the first is loaded and nothing is said about the second (app.js drop handler takes files[0]).');
    await resetToast(page);
    await dropText(page, 'body', 'just some words');
    await sleep(400);
    t.check((await toast(page)) === '' && (await study(page)).label.startsWith('first.png'), 'dropped plain text: nothing happens and nothing is said', await toast(page));
    await resetToast(page);
    await dropText(page, 'body', '<img src="https://example.com/a.jpg">', 'https://example.com/a.jpg');
    await sleep(400);
    t.check(/Save the picture to your device first, then drop the file here\./.test(await toast(page)), 'a picture dragged from another page gets the save-it-first hint', await toast(page));
    await clean(t, page, 'text drops');
    const pastes = [
      { title: 'pasted PNG', file: await makeImage(page, { width: 700, height: 500, name: 'shot.png' }), name: 'shot.png', dims: [700, 500] },
      { title: 'pasted transparent PNG', file: await makeImage(page, { draw: 'transparent', name: 'cut.png' }), name: 'cut.png', dims: [600, 800], corner: [127, 127, 127] },
      { title: 'pasted broken image', file: brokenImage('clip.jpg'), reject: NOT_OPENED },
      { title: 'pasted text file (no image on the clipboard)', file: textFile(), nothing: true },
      { title: 'pasted 1 × 1 PNG', file: await makeImage(page, { width: 1, height: 1, name: 'dot.png' }), reject: NO_SIZE },
    ];
    for (const p of pastes) {
      await resetToast(page);
      const before = await study(page);
      await pasteFile(page, p.file);
      if (p.reject) t.check(await waitToast(page, p.reject, 3000) && (await study(page)).label === before.label, `${p.title}: rejected with the right words, the study stays`, await toast(page));
      else if (p.nothing) t.check((await toast(page)) === '' && (await study(page)).label === before.label && (await study(page)).busy, `${p.title}: nothing happens and nothing is said`, await toast(page));
      else {
        t.check(await waitLabel(page, p.name) && (await study(page)).label === `${p.name} · ${p.dims.join(' × ')} px`, `${p.title}: loaded with its label`, (await study(page)).label);
        if (p.corner) t.check(near(await pixel(page, 'cv-orig', 1, 1), p.corner), `${p.title}: transparent parts sit on mid gray`, await pixel(page, 'cv-orig', 1, 1));
      }
      await clean(t, page, p.title);
    }
    await page.context().close();
  }

  // ---- hostile saved state for every key app.js reads ----
  const K = (k) => 'portrait-value-studio.' + k;
  const bigDrawers = Array.from({ length: 50000 }, () => 'x').concat(['colors']);
  const bigPalette = Array.from({ length: 2000 }, (_, i) => ({ r: i % 256, g: (i * 7) % 256, b: (i * 13) % 256 }));
  const flavors = [
    ['strings for numbers and NaN', { mode: '42', drawers: '"values"', smoothing: 'NaN', lean: 'NaN', blockView: 'NaN', canvasUnit: '{"value":"NaN","sys":"NaN"}', palette: '{"r":1,"g":2,"b":3}' }, { drawers: [], swatches: 0 }],
    ['the wrong type entirely', { mode: 7, drawers: { values: true }, smoothing: [], lean: [], blockView: true, canvasUnit: [1, 2], palette: 'string' }, { drawers: [], swatches: 0 }],
    ['prototype names', { mode: '__proto__', drawers: '["__proto__","constructor","values","hasOwnProperty"]', smoothing: 'constructor', lean: 'constructor', blockView: '__proto__', canvasUnit: '{"__proto__":{"value":9,"sys":"in"},"constructor":1}', palette: '[{"__proto__":{"r":1,"g":1,"b":1}},{"r":"1","g":2,"b":3},{"r":1,"g":2,"b":3,"constructor":"x"},null,1,"x",[],{"r":1,"g":2}]' }, { drawers: ['values'], swatches: 1 }],
    ['nested objects and malformed JSON', { mode: { a: 1 }, drawers: '{not json', smoothing: { v: 'soft' }, lean: '{"v":1}', blockView: { v: 'palette' }, canvasUnit: '{bad', palette: '[{bad' }, { drawers: [], swatches: 0 }],
    ['huge values and arrays', { mode: 'advanced'.repeat(1000), drawers: bigDrawers, smoothing: 'x'.repeat(100000), lean: '99999999999999999999', blockView: 'palette'.repeat(1000), canvasUnit: { value: 1e308, sys: 'cm' }, palette: bigPalette }, { drawers: ['colors'], swatches: 2000 }],
    ['near misses', { mode: 'ADVANCED', drawers: '[]', smoothing: 'Soft', lean: '007', blockView: 'Palette', canvasUnit: '{"value":"Infinity","sys":"in"}', palette: '[{"r":255,"g":0,"b":0},{"r":256,"g":0,"b":0},{"r":-1,"g":0,"b":0},{"r":1.5,"g":0,"b":0},{"r":0,"g":0,"b":0,"extra":true}]' }, { drawers: [], swatches: 2, leanSnap: true }],
  ];
  for (const [title, seed, want] of flavors) {
    const storage = {}; for (const [k, v] of Object.entries(seed)) storage[K(k)] = v;
    const t0 = Date.now();
    const page = await openPage(site, { storage });
    await busyHidden(page); await sleep(200);
    const ms = Date.now() - t0;
    const s = await page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), drawers: [...document.querySelectorAll('.rail details.drawer')].filter((d) => d.open).map((d) => d.dataset.drawer), smoothing: document.querySelector('input[name="smoothing"]:checked').value, lean: document.getElementById('lean').value, leanOut: document.getElementById('leanOut').value, blockView: document.querySelector('[data-block-view="photo"]').getAttribute('aria-pressed'), canvasSize: document.getElementById('canvasSize').value, canvasSys: document.getElementById('canvasSys').value, swatches: document.querySelectorAll('#swatches .swatch').length, swatchState: document.getElementById('swatchesState').textContent, toast: document.getElementById('toast').textContent, label: document.getElementById('source').textContent.trim(), zones: document.querySelectorAll('#zones li').length, busy: document.getElementById('busy').hidden }));
    t.check(s.label === SAMPLE_LABEL && s.zones === 3 && s.busy, `hostile storage (${title}): the sample study still loads`, { label: s.label, zones: s.zones, busy: s.busy });
    t.check(s.simple && s.smoothing === 'edge' && s.blockView === 'true', `hostile storage (${title}): mode, smoothing and block view fall back to their defaults`, s);
    t.check(want.leanSnap ? (/^\d+$/.test(s.lean) && +s.lean % 10 === 0 && s.leanOut === (s.lean === '0' ? 'Off' : s.lean + '%')) : (s.lean === '60' && s.leanOut === '60%'), `hostile storage (${title}): the lean is ${want.leanSnap ? 'a valid step and its output agrees' : 'its default'}`, { lean: s.lean, leanOut: s.leanOut });
    t.check(same(s.drawers, want.drawers), `hostile storage (${title}): only valid drawer names open`, s.drawers);
    t.check(s.swatches === want.swatches && (want.swatches ? s.swatchState === `${want.swatches} color${want.swatches === 1 ? '' : 's'}` : s.swatchState === 'None yet'), `hostile storage (${title}): only valid picked colors survive`, { swatches: s.swatches, state: s.swatchState });
    t.check(!/could not be read/.test(s.toast), `hostile storage (${title}): no "saved settings could not be read" note`, s.toast);
    t.note(`hostile storage (${title}): canvas unit input "${s.canvasSize}" ${s.canvasSys}; start-up ${ms} ms`);
    // a toggle heals the drawers key, and the page keeps working
    await page.evaluate(() => { document.getElementById('drawer-values').open = !document.getElementById('drawer-values').open; });
    await sleep(100);
    const healed = await storageGet(page, K('drawers'));
    let parsed = null; try { parsed = JSON.parse(healed); } catch (e) { /* not json */ }
    t.check(Array.isArray(parsed) && parsed.every((k) => ['values', 'colors', 'swatches', 'check'].includes(k)), `hostile storage (${title}): toggling a drawer rewrites the key as a clean list`, healed && healed.slice(0, 80));
    await setRange(page, 'colors', 2);
    t.check((await study(page)).busy && (await study(page)).colorsPer === 2, `hostile storage (${title}): a setting still reruns the study`);
    await clean(t, page, `hostile storage (${title})`);
    await page.context().close();
  }

  // ---- the phone width ----
  {
    const page = await openPage(site, { viewport: PHONE });
    const first = await study(page);
    t.check(first.label === SAMPLE_LABEL && first.zones === 3 && first.busy && (await hscroll(page)) <= 0, 'phone: the sample loads with no horizontal scroll', { label: first.label, hscroll: await hscroll(page) });
    t.check(await visible(page, '[data-mode="advanced"]') && await visible(page, 'label[for="file"]') && await visible(page, '#drawer-values summary'), 'phone: the mode switch, Load photo and the drawers are on screen');
    for (const [title, file, dims] of [['phone: a 4000 × 20 strip', await makeImage(page, { width: 4000, height: 20, draw: 'noise' }), [4000, 20]], ['phone: a 900 × 1200 JPEG', await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg' }), [900, 1200]], ['phone: 25 megapixels', await makeImage(page, { width: 5000, height: 5000, type: 'image/jpeg' }), [2800, 2800]]]) {
      const r = await loadKind(page, file);
      t.check(r.loaded && same(r.value, studySize(...dims)) && (await hscroll(page)) <= 0, `${title}: loaded, no horizontal scroll`, { label: r.label, value: r.value, hscroll: await hscroll(page) });
      if (dims[0] === 2800) t.check(/reduced to 2800 × 2800/.test(r.toast), `${title}: the reduction note is said`, r.toast);
      await clean(t, page, title);
    }
    await resetToast(page);
    await page.setInputFiles('#file', textFile());
    await waitToast(page, NOT_IMAGE);
    const box = await page.evaluate(() => { const e = document.getElementById('toast'); const r = e.getBoundingClientRect(); return { shown: e.classList.contains('show'), left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight }; });
    t.check(box.shown && box.left >= 0 && box.right <= box.w && box.bottom <= box.h, 'phone: the toast is on screen', box);
    await page.evaluate(() => { document.getElementById('drawer-values').open = true; }); await sleep(150);
    t.check(await visible(page, 'label[for="dpSoft"]') && (await hscroll(page)) <= 0, 'phone: the open drawer shows the Detail preset', await hscroll(page));
    await clickWait(page, 'label[for="dpSoft"]');
    t.check((await study(page)).header === 'Soft detail' && (await study(page)).simplify === 6, 'phone: Soft applies and the header says so', (await study(page)).header);
    await clickWait(page, '[data-mode="advanced"]');
    t.check(await visible(page, '#simplify') && (await hscroll(page)) <= 0, 'phone: Advanced shows the sliders with no horizontal scroll', await hscroll(page));
    await screenshot(page, 'study-photos-phone-advanced');
    await page.reload({ waitUntil: 'load' }); await sleep(600); await busyHidden(page);
    const kept = await page.evaluate(() => ({ drawers: [...document.querySelectorAll('.rail details.drawer')].filter((d) => d.open).map((d) => d.dataset.drawer), simple: document.body.classList.contains('mode-simple'), label: document.getElementById('source').textContent.trim() }));
    t.check(same(kept.drawers, ['values']) && !kept.simple && kept.label === SAMPLE_LABEL, 'phone: after a reload the drawer and Advanced are remembered, the photo is not', kept);
    await clean(t, page, 'phone');
    await page.context().close();
  }
}
