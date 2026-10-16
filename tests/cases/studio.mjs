// The Studio tab, playtested like a sceptical tester hunting edge cases: every brush and the eraser at
// their extremes, strokes off the paper, a 200-stroke session and Undo through it, Clear twice and Undo
// after, Turn the paper with content, zoom to 4× and pan to the corners, Fit to screen, the reference
// in every form (the Study photo, values, blocks, a dealt portrait and Another, size, hide, drag, a photo
// and a refused file loaded from here), the paints (the well, amounts, Lock in, My mixes across a reload),
// the canvas (every ground, each wash strength, both textures, Save as PNG), Copy the Study lines with and
// without lines, the one-time saving note, autosave and restore, hostile IndexedDB records and
// localStorage values, Ctrl/⌘+Z, and the phone layout (strip at the bottom, sheets, the exit arrow, the
// header hidden while painting). README: "Studio" and the autosave paragraph of "Simple and Advanced".
// Section I adds the coverage critic's gaps: the autosave with IndexedDB off or broken, Undo / Clear / the wash then a
// reload, the saves on hiding and pagehide, what the PNG holds (and the sandboxed save dialog with Ctrl+Z behind it),
// changes made while the painting is restored, Ctrl+Z on each tab, Copy the Study lines with every kind of mark,
// Values and Blocks against the Study tab's own pictures, a photo dropped or pasted on the Studio, the window changing
// size (the reference, the paper at 4×), the palette in Simple and Advanced, narrow and short windows, Forget right
// after changes, the Figure study's copy, and the low ones (sheets, pointers, pen pressure, blend, layers, the well,
// keyboard, the PNG failure advice, blocked localStorage, junk keys, subjects.js missing, dark theme, two tabs).
// Section J (round 2) adds: a reload in the middle of a stroke and a stroke made just before a reload or a closed tab, Clear in
// the first seconds after the page loads, every size slider past its ends and the marks at the smallest and the largest size,
// Undo across 24 steps of every tool (only the last 20 come back, in reverse order, each on its own layer), Ctrl+Z in the middle of
// a stroke, saved PNGs (the same file from any view, no metadata, every ground with every texture), a wash of each paint, a mix in
// the well when the palette changes, Turn the paper twice, the palette through different photos, and the reference on very wide and
// very tall photos.
import fs from 'node:fs';
import { openPage, newTab, clean, tab, DESKTOP, PHONE, PROTO_NAMES, stroke, storageKeys, storageGet, click, text, visible, hscroll, screenshot, sleep, makeImage, loadPhoto, textFile, dropFiles, dropText, axe } from '../lib.mjs';

// ---- helpers of this case ------------------------------------------------------------------------
const setRange = (page, id, v) => page.evaluate(([id, v]) => { const s = document.getElementById(id); if (!s) throw new Error('no ' + id); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); return s.value; }, [id, v]);
// pixels with any ink on a layer (alpha over 8/255), sampled every fourth pixel: works for black pencil too
const alphaInk = (page, sel) => page.evaluate((s) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++; return n; }, sel);
// inked pixels inside a box given as fractions of the layer
const inkIn = (page, sel, fx, fy, fw, fh) => page.evaluate(([s, fx, fy, fw, fh]) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(Math.round(c.width * fx), Math.round(c.height * fy), Math.max(1, Math.round(c.width * fw)), Math.max(1, Math.round(c.height * fh))).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; }, [sel, fx, fy, fw, fh]);
const pixel = (page, sel, x, y) => page.evaluate(([s, x, y]) => [...document.querySelector(s).getContext('2d').getImageData(x, y, 1, 1).data], [sel, x, y]);
const status = (page) => text(page, '#ps-status');
const armToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.classList.remove('show'); });
const toastMatch = (page, re, timeout = 4000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source, { timeout }).then(() => text(page, '#toast')).catch(() => null);
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const paperSize = (page) => page.evaluate(() => ({ w: document.getElementById('ps-paper').width, h: document.getElementById('ps-paper').height }));
const undoOff = (page) => page.evaluate(() => document.getElementById('ps-undo').disabled);
// the Studio's own "ready" (its restore has finished), bounded
const studioReady = (page) => Promise.race([page.evaluate(() => (window.PaintStudio ? PaintStudio.ready() : null)), sleep(8000)]).catch(() => null);
const canvasSheet = (page) => page.evaluate(() => ({ ground: [...document.querySelectorAll('#ps-canvasSheet [data-ground]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.ground), weave: [...document.querySelectorAll('#ps-canvasSheet [data-weave]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.weave), washOpts: document.getElementById('ps-washOpts').hidden, washName: document.getElementById('ps-washName').textContent, washOut: document.getElementById('ps-washOut').textContent, washStr: document.getElementById('ps-washStr').value, washRow: document.querySelectorAll('#ps-washRow button').length, hint: document.getElementById('ps-groundHint').textContent, cls: [...document.getElementById('ps-paperWrap').classList] }));
// the Studio's saved record, read back as the Studio would see it
const readRecord = (page) => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('portrait-value-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('studio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  try {
    const v = await new Promise((res, rej) => { const tx = db.transaction('studio'); const g = tx.objectStore('studio').get('painting'); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); });
    if (!v || typeof v !== 'object') return { type: v === null ? 'null' : typeof v };
    return { type: 'object', w: v.w, h: v.h, savedAt: v.savedAt, paperBlob: v.paper instanceof Blob, sketchBlob: v.sketch instanceof Blob, canvas: v.canvas, sketchShown: v.sketchShown };
  } finally { db.close(); }
});
async function waitSaved(page, after, timeout = 8000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { const r = await readRecord(page).catch(() => null); if (r && r.type === 'object' && (r.savedAt || 0) > after) return r; await sleep(200); } return null; }
// a hostile record written as the Studio's own: a spec with markers for what JSON cannot carry
const putRecord = (page, spec) => page.evaluate(async (spec) => {
  async function build(s) {
    if (s && typeof s === 'object') {
      if (s.__blob === 'png') { const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const g = c.getContext('2d'); g.fillStyle = '#b03030'; g.fillRect(100, 100, 300, 300); return new Promise((r) => c.toBlob(r, 'image/png')); }
      if (s.__blob === 'junk') return new Blob(['not a png at all'], { type: 'image/png' });
      if (s.__nan) return NaN;
      if (s.__json) return JSON.parse(s.__json);
      if (Array.isArray(s)) { const out = []; for (const x of s) out.push(await build(x)); return out; }
      const out = {}; for (const k of Object.keys(s)) out[k] = await build(s[k]); return out;
    }
    return s;
  }
  const value = await build(spec);
  const db = await new Promise((res, rej) => { const r = indexedDB.open('portrait-value-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('studio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction('studio', 'readwrite'); tx.objectStore('studio').put(value, 'painting'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}, spec);
// Save as PNG: the download, its name and the PNG header, and the picture read back in the page
async function savePng(page) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), click(page, '#ps-save')]);
  if (!dl) return null;
  const buf = fs.readFileSync(await dl.path());
  const back = await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    URL.revokeObjectURL(url);
    if (!img) return null;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); let alpha = 0;
    for (let i = 0; i < d.length; i += 4 * 53) { seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); if (d[i + 3] === 255) alpha++; }
    return { w: img.width, h: img.height, distinct: seen.size, opaque: alpha === Math.ceil(d.length / 4 / 53), corner: [...g.getImageData(5, 5, 1, 1).data] };
  }, buf.toString('base64'));
  return { name: dl.suggestedFilename(), png: buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length, back };
}
const PATH = [[0.3, 0.35], [0.7, 0.45]];

// ---- helpers of the coverage gaps (section I) -------------------------------------------------------
// a block that throws is a failed check, and the blocks after it still run
const guard = async (t, label, fn) => { try { await fn(); } catch (e) { t.check(false, `${label}: the block ran to its end`, String((e && e.message) || e).slice(0, 300)); } };
const NOTICE = 'portrait-value-studio.studioNotice';
// every message the toast shows from now on, in order (one entry per change of its text)
const watchToasts = (page) => page.evaluate(() => { window.__toasts = []; const el = document.getElementById('toast'); new MutationObserver(() => { if (el.textContent) window.__toasts.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
const toasts = (page) => page.evaluate(() => window.__toasts || []);
// whether the Studio's restore has finished, without waiting for it
const restoreDone = (page) => page.evaluate(async () => { let done = false; PaintStudio.ready().then(() => { done = true; }); await 0; await 0; return done; });
const markCount = (page) => page.evaluate(() => Studio.marks().length);
// the sum of the alpha of a layer inside a box given as fractions (how much paint, not just where)
const alphaSum = (page, sel, fx, fy, fw, fh) => page.evaluate(([s, fx, fy, fw, fh]) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(Math.round(c.width * fx), Math.round(c.height * fy), Math.max(1, Math.round(c.width * fw)), Math.max(1, Math.round(c.height * fh))).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i]; return n; }, [sel, fx, fy, fw, fh]);
// the reference as the Studio shows it, and the tab in front
const refInfo = (fr) => fr.evaluate(() => { const c = document.getElementById('ps-refCanvas'); const on = (s, k) => [...document.querySelectorAll(s)].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset[k])[0]; const d = c.width && c.height ? c.getContext('2d').getImageData(0, 0, c.width, c.height).data : []; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 37) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return { w: c.width, h: c.height, distinct: seen.size, kind: on('#ps-refSheet [data-ref-kind]', 'refKind'), view: on('#ps-refSheet [data-ref-view]', 'refView'), name: document.getElementById('ps-refName').textContent.trim(), anotherHidden: document.getElementById('ps-refAnother').hidden, figHidden: document.getElementById('ps-refFig').hidden, tab: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id.replace('tab-', '')).join(), source: document.getElementById('source').textContent }; });
// the reference canvas against one of the Study tab's own pictures (Studio.result()[key]), byte for byte
const refSameAs = (page, key) => page.evaluate((key) => { const c = document.getElementById('ps-refCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const v = Studio.result() && Studio.result()[key]; if (!v || v.length !== d.length) return { len: [d.length, v ? v.length : null] }; let diff = 0; for (let i = 0; i < d.length; i++) if (d[i] !== v[i]) diff++; return { diff, bytes: d.length }; }, key);
// Save as PNG, read back: in each box (fractions of the picture) how many pixels differ from the picture's
// corner (the bare ground) by more than 40 on a channel, and the picture's pixels at some points
async function savePngRead(page, { boxes = [], points = [] } = {}) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), click(page, '#ps-save')]);
  if (!dl) return null;
  const buf = fs.readFileSync(await dl.path());
  return page.evaluate(async ([b64, boxes, points]) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    URL.revokeObjectURL(url);
    if (!img) return null;
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const ground = [...g.getImageData(2, 2, 1, 1).data];
    const marks = boxes.map(([fx, fy, fw, fh]) => { const d = g.getImageData(Math.round(w * fx), Math.round(h * fy), Math.round(w * fw), Math.round(h * fh)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - ground[0]) > 40 || Math.abs(d[i + 1] - ground[1]) > 40 || Math.abs(d[i + 2] - ground[2]) > 40) n++; return n; });
    const px = points.map(([fx, fy]) => [...g.getImageData(Math.round(w * fx), Math.round(h * fy), 1, 1).data]);
    return { w, h, ground, marks, px };
  }, [buf.toString('base64'), boxes, points]);
}
// a picture pasted from the clipboard (lib's pasteFile without its fixed wait: the caller waits on the photo itself)
const pasteNow = (page, file) => page.evaluate((f) => { const bin = atob(f.b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([bytes], f.name, { type: f.mimeType })); document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })); }, { name: file.name, mimeType: file.mimeType, b64: file.buffer.toString('base64') });
// a new photo has reached the Study tab (its name in the source line) and the Studio's reference has its shape
const photoArrived = (page, name, aspect) => page.waitForFunction(([n, a]) => { const c = document.getElementById('ps-refCanvas'); return document.getElementById('source').textContent.includes(n) && document.getElementById('busy').hidden && c.width > 0 && Math.abs(c.width / c.height - a) < 0.02; }, [name, aspect], { timeout: 20000 }).catch(() => null);
// a palette picked in the Study tab's Colors and paints drawer (its presets are ranked once the drawer is open)
async function studyPalette(page, id) {
  await page.evaluate(() => { const d = document.getElementById('drawer-colors'); if (!d.open) d.open = true; });
  await page.waitForFunction(() => document.querySelectorAll('#presetList .preset').length >= 3 && !document.getElementById('presetList').hasAttribute('aria-busy'), null, { timeout: 20000 }).catch(() => null);
  await click(page, `#presetList li[data-preset="${id}"] .preset`);
  await page.waitForFunction(() => { const rows = document.querySelectorAll('#mixList .mix-row'); return rows.length > 0 && [...rows].every((r) => r.querySelector('.mix-badge') && !r.querySelector('.mix-pending')); }, null, { timeout: 30000 }).catch(() => null);
}
// the Study tab's study has been made again since `token` was stored as window.__r0
const restudied = (page) => page.waitForFunction(() => window.Studio && Studio.result() && Studio.result() !== window.__r0 && document.getElementById('busy').hidden, null, { timeout: 20000 }).catch(() => null);
// pointer events made in the page, for what a mouse cannot do (a pen's pressure, two fingers, a cancelled touch);
// setPointerCapture is told to let a made-up pointer through (the browser knows no such pointer)
const letCapture = (page) => page.evaluate(() => { if (window.__capPatched) return; window.__capPatched = true; const sp = Element.prototype.setPointerCapture; Element.prototype.setPointerCapture = function (id) { try { sp.call(this, id); } catch (e) { /* a made-up pointer */ } }; });
const pointer = (page, events) => page.evaluate((events) => { const p = document.getElementById('ps-paper'); const r = p.getBoundingClientRect(); for (const [type, fx, fy, o] of events) p.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: type === 'pointerup' ? 0 : 0.5, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, ...(o || {}) })); }, events);
const line = (from, to, n, o) => [['pointerdown', from[0], from[1], o]].concat(Array.from({ length: n }, (_, i) => ['pointermove', from[0] + (to[0] - from[0]) * (i + 1) / n, from[1] + (to[1] - from[1]) * (i + 1) / n, o]), [['pointerup', to[0], to[1], o]]);
const overlap = (a, b) => !!a && !!b && a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
const inside = (a, s, m = 1) => !!a && !!s && a.x >= s.x - m && a.y >= s.y - m && a.r <= s.r + m && a.b <= s.b + m;

