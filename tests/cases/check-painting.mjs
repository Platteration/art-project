// How close did I get? (Check my painting), played like a sceptical tester: the drawer with the built-in
// example on the #check route and from the guide's Try it button; its badge, open and closed, and after a
// reload; the three scores, their ranges and the grade for each; the five biggest differences with their
// plain notes; the numbered white labels on the accuracy map and a hover on a zone, covered and left out;
// Move, Size and Rotate at their ends and one past them, the hatched left-out area and the panel's note,
// the full correction of the example, slider spam, Reset while busy, and the keyboard; Show reference on
// top; Fix color cast on the example and on a painting with known patches (neutral gray, tinted whites,
// skin, brick red, leaf green, a bright orange and a yellow, a dark spot, spots at and past the blue
// limit), picking again, Remove color fix, Esc, a double tap, picking cancelled by a tab switch, the panel
// and the drawer closing, and by a new painting; the reference's own pixels as the painting (100 on
// every score, at every lean, preset and working size); every kind of file for the painting by input,
// drop and paste (a text file, a broken JPEG, SVGs, 1 px, strips, a transparent PNG, flat white and
// black, WebP, 24 megapixels and one past it), the drop hint, and a drop with the drawer closed; Crop and
// Stretch; a new reference while the drawer is open, with the example and with a painting of the
// visitor's; Use my Studio painting with a blank paper, with strokes, twice, and with a dealt portrait,
// and with painting.js missing; Simple and Advanced hints; hostile saved state for every key the drawer
// depends on; and the phone width. Added from a coverage review: the README's formulas and its worked 75 on
// paintings made from the reference with one known change (lighter, darker, grayer, warmer, moved, turned,
// enlarged, a value zone repainted, padded, squashed), the uncovered part left out of the score, Crop and Stretch
// shown correct; the list's direction and order and each white label tied to its entry; lines, measures, plumb
// lines and the grid on the check panels and in their PNGs; a phone JPEG's EXIF turn; files arriving together;
// the gain limits at their edges, a pick under the faded reference and on the gray fill of a moved photo, the fix
// through moves, fits and a new reference; the Studio after another deal, a photo of the visitor's own, a turned
// and toned paper, and a press before the Studio has read its painting back; touch on a phone and Working size
// 1400 there; the Palette block view; axe with the drawer open, light and dark; the drawer's how-tos; the map's
// labels (their numbers, kept inside the picture and apart, on the example, moved, and on a reference of slivers);
// Rotate's and Size's keyboard steps and a half-faded reference; Save PNG inside another site's sandboxed frame;
// Forget, and a second tab, with a painting in the drawer.
// The third pass (ROUND3 at the end): the map and its labels at every working size; paintings much larger, smaller
// and of another shape; the photo itself as the painting at every working size and setting; another subject; Move,
// Size and Rotate at their ends against the hatching; a cut-out painting, files in one instant, the drawer's
// contrast, the red gain limit and the heap.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, newTab, clean, tab, makeImage, textFile, brokenImage, svgImage, dropFiles, pasteFile, stroke, inked, storageGet, click, text, hscroll, screenshot, axe, sleep, PHONE, PROTO_NAMES, ROOT } from '../lib.mjs';

const EXAMPLE_LABEL = 'Example painting · a made-up attempt at the sample: lifted shadows, warmer skin, and photographed slightly tilted. Line it up below to see the score change. Load your own to replace it.';
const NO_ART_LABEL = 'Load a photo of your finished painting to score it against the reference.';
const SAMPLE = /^Sample study · a painted stand-in\./;
const NOT_IMAGE = /^That file is not an image\. Choose a JPG, PNG or WebP photo\.$/;
const NOT_OPENED = /^This image could not be opened\. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first\.$/;
const TOO_SMALL = /^That picture is too small to check \(\d+ × \d+ px\): it needs at least 16 px on each side\.$/; // the painting's own wording, not the Study tab's
const NOTE = /^(Too (light|dark) by \d+\.\d value|Too (warm|cool)|Too (saturated|gray)|Hue is off)(, (too (warm|cool)|too (saturated|gray)))*$/;
const META = /^\d{1,3}% match · (Shadow|Middle|Light) shape · \d+\.\d% of picture · ΔE \d+\.\d · #[0-9A-F]{6} → #[0-9A-F]{6}$/;
const NONE_OFF = 'Every large shape is within ΔE 5 of the reference.';
const PICKING = 'Click a white or gray spot… (Esc to cancel)';
const NOT_PICKING = 'Fix color cast';
const REFUSED = /^#[0-9A-F]{6} is too colorful to be white or gray\. Pick paper or a neutral gray area\.$/;
const TOO_DARK = /^That spot is too dark to judge\. Pick a white or light gray area\.$/;
const FIXED = /^Color cast removed: #[0-9A-F]{6} is now neutral$/;
const LABEL_INK = [28, 29, 32]; // #1c1d20: the ring and digits of the white numbered labels (app.js PILLS.light)
const gradeFor = (score) => (score >= 90 ? 'Very close to the reference' : score >= 75 ? 'Close, with a few shapes off' : score >= 60 ? 'Several shapes are off' : 'Far from the reference');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- helpers for this case -------------------------------------------------

