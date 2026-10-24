// The Study tab's photo pipeline and its settings, played like a sceptical tester: the sample on the
// first load; every kind of photo through the file input, a drop and a paste (a 1 px image, one under
// the 16 px floor, strips, 24 megapixels and one past it, flat tones, noise, a transparent PNG, a JPEG,
// a WebP, SVGs, a text file, a broken image) and what the page says for each; a second photo while the
// first is still being read; a Working size change in the window after a load; every slider, split,
// gray value and preset at its ends and one past them; slider spam; Auto split on flat tones; Simple
// and Advanced and what each hides; the preset shown against the setting in force; what is remembered
// across a reload (drawers, lean, block view, smoothing, mode); hostile saved state for every key app.js
// reads; keyboard-only operation; and the phone width.
// Then the studies themselves on pictures drawn with known tones (hard edges and halftone bands, Simplify off,
// Photo average, Set values' grays on the canvas, Outline shapes, Auto split, Merge small shapes, Edge-aware
// against Soft, the most prominent color and the shape rescue, the lean, Colors per value, the Palette view's
// Save PNG); a phone photo with an EXIF orientation; the page opened from disk; storage that throws and storage
// that is full; the Show switch; a photo dropped or pasted on another tab and what the Studio's reference and the
// game do with it; the heaviest settings on the biggest photo; the keyboard for every other control; dark mode's
// histogram; the phone's drawers and long file names; and odd drops and pastes.
import fs from 'node:fs';
import { openPage, clean, tab, makeImage, dropFiles, dropText, pasteFile, textFile, brokenImage, svgImage, storageGet, storageKeys, click, text, visible, hscroll, screenshot, stroke, sleep, DESKTOP, PHONE, newTab } from '../lib.mjs';

const SAMPLE_LABEL = 'Sample study · a painted stand-in. Load, drop or paste a portrait to use your own.';
const NO_SIZE = /That image has no usable size\. Use a JPG, PNG or WebP photo\./;
const TOO_SMALL = /too small to study \(\d+ × \d+ px\): it needs at least 16 px on each side/; // a picture with a size, but under the floor
const NOT_IMAGE = /That file is not an image\. Choose a JPG, PNG or WebP photo\./;
const NOT_OPENED = /This image could not be opened\. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first\./;
const WORKING = 900; // the default Working size
// the study's size for a photo of w × h at a working size (processing.js prepare: never upscaled)
const studySize = (w, h, side = WORKING) => { const s = Math.min(1, side / Math.max(w, h)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- helpers for this case -------------------------------------------------

const toast = (page) => page.evaluate(() => { const e = document.getElementById('toast'); return e ? e.textContent.trim() : null; }); // a page or a frame
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

// a picture painted in the page in exact sRGB tones, as a file: rect [x, y, w, h], ellipse [cx, cy, rx, ry], or a
// dither [x, y, w, h] of two tones (of every `of` pixels, the first `on` are `a`); a tone with a fourth number is
// see-through by that much, and bg null leaves the rest transparent
async function paintPng(page, { width = 600, height = 800, name = 'synthetic.png', type = 'image/png', bg = [128, 128, 128], shapes = [] } = {}) {
  const url = await page.evaluate(([w, h, type, bg, shapes]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const css = (t) => (t.length > 3 ? `rgba(${t.join(',')})` : `rgb(${t.join(',')})`);
    if (bg) { g.fillStyle = css(bg); g.fillRect(0, 0, w, h); }
    for (const s of shapes) {
      if (s.rect) { g.fillStyle = css(s.rgb); g.fillRect(...s.rect); }
      else if (s.ellipse) { g.fillStyle = css(s.rgb); g.beginPath(); g.ellipse(s.ellipse[0], s.ellipse[1], s.ellipse[2], s.ellipse[3], 0, 0, Math.PI * 2); g.fill(); }
      else if (s.dither) { const [x0, y0, dw, dh] = s.dither; const d = g.getImageData(x0, y0, dw, dh); for (let i = 0; i < dw * dh; i++) { const tone = i % s.of < s.on ? s.a : s.b; d.data[i * 4] = tone[0]; d.data[i * 4 + 1] = tone[1]; d.data[i * 4 + 2] = tone[2]; d.data[i * 4 + 3] = 255; } g.putImageData(d, x0, y0); }
    }
    return c.toDataURL(type, 0.95);
  }, [width, height, type, bg, shapes]);
  return { name, mimeType: type, buffer: Buffer.from(url.split(',')[1], 'base64') };
}
// a JPEG with an EXIF Orientation tag, as a phone writes it (6: the camera was turned a quarter clockwise), after its JFIF segment
function withOrientation(file, orientation) {
  const buf = file.buffer;
  const at = buf[2] === 0xff && buf[3] === 0xe0 ? 4 + buf.readUInt16BE(4) : 2;
  const app1 = Buffer.from('ffe10022' + '457869660000' + '4d4d002a00000008' + '0001' + '0112' + '0003' + '00000001' + orientation.toString(16).padStart(4, '0') + '0000' + '00000000', 'hex');
  return { ...file, buffer: Buffer.concat([buf.subarray(0, at), app1, buf.subarray(at)]) };
}
// both splits at once (shadow first, so the light split never has to push it), then the rerun
async function splits(page, a, b) {
  await page.evaluate(([a, b]) => { for (const [id, v] of [['t1', a], ['t2', b]]) { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); } }, [a, b]);
  await busyHidden(page); await sleep(40);
}
// what the studies hold: the value shares and grays, the block colors, the zone and block of some pixels, and how
// many pixels have a block color from another value than their own
const res = (page, at = []) => page.evaluate((at) => {
  const r = Studio.result(), w = r.w;
  let off = 0; for (let i = 0; i < r.zone.length; i++) if (r.zone[i] !== r.zoneOf[r.block[i]]) off++;
  return { share: r.zoneShare.slice(), zoneL: r.zoneL.slice(), t1: +document.getElementById('t1').value, t2: +document.getElementById('t2').value, colors: r.blockColors.map((c) => ({ rgb: [c.r, c.g, c.b], zone: c.zone, share: c.share, label: c.label })), at: at.map(([x, y]) => ({ zone: r.zone[y * w + x], block: r.block[y * w + x] })), off, settings: Studio.settings() };
}, at);
// for each color, the nearest of some tones and how far it is from it (CIEDE2000, as the page measures)
const nearestTone = (page, colors, tones) => page.evaluate(([cs, ts]) => cs.map((c) => { const p = Study.rgbToLab(...c); let best = -1, d = Infinity; ts.forEach((tn, i) => { const q = Study.rgbToLab(...tn); const e = Study.deltaE2000(p[0], p[1], p[2], q[0], q[1], q[2]); if (e < d) { d = e; best = i; } }); return [best, +d.toFixed(2)]; }), [colors, tones]);
const pngDims = (buf) => (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);
async function download(page, act, timeout = 10000) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), act()]);
  if (!dl) return null;
  const p = await dl.path().catch(() => null);
  return { name: dl.suggestedFilename(), buf: p ? fs.readFileSync(p) : Buffer.alloc(0) };
}
// a downloaded PNG decoded in the page and compared with a canvas there, pixel for pixel
const pngVsCanvas = (page, buf, id) => page.evaluate(async ([b64, id]) => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const a = g.getImageData(0, 0, c.width, c.height).data; const cv = document.getElementById(id); const b = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let diff = 0; if (a.length === b.length) for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1) diff++;
  return { w: bmp.width, h: bmp.height, same: a.length === b.length && diff === 0, diff: a.length === b.length ? diff : -1 };
}, [buf.toString('base64'), id]);
// the page as it is right now, as a visitor would see the Study tab's settings
const ui = (page) => page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), smoothing: document.querySelector('input[name="smoothing"]:checked').value, lean: document.getElementById('lean').value, leanOut: document.getElementById('leanOut').value, palettePressed: document.querySelector('[data-block-view="palette"]').getAttribute('aria-pressed'), drawers: [...document.querySelectorAll('.rail details.drawer')].filter((d) => d.open).map((d) => d.dataset.drawer), header: document.getElementById('valuesState').textContent.trim(), toast: document.getElementById('toast').textContent, label: document.getElementById('source').textContent.trim(), busy: document.getElementById('busy').hidden, inForce: Studio.settings().smoothing }));