export default async function studio(t, site) {
  // ================= A. first visit, desktop: the one-time note, the layout, every brush, the eraser =================
  const page = await openPage(site);
  await tab(page, 'paint');
  const note = await toastMatch(page, /saved in this browser/, 5000);
  t.check(!!note, 'first visit: the one-time note says the painting is kept in this browser', note);
  t.check(/Forget my work on this device/.test(note || ''), 'the note names Forget my work on this device as the way to clear it', note);
  t.check((await storageKeys(page)).includes('portrait-value-studio.studioNotice'), 'the note is marked as shown', await storageKeys(page));
  {
    const s = await page.evaluate(() => { const strip = document.querySelector('#ps-root .ps-strip').getBoundingClientRect(); const ps = document.getElementById('ps-root').getBoundingClientRect(); const btns = [...document.querySelectorAll('#ps-root .ps-strip button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.getBoundingClientRect()); return { stripX: strip.x, stripW: strip.width, stripH: strip.height, psY: ps.y, psH: ps.height, exit: getComputedStyle(document.getElementById('ps-exit')).display, topbar: getComputedStyle(document.querySelector('.topbar')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display, ih: innerHeight, iw: innerWidth, sw: screen.width, sh: screen.height, btnsIn: btns.every((r) => r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight), btns: btns.length }; });
    t.note(`desktop window ${s.iw}×${s.ih}, screen ${s.sw}×${s.sh}`);
    t.check(s.stripH > s.stripW && s.stripX < 120, 'desktop: the strip runs down the left', s);
    t.check(s.exit === 'none' && s.topbar !== 'none' && s.tabs !== 'none', 'desktop: no exit arrow; the header and tabs stay in view', s);
    t.check(s.psY + s.psH <= s.ih + 1 && s.psH >= 240 && s.btnsIn && s.btns === 9, 'desktop: the studio fits below the tabs and every strip icon (nine: the exit arrow is for phones) is on screen', s);
  }
  t.check((await status(page)) === 'Chisel · M · 900 × 1200', 'the status pill names the chisel, its size and the paper size', await status(page));
  t.check((await alphaInk(page, '#ps-paper')) === 0 && (await alphaInk(page, '#ps-sketch')) === 0, 'a fresh paper and underdrawing are blank');
  t.check(await undoOff(page), 'Undo starts disabled');

  // the chisel in its three sizes, through the brush sheet
  await click(page, '#ps-brushBtn');
  t.check(await visible(page, '#ps-brushSheet'), 'tapping Brushes with a brush in hand opens the brush sheet');
  t.check((await page.evaluate(() => document.getElementById('ps-brushBtn').getAttribute('aria-expanded'))) === 'true', 'Brushes says it is expanded');
  const chiselInk = {};
  for (const size of ['s', 'm', 'l']) {
    await click(page, `#ps-root [data-chisel="${size}"]`);
    t.check((await status(page)).startsWith(`Chisel · ${size.toUpperCase()}`) && (await text(page, '#ps-brushSub')) === size.toUpperCase(), `chisel ${size}: the status and the icon's badge say so`, [await status(page), await text(page, '#ps-brushSub')]);
    const before = await alphaInk(page, '#ps-paper');
    await stroke(page, '#ps-paper', PATH);
    if (size === 's') t.check(!(await visible(page, '#ps-brushSheet')), 'painting closes the sheet');
    chiselInk[size] = (await alphaInk(page, '#ps-paper')) - before;
    t.check(chiselInk[size] > 50 && !(await undoOff(page)), `chisel ${size}: a stroke lands and Undo wakes`, chiselInk[size]);
    await click(page, '#ps-undo');
    t.check((await alphaInk(page, '#ps-paper')) === before && (await undoOff(page)), `chisel ${size}: Undo takes the stroke back and sleeps again`);
    await click(page, '#ps-brushBtn');
  }
  t.check(chiselInk.s < chiselInk.m && chiselInk.m < chiselInk.l, 'chisel: small marks less than medium, medium less than large', chiselInk);

  // the round brush and its scale at both ends and past them
  await click(page, '#ps-root [data-brush="round"]');
  t.check((await visible(page, '#ps-roundOpts')) && !(await visible(page, '#ps-chiselOpts')), 'round: its options show and the chisel\'s hide');
  for (const [v, want] of [[3, '3 px'], [64, '64 px'], [999, '64 px'], [0, '3 px']]) { await setRange(page, 'ps-roundSize', v); t.check((await text(page, '#ps-roundOut')) === want, `round scale ${v}: the readout says ${want}`, await text(page, '#ps-roundOut')); }
  let b0 = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', PATH); const r3 = (await alphaInk(page, '#ps-paper')) - b0; await click(page, '#ps-undo');
  await click(page, '#ps-brushBtn'); await setRange(page, 'ps-roundSize', 64);
  t.check((await status(page)) === 'Round · 64 px · 900 × 1200' && (await text(page, '#ps-brushSub')) === '64', 'round 64: the status and badge', [await status(page), await text(page, '#ps-brushSub')]);
  b0 = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', PATH); const r64 = (await alphaInk(page, '#ps-paper')) - b0; await click(page, '#ps-undo');
  t.check(r3 > 0 && r64 > r3 * 4, 'round: 3 px marks far less than 64 px', { r3, r64 });

  // the pencil: both leads, every hardness, both colors, the size at its ends
  await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="pencil"]');
  t.check((await status(page)) === 'Pencil · black · HB · 3 px · 900 × 1200', 'pencil: the default status', await status(page));
  const hardLabels = () => page.evaluate(() => [...document.querySelectorAll('#ps-pencilOpts [data-hard]')].map((b) => b.textContent.trim()));
  t.check(JSON.stringify(await hardLabels()) === JSON.stringify(['Light · 2H', 'Medium · HB', 'Dark · 4B']), 'pencil graphite: the leads read 2H, HB, 4B', await hardLabels());
  const hintGraphite = await text(page, '#ps-pencilHint');
  await click(page, '#ps-pencilOpts [data-lead="charcoal"]');
  t.check(JSON.stringify(await hardLabels()) === JSON.stringify(['Hard', 'Medium', 'Soft']), 'pencil charcoal: the sticks read Hard, Medium, Soft', await hardLabels());
  t.check((await text(page, '#ps-pencilHint')) !== hintGraphite && /stick/.test(await text(page, '#ps-pencilHint')) && (await status(page)).startsWith('Pencil · black · Charcoal · Medium'), 'pencil charcoal: the hint and status change', [await text(page, '#ps-pencilHint'), await status(page)]);
  const laid = {};
  for (const lead of ['graphite', 'charcoal']) {
    await click(page, `#ps-pencilOpts [data-lead="${lead}"]`);
    for (const hard of ['hard', 'medium', 'soft']) {
      await click(page, `#ps-pencilOpts [data-hard="${hard}"]`);
      const b = await alphaInk(page, '#ps-paper');
      await stroke(page, '#ps-paper', PATH);
      laid[`${lead}-${hard}`] = (await alphaInk(page, '#ps-paper')) - b;
      t.check(laid[`${lead}-${hard}`] > 10, `pencil ${lead} ${hard}: a stroke lands`, laid[`${lead}-${hard}`]);
      await click(page, '#ps-undo'); await click(page, '#ps-brushBtn');
    }
  }
  t.check(laid['graphite-hard'] < laid['graphite-soft'] && laid['charcoal-hard'] < laid['charcoal-soft'], 'pencil: a softer lead lays more', laid);
  for (const [v, want] of [[1, '1 px'], [30, '30 px'], [0, '1 px'], [99, '30 px']]) { await setRange(page, 'ps-pencilSize', v); t.check((await text(page, '#ps-pencilOut')) === want, `pencil size ${v}: the readout says ${want}`, await text(page, '#ps-pencilOut')); }
  t.check(/· 30 px ·/.test(await status(page)), 'pencil 30 px: the status follows the slider', await status(page));
  await setRange(page, 'ps-pencilSize', 3); await click(page, '#ps-pencilOpts [data-lead="graphite"]'); await click(page, '#ps-pencilOpts [data-hard="medium"]');
  await click(page, '#ps-root [data-pcolor="white"]');
  {
    const b = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', PATH);
    const d = (await alphaInk(page, '#ps-paper')) - b;
    const px = await page.evaluate(() => { const c = document.getElementById('ps-paper'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let white = 0, other = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) white++; else other++; } return { white, other }; });
    t.check(d > 10 && px.white > 0 && px.other === 0 && /Pencil · white/.test(await status(page)), 'white pencil: marks are white and nothing else, and the status says white', { d, ...px, status: await status(page) });
    await click(page, '#ps-undo'); await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-pcolor="black"]');
  }

  // the underdrawing brush: its own layer, shown, hidden, cleared, undone; the eraser follows it
  await click(page, '#ps-root [data-brush="sketch"]');
  t.check((await status(page)) === 'Underdrawing · black · HB · 3 px · 900 × 1200', 'underdrawing: the status', await status(page));
  {
    const p0 = await alphaInk(page, '#ps-paper');
    await stroke(page, '#ps-paper', PATH);
    const s1 = await alphaInk(page, '#ps-sketch');
    t.check(s1 > 10 && (await alphaInk(page, '#ps-paper')) === p0, 'underdrawing: the stroke goes to its own layer, not the paint', { s1, paper: await alphaInk(page, '#ps-paper') });
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-sketch-show="0"]');
    t.check(await page.evaluate(() => document.getElementById('ps-paperWrap').classList.contains('ps-no-sketch') && getComputedStyle(document.getElementById('ps-sketch')).visibility === 'hidden'), 'underdrawing Hidden: the layer is hidden');
    await click(page, '#ps-root [data-sketch-show="1"]');
    t.check(await page.evaluate(() => getComputedStyle(document.getElementById('ps-sketch')).visibility === 'visible'), 'underdrawing Shown: the layer is back');
    await click(page, '#ps-sketchClear');
    t.check((await alphaInk(page, '#ps-sketch')) === 0, 'Clear the underdrawing blanks it');
    await click(page, '#ps-undo');
    t.check((await alphaInk(page, '#ps-sketch')) === s1, 'Undo brings the cleared underdrawing back', await alphaInk(page, '#ps-sketch'));
    await click(page, '#ps-root [data-ps-tool="eraser"]');
    t.check((await status(page)) === 'Eraser · 24 px · underdrawing · 900 × 1200' && !(await visible(page, '#ps-eraserSheet')), 'eraser after an underdrawing stroke: the status says underdrawing, no sheet yet', await status(page));
    await click(page, '#ps-root [data-ps-tool="eraser"]');
    t.check(await visible(page, '#ps-eraserSheet'), 'tapping the eraser again opens its size');
    for (const [v, want] of [[100, '100 px'], [4, '4 px'], [0, '4 px'], [500, '100 px']]) { await setRange(page, 'ps-eraserSize', v); t.check((await text(page, '#ps-eraserOut')) === want && (await text(page, '#ps-eraserSub')) === want.replace(' px', ''), `eraser size ${v}: the readout and badge say ${want}`, [await text(page, '#ps-eraserOut'), await text(page, '#ps-eraserSub')]); }
    await stroke(page, '#ps-paper', PATH);
    t.check((await alphaInk(page, '#ps-sketch')) < s1 * 0.5 && (await alphaInk(page, '#ps-paper')) === p0, 'the eraser rubs out the underdrawing and leaves the paint alone', { sketch: await alphaInk(page, '#ps-sketch'), paper: await alphaInk(page, '#ps-paper') });
    await click(page, '#ps-undo');
    t.check((await alphaInk(page, '#ps-sketch')) === s1, 'Undo brings the erased underdrawing back');
    await click(page, '#ps-brushBtn');
    t.check((await status(page)).startsWith('Underdrawing') && !(await visible(page, '#ps-brushSheet')), 'Brushes after the eraser brings the last brush back as it was, without the sheet', await status(page));
    await click(page, '#ps-sketchClear');
  }

  // the blend fan brush drags paint and adds none; then the eraser on paint
  await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="chisel"]'); await click(page, '#ps-root [data-chisel="l"]');
  await stroke(page, '#ps-paper', [[0.3, 0.5], [0.7, 0.5]]);
  const below0 = await inkIn(page, '#ps-paper', 0.2, 0.58, 0.6, 0.1);
  await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="blend"]');
  for (const [id, v, out, want] of [['ps-blendSize', 20, 'ps-blendOut', '20 px'], ['ps-blendSize', 140, 'ps-blendOut', '140 px'], ['ps-blendStr', 10, 'ps-blendStrOut', '10%'], ['ps-blendStr', 80, 'ps-blendStrOut', '80%']]) { await setRange(page, id, v); t.check((await text(page, '#' + out)) === want, `blend ${id} ${v}: the readout says ${want}`, await text(page, '#' + out)); }
  t.check((await status(page)) === 'Blend · 140 px · 80% · 900 × 1200', 'blend: the status', await status(page));
  const paintBefore = await alphaInk(page, '#ps-paper');
  await stroke(page, '#ps-paper', [[0.5, 0.3], [0.5, 0.7]], { steps: 20 });
  const below1 = await inkIn(page, '#ps-paper', 0.2, 0.58, 0.6, 0.1);
  t.check(below0 === 0 && below1 > 20, 'blend: dragging down across a stroke pulls paint below it', { below0, below1 });
  await stroke(page, '#ps-paper', [[0.1, 0.9], [0.3, 0.95]], { steps: 10 });
  t.check((await inkIn(page, '#ps-paper', 0, 0.85, 0.4, 0.15)) === 0 && (await alphaInk(page, '#ps-paper')) >= paintBefore, 'blend on bare paper adds no paint');
  await click(page, '#ps-root [data-ps-tool="eraser"]');
  t.check((await status(page)) === 'Eraser · 100 px · paint · 900 × 1200', 'eraser after painting: the status says paint', await status(page));
  { const b = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', [[0.3, 0.5], [0.7, 0.5]]); const a = await alphaInk(page, '#ps-paper'); t.check(a < b * 0.7, 'the eraser rubs out paint', { b, a }); }

  // strokes off the paper's edge: out and back in keeps marking; one that starts beside the paper marks nothing
  await click(page, '#ps-brushBtn'); await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="chisel"]');
  {
    const b = await alphaInk(page, '#ps-paper');
    await stroke(page, '#ps-paper', [[0.8, 0.8], [1.1, 1.08], [0.9, 0.9]], { steps: 12 });
    const a = await alphaInk(page, '#ps-paper');
    t.check(a > b, 'a stroke that leaves the paper and comes back keeps marking', { b, a });
    const bb = await page.locator('#ps-paper').boundingBox();
    await page.mouse.move(bb.x + bb.width + 40, bb.y + bb.height * 0.5); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height * 0.5, { steps: 10 }); await page.mouse.up();
    t.check((await alphaInk(page, '#ps-paper')) === a, 'a stroke that starts beside the paper marks nothing', await alphaInk(page, '#ps-paper'));
  }
  await clean(t, page, 'brushes and eraser');

  // ================= B. a 200-stroke session, Undo through it, Clear twice and Undo after, Ctrl/⌘+Z, Turn, zoom, pan, Fit =================
  await click(page, '#ps-clear'); await click(page, '#ps-clear');
  t.check((await alphaInk(page, '#ps-paper')) === 0, 'Clear, twice, blanks the paper for the session');
  await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-chisel="s"]');
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) { const a = 0.04 + (i % 20) * 0.046, b = 0.05 + Math.floor(i / 20) * 0.09; await stroke(page, '#ps-paper', [[a, b], [a + 0.05, b + 0.03]], { steps: 2 }); }
  t.note(`200 strokes took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const ink200 = await alphaInk(page, '#ps-paper');
  t.check(ink200 > 1000, '200 strokes land', ink200);
  let undos = 0;
  while (undos < 250 && !(await undoOff(page))) { await click(page, '#ps-undo'); undos++; }
  const inkAfterUndo = await alphaInk(page, '#ps-paper');
  t.check(undos === 20 && inkAfterUndo < ink200 && inkAfterUndo > 0, 'Undo goes back 20 strokes and then disables; the earlier 180 stay', { undos, ink200, inkAfterUndo });
  t.note('Undo keeps the last 20 steps (painting.js, snapshot()): after a 200-stroke session the button simply goes grey after 20; the page says nothing about the limit, and the README promises no depth');

  const inkKept = inkAfterUndo;
  await armToast(page);
  await click(page, '#ps-clear');
  const armMsg = await toastMatch(page, /Tap again to clear/, 2000);
  t.check(!!armMsg && /Undo brings it back/.test(armMsg) && (await alphaInk(page, '#ps-paper')) === inkKept, 'the first Clear tap only asks for a second, naming Undo', armMsg);
  await click(page, '#ps-clear');
  t.check((await alphaInk(page, '#ps-paper')) === 0, 'the second tap clears');
  await click(page, '#ps-clear'); await click(page, '#ps-clear');
  t.check((await alphaInk(page, '#ps-paper')) === 0, 'clearing a cleared paper is harmless');
  await click(page, '#ps-undo');
  t.check((await alphaInk(page, '#ps-paper')) === 0, 'Undo after the second clear restores the blank it cleared');
  await click(page, '#ps-undo');
  t.check((await alphaInk(page, '#ps-paper')) === inkKept, 'Undo again brings the painting back', { got: await alphaInk(page, '#ps-paper'), inkKept });
  // a Clear tap that is not followed up within 3 s is forgotten
  await click(page, '#ps-clear'); await sleep(3200); await armToast(page); await click(page, '#ps-clear');
  t.check((await alphaInk(page, '#ps-paper')) === inkKept && /Tap again/.test((await toastMatch(page, /Tap again/, 1500)) || ''), 'a Clear tap more than 3 s old does not count: the next tap asks again', await alphaInk(page, '#ps-paper'));

  await stroke(page, '#ps-paper', PATH);
  const withStroke = await alphaInk(page, '#ps-paper');
  await page.keyboard.press('Control+z');
  t.check(withStroke > inkKept && (await alphaInk(page, '#ps-paper')) === inkKept, 'Ctrl+Z undoes the last stroke', { withStroke, now: await alphaInk(page, '#ps-paper') });
  await stroke(page, '#ps-paper', PATH);
  await page.keyboard.press('Meta+z');
  t.check((await alphaInk(page, '#ps-paper')) === inkKept, '⌘+Z undoes the last stroke too');
  await stroke(page, '#ps-paper', PATH);
  await page.keyboard.press('Control+Shift+z');
  t.check((await alphaInk(page, '#ps-paper')) === withStroke, 'Ctrl+Shift+Z is not Undo', await alphaInk(page, '#ps-paper'));
  await click(page, '#ps-viewBtn'); await page.focus('#ps-zoom'); await page.keyboard.press('Control+z');
  t.check((await alphaInk(page, '#ps-paper')) === inkKept, 'Ctrl+Z with a sheet\'s slider focused still undoes');
  await page.keyboard.press('Escape');
  t.check(!(await visible(page, '#ps-viewSheet')), 'Escape closes the sheet');
  await page.keyboard.press('Control+z');
  t.check((await alphaInk(page, '#ps-paper')) === inkKept && (await undoOff(page)), 'Ctrl+Z with nothing to undo does nothing');

  // Turn the paper with content, and back
  const inkPortrait = await alphaInk(page, '#ps-paper');
  await click(page, '#ps-orient');
  const landSize = await paperSize(page), inkLand = await alphaInk(page, '#ps-paper');
  t.check(landSize.w === 1200 && landSize.h === 900 && (await status(page)).endsWith('1200 × 900'), 'Turn the paper: landscape, and the status says 1200 × 900', { landSize, status: await status(page) });
  t.check(inkLand > inkPortrait * 0.7 && inkLand < inkPortrait * 1.3, 'Turn the paper keeps what is on it', { inkPortrait, inkLand });
  t.check(await undoOff(page), 'Turn the paper leaves nothing to undo');
  { const wb = await box(page, '#ps-paperWrap'); t.check(wb.w > wb.h, 'the turned paper is drawn wider than tall', wb); }
  await click(page, '#ps-orient');
  { const back = await alphaInk(page, '#ps-paper'); t.check((await paperSize(page)).w === 900 && Math.abs(back - inkPortrait) <= inkPortrait * 0.02, 'turning back restores the portrait paper with its painting', { size: await paperSize(page), back, inkPortrait }); }

  // zoom to 4×, pan to every corner, a stroke lands where the pointer is, slider spam, Fit
  await click(page, '#ps-viewBtn');
  t.check(await page.evaluate(() => document.getElementById('ps-panX').disabled && document.getElementById('ps-panY').disabled), 'pan is off at 100%');
  await setRange(page, 'ps-zoom', 400);
  { const zs = await page.evaluate(() => ({ out: document.getElementById('ps-zoomOut').textContent, sub: document.getElementById('ps-zoomSub').textContent, pan: !document.getElementById('ps-panX').disabled && !document.getElementById('ps-panY').disabled })); t.check(zs.out === '400%' && zs.sub === '4×' && zs.pan, 'zoom 4×: the readouts, the badge, pan enabled', zs); }
  const stageBox = await box(page, '#ps-stage');
  for (const [px, py, name] of [[-100, -100, 'top-left'], [100, -100, 'top-right'], [-100, 100, 'bottom-left'], [100, 100, 'bottom-right']]) {
    await setRange(page, 'ps-panX', px); await setRange(page, 'ps-panY', py);
    const wb = await box(page, '#ps-paperWrap');
    const outs = await page.evaluate(() => [document.getElementById('ps-panXOut').textContent, document.getElementById('ps-panYOut').textContent]);
    const okX = px < 0 ? wb.x >= stageBox.x - 1 && wb.x <= stageBox.x + 100 : wb.r <= stageBox.r + 1 && wb.r >= stageBox.r - 100;
    const okY = py < 0 ? wb.y >= stageBox.y - 1 && wb.y <= stageBox.y + 100 : wb.b <= stageBox.b + 1 && wb.b >= stageBox.b - 100;
    t.check(okX && okY, `zoom 4×, pan ${name}: that corner of the paper is on screen`, { wb, stageBox });
    t.check(outs[0] === `100% ${px < 0 ? 'left' : 'right'}` && outs[1] === `100% ${py < 0 ? 'up' : 'down'}`, `pan ${name}: the readouts`, outs);
  }
  await setRange(page, 'ps-panX', -100); await setRange(page, 'ps-panY', -100);
  { await stroke(page, '#ps-paper', [[0.03, 0.03], [0.08, 0.06]]); const tl = await inkIn(page, '#ps-paper', 0, 0, 0.12, 0.1); t.check(tl > 50, 'a stroke at 4× lands where the pointer is on the paper', tl); await click(page, '#ps-undo'); }
  await click(page, '#ps-viewBtn');
  await page.evaluate(() => { const s = document.getElementById('ps-zoom'); for (let i = 0; i < 300; i++) { s.value = String(100 + ((i * 37) % 301)); s.dispatchEvent(new Event('input', { bubbles: true })); } s.value = '250'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  t.check((await text(page, '#ps-zoomOut')) === '250%' && (await text(page, '#ps-zoomSub')) === '2½×', 'zoom slider spam ends in a consistent state', [await text(page, '#ps-zoomOut'), await text(page, '#ps-zoomSub')]);
  await click(page, '#ps-fitBtn');
  { const fit = await page.evaluate(() => ({ zoom: document.getElementById('ps-zoom').value, out: document.getElementById('ps-zoomOut').textContent, px: document.getElementById('ps-panXOut').textContent, py: document.getElementById('ps-panYOut').textContent, tf: document.getElementById('ps-paperWrap').style.transform, panOff: document.getElementById('ps-panX').disabled })); t.check(fit.zoom === '100' && fit.out === '100%' && fit.px === 'centre' && fit.py === 'centre' && /translate\(0px, 0px\) scale\(1\)/.test(fit.tf) && fit.panOff, 'Fit to screen resets zoom and pan', fit); }
  await clean(t, page, 'session, undo, clear, keys, turn, zoom');

  // ================= C. the reference =================
  await click(page, '#ps-refBtn');
  t.check(await visible(page, '#ps-refSheet'), 'the Reference sheet opens');
  const refState = () => page.evaluate(() => { const c = document.getElementById('ps-refCanvas'); const d = c.width && c.height ? c.getContext('2d').getImageData(0, 0, c.width, c.height).data : new Uint8ClampedArray(0); const seen = new Set(); let gray = 0, n = 0, sum = 0; for (let i = 0; i < d.length; i += 4 * 37) { n++; seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); if (d[i] === d[i + 1] && d[i + 1] === d[i + 2]) gray++; sum += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7; } const on = (s) => [...document.querySelectorAll(s)].filter((b) => b.getAttribute('aria-pressed') === 'true'); return { w: c.width, h: c.height, distinct: seen.size, grayShare: n ? gray / n : 0, sum, kind: on('#ps-refSheet [data-ref-kind]').map((b) => b.dataset.refKind), view: on('#ps-refSheet [data-ref-view]').map((b) => b.dataset.refView), figView: on('#ps-refFig [data-ref-view]').map((b) => b.dataset.refView), name: document.getElementById('ps-refName').textContent.trim(), anotherHidden: document.getElementById('ps-refAnother').hidden, figHidden: document.getElementById('ps-refFig').hidden, figW: document.getElementById('ps-refFig').getBoundingClientRect().width, sizeOut: document.getElementById('ps-refSizeOut').textContent }; });
  let rs = await refState();
  t.check(rs.kind[0] === 'studio' && /Study tab/.test(rs.name) && rs.anotherHidden && !rs.figHidden && rs.w > 0 && rs.distinct > 40, 'the reference starts as the Study photo, shown as the original', rs);
  await click(page, '#ps-refSheet [data-ref-view="values"]'); rs = await refState();
  t.check(rs.distinct <= 3 && rs.grayShare === 1 && rs.view[0] === 'values' && rs.figView[0] === 'values', 'Values: three grays, and the sheet and the figure\'s switch agree', rs);
  await click(page, '#ps-refFig [data-ref-view="blocks"]'); rs = await refState();
  t.check(rs.distinct > 3 && rs.distinct <= 40 && rs.grayShare < 0.9 && rs.view[0] === 'blocks', 'Blocks from the figure\'s own switch: a few colors, and the sheet follows', rs);
  await click(page, '#ps-refSheet [data-ref-view="original"]');
  await click(page, '#ps-refSheet [data-ref-kind="painting"]');
  await page.waitForFunction(() => /after /.test(document.getElementById('ps-refName').textContent), null, { timeout: 10000 }).catch(() => null);
  rs = await refState();
  t.check(rs.kind[0] === 'painting' && /, after .*generated portrait/.test(rs.name) && !rs.anotherHidden && !rs.figHidden && rs.distinct > 3, 'A portrait: a generated portrait is dealt, named and shown', rs);
  const dealtA = `${rs.sum}:${rs.name}`;
  await click(page, '#ps-refAnother'); await sleep(150); await click(page, '#ps-refAnother'); await sleep(300);
  rs = await refState();
  t.check(`${rs.sum}:${rs.name}` !== dealtA && rs.kind[0] === 'painting', 'Another portrait, twice, deals a different one', { dealtA: dealtA.slice(0, 60), now: `${rs.sum}:${rs.name}`.slice(0, 60) });
  await click(page, '#ps-refSheet [data-ref-view="values"]'); rs = await refState();
  t.check(rs.distinct <= 3 && rs.grayShare === 1, 'a dealt portrait shows its three-value study', rs);
  await click(page, '#ps-refSheet [data-ref-view="blocks"]'); rs = await refState();
  t.check(rs.distinct > 3 && rs.distinct <= 40, 'a dealt portrait shows its color blocks', rs);
  await click(page, '#ps-refSheet [data-ref-view="original"]');
  // size: the slider's ends, and what the picture does
  const sBox = await box(page, '#ps-stage'), stageW = sBox.w, side = Math.min(sBox.w, sBox.h);
  await setRange(page, 'ps-refSize', 20); const w20 = (await refState()).figW;
  await setRange(page, 'ps-refSize', 36); const w36 = (await refState()).figW;
  await setRange(page, 'ps-refSize', 70); const r70 = await refState();
  // the size is a share of the stage's shorter side, so the slider's whole range shows on a wide screen too
  t.check(Math.abs(w20 - side * 0.2) < 6 && Math.abs(r70.figW - side * 0.7) < 6 && r70.sizeOut === '70%', 'reference size 20% and 70%: a fifth and seven tenths of the stage\'s shorter side, the readout agreeing', { w20, w70: r70.figW, side, sizeOut: r70.sizeOut });
  const grows = r70.figW > w36 + 10;
  t.check(grows, 'reference size 70%: the picture is larger than at 36%', { w36, w70: r70.figW, stageW });
  if (!grows) t.finding({ title: 'On a wide screen the reference size slider does nothing past about a fifth of the stage, while its readout keeps climbing', severity: 'low', steps: 'Open the site at 1400 × 900, Studio tab, Reference icon, drag Size from 20% to 70%.', expected: 'The floating reference grows with the slider, as the README\'s "size it" promises, or the slider stops where the picture stops.', actual: `The picture stops at 300 px (styles.css line 1464, .ps-ref { max-width: 300px }) while the readout says 70%: here ${Math.round(w36)} px at 36% and ${Math.round(r70.figW)} px at 70% on a ${Math.round(stageW)} px stage. On a phone the slider works (checked below).` });
  await setRange(page, 'ps-refSize', 36);
  await click(page, '#ps-refSheet [data-ref-show="0"]'); t.check((await refState()).figHidden, 'Hidden hides the reference');
  await click(page, '#ps-refSheet [data-ref-show="1"]'); t.check(!(await refState()).figHidden, 'Shown brings it back');
  await click(page, '#ps-refSheet [data-ref-show="0"]'); await click(page, '#ps-refAnother'); await sleep(300); t.check(!(await refState()).figHidden, 'Another portrait while hidden shows it again');
  // drag it past the corners: it stays inside the stage
  {
    const fb = await box(page, '#ps-refFig .ps-frame'), st = await box(page, '#ps-stage');
    await page.mouse.move(fb.x + fb.w / 2, fb.y + fb.h / 2); await page.mouse.down(); await page.mouse.move(fb.x + fb.w / 2 + 1500, fb.y + fb.h / 2 + 1500, { steps: 6 }); await page.mouse.up();
    const after = await box(page, '#ps-refFig');
    t.check(after.r <= st.r + 1 && after.b <= st.b + 1 && after.x >= st.x - 1 && after.y >= st.y - 1, 'dragging the reference far past the bottom-right keeps it inside the stage', { after, st });
    const fb2 = await box(page, '#ps-refFig .ps-frame');
    await page.mouse.move(fb2.x + fb2.w / 2, fb2.y + fb2.h / 2); await page.mouse.down(); await page.mouse.move(fb2.x + fb2.w / 2 - 1500, fb2.y + fb2.h / 2 - 1500, { steps: 6 }); await page.mouse.up();
    const after2 = await box(page, '#ps-refFig');
    t.check(after2.x >= st.x - 1 && after2.y >= st.y - 1 && after2.x < st.x + 40, 'dragging it far past the top-left keeps it inside too', { after2, st });
    t.check((await alphaInk(page, '#ps-paper')) === inkKept, 'dragging the reference paints nothing');
  }
  // a photo loaded from the Studio's own Load a photo: the Study tab takes it and the reference follows
  await click(page, '#ps-refBtn');
  await loadPhoto(page, await makeImage(page, { width: 320, height: 420, draw: 'transparent', type: 'image/png', name: 'cutout.png' }), { settle: 1500 });
  rs = await refState();
  { const corner = await pixel(page, '#ps-refCanvas', 1, 1); t.check(rs.kind[0] === 'studio' && /Study tab/.test(rs.name) && rs.anotherHidden, 'a photo loaded here makes the Study photo the reference again', rs); t.check(corner[0] === corner[1] && corner[1] === corner[2] && corner[0] > 100 && corner[0] < 160, 'a transparent PNG as the reference sits on mid gray', corner); }
  // a refused file after a dealt portrait: the refusal shows over the studio, and the reference must stay one thing
  await click(page, '#ps-refSheet [data-ref-kind="painting"]');
  await page.waitForFunction(() => /after /.test(document.getElementById('ps-refName').textContent), null, { timeout: 10000 }).catch(() => null);
  await armToast(page);
  await loadPhoto(page, textFile('notes.txt'), { settle: 600 });
  const refused = await toastMatch(page, /not an image/, 3000);
  t.check(!!refused && (await page.evaluate(() => document.getElementById('toast').classList.contains('show'))), 'a text file loaded from the Studio is refused with a word, shown over the studio', refused);
  await click(page, '#ps-refSheet [data-ref-view="values"]');
  rs = await refState();
  const consistent = (rs.kind[0] === 'painting' && /after /.test(rs.name) && !rs.anotherHidden) || (rs.kind[0] === 'studio' && /Study tab/.test(rs.name) && rs.anotherHidden);
  t.check(consistent, 'after a refused file the Paint-from switch, its caption and Another still agree', rs);
  if (!consistent) t.finding({ title: 'A refused file loaded from the Studio flips the reference switch to "The Study photo" while the dealt portrait stays on the paper', severity: 'medium', steps: 'Studio tab, Reference icon, A portrait (a generated portrait appears). Load a photo and choose a file that is not an image (a .txt). The toast says it is not an image. Then tap Values (or Original/Blocks) in the Reference sheet.', expected: 'The reference is still the dealt portrait: "A portrait" pressed, its caption naming the painter, Another portrait offered; or the Study photo throughout.', actual: `The sheet now shows "${rs.kind[0]}" pressed, Another portrait ${rs.anotherHidden ? 'hidden' : 'shown'}, the caption "${rs.name.slice(0, 60)}" and the dealt portrait still drawn (${rs.distinct} colors sampled). Cause: painting.js line 565, the #file change listener sets ref.kind = 'studio' before the file is accepted and refreshes nothing; the next drawReference() (any view button) repaints the switches from that kind while ref.prep is still the portrait's. Check my painting on the Study tab is told the painting is of the Study photo (reference(), line 833).` });
  await click(page, '#ps-refSheet [data-ref-view="original"]');
  await armToast(page);
  await loadPhoto(page, await makeImage(page, { width: 1, height: 1, name: 'dot.png' }), { settle: 600 });
  t.check(/too small|no usable size/.test((await toastMatch(page, /too small|no usable size/, 3000)) || ''), 'a 1 px image loaded from the Studio is refused with its size named', await text(page, '#toast'));
  await clean(t, page, 'reference');

  // ================= D. paints: the well, amounts, Lock in, My mixes across a reload =================
  await click(page, '#ps-colorBtn');
  t.check(await visible(page, '#ps-paintSheet'), 'the Paints sheet opens');
  const pal = await page.evaluate(() => { const s = document.getElementById('ps-palette'); const cur = window.StudioPalette && StudioPalette.current(); return { value: s.value, options: [...s.options].map((o) => o.value), names: [...s.options].map((o) => o.textContent), follows: cur && cur.name }; });
  t.check(pal.options.length >= 10 && ['zorn', 'zorn-blue', 'primary', 'cmy', 'split', 'reilly', 'schmid', 'rembrandt', 'sorolla', 'monet'].every((id) => pal.options.includes(id)), 'the palette list holds the ten known palettes', pal.options);
  t.check(pal.names[pal.options.indexOf(pal.value)] === pal.follows, 'until one is chosen here, the palette follows the Study tab\'s', pal);
  const mixCount = () => page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length);
  t.check((await mixCount()) === 8 && /skin tones/.test(await text(page, '#ps-mixNote')), 'eight starting skin tones, said so', [await mixCount(), await text(page, '#ps-mixNote')]);
  const well = () => page.evaluate(() => ({ parts: document.getElementById('ps-wellParts').textContent.trim(), lock: document.getElementById('ps-lock').disabled, undo: document.getElementById('ps-wellUndo').disabled, clear: document.getElementById('ps-wellClear').disabled, empty: document.getElementById('ps-wellChip').classList.contains('ps-empty'), title: document.getElementById('ps-colorBtn').title, amount: document.getElementById('ps-amountOut').textContent, counts: [...document.querySelectorAll('#ps-paints .ps-paint .ps-n')].map((e) => e.textContent).filter(Boolean) }));
  let w = await well();
  t.check(/^Empty\. Tap a paint/.test(w.parts) && w.lock && w.undo && w.clear && w.empty, 'the well starts empty, its buttons off', w);
  for (const [v, want] of [[0, '¼ part'], [1, '½ part'], [2, '1 part'], [3, '2 parts'], [4, '4 parts']]) { await setRange(page, 'ps-amount', v); t.check((await well()).amount === want, `amount per tap ${v}: ${want}`, (await well()).amount); }
  const codes = await page.evaluate(() => [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code));
  await setRange(page, 'ps-amount', 2); await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`);
  await setRange(page, 'ps-amount', 0); await click(page, `#ps-paints .ps-paint[data-code="${codes[1]}"]`);
  w = await well();
  t.check(w.parts === `${codes[0]} 2 · ${codes[1]} ¼` && !w.lock && !w.undo && !w.clear && !w.empty && /Current mix/.test(w.title) && JSON.stringify(w.counts) === JSON.stringify(['2', '¼']), 'two taps of one paint and a quarter of another read back in the well and on the paints', w);
  await click(page, '#ps-wellUndo'); w = await well(); t.check(w.parts === `${codes[0]} 2` && JSON.stringify(w.counts) === JSON.stringify(['2']), 'the well\'s Undo takes the last part out', w);
  await setRange(page, 'ps-amount', 4); for (let i = 0; i < 60; i++) await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`);
  w = await well(); t.check(w.parts === `${codes[0]} 242`, 'sixty taps of four parts add up', w.parts);
  await click(page, '#ps-wellClear'); w = await well(); t.check(/^Empty\./.test(w.parts) && w.lock && w.counts.length === 0, 'the well\'s Clear empties it', w);
  // Lock in from the eraser: the mix goes on a brush, the sheet closes, the store holds the parts
  await setRange(page, 'ps-amount', 2); await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${codes[1]}"]`);
  await click(page, '#ps-root [data-ps-tool="eraser"]'); await click(page, '#ps-colorBtn'); await click(page, '#ps-lock');
  const lock = await page.evaluate(() => ({ mixes: document.querySelectorAll('#ps-mixes .ps-mix').length, sheetHidden: document.getElementById('ps-paintSheet').hidden, pickedHidden: document.getElementById('ps-picked').hidden, recipe: document.getElementById('ps-pickedRecipe').textContent, title: document.getElementById('ps-colorBtn').title, status: document.getElementById('ps-status').textContent, stored: localStorage.getItem('portrait-value-studio.paintMixes') }));
  t.check(lock.mixes === 9 && lock.sheetHidden && /Mix 9/.test(lock.title) && !/^Eraser/.test(lock.status), 'Lock in keeps the mix, puts it on a brush, closes the sheet and leaves the eraser', lock);
  t.check(lock.stored === JSON.stringify([{ parts: [{ code: codes[0], amount: 1 }, { code: codes[1], amount: 1 }] }]), 'the locked mix is stored as its parts', lock.stored);
  await click(page, '#ps-colorBtn');
  t.check(!lock.pickedHidden && /Locked in as mix 9/.test(lock.recipe), 'the sheet says the mix was locked in as mix 9', lock.recipe);
  await click(page, '#ps-mixes .ps-mix:nth-child(9)');
  w = await well();
  { const recipe = await text(page, '#ps-pickedRecipe'); t.check(w.parts === `${codes[0]} 1 · ${codes[1]} 1` && /^Mix 9 \(/.test(recipe) && /in the well/.test(recipe) && /Mix 9/.test(w.title), 'tapping the kept mix paints with it and puts its parts back in the well', { parts: w.parts, recipe }); }
  { const b = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', [[0.2, 0.2], [0.3, 0.25]]); const px = await page.evaluate(() => { const c = document.getElementById('ps-paper'); const d = c.getContext('2d').getImageData(Math.round(c.width * 0.25), Math.round(c.height * 0.225), 1, 1).data; return [...d]; }); const dot = await page.evaluate(() => getComputedStyle(document.getElementById('ps-colorDot')).getPropertyValue('--c').trim()); const dotRgb = (/rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(dot) || []).slice(1, 4).map(Number); t.check((await alphaInk(page, '#ps-paper')) > b && px[3] > 200 && dotRgb.length === 3 && dotRgb.every((v, i) => Math.abs(v - px[i]) <= 6), 'a stroke with the kept mix lays the color the strip\'s dot shows (the chisel paints at 92% opacity)', { px, dot }); await click(page, '#ps-undo'); }
  // a palette chosen here: its paints, new starters, the kept mix stays, the well empties
  const other = pal.value === 'zorn' ? 'rembrandt' : 'zorn';
  await click(page, '#ps-colorBtn'); await page.selectOption('#ps-palette', other);
  w = await well();
  { const paints = await page.evaluate(() => [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code).join()); t.check((await mixCount()) === 9 && /^Empty/.test(w.parts) && paints === (other === 'zorn' ? 'TW,YO,CRL,IB' : 'LW,YO,RS,BS,LR,RU,BU,IB,Vm'), `choosing ${other} here: its paints, eight new starters, the kept mix stays, the well empties`, { mixes: await mixCount(), parts: w.parts, paints }); }
  await page.reload({ waitUntil: 'load' }); await sleep(500); await tab(page, 'paint'); await studioReady(page);
  t.check(!!(await toastMatch(page, /back from last time/, 4000)), 'after the reload the Studio says the painting is back');
  await click(page, '#ps-colorBtn');
  { const after = await page.evaluate(() => ({ mixes: document.querySelectorAll('#ps-mixes .ps-mix').length, last: document.querySelector('#ps-mixes .ps-mix:last-child').title, palette: document.getElementById('ps-palette').value })); t.check(after.mixes === 9 && after.last === `Mix 9: ${codes[0]} 1 · ${codes[1]} 1`, 'My mixes: the locked mix is back after a reload, the starters made afresh', after); t.note(`after the reload the palette select shows "${after.palette}" (a palette chosen in the Studio is not itself remembered: the README promises only the mixes)`); }
  await click(page, '#ps-mixes .ps-mix:last-child'); await click(page, '#ps-dropMix');
  t.check((await mixCount()) === 8 && (await storageGet(page, 'portrait-value-studio.paintMixes')) === '[]' && (await page.evaluate(() => document.getElementById('ps-picked').hidden)), 'Remove drops the kept mix from the sheet and the store', await storageGet(page, 'portrait-value-studio.paintMixes'));
  await armToast(page); await tab(page, 'study'); await tab(page, 'paint'); await sleep(600);
  t.check(!/back from last time|saved in this browser/.test(await text(page, '#toast')), 're-opening the tab repeats no welcome', await text(page, '#toast'));
  await clean(t, page, 'paints and mixes');

  // ================= E. the canvas, Save as PNG, Copy the Study lines, autosave and restore =================
  await click(page, '#ps-canvasBtn');
  const groundPx = () => pixel(page, '#ps-ground', 5, 5);
  let c = await canvasSheet(page); let gp = await groundPx();
  t.check(c.ground[0] === 'raw' && c.weave[0] === 'off' && c.washOpts && gp[0] === 243 && gp[1] === 238 && gp[2] === 226 && /Raw canvas/.test(c.hint), 'the canvas starts raw with no texture, and the hint says so', { c, gp });
  await click(page, '#ps-root [data-ground="gray"]'); c = await canvasSheet(page); gp = await groundPx();
  t.check(c.ground[0] === 'gray' && gp[0] === 140 && gp[1] === 138 && /mid-value gray/.test(c.hint), 'Gray ground: a mid gray, and the hint says so', { c, gp });
  await click(page, '#ps-root [data-ground="wash"]'); c = await canvasSheet(page);
  { const paints = await page.evaluate(() => document.querySelectorAll('#ps-paints .ps-paint').length); t.check(c.ground[0] === 'wash' && !c.washOpts && c.washRow === paints && c.washName && /thin wash/.test(c.hint), 'Toned wash: every paint of the palette offered, one chosen and named', { c, paints }); }
  const dist = (p) => Math.hypot(p[0] - 243, p[1] - 238, p[2] - 226);
  const strengths = [];
  for (const v of [10, 20, 30, 40, 50, 60]) { await setRange(page, 'ps-washStr', v); strengths.push({ v, out: (await canvasSheet(page)).washOut, d: +dist(await groundPx()).toFixed(1) }); }
  t.check(strengths.every((s, i) => s.out === `${s.v}%` && (i === 0 || s.d > strengths[i - 1].d)), 'wash strength 10 to 60: the readout follows and the tint deepens at every step', strengths);
  for (const [v, want] of [[5, '10%'], [99, '60%']]) { await setRange(page, 'ps-washStr', v); t.check((await canvasSheet(page)).washOut === want, `wash strength ${v} clamps to ${want}`, (await canvasSheet(page)).washOut); }
  { const btns = await page.evaluate(() => [...document.querySelectorAll('#ps-washRow button')].map((b) => ({ label: b.getAttribute('aria-label'), on: b.getAttribute('aria-pressed') === 'true' }))); const i = btns.findIndex((b) => !b.on); const before = await groundPx(); await click(page, `#ps-washRow button:nth-child(${i + 1})`); c = await canvasSheet(page); t.check(c.washName === btns[i].label.replace(/^Wash of /, '') && JSON.stringify(await groundPx()) !== JSON.stringify(before), 'another paint for the wash is named and tints the ground', { c, want: btns[i] }); }
  await click(page, '#ps-root [data-weave="linen"]'); c = await canvasSheet(page);
  t.check(c.weave[0] === 'linen' && c.cls.includes('ps-textured') && !c.cls.includes('ps-textured-paper') && (await alphaInk(page, '#ps-weave')) > 1000, 'Linen: the texture is drawn and shown', { c, weave: await alphaInk(page, '#ps-weave') });
  await click(page, '#ps-root [data-weave="paper"]'); c = await canvasSheet(page);
  t.check(c.weave[0] === 'paper' && c.cls.includes('ps-textured-paper') && !c.cls.includes('ps-textured'), 'Paper: its own texture', c);
  await click(page, '#ps-root [data-weave="off"]'); c = await canvasSheet(page);
  t.check(c.weave[0] === 'off' && (await alphaInk(page, '#ps-weave')) === 0 && !c.cls.some((x) => x.startsWith('ps-textured')), 'Off: the texture goes', c);
  // Save as PNG: the paper's size, one flat opaque picture with the ground in it; after a turn, the turned size
  await click(page, '#ps-root [data-weave="linen"]');
  const dl = await savePng(page);
  t.check(dl && dl.name === 'painting.png' && dl.png && dl.w === 900 && dl.h === 1200 && dl.back && dl.back.w === 900 && dl.back.opaque && dl.back.distinct > 4 && dl.back.corner[3] === 255 && dist(dl.back.corner) > 5, 'Save as PNG downloads painting.png at the paper\'s size: opaque, with the wash and texture in it', dl);
  t.check(!(await visible(page, '#ps-canvasSheet')), 'Save as PNG closes the sheet');
  await click(page, '#ps-orient'); await click(page, '#ps-canvasBtn');
  { const dl2 = await savePng(page); t.check(dl2 && dl2.w === 1200 && dl2.h === 900, 'after Turn the paper the PNG is 1200 × 900', dl2 && { w: dl2.w, h: dl2.h }); }
  await click(page, '#ps-orient');
  // Copy the Study lines: with nothing to copy, then with a 3 × 3 grid and one line, then in white
  await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="sketch"]'); await click(page, '#ps-sketchClear');
  await armToast(page); await click(page, '#ps-sketchFromStudy');
  { const none = await toastMatch(page, /Nothing to copy/, 2000); t.check(!!none && /draw lines, measures or plumb lines on the Study tab first, or turn its grid on/.test(none) && (await alphaInk(page, '#ps-sketch')) === 0, 'Copy the Study lines with nothing on the Study tab says what to do and draws nothing', none); }
  await tab(page, 'study');
  await click(page, '#gridBtn'); await click(page, '.tool-btn[data-tool="line"]');
  await stroke(page, '#cv-orig', [[0.2, 0.2], [0.8, 0.6]]);
  { const marks = await page.evaluate(() => Studio.marks().length); t.check(marks === 5, 'the Study tab now holds a 3 × 3 grid and one line', marks); }
  await tab(page, 'paint'); await click(page, '#ps-brushBtn');
  await armToast(page); await click(page, '#ps-sketchFromStudy');
  const copied = await toastMatch(page, /Study lines are on the underdrawing/, 2000);
  const bands = () => page.evaluate(() => { const prep = Studio.prep(); const c = document.getElementById('ps-sketch'); const k = Math.min(c.width / prep.w, c.height / prep.h); const w = prep.w * k, h = prep.h * k, ox = (c.width - w) / 2, oy = (c.height - h) / 2; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const band = (x) => { let n = 0; for (let y = Math.round(oy); y < oy + h; y++) for (let dx = -2; dx <= 2; dx++) { const i = (y * c.width + Math.round(x) + dx) * 4 + 3; if (d[i] > 8) n++; } return +(n / h).toFixed(2); }; let ink = 0, white = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 8) { ink++; if (d[i] > 200 && d[i + 1] > 200) white++; } return { third: band(ox + w / 3), sixth: band(ox + w / 6), ink, white, sketchShown: !document.getElementById('ps-paperWrap').classList.contains('ps-no-sketch'), status: document.getElementById('ps-status').textContent, sheetHidden: document.getElementById('ps-brushSheet').hidden }; });
  { const b = await bands(); t.check(!!copied && b.ink > 100 && b.third > 1 && b.sixth < b.third / 5 && b.sketchShown && b.sheetHidden && b.status.startsWith('Underdrawing'), 'Copy the Study lines draws the grid at the thirds on the underdrawing, shown, in pencil, and closes the sheet', { copied, ...b }); }
  await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-scolor="white"]'); await click(page, '#ps-sketchClear'); await click(page, '#ps-sketchFromStudy');
  { const b = await bands(); t.check(b.ink > 100 && b.white > b.ink * 0.9, 'Copy the Study lines with the underdrawing set to white draws in white', b); }
  await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-scolor="black"]');
  await click(page, '#ps-root [data-ps-tool="eraser"]');
  t.check(/underdrawing/.test(await status(page)), 'after Copy the Study lines the eraser works on the underdrawing', await status(page));
  // autosave: a gray ground, the paper texture, the paper turned, the underdrawing hidden, a stroke; a reload brings it all back
  await click(page, '#ps-canvasBtn'); await click(page, '#ps-root [data-ground="gray"]'); await click(page, '#ps-root [data-weave="paper"]');
  await click(page, '#ps-brushBtn'); await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-sketch-show="0"]'); await click(page, '#ps-root [data-brush="chisel"]');
  await click(page, '#ps-orient');
  await stroke(page, '#ps-paper', [[0.2, 0.3], [0.6, 0.6]]);
  // (the time is taken once the stroke has ended: a save already due from the clicks before it can fall in the middle of a slow stroke, and its record is then not the finished painting)
  const since = Date.now();
  const saved = { paper: await alphaInk(page, '#ps-paper'), sketch: await alphaInk(page, '#ps-sketch') };
  const rec = await waitSaved(page, since);
  t.check(rec && rec.w === 1200 && rec.h === 900 && rec.paperBlob && rec.sketchBlob && rec.canvas && rec.canvas.ground === 'gray' && rec.canvas.weave === 'paper' && rec.canvas.washStr === 0.6 && rec.sketchShown === false, 'the autosave record holds the turned paper, both pictures as blobs, the canvas settings and the hidden underdrawing', rec);
  await page.reload({ waitUntil: 'load' }); await sleep(500); await tab(page, 'paint'); await studioReady(page);
  { const welcome = await toastMatch(page, /back from last time/, 4000); const r = { size: await paperSize(page), paper: await alphaInk(page, '#ps-paper'), sketch: await alphaInk(page, '#ps-sketch'), c: await canvasSheet(page), status: await status(page), undo: await undoOff(page) };
    t.check(!!welcome, 'after the reload the Studio says the painting is back', welcome);
    t.check(r.size.w === 1200 && r.size.h === 900 && r.status.endsWith('1200 × 900'), 'the turned paper comes back turned', r);
    t.check(r.paper === saved.paper && r.sketch === saved.sketch, 'the strokes and the underdrawing come back exactly', { saved, paper: r.paper, sketch: r.sketch });
    t.check(r.c.ground[0] === 'gray' && r.c.weave[0] === 'paper' && r.c.washStr === '60' && r.c.washOut === '60%' && r.c.cls.includes('ps-no-sketch') && r.c.cls.includes('ps-textured-paper'), 'the ground, texture, wash strength and hidden underdrawing come back', r.c);
    t.check(r.undo, 'nothing to undo right after a restore'); }
  // a stroke, then a tab switch within the save delay: kept and saved
  { const since3 = Date.now(); await stroke(page, '#ps-paper', [[0.6, 0.2], [0.7, 0.4]]); const inkS = await alphaInk(page, '#ps-paper'); await tab(page, 'study'); const rec3 = await waitSaved(page, since3); await tab(page, 'paint'); t.check(!!rec3 && (await alphaInk(page, '#ps-paper')) === inkS && inkS > saved.paper, 'a stroke followed at once by a tab switch is kept and saved', { rec3: !!rec3, inkS }); }
  // a stroke, then a reload at once (inside the save delay, 800 ms)
  { const last = await waitSaved(page, 0); await stroke(page, '#ps-paper', [[0.7, 0.2], [0.8, 0.8]]); const inkBefore = await alphaInk(page, '#ps-paper'); await page.reload({ waitUntil: 'load' }); await sleep(500); await tab(page, 'paint'); await studioReady(page); const inkAfter = await alphaInk(page, '#ps-paper'); const lastSaved = await alphaInk(page, '#ps-paper');
    t.note(inkAfter === inkBefore ? 'a stroke followed at once by a reload is kept (the save on pagehide made it)' : `a stroke followed at once by a reload, inside the 0.8 s autosave delay, is lost (${inkBefore} → ${inkAfter}); everything saved before it is kept`);
    t.check(inkAfter === inkBefore || (last && lastSaved > 0 && inkAfter < inkBefore), 'a reload right after a stroke keeps the painting as last saved, or with the stroke', { inkBefore, inkAfter }); }
  await clean(t, page, 'canvas, save, copy, autosave');
  await page.context().close();

  // ================= F. hostile IndexedDB records =================
  {
    const page = await openPage(site);
    await tab(page, 'paint'); await studioReady(page);
    const records = [
      ['a string', 'hello', { kept: false }],
      ['a number', 42, { kept: false }],
      ['null', null, { kept: false }],
      ['an array', [1, 2, 3], { kept: false }],
      ['w and h of 0', { w: 0, h: 0, paper: { __blob: 'png' } }, { kept: false }],
      ['w and h of 100000', { w: 100000, h: 100000, paper: { __blob: 'png' } }, { kept: false }],
      ['w and h of "12"', { w: '12', h: '12', paper: { __blob: 'png' } }, { kept: false }],
      ['w of 1.5 and h of -5', { w: 1.5, h: -5, paper: { __blob: 'png' } }, { kept: false }],
      ['w of NaN', { w: { __nan: true }, h: 1200, paper: { __blob: 'png' } }, { kept: false }],
      ['one past the largest size', { w: 16385, h: 16, paper: { __blob: 'png' } }, { kept: false }],
      ['paper and sketch not blobs, canvas a string, sketchShown a word', { w: 900, h: 1200, paper: 'not a blob', sketch: 123, canvas: 'raw', sketchShown: 'no' }, { kept: 'blank' }],
      ['junk blobs and canvas settings of wrong types (weave an array, washStr NaN)', { w: 900, h: 1200, paper: { __blob: 'junk' }, sketch: { __blob: 'junk' }, canvas: { ground: 5, weave: ['linen'], washCode: {}, washStr: { __nan: true } } }, { kept: 'blank' }],
      ['prototype names in the canvas settings, washStr a string', { w: 900, h: 1200, paper: { __blob: 'png' }, canvas: { ground: 'constructor', weave: '__proto__', washCode: 'constructor', washStr: '0.3' } }, { kept: true, ground: 'raw', weave: 'off' }],
      ['washStr out of range, washCode toString, valid ground and texture', { w: 900, h: 1200, paper: { __blob: 'png' }, canvas: { ground: 'wash', weave: 'paper', washCode: 'toString', washStr: 5 } }, { kept: true, ground: 'wash', weave: 'paper' }],
      ['__proto__ and constructor as keys in the canvas settings', { w: 900, h: 1200, paper: { __blob: 'png' }, canvas: { __json: '{"__proto__": {"ground": "gray"}, "constructor": {"weave": "linen"}, "ground": "gray"}' } }, { kept: true, ground: 'gray', weave: 'off' }],
      ['a strip no paper can be shown at (16384 × 16)', { w: 16384, h: 16, paper: { __blob: 'png' }, sketch: { __blob: 'png' } }, { kept: false }],
    ];
    const blankWelcome = [];
    for (const [label, spec, want] of records) {
      await putRecord(page, spec);
      await page.reload({ waitUntil: 'load' }); await sleep(400);
      await tab(page, 'paint'); await studioReady(page); await sleep(300);
      const s = await page.evaluate(() => ({ w: document.getElementById('ps-paper').width, h: document.getElementById('ps-paper').height, ground: [...document.querySelectorAll('#ps-canvasSheet [data-ground]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.ground), weave: [...document.querySelectorAll('#ps-canvasSheet [data-weave]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.weave), washStr: document.getElementById('ps-washStr').value, washOut: document.getElementById('ps-washOut').textContent, washName: document.getElementById('ps-washName').textContent, toast: document.getElementById('toast').textContent, reset: !!document.querySelector('#toast .toast-action'), status: document.getElementById('ps-status').textContent, wrap: (() => { const r = document.getElementById('ps-paperWrap').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() }));
      const paperInk = await alphaInk(page, '#ps-paper');
      const L = `hostile record (${label})`;
      if (want.kept === 'strip') {
        t.check(s.w === 16384 && s.h === 16 && /16384 × 16/.test(s.status), `${L}: the size is taken and shown`, s);
        const seen = s.wrap[1] >= 24;
        t.check(seen, `${L}: the paper can still be seen and painted on`, s.wrap);
        if (!seen) t.finding({ title: 'A saved paper of an extreme but accepted size leaves the Studio with a paper no one can see, paint on or replace', severity: 'low', steps: 'Write a record { w: 16384, h: 16, paper: <a PNG blob> } under key "painting" in the "studio" store of IndexedDB "portrait-value-studio" (a corrupted or tampered record), reload, open the Studio.', expected: 'A size the paper cannot be shown at is refused like 0 or 100000 are (restore() falls back to the 900 × 1200 paper), or the Studio offers a new paper.', actual: `The record passes restore()'s size check (painting.js line 451: any integer up to 16384) and the paper is drawn ${s.wrap[0]} × ${s.wrap[1]} px, the status reads "${s.status}"; Turn the paper only swaps it to 16 × 16384 (drawn 0 px wide), Clear keeps the size, and only Forget my work on this device (which also clears every setting) gives the 900 × 1200 paper back.` });
      } else {
        t.check(s.w === 900 && s.h === 1200 && /900 × 1200/.test(s.status), `${L}: the paper is 900 × 1200`, s);
        t.check(s.ground.length === 1, `${L}: exactly one ground is pressed`, s.ground);
        const oneWeave = s.weave.length === 1;
        t.check(oneWeave, `${L}: exactly one texture is pressed`, s.weave);
        if (!oneWeave) t.finding({ title: 'A saved texture of the wrong type (an array holding a texture name) passes the Studio\'s check and leaves no texture pressed', severity: 'low', steps: 'Write { w: 900, h: 1200, canvas: { weave: ["linen"] } } under key "painting" in the "studio" store of IndexedDB "portrait-value-studio", reload, open the Studio, Canvas icon.', expected: 'A texture that is not one of off, linen or paper is ignored and Off stays pressed (as a texture named "constructor" is).', actual: `No texture button is pressed (${JSON.stringify(s.weave)}): painting.js line 460 checks the value with hasOwnProperty, which reads ["linen"] as "linen", so canvasState.weave becomes an array and is saved back as one. Measured: the texture layer is drawn but shown at opacity 0, Save as PNG still multiplies a texture into the picture (WEAVE_ALPHA[["linen"]] is 0.55: 91 distinct colors in a bare 60 × 60 patch of the PNG), and because tile() (line 187) caches the tile under the key "linen" with kind === 'linen' false, pressing Linen afterwards shows the paper tooth for the rest of the visit.` });
        t.check(+s.washStr >= 10 && +s.washStr <= 60 && s.washOut === `${s.washStr}%` && (s.ground[0] !== 'wash' || s.washName), `${L}: the wash strength is in range and its readout agrees`, s);
        if (want.ground) t.check(s.ground[0] === want.ground && s.weave[0] === want.weave, `${L}: the valid fields are kept and the rest left at their defaults`, s);
        if (want.kept === false) t.check(!/back from last time/.test(s.toast) && !s.reset && paperInk === 0, `${L}: ignored without a word of a painting coming back, no reset offer, a blank paper`, { toast: s.toast, reset: s.reset, paperInk });
        if (want.kept === true) t.check(/back from last time/.test(s.toast) && paperInk > 0, `${L}: the painting is back and said to be`, { toast: s.toast, paperInk });
        if (want.kept === 'blank') { const honest = !/back from last time/.test(s.toast) || paperInk > 0; t.check(honest, `${L}: a record whose pictures cannot be read is not announced as the painting being back`, { toast: s.toast, paperInk }); if (!honest) blankWelcome.push(label); }
        const b = paperInk; await stroke(page, '#ps-paper', [[0.3, 0.3], [0.6, 0.5]]);
        t.check((await alphaInk(page, '#ps-paper')) > b, `${L}: a stroke still lands`, await alphaInk(page, '#ps-paper'));
      }
      await clean(t, page, L);
    }
    if (blankWelcome.length) t.finding({ title: 'A saved record whose pictures are not images is announced as "Your painting is back from last time" over a blank paper', severity: 'low', steps: `Write a record with w: 900, h: 1200 whose paper and sketch are not blobs (or are blobs that are not PNGs) under key "painting" in the "studio" store of IndexedDB "portrait-value-studio", reload, open the Studio. Seen with: ${blankWelcome.join('; ')}.`, expected: 'Either no welcome (the record is treated as unreadable, as the comment at painting.js line 450 says: "pictures that are blobs") or a word that the saved painting could not be read, with the reset offer the guard has for that.', actual: 'The toast says "Your painting is back from last time" and the paper is blank: restore() (painting.js lines 453-468) sets restored = true whenever w and h pass, and draws nothing when the pictures fail to load.' });
    await page.context().close();
  }

  // ================= G. hostile localStorage: paintMixes, myPaints, studioNotice =================
  {
    const TWYO = { parts: [{ code: 'TW', amount: 1 }, { code: 'YO', amount: 2 }] };
    const mixCases = [
      ['a bare word', 'nope', 8],
      ['a JSON string', '"nope"', 8],
      ['a number', 42, 8],
      ['an object', { parts: [TWYO] }, 8],
      ['null, junk and parts with bad amounts and prototype-name codes', [null, 1, 'x', { parts: 'TW' }, { parts: [] }, { parts: [{ code: 'constructor', amount: 1 }, { code: '__proto__', amount: 1 }, { code: 'TW', amount: '2' }, { code: 'TW', amount: null }, { code: 'TW', amount: 1e9 }, { code: 'TW', amount: 0 }, { code: 'TW', amount: -1 }, { code: 'YO', amount: 0.5 }] }, { parts: [{ code: 'TW', amount: 1 }], c: 'hostile', name: { toString: 1 }, starter: true }], 10],
      ['__proto__ and constructor as keys', '[{"__proto__": {"parts": [{"code":"TW","amount":1}]}, "constructor": 1, "parts": [{"code":"CRL","amount":1}]}]', 9],
      ['a huge array of 3000 mixes', Array.from({ length: 3000 }, () => TWYO), 3008],
      ['one mix of a thousand parts', [{ parts: Array.from({ length: 1000 }, (_, i) => ({ code: i % 2 ? 'TW' : 'YO', amount: 0.25 })) }], 9],
    ];
    for (const [label, value, wantMixes] of mixCases) {
      const t1 = Date.now();
      const page = await openPage(site, { storage: { 'portrait-value-studio.paintMixes': value } });
      await tab(page, 'paint'); await studioReady(page);
      const secs = (Date.now() - t1) / 1000;
      await click(page, '#ps-colorBtn');
      const s = await page.evaluate(() => ({ mixes: document.querySelectorAll('#ps-mixes .ps-mix').length, titles: [...document.querySelectorAll('#ps-mixes .ps-mix')].slice(8, 11).map((b) => b.title), sheet: !document.getElementById('ps-paintSheet').hidden }));
      t.check(s.mixes === wantMixes && s.sheet, `hostile paintMixes (${label}): ${wantMixes} mixes (the eight starters and what was valid), the sheet opens`, s);
      if (s.mixes > 8) { await click(page, '#ps-mixes .ps-mix:last-child'); t.check(!(await page.evaluate(() => document.getElementById('ps-picked').hidden)) && /Mix \d+ \(/.test(await text(page, '#ps-pickedRecipe')), `hostile paintMixes (${label}): the last kept mix can be picked and names its recipe`, await text(page, '#ps-pickedRecipe')); }
      if (wantMixes > 100) t.note(`3000 saved mixes: the Studio was ready ${secs.toFixed(1)} s after the page opened, with ${s.mixes} mix buttons in the sheet`);
      const b = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', [[0.3, 0.3], [0.6, 0.5]]);
      t.check((await alphaInk(page, '#ps-paper')) > b, `hostile paintMixes (${label}): a stroke still lands`);
      await clean(t, page, `hostile paintMixes (${label})`);
      await page.context().close();
    }
    const mineCases = [
      ['a string', 'TW', null],
      ['an object with a huge length', { length: 1e9 }, null],
      ['prototype names and junk among two real paints', ['constructor', '__proto__', 'TW', 'TW', 'YO', 5, null, {}, []], 'My paints (2)'],
      ['one paint only', ['TW'], null],
      ['ten thousand copies of one paint', Array(10000).fill('TW'), null],
      ['five paints and a prototype name', ['TW', 'YO', 'CRL', 'IB', 'UB', 'constructor'], 'My paints (5)'],
    ];
    for (const [label, value, wantOption] of mineCases) {
      const page = await openPage(site, { storage: { 'portrait-value-studio.myPaints': value } });
      await tab(page, 'paint'); await studioReady(page);
      await click(page, '#ps-colorBtn');
      const names = await page.evaluate(() => [...document.getElementById('ps-palette').options].map((o) => o.textContent));
      const mine = names.filter((n) => /^My paints/.test(n));
      t.check(wantOption ? mine.length === 1 && mine[0] === wantOption : mine.length === 0, `hostile myPaints (${label}): ${wantOption ? `the list offers "${wantOption}"` : 'the list offers no My paints'}`, names);
      if (wantOption) {
        await page.selectOption('#ps-palette', 'mine');
        const s = await page.evaluate(() => ({ paints: [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code), mixes: document.querySelectorAll('#ps-mixes .ps-mix').length, wash: document.querySelectorAll('#ps-washRow button').length }));
        t.check(s.paints.every((c) => /^[A-Za-z]+$/.test(c)) && s.paints.length === +wantOption.replace(/\D/g, '') && s.mixes === 8 && s.wash === s.paints.length, `hostile myPaints (${label}): choosing My paints gives only the real paints, with starters and a wash from them`, s);
        const b = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', [[0.3, 0.3], [0.6, 0.5]]);
        t.check((await alphaInk(page, '#ps-paper')) > b, `hostile myPaints (${label}): a stroke still lands`);
      }
      await clean(t, page, `hostile myPaints (${label})`);
      await page.context().close();
    }
    for (const [label, value, shown] of [['a word instead of true', '"yes"', true], ['a number', 0, true], ['true', true, false]]) {
      const page = await openPage(site, { storage: { 'portrait-value-studio.studioNotice': value } });
      await tab(page, 'paint'); await studioReady(page);
      const note = await toastMatch(page, /saved in this browser/, 2500);
      t.check(shown ? !!note : !note, `hostile studioNotice (${label}): the one-time note is ${shown ? 'shown again' : 'not shown'}`, await text(page, '#toast'));
      t.check((await storageGet(page, 'portrait-value-studio.studioNotice')) === 'true', `hostile studioNotice (${label}): the flag is true afterwards`, await storageGet(page, 'portrait-value-studio.studioNotice'));
      await clean(t, page, `hostile studioNotice (${label})`);
      await page.context().close();
    }
  }

  // ================= H. the phone: opened straight on #paint =================
  {
    const page = await openPage(site, { viewport: PHONE, url: '#paint' });
    await studioReady(page); await sleep(300);
    t.check(!!(await toastMatch(page, /saved in this browser/, 4000)), 'phone, opened on #paint: the one-time note shows');
    const lay = await page.evaluate(() => { const strip = document.querySelector('#ps-root .ps-strip').getBoundingClientRect(); const stage = document.getElementById('ps-stage').getBoundingClientRect(); const btns = [...document.querySelectorAll('#ps-root .ps-strip button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.getBoundingClientRect()); return { stripY: strip.y, stripB: strip.bottom, stripW: strip.width, stripH: strip.height, stageB: stage.bottom, exit: getComputedStyle(document.getElementById('ps-exit')).display, topbar: getComputedStyle(document.querySelector('.topbar')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display, body: document.body.classList.contains('tab-paint'), ih: innerHeight, iw: innerWidth, sw: screen.width, sh: screen.height, btns: btns.length, btnsIn: btns.every((r) => r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5), status: getComputedStyle(document.getElementById('ps-status')).display, toastBottom: parseFloat(getComputedStyle(document.getElementById('toast')).bottom) }; });
    t.note(`phone window ${lay.iw}×${lay.ih}, screen ${lay.sw}×${lay.sh}`);
    t.check(lay.stripW > lay.stripH && lay.stripB >= lay.ih - 2 && lay.stripY >= lay.stageB - 1, 'phone: the strip runs along the bottom, under the paper', lay);
    t.check(lay.exit !== 'none' && lay.btns === 10 && lay.btnsIn, 'phone: the exit arrow joins the strip and all ten icons are on screen', lay);
    t.check(lay.topbar === 'none' && lay.tabs === 'none' && lay.body, 'phone: the header and tabs step aside while painting', lay);
    t.check(lay.toastBottom > lay.stripH, 'phone: a toast sits above the strip', lay.toastBottom);
    t.check((await hscroll(page)) <= 0, 'phone: no horizontal scroll', await hscroll(page));
    await stroke(page, '#ps-paper', PATH);
    const phoneInk = await alphaInk(page, '#ps-paper');
    t.check(phoneInk > 50, 'phone: a stroke lands', phoneInk);
    await click(page, '#ps-brushBtn');
    { const sh = await box(page, '#ps-brushSheet'), st = await box(page, '#ps-stage'); t.check(await visible(page, '#ps-brushSheet') && sh.b <= st.b + 1 && sh.x >= st.x - 1 && sh.r <= st.r + 1 && sh.y >= st.y - 1, 'phone: the brush sheet opens over the paper, inside the stage, above the strip', { sh, st }); }
    await stroke(page, '#ps-paper', [[0.2, 0.2], [0.3, 0.25]]);
    t.check(!(await visible(page, '#ps-brushSheet')), 'phone: painting closes the sheet');
    await page.keyboard.press('Control+z');
    t.check((await alphaInk(page, '#ps-paper')) === phoneInk, 'phone: Ctrl+Z undoes the last stroke');
    await click(page, '#ps-colorBtn');
    { const sh = await box(page, '#ps-paintSheet'), st = await box(page, '#ps-stage'); t.check(await visible(page, '#ps-paintSheet') && sh.b <= st.b + 1 && sh.h <= st.h && sh.x >= st.x - 1 && sh.r <= st.r + 1, 'phone: the Paints sheet fits in the stage', { sh, st }); }
    await page.keyboard.press('Escape');
    // the reference's size slider works to its top here
    await click(page, '#ps-refBtn'); await setRange(page, 'ps-refSize', 70);
    { const fig = await box(page, '#ps-refFig'), st = await box(page, '#ps-stage'); t.check(Math.abs(fig.w - st.w * 0.7) < 6 && fig.b <= st.b + 1, 'phone: the reference at 70% is seven tenths of the stage and fits', { fig, st }); await setRange(page, 'ps-refSize', 36); }
    await click(page, '#ps-refSheet [data-ref-show="0"]');
    // zoom 4×, pan to a corner, back to 100% by the slider: where does the paper sit?
    await click(page, '#ps-viewBtn'); await setRange(page, 'ps-zoom', 400); await setRange(page, 'ps-panX', 100); await setRange(page, 'ps-panY', 100);
    { const wb = await box(page, '#ps-paperWrap'), st = await box(page, '#ps-stage'); t.check(wb.r <= st.r + 1 && wb.r >= st.r - 100 && wb.b <= st.b + 1 && wb.b >= st.b - 100, 'phone: zoom 4× pan bottom-right shows that corner', { wb, st }); }
    await setRange(page, 'ps-zoom', 100);
    const back = await page.evaluate(() => { const w = document.getElementById('ps-paperWrap').getBoundingClientRect(); const s = document.getElementById('ps-stage').getBoundingClientRect(); return { tf: document.getElementById('ps-paperWrap').style.transform, offX: Math.round((w.x + w.width / 2) - (s.x + s.width / 2)), offY: Math.round((w.y + w.height / 2) - (s.y + s.height / 2)), panOff: document.getElementById('ps-panX').disabled, outX: document.getElementById('ps-panXOut').textContent, zoomOut: document.getElementById('ps-zoomOut').textContent }; });
    const centred = Math.abs(back.offX) <= 2 && Math.abs(back.offY) <= 2;
    t.check(centred, 'phone: zooming back to 100% by the slider leaves the paper centred with the pan sliders off', back);
    if (!centred) t.finding({ title: 'Zooming back out to 100% with the pan left at a corner leaves the paper shifted, with the pan sliders disabled and still reading "100% right"', severity: 'low', steps: 'On a 390 × 844 window: Studio tab, Zoom and pan icon, Zoom to 400%, Pan across to the right end, Pan up and down to the bottom, then drag Zoom back to 100%.', expected: 'At 100% the paper is centred (as Fit to screen leaves it) and the pan readouts say centre, or the pan sliders stay usable.', actual: `The paper sits ${back.offX} px across and ${back.offY} px down from the centre of the stage (transform "${back.tf}"), the pan sliders are disabled and the across readout says "${back.outX}". Cause: applyView() (painting.js line 599) keeps a 24 px margin in its pan range even at zoom 1, so a paper nearly as wide as the stage still moves by the leftover pan; only Fit to screen resets view.px and view.py.` });
    await click(page, '#ps-fitBtn');
    // the exit arrow leads back to the page
    await click(page, '#ps-exit'); await sleep(400);
    const out = await page.evaluate(() => ({ body: document.body.classList.contains('tab-paint'), topbar: getComputedStyle(document.querySelector('.topbar')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display, study: !document.getElementById('tab-study').hidden, paint: document.getElementById('tab-paint').hidden }));
    t.check(!out.body && out.topbar !== 'none' && out.tabs !== 'none' && out.study && out.paint, 'phone: the exit arrow leaves the studio, the header and tabs come back on the Study tab', out);
    await tab(page, 'paint'); await sleep(300);
    t.check((await alphaInk(page, '#ps-paper')) === phoneInk && (await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).display)) === 'none', 'phone: coming back finds the painting, the header gone again', await alphaInk(page, '#ps-paper'));
    await screenshot(page, 'studio-phone');
    await clean(t, page, 'phone');
    await page.context().close();
  }

  await gaps(t, site);
  await round2(t, site);
}

// ================= I. the coverage critic's gaps: every high and medium one, then the low ones the time allows =================
export async function gaps(t, site) {
  // ---- gap (high): the autosave where IndexedDB is off or broken: one word that the painting is not kept, no
  // one-time note that it is where the database never answered, no welcome, and painting still works
  await guard(t, 'gap: IndexedDB off or broken', async () => {
    const countOpenErrors = () => { const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function (...a) { const r = open.apply(this, a); r.addEventListener('error', () => { window.__tries = (window.__tries || 0) + 1; }); return r; }; };
    const SCEN = [
      ['IndexedDB absent', () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); }, /^The painting cannot be saved in this browser \(its storage is turned off\)\. It stays for this visit only\.$/, false],
      ['indexedDB.open failing', () => { IDBFactory.prototype.open = function () { const r = {}; setTimeout(() => { r.error = new DOMException('The database is not available.', 'UnknownError'); window.__tries = (window.__tries || 0) + 1; if (r.onerror) r.onerror(new Event('error')); }, 0); return r; }; }, /^The painting could not be saved in this browser\. It stays for this visit only\.$/, false],
      ['every write refused as the storage is full', () => { IDBObjectStore.prototype.put = function () { window.__tries = (window.__tries || 0) + 1; throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; }, /^The painting could not be saved: browser storage is full\. It stays for this visit only\.$/, true],
      ['the database left at version 2 without the Studio\'s store', 'v2', /^The painting could not be saved in this browser\. It stays for this visit only\.$/, false],
    ];
    for (const [label, init, said, dbAnswers] of SCEN) {
      const L = `gap: ${label}`;
      const page = await openPage(site);
      if (init === 'v2') {
        await page.evaluate(async () => {
          await new Promise((r) => { const q = indexedDB.deleteDatabase('portrait-value-studio'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
          await new Promise((res, rej) => { const r = indexedDB.open('portrait-value-studio', 2); r.onupgradeneeded = () => r.result.createObjectStore('elsewhere'); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = () => rej(r.error); });
        });
        await page.addInitScript(countOpenErrors);
      } else await page.addInitScript(init);
      await page.reload({ waitUntil: 'load' }); await sleep(300);
      await watchToasts(page);
      await tab(page, 'paint'); await studioReady(page);
      const opened = await toasts(page);
      const tries0 = await page.evaluate(() => window.__tries || 0);
      await stroke(page, '#ps-paper', PATH);
      const ink1 = await alphaInk(page, '#ps-paper');
      const first = await toastMatch(page, said, 5000);
      await stroke(page, '#ps-paper', [[0.3, 0.6], [0.7, 0.7]]);
      const ink2 = await alphaInk(page, '#ps-paper');
      // the second stroke's save is tried (and fails) before the messages are counted
      if (label !== 'IndexedDB absent') await page.waitForFunction((n) => (window.__tries || 0) >= n, tries0 + 2, { timeout: 6000 }).catch(() => null);
      const all = await toasts(page);
      const notKept = all.filter((m) => /visit only/.test(m));
      t.check(!!first && notKept.length === 1, `${L}: the first stroke says the painting stays for this visit only, once in two strokes`, all);
      t.check(!all.some((m) => /back from last time/.test(m)), `${L}: no welcome back`, all);
      if (dbAnswers) t.note(`${label}: the database answered when the Studio opened, so the one-time note ("saved in this browser as you go") showed (${opened.some((m) => /saved in this browser/.test(m))}) and its flag was spent; the first save then said storage is full. The page cannot know the storage is full before it writes.`);
      else t.check(!opened.some((m) => /saved in this browser/.test(m)) && (await storageGet(page, NOTICE)) === null, `${L}: no one-time note that the painting is kept, and its flag is not spent`, { opened, flag: await storageGet(page, NOTICE) });
      t.check(ink1 > 50 && ink2 > ink1, `${L}: both strokes land`, { ink1, ink2 });
      await clean(t, page, L);
      await page.context().close();
    }
  });

  // ---- gap (high): Undo, Clear and the underdrawing's Undo are saved like strokes: leave and come back, and the
  // painting is the undone or cleared one; gap (medium): the page going hidden or away saves at once;
  // gap (low): the wash paint comes back after a reload
  await guard(t, 'gap: Undo and Clear, then leave', async () => {
    const page = await openPage(site, { url: '#paint' });
    await studioReady(page);
    const back = async () => { await page.reload({ waitUntil: 'load' }); await studioReady(page); };
    await stroke(page, '#ps-paper', PATH);
    const one = await alphaInk(page, '#ps-paper');
    await stroke(page, '#ps-paper', [[0.2, 0.7], [0.8, 0.8]]);
    const two = await alphaInk(page, '#ps-paper');
    let since = Date.now(); await click(page, '#ps-undo');
    const undone = await alphaInk(page, '#ps-paper');
    let rec = await waitSaved(page, since);
    await back();
    { const now = await alphaInk(page, '#ps-paper'); t.check(two > one && undone === one && !!rec && now === one, 'gap: Undo, then leave: the next visit finds the painting as it was undone, without the undone stroke', { one, two, undone, saved: !!rec, now }); }
    // Clear, twice, then leave
    since = Date.now(); await click(page, '#ps-clear'); await click(page, '#ps-clear');
    rec = await waitSaved(page, since);
    await back();
    { const now = await alphaInk(page, '#ps-paper'); t.check(!!rec && now === 0, 'gap: Clear twice, then leave: the next visit finds the cleared paper', { saved: !!rec, now }); }
    // the underdrawing cleared, Undo, then leave
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="sketch"]');
    await stroke(page, '#ps-paper', [[0.2, 0.2], [0.6, 0.3]]);
    const s1 = await alphaInk(page, '#ps-sketch');
    await click(page, '#ps-sketchClear');
    since = Date.now(); await click(page, '#ps-undo');
    rec = await waitSaved(page, since);
    // and a wash of a paint other than the one first offered, at 45%
    const sinceWash = Date.now();
    await click(page, '#ps-canvasBtn'); await click(page, '#ps-root [data-ground="wash"]');
    const washBtns = await page.evaluate(() => [...document.querySelectorAll('#ps-washRow button')].map((b) => ({ name: b.title, on: b.getAttribute('aria-pressed') === 'true' })));
    const other = washBtns.findIndex((b) => !b.on);
    await click(page, `#ps-washRow button:nth-child(${other + 1})`); await setRange(page, 'ps-washStr', 45);
    const washWas = { name: (await canvasSheet(page)).washName, px: await pixel(page, '#ps-ground', 450, 600) };
    rec = await waitSaved(page, sinceWash);
    await back();
    { const now = await alphaInk(page, '#ps-sketch'); t.check(s1 > 10 && !!rec && now === s1, 'gap: the underdrawing cleared and brought back by Undo, then leave: the next visit has the underdrawing', { s1, now }); }
    { const c = await canvasSheet(page); const px = await pixel(page, '#ps-ground', 450, 600); t.check(c.ground[0] === 'wash' && c.washName === washWas.name && c.washName === washBtns[other].name && c.washOut === '45%' && px.slice(0, 3).every((v, i) => Math.abs(v - washWas.px[i]) <= 1), 'gap: a wash of the paint chosen, at 45%, comes back after a reload as it was', { before: washWas, after: { name: c.washName, out: c.washOut, px } }); }
    // the wash paint follows a palette chosen afterwards: one of the new palette's paints, the ground repainted
    await click(page, '#ps-colorBtn');
    { const cur = await page.evaluate(() => document.getElementById('ps-palette').value); await page.selectOption('#ps-palette', cur === 'primary' ? 'zorn' : 'primary'); }
    { const after = await page.evaluate(() => ({ name: document.getElementById('ps-washName').textContent, paints: [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.title), offered: document.querySelectorAll('#ps-washRow button').length })); const px = await pixel(page, '#ps-ground', 450, 600); t.check(after.paints.includes(after.name) && after.offered === after.paints.length && px.slice(0, 3).some((v, i) => Math.abs(v - washWas.px[i]) > 1), 'gap: after another palette is chosen the wash is one of its paints and the ground is repainted with it', { after, px, was: washWas }); }
    // the page going hidden (a phone switching apps) saves the last stroke at once, without waiting for the delay
    await stroke(page, '#ps-paper', [[0.6, 0.2], [0.8, 0.4]]);
    let win = await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); const a = Date.now(); document.dispatchEvent(new Event('visibilitychange')); const b = Date.now(); delete document.visibilityState; return [a, b]; });
    rec = await waitSaved(page, win[0] - 1, 4000);
    if (rec && rec.savedAt < win[0]) t.note('the page going hidden: the stroke\'s own delayed save came first (a slow machine), so the save on hiding could not be told apart');
    else t.check(!!rec && rec.savedAt >= win[0] && rec.savedAt <= win[1], 'gap: the page going hidden saves the last stroke at once (its record is taken during the event), not 0.8 s later', { win, savedAt: rec && rec.savedAt });
    // the page going away (pagehide) likewise
    await stroke(page, '#ps-paper', [[0.6, 0.6], [0.8, 0.9]]);
    const inkLast = await alphaInk(page, '#ps-paper');
    win = await page.evaluate(() => { const a = Date.now(); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); return [a, Date.now()]; });
    rec = await waitSaved(page, win[0] - 1, 4000);
    if (rec && rec.savedAt < win[0]) t.note('pagehide: the stroke\'s own delayed save came first (a slow machine)');
    else t.check(!!rec && rec.savedAt >= win[0] && rec.savedAt <= win[1], 'gap: pagehide saves the last stroke at once', { win, savedAt: rec && rec.savedAt });
    await back();
    t.check((await alphaInk(page, '#ps-paper')) === inkLast, 'gap: after those saves the next visit has the last stroke', { inkLast, now: await alphaInk(page, '#ps-paper') });
    await clean(t, page, 'gap: Undo and Clear saved, saves on hiding');
    await page.context().close();
  });

  // ---- gap (high): what the PNG holds: the underdrawing when shown and not when hidden, the paint in its color, the
  // gray ground; and inside another site's frame the save dialog, with Ctrl+Z behind it
  await guard(t, 'gap: what Save as PNG holds', async () => {
    const page = await openPage(site, { url: '#paint' });
    await studioReady(page);
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="sketch"]'); await click(page, '#ps-root [data-shard="soft"]');
    await stroke(page, '#ps-paper', [[0.1, 0.1], [0.45, 0.16]], { steps: 12 });
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="chisel"]'); await click(page, '#ps-root [data-chisel="l"]');
    await stroke(page, '#ps-paper', [[0.5, 0.78], [0.9, 0.84]], { steps: 12 });
    const spot = [0.7, 0.81];
    const want = await page.evaluate(([fx, fy]) => { const p = document.getElementById('ps-paper'), g = document.getElementById('ps-ground'); const x = Math.round(p.width * fx), y = Math.round(p.height * fy); const a = [...p.getContext('2d').getImageData(x, y, 1, 1).data], b = [...g.getContext('2d').getImageData(x, y, 1, 1).data]; return { paint: a, ground: b, over: [0, 1, 2].map((i) => Math.round(a[i] * a[3] / 255 + b[i] * (1 - a[3] / 255))) }; }, spot);
    const BOXES = [[0.08, 0.07, 0.4, 0.12], [0.48, 0.74, 0.45, 0.14]];
    const r1 = await savePngRead(page, { boxes: BOXES, points: [spot] });
    t.check(!!r1 && r1.marks[0] > 50 && r1.marks[1] > 500 && want.paint[3] > 200 && r1.px[0].slice(0, 3).every((v, i) => Math.abs(v - want.over[i]) <= 3), 'gap: Save as PNG holds the underdrawing where it was drawn, and the paint in its own color over the ground', { r1, want });
    await click(page, '#ps-root [data-sketch-show="0"]');
    const r2 = await savePngRead(page, { boxes: BOXES });
    t.check(!!r2 && r2.marks[0] === 0 && r2.marks[1] > 500, 'gap: with the underdrawing hidden the PNG leaves it out and keeps the paint', r2);
    await click(page, '#ps-root [data-ground="gray"]');
    const r3 = await savePngRead(page, { points: [[0.005, 0.005], [0.02, 0.5], [0.98, 0.98]] });
    t.check(!!r3 && r3.px.every((p) => p[0] === 140 && p[1] === 138 && p[2] === 134 && p[3] === 255), 'gap: on the gray ground the PNG\'s bare canvas is the mid gray (140, 138, 134)', r3 && r3.px);
    await clean(t, page, 'gap: what the PNG holds');
    await page.context().close();

    // inside another site's sandboxed frame the download may be blocked without a word: the picture opens in the dialog too
    const outer = await openPage(site, { sandbox: {}, url: 'index.html#paint' });
    const fr = outer.app;
    await fr.waitForFunction(() => window.PaintStudio && document.body.classList.contains('tab-paint'), null, { timeout: 15000 }).catch(() => null);
    await fr.evaluate(() => PaintStudio.ready());
    await stroke(outer, '#ps-paper', PATH, { frame: fr });
    const before = await alphaInk(fr, '#ps-paper');
    await fr.evaluate(() => document.getElementById('ps-save').click());
    await fr.waitForFunction(() => { const d = document.getElementById('saveDialog'), i = document.getElementById('saveImg'); return d.open && i.src.startsWith('blob:') && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => null);
    const dlg = await fr.evaluate(() => { const i = document.getElementById('saveImg'); return { open: document.getElementById('saveDialog').open, src: i.src.slice(0, 5), name: document.getElementById('saveName').textContent, w: i.naturalWidth, h: i.naturalHeight, focus: document.activeElement && document.activeElement.id }; });
    t.check(dlg.open && dlg.src === 'blob:' && dlg.name === 'painting.png' && dlg.w === 900 && dlg.h === 1200, 'gap: inside another site\'s frame the Studio\'s Save as PNG also opens the picture in the save dialog, named painting.png', dlg);
    await outer.keyboard.press('Control+z');
    const after = await alphaInk(fr, '#ps-paper');
    const kept = before > 50 && after === before;
    t.check(kept, 'gap: Ctrl+Z while the save dialog is open leaves the painting behind it alone (the dialog is modal)', { before, after, focus: dlg.focus });
    if (!kept) t.finding({ title: 'Ctrl+Z pressed while the Studio\'s save dialog is open undoes the last stroke behind the modal dialog', severity: 'medium', steps: 'Open the site inside another site\'s sandboxed frame (an artifact viewer; here <iframe sandbox="allow-scripts allow-modals">), Studio tab, paint a stroke, Canvas icon, Save as PNG: the save-by-hand dialog opens over the page. Press Ctrl+Z (⌘+Z) before closing it.', expected: 'Nothing behind the modal dialog changes, as on the Study tab (app.js: "the save dialog is modal: Esc only closes it, and nothing behind it should change").', actual: `The stroke behind the dialog is undone (paper ink ${before} → ${after}), with no way to redo it; the dialog still shows the picture with the stroke.`, cause: 'js/painting.js:534-540, the Studio\'s keydown listener undoes on Ctrl/⌘+Z whenever the Studio is active and the focus is not in a field; it has no check of #saveDialog.open like js/app.js:2165 has' });
    await outer.keyboard.press('Escape');
    await fr.waitForFunction(() => !document.getElementById('saveDialog').open, null, { timeout: 3000 }).catch(() => null);
    t.check(!(await fr.evaluate(() => document.getElementById('saveDialog').open)), 'gap: Escape closes the save dialog');
    await clean(t, outer, 'gap: Save as PNG in a sandboxed frame');
    await outer.context().close();
  });

  // ---- gap (medium): a stroke and a ground change made before the saved painting is back (restore() still running)
  await guard(t, 'gap: changes while the saved painting is restored', async () => {
    const page = await openPage(site, { url: '#paint' });
    await studioReady(page);
    const RED = { w: 900, h: 1200, paper: { __blob: 'png' }, canvas: { ground: 'raw', weave: 'off', washStr: 0.3 }, sketchShown: true };
    const red = () => inkIn(page, '#ps-paper', 0.12, 0.09, 0.3, 0.22); // the record's red square (100..400 px of 900 × 1200)
    const early = () => inkIn(page, '#ps-paper', 0.55, 0.55, 0.3, 0.3);
    await putRecord(page, RED);
    // as fast as a visitor can paint once the page has loaded
    await page.reload({ waitUntil: 'load' });
    const fast = { restoredAtLoad: await restoreDone(page) };
    const since = Date.now();
    await stroke(page, '#ps-paper', [[0.6, 0.6], [0.8, 0.8]]); await studioReady(page);
    Object.assign(fast, { red: await red(), early: await early() });
    t.check(fast.red > 1000 && fast.early > 50, 'gap: a stroke made as soon as the page has loaded lands on the saved painting, which stays', fast);
    await waitSaved(page, since);
    // with the database slow to open (3 s here, once: slower than the 0.8 s autosave delay plus the moment it takes to
    // start painting, as a phone waking its storage can be): a stroke and a ground change made while the saved painting
    // is still on its way
    await putRecord(page, RED);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('slowOnce')) return;
      sessionStorage.setItem('slowOnce', '1');
      const open = IDBFactory.prototype.open; let first = true;
      IDBFactory.prototype.open = function (...a) {
        const r = open.apply(this, a);
        if (!first) return r;
        first = false; let h = null;
        Object.defineProperty(r, 'onsuccess', { configurable: true, get: () => h, set: (f) => { h = f; } });
        r.addEventListener('success', (e) => setTimeout(() => h && h.call(r, e), 3000));
        return r;
      };
    });
    await page.reload({ waitUntil: 'load' });
    const slow = { pending: !(await restoreDone(page)) };
    await stroke(page, '#ps-paper', [[0.6, 0.6], [0.8, 0.8]]);
    await click(page, '#ps-root [data-ground="gray"]');
    await studioReady(page);
    Object.assign(slow, { toast: await text(page, '#toast'), red: await red(), early: await early(), ground: (await canvasSheet(page)).ground[0] });
    await page.reload({ waitUntil: 'load' }); await studioReady(page);
    slow.redNextVisit = await red();
    if (!slow.pending) t.note('the slow database did not hold the restore back; the check below is not meaningful this run');
    const kept = slow.red > 1000 && slow.redNextVisit > 1000;
    t.check(kept, 'gap: with a slow database, a stroke made while the saved painting is still being restored does not replace the saved painting', slow);
    if (!kept) t.finding({ title: 'A stroke made while the saved painting is still loading overwrites it: the painting is lost, and the Studio says "Your painting is back from last time" over the new stroke alone', severity: 'high', steps: 'Have a painting saved (paint, wait a second). Reload on a device where opening IndexedDB is slower than the 0.8 s autosave delay (simulated here: the first indexedDB.open request\'s success delayed by 3 s with an init script). As the Studio appears, paint a stroke at once. Wait, then reload again.', expected: 'The saved painting comes back (with the new stroke on it, or the stroke refused until it is back), and the record is never replaced by an unrestored paper.', actual: `The saved painting is gone (its red square: ${slow.red} inked pixels after the restore, ${slow.redNextVisit} on the next visit), the paper holds only the early stroke (${slow.early}), and the toast says "${slow.toast}". The early stroke's autosave (800 ms) wrote the blank paper plus the stroke before restore() read the record, so restore() brought back that.`, cause: 'js/painting.js:349-361 and 457-482: pointerdown and saveSoon()/saveNow() do not wait for restore() (line 485, the `ready` promise at 875); a save that lands before restore() reads the record (lines 488-498) replaces it' });
    t.note(`a change made before the restore: the early stroke ${slow.early > 50 ? 'is on the paper' : 'is gone'} after it; the ground clicked to gray ${slow.ground === 'gray' ? 'stays gray' : `is reset to the saved "${slow.ground}"`}`);
    await clean(t, page, 'gap: changes while the painting is restored');
    await page.context().close();
  });

  // ---- gap (medium): Ctrl/⌘+Z undoes in the area in front only: a Study line and a Studio stroke; then gap (medium):
  // Copy the Study lines with a 4 × 4 grid, measures and a plumb line, in a soft charcoal, on a turned paper, and Undo;
  // gap (medium): Values and Blocks are the Study tab's own pictures, and follow its settings; gap (medium): a photo
  // dropped or pasted, and text dropped, while the Studio is open
  await guard(t, 'gap: the Study tab and the Studio side by side', async () => {
    const page = await openPage(site);
    await click(page, '#gridBtn'); await click(page, '.tool-btn[data-tool="line"]');
    await stroke(page, '#cv-orig', [[0.2, 0.2], [0.8, 0.6]]);
    const m0 = await markCount(page);
    await tab(page, 'paint'); await studioReady(page);
    await stroke(page, '#ps-paper', PATH);
    const k1 = await alphaInk(page, '#ps-paper');
    await page.keyboard.press('Control+z');
    { const a = { paper: await alphaInk(page, '#ps-paper'), marks: await markCount(page) }; t.check(m0 === 5 && k1 > 50 && a.paper === 0 && a.marks === 5, 'gap: Ctrl+Z in the Studio undoes its stroke and leaves the Study tab\'s line alone', { m0, k1, ...a }); }
    await stroke(page, '#ps-paper', PATH);
    const k2 = await alphaInk(page, '#ps-paper');
    await tab(page, 'study'); await page.keyboard.press('Control+z');
    const m1 = await markCount(page);
    await tab(page, 'paint');
    t.check(m1 === 4 && (await alphaInk(page, '#ps-paper')) === k2, 'gap: Ctrl+Z on the Study tab takes back its line and leaves the Studio\'s stroke alone', { m1, k2, paper: await alphaInk(page, '#ps-paper') });
    await click(page, '#ps-colorBtn'); await page.focus('#ps-palette'); await page.keyboard.press('Control+z');
    { const p = await alphaInk(page, '#ps-paper'); t.note(`Ctrl+Z with the Paints sheet's palette list focused ${p === k2 ? 'does not undo (the Studio treats a select as typing; the README says only "Ctrl/⌘+Z")' : 'undoes the last stroke'}`); }
    await page.keyboard.press('Escape');
    await clean(t, page, 'gap: Ctrl+Z on each tab');

    // the Study tab gets a 4 × 4 grid, two measures and a plumb line
    await tab(page, 'study');
    await click(page, '#gridBtn');
    await click(page, '.tool-btn[data-tool="measure"]');
    await stroke(page, '#cv-orig', [[0.1, 0.9], [0.4, 0.95]]); await stroke(page, '#cv-orig', [[0.55, 0.86], [0.9, 0.9]]);
    await click(page, '.tool-btn[data-tool="plumb"]');
    { const b = await page.locator('#cv-orig').boundingBox(); await page.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.38); }
    await click(page, '.tool-btn[data-tool="plumb"]');
    const segs = await page.evaluate(() => Studio.marks());
    const grid = [0.25, 0.5, 0.75], isGrid = (v) => grid.some((g) => Math.abs(v - g) < 1e-9);
    const plumb = segs.find((q) => q[0] === q[2] && q[1] === 0 && q[3] === 1 && !isGrid(q[0]));
    const level = segs.find((q) => q[1] === q[3] && q[0] === 0 && q[2] === 1 && !isGrid(q[1]));
    const measures = segs.filter((q) => !(q[0] === q[2] && q[1] === 0 && q[3] === 1) && !(q[1] === q[3] && q[0] === 0 && q[2] === 1));
    t.check(segs.length === 10 && !!plumb && !!level && measures.length === 2, 'gap: the Study tab holds a 4 × 4 grid, two measures and a plumb line with its level', segs);
    await tab(page, 'paint');
    // what Copy the Study lines left on the underdrawing, where the marks are: bands down the grid and plumb lines,
    // across the level, around each measure's middle, and the ink's own bounding box on the paper
    const copyRead = () => page.evaluate(([plumb, level, measures]) => {
      const prep = Studio.prep(), c = document.getElementById('ps-sketch'), W = c.width, H = c.height;
      const k = Math.min(W / prep.w, H / prep.h), w = prep.w * k, h = prep.h * k, ox = (W - w) / 2, oy = (H - h) / 2;
      const d = c.getContext('2d').getImageData(0, 0, W, H).data, a = (x, y) => d[(y * W + x) * 4 + 3] > 8;
      const vband = (fx) => { const x = Math.round(ox + fx * w); let n = 0; for (let y = Math.round(oy); y < oy + h; y++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && x + dx < W && a(x + dx, y)) n++; return +(n / h).toFixed(2); };
      const hband = (fy) => { const y = Math.round(oy + fy * h); let n = 0; for (let x = Math.round(ox); x < ox + w; x++) for (let dy = -2; dy <= 2; dy++) if (y + dy >= 0 && y + dy < H && a(x, y + dy)) n++; return +(n / w).toFixed(2); };
      const near = (fx, fy) => { const x0 = Math.round(ox + fx * w), y0 = Math.round(oy + fy * h); let n = 0; for (let y = y0 - 4; y <= y0 + 4; y++) for (let x = x0 - 4; x <= x0 + 4; x++) if (x >= 0 && y >= 0 && x < W && y < H && a(x, y)) n++; return n; };
      let ink = 0, L = W, R = -1, T = H, B = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a(x, y)) { ink++; if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y; }
      return { W, H, aspect: +(prep.w / prep.h).toFixed(3), ink, quarters: [0.25, 0.5, 0.75].map(vband), eighths: [0.125, 0.375].map(vband), across: [0.25, 0.75].map(hband), plumb: vband(plumb[0]), level: hband(level[1]), measures: measures.map((q) => near((q[0] + q[2]) / 2, (q[1] + q[3]) / 2)), box: { L, R: W - 1 - R, T, B: H - 1 - B, w: R - L + 1, h: B - T + 1 } };
    }, [plumb, level, measures]);
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="sketch"]');
    await click(page, '#ps-sketchClear');
    await click(page, '#ps-sketchFromStudy');
    const hb = await copyRead();
    t.check(hb.quarters.every((v) => v > 1) && hb.across.every((v) => v > 1) && hb.eighths.every((v) => v < hb.quarters[0] / 5), 'gap: Copy the Study lines draws the 4 × 4 grid at the quarters and nothing at the eighths', hb);
    t.check(hb.plumb > 1 && hb.level > 1 && hb.measures.every((n) => n > 5), 'gap: Copy the Study lines draws the plumb line, its level and both measures', hb);
    await click(page, '#ps-undo');
    t.check((await alphaInk(page, '#ps-sketch')) === 0, 'gap: Undo after Copy the Study lines takes back just the copy', await alphaInk(page, '#ps-sketch'));
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-slead="charcoal"]'); await click(page, '#ps-root [data-shard="soft"]'); await setRange(page, 'ps-sketchSize', 30);
    await click(page, '#ps-sketchFromStudy');
    const soft = await copyRead();
    t.check(soft.ink > hb.ink * 3 && hb.ink > 100, 'gap: the copy is drawn with the underdrawing\'s lead, hardness and size: soft charcoal 30 px lays far more than HB 3 px', { soft: soft.ink, hb: hb.ink });
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-slead="graphite"]'); await click(page, '#ps-root [data-shard="medium"]'); await setRange(page, 'ps-sketchSize', 3);
    // on the turned paper the lines are fitted as the reference would be: as large as fits, centred
    await click(page, '#ps-orient'); await click(page, '#ps-sketchClear'); await click(page, '#ps-sketchFromStudy');
    const land = await copyRead();
    const b = land.box, fitsTall = land.aspect < land.W / land.H;
    const centred = fitsTall ? Math.abs(b.L - b.R) <= 10 && b.T <= 6 && b.B <= 6 : Math.abs(b.T - b.B) <= 10 && b.L <= 6 && b.R <= 6;
    t.check(land.W === 1200 && centred && Math.abs(b.w / b.h - land.aspect) < 0.03, 'gap: on the turned paper the Study lines are fitted as large as fits and centred', land);
    await click(page, '#ps-orient');
    await clean(t, page, 'gap: Copy the Study lines, every kind of mark');

    // Values and Blocks are the Study tab's own pictures, and follow a change made there
    await click(page, '#ps-refBtn'); await click(page, '#ps-refSheet [data-ref-view="values"]');
    const v = await refSameAs(page, 'valueImage');
    t.check(v.diff === 0, 'gap: Values is the Study tab\'s own three-value study, pixel for pixel', v);
    await click(page, '#ps-refSheet [data-ref-view="blocks"]');
    const bl = await refSameAs(page, 'blockImage'), d3 = (await refInfo(page)).distinct;
    t.check(bl.diff === 0, 'gap: Blocks is the Study tab\'s own color-block study, pixel for pixel', bl);
    await tab(page, 'study');
    await page.evaluate(() => { window.__r0 = Studio.result(); });
    await setRange(page, 'colors', 1); await restudied(page);
    await tab(page, 'paint');
    { const bl1 = await refSameAs(page, 'blockImage'), d1 = (await refInfo(page)).distinct; t.check(bl1.diff === 0 && d1 < d3, 'gap: one color per value set on the Study tab: Blocks shows that study, with fewer colors', { bl1, before: d3, after: d1 }); }
    await tab(page, 'study'); await click(page, '[data-block-view="palette"]');
    await tab(page, 'paint');
    { const same = await refSameAs(page, 'blockImage'); t.note(`with the Study tab's block view set to the palette's mixes, the Studio's Blocks ${same.diff === 0 ? 'still shows the photo\'s color blocks (Studio.result().blockImage), not the palette view' : 'differs from the photo\'s color blocks'}`); }
    await tab(page, 'study'); await click(page, '[data-block-view="photo"]'); await setRange(page, 'colors', 3);
    await tab(page, 'paint');
    await clean(t, page, 'gap: Values and Blocks as the Study tab makes them');

    // a photo dropped on the paper: the Study tab takes it, the Studio stays open and the reference follows it
    const dropped = await makeImage(page, { width: 500, height: 700, name: 'drop.png' });
    await dropFiles(page, '#ps-paper', [dropped]);
    await photoArrived(page, 'drop.png', 500 / 700);
    let r = await refInfo(page);
    t.check(r.tab === 'paint' && r.kind === 'studio' && /Study tab/.test(r.name) && Math.abs(r.w / r.h - 5 / 7) < 0.02 && /drop\.png/.test(r.source), 'gap: a photo dropped on the Studio goes to the Study tab and the reference follows it, the Studio staying open', r);
    // a photo pasted while a dealt portrait is the reference: the pasted photo becomes the reference
    await click(page, '#ps-refSheet [data-ref-kind="painting"]');
    await page.waitForFunction(() => /after /.test(document.getElementById('ps-refName').textContent), null, { timeout: 10000 }).catch(() => null);
    await pasteNow(page, await makeImage(page, { width: 700, height: 500, name: 'paste.png' }));
    await photoArrived(page, 'paste.png', 700 / 500);
    r = await refInfo(page);
    t.check(r.tab === 'paint' && r.kind === 'studio' && r.anotherHidden && Math.abs(r.w / r.h - 1.4) < 0.02 && /paste\.png/.test(r.source), 'gap: a photo pasted while a dealt portrait is the reference makes the pasted photo the reference', r);
    // text dropped on the paper is refused with a word over the studio, and a dealt portrait stays the reference
    await click(page, '#ps-refSheet [data-ref-kind="painting"]');
    await page.waitForFunction(() => /after /.test(document.getElementById('ps-refName').textContent), null, { timeout: 10000 }).catch(() => null);
    const dealt = await refInfo(page);
    await armToast(page); await dropText(page, '#ps-paper', 'hello');
    const said = await toastMatch(page, /text, not a picture/, 3000);
    r = await refInfo(page);
    t.check(!!said && (await page.evaluate(() => document.getElementById('toast').classList.contains('show'))) && r.tab === 'paint' && r.kind === 'painting' && r.name === dealt.name && !r.anotherHidden, 'gap: text dropped on the Studio is refused with a word over it, and the dealt portrait stays the reference', { said, r });
    await clean(t, page, 'gap: a photo dropped or pasted on the Studio');
    await page.context().close();
  });

  // ---- gap (medium): the reference dragged to a corner, then the window gets smaller (or the phone turns); and gap
  // (medium): a resize mid-session at 4× with a pan: the paper re-fits, the strokes stay, a stroke lands under the pointer
  await guard(t, 'gap: the window changes size', async () => {
    const page = await openPage(site, { url: '#paint' });
    await studioReady(page);
    const resized = async (vp) => { const w0 = (await box(page, '#ps-stage')).w; await page.setViewportSize(vp); await page.waitForFunction((w) => Math.abs(document.getElementById('ps-stage').getBoundingClientRect().width - w) > 20, w0, { timeout: 5000 }).catch(() => null); await sleep(200); };
    const dragFar = async () => { const fb = await box(page, '#ps-refFig .ps-frame'); await page.mouse.move(fb.x + fb.w / 2, fb.y + fb.h / 2); await page.mouse.down(); await page.mouse.move(fb.x + fb.w / 2 + 1500, fb.y + fb.h / 2 + 1500, { steps: 6 }); await page.mouse.up(); };
    await dragFar();
    const big = { fig: await box(page, '#ps-refFig'), st: await box(page, '#ps-stage') };
    await resized({ width: 800, height: 600 });
    const small = { fig: await box(page, '#ps-refFig'), st: await box(page, '#ps-stage') };
    const okSmall = inside(small.fig, small.st);
    t.check(inside(big.fig, big.st) && okSmall, 'gap: a reference dragged to the bottom-right corner stays on the stage when the window gets smaller (1400 × 900 to 800 × 600)', { big, small });
    await click(page, '#ps-refBtn'); await click(page, '#ps-refSheet [data-ref-show="0"]'); await click(page, '#ps-refSheet [data-ref-show="1"]'); await click(page, '#ps-refBtn');
    const reshown = { fig: await box(page, '#ps-refFig'), st: await box(page, '#ps-stage') };
    // a phone held upright, the reference dragged to its corner, then turned on its side
    await resized(PHONE); await dragFar();
    await resized({ width: 844, height: 390 });
    const turned = { fig: await box(page, '#ps-refFig'), st: await box(page, '#ps-stage') };
    const okTurned = inside(turned.fig, turned.st);
    t.check(okTurned, 'gap: a reference dragged to the corner of an upright phone stays on the stage when the phone is turned (390 × 844 to 844 × 390)', turned);
    if (!okSmall || !okTurned) t.finding({ title: 'A reference dragged to a corner is left off the stage when the window gets smaller or a phone is turned, and nothing brings it back', severity: 'medium', steps: 'Studio tab at 1400 × 900: drag the floating reference to the bottom-right corner. Make the window 800 × 600 (or: on a 390 × 844 phone drag it to the bottom-right, then turn the phone to 844 × 390). Then Reference icon, Hidden, Shown.', expected: 'The reference stays inside the stage (its position clamped again on a resize, as it is during a drag), so it can still be seen and dragged.', actual: `At 800 × 600 the reference is drawn at ${Math.round(small.fig.x)}, ${Math.round(small.fig.y)} to ${Math.round(small.fig.r)}, ${Math.round(small.fig.b)} while the stage ends at ${Math.round(small.st.r)}, ${Math.round(small.st.b)}: ${overlap(small.fig, small.st) ? 'partly' : 'entirely'} outside it, where the stage clips it. Hidden then Shown leaves it there (${Math.round(reshown.fig.y)} to ${Math.round(reshown.fig.b)} against a stage ending at ${Math.round(reshown.st.b)}). On the turned phone it is at ${Math.round(turned.fig.x)}, ${Math.round(turned.fig.y)} to ${Math.round(turned.fig.r)}, ${Math.round(turned.fig.b)} on a stage of ${Math.round(turned.st.r)} × ${Math.round(turned.st.b)}. Only a reload resets it.`, cause: 'js/painting.js:650-656 clamps ref.x/ref.y only while dragging; layout() (152-156) and sizeReference() (605-616) never clamp the translate again when the stage shrinks' });

    // mid-session: a painting at 4× panned to its bottom-right corner, the window turned to a phone and back
    await resized(DESKTOP);
    await click(page, '#ps-fitBtn');
    await stroke(page, '#ps-paper', PATH);
    const ink = await alphaInk(page, '#ps-paper');
    await click(page, '#ps-viewBtn'); await setRange(page, 'ps-zoom', 400); await setRange(page, 'ps-panX', 100); await setRange(page, 'ps-panY', 100); await click(page, '#ps-viewBtn');
    const corner = (wb, st) => wb.r <= st.r + 1 && wb.r >= st.r - 100 && wb.b <= st.b + 1 && wb.b >= st.b - 100;
    for (const vp of [PHONE, { width: 844, height: 390 }, DESKTOP]) {
      await resized(vp);
      const s = { wrap: await box(page, '#ps-paperWrap'), st: await box(page, '#ps-stage'), ink: await alphaInk(page, '#ps-paper'), zoom: await text(page, '#ps-zoomOut') };
      t.check(s.ink === ink && s.zoom === '400%' && corner(s.wrap, s.st), `gap: resized to ${vp.width} × ${vp.height} at 4× panned to the bottom-right: the painting is intact and that corner is still on screen`, s);
    }
    // the reference dragged to that corner is kept on the stage through the resizes, over the paper's corner: hidden
    // first, so the stroke reaches the paper
    await click(page, '#ps-refBtn'); await click(page, '#ps-refSheet [data-ref-show="0"]'); await click(page, '#ps-refBtn');
    const before = await inkIn(page, '#ps-paper', 0.88, 0.88, 0.12, 0.12);
    await stroke(page, '#ps-paper', [[0.92, 0.92], [0.97, 0.95]]);
    t.check((await inkIn(page, '#ps-paper', 0.88, 0.88, 0.12, 0.12)) > before + 50, 'gap: after the resizes a stroke at 4× lands under the pointer', { before, after: await inkIn(page, '#ps-paper', 0.88, 0.88, 0.12, 0.12) });
    await click(page, '#ps-fitBtn');
    t.check(inside(await box(page, '#ps-paperWrap'), await box(page, '#ps-stage')), 'gap: Fit to screen after the resizes puts the whole paper on the stage', { wrap: await box(page, '#ps-paperWrap'), st: await box(page, '#ps-stage') });
    await clean(t, page, 'gap: the window changes size');
    await page.context().close();
  });

  // ---- gap (medium): the Studio's palette in Simple and on the switch to Advanced; gap (medium): a palette chosen in
  // the Studio stops following the Study tab, one picked there before that is followed, and a mix in the well meanwhile
  await guard(t, 'gap: the Studio palette in Simple and Advanced', async () => {
    const page = await openPage(site, { storage: { 'portrait-value-studio.mode': 'simple', 'portrait-value-studio.myPaints': ['TW', 'YO', 'CRL', 'IB', 'UB'] } });
    await tab(page, 'paint'); await studioReady(page);
    await click(page, '#ps-colorBtn');
    const pal = () => page.evaluate(() => { const s = document.getElementById('ps-palette'); const cur = StudioPalette.current(); return { value: s.value, name: (s.options[s.selectedIndex] || {}).textContent, ids: [...s.options].map((o) => o.value), study: cur && cur.name, well: document.getElementById('ps-wellParts').textContent, paints: [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code) }; });
    const simple = await pal();
    t.check(!!simple.study && simple.name === simple.study && ['Zorn', 'Three primaries', 'Rembrandt (earths)'].includes(simple.study), 'gap: in Simple the Studio\'s palette follows the Study tab\'s, the best of its three', simple);
    t.note(`in Simple the Studio's palette list offers ${simple.ids.length} (${simple.ids.join(', ')}), My paints among them, where the Study tab offers three and hides My paints; the README's Simple paragraph speaks of the Study tab only`);
    await click(page, `#ps-paints .ps-paint[data-code="${simple.paints[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${simple.paints[1]}"]`);
    const wellSimple = (await pal()).well;
    await page.evaluate(() => { window.__r0 = Studio.result(); });
    await click(page, '[data-mode="advanced"]'); await restudied(page);
    const adv = await pal();
    t.check(adv.name === adv.study, 'gap: switched to Advanced, the Studio\'s palette still follows the Study tab\'s (now the best of ten)', adv);
    t.note(`Simple → Advanced with the Studio open: its palette went from "${simple.name}" to "${adv.name}", and the well holding "${wellSimple}" ${/^Empty/.test(adv.well) ? 'was emptied without a word' : `still holds "${adv.well}"`} (the README says the palette follows the Study tab's, and nothing of the well)`);
    await click(page, `#ps-paints .ps-paint[data-code="${adv.paints[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${adv.paints[1]}"]`);
    const wellAdv = (await pal()).well;
    const target = adv.study === 'Zorn' ? 'sorolla' : 'zorn';
    await tab(page, 'study'); await studyPalette(page, target);
    await tab(page, 'paint'); await click(page, '#ps-colorBtn');
    const followed = await pal();
    t.check(followed.value === target && followed.name === followed.study, `gap: a palette picked on the Study tab (${target}) is followed by the Studio until one is chosen there`, followed);
    t.note(`a palette picked on the Study tab while the Studio's well held "${wellAdv}": the well ${/^Empty/.test(followed.well) ? 'was emptied without a word' : 'kept it'}`);
    await page.selectOption('#ps-palette', 'monet');
    await tab(page, 'study'); await studyPalette(page, 'rembrandt');
    await tab(page, 'paint'); await click(page, '#ps-colorBtn');
    const held = await pal(), monet = await page.evaluate(() => Paints.PRESETS.find((x) => x.id === 'monet').paints.join());
    t.check(held.value === 'monet' && held.paints.join() === monet && held.study === 'Rembrandt (earths)', 'gap: a palette chosen in the Studio (Monet) stays, with its paints, when the Study tab then picks another (Rembrandt)', held);
    await clean(t, page, 'gap: the Studio palette in Simple and Advanced');
    await page.context().close();
  });

  // ---- gap (medium): the narrowest phone, a phone on its side and the 760 px line: the strip, the stage, the
  // status pill beside the reference, a stroke and the Paints sheet
  await guard(t, 'gap: narrow and short windows', async () => {
    const overlapped = [];
    for (const vp of [{ width: 320, height: 568 }, PHONE, { width: 844, height: 390 }, { width: 759, height: 700 }, { width: 760, height: 700 }]) {
      const L = `gap: ${vp.width} × ${vp.height}`;
      const page = await openPage(site, { viewport: vp, url: '#paint' });
      await studioReady(page);
      // the longest status there is (the charcoal pencil), beside the reference at its default size
      await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="pencil"]'); await click(page, '#ps-pencilOpts [data-lead="charcoal"]'); await click(page, '#ps-brushBtn');
      const lay = await page.evaluate(() => { const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }; const btns = [...document.querySelectorAll('#ps-root .ps-strip button')].filter((b) => getComputedStyle(b).display !== 'none').map(R); return { strip: R(document.querySelector('#ps-root .ps-strip')), stage: R(document.getElementById('ps-stage')), btns: btns.length, minW: Math.min(...btns.map((b) => b.w)), minH: Math.min(...btns.map((b) => b.h)), off: btns.filter((b) => b.x < 0 || b.y < 0 || b.r > innerWidth + 0.5 || b.b > innerHeight + 0.5).length, status: R(document.getElementById('ps-status')), statusText: document.getElementById('ps-status').textContent, fig: R(document.getElementById('ps-refFig')), exit: getComputedStyle(document.getElementById('ps-exit')).display, topbar: getComputedStyle(document.querySelector('.topbar')).display }; });
      const wide = vp.width >= 760, full = vp.width < 760 || vp.height < 560;
      t.check((await hscroll(page)) <= 0 && lay.off === 0 && lay.btns === (full ? 10 : 9) && lay.minW >= 24 && lay.minH >= 24, `${L}: every strip icon is on screen and at least 24 × 24 px, with no horizontal scroll`, lay);
      t.check(wide ? lay.strip.h > lay.strip.w && lay.strip.x < 100 : lay.strip.w > lay.strip.h && lay.strip.b >= vp.height - 2, `${L}: the strip runs ${wide ? 'down the left' : 'along the bottom'}`, lay.strip);
      t.check(lay.stage.h >= 240 && (full ? lay.exit !== 'none' && lay.topbar === 'none' : lay.exit === 'none' && lay.topbar !== 'none'), `${L}: the stage is at least 240 px tall, and ${full ? 'the header steps aside, the exit arrow in the strip' : 'the header stays, with no exit arrow'}`, lay);
      const clear = !overlap(lay.status, lay.fig);
      t.check(clear, `${L}: the status pill and the floating reference do not overlap`, { status: lay.status, fig: lay.fig, text: lay.statusText });
      if (!clear) { overlapped.push(`${vp.width} × ${vp.height}: pill ${Math.round(lay.status.x)}–${Math.round(lay.status.r)} × ${Math.round(lay.status.y)}–${Math.round(lay.status.b)}, reference ${Math.round(lay.fig.x)}–${Math.round(lay.fig.r)} × ${Math.round(lay.fig.y)}–${Math.round(lay.fig.b)}`); await screenshot(page, `studio-gap-status-${vp.width}x${vp.height}`); }
      const b = await alphaInk(page, '#ps-paper'); await stroke(page, '#ps-paper', PATH);
      t.check((await alphaInk(page, '#ps-paper')) > b, `${L}: a stroke lands`);
      await click(page, '#ps-colorBtn');
      t.check(inside(await box(page, '#ps-paintSheet'), await box(page, '#ps-stage')), `${L}: the Paints sheet fits the stage`, { sheet: await box(page, '#ps-paintSheet'), stage: await box(page, '#ps-stage') });
      await clean(t, page, L);
      await page.context().close();
    }
    if (overlapped.length) t.finding({ title: 'On a phone the reference\'s Original / Values / Blocks switch covers the status pill, cutting off the pencil\'s lead, hardness and size', severity: 'low', steps: 'Open index.html#paint on a 320 × 568 or 390 × 844 window. Brushes icon, Pencil, Charcoal (the status pill now reads "Pencil · black · Charcoal · Medium · 3 px · 900 × 1200"). Look at the top of the paper.', expected: 'The status pill is readable: it stops short of the reference or wraps under it.', actual: `The pill wraps across the stage and the reference (top right, above it in z-order) covers its right part: ${overlapped.join('; ')} (screenshots tests/screens/studio-gap-status-*.png).`, cause: 'styles.css:1404 (.ps-status: left 12px, top 12px, no max-width) and styles.css:1464 (.ps-ref: right 12px, top 12px, z-index 3): both sit on the top edge and nothing keeps them apart on a narrow stage' });
  });

  // ---- gap (medium): Forget my work, pressed in the same tab within the save delay of a stroke, a Turn and a ground
  // change: none of them comes back, and the one-time note is shown again
  await guard(t, 'gap: Forget right after changes', async () => {
    const page = await openPage(site, { url: '#paint' });
    await studioReady(page);
    await stroke(page, '#ps-paper', PATH); await click(page, '#ps-orient'); await click(page, '#ps-root [data-ground="gray"]');
    const t0 = Date.now();
    await tab(page, 'help', { wait: false });
    await click(page, '#forgetBtn');
    const within = Date.now() - t0;
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
    await tab(page, 'paint'); await studioReady(page);
    const note = await toastMatch(page, /saved in this browser/, 3000);
    const r = { ink: await alphaInk(page, '#ps-paper'), size: await paperSize(page), ground: (await canvasSheet(page)).ground[0], rec: await readRecord(page), within };
    if (within > 700) t.note(`Forget was pressed ${within} ms after the last change, so its save may already have landed; Forget then deletes it`);
    t.check(r.ink === 0 && r.size.w === 900 && r.size.h === 1200 && r.ground === 'raw' && r.rec.type !== 'object', 'gap: Forget pressed within the save delay of a stroke, a Turn and a ground change: none of them comes back', r);
    t.check(!!note, 'gap: after Forget the one-time note that the painting is kept is shown again', note);
    await clean(t, page, 'gap: Forget right after changes');
    await page.context().close();
  });

  // ---- gap (medium): the Figure study's copy of the Studio leaves the Studio's painting and My mixes alone
  await guard(t, 'gap: the Figure study copy of the Studio', async () => {
    const page = await openPage(site);
    await tab(page, 'paint'); await studioReady(page);
    await stroke(page, '#ps-paper', PATH);
    await click(page, '#ps-colorBtn');
    const codes = await page.evaluate(() => [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code));
    await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${codes[1]}"]`); await click(page, '#ps-lock');
    const rec0 = await waitSaved(page, 0);
    const before = { ink: await alphaInk(page, '#ps-paper'), savedAt: rec0 && rec0.savedAt, mixes: await storageGet(page, 'portrait-value-studio.paintMixes') };
    await tab(page, 'figure');
    await click(page, '#fig-relaxed'); await click(page, '#fig-start');
    await page.waitForFunction(() => /^Pose 1: /.test(document.getElementById('fig-say').textContent), null, { timeout: 30000 }).catch(() => null);
    await stroke(page, '#fs-paper', [[0.3, 0.3], [0.6, 0.6]]);
    const figInk = await alphaInk(page, '#fs-paper');
    await click(page, '#fs-colorBtn');
    const fcodes = await page.evaluate(() => [...document.querySelectorAll('#fs-paints .ps-paint')].map((b) => b.dataset.code));
    await click(page, `#fs-paints .ps-paint[data-code="${fcodes[0]}"]`); await click(page, '#fs-lock');
    await click(page, '#fig-end'); await click(page, '#fig-end');
    await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null);
    const figMixes = await storageGet(page, 'portrait-value-studio.figureMixes');
    await tab(page, 'paint');
    const after = { ink: await alphaInk(page, '#ps-paper'), mixes: await storageGet(page, 'portrait-value-studio.paintMixes'), shown: await page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length) };
    t.check(figInk > 50 && after.ink === before.ink && after.mixes === before.mixes && after.shown === 9, 'gap: drawing and locking in a mix in a Figure study class leaves the Studio\'s painting and My mixes alone', { figInk, before, after });
    t.check(!!figMixes && JSON.parse(figMixes).length === 1, 'gap: the class\'s mix is kept under its own key', figMixes);
    await page.reload({ waitUntil: 'load' }); await sleep(300);
    await tab(page, 'paint'); await studioReady(page);
    const rec1 = await readRecord(page);
    t.check(rec1.savedAt === before.savedAt && (await alphaInk(page, '#ps-paper')) === before.ink && (await alphaInk(page, '#fs-paper')) === 0, 'gap: after a reload the Studio painting is the one saved before the class, and the class\'s paper is blank (not kept)', { rec1, before, fs: await alphaInk(page, '#fs-paper') });
    await clean(t, page, 'gap: the Figure study copy of the Studio');
    await page.context().close();
  });

  // ---- the low ones that need nothing but a paper, on one page: the sheets one at a time; right and middle buttons, a
  // cancelled touch and two fingers; pen pressure; the blend brush and the underdrawing; Clear and Turn with the
  // underdrawing, and Turn while zoomed; the well's color, the starters, building on a kept mix, Remove on a starter;
  // Undo across the two layers; the keyboard; the advice when the PNG cannot be made
  await guard(t, 'gap: low ones on one paper', async () => {
    const page = await openPage(site, { url: '#paint' });
    await studioReady(page);
    // the sheets: each opens alone and painting closes it; another icon, ×, the same icon again and Escape close it
    const sheets = () => page.evaluate(() => ({ open: [...document.querySelectorAll('#ps-root .ps-sheet')].filter((x) => !x.hidden).map((x) => x.id), expanded: [...document.querySelectorAll('#ps-root .ps-strip [aria-expanded="true"]')].map((b) => b.id) }));
    const byPaint = [];
    for (const [btn, id] of [['#ps-brushBtn', 'ps-brushSheet'], ['#ps-colorBtn', 'ps-paintSheet'], ['#ps-refBtn', 'ps-refSheet'], ['#ps-canvasBtn', 'ps-canvasSheet'], ['#ps-viewBtn', 'ps-viewSheet'], ['eraser', 'ps-eraserSheet']]) {
      if (btn === 'eraser') { await click(page, '#ps-root [data-ps-tool="eraser"]'); await click(page, '#ps-root [data-ps-tool="eraser"]'); } else await click(page, btn);
      const o = await sheets();
      await stroke(page, '#ps-paper', [[0.1, 0.92], [0.2, 0.95]]);
      byPaint.push({ id, opened: o.open.join(), after: await sheets() });
    }
    await click(page, '#ps-brushBtn');
    t.check(byPaint.every((x) => x.opened === x.id && x.after.open.length === 0 && x.after.expanded.length === 0), 'gap: each sheet (brushes, paints, reference, canvas, zoom, eraser) opens alone and a stroke closes it, its icon no longer expanded', byPaint);
    await click(page, '#ps-colorBtn'); await click(page, '#ps-refBtn');
    let sh = await sheets();
    t.check(sh.open.join() === 'ps-refSheet' && sh.expanded.join() === 'ps-refBtn', 'gap: Reference opened over Paints: only Reference is open and expanded', sh);
    await click(page, '#ps-refSheet [data-close]'); sh = await sheets();
    t.check(!sh.open.length && !sh.expanded.length, 'gap: a sheet\'s close button closes it', sh);
    await click(page, '#ps-canvasBtn'); await click(page, '#ps-canvasBtn'); sh = await sheets();
    t.check(!sh.open.length && !sh.expanded.length, 'gap: tapping the same icon again closes its sheet', sh);
    await click(page, '#ps-viewBtn'); await page.keyboard.press('Escape'); sh = await sheets();
    t.check(!sh.open.length && !sh.expanded.length, 'gap: Escape closes the zoom sheet and its icon says so', sh);
    await click(page, '#ps-clear'); await click(page, '#ps-clear');
    // right and middle buttons paint nothing and add no undo step; the context menu is held off the paper
    await click(page, '#ps-orient'); await click(page, '#ps-orient'); // (a turn leaves nothing to undo)
    await stroke(page, '#ps-paper', PATH, { button: 'right' }); await stroke(page, '#ps-paper', PATH, { button: 'middle' });
    const menuOff = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('ps-paper').dispatchEvent(e); return e.defaultPrevented; });
    t.check((await alphaInk(page, '#ps-paper')) === 0 && (await undoOff(page)) && menuOff, 'gap: a right or middle button drag paints nothing and leaves nothing to undo; the context menu is held off the paper', { ink: await alphaInk(page, '#ps-paper'), undoOff: await undoOff(page), menuOff });
    // a touch cancelled by the browser mid-stroke ends the stroke there: the next one does not join it
    await letCapture(page);
    await pointer(page, [['pointerdown', 0.1, 0.6, { pointerType: 'touch', pointerId: 21 }], ['pointermove', 0.2, 0.6, { pointerType: 'touch', pointerId: 21 }], ['pointercancel', 0.2, 0.6, { pointerType: 'touch', pointerId: 21 }]]);
    const cancelled = await alphaInk(page, '#ps-paper');
    await pointer(page, line([0.8, 0.6], [0.9, 0.6], 3, { pointerType: 'touch', pointerId: 22 }));
    t.check(cancelled > 10 && (await alphaInk(page, '#ps-paper')) > cancelled && (await inkIn(page, '#ps-paper', 0.3, 0.57, 0.4, 0.06)) === 0, 'gap: a stroke cut short by pointercancel keeps what it laid, and the next stroke does not join it', { cancelled, between: await inkIn(page, '#ps-paper', 0.3, 0.57, 0.4, 0.06) });
    // two fingers on the paper at once (a pinch, a resting hand): no line may join the two touches
    await click(page, '#ps-clear'); await click(page, '#ps-clear');
    const A = { pointerType: 'touch', pointerId: 31 }, B = { pointerType: 'touch', pointerId: 32, isPrimary: false };
    await pointer(page, [['pointerdown', 0.1, 0.75, A], ['pointerdown', 0.9, 0.85, B], ['pointermove', 0.12, 0.76, A], ['pointermove', 0.88, 0.84, B], ['pointermove', 0.14, 0.77, A], ['pointermove', 0.86, 0.83, B], ['pointerup', 0.14, 0.77, A], ['pointerup', 0.86, 0.83, B]]);
    const between = await inkIn(page, '#ps-paper', 0.3, 0.72, 0.4, 0.16);
    t.check(between === 0, 'gap: two fingers on the paper at once draw no line joining them', { between, total: await alphaInk(page, '#ps-paper') });
    if (between > 0) { await screenshot(page, 'studio-gap-two-fingers'); t.finding({ title: 'Two fingers on the paper at once (a pinch, a resting hand) draw lines straight across the painting between them', severity: 'medium', steps: 'On a touch screen, Studio tab, chisel brush: put one finger on the paper near the bottom-left and a second near the bottom-right, and move both a little (as a pinch to zoom does). Here: pointer events for two touch pointers (ids 31 and 32) at 10 %, 75 % and 90 %, 85 % of the paper, each moved a little, interleaved, then lifted.', expected: 'The second finger is ignored while the first one paints (or both are), so nothing appears between the fingers.', actual: `A band of paint runs between the two touches (${between} inked pixels in the middle of the paper, where neither finger was; tests/screens/studio-gap-two-fingers.png), and Undo needs two taps to take it back.`, cause: 'js/painting.js:349-373: every pointerdown restarts the one stroke (snapshot(), last = p) whatever its pointerId, and pointermove draws from `last` for any pointer, so moves of the two fingers alternate and each segment() joins one finger to the other; .ps-layer-paper has touch-action: none (styles.css:1398), so the browser hands both fingers to the page' }); }
    await click(page, '#ps-clear'); await click(page, '#ps-clear');
    // pen pressure counts: the same line with a pen pressed lightly, by the mouse, and pressed hard
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="pencil"]'); await setRange(page, 'ps-pencilSize', 10); await click(page, '#ps-brushBtn');
    const laid = {};
    for (const [name, o] of [['light pen', { pointerType: 'pen', pressure: 0.2 }], ['mouse', { pointerType: 'mouse' }], ['hard pen', { pointerType: 'pen', pressure: 0.9 }]]) {
      await pointer(page, line([0.2, 0.3], [0.8, 0.3], 12, o).map((e) => e[0] === 'pointerup' ? [e[0], e[1], e[2], { ...o, pressure: 0 }] : e));
      laid[name] = await alphaSum(page, '#ps-paper', 0.1, 0.2, 0.8, 0.2); await click(page, '#ps-undo');
    }
    t.check(laid['light pen'] > 0 && laid['light pen'] < laid.mouse && laid.mouse < laid['hard pen'], 'gap: pen pressure counts: a pen pressed lightly lays less than the mouse, pressed hard more', laid);
    // the blend brush drags the paint and leaves the underdrawing alone; its strength counts
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="sketch"]');
    await stroke(page, '#ps-paper', [[0.3, 0.42], [0.7, 0.42]], { steps: 12 });
    const sk = await page.evaluate(() => { const c = document.getElementById('ps-sketch'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 3; i < d.length; i += 4) h = (h * 31 + d[i]) % 1000000007; return h; });
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="chisel"]'); await click(page, '#ps-root [data-chisel="l"]');
    await stroke(page, '#ps-paper', [[0.3, 0.5], [0.7, 0.5]]);
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="blend"]'); await setRange(page, 'ps-blendSize', 100);
    const dragged = {};
    for (const str of [10, 80]) { await setRange(page, 'ps-blendStr', str); await stroke(page, '#ps-paper', [[0.5, 0.3], [0.5, 0.7]], { steps: 20 }); dragged[str] = await alphaSum(page, '#ps-paper', 0.2, 0.58, 0.6, 0.1); if (str === 10) await click(page, '#ps-undo'); }
    const skAfter = await page.evaluate(() => { const c = document.getElementById('ps-sketch'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 3; i < d.length; i += 4) h = (h * 31 + d[i]) % 1000000007; return h; });
    t.check(skAfter === sk, 'gap: the blend brush dragged across an underdrawing line leaves the underdrawing exactly as it was', { sk, skAfter });
    t.check(dragged[10] > 0 && dragged[80] > dragged[10] * 2, 'gap: the blend brush at 80% strength drags far more paint than at 10%', dragged);
    // Clear blanks the paint only; Turn keeps the underdrawing; the eraser after Clear
    const skInk = await alphaInk(page, '#ps-sketch');
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="sketch"]'); await stroke(page, '#ps-paper', [[0.3, 0.2], [0.6, 0.22]]);
    const skInk2 = await alphaInk(page, '#ps-sketch');
    await click(page, '#ps-clear'); await click(page, '#ps-clear');
    t.check((await alphaInk(page, '#ps-paper')) === 0 && (await alphaInk(page, '#ps-sketch')) === skInk2 && skInk2 > skInk, 'gap: Clear the paper blanks the paint and leaves the underdrawing', { paper: await alphaInk(page, '#ps-paper'), sketch: await alphaInk(page, '#ps-sketch'), skInk2 });
    await click(page, '#ps-root [data-ps-tool="eraser"]');
    t.note(`the eraser right after Clear the paper (the last stroke was on the underdrawing): "${await status(page)}" (the README: it rubs out whichever layer was drawn on last)`);
    // (every pixel counted: a thin pencil line sampled every fourth pixel reads differently once it runs the other way)
    const skAll = await inkIn(page, '#ps-sketch', 0, 0, 1, 1);
    await click(page, '#ps-orient'); const skLand = await inkIn(page, '#ps-sketch', 0, 0, 1, 1); await click(page, '#ps-orient'); const skBack = await inkIn(page, '#ps-sketch', 0, 0, 1, 1);
    t.check(skAll > 100 && Math.abs(skLand - skAll) <= skAll * 0.02 && Math.abs(skBack - skAll) <= skAll * 0.02, 'gap: Turn the paper keeps the underdrawing, both ways (within 2%)', { skAll, skLand, skBack });
    // Turn while zoomed in and panned: the turned paper's corner is on screen and a stroke lands under the pointer
    await click(page, '#ps-brushBtn'); await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="chisel"]'); await click(page, '#ps-brushBtn');
    await click(page, '#ps-viewBtn'); await setRange(page, 'ps-zoom', 400); await setRange(page, 'ps-panX', 100); await setRange(page, 'ps-panY', 100); await click(page, '#ps-viewBtn');
    await click(page, '#ps-orient');
    { const wb = await box(page, '#ps-paperWrap'), st = await box(page, '#ps-stage'); t.check((await paperSize(page)).w === 1200 && wb.w > wb.h && wb.r <= st.r + 1 && wb.r >= st.r - 100 && wb.b <= st.b + 1 && wb.b >= st.b - 100, 'gap: turned at 4× panned to the bottom-right: the turned paper\'s bottom-right corner is on screen', { wb, st }); }
    { const b0 = await inkIn(page, '#ps-paper', 0.88, 0.88, 0.12, 0.12); await stroke(page, '#ps-paper', [[0.92, 0.92], [0.97, 0.95]]); t.check((await inkIn(page, '#ps-paper', 0.88, 0.88, 0.12, 0.12)) > b0 + 50, 'gap: on the paper turned at 4× a stroke lands under the pointer', b0); }
    await click(page, '#ps-fitBtn'); await click(page, '#ps-orient');
    t.check(inside(await box(page, '#ps-paperWrap'), await box(page, '#ps-stage')), 'gap: Fit to screen, then turned back: the whole paper is on the stage');
    // the well's color is the pigment model's prediction; the eight starters; building on a kept mix; Remove on a starter
    await click(page, '#ps-colorBtn'); await setRange(page, 'ps-amount', 2);
    const codes = await page.evaluate(() => [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code));
    await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${codes[1]}"]`);
    const chip = await page.evaluate(([a, b]) => { const m = Mixing.mix([a, b].map((c) => Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(c)))), [1, 1]); const bg = (/rgb\((\d+), (\d+), (\d+)\)/.exec(getComputedStyle(document.getElementById('ps-wellChip')).backgroundColor) || []).slice(1).map(Number); return { model: [m.rgb.r, m.rgb.g, m.rgb.b].map(Math.round), chip: bg }; }, [codes[0], codes[1]]);
    t.check(chip.chip.length === 3 && chip.chip.every((v, i) => Math.abs(v - chip.model[i]) <= 2), 'gap: the well shows the mix as the pigment model predicts it (Mixing.mix of its parts)', chip);
    const starters = await page.evaluate(() => [...document.querySelectorAll('#ps-mixes .ps-mix')].slice(0, 8).map((b) => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(b.style.getPropertyValue('--c')); const lab = m ? Study.rgbToLab(+m[1], +m[2], +m[3]) : [0, 0, 0]; return { name: b.title.split(':')[0], recipe: b.title.split(': ')[1], L: +lab[0].toFixed(1), b: +lab[2].toFixed(1) }; }));
    const Lof = (n) => (starters.find((x) => x.name === n) || { L: NaN }).L;
    t.check(new Set(starters.map((x) => x.recipe)).size === 8 && starters.every((x) => x.b > 0) && Lof('Light · lit') > Lof('Light · half tone') && Lof('Light · half tone') > Lof('Light · shadow') && Lof('Medium · lit') > Lof('Medium · shadow') && Lof('Deep · lit') > Lof('Deep · shadow'), 'gap: the eight starters are eight different mixes, all warm, each lit one lighter than its shadow', starters);
    await click(page, '#ps-lock'); await click(page, '#ps-colorBtn');
    await click(page, '#ps-mixes .ps-mix:nth-child(9)'); await click(page, `#ps-paints .ps-paint[data-code="${codes[2]}"]`);
    const built = await text(page, '#ps-wellParts');
    await click(page, '#ps-lock');
    const stored = JSON.parse((await storageGet(page, 'portrait-value-studio.paintMixes')) || '[]');
    t.check(built === `${codes[0]} 1 · ${codes[1]} 1 · ${codes[2]} 1` && stored.length === 2 && JSON.stringify(stored[1].parts) === JSON.stringify([{ code: codes[0], amount: 1 }, { code: codes[1], amount: 1 }, { code: codes[2], amount: 1 }]), 'gap: a kept mix tapped, a paint added and locked in again: a new mix holding all three parts', { built, stored });
    await click(page, '#ps-colorBtn'); await click(page, '#ps-mixes .ps-mix:nth-child(1)'); await click(page, '#ps-dropMix');
    { const n = await page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length); const after = JSON.parse((await storageGet(page, 'portrait-value-studio.paintMixes')) || '[]'); const last = await page.evaluate(() => document.querySelector('#ps-mixes .ps-mix:last-child').title); t.check(n === 9 && after.length === 2, 'gap: Remove on a starter drops it from the sheet and leaves the kept mixes stored', { n, after }); t.note(`after a starter is removed the kept mixes are renamed by position: the last one is now "${last.split(':')[0]}"`); }
    await page.keyboard.press('Escape');
    // Undo goes back through the two layers in order: paint, underdrawing, eraser on the underdrawing, paint, underdrawing cleared
    await click(page, '#ps-clear'); await click(page, '#ps-clear');
    const both = async () => [await alphaInk(page, '#ps-paper'), await alphaInk(page, '#ps-sketch')];
    const steps = [await both()];
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="chisel"]'); await stroke(page, '#ps-paper', [[0.2, 0.6], [0.5, 0.65]]); steps.push(await both());
    await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="sketch"]'); await stroke(page, '#ps-paper', [[0.2, 0.8], [0.6, 0.85]], { steps: 12 }); steps.push(await both());
    await click(page, '#ps-root [data-ps-tool="eraser"]'); await stroke(page, '#ps-paper', [[0.4, 0.75], [0.4, 0.9]]); steps.push(await both());
    await click(page, '#ps-brushBtn'); await click(page, '#ps-brushBtn'); await click(page, '#ps-root [data-brush="chisel"]'); await stroke(page, '#ps-paper', [[0.6, 0.3], [0.8, 0.35]]); steps.push(await both());
    await click(page, '#ps-sketchClear'); steps.push(await both());
    const undone = [];
    for (let i = 0; i < 5; i++) { await click(page, '#ps-undo'); undone.push(await both()); }
    t.check(new Set(steps.map(String)).size === 6 && JSON.stringify(undone) === JSON.stringify(steps.slice(0, 5).reverse()), 'gap: Undo five times across the paint and the underdrawing restores each layer in exact reverse order', { steps, undone });
    // the keyboard: the zoom slider by arrows, Undo and Clear by Enter, the strip in Tab order
    await click(page, '#ps-viewBtn'); await page.focus('#ps-zoom');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    { const z = await page.evaluate(() => ({ out: document.getElementById('ps-zoomOut').textContent, pan: !document.getElementById('ps-panX').disabled })); t.check(z.out === '120%' && z.pan, 'gap: four arrow presses on the zoom slider: 120%, with pan on', z); }
    await page.keyboard.press('Escape'); await click(page, '#ps-fitBtn');
    await stroke(page, '#ps-paper', PATH); const withS = await alphaInk(page, '#ps-paper');
    await page.focus('#ps-undo'); await page.keyboard.press('Enter');
    const afterEnter = await alphaInk(page, '#ps-paper');
    await page.focus('#ps-clear'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    t.check(afterEnter < withS && (await alphaInk(page, '#ps-paper')) === 0, 'gap: Enter on Undo undoes; Enter twice on Clear clears', { withS, afterEnter, cleared: await alphaInk(page, '#ps-paper') });
    const order = await page.evaluate(() => [...document.querySelectorAll('#ps-root .ps-strip button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id || b.dataset.psTool));
    await page.focus('#ps-root .ps-strip button:not(.ps-exit)');
    const reached = [await page.evaluate(() => document.activeElement.id || document.activeElement.dataset.psTool)];
    for (let i = 1; i < order.length; i++) { await page.keyboard.press('Tab'); reached.push(await page.evaluate(() => document.activeElement.id || document.activeElement.dataset.psTool)); }
    t.check(JSON.stringify(reached) === JSON.stringify(order), 'gap: Tab walks the strip\'s icons in order', { order, reached });
    // the advice when the PNG cannot be made (a canvas too big for the browser): the Studio has no Working size
    await page.evaluate(() => { window.__toBlob = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); }; });
    await armToast(page); await click(page, '#ps-save');
    const said = await toastMatch(page, /could not be made/, 3000);
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__toBlob; });
    const fits = !!said && !/Working size/.test(said);
    t.check(fits, 'gap: when the PNG cannot be made, the advice fits the Studio (which has no Working size)', said);
    if (!fits && said) t.finding({ title: 'When the Studio\'s Save as PNG fails, the advice is "Try a smaller Working size.", a Study tab setting that has nothing to do with the painting', severity: 'low', steps: 'Studio tab, Canvas icon, Save as PNG in a browser that cannot encode the picture (simulated: HTMLCanvasElement.prototype.toBlob calling back with null).', expected: 'Advice that fits the Studio (for example: close other tabs and try again), or none.', actual: `The toast says "${said}". The Studio's paper is a fixed 900 × 1200 whatever the Working size.`, cause: 'js/painting.js:266 calls Studio.savePng(composite(), name) without its advice argument, so js/app.js:197 uses its default, "Try a smaller Working size."' });
    await clean(t, page, 'gap: low ones on one paper');
    await page.context().close();
  });

  // ---- gap (low): localStorage refusing every write: no one-time note (its flag cannot be kept), a mix locked in is used
  // for the visit only, the painting itself is still kept, and nothing throws
  await guard(t, 'gap: localStorage refusing writes', async () => {
    const page = await openPage(site);
    await page.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; });
    await page.reload({ waitUntil: 'load' }); await sleep(300);
    await watchToasts(page);
    await tab(page, 'paint'); await studioReady(page);
    const opened = await toasts(page);
    t.check(!opened.some((m) => /saved in this browser/.test(m)), 'gap: with localStorage refusing writes the one-time note is not shown (its flag could not be kept, so it would come on every visit)', opened);
    await click(page, '#ps-colorBtn');
    const codes = await page.evaluate(() => [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code));
    await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${codes[1]}"]`); await click(page, '#ps-lock');
    const shown = await page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length);
    const since = Date.now(); await stroke(page, '#ps-paper', PATH);
    const ink = await alphaInk(page, '#ps-paper'), rec = await waitSaved(page, since);
    const all = await toasts(page);
    await page.reload({ waitUntil: 'load' }); await sleep(300); await tab(page, 'paint'); await studioReady(page);
    await click(page, '#ps-colorBtn');
    const back = { ink: await alphaInk(page, '#ps-paper'), mixes: await page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length) };
    t.check(shown === 9 && back.mixes === 8, 'gap: with localStorage refusing writes a locked-in mix is used for the visit (9 mixes) and is gone after a reload (8)', { shown, back });
    t.check(!!rec && back.ink === ink, 'gap: with localStorage refusing writes the painting is still kept (in IndexedDB) and comes back', { saved: !!rec, ink, back: back.ink });
    t.note(`with localStorage refusing writes, a locked-in mix is lost on the next visit while the README says mixes are kept; the page said: ${all.length ? all.map((m) => `"${m.slice(0, 60)}"`).join(', ') : 'nothing'}`);
    await clean(t, page, 'gap: localStorage refusing writes');
    await page.context().close();
  });

  // ---- gap (low): junk in every saved key (and keys named after Object.prototype's members), opened straight on #paint
  await guard(t, 'gap: junk in every saved key on #paint', async () => {
    const storage = {};
    const keys = ['mode', 'drawers', 'smoothing', 'lean', 'blockView', 'canvasUnit', 'palette', 'paintChoice', 'myPaints', 'paintMixes', 'studioNotice', 'figureStudy', 'figureMixes', 'gameMode', 'gameBest', 'battleBest'];
    const junk = ['constructor', '{"__proto__":{"x":1}}', 'NaN', JSON.stringify(Array(5000).fill('x')), '{"a":{"b":{"c":[1,2,{"d":null}]}}}', '12', 'true', '[]', '{"constructor":1,"__proto__":2,"toString":3}', '"\\u0000"', '-1e999', 'undefined'];
    keys.forEach((k, n) => { storage['portrait-value-studio.' + k] = junk[n % junk.length]; });
    PROTO_NAMES.forEach((n) => { storage['portrait-value-studio.' + n] = n; });
    const page = await openPage(site, { url: '#paint', storage });
    await studioReady(page);
    await stroke(page, '#ps-paper', PATH);
    const ink = await alphaInk(page, '#ps-paper');
    await click(page, '#ps-colorBtn');
    const p = await page.evaluate(() => { const s = document.getElementById('ps-palette'); return { value: s.value, ids: [...s.options].map((o) => o.value), paints: document.querySelectorAll('#ps-paints .ps-paint').length, mixes: document.querySelectorAll('#ps-mixes .ps-mix').length }; });
    const codes = await page.evaluate(() => [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code));
    await click(page, `#ps-paints .ps-paint[data-code="${codes[0]}"]`); await click(page, `#ps-paints .ps-paint[data-code="${codes[1]}"]`); await click(page, '#ps-lock');
    const locked = await page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length);
    const png = await savePngRead(page);
    t.check(ink > 50 && p.ids.includes(p.value) && p.paints >= 2 && p.mixes >= 8 && locked === p.mixes + 1 && png && png.w === 900 && png.h === 1200, 'gap: with junk in every saved key, opened on #paint: a stroke lands, a palette is chosen with its paints and starters, a mix locks in, Save as PNG works', { ink, p, locked, png: png && [png.w, png.h] });
    await clean(t, page, 'gap: junk in every saved key on #paint');
    await page.context().close();
  });

  // ---- gap (low): subjects.js missing: the Reference sheet offers the Study photo only, and it still serves
  await guard(t, 'gap: subjects.js missing', async () => {
    const page = await openPage(site, { url: '#paint', block: [site.base + 'js/subjects.js'] });
    await studioReady(page);
    await click(page, '#ps-refBtn');
    const r = await refInfo(page);
    const portraitOff = await page.evaluate(() => [...document.querySelectorAll('#ps-root [data-ref-kind="painting"]')].every((b) => b.hidden || getComputedStyle(b).display === 'none'));
    t.check(portraitOff && r.anotherHidden && r.kind === 'studio' && !r.figHidden && r.w > 0, 'gap: with subjects.js missing the Reference sheet offers the Study photo only (no "A portrait", no Another portrait), and shows it', { portraitOff, r });
    await click(page, '#ps-refSheet [data-ref-view="values"]');
    const v = await refInfo(page);
    await stroke(page, '#ps-paper', PATH);
    t.check(v.distinct <= 3 && v.view === 'values' && (await alphaInk(page, '#ps-paper')) > 50, 'gap: with subjects.js missing Values still draws and a stroke lands', v);
    // (the blocked request and game.js telling the guard it cannot start without subjects.js are expected console lines)
    const EXPECTED = /^Failed to load resource: net::ERR_FAILED$|subjects\.js did not (finish )?load/;
    const own = page.log.console.filter((l) => EXPECTED.test(l));
    page.log.console = page.log.console.filter((l) => !EXPECTED.test(l));
    t.check(own.some((l) => /^subjects\.js did not load$/.test(l)), 'gap: with subjects.js missing, the guard notes it (and nothing else goes to the console)', own);
    await clean(t, page, 'gap: subjects.js missing');
    await page.context().close();
  });

  // ---- gap (low): dark theme and reduced motion: the strip, the status pill and a sheet read, with no axe violation
  await guard(t, 'gap: dark theme and reduced motion', async () => {
    const page = await openPage(site, { url: '#paint', dark: true, reducedMotion: true, bypassCSP: true });
    await studioReady(page);
    await stroke(page, '#ps-paper', PATH);
    await click(page, '#ps-colorBtn');
    const v1 = await axe(page);
    t.check(v1.length === 0, 'gap: dark theme, the Studio with the Paints sheet open: no axe violation', v1);
    await click(page, '#ps-brushBtn');
    const v2 = await axe(page);
    t.check(v2.length === 0, 'gap: dark theme, the Studio with the brush sheet open: no axe violation', v2);
    await screenshot(page, 'studio-gap-dark');
    t.check((await alphaInk(page, '#ps-paper')) > 50, 'gap: dark theme with reduced motion: a stroke lands');
    await clean(t, page, 'gap: dark theme and reduced motion');
    await page.context().close();
  });

  // ---- gap (low): two tabs painting at once (not promised: what each finds after a reload is noted)
  await guard(t, 'gap: two tabs painting at once', async () => {
    const a = await openPage(site, { url: '#paint' }); await studioReady(a);
    const b = await newTab(site, a, { url: '#paint' }); await studioReady(b);
    let since = Date.now(); await stroke(a, '#ps-paper', [[0.1, 0.1], [0.3, 0.2]]); await waitSaved(a, since);
    since = Date.now(); await stroke(b, '#ps-paper', [[0.7, 0.8], [0.9, 0.9]]); await waitSaved(b, since);
    const mine = (pg) => Promise.all([inkIn(pg, '#ps-paper', 0.05, 0.05, 0.3, 0.2), inkIn(pg, '#ps-paper', 0.65, 0.75, 0.3, 0.2)]);
    await a.reload({ waitUntil: 'load' }); await studioReady(a);
    const [aA, aB] = await mine(a);
    t.note(`two tabs painting at once: after a reload the first tab ${aA > 0 ? 'still has its stroke' : 'has lost its stroke'}${aB > 0 ? ' and shows the second tab\'s' : ''} (the one record is the last tab's to save; the README promises nothing for two tabs)`);
    await clean(t, a, 'gap: two tabs, the first'); await clean(t, b, 'gap: two tabs, the second');
    await a.context().close();
  });

  // ---- gap (low): a painting made from a dealt portrait, after a reload: what the Studio shows as its reference, and
  // what Use my Studio painting then scores it against (not promised either way: noted)
  await guard(t, 'gap: a dealt portrait after a reload', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    await click(page, '#ps-refBtn'); await click(page, '#ps-refSheet [data-ref-kind="painting"]');
    await page.waitForFunction(() => /after /.test(document.getElementById('ps-refName').textContent), null, { timeout: 10000 }).catch(() => null);
    const dealt = (await refInfo(page)).name;
    const since = Date.now(); await stroke(page, '#ps-paper', PATH);
    const ink = await alphaInk(page, '#ps-paper'); await waitSaved(page, since);
    await page.reload({ waitUntil: 'load' }); await studioReady(page);
    const after = await refInfo(page);
    t.check((await alphaInk(page, '#ps-paper')) === ink && /after /.test(dealt), 'gap: a painting made from a dealt portrait comes back after a reload', { ink, now: await alphaInk(page, '#ps-paper') });
    await tab(page, 'study'); await click(page, '#artFromStudio');
    const source = await text(page, '#source');
    await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 20000 }).catch(() => null);
    t.note(`a painting made from a dealt portrait ("${dealt.split(':')[0]}"), after a reload: the Studio's reference is ${after.kind === 'painting' ? `still "${after.name.split(':')[0]}"` : 'the Study tab\'s photo again'} (the portrait is not saved with the painting), and Use my Studio painting scores it against "${source.slice(0, 80)}"`);
    await clean(t, page, 'gap: a dealt portrait after a reload');
    await page.context().close();
  });
}

