// The Study tab's tool bar, played like a sceptical tester (README: "Grid and reference lines", "Measure in
// units: plumb lines and levels", the magnifier and picked colors; source js/app.js): the magnifier and its
// picks, lines (zero-length drags, drags off the image, Shift snapping, the loupe's tilt, every color, undo
// and clear), measures (the unit, fraction labels read through the loupe, Make last line the unit, Unit on my
// canvas with every kind of input, cm and inch rounding, a measure across the whole image, twenty-plus
// measures), plumb points (drop, drag, remove, many, Esc), Ctrl/⌘+Z ordering across the three tools, the
// grid steps, what a new photo clears (and what a rejected file must not), Save PNG with every overlay on,
// hostile saved state for the two keys the tools read, the tools under a touch on a 390 px phone, and
// keyboard-only operation.
import fs from 'node:fs';
import { openPage, clean, tab, PHONE, DESKTOP, makeImage, loadPhoto, pasteFile, textFile, brokenImage, svgImage, storageGet, click, text, visible, hscroll, sleep, app, newTab, axe } from '../lib.mjs';

const PALETTE_KEY = 'portrait-value-studio.palette';
const CANVAS_KEY = 'portrait-value-studio.canvasUnit';
const DRAWERS_KEY = 'portrait-value-studio.drawers';
const COLORS = { lcRed: '#e5322d', lcCyan: '#1ec8ec', lcYellow: '#ffd21f', lcWhite: '#ffffff', lcBlack: '#111111' };
const UNIT_COLOR = '#ffd21f';
const MEASURE_COLOR = '#ffffff';

// ---- helpers of this case -------------------------------------------------------------------------------

// a fresh box every time: choosing a tool shows the options row above the images, which moves them
const box = (page, sel = '#cv-orig') => page.locator(sel).first().boundingBox();
const count = (page, tool) => page.evaluate((t) => +(document.querySelector(`[data-tool="${t}"]`).dataset.count || 0), tool);
const pressed = (page, sel) => page.evaluate((s) => document.querySelector(s).getAttribute('aria-pressed'), sel);
const disabled = (page, sel) => page.evaluate((s) => document.querySelector(s).disabled, sel);
const swatches = (page) => page.evaluate(() => [...document.querySelectorAll('#swatches .swatch-meta')].map((m) => ({ hex: m.firstChild.textContent, v: +m.querySelector('.v').textContent.replace('V ', '') })));
const resetToast = (page) => page.evaluate(() => { const e = document.getElementById('toast'); e.textContent = ''; e.classList.remove('show'); });
const toastShown = (page) => page.evaluate(() => { const e = document.getElementById('toast'); return e.classList.contains('show') ? e.textContent.trim() : ''; });
const loupe = (page) => page.evaluate(() => ({ shown: !document.getElementById('loupe').hidden, hex: document.getElementById('loupeHex').textContent.trim(), val: document.getElementById('loupeVal').textContent.trim() }));
const hexAt = (page, id, fx, fy) => page.evaluate(([id, fx, fy]) => { const c = document.getElementById(id); const x = Math.floor(fx * c.width), y = Math.floor(fy * c.height); const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); }, [id, fx, fy]);
// does the overlay over a view hold a pixel of this color within `reach` px of the point (fractions of the image)?
const overlayHas = (page, id, fx, fy, color, reach = 4, tol = 28) => page.evaluate(([id, fx, fy, color, reach, tol]) => {
  const o = document.getElementById(id).nextElementSibling; if (!o.width) return false;
  const g = o.getContext('2d'); const cx = Math.round(fx * o.width), cy = Math.round(fy * o.height);
  const want = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const x0 = Math.max(0, cx - reach), y0 = Math.max(0, cy - reach);
  const d = g.getImageData(x0, y0, Math.min(o.width - x0, 2 * reach + 1), Math.min(o.height - y0, 2 * reach + 1)).data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && Math.abs(d[i] - want[0]) <= tol && Math.abs(d[i + 1] - want[1]) <= tol && Math.abs(d[i + 2] - want[2]) <= tol) return true;
  return false;
}, [id, fx, fy, color, reach, tol]);
// how many pixels of a view's overlay are drawn at all (0 = nothing shows there)
const overlayInk = (page, id) => page.evaluate((id) => { const o = document.getElementById(id).nextElementSibling; if (!o.width) return 0; const d = o.getContext('2d').getImageData(0, 0, o.width, o.height).data; let n = 0; for (let i = 3; i < d.length; i += 8) if (d[i] > 0) n++; return n; }, id);
const pngDims = (buf) => (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);
async function download(page, act, timeout = 8000) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), act()]);
  if (!dl) return null;
  const p = await dl.path().catch(() => null);
  return { name: dl.suggestedFilename(), buf: p ? fs.readFileSync(p) : Buffer.alloc(0) };
}
async function setTool(page, tool) {
  const on = (await pressed(page, `[data-tool="${tool}"]`)) === 'true';
  if (!on) await click(page, `[data-tool="${tool}"]`);
  await page.waitForFunction((t) => document.body.classList.contains('tool-' + t), tool, { timeout: 2000 }).catch(() => null);
}
// a mouse drag from a point (fractions of the image) by exact css pixels; `during` reads the page before the button goes up
async function dragPx(page, fx, fy, dx, dy, { shift = false, during = null, steps = 6, sel = '#cv-orig', mid = true } = {}) {
  const b = await box(page, sel);
  const x0 = Math.round(b.x + fx * b.width), y0 = Math.round(b.y + fy * b.height);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  if (mid) await page.mouse.move(x0 + Math.round(dx / 2), y0 + Math.round(dy / 2), { steps });
  await page.mouse.move(x0 + dx, y0 + dy, { steps });
  await sleep(30);
  const r = during ? await during() : null;
  if (shift) await page.keyboard.up('Shift');
  await page.mouse.up();
  await sleep(30);
  return { r, b, x0, y0 };
}
const dragFrac = (page, from, to, opts = {}) => box(page, opts.sel).then((b) => dragPx(page, from[0], from[1], Math.round((to[0] - from[0]) * b.width), Math.round((to[1] - from[1]) * b.height), opts));
async function tapAt(page, fx, fy, sel = '#cv-orig') {
  const b = await box(page, sel);
  await page.mouse.move(Math.round(b.x + fx * b.width), Math.round(b.y + fy * b.height));
  await page.mouse.down(); await page.mouse.up(); await sleep(30);
}
const hover = async (page, fx, fy, sel = '#cv-orig') => { const b = await box(page, sel); await page.mouse.move(Math.round(b.x + fx * b.width), Math.round(b.y + fy * b.height)); await sleep(40); };
const expectText = (t, got, want, title) => t.check(got === want, title, { got, want });
// the canvas length is typed as a visitor would (Playwright's fill refuses letters in a number field)
async function setSize(page, value) { await page.focus('#canvasSize'); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace'); if (value !== '') await page.keyboard.type(value); await page.keyboard.press('Tab'); await sleep(30); }
const toastSaid = (page, re, timeout = 1500) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source, { timeout }).then(() => true).catch(() => false);

// ---- helpers of the coverage additions (the blocks after the keyboard one) ------------------------------------
const setRange = (page, id, v) => app(page).evaluate(([i, val]) => { const e = document.getElementById(i); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
// the page has finished its work (the busy line is hidden), then a moment for the paint
const settled = (page, timeout = 60000) => app(page).waitForFunction(() => document.getElementById('busy').hidden, null, { timeout }).then(() => true).catch(() => false).then(async (ok) => { await sleep(120); return ok; });
// the Check my painting drawer has its score (the example is scored when the #check route opens)
const scored = (page) => app(page).waitForFunction(() => { const b = document.getElementById('checkBody'); return !!b && !b.hidden && document.getElementById('busy').hidden; }, null, { timeout: 60000 }).then(() => true).catch(() => false).then(async (ok) => { await sleep(150); return ok; });
const inView = (page, sel) => app(page).evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel).then(() => sleep(150));
// the label pills drawn on each overlay ('ov:<view id>') and on the accuracy map (its canvas id), read off the 2D
// context's own calls: a recorder only, every call goes on to the real method
async function recordPills(page) {
  await app(page).evaluate(() => {
    if (window.__pillRec) return;
    const rec = (window.__pillRec = {});
    const P = CanvasRenderingContext2D.prototype;
    const keyOf = (g) => { const c = g.canvas; return c.classList.contains('overlay') ? 'ov:' + (c.previousElementSibling ? c.previousElementSibling.id : '') : c.id; };
    const clearRect = P.clearRect, roundRect = P.roundRect, fill = P.fill, fillText = P.fillText;
    P.clearRect = function (...a) { if (this.canvas) rec[keyOf(this)] = []; return clearRect.apply(this, a); };
    P.roundRect = function (x, y, w, h, ...rest) { if (this.canvas) { const k = keyOf(this); (rec[k] = rec[k] || []).push({ x, y, w, h, fill: null, ink: null, text: null }); } return roundRect.call(this, x, y, w, h, ...rest); };
    P.fill = function (...a) { const l = this.canvas && rec[keyOf(this)]; const last = l && l[l.length - 1]; if (last && last.fill === null) last.fill = this.fillStyle; return fill.apply(this, a); };
    P.fillText = function (s, ...a) { const l = this.canvas && rec[keyOf(this)]; const last = l && l[l.length - 1]; if (last && last.fill !== null && last.text === null) { last.text = String(s); last.ink = this.fillStyle; } return fillText.call(this, s, ...a); };
  });
}
const pillsOf = (page, key) => app(page).evaluate((k) => ((window.__pillRec && window.__pillRec[k]) || []).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, fill: p.fill, ink: p.ink, text: p.text })), key);
// the drawing size of a view's canvas, or of its overlay
const sizeOf = (page, id, overlay = false) => app(page).evaluate(([i, o]) => { const c = document.getElementById(i); const e = o ? c.nextElementSibling : c; return { w: e.width, h: e.height }; }, [id, overlay]);
// the pixel of an overlay at a point given as fractions of the image
const ovPixel = (page, id, fx, fy) => app(page).evaluate(([i, x, y]) => { const o = document.getElementById(i).nextElementSibling; const px = Math.min(o.width - 1, Math.floor(x * o.width)), py = Math.min(o.height - 1, Math.floor(y * o.height)); return [...o.getContext('2d').getImageData(px, py, 1, 1).data]; }, [id, fx, fy]);
// how many pixels of an overlay inside a box (fractions) are the dark label ink (opaque enough, near 20, 21, 24)
const darkInside = (page, id, bx) => app(page).evaluate(([i, b]) => { const o = document.getElementById(i).nextElementSibling; const x0 = Math.floor(b.x * o.width), y0 = Math.floor(b.y * o.height); const d = o.getContext('2d').getImageData(x0, y0, Math.max(1, Math.ceil(b.w * o.width)), Math.max(1, Math.ceil(b.h * o.height))).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 190 && d[k] < 40 && d[k + 1] < 40 && d[k + 2] < 40) n++; return n; }, [id, bx]);
const DARK_FILL = 'rgba(20, 21, 24, 0.78)';
const RGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const RED = RGB(COLORS.lcRed), YELLOW = RGB(UNIT_COLOR), WHITE = [255, 255, 255];
const near = (px, rgb, tol = 30) => !!px && Math.abs(px[0] - rgb[0]) <= tol && Math.abs(px[1] - rgb[1]) <= tol && Math.abs(px[2] - rgb[2]) <= tol;
const hexOf = (px) => '#' + px.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// the nearest distance from a box to a segment, sampled along the segment (both in the same units)
const distBoxSeg = (bx, [x1, y1, x2, y2]) => { let best = Infinity; for (let i = 0; i <= 60; i++) { const x = x1 + (x2 - x1) * i / 60, y = y1 + (y2 - y1) * i / 60; const dx = Math.max(bx.x - x, 0, x - (bx.x + bx.w)), dy = Math.max(bx.y - y, 0, y - (bx.y + bx.h)); best = Math.min(best, Math.hypot(dx, dy)); } return best; };
// a saved PNG read in the page: pixels at points (fractions), white counts down columns (fraction x), the share of
// white inside rectangles (fractions), and the picture's size
async function pngRead(page, buf, { points = [], columns = [], rects = [] } = {}) {
  return app(page).evaluate(async ([b64, pts, cols, rs]) => {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const all = g.getImageData(0, 0, c.width, c.height).data;
    const at = (fx, fy) => { const x = Math.min(c.width - 1, Math.floor(fx * c.width)), y = Math.min(c.height - 1, Math.floor(fy * c.height)); const k = (y * c.width + x) * 4; return [all[k], all[k + 1], all[k + 2], all[k + 3]]; };
    const white = (k) => all[k] > 220 && all[k + 1] > 220 && all[k + 2] > 220;
    const column = (fx) => { const x = Math.min(c.width - 1, Math.floor(fx * c.width)); let n = 0; for (let y = 0; y < c.height; y++) if (white((y * c.width + x) * 4)) n++; return n; };
    const share = ([fx, fy, fw, fh]) => { const x0 = Math.floor(fx * c.width), y0 = Math.floor(fy * c.height), x1 = Math.min(c.width, Math.ceil((fx + fw) * c.width)), y1 = Math.min(c.height, Math.ceil((fy + fh) * c.height)); let n = 0, m = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { m++; if (white((y * c.width + x) * 4)) n++; } return m ? n / m : 0; };
    return { size: [c.width, c.height], px: pts.map(([fx, fy]) => at(fx, fy)), cols: cols.map(column), rects: rs.map(share) };
  }, [buf.toString('base64'), points, columns, rects]);
}