// everything the drawer and its section show, in one read
const state = (page) => page.evaluate(() => {
  const g = (id) => document.getElementById(id);
  const txt = (id) => g(id).textContent.trim();
  return {
    open: g('drawer-check').open, badge: txt('checkState'), label: txt('artSource'), source: txt('source'),
    section: !g('checkSection').hidden, empty: !g('checkEmpty').hidden, body: !g('checkBody').hidden, panels: !g('checkPanels').hidden, alignPanel: !g('alignPanel').hidden, alignOpen: g('alignPanel').open,
    color: +txt('scoreColor'), grade: txt('scoreGrade'), value: +txt('scoreValue'), shapes: txt('scoreShapes'), meterValue: g('meterValue').style.width, meterShapes: g('meterShapes').style.width,
    alignState: txt('alignState'), busy: g('busy').hidden, toast: g('toast').textContent, fit: g('artFit').value,
    list: [...document.querySelectorAll('#fixList li')].map((li) => ({ cls: li.className, num: (li.querySelector('.fix-num') || {}).textContent, note: (li.querySelector('.fix-text strong') || {}).textContent, meta: (li.querySelector('.fix-text small') || {}).textContent, swatches: [...li.querySelectorAll('.fix-swatches span')].map((s) => s.title), text: li.textContent.trim() })),
    wbPick: txt('wbPick'), picking: document.body.classList.contains('picking-neutral'), wbUndo: !g('wbUndo').hidden,
    art: [g('cv-art').width, g('cv-art').height], diff: [g('cv-diff').width, g('cv-diff').height], orig: [g('cv-orig').width, g('cv-orig').height],
    outs: Object.fromEntries(['onion', 'alignX', 'alignY', 'alignScale', 'alignRot'].map((id) => [id, [g(id).value, g(id + 'Out').value]])),
    simple: document.body.classList.contains('mode-simple'), tab: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id),
  };
});
const busyHidden = (page, timeout = 60000) => page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout }).then(() => true).catch(() => false);
const resetToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.classList.remove('show'); });
const waitToast = (page, re, timeout = 15000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source, { timeout }).then(() => true).catch(() => false);
// counts the study runs (each ends with a studio:result event, after the check has run), so a load can be waited for
const countResults = (page) => page.evaluate(() => { if (window.__results === undefined) { window.__results = 0; window.addEventListener('studio:result', () => { window.__results++; }); } });
async function afterResult(page, action, { more = 1, timeout = 60000 } = {}) {
  const n = await page.evaluate(() => window.__results || 0);
  await action();
  const ok = await page.waitForFunction(([n, more]) => (window.__results || 0) >= n + more && document.getElementById('busy').hidden, [n, more], { timeout }).then(() => true).catch(() => false);
  await sleep(120);
  return ok;
}
const loadArt = (page, file) => afterResult(page, () => page.setInputFiles('#artFile', file));
async function setRange(page, id, value) {
  await page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, String(value)]);
  await busyHidden(page); await sleep(60);
}
const setAlign = async (page, x, y, scale, rot) => { for (const [id, v] of [['alignX', x], ['alignY', y], ['alignScale', scale], ['alignRot', rot]]) await setRange(page, id, v); };
// the align panel opened the way a visitor opens it: through its summary
async function openAlign(page) {
  const open = await page.evaluate(() => document.getElementById('alignPanel').open);
  if (!open) { await page.locator('#alignPanel > summary').scrollIntoViewIfNeeded(); await page.locator('#alignPanel > summary').click(); }
  await page.waitForFunction(() => document.getElementById('alignPanel').open, null, { timeout: 3000 }).catch(() => null);
}
const loupe = (page) => page.evaluate(() => ({ shown: !document.getElementById('loupe').hidden, hex: document.getElementById('loupeHex').textContent, val: document.getElementById('loupeVal').textContent, chip: document.getElementById('loupeChip').style.background }));
async function box(page, selector) { const loc = page.locator(selector); await loc.scrollIntoViewIfNeeded(); await sleep(60); return loc.boundingBox(); }
async function hoverAt(page, selector, fx, fy) {
  const b = await box(page, selector);
  await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 2 });
  await page.waitForFunction(() => !document.getElementById('loupe').hidden, null, { timeout: 2000 }).catch(() => null);
  await sleep(60);
  return loupe(page);
}
async function clickAt(page, selector, fx, fy) { const b = await box(page, selector); await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy); await busyHidden(page); await sleep(250); }
const px = (page, id, x, y) => page.evaluate(([id, x, y]) => [...document.getElementById(id).getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [id, x, y]);
const countExact = (page, id, rgb) => page.evaluate(([id, rgb]) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) n++; return n; }, [id, rgb]);
const lightness = (page, rgb) => page.evaluate((c) => window.Study.lightnessOf(c[0], c[1], c[2]), rgb);
const neutral = (rgb, tol = 2) => Math.abs(rgb[0] - rgb[1]) <= tol && Math.abs(rgb[1] - rgb[2]) <= tol && Math.abs(rgb[0] - rgb[2]) <= tol;
// the reference's own pixels (the Study's original view) as a PNG file, with coloured patches painted on or not
const PATCHES = [
  ['neutral gray', [128, 128, 128]], ['warm-tinted white', [231, 215, 184]], ['cool-tinted white', [184, 209, 231]], ['skin', [224, 172, 140]], ['brick red', [180, 60, 40]], ['leaf green', [80, 150, 50]],
  ['dark spot', [20, 20, 20]], ['bright orange', [240, 140, 30]], ['tinted white at the blue limit (×2.9)', [233, 177, 115]], ['tinted white past the blue limit (×3.5)', [241, 174, 106]], ['bright yellow', [250, 230, 20]], ['cool gray needing red ×2.9', [118, 210, 170]],
];
const PATCH = 80, STEP = 100, MARGIN = 10;
const patchAt = (i) => [MARGIN + STEP * (i % 6) + PATCH / 2, MARGIN + STEP * Math.floor(i / 6) + PATCH / 2]; // its centre, in the painting's pixels
// (patches: true for PATCHES, or a list of [name, rgb] laid out the same way)
async function ownPixels(page, { patches = false, name } = {}) {
  const list = patches === true ? PATCHES : patches || null;
  const dataUrl = await page.evaluate(([patches, P, S, M]) => {
    const o = document.getElementById('cv-orig'); const c = document.createElement('canvas'); c.width = o.width; c.height = o.height; const g = c.getContext('2d'); g.drawImage(o, 0, 0);
    if (patches) patches.forEach((p, i) => { g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; g.fillRect(M + S * (i % 6), M + S * Math.floor(i / 6), P, P); });
    return c.toDataURL('image/png');
  }, [list ? list.map((p) => p[1]) : null, PATCH, STEP, MARGIN]);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  return { name: name || (patches ? 'patches.png' : 'same.png'), mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}
// the scorecard as the README promises it: integers 0-100, a percentage, meters that match, a grade for the score
function checkScorecard(t, s, label) {
  t.check(Number.isInteger(s.color) && s.color >= 0 && s.color <= 100 && Number.isInteger(s.value) && s.value >= 0 && s.value <= 100 && /^\d{1,3}%$/.test(s.shapes) && +s.shapes.slice(0, -1) <= 100, `${label}: the scores are whole numbers in 0-100 and a percentage`, { color: s.color, value: s.value, shapes: s.shapes });
  t.check(s.grade === gradeFor(s.color), `${label}: the grade matches the color score`, { color: s.color, grade: s.grade });
  t.check(s.meterValue === s.value + '%' && s.meterShapes === s.shapes, `${label}: the meters show the scores`, { meterValue: s.meterValue, value: s.value, meterShapes: s.meterShapes, shapes: s.shapes });
  t.check(s.badge === `Color ${s.color} · Value ${s.value}`, `${label}: the badge keeps the color and value scores`, s.badge);
  t.check(s.list.length >= 1 && s.list.length <= 5 && (s.list.every((li) => li.cls === 'fix') || (s.list.length === 1 && s.list[0].cls === 'fix-none' && s.list[0].text === NONE_OFF)), `${label}: one to five biggest differences, or the line that none is off`, s.list.map((l) => l.text.slice(0, 60)));
  for (const li of s.list.filter((l) => l.cls === 'fix')) {
    t.check(NOTE.test(li.note) && META.test(li.meta) && li.swatches.length === 2 && /^Reference #[0-9A-F]{6}$/.test(li.swatches[0]) && /^Yours #[0-9A-F]{6}$/.test(li.swatches[1]), `${label}: difference ${li.num} has a plain note, its numbers and the two colors side by side`, li);
  }
  t.check(s.list.filter((l) => l.cls === 'fix').every((li, i) => li.num === String(i + 1)), `${label}: the differences are numbered 1 to ${s.list.length}`, s.list.map((l) => l.num));
}

// ---- helpers for the checks added from the coverage list ----------------------------------------------------

const LINE_RED = '#e5322d'; // the Lines tool's first color (index.html, lcRed)
const UNIT_YELLOW = [255, 210, 31]; // the unit measure's label (app.js UNIT_COLOR)
// one entry of What to fix first, read into its numbers
const FIX_PARTS = /^(\d{1,3})% match · (Shadow|Middle|Light) shape · (\d+\.\d)% of picture · ΔE (\d+\.\d) · (#[0-9A-F]{6}) → (#[0-9A-F]{6})$/;
const fixesOf = (s) => s.list.filter((l) => l.cls === 'fix').map((li) => { const m = FIX_PARTS.exec(li.meta || '') || []; return { num: li.num, note: li.note || '', pct: +m[1], zone: m[2], share: +m[3], dE: +m[4], ref: m[5], art: m[6], swatches: li.swatches }; });
// the README's per-shape score, 100 − 2.5 × ΔE (never below 0): the page shows ΔE to 0.1 (± 0.125 once scaled)
// and the percentage rounded (± 0.5)
const pctFits = (pct, dE) => Number.isFinite(pct) && Number.isFinite(dE) && Math.abs(pct - Math.max(0, 100 - 2.5 * dE)) <= 0.63;
const cssHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const chipHexes = (chip) => (chip.match(/rgb\(\d+, \d+, \d+\)/g) || []).map((c) => cssHex(c.match(/\d+/g).map(Number)));
// does the overlay over a view hold a pixel of this color within `reach` px of the point (fractions of the
// image)? (as study-tools.mjs reads it)
const overlayHas = (page, id, fx, fy, color, reach = 4, tol = 28) => page.evaluate(([id, fx, fy, color, reach, tol]) => {
  const o = document.getElementById(id).nextElementSibling; if (!o.width) return false;
  const g = o.getContext('2d'); const cx = Math.round(fx * o.width), cy = Math.round(fy * o.height);
  const want = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const x0 = Math.max(0, cx - reach), y0 = Math.max(0, cy - reach);
  const d = g.getImageData(x0, y0, Math.min(o.width - x0, 2 * reach + 1), Math.min(o.height - y0, 2 * reach + 1)).data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && Math.abs(d[i] - want[0]) <= tol && Math.abs(d[i + 1] - want[1]) <= tol && Math.abs(d[i + 2] - want[2]) <= tol) return true;
  return false;
}, [id, fx, fy, color, reach, tol]);
const toolCount = (page, tool) => page.evaluate((t) => +(document.querySelector(`[data-tool="${t}"]`).dataset.count || 0), tool);
async function download(page, act, timeout = 8000) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), act()]);
  if (!dl) return null;
  const p = await dl.path().catch(() => null);
  return { name: dl.suggestedFilename(), buf: p ? fs.readFileSync(p) : Buffer.alloc(0) };
}
// a downloaded PNG decoded in the page (from its bytes: no request): its size, pixels at points, how many pixels
// have an exact color, and whether a color lies near a point (fractions)
const pngRead = (page, buf, spec) => page.evaluate(async ([b64, spec]) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([u], { type: 'image/png' }));
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const W = c.width, d = g.getImageData(0, 0, W, c.height).data;
  const at = (spec.at || []).map(([x, y]) => [d[(y * W + x) * 4], d[(y * W + x) * 4 + 1], d[(y * W + x) * 4 + 2]]);
  const count = (spec.count || []).map((rgb) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) n++; return n; });
  const near = (spec.near || []).map(([fx, fy, hex, reach]) => {
    const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); const cx = Math.round(fx * W), cy = Math.round(fy * c.height);
    for (let y = Math.max(0, cy - reach); y <= Math.min(c.height - 1, cy + reach); y++) for (let x = Math.max(0, cx - reach); x <= Math.min(W - 1, cx + reach); x++) { const i = (y * W + x) * 4; if (Math.abs(d[i] - want[0]) <= 28 && Math.abs(d[i + 1] - want[1]) <= 28 && Math.abs(d[i + 2] - want[2]) <= 28) return true; }
    return false;
  });
  return { w: W, h: c.height, at, count, near };
}, [buf.toString('base64'), spec]);
// the boxes (canvas px) of clusters of one exact color on a canvas, with the boxes inside another box dropped (a
// white label's ring holds its digits); `fill` is the share of its box the cluster covers
const clusters = (page, id, rgb, reach = 2) => page.evaluate(([id, rgb, reach]) => {
  const c = document.getElementById(id); const W = c.width, H = c.height; const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const on = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) on[i] = d[i * 4] === rgb[0] && d[i * 4 + 1] === rgb[1] && d[i * 4 + 2] === rgb[2] ? 1 : 0;
  const seen = new Uint8Array(W * H); const boxes = [];
  for (let i = 0; i < W * H; i++) {
    if (!on[i] || seen[i]) continue;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0; const st = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop(); const x = j % W, y = (j / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx; if (on[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
    }
    boxes.push({ x0, y0, x1, y1, n, fill: n / ((x1 - x0 + 1) * (y1 - y0 + 1)) });
  }
  return { W, H, boxes: boxes.filter((b) => !boxes.some((o) => o !== b && o.x0 <= b.x0 && o.y0 <= b.y0 && o.x1 >= b.x1 && o.y1 >= b.y1)) };
}, [id, rgb, reach]);
// the reference's own pixels with one known change, drawn in the page (spec.kind):
//   'lab'    every pixel moved in CIELAB: dL added to L*, a* and b* times `chroma`, and `warm` units toward 50° in
//            a*b* (the page's warm direction)
//   'shift'  drawn dx px to the right, magenta behind;  'turn'  turned `deg` and enlarged `f` about the centre, on
//            mid gray;  'zone'  the reference's lightest or darkest value zone (read off the Dark, middle, light
//            panel) painted one flat color;  'pad'  magenta bars `pad` px wide either side;  'squash'  drawn into w × h
const VARIANT = (spec) => {
  const o = document.getElementById('cv-orig'); const W = o.width, H = o.height;
  const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true }); const info = {};
  g.imageSmoothingQuality = 'high';
  if (spec.kind === 'pad') { c.width = W + 2 * spec.pad; c.height = H; g.fillStyle = '#ff00ff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(o, spec.pad, 0); }
  else if (spec.kind === 'squash') { c.width = spec.w; c.height = spec.h; g.drawImage(o, 0, 0, spec.w, spec.h); }
  else {
    c.width = W; c.height = H;
    g.fillStyle = spec.kind === 'shift' ? '#ff00ff' : '#7f7f7f'; g.fillRect(0, 0, W, H);
    g.save();
    if (spec.kind === 'shift') g.drawImage(o, spec.dx, 0);
    else if (spec.kind === 'turn') { g.translate(W / 2, H / 2); g.rotate(((spec.deg || 0) * Math.PI) / 180); g.scale(spec.f || 1, spec.f || 1); g.drawImage(o, -W / 2, -H / 2); }
    else g.drawImage(o, 0, 0);
    g.restore();
    const img = g.getImageData(0, 0, W, H), d = img.data;
    if (spec.kind === 'lab') {
      const K = 24389 / 27, E = 216 / 24389, inv = (f) => (f * f * f > E ? f * f * f : (116 * f - 16) / K);
      const enc = (v) => { v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
      const wa = Math.cos((50 * Math.PI) / 180), wb = Math.sin((50 * Math.PI) / 180), k = spec.chroma === undefined ? 1 : spec.chroma;
      for (let p = 0; p < d.length; p += 4) {
        const [L, a, b] = window.Study.rgbToLab(d[p], d[p + 1], d[p + 2]);
        const L2 = Math.max(0, Math.min(100, L + (spec.dL || 0))), a2 = a * k + (spec.warm || 0) * wa, b2 = b * k + (spec.warm || 0) * wb;
        const fy = (L2 + 16) / 116, fx = fy + a2 / 500, fz = fy - b2 / 200;
        const X = 0.95047 * inv(fx), Y = L2 > K * E ? fy * fy * fy : L2 / K, Z = 1.08883 * inv(fz);
        d[p] = enc(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z); d[p + 1] = enc(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z); d[p + 2] = enc(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z);
      }
      g.putImageData(img, 0, 0);
    } else if (spec.kind === 'zone') {
      const v = document.getElementById('cv-value').getContext('2d').getImageData(0, 0, W, H).data;
      let lo = 255, hi = 0; for (let p = 0; p < v.length; p += 4) { if (v[p] < lo) lo = v[p]; if (v[p] > hi) hi = v[p]; }
      const want = spec.zone === 'light' ? hi : lo; let n = 0;
      for (let p = 0; p < d.length; p += 4) if (v[p] === want) { d[p] = spec.rgb[0]; d[p + 1] = spec.rgb[1]; d[p + 2] = spec.rgb[2]; n++; }
      g.putImageData(img, 0, 0); info.share = n / (W * H);
    }
  }
  return { url: c.toDataURL('image/png'), info };
};
async function variant(page, name, spec) {
  const r = await page.evaluate(VARIANT, spec);
  const m = /^data:([^;]+);base64,(.*)$/.exec(r.url);
  return { file: { name, mimeType: m[1], buffer: Buffer.from(m[2], 'base64') }, info: r.info };
}
// spots at the edges of the one gain limit that can bind (blue's: see the note where they are used), just inside
// and just outside, each a white tinted the way lamps and daylight tint one (green within 10% of red^0.6 × blue^0.4,
// as js/app.js tintedByLight reads it), computed with the page's own neutralGains; then plain spots for the moves
const EDGES = [
  ['cool white needing blue ×0.53 (just inside: no channel halved)', [162, 192, 255], 'accept'],
  ['cool white needing blue ×0.49 (blue halved)', [147, 186, 255], 'refuse'],
  ['warm white needing blue ×2.96 (just inside: blue at most tripled)', [255, 197, 127], 'accept'],
  ['warm white needing blue ×3.05 (past tripled)', [254, 195, 124], 'refuse'],
  ['warm-tinted white', [231, 215, 184], 'accept'],
  ['cool-tinted white', [184, 209, 231], 'accept'],
  ['skin', [224, 172, 140], 'refuse'],
];
// when the Studio last wrote its painting into the browser's database (0: never)
const studioSavedAt = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('portrait-value-studio');
  r.onsuccess = () => { try { const q = r.result.transaction('studio').objectStore('studio').get('painting'); q.onsuccess = () => { res(q.result ? q.result.savedAt || 0 : 0); r.result.close(); }; q.onerror = () => res(0); } catch (e) { res(0); } };
  r.onerror = () => res(0);
}));
// a slow device's database: every indexedDB.open answers 1.5 s late (an init script: the page's own code is untouched)
const SLOW_DB = () => {
  const real = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function open(...args) {
    const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }; const self = this;
    setTimeout(() => {
      const r = real.apply(self, args);
      r.onupgradeneeded = (e) => { req.result = r.result; if (req.onupgradeneeded) req.onupgradeneeded(e); };
      r.onsuccess = (e) => { req.result = r.result; if (req.onsuccess) req.onsuccess(e); };
      r.onerror = (e) => { req.error = r.error; if (req.onerror) req.onerror(e); };
    }, 1500);
    return req;
  };
};
// a phone with a touch screen: a context of its own (openPage has no touch option), recording what openPage records
async function openTouchPage(site, url) {
  const context = await site.browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  page.log = log;
  page.on('pageerror', (e) => log.pageerrors.push(String(e.stack || e.message).slice(0, 400)));
  page.on('console', (m) => { const x = m.text(); if (/GPU stall|GL Driver Message|SwiftShader|WebGL-0x/i.test(x)) return; if (m.type() === 'error') log.console.push(x.slice(0, 300)); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) log.offsite.push(u); });
  page.on('requestfailed', (r) => { const u = r.url(); const why = (r.failure() || {}).errorText || ''; if (u.startsWith('blob:') || why === 'net::ERR_ABORTED') return; log.failed.push(u + ' ' + why); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${(e.blockedURI || '').slice(0, 60)} ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber}`); }); });
  await page.goto(site.base + url, { waitUntil: 'load' });
  await sleep(300);
  return page;
}
async function tapOn(page, selector, fx, fy) { const b = await box(page, selector); await page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy); }
// a finger put down, moved dx css px sideways (the canvases scroll only up and down: pan-y) and lifted
async function touchDrag(page, cdp, selector, fx, fy, dx) {
  const b = await box(page, selector); const x = b.x + b.width * fx, y = b.y + b.height * fy;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 3; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 3, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await busyHidden(page); await sleep(250);
}
// a JPEG as a phone writes one: 800 × 600 stored, a red square in its stored top-left corner, and an Exif
// Orientation of 6 (turn 90° clockwise to show it), so the upright photo is 600 × 800 with the mark top right
async function exifJpeg(page, name = 'phone.jpg') {
  const url = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 800, 600); g.fillStyle = '#d01010'; g.fillRect(0, 0, 160, 160); return c.toDataURL('image/jpeg', 0.95); });
  const jpg = Buffer.from(url.split(',')[1], 'base64');
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]); // big-endian, one entry: Orientation (SHORT) = 6
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
  return { name, mimeType: 'image/jpeg', buffer: Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]) };
}
// the labels the page draws on the accuracy map, as it draws them: each rounded box (canvas px) with its text and
// font, read off the 2D context's own calls on #cv-diff (a recorder only: every call goes on to the real method);
// the list starts over each time the map's picture is put down
const PILL_LOG = () => {
  const P = CanvasRenderingContext2D.prototype; const rr = P.roundRect, put = P.putImageData, ft = P.fillText;
  window.__pills = [];
  P.putImageData = function putImageData(...a) { if (this.canvas && this.canvas.id === 'cv-diff') window.__pills = []; return put.apply(this, a); };
  P.roundRect = function roundRect(x, y, w, h) { if (this.canvas && this.canvas.id === 'cv-diff') window.__pills.push({ x, y, w, h }); return rr.apply(this, arguments); };
  P.fillText = function fillText(s) { const l = window.__pills; if (this.canvas && this.canvas.id === 'cv-diff' && l.length) { l[l.length - 1].text = s; l[l.length - 1].font = +(/(\d+)px/.exec(this.font) || [])[1]; } return ft.apply(this, arguments); };
};
const pillsOverlapping = (ps) => { const out = []; ps.forEach((a, i) => ps.slice(i + 1).forEach((b) => { const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ix > 0.5 && iy > 0.5) out.push({ labels: [a.text, b.text], at: [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)], by: [+ix.toFixed(1), +iy.toFixed(1)] }); })); return out; };
const pillInside = (p, W, H) => p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.y + p.h <= H;
// a 600 × 750 picture of seeded random pixels, the same on every run (makeImage's noise differs each time)
async function noiseImage(page, name, seed = 7) {
  const url = await page.evaluate((seed) => { const c = document.createElement('canvas'); c.width = 600; c.height = 750; const g = c.getContext('2d'); const d = g.createImageData(600, 750); let x = seed >>> 0; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x >>> 24; }; for (let i = 0; i < d.data.length; i += 4) { d.data[i] = rnd(); d.data[i + 1] = rnd(); d.data[i + 2] = rnd(); d.data[i + 3] = 255; } g.putImageData(d, 0, 0); return c.toDataURL('image/png'); }, seed);
  return { name, mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') };
}

export default async function checkPainting(t, site) {
  let exampleBadge = null; // the example's badge on the #check route, for the Palette block view below
  // ---- the #check route with the built-in example: the drawer, its badge, the list, the map, the sliders, the picks ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    let s = await state(page);
    t.check(s.open && same(s.tab, ['tab-study']) && s.section && s.body && s.panels && !s.empty && s.alignPanel, 'route #check: the Study tab with the drawer open, the results below the studies, the align panel offered', s);
    t.check(s.label === EXAMPLE_LABEL, 'the example painting is named and explained', s.label);
    t.check(same(s.art, [600, 750]) && same(s.diff, [600, 750]) && same(s.art, s.orig), 'the painting and the accuracy map are the reference\'s size (600 × 750)', { art: s.art, diff: s.diff, orig: s.orig });
    checkScorecard(t, s, 'the example');
    t.check(s.list.length === 5, 'the example has five biggest differences', s.list.length);
    // What to fix first, read for what it says: the example is "lifted shadows, warmer skin", the reference's color
    // comes first, each match is 100 − 2.5 × its ΔE, and the list runs from the shape that costs most (share × ΔE)
    {
      const fx = fixesOf(s);
      t.check(fx.some((f) => /^Too light/.test(f.note)) && fx.some((f) => /too warm/i.test(f.note)) && fx.filter((f) => f.zone === 'Shadow').every((f) => !/^Too dark/.test(f.note)), 'the example\'s list says what it is: shapes too light and too warm, no shadow called too dark', fx.map((f) => `${f.zone}: ${f.note}`));
      t.check(fx.every((f) => f.swatches[0] === `Reference ${f.ref}` && f.swatches[1] === `Yours ${f.art}`), 'each difference shows the reference\'s color first and yours second, the two its numbers name (#ref → #yours)', fx.map((f) => [f.swatches, f.ref, f.art]));
      t.check(fx.every((f) => pctFits(f.pct, f.dE)), 'each difference\'s match is 100 − 2.5 × its ΔE', fx.map((f) => [f.pct, f.dE]));
      const costs = fx.map((f) => ({ hi: (f.share + 0.05) * (f.dE + 0.05), lo: (f.share - 0.05) * (f.dE - 0.05), shown: +(f.share * f.dE).toFixed(1) }));
      t.check(costs.every((c, i) => i === 0 || costs[i - 1].hi >= c.lo), 'the differences run from the one that costs most (share × ΔE) down', costs.map((c) => c.shown));
    }
    exampleBadge = s.badge;
    t.check(s.alignState === '' && !s.alignOpen && s.wbPick === NOT_PICKING && !s.wbUndo && s.fit === 'crop', 'nothing moved or fixed yet: no note on the panel, Fix color cast idle, no Remove color fix, Crop to match', { alignState: s.alignState, alignOpen: s.alignOpen, wbPick: s.wbPick, wbUndo: s.wbUndo, fit: s.fit });
    const example = { color: s.color, value: s.value, shapes: +s.shapes.slice(0, -1) };
    // README names against the page's words (the spec is the expectation)
    const words = await page.evaluate(() => ({ color: document.querySelector('#checkBody .score-label').textContent.trim(), subs: [...document.querySelectorAll('#checkBody .score-sub dt')].map((e) => e.textContent.trim()), list: document.querySelector('#checkBody .fixes h3').textContent.trim(), map: document.querySelector('#checkPanels figure:last-child figcaption span').textContent.trim() }));
    t.check(/Accuracy by shape/.test(words.map), 'the map panel is called Accuracy by shape, as the README does', words.map);
    // the README's "You get" list, read from the checkout's README as it stands (an export carries no README),
    // names what the page shows
    const readmePath = path.join(ROOT, 'README.md');
    const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
    const section = readme.slice(readme.indexOf('### How close did I get?'), readme.indexOf('\n## How to use'));
    const promised = [...section.matchAll(/^ {3}- \*\*([^*]+)\*\*/gm)].map((m) => m[1]);
    const shown = [words.color, ...words.subs, words.list, words.map];
    const namedAsReadme = section.length > 0 && shown.every((w) => section.includes(`**${w}**`));
    if (!readme) t.note('no README.md beside the tests: the page\'s names were not checked against the spec');
    else if (!t.check(namedAsReadme, 'the scores, the list and the map carry the names the README promises', { page: shown, readme: promised })) {
      t.finding({ title: 'The README names the results differently from the page', severity: 'low', steps: 'Open index.html#check. Read the scorecard\'s labels, the list\'s heading and the map\'s caption, then the "You get" list of README.md\'s "How close did I get?" section.', expected: 'One vocabulary for the visitor who reads both: the page uses the names the README promises, or the README uses the page\'s.', actual: `The page says ${shown.map((w) => `"${w}"`).join(', ')}; the README promises ${promised.map((w) => `"${w}"`).join(', ')}. Cause: index.html lines 348-385 (the scorecard, the fixes heading and the map caption) against the README section's list.` });
    }
    // Simple mode: plain-words hints, the formulas behind Show the details
    const hints = await page.evaluate(() => { const h = document.querySelector('#checkBody .scorecard > .hint'); const d = document.querySelector('#checkBody details.more'); const shown = (e) => (typeof e.checkVisibility === 'function' ? e.checkVisibility() : getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0); return { simple: document.body.classList.contains('mode-simple'), hint: h.textContent.trim(), hintShown: shown(h), more: d.open, summary: d.querySelector('summary').textContent.trim(), formula: d.querySelector('.hint').textContent.trim(), formulaShown: shown(d.querySelector('.hint')), mapHint: document.querySelector('#checkPanels figure:last-child .hint').textContent.trim() }; });
    t.check(hints.simple && hints.hintShown && /^Color score: how close your colors are to the reference, shape by shape\. Light and dark score: .* Shapes in the right place: .*$/.test(hints.hint), 'Simple mode: the scoring hint says what the numbers mean in plain words', hints.hint);
    t.check(!hints.more && !hints.formulaShown && hints.summary === 'Show the details' && /100 − 2\.5 × ΔE/.test(hints.formula) && /100 − 5 × \|ΔL\*\|/.test(hints.formula) && /CIEDE2000/.test(hints.formula), 'the formulas sit behind Show the details, closed', { more: hints.more, summary: hints.summary, formula: hints.formula.slice(0, 80) });
    t.check(/100% is a perfect match/.test(hints.mapHint) && /white labels are the biggest differences/.test(hints.mapHint) && /Hover or tap a shape/.test(hints.mapHint), 'the map explains its percentages, white labels and hover', hints.mapHint);
    // the drawer's own how-tos (the photo advice, the Fix color cast how-to) and the guide's steps for this drawer
    // name what the page shows
    const howto = await page.evaluate(() => ({
      drawer: document.querySelector('#drawer-check .drawer-body > .hint').textContent.replace(/\s+/g, ' ').trim(), wb: document.getElementById('wbStatus').textContent.replace(/\s+/g, ' ').trim(), wbPick: document.getElementById('wbPick').textContent.trim(),
      guide: [...document.querySelectorAll('#help-check li strong')].map((e) => e.textContent.trim()),
      controls: [...document.querySelectorAll('#drawer-check label, #drawer-check button, #drawer-check summary, #checkSection .score-label, #checkSection dt, #checkSection h3')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    }));
    t.check(/straight on/.test(howto.drawer) && /framed like the reference/.test(howto.drawer) && /Studio tab/.test(howto.drawer), 'the drawer says how to photograph the painting as the README does (straight on, framed like the reference), and offers the Studio painting', howto.drawer);
    t.check(howto.wb.includes(howto.wbPick) && /white or gray/.test(howto.wb) && /paper/.test(howto.wb), 'the align panel says how to fix a color cast, naming the button by its own words and the paper as the spot', howto.wb);
    const unnamed = howto.guide.filter((g) => !howto.controls.some((c) => c.toLowerCase().startsWith(g.toLowerCase())));
    t.check(howto.guide.length >= 6 && unnamed.length === 0, 'the guide\'s steps for How close did I get? name the drawer\'s controls as the page labels them', { guide: howto.guide, unnamed });
    await page.locator('#checkBody details.more > summary').scrollIntoViewIfNeeded(); await page.locator('#checkBody details.more > summary').click(); await sleep(150);
    t.check(await page.evaluate(() => { const d = document.querySelector('#checkBody details.more'); const h = d.querySelector('.hint'); return d.open && (typeof h.checkVisibility === 'function' ? h.checkVisibility() : h.getBoundingClientRect().height > 0); }), 'Show the details opens and shows the formulas');
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click()); await busyHidden(page); await sleep(100);
    const adv = await page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), hintShown: getComputedStyle(document.querySelector('#checkBody .scorecard > .hint')).display !== 'none', badge: document.getElementById('checkState').textContent.trim() }));
    t.check(!adv.simple && adv.hintShown && adv.badge === s.badge, 'Advanced: the drawer still shows its hint and keeps the score', adv);
    t.note('Advanced mode shows the same plain-words scoring hint as Simple (the hint has no mode class); the README only promises it for Simple.');
    // Outline shapes (Advanced) with the drawer open: the borders are drawn, the scores and the map's labels stay
    {
      const outline = (on) => page.evaluate((on) => { const o = document.getElementById('outlines'); o.checked = on; o.dispatchEvent(new Event('change', { bubbles: true })); }, on);
      t.check(await afterResult(page, () => outline(true)), 'Outline shapes on with the drawer open reruns');
      const o = await state(page);
      const ringOn = await countExact(page, 'cv-diff', LABEL_INK);
      const lo = await hoverAt(page, '#cv-diff', 0.5, 0.45); await page.mouse.move(5, 5);
      t.check(o.badge === s.badge && ringOn > 500 && lo.shown && /^\d{1,3}% match$/.test(lo.hex), 'Outline shapes on: the same scores, the map keeps its white labels and its hover', { badge: o.badge, before: s.badge, ring: ringOn, loupe: lo.hex });
      await afterResult(page, () => outline(false));
    }
    await page.evaluate(() => document.querySelector('[data-mode="simple"]').click()); await busyHidden(page); await sleep(100);

    // the accuracy map: white numbered labels for the biggest differences (white pills ringed and lettered in
    // #1c1d20, a color the blocks and the dark percentage pills never have), a hover on a zone
    const ringExample = await countExact(page, 'cv-diff', LABEL_INK);
    const ringRef = await countExact(page, 'cv-refblock', LABEL_INK);
    t.check(ringExample > 500 && ringRef === 0, 'the accuracy map carries the white numbered labels the reference blocks do not have', { onMap: ringExample, onBlocks: ringRef });
    // each white label sits on a shape the list names: hovered at its centre, the loupe gives that entry's match
    // and its two colors, and every entry of the list has its own label
    {
      const fx = fixesOf(s);
      const found = await clusters(page, 'cv-diff', LABEL_INK);
      const read = [];
      for (const b of found.boxes) {
        const l = await hoverAt(page, '#cv-diff', (b.x0 + b.x1 + 1) / 2 / found.W, (b.y0 + b.y1 + 1) / 2 / found.H);
        read.push({ at: [Math.round((b.x0 + b.x1) / 2), Math.round((b.y0 + b.y1) / 2)], pct: +(/^(\d{1,3})% match$/.exec(l.hex) || [])[1], colors: chipHexes(l.chip) });
      }
      await page.mouse.move(5, 5);
      const owner = read.map((r) => fx.findIndex((f) => f.pct === r.pct && same(r.colors, [f.ref, f.art])));
      t.check(read.length === fx.length && owner.every((i) => i >= 0) && new Set(owner).size === fx.length, 'every white label sits on the shape of one entry of the list (its match and both colors under it), one label per entry', { labels: read, entry: owner.map((i) => i + 1) });
      // (the labels' own text, numbers and percentages, is read off the canvas's drawing calls in the labels block at the end)
    }
    let l = await hoverAt(page, '#cv-diff', 0.5, 0.45);
    t.check(l.shown && /^\d{1,3}% match$/.test(l.hex) && /^ΔE \d+\.\d$/.test(l.val) && /^linear-gradient\(90deg, rgb\(\d+, \d+, \d+\) 50%, rgb\(\d+, \d+, \d+\) 50%\)$/.test(l.chip), 'hovering a zone shows its match, its ΔE and the reference color next to yours', l);
    const onArt = await hoverAt(page, '#cv-art', 0.5, 0.45);
    t.check(onArt.shown && /^#[0-9A-F]{6}$/.test(onArt.hex) && /^V \d+(\.\d)?$/.test(onArt.val), 'hovering Your painting shows the plain hex and value', onArt);
    await page.mouse.move(5, 5); await sleep(100);
    await page.evaluate(() => document.querySelector('[data-tool="line"]').click()); await sleep(80);
    l = await hoverAt(page, '#cv-diff', 0.5, 0.45);
    t.note(`with the Lines tool chosen, hovering a zone of the accuracy map shows ${l.shown ? 'the loupe' : 'no loupe'} (the README's "Hover any zone" holds with the magnifier, the tool on at the start)`);
    await page.evaluate(() => document.querySelector('[data-tool="sample"]').click()); await page.mouse.move(5, 5); await sleep(80);

    // the badge keeps the score with the drawer closed; the results leave with it
    await page.locator('#drawer-check > summary').scrollIntoViewIfNeeded(); await page.locator('#drawer-check > summary').click(); await sleep(250);
    s = await state(page);
    t.check(!s.open && !s.section && s.badge === `Color ${example.color} · Value ${example.value}`, 'closed: the results go, the badge keeps the score', { open: s.open, section: s.section, badge: s.badge });
    t.check((JSON.parse(await storageGet(page, 'portrait-value-studio.drawers') || '[]')).includes('check') === false, 'closing is remembered (the drawers key no longer lists check)', await storageGet(page, 'portrait-value-studio.drawers'));
    await page.locator('#drawer-check > summary').click(); await sleep(250);
    s = await state(page);
    t.check(s.open && s.section && s.body && s.badge === `Color ${example.color} · Value ${example.value}`, 'reopened: the same results, no rerun needed', { open: s.open, badge: s.badge, busy: s.busy });
    t.check((JSON.parse(await storageGet(page, 'portrait-value-studio.drawers') || '[]')).includes('check'), 'opening is remembered', await storageGet(page, 'portrait-value-studio.drawers'));
    await page.evaluate(() => { const d = document.getElementById('drawer-check'); d.open = false; d.open = true; d.open = false; d.open = true; }); await sleep(300);
    s = await state(page);
    t.check(s.open && s.section && s.body && !s.empty, 'toggled four times in a row it ends open with its results', { open: s.open, section: s.section, body: s.body });
    await clean(t, page, 'the example');

    // Move, Size and Rotate: the keyboard, the extremes, one past them, the hatched area and the note
    await openAlign(page);
    s = await state(page);
    t.check(s.alignOpen, 'the align panel opens from its summary');
    await page.focus('#alignX'); await page.keyboard.press('ArrowRight'); await busyHidden(page); await sleep(80);
    s = await state(page);
    t.check(same(s.outs.alignX, ['0.2', '+0.2%']) && s.alignState === 'moved', 'an arrow key moves the photo one step (0.2%) and the panel says moved', { outs: s.outs.alignX, alignState: s.alignState });
    await page.keyboard.press('End'); await busyHidden(page); await sleep(80);
    s = await state(page);
    t.check(same(s.outs.alignX, ['20', '+20%']) && s.alignState === 'moved, 20% of picture left out', 'End takes Move to +20% and the panel says 20% is left out', { outs: s.outs.alignX, alignState: s.alignState });
    const hatch = await page.evaluate(() => { const c = document.getElementById('cv-diff'); const d = c.getContext('2d').getImageData(0, 300, 40, 1).data; const v = []; for (let i = 0; i < d.length; i += 4) v.push(d[i] === d[i + 1] && d[i + 1] === d[i + 2] ? d[i] : -1); return v; });
    t.check(hatch.every((v) => v === 105 || v === 78) && hatch.includes(105) && hatch.includes(78), 'the uncovered strip is hatched in two grays on the accuracy map', hatch.slice(0, 12));
    l = await hoverAt(page, '#cv-diff', 0.05, 0.5);
    t.check(l.shown && l.hex === 'Not covered' && l.val === 'left out' && l.chip === 'transparent', 'hovering the hatched area says Not covered, left out', l);
    l = await hoverAt(page, '#cv-diff', 0.7, 0.5);
    t.check(l.shown && /^\d{1,3}% match$/.test(l.hex), 'hovering a covered zone still reads its match', l);
    await page.mouse.move(5, 5);
    await page.focus('#alignReset'); await page.keyboard.press('Enter'); await busyHidden(page); await sleep(80);
    s = await state(page);
    t.check(same(s.outs.alignX, ['0', '0%']) && s.alignState === '' && s.color === example.color, 'Reset position from the keyboard puts the photo back and clears the note', { outs: s.outs, alignState: s.alignState, color: s.color });
    const ends = [['alignX', 20, '+20%', 20], ['alignX', -20, '-20%', 20], ['alignY', 20, '+20%', 20], ['alignY', -20, '-20%', 20], ['alignScale', 80, '80%', 36], ['alignScale', 125, '125%', 0], ['alignRot', 15, '+15°', 11], ['alignRot', -15, '-15°', 11]];
    for (const [id, v, out, left] of ends) {
      await click(page, '#alignReset'); await busyHidden(page);
      await setRange(page, id, v);
      s = await state(page);
      const want = left ? `moved, ${left}% of picture left out` : 'moved';
      t.check(s.outs[id][1] === out && s.alignState === want, `${id} at ${v}: the output reads ${out} and the panel says "${want}"`, { out: s.outs[id], alignState: s.alignState });
      checkScorecard(t, s, `${id} at ${v}`);
    }
    for (const [id, v, out] of [['alignX', 25, '+20%'], ['alignY', -99, '-20%'], ['alignScale', 200, '125%'], ['alignScale', 1, '80%'], ['alignRot', 90, '+15°']]) {
      await setRange(page, id, v);
      s = await state(page);
      t.check(s.outs[id][1] === out, `${id} pushed to ${v} stays at its end (${out})`, s.outs[id]);
    }
    await click(page, '#alignReset'); await busyHidden(page);
    await setAlign(page, 20, 20, 80, 15);
    s = await state(page);
    const left = +(/(\d+)% of picture left out/.exec(s.alignState) || [])[1];
    t.check(left >= 40 && left <= 60, 'every slider at its end: about half the picture is left out and said so', s.alignState);
    checkScorecard(t, s, 'every slider at its end');
    const hatched = await countExact(page, 'cv-diff', [105, 105, 105]);
    t.check(hatched > 20000 && same((await state(page)).diff, [600, 750]), 'the map still draws, half of it hatched', { hatchedPixels: hatched });
    // the example is tilted 2°, shifted and 3% large: its full correction raises the value and shapes scores
    await setAlign(page, -1.4, 0.6, 97, -2);
    s = await state(page);
    const corrected = { color: s.color, value: s.value, shapes: +s.shapes.slice(0, -1) };
    t.check(corrected.value >= example.value && corrected.shapes >= example.shapes && corrected.color >= example.color && (corrected.value > example.value || corrected.shapes > example.shapes), 'lining the example up (−1.4%, +0.6%, 97%, −2°) raises its scores', { before: example, after: corrected, note: s.alignState });
    // slider spam, then Reset while the indicator is up
    const spam = await page.evaluate(() => { const e = document.getElementById('alignRot'); for (let i = 0; i < 80; i++) { e.value = ((i % 2) ? 1 : -1) * (i / 6); e.dispatchEvent(new Event('input', { bubbles: true })); } e.value = 3; e.dispatchEvent(new Event('input', { bubbles: true })); return !document.getElementById('busy').hidden; });
    await busyHidden(page); await sleep(200);
    s = await state(page);
    t.check(spam && s.busy && same(s.outs.alignRot, ['3', '+3°']) && /^moved, \d+% of picture left out$/.test(s.alignState), 'eighty slider events in a row: the indicator goes up and comes down, the last value is the one scored', { busyWentUp: spam, busy: s.busy, out: s.outs.alignRot, alignState: s.alignState });
    await page.evaluate(() => { const e = document.getElementById('alignScale'); e.value = 90; e.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('alignReset').click(); });
    await busyHidden(page); await sleep(200);
    s = await state(page);
    t.check(s.busy && same(s.outs.alignScale, ['100', '100%']) && same(s.outs.alignRot, ['0', '0°']) && s.alignState === '' && s.color === example.color, 'Reset pressed while the indicator is up wins: everything back, the first score again', { outs: s.outs, alignState: s.alignState, color: s.color });
    // Show reference on top
    const artPx = await px(page, 'cv-art', 300, 400), origPx = await px(page, 'cv-orig', 300, 400);
    await setRange(page, 'onion', 100);
    s = await state(page);
    const onTop = await px(page, 'cv-art', 300, 400);
    const loupeOnTop = await hoverAt(page, '#cv-art', 0.5, 400 / 750);
    await page.mouse.move(5, 5);
    t.check(same(s.outs.onion, ['100', '100%']) && same(onTop, origPx) && !same(onTop, artPx), 'Show reference on top at 100%: the reference covers Your painting', { out: s.outs.onion, shown: onTop, reference: origPx, painting: artPx });
    t.check(loupeOnTop.shown && /^#[0-9A-F]{6}$/.test(loupeOnTop.hex), 'with the reference on top the loupe still reads a color', loupeOnTop);
    await setRange(page, 'onion', 0);
    t.check(same(await px(page, 'cv-art', 300, 400), artPx) && (await state(page)).color === example.color, 'back at 0% the painting shows again and the score never changed', await px(page, 'cv-art', 300, 400));
    await screenshot(page, 'check-painting-example');
    await clean(t, page, 'move, size and rotate');

    // Fix color cast on the example: a wrong canvas, a refused spot, an accepted one, Esc, a double tap, Remove
    await resetToast(page);
    await click(page, '#wbPick'); await sleep(80);
    s = await state(page);
    t.check(s.picking && s.wbPick === PICKING, 'Fix color cast arms and says what to click and how to cancel', s.wbPick);
    await clickAt(page, '#cv-refblock', 0.5, 0.5);
    s = await state(page);
    t.check(s.toast === 'Click a white or gray spot on Your painting' && s.picking, 'a click on another picture while picking says where to click and keeps picking', { toast: s.toast, picking: s.picking });
    await resetToast(page);
    await clickAt(page, '#cv-art', 0.5, 0.45);
    s = await state(page);
    t.check(REFUSED.test(s.toast) && s.picking && !s.wbUndo && s.alignState === '', 'the example\'s skin is refused as too colorful, picking stays on, nothing fixed', { toast: s.toast, picking: s.picking, wbUndo: s.wbUndo });
    await resetToast(page);
    await clickAt(page, '#cv-art', 0.08, 0.08);
    s = await state(page);
    const cornerFixed = await px(page, 'cv-art', 48, 60);
    t.check(FIXED.test(s.toast) && !s.picking && s.wbPick === NOT_PICKING && s.wbUndo && s.alignState === 'color cast fixed', 'the example\'s background corner is accepted: the toast names the spot, picking ends, Remove color fix and the note appear', { toast: s.toast, picking: s.picking, wbUndo: s.wbUndo, alignState: s.alignState });
    t.check(neutral(cornerFixed, 3), 'the picked spot is neutral after the fix', cornerFixed);
    checkScorecard(t, s, 'after the fix');
    await click(page, '#wbPick'); await sleep(50); await page.keyboard.press('Escape'); await sleep(50);
    s = await state(page);
    t.check(!s.picking && s.wbPick === NOT_PICKING && s.wbUndo, 'Esc cancels picking and leaves the fix in place', { picking: s.picking, wbUndo: s.wbUndo });
    await click(page, '#wbPick'); await click(page, '#wbPick'); await sleep(50);
    t.check(!(await state(page)).picking, 'a double tap on Fix color cast ends where it started (off)');
    // the keyboard alone: Enter arms the pick, Tab moves on (the focus is not held), Esc disarms
    {
      await page.focus('#wbPick'); await page.keyboard.press('Enter'); await sleep(60);
      const armed = (await state(page)).picking;
      await page.keyboard.press('Tab'); await sleep(60);
      const focus = await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
      await page.keyboard.press('Escape'); await sleep(60);
      t.check(armed && focus !== 'wbPick' && !(await state(page)).picking, 'keyboard: Enter arms Fix color cast, Tab moves the focus on, Esc disarms', { armed, focus });
      t.note('A keyboard-only visitor can arm Fix color cast but cannot choose the spot: the pictures take no focus and no key picks one. The README asks for a click, so this is recorded here rather than failed.');
    }
    await click(page, '#wbPick'); await resetToast(page);
    {
      const b = await box(page, '#cv-art');
      await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3, { steps: 5 }); await page.mouse.up(); await sleep(300);
      s = await state(page);
      t.check(s.toast === 'Click one white or gray spot, without dragging' && s.picking, 'a drag (not a click) across Your painting while picking says to click one spot, and picking stays on', { toast: s.toast, picking: s.picking });
      if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
    }
    await click(page, '#wbPick'); await sleep(50);
    await tab(page, 'paint'); await tab(page, 'study');
    s = await state(page);
    t.check(!s.picking && s.wbPick === NOT_PICKING, 'switching tabs while picking cancels it', s.wbPick);
    await click(page, '#wbPick'); await sleep(50);
    await page.locator('#alignPanel > summary').click(); await sleep(200);
    s = await state(page);
    t.check(!s.alignOpen && !s.picking, 'closing the align panel while picking cancels it', { alignOpen: s.alignOpen, picking: s.picking });
    await openAlign(page);
    await click(page, '#wbPick'); await sleep(50);
    await page.evaluate(() => { document.getElementById('drawer-check').open = false; }); await sleep(200);
    t.check(!(await state(page)).picking, 'closing the drawer while picking cancels it');
    await page.evaluate(() => { document.getElementById('drawer-check').open = true; }); await sleep(200);
    await click(page, '#wbUndo'); await busyHidden(page); await sleep(100);
    s = await state(page);
    t.check(!s.wbUndo && s.alignState === '' && s.color === example.color && s.value === example.value, 'Remove color fix: the button goes, the note goes, the first scores are back', { wbUndo: s.wbUndo, alignState: s.alignState, color: s.color, value: s.value });
    // Save PNG on the two panels that offer it
    for (const [id, name] of [['diff', 'sample-study-accuracy-map.png'], ['artblock', 'sample-study-my-painting-blocks.png']]) {
      const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.locator(`[data-save="${id}"]`).scrollIntoViewIfNeeded(); await page.locator(`[data-save="${id}"]`).click();
      const d = await dl;
      t.check(d && d.suggestedFilename() === name, `Save PNG on ${id} downloads ${name}`, d && d.suggestedFilename());
      await page.evaluate(() => { const dlg = document.getElementById('saveDialog'); if (dlg.open) dlg.close(); });
    }
    await clean(t, page, 'fix color cast on the example');
    await page.context().close();
  }

  // ---- the reference's own pixels as the painting, then a painting with known patches for the color picks ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    t.check(await loadArt(page, await ownPixels(page)), 'the reference\'s own pixels load as the painting');
    let s = await state(page);
    t.check(s.label === 'same.png · 600 × 750 px', 'the label names the file and its size', s.label);
    t.check(s.color === 100 && s.value === 100 && s.shapes === '100%' && s.grade === 'Very close to the reference' && s.badge === 'Color 100 · Value 100', 'the reference as the painting scores 100, 100 and 100%', { color: s.color, value: s.value, shapes: s.shapes, grade: s.grade, badge: s.badge });
    t.check(s.list.length === 1 && s.list[0].cls === 'fix-none' && s.list[0].text === NONE_OFF, 'the list says no large shape is off', s.list);
    const ringSame = await countExact(page, 'cv-diff', LABEL_INK);
    t.check(ringSame === 0 && (await countExact(page, 'cv-diff', [255, 255, 255])) > 500, 'with nothing off, the map has its 100% labels and no white numbered ones', { ring: ringSame });
    // the same settings read both pictures: lean, preset and working size leave the perfect match at 100
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click()); await busyHidden(page);
    for (const lean of [0, 100]) {
      await setRange(page, 'lean', lean); await busyHidden(page); await sleep(100);
      s = await state(page);
      t.check(s.color === 100 && s.value === 100 && s.shapes === '100%', `lean at ${lean}: still 100 on every score`, { color: s.color, value: s.value, shapes: s.shapes });
    }
    await setRange(page, 'lean', 60);
    t.check(await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('detail'); e.value = '600'; e.dispatchEvent(new Event('change', { bubbles: true })); })), 'a smaller working size reruns');
    s = await state(page);
    t.check(same(s.orig, [480, 600]) && same(s.art, s.orig) && same(s.diff, s.orig) && s.color === 100 && s.shapes === '100%', 'at a working size of 600 the painting follows the reference to 480 × 600 and still matches', { orig: s.orig, art: s.art, diff: s.diff, color: s.color, shapes: s.shapes });
    await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('detail'); e.value = '900'; e.dispatchEvent(new Event('change', { bubbles: true })); }));
    await page.evaluate(() => document.querySelector('[data-mode="simple"]').click()); await busyHidden(page);
    await page.evaluate(() => { const r = document.querySelector('input[name="detailPreset"][value="soft"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }); await busyHidden(page); await sleep(100);
    s = await state(page);
    t.check(s.color === 100 && s.value === 100 && s.shapes === '100%' && same(s.art, [600, 750]), 'the Soft preset reads both pictures alike: still 100', { color: s.color, value: s.value, shapes: s.shapes, art: s.art });
    await page.evaluate(() => { const r = document.querySelector('input[name="detailPreset"][value="normal"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }); await busyHidden(page);
    await clean(t, page, 'the reference as the painting');

    // the patches: each spot's verdict as the README describes it
    t.check(await loadArt(page, await ownPixels(page, { patches: true })), 'the patch painting loads (picking again replaces the earlier file)');
    s = await state(page);
    t.check(s.label === 'patches.png · 600 × 750 px' && s.alignPanel && !s.wbUndo && s.alignState === '', 'the new painting replaces the old one and starts unfixed', { label: s.label, wbUndo: s.wbUndo, alignState: s.alignState });
    await openAlign(page);
    const EXPECT = { 'neutral gray': 'already', 'warm-tinted white': 'accept', 'cool-tinted white': 'accept', skin: 'refuse', 'brick red': 'refuse', 'leaf green': 'refuse', 'dark spot': 'dark', 'bright orange': 'refuse', 'tinted white at the blue limit (×2.9)': 'accept', 'tinted white past the blue limit (×3.5)': 'refuse', 'bright yellow': 'refuse', 'cool gray needing red ×2.9': 'refuse' };
    const results = {};
    for (let i = 0; i < PATCHES.length; i++) {
      const [name, rgb] = PATCHES[i];
      const [cx, cy] = patchAt(i);
      await resetToast(page);
      if (!(await state(page)).picking) { await click(page, '#wbPick'); await sleep(50); }
      const elsewhereBefore = await px(page, 'cv-art', 300, 400);
      await clickAt(page, '#cv-art', cx / 600, cy / 750);
      s = await state(page);
      const patchNow = await px(page, 'cv-art', cx, cy);
      const elsewhereAfter = await px(page, 'cv-art', 300, 400);
      results[name] = { toast: s.toast, picking: s.picking, wbUndo: s.wbUndo, alignState: s.alignState, patchNow, elsewhereBefore, elsewhereAfter, color: s.color };
      const want = EXPECT[name];
      if (want === 'accept') {
        t.check(FIXED.test(s.toast) && !s.picking && s.wbUndo && s.alignState === 'color cast fixed', `${name} ${JSON.stringify(rgb)}: accepted, picking ends, Remove color fix offered`, results[name]);
        t.check(neutral(patchNow, 2), `${name}: the patch is neutral afterwards`, patchNow);
        const L0 = await lightness(page, rgb), L1 = await lightness(page, patchNow);
        t.check(Math.abs(L0 - L1) <= 1.5, `${name}: at the same brightness (tint only, not exposure)`, { before: L0.toFixed(1), after: L1.toFixed(1) });
        t.check(!same(elsewhereBefore, elsewhereAfter), `${name}: the same correction reaches the rest of the photo`, { before: elsewhereBefore, after: elsewhereAfter });
      } else if (want === 'already') {
        // a spot that is already neutral has no cast to remove: nothing to undo, no note, and the page says so
        if (!t.check(/already neutral|no color cast/i.test(s.toast) && !/removed/i.test(s.toast) && !s.picking && !s.wbUndo && s.alignState === '' && same(patchNow, rgb) && same(elsewhereBefore, elsewhereAfter), `${name} ${JSON.stringify(rgb)}: told there is no cast to remove, picking ends, nothing to undo`, results[name])) {
          t.finding({ title: 'Picking a spot that is already gray says "Color cast removed" and offers Remove color fix', severity: 'low', steps: 'Open #check, load a painting with a flat #808080 patch (or any neutral gray), open "Line up the photo and fix its colors", press Fix color cast and click the gray patch.', expected: 'A spot that is already neutral needs no fix: the page says so, and no Remove color fix or "color cast fixed" note appears.', actual: `The toast says "${s.toast}", the panel says "${s.alignState}", Remove color fix ${s.wbUndo ? 'appears' : 'stays hidden'}, while every pixel stays as it was (the patch reads ${JSON.stringify(patchNow)}). Cause: js/app.js pickNeutral toasts "Color cast removed" and keeps the gains for any accepted spot, and updateColorFix (line 2486) reads gains of 1.0000001 (processing.js neutralGains, line 1196: the luminance weights sum to 1.0000001) as a fix.` });
        }
      } else if (want === 'dark') {
        t.check(TOO_DARK.test(s.toast) && s.picking && !s.wbUndo, `${name} ${JSON.stringify(rgb)}: told it is too dark to judge, picking stays on`, results[name]);
      } else {
        t.check(REFUSED.test(s.toast) && s.picking && !s.wbUndo && same(elsewhereBefore, elsewhereAfter), `${name} ${JSON.stringify(rgb)}: refused as a color, picking stays on, nothing changed`, results[name]);
      }
      if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
      if (s.wbUndo) { await click(page, '#wbUndo'); await busyHidden(page); await sleep(80); }
    }
    // at the canvas's corners and edge (the paper edge the README suggests): the five-by-five patch is clipped there
    for (const [fx, fy, where] of [[0.001, 0.001, 'top-left corner'], [0.999, 0.999, 'bottom-right corner'], [0.5, 0.999, 'bottom edge']]) {
      await resetToast(page);
      if (!(await state(page)).picking) { await click(page, '#wbPick'); await sleep(50); }
      await clickAt(page, '#cv-art', fx, fy);
      s = await state(page);
      t.check(/^(#[0-9A-F]{6} is (too colorful|already neutral)|Color cast removed|That spot is too dark)/.test(s.toast), `a pick at the ${where} (a clipped patch) is answered`, s.toast);
      if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
      if (s.wbUndo) { await click(page, '#wbUndo'); await busyHidden(page); await sleep(80); }
    }
    await clean(t, page, 'picks at the edges');
    // the bright orange and the yellow: a strong color with one weak channel must be refused as a color, not as dark
    const wrongReason = ['bright orange', 'bright yellow'].filter((n) => results[n] && TOO_DARK.test(results[n].toast));
    if (wrongReason.length) {
      t.finding({ title: 'A bright orange or yellow spot is refused as "too dark to judge"', severity: 'medium', steps: 'Open #check, load a painting with a flat rgb(240,140,30) patch (or rgb(250,230,20)), open "Line up the photo and fix its colors", press Fix color cast and click the patch. Twice: the orange and the yellow give the same message.', expected: 'The README refuses it as "clearly a color rather than a white tinted by the light (skin, brick red, leaf green, orange)": the message the page has for that, "#F08C1E is too colorful to be white or gray. Pick paper or a neutral gray area."', actual: `"${results['bright orange'].toast}" for rgb(240,140,30) (L* 66) and "${results['bright yellow'].toast}" for rgb(250,230,20) (L* 90): a bright spot is called too dark, so the advice to pick a lighter area misleads. Cause: js/processing.js neutralGains, line 1198, returns null when any one channel is under 0.02 in linear light (blue is 30 and 20 here), and js/app.js pickNeutral reads that null as "too dark" before its color test can run.` });
    }
    // picking again replaces the earlier fix (read from the photo as taken): A then B equals B alone
    await click(page, '#wbPick'); await clickAt(page, '#cv-art', patchAt(1)[0] / 600, patchAt(1)[1] / 750);
    await click(page, '#wbPick'); await clickAt(page, '#cv-art', patchAt(2)[0] / 600, patchAt(2)[1] / 750);
    const aThenB = await px(page, 'cv-art', 300, 400), aThenBState = await state(page);
    await click(page, '#wbUndo'); await busyHidden(page); await sleep(80);
    await click(page, '#wbPick'); await clickAt(page, '#cv-art', patchAt(2)[0] / 600, patchAt(2)[1] / 750);
    const bAlone = await px(page, 'cv-art', 300, 400);
    t.check(same(aThenB, bAlone) && aThenBState.wbUndo && aThenBState.alignState === 'color cast fixed', 'picking again replaces the earlier fix rather than stacking on it', { aThenB, bAlone });
    // a new painting while picking cancels it; the fix does not carry over
    await click(page, '#wbPick'); await sleep(50);
    t.check(await loadArt(page, await makeImage(page, { width: 900, height: 600, type: 'image/jpeg', name: 'wide.jpg' })), 'a landscape painting loads while picking');
    s = await state(page);
    t.check(!s.picking && s.wbPick === NOT_PICKING && !s.wbUndo && s.alignState === '' && s.label === 'wide.jpg · 900 × 600 px', 'the new painting ends picking and starts without the fix', { picking: s.picking, wbUndo: s.wbUndo, alignState: s.alignState, label: s.label });
    t.check(same(s.art, [600, 750]), 'a 900 × 600 painting is cropped to the reference\'s 600 × 750', s.art);
    checkScorecard(t, s, 'the landscape painting, cropped');
    const cropped = { color: s.color, shapes: s.shapes };
    t.check(await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('artFit'); e.value = 'stretch'; e.dispatchEvent(new Event('change', { bubbles: true })); })), 'Stretch to match reruns');
    s = await state(page);
    t.check(same(s.art, [600, 750]) && (s.color !== cropped.color || s.shapes !== cropped.shapes), 'Stretch to match keeps the size and changes the comparison', { art: s.art, cropped, stretched: { color: s.color, shapes: s.shapes } });
    checkScorecard(t, s, 'the landscape painting, stretched');
    await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('artFit'); e.value = 'crop'; e.dispatchEvent(new Event('change', { bubbles: true })); }));
    // a new reference while the drawer is open with the visitor's painting: it stays, lined up as it was
    await setRange(page, 'alignX', 10);
    t.check(await afterResult(page, async () => page.setInputFiles('#file', await makeImage(page, { width: 800, height: 1000, type: 'image/jpeg', name: 'newref.jpg' }))), 'a new reference loads with the drawer open');
    s = await state(page);
    t.check(/^newref\.jpg · 800 × 1000 px$/.test(s.source) && s.label === 'wide.jpg · 900 × 600 px' && same(s.orig, [720, 900]) && same(s.art, [720, 900]) && same(s.diff, [720, 900]), 'the painting stays and follows the new reference\'s 720 × 900', { source: s.source, label: s.label, orig: s.orig, art: s.art });
    t.check(same(s.outs.alignX, ['10', '+10%']) && s.alignState === 'moved, 10% of picture left out', 'the alignment is kept across the new reference', { out: s.outs.alignX, alignState: s.alignState });
    checkScorecard(t, s, 'the painting against a new reference');
    await clean(t, page, 'the patches and a new reference');

    // the gain limits at their edges, a pick under the faded reference, and the fix through a move, Reset position,
    // a fit change and a new reference (the gains live outside the alignment), then a pick on the gray fill
    t.check(await loadArt(page, await ownPixels(page, { patches: EDGES, name: 'edges.png' })), 'a painting with spots at the gain limits loads');
    s = await state(page);
    const [AW, AH] = s.art;
    const at = (i, dx = 0) => [(patchAt(i)[0] + dx) / AW, patchAt(i)[1] / AH];
    const edgeGains = await page.evaluate((list) => list.map((p) => (window.Study.neutralGains(p[1][0], p[1][1], p[1][2]) || []).map((v) => +v.toFixed(3))), EDGES);
    for (let i = 0; i < 4; i++) {
      const [name, rgb, want] = EDGES[i];
      await resetToast(page);
      if (!(await state(page)).picking) { await click(page, '#wbPick'); await sleep(50); }
      await clickAt(page, '#cv-art', ...at(i));
      s = await state(page);
      const r = { gains: edgeGains[i], toast: s.toast, picking: s.picking, wbUndo: s.wbUndo };
      if (want === 'accept') t.check(FIXED.test(s.toast) && !s.picking && s.wbUndo, `${name} ${JSON.stringify(rgb)}: accepted`, r);
      else t.check(REFUSED.test(s.toast) && s.picking && !s.wbUndo, `${name} ${JSON.stringify(rgb)}: refused as a color`, r);
      if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
      if (s.wbUndo) { await click(page, '#wbUndo'); await busyHidden(page); await sleep(80); }
    }
    t.note('Gain limits: of "no channel halved, red or green at most doubled, blue at most tripled" only blue\'s can bind. Gains that make a spot neutral at its own luminance satisfy 0.2126/r + 0.7152/g + 0.0722/b = 1, and a spot the page takes as tinted by light keeps g within 10% of r^0.6 × b^0.4: red at ×0.52 would need blue near ×4.6, red reaches ×1.66 before blue is halved, and green cannot pass ×1.66 while red and blue stay at ×0.5 or more. So blue was tried at ×0.49 and ×0.53, ×2.96 and ×3.05; the red and green edges cannot be reached by any spot.');
    // Show reference on top at 100%: the visitor sees the reference where they click; the pick reads the painting
    await setRange(page, 'onion', 100);
    const seen = await px(page, 'cv-art', patchAt(6)[0], patchAt(6)[1]);
    await resetToast(page); await click(page, '#wbPick'); await sleep(50);
    await clickAt(page, '#cv-art', ...at(6));
    s = await state(page);
    t.check(s.toast === '#E0AC8C is too colorful to be white or gray. Pick paper or a neutral gray area.' && s.picking && !s.wbUndo, 'with the reference on top at 100%, a pick reads the painting under it: the skin patch is refused by its own color', { toast: s.toast, shownThere: cssHex(seen) });
    t.note(`With Show reference on top at 100% the visitor sees ${cssHex(seen)} where they click, and the pick answers about the painting's #E0AC8C under it; nothing says the pick reads the painting, not what is shown (the README does not say which one it reads).`);
    if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
    await setRange(page, 'onion', 0);
    // the fix through a move, Reset position and Stretch to match
    await click(page, '#wbPick'); await sleep(50); await clickAt(page, '#cv-art', ...at(4));
    s = await state(page);
    t.check(FIXED.test(s.toast) && s.alignState === 'color cast fixed', 'the warm-tinted white is fixed', { toast: s.toast, alignState: s.alignState });
    await setRange(page, 'alignX', 10);
    s = await state(page);
    const movedPatch = await px(page, 'cv-art', Math.round(patchAt(4)[0] + 0.1 * AW), patchAt(4)[1]);
    t.check(s.alignState === 'moved, 10% of picture left out · color cast fixed' && s.wbUndo && neutral(movedPatch, 3), 'moved with the fix on: the panel names both, and the moved patch stays neutral', { alignState: s.alignState, patch: movedPatch });
    await click(page, '#alignReset'); await busyHidden(page); await sleep(150);
    s = await state(page);
    t.check(s.alignState === 'color cast fixed' && s.wbUndo && same(s.outs.alignX, ['0', '0%']) && neutral(await px(page, 'cv-art', ...patchAt(4)), 3), 'Reset position puts the photo back and keeps the fix', { alignState: s.alignState, wbUndo: s.wbUndo });
    await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('artFit'); e.value = 'stretch'; e.dispatchEvent(new Event('change', { bubbles: true })); }));
    s = await state(page);
    t.check(s.alignState === 'color cast fixed' && s.wbUndo && neutral(await px(page, 'cv-art', ...patchAt(4)), 3), 'Stretch to match keeps the fix', { alignState: s.alignState, wbUndo: s.wbUndo });
    await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('artFit'); e.value = 'crop'; e.dispatchEvent(new Event('change', { bubbles: true })); }));
    // Remove color fix while picking is armed
    await click(page, '#wbPick'); await sleep(50);
    await click(page, '#wbUndo'); await busyHidden(page); await sleep(150);
    s = await state(page);
    t.check(!s.wbUndo && s.alignState === '' && !neutral(await px(page, 'cv-art', ...patchAt(4)), 3), 'Remove color fix pressed while picking undoes the fix', { wbUndo: s.wbUndo, alignState: s.alignState });
    t.note(`Remove color fix pressed while picking leaves picking ${s.picking ? 'on' : 'off'} (the README does not say which).`);
    // a fix on, picking armed, and a new reference: the fix stays, and the next click is a pick on the rebuilt photo
    if (!s.picking) { await click(page, '#wbPick'); await sleep(50); }
    await clickAt(page, '#cv-art', ...at(4));
    await click(page, '#wbPick'); await sleep(50);
    t.check(await afterResult(page, async () => page.setInputFiles('#file', await makeImage(page, { width: 800, height: 1000, type: 'image/jpeg', name: 'newref2.jpg' }))), 'another reference loads with the fix on and picking armed');
    s = await state(page);
    t.check(/^newref2\.jpg · 800 × 1000 px$/.test(s.source) && s.label === 'edges.png · 720 × 900 px' && s.wbUndo && s.alignState === 'color cast fixed' && neutral(await px(page, 'cv-art', ...patchAt(4)), 3), 'across a new reference the painting keeps its color fix', { source: s.source, label: s.label, wbUndo: s.wbUndo, alignState: s.alignState });
    t.note(`A new reference while picking is armed leaves picking ${s.picking ? 'on' : 'off'}.`);
    await resetToast(page);
    if (!s.picking) { await click(page, '#wbPick'); await sleep(50); }
    await clickAt(page, '#cv-art', ...at(5));
    s = await state(page);
    const coolNow = await px(page, 'cv-art', ...patchAt(5)), warmNow = await px(page, 'cv-art', ...patchAt(4));
    t.check(FIXED.test(s.toast) && neutral(coolNow, 2) && !neutral(warmNow, 3) && s.alignState === 'color cast fixed', 'picked after the new reference, the cool-tinted white replaces the earlier fix (read from the rebuilt photo)', { toast: s.toast, cool: coolNow, warm: warmNow });
    await setRange(page, 'alignX', 10);
    await click(page, '#wbUndo'); await busyHidden(page); await sleep(150);
    s = await state(page);
    t.check(s.alignState === 'moved, 10% of picture left out' && !s.wbUndo, 'Remove color fix with the photo moved: the panel keeps the move alone', s.alignState);
    // the gray the page fills in where a moved photo no longer reaches is not the painting: a click there must not
    // count as the painting's neutral spot (nor undo the fix the visitor made)
    await setRange(page, 'alignX', 20);
    await click(page, '#wbPick'); await sleep(50); await clickAt(page, '#cv-art', ...at(4, 0.2 * AW));
    const fixedBefore = await state(page);
    await click(page, '#wbPick'); await sleep(50); await resetToast(page);
    await clickAt(page, '#cv-art', 0.05, 0.5);
    s = await state(page);
    const grayFill = await px(page, 'cv-art', Math.round(0.05 * AW), Math.round(0.5 * AH));
    if (!t.check(fixedBefore.wbUndo && s.wbUndo && s.alignState === fixedBefore.alignState && !/already neutral/.test(s.toast), 'a click on the gray fill a moved photo leaves is not taken as the painting\'s neutral spot: the fix stays', { fixedBefore: fixedBefore.alignState, after: s.alignState, toast: s.toast, wbUndo: s.wbUndo, picking: s.picking, clicked: grayFill })) {
      t.finding({ title: 'A pick on the gray fill beside a moved photo removes the color fix and calls #7F7F7F the painting\'s neutral', severity: 'medium', steps: 'Open index.html#check and load a photo of a painting that has a warm-tinted white spot (rgb 231, 215, 184). Open "Line up the photo and fix its colors", set Move left / right to +20%, press Fix color cast and click the spot (now 20% further right): "Color cast removed". Press Fix color cast again and click the flat gray strip down the left side of Your painting, the part the moved photo no longer covers. Twice, with the same result.', expected: 'The strip is not the painting (the map hatches it as left out): the click is refused or ignored with a word that the spot is outside the photo, and the fix the visitor made stays.', actual: `The toast says "${s.toast}", Remove color fix disappears and the panel's note goes from "${fixedBefore.alignState}" to "${s.alignState}": the fix is silently undone, and the gray the page itself painted in (${cssHex(grayFill)}) is reported as a color of the painting.`, cause: 'js/app.js pickNeutral (line 2567) averages prep.photo, the aligned canvas that alignArt fills with #7f7f7f where the photo does not reach (line 2321), without looking at prep.mask; a gray patch then takes the "already neutral" branch (line 2596), which sets the gains back to [1, 1, 1].' });
    }
    // (fixed at bc7f7ff) and the visitor is told why, with picking left on for a spot on the painting itself
    t.check(/outside (your|the) painting/i.test(s.toast) && s.picking, 'a click on the gray fill says the spot is outside the painting, and picking stays on for a spot on it', { toast: s.toast, picking: s.picking });
    if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
    await clean(t, page, 'the color fix through moves, fits and a new reference');
    await page.context().close();
  }

  // ---- every kind of file for the painting: the input, a drop, a paste; the drop hint; a drop with the drawer closed ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    const example = await state(page);
    const kinds = [
      { title: 'a text file', file: textFile(), reject: NOT_IMAGE },
      { title: 'a broken JPEG', file: brokenImage(), reject: NOT_OPENED },
      { title: 'a 1 × 1 PNG', file: await makeImage(page, { width: 1, height: 1, name: 'dot.png' }), reject: TOO_SMALL },
      { title: 'a 2 × 4000 strip', file: await makeImage(page, { width: 2, height: 4000, name: 'strip.png' }), reject: TOO_SMALL },
      { title: 'a 4000 × 2 strip', file: await makeImage(page, { width: 4000, height: 2, name: 'strip2.png' }), reject: TOO_SMALL },
      { title: 'a 20 × 4000 strip', file: await makeImage(page, { width: 20, height: 4000, draw: 'noise', name: 'thin.png' }), label: 'thin.png · 20 × 4000 px' },
      { title: 'an SVG without a size (Chromium gives it 300 × 150)', file: svgImage(), label: 'drawing.svg · 300 × 150 px' },
      { title: 'a 200 × 200 SVG', file: svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ddd"/><circle cx="100" cy="100" r="60" fill="#c66"/></svg>', 'sized.svg'), label: 'sized.svg · 200 × 200 px' },
      { title: 'a transparent PNG', file: await makeImage(page, { width: 400, height: 500, draw: 'transparent', name: 'alpha.png' }), label: 'alpha.png · 400 × 500 px', midGray: true },
      { title: 'a flat white PNG', file: await makeImage(page, { width: 300, height: 300, draw: 'white', name: 'white.png' }), label: 'white.png · 300 × 300 px' },
      { title: 'a flat black PNG', file: await makeImage(page, { width: 300, height: 300, draw: 'black', name: 'black.png' }), label: 'black.png · 300 × 300 px' },
      { title: 'a WebP', file: await makeImage(page, { width: 500, height: 700, type: 'image/webp', name: 'photo.webp' }), label: 'photo.webp · 500 × 700 px' },
      { title: 'a 6000 × 4000 JPEG (exactly 24 megapixels: not reduced)', file: await makeImage(page, { width: 6000, height: 4000, type: 'image/jpeg', name: 'big.jpg' }), label: 'big.jpg · 6000 × 4000 px' },
      { title: 'a 5000 × 5000 JPEG (25 megapixels: reduced)', file: await makeImage(page, { width: 5000, height: 5000, type: 'image/jpeg', name: 'huge.jpg' }), label: 'huge.jpg · 2800 × 2800 px', note: /^A very large photo \(5000 × 5000\) was reduced to 2800 × 2800 for speed\.$/ },
    ];
    let lastLabel = example.label;
    for (const k of kinds) {
      await resetToast(page);
      if (k.reject) {
        await page.setInputFiles('#artFile', k.file);
        const said = await waitToast(page, k.reject);
        await sleep(300);
        const s = await state(page);
        t.check(said && s.label === lastLabel && s.body && s.badge === example.badge, `${k.title}: refused with the right words, the painting before it stays scored`, { toast: s.toast, label: s.label.slice(0, 40), badge: s.badge });
      } else {
        const loaded = await loadArt(page, k.file);
        const s = await state(page);
        t.check(loaded && s.label === k.label, `${k.title}: loads as the painting and the label says its size`, { loaded, label: s.label });
        t.check(k.note ? k.note.test(s.toast) : s.toast === '', `${k.title}: ${k.note ? 'the reduction is said' : 'no complaint'}`, s.toast);
        t.check(same(s.art, [600, 750]) && SAMPLE.test(s.source), `${k.title}: fitted to the reference, which stays the sample`, { art: s.art, source: s.source.slice(0, 30) });
        checkScorecard(t, s, k.title);
        if (k.midGray) {
          // README: transparent parts are placed on mid gray (not read as black)
          const corner = await px(page, 'cv-art', 4, 4);
          const lc = await hoverAt(page, '#cv-art', 0.01, 0.01); await page.mouse.move(5, 5);
          t.check(corner.every((v) => Math.abs(v - 127) <= 1) && lc.hex === '#7F7F7F' && /^V 5(\.\d)?$/.test(lc.val), `${k.title}: its see-through part is mid gray (#7F7F7F, V 5), not black`, { corner, loupe: [lc.hex, lc.val] });
        }
        lastLabel = k.label;
      }
    }
    await clean(t, page, 'file kinds');
    // the drop hint, a drop and a paste with the drawer open (they go to the painting), a text file dropped
    const hint = await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); const h = document.getElementById('dropHint'); const r = { shown: !h.hidden, text: h.firstElementChild.textContent }; window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt })); r.after = h.hidden; return r; });
    t.check(hint.shown && hint.text === 'Drop your painting to check it' && hint.after, 'dragging a file in with the drawer open says it will be the painting', hint);
    t.check(await afterResult(page, async () => dropFiles(page, 'body', [await makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'dropped.jpg' })])), 'a dropped photo is read');
    let s = await state(page);
    t.check(s.label === 'dropped.jpg · 640 × 800 px' && SAMPLE.test(s.source), 'dropped with the drawer open: the painting, not the reference', { label: s.label, source: s.source.slice(0, 30) });
    t.check(await afterResult(page, () => makeImage(page, { width: 640, height: 800, name: 'pasted.png' }).then((f) => pasteFile(page, f))), 'a pasted picture is read');
    s = await state(page);
    t.check(s.label === 'pasted.png · 640 × 800 px' && SAMPLE.test(s.source), 'pasted with the drawer open: the painting, not the reference', { label: s.label, source: s.source.slice(0, 30) });
    await resetToast(page);
    await dropFiles(page, 'body', [textFile()]);
    t.check(await waitToast(page, NOT_IMAGE) && (await state(page)).label === 'pasted.png · 640 × 800 px', 'a dropped text file is refused and the painting stays', await text(page, '#toast'));
    await resetToast(page);
    await dropFiles(page, 'body', [await makeImage(page, { width: 1, height: 1, name: 'dot.png' })]);
    t.check(await waitToast(page, TOO_SMALL), 'a dropped 1 × 1 picture is refused', await text(page, '#toast'));
    // the drawer closed: a drop is the reference, and the painting is rescored against it on reopening
    await page.evaluate(() => { document.getElementById('drawer-check').open = false; }); await sleep(250);
    const hintClosed = await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); const h = document.getElementById('dropHint'); const r = h.firstElementChild.textContent; window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt })); return r; });
    t.check(hintClosed === 'Drop the portrait to load it', 'with the drawer closed the drag hint names the portrait', hintClosed);
    t.check(await afterResult(page, () => makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'asref.jpg' }).then((f) => dropFiles(page, 'body', [f]))), 'a drop with the drawer closed is read');
    s = await state(page);
    t.check(/^asref\.jpg · 640 × 800 px$/.test(s.source) && s.label === 'pasted.png · 640 × 800 px', 'dropped with the drawer closed: the reference changes and the painting stays', { source: s.source, label: s.label });
    await page.evaluate(() => { document.getElementById('drawer-check').open = true; }); await busyHidden(page); await sleep(300);
    s = await state(page);
    t.check(s.body && same(s.art, [640, 800]) && same(s.orig, [640, 800]) && s.color >= 90, 'reopened: the painting is scored against the new reference (near twins score over 90)', { art: s.art, orig: s.orig, color: s.color, badge: s.badge });
    checkScorecard(t, s, 'reopened against the new reference');
    // a new reference while the example is up takes the example away
    const page2 = await openPage(site, { url: '#check' });
    await countResults(page2);
    await busyHidden(page2);
    t.check(await afterResult(page2, async () => page2.setInputFiles('#file', await makeImage(page2, { width: 800, height: 1000, type: 'image/jpeg', name: 'mine.jpg' }))), 'a photo of the visitor\'s own loads as the reference');
    s = await state(page2);
    t.check(s.label === NO_ART_LABEL && s.empty && !s.body && !s.panels && !s.alignPanel && s.badge === 'No painting yet', 'with the visitor\'s own reference the example goes: the empty state, its label and the badge say so', { label: s.label, empty: s.empty, body: s.body, alignPanel: s.alignPanel, badge: s.badge });
    const emptyText = await page2.evaluate(() => document.getElementById('checkEmpty').textContent.replace(/\s+/g, ' ').trim());
    t.check(/^No painting yet Load a photo of your painting, or use the one on the Studio tab\. You can also drop or paste a photo while this drawer is open\.$/.test(emptyText), 'the empty state tells the visitor the three ways in', emptyText);
    await clean(t, page, 'drops and pastes'); await clean(t, page2, 'the example gone');
    await page.context().close(); await page2.context().close();
  }

  // ---- Use my Studio painting: a blank paper, strokes, twice, a dealt portrait; with painting.js missing ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'Use my Studio painting scores without a Studio visit');
    let s = await state(page);
    t.check(/^Studio painting · \d+ × \d+ px$/.test(s.label) && s.body && !s.empty, 'the label names the Studio painting and its size', s.label);
    checkScorecard(t, s, 'the blank paper');
    const blankInk = await inked(page, '#cv-art');
    const blank = { color: s.color, value: s.value, shapes: s.shapes, label: s.label };
    t.check(neutral(await px(page, 'cv-art', 300, 400), 30) && (await px(page, 'cv-art', 300, 400))[0] > 180, 'a blank paper comes over as a light sheet', await px(page, 'cv-art', 300, 400));
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'pressed again it scores again');
    s = await state(page);
    t.check(s.label === blank.label && s.color === blank.color && s.value === blank.value && s.shapes === blank.shapes, 'the same paper twice gives the same scores', { first: blank, second: { color: s.color, value: s.value, shapes: s.shapes } });
    await tab(page, 'paint'); await sleep(1200);
    await stroke(page, '#ps-paper'); await stroke(page, '#ps-paper', [[0.2, 0.7], [0.8, 0.7]]); await sleep(400);
    const paperInk = await inked(page, '#ps-paper');
    await tab(page, 'study');
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'the painted paper scores');
    s = await state(page);
    const artInk = await inked(page, '#cv-art');
    t.check(paperInk > 100 && artInk > blankInk + 100, 'the strokes on the paper are in the painting checked', { paperInk, blankInk, artInk });
    checkScorecard(t, s, 'the painted paper');
    // a dealt portrait as the Studio's reference becomes the reference here
    await tab(page, 'paint'); await sleep(300);
    const dealt = await page.evaluate(() => { const b = document.querySelector('#ps-root [data-ref-kind="painting"]'); if (!b) return null; b.click(); return document.getElementById('ps-refName').textContent.trim(); });
    await sleep(600);
    const title = await page.evaluate(() => document.getElementById('ps-refName').textContent.trim());
    t.check(dealt !== null && /, after .*: a generated portrait, as the game deals them\.$/.test(title), 'the Studio deals a portrait as its reference', title);
    const portrait = /^(.*), after ([^:]+):/.exec(title);
    await tab(page, 'study');
    await click(page, '#artFromStudio');
    const switched = await page.waitForFunction((want) => document.getElementById('source').textContent.includes(want) && document.getElementById('busy').hidden, portrait ? `${portrait[1]}, after ${portrait[2]}` : 'never', { timeout: 30000 }).then(() => true).catch(() => false);
    await busyHidden(page); await sleep(400);
    s = await state(page);
    t.check(switched && portrait && s.source === `${portrait[1]}, after ${portrait[2]} · 600 × 750 px` && /^Studio painting/.test(s.label) && s.body, 'with a dealt portrait, Use my Studio painting makes that portrait the reference and scores against it', { source: s.source, label: s.label });
    checkScorecard(t, s, 'the Studio painting against the dealt portrait');
    // Another portrait on the Studio: the next press follows the new deal
    await tab(page, 'paint'); await sleep(300);
    const title2 = await page.evaluate(() => { const b = document.getElementById('ps-refAnother'); if (!b || b.hidden) return null; b.click(); return document.getElementById('ps-refName').textContent.trim(); });
    const portrait2 = title2 && /^(.*), after ([^:]+):/.exec(title2);
    await tab(page, 'study');
    await click(page, '#artFromStudio');
    const switched2 = await page.waitForFunction((want) => document.getElementById('source').textContent.startsWith(want) && document.getElementById('busy').hidden, portrait2 ? `${portrait2[1]}, after ${portrait2[2]} ·` : 'never', { timeout: 30000 }).then(() => true).catch(() => false);
    await busyHidden(page); await sleep(400);
    s = await state(page);
    t.check(switched2 && title2 !== title && /^Studio painting/.test(s.label), 'Another portrait on the Studio, then Use my Studio painting: the new portrait becomes the reference', { before: title, after: title2, source: s.source });
    // a photo of the visitor's own loaded on the Study tab while the Studio is closed: the press scores against the
    // reference the Studio shows (README: a dealt portrait becomes the reference here)
    t.check(await afterResult(page, async () => page.setInputFiles('#file', await makeImage(page, { width: 800, height: 1000, type: 'image/jpeg', name: 'own.jpg' }))), 'a photo of the visitor\'s own loads as the reference after the deal');
    const studioRef = await page.evaluate(() => document.getElementById('ps-refName').textContent.trim());
    const dealtStill = /^(.*), after ([^:]+):/.exec(studioRef);
    const wantSource = dealtStill ? `${dealtStill[1]}, after ${dealtStill[2]} · 600 × 750 px` : 'own.jpg · 800 × 1000 px';
    await click(page, '#artFromStudio');
    await page.waitForFunction((want) => document.getElementById('source').textContent === want && document.getElementById('busy').hidden && /^Studio painting/.test(document.getElementById('artSource').textContent), wantSource, { timeout: 30000 }).catch(() => null);
    await busyHidden(page); await sleep(400);
    s = await state(page);
    t.check(s.source === wantSource && /^Studio painting/.test(s.label), 'after a photo of the visitor\'s own, the press scores against the reference the Studio shows', { studio: studioRef.slice(0, 90), source: s.source });
    if (dealtStill) t.note('A photo loaded on the Study tab while the Studio is closed leaves the Studio on its dealt portrait (js/painting.js follows a new photo only while the Studio is open), so the next Use my Studio painting puts that portrait back as the reference in place of the visitor\'s photo, as the README\'s rule says; nothing on the page says the photo was replaced.');
    // Turn the paper: the label names the turned size, the painting is cropped to the reference
    const labelUpright = s.label;
    await tab(page, 'paint'); await sleep(300);
    await page.evaluate(() => document.getElementById('ps-orient').click()); await sleep(400);
    await tab(page, 'study');
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'the turned paper scores');
    s = await state(page);
    const d0 = /(\d+) × (\d+) px$/.exec(labelUpright) || [], d1 = /(\d+) × (\d+) px$/.exec(s.label) || [];
    const turnedInk = await inked(page, '#cv-art');
    t.check(d0[1] !== undefined && d0[1] === d1[2] && d0[2] === d1[1] && same(s.art, s.orig) && turnedInk > blankInk + 100, 'Turn the paper, then the press: the label names the turned size, the painting is cropped to the reference and keeps its strokes', { before: labelUpright, after: s.label, art: s.art, orig: s.orig, ink: turnedInk });
    // a toned wash and linen: the bare paper checked is the ground as the Studio shows it, not white
    await tab(page, 'paint'); await sleep(300);
    await page.evaluate(() => { document.querySelector('#ps-root [data-ground="wash"]').click(); const r = document.getElementById('ps-washStr'); r.value = 50; r.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#ps-root [data-weave="linen"]').click(); });
    const lastChange = await page.evaluate(() => Date.now());
    await sleep(300);
    await tab(page, 'study');
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'the paper with a toned wash and linen scores');
    const ground = await page.evaluate(([aw, ah]) => {
      const src = window.PaintStudio.composite(); const sw = src.width, sh = src.height;
      const c = document.createElement('canvas'); c.width = aw; c.height = ah; const g = c.getContext('2d');
      const k = Math.max(aw / sw, ah / sh), cw = aw / k, ch = ah / k; g.imageSmoothingQuality = 'high'; g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, aw, ah); // cropped to match, centred
      const mean = (ctx) => { const d = ctx.getImageData(8, 8, 40, 40).data; const m = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; } return m.map((v) => Math.round(v / (d.length / 4))); };
      return { studio: mean(g), checked: mean(document.getElementById('cv-art').getContext('2d')) };
    }, (await state(page)).art);
    const RAW = [243, 238, 226]; // the raw canvas ground (js/painting.js)
    t.check(ground.studio.every((v, i) => Math.abs(v - ground.checked[i]) <= 8) && ground.checked.some((v, i) => Math.abs(v - RAW[i]) > 12), 'a toned wash and linen on the Studio: the bare paper checked is that ground, not a white or raw sheet', ground);
    // pressed before the Studio has read its saved painting back: a slow device's database (every indexedDB.open
    // answers 1.5 s late) and a press as soon as the page is up
    let savedAt = 0; const waitFrom = Date.now();
    while (Date.now() - waitFrom < 15000) { savedAt = await studioSavedAt(page); if (savedAt >= lastChange) break; await sleep(300); }
    t.check(savedAt >= lastChange, 'the Studio has saved the painting, with its wash and linen, in the browser', { savedAt, lastChange });
    await page.addInitScript(SLOW_DB);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const readyAtPress = await page.evaluate(async () => { let done = false; window.PaintStudio.ready().then(() => { done = true; }); await Promise.resolve(); await Promise.resolve(); const was = done; document.getElementById('artFromStudio').click(); return was; });
    await page.waitForFunction(() => document.getElementById('busy').hidden && /^Studio painting/.test(document.getElementById('artSource').textContent), null, { timeout: 30000 }).catch(() => null);
    await sleep(300);
    const early = await state(page);
    await page.evaluate(() => { const c = document.getElementById('cv-art'); window.__firstPress = c.width ? c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice() : null; });
    await page.evaluate(() => window.PaintStudio.ready());
    await countResults(page);
    await afterResult(page, () => click(page, '#artFromStudio'));
    const late = await state(page);
    // how far the first press's picture is from the painting once it has been read back (mean |Δ| per channel)
    const apart = await page.evaluate(() => { const a = window.__firstPress, c = document.getElementById('cv-art'); const b = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; if (!a || a.length !== b.length) return 255; let n = 0; for (let i = 0; i < a.length; i += 4) n += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return +(n / (a.length * 0.75)).toFixed(2); });
    const waited = readyAtPress || (early.label === late.label && apart < 2) || (/Studio/.test(early.toast) && !/^Studio painting/.test(early.label));
    if (!t.check(waited, 'pressed while the Studio is still reading its saved painting back, the press scores that painting (or says it is not there yet)', { readyAtPress, firstPress: { label: early.label, badge: early.badge, toast: early.toast }, onceRead: { label: late.label, badge: late.badge }, meanDifference: apart })) {
      t.finding({ title: 'Use my Studio painting pressed while the Studio is still loading its saved painting scores a blank sheet, and says nothing', severity: 'medium', steps: 'On the Studio tab paint two strokes, turn the paper, choose Toned wash at 50% and Linen, and wait a second for the autosave. Reload index.html#check in a browser whose database is slow to answer (reproduced by making indexedDB.open answer 1.5 s late, as on a slow phone) and press Use my Studio painting at once. Then press it again a few seconds later.', expected: 'The press scores the painting the Studio holds (it waits for the Studio to finish reading it back), or says the Studio is still loading and to press again.', actual: `The first press scores "${early.label}" (${early.badge}), a picture ${apart} levels per channel away on average from what the same button scores once the Studio has read the painting back ("${late.label}", ${late.badge}); toast "${early.toast}".`, cause: 'js/app.js, the artFromStudio click handler: setArt(ps.composite(), ...) reads the Studio\'s canvases at once without waiting for PaintStudio.ready() (js/painting.js: the restore that draws the saved paper, its size, ground and texture back).' });
    }
    if (readyAtPress) t.note('The Studio had read its saved painting back before the press landed, even with the database slowed, so the press-before-restore race was not reached this run.');
    await screenshot(page, 'check-painting-studio');
    await clean(t, page, 'use my studio painting');
    await page.context().close();

    // painting.js missing: the Studio tab is taken off the menu; the drawer's button must not stay as a dead control
    const page3 = await openPage(site, { url: '#check', block: [site.base + 'js/painting.js'] });
    await countResults(page3);
    await sleep(1200);
    const before = await state(page3);
    const btn = await page3.evaluate(() => { const b = document.getElementById('artFromStudio'); return { hidden: b.hidden, disabled: b.disabled, shown: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0, paintTab: (document.querySelector('[data-tab="paint"]') || {}).hidden }; });
    await resetToast(page3);
    await click(page3, '#artFromStudio'); await sleep(900);
    const after = await state(page3);
    const handled = !btn.shown || btn.disabled || /Studio/.test(after.toast);
    if (!t.check(handled, 'with painting.js missing, Use my Studio painting is taken off, disabled, or says why it cannot', { button: btn, before: before.label.slice(0, 30), after: after.label.slice(0, 30), toast: after.toast })) {
      t.finding({ title: 'With painting.js missing, "Use my Studio painting" stays as a live button that does nothing', severity: 'high', steps: 'Block or remove js/painting.js (the guard then takes Studio, Figure study and the Loomis head off the menu and shows its "part of the app" note). Open index.html#check and press Use my Studio painting. Twice.', expected: 'The button is hidden or disabled like the Studio tab, or a message says the Studio did not load.', actual: `The button shows and is enabled (${JSON.stringify(btn)}); pressing it changes nothing and says nothing: the label stays "${after.label.slice(0, 20)}…", the badge "${after.badge}", toast "${after.toast}". Cause: js/app.js, the artFromStudio handler's \`if (!ps) return;\` returns silently when window.PaintStudio is missing; js/guard.js (TAB_OF, line 122) hides the tabs of a failed script but not this button.` });
    }
    t.check(after.label === before.label && after.badge === before.badge && !after.empty, 'with painting.js missing, the press leaves the example scored as it was', { before: before.badge, after: after.badge });
    t.check(page3.log.pageerrors.length === 0, 'painting.js missing: no page error', page3.log.pageerrors);
    await page3.context().close();
  }

  // ---- the routes, the guide's button, a reload, and hostile saved state for every key the drawer depends on ----
  {
    const page = await openPage(site);
    await countResults(page);
    await busyHidden(page);
    let s = await state(page);
    t.check(!s.open && !s.section && s.badge === 'Not scored yet' && s.label === EXAMPLE_LABEL, 'a plain load: the drawer closed, its badge says the example is not scored until it is opened, the example ready', { open: s.open, section: s.section, badge: s.badge });
    await tab(page, 'help');
    const went = await page.evaluate(() => { const b = document.querySelector('[data-go="check"]'); if (!b) return false; b.click(); return true; });
    await sleep(400);
    s = await state(page);
    t.check(went && s.open && same(s.tab, ['tab-study']) && s.section && s.body, 'the guide\'s Try it button opens the Study tab with the drawer open and scored', { went, open: s.open, tab: s.tab, body: s.body });
    await openAlign(page); await setRange(page, 'alignX', 10);
    await loadArt(page, await makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'mine.jpg' }));
    await page.reload({ waitUntil: 'load' }); await sleep(900); await busyHidden(page);
    s = await state(page);
    t.check(s.open && s.section && s.body && s.label === EXAMPLE_LABEL && same(s.outs.alignX, ['0', '0%']) && s.alignState === '', 'after a reload the drawer is open as left, with the example back, the photo and its alignment gone', { open: s.open, label: s.label.slice(0, 30), out: s.outs.alignX, alignState: s.alignState });
    t.note('a painting loaded into the drawer is not kept across a reload (the README promises that only for the Studio); the drawer says nothing about it.');
    await clean(t, page, 'routes and reload');
    await page.context().close();

    const DRAWERS = 'portrait-value-studio.drawers';
    const hostile = [
      ['drawers: not JSON', { [DRAWERS]: 'not json' }, false],
      ['drawers: a string', { [DRAWERS]: '"check"' }, false],
      ['drawers: an object', { [DRAWERS]: '{"check":true}' }, false],
      ['drawers: prototype names', { [DRAWERS]: JSON.stringify(PROTO_NAMES) }, false],
      ['drawers: NaN', { [DRAWERS]: 'NaN' }, false],
      ['drawers: 100 000 entries', { [DRAWERS]: JSON.stringify(new Array(100000).fill('check')) }, true],
      ['drawers: nested junk beside check', { [DRAWERS]: '[{"a":[1]},null,5,"check"]' }, true],
      ['every key junk, drawers open', { 'portrait-value-studio.mode': '{"constructor":1}', 'portrait-value-studio.lean': 'NaN', 'portrait-value-studio.blockView': '__proto__', 'portrait-value-studio.smoothing': '[]', 'portrait-value-studio.canvasUnit': '"999999"', 'portrait-value-studio.palette': '{"__proto__":{"x":1}}', [DRAWERS]: '["check"]' }, true],
      ['lean past 100, mode advanced, all drawers', { 'portrait-value-studio.lean': '1e309', 'portrait-value-studio.mode': 'advanced', [DRAWERS]: '["check","values","colors","swatches"]' }, true],
      ['lean a huge number string', { 'portrait-value-studio.lean': '9'.repeat(400), [DRAWERS]: '["check"]' }, true],
    ];
    for (const [title, storage, open] of hostile) {
      const p = await openPage(site, { storage });
      await countResults(p);
      await busyHidden(p); await sleep(300);
      const s = await state(p);
      t.check(s.open === open && s.section === open && (open ? s.body && s.badge === `Color ${s.color} · Value ${s.value}` : s.badge === 'Not scored yet') && s.label === EXAMPLE_LABEL, `${title}: the drawer ${open ? 'opens with the example scored' : 'stays closed, nothing scored yet'}`, { open: s.open, section: s.section, badge: s.badge, simple: s.simple });
      await clean(t, p, title);
      await p.context().close();
    }
  }

  // ---- the phone width ----
  {
    const page = await openPage(site, { viewport: PHONE, url: '#check' });
    await countResults(page);
    await busyHidden(page);
    let s = await state(page);
    t.check(s.open && s.body && s.label === EXAMPLE_LABEL && (await hscroll(page)) <= 0, 'phone: the drawer opens with the example and no horizontal scroll', { open: s.open, body: s.body, hscroll: await hscroll(page) });
    const cols = await page.evaluate(() => getComputedStyle(document.getElementById('checkPanels')).gridTemplateColumns.split(' ').length);
    t.check(cols === 1, 'phone: the four panels stack in one column', cols);
    t.check(await loadArt(page, await makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'phone.jpg' })), 'phone: a photo loads as the painting');
    s = await state(page);
    t.check(s.label === 'phone.jpg · 640 × 800 px' && same(s.art, [600, 750]), 'phone: the label and the fit', { label: s.label, art: s.art });
    checkScorecard(t, s, 'phone');
    await openAlign(page);
    await setRange(page, 'alignScale', 80);
    s = await state(page);
    t.check(s.alignState === 'moved, 36% of picture left out' && (await hscroll(page)) <= 0, 'phone: Size at 80% says 36% left out, still no horizontal scroll', { alignState: s.alignState, hscroll: await hscroll(page) });
    const l = await hoverAt(page, '#cv-diff', 0.5, 0.5);
    t.check(l.shown && /^\d{1,3}% match$/.test(l.hex), 'phone: a pointer over a zone reads its match', l);
    await page.mouse.move(5, 5);
    await click(page, '#wbPick'); await sleep(50);
    await resetToast(page);
    await clickAt(page, '#cv-art', 0.5, 0.45);
    s = await state(page);
    t.check(/^(#[0-9A-F]{6} is too colorful|Color cast removed|That spot is too dark)/.test(s.toast), 'phone: a tap while picking is answered', s.toast);
    if (s.picking) await page.keyboard.press('Escape');
    const hints = await page.evaluate(() => ({ hint: getComputedStyle(document.querySelector('#checkBody .scorecard > .hint')).display !== 'none', more: document.querySelector('#checkBody details.more').open }));
    t.check(hints.hint && !hints.more, 'phone: the plain-words hint shows, the formulas stay behind Show the details', hints);
    await screenshot(page, 'check-painting-phone');
    await clean(t, page, 'phone');
    await page.context().close();
  }

  // ---- the scores against paintings made from the reference with one known change: the README's formulas and its
  // worked example, the uncovered part left out, Shapes in the right place, Crop and Stretch ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    let s, fx;
    // half a value step lighter everywhere: the README's worked number, 75
    t.check(await loadArt(page, (await variant(page, 'lighter.png', { kind: 'lab', dL: 5 })).file), 'the reference lifted by half a value step (ΔL* +5) loads as the painting');
    s = await state(page); fx = fixesOf(s);
    t.check(Math.abs(s.value - 75) <= 2, 'half a value step lighter everywhere: the light and dark score is 75, as the README works it out', { value: s.value, color: s.color, shapes: s.shapes });
    t.check(s.color > s.value, 'a change of lightness alone costs the color score less than the light and dark score (CIEDE2000 weighs lightness below 5 × |ΔL*|)', { color: s.color, value: s.value });
    t.check(fx.every((f) => /^Too light by \d\.\d value(,|$)/.test(f.note) && pctFits(f.pct, f.dE)), 'every difference listed is called too light, never too dark, its match 100 − 2.5 × its ΔE', fx.map((f) => [f.note, f.pct, f.dE]));
    if (fx.some((f) => !/^Too light by 0\.[456] value/.test(f.note))) t.note(`Lifted by exactly half a value step everywhere, the list says ${fx.map((f) => `"${f.note}"`).join(', ')}: a shape's "most prominent color" is read through bins about 4 L* wide (processing.js dominantColors), so a note's amount can be off by about 0.2 value.`);
    const hovers = [];
    for (const [hx, hy] of [[0.2, 0.15], [0.5, 0.1], [0.8, 0.2], [0.3, 0.4], [0.5, 0.45], [0.7, 0.4], [0.35, 0.6], [0.6, 0.65], [0.2, 0.85], [0.75, 0.9]]) {
      const l = await hoverAt(page, '#cv-diff', hx, hy);
      hovers.push({ at: [hx, hy], pct: +(/^(\d{1,3})% match$/.exec(l.hex) || [])[1], dE: +(/^ΔE (\d+\.\d)$/.exec(l.val) || [])[1] });
    }
    await page.mouse.move(5, 5);
    t.check(hovers.every((h) => pctFits(h.pct, h.dE)), 'ten zones hovered on the map: each match is 100 − 2.5 × its ΔE', hovers);
    // a whole value step darker, colors grayer, colors warmer
    t.check(await loadArt(page, (await variant(page, 'darker.png', { kind: 'lab', dL: -10 })).file), 'the reference darkened by a whole value step (ΔL* −10) loads');
    s = await state(page); fx = fixesOf(s);
    t.check(s.value >= 45 && s.value <= 58, 'a whole value step darker: the light and dark score is about 50 (100 − 5 × 10; the darkest shapes cannot go a whole step down)', s.value);
    t.check(fx.length >= 1 && fx.every((f) => /^Too dark by \d\.\d value/.test(f.note) && pctFits(f.pct, f.dE)), 'every difference is called too dark, its match 100 − 2.5 × its ΔE', fx.map((f) => [f.note, f.pct, f.dE]));
    t.check(await loadArt(page, (await variant(page, 'grayer.png', { kind: 'lab', chroma: 0.4 })).file), 'the reference with its colors 60% grayer loads');
    s = await state(page); fx = fixesOf(s);
    t.check(s.value >= 95 && s.color < s.value && fx.some((f) => /too gray/i.test(f.note)) && !fx.some((f) => /too saturated|^Too (light|dark)/i.test(f.note)), 'grayer colors at the same lightness: the light and dark score stays near 100, the color score drops, the list says too gray (never too saturated, lighter or darker)', { value: s.value, color: s.color, notes: fx.map((f) => f.note) });
    t.check(await loadArt(page, (await variant(page, 'warmer.png', { kind: 'lab', warm: 8 })).file), 'the reference warmed (8 units toward orange in a*b*) loads');
    s = await state(page); fx = fixesOf(s);
    t.check(s.value >= 95 && fx.length >= 1 && fx.every((f) => /too warm/i.test(f.note) && !/too cool/i.test(f.note)), 'warmer colors at the same lightness: the light and dark score stays near 100, every difference is called too warm', { value: s.value, notes: fx.map((f) => f.note) });
    // the part of the reference the photo no longer covers is left out of the score
    await openAlign(page);
    t.check(await loadArt(page, (await variant(page, 'shifted.png', { kind: 'shift', dx: 120 })).file), 'the reference drawn 120 px (20%) to the right, magenta behind, loads');
    s = await state(page);
    const unaligned = [s.color, s.value, s.shapes];
    await setRange(page, 'alignX', -20);
    s = await state(page);
    const uncovered = await hoverAt(page, '#cv-diff', 0.9, 0.5), covered = await hoverAt(page, '#cv-diff', 0.3, 0.5);
    await page.mouse.move(5, 5);
    t.check(unaligned[0] < 90 && s.color === 100 && s.value === 100 && s.shapes === '100%' && s.alignState === 'moved, 20% of picture left out', 'moved back by −20% (Move is a share of the width): the reference\'s own pixels score 100, 100 and 100%, the 20% no longer covered left out of the score', { before: unaligned, after: [s.color, s.value, s.shapes], note: s.alignState });
    t.check(uncovered.hex === 'Not covered' && /^\d{1,3}% match$/.test(covered.hex), 'the strip no longer covered reads Not covered, the rest its match', { uncovered: uncovered.hex, covered: covered.hex });
    for (const [name, spec, id, v] of [['tilted.png', { kind: 'turn', deg: 2 }, 'alignRot', -2], ['larger.png', { kind: 'turn', f: 1.1 }, 'alignScale', 91]]) {
      t.check(await loadArt(page, (await variant(page, name, spec)).file), `${name} (the reference ${spec.deg ? 'turned 2°' : 'enlarged 110%'} on mid gray) loads`);
      const before = await state(page);
      await setRange(page, id, v);
      s = await state(page);
      t.check(s.color >= 98 && s.value >= 97 && +s.shapes.slice(0, -1) >= 97 && (s.value > before.value || +s.shapes.slice(0, -1) > +before.shapes.slice(0, -1)), `${name}: ${id === 'alignRot' ? 'Rotate at −2° (degrees)' : 'Size at 91% (percent)'} lines it back up and the scores rise to about 100`, { before: [before.color, before.value, before.shapes], after: [s.color, s.value, s.shapes], note: s.alignState });
    }
    // Shapes in the right place: the share of the picture in the same mass
    for (const [name, spec, word] of [['nolights.png', { kind: 'zone', zone: 'light', rgb: [0, 0, 0] }, 'Too dark'], ['noshadows.png', { kind: 'zone', zone: 'shadow', rgb: [255, 255, 255] }, 'Too light']]) {
      const v = await variant(page, name, spec);
      t.check(await loadArt(page, v.file), `${name} loads`);
      s = await state(page); fx = fixesOf(s);
      const want = Math.round(100 - v.info.share * 100), zoneName = spec.zone === 'light' ? 'Light' : 'Shadow';
      const ofZone = fx.filter((f) => f.zone === zoneName);
      t.check(Math.abs(+s.shapes.slice(0, -1) - want) <= 3 && s.value < 90 && ofZone.length >= 1 && ofZone.every((f) => f.note.startsWith(word)), `the reference's ${spec.zone} zone (${(v.info.share * 100).toFixed(1)}% of the picture) painted ${spec.zone === 'light' ? 'black' : 'white'}: Shapes in the right place falls to about ${want}%, and those shapes are called ${word.toLowerCase()}`, { shapes: s.shapes, want, value: s.value, list: fx.map((f) => `${f.zone}: ${f.note}`) });
    }
    // Crop and Stretch, shown correct rather than only different
    const fit = (v) => afterResult(page, () => page.evaluate((v) => { const e = document.getElementById('artFit'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, v));
    t.check(await loadArt(page, (await variant(page, 'framed.png', { kind: 'pad', pad: 150 })).file), 'the reference between 150 px magenta bars (900 × 750) loads');
    s = await state(page);
    const framedCrop = [s.color, s.value, s.shapes];
    await fit('stretch'); s = await state(page);
    t.check(same(framedCrop, [100, 100, '100%']) && s.color < 60, 'Crop to match takes the middle of a wider photo (here the reference itself: 100 on every score); Stretch to match squeezes the bars in', { crop: framedCrop, stretch: [s.color, s.value, s.shapes] });
    await fit('crop');
    t.check(await loadArt(page, (await variant(page, 'squashed.png', { kind: 'squash', w: 300, h: 750 })).file), 'the reference squashed to 300 × 750 loads');
    s = await state(page);
    const squashCrop = [s.color, s.value, s.shapes];
    await fit('stretch'); s = await state(page);
    t.check(s.color >= 97 && s.value >= 96 && +s.shapes.slice(0, -1) >= 96 && squashCrop[0] < s.color - 5, 'a photo squashed to half its width: Stretch to match brings it back (about 100), Crop to match does not', { crop: squashCrop, stretch: [s.color, s.value, s.shapes] });
    await fit('crop');
    // the reverse: drawn twice as wide, Crop keeps only the middle half of it, Stretch brings the whole back
    t.check(await loadArt(page, (await variant(page, 'widened.png', { kind: 'squash', w: 1200, h: 750 })).file), 'the reference stretched to 1200 × 750 loads');
    s = await state(page);
    const wideCrop = [s.color, s.value, s.shapes];
    await fit('stretch'); s = await state(page);
    t.check(s.color >= 97 && s.value >= 96 && +s.shapes.slice(0, -1) >= 96 && wideCrop[0] < s.color - 5, 'a photo stretched to twice its width: Stretch to match brings it back (about 100), Crop to match does not', { crop: wideCrop, stretch: [s.color, s.value, s.shapes] });
    await fit('crop');
    // Move changed and the tab switched inside the check's short wait: back on the Study tab the score is the new position's
    await page.evaluate(() => { const e = document.getElementById('alignX'); e.value = 5; e.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-tab="help"]').click(); });
    await tab(page, 'study'); await busyHidden(page); await sleep(200);
    const viaSwitch = await state(page);
    await click(page, '#alignReset'); await busyHidden(page);
    await setRange(page, 'alignX', 5);
    const direct = await state(page);
    t.check(same(viaSwitch.outs.alignX, ['5', '+5%']) && viaSwitch.badge === direct.badge && viaSwitch.alignState === direct.alignState, 'Move changed and another tab opened within the check\'s 120 ms wait: back on the Study tab the score is the new position\'s', { viaSwitch: [viaSwitch.badge, viaSwitch.alignState], direct: [direct.badge, direct.alignState] });
    await clean(t, page, 'paintings with known changes');
    await page.context().close();
  }

  // ---- the tool bar's marks on the check panels and in their saved PNGs; a phone photo's EXIF turn; files at once ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    let s;
    const lineOn = async (fx, fy) => Object.fromEntries(await Promise.all(['cv-refblock', 'cv-art', 'cv-artblock', 'cv-diff'].map(async (id) => [id, await overlayHas(page, id, fx, fy, LINE_RED)])));
    await click(page, '[data-tool="line"]'); await sleep(100);
    await stroke(page, '#cv-orig'); // (0.3, 0.3) to (0.7, 0.65)
    let on = await lineOn(0.5, 0.475);
    t.check((await toolCount(page, 'line')) === 1 && Object.values(on).every(Boolean), 'a line drawn on the Photo shows on all four check panels', on);
    await stroke(page, '#cv-art', [[0.2, 0.85], [0.5, 0.86], [0.8, 0.87]]);
    t.check((await toolCount(page, 'line')) === 2 && (await overlayHas(page, 'cv-orig', 0.5, 0.86, LINE_RED)) && (await overlayHas(page, 'cv-diff', 0.5, 0.86, LINE_RED)), 'a line drawn on Your painting is drawn, and shows on the Photo and on the map', await toolCount(page, 'line'));
    await openAlign(page);
    await setRange(page, 'alignScale', 90);
    on = await lineOn(0.5, 0.475);
    t.check(Object.values(on).every(Boolean), 'after a rerun (Size 90%) the check panels still carry the line', on);
    await click(page, '[data-tool="plumb"]'); await sleep(80);
    { const b = await box(page, '#cv-art'); await page.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.2); await sleep(150); }
    t.check((await toolCount(page, 'plumb')) === 1 && (await overlayHas(page, 'cv-orig', 0.62, 0.05, '#ffffff', 6)) && (await overlayHas(page, 'cv-diff', 0.9, 0.2, '#ffffff', 6)), 'a plumb point dropped on Your painting draws its plumb line and level on the Photo and on the map', await toolCount(page, 'plumb'));
    await click(page, '#gridBtn'); await sleep(100);
    t.check((await overlayHas(page, 'cv-diff', 1 / 3, 0.95, '#ffffff', 3)) && (await overlayHas(page, 'cv-art', 0.95, 2 / 3, '#ffffff', 3)), 'the 3 × 3 grid shows on the check panels');
    await click(page, '#gridBtn'); await click(page, '#gridBtn'); await sleep(100);
    // a measure dragged just under a numbered label: its label must keep off the map's percentages
    await click(page, '[data-tool="measure"]'); await sleep(80);
    const pills = await clusters(page, 'cv-diff', LABEL_INK);
    const pill = pills.boxes.slice().sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0)).find((b) => (b.x0 + b.x1) / 2 > 100 && (b.x0 + b.x1) / 2 < pills.W - 100 && b.y1 + 2.5 * (b.y1 - b.y0) < pills.H) || pills.boxes[0];
    const lineY = pill.y1 + 12, pcx = (pill.x0 + pill.x1) / 2; // close enough that a label above the line would cover the numbered label
    {
      const b = await box(page, '#cv-diff');
      const X = (x) => b.x + (b.width * x) / pills.W, Y = (y) => b.y + (b.height * y) / pills.H;
      await page.mouse.move(X(pcx - 90), Y(lineY)); await page.mouse.down(); await page.mouse.move(X(pcx), Y(lineY), { steps: 4 }); await page.mouse.move(X(pcx + 90), Y(lineY), { steps: 4 }); await page.mouse.up(); await sleep(200);
    }
    const keepOff = await page.evaluate(([p, ly, rgb]) => {
      const c = document.getElementById('cv-diff'); const o = c.nextElementSibling; const sx = o.width / c.width, sy = o.height / c.height;
      const od = o.getContext('2d').getImageData(0, 0, o.width, o.height).data;
      const yellow = (i) => od[i + 3] > 200 && Math.abs(od[i] - rgb[0]) < 25 && Math.abs(od[i + 1] - rgb[1]) < 25 && Math.abs(od[i + 2] - rgb[2]) < 45;
      let onLabel = 0, label = 0, top = Infinity, bottom = -1;
      for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
        const i = (y * o.width + x) * 4; if (!yellow(i)) continue;
        if (x >= p.x0 * sx && x <= (p.x1 + 1) * sx && y >= p.y0 * sy && y <= (p.y1 + 1) * sy) onLabel++;
        if (Math.abs(y - ly * sy) > 8) { label++; top = Math.min(top, y / sy); bottom = Math.max(bottom, y / sy); } // off the line and its end ticks: the 1 U label
      }
      return { onLabel, label, labelRows: [Math.round(top), Math.round(bottom)], lineRow: Math.round(ly) };
    }, [pill, lineY, UNIT_YELLOW]);
    t.check((await toolCount(page, 'measure')) === 1 && keepOff.label > 30 && keepOff.onLabel === 0, 'a measure dragged just under a numbered label: its 1 U label is drawn, and off the map\'s percentages', { ...keepOff, pill: [pill.x0, pill.y0, pill.x1, pill.y1] });
    // Save PNG burns the marks in: the map with its hatched border, its numbered labels and both lines; Your blocks
    await setRange(page, 'alignScale', 80);
    const save = (id) => download(page, async () => { await page.locator(`[data-save="${id}"]`).scrollIntoViewIfNeeded(); await page.locator(`[data-save="${id}"]`).click(); });
    const dlMap = await save('diff');
    const map = dlMap && dlMap.buf.length ? await pngRead(page, dlMap.buf, { at: [[1, 375], [2, 375], [3, 375], [4, 375]], count: [LABEL_INK], near: [[0.5, 0.475, LINE_RED, 4], [0.5, 0.86, LINE_RED, 4]] }) : null;
    t.check(map && dlMap.name === 'sample-study-accuracy-map.png' && map.w === 600 && map.h === 750 && map.at.every((p) => p[0] === p[1] && p[1] === p[2] && (p[0] === 105 || p[0] === 78)) && map.count[0] > 300 && map.near.every(Boolean), 'Save PNG on the map: 600 × 750 with the hatched border, the numbered labels and both lines burned in', map && { name: dlMap.name, w: map.w, h: map.h, border: map.at, labelInk: map.count[0], lines: map.near });
    const dlBlocks = await save('artblock');
    const blocks = dlBlocks && dlBlocks.buf.length ? await pngRead(page, dlBlocks.buf, { near: [[0.5, 0.475, LINE_RED, 4]] }) : null;
    t.check(blocks && dlBlocks.name === 'sample-study-my-painting-blocks.png' && blocks.w === 600 && blocks.h === 750 && blocks.near[0], 'Save PNG on Your blocks: 600 × 750 with the line burned in', blocks && { name: dlBlocks.name, w: blocks.w, h: blocks.h, line: blocks.near[0] });
    await page.evaluate(() => { const dlg = document.getElementById('saveDialog'); if (dlg.open) dlg.close(); });
    await click(page, '[data-tool="sample"]'); await click(page, '#alignReset'); await busyHidden(page);
    await clean(t, page, 'marks on the check panels');
    // a phone photo stored on its side with an EXIF turn, by the input, a drop and a paste
    const phoneJpeg = await exifJpeg(page);
    for (const [how, act] of [['the input', () => page.setInputFiles('#artFile', phoneJpeg)], ['a drop', () => dropFiles(page, 'body', [phoneJpeg])], ['a paste', () => pasteFile(page, phoneJpeg)]]) {
      const loaded = await afterResult(page, act);
      s = await state(page);
      const mark = await px(page, 'cv-art', 540, 50), plain = await px(page, 'cv-art', 60, 50);
      t.check(loaded && s.label === 'phone.jpg · 600 × 800 px' && mark[0] > 150 && mark[1] < 90 && Math.abs(plain[0] - 128) < 12 && Math.abs(plain[2] - 128) < 12, `a phone photo stored on its side with an EXIF turn, by ${how}: upright, 600 × 800, its marked corner top right`, { loaded, label: s.label, topRight: mark, topLeft: plain });
    }
    // two files at once: dropped together, chosen one straight after the other, a reference and a painting together
    const a = await makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'a.jpg' }), b = await makeImage(page, { width: 500, height: 700, draw: 'flat', name: 'b.png' });
    await resetToast(page);
    t.check(await afterResult(page, () => dropFiles(page, 'body', [a, b])), 'two files dropped together are read');
    s = await state(page);
    t.check(s.label === 'a.jpg · 640 × 800 px' && s.toast === 'Of the 2 files dropped, only a.jpg was taken.', 'two files dropped at once: the first is the painting, and the page says only it was taken', { label: s.label, toast: s.toast });
    await resetToast(page);
    await afterResult(page, async () => { await page.setInputFiles('#artFile', a); await page.setInputFiles('#artFile', b); });
    await busyHidden(page); await sleep(600);
    s = await state(page);
    t.check(s.label === 'b.png · 500 × 700 px' && s.toast === '', 'two paintings chosen one straight after the other: the last is the painting, nothing said of the first', { label: s.label, toast: s.toast });
    const ref2 = await makeImage(page, { width: 800, height: 1000, type: 'image/jpeg', name: 'ref2.jpg' }), art2 = await makeImage(page, { width: 700, height: 900, type: 'image/jpeg', name: 'art2.jpg' });
    const both = [['file', ref2], ['artFile', art2]].map(([id, f]) => ({ id, name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') }));
    await afterResult(page, () => page.evaluate((both) => { for (const f of both) { const bin = atob(f.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([u], f.name, { type: f.type })); const el = document.getElementById(f.id); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); } }, both), { more: 2 });
    await page.waitForFunction(() => /^ref2\.jpg/.test(document.getElementById('source').textContent) && /^art2\.jpg/.test(document.getElementById('artSource').textContent) && document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);
    await sleep(300);
    const together = await state(page);
    await afterResult(page, () => page.setInputFiles('#file', ref2));
    await afterResult(page, () => page.setInputFiles('#artFile', art2));
    const apart = await state(page);
    t.check(together.source === 'ref2.jpg · 800 × 1000 px' && together.label === 'art2.jpg · 700 × 900 px' && together.badge === apart.badge && together.shapes === apart.shapes, 'a new reference and a new painting at the same moment are scored as that pair is when loaded one after the other', { together: [together.source, together.label, together.badge, together.shapes], apart: [apart.badge, apart.shapes] });
    await clean(t, page, 'files at once');
    await page.context().close();
  }

  // ---- a phone with a touch screen: a tap on a zone, the loupe that goes by itself, taps that pick and that do not;
  // then a big reference at Working size 1400 with the drawer open, and Simplify dragged ----
  {
    const page = await openTouchPage(site, '#check');
    await countResults(page);
    await busyHidden(page);
    let s;
    const picked = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('portrait-value-studio.palette') || '[]').length; } catch (e) { return -1; } });
    await page.evaluate(() => { window.__loupeLog = []; const l = document.getElementById('loupe'); new MutationObserver(() => window.__loupeLog.push({ t: performance.now(), hidden: l.hidden, hex: document.getElementById('loupeHex').textContent })).observe(l, { attributes: true, attributeFilter: ['hidden'] }); });
    const p0 = await picked();
    await tapOn(page, '#cv-diff', 0.5, 0.45);
    await page.waitForFunction(() => { const lg = window.__loupeLog; const i = lg.findIndex((e) => !e.hidden); return i >= 0 && lg.slice(i).some((e) => e.hidden); }, null, { timeout: 8000 }).catch(() => null);
    const lg = await page.evaluate(() => window.__loupeLog);
    const shownAt = lg.find((e) => !e.hidden), goneAt = shownAt && lg.find((e) => e.hidden && e.t > shownAt.t);
    t.check(shownAt && /^\d{1,3}% match$/.test(shownAt.hex) && goneAt, 'phone, a tap on a zone of the map: the loupe shows its match, then goes by itself', lg.map((e) => ({ t: Math.round(e.t), hidden: e.hidden, hex: e.hex })));
    if (shownAt && goneAt) t.note(`phone: the loupe of a tap on the map stayed ${Math.round(goneAt.t - shownAt.t)} ms`);
    t.check((await picked()) === p0, 'phone: a tap on the map adds no Picked color', { before: p0, after: await picked() });
    await tapOn(page, '#cv-art', 0.5, 0.45); await sleep(300);
    t.check((await picked()) === p0 + 1, 'phone: a tap on Your painting (the magnifier) adds its color to Picked colors', { before: p0, after: await picked() });
    // picking a neutral spot by touch: a finger that drags is told to tap; one that wobbles a little picks
    t.check(await loadArt(page, await ownPixels(page, { patches: true })), 'phone: the patch painting loads');
    await openAlign(page);
    const cdp = await page.context().newCDPSession(page);
    await page.locator('#wbPick').tap(); await sleep(80);
    await resetToast(page);
    await touchDrag(page, cdp, '#cv-art', patchAt(1)[0] / 600, patchAt(1)[1] / 750, 15);
    s = await state(page);
    t.check(s.toast === 'Click one white or gray spot, without dragging' && s.picking && !s.wbUndo, 'phone: a finger dragged 15 px across Your painting while picking is told to pick one spot, and picking stays on', { toast: s.toast, picking: s.picking });
    await resetToast(page);
    if (!s.picking) { await page.locator('#wbPick').tap(); await sleep(80); }
    await touchDrag(page, cdp, '#cv-art', patchAt(1)[0] / 600, patchAt(1)[1] / 750, 6);
    s = await state(page);
    t.check(FIXED.test(s.toast) && !s.picking && s.wbUndo, 'phone: a tap that wobbles 6 px on the warm-tinted white picks it: the cast is removed', { toast: s.toast, picking: s.picking });
    await clean(t, page, 'touch');
    // Working size 1400 with a big reference and painting, the drawer open, and Simplify dragged across its range
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click()); await busyHidden(page);
    t.check(await afterResult(page, async () => page.setInputFiles('#file', await makeImage(page, { width: 1600, height: 2000, type: 'image/jpeg', name: 'big-ref.jpg' })), { timeout: 120000 }), 'phone: a 1600 × 2000 reference loads with the drawer open');
    t.check(await loadArt(page, await makeImage(page, { width: 1500, height: 1900, type: 'image/jpeg', name: 'big-art.jpg' })), 'phone: a 1500 × 1900 painting loads');
    t.check(await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('detail'); e.value = '1400'; e.dispatchEvent(new Event('change', { bubbles: true })); }), { timeout: 180000 }), 'phone: Working size 1400 with the drawer open reruns');
    s = await state(page);
    t.check(same(s.orig, [1120, 1400]) && same(s.art, s.orig) && same(s.diff, s.orig), 'phone: at 1400 the reference, the painting and the map are 1120 × 1400', { orig: s.orig, art: s.art, diff: s.diff });
    const t0 = Date.now();
    await page.evaluate(async () => { const e = document.getElementById('simplify'); for (let i = 0; i < 30; i++) { e.value = String(i % 11); e.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 40)); } e.value = '7'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    const settled = await busyHidden(page, 180000); const took = Date.now() - t0;
    await sleep(300);
    const frameMs = await page.evaluate(() => new Promise((r) => { const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => r(Math.round(performance.now() - t0)), 0)); }));
    const spammed = await state(page), simplifyOut = await page.evaluate(() => document.getElementById('simplifyOut').value);
    await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('simplify'); e.dispatchEvent(new Event('input', { bubbles: true })); }), { timeout: 180000 });
    const again = await state(page);
    t.check(settled && simplifyOut === '7' && spammed.badge === again.badge && frameMs < 500, 'phone at 1400: thirty Simplify steps with the drawer open settle on the last one, scored as a single run at it scores, and the page answers at once afterwards', { settled, seconds: took / 1000, simplifyOut, badge: spammed.badge, single: again.badge, frameMs });
    t.note(`phone at 1400 with the drawer open: thirty Simplify steps 40 ms apart took ${(took / 1000).toFixed(1)} s to settle on a shared machine (not checked)`);
    await clean(t, page, 'phone at 1400');
    await page.context().close();
  }

  // ---- the Palette block view remembered, with the drawer open: what the check shows and scores; axe over the
  // drawer and the align panel, light and dark ----
  {
    const page = await openPage(site, { url: '#check', bypassCSP: true, storage: { 'portrait-value-studio.blockView': 'palette' } });
    await countResults(page);
    await busyHidden(page);
    const mixed = await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 30000 }).then(() => true).catch(() => false);
    const view = await page.evaluate(() => { const a = document.getElementById('cv-block').getContext('2d'), b = document.getElementById('cv-refblock').getContext('2d'); const pts = [[300, 300], [100, 100], [300, 600], [450, 350], [150, 500]]; return { pressed: document.getElementById('blockViewPalette').getAttribute('aria-pressed'), name: document.getElementById('blockViewPalette').textContent.trim(), differ: pts.filter(([x, y]) => { const p = a.getImageData(x, y, 1, 1).data, q = b.getImageData(x, y, 1, 1).data; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 6; }).length }; });
    const s = await state(page);
    t.check(mixed && view.pressed === 'true' && s.badge === exampleBadge, 'the Palette block view remembered: the check scores the example as with Photo (it compares the photo\'s colors)', { mixed, view, badge: s.badge, withPhoto: exampleBadge });
    if (view.differ) t.note(`With the Palette view (${view.name}) remembered, the Study's color-block panel shows the palette's mixes while the check's Reference blocks and the accuracy map show the photo's colors (${view.differ} of 5 points differ); the README does not say which the check shows, and the page does not say why its two sets of blocks differ.`);
    await openAlign(page);
    // the photo moved, so the panel's note has words for axe to measure (empty, its contrast is never read)
    await setRange(page, 'alignX', 5);
    const note = (await state(page)).alignState;
    let v = await axe(page);
    t.check(v.length === 0 && note !== '', 'axe: no violations with the drawer, its scorecard, list and map, and the align panel open with its note', { note, v });
    await page.emulateMedia({ colorScheme: 'dark' }); await sleep(400);
    v = await axe(page);
    t.check(v.length === 0, 'axe, dark: no violations with the same open', v);
    await screenshot(page, 'check-painting-dark');
    await clean(t, page, 'palette view and axe');
    await page.context().close();
  }

  // ---- the map's labels as drawn: numbered as the list, inside the picture, none on another, on the example, with
  // the photo made smaller, and on a reference of slivers; Rotate's and Size's keyboard steps; a half-faded reference ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    await page.evaluate(PILL_LOG);
    // the labels of the next check run (Reset position reruns the check as it stands)
    const labels = async (act) => { await act(); await busyHidden(page); await sleep(150); return page.evaluate(() => ({ list: window.__pills.slice(), W: document.getElementById('cv-diff').width, H: document.getElementById('cv-diff').height, shapes: window.Study.shapeCount(window.Studio.result()) })); };
    let r = await labels(() => click(page, '#alignReset'));
    let s = await state(page);
    const white = r.list.filter((p) => /^\d · \d{1,3}%$/.test(p.text)), dark = r.list.filter((p) => /^\d{1,3}%$/.test(p.text));
    const want = fixesOf(s).map((f, i) => `${i + 1} · ${f.pct}%`);
    t.check(same(white.map((p) => p.text), want), 'the example\'s white labels read 1 to 5 with each entry\'s own match, as the list numbers them', { labels: white.map((p) => p.text), list: want });
    t.check(dark.length >= 3 && white.length + dark.length === r.list.length && r.list.length <= r.shapes && r.list.every((p) => pillInside(p, r.W, r.H)), 'the example\'s map: the zones\' percentages and the numbered labels, no more labels than shapes, every label inside the picture', { white: white.length, dark: dark.length, shapes: r.shapes, outside: r.list.filter((p) => !pillInside(p, r.W, r.H)) });
    const over = pillsOverlapping(r.list);
    if (!t.check(over.length === 0, 'the example\'s map: no label lies on another', over)) {
      const o = over[0];
      t.finding({ title: 'On the example\'s accuracy map a numbered white label is drawn over the end of a zone\'s percentage label', severity: 'low', steps: 'Open index.html#check (the built-in example, nothing moved). Look at the accuracy map (Accuracy by shape) around the lower middle, where the white label "5 · …%" sits beside a dark "…%" label; zoom the page or Save PNG and look at the file to see it plainly. Twice: the example is drawn the same each time.', expected: 'Each label stands clear of the others, as the README\'s "Zones too small to hold a label stay unlabelled" implies: a label goes where its zone has room for it.', actual: `The white label "${o.labels[1]}" overlaps the dark "${o.labels[0]}" by ${o.by[0]} × ${o.by[1]} px (boxes at ${o.at.slice(0, 2).join(', ')} and ${o.at.slice(2).join(', ')} on the 600 × 750 map) and covers its rounded end; ${over.length} overlap${over.length === 1 ? '' : 's'} in all.`, cause: 'js/app.js drawLabels: the labels\' boxes are not kept clear of one another. (As first found, at 2f4af81: a white label\'s font was room / 1.9 floored at minFont, but the pill is about 5 × font wide, so it spilled 8 to 10 px into the next zone, and neither loop looked at the boxes already drawn; a501d56 plans the boxes before drawing.)' });
    }
    // Rotate and Size from the keyboard: their own steps (0.25°, 0.5%) and their outputs, Home and End
    await openAlign(page);
    await page.focus('#alignRot'); await page.keyboard.press('ArrowRight'); await busyHidden(page); await sleep(80);
    s = await state(page);
    const rot = { out: s.outs.alignRot, note: s.alignState };
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await busyHidden(page); await sleep(80);
    s = await state(page);
    t.check(same(rot.out, ['0.25', '+0.25°']) && /^moved/.test(rot.note) && same(s.outs.alignRot, ['-0.25', '-0.25°']), 'Rotate from the keyboard: one arrow turns it 0.25° (+0.25°), two back read −0.25°, and the panel says moved', { one: rot, back: s.outs.alignRot });
    await page.keyboard.press('Home'); await busyHidden(page); await sleep(80);
    t.check(same((await state(page)).outs.alignRot, ['-15', '-15°']), 'Home takes Rotate to −15°', (await state(page)).outs.alignRot);
    await click(page, '#alignReset'); await busyHidden(page);
    await page.focus('#alignScale'); await page.keyboard.press('ArrowLeft'); await busyHidden(page); await sleep(80);
    const sizeStep = (await state(page)).outs.alignScale;
    await page.keyboard.press('Home'); await busyHidden(page); await sleep(80);
    const home = await state(page);
    await page.keyboard.press('End'); await busyHidden(page); await sleep(80);
    const end = await state(page);
    t.check(same(sizeStep, ['99.5', '99.5%']) && same(home.outs.alignScale, ['80', '80%']) && home.alignState === 'moved, 36% of picture left out' && same(end.outs.alignScale, ['125', '125%']) && end.alignState === 'moved', 'Size from the keyboard: an arrow is 0.5% (99.5%), Home 80% with 36% left out, End 125%', { step: sizeStep, home: [home.outs.alignScale, home.alignState], end: [end.outs.alignScale, end.alignState] });
    await click(page, '#alignReset'); await busyHidden(page);
    // Show reference on top half way: a blend of the two pictures, the score untouched
    const before = await state(page);
    const artPx = await px(page, 'cv-art', 300, 400), origPx = await px(page, 'cv-orig', 300, 400);
    await setRange(page, 'onion', 50);
    s = await state(page);
    const half = await px(page, 'cv-art', 300, 400);
    t.check(same(s.outs.onion, ['50', '50%']) && half.every((v, i) => Math.abs(v - (artPx[i] + origPx[i]) / 2) <= 2) && s.badge === before.badge, 'Show reference on top at 50%: Your painting shows half way between itself and the reference, and the score does not move', { out: s.outs.onion, shown: half, painting: artPx, reference: origPx, badge: [before.badge, s.badge] });
    await setRange(page, 'onion', 0);
    // Move nudged, then a Study setting changed inside the check's 120 ms wait: the indicator stays up until the score
    // is the one for both (every time it comes down, the badge already reads the final score)
    {
      await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click()); await busyHidden(page);
      const was = await page.evaluate(() => document.getElementById('simplify').value);
      await page.evaluate(() => { window.__downWith = []; const busy = document.getElementById('busy'), badge = document.getElementById('checkState'); window.__downObs = new MutationObserver(() => { if (busy.hidden) window.__downWith.push({ t: Math.round(performance.now()), badge: badge.textContent }); }); window.__downObs.observe(busy, { attributes: true, attributeFilter: ['hidden'] }); });
      const ran = await afterResult(page, () => page.evaluate(async () => {
        window.__t0 = Math.round(performance.now());
        const x = document.getElementById('alignX'); x.value = 4; x.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 50));
        const e = document.getElementById('simplify'); e.value = String(+e.value === 9 ? 8 : 9); e.dispatchEvent(new Event('input', { bubbles: true }));
      }));
      await sleep(300);
      const downs = await page.evaluate(() => { window.__downObs.disconnect(); return window.__downWith.map((d) => ({ ms: d.t - window.__t0, badge: d.badge })); });
      const final = (await state(page)).badge;
      if (!t.check(ran && downs.length >= 1 && downs.every((d) => d.badge === final), 'Move nudged and Simplify changed 50 ms later: the Updating indicator comes down only once the score is the one for both', { downs, final })) {
        const stale = downs.find((d) => d.badge !== final) || {};
        t.finding({ title: 'The Updating indicator comes down while a Study rerun is still pending, over a score that is about to change', severity: 'low', steps: 'Open index.html#check, choose Advanced. Nudge Move left / right (Line up the photo) and, within the next 120 ms, change a Study setting such as Simplify (for example from the console: set #alignX to 4 and dispatch input, then 50 ms later set #simplify to 9 and dispatch input). Watch the Updating indicator and the drawer\'s badge. Twice, with the same result.', expected: 'The indicator stays up until the score shown is the one for the new position and the new setting.', actual: `The indicator comes down ${stale.ms} ms after the nudge with the badge at "${stale.badge}" (the new position scored against the old Simplify), and a frame is painted that way (a requestAnimationFrame callback sees the indicator hidden and that badge); the badge changes to "${final}" only when the Study rerun finishes, ${(downs[downs.length - 1].ms - stale.ms) || '…'} ms later, with no indicator meanwhile (the moments it came down, from the nudge: ${JSON.stringify(downs)}).`, cause: 'js/app.js checkSoon (line 2387 at a501d56): the check\'s timer runs runCheck and then sets els.busy.hidden = true whatever else is pending; runSoon\'s timer (line 272, set 50 ms later for 90 ms) is still waiting to run the study, which run() rescores at line 289.' });
      }
      await page.evaluate((v) => { const e = document.getElementById('simplify'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('alignReset').click(); }, was);
      await busyHidden(page); await sleep(200);
      await page.evaluate(() => document.querySelector('[data-mode="simple"]').click()); await busyHidden(page);
    }
    await clean(t, page, 'labels and keyboard steps');
    // the photo made smaller (Size 80%): every label stays on the part still covered and inside the picture
    r = await labels(() => setRange(page, 'alignScale', 80));
    const [W, H] = [r.W, r.H], inCover = (p) => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return cx >= 0.1 * W && cx <= 0.9 * W && cy >= 0.1 * H && cy <= 0.9 * H; };
    t.check(r.list.length >= 5 && r.list.every((p) => pillInside(p, W, H) && inCover(p)), 'Size at 80%: every label is centred on the part of the picture still covered (none centred on the hatched border) and inside the picture', { labels: r.list.length, off: r.list.filter((p) => !pillInside(p, W, H) || !inCover(p)).map((p) => [p.text, Math.round(p.x), Math.round(p.y)]) });
    const overHatch = r.list.filter((p) => p.x < 0.1 * W || p.x + p.w > 0.9 * W || p.y < 0.1 * H || p.y + p.h > 0.9 * H);
    if (overHatch.length) t.note(`Size at 80%: ${overHatch.length} label${overHatch.length === 1 ? '' : 's'} (${overHatch.map((p) => p.text).join(', ')}) centred on the covered part reach over onto the hatched border.`);
    await click(page, '#alignReset'); await busyHidden(page);
    // a reference of slivers (noise): a few big shapes and many crumbs; the labels must not become a thicket
    t.check(await afterResult(page, async () => page.setInputFiles('#file', await noiseImage(page, 'noise.png'))), 'a reference of noise loads with the drawer open');
    t.check(await loadArt(page, await makeImage(page, { width: 600, height: 750, name: 'portrait.png' })), 'a painting loads against it');
    await sleep(150);
    r = await page.evaluate(() => ({ list: window.__pills.slice(), W: document.getElementById('cv-diff').width, H: document.getElementById('cv-diff').height, shapes: window.Study.shapeCount(window.Studio.result()) }));
    const minFont = Math.round(Math.max(r.W, r.H) / 60);
    t.check(r.list.length >= 1 && r.list.length <= r.shapes && r.list.every((p) => pillInside(p, r.W, r.H)) && pillsOverlapping(r.list).length === 0, 'a reference of slivers: a few labels, no more than shapes, every one inside the picture and none on another', { labels: r.list.map((p) => `${p.text}@${p.font}px`), shapes: r.shapes, overlapping: pillsOverlapping(r.list) });
    const forced = r.list.filter((p) => /·/.test(p.text) && p.font === minFont);
    if (forced.length) t.note(`On a reference of noise (${r.shapes} shapes) ${forced.length} of the numbered white labels are drawn at the smallest size (${minFont} px) on shapes of about 0.4% of the picture, too small to hold them: the numbered differences are always labelled, while "Zones too small to hold a label stay unlabelled" holds for the percentages only.`);
    await clean(t, page, 'labels on a reference of slivers');
    await page.context().close();
  }

  // ---- Save PNG on the two check panels inside another site's sandboxed frame: the save-by-hand dialog ----
  {
    const page = await openPage(site, { sandbox: {}, url: 'index.html#check' });
    const fr = page.app;
    const scored = await fr.waitForFunction(() => document.getElementById('drawer-check').open && /^Color \d+ · Value \d+$/.test(document.getElementById('checkState').textContent) && document.getElementById('busy').hidden, null, { timeout: 30000 }).then(() => true).catch(() => false);
    for (const [id, name] of [['diff', 'sample-study-accuracy-map.png'], ['artblock', 'sample-study-my-painting-blocks.png']]) {
      await fr.evaluate((id) => document.querySelector(`[data-save="${id}"]`).click(), id);
      const shown = await fr.waitForFunction(() => { const d = document.getElementById('saveDialog'), i = document.getElementById('saveImg'); return d.open && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).then(() => true).catch(() => false);
      const got = await fr.evaluate(() => { const i = document.getElementById('saveImg'); return { open: document.getElementById('saveDialog').open, name: document.getElementById('saveName').textContent, src: (i.getAttribute('src') || '').slice(0, 5), size: [i.naturalWidth, i.naturalHeight] }; });
      t.check(scored && shown && got.open && got.name === name && got.src === 'blob:' && same(got.size, [600, 750]), `inside another site's sandboxed frame, Save PNG on ${id} opens the save dialog with ${name}, 600 × 750`, { scored, shown, ...got });
      await fr.evaluate(() => document.getElementById('saveClose').click());
      const closed = await fr.waitForFunction(() => !document.getElementById('saveDialog').open && !document.getElementById('saveImg').getAttribute('src'), null, { timeout: 3000 }).then(() => true).catch(() => false);
      t.check(closed, `sandboxed: Close shuts the dialog of ${id} and lets its picture go`);
    }
    await clean(t, page, 'sandboxed save');
    await page.context().close();
  }

  // ---- Forget with a painting in the drawer, and a second tab of the site open beside it ----
  {
    const a = await openPage(site);
    await countResults(a);
    await busyHidden(a);
    const b = await newTab(site, a);
    await b.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);
    await a.locator('#drawer-check > summary').scrollIntoViewIfNeeded(); await a.locator('#drawer-check > summary').click();
    await a.waitForFunction(() => /^Color \d+ · Value \d+$/.test(document.getElementById('checkState').textContent) && document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);
    t.check(await loadArt(a, await makeImage(a, { width: 640, height: 800, type: 'image/jpeg', name: 'tab-a.jpg' })), 'tab A: the drawer opened from its summary, a painting loads');
    let sa = await state(a);
    await b.reload({ waitUntil: 'load' });
    await b.waitForFunction(() => document.getElementById('busy').hidden && /^Color \d+ · Value \d+$/.test(document.getElementById('checkState').textContent), null, { timeout: 30000 }).catch(() => null);
    const sb = await state(b);
    t.check(sb.open && sb.section && sb.body && sb.label === EXAMPLE_LABEL && sb.badge === exampleBadge && sa.label === 'tab-a.jpg · 640 × 800 px', 'tab B reloaded: the drawer A opened is open there too, scoring the example (A\'s painting stays in A)', { b: { open: sb.open, label: sb.label.slice(0, 30), badge: sb.badge }, a: sa.label });
    // Forget in A (two presses): both tabs start over, the drawer closed, the example back and not scored yet
    await tab(a, 'help'); await click(a, '#forgetBtn'); await sleep(200);
    await Promise.all([a.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), b.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(a, '#forgetBtn')]);
    for (const p of [a, b]) await p.waitForFunction(() => window.Studio && document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);
    await sleep(400);
    sa = await state(a); const sb2 = await state(b);
    const keyA = await storageGet(a, 'portrait-value-studio.drawers');
    for (const [name, x] of [['A', sa], ['B', sb2]]) t.check(!x.open && !x.section && x.badge === 'Not scored yet' && x.label === EXAMPLE_LABEL && same(x.tab, ['tab-study']), `after Forget in tab A, tab ${name} starts over: the drawer closed, the example back, its badge Not scored yet`, { open: x.open, section: x.section, badge: x.badge, label: x.label.slice(0, 30), tab: x.tab });
    t.check(keyA === null, 'after Forget the open drawers are no longer remembered', keyA);
    await clean(t, a, 'forget: tab A'); await clean(t, b, 'forget: tab B');
    await a.context().close();
  }

  // ---- the third pass (ROUND3, below): one segment per gap the second pass left ----
  for (const [, fn] of ROUND3) await fn(t, site);
}