// ================= J. round 2: the extremes, Undo across tools, saved PNGs, the palette and the reference on odd photos,
// a reload in the middle of a stroke, and Clear right after the page loads =================
// Each block is its own function (a scratch run can drive one alone); round2 runs them in order.
const BOXA = [0.05, 0.05, 0.4, 0.15]; // where the first stroke of a reload trial lands: PATH_A, as fractions of the paper
const PATH_A = [[0.1, 0.1], [0.4, 0.15]];
// the stroke begun and held (the button stays down): returns where the mouse stands, to let go of it later
async function holdStroke(page, points, { steps = 8 } = {}) {
  const b = await page.locator('#ps-paper').boundingBox();
  const at = (p) => [b.x + b.width * p[0], b.y + b.height * p[1]];
  const [x0, y0] = at(points[0]);
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i < points.length; i++) { const [x, y] = at(points[i]); await page.mouse.move(x, y, { steps }); }
  return at(points[points.length - 1]);
}

export async function reloadMidStroke(t, site) {
  // ---- a reload while the button is held: the earlier painting comes back, the held stroke is whole or gone, and
  // letting go on the new page draws nothing and throws nothing
  await guard(t, 'round 2: reload in the middle of a stroke', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    await stroke(page, '#ps-paper', PATH_A); const since = Date.now(); await waitSaved(page, since, 30000);
    const a0 = await inkIn(page, '#ps-paper', ...BOXA);
    const [hx, hy] = await holdStroke(page, [[0.6, 0.5], [0.85, 0.65]]);
    const during = await inkIn(page, '#ps-paper', 0.55, 0.45, 0.35, 0.25);
    await page.reload({ waitUntil: 'load' }); await studioReady(page);
    const total = () => inkIn(page, '#ps-paper', 0, 0, 1, 1);
    const r = { a0, during, a: await inkIn(page, '#ps-paper', ...BOXA), held: await inkIn(page, '#ps-paper', 0.55, 0.45, 0.35, 0.25), total: await total(), undoOff: await undoOff(page), toast: await text(page, '#toast') };
    t.check(r.a === a0 && a0 > 100, 'reload mid-stroke: the stroke finished before it is back exactly as it was', r);
    t.check(r.total === r.a + r.held, 'reload mid-stroke: the held stroke is whole, partly there or gone, with nothing stray elsewhere on the paper', r);
    t.check(r.undoOff && /back from last time/.test(r.toast || ''), 'reload mid-stroke: the Studio says the painting is back and has nothing to undo', r);
    await page.mouse.move(hx + 10, hy + 10, { steps: 3 }); await page.mouse.move(hx - 40, hy - 20, { steps: 3 }); await page.mouse.up();
    await sleep(300);
    t.check((await total()) === r.total && (await undoOff(page)), 'reload mid-stroke: the button let go on the new page draws nothing', { before: r.total, after: await total() });
    const before = await total();
    await stroke(page, '#ps-paper', [[0.2, 0.8], [0.7, 0.85]]);
    const withNew = await total();
    await click(page, '#ps-undo');
    t.check(withNew > before + 50 && (await total()) === before, 'reload mid-stroke: a new stroke lands and Undo takes just that stroke back', { before, withNew, undone: await total() });
    t.note(`reload mid-stroke: the stroke held at the reload had ${during} inked samples on the old page and ${r.held} after the reload (a stroke is saved only when it ends: js/painting.js line 368)`);
    await clean(t, page, 'round 2: reload mid-stroke');
    await page.context().close();
  });

  // ---- a stroke finished a moment before the reload (less than the 0.8 s autosave delay): the README says the painting
  // is "saved in the browser a moment after each change" and js/painting.js says a change still waiting is saved as the
  // page goes; three trials (the reload at once, after 0.3 s and after 0.6 s), each with its own stroke
  await guard(t, 'round 2: a stroke made just before a reload', async () => {
    const page = await openPage(site, { url: '#paint' });
    // what the page does as it goes: the log is kept in sessionStorage, which a reload keeps
    await page.addInitScript(() => {
      const log = (m) => { try { const a = JSON.parse(sessionStorage.getItem('__flush') || '[]'); a.push(`${m}@${Date.now()}`); sessionStorage.setItem('__flush', JSON.stringify(a)); } catch (e) { /* no log */ } };
      window.__flushLog = log;
      window.addEventListener('pagehide', () => log('pagehide'));
      const tb = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb, ...r) { log('toBlob'); return tb.call(this, (b) => { log('toBlob-done'); cb(b); }, ...r); };
      const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { log('put'); return put.apply(this, a); };
    });
    await page.reload({ waitUntil: 'load' }); await studioReady(page);
    const rows = [];
    // a trial counts only if the page was told to go (pagehide) less than 0.7 s after the stroke ended, so the 0.8 s autosave had not
    // run: on a loaded machine the reload can be slow to start, and the trial is made again with a fresh stroke
    const stamp = (log, name, after) => log.filter((e) => e.startsWith(name + '@')).map((e) => +e.split('@')[1]).filter((v) => v >= after).sort((a, b) => a - b)[0];
    for (const [i, wait] of [[0, 0], [1, 300], [2, 600]]) {
      let row = null;
      for (let attempt = 0; attempt < 4 && !row; attempt++) {
        const y = 0.08 + (i * 4 + attempt) * 0.055;
        await page.evaluate(() => sessionStorage.removeItem('__flush'));
        await stroke(page, '#ps-paper', [[0.1, y], [0.5, y + 0.02]]);
        await page.evaluate(() => window.__flushLog('stroke-end'));
        if (wait) await sleep(wait);
        await page.reload({ waitUntil: 'load' }); await studioReady(page);
        const log = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__flush') || '[]'));
        const ended = stamp(log, 'stroke-end', 0), gone = stamp(log, 'pagehide', ended || 0);
        const gap = ended && gone ? gone - ended : null;
        const back = await inkIn(page, '#ps-paper', 0.05, y - 0.02, 0.5, 0.07);
        if (gap !== null && gap < 700) row = { wait, gap, back, flush: log.map((e) => e.replace(/@(\d+)/, (m, v) => ended ? '@+' + (v - ended) : m)).join(' ') };
        else t.note(`a reload trial (wait ${wait} ms) took ${gap} ms to reach pagehide, too late to test the page going within the autosave delay: made again`);
      }
      if (row) rows.push(row);
    }
    // the earlier strokes were each lost or kept on their own; the last trial's stroke is the one asked about
    const lost = rows.filter((r) => r.back === 0);
    t.check(rows.length === 3 && lost.length === 0, 'a stroke finished 0, 0.3 and 0.6 s before a reload is in the painting after it', rows);
    if (lost.length) t.finding({ title: 'A stroke made less than a second before a reload or a closed tab is lost: the save that is meant to run as the page goes never finishes', severity: 'medium',
      steps: '1. Open the Studio (index.html#paint) and draw one stroke. 2. Reload the page (or close the tab) at once, or within 0.6 s. 3. Open the Studio again.',
      expected: 'README: the Studio\'s paper and underdrawing "are saved in the browser a moment after each change ... and come back on the next visit"; js/painting.js line 530 says "a change still waiting is saved as the page goes (pagehide)". A stroke drawn just before leaving is in the painting that comes back.',
      actual: `Reloading ${rows.map((r) => `${r.wait} ms`).join(', ')} after a stroke left ${rows.map((r) => r.back).join(', ')} inked samples of that stroke (${lost.length} of 3 lost; the painting from before was intact). The page's own log of the last trial (ms after the stroke ended; the extra pagehide entries are its frames) reads "${rows[rows.length - 1].flush}": the pagehide handler starts the toBlob calls and ${/toBlob-done/.test(rows[rows.length - 1].flush) ? 'they call back' : 'neither calls back'}, ${/put@/.test(rows[rows.length - 1].flush) ? 'and a put is made' : 'so no IndexedDB put is made'}.`,
      cause: 'js/painting.js 532-534: saveNowIfDue() calls saveNow() on pagehide and visibilitychange, and saveNow() (472-490) first awaits canvas.toBlob (line 481, asynchronous) and then opens the database and puts (448-452). Once the page is unloading none of those callbacks runs, so only a save that was already written survives. The flush would need a synchronous snapshot (getImageData put in the same task), or a shorter delay.' });
    await clean(t, page, 'round 2: stroke before reload');
    await page.context().close();
  });
}