export default async function studyTools(t, site) {
  // ---- magnifier and picked colors ------------------------------------------------------------------------
  {
    const page = await openPage(site);
    await click(page, '#drawer-swatches summary'); await sleep(100);
    t.check((await pressed(page, '[data-tool="sample"]')) === 'true', 'the magnifier is on at the start');
    t.check(!(await visible(page, '#toolOptions')), 'with the magnifier the options row is away');
    t.note('TOOL_HINTS.sample ("Hover any image to see the color…") is never shown: the options row that holds #toolHint is hidden with the magnifier (styles.css 464 lists tool-line/measure/plumb/none only); the Picked colors drawer carries its own how-to instead.');
    await hover(page, 0.5, 0.42);
    let l = await loupe(page);
    const under = await hexAt(page, 'cv-orig', 0.5, 0.42);
    t.check(l.shown && l.hex === under, 'hovering shows the loupe with the hex of the pixel under the pointer', { loupe: l, under });
    t.check(/^V (10|\d(\.\d)?)$/.test(l.val), 'the loupe gives the value on a 0–10 scale', l.val);
    await tapAt(page, 0.5, 0.42);
    const first = under;
    t.check((await toastShown(page)) === `Added ${first}`, 'a click says the color was added', await toastShown(page));
    let list = await swatches(page);
    t.check(list.length === 1 && list[0].hex === first, 'the picked color is in the list with its hex', list);
    t.check((await text(page, '#swatchesState')) === '1 color' && (await text(page, '#palCount')) === '1 color', 'the drawer header and the count say 1 color', [await text(page, '#swatchesState'), await text(page, '#palCount')]);
    const saved = JSON.parse((await storageGet(page, PALETTE_KEY)) || 'null');
    t.check(Array.isArray(saved) && saved.length === 1 && typeof saved[0].r === 'number', 'the pick is kept in the browser (localStorage)', saved);
    await tapAt(page, 0.5, 0.42);
    t.check((await toastShown(page)) === `${first} is already in Picked colors`, 'the same spot twice says it is already picked', await toastShown(page));
    t.check((await swatches(page)).length === 1, 'the same spot twice adds nothing');
    // many picks across the portrait, the loupe's hex at each spot
    const seen = new Set([first]);
    for (const [fx, fy] of [[0.1, 0.1], [0.9, 0.9], [0.5, 0.25], [0.5, 0.55], [0.3, 0.85], [0.7, 0.4], [0.2, 0.5], [0.8, 0.15], [0.5, 0.95], [0.05, 0.6], [0.95, 0.3], [0.42, 0.41]]) {
      await hover(page, fx, fy);
      seen.add((await loupe(page)).hex);
      await tapAt(page, fx, fy);
    }
    list = await swatches(page);
    t.check(list.length === seen.size && list.every((c) => seen.has(c.hex)), 'many picks: the list holds every distinct color once', { list: list.length, distinct: seen.size });
    t.check((await text(page, '#palCount')) === `${list.length} colors`, 'the count says how many', await text(page, '#palCount'));
    await click(page, '#palSort'); await sleep(50);
    list = await swatches(page);
    t.check(list.every((c, i) => !i || c.v >= list[i - 1].v), 'Sort dark to light orders by value', list.map((c) => c.v));
    const sortedSaved = JSON.parse(await storageGet(page, PALETTE_KEY));
    t.check(sortedSaved.length === list.length, 'the sorted list is saved');
    // copy as hex: headless Chromium may refuse the clipboard; either way the page must say what happened
    await resetToast(page);
    await click(page, '#palCopy');
    await toastSaid(page, /Copied|Copying/);
    const copyToast = await text(page, '#toast');
    const fallbackShown = await visible(page, '#copyFallback');
    const fallbackText = await page.evaluate(() => document.getElementById('copyFallback').value);
    const hexes = list.map((c) => c.hex).join('\n');
    if (/Copying is blocked/.test(copyToast)) {
      t.check(fallbackShown && fallbackText === hexes, 'clipboard refused: the page says so and offers the hex codes selected in a box', { copyToast, fallbackShown, lines: fallbackText.split('\n').length });
      t.check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'copyFallback'), 'the fallback box takes focus so Ctrl+C works at once');
      t.note('Copy hex codes: the clipboard is refused in headless Chromium; the page shows the fallback box with every hex code, as it says.');
    } else {
      t.check(copyToast === `Copied ${list.length} hex codes` && !fallbackShown, 'the clipboard took the hex codes and the page says how many', { copyToast, fallbackShown });
      t.note('Copy hex codes: the clipboard accepted the write in this run.');
    }
    await resetToast(page);
    await click(page, '#swatches .swatch-color');
    await toastSaid(page, /Copied|Copying/);
    const chipToast = await text(page, '#toast');
    t.check(chipToast === `Copied ${list[0].hex}` || (/Copying is blocked/.test(chipToast) && (await page.evaluate(() => document.getElementById('copyFallback').value)) === list[0].hex), 'a swatch click copies its one hex code (or offers it)', chipToast);
    // Save as PNG: a real download, sized for the grid of swatches
    const cols = Math.min(6, list.length), rows = Math.ceil(list.length / 6);
    const dl = await download(page, () => click(page, '#palSave'));
    t.check(dl && dl.name === 'sample-study-palette.png', 'Save as PNG downloads sample-study-palette.png', dl && dl.name);
    t.check(dl && JSON.stringify(pngDims(dl.buf)) === JSON.stringify({ w: 48 + cols * 180 + (cols - 1) * 16, h: 48 + rows * 234 + (rows - 1) * 16 }), 'the palette PNG is a PNG laid out six to a row', dl && pngDims(dl.buf));
    t.check(!(await page.evaluate(() => document.getElementById('saveDialog').open)), 'opened directly, Save as PNG shows no dialog');
    // magnifier off: no loupe, no pick, the row says so
    await click(page, '[data-tool="sample"]'); await sleep(50);
    t.check((await pressed(page, '[data-tool="sample"]')) === 'false' && (await visible(page, '#toolOptions')), 'pressing the magnifier again turns it off and shows the options row');
    expectText(t, await text(page, '#toolHint'), 'No tool is on, so touching an image scrolls the page. Choose a tool to use it.', 'with no tool the hint says touching scrolls');
    await hover(page, 0.6, 0.3);
    t.check(!(await loupe(page)).shown, 'with no tool the loupe stays hidden');
    await resetToast(page);
    const n = (await swatches(page)).length;
    await tapAt(page, 0.6, 0.3);
    t.check((await swatches(page)).length === n && (await toastShown(page)) === '', 'with no tool a click picks nothing and says nothing');
    await page.evaluate(() => scrollTo(0, 0)); await sleep(50); // the fallback box's focus may have scrolled the page: a tool change then moves the pinned strip
    await page.mouse.dblclick(...(await box(page, '[data-tool="sample"]').then((b) => [b.x + b.width / 2, b.y + b.height / 2])));
    await sleep(80);
    t.check((await pressed(page, '[data-tool="sample"]')) === 'false', 'a double tap on a tool button leaves it as it was (on then off)', { pressed: await pressed(page, '[data-tool="sample"]'), hint: await text(page, '#toolHint') });
    if ((await pressed(page, '[data-tool="sample"]')) === 'true') await click(page, '[data-tool="sample"]');
    await click(page, '[data-tool="sample"]'); await sleep(50);
    await hover(page, 0.6, 0.3);
    t.check((await pressed(page, '[data-tool="sample"]')) === 'true' && (await loupe(page)).shown, 'the magnifier back on shows the loupe again', { pressed: await pressed(page, '[data-tool="sample"]'), loupe: await loupe(page) });
    // remove one, clear with two taps
    await click(page, '#swatches .swatch-remove'); await sleep(50);
    t.check((await swatches(page)).length === n - 1, 'the × removes one color');
    await click(page, '#palClear');
    t.check((await text(page, '#palClear')) === 'Click again to clear', 'Clear arms on the first tap', await text(page, '#palClear'));
    await click(page, '#palClear'); await sleep(50);
    const after = { n: (await swatches(page)).length, empty: await visible(page, '#palEmpty'), fallback: await visible(page, '#copyFallback'), btns: await page.evaluate(() => ['palSort', 'palCopy', 'palSave', 'palClear'].map((id) => document.getElementById(id).disabled)), state: await text(page, '#swatchesState'), toast: await toastShown(page), saved: await storageGet(page, PALETTE_KEY) };
    t.check(after.n === 0 && after.empty && !after.fallback && after.btns.every(Boolean) && after.state === 'None yet' && after.toast === 'Palette cleared' && after.saved === '[]', 'the second tap clears: empty note, buttons off, fallback gone, "None yet", saved as empty', after);
    // shared by every tab: a second page in the same browser sees the pick
    const page2 = await page.context().newPage();
    await page2.goto(site.base, { waitUntil: 'load' }); await sleep(300);
    await hover(page, 0.5, 0.42); await tapAt(page, 0.5, 0.42);
    t.check((await swatches(page)).length === 1, 'a pick after the clear lands in this tab', await toastShown(page));
    const shared = await page2.waitForFunction(() => document.querySelectorAll('#swatches li').length === 1, null, { timeout: 3000 }).then(() => true).catch(() => false);
    t.check(shared && (await text(page2, '#swatchesState')) === '1 color', 'a pick in one tab shows in another open tab', await text(page2, '#swatchesState'));
    await page2.close();
    await clean(t, page, 'magnifier and picks');
    await page.context().close();
  }

  // ---- lines ------------------------------------------------------------------------------------------------
  {
    const page = await openPage(site);
    await setTool(page, 'line');
    const row = { options: await visible(page, '#toolOptions'), line: await visible(page, '.line-tools'), measure: await visible(page, '.measure-tools'), plumb: await visible(page, '.plumb-tools'), undo: await disabled(page, '#lineUndo'), clear: await disabled(page, '#lineClear') };
    t.check(row.options && row.line && !row.measure && !row.plumb && row.undo && row.clear, 'Lines: its options show alone, Undo and Clear off with nothing drawn', row);
    expectText(t, await text(page, '#toolHint'), 'Drag on any image to draw a line. It appears on every image. Hold Shift to snap to 15°. The loupe shows the angle.', 'Lines: the how-to');
    await resetToast(page);
    await tapAt(page, 0.5, 0.5);
    await dragPx(page, 0.5, 0.5, 1, 0, { mid: false });
    t.check((await count(page, 'line')) === 0 && (await toastShown(page)) === 'Drag from one point to another to draw a line', 'a tap and a 1 px slip draw no line, and say to drag', await toastShown(page));
    await dragFrac(page, [0.2, 0.3], [0.8, 0.3]);
    t.check((await count(page, 'line')) === 1 && !(await disabled(page, '#lineUndo')) && !(await disabled(page, '#lineClear')), 'a drag draws a line: the badge says 1, Undo and Clear come on');
    t.check((await overlayHas(page, 'cv-value', 0.5, 0.3, COLORS.lcRed)) && (await overlayHas(page, 'cv-block', 0.5, 0.3, COLORS.lcRed)), 'the line appears on every image');
    t.check(!(await loupe(page)).shown, 'the loupe goes when the drag ends');
    // the loupe's tilt, and the pixels under the end of the line
    const b = await box(page);
    let r = await dragPx(page, 0.2, 0.5, 100, 0, { during: () => loupe(page) });
    t.check(r.r.shown && r.r.val === 'Tilt 0°', 'a level drag reads Tilt 0° in the loupe', r.r);
    const endHex = await hexAt(page, 'cv-orig', (r.x0 + 100 - b.x) / b.width, (r.y0 - b.y) / b.height);
    t.check(r.r.hex === endHex, 'while drawing, the loupe shows the pixels under the end of the line', { loupe: r.r.hex, endHex });
    r = await dragPx(page, 0.3, 0.8, 0, -100, { during: () => loupe(page) });
    t.check(r.r.val === 'Tilt 90°', 'a drag straight up reads Tilt 90°', r.r);
    r = await dragPx(page, 0.2, 0.2, 80, 80, { during: () => loupe(page) });
    t.check(r.r.val === 'Tilt -45°', 'a drag down to the right reads Tilt -45°', r.r);
    r = await dragPx(page, 0.2, 0.6, 100, -40, { during: () => loupe(page) });
    t.check(r.r.val === 'Tilt 22°', 'without Shift a 100 × 40 drag reads its true 22°', r.r);
    r = await dragPx(page, 0.2, 0.7, 100, -40, { shift: true, during: () => loupe(page) });
    t.check(r.r.val === 'Tilt 15°', 'with Shift the same drag snaps to 15°', r.r);
    t.check((await count(page, 'line')) === 6, 'six lines so far', await count(page, 'line'));
    // off the image: a drag that ends outside stops at the edge; one that starts outside draws nothing
    r = await dragPx(page, 0.5, 0.9, Math.round(b.width) + 150, 0);
    t.check((await count(page, 'line')) === 7 && (await overlayHas(page, 'cv-orig', 1, 0.9, COLORS.lcRed, 4)), 'a drag that leaves the image ends at its edge', await count(page, 'line'));
    await page.mouse.move(Math.round(b.x - 40), Math.round(b.y + b.height * 0.45)); await page.mouse.down();
    await page.mouse.move(Math.round(b.x + b.width * 0.5), Math.round(b.y + b.height * 0.45), { steps: 6 }); await page.mouse.up(); await sleep(30);
    t.check((await count(page, 'line')) === 7, 'a drag that starts outside the image draws nothing');
    await click(page, '#lineClear'); await sleep(30);
    // every color
    let i = 0;
    for (const [id, color] of Object.entries(COLORS)) {
      await page.evaluate((id) => document.getElementById(id).click(), id);
      const fy = 0.12 + i++ * 0.16;
      await dragFrac(page, [0.15, fy], [0.85, fy]);
      t.check(await overlayHas(page, 'cv-orig', 0.5, fy, color), `a ${id.slice(2).toLowerCase()} line is drawn in ${color}`);
    }
    t.check((await count(page, 'line')) === 5, 'five colored lines');
    // undo by button, by Ctrl+Z, clear; none left: buttons off
    await click(page, '#lineUndo'); await sleep(30);
    t.check((await count(page, 'line')) === 4, 'Undo line takes one back');
    await resetToast(page);
    await page.keyboard.press('Control+z'); await sleep(30);
    t.check((await count(page, 'line')) === 3 && (await toastShown(page)) === 'Line removed', 'Ctrl+Z takes one back and says so', await toastShown(page));
    await click(page, '#lineClear'); await sleep(30);
    t.check((await count(page, 'line')) === 0 && (await disabled(page, '#lineUndo')) && (await disabled(page, '#lineClear')) && (await overlayInk(page, 'cv-orig')) === 0, 'Clear lines empties every image and turns Undo and Clear off');
    await resetToast(page);
    await page.keyboard.press('Control+z'); await sleep(30);
    t.check((await count(page, 'line')) === 0 && (await toastShown(page)) === '', 'Ctrl+Z after Clear brings nothing back and says nothing (the README promises no redo of a clear)');
    // Esc in the middle of a drag
    {
      const bb = await box(page);
      await page.mouse.move(Math.round(bb.x + bb.width * 0.3), Math.round(bb.y + bb.height * 0.3)); await page.mouse.down();
      await page.mouse.move(Math.round(bb.x + bb.width * 0.7), Math.round(bb.y + bb.height * 0.6), { steps: 5 });
      const mid = await loupe(page);
      await page.keyboard.press('Escape');
      const esc = { loupe: (await loupe(page)).shown, ink: await overlayInk(page, 'cv-orig') };
      await page.mouse.up(); await sleep(30);
      t.check(mid.shown && !esc.loupe && esc.ink === 0 && (await count(page, 'line')) === 0, 'Esc during a drag drops the line and the loupe', { mid, esc, count: await count(page, 'line') });
    }
    // another tab opened in the middle of a drag: nothing stale on return
    {
      const bb = await box(page);
      await page.mouse.move(Math.round(bb.x + bb.width * 0.3), Math.round(bb.y + bb.height * 0.3)); await page.mouse.down();
      await page.mouse.move(Math.round(bb.x + bb.width * 0.6), Math.round(bb.y + bb.height * 0.5), { steps: 5 });
      await tab(page, 'help');
      await page.mouse.up(); await sleep(50);
      await tab(page, 'study');
      const n = await count(page, 'line');
      await setTool(page, 'sample');
      await hover(page, 0.5, 0.5);
      const l = await loupe(page);
      t.check(l.shown && /^V /.test(l.val) && n <= 1, 'after a tab switch mid-drag the magnifier reads a value again, not a stale tilt', { loupe: l, lines: n });
      t.note(`a tab switch in the middle of a line drag: the line ${n ? 'was kept' : 'was dropped'} (the README does not say which).`);
      await setTool(page, 'line');
    }
    await clean(t, page, 'lines');
    await page.context().close();
  }

  // ---- measures ---------------------------------------------------------------------------------------------
  {
    const page = await openPage(site);
    await setTool(page, 'measure');
    const row = { measure: await visible(page, '.measure-tools'), line: await visible(page, '.line-tools'), unit: await disabled(page, '#measureUnit'), undo: await disabled(page, '#measureUndo'), clear: await disabled(page, '#measureClear'), size: await page.evaluate(() => document.getElementById('canvasSize').value) };
    t.check(row.measure && !row.line && row.unit && row.undo && row.clear && row.size === '', 'Measure: its options show, the three buttons off, the canvas length empty', row);
    const hint = await text(page, '#toolHint');
    t.check(/it becomes 1 U/.test(hint) && /On the sample, try eye line to chin/.test(hint), 'Measure: the how-to names the unit and the sample tip', hint);
    await resetToast(page);
    await tapAt(page, 0.5, 0.5);
    t.check((await count(page, 'measure')) === 0 && (await toastShown(page)) === 'Drag from one point to another to measure the length between them', 'a tap measures nothing and says to drag', await toastShown(page));
    await resetToast(page);
    await dragPx(page, 0.5, 0.5, 6, 0, { mid: false });
    t.check((await count(page, 'measure')) === 0 && (await toastShown(page)) === 'Drag from one point to another to measure the length between them', 'a 6 px slip measures nothing and says to drag', await toastShown(page));
    // the unit: 100 css px level; every later length is read through the loupe before the button goes up
    const prep = await page.evaluate(() => { const p = Studio.prep(); return { w: p.w, h: p.h }; });
    const b = await box(page);
    const U = 100;
    let r = await dragPx(page, 0.08, 0.2, U, 0, { during: () => loupe(page) });
    t.check(r.r.shown && r.r.hex === '1 U' && r.r.val === 'Tilt 0°', 'the first drag reads 1 U and its tilt in the loupe', r.r);
    t.check((await count(page, 'measure')) === 1 && !(await loupe(page)).shown, 'it lands as the first measure and the loupe goes');
    t.check((await overlayHas(page, 'cv-orig', (r.x0 + U / 2 - b.x) / b.width, 0.2, UNIT_COLOR, 5)) && (await overlayHas(page, 'cv-value', (r.x0 + U / 2 - b.x) / b.width, 0.2, UNIT_COLOR, 5)), 'the unit is drawn in yellow, on every image');
    t.check((await disabled(page, '#measureUnit')) && !(await disabled(page, '#measureUndo')) && !(await disabled(page, '#measureClear')), 'with one measure: Make last line the unit off, Undo and Clear on');
    const reads = [[50, '0.50 U ≈ ½'], [148, '1.48 U ≈ 1½'], [36, '0.36 U'], [97, '0.97 U ≈ 1'], [250, '2.50 U ≈ 2½'], [26, '0.26 U ≈ ¼'], [33, '0.33 U ≈ ⅓'], [67, '0.67 U ≈ ⅔'], [75, '0.75 U ≈ ¾'], [52, '0.52 U ≈ ½']];
    let fy = 0.26;
    for (const [px, want] of reads) {
      r = await dragPx(page, 0.03, fy, px, 0, { during: () => loupe(page) });
      expectText(t, r.r.hex, want, `a ${px} px drag against a ${U} px unit reads "${want}"`);
      fy += 0.06;
    }
    t.check((await count(page, 'measure')) === 1 + reads.length && !(await disabled(page, '#measureUnit')), 'every measure landed; Make last line the unit is on');
    t.check(await overlayHas(page, 'cv-orig', (r.x0 + 26 - b.x) / b.width, fy - 0.06, MEASURE_COLOR, 5), 'a later measure is drawn in white');
    // Unit on my canvas: cm, inches to the eighth, and every kind of bad input
    const sizeReads = [
      ['10', 'cm', 50, '0.50 U ≈ ½ · 5 cm'], ['10', 'in', 148, '1.48 U ≈ 1½ · 14¾ in'], ['12.6', 'cm', 148, '1.48 U ≈ 1½ · 18.6 cm'], ['12.6', 'in', 50, '0.50 U ≈ ½ · 6¼ in'],
      ['1', 'in', 36, '0.36 U · ⅜ in'], ['1', 'in', 100, '1.00 U ≈ 1 · 1 in'], ['9999', 'cm', 50, '0.50 U ≈ ½ · 4999.5 cm'],
      ['0', 'cm', 50, '0.50 U ≈ ½'], ['-5', 'cm', 50, '0.50 U ≈ ½'], ['10000', 'cm', 50, '0.50 U ≈ ½'], ['abc', 'cm', 50, '0.50 U ≈ ½'], ['1e400', 'cm', 50, '0.50 U ≈ ½'],
    ];
    fy = 0.1;
    for (const [value, sys, px, want] of sizeReads) {
      await setSize(page, value);
      await page.selectOption('#canvasSys', sys);
      await resetToast(page);
      r = await dragPx(page, 0.03, fy, px, 0, { during: () => loupe(page) });
      expectText(t, r.r.hex, want, `unit on my canvas "${value}" ${sys}: a ${px} px drag reads "${want}"`);
      if (!/·/.test(want)) t.check((await toastShown(page)) === '' && (await text(page, '#toolHint')) === hint, `unit on my canvas "${value}": the page says nothing about a length it cannot use`);
      fy += 0.06;
    }
    // a length the labels cannot use is said when the field is left; letters and 1e400 are emptied by the
    // browser itself (a number field keeps only finite numbers), which counts as not set
    const UNUSABLE = 'Unit on my canvas needs a length over 0 and under 10 000: the labels leave it out until then.';
    for (const [value, said] of [['0', UNUSABLE], ['-5', UNUSABLE], ['10000', UNUSABLE], ['abc', ''], ['1e400', ''], ['', '']]) {
      await resetToast(page);
      await setSize(page, value);
      t.check((await toastShown(page)) === said, `unit on my canvas "${value}" left in the field: ${said ? 'said to be unusable' : 'nothing said (not set)'}`, await toastShown(page));
    }
    await setSize(page, '10'); await page.selectOption('#canvasSys', 'cm');
    const kept = JSON.parse(await storageGet(page, CANVAS_KEY));
    t.check(kept && kept.value === '10' && kept.sys === 'cm', 'the canvas length is kept in the browser as typed', kept);
    // the grid note in the hint, with a unit and a canvas length
    await click(page, '#gridBtn'); await sleep(30);
    const gridHint = await text(page, '#toolHint');
    const m = /A grid cell is (\d+\.\d\d) U wide and (\d+\.\d\d) U tall \((\d+(?:\.\d)?) cm × (\d+(?:\.\d)?) cm on your canvas\)\./.exec(gridHint);
    const cw = b.width / (3 * U), ch = (prep.h / prep.w) * b.width / (3 * U);
    t.check(m && Math.abs(+m[1] - cw) < 0.011 && Math.abs(+m[2] - ch) < 0.011 && Math.abs(+m[3] - cw * 10) < 0.11 && Math.abs(+m[4] - ch * 10) < 0.11, 'with the grid on, the hint gives a cell in units and on the canvas', { gridHint, cw, ch });
    await click(page, '#gridBtn'); await click(page, '#gridBtn'); await sleep(30);
    t.check(!/grid cell/.test(await text(page, '#toolHint')), 'with the grid off again the cell note goes');
    // Make last line the unit, then undo it
    const lastPx = 50; // the newest measure is the 50 px one from the canvas-length reads
    await click(page, '#measureUnit'); await sleep(30);
    t.check(await disabled(page, '#measureUnit'), 'Make last line the unit turns itself off once the last line is the unit');
    r = await dragPx(page, 0.05, 0.9, lastPx, 0, { during: () => loupe(page) });
    expectText(t, r.r.hex, '1.00 U ≈ 1 · 10 cm', 'after Make last line the unit a drag of its length reads 1.00 U');
    r = await dragPx(page, 0.05, 0.94, U, 0, { during: () => loupe(page) });
    expectText(t, r.r.hex, '2.00 U ≈ 2 · 20 cm', 'and the old unit\'s length reads 2.00 U');
    t.check(await overlayHas(page, 'cv-orig', (r.x0 + U / 2 - b.x) / b.width, 0.2, MEASURE_COLOR, 5), 'the old unit is now drawn in white');
    await click(page, '#measureUndo'); await click(page, '#measureUndo'); await sleep(30);
    t.check(await disabled(page, '#measureUnit'), 'two Undo measure take back the two newest drags; the unit change is older');
    await resetToast(page);
    await page.keyboard.press('Control+z'); await sleep(30);
    t.check((await toastShown(page)) === 'Unit set back' && !(await disabled(page, '#measureUnit')), 'Ctrl+Z then takes back the unit change and says so', await toastShown(page));
    r = await dragPx(page, 0.05, 0.9, U, 0, { during: () => loupe(page) });
    expectText(t, r.r.hex, '1.00 U ≈ 1 · 10 cm', 'the first measure is the unit again');
    // Clear, then the next drag is a fresh unit
    await click(page, '#measureClear'); await sleep(30);
    t.check((await count(page, 'measure')) === 0 && (await disabled(page, '#measureUnit')) && (await disabled(page, '#measureUndo')) && (await disabled(page, '#measureClear')) && (await overlayInk(page, 'cv-orig')) === 0, 'Clear measures empties the images and turns the buttons off');
    r = await dragPx(page, 0.1, 0.3, 60, 0, { during: () => loupe(page) });
    expectText(t, r.r.hex, '1 U · 10 cm', 'after Clear the first drag is the unit again (with its canvas length)');
    // Shift snapping while measuring, a measure across the whole image, a drag that leaves it
    r = await dragPx(page, 0.1, 0.4, 100, -40, { shift: true, during: () => loupe(page) });
    t.check(r.r.val === 'Tilt 15°', 'Shift snaps a measure to 15°', r.r);
    r = await dragPx(page, 0.01, 0.5, Math.round(b.width) + 200, 0, { during: () => loupe(page) });
    t.check(r.r.shown && /^\d+\.\d\d U/.test(r.r.hex) && (await count(page, 'measure')) === 3, 'a measure across the whole image, dragged past its edge, is read and lands', r.r);
    // twenty-plus measures: every one lands, the badge counts them, drawing stays quick
    const t0 = Date.now();
    let last = 0;
    for (let k = 0; k < 22; k++) {
      const px = 14 + ((k * 37) % 90), f = 0.08 + (k % 11) * 0.08;
      const t1 = Date.now();
      await dragPx(page, 0.05 + (k % 3) * 0.2, f, px, (k % 2 ? 1 : -1) * (6 + (k % 5)), { steps: 3 });
      last = Date.now() - t1;
    }
    t.check((await count(page, 'measure')) === 25, 'twenty-five measures all land', await count(page, 'measure'));
    t.check(last < 3000, 'the twenty-fifth measure still lands in under three seconds', last);
    t.note(`twenty-two more measures took ${((Date.now() - t0) / 1000).toFixed(1)} s to draw; the last one ${last} ms. Labels among twenty or more may go, as the README says; only the count and the loupe can be read here.`);
    await clean(t, page, 'measures');
    // the canvas length is back on the next visit, and read into the labels at once
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    await setTool(page, 'measure');
    const back = { value: await page.evaluate(() => document.getElementById('canvasSize').value), sys: await page.evaluate(() => document.getElementById('canvasSys').value) };
    r = await dragPx(page, 0.1, 0.3, 80, 0, { during: () => loupe(page) });
    t.check(back.value === '10' && back.sys === 'cm' && r.r.hex === '1 U · 10 cm', 'after a reload the canvas length is back and in the labels', { back, loupe: r.r });
    await clean(t, page, 'measures after reload');
    await page.context().close();
  }

  // ---- plumb points -----------------------------------------------------------------------------------------
  {
    const page = await openPage(site);
    await setTool(page, 'plumb');
    t.check((await visible(page, '.plumb-tools')) && (await disabled(page, '#plumbUndo')) && (await disabled(page, '#plumbClear')), 'Plumb: its options show, Undo and Clear off');
    expectText(t, await text(page, '#toolHint'), 'Click an image to drop a plumb line and a level through that point, on every image, and see what lines up with it. Drag a ring to move it; click a ring to remove it.', 'Plumb: the how-to');
    await tapAt(page, 0.3, 0.3);
    t.check((await count(page, 'plumb')) === 1 && (await overlayHas(page, 'cv-value', 0.3, 0.05, MEASURE_COLOR, 6)) && (await overlayHas(page, 'cv-block', 0.9, 0.3, MEASURE_COLOR, 6)), 'a click drops a plumb line and a level, on every image');
    await dragFrac(page, [0.3, 0.3], [0.6, 0.5]);
    t.check((await count(page, 'plumb')) === 1 && (await overlayHas(page, 'cv-orig', 0.6, 0.05, MEASURE_COLOR, 6)) && !(await overlayHas(page, 'cv-orig', 0.3, 0.05, MEASURE_COLOR, 6)), 'dragging the ring moves the point');
    await tapAt(page, 0.6, 0.5);
    t.check((await count(page, 'plumb')) === 0 && (await overlayInk(page, 'cv-orig')) === 0, 'clicking the ring removes the point');
    await click(page, '#plumbUndo'); await sleep(30);
    t.check((await count(page, 'plumb')) === 1 && (await overlayHas(page, 'cv-orig', 0.6, 0.05, MEASURE_COLOR, 6)), 'Undo plumb line puts the removed point back');
    await click(page, '#plumbUndo'); await sleep(30);
    t.check((await overlayHas(page, 'cv-orig', 0.3, 0.05, MEASURE_COLOR, 6)) && !(await overlayHas(page, 'cv-orig', 0.6, 0.05, MEASURE_COLOR, 6)), 'Undo again moves it back where it was');
    await click(page, '#plumbUndo'); await sleep(30);
    t.check((await count(page, 'plumb')) === 0 && (await disabled(page, '#plumbUndo')), 'Undo again takes the drop back; nothing left to undo');
    // a wobbly tap still drops; a press near but off a ring drops a new one; many
    await dragPx(page, 0.2, 0.8, 2, 1, { mid: false });
    t.check((await count(page, 'plumb')) === 1, 'a tap that wobbles 2 px still drops a point');
    await tapAt(page, 0.2 + 25 / (await box(page)).width, 0.8);
    t.check((await count(page, 'plumb')) === 2, 'a click 25 px from a ring drops a new point rather than grabbing it');
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) await tapAt(page, 0.1 + i * 0.2, 0.1 + j * 0.2);
    t.check((await count(page, 'plumb')) === 27, 'twenty-five more clicks: twenty-seven points', await count(page, 'plumb'));
    // Esc while a ring is held puts it back; a drag off the image stops at the edge
    {
      const b = await box(page);
      await page.mouse.move(Math.round(b.x + 0.5 * b.width), Math.round(b.y + 0.5 * b.height)); await page.mouse.down();
      await page.mouse.move(Math.round(b.x + 0.65 * b.width), Math.round(b.y + 0.65 * b.height), { steps: 5 });
      await page.keyboard.press('Escape');
      await page.mouse.up(); await sleep(30);
      t.check((await count(page, 'plumb')) === 27 && (await overlayHas(page, 'cv-orig', 0.5, 0.02, MEASURE_COLOR, 6)) && !(await overlayHas(page, 'cv-orig', 0.65, 0.02, MEASURE_COLOR, 6)), 'Esc while a ring is held puts the point back');
      await page.mouse.move(Math.round(b.x + 0.9 * b.width), Math.round(b.y + 0.9 * b.height)); await page.mouse.down();
      await page.mouse.move(Math.round(b.x + b.width + 120), Math.round(b.y + 0.9 * b.height), { steps: 5 }); await page.mouse.up(); await sleep(30);
      t.check((await count(page, 'plumb')) === 27 && (await overlayHas(page, 'cv-orig', 1, 0.5, MEASURE_COLOR, 6)), 'a ring dragged off the image stops at its edge');
    }
    await click(page, '#plumbClear'); await sleep(30);
    t.check((await count(page, 'plumb')) === 0 && (await overlayInk(page, 'cv-orig')) === 0 && (await disabled(page, '#plumbClear')), 'Clear plumb lines empties the images');
    await clean(t, page, 'plumb points');
    await page.context().close();
  }

  // ---- Ctrl/⌘+Z across the three tools, and the grid --------------------------------------------------------
  {
    const page = await openPage(site);
    await setTool(page, 'line'); await dragFrac(page, [0.2, 0.2], [0.8, 0.2]);
    await setTool(page, 'measure'); await dragPx(page, 0.1, 0.4, 100, 0); await dragPx(page, 0.1, 0.5, 60, 0);
    await setTool(page, 'plumb'); await tapAt(page, 0.7, 0.7);
    await setTool(page, 'measure'); await click(page, '#measureUnit'); await sleep(30);
    const counts = async () => [await count(page, 'line'), await count(page, 'measure'), await count(page, 'plumb')].join(',');
    t.check((await counts()) === '1,2,1' && (await disabled(page, '#measureUnit')), 'a line, two measures, a plumb point and a unit change');
    const steps = [['Control+z', 'Unit set back', '1,2,1'], ['Control+z', 'Plumb line removed', '1,2,0'], ['Meta+z', 'Measure removed', '1,1,0'], ['Control+z', 'Measure removed', '1,0,0'], ['Control+z', 'Line removed', '0,0,0']];
    for (const [key, said, want] of steps) {
      await resetToast(page);
      await page.keyboard.press(key); await sleep(30);
      t.check((await toastShown(page)) === said && (await counts()) === want, `${key} takes back the newest step: "${said}"`, { toast: await toastShown(page), counts: await counts() });
    }
    await resetToast(page);
    await page.keyboard.press('Control+z'); await sleep(30);
    t.check((await toastShown(page)) === '', 'Ctrl+Z with nothing to undo says nothing');
    // the guards: Shift+Ctrl+Z, typing in the canvas length, a held plumb point
    await setTool(page, 'line'); await dragFrac(page, [0.2, 0.3], [0.8, 0.3]);
    await page.keyboard.press('Control+Shift+z'); await sleep(30);
    t.check((await count(page, 'line')) === 1, 'Shift+Ctrl+Z (redo) undoes nothing');
    await setTool(page, 'measure');
    await page.focus('#canvasSize'); await page.keyboard.type('5');
    await page.keyboard.press('Control+z'); await sleep(30);
    t.check((await count(page, 'line')) === 1, 'Ctrl+Z while typing the canvas length leaves the marks alone');
    await setTool(page, 'plumb'); await tapAt(page, 0.5, 0.5);
    {
      const b = await box(page);
      await page.mouse.move(Math.round(b.x + 0.5 * b.width), Math.round(b.y + 0.5 * b.height)); await page.mouse.down();
      await page.mouse.move(Math.round(b.x + 0.55 * b.width), Math.round(b.y + 0.55 * b.height), { steps: 3 });
      await resetToast(page);
      await page.keyboard.press('Control+z'); await sleep(30);
      const held = { toast: await toastShown(page), counts: await counts() };
      await page.mouse.up(); await sleep(30);
      t.check(held.toast === '' && held.counts === '1,0,1', 'Ctrl+Z while a plumb point is held does nothing', held);
    }
    // each tool's Undo takes its own newest step, out of turn (from a clean slate: the held point above was a move)
    await click(page, '#plumbClear'); await setTool(page, 'line'); await click(page, '#lineClear'); await sleep(30);
    await dragFrac(page, [0.2, 0.6], [0.8, 0.6]);
    await setTool(page, 'plumb'); await tapAt(page, 0.6, 0.3);
    await setTool(page, 'line'); await dragFrac(page, [0.2, 0.7], [0.8, 0.7]);
    t.check((await counts()) === '2,0,1', 'line, plumb, line', await counts());
    await setTool(page, 'plumb'); await click(page, '#plumbUndo'); await sleep(30);
    t.check((await counts()) === '2,0,0', 'Undo plumb line takes the plumb point, though a line came later');
    await resetToast(page); await page.keyboard.press('Control+z'); await sleep(30);
    t.check((await counts()) === '1,0,0' && (await toastShown(page)) === 'Line removed', 'Ctrl+Z then takes the newest line');
    // Ctrl+Z on another tab: does it still reach the Study's marks?
    const undidOn = [];
    const TAB_NAMES = { help: 'How to use', loomis: 'Loomis head', game: 'Paint by numbers', battle: 'Value battle' };
    for (const name of Object.keys(TAB_NAMES)) {
      await setTool(page, 'line'); await dragFrac(page, [0.2, 0.15 + undidOn.length * 0.1], [0.8, 0.15 + undidOn.length * 0.1]);
      const before = await counts();
      await tab(page, name);
      await resetToast(page); await page.keyboard.press('Control+z'); await sleep(30);
      const on = { before, toast: await toastShown(page), counts: await counts() };
      await tab(page, 'study');
      if (on.counts !== before) undidOn.push(TAB_NAMES[name]);
      t.check(on.counts === before, `Ctrl+Z on the ${TAB_NAMES[name]} tab leaves the Study's marks alone`, on);
    }
    if (undidOn.length) t.finding({ title: `Ctrl/⌘+Z on another tab (${undidOn.join(', ')}) takes back a Study mark out of sight`, severity: 'low', steps: '1. On Study the photo, choose Lines and drag a line. 2. Open Learning tools → How to use (or the Loomis head, Paint by numbers or Value battle). 3. Press Ctrl+Z.', expected: 'Nothing changes on a tab that has no undo of its own, or the shortcut is left to that tab; the Study\'s marks are not touched out of sight.', actual: `The toast says "Line removed" and the line is gone from the Study (the Lines badge drops by one), on ${undidOn.join(', ')}. Cause: js/app.js 2111–2130, the window keydown handler, skips Ctrl+Z only while state.tab is "paint" or "figure" (line 2127).` });
    // the grid: off, 3 × 3, 4 × 4, off; spam
    const grid = async () => ({ label: await page.evaluate(() => document.getElementById('gridBtn').getAttribute('aria-label')), pressed: await pressed(page, '#gridBtn'), badge: await text(page, '#gridBadge'), shown: await visible(page, '#gridBadge') });
    t.check(JSON.stringify(await grid()) === JSON.stringify({ label: 'Grid: off', pressed: 'false', badge: '', shown: false }), 'the grid starts off', await grid());
    await click(page, '#gridBtn'); await sleep(30);
    t.check(JSON.stringify(await grid()) === JSON.stringify({ label: 'Grid: 3 × 3', pressed: 'true', badge: '3×3', shown: true }) && (await overlayHas(page, 'cv-orig', 1 / 3, 0.9, '#ffffff', 3)) && (await overlayHas(page, 'cv-block', 0.9, 2 / 3, '#ffffff', 3)), 'one press: 3 × 3 on every image', await grid());
    await click(page, '#gridBtn'); await sleep(30);
    t.check(JSON.stringify(await grid()) === JSON.stringify({ label: 'Grid: 4 × 4', pressed: 'true', badge: '4×4', shown: true }) && (await overlayHas(page, 'cv-orig', 0.25, 0.9, '#ffffff', 3)) && !(await overlayHas(page, 'cv-orig', 1 / 3, 0.9, '#ffffff', 2)), 'two presses: 4 × 4', await grid());
    await click(page, '#gridBtn'); await sleep(30);
    t.check((await grid()).label === 'Grid: off' && !(await overlayHas(page, 'cv-orig', 0.25, 0.9, '#ffffff', 3)), 'three presses: off again');
    for (let k = 0; k < 31; k++) await click(page, '#gridBtn');
    await sleep(30);
    t.check((await grid()).label === 'Grid: 3 × 3', 'thirty-one quick presses land on 3 × 3', (await grid()).label);
    await click(page, '#gridBtn'); await click(page, '#gridBtn');
    await clean(t, page, 'undo across tools and the grid');
    await page.context().close();
  }

  // ---- a new photo clears the three tools; a rejected file must not; odd sizes --------------------------------
  {
    const page = await openPage(site);
    const counts = async () => [await count(page, 'line'), await count(page, 'measure'), await count(page, 'plumb')].join(',');
    const undoBtns = () => page.evaluate(() => ['lineUndo', 'lineClear', 'measureUnit', 'measureUndo', 'measureClear', 'plumbUndo', 'plumbClear'].map((id) => document.getElementById(id).disabled));
    await setTool(page, 'line'); await dragFrac(page, [0.2, 0.2], [0.8, 0.2]);
    await setTool(page, 'measure'); await dragPx(page, 0.1, 0.4, 100, 0); await dragPx(page, 0.1, 0.5, 60, 0);
    await setTool(page, 'plumb'); await tapAt(page, 0.7, 0.7);
    await click(page, '#gridBtn');
    await setTool(page, 'sample'); await hover(page, 0.5, 0.42); await tapAt(page, 0.5, 0.42); await hover(page, 0.1, 0.1); await tapAt(page, 0.1, 0.1);
    await setTool(page, 'measure');
    t.check((await counts()) === '1,2,1' && (await swatches(page)).length === 2, 'a line, two measures, a plumb point, the grid and two picked colors');
    await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'face.jpg' }), { settle: 300 });
    const fresh = { toast: await text(page, '#toast'), counts: await counts(), btns: await undoBtns(), grid: await text(page, '#gridBadge'), picks: (await swatches(page)).length, hint: await text(page, '#toolHint'), label: await text(page, '#source') };
    expectText(t, fresh.toast, 'Reference lines, measures and plumb lines cleared for the new photo.', 'a new photo says what it cleared');
    t.check(fresh.counts === '0,0,0' && fresh.btns.every(Boolean), 'the three tools are empty and their buttons off', fresh);
    t.check(fresh.grid === '3×3' && fresh.picks === 2, 'the grid and the picked colors stay', fresh);
    t.check(/Lengths are true to the photo, not the sitter/.test(fresh.hint) && !/On the sample/.test(fresh.hint), 'the measure hint drops the sample tip for a photo', fresh.hint);
    t.check(/face\.jpg · 900 × 1200 px/.test(fresh.label), 'the source line names the photo and its size', fresh.label);
    await setTool(page, 'line'); await dragFrac(page, [0.2, 0.3], [0.8, 0.3]);
    await loadPhoto(page, await makeImage(page, { width: 600, height: 800, name: 'next.png' }), { settle: 300 });
    expectText(t, await text(page, '#toast'), 'Reference lines cleared for the new photo.', 'with only lines drawn the toast names just them');
    // rejected files leave the marks alone, and say why they were refused
    await dragFrac(page, [0.2, 0.3], [0.8, 0.3]);
    await setTool(page, 'plumb'); await tapAt(page, 0.4, 0.4);
    const refused = [
      [textFile(), 'That file is not an image. Choose a JPG, PNG or WebP photo.', 'a text file'],
      [brokenImage(), 'This image could not be opened. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first.', 'a broken JPEG'],
      [await makeImage(page, { width: 1, height: 1, name: 'dot.png' }), 'That picture is too small to study (1 × 1 px): it needs at least 16 px on each side.', 'a 1 px image'],
      [await makeImage(page, { width: 2, height: 4000, name: 'strip.png' }), 'That picture is too small to study (2 × 4000 px): it needs at least 16 px on each side.', 'a 2 × 4000 strip'],
    ];
    for (const [file, want, what] of refused) {
      await resetToast(page);
      await loadPhoto(page, file, { settle: 400 });
      expectText(t, await text(page, '#toast'), want, `${what} is refused with the right words`);
      t.check((await counts()) === '1,0,1' && /next\.png/.test(await text(page, '#source')), `${what} leaves the marks and the photo as they were`, await counts());
    }
    t.note('A 1 × 1 PNG and a 2 × 4000 PNG are refused with their size and the 16 px rule (app.js 476–477); "no usable size" is kept for an image with no size at all.');
    // a transparent PNG and a sized SVG load and clear the marks; the loupe reads the gray the transparency sits on
    await loadPhoto(page, await makeImage(page, { width: 400, height: 400, draw: 'transparent', name: 'cutout.png' }), { settle: 300 });
    expectText(t, await text(page, '#toast'), 'Reference lines and plumb lines cleared for the new photo.', 'a transparent PNG loads and clears the marks');
    await setTool(page, 'sample'); await hover(page, 0.05, 0.05);
    t.check((await loupe(page)).hex === '#7F7F7F', 'the loupe reads a transparent pixel as the mid gray it sits on', (await loupe(page)).hex);
    await setTool(page, 'line'); await dragFrac(page, [0.2, 0.3], [0.8, 0.3]);
    await loadPhoto(page, svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#336699"/></svg>', 'shape.svg'), { settle: 300 });
    const svgLoaded = /shape\.svg · 300 × 200 px/.test(await text(page, '#source'));
    t.check(svgLoaded && (await counts()) === '0,0,0', 'a sized SVG loads as a photo and clears the marks', { source: await text(page, '#source'), counts: await counts() });
    await resetToast(page);
    await loadPhoto(page, svgImage(undefined, 'nosize.svg'), { settle: 400 });
    t.note(`an SVG with no width or height: the page says "${await text(page, '#toast')}"; source line "${await text(page, '#source')}".`);
    // a thin strip the page accepts (16 px wide): the tools still work on a 3 px wide image
    await loadPhoto(page, await makeImage(page, { width: 16, height: 4000, draw: 'noise', name: 'tall.png' }), { settle: 300 });
    const tall = await box(page);
    t.check(/tall\.png · 16 × 4000 px/.test(await text(page, '#source')) && tall && tall.width >= 1, 'a 16 × 4000 strip loads', { source: await text(page, '#source'), tall });
    await setTool(page, 'line');
    {
      const bb = await box(page);
      await page.mouse.move(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height * 0.2)); await page.mouse.down();
      await page.mouse.move(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height * 0.6), { steps: 5 });
      const l = await loupe(page);
      await page.mouse.up(); await sleep(30);
      t.check((await count(page, 'line')) === 1 && l.shown && /^#[0-9A-F]{6}$/.test(l.hex) && l.val === 'Tilt 90°', 'a line can be drawn down a 3 px wide image, with the loupe reading it', { l, count: await count(page, 'line') });
    }
    await setTool(page, 'measure');
    {
      const bb = await box(page);
      await page.mouse.move(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height * 0.2)); await page.mouse.down();
      await page.mouse.move(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height * 0.45), { steps: 5 });
      const l = await loupe(page);
      await page.mouse.up(); await sleep(30);
      t.check((await count(page, 'measure')) === 1 && l.hex === '1 U', 'a measure can be dragged down it and reads 1 U', l);
    }
    await setTool(page, 'plumb'); await tapAt(page, 0.5, 0.5);
    t.check((await count(page, 'plumb')) === 1, 'a plumb point drops on it');
    const dlTall = await download(page, () => click(page, '[data-save="orig"]'));
    t.check(dlTall && dlTall.name === 'tall-original.png' && JSON.stringify(pngDims(dlTall.buf)) === JSON.stringify({ w: 4, h: 900 }), 'Save PNG of the strip downloads a 4 × 900 PNG', dlTall && { name: dlTall.name, dims: pngDims(dlTall.buf) });
    await loadPhoto(page, await makeImage(page, { width: 4000, height: 16, draw: 'noise', name: 'wide.png' }), { settle: 300 });
    await setTool(page, 'line'); await dragFrac(page, [0.1, 0.5], [0.9, 0.5]);
    t.check((await count(page, 'line')) === 1 && /wide\.png · 4000 × 16 px/.test(await text(page, '#source')), 'a 4000 × 16 strip loads and takes a line');
    await clean(t, page, 'new photo and odd sizes');
    // a photo over 24 megapixels: reduced, and the toast says both things
    try {
      await setTool(page, 'plumb'); await tapAt(page, 0.5, 0.5);
      const huge = await makeImage(page, { width: 6001, height: 4000, type: 'image/jpeg', quality: 0.5, draw: 'flat', name: 'huge.jpg' });
      await loadPhoto(page, huge, { settle: 300 });
      const said = await text(page, '#toast');
      expectText(t, said, 'A very large photo (6001 × 4000) was reduced to 2800 × 1866 for speed. Reference lines and plumb lines cleared for the new photo.', 'a photo over 24 megapixels says it was reduced and what was cleared');
      t.check((await counts()) === '0,0,0' && /huge\.jpg · 2800 × 1866 px/.test(await text(page, '#source')), 'the reduced photo is the new reference', await text(page, '#source'));
      await clean(t, page, 'a 24-megapixel photo');
    } catch (e) {
      t.note('the 24-megapixel photo could not be made or loaded in this browser: ' + String(e.message).slice(0, 120));
    }
    await page.context().close();
  }

  // ---- a new photo in the middle of a drag; a reload in the middle of a drag -----------------------------------
  {
    const page = await openPage(site);
    await setTool(page, 'line');
    const b = await box(page);
    await page.mouse.move(Math.round(b.x + 0.3 * b.width), Math.round(b.y + 0.3 * b.height)); await page.mouse.down();
    await page.mouse.move(Math.round(b.x + 0.6 * b.width), Math.round(b.y + 0.6 * b.height), { steps: 5 });
    await pasteFile(page, await makeImage(page, { width: 600, height: 800, name: 'pasted.png' }));
    await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 15000 }).catch(() => null);
    const landedBefore = await count(page, 'line');
    await page.mouse.up(); await sleep(50);
    const landed = await count(page, 'line');
    t.check(/pasted\.png/.test(await text(page, '#source')) && landedBefore === 0, 'a photo pasted mid-drag loads with nothing drawn yet', { source: await text(page, '#source'), landedBefore });
    t.check(landed === 0, 'a line begun on the old photo does not land on the new one', landed);
    if (landed === 1) t.finding({ title: 'A line (or measure) begun on the old photo lands on the photo that replaced it mid-drag', severity: 'low', steps: '1. Choose Lines and press on the photo; keep the button down and move. 2. Paste a photo from the clipboard (Ctrl+V) while still holding the button; wait for it to load. 3. Let go.', expected: 'The stroke in progress is dropped with the old photo, as the finished lines are ("Loading a new photo clears all three").', actual: 'The line lands on the new photo, at the old photo\'s coordinates; the badge says 1. A measure begun the same way lands too, and becomes the new photo\'s unit. Cause: js/app.js 2061–2062 clearMarks() empties lines, measures, plumbs and history but not state.drawing (nor state.dragging), so the pointerup handler at 921–954 still pushes it (lines 933 and 939).' });
    // Measure in progress when the photo changes: the same path makes it the unit of the new photo
    await click(page, '#lineClear').catch(() => null);
    await setTool(page, 'measure');
    const b2 = await box(page);
    await page.mouse.move(Math.round(b2.x + 0.2 * b2.width), Math.round(b2.y + 0.5 * b2.height)); await page.mouse.down();
    await page.mouse.move(Math.round(b2.x + 0.7 * b2.width), Math.round(b2.y + 0.5 * b2.height), { steps: 5 });
    await pasteFile(page, await makeImage(page, { width: 500, height: 700, name: 'pasted2.png' }));
    await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 15000 }).catch(() => null);
    await page.mouse.up(); await sleep(50);
    t.check((await count(page, 'measure')) === 0, 'a measure begun on the old photo does not become the new photo\'s unit', await count(page, 'measure'));
    // a reload mid-drag: nothing of the tools is kept, nothing breaks
    const b3 = await box(page);
    await page.mouse.move(Math.round(b3.x + 0.2 * b3.width), Math.round(b3.y + 0.3 * b3.height)); await page.mouse.down();
    await page.mouse.move(Math.round(b3.x + 0.7 * b3.width), Math.round(b3.y + 0.3 * b3.height), { steps: 5 });
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    await page.mouse.up(); await sleep(50);
    t.check((await count(page, 'measure')) === 0 && (await count(page, 'line')) === 0 && (await pressed(page, '[data-tool="sample"]')) === 'true', 'after a reload mid-drag the page starts clean with the magnifier on');
    await clean(t, page, 'photo and reload mid-drag');
    await page.context().close();
  }

  // ---- Save PNG with every overlay on ------------------------------------------------------------------------
  {
    const page = await openPage(site);
    const prep = await page.evaluate(() => { const p = Studio.prep(); return { w: p.w, h: p.h }; });
    await click(page, '#gridBtn'); await click(page, '#gridBtn');
    await setTool(page, 'line'); await dragFrac(page, [0.2, 0.2], [0.8, 0.25]); await dragFrac(page, [0.3, 0.7], [0.7, 0.6]);
    await setTool(page, 'measure'); await setSize(page, '10'); await dragPx(page, 0.1, 0.4, 100, 0); await dragPx(page, 0.1, 0.5, 60, 0);
    await setTool(page, 'plumb'); await tapAt(page, 0.7, 0.75); await tapAt(page, 0.25, 0.85);
    const sizes = {};
    for (const [id, name] of [['orig', 'sample-study-original.png'], ['value', 'sample-study-three-value.png'], ['block', 'sample-study-color-blocks.png']]) {
      const dl = await download(page, () => click(page, `[data-save="${id}"]`));
      sizes[id] = dl ? dl.buf.length : -1;
      t.check(dl && dl.name === name && JSON.stringify(pngDims(dl.buf)) === JSON.stringify(prep), `Save PNG (${id}) with every overlay on downloads ${name} at the study's size`, dl && { name: dl.name, dims: pngDims(dl.buf), prep });
    }
    t.check(!(await page.evaluate(() => document.getElementById('saveDialog').open)), 'opened directly, Save PNG shows no dialog');
    await click(page, '#gridBtn'); await click(page, '#plumbClear'); await setTool(page, 'measure'); await click(page, '#measureClear'); await setTool(page, 'line'); await click(page, '#lineClear');
    const plain = await download(page, () => click(page, '[data-save="orig"]'));
    t.check(plain && plain.buf.length !== sizes.orig && JSON.stringify(pngDims(plain.buf)) === JSON.stringify(prep), 'with everything cleared the PNG differs (the overlays were really in it)', { withOverlays: sizes.orig, plain: plain && plain.buf.length });
    await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'my portrait.jpg' }), { settle: 300 });
    const named = await download(page, () => click(page, '[data-save="orig"]'));
    t.check(named && named.name === 'my portrait-original.png', 'a photo\'s PNG is named after its file', named && named.name);
    await clean(t, page, 'save png');
    await page.context().close();
  }

  // ---- hostile saved state for the two keys the tools read --------------------------------------------------------
  {
    const palettes = [
      ['"constructor"', 0], ['{"__proto__":{"r":1,"g":2,"b":3}}', 0], ['{"constructor":{"prototype":{"r":1}}}', 0], ['NaN', 0], ['[NaN]', 0], ['"[1,2]"', 0], ['not json', 0], ['', 0], ['[]', 0], ['null', 0],
      ['[{"r":"12","g":1,"b":1}]', 0], ['[{"r":1.5,"g":1,"b":1}]', 0], ['[[1,2,3]]', 0], ['[null,1,"x",{"r":300,"g":0,"b":0},{"r":10,"g":20,"b":30},{"r":-1,"g":0,"b":0}]', 1],
      ['{"r":1,"g":2,"b":3}', 0], ['[{"r":1,"g":2,"b":3,"__proto__":{"r":9}},{"r":1,"g":2,"b":3}]', 2],
    ];
    const canvases = [
      '"constructor"', '{"value":"abc","sys":"cm"}', '{"value":"NaN","sys":"in"}', '{"value":-5,"sys":"in"}', '{"value":1e400}', '{"value":"1e309","sys":"cm"}', '{"value":[7],"sys":"xx"}', '{"value":{"a":1},"sys":"cm"}',
      '[5]', '5', 'null', '{"__proto__":{"value":5,"sys":"in"}}', '{"value":"5","sys":"__proto__"}', 'garbage', '{"value":true,"sys":"in"}', '{"value":"  7  ","sys":"in"}',
    ];
    for (let i = 0; i < palettes.length; i++) {
      const [pal, valid] = palettes[i];
      const cv = canvases[i];
      const page = await openPage(site, { storage: { [PALETTE_KEY]: pal, [CANVAS_KEY]: cv, [DRAWERS_KEY]: '["swatches"]' } });
      const s = await page.evaluate(() => ({ n: document.querySelectorAll('#swatches li').length, count: document.getElementById('palCount').textContent.trim(), state: document.getElementById('swatchesState').textContent.trim(), size: document.getElementById('canvasSize').value, sys: document.getElementById('canvasSys').value, banner: !!document.querySelector('#toast .toast-action') }));
      const sizeOk = s.size === '' || (Number.isFinite(+s.size) && +s.size > 0);
      const plural = (n) => `${n} color${n === 1 ? '' : 's'}`;
      t.check(s.n === valid && s.count === (valid ? plural(valid) : '') && s.state === (valid ? plural(valid) : 'None yet') && !s.banner, `palette ${pal.slice(0, 40)}: only the ${valid} sound color${valid === 1 ? '' : 's'} show, no reset banner`, s);
      t.check(sizeOk && (s.sys === 'cm' || s.sys === 'in'), `canvas length ${cv.slice(0, 40)}: the field holds nothing or a positive number, cm or in`, s);
      await setTool(page, 'measure');
      const unitText = s.size === '' ? '1 U' : '1 U · ' + (s.sys === 'in' ? (() => { const e = Math.round(+s.size * 8), w = Math.floor(e / 8), rest = e % 8; return (w || !rest ? w : '') + ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][rest] + ' in'; })() : Math.round(+s.size * 10) / 10 + ' cm');
      const r = await dragPx(page, 0.1, 0.4, 80, 0, { during: () => loupe(page) });
      t.check(r.r.hex === unitText && (await count(page, 'measure')) === 1, `with ${cv.slice(0, 30)} saved, measuring still works and the unit reads what the field shows`, { loupe: r.r, unitText });
      const r2 = await dragPx(page, 0.1, 0.5, 40, 0, { during: () => loupe(page) });
      t.check(/^0\.50 U ≈ ½( · \S+ (cm|in))?$/.test(r2.r.hex), `with ${cv.slice(0, 30)} saved, a second measure reads sanely`, r2.r);
      await clean(t, page, `hostile ${i}`);
      await page.context().close();
    }
    t.note('Saved state read leniently: a canvas length saved as [7], true or "  7  " comes back as 7, 1 and 7 (app.js 1505: +saved.value > 0), and a saved list holding the same color twice shows it twice (readPalette filters shapes, not duplicates). Nothing breaks; the field shows what was read.');
    // a huge saved palette: it renders, and Save as PNG must say something true
    {
      const list = []; for (let i = 0; i < 1600; i++) list.push({ r: i % 256, g: (i * 7) % 256, b: (i * 13) % 256 });
      const t0 = Date.now();
      const page = await openPage(site, { storage: { [PALETTE_KEY]: list, [DRAWERS_KEY]: '["swatches"]' } });
      const n = await page.evaluate(() => document.querySelectorAll('#swatches li').length);
      t.check(n === 1600 && (await text(page, '#palCount')) === '1600 colors', 'a saved palette of 1,600 colors renders with its count', { n, ms: Date.now() - t0 });
      t.note(`a saved palette of 1,600 colors: the page opened in ${Date.now() - t0} ms.`);
      await resetToast(page);
      const dl = await download(page, () => click(page, '#palSave'), 10000);
      const said = await text(page, '#toast');
      const ok = !!dl || (said && !/Working size/.test(said));
      t.check(ok, 'Save as PNG with 1,600 picked colors downloads, or says truly why it cannot', { downloaded: !!dl, said });
      if (!ok) t.finding({ title: 'Save as PNG of a big picked-colors list fails with a message about the Working size, which has nothing to do with it', severity: 'medium', steps: '1. Have 1,573 or more picked colors (for instance a saved portrait-value-studio.palette list of that length; Add block colors adds a dozen a photo). 2. Open Picked colors and press Save as PNG.', expected: 'The PNG downloads (several rows), or the page says the list is too long to draw as one picture and offers to save part of it.', actual: `No download; the toast says "${said}". Cause: js/app.js 1116–1124 (palSave) lays the swatches six to a row, 234 px a row plus gaps, so from 263 rows (1,573 colors) the canvas is taller than 65,535 px, the browser's limit, toBlob gives null, and savePng (lines 198–200) answers with the Working-size message written for the study images.` });
      await clean(t, page, 'huge palette');
      await page.context().close();
    }
  }

  // ---- the tools on a 390 px phone, under a touch ------------------------------------------------------------
  {
    const page = await openPage(site, { viewport: PHONE });
    const cdp = await page.context().newCDPSession(page);
    const strip = await page.locator('.toolstrip').boundingBox();
    t.check(strip && strip.x >= 0 && strip.x + strip.width <= 390 && strip.y >= 0 && (await hscroll(page)) <= 0, 'phone: the tool bar is a row at the top, inside the screen', strip);
    t.check((await page.evaluate(() => [...document.querySelectorAll('.toolstrip .tool-btn')].filter((b) => b.getBoundingClientRect().width > 0).length)) === 5, 'phone: all five tool buttons show');
    await page.evaluate(() => scrollTo(0, 700)); await sleep(200);
    const pinned = await page.locator('.toolstrip').boundingBox();
    t.check(pinned && pinned.y >= 0 && pinned.y < 40 && (await page.evaluate(() => scrollY)) > 500, 'phone: scrolled down, the tool bar stays pinned to the top', pinned);
    const inView = async () => { await page.evaluate(() => document.getElementById('cv-orig').scrollIntoView({ block: 'center' })); await sleep(200); return box(page); };
    const touchDrag = async (b, from, to) => {
      const at = (p) => ({ x: b.x + b.width * p[0], y: b.y + b.height * p[1] });
      const a = at(from), z = at(to);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (z.x - a.x) * i / 8, y: a.y + (z.y - a.y) * i / 8 }] }); await sleep(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(250);
    };
    const touchTap = async (b, p) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width * p[0], y: b.y + b.height * p[1] }] });
      await sleep(60);
      const mid = { loupe: await loupe(page), bottom: await page.evaluate(() => document.getElementById('loupe').getBoundingClientRect().bottom), finger: b.y + b.height * p[1] };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
      return mid;
    };
    const scrolled = async (fn) => { const y0 = await page.evaluate(() => scrollY); await fn(); return (await page.evaluate(() => scrollY)) - y0; };
    // the magnifier: a touch drag scrolls the page and picks nothing; a tap shows the loupe above the finger and picks
    let b = await inView();
    let dy = await scrolled(() => touchDrag(b, [0.5, 0.8], [0.5, 0.2]));
    t.check(dy > 100 && (await swatches(page)).length === 0, 'phone, magnifier: a touch drag on the image scrolls the page and picks nothing', { dy });
    b = await inView();
    const tap = await touchTap(b, [0.5, 0.42]);
    t.check(tap.loupe.shown && tap.bottom < tap.finger && /^#[0-9A-F]{6}$/.test(tap.loupe.hex), 'phone, magnifier: a touch shows the loupe above the finger', tap);
    t.check((await swatches(page)).length === 1 && (await toastShown(page)) === `Added ${tap.loupe.hex}`, 'phone, magnifier: a tap keeps the color', await toastShown(page));
    const hid = await page.waitForFunction(() => document.getElementById('loupe').hidden, null, { timeout: 2500 }).then(() => true).catch(() => false);
    t.check(hid, 'phone: the loupe goes by itself after a tap');
    // Lines, Measure, Plumb: a touch draws instead of scrolling
    await setTool(page, 'line');
    t.check((await visible(page, '#toolOptions')) && (await hscroll(page)) <= 0, 'phone: the options row shows with Lines on, without horizontal scroll');
    const optTop = await page.evaluate(() => { const o = document.getElementById('toolOptions').getBoundingClientRect(), p = document.querySelector('#panels .matte').getBoundingClientRect(); return [o.bottom, p.top]; });
    t.check(optTop[0] <= optTop[1], 'phone: the options row sits above the images', optTop);
    b = await inView();
    dy = await scrolled(() => touchDrag(b, [0.2, 0.7], [0.8, 0.3]));
    t.check(dy === 0 && (await count(page, 'line')) === 1, 'phone, Lines: a touch drag draws a line and does not scroll', { dy, lines: await count(page, 'line') });
    await setTool(page, 'measure');
    b = await inView();
    dy = await scrolled(() => touchDrag(b, [0.2, 0.5], [0.8, 0.5]));
    t.check(dy === 0 && (await count(page, 'measure')) === 1, 'phone, Measure: a touch drag measures and does not scroll', { dy, measures: await count(page, 'measure') });
    await setTool(page, 'plumb');
    b = await inView();
    await touchTap(b, [0.3, 0.3]);
    t.check((await count(page, 'plumb')) === 1 && !(await loupe(page)).shown, 'phone, Plumb: a tap drops a point and the loupe goes with the finger');
    dy = await scrolled(() => touchDrag(b, [0.3, 0.3], [0.6, 0.6]));
    t.check(dy === 0 && (await count(page, 'plumb')) === 1 && (await overlayHas(page, 'cv-orig', 0.6, 0.05, MEASURE_COLOR, 6)), 'phone, Plumb: dragging a ring moves the point without scrolling', { dy });
    await click(page, '[data-tool="plumb"]'); await sleep(50); // pressed again: off
    t.check((await pressed(page, '[data-tool="plumb"]')) === 'false' && /touching an image scrolls/.test(await text(page, '#toolHint')), 'phone: pressing the tool again turns it off and the row says touching scrolls');
    b = await inView();
    dy = await scrolled(() => touchDrag(b, [0.5, 0.8], [0.5, 0.2]));
    t.check(dy > 100 && (await count(page, 'plumb')) === 1 && (await count(page, 'line')) === 1, 'phone, no tool: a touch drag scrolls and draws nothing', { dy });
    await clean(t, page, 'phone touch');
    await page.context().close();
  }

  // ---- keyboard only: the tool buttons, the color radios and the grid ------------------------------------------
  {
    const page = await openPage(site);
    await page.focus('[data-tool="line"]'); await page.keyboard.press('Space'); await sleep(30);
    t.check((await pressed(page, '[data-tool="line"]')) === 'true' && (await visible(page, '.line-tools')), 'keyboard: Space on Lines turns it on');
    await page.focus('#lcRed'); await page.keyboard.press('ArrowRight'); await sleep(30);
    t.check(await page.evaluate(() => document.getElementById('lcCyan').checked), 'keyboard: the arrow keys pick a line color');
    await dragFrac(page, [0.2, 0.4], [0.8, 0.4]);
    t.check(await overlayHas(page, 'cv-orig', 0.5, 0.4, COLORS.lcCyan), 'the line takes the color picked by keyboard');
    await page.focus('#lineUndo'); await page.keyboard.press('Enter'); await sleep(30);
    t.check((await count(page, 'line')) === 0, 'keyboard: Enter on Undo line takes it back');
    await page.focus('#gridBtn');
    const labels = [];
    for (let k = 0; k < 3; k++) { await page.keyboard.press('Enter'); await sleep(20); labels.push(await page.evaluate(() => document.getElementById('gridBtn').getAttribute('aria-label'))); }
    t.check(labels.join('|') === 'Grid: 3 × 3|Grid: 4 × 4|Grid: off', 'keyboard: Enter steps the grid and its label', labels);
    await page.focus('[data-tool="measure"]'); await page.keyboard.press('Enter'); await sleep(30);
    t.check((await pressed(page, '[data-tool="measure"]')) === 'true' && (await pressed(page, '[data-tool="line"]')) === 'false', 'keyboard: Enter on Measure switches tools');
    await page.keyboard.press('Enter'); await sleep(30);
    t.check((await pressed(page, '[data-tool="measure"]')) === 'false' && /No tool is on/.test(await text(page, '#toolHint')), 'keyboard: Enter again turns the tool off');
    await clean(t, page, 'keyboard');
    await page.context().close();
  }
}