// ======================================================================================================================
// ROUND3: the third pass. The accuracy map and its labels at every working size; paintings much larger, smaller and of
// another shape than the reference; the photo itself as the painting, at every working size and setting; a painting of
// another subject; Move, Size and Rotate at their ends undoing the change they are for, and the panel's "left out"
// against the hatching; and what the second pass left out (a see-through painting against one on mid gray, two files in
// the same instant, the drawer's own contrast, the red gain limit, the heap). Each block is a segment: a throw in it is
// one failed check, and every page it opened is closed.
// ======================================================================================================================
export const ROUND3 = []; // (exported so a scratch script can run one block alone)
const round3 = (name, fn) => ROUND3.push([name, async (t, site) => {
  const t0 = Date.now(), pages = [];
  const open = async (opts) => { const p = await openPage(site, opts); pages.push(p); return p; };
  try { await fn(t, site, open); } catch (e) { t.check(false, `${name}: ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  for (const p of pages) await p.context().close().catch(() => null);
  t.note(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}]);
// the reference as the Study holds it (#cv-orig) changed in one way, as a PNG (spec.kind):
//   'scale'  drawn into w × h;  'fit'  drawn whole into the middle of a w × h canvas of mid gray;  'flat'  one color
//   (spec.rgb) and nothing else;  'xform'  moved dx, dy px, turned deg and scaled f about its centre, on mid gray;
//   'invert'  every channel turned over;  'flip'  upside down
const VARIANT3 = (spec) => {
  const o = document.getElementById('cv-orig'); const W = o.width, H = o.height;
  const c = document.createElement('canvas'); c.width = spec.w || W; c.height = spec.h || H;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.fillStyle = spec.rgb ? `rgb(${spec.rgb.join(',')})` : '#7f7f7f'; g.fillRect(0, 0, c.width, c.height);
  if (spec.kind === 'scale') g.drawImage(o, 0, 0, c.width, c.height);
  else if (spec.kind === 'fit') { const k = Math.min(c.width / W, c.height / H); g.drawImage(o, (c.width - W * k) / 2, (c.height - H * k) / 2, W * k, H * k); }
  else if (spec.kind === 'xform') { g.translate(W / 2 + (spec.dx || 0), H / 2 + (spec.dy || 0)); g.rotate(((spec.deg || 0) * Math.PI) / 180); g.scale(spec.f || 1, spec.f || 1); g.drawImage(o, -W / 2, -H / 2); }
  else if (spec.kind === 'invert') { g.drawImage(o, 0, 0); const d = g.getImageData(0, 0, W, H); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 255 - d.data[i]; d.data[i + 1] = 255 - d.data[i + 1]; d.data[i + 2] = 255 - d.data[i + 2]; } g.putImageData(d, 0, 0); }
  else if (spec.kind === 'flip') { g.translate(0, H); g.scale(1, -1); g.drawImage(o, 0, 0); }
  return c.toDataURL('image/png');
};
const variant3 = async (page, name, spec) => ({ name, mimeType: 'image/png', buffer: Buffer.from((await page.evaluate(VARIANT3, spec)).split(',')[1], 'base64') });
// a portrait drawing with fine seeded grain (as a camera's photo has), of any size, the same on every run
const grainy = (page, w, h, type, name) => page.evaluate(([w, h, type]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#8a9aa6'); grad.addColorStop(1, '#3b4a52'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c98f6a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.42, w * 0.22, h * 0.25, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6b3f2a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.25, w * 0.24, h * 0.12, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2e2420'; g.fillRect(w * 0.4, h * 0.4, w * 0.05, h * 0.02); g.fillRect(w * 0.55, h * 0.4, w * 0.05, h * 0.02);
  g.fillStyle = '#1f2a33'; g.fillRect(w * 0.2, h * 0.68, w * 0.6, h * 0.32);
  const d = g.getImageData(0, 0, w, h); let x = 12345;
  for (let i = 0; i < d.data.length; i += 4) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; const n = ((x >>> 24) % 21) - 10; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  g.putImageData(d, 0, 0);
  return c.toDataURL(type, 0.92);
}, [w, h, type]).then((url) => ({ name, mimeType: type, buffer: Buffer.from(url.split(',')[1], 'base64') }));
const setDetail = (page, v) => afterResult(page, () => page.evaluate((v) => { const e = document.getElementById('detail'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, v), { timeout: 180000 });
const setFit = (page, v) => afterResult(page, () => page.evaluate((v) => { const e = document.getElementById('artFit'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, v));
const scores = (s) => [s.color, s.value, s.shapes];
const perfect = (s) => s.color === 100 && s.value === 100 && s.shapes === '100%' && s.list.length === 1 && s.list[0].cls === 'fix-none';
// the share of the accuracy map drawn as the not-covered hatching (its two grays, in their diagonal pattern)
const hatchShare = (page) => page.evaluate(() => { const c = document.getElementById('cv-diff'); const W = c.width, H = c.height; const d = c.getContext('2d').getImageData(0, 0, W, H).data; let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, v = ((x + y) % 10) < 3 ? 105 : 78; if (d[i] === v && d[i + 1] === v && d[i + 2] === v) n++; } return (100 * n) / (W * H); });
const leftOf = (note) => +((/(\d+)% of picture left out/.exec(note || '') || [0, 0])[1]);
const resetAlign3 = async (page) => { await click(page, '#alignReset'); await busyHidden(page); await sleep(60); };
// Move, Move down, Size and Rotate set together (one rerun of the check, as a quick visitor's hands give)
const setAll = async (page, a) => { await page.evaluate((a) => ['alignX', 'alignY', 'alignScale', 'alignRot'].forEach((id, i) => { const e = document.getElementById(id); e.value = a[i]; e.dispatchEvent(new Event('input', { bubbles: true })); }), a); await busyHidden(page); await sleep(60); };

// ---- the accuracy map and its labels at Working size 600, 900 and 1400, on a reference big enough for each ----
round3('the accuracy map at every working size', async (t, site, open) => {
  const page = await open({ url: '#check', storage: { 'portrait-value-studio.mode': 'advanced' } });
  await countResults(page); await busyHidden(page);
  await page.evaluate(PILL_LOG);
  t.check(await afterResult(page, async () => page.setInputFiles('#file', await grainy(page, 1600, 2000, 'image/jpeg', 'big-ref.jpg')), { timeout: 120000 }), 'a 1600 × 2000 reference loads with the drawer open');
  // the painting: the reference a whole value step lighter and warmer, so five shapes are off
  t.check(await loadArt(page, (await variant(page, 'lighter-warmer.png', { kind: 'lab', dL: 10, warm: 8 })).file), 'the reference made lighter and warmer loads as the painting');
  const WANT = { 600: [480, 600], 900: [720, 900], 1400: [1120, 1400] };
  const onScreen = {};
  for (const ws of ['600', '1400', '900']) {
    t.check(await setDetail(page, ws), `Working size ${ws} with the drawer open reruns`);
    const s = await state(page);
    const r = await page.evaluate(() => { const c = document.getElementById('cv-diff'); return { list: window.__pills.slice(), W: c.width, H: c.height, cssW: c.getBoundingClientRect().width, shapes: window.Study.shapeCount(window.Studio.result()) }; });
    t.check(same(s.orig, WANT[ws]) && same(s.art, WANT[ws]) && same(s.diff, WANT[ws]), `Working size ${ws}: the reference, the painting and the map are ${WANT[ws].join(' × ')}`, { orig: s.orig, art: s.art, diff: s.diff });
    checkScorecard(t, s, `Working size ${ws}`);
    const fx = fixesOf(s);
    const white = r.list.filter((p) => /^\d · \d{1,3}%$/.test(p.text));
    const long = Math.max(r.W, r.H), lo = Math.round(long / 60), hi = Math.round(long / 26);
    t.check(fx.length === 5 && same(white.map((p) => p.text), fx.map((f, i) => `${i + 1} · ${f.pct}%`)), `Working size ${ws}: the white labels read 1 to 5 with each entry's match, as the list numbers them`, { labels: white.map((p) => p.text), list: fx.map((f) => f.pct) });
    t.check(r.list.length >= 6 && r.list.length <= r.shapes && r.list.every((p) => pillInside(p, r.W, r.H) && p.font >= lo && p.font <= hi) && pillsOverlapping(r.list).length === 0, `Working size ${ws}: every label inside the picture, none on another, no more labels than shapes, each between ${lo} and ${hi} px`, { labels: r.list.length, shapes: r.shapes, overlapping: pillsOverlapping(r.list), off: r.list.filter((p) => !pillInside(p, r.W, r.H) || p.font < lo || p.font > hi).map((p) => [p.text, p.font]) });
    onScreen[ws] = +(Math.max(...r.list.map((p) => p.font)) * (r.cssW / r.W)).toFixed(1);
    // the first white label sits on the shape it names: hovered at its centre, the loupe reads entry 1's match
    const one = white[0];
    if (one) {
      const l = await hoverAt(page, '#cv-diff', (one.x + one.w / 2) / r.W, (one.y + one.h / 2) / r.H);
      await page.mouse.move(5, 5);
      t.check(l.shown && l.hex === `${fx[0].pct}% match`, `Working size ${ws}: hovered at label 1, the loupe reads entry 1's match (${fx[0].pct}%)`, l);
    }
    // the uncovered part, said and drawn alike at this size
    await openAlign(page);
    await setRange(page, 'alignX', 20);
    const moved = await state(page), hatch = await hatchShare(page);
    t.check(moved.alignState === 'moved, 20% of picture left out' && Math.abs(hatch - 20) <= 0.5, `Working size ${ws}: Move at +20% says 20% is left out, and 20% of the map is hatched`, { note: moved.alignState, hatched: +hatch.toFixed(2) });
    await resetAlign3(page);
  }
  const sizes = Object.values(onScreen);
  t.check(sizes.length === 3 && Math.max(...sizes) / Math.min(...sizes) <= 1.25, 'the biggest label is about the same size on the screen at every working size (the map is shown at one width)', onScreen);
  await clean(t, page, 'the accuracy map at every working size');
});

// ---- paintings much larger, much smaller and of another shape than the reference ----
round3('paintings larger, smaller and of another shape', async (t, site, open) => {
  const page = await open({ url: '#check' });
  await countResults(page); await busyHidden(page);
  for (const [label, w, h, min] of [['four times as big', 2400, 3000, [97, 95, 97]], ['a fifth of the size', 120, 150, [97, 95, 97]], ['a tenth of the size', 60, 75, [95, 93, 93]], ['the smallest accepted', 16, 20, [85, 75, 75]]]) {
    const name = `ref-${w}x${h}.png`;
    t.check(await loadArt(page, await variant3(page, name, { kind: 'scale', w, h })), `the reference drawn ${w} × ${h} (${label}) loads as the painting`);
    const s = await state(page);
    t.check(s.label === `${name} · ${w} × ${h} px` && same(s.art, [600, 750]) && same(s.diff, [600, 750]), `${w} × ${h}: the label gives the photo's own size, and it is scored at the reference's (600 × 750)`, { label: s.label, art: s.art, diff: s.diff });
    t.check(s.color >= min[0] && s.value >= min[1] && +s.shapes.slice(0, -1) >= min[2], `${w} × ${h}: the reference's own picture, ${label}, still scores at least ${min[0]} / ${min[1]} / ${min[2]}%`, scores(s));
    checkScorecard(t, s, `${w} × ${h}`);
  }
  await resetToast(page);
  const before = await state(page);
  await page.setInputFiles('#artFile', await variant3(page, 'ref-15x19.png', { kind: 'scale', w: 15, h: 19 }));
  const told = await waitToast(page, TOO_SMALL);
  const after = await state(page);
  t.check(told && after.label === before.label && after.badge === before.badge, 'one pixel under (15 × 19) is refused as too small to check, and the 16 × 20 painting stays scored', { toast: after.toast, label: after.label, badge: [before.badge, after.badge] });
  // another shape: the reference in the middle of a landscape photo, and of a tall one, the rest mid gray
  for (const [w, h, minCrop] of [[1200, 600, 97], [600, 1500, 100]]) {
    t.check(await loadArt(page, await variant3(page, `fit-${w}x${h}.png`, { kind: 'fit', w, h })), `the reference in the middle of a ${w} × ${h} photo loads`);
    const crop = await state(page);
    await setFit(page, 'stretch');
    const stretch = await state(page);
    await setFit(page, 'crop');
    t.check(crop.color >= minCrop && crop.value >= minCrop - 2 && +crop.shapes.slice(0, -1) >= minCrop && stretch.color < 70 && stretch.grade !== gradeFor(100), `a ${w > h ? 'landscape' : 'tall'} ${w} × ${h} photo with the painting in its middle: Crop to match finds it (${minCrop === 100 ? '100' : `at least ${minCrop}`}), Stretch to match squeezes the gray in and scores it far off`, { crop: scores(crop), stretch: scores(stretch), grade: stretch.grade });
  }
  await clean(t, page, 'paintings larger, smaller and of another shape');
});

// ---- the photo itself loaded as the painting: 100 at every working size and every setting ----
round3('the photo itself as the painting', async (t, site, open) => {
  const page = await open({ url: '#check', storage: { 'portrait-value-studio.mode': 'advanced' } });
  await countResults(page); await busyHidden(page);
  const off = [];
  for (const [w, h, type, sizes] of [[1600, 2000, 'image/jpeg', ['900', '600', '1400']], [777, 1031, 'image/png', ['900']], [3000, 2000, 'image/jpeg', ['900', '1400']]]) {
    const file = await grainy(page, w, h, type, `photo-${w}x${h}.${type === 'image/png' ? 'png' : 'jpg'}`);
    t.check(await afterResult(page, () => page.setInputFiles('#file', file), { timeout: 120000 }) && await loadArt(page, file), `a ${w} × ${h} ${type === 'image/png' ? 'PNG' : 'JPEG'} loads as the reference and, the same file, as the painting`);
    const got = {};
    for (const ws of sizes) {
      await setDetail(page, ws);
      const s = await state(page);
      got[ws] = { scores: scores(s), list: s.list.map((l) => l.cls), size: s.orig };
      if (!perfect(s)) {
        await setFit(page, 'stretch');
        const st = await state(page);
        const px = await page.evaluate(() => { const get = (id) => { const c = document.getElementById(id); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }; const a = get('cv-orig'), b = get('cv-art'); let n = 0, mx = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d) n++; if (d > mx) mx = d; } return { differ: +((100 * n) / (a.length / 4)).toFixed(1), max: mx }; });
        await setFit(page, 'crop');
        const px2 = await page.evaluate(() => { const get = (id) => { const c = document.getElementById(id); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }; const a = get('cv-orig'), b = get('cv-art'); let n = 0, mx = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d) n++; if (d > mx) mx = d; } return { differ: +((100 * n) / (a.length / 4)).toFixed(1), max: mx }; });
        off.push({ file: `${w} × ${h}`, ws, size: s.orig, crop: scores(s), stretch: scores(st), stretchPerfect: perfect(st), cropPixels: px2, stretchPixels: px });
      }
    }
    t.check(Object.values(got).every((g) => same(g.scores, [100, 100, '100%']) && same(g.list, ['fix-none'])), `the ${w} × ${h} photo scored against itself: 100, 100 and 100%, no shape off, at Working size ${sizes.join(', ')}`, got);
    if (sizes[sizes.length - 1] !== '900') await setDetail(page, '900');
  }
  // the same file at every setting the Study has (each changed in turn, the earlier ones kept)
  const file = await grainy(page, 1000, 1333, 'image/jpeg', 'photo-1000x1333.jpg');
  await afterResult(page, () => page.setInputFiles('#file', file), { timeout: 120000 }); await loadArt(page, file);
  const SETTINGS = [
    ['Colors in each value 1', () => { const e = document.getElementById('colors'); e.value = 1; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['Colors in each value 6', () => { const e = document.getElementById('colors'); e.value = 6; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['Simplify 0', () => { const e = document.getElementById('simplify'); e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['Simplify 10', () => { const e = document.getElementById('simplify'); e.value = 10; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['Smoothing Soft', () => { const e = document.getElementById('smoothSoft'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }],
    ['Merge small shapes 0', () => { const e = document.getElementById('merge'); e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['Merge small shapes 10', () => { const e = document.getElementById('merge'); e.value = 10; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['shadow split at L* 10', () => { const e = document.getElementById('t1'); e.value = 10; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['light split at L* 90', () => { const e = document.getElementById('t2'); e.value = 90; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['Gray values: Photo average', () => { const e = document.getElementById('grayAvg'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }],
    ['outlines on', () => { const e = document.getElementById('outlines'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }],
    ['Lean toward lighter tones Off', () => { const e = document.getElementById('lean'); e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); }],
    ['Auto split', () => document.getElementById('autoSplit').click()],
  ];
  const bySetting = [];
  for (const [label, fn] of SETTINGS) {
    await afterResult(page, () => page.evaluate(fn));
    const s = await state(page);
    bySetting.push({ label, scores: scores(s), list: s.list.map((l) => l.cls) });
    if (!perfect(s)) { await setFit(page, 'stretch'); const st = await state(page); await setFit(page, 'crop'); off.push({ file: '1000 × 1333', ws: '900', setting: label, size: s.orig, crop: scores(s), stretch: scores(st), stretchPerfect: perfect(st) }); }
  }
  t.check(bySetting.every((b) => same(b.scores, [100, 100, '100%']) && same(b.list, ['fix-none'])), 'a 1000 × 1333 photo scored against itself: 100, 100 and 100% with no shape off at every setting, each changed in turn', bySetting);
  if (off.length) {
    const o = off.find((x) => x.stretchPerfect) || off[0];
    t.finding({
      title: `The photo itself, loaded as the painting, does not score 100: ${o.crop[0]} / ${o.crop[1]} with Crop to match (${o.file} photo, Working size ${o.ws}${o.setting ? ', ' + o.setting : ''}), 100 with Stretch to match`,
      severity: 'low',
      steps: `1. Advanced mode. Load a ${o.file} photo with some grain (any camera photo; the case draws a portrait with ±10 levels of seeded noise and saves it as a JPEG) as the reference${o.ws !== '900' ? `, and set Working size to ${o.ws}` : ''}${o.setting ? `, then ${o.setting}` : ''}. 2. Open How close did I get? and load the very same file as the painting (Crop to match, the default). 3. Read the scores; then switch to Stretch to match.`,
      expected: 'The reference compared with itself scores 100 on every score and lists no shape (README: "It is cropped (or stretched) to match the reference and broken into color blocks with the same settings"; the case\'s own check of the reference\'s pixels scores 100 at every setting).',
      actual: off.map((x) => `${x.file}${x.setting ? ' after ' + x.setting : ''} at ${x.ws} (studied at ${x.size.join(' × ')}): Crop ${x.crop.join(' / ')}, Stretch ${x.stretch.join(' / ')}${x.cropPixels ? ` (Crop leaves ${x.cropPixels.differ}% of the pixels different from the reference's, by up to ${x.cropPixels.max} levels; Stretch ${x.stretchPixels.differ}%)` : ''}`).join('; ') + '.',
      cause: 'js/app.js 2338-2342 (alignArt, Crop to match) computes the crop from the reference\'s rounded working size: processing.js 75-77 makes the reference Math.round(sw × scale) × Math.round(sh × scale) (3000 × 2000 at 1400 becomes 1400 × 933), and the crop then takes a source rectangle of 3000 × 1999.3 px offset by 0.36 px, so the painting is resampled a fraction of a pixel off the reference. The grain shifts, and each shape\'s "most prominent color" is the fullest bin of about 4 L* (processing.js dominantColors, 576), so a slight shift moves some shapes a whole bin. Stretch draws the whole photo as prepare() does and scores 100.',
    });
  }
  await clean(t, page, 'the photo itself as the painting');
});

// ---- a painting of another subject, turned over, upside down, and flat colors ----
round3('a painting of another subject', async (t, site, open) => {
  const page = await open({ url: '#check' });
  await countResults(page); await busyHidden(page);
  const example = await state(page);
  const ex = { color: example.color, shapes: +example.shapes.slice(0, -1) };
  const tries = [
    ['another portrait', async () => makeImage(page, { width: 600, height: 800, name: 'another.png' })],
    ['the reference upside down', async () => variant3(page, 'upside-down.png', { kind: 'flip' })],
    ['the reference\'s negative', async () => variant3(page, 'negative.png', { kind: 'invert' })],
  ];
  const seen = {};
  for (const [label, make] of tries) {
    t.check(await loadArt(page, await make()), `${label} loads as the painting`);
    const s = await state(page);
    seen[label] = s;
    t.check(s.color < ex.color - 10 && +s.shapes.slice(0, -1) < ex.shapes && ['Several shapes are off', 'Far from the reference'].includes(s.grade) && s.list.length === 5 && s.list.every((l) => l.cls === 'fix'), `${label}: scores well under the example (${ex.color}, ${ex.shapes}%), graded at best "Several shapes are off", five shapes to fix`, { scores: scores(s), grade: s.grade, list: s.list.length });
    checkScorecard(t, s, label);
  }
  const neg = seen['the reference\'s negative'];
  t.check(neg.value < 50 && +neg.shapes.slice(0, -1) < 50, 'the negative (lights where the darks are): the light and dark score and Shapes in the right place both under 50', scores(neg));
  // flat paintings: Shapes in the right place is the share of the reference's mass that flat value falls in
  const masses = await page.evaluate(() => {
    const r = Studio.result(); const c = [0, 0, 0]; for (let i = 0; i < r.zone.length; i++) c[r.zone[i]]++;
    const t1 = +document.getElementById('t1').value, t2 = +document.getElementById('t2').value, want = (t1 + t2) / 2;
    let mid = 0; for (let v = 0; v < 256; v++) if (Math.abs(Study.lightnessOf(v, v, v) - want) < Math.abs(Study.lightnessOf(mid, mid, mid) - want)) mid = v;
    return { share: c.map((v) => (100 * v) / r.zone.length), mid, t1, t2 };
  });
  for (const [label, rgb, zone, word] of [['white', [255, 255, 255], 2, /^Too light/], ['black', [0, 0, 0], 0, /^Too dark/], [`a middle gray (#${masses.mid.toString(16).padStart(2, '0').repeat(3)})`, [masses.mid, masses.mid, masses.mid], 1, null]]) {
    t.check(await loadArt(page, await variant3(page, `flat-${rgb[0]}.png`, { kind: 'flat', rgb })), `a flat ${label} painting loads`);
    const s = await state(page);
    const want = Math.round(masses.share[zone]);
    t.check(Math.abs(+s.shapes.slice(0, -1) - want) <= 1 && s.color < ex.color && s.grade === 'Far from the reference', `a flat ${label} painting: Shapes in the right place is the share of the reference's ${['shadow', 'middle', 'light'][zone]} mass (${want}%), and it is far from the reference`, { shapes: s.shapes, want, masses: masses.share.map((v) => +v.toFixed(1)), scores: scores(s), grade: s.grade });
    if (word) t.check(fixesOf(s).length === 5 && fixesOf(s).every((f) => word.test(f.note)), `a flat ${label} painting: every shape to fix is called ${word.source.slice(1).toLowerCase()}`, fixesOf(s).map((f) => f.note));
  }
  await clean(t, page, 'a painting of another subject');
});

// ---- Move, Size and Rotate at their ends: each undoes the change it is for, and the panel's "left out" is the hatching ----
round3('alignment at its extremes', async (t, site, open) => {
  const page = await open({ url: '#check' });
  await countResults(page); await busyHidden(page);
  await openAlign(page);
  const CASES = [
    ['moved 20% right and down', { kind: 'xform', dx: 120, dy: 150 }, [-20, -20, 100, 0], [100, 100, 100], 36],
    ['moved 20% left and up', { kind: 'xform', dx: -120, dy: -150 }, [20, 20, 100, 0], [100, 100, 100], 36],
    ['turned 15°', { kind: 'xform', deg: 15 }, [0, 0, 100, -15], [99, 98, 98], 11],
    ['turned −15°', { kind: 'xform', deg: -15 }, [0, 0, 100, 15], [99, 98, 98], 11],
    ['shrunk to 80%', { kind: 'xform', f: 0.8 }, [0, 0, 125, 0], [98, 96, 98], 0],
    ['enlarged to 125%', { kind: 'xform', f: 1.25 }, [0, 0, 80, 0], [97, 95, 97], 36],
  ];
  for (const [label, spec, a, min, left] of CASES) {
    t.check(await loadArt(page, await variant3(page, `${label.replace(/\W+/g, '-')}.png`, spec)), `the reference ${label} loads`);
    const before = await state(page);
    await setAll(page, a);
    const s = await state(page), hatch = await hatchShare(page);
    const note = left ? `moved, ${left}% of picture left out` : 'moved';
    t.check(s.color >= min[0] && s.value >= min[1] && +s.shapes.slice(0, -1) >= min[2] && s.color > before.color, `the reference ${label}, lined up with ${['Move', 'Move', 'Size', 'Rotate'][a[3] ? 3 : a[2] !== 100 ? 2 : 0]} at its end (${a.join(', ')}): about 100 on what is still covered (at least ${min.join(' / ')})`, { before: scores(before), after: scores(s) });
    t.check(s.alignState === note && Math.abs(hatch - left) <= 1, `the reference ${label}, lined up: the panel says "${note}" and ${left}% of the map is hatched`, { note: s.alignState, hatched: +hatch.toFixed(2) });
  }
  // the panel's share against the hatching, everywhere the sliders reach (on the reference's own pixels)
  t.check(await loadArt(page, await variant3(page, 'same.png', { kind: 'scale' })), 'the reference\'s own pixels load as the painting');
  const combos = [[20, 0, 100, 0], [20, 20, 100, 0], [0, 0, 80, 0], [0, 0, 100, 15], [0, 0, 125, 15], [0, 0, 125, -15], [20, 20, 80, 15], [-20, -20, 80, -15], [-20, 20, 125, -15], [0.2, 0, 100, 0], [0, 0, 99.5, 0], [2, 0, 100, 0]];
  const read = [];
  for (const a of combos) {
    await setAll(page, a);
    const s = await state(page);
    read.push({ a, note: s.alignState, said: leftOf(s.alignState), hatched: +(await hatchShare(page)).toFixed(2) });
  }
  await resetAlign3(page);
  t.check(read.every((r) => Math.abs(r.said - r.hatched) <= 1 && (r.hatched < 0.5 || r.said >= 1) && /^moved/.test(r.note)), 'at every reach of Move, Size and Rotate the panel\'s "N% of picture left out" is the share the map hatches (within a point), and names any part of half a percent or more', read);
  // all four at an end, then a new painting: Move, Size and Rotate start over
  await setAll(page, [-20, 20, 80, -15]);
  const ends = await state(page);
  t.check(await loadArt(page, await variant3(page, 'negative.png', { kind: 'invert' })), 'a new painting loads with all four sliders at an end');
  const fresh = await state(page);
  t.check(/^moved, \d+% of picture left out$/.test(ends.alignState) && same(fresh.outs.alignX, ['0', '0%']) && same(fresh.outs.alignY, ['0', '0%']) && same(fresh.outs.alignScale, ['100', '100%']) && same(fresh.outs.alignRot, ['0', '0°']) && fresh.alignState === '', 'a new painting puts Move, Size and Rotate back (0%, 100%, 0°) and clears the panel\'s note', { before: ends.alignState, outs: fresh.outs, note: fresh.alignState });
  await clean(t, page, 'alignment at its extremes');
});

// ---- what the second pass left: a see-through painting, two files in one instant, the drawer's contrast, the red gain
// limit, the heap ----
const CONTRAST = (sels) => {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  // the background the text sits on: every background color up the tree, laid over each other until one is opaque
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0)) { layers.push(c); if (c.length < 4 || c[3] >= 1) break; } } let out = [255, 255, 255]; for (let i = layers.length - 1; i >= 0; i--) { const c = layers[i], a = c.length < 4 ? 1 : c[3]; out = out.map((v, k) => v * (1 - a) + c[k] * a); } return out; };
  return sels.flatMap((sel) => [...document.querySelectorAll(sel)].filter((e) => e.textContent.trim() && e.getClientRects().length).slice(0, 3).map((e) => {
    const cs = getComputedStyle(e), fg = parse(cs.color), bg = bgOf(e), a = fg.length > 3 ? fg[3] : 1, f = fg.slice(0, 3).map((v, k) => v * a + bg[k] * (1 - a));
    const L1 = lum(f), L2 = lum(bg), size = parseFloat(cs.fontSize), large = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66);
    return { sel, text: e.textContent.trim().slice(0, 24), ratio: +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2), need: large ? 3 : 4.5, fg: f.map(Math.round), bg: bg.map(Math.round) };
  }));
};
round3('what the second pass left', async (t, site, open) => {
  const page = await open({ url: '#check' });
  await countResults(page); await busyHidden(page);
  // a cut-out painting reads its see-through part as the mid gray it sits on, exactly as a painting on that gray does
  const disc = (onGray) => page.evaluate((onGray) => { const c = document.createElement('canvas'); c.width = 600; c.height = 750; const g = c.getContext('2d'); if (onGray) { g.fillStyle = '#7f7f7f'; g.fillRect(0, 0, 600, 750); } g.fillStyle = 'rgb(200,60,60)'; g.beginPath(); g.arc(300, 375, 180, 0, Math.PI * 2); g.fill(); return c.toDataURL('image/png'); }, onGray).then((u) => ({ name: onGray ? 'disc-on-gray.png' : 'disc-cut-out.png', mimeType: 'image/png', buffer: Buffer.from(u.split(',')[1], 'base64') }));
  const read = async () => { const s = await state(page); return { badge: s.badge, shapes: s.shapes, list: s.list.map((l) => `${l.note} ${l.meta}`), corner: await px(page, 'cv-art', 5, 5) }; };
  await loadArt(page, await disc(false)); const cut = await read();
  await loadArt(page, await disc(true)); const gray = await read();
  t.check(same({ ...cut, corner: null }, { ...gray, corner: null }) && cut.corner.every((v) => Math.abs(v - 127) <= 1), 'a cut-out painting (a red disc on nothing) scores and lists exactly as the same disc on mid gray: its see-through part reads #7F7F7F, not black', { cut: [cut.badge, cut.shapes, cut.corner], gray: [gray.badge, gray.shapes, gray.corner], same: same(cut.list, gray.list) });
  await clean(t, page, 'a cut-out painting');
  // two paintings chosen in the same instant: the second is the one shown and scored, the first never appears
  const A = await makeImage(page, { width: 600, height: 750, type: 'image/jpeg', name: 'first.jpg' });
  const B = await variant3(page, 'second.png', { kind: 'invert' });
  await loadArt(page, A); const alone = { A: (await state(page)).badge };
  await loadArt(page, B); alone.B = (await state(page)).badge;
  await loadArt(page, await disc(true));
  const startBadge = (await state(page)).badge;
  const watch = () => page.evaluate(() => { window.__seen = []; const g = (id) => document.getElementById(id); const rec = () => window.__seen.push({ busy: !g('busy').hidden, src: g('source').textContent.split(' · ')[0], art: g('artSource').textContent.split(' · ')[0], badge: g('checkState').textContent }); window.__watch = new MutationObserver(rec); ['checkState', 'artSource', 'busy', 'source'].forEach((id) => window.__watch.observe(g(id), { childList: true, subtree: true, characterData: true, attributes: true })); });
  const both = (files) => page.evaluate((files) => {
    for (const f of files) {
      const bin = atob(f.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([u], f.name, { type: f.type }));
      const input = document.getElementById(f.input); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, files.map(([input, f]) => ({ input, name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') })));
  await watch();
  await afterResult(page, () => both([['artFile', A], ['artFile', B]]));
  await page.waitForFunction(() => /^second\.png/.test(document.getElementById('artSource').textContent) && /^Color \d+/.test(document.getElementById('checkState').textContent) && document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);
  let seen = await page.evaluate(() => { window.__watch.disconnect(); return window.__seen; });
  const end = await state(page);
  t.check(end.label.startsWith('second.png') && end.badge === alone.B && !seen.some((x) => x.art === 'first.jpg') && seen.filter((x) => !x.busy).every((x) => (x.art === 'second.png' && x.badge === alone.B) || (x.art === 'disc-on-gray.png' && x.badge === startBadge)), 'two paintings chosen in the same instant: the second is shown and scored as it is alone, the first never appears, and no score is shown beside the wrong painting', { end: [end.label.slice(0, 20), end.badge], alone, seen });
  // a reference and a painting chosen in the same instant: each moment the page rests shows a pair with its own score
  const R1 = await makeImage(page, { width: 600, height: 750, name: 'ref-one.png' });
  await afterResult(page, () => page.setInputFiles('#file', R1));
  const P1 = await variant3(page, 'art-one.png', { kind: 'flip' }), R2 = await variant3(page, 'ref-two.png', { kind: 'invert' }), P2 = await variant3(page, 'art-two.png', { kind: 'xform', deg: 4, f: 1.05 });
  const clean4 = {};
  await loadArt(page, P1); clean4['ref-one.png|art-one.png'] = (await state(page)).badge;
  await loadArt(page, P2); clean4['ref-one.png|art-two.png'] = (await state(page)).badge;
  await afterResult(page, () => page.setInputFiles('#file', R2)); clean4['ref-two.png|art-two.png'] = (await state(page)).badge;
  await loadArt(page, P1); clean4['ref-two.png|art-one.png'] = (await state(page)).badge;
  await afterResult(page, () => page.setInputFiles('#file', R1)); // back to ref-one with art-one
  await watch();
  await afterResult(page, () => both([['file', R2], ['artFile', P2]]), { more: 1 });
  await page.waitForFunction(() => /^ref-two\.png/.test(document.getElementById('source').textContent) && /^art-two\.png/.test(document.getElementById('artSource').textContent) && /^Color \d+/.test(document.getElementById('checkState').textContent) && document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);
  await sleep(300);
  seen = await page.evaluate(() => { window.__watch.disconnect(); return window.__seen; });
  const fin = await page.evaluate(() => ({ src: document.getElementById('source').textContent.split(' · ')[0], art: document.getElementById('artSource').textContent.split(' · ')[0], badge: document.getElementById('checkState').textContent }));
  const wrong = seen.filter((x) => !x.busy && /^Color/.test(x.badge) && clean4[`${x.src}|${x.art}`] !== x.badge);
  t.check(fin.src === 'ref-two.png' && fin.art === 'art-two.png' && fin.badge === clean4['ref-two.png|art-two.png'] && wrong.length === 0, 'a reference and a painting chosen in the same instant: it ends on the new pair with the score that pair gets loaded one after the other, and whenever the page is at rest its badge is the score of the pair it shows', { fin, clean: clean4, wrong, seen: seen.filter((x) => !x.busy) });
  await clean(t, page, 'files in the same instant');
  // the drawer's own words against their backgrounds (a luminance ratio, as WCAG reckons it), light and dark
  await afterResult(page, async () => page.setInputFiles('#file', await makeImage(page, { width: 600, height: 750, name: 'ref-three.png' })));
  await loadArt(page, await variant3(page, 'art-three.png', { kind: 'flip' }));
  await openAlign(page); await setRange(page, 'alignX', 5);
  const SELS = ['#alignState', '#scoreGrade', '#scoreColor', '#scoreValue', '#scoreShapes', '#checkState', '#artSource', '#fixList .fix-num', '#fixList .fix-text strong', '#fixList .fix-text small', '#checkBody .score-label', '#checkBody dt', '#checkPanels figcaption', '#checkPanels .hint', '#wbStatus', '#wbPick', '#alignXOut', '#onionOut', '#drawer-check .drawer-body > .hint'];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && typeof CSSTransition !== 'undefined' && a instanceof CSSTransition), null, { timeout: 3000 }).catch(() => null);
    const r = await page.evaluate(CONTRAST, SELS);
    const low = r.filter((x) => x.ratio < x.need);
    t.check(r.length >= 20 && low.length === 0, `${scheme}: every word of the drawer (the scores, the grade, the panel's note, the list, the captions and hints) stands out from its background by 4.5 : 1 or more (3 : 1 for large type)`, { measured: r.length, lowest: r.reduce((m, x) => (x.ratio < m.ratio ? x : m), r[0]), low });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await resetAlign3(page);
  await clean(t, page, 'contrast');
  // the red gain limit ("red or green at most doubled") at its edge: near-grays (C* under 12) whose fix needs red ×1.91
  // and ×2.03; the other limits no spot reaches that the page takes as a tinted white or a gray (counted below)
  await afterResult(page, async () => page.setInputFiles('#file', await makeImage(page, { width: 600, height: 750, name: 'ref-four.png' })));
  const RED = [['a near-gray needing red ×1.91 (just inside)', [69, 100, 103], 'accept'], ['a near-gray needing red ×2.03 (past doubled)', [61, 92, 96], 'refuse']];
  t.check(await loadArt(page, await ownPixels(page, { patches: RED, name: 'red-limit.png' })), 'a painting with two near-gray patches at the red limit loads');
  const gains = await page.evaluate((rs) => rs.map(([, c]) => ({ gains: Study.neutralGains(...c).map((v) => +v.toFixed(3)), chroma: +Study.chromaOf(...c).toFixed(1) })), RED);
  await openAlign(page);
  for (let i = 0; i < RED.length; i++) {
    const [label, , want] = RED[i];
    await resetToast(page);
    if (!(await state(page)).picking) await click(page, '#wbPick');
    await clickAt(page, '#cv-art', patchAt(i)[0] / 600, patchAt(i)[1] / 750);
    const s = await state(page);
    const ok = want === 'accept' ? FIXED.test(s.toast) && s.wbUndo && !s.picking : REFUSED.test(s.toast) && s.picking;
    t.check(ok, `Fix color cast on ${label}: ${want === 'accept' ? 'the cast is removed' : 'refused as too colorful, and picking stays on'}`, { toast: s.toast, wbUndo: s.wbUndo, picking: s.picking, ...gains[i] });
    if (s.picking) { await page.keyboard.press('Escape'); await sleep(60); }
    if (s.wbUndo) { await click(page, '#wbUndo'); await busyHidden(page); }
  }
  const reach = await page.evaluate(() => {
    const tinted = ([r, g, b]) => Math.abs(Math.log(g) - 0.6 * Math.log(r) - 0.4 * Math.log(b)) <= Math.log(1.1); // js/app.js tintedByLight
    const ext = { red: [9, 0], green: [9, 0] };
    for (let R = 0; R < 256; R += 5) for (let G = 0; G < 256; G += 5) for (let B = 0; B < 256; B += 5) {
      const k = Study.neutralGains(R, G, B); if (!k || k[2] < 0.5 || k[2] > 3) continue;
      if (Study.chromaOf(R, G, B) > 12 && !tinted(k)) continue;
      ext.red = [Math.min(ext.red[0], k[0]), Math.max(ext.red[1], k[0])]; ext.green = [Math.min(ext.green[0], k[1]), Math.max(ext.green[1], k[1])];
    }
    return { red: ext.red.map((v) => +v.toFixed(2)), green: ext.green.map((v) => +v.toFixed(2)) };
  });
  t.note(`The gain limits a pick can meet: among every spot the page takes as a gray or a tinted white with blue's gain inside ×0.5-×3 (a grid of every fifth level), red needs ×${reach.red[0]} to ×${reach.red[1]} and green ×${reach.green[0]} to ×${reach.green[1]}. So "red at most doubled" binds (checked above at ×1.91 and ×2.03), while "green at most doubled" and "no channel halved" for red and green cannot be reached by any spot that is not refused for its color first.`);
  await clean(t, page, 'the red gain limit');
  // the heap after paintings loaded one after another (garbage collected before each reading)
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(200); await cdp.send('HeapProfiler.collectGarbage'); const u = await cdp.send('Runtime.getHeapUsage'); return Math.round(u.usedSize / 1048576); };
  const art = await makeImage(page, { width: 1200, height: 1500, type: 'image/jpeg', name: 'heap.jpg' });
  await loadArt(page, art); await loadArt(page, art);
  const h2 = await heap();
  for (let i = 0; i < 4; i++) await loadArt(page, art);
  const h6 = await heap();
  t.check(h6 - h2 <= 25, 'four more paintings loaded one after another leave the script heap where two left it (within 25 MB, after garbage collection)', { afterTwo: h2, afterSix: h6 });
  t.note(`Script heap after 2 paintings ${h2} MB, after 6 ${h6} MB (1200 × 1500 JPEG each, reference 600 × 750; the pictures' pixels live outside the script heap, which soak.mjs measures).`);
  await clean(t, page, 'the heap');
});