export async function clearJustAfterLoad(t, site) {
  // ---- Clear takes two taps (README); js/painting.js 381-387 arms with performance.now() - clearArmed > 3000 and starts at 0,
  // so in the first three seconds of a page's life the first tap clears. This machine takes more than 3 s to load a page,
  // so the page's age is counted from the moment the test says the page is up (a visitor on an ordinary machine is there in
  // under a second); everything else is the page as it is
  await guard(t, 'round 2: Clear in the first seconds after the page loads', async () => {
    const page = await openPage(site, { url: '#paint' });
    await page.addInitScript(() => { const real = performance.now.bind(performance); let zero = 0; window.__ageZero = () => { zero = real(); }; performance.now = () => real() - zero; });
    await page.reload({ waitUntil: 'load' }); await studioReady(page);
    const rows = [];
    for (let trial = 0; trial < 2; trial++) {
      await stroke(page, '#ps-paper', [[0.3, 0.3 + trial * 0.2], [0.7, 0.5 + trial * 0.2]]);
      await page.evaluate(() => window.__ageZero()); // the page is "just loaded"
      await sleep(150);
      const age = await page.evaluate(() => Math.round(performance.now()));
      armToast(page);
      const before = await alphaInk(page, '#ps-paper');
      await click(page, '#ps-clear');
      const after = await alphaInk(page, '#ps-paper');
      const asked = !!(await toastMatch(page, /Tap again to clear/, 1500));
      rows.push({ age, before, after, asked });
      if (after === 0) { await click(page, '#ps-undo'); } else { await click(page, '#ps-clear'); await click(page, '#ps-undo'); }
    }
    const ok = rows.every((r) => r.before > 100 && r.after === r.before && r.asked);
    t.check(ok, 'the first tap on Clear in the first seconds after the page loads only asks for a second tap', rows);
    if (!ok) t.finding({ title: 'Clear wipes the paper on its first tap when the page is less than three seconds old', severity: 'low',
      steps: '1. Open the Studio (a saved painting comes back, or draw a stroke). 2. Within three seconds of the page loading (open the site at #paint, or reload there), tap Clear once.',
      expected: 'README: "Clear the paper takes two taps, and Undo brings a cleared paper back." The first tap says "Tap again to clear the paper (Undo brings it back)" and leaves the paper alone.',
      actual: `${rows.map((r) => `at a page age of ${r.age} ms one tap took the inked samples from ${r.before} to ${r.after}${r.asked ? '' : ' with no "Tap again" message'}`).join('; ')} (the harness counts the page's age from the moment it says the page is up, since this machine needs 8 s to load it; Undo brings the painting back).`,
      cause: 'js/painting.js line 381 starts the arming time at 0 (let clearArmed = 0) and line 384 asks for the second tap only when performance.now() - clearArmed > 3000; performance.now() counts from the page\'s navigation, so for its first 3000 ms the difference is under 3000, the tap is read as the second of a pair, and the paper is cleared. Starting clearArmed at -Infinity fixes it.' });
    await clean(t, page, 'round 2: Clear after load');
    await page.context().close();
  });
}

