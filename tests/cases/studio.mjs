// The Studio tab, playtested like a sceptical tester hunting edge cases: every brush and the eraser at
// their extremes, strokes off the paper, a 200-stroke session and Undo through it, Clear twice and Undo
// after, Turn the paper with content, zoom to 4× and pan to the corners, Fit to screen, the reference
// in every form (the Study photo, values, blocks, a dealt portrait and Another, size, hide, drag, a photo
// and a refused file loaded from here), the paints (the well, amounts, Lock in, My mixes across a reload),
// the canvas (every ground, each wash strength, both textures, Save as PNG), Copy the Study lines with and
// without lines, the one-time saving note, autosave and restore, hostile IndexedDB records and
// localStorage values, Ctrl/⌘+Z, and the phone layout (strip at the bottom, sheets, the exit arrow, the
// header hidden while painting). README: "Studio" and the autosave paragraph of "Simple and Advanced".
import fs from 'node:fs';
import { openPage, clean, tab, PHONE, stroke, storageKeys, storageGet, click, text, visible, hscroll, screenshot, sleep, makeImage, loadPhoto, textFile } from '../lib.mjs';

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
  const since = Date.now();
  await stroke(page, '#ps-paper', [[0.2, 0.3], [0.6, 0.6]]);
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
    t.note(inkAfter === inkBefore ? 'a stroke followed at once by a reload is kept (the save on pagehide made it)' : `a stroke followed at once by a reload, inside the 1.5 s autosave delay, is lost (${inkBefore} → ${inkAfter}); everything saved before it is kept`);
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
}