// a GIF written here, since the case ships no picture: a 256-entry gray table, LZW codes of 9 bits, and a clear code
// every 100 pixels, so every code is a literal and the decoder's table never reaches a width change
function gifFile(name, w, h, pixel) {
  const px = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(pixel(x, y) & 255);
  const codes = [256];
  px.forEach((v, i) => { if (i > 0 && i % 100 === 0) codes.push(256); codes.push(v); });
  codes.push(257);
  const bytes = []; let bits = 0, nbits = 0;
  for (const c of codes) { bits |= c << nbits; nbits += 9; while (nbits >= 8) { bytes.push(bits & 255); bits >>= 8; nbits -= 8; } }
  if (nbits > 0) bytes.push(bits & 255);
  const sub = []; for (let i = 0; i < bytes.length; i += 255) { const chunk = bytes.slice(i, i + 255); sub.push(chunk.length, ...chunk); }
  const table = []; for (let i = 0; i < 256; i++) table.push(i, i, i);
  return { name, mimeType: 'image/gif', buffer: Buffer.from([...Buffer.from('GIF89a'), w & 255, w >> 8, h & 255, h >> 8, 0xf7, 0, 0, ...table, 0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 8, ...sub, 0, 0x3b]) };
}
// the Simple palette list and the one Best match badge that shows, read in the order the list is in
const paletteList = (page) => page.evaluate(() => {
  const items = [...document.querySelectorAll('#presetList li')];
  const shown = items.filter((li) => getComputedStyle(li).display !== 'none');
  const badges = [...document.querySelectorAll('#presetList .preset-best, #presetList .preset-best-simple')].filter((b) => getComputedStyle(b).display !== 'none' && getComputedStyle(b.closest('li')).display !== 'none').map((b) => b.closest('li').dataset.preset);
  return {
    mode: document.body.classList.contains('mode-simple') ? 'simple' : 'advanced',
    shown: shown.map((li) => ({ id: li.dataset.preset, name: li.querySelector('.preset-name').textContent, why: li.querySelector('.preset-why') ? li.querySelector('.preset-why').textContent : '' })),
    badges, used: document.getElementById('blockViewPalette').textContent,
    pressed: [...document.querySelectorAll('#presetList .preset[aria-pressed="true"]')].map((b) => b.closest('li').dataset.preset),
  };
});
const bareName = (name) => name.replace(/\s*\(.*\)$/, '').replace(/ palette$/i, '');
// the histogram's bar columns (any bar-colored pixel above the value ramp) and the split marks (accent, full height)
const histogramCols = (page) => page.evaluate(() => {
  const c = document.getElementById('hist'); const W = c.width, H = c.height; const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const probe = document.createElement('canvas'); probe.width = probe.height = 1; const pg = probe.getContext('2d');
  pg.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); pg.fillRect(0, 0, 1, 1); const ac = pg.getImageData(0, 0, 1, 1).data;
  const isAccent = (i) => Math.abs(d[i] - ac[0]) < 12 && Math.abs(d[i + 1] - ac[1]) < 12 && Math.abs(d[i + 2] - ac[2]) < 12;
  const bar = [], mark = [];
  for (let x = 0; x < W; x++) {
    let nb = 0, na = 0;
    for (let y = 0; y < H - 10; y++) { const i = (y * W + x) * 4; if (d[i + 3] < 200) continue; if (isAccent(i)) na++; else nb++; }
    if (nb > 0) bar.push(x);
    if (na > H * 0.5) mark.push(x);
  }
  return { W, H, cw: c.clientWidth, dpr: window.devicePixelRatio, bar, mark, t1: +document.getElementById('t1').value, t2: +document.getElementById('t2').value };
});

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
    // Set values' defaults (README Settings: V 2 / 5 / 8.5), and the grays the value study is really painted in
    const grays = await page.evaluate(() => {
      const r = Studio.result(); const c = document.getElementById('cv-value'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set(); let tinted = 0; for (let i = 0; i < d.length; i += 4) { seen.add(d[i]); if (d[i] !== d[i + 1] || d[i + 1] !== d[i + 2]) tinted++; }
      return { set: ['g0', 'g1', 'g2'].map((id) => [document.getElementById(id).value, document.getElementById(id + 'Out').value]), mode: document.querySelector('input[name="grayMode"]:checked').value, seen: [...seen].sort((a, b) => a - b), want: [20, 50, 85].filter((_, z) => r.zoneShare[z] > 0).map((l) => Study.grayForL(l)).sort((a, b) => a - b), tinted };
    });
    t.check(grays.mode === 'custom' && same(grays.set, [['20', 'V 2.0'], ['50', 'V 5.0'], ['85', 'V 8.5']]), 'first load: Gray values is Set values, at V 2 / 5 / 8.5', grays);
    t.check(same(grays.seen, grays.want) && grays.tinted === 0, 'first load: the value study is painted in exactly those grays, one per value', grays);
    await clean(t, page, 'first load');
    // the busy indicator and the moment the file was chosen, for the timings below
    await page.evaluate(() => { window.__busy = []; const b = document.getElementById('busy'); new MutationObserver(() => window.__busy.push([performance.now(), b.hidden])).observe(b, { attributes: true, attributeFilter: ['hidden'] }); document.getElementById('file').addEventListener('change', () => { window.__fileAt = performance.now(); }); });
    const sampleSplit = [first.t1, first.t2];

    // every kind of file: accepted (dims, label, what is said) or rejected (the toast, the study untouched)
    const kinds = [
      { title: '1 × 1 PNG', make: () => makeImage(page, { width: 1, height: 1 }), reject: TOO_SMALL },
      { title: '15 × 15 PNG (under the 16 px floor)', make: () => makeImage(page, { width: 15, height: 15 }), reject: TOO_SMALL },
      { title: '16 × 16 PNG (the floor itself)', make: () => makeImage(page, { width: 16, height: 16 }), dims: [16, 16] },
      { title: '2 × 4000 strip', make: () => makeImage(page, { width: 2, height: 4000 }), reject: TOO_SMALL },
      { title: '4000 × 2 strip', make: () => makeImage(page, { width: 4000, height: 2 }), reject: TOO_SMALL },
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
      { title: 'SVG 10 × 10', make: async () => svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>', 'tiny.svg'), reject: TOO_SMALL },
      { title: 'SVG without a size (Chromium gives it 300 × 150)', make: async () => svgImage(), dims: [300, 150], corner: [127, 127, 127], at: [200, 100] },
      { title: 'a text file', make: async () => textFile(), reject: NOT_IMAGE },
      { title: 'a broken JPEG', make: async () => brokenImage(), reject: NOT_OPENED },
      { title: 'a PNG handed over as application/octet-stream (its content decides)', make: async () => ({ ...(await makeImage(page, { width: 300, height: 200, name: 'octet' })), mimeType: 'application/octet-stream' }), dims: [300, 200] },
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
    // (a too-small photo is told it is too small, and the floor, since the fix: the rejections above check the words)

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
    t.note('a PNG handed over as application/octet-stream loads by its content, like one with an empty type: readImage lets a file of unknown type through to the decoder (checked among the kinds above).');
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
      // the last file chosen wins, whichever finishes reading first, and the other's reduction note is not said
      t.check(m && m[1] === 'light.png' && !/very large/.test(said), `two photos dropped at once, heavy.jpg (5000 × 5000) then light.png (run ${i}): the one chosen last is shown and nothing is said of the other`, { label: r.label, toast: said });
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
    // the value study itself follows the grays, not only the swatches in the list
    const painted = await page.evaluate(() => {
      const r = Studio.result(); const c = document.getElementById('cv-value'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      let wrong = 0; for (let i = 0, p = 0; i < r.zone.length; i++, p += 4) { const g = Study.grayForL([100, 0, 50][r.zone[i]]); if (d[p] !== g || d[p + 1] !== g || d[p + 2] !== g) wrong++; }
      return { seen: [...seen].sort(), wrong, shares: r.zoneShare.map((s) => Math.round(s * 100)) };
    });
    t.check(painted.wrong === 0 && painted.seen.length <= 3, 'the value study is painted in the grays set: shadow white (V 10), middle black (V 0), light V 5', painted);
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
      // (8 s: it failed once in CI at 4 s and never here; the detail says where the focus was if it fails again)
      const chooser = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
      const before = await page.evaluate(() => ({ active: document.activeElement && document.activeElement.id, busy: !document.getElementById('busy').hidden }));
      await page.keyboard.press('Space');
      const fc = await chooser;
      t.check(!!fc, 'keyboard: Space on Load photo opens the file chooser', fc ? 'opened' : { before, after: await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)) });
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
      { title: 'dropped 15 × 15 PNG', files: [await makeImage(page, { width: 15, height: 15 })], reject: TOO_SMALL },
      { title: 'dropped sizeless SVG', files: [svgImage()], name: 'drawing.svg', dims: [300, 150] },
      { title: 'two files dropped at once (the first is taken, and the drop says so)', files: [await makeImage(page, { width: 400, height: 500, name: 'first.png' }), await makeImage(page, { width: 300, height: 300, name: 'second.png' })], name: 'first.png', dims: [400, 500], said: /^Of the 2 files dropped, only first\.png was taken\.$/ },
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
        if (d.said) t.check(await waitToast(page, d.said), `${d.title}: the page says which was loaded`, await toast(page));
      }
      await clean(t, page, d.title);
    }
    await resetToast(page);
    await dropText(page, 'body', 'just some words');
    await sleep(400);
    t.check((await toast(page)) === 'That was text, not a picture. Drop a JPG, PNG or WebP photo, or paste one.' && (await study(page)).label.startsWith('first.png'), 'dropped plain text: nothing loads, and the page says it was text', await toast(page));
    await resetToast(page);
    await dropText(page, 'body', '<img src="https://example.com/a.jpg">', 'https://example.com/a.jpg');
    await sleep(400);
    t.check(/Save the picture to your device first, then drop the file here\./.test(await toast(page)), 'a picture dragged from another page gets the save-it-first hint', await toast(page));
    await clean(t, page, 'text drops');
    const pastes = [
      { title: 'pasted PNG', file: await makeImage(page, { width: 700, height: 500, name: 'shot.png' }), name: 'shot.png', dims: [700, 500] },
      { title: 'pasted transparent PNG', file: await makeImage(page, { draw: 'transparent', name: 'cut.png' }), name: 'cut.png', dims: [600, 800], corner: [127, 127, 127] },
      { title: 'pasted broken image', file: brokenImage('clip.jpg'), reject: NOT_OPENED },
      { title: 'pasted text file (no image on the clipboard)', file: textFile(), reject: NOT_IMAGE },   // refused in words, as the same file dropped is
      { title: 'pasted 1 × 1 PNG', file: await makeImage(page, { width: 1, height: 1, name: 'dot.png' }), reject: TOO_SMALL },
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

  // ==== the studies themselves, and what the first pass left out ====

  // ---- pictures drawn with known tones: what each study promises, read off Studio.result() and the canvases ----
  {
    const page = await openPage(site);
    await clickWait(page, '[data-mode="advanced"]');
    await setRange(page, 'merge', 0);
    const D = [50, 50, 50], M = [119, 119, 119], LT = [196, 196, 196]; // L* 20.8, 50.0 and 79.2
    const [LD, , LL] = await page.evaluate((ts) => ts.map((x) => Study.rgbToLab(...x)[0]), [D, M, LT]);
    const G = await page.evaluate(() => [20, 50, 85].map((l) => Study.grayForL(l))); // Set values' default grays

    // Hard edges stay hard: a hard step from shadow to light gets no middle band, a halftone band stays, a 2 px one goes
    const edge = {
      hard: await paintPng(page, { name: 'edge-hard.png', bg: LT, shapes: [{ rect: [0, 0, 300, 800], rgb: D }] }),
      band30: await paintPng(page, { name: 'edge-band30.png', bg: LT, shapes: [{ rect: [0, 0, 285, 800], rgb: D }, { rect: [285, 0, 30, 800], rgb: M }] }),
      band2: await paintPng(page, { name: 'edge-band2.png', bg: LT, shapes: [{ rect: [0, 0, 299, 800], rgb: D }, { rect: [299, 0, 2, 800], rgb: M }] }),
    };
    await setRange(page, 'simplify', 10);
    for (const [kind, file] of Object.entries(edge)) {
      await loadKind(page, file);
      await splits(page, 35, 65);
      for (const [radio, mode] of [['#smoothSoft', 'Soft'], ['#smoothEdge', 'Edge-aware']]) {
        await clickWait(page, radio);
        const r = await res(page);
        if (kind === 'hard') {
          const other = await page.evaluate(([g0, g2]) => { const c = document.getElementById('cv-value'); const d = c.getContext('2d').getImageData(296, 0, 8, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== g0 && d[i] !== g2) n++; return n; }, [G[0], G[2]]);
          t.check(r.share[1] < 0.005 && other === 0, `hard edge, ${mode} at Simplify 10 (splits 35/65): straight from shadow to light, no middle band (the value study within 4 px of the edge holds only the shadow and light grays)`, { middle: r.share[1], otherGrays: other });
        } else if (kind === 'band30') {
          t.check(Math.abs(r.share[1] - 30 / 600) < 0.01, `a 30 px halftone between shadow and light, ${mode} at Simplify 10: it stays a middle band (5% of the picture)`, r.share);
        } else {
          t.check(r.share[1] < 0.002, `a 2 px halftone between shadow and light, ${mode} at Simplify 10: split with the edge (under about 4 px)`, r.share);
        }
      }
    }
    await setRange(page, 'simplify', 0);
    t.check(Math.abs((await res(page)).share[1] - 2 / 600) < 0.0005, 'Simplify off: the 2 px halftone stays middle (every pixel split by its own value)', (await res(page)).share);
    await clean(t, page, 'hard edges stay hard');

    // Simplify off: nothing smoothed, every pixel split by its own L* (noise, both smoothings)
    await loadKind(page, await makeImage(page, { draw: 'noise', name: 'noise.png' }));
    await splits(page, 35, 65);
    for (const [radio, mode] of [['#smoothSoft', 'Soft'], ['#smoothEdge', 'Edge-aware']]) {
      await clickWait(page, radio);
      const own = await page.evaluate(() => { const r = Studio.result(), p = Studio.prep(), s = Studio.settings(); const d = document.getElementById('cv-orig').getContext('2d').getImageData(0, 0, p.w, p.h).data; let off = 0; for (let i = 0; i < p.w * p.h; i++) { const L = Study.rgbToLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])[0]; if ((L < s.t1 ? 0 : L < s.t2 ? 1 : 2) !== r.zone[i]) off++; } return { off, n: p.w * p.h, cacheRadius: p.blurCache && p.blurCache.r, blurRadius: s.blurRadius }; });
      t.check(own.off <= own.n * 0.001 && own.cacheRadius === 0 && own.blurRadius === 0, `Simplify off, ${mode}: the value study is the photo's own L* split pixel by pixel (noise, splits 35/65)`, own);
    }
    await clean(t, page, 'simplify off');

    // Photo average: each mass painted at its own average value; the empty middle keeps its default (V 5)
    await loadKind(page, edge.hard); await splits(page, 35, 65); // Simplify off: the halves are L* 20.8 and 79.2 exactly
    await clickWait(page, '#grayAvg');
    {
      const r = await res(page);
      const shown = await page.evaluate(() => ({ px: [[100, 400], [500, 400]].map(([x, y]) => [...document.getElementById('cv-value').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3)), want: Studio.result().zoneL.map((l) => Study.grayForL(l)), meta: [...document.querySelectorAll('#zones li .meta')].map((e) => e.textContent) }));
      t.check(Math.abs(r.zoneL[0] - LD) < 1 && r.zoneL[1] === 50 && Math.abs(r.zoneL[2] - LL) < 1 && Math.abs(r.share[0] - 0.5) < 0.001 && r.share[1] === 0, `Photo average on halves of L* ${LD.toFixed(1)} and ${LL.toFixed(1)}: the masses average to them, the empty middle keeps V 5`, { zoneL: r.zoneL, share: r.share });
      t.check(same(shown.px[0], [shown.want[0], shown.want[0], shown.want[0]]) && same(shown.px[1], [shown.want[2], shown.want[2], shown.want[2]]), 'Photo average: the value study is painted in those averages', shown);
      t.check(same(shown.meta, ['V 2.1 · 50%', 'V 5.0 · 0%', 'V 7.9 · 50%']), 'Photo average: the list says V 2.1 · 50%, V 5.0 · 0%, V 7.9 · 50%', shown.meta);
    }
    await clickWait(page, '#grayCustom');

    // Outline shapes: every border on both studies darkened, and nothing else; the block colors don't count them
    const outlined = (on) => page.evaluate((on) => {
      const r = Studio.result(), w = r.w, n = r.zone.length, color = new Map(r.blockColors.map((c) => [c.label, [c.r, c.g, c.b]]));
      const out = {};
      for (const [id, lab, base] of [['cv-value', r.zone, (i) => { const g = r.zoneGray[r.zone[i]]; return [g, g, g]; }], ['cv-block', r.block, (i) => color.get(r.block[i])]]) {
        const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let edges = 0, wrong = 0;
        for (let i = 0; i < n; i++) {
          const x = i % w, isEdge = (x < w - 1 && lab[i + 1] !== lab[i]) || (i < n - w && lab[i + w] !== lab[i]);
          const b = base(i), p = i * 4, want = on && isEdge ? [b[0] * 0.2 + 16, b[1] * 0.2 + 14.4, b[2] * 0.2 + 17.6] : b;
          if (isEdge) edges++;
          if (Math.abs(d[p] - want[0]) > 1 || Math.abs(d[p + 1] - want[1]) > 1 || Math.abs(d[p + 2] - want[2]) > 1) wrong++;
        }
        out[id] = { edges, wrong };
      }
      return out;
    }, on);
    {
      const before = (await res(page)).colors.map((c) => c.rgb.join());
      await clickWait(page, '#outlines');
      const on = await outlined(true);
      t.check(on['cv-value'].edges >= 800 && on['cv-value'].wrong === 0 && on['cv-block'].edges >= 800 && on['cv-block'].wrong === 0, 'Outline shapes: both studies have every shape border darkened, and no other pixel changed', on);
      t.check(same((await res(page)).colors.map((c) => c.rgb.join()), before), 'Outline shapes: the block colors are the shapes\' colors, not the outline tone', { before, now: (await res(page)).colors.map((c) => c.rgb.join()) });
      await clickWait(page, '#outlines');
      const off = await outlined(false);
      t.check(off['cv-value'].wrong === 0 && off['cv-block'].wrong === 0, 'Outline shapes off: both studies are flat shapes again', off);
    }
    await clean(t, page, 'photo average, outlines');

    // Auto split (three-class Otsu) on thirds of L* 20.8 / 50 / 79.2: a split between each pair, a third in each value
    const thirds = await paintPng(page, { name: 'thirds.png', bg: M, shapes: [{ rect: [0, 0, 200, 800], rgb: D }, { rect: [400, 0, 200, 800], rgb: LT }] });
    await loadKind(page, thirds);
    for (const sim of [0, 3]) {
      await setRange(page, 'simplify', sim); await splits(page, 90, 95); await clickWait(page, '#autoSplit');
      const r = await res(page);
      t.check(r.t1 > LD && r.t1 < 50 && r.t2 > 50 && r.t2 < LL && r.share.every((s) => Math.abs(s - 1 / 3) < 0.02), `Auto split on three flat thirds (Simplify ${sim}): a split between each pair of tones, a third in each value`, { t1: r.t1, t2: r.t2, share: r.share });
    }
    // and on two tones: the dark one is the shadow, the light one the light (the middle is the empty one)
    const twoTone = {};
    await loadKind(page, edge.hard);
    for (const sim of [3, 0]) {
      await setRange(page, 'simplify', sim); await splits(page, 90, 95); await clickWait(page, '#autoSplit');
      const r = await res(page);
      twoTone[sim] = r;
      t.check(Math.abs(r.share[0] - 0.5) < 0.01 && r.share[1] < 0.01 && Math.abs(r.share[2] - 0.5) < 0.01, `Auto split on two flat tones, L* ${LD.toFixed(1)} and ${LL.toFixed(1)} (Simplify ${sim}): the dark half is the shadow, the light half the light`, { t1: r.t1, t2: r.t2, share: r.share });
    }
    if (twoTone[0].share[1] > 0.4) t.finding({ title: 'Auto split with Simplify off on a picture of two flat tones leaves Shadow empty and paints the dark tone as the middle gray', severity: 'medium', steps: 'Advanced → Dark, middle, light: Simplify to Off. Load a PNG whose left half is rgb(50,50,50) and right half rgb(196,196,196) (L* 20.8 and 79.2), or press Auto split with it loaded.', expected: `The dark half in Shadow (V 2 gray) and the light half in Light (V 8.5), the middle the empty value, as Auto split gives at Simplify 3 (splits ${twoTone[3].t1}/${twoTone[3].t2}).`, actual: `Splits at V ${(twoTone[0].t1 / 10).toFixed(1)} and ${(twoTone[0].t2 / 10).toFixed(1)}: Shadow ${Math.round(twoTone[0].share[0] * 100)}%, Middle ${Math.round(twoTone[0].share[1] * 100)}%, Light ${Math.round(twoTone[0].share[2] * 100)}%; the dark half is painted V 5 middle gray. The same happens on loading such a picture at Simplify off, since a new photo gets an auto split.`, cause: 'js/processing.js:273-290 (autoThresholds): with two tones every split that puts them in different classes scores the same between-class variance, and the loop keeps the first it finds (a = 1, line 278 takes only a strictly better one), whose shadow class [0, a) is empty; split(1) then puts t1 at 11, below the dark tone. A loaded photo gets the same split (js/app.js:398, prepareAndRun; lines as of aac638b).' });
    await clean(t, page, 'auto split on known tones');

    // Merge small shapes: a speck smaller than the size threshold folds into the shape it shares the most edge with
    const speck = await paintPng(page, { name: 'speck.png', bg: [210, 210, 210], shapes: [{ rect: [0, 700, 600, 100], rgb: [40, 40, 40] }, { ellipse: [300, 300, 27.64, 27.64], rgb: [40, 40, 40] }] }); // a disc of 0.5%
    await loadKind(page, speck); await setRange(page, 'simplify', 0); await splits(page, 35, 65);
    for (const m of [0, 6, 7, 10]) {
      await setRange(page, 'merge', m);
      const r = await res(page, [[300, 300]]);
      const s = await page.evaluate(() => { const r = Studio.result(); let disc = 0; for (let i = 0; i < 700 * r.w; i++) if (r.zone[i] === 0) disc++; return { disc, block: [...document.getElementById('cv-block').getContext('2d').getImageData(300, 300, 1, 1).data].slice(0, 3) }; });
      const min = r.settings.minSize;
      if (m === 0 || m === 6) t.check(r.at[0].zone === 0 && s.disc >= Math.max(min, 2200) && same(s.block, [40, 40, 40]), `Merge ${m} (shapes under ${min} px fold): the ${s.disc} px dark disc stays a shadow shape on both studies`, { min, ...s, zone: r.at[0].zone });
      else t.check(r.at[0].zone === 2 && s.disc === 0 && r.share[0] === 60000 / 480000 && same(s.block, [210, 210, 210]), `Merge ${m} (shapes under ${min} px fold): the 0.5% dark disc folds into the light field around it, on both studies`, { min, ...s, zone: r.at[0].zone, shadow: r.share[0] });
    }
    await setRange(page, 'merge', 0);
    await clean(t, page, 'merge small shapes');

    // Edge-aware against Soft: corners of shadow shapes stay sharp, small dark shapes keep their place
    const square = await paintPng(page, { name: 'square.png', bg: [200, 200, 200], shapes: [{ rect: [100, 100, 200, 200], rgb: [40, 40, 40] }, { ellipse: [200, 550, 20, 20], rgb: [40, 40, 40] }, { ellipse: [420, 550, 20, 20], rgb: [40, 40, 40] }] });
    await loadKind(page, square); await splits(page, 35, 65);
    const shapesNow = () => page.evaluate(() => { const r = Studio.result(), w = r.w; let sq = 0, miss = 0, discs = 0; for (let y = 0; y < r.h; y++) for (let x = 0; x < w; x++) { const z0 = r.zone[y * w + x] === 0; if (y < 400 && z0) sq++; if (y >= 400 && z0) discs++; if (x >= 100 && x < 130 && y >= 100 && y < 130 && !z0) miss++; } return { corner: r.zone[101 * w + 101], square: +(sq / 40000).toFixed(4), cornerLost: miss, discs: +(discs / (2 * Math.PI * 400)).toFixed(3) }; });
    const sm = {};
    for (const sim of [3, 5, 10]) {
      await setRange(page, 'simplify', sim);
      for (const [radio, mode] of [['#smoothEdge', 'edge'], ['#smoothSoft', 'soft']]) { await clickWait(page, radio); sm[mode + sim] = await shapesNow(); }
    }
    await clickWait(page, '#smoothEdge');
    t.check(sm.edge3.corner === 0 && sm.soft3.corner !== 0, 'Simplify 3 (the default): the square\'s corner pixel stays shadow with Edge-aware, and Soft rounds it off', { edge: sm.edge3, soft: sm.soft3 });
    t.check(sm.edge5.discs >= 0.9 && sm.edge5.discs - sm.soft5.discs >= 0.1, 'Simplify 5: two small dark discs (40 px) keep their shadow area with Edge-aware, and shrink with Soft', { edge: sm.edge5.discs, soft: sm.soft5.discs });
    t.check(Math.abs(sm.edge10.square - 1) < 0.03 && sm.edge10.cornerLost * 2 < sm.soft10.cornerLost, 'Simplify 10: Edge-aware keeps the square\'s shadow area within 3% and its corner far sharper than Soft', { edge: sm.edge10, soft: sm.soft10 });
    t.note(`Edge-aware vs Soft on a 200 px dark square and two 40 px discs (zone-0 area kept, pixels lost from the 30 × 30 corner): Simplify 3 ${JSON.stringify(sm.edge3)} / ${JSON.stringify(sm.soft3)}; 5 ${JSON.stringify(sm.edge5)} / ${JSON.stringify(sm.soft5)}; 10 ${JSON.stringify(sm.edge10)} / ${JSON.stringify(sm.soft10)}. At Simplify 10 the discs merge away with either smoothing, as the README says small features do the more you simplify.`);
    await clean(t, page, 'edge-aware and soft');

    // The most prominent color, and the shape rescue: faces sharing one color group (Colors per value 1) with a
    // green-gray wall of the same value, each ringed by dark hair so it is a shape of its own
    await setRange(page, 'colors', 1); await setRange(page, 'lean', 0); await setRange(page, 'simplify', 0);
    const WALL = [110, 125, 110], ORANGE = [170, 105, 80], BLUE = [95, 121, 180], PURPLE = [160, 100, 170], HAIR = [30, 30, 30], LA = [230, 230, 230], LB = [205, 230, 255];
    const ringed = (cx, cy, rx, ry, rgb) => [{ ellipse: [cx, cy, rx + 10, ry + 10], rgb: HAIR }, { ellipse: [cx, cy, rx, ry], rgb }];
    const faces = await paintPng(page, { name: 'faces.png', bg: WALL, shapes: [
      { dither: [0, 0, 600, 80], a: LA, b: LB, of: 5, on: 3 }, { rect: [0, 740, 600, 60], rgb: HAIR },
      ...ringed(160, 250, 70, 87.3, ORANGE), ...ringed(450, 250, 60, 76.4, BLUE), ...ringed(160, 520, 55, 69.4, PURPLE), // 4%, 3% and 2.5% of the picture
      ...ringed(400, 470, 22, 27.8, ORANGE), ...ringed(500, 620, 11, 13.9, ORANGE), // 0.4% and 0.1%
      { ellipse: [300, 650, 40, 50], rgb: ORANGE }, // touching the wall, no hair around it
    ] });
    await loadKind(page, faces); await splits(page, 35, 65);
    {
      // the 4% face, the 0.4% one, the 0.1% one, the one touching the wall, the wall, the blue face, the purple face
      const pts = [[160, 250], [400, 470], [500, 620], [300, 650], [50, 400], [450, 250], [160, 520]];
      const r = await res(page, pts);
      const tones = [WALL, ORANGE, BLUE, PURPLE, HAIR, LA, LB];
      const near = await nearestTone(page, r.colors.map((c) => c.rgb), tones);
      const colorOf = (label) => r.colors.find((c) => c.label === label);
      const at = r.at.map((a) => colorOf(a.block));
      const [atNear, mean] = [await nearestTone(page, at.map((c) => c.rgb), tones), [0, 1, 2].map((k) => Math.round(0.6 * LA[k] + 0.4 * LB[k]))];
      const light = r.colors.filter((c) => c.zone === 2);
      const lightVsMean = await nearestTone(page, light.map((c) => c.rgb), [LA, mean]);
      t.check(near.every(([, d]) => d <= 2), 'Colors per value 1: every block color is one of the tones in the picture (within ΔE 2), never a mix', r.colors.map((c, i) => [c.rgb.join(), c.zone, near[i]]));
      t.check(light.length === 1 && lightVsMean[0][0] === 0 && lightVsMean[0][1] <= 2, 'the light strip, 60% one gray and 40% a pale blue: its color is the gray that covers the most of it, not their mix', { light: light.map((c) => c.rgb), vsGrayAndMean: lightVsMean });
      const mid = r.colors.filter((c) => c.zone === 1);
      t.check(mid.length >= 2 && mid.length <= 3 && atNear[0][0] === 1 && atNear[0][1] <= 2 && colorOf(r.at[0].block).zone === 1 && atNear[4][0] === 0, 'a face (4%) in the wall\'s group: it gets a new color of its own, its orange, in its value; the wall keeps its green-gray; at most two new colors in the value', { middle: mid.map((c) => c.rgb), face: atNear[0], wall: atNear[4] });
      t.check(r.at[1].block === r.at[0].block, 'a smaller face (0.4%, too small to add a color) joins the first face\'s orange, the closest color of its value', { small: at[1].rgb, face: at[0].rgb });
      t.check(atNear[2][0] === 0, 'a face under 0.2% of the picture keeps its group\'s color (the wall\'s)', { tiny: at[2].rgb });
      t.check(r.off === 0, 'every pixel\'s block color belongs to its own value (the color study agrees with the value study)', r.off);
      const px = await page.evaluate(() => [[160, 250], [50, 400]].map(([x, y]) => [...document.getElementById('cv-block').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3)));
      t.check(same(px[0], at[0].rgb) && same(px[1], at[4].rgb), 'the color study shows the face orange and the wall green-gray', px);
      const toneName = ([i, d]) => `${['the wall\'s green-gray', 'orange', 'blue', 'purple', 'the hair', 'gray', 'pale blue'][i]} (ΔE ${d})`;
      t.note(`shape rescue, Colors per value 1: the middle value's colors ${mid.map((c) => c.rgb.join('/')).join(', ')}; the blue face (3%) took ${toneName(atNear[5])}; the purple face (2.5%, after the value's two new colors) took ${toneName(atNear[6])}; the orange face touching the wall took ${toneName(atNear[3])}${atNear[3][0] === 0 ? ': one shape with the wall, as the README says such a shape keeps its color' : ''}.`);
    }
    await clean(t, page, 'most prominent color, shape rescue');

    // Lean toward lighter tones: one hue, a busy darker tone and a lighter one; Off takes the busiest, 100% reaches
    // to one a quarter as common, and no further
    const A = [200, 150, 120], B = [235, 195, 170];
    const leanFile = (rows, name) => paintPng(page, { name, bg: [40, 40, 40], shapes: [{ rect: [0, 0, 600, 480], rgb: A }, { rect: [0, 480, 600, rows], rgb: B }] });
    await loadKind(page, await leanFile(240, 'lean-half.png')); await splits(page, 30, 55);
    const lightColor = async () => { const r = await res(page); const c = r.colors.filter((x) => x.zone === 2); return { rgb: c.map((x) => x.rgb), near: await nearestTone(page, c.map((x) => x.rgb), [A, B]) }; };
    const lean = {};
    for (const v of [0, 60, 100]) { await setRange(page, 'lean', v); lean[v] = await lightColor(); }
    t.check(lean[0].near.length === 1 && lean[0].near[0][0] === 0 && lean[0].near[0][1] <= 2, 'Lean Off: the light group takes its most common color (the darker tone, twice as common)', lean[0]);
    t.check(lean[100].near.length === 1 && lean[100].near[0][0] === 1 && lean[100].near[0][1] <= 2, 'Lean 100%: the group takes the lighter tone of the same hue (half as common)', lean[100]);
    t.check(lean[60].near[0][0] === 0, 'Lean 60% (the default) reaches only to tones 55% as common: the darker tone stays', lean[60]);
    await loadKind(page, await leanFile(80, 'lean-sixth.png')); await splits(page, 30, 55); await setRange(page, 'lean', 100);
    const rare = await lightColor();
    t.check(rare.near[0][0] === 0, 'Lean 100% with the lighter tone a sixth as common (under a quarter): the darker tone stays', rare);
    await setRange(page, 'lean', 60);
    await clean(t, page, 'lean toward lighter tones');

    // Colors per value on a portrait: how many colors, where they are, and the same picture twice
    await loadKind(page, await makeImage(page, { name: 'portrait.png' }));
    await setRange(page, 'simplify', 3); await setRange(page, 'merge', 4);
    const perK = [];
    for (let k = 1; k <= 6; k++) {
      await setRange(page, 'colors', k);
      const c = await page.evaluate(() => {
        const r = Studio.result(); const d = document.getElementById('cv-block').getContext('2d').getImageData(0, 0, r.w, r.h).data;
        const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
        const listed = new Set(r.blockColors.map((b) => `${b.r},${b.g},${b.b}`));
        let off = 0; for (let i = 0; i < r.zone.length; i++) if (r.zone[i] !== r.zoneOf[r.block[i]]) off++;
        return { n: r.blockColors.length, perZone: [0, 1, 2].map((z) => r.blockColors.filter((b) => b.zone === z).length), sameSet: seen.size === listed.size && [...seen].every((x) => listed.has(x)), shown: seen.size, off, sum: r.blockColors.reduce((s, b) => s + b.share, 0), positive: r.blockColors.every((b) => b.share > 0) };
      });
      perK.push(`${k}: ${c.n} (${c.perZone.join('/')})`);
      t.check(c.n >= 3 && c.n <= 3 * k + 6 && c.perZone.every((z) => z >= 1 && z <= k + 2) && c.positive && Math.abs(c.sum - 1) < 1e-6, `Colors per value ${k}: ${c.n} block colors, ${k} groups and at most two new colors in each value, shares adding up to the picture`, c);
      t.check(c.sameSet && c.off === 0, `Colors per value ${k}: the color study shows exactly the listed colors, each pixel's inside its own value`, c);
    }
    t.note(`Colors per value on the drawn portrait, block colors (shadow/middle/light): ${perK.join('; ')}`);
    await setRange(page, 'colors', 3);
    const hash = () => page.evaluate(() => { const b = Studio.result().blockImage; let h = 0; for (let i = 0; i < b.length; i++) h = (h * 31 + b[i]) >>> 0; return h; });
    const h1 = await hash();
    await clickWait(page, '#outlines'); await clickWait(page, '#outlines');
    t.check(h1 === (await hash()), 'the same settings twice give the same color study, byte for byte (seeded k-means)', [h1, await hash()]);
    await clean(t, page, 'colors per value');

    // Big color shapes as a palette mixes them: outlines kept, Save PNG and the magnifier use the colors shown
    await clickWait(page, '#outlines');
    const photoPng = await download(page, () => click(page, '[data-save="block"]'));
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; });
    await page.waitForFunction(() => document.querySelectorAll('#presetList .preset').length === 10 && !document.getElementById('presetList').hasAttribute('aria-busy'), null, { timeout: 20000 }).catch(() => null);
    await click(page, '#presetList li[data-preset="zorn"] .preset');
    await click(page, '[data-block-view="palette"]');
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 60000 }).catch(() => null);
    {
      const kept = await page.evaluate(() => { const r = Studio.result(), w = r.w, n = r.block.length; const shown = document.getElementById('cv-block').getContext('2d').getImageData(0, 0, r.w, r.h).data; const b = r.blockImage; let edges = 0, edgeSame = 0, moved = 0; for (let i = 0; i < n; i++) { const x = i % w, e = (x < w - 1 && r.block[i + 1] !== r.block[i]) || (i < n - w && r.block[i + w] !== r.block[i]); const p = i * 4, eq = shown[p] === b[p] && shown[p + 1] === b[p + 1] && shown[p + 2] === b[p + 2]; if (e) { edges++; if (eq) edgeSame++; } else if (!eq) moved++; } return { edges, edgeSame, moved, name: document.getElementById('blockViewPalette').textContent }; });
      t.check(kept.name === 'Zorn' && kept.edges > 0 && kept.edgeSame === kept.edges && kept.moved > 0, 'Palette view (Zorn) with outlines on: the blocks are remixed, the outlines stay as they are', kept);
      const palPng = await download(page, () => click(page, '[data-save="block"]'));
      const asShown = palPng && await pngVsCanvas(page, palPng.buf, 'cv-block');
      const photoVs = photoPng && await pngVsCanvas(page, photoPng.buf, 'cv-block');
      t.check(palPng && palPng.name === 'portrait-color-blocks.png' && asShown.same && photoVs && !photoVs.same, 'Save PNG in the Palette view: the PNG is the blocks as Zorn mixes them, as shown (not the photo\'s colors)', { name: palPng && palPng.name, asShown, photoPngAgainstShown: photoVs });
      const cv = page.locator('#cv-block'); await cv.scrollIntoViewIfNeeded();
      const bx = await cv.boundingBox();
      const [mx, my] = [Math.round(bx.x + bx.width * 0.5), Math.round(bx.y + bx.height * 0.42)];
      await page.mouse.move(mx, my); await sleep(120);
      // the pixel under the pointer, found as the magnifier finds it (app.js sampleAt)
      const lp = await page.evaluate(([cx, cy]) => { const c = document.getElementById('cv-block'); const rect = c.getBoundingClientRect(); const x = Math.floor(((cx - rect.left) / rect.width) * c.width), y = Math.floor(((cy - rect.top) / rect.height) * c.height); const d = c.getContext('2d').getImageData(x, y, 1, 1).data; const r = Studio.result(); const own = r.blockColors.find((b) => b.label === r.block[y * r.w + x]); const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); return { loupe: document.getElementById('loupeHex').textContent.trim(), shown: hex([d[0], d[1], d[2]]), photo: hex([own.r, own.g, own.b]), up: !document.getElementById('loupe').hidden }; }, [mx, my]);
      t.check(lp.up && lp.loupe === lp.shown, 'Palette view: the magnifier reads the mixed color shown', lp);
      await page.mouse.move(5, 5);
      await click(page, '[data-block-view="photo"]'); await clickWait(page, '#outlines');
    }
    await clean(t, page, 'palette view, save png, magnifier');

    // a phone photo: a JPEG stored on its side with EXIF Orientation 6 is shown upright, and labelled upright
    const sideways = withOrientation(await paintPng(page, { width: 128, height: 64, type: 'image/jpeg', name: 'phone.jpg', bg: [230, 230, 230], shapes: [{ rect: [0, 0, 64, 64], rgb: [20, 20, 20] }] }), 6);
    {
      const r = await loadKind(page, sideways);
      const top = await pixel(page, 'cv-orig', 32, 16), bottom = await pixel(page, 'cv-orig', 32, 112);
      t.check(r.loaded && r.label === 'phone.jpg · 64 × 128 px' && same(r.orig, [64, 128]) && same(r.value, [64, 128]), 'a JPEG stored 128 × 64 with EXIF Orientation 6: labelled and studied upright, 64 × 128', { label: r.label, orig: r.orig });
      t.check(top[0] < 60 && bottom[0] > 200, 'EXIF Orientation 6: the stored left half (dark) is at the top, as the camera saw it', { top, bottom });
      const dl = await download(page, () => click(page, '[data-save="orig"]'));
      t.check(dl && dl.name === 'phone-original.png' && same(pngDims(dl.buf), [64, 128]), 'EXIF Orientation 6: Save PNG of the photo is upright too', dl && { name: dl.name, dims: pngDims(dl.buf) });
    }
    await clean(t, page, 'exif orientation');

    // a half see-through PNG is laid on mid gray (not black), and a pasted picture with no name
    await loadKind(page, await paintPng(page, { name: 'half.png', bg: null, shapes: [{ rect: [0, 0, 600, 800], rgb: [255, 0, 0, 0.5] }] }));
    t.check(near(await pixel(page, 'cv-orig', 300, 400), [191, 64, 64], 3), 'a PNG of half see-through red: laid on mid gray, rgb(191, 64, 64)', await pixel(page, 'cv-orig', 300, 400));
    await resetToast(page);
    await pasteFile(page, { ...(await makeImage(page, { width: 500, height: 400 })), name: '' });
    const unnamed = await study(page);
    const dlUnnamed = await download(page, () => click(page, '[data-save="value"]'));
    t.check(unnamed.label === 'Pasted image · 500 × 400 px' && dlUnnamed && dlUnnamed.name === 'portrait-three-value.png', 'a pasted picture with no name: labelled "Pasted image", saved as portrait-…', { label: unnamed.label, saved: dlUnnamed && dlUnnamed.name });
    await clean(t, page, 'half see-through, unnamed paste');
    await page.context().close();
  }

  // ---- opened from disk (README Running it: "Opened from disk, the page works too"): Load photo, a drop, a paste, Save PNG ----
  {
    const page = await site.browser.newPage({ viewport: DESKTOP });
    const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
    page.log = log;
    page.on('pageerror', (e) => log.pageerrors.push(String(e.stack || e.message).slice(0, 400)));
    page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver Message|SwiftShader|WebGL-0x/i.test(m.text())) log.console.push(m.text().slice(0, 300)); });
    page.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) log.offsite.push(r.url()); });
    page.on('requestfailed', (r) => { const why = (r.failure() || {}).errorText || ''; if (r.url().startsWith('blob:') || why === 'net::ERR_ABORTED') return; log.failed.push(r.url() + ' ' + why); });
    await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${(e.blockedURI || '').slice(0, 60)} ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber}`); }); });
    await page.goto('file://' + site.root + '/index.html', { waitUntil: 'load' }); await busyHidden(page); await sleep(300);
    t.check((await study(page)).label === SAMPLE_LABEL, 'from disk: the sample study is drawn', (await study(page)).label);
    const r = await loadKind(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'disk.jpg' }));
    const ok = await page.evaluate(() => !!Studio.result() && Studio.result().w === 675 && Studio.result().blockColors.length > 3);
    t.check(r.loaded && r.label === 'disk.jpg · 900 × 1200 px' && same(r.value, [675, 900]) && same(r.block, [675, 900]) && r.toast === '' && ok, 'from disk: Load photo studies the photo (675 × 900), nothing said', { label: r.label, value: r.value, toast: r.toast, ok });
    await clean(t, page, 'from disk: load photo');
    await dropFiles(page, 'body', [await makeImage(page, { width: 800, height: 600, name: 'disk-drop.png' })]);
    t.check(await waitLabel(page, 'disk-drop.png') && same((await study(page)).value, [800, 600]), 'from disk: a dropped photo is studied', (await study(page)).label);
    await pasteFile(page, await makeImage(page, { width: 500, height: 700, name: 'disk-paste.png' }));
    t.check(await waitLabel(page, 'disk-paste.png') && same((await study(page)).value, [500, 700]), 'from disk: a pasted photo is studied', (await study(page)).label);
    const dl = await download(page, () => click(page, '[data-save="value"]'));
    t.check(dl && dl.name === 'disk-paste-three-value.png' && same(pngDims(dl.buf), [500, 700]), 'from disk: Save PNG downloads the study', dl && { name: dl.name, dims: pngDims(dl.buf) });
    await clean(t, page, 'from disk: drop, paste, save');
    await page.context().close();
  }

  // ---- storage that throws: inside another site's sandboxed frame (no storage at all), and with site data blocked ----
  for (const how of ['sandboxed frame', 'site data blocked']) {
    const page = how === 'sandboxed frame' ? await openPage(site, { sandbox: {} }) : await openPage(site);
    if (how === 'site data blocked') {
      await page.addInitScript(() => { try { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); } catch (e) { /* left as it is */ } });
      await page.reload({ waitUntil: 'load' }); await sleep(300);
    }
    const appFrame = () => (how === 'sandboxed frame' ? page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith(site.base)) : page.mainFrame());
    const press = async (fr, sel) => { await fr.evaluate((s) => document.querySelector(s).click(), sel); await busyHidden(fr); await sleep(40); };
    let fr = appFrame();
    await busyHidden(fr);
    const throws = await fr.evaluate(() => { try { return localStorage.length < 0; } catch (e) { return true; } });
    t.check(throws, `${how}: localStorage throws here (the condition under test)`, throws);
    const r = await loadKind(fr, await makeImage(page, { width: 600, height: 800, name: 'nostore.png' }));
    t.check(r.loaded && r.label === 'nostore.png · 600 × 800 px', `${how}: a photo loads`, r.label);
    await press(fr, '[data-mode="advanced"]'); await press(fr, '#smoothSoft'); await setRange(fr, 'lean', 0); await press(fr, '[data-block-view="palette"]');
    await fr.evaluate(() => { for (const d of document.querySelectorAll('.rail details.drawer')) d.open = true; }); await sleep(200);
    let s = await ui(fr);
    t.check(!s.simple && s.smoothing === 'soft' && s.inForce === 'soft' && s.lean === '0' && s.leanOut === 'Off' && s.palettePressed === 'true' && same(s.drawers, ['values', 'colors', 'swatches', 'check']) && /^Splits at/.test(s.header), `${how}: Advanced, Soft, lean Off, the Palette view and every drawer open all apply`, s);
    await fr.evaluate(() => { for (const d of document.querySelectorAll('.rail details.drawer')) d.open = false; }); await sleep(100);
    await press(fr, '[data-mode="simple"]'); await press(fr, 'label[for="dpSoft"]');
    s = await ui(fr);
    t.check(s.simple && s.header === 'Soft detail' && same(s.drawers, []) && s.busy, `${how}: back in Simple, the Soft preset applies and the drawers close`, s);
    await clean(t, page, `${how}: settings without storage`);
    await page.reload({ waitUntil: 'load' }); await sleep(600);
    for (let i = 0; i < 20 && !appFrame(); i++) await sleep(250);
    fr = appFrame(); await busyHidden(fr); await sleep(200);
    s = await ui(fr);
    t.check(s.simple && s.smoothing === 'edge' && s.lean === '60' && s.palettePressed === 'false' && same(s.drawers, []) && s.label === SAMPLE_LABEL && !/could not be read/.test(s.toast), `${how}: after a reload the defaults, and no "could not be read" note`, s);
    await clean(t, page, `${how}: reloaded`);
    await page.context().close();
  }

  // ---- storage that is full: every choice still applies for the visit, nothing is said, and a reload has the defaults ----
  {
    const page = await openPage(site);
    const filled = await page.evaluate(() => { let n = 0; for (const size of [1 << 20, 1 << 16, 1 << 12, 1 << 8, 16, 1]) for (let i = 0; i < 4000; i++) { try { localStorage.setItem(`another-app.junk${size}_${i}`, 'x'.repeat(size)); n++; } catch (e) { break; } } return n; });
    await resetToast(page);
    await clickWait(page, '[data-mode="advanced"]'); await setRange(page, 'lean', 0); await clickWait(page, '#smoothSoft'); await click(page, '[data-block-view="palette"]');
    await page.evaluate(() => { document.getElementById('drawer-values').open = true; }); await sleep(200);
    const s = await ui(page);
    t.check(!s.simple && s.lean === '0' && s.smoothing === 'soft' && s.inForce === 'soft' && s.palettePressed === 'true' && same(s.drawers, ['values']) && s.toast === '', 'storage full: Advanced, lean Off, Soft, the Palette view and an open drawer apply for the visit, and nothing is said', { ...s, filled });
    await clean(t, page, 'storage full');
    await page.reload({ waitUntil: 'load' }); await sleep(600); await busyHidden(page);
    const back = await ui(page);
    t.check(back.simple && back.lean === '60' && back.smoothing === 'edge' && back.palettePressed === 'false' && same(back.drawers, []) && !/could not be read/.test(back.toast), 'storage full, reloaded: the defaults come back, nothing half-written', back);
    await clean(t, page, 'storage full, reloaded');
    // Simple keeps what Advanced chose for smoothing and the lean (README Simple and Advanced): what a classroom visitor gets
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('another-app.')) localStorage.removeItem(k); });
    await clickWait(page, '[data-mode="advanced"]'); await clickWait(page, '#smoothSoft'); await setRange(page, 'lean', 0); await clickWait(page, '[data-mode="simple"]');
    await page.reload({ waitUntil: 'load' }); await sleep(600); await busyHidden(page);
    const simple = await page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), header: document.getElementById('valuesState').textContent, smoothing: Studio.settings().smoothing, lean: Studio.settings().lighter, smoothingShown: getComputedStyle(document.getElementById('smoothSoft').closest('fieldset')).display !== 'none', leanShown: getComputedStyle(document.getElementById('lean').closest('.field')).display !== 'none' }));
    t.note(`Simple after Advanced chose Soft smoothing and lean Off, then a reload: the header says "${simple.header}" while smoothing "${simple.smoothing}" and lean ${simple.lean} stay in force (Smoothing shown: ${simple.smoothingShown}, lean shown: ${simple.leanShown}). The README says Simple hides those controls; it does not say whether their saved values still act, so this is noted, not found.`);
    await clean(t, page, 'simple after advanced, reloaded');
    await page.context().close();
  }

  // ---- the Show switch (All three, Photo, Values, Shapes), the drawers' headers, and on a phone the drawers and long names ----
  for (const viewport of [DESKTOP, PHONE]) {
    const where = viewport === PHONE ? 'phone' : 'desktop';
    const page = await openPage(site, { viewport });
    const shown = () => page.evaluate(() => ({ view: document.getElementById('panels').dataset.view, radio: document.querySelector('input[name="view"]:checked').id, panels: [...document.querySelectorAll('#panels > .panel[data-panel]')].filter((p) => getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0).map((p) => p.dataset.panel), tallest: Math.round(Math.max(...[...document.querySelectorAll('#panels > .panel .view')].map((c) => c.getBoundingClientRect().height))), ih: innerHeight }));
    for (const [id, v] of [['vValue', 'value'], ['vOrig', 'orig'], ['vBlock', 'block'], ['vAll', 'all']]) {
      await click(page, `label[for="${id}"]`); await sleep(100);
      const s = await shown();
      t.check(s.view === v && same(s.panels, v === 'all' ? ['orig', 'value', 'block'] : [v]) && (v === 'all' || s.tallest <= s.ih * 0.84 + 1) && (await hscroll(page)) <= 0, `${where}: Show ${{ value: 'Values', orig: 'Photo', block: 'Shapes', all: 'All three' }[v]}: ${v === 'all' ? 'the three studies' : 'that study alone, no taller than 84% of the window'}, no horizontal scroll`, s);
    }
    await click(page, 'label[for="vBlock"]');
    await loadKind(page, await makeImage(page, { width: 700, height: 900, name: `shapes-${where}.png` }));
    let s = await shown();
    t.check(s.view === 'block' && same(s.panels, ['block']), `${where}: a photo loaded while Shapes is shown: Shapes stays alone`, s);
    const dl = await download(page, () => click(page, '[data-save="block"]'));
    t.check(dl && dl.name === `shapes-${where}-color-blocks.png` && same(pngDims(dl.buf), [700, 900]), `${where}: Save PNG of the study shown alone`, dl && { name: dl.name, dims: pngDims(dl.buf) });
    // the Dark, middle, light header says what it is set to with the drawer closed, and follows a change
    await page.evaluate(() => { document.getElementById('drawer-values').open = false; }); await sleep(80);
    const closedSimple = { shown: await visible(page, '#valuesState'), text: await text(page, '#valuesState') };
    await clickWait(page, '[data-mode="advanced"]');
    const closedAdv = { shown: await visible(page, '#valuesState'), text: await text(page, '#valuesState') };
    t.check(closedSimple.shown && closedSimple.text === 'Normal detail' && closedAdv.shown && /^Splits at V \d\.\d and \d\.\d · Simplify 3$/.test(closedAdv.text), `${where}: with the drawer closed its header reads "Normal detail", then the splits in Advanced`, { closedSimple, closedAdv });
    if (viewport === PHONE) {
      // every drawer open in Advanced, a long header, long and odd file names
      await page.evaluate(() => { for (const d of document.querySelectorAll('.rail details.drawer')) d.open = true; }); await sleep(150);
      await setRange(page, 'simplify', 10); await splits(page, 97, 99);
      const lay = await page.evaluate(() => ({ drawers: document.querySelectorAll('.rail details.drawer').length, railTop: document.querySelector('.rail').getBoundingClientRect().top, stripTop: document.querySelector('.toolstrip').getBoundingClientRect().top, clipped: [...document.querySelectorAll('.drawer-state')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => [e.id, e.textContent, e.scrollWidth, e.clientWidth]), header: document.getElementById('valuesState').textContent }));
      t.check(lay.railTop < lay.stripTop && lay.clipped.length === 0 && (await hscroll(page)) <= 0, 'phone, Advanced with every drawer open: the drawers sit above the tool bar, no header is cut off, no horizontal scroll', { ...lay, hscroll: await hscroll(page) });
      await screenshot(page, 'study-photos-phone-all-drawers');
      t.note(`phone: the rail holds ${lay.drawers} drawers (the README's "The settings fold away into three drawers" lists three settings drawers; How close did I get? is the fourth, "the last drawer of the Study tab")`);
      await page.evaluate(() => { for (const d of document.querySelectorAll('.rail details.drawer')) d.open = false; });
      const long = 'a'.repeat(200) + '.jpg';
      const r = await loadKind(page, await makeImage(page, { width: 600, height: 800, type: 'image/jpeg', name: long }));
      const box = await page.evaluate(() => { const r = document.getElementById('source').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: innerWidth }; });
      t.check(r.loaded && r.label === `${long} · 600 × 800 px` && box.left >= 0 && box.right <= box.w && (await hscroll(page)) <= 0, 'phone: a 200-character file name is labelled in full, inside the screen, no horizontal scroll', { box, hscroll: await hscroll(page) });
      for (const [name, saved] of [['.png', 'portrait-three-value.png'], ['noext', 'noext-three-value.png']]) {
        const k = await loadKind(page, await makeImage(page, { width: 400, height: 500, name }));
        const d = await download(page, () => click(page, '[data-save="value"]'));
        t.check(k.loaded && k.label === `${name} · 400 × 500 px` && d && d.name === saved, `phone: a file named "${name}" is labelled so and saved as ${saved}`, { label: k.label, saved: d && d.name });
      }
    } else {
      // Simple shows the outline switch, the values list and Add block colors besides the preset; the outlines work there
      await clickWait(page, '[data-mode="simple"]');
      const sh = { outlines: await display(page, '#outlines'), zones: await display(page, '#zones'), addBlocks: await display(page, '#addBlocks') };
      await page.evaluate(() => { document.getElementById('drawer-values').open = true; }); await sleep(80);
      const shOpen = { outlines: await display(page, '#outlines'), zones: await display(page, '#zones'), addBlocks: await display(page, '#addBlocks') };
      await clickWait(page, '#outlines');
      const lines = await page.evaluate(() => { const r = Studio.result(); const c = document.getElementById('cv-value'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0, p = 0; i < r.zone.length; i++, p += 4) if (d[p] !== r.zoneGray[r.zone[i]]) n++; return { outlines: Studio.settings().outlines, darkened: n }; });
      t.check(lines.outlines && lines.darkened > 100, 'Simple: Draw an outline around every shape is live there too', { lines, closed: sh, open: shOpen });
      t.note(`Simple mode shows, besides the Detail preset and Colors per value (drawers open): the outline switch ${shOpen.outlines}, the three values list ${shOpen.zones}, Add block colors ${shOpen.addBlocks}; the README's Simple list names only the preset.`);
      await clickWait(page, '#outlines');
    }
    await page.reload({ waitUntil: 'load' }); await sleep(600); await busyHidden(page);
    s = await shown();
    t.check(s.view === 'all' && s.radio === 'vAll' && same(s.panels, ['orig', 'value', 'block']), `${where}: after a reload, All three again, and the switch says so`, s);
    await clean(t, page, `${where}: show switch, headers, names`);
    await page.context().close();
  }

  // ---- a photo dropped or pasted on another tab: Paint by numbers' setup, the Loomis head, the Studio and its reference;
  // and a Study setting change reaching the Studio's reference ----
  {
    const page = await openPage(site);
    await tab(page, 'game');
    const subjectNow = () => page.evaluate(() => document.querySelector('input[name="gameSubject"]:checked').value);
    await click(page, '#gameFromPainting'); await sleep(500);
    const before = await subjectNow();
    await dropFiles(page, 'body', [await makeImage(page, { width: 600, height: 800, name: 'game-drop.png' })]);
    const dropped = await waitLabel(page, 'game-drop.png');
    const afterDrop = await subjectNow();
    await click(page, '#gameFromPainting'); await sleep(500);
    await page.setInputFiles('#file', await makeImage(page, { width: 600, height: 800, name: 'game-load.png' }));
    await waitLabel(page, 'game-load.png');
    const afterLoad = await subjectNow();
    t.check(before === 'painting' && afterLoad === 'photo', 'Paint by numbers with a dealt painting: Load photo switches the setup to My photo', { before, afterLoad });
    t.check(dropped && afterDrop === 'photo', 'Paint by numbers with a dealt painting: a dropped photo switches the setup to My photo too, as Load photo does', { dropped, afterDrop });
    if (dropped && afterDrop !== 'photo' && afterLoad === 'photo') t.finding({ title: 'A photo dropped on Paint by numbers\' setup loads on the Study tab, but the setup keeps the dealt painting and nothing is said', severity: 'medium', steps: 'Games → Paint by numbers. Choose A painting. Drag a portrait photo from the desktop onto the page (or paste one). Then, for comparison, choose A painting again and use Load photo in the header.', expected: 'The dropped photo becomes what to paint from (My photo), as Load photo makes it; or the page says the photo went to the Study tab.', actual: `After the drop the setup still has "${afterDrop}" chosen and shows the painting; nothing is said, so the drop looks ignored (the photo is on the Study tab). Load photo switches the setup to "${afterLoad}".`, cause: 'js/game.js:1672 switches the subject to the photo only on the file input\'s change event; the window\'s drop and paste handlers (js/app.js:616-635 as of aac638b) call loadForTab, which loads the Study photo without telling the game (a paste takes the same path).' });
    await clean(t, page, 'drop on paint by numbers');
    await tab(page, 'loomis');
    await resetToast(page);
    await pasteFile(page, await makeImage(page, { width: 640, height: 800, name: 'loomis-paste.png' }));
    const onLoomis = { label: await waitLabel(page, 'loomis-paste.png'), toast: await toast(page) };
    await tab(page, 'study');
    t.check(onLoomis.label && same((await study(page)).value, [640, 800]), 'a photo pasted on the Loomis head tab is the Study photo when you come back', { ...onLoomis, value: (await study(page)).value });
    t.note(`a photo pasted on the Loomis head tab: the toast there said "${onLoomis.toast}" (nothing to clear, so nothing is said)`);
    await clean(t, page, 'paste on loomis');
    // the Studio: its reference follows a photo pasted there, and the Study tab's settings
    await tab(page, 'paint');
    await click(page, '#ps-refBtn'); await sleep(200);
    await pasteFile(page, await makeImage(page, { width: 500, height: 700, name: 'studio-paste.png' }));
    await waitLabel(page, 'studio-paste.png'); await sleep(200);
    const ref = () => page.evaluate(() => { const c = document.getElementById('ps-refCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const r = Studio.result(); const g0 = r.zoneGray[0]; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === g0) dark++; return { w: c.width, h: c.height, darkShare: +(dark / (d.length / 4)).toFixed(3), name: document.getElementById('ps-refName').textContent.trim() }; });
    const sameAs = (id) => page.evaluate((id) => { const a = document.getElementById('ps-refCanvas'), b = document.getElementById(id); if (a.width !== b.width || a.height !== b.height) return false; const x = a.getContext('2d').getImageData(0, 0, a.width, a.height).data, y = b.getContext('2d').getImageData(0, 0, b.width, b.height).data; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; }, id);
    let rf = await ref();
    t.check(rf.w === 500 && rf.h === 700 && /Study tab/.test(rf.name), 'the Studio: a photo pasted there becomes its reference', { w: rf.w, h: rf.h, name: rf.name });
    await click(page, '#ps-refSheet [data-ref-view="values"]'); await sleep(100);
    const darkBefore = (await ref()).darkShare;
    await tab(page, 'study');
    await clickWait(page, '[data-mode="advanced"]'); await splits(page, 90, 92);
    await tab(page, 'paint'); await sleep(100);
    rf = await ref();
    t.check(rf.darkShare > darkBefore && await sameAs('cv-value'), 'the Studio\'s Values reference follows a split moved on the Study tab: more shadow, the same pixels as the value study', { darkBefore, darkAfter: rf.darkShare });
    await tab(page, 'study'); await clickWait(page, '#outlines'); await tab(page, 'paint');
    await click(page, '#ps-refSheet [data-ref-view="blocks"]'); await sleep(100);
    t.check(await sameAs('cv-block'), 'the Studio\'s Blocks reference follows Outline shapes turned on, the same pixels as the color study', null);
    await clean(t, page, 'studio reference follows the study');
    await page.context().close();
  }

  // ---- the heaviest settings a visitor can pick, on the biggest photo that is not reduced ----
  {
    const page = await openPage(site);
    await clickWait(page, '[data-mode="advanced"]');
    await loadKind(page, await makeImage(page, { width: 6000, height: 4000, type: 'image/jpeg', name: 'huge.jpg' }));
    await setRange(page, 'merge', 10); await setRange(page, 'colors', 6); await setRange(page, 'simplify', 10); await clickWait(page, '#smoothEdge'); await clickWait(page, '#outlines');
    const t0 = Date.now();
    await page.evaluate(() => { const sel = document.getElementById('detail'); sel.value = '1400'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    const done = await busyHidden(page, 60000);
    const ms = Date.now() - t0;
    const s = await study(page);
    const lag = await page.evaluate(() => new Promise((r) => { const t1 = performance.now(); requestAnimationFrame(() => setTimeout(() => r(Math.round(performance.now() - t1)), 0)); }));
    t.check(done && same(s.value, [1400, 933]) && same(s.block, [1400, 933]) && s.busy, 'a 6000 × 4000 photo at Working size 1400, Simplify 10, Edge-aware, Merge 10, Colors 6, outlines on: studied within a minute', { ms, value: s.value });
    t.check(lag < 500, 'and the page answers within half a second after it', lag);
    t.note(`the heaviest settings on a 6000 × 4000 JPEG: the 1400 px study took ${ms} ms on this shared 4-core machine`);
    await page.evaluate(() => { window.__runs = 0; window.addEventListener('studio:result', () => { window.__runs++; }); const e = document.getElementById('simplify'); for (let i = 0; i < 30; i++) { e.value = String(i % 11); e.dispatchEvent(new Event('input', { bubbles: true })); } e.value = '8'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await busyHidden(page, 60000); await sleep(300);
    const spam = await page.evaluate(() => ({ runs: window.__runs, simplify: document.getElementById('simplify').value, blurRadius: Studio.settings().blurRadius }));
    t.check(spam.runs >= 1 && spam.runs <= 3 && spam.simplify === '8' && spam.blurRadius === Math.round((8 * 1400) / 450), 'slider spam at 1400: the last value is in force, recomputed at most three times', spam);
    await clean(t, page, 'heaviest settings');
    await page.context().close();
  }

  // ---- the keyboard for the rest of the Study tab: the Detail preset, Smoothing, Gray values, Working size, Auto split,
  // the block view and the drawer headers ----
  {
    const page = await openPage(site);
    await loadKind(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'keys.jpg' }));
    await page.evaluate(() => { document.getElementById('drawer-values').open = true; }); await sleep(100);
    await page.focus('#dpNormal'); await page.keyboard.press('ArrowRight'); await busyHidden(page); await sleep(60);
    let s = await study(page);
    t.check(s.preset === 'sharp' && s.header === 'Sharp detail' && s.simplify === 1 && s.merge === 2, 'keyboard: ArrowRight on the Detail preset chooses Sharp, and it applies', { preset: s.preset, header: s.header, simplify: s.simplify, merge: s.merge });
    await page.focus('[data-mode="advanced"]'); await page.keyboard.press('Enter'); await busyHidden(page);
    await page.focus('#smoothEdge'); await page.keyboard.press('ArrowLeft'); await busyHidden(page); await sleep(60);
    t.check((await page.evaluate(() => Studio.settings().smoothing)) === 'soft' && (await storageGet(page, K('smoothing'))) === 'soft', 'keyboard: ArrowLeft on Smoothing chooses Soft, in force and remembered', await page.evaluate(() => Studio.settings().smoothing));
    await page.focus('#grayCustom'); await page.keyboard.press('ArrowRight'); await busyHidden(page); await sleep(60);
    t.check((await page.evaluate(() => Studio.settings().grayMode)) === 'average' && (await display(page, '#customGrays')) === 'hidden', 'keyboard: ArrowRight on Gray values chooses Photo average', await page.evaluate(() => Studio.settings().grayMode));
    await page.keyboard.press('ArrowLeft'); await busyHidden(page);
    await page.focus('#detail'); await page.keyboard.press('ArrowDown'); await busyHidden(page); await sleep(100);
    s = await study(page);
    t.check(s.detail === '1400' && same(s.value, [900, 1200]), 'keyboard: ArrowDown on Working size picks 1400 px, and the studies follow (900 × 1200)', { detail: s.detail, value: s.value });
    await resetToast(page);
    await page.focus('#autoSplit'); await page.keyboard.press('Enter'); await busyHidden(page); await sleep(60);
    t.check((await toast(page)) === 'Splits set from this photo', 'keyboard: Enter on Auto split sets the splits', await toast(page));
    await page.focus('[data-block-view="palette"]'); await page.keyboard.press('Enter'); await sleep(100);
    t.check((await page.evaluate(() => document.querySelector('[data-block-view="palette"]').getAttribute('aria-pressed'))) === 'true', 'keyboard: Enter on the Palette block view switches to it');
    await click(page, '[data-block-view="photo"]');
    await page.focus('#drawer-swatches summary'); await page.keyboard.press('Space'); await sleep(150);
    t.check((await drawersOpen(page)).includes('swatches') && JSON.parse((await storageGet(page, K('drawers'))) || '[]').includes('swatches'), 'keyboard: Space on the Picked colors header opens it, remembered', await storageGet(page, K('drawers')));
    // Tab walks through every control in the open Dark, middle, light drawer
    await page.focus('#drawer-values summary');
    const reached = new Set();
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); const id = await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)); reached.add(id); if (id === 'outlines') break; }
    const want = ['simplify', 'merge', 'detail', 'autoSplit', 't1', 't2', 'g0', 'g1', 'g2', 'outlines'];
    t.check(want.every((id) => reached.has(id)) && ['smoothSoft', 'smoothEdge'].some((id) => reached.has(id)) && ['grayCustom', 'grayAvg'].some((id) => reached.has(id)), 'keyboard: Tab reaches every control of the open Dark, middle, light drawer', [...reached]);
    await clean(t, page, 'keyboard, the rest');
    await page.context().close();
  }

  // ---- dark mode: the histogram drawn in the theme's colors, the value ramp under it, the splits marked ----
  {
    const page = await openPage(site, { dark: true });
    await clickWait(page, '[data-mode="advanced"]');
    await page.evaluate(() => { document.getElementById('drawer-values').open = true; }); await sleep(200);
    const hist = () => page.evaluate(() => {
      const c = document.getElementById('hist'); const W = c.width, H = c.height; const d = c.getContext('2d').getImageData(0, 0, W, H).data;
      const css = (v) => { const e = document.createElement('i'); e.style.color = getComputedStyle(document.documentElement).getPropertyValue(v); document.body.append(e); const rgb = getComputedStyle(e).color.match(/\d+/g).slice(0, 3).map(Number); e.remove(); return rgb; };
      const accent = css('--accent'), muted = css('--muted');
      const is = (p, rgb) => Math.abs(d[p] - rgb[0]) < 10 && Math.abs(d[p + 1] - rgb[1]) < 10 && Math.abs(d[p + 2] - rgb[2]) < 10 && d[p + 3] > 200;
      const cols = []; for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) if (is((y * W + x) * 4, accent)) n++; if (n > H * 0.8) cols.push(x); }
      const marks = []; for (const x of cols) { if (!marks.length || x - marks[marks.length - 1][1] > 1) marks.push([x, x]); else marks[marks.length - 1][1] = x; }
      let bars = 0; for (let p = 0; p < d.length; p += 4) if (is(p, muted)) bars++;
      const y = H - 2, at = (x) => d[(y * W + x) * 4];
      return { W, marks: marks.map(([a, b]) => +(((a + b) / 2 + 0.5) / W * 100).toFixed(1)), bars, ramp: [at(1), at(W - 2)], t1: +document.getElementById('t1').value, t2: +document.getElementById('t2').value, accent };
    });
    let h = await hist();
    const marksAt = (hh) => hh.marks.length === 2 && Math.abs(hh.marks[0] - hh.t1) < 2 && Math.abs(hh.marks[1] - hh.t2) < 2;
    t.check(h.bars > 50 && h.ramp[0] < 40 && h.ramp[1] > 200 && marksAt(h), 'dark mode: the histogram has its bars, the dark-to-light ramp under them and a mark at each split', h);
    await splits(page, 20, h.t2); h = await hist();
    t.check(marksAt(h), 'dark mode: moving the shadow split moves its mark', h);
    const darkAccent = h.accent;
    await page.emulateMedia({ colorScheme: 'light' }); await sleep(200);
    h = await hist();
    t.check(marksAt(h) && !same(h.accent, darkAccent) && h.bars > 50, 'switching to the light theme redraws the histogram in its colors', { light: h.accent, dark: darkAccent, marks: h.marks });
    await clean(t, page, 'dark mode histogram');
    await page.context().close();
  }

  // ---- odd drops and pastes: the drop hint counted in and out, a text drag, an empty untyped file (what a dropped folder
  // gives), a clipboard of text and a picture, two pictures, a paste into a text field, a BMP, a TIFF and a HEIC ----
  {
    const page = await openPage(site);
    const enter = (types) => page.evaluate((types) => { const dt = new DataTransfer(); if (types === 'files') dt.items.add(new File(['x'], 'x.png', { type: 'image/png' })); else dt.setData('text/plain', 'words'); for (const el of [window, document.getElementById('tab-study')]) el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); }, types);
    const leave = () => page.evaluate(() => window.dispatchEvent(new DragEvent('dragleave', { bubbles: true })));
    await enter('files'); await leave();
    const afterOne = await visible(page, '#dropHint');
    await leave();
    t.check(afterOne && !(await visible(page, '#dropHint')), 'the drop hint: entering the page and a part of it, it stays after one leave and goes after the second', { afterOne });
    await enter('text');
    t.check(!(await visible(page, '#dropHint')), 'dragging text over the page shows no drop hint');
    await leave(); await leave();
    await enter('files'); await page.evaluate(() => window.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
    t.note(`a dragenter followed by a dragend with no dragleave leaves the drop hint ${(await visible(page, '#dropHint')) ? 'up (app.js has no dragend handler)' : 'hidden'}; a browser cancelling a drag (Esc) fires dragleave at the current target first (HTML drag and drop), so this is noted, not found`);
    await leave(); await leave();
    await resetToast(page);
    await dropFiles(page, 'body', [{ name: 'Pictures', mimeType: '', buffer: Buffer.alloc(0) }]);
    await page.waitForFunction(() => document.getElementById('toast').textContent !== '', null, { timeout: 5000 }).catch(() => null);
    const empty = await toast(page);
    t.check(empty !== '' && (await study(page)).label === SAMPLE_LABEL, 'an empty file with no type dropped (as a dropped folder arrives): refused, the study stays', empty);
    t.check(empty !== '' && !NOT_OPENED.test(empty), 'an empty file with no type dropped: the words name the problem (an empty file or a folder), not HEIC photos', empty);
    if (NOT_OPENED.test(empty)) t.finding({ title: 'A folder (or an empty file) dropped on the page is told about HEIC photos', severity: 'low', steps: 'Drag a folder from the desktop onto the Study tab (Chromium hands the page a File of size 0 and no type; the same for any empty file).', expected: 'A sentence that names the problem: that was a folder or an empty file, drop a JPG, PNG or WebP photo.', actual: `The toast says "${empty}": a phone-photo format the visitor did not drop.`, cause: 'js/app.js:469-511 as of aac638b (readImage): a file with no type is tried by its content, so a folder or a 0-byte file goes to the decoder and fails into the HEIC sentence (line 504); neither its size nor DataTransferItem.webkitGetAsEntry().isDirectory is looked at.' });
    // a clipboard with text and a picture, and one with two pictures
    const pasteMany = (items) => page.evaluate(async (items) => {
      const dt = new DataTransfer();
      for (const it of items) { if (it.text) dt.setData('text/plain', it.text); else { const c = document.createElement('canvas'); c.width = it.w; c.height = it.h; c.getContext('2d').fillRect(0, 0, it.w, it.h); const b = await new Promise((r) => c.toBlob(r, 'image/png')); dt.items.add(new File([b], it.name, { type: 'image/png' })); } }
      (document.activeElement || document.body).dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    }, items);
    await pasteMany([{ text: 'a caption' }, { name: 'clip-a.png', w: 300, h: 400 }]);
    t.check(await waitLabel(page, 'clip-a.png'), 'a paste of text and a picture: the picture loads', (await study(page)).label);
    await pasteMany([{ name: 'clip-b.png', w: 320, h: 400 }, { name: 'clip-c.png', w: 340, h: 400 }]);
    t.check(await waitLabel(page, 'clip-b.png'), 'a paste of two pictures: the first loads', (await study(page)).label);
    // a paste into Unit on my canvas (a number field) with a picture on the clipboard as well, as a copied spreadsheet cell carries one
    await click(page, '[data-tool="measure"]');
    await stroke(page, '#cv-orig', [[0.3, 0.3], [0.5, 0.5], [0.6, 0.7]]);
    const measures = await page.evaluate(() => +(document.querySelector('[data-tool="measure"]').dataset.count || 0));
    await page.focus('#canvasSize');
    const beforeField = (await study(page)).label;
    await pasteMany([{ text: '30' }, { name: 'cell.png', w: 200, h: 100 }]);
    await sleep(300); await busyHidden(page);
    const afterField = { label: (await study(page)).label, measures: await page.evaluate(() => +(document.querySelector('[data-tool="measure"]').dataset.count || 0)), toast: await toast(page) };
    t.check(measures >= 1 && afterField.label === beforeField && afterField.measures === measures, 'a paste into the Unit on my canvas field goes to the field: the photo and the measures stay', { measuresBefore: measures, labelBefore: beforeField, after: afterField });
    if (measures >= 1 && afterField.label !== beforeField) t.finding({ title: 'Pasting into "Unit on my canvas" while the clipboard also holds a picture replaces the photo and clears the measures', severity: 'medium', steps: '1. Load a photo, press Measure and draw a measure. 2. Copy something that puts text and a picture on the clipboard together (a cell copied from a spreadsheet does; any screenshot also does if you meant to paste a number but the clipboard still holds it). 3. Click into Unit on my canvas and press Ctrl+V.', expected: 'A paste into a text field goes to that field; the photo and the measures stay.', actual: `The photo is replaced by the clipboard picture (label "${afterField.label}") and the measures are cleared (${measures} → ${afterField.measures}; toast "${afterField.toast}").`, cause: 'js/app.js:632-635 (as of aac638b): the window-level paste handler takes the first image item whatever the paste\'s target is, so a paste aimed at an input or textarea loads a photo.' });
    await click(page, '#measureClear'); await click(page, '[data-tool="measure"]'); // the measure kept by a paste into the field goes, so the next photo has nothing to clear
    await clean(t, page, 'odd drops and pastes');
    // a BMP loads like any photo; a TIFF and a HEIC the browser cannot open are told so
    const bmp = (() => { const w = 20, h = 20, row = w * 3, size = 54 + row * h; const b = Buffer.alloc(size); b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34); for (let i = 54; i < size; i += 3) { b[i] = 200; b[i + 1] = 120; b[i + 2] = 60; } return { name: 'scan.bmp', mimeType: 'image/bmp', buffer: b }; })();
    const rb = await loadKind(page, bmp);
    t.check(rb.loaded && rb.label === 'scan.bmp · 20 × 20 px' && rb.toast === '', 'a 20 × 20 BMP loads, nothing said', { label: rb.label, toast: rb.toast });
    for (const [name, type] of [['photo.tif', 'image/tiff'], ['IMG_0001.heic', 'image/heic']]) {
      const k = await loadKind(page, { name, mimeType: type, buffer: Buffer.from('II*\0 not a picture the browser decodes', 'binary') }, { reject: NOT_OPENED });
      t.check(k.said && k.label === rb.label, `a ${type} file the browser cannot decode: refused with "could not be opened", the study stays`, k.toast);
    }
    t.note('a TIFF the browser cannot decode gets the same sentence as a HEIC ("HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first"): its advice to save as JPG or PNG fits, the HEIC part does not.');
    await clean(t, page, 'bmp, tiff, heic');
    // how long a message stays (the toast's own timer, so this waits on time): a refusal outlasts a confirmation
    await resetToast(page);
    await page.setInputFiles('#file', textFile());
    await waitToast(page, NOT_IMAGE);
    await sleep(2500);
    const refusalUp = await page.evaluate(() => document.getElementById('toast').classList.contains('show'));
    await click(page, '#addBlocks'); await sleep(2500);
    const confirmUp = await page.evaluate(() => document.getElementById('toast').classList.contains('show'));
    t.check(refusalUp && !confirmUp, 'a refusal ("not an image") is still up after 2.5 s; a confirmation (Add block colors) is gone by then', { refusalUp, confirmUp });
    await clean(t, page, 'toast lifetimes');
    await page.context().close();
  }

  // ---- while a big photo is still being read: Simplify and the mode changed, then Forget my work pressed ----
  {
    const page = await openPage(site);
    await clickWait(page, '[data-mode="advanced"]');
    // the photo is chosen and the settings changed in one task, so they surely land before the photo is decoded
    const choose = (then) => page.evaluate(async (then) => {
      const c = document.createElement('canvas'); c.width = 6000; c.height = 4000; const g = c.getContext('2d'); g.fillStyle = '#8a9aa6'; g.fillRect(0, 0, 6000, 4000); g.fillStyle = '#c98f6a'; g.beginPath(); g.ellipse(3000, 1700, 1200, 1500, 0, 0, 7); g.fill(); g.fillStyle = '#2e2420'; g.fillRect(1000, 3000, 4000, 1000);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const input = document.getElementById('file'); const dt = new DataTransfer(); dt.items.add(new File([blob], 'decoding.jpg', { type: 'image/jpeg' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      if (then === 'settings') { const e = document.getElementById('simplify'); e.value = '9'; e.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-mode="simple"]').click(); }
      else { document.querySelector('[data-tab="help"]').click(); const f = document.getElementById('forgetBtn'); f.click(); f.click(); }
      return !document.getElementById('source').textContent.includes('decoding.jpg');
    }, then);
    const early = await choose('settings');
    const arrived = await waitLabel(page, 'decoding.jpg', 60000);
    const s = await study(page);
    const own = await page.evaluate(() => { const st = Studio.settings(); const [a, b] = Study.autoThresholds(Studio.prep(), st.blurRadius, st.smoothing); const t1 = Math.max(1, Math.min(a, 97)); return [t1, Math.max(t1 + 2, Math.min(b, 99))]; });
    t.check(early && arrived && s.simple && s.header === 'Normal detail' && s.simplify === 3 && s.merge === 4 && same([s.t1, s.t2], own) && same(s.value, [900, 600]) && s.busy, 'Simplify 9 then Simple chosen while a 6000 × 4000 photo is still being read: it arrives at the preset shown (Normal, 3 / 4) with its own auto split', { early, arrived, header: s.header, simplify: s.simplify, merge: s.merge, splits: [s.t1, s.t2], own, value: s.value });
    await clean(t, page, 'settings changed while a photo is read');
    await Promise.all([page.waitForNavigation({ timeout: 20000 }).catch(() => null), choose('forget').catch(() => null)]); // the reload may cut the evaluate short
    await sleep(600); await busyHidden(page); await sleep(200);
    const after = { label: (await study(page)).label, keys: await storageKeys(page) };
    t.check(after.label === SAMPLE_LABEL && after.keys.length === 0, 'Forget my work pressed while a photo is being read: the page comes back with the sample and keeps nothing', after);
    await clean(t, page, 'forget while a photo is read');
    await page.context().close();
  }

  // ---- a browser out of canvas memory: the 2800 px reducing canvas cannot be made, the big photo is kept as it is ----
  {
    const page = await openPage(site);
    await page.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; let once = true; HTMLCanvasElement.prototype.getContext = function (...a) { if (once && this.width === 2800) { once = false; window.__refused = true; return null; } return get.apply(this, a); }; });
    await page.reload({ waitUntil: 'load' }); await sleep(300); await busyHidden(page);
    const r = await loadKind(page, await makeImage(page, { width: 5000, height: 5000, type: 'image/jpeg', name: 'nomemory.jpg' }));
    const refused = await page.evaluate(() => !!window.__refused);
    t.check(refused && r.loaded && r.label === 'nomemory.jpg · 5000 × 5000 px' && same(r.value, [900, 900]) && r.toast === '', 'no canvas for reducing a 5000 × 5000 photo: it is studied as it is (900 × 900), labelled 5000 × 5000, no reduction note', { refused, label: r.label, value: r.value, toast: r.toast });
    await clean(t, page, 'no canvas for the reduction');
    await page.context().close();
  }
  t.note('Left out of the coverage list, each for a reason: a GIF (it needs a hand-made LZW stream; a BMP stands in for "a picture the browser opens that is not JPG, PNG or WebP"); a drop that announces Files but carries none (a DataTransfer cannot be made so in a page); a toast replaced by a text drop right after a photo cleared the marks (a race of two messages, said in the toast\'s own words either way); a reload in the middle of Study.process at 1400 px (the first block reloads mid-load already) and Forget pressed in a second tab while this one reads a photo (multitab covers Forget across tabs).');

  // ==== round 2: the gaps the first pass left out, then the Study's controls, readouts and histogram at their ends ====

  // ---- a GIF, which the first pass could not drive: the browser opens it, so the Study takes it at its size ----
  {
    const page = await openPage(site);
    const r = await loadKind(page, gifFile('ramp.gif', 80, 60, (x, y) => Math.round((x / 79) * 255) ^ ((x - 40) ** 2 + (y - 30) ** 2 < 300 ? 255 : 0)));
    t.check(r.loaded && r.label === 'ramp.gif · 80 × 60 px' && same(r.prep, [80, 60]) && r.toast === '', 'a GIF is opened like a JPG or PNG: the Study takes it at 80 × 60 px with no note', { label: r.label, prep: r.prep, toast: r.toast });
    await clean(t, page, 'gif');
    await page.context().close();
  }

  // ---- a drop that announces Files and carries none (a file promise that did not resolve, a folder some file managers
  // send): said, the way an empty file is; the drop hint goes and the study stays ----
  {
    const page = await openPage(site);
    await resetToast(page);
    const fake = { types: ['Files'], files: [], items: [] };
    await page.evaluate((fake) => { for (const type of ['dragenter', 'drop']) { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: fake }); window.dispatchEvent(e); } }, fake);
    await sleep(400);
    const said = await toast(page);
    const hintHidden = await page.evaluate(() => document.getElementById('dropHint').hidden);
    const label = (await study(page)).label;
    const said1 = t.check(said !== '' && hintHidden && label === SAMPLE_LABEL, 'a drop that announces files but carries none is said so, the drop hint goes and the study stays', { toast: said, hintHidden, label });
    if (!said1) t.finding({
      title: 'A drop that announces files but carries none does nothing and says nothing',
      severity: 'low',
      steps: '1. Open the Study tab (the sample, or any photo). 2. Drag an item whose data is marked as files but carries no file (a folder dragged from some file managers, or a file promise that did not resolve) over the page and let go.',
      expected: 'The page says why no picture was taken, as it does for an empty file ("That is an empty file or a folder. Choose a JPG, PNG or WebP photo.", js/app.js:488) and for a text drop ("That was text, not a picture. ..."). The drop hint goes away.',
      actual: `No toast (${JSON.stringify(said)}); the drop hint goes and the study is unchanged. Measured with a dispatched dragenter and drop whose dataTransfer has types ["Files"] and no files: nothing is said at any point.`,
      cause: 'js/app.js:652 takes `files.find(...) || files[0]`, which is undefined for an empty list, and js/app.js:653 passes it to loadForTab, then loadFile and readImage (js/app.js:478, `if (!file) return;`), which return without a message. The drop handler only speaks when the drag has no Files type at all (js/app.js:643-649).',
    });
    await clean(t, page, 'a drop with no file');
    await page.context().close();
  }

  // ---- a reload while a 1400 px study of a 3000 × 2000 photo is being worked out: the page comes back as the sample, and takes a photo ----
  {
    const page = await openPage(site);
    await setSelect(page, 'detail', '1400');
    await page.setInputFiles('#file', await makeImage(page, { width: 3000, height: 2000, type: 'image/jpeg', name: 'reload-mid.jpg' }));
    await page.waitForFunction(() => !document.getElementById('busy').hidden, null, { timeout: 15000 }).catch(() => null);
    await sleep(150);
    await page.reload({ waitUntil: 'load' }); await sleep(300); await busyHidden(page);
    const after = await study(page);
    t.check(after.label === SAMPLE_LABEL && after.zones === 3 && after.busy, 'a reload while a 1400 px study is being worked out: the sample comes back with its three studies, and the page is idle', { label: after.label, zones: after.zones, idle: after.busy });
    const again = await loadKind(page, await makeImage(page, { width: 800, height: 600, name: 'after-reload.png' }));
    t.check(again.loaded && again.label === 'after-reload.png · 800 × 600 px' && again.toast === '', 'after that reload a photo loads at once', { label: again.label, toast: again.toast });
    await clean(t, page, 'reload while a 1400 px study is worked out');
    await page.context().close();
  }

  // ---- Forget pressed in a second tab while this one reads a 6000 × 4000 photo: nothing is kept afterwards, and this tab's studies are drawn ----
  {
    const a = await openPage(site);
    const b = await newTab(site, a);
    await tab(b, 'help');
    await a.setInputFiles('#file', await makeImage(a, { width: 6000, height: 4000, type: 'image/jpeg', name: 'forget-race.jpg' }));
    await sleep(60);
    await click(b, '#forgetBtn'); await sleep(300);
    await Promise.all([
      a.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null),
      b.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null),
      click(b, '#forgetBtn'),
    ]);
    await sleep(2500); await busyHidden(a);
    const keys = await storageKeys(a);
    const after = await study(a);
    t.check(keys.length === 0 && after.zones === 3 && after.busy, "Forget pressed in tab B while tab A reads a photo: nothing is kept afterwards, and tab A's studies are drawn", { keys, label: after.label, zones: after.zones });
    await clean(t, a, 'forget while tab A reads'); await clean(t, b, 'forget in tab B');
    await a.context().close();
  }

  // ---- Simple and Advanced on Colors and paints: Simple offers three palettes, each with its reason; the best of them is marked
  // Best match and is the palette in use until one is chosen. Advanced lists all ten, with one Best match. A choice survives a reload ----
  {
    const page = await openPage(site);
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; });
    await page.waitForFunction(() => document.querySelectorAll('#presetList li').length === 10, null, { timeout: 20000 }).catch(() => null);
    const WHY = { zorn: 'Four colors. The easiest way to mix skin.', primary: 'A yellow, a red and a blue. Mix every color yourself.', rembrandt: 'Earth colors, for the old-master look.' };
    const sim = await paletteList(page);
    t.check(sim.mode === 'simple' && sim.shown.map((x) => x.id).sort().join() === 'primary,rembrandt,zorn' && sim.shown.every((x) => x.why === WHY[x.id]), 'Simple offers three palettes, each with its reason: Zorn, Three primaries and Rembrandt\'s earths', sim.shown);
    t.check(sim.badges.length === 1 && sim.badges[0] === sim.shown[0].id && sim.used.startsWith(bareName(sim.shown[0].name)) && sim.pressed.length === 0, 'Simple: one Best match, on the best of the three, and until one is chosen that is the palette in use', { badges: sim.badges, used: sim.used, first: sim.shown[0].name });
    await clickWait(page, '[data-mode="advanced"]');
    const adv = await paletteList(page);
    const bestAdv = adv.shown.find((x) => x.id === adv.badges[0]);
    t.check(adv.mode === 'advanced' && adv.shown.length === 10 && adv.badges.length === 1 && !!bestAdv && adv.used.startsWith(bareName(bestAdv.name)), 'Advanced lists all ten palettes with one visible Best match, and the palette in use is that best one', { shown: adv.shown.length, badges: adv.badges, used: adv.used });
    await clickWait(page, '[data-mode="simple"]');
    await page.evaluate(() => document.querySelector('#presetList li[data-preset="primary"] .preset').click()); await sleep(300);
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; });
    await page.waitForFunction(() => document.querySelectorAll('#presetList li').length === 10, null, { timeout: 20000 }).catch(() => null);
    const back = await paletteList(page);
    const pName = (back.shown.find((x) => x.id === 'primary') || { name: '' }).name;
    t.check(back.mode === 'simple' && same(back.pressed, ['primary']) && back.used.startsWith(bareName(pName)) && pName !== '', 'a palette chosen in Simple is still the one in use after a reload, and the list shows it pressed', { pressed: back.pressed, used: back.used, name: pName });
    await clean(t, page, 'simple palettes');
    await page.context().close();
  }

  // ---- Colors and paints at their ends and back: Colors in each value at 1 and 6 (3 again gives the same colors as before), Lean
  // toward lighter tones at Off and at 100%, and Paints on the palette at 3 and at 10 with its readout and a Suggest at 3 ----
  {
    const page = await openPage(site);
    await clickWait(page, '[data-mode="advanced"]');
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; });
    const snap = () => page.evaluate(() => { const r = Studio.result(); return { n: r.blockColors.length, rgb: r.blockColors.map((c) => [c.r, c.g, c.b].join(',')).join(';'), state: document.getElementById('colorsState').textContent.trim(), out: document.getElementById('colorsOut').value, leanOut: document.getElementById('leanOut').value }; });
    const base = await snap();
    await setRange(page, 'colors', 1); const one = await snap();
    await setRange(page, 'colors', 6); const six = await snap();
    await setRange(page, 'colors', 3); const back = await snap();
    t.check(one.out === '1' && one.n >= 1 && one.n <= 9 && one.state === '1 per value' && six.out === '6' && six.n > 3 && six.n <= 24 && six.state === '6 per value' && back.rgb === base.rgb, 'Colors in each value at 1 and at 6: at most 3 × (k + 2) block colors (a shape may take up to two colors of its own per value), the header says so, and 3 again gives the colors it gave at first', { one: [one.n, one.state], six: [six.n, six.state], same: back.rgb === base.rgb });
    await setRange(page, 'lean', 0); const off = await snap();
    await setRange(page, 'lean', 100); const full = await snap();
    await setRange(page, 'lean', 60); const def = await snap();
    t.check(off.leanOut === 'Off' && full.leanOut === '100%' && def.leanOut === '60%' && off.rgb !== full.rgb && def.rgb === base.rgb, 'Lean toward lighter tones: Off reads Off, 100% reads 100%, the two give different colors, and 60% gives the first colors back', { off: off.leanOut, full: full.leanOut, differ: off.rgb !== full.rgb, back: def.rgb === base.rgb });
    await page.evaluate(() => document.getElementById('srcMine').click()); await sleep(300);
    const readout = async (v) => { await page.evaluate((v) => { const e = document.getElementById('paintMax'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v); return page.evaluate(() => document.getElementById('paintMaxOut').value); };
    const lo = await readout(3), hi = await readout(10), mid = await readout(6);
    t.check(lo === '3 + white' && hi === '10 + white' && mid === '6 + white', 'Paints on the palette reads 3 + white at its low end, 10 + white at its top and 6 + white at its default', { lo, hi, mid });
    await readout(3);
    await page.evaluate(() => document.getElementById('suggestBtn').click()); await sleep(200);
    await page.waitForFunction(() => { const b = document.getElementById('suggestBtn'); return !b.disabled && /Suggest again/.test(b.textContent); }, null, { timeout: 120000 }).catch(() => null);
    const sug = await page.evaluate(() => ({ chips: document.querySelectorAll('#resultPaints li').length, match: document.getElementById('resultMatch').textContent }));
    t.check(sug.chips >= 1 && sug.chips <= 4 && /Mixes \d+ of \d+/.test(sug.match), 'Suggest a palette at 3 gives at most three paints and white, with its match count', sug);
    await clean(t, page, 'colors and paints at their ends');
    await page.context().close();
  }

  // ---- the value scale and the split readouts at their ends: the splits read V 0.1 to V 9.9, a top split is held one step under the
  // other, each zone reads its gray, and the grays at their ends read V 0.0 and V 10.0 and paint black and white ----
  {
    const page = await openPage(site);
    await clickWait(page, '[data-mode="advanced"]');
    await page.evaluate(() => { document.getElementById('drawer-values').open = true; });
    const reads = () => page.evaluate(() => {
      const r = Studio.result(); const v = (id) => document.getElementById(id).value;
      return { t1: +v('t1'), t2: +v('t2'), t1o: document.getElementById('t1Out').value, t2o: document.getElementById('t2Out').value, header: document.getElementById('valuesState').textContent.trim(), zones: [...document.querySelectorAll('#zones li .meta')].map((e) => e.textContent), tones: [...document.querySelectorAll('#zones .tone')].map((e) => e.style.background), shares: r.zoneShare.reduce((a, b) => a + b, 0) };
    });
    await setRange(page, 't1', 1); await setRange(page, 't2', 3);
    const low = await reads();
    t.check(low.t1o === 'V 0.1' && low.t2o === 'V 0.3' && low.header === 'Splits at V 0.1 and 0.3 · Simplify 3' && Math.abs(low.shares - 1) < 0.01, 'the lowest splits read V 0.1 and V 0.3, the header says so, and the three zones still hold every pixel', low);
    await setRange(page, 't1', 98); const top = await reads();
    t.check(top.t1 === 97 && top.t2 === 99 && top.t1o === 'V 9.7' && top.t2o === 'V 9.9' && top.header === 'Splits at V 9.7 and 9.9 · Simplify 3', 'a top split of 98 is held one step under the other (V 9.7 and V 9.9), and the readouts say the same', top);
    await setRange(page, 't1', 35); await setRange(page, 't2', 65);
    const mid = await reads();
    t.check(mid.zones.length === 3 && mid.zones.every((z) => /^V \d+\.\d · \d+%$/.test(z)) && mid.zones[0].startsWith('V 2.0') && mid.zones[1].startsWith('V 5.0') && mid.zones[2].startsWith('V 8.5'), 'at the defaults each zone reads its gray: V 2.0, V 5.0 and V 8.5', mid.zones);
    await setRange(page, 'g0', 0); await setRange(page, 'g2', 100);
    const ends = await page.evaluate(() => ({ outs: [0, 1, 2].map((i) => document.getElementById('g' + i + 'Out').value), tones: [...document.querySelectorAll('#zones .tone')].map((e) => e.style.background), zones: [...document.querySelectorAll('#zones li .meta')].map((e) => e.textContent) }));
    t.check(ends.outs[0] === 'V 0.0' && ends.outs[2] === 'V 10.0' && ends.zones[0].startsWith('V 0.0') && ends.zones[2].startsWith('V 10.0') && /rgb\(0, 0, 0\)/.test(ends.tones[0]) && /rgb\(255, 255, 255\)/.test(ends.tones[2]), 'the grays at their ends read V 0.0 and V 10.0 in the zones and paint pure black and white', ends);
    await clean(t, page, 'value scale and split readouts');
    await page.context().close();
  }

  // ---- the histogram: a flat tone puts every pixel in the one bin it belongs to (50% gray in 53, white in 99, black in 0), the
  // split marks stand at the splits, and its bitmap is as wide as it is shown ----
  {
    const page = await openPage(site);
    await clickWait(page, '[data-mode="advanced"]');
    await page.evaluate(() => { document.getElementById('drawer-values').open = true; }); await sleep(200);
    for (const [name, bg, bin] of [['flat-middle.png', [128, 128, 128], 53], ['flat-white.png', [255, 255, 255], 99], ['flat-black.png', [0, 0, 0], 0]]) {
      await loadKind(page, await paintPng(page, { width: 300, height: 400, name, bg }));
      const h = await histogramCols(page);
      const lo = Math.floor((bin / 100) * h.W), hi = Math.floor(((bin + 1) / 100) * h.W);
      t.check(h.bar.length > 0 && h.bar.every((x) => x >= lo - 1 && x <= hi) && Math.abs(h.W - Math.round(h.cw * h.dpr)) <= 1, `a ${name.replace('.png', '')} photo's bars stand only in bin ${bin} (x ${lo}–${hi} of ${h.W})`, { bars: h.bar.length ? [h.bar[0], h.bar[h.bar.length - 1]] : [], W: h.W, cw: h.cw });
    }
    await splits(page, 27, 46); await sleep(60);
    const m = await histogramCols(page);
    t.check(m.mark.length >= 2 && m.mark.some((x) => Math.abs(x - 0.27 * m.W) <= 2) && m.mark.some((x) => Math.abs(x - 0.46 * m.W) <= 2), 'the split marks stand at V 2.7 and V 4.6 on the histogram', { marks: m.mark, W: m.W, t1: m.t1, t2: m.t2 });
    await clean(t, page, 'histogram bars and marks');
    await page.context().close();
  }
  t.note('Round 2 closed these from the first pass\'s list: the GIF (written in the case, the first note above is out of date for it); a drop that announces Files but carries none (now a finding); a reload in the middle of a 1400 px study; Forget in a second tab while this one reads a photo. Still left out: the toast race (a marks-cleared message and a text drop at once: the later message replaces the earlier one by design, so there is no defect to assert).');

  // ---- a screenshot on an iPhone: the image element can draw nothing, and the studies were then flat gray ----------------
  {
    // Safari did this for PNG screenshots: the page's own image element drew blank. It is made here by a drawImage that ignores
    // image elements (canvases and bitmaps still draw); the PNG must come out as a canvas copy with the picture in it, and the
    // value study must show the picture, not one gray
    for (const [name, blindImg] of [['an ordinary browser', false], ['a browser whose image element draws nothing', true]]) {
      const page = await openPage(site);
      if (blindImg) {
        await page.addInitScript(() => { const d = CanvasRenderingContext2D.prototype.drawImage; CanvasRenderingContext2D.prototype.drawImage = function (src, ...r) { if (src instanceof HTMLImageElement && this.canvas.width !== 16) return; return d.call(this, src, ...r); }; });
        await page.reload();
      }
      await page.waitForFunction(() => window.Studio && Studio.result && Studio.result(), null, { timeout: 30000 }).catch(() => null);
      const shot = await makeImage(page, { width: 1179, height: 2556, type: 'image/png', name: 'Screenshot 2026-10-24.png' });
      await page.setInputFiles('#file', shot);
      await waitLabel(page, 'Screenshot 2026-10-24.png');
      const r = await page.evaluate(() => {
        const src = Studio.source(), c = document.getElementById('cv-value'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(d[i]);
        return { kind: src.constructor.name, w: src.width, h: src.height, grays: seen.size, label: document.getElementById('source').textContent };
      });
      t.check(r.w === 1179 && r.h === 2556 && r.kind === 'HTMLCanvasElement', `a PNG screenshot in ${name} is kept as a canvas copy at its own size (not as the image element)`, r);
      t.check(r.grays >= 3, `a PNG screenshot in ${name}: the value study shows the picture (several grays), not one flat gray`, r);
      await clean(t, page, `a PNG screenshot in ${name}`);
      await page.context().close();
    }
  }
}