// ---- helpers of the blocks below ---------------------------------------------------------------------------
const brushTo = async (page, name) => { await click(page, '#ps-brushBtn'); await click(page, `#ps-root [data-brush="${name}"]`); };
const eraserOn = (page) => click(page, '#ps-root [data-ps-tool="eraser"]');
// a layer wiped without a visitor's two taps, between measurements (the Studio's own method for Figure study)
const wipe = (page) => page.evaluate(() => PaintStudio.clearAll());
// the ink of a layer, every pixel counted (alpha over 8), and its bounding box
const extentOf = (page, sel) => page.evaluate((s) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let y0 = c.height, y1 = -1, x0 = c.width, x1 = -1, n = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { n++; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; } return y1 < 0 ? { n: 0, w: 0, h: 0 } : { n, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }, sel);
// ink per cell of a 4 x 4 grid over both layers: a picture of where the paint and the underdrawing are (exact: alpha survives Undo)
const signature = (page) => page.evaluate(() => ['ps-paper', 'ps-sketch'].map((id) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const cells = new Array(16).fill(0); for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 8) cells[Math.floor((y * 4) / c.height) * 4 + Math.floor((x * 4) / c.width)]++; return cells.join(','); }).join(' | '));
async function saveBuf(page) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), click(page, '#ps-save')]);
  return dl ? { buf: fs.readFileSync(await dl.path()), name: dl.suggestedFilename() } : null;
}
const pngChunks = (buf) => { const out = []; let o = 8; while (o + 12 <= buf.length) { const len = buf.readUInt32BE(o); out.push(buf.toString('latin1', o + 4, o + 8)); o += 12 + len; } return out; };
// a PNG's mean colour and spread (of the green channel) in boxes [x, y, w, h] in pixels
const pngBoxes = (page, buf, boxes) => page.evaluate(async ([b64, boxes]) => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, boxes: boxes.map(([x, y, w, h]) => { const d = g.getImageData(x, y, w, h).data; const m = [0, 0, 0]; let n = 0, s2 = 0, s1 = 0, a = 0; for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; s1 += d[i + 1]; s2 += d[i + 1] * d[i + 1]; a += d[i + 3]; n++; } const mg = s1 / n; return { mean: m.map((v) => +(v / n).toFixed(1)), sd: +Math.sqrt(Math.max(0, s2 / n - mg * mg)).toFixed(2), alpha: +(a / n).toFixed(1) }; }) };
}, [buf.toString('base64'), boxes]);

// ---- every size slider past its ends, and the marks at the smallest and the largest size ----------------------------
export async function extremesOfEveryBrush(t, site) {
  await guard(t, 'round 2: every size slider past its ends', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    const rows = [];
    const slider = async (label, activate, id, out, min, max, suffix, statusHas) => {
      await activate();
      for (const [asked, want] of [[min - 40, min], [max + 400, max], [(min + max) / 2, Math.round((min + max) / 2)]]) {
        const got = await setRange(page, id, asked);
        const st = await status(page);
        rows.push({ label, asked, want, got, out: await text(page, '#' + out), status: st, ok: +got === want && (await text(page, '#' + out)) === `${want}${suffix}` && st.includes(statusHas(want)) });
      }
    };
    await slider('round', () => brushTo(page, 'round'), 'ps-roundSize', 'ps-roundOut', 3, 64, ' px', (v) => `Round · ${v} px`);
    await slider('pencil', () => brushTo(page, 'pencil'), 'ps-pencilSize', 'ps-pencilOut', 1, 30, ' px', (v) => `· ${v} px`);
    await slider('underdrawing', () => brushTo(page, 'sketch'), 'ps-sketchSize', 'ps-sketchOut', 1, 30, ' px', (v) => `Underdrawing · black · HB · ${v} px`);
    await slider('fan size', () => brushTo(page, 'blend'), 'ps-blendSize', 'ps-blendOut', 20, 140, ' px', (v) => `Blend · ${v} px`);
    await slider('fan strength', () => brushTo(page, 'blend'), 'ps-blendStr', 'ps-blendStrOut', 10, 80, '%', (v) => `· ${v}%`);
    await slider('eraser', () => eraserOn(page), 'ps-eraserSize', 'ps-eraserOut', 4, 100, ' px', (v) => `Eraser · ${v} px`);
    const bad = rows.filter((r) => !r.ok);
    t.check(bad.length === 0, 'each size slider, pushed under its smallest and over its largest value, stops at the end and the readout and the status pill say so', bad.length ? bad : rows.length + ' settings');
    await clean(t, page, 'round 2: sliders past their ends');
    await page.context().close();
  });

  await guard(t, 'round 2: marks at the smallest and the largest size', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    const H = [[0.2, 0.5], [0.8, 0.5]];
    const sizes = {};
    for (const [label, activate, id, layer, vals] of [
      ['round', () => brushTo(page, 'round'), 'ps-roundSize', '#ps-paper', [3, 64]],
      ['pencil', () => brushTo(page, 'pencil'), 'ps-pencilSize', '#ps-paper', [1, 30]],
      ['underdrawing', () => brushTo(page, 'sketch'), 'ps-sketchSize', '#ps-sketch', [1, 30]],
    ]) {
      await activate();
      sizes[label] = {};
      for (const v of vals) {
        await wipe(page); await setRange(page, id, v);
        await stroke(page, '#ps-paper', H);
        sizes[label][v] = await extentOf(page, layer);
      }
    }
    const r = sizes.round, p = sizes.pencil, u = sizes.underdrawing;
    t.check(r[3].n > 100 && r[3].h >= 2 && r[3].h <= 6 && r[64].h >= 48 && r[64].h <= 70 && r[64].w > 500, 'the round brush at 3 px lays a line about 3 px high and at 64 px a band about 64 px high', r);
    t.check(p[1].n > 20 && p[1].h <= 6 && p[30].h >= 40 && p[30].h <= 80 && p[30].n > 3 * p[1].n, 'the pencil at 1 px is a hairline and at 30 px a band 40 to 80 px high', p);
    t.check(u[1].n > 20 && u[1].h <= 6 && u[30].h >= 40 && u[30].h <= 80, 'the underdrawing pencil at 1 px is a hairline and at 30 px a band 40 to 80 px high, on its own layer', u);
    // the eraser: a solid block, then a 4 px and a 100 px rub across it; the bare band is read in one column
    await wipe(page); await brushTo(page, 'round'); await setRange(page, 'ps-roundSize', 64);
    for (let k = 0; k < 9; k++) await stroke(page, '#ps-paper', [[0.1, 0.4 + k * 0.025], [0.9, 0.4 + k * 0.025]], { steps: 4 });
    const run = () => page.evaluate(() => { const c = document.getElementById('ps-paper'); const g = c.getContext('2d'); const x = Math.round(c.width / 2); const d = g.getImageData(x, 0, 1, c.height).data; const mid = Math.round(c.height / 2); let a = mid, b = mid; if (d[mid * 4 + 3] > 8) return 0; while (a > 0 && d[(a - 1) * 4 + 3] <= 8) a--; while (b < c.height - 1 && d[(b + 1) * 4 + 3] <= 8) b++; return b - a + 1; });
    const full = await run();
    await eraserOn(page);
    const bands = {};
    for (const v of [4, 100]) { await setRange(page, 'ps-eraserSize', v); await stroke(page, '#ps-paper', [[0.3, 0.5], [0.7, 0.5]]); bands[v] = await run(); }
    t.check(full === 0 && bands[4] >= 2 && bands[4] <= 8 && bands[100] >= 80 && bands[100] <= 110, 'the eraser at 4 px rubs a band about 4 px wide and at 100 px one about 100 px wide out of solid paint', { solidBefore: full, bands });
    t.note(`marks at the extremes (bounding box of one 540 px line): round ${JSON.stringify(r)}; pencil ${JSON.stringify(p)}; underdrawing ${JSON.stringify(u)}; eraser bands ${JSON.stringify(bands)}`);
    await clean(t, page, 'round 2: marks at the extremes');
    await page.context().close();
  });
}

// ---- Undo across the tools, 24 steps of every kind, and only the last 20 come back ---------------------------------
export async function undoAcrossTools(t, site) {
  await guard(t, 'round 2: Undo across the tools', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    const sigs = [await signature(page)];
    const names = [];
    const step = async (name, fn) => { await fn(); names.push(name); sigs.push(await signature(page)); };
    const L = (y) => [[0.1, y], [0.6, y + 0.02]];
    await step('chisel', async () => { await brushTo(page, 'chisel'); await stroke(page, '#ps-paper', L(0.05)); });
    await step('round', async () => { await brushTo(page, 'round'); await stroke(page, '#ps-paper', L(0.12)); });
    await step('charcoal', async () => { await brushTo(page, 'pencil'); await click(page, '#ps-root [data-lead="charcoal"]'); await stroke(page, '#ps-paper', L(0.19)); });
    await step('underdrawing', async () => { await brushTo(page, 'sketch'); await stroke(page, '#ps-paper', L(0.26)); });
    await step('fan', async () => { await brushTo(page, 'blend'); await stroke(page, '#ps-paper', [[0.3, 0.05], [0.3, 0.2]]); });
    await step('eraser (paint)', async () => { await eraserOn(page); await stroke(page, '#ps-paper', [[0.2, 0.12], [0.5, 0.12]]); });
    await step('underdrawing', async () => { await brushTo(page, 'sketch'); await stroke(page, '#ps-paper', L(0.33)); });
    await step('eraser (underdrawing)', async () => { await eraserOn(page); await stroke(page, '#ps-paper', [[0.35, 0.26], [0.35, 0.4]]); });
    await step('chisel', async () => { await brushTo(page, 'chisel'); await stroke(page, '#ps-paper', L(0.45)); });
    await step('Clear the paper (two taps)', async () => { await page.waitForFunction(() => performance.now() > 3500); /* (the first tap of a page under 3 s old clears at once: see the Clear block) */ await click(page, '#ps-clear'); await click(page, '#ps-clear'); });
    await step('round', async () => { await brushTo(page, 'round'); await stroke(page, '#ps-paper', L(0.55)); });
    await step('Clear the underdrawing', async () => { await click(page, '#ps-sketchClear'); });
    await step('underdrawing', async () => { await brushTo(page, 'sketch'); await stroke(page, '#ps-paper', L(0.62)); });
    await step('charcoal', async () => { await brushTo(page, 'pencil'); await stroke(page, '#ps-paper', L(0.69)); });
    await step('chisel', async () => { await brushTo(page, 'chisel'); await stroke(page, '#ps-paper', L(0.76)); });
    await step('round', async () => { await brushTo(page, 'round'); await stroke(page, '#ps-paper', L(0.83)); });
    await step('underdrawing', async () => { await brushTo(page, 'sketch'); await stroke(page, '#ps-paper', L(0.9)); });
    await step('eraser (underdrawing)', async () => { await eraserOn(page); await stroke(page, '#ps-paper', [[0.3, 0.88], [0.3, 0.97]]); });
    await step('chisel', async () => { await brushTo(page, 'chisel'); await stroke(page, '#ps-paper', L(0.94)); });
    await step('fan', async () => { await brushTo(page, 'blend'); await stroke(page, '#ps-paper', [[0.5, 0.5], [0.5, 0.85]]); });
    await step('round', async () => { await brushTo(page, 'round'); await stroke(page, '#ps-paper', L(0.4)); });
    await step('charcoal', async () => { await brushTo(page, 'pencil'); await stroke(page, '#ps-paper', L(0.3)); });
    await step('underdrawing', async () => { await brushTo(page, 'sketch'); await stroke(page, '#ps-paper', L(0.2)); });
    await step('eraser', async () => { await eraserOn(page); await stroke(page, '#ps-paper', [[0.45, 0.1], [0.45, 0.5]]); });
    const N = names.length; // 24 steps; sigs[k] is the state after k steps
    t.check(N === 24 && new Set(sigs).size >= 21, 'twenty-four steps of every tool (strokes of the six tools, Clear, Clear the underdrawing) each change the paper or the underdrawing', { steps: N, distinct: new Set(sigs).size });
    const undone = [];
    for (let k = 1; k <= 20; k++) { await click(page, '#ps-undo'); undone.push(await signature(page)); }
    const wrong = undone.map((sg, k) => (sg === sigs[N - 1 - k] ? null : `${k + 1} undo(s) should be the state after step ${N - 1 - k} (${names[N - 2 - k] || 'start'})`)).filter(Boolean);
    t.check(wrong.length === 0, 'twenty Undos walk back through the steps in exact reverse order, each restoring the layer that step drew on', wrong);
    t.check(await undoOff(page), 'after twenty Undos Undo is off: only the last 20 steps are kept');
    t.check(undone[19] === sigs[4], 'what is left is the painting as it stood after step 4 (the first four steps are beyond the last 20)', { names: names.slice(0, 4) });
    await page.keyboard.press('Control+z'); await click(page, '#ps-undo');
    t.check((await signature(page)) === sigs[4], 'Ctrl+Z and Undo with nothing left change nothing');
    await brushTo(page, 'chisel'); await stroke(page, '#ps-paper', L(0.5));
    const withNew = await signature(page);
    t.check(!(await undoOff(page)) && withNew !== sigs[4], 'a new stroke after the limit wakes Undo again');
    await click(page, '#ps-undo');
    t.check((await signature(page)) === sigs[4] && (await undoOff(page)), 'and Undo takes just that stroke back');
    await clean(t, page, 'round 2: Undo across the tools');
    await page.context().close();
  });
}

// ---- saved PNGs: the same bytes from any view, no metadata, every ground with every texture ------------------------------
export async function savedPngs(t, site) {
  await guard(t, 'round 2: saved PNGs', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    await brushTo(page, 'chisel'); await stroke(page, '#ps-paper', [[0.2, 0.2], [0.8, 0.3]]);
    await brushTo(page, 'sketch'); await stroke(page, '#ps-paper', [[0.2, 0.6], [0.8, 0.7]]);
    const a = await saveBuf(page);
    const b = await saveBuf(page);
    t.check(!!a && a.name === 'painting.png' && a.buf.readUInt32BE(16) === 900 && a.buf.readUInt32BE(20) === 1200, 'Save as PNG gives painting.png at the paper\'s 900 × 1200', a && { name: a.name, w: a.buf.readUInt32BE(16), h: a.buf.readUInt32BE(20) });
    t.check(!!a && !!b && a.buf.equals(b.buf), 'saving twice gives the same file, byte for byte');
    const chunks = a ? pngChunks(a.buf) : [];
    t.check(chunks[0] === 'IHDR' && chunks[chunks.length - 1] === 'IEND' && !chunks.some((c) => /^(tEXt|iTXt|zTXt|eXIf|tIME)$/.test(c)), 'the PNG carries no text, camera (Exif) or time chunk: README "carry no camera metadata"', chunks);
    // the view and the floating reference are not in the picture
    await setRange(page, 'ps-zoom', 400); await setRange(page, 'ps-panX', 100); await setRange(page, 'ps-panY', 100);
    const c = await saveBuf(page);
    await click(page, '#ps-refBtn'); await setRange(page, 'ps-refSize', 70); await click(page, '#ps-refSheet [data-ref-view="values"]');
    const d = await saveBuf(page);
    t.check(!!c && !!d && a && c.buf.equals(a.buf) && d.buf.equals(a.buf), 'at 4× zoom panned to a corner, and with the reference shown at 70% as Values, the saved picture is the same file', { zoom: c && c.buf.equals(a.buf), ref: d && d.buf.equals(a.buf) });
    await click(page, '#ps-fitBtn'); await click(page, '#ps-refSheet [data-ref-show="0"]');
    // every ground with every texture: the texture darkens the ground by a share, unevenly; with none the ground is even
    const GROUNDS = ['raw', 'gray', 'wash'], WEAVES = ['off', 'linen', 'paper'];
    await wipe(page);
    const grid = {};
    for (const g of GROUNDS) {
      await click(page, `#ps-root [data-ground="${g}"]`);
      for (const w of WEAVES) {
        await click(page, `#ps-root [data-weave="${w}"]`);
        const s = await saveBuf(page);
        grid[`${g}/${w}`] = s ? (await pngBoxes(page, s.buf, [[10, 10, 60, 60], [400, 600, 60, 60]])) : null;
      }
    }
    const bad = [];
    for (const g of GROUNDS) {
      const base = grid[`${g}/off`] && grid[`${g}/off`].boxes[1];
      if (!base || base.sd > 1.5 || base.alpha < 254.5) bad.push(`${g}/off is not an even, opaque ground: ${JSON.stringify(base)}`);
      for (const w of ['linen', 'paper']) {
        const cell = grid[`${g}/${w}`] && grid[`${g}/${w}`].boxes[1];
        if (!cell || !base) { bad.push(`${g}/${w}: no picture`); continue; }
        const ratios = cell.mean.map((v, i) => v / base.mean[i]);
        if (!(ratios.every((r) => r >= 0.8 && r <= 0.995) && cell.sd >= 1.0 && cell.alpha >= 254.5)) bad.push(`${g}/${w}: ratios ${ratios.map((r) => r.toFixed(3))}, spread ${cell.sd}`);
      }
    }
    t.check(bad.length === 0, 'in the saved PNG each of the three grounds is even without a texture, and linen or paper darkens it by 0.5 to 20% unevenly, still opaque', bad.length ? bad : Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, v && v.boxes[1].mean.join('/')])));
    await clean(t, page, 'round 2: saved PNGs');
    await page.context().close();
  });
}

// ---- Turn the paper: twice is the paper it was, byte for byte ------------------------------------------------------------
export async function turnThePaperTwice(t, site) {
  await guard(t, 'round 2: Turn the paper', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    const hash = (id) => page.evaluate((id) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261, a = 0; for (let i = 0; i < d.length; i += 4) { a += d[i + 3]; h ^= d[i + 3]; h = Math.imul(h, 16777619); h ^= d[i]; h = Math.imul(h, 16777619); } return `${c.width}x${c.height}:${a}:${(h >>> 0).toString(16)}`; }, id);
    const all = async () => [await hash('ps-paper'), await hash('ps-sketch'), await hash('ps-ground'), await hash('ps-weave')].join(' ');
    await click(page, '#ps-root [data-ground="wash"]'); await click(page, '#ps-root [data-weave="linen"]');
    await brushTo(page, 'round'); await stroke(page, '#ps-paper', [[0.1, 0.1], [0.6, 0.3], [0.4, 0.8]]);
    await brushTo(page, 'sketch'); await stroke(page, '#ps-paper', [[0.2, 0.7], [0.9, 0.2]]);
    const s0 = await all();
    await click(page, '#ps-orient'); const s1 = await all();
    await click(page, '#ps-orient'); const s2 = await all();
    const dims = (s) => s.split(' ').map((x) => x.split(':')[0]);
    const alphas = (s) => s.split(' ').slice(0, 2).map((x) => x.split(':')[1]);
    t.check(dims(s0).every((d) => d === '900x1200') && dims(s1).every((d) => d === '1200x900') && dims(s2).every((d) => d === '900x1200'), 'turning the paper turns all four layers (paint, underdrawing, ground, texture) to 1200 × 900 and back to 900 × 1200', { s0: dims(s0), s1: dims(s1), s2: dims(s2) });
    t.check(alphas(s1).join() === alphas(s0).join(), 'a turn keeps every mark: the same amount of paint and underdrawing on the turned paper', { before: alphas(s0), turned: alphas(s1) });
    t.check(s2 === s0, 'turning twice gives back the paper, underdrawing, ground and texture exactly as they were', { s0, s2 });
    await click(page, '#ps-orient'); await click(page, '#ps-orient'); await click(page, '#ps-orient'); await click(page, '#ps-orient');
    t.check((await all()) === s0, 'four more turns still give the same layers (no blur builds up)');
    await clean(t, page, 'round 2: Turn the paper');
    await page.context().close();
  });
}

// ---- the Studio's palette follows the Study tab through different photos, and the reference through odd shapes ------------
export async function paletteAndReferenceOnOddPhotos(t, site) {
  await guard(t, 'round 2: the palette follows the Study tab through photos', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    const info = () => page.evaluate(() => { const cur = window.StudioPalette && StudioPalette.current(); const shown = [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code); const sel = document.getElementById('ps-palette'); return { current: cur && cur.codes.slice().sort().join(' '), chosen: cur && cur.chosen, shown: shown.slice().sort().join(' '), option: sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text, mixes: document.querySelectorAll('#ps-mixes .ps-mix').length, wash: document.getElementById('ps-washName').textContent }; });
    const rows = [];
    const first = await info(); rows.push({ photo: 'sample', ...first });
    for (const [draw, w, h] of [['noise', 500, 625], ['portrait', 600, 800], ['white', 300, 400], ['black', 300, 400], ['flat', 300, 400]]) {
      await page.evaluate(() => { window.__r0 = Studio.result(); });
      await loadPhoto(page, await makeImage(page, { width: w, height: h, draw, name: `${draw}.png` }), { settle: 200 });
      await restudied(page);
      // the Studio follows once the Study tab has ranked the palettes for the new photo
      await page.waitForFunction(() => { const cur = window.StudioPalette && StudioPalette.current(); const shown = [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code); return cur && cur.codes.slice().sort().join(' ') === shown.slice().sort().join(' '); }, null, { timeout: 20000 }).catch(() => null);
      rows.push({ photo: draw, ...(await info()) });
    }
    const off = rows.filter((r) => r.current !== r.shown || r.mixes < 8);
    t.check(off.length === 0, 'after each new photo (noise, a portrait, all white, all black, flat gray) the Studio shows the paints of the palette the Study tab is using, with its eight starting skin tones', off.length ? off : rows.map((r) => `${r.photo}: ${r.option}`));
    t.note(`the palette the Studio followed for each photo: ${rows.map((r) => `${r.photo} -> ${r.option}`).join('; ')}`);
    await clean(t, page, 'round 2: palette through photos');
    await page.context().close();
  });

  await guard(t, 'round 2: the reference on very wide and very tall photos', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    const rows = [];
    for (const [name, w, h] of [['wide 8:1', 4000, 500], ['tall 1:3', 500, 1500], ['tall 1:6', 300, 1800], ['tall 1:8', 300, 2400], ['tall 1:8 again', 200, 1600]]) {
      await page.evaluate(() => { window.__r0 = Studio.result(); });
      await loadPhoto(page, await makeImage(page, { width: w, height: h, name: `${name.replace(/\W+/g, '-')}.png` }), { settle: 200 });
      await restudied(page);
      await page.waitForFunction(([a]) => { const c = document.getElementById('ps-refCanvas'); return c.width > 0 && Math.abs(c.width / c.height - a) < 0.03; }, [w / h], { timeout: 20000 }).catch(() => null);
      await click(page, '#ps-refBtn');
      const per = [];
      for (const view of ['original', 'values', 'blocks']) {
        await click(page, `#ps-refSheet [data-ref-view="${view}"]`);
        for (const size of [20, 70]) {
          await setRange(page, 'ps-refSize', size);
          const r = await page.evaluate(() => { const rect = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; }; const c = document.getElementById('ps-refCanvas'); return { fig: rect('ps-refFig'), stage: rect('ps-stage'), canvas: [c.width, c.height], size: document.getElementById('ps-refSize').value, max: document.getElementById('ps-refSize').max, out: document.getElementById('ps-refSizeOut').textContent }; });
          per.push({ view, size, ...r, inStage: r.fig.x >= r.stage.x - 1 && r.fig.y >= r.stage.y - 1 && r.fig.r <= r.stage.r + 1 && r.fig.b <= r.stage.b + 1 });
        }
      }
      rows.push({ name, shape: per[0].canvas, inStage: per.every((p) => p.inStage), outOfStage: per.filter((p) => !p.inStage).slice(0, 1).map((p) => ({ fig: p.fig, stage: p.stage, size: p.size, max: p.max })) });
    }
    const out = rows.filter((r) => !r.inStage);
    t.check(rows[0].inStage && rows[1].inStage, 'a very wide photo (8:1) and a tall one (1:3) float inside the Studio in every view at 20% and 70%', rows.slice(0, 2));
    t.check(out.length === 0, 'the floating reference stays inside the Studio for photos as tall as 1:6 and 1:8, in every view and size', out);
    if (out.length) t.finding({ title: 'The floating reference of a very tall photo (1:6 or taller) is taller than the Studio, and its top, with the Original / Values / Blocks switch, sits above the top of the window', severity: 'low',
      steps: '1. Open the Studio. 2. Load a photo that is much taller than wide (for example 300 × 2400, as a long screenshot or a strip). 3. Look at the reference at its default size, then at 20%.',
      expected: 'README: the reference floats "over the paper where you drag it" and can be sized or hidden; js/painting.js line 622-627 says its picture "has to fit the stage\'s height too", so the slider stops short of a size that is not shown. The figure with its switch is on the stage.',
      actual: `${out.map((r) => { const o = r.outOfStage[0]; return `${r.name} (${r.shape.join(' × ')}): the figure is ${o.fig.w} × ${o.fig.h} px at y ${o.fig.y} to ${o.fig.b} in a stage that runs y ${o.stage.y} to ${o.stage.b}; the size slider is held at ${o.max}%`; }).join('; ')}.`,
      cause: 'js/painting.js 617-631: sizeReference() never lets the figure be narrower than 0.2 of the stage\'s shorter side (Math.max(0.2 * side, ...) on line 623), so a picture 1:8 is 8 times that wide in height, taller than the stage; clampReference() (634-643) cannot move a figure bigger than the stage inside it, and its min/max puts the top above the stage.' });
    await clean(t, page, 'round 2: reference on odd photos');
    await page.context().close();
  });
}

// ---- Ctrl+Z pressed while a stroke is still being drawn -----------------------------------------------------------------
export async function undoDuringAStroke(t, site) {
  await guard(t, 'round 2: Ctrl+Z in the middle of a stroke', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    const total = () => inkIn(page, '#ps-paper', 0, 0, 1, 1);
    const rows = [];
    for (const y of [0.4, 0.7]) {
      await wipe(page);
      await stroke(page, '#ps-paper', [[0.1, 0.1], [0.5, 0.12]]);
      const base = await total();
      await holdStroke(page, [[0.1, y], [0.4, y]]);
      const mid = await total();
      await page.keyboard.press('Control+z');
      const undone = await total();
      const b = await page.locator('#ps-paper').boundingBox();
      await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * y, { steps: 6 });
      const further = await total();
      await page.mouse.up(); await sleep(200);
      rows.push({ y, base, mid, undone, further, end: await total() });
    }
    const ok = rows.every((r) => r.mid > r.base + 200 && r.undone === r.base && r.further === r.undone && r.end === r.base);
    t.check(ok, 'Ctrl+Z pressed in the middle of a stroke takes that stroke back and the rest of it, drawn as the pointer moves on, is not left on the paper', rows);
    if (!ok) t.finding({ title: 'Ctrl+Z in the middle of a stroke takes back what was drawn so far, but the stroke carries on and its rest stays on the paper, out of reach of Undo', severity: 'low',
      steps: '1. In the Studio draw one stroke. 2. Press and hold the mouse for a second stroke and move across the paper. 3. Press Ctrl+Z with the button still down, then move on and let go.',
      expected: 'README: "Undo (or Ctrl/⌘+Z; the last 20 steps)" takes back the last step: here the stroke in hand. Nothing more of it lands, and the first stroke is still there.',
      actual: `In ${rows.length} trials (a stroke at y ${rows.map((r) => r.y).join(' and ')}): the stroke so far was ${rows[0].mid - rows[0].base} inked pixels, Ctrl+Z took it back to ${rows[0].undone} (the first stroke alone is ${rows[0].base}), the pointer moving on laid ${rows[0].further - rows[0].undone} more, and after letting go the paper holds ${rows[0].end - rows[0].base} pixels of that stroke's rest; one more Undo then takes back the first stroke together with it.`,
      cause: 'js/painting.js 351-365 and 380: pointerdown takes the snapshot for the stroke (snapshot()) and the Ctrl+Z handler (545-552) pops it and puts it back whole, but the stroke in hand (last, strokeId) is not ended, so pointermove (372-377) keeps stamping from the old position onto the restored layer; the snapshot of that stroke is gone, so the rest cannot be undone by itself.' });
    await clean(t, page, 'round 2: Ctrl+Z mid-stroke');
    await page.context().close();
  });
}

// ---- the wash, with each paint of the palette ------------------------------------------------------------------------------
export async function washWithEachPaint(t, site) {
  await guard(t, 'round 2: a wash of each paint of the palette', async () => {
    const page = await openPage(site, { url: '#paint' }); await studioReady(page);
    await click(page, '#ps-root [data-ground="wash"]');
    const ground = () => page.evaluate(() => [...document.getElementById('ps-ground').getContext('2d').getImageData(450, 600, 1, 1).data].slice(0, 3));
    const raw = (await (async () => { await click(page, '#ps-root [data-ground="raw"]'); const g = await ground(); await click(page, '#ps-root [data-ground="wash"]'); return g; })());
    const info = await page.evaluate(() => [...document.querySelectorAll('#ps-washRow button')].map((b) => ({ title: b.title, label: b.getAttribute('aria-label') })));
    const rows = [];
    for (let i = 0; i < info.length; i++) {
      await page.evaluate((i) => document.querySelectorAll('#ps-washRow button')[i].click(), i);
      const st = await page.evaluate(() => ({ pressed: [...document.querySelectorAll('#ps-washRow button')].filter((b) => b.getAttribute('aria-pressed') === 'true').length, name: document.getElementById('ps-washName').textContent }));
      rows.push({ paint: info[i].title, g: await ground(), ...st });
    }
    const dist = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
    const bad = rows.filter((r, i) => r.pressed !== 1 || r.name !== info[i].title || (!/white/i.test(r.paint) && dist(r.g, raw) < 1) || dist(r.g, raw) > 120);
    t.check(info.length >= 5 && bad.length === 0, 'a wash of each paint of the palette: exactly one paint is pressed, the sheet names it, and the ground is a pale tint of it (changed from the raw canvas, never darker than a thin wash)', bad.length ? bad : { paints: info.length, raw });
    // the tint is the paint's: warmer paints (an earth, a red) give a ground with more red than blue than a blue does
    const byName = Object.fromEntries(rows.map((r) => [r.paint, r.g]));
    const warm = rows.find((r) => /sienna|ochre|umber|red|madder/i.test(r.paint)), cool = rows.find((r) => /blue|green|viridian/i.test(r.paint));
    if (warm && cool) t.check(warm.g[0] - warm.g[2] > cool.g[0] - cool.g[2], 'and the ground follows the paint: an earth or red gives a warmer ground than a blue or green does', { warm: [warm.paint, warm.g], cool: [cool.paint, cool.g] });
    await clean(t, page, 'round 2: wash with each paint');
    await page.context().close();
  });
}

// ---- a kept mix tapped into the well, then the palette changes -------------------------------------------------------------------
export async function mixInHandWhenThePaletteChanges(t, site) {
  await guard(t, 'round 2: a mix in the well when the palette changes', async () => {
    const results = {};
    for (const way of ['menu', 'study']) {
      const page = await openPage(site, { url: '#paint' }); await studioReady(page);
      const read = () => page.evaluate(() => ({ rowHidden: document.getElementById('ps-picked').hidden, row: document.getElementById('ps-pickedRecipe').textContent, well: document.getElementById('ps-wellParts').textContent, pressed: [...document.querySelectorAll('#ps-mixes .ps-mix')].filter((m) => m.getAttribute('aria-pressed') === 'true').length, mixes: document.querySelectorAll('#ps-mixes .ps-mix').length, palette: document.getElementById('ps-palette').selectedOptions[0].text }));
      await click(page, '#ps-colorBtn');
      await page.evaluate(() => { const p = document.querySelectorAll('#ps-paints .ps-paint'); p[1].click(); p[2].click(); document.getElementById('ps-lock').click(); });
      await click(page, '#ps-colorBtn');
      await page.evaluate(() => { const m = document.querySelectorAll('#ps-mixes .ps-mix'); m[m.length - 1].click(); });
      const picked = await read();
      t.check(!picked.rowHidden && /is in the well/.test(picked.row) && !/^Empty/.test(picked.well) && picked.pressed === 1, `${way}: a kept mix tapped puts its parts in the well and the sheet says it is in the well`, picked);
      if (way === 'menu') {
        // the Studio's own palette menu
        await page.evaluate(() => { const sel = document.getElementById('ps-palette'); const other = [...sel.options].find((o) => o.value !== sel.value); sel.value = other.value; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      } else {
        // the Study tab's palette, which an untouched Studio follows
        const was = await page.evaluate(() => StudioPalette.current().codes.slice().sort().join());
        await tab(page, 'study'); await studyPalette(page, was === ['CRL', 'IB', 'TW', 'YO'].sort().join() ? 'rembrandt' : 'zorn');
        await tab(page, 'paint'); await studioReady(page);
      }
      const after = await read();
      results[way] = { picked: picked.palette, after };
      await clean(t, page, `round 2: a mix in the well and the palette (${way})`);
      await page.context().close();
    }
    const consistent = (r) => r.rowHidden || !/is in the well/.test(r.row) || !/^Empty/.test(r.well);
    const changed = (w) => results[w].picked !== results[w].after.palette;
    t.check(changed('menu') && changed('study'), 'the palette did change both ways (the Paints menu, and the Study tab\'s choice followed by the Studio)', results);
    const ok = consistent(results.menu.after) && consistent(results.study.after);
    t.check(ok, 'when the palette changes and the well is emptied, the sheet no longer says a mix "is in the well"', results);
    if (!ok) { const bad = !consistent(results.menu.after) ? results.menu : results.study; t.finding({ title: 'After the palette changes the Paints sheet still says a kept mix "is in the well" while the well is empty and no mix is selected', severity: 'low',
      steps: '1. In the Studio open Paints, lock in a mix and tap it in My mixes (the sheet says "Mix 9 (YO 1 · RS 1) is in the well: add paint to build on it"). 2. Change the palette in the Paints sheet, or pick another palette on the Study tab and come back.',
      expected: 'README: "tap a kept mix to paint with it and to put its parts back in the well, ready to build on". When the palette changes the well is emptied and the starting mixes are made again, so the line about the mix in the well goes (as it does when the well is mixed afresh: showWell hides it).',
      actual: `${['menu', 'study'].filter((w) => !consistent(results[w].after)).join(' and ')}: after the palette went from ${bad.picked} to ${bad.after.palette} the sheet still shows "${bad.after.row}" with its Remove button, over a well that reads "${bad.after.well}", with ${bad.after.pressed} mix pressed and the brush colour back on the first starter. Remove would then delete the mix the row names, though it is no longer the mix in hand.`,
      cause: 'js/painting.js 887 (applyPalette) empties the well (state.well = []) and 868-873 (seedMixes) replaces the starters and sets the colour, but nothing resets `picked` (777) or hides #ps-picked; showWell() (786) hides it only when the well holds a mix, and an empty well does not.' }); }
  });
}

export async function round2(t, site) {
  await reloadMidStroke(t, site);
  await clearJustAfterLoad(t, site);
  await extremesOfEveryBrush(t, site);
  await undoAcrossTools(t, site);
  await undoDuringAStroke(t, site);
  await savedPngs(t, site);
  await washWithEachPaint(t, site);
  await mixInHandWhenThePaletteChanges(t, site);
  await turnThePaperTwice(t, site);
  await paletteAndReferenceOnOddPhotos(t, site);
  t.note('round 2, left out: hostile record sizes of 16384 x 16384 or 8192 x 8192 (256 MB to 1 GB per canvas layer in the renderer: not safe on a shared machine; the version-2 database path is covered by the first round); a 100 x 100 blob under a 900 x 1200 record is a tampered record the site never writes.');
  t.note('round 2, not promised either way (noted, not findings): there is no redo (Ctrl+Shift+Z and Ctrl+Y do nothing: the README names Undo only); after an underdrawing stroke is undone, or the underdrawing is cleared, the eraser still aims at the (now empty) underdrawing until a paint stroke is drawn, and its status pill says "underdrawing" (the README: "whichever layer was drawn on last"); choosing My paints with all 77 paints ticked takes about 2 s on this loaded machine (40 paints about 0.6 s) to find the eight starting skin tones, since every pair of paints is tried with seven proportions and seven whites; the reference and the dealt portrait are not saved with the painting.');
  t.note('round 2, what the page does when a stroke is held at a reload: only a stroke that has ended is saved (saveSoon runs at pointerup), so the held stroke is gone and the strokes before it come back; letting go on the new page draws nothing.');
}
